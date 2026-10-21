// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {stdError} from "forge-std/StdError.sol";
import {IERC20Errors, IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {DailyAuthority} from "../src/DailyAuthority.sol";
import {IMDDaily} from "../src/IMDDaily.sol";
import {IMDDailyVault} from "../src/IMDDailyVault.sol";
import {MockIMD} from "./helpers/MockIMD.sol";

/// @dev Boundary and adversarial edges not pinned by the shared behaviour suite.
contract IMDDailyEdgesTest is Test {
    address internal constant PUBLISHER = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9;
    address internal constant IMD = 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7;
    uint256 internal constant PRICE = 1e17;
    uint256 internal constant WINDOW = 86_400;

    MockIMD internal token;
    IMDDaily internal daily;
    IMDDailyVault internal vault;
    address internal alice = makeAddr("edge collector alice");
    address internal bob = makeAddr("edge collector bob");

    function setUp() public {
        MockIMD implementation = new MockIMD();
        vm.etch(IMD, address(implementation).code);
        token = MockIMD(IMD);
        vault = new IMDDailyVault();
        daily = new IMDDaily(address(vault));
    }

    function _content(string memory title) internal pure returns (IMDDaily.IssueInput memory) {
        return IMDDaily.IssueInput({
            title: title,
            editorialDate: 1_790_000_000,
            pdfURL: "https://test.invalid/issues/1/issue.pdf",
            coverURL: "https://test.invalid/issues/1/cover.png",
            metadataURI: "https://test.invalid/issues/1/metadata.json",
            pdfHash: sha256("pdf"),
            coverHash: sha256("cover"),
            metadataHash: sha256("metadata")
        });
    }

    function _publish() internal returns (uint256 id) {
        IMDDaily.IssueInput memory content = _content("Edge issue"); // sha256 is a call; build before prank.
        vm.prank(PUBLISHER);
        id = daily.createIssue(content);
    }

    function _fundAndApprove(address who, uint256 balance, uint256 allowance) internal {
        token.fund(who, balance);
        vm.prank(who);
        token.approve(address(daily), allowance);
    }

    function _mint(address payer, uint256 id, uint256 quantity, address to) internal {
        vm.prank(payer);
        daily.mint(id, quantity, to, vm.getBlockTimestamp());
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_windowIsExactlyHalfOpenForAnyPublicationTime(uint256 publishAt, uint256 elapsed)
        public
    {
        publishAt = bound(publishAt, 1, type(uint64).max);
        elapsed = bound(elapsed, 0, 3 * WINDOW);
        vm.warp(publishAt);
        uint256 id = _publish();
        IMDDaily.Issue memory issue = daily.getIssue(id);
        assertEq(issue.publishedAt, publishAt);
        assertEq(issue.closesAt, publishAt + WINDOW);
        _fundAndApprove(alice, PRICE, PRICE);

        vm.warp(publishAt + elapsed);
        bool open = elapsed < WINDOW;
        assertEq(daily.isAvailable(id), open);
        (,,,, bool available) = daily.issueStatus(id);
        assertEq(available, open);
        if (!open) vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _mint(alice, id, 1, alice);
        assertEq(daily.totalSupply(id), open ? 1 : 0);
        assertEq(token.balanceOf(alice), open ? 0 : PRICE);
    }

    function test_lastSecondOpenAndClosingSecondShut() public {
        uint256 id = _publish();
        uint256 start = vm.getBlockTimestamp();
        _fundAndApprove(alice, 10 * PRICE, 10 * PRICE);
        vm.warp(start + WINDOW - 1);
        _mint(alice, id, 1, alice);
        vm.warp(start + WINDOW);
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _mint(alice, id, 1, alice);
        // Far in the future the issue never reopens, but metadata and views remain.
        vm.warp(start + 3650 days);
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _mint(alice, id, 1, alice);
        assertEq(daily.uri(id), "https://test.invalid/issues/1/metadata.json");
        (uint256 supply, uint256 publishedAt, uint256 closesAt, uint256 price, bool available) =
            daily.issueStatus(id);
        assertEq(supply, 1);
        assertEq(publishedAt, start);
        assertEq(closesAt, start + WINDOW);
        assertEq(price, PRICE);
        assertFalse(available);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_callerDeadlineIsInclusiveAndCannotExtendWindow(uint256 elapsed, uint256 deadline)
        public
    {
        uint256 start = vm.getBlockTimestamp();
        uint256 id = _publish();
        _fundAndApprove(alice, PRICE, PRICE);
        elapsed = bound(elapsed, 0, 2 * WINDOW);
        vm.warp(start + elapsed);
        uint256 nowTs = vm.getBlockTimestamp();
        bool expectOk = elapsed < WINDOW && nowTs <= deadline;
        if (elapsed >= WINDOW) {
            vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        } else if (nowTs > deadline) {
            vm.expectRevert(IMDDaily.DeadlineExpired.selector);
        }
        vm.prank(alice);
        daily.mint(id, 1, alice, deadline);
        assertEq(daily.totalSupply(id), expectOk ? 1 : 0);
        assertEq(vault.balance(), expectOk ? PRICE : 0);
    }

    function test_deadlineOneSecondBeforeNowRejectedAtNowAccepted() public {
        uint256 id = _publish();
        _fundAndApprove(alice, 2 * PRICE, 2 * PRICE);
        vm.warp(vm.getBlockTimestamp() + 100);
        uint256 nowTs = vm.getBlockTimestamp();
        vm.expectRevert(IMDDaily.DeadlineExpired.selector);
        vm.prank(alice);
        daily.mint(id, 1, alice, nowTs - 1);
        vm.prank(alice);
        daily.mint(id, 1, alice, nowTs);
        assertEq(daily.totalSupply(id), 1);
    }

    function test_sameBlockPublicationsAreSequentialAndShareOnlyTheirStartTime() public {
        uint256 start = vm.getBlockTimestamp();
        vm.recordLogs();
        uint256[] memory ids = new uint256[](5);
        for (uint256 i; i < ids.length; ++i) {
            ids[i] = _publish();
            assertEq(ids[i], i + 1);
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 published =
            keccak256("IssuePublished(uint256,uint256,uint256,uint256,string,bytes32,bytes32,bytes32)");
        uint256 seen;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == published) {
                ++seen;
                assertEq(uint256(logs[i].topics[1]), seen, "indexed ids must be sequential for pagination");
                (uint256 publishedAt, uint256 closesAt,,,,) =
                    abi.decode(logs[i].data, (uint256, uint256, string, bytes32, bytes32, bytes32));
                assertEq(publishedAt, start);
                assertEq(closesAt, start + WINDOW);
            }
        }
        assertEq(seen, 5);
        assertEq(daily.issueCount(), 5);
        assertFalse(daily.issueExists(6));
    }

    function test_laterPublicationNeverReopensOrExtendsEarlierIssue() public {
        uint256 first = _publish();
        uint256 start = vm.getBlockTimestamp();
        _fundAndApprove(alice, 10 * PRICE, 10 * PRICE);
        _mint(alice, first, 2, alice);
        vm.warp(start + WINDOW);
        uint256 second = _publish();
        assertFalse(daily.isAvailable(first));
        assertEq(daily.getIssue(first).closesAt, start + WINDOW);
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, first));
        _mint(alice, first, 1, alice);
        _mint(alice, second, 3, alice);
        assertEq(daily.totalSupply(first), 2);
        assertEq(daily.totalSupply(second), 3);
        assertEq(daily.getIssue(second).publishedAt, start + WINDOW);
        assertEq(daily.getIssue(second).closesAt, start + 2 * WINDOW);
    }

    function test_largestNonOverflowingQuantityFailsOnFundsNotArithmetic() public {
        uint256 id = _publish();
        uint256 quantity = type(uint256).max / PRICE;
        _fundAndApprove(alice, 1000 ether, 1000 ether);
        vm.expectRevert(
            abi.encodeWithSelector(
                IERC20Errors.ERC20InsufficientAllowance.selector, address(daily), 1000 ether, quantity * PRICE
            )
        );
        _mint(alice, id, quantity, alice);
        vm.expectRevert(stdError.arithmeticError);
        _mint(alice, id, quantity + 1, alice);
        assertEq(daily.totalCollected(), 0);
        assertEq(token.balanceOf(alice), 1000 ether);
    }

    /// forge-config: default.fuzz.runs = 1000
    function testFuzz_exactFundsSucceedAndOneWeiShortFails(uint256 quantity, bool shortOnAllowance) public {
        quantity = bound(quantity, 1, 1_000_000);
        uint256 id = _publish();
        uint256 cost = quantity * PRICE;
        // One wei short on exactly one of balance or allowance.
        _fundAndApprove(alice, shortOnAllowance ? cost : cost - 1, shortOnAllowance ? cost - 1 : cost);
        vm.expectRevert();
        _mint(alice, id, quantity, alice);
        assertEq(daily.totalSupply(id), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.balance(), 0);

        token.fund(alice, 1);
        vm.prank(alice);
        token.approve(address(daily), cost);
        _mint(alice, id, quantity, bob);
        assertEq(daily.balanceOf(bob, id), quantity);
        assertEq(daily.balanceOf(alice, id), 0);
        assertEq(token.balanceOf(alice), shortOnAllowance ? 1 : 0);
        assertEq(token.allowance(alice, address(daily)), 0);
        assertEq(vault.balance(), cost);
        assertEq(daily.totalCollected(), cost);
    }

    function test_paymentGoesToVaultNotCollectionAndApprovingVaultIsNotEnough() public {
        uint256 id = _publish();
        token.fund(alice, PRICE);
        vm.prank(alice);
        token.approve(address(vault), PRICE);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(daily), 0, PRICE)
        );
        _mint(alice, id, 1, alice);
        vm.prank(alice);
        token.approve(address(daily), PRICE);
        _mint(alice, id, 1, alice);
        assertEq(token.balanceOf(address(daily)), 0);
        assertEq(token.balanceOf(address(vault)), PRICE);
    }

    function test_withdrawBoundaryExactBalanceAndOneMore() public {
        uint256 id = _publish();
        _fundAndApprove(alice, 5 * PRICE, 5 * PRICE);
        _mint(alice, id, 5, alice);
        vm.startPrank(PUBLISHER);
        vm.expectRevert(
            abi.encodeWithSelector(IMDDailyVault.InsufficientFunds.selector, 5 * PRICE, 5 * PRICE + 1)
        );
        vault.withdraw(5 * PRICE + 1);
        vault.withdraw(1);
        vault.withdraw(5 * PRICE - 1);
        vm.expectRevert(abi.encodeWithSelector(IMDDailyVault.InsufficientFunds.selector, 0, 1));
        vault.withdraw(1);
        vm.stopPrank();
        assertEq(vault.totalWithdrawn(), 5 * PRICE);
        assertEq(token.balanceOf(PUBLISHER), 5 * PRICE);
        assertEq(daily.totalCollected(), 5 * PRICE);
    }

    /// forge-config: default.fuzz.runs = 500
    function testFuzz_onlyPublisherMayPublishOrWithdraw(address caller) public {
        vm.assume(caller != PUBLISHER);
        uint256 id = _publish();
        _fundAndApprove(alice, PRICE, PRICE);
        _mint(alice, id, 1, alice);
        IMDDaily.IssueInput memory content = _content("Forged issue");
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        vm.prank(caller);
        daily.createIssue(content);
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        vm.prank(caller);
        vault.withdraw(1);
        assertEq(daily.issueCount(), 1);
        assertEq(vault.balance(), PRICE);
        assertEq(vault.totalWithdrawn(), 0);
    }

    function test_factoryOrDeployerGetsNoAuthority() public {
        // The deployer of both contracts here is this test contract, standing in for the launch factory.
        uint256 id = _publish();
        _fundAndApprove(alice, PRICE, PRICE);
        _mint(alice, id, 1, alice);
        IMDDaily.IssueInput memory content = _content("Factory issue");
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        daily.createIssue(content);
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        vault.withdraw(1);
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        vm.prank(tx.origin);
        vault.withdraw(1);
    }

    function test_imdSentToCollectionIsNotRevenueOrVaultBalance() public {
        uint256 id = _publish();
        _fundAndApprove(alice, 10 * PRICE, 10 * PRICE);
        token.fund(bob, 3 * PRICE);
        vm.prank(bob);
        token.transfer(address(daily), 3 * PRICE);
        _mint(alice, id, 2, alice);
        assertEq(daily.totalCollected(), 2 * PRICE);
        assertEq(vault.balance(), 2 * PRICE);
        assertEq(token.balanceOf(address(daily)), 3 * PRICE);
        // A later mint is not paid from the misdirected IMD.
        _mint(alice, id, 1, alice);
        assertEq(token.balanceOf(alice), 7 * PRICE);
        assertEq(token.balanceOf(address(daily)), 3 * PRICE);
    }

    function test_copiesCannotBeParkedInVaultOrCollection() public {
        uint256 id = _publish();
        _fundAndApprove(alice, 3 * PRICE, 3 * PRICE);
        _mint(alice, id, 2, alice);
        vm.startPrank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(vault))
        );
        daily.safeTransferFrom(alice, address(vault), id, 1, "");
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(daily))
        );
        daily.safeTransferFrom(alice, address(daily), id, 1, "");
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(0)));
        daily.safeTransferFrom(alice, address(0), id, 1, "");
        vm.stopPrank();
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(daily))
        );
        _mint(alice, id, 1, address(daily));
        assertEq(daily.balanceOf(alice, id), 2);
        assertEq(daily.totalSupply(id), 2);
        assertEq(token.balanceOf(alice), PRICE);
    }

    function test_holdersCannotBurnOrInflateAfterExpiry() public {
        uint256 id = _publish();
        _fundAndApprove(alice, 4 * PRICE, 4 * PRICE);
        _mint(alice, id, 4, alice);
        vm.warp(vm.getBlockTimestamp() + WINDOW);
        string[4] memory probes = [
            "burn(address,uint256,uint256)",
            "mint(address,uint256,uint256,bytes)",
            "airdrop(address,uint256)",
            "freeMint(uint256,uint256)"
        ];
        for (uint256 i; i < probes.length; ++i) {
            vm.prank(alice);
            (bool ok,) = address(daily).call(abi.encodeWithSignature(probes[i], alice, id, 1));
            assertFalse(ok);
            vm.prank(PUBLISHER);
            (ok,) = address(daily).call(abi.encodeWithSignature(probes[i], PUBLISHER, id, 1));
            assertFalse(ok);
        }
        assertEq(daily.totalSupply(id), 4);
        assertEq(daily.balanceOf(alice, id), 4);
    }

    function test_publishedContentIsVerbatimIncludingUnicodeAndLongURLs() public {
        IMDDaily.IssueInput memory content = _content(unicode"Édition spéciale — 日刊");
        content.pdfURL =
            string.concat("https://test.invalid/", vm.toString(keccak256("x")), "/issue.pdf?v=1#p");
        content.editorialDate = 0;
        vm.prank(PUBLISHER);
        uint256 id = daily.createIssue(content);
        IMDDaily.Issue memory stored = daily.getIssue(id);
        assertEq(stored.content.title, content.title);
        assertEq(stored.content.pdfURL, content.pdfURL);
        assertEq(stored.content.coverURL, content.coverURL);
        assertEq(stored.content.pdfHash, content.pdfHash);
        assertEq(stored.content.coverHash, content.coverHash);
        assertEq(stored.content.metadataHash, content.metadataHash);
        assertEq(stored.content.editorialDate, 0);
    }
}
