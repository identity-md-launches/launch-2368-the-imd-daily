// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {stdError} from "forge-std/StdError.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DailyAuthority} from "../src/DailyAuthority.sol";
import {IMDDaily} from "../src/IMDDaily.sol";
import {IMDDailyVault} from "../src/IMDDailyVault.sol";
import {Receiver} from "./helpers/Receiver.sol";

/// @dev The same behavior suite is inherited by mocks and real-token fork tests.
abstract contract DailyBehavior is Test {
    address internal constant PUBLISHER = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9;
    address internal constant IMD = 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7;
    uint256 internal constant PRICE = 1e17;
    IERC20 internal token = IERC20(IMD);
    IMDDaily internal daily;
    IMDDailyVault internal vault;
    address internal alice;
    address internal bob;
    uint256 internal opened;

    function setUp() public virtual {
        _configureToken();
        alice = makeAddr("collector alice");
        bob = makeAddr("collector bob");
        vault = new IMDDailyVault();
        daily = new IMDDaily(address(vault));
        opened = vm.getBlockTimestamp();
        _fund(alice, 1000 ether);
        _fund(bob, 1000 ether);
        vm.prank(alice);
        token.approve(address(daily), 1000 ether);
        vm.prank(bob);
        token.approve(address(daily), 1000 ether);
    }

    function _configureToken() internal virtual;

    function _fund(address account, uint256 amount) internal virtual {
        deal(IMD, account, amount);
    }

    function _content(uint256 date) internal pure returns (IMDDaily.IssueInput memory) {
        return IMDDaily.IssueInput({
            title: "Local test issue",
            editorialDate: date,
            pdfURL: "https://test.invalid/issues/local/newspaper.pdf",
            coverURL: "https://test.invalid/issues/local/cover.png",
            metadataURI: "https://test.invalid/issues/local/metadata.json",
            pdfHash: sha256("local pdf bytes"),
            coverHash: sha256("local cover bytes"),
            metadataHash: sha256("local metadata bytes")
        });
    }

    function _publish(uint256 date) internal returns (uint256) {
        IMDDaily.IssueInput memory content = _content(date);
        vm.prank(PUBLISHER);
        return daily.createIssue(content);
    }

    function _buy(address payer, uint256 id, uint256 quantity, address recipient) internal {
        vm.prank(payer);
        daily.mint(id, quantity, recipient, vm.getBlockTimestamp());
    }

    function test_initialConfigurationAndZeroSupply() public view {
        assertEq(daily.name(), "The IMD Daily");
        assertEq(daily.symbol(), "IMDDAILY");
        assertEq(daily.PRICE(), PRICE);
        assertEq(daily.PAYMENT_DECIMALS(), 18);
        assertEq(IERC20Metadata(IMD).decimals(), 18);
        assertEq(daily.owner(), PUBLISHER);
        assertEq(vault.owner(), PUBLISHER);
        assertEq(daily.PAYMENT_TOKEN(), IMD);
        assertEq(vault.PAYMENT_TOKEN(), IMD);
        assertEq(address(daily.vault()), address(vault));
        assertEq(daily.issueCount(), 0);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.totalWithdrawn(), 0);
        assertEq(vault.balance(), 0);
        assertTrue(daily.supportsInterface(0xd9b67a26));
        assertTrue(daily.supportsInterface(0x0e89341c));
        assertTrue(daily.supportsInterface(0x01ffc9a7));
        assertFalse(daily.supportsInterface(0x2a55205a)); // No ERC2981 royalties.
        assertFalse(daily.supportsInterface(0xffffffff));
    }

    function test_publicationCommitsEveryFieldWithoutMinting() public {
        IMDDaily.IssueInput memory content = _content(12345);
        vm.recordLogs();
        vm.prank(PUBLISHER);
        uint256 id = daily.createIssue(content);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(
            logs[0].topics[0],
            keccak256("IssuePublished(uint256,uint256,uint256,uint256,string,bytes32,bytes32,bytes32)")
        );
        assertEq(uint256(logs[0].topics[1]), id);
        assertEq(uint256(logs[0].topics[2]), content.editorialDate);
        assertEq(id, 1);
        IMDDaily.Issue memory issue = daily.getIssue(id);
        assertEq(abi.encode(issue.content), abi.encode(content));
        assertEq(issue.publishedAt, opened);
        assertEq(issue.closesAt, opened + 86400);
        assertEq(daily.uri(id), content.metadataURI);
        assertTrue(daily.issueExists(id));
        assertFalse(daily.exists(id));
        assertEq(daily.totalSupply(id), 0);
        assertEq(daily.totalCollected(), 0);
        (uint256 supply, uint256 start, uint256 end, uint256 price, bool available) = daily.issueStatus(id);
        assertEq(supply, 0);
        assertEq(start, opened);
        assertEq(end, opened + 86400);
        assertEq(price, PRICE);
        assertTrue(available);
    }

    function test_repeatedMultiCopyMintsAndGift() public {
        uint256 id = _publish(0);
        uint256 balanceBefore = token.balanceOf(alice);
        _buy(alice, id, 3, alice);
        _buy(alice, id, 7, bob);
        _buy(bob, id, 2, bob);
        assertEq(daily.totalSupply(id), 12);
        assertEq(daily.totalSupply(), 12);
        assertEq(daily.balanceOf(alice, id), 3);
        assertEq(daily.balanceOf(bob, id), 9);
        assertEq(balanceBefore - token.balanceOf(alice), 10 * PRICE);
        assertEq(vault.balance(), 12 * PRICE);
        assertEq(daily.totalCollected(), 12 * PRICE);
        assertEq(token.balanceOf(address(daily)), 0);
    }

    function test_mintEventIsIndexedAndAmountIsExact() public {
        uint256 id = _publish(0);
        vm.recordLogs();
        _buy(alice, id, 7, bob);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == keccak256("CopiesMinted(uint256,address,address,uint256,uint256)")) {
                assertEq(logs[i].emitter, address(daily));
                assertEq(uint256(logs[i].topics[1]), id);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), alice);
                assertEq(address(uint160(uint256(logs[i].topics[3]))), bob);
                (uint256 quantity, uint256 amount) = abi.decode(logs[i].data, (uint256, uint256));
                assertEq(quantity, 7);
                assertEq(amount, 7 * PRICE);
                found = true;
            }
        }
        assertTrue(found);
    }

    function test_windowStartsAtPublicationAndClosesExactly() public {
        uint256 id = _publish(type(uint256).max); // Editorial date cannot extend eligibility.
        _buy(alice, id, 1, alice); // At start.
        vm.warp(opened + 86399);
        assertTrue(daily.isAvailable(id));
        _buy(alice, id, 2, alice);
        vm.warp(opened + 86400);
        assertFalse(daily.isAvailable(id));
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _buy(alice, id, 1, alice);
        vm.warp(opened + 86401);
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _buy(alice, id, 1, alice);
        assertEq(daily.totalSupply(id), 3);
    }

    function test_beforeStartIsRejected() public {
        uint256 id = _publish(0);
        vm.warp(opened - 1);
        assertFalse(daily.isAvailable(id));
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _buy(alice, id, 1, alice);
    }

    function test_issuesHaveIndependentWindowsAndMetadata() public {
        uint256 first = _publish(0);
        bytes memory original = abi.encode(daily.getIssue(first));
        _buy(alice, first, 3, alice);
        vm.warp(opened + 43000);
        IMDDaily.IssueInput memory secondContent = _content(type(uint256).max);
        secondContent.title = "Another local issue";
        secondContent.metadataURI = "https://test.invalid/second/metadata.json";
        vm.prank(PUBLISHER);
        uint256 second = daily.createIssue(secondContent);
        assertEq(second, first + 1);
        vm.warp(opened + 86400);
        assertFalse(daily.isAvailable(first));
        assertTrue(daily.isAvailable(second));
        _buy(bob, second, 5, bob);
        assertEq(daily.totalSupply(first), 3);
        assertEq(daily.totalSupply(second), 5);
        assertEq(daily.totalSupply(), 8);
        assertEq(abi.encode(daily.getIssue(first)), original);
        assertEq(daily.PRICE(), PRICE);
    }

    function test_publisherAlsoPaysFullPriceAndCannotMintExpiredIssues() public {
        uint256 id = _publish(0);
        _fund(PUBLISHER, 10 * PRICE);
        vm.expectRevert();
        _buy(PUBLISHER, id, 1, PUBLISHER);
        vm.prank(PUBLISHER);
        token.approve(address(daily), 10 * PRICE);
        _buy(PUBLISHER, id, 10, PUBLISHER);
        assertEq(vault.balance(), 10 * PRICE);
        vm.warp(opened + 86400);
        vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
        _buy(PUBLISHER, id, 1, PUBLISHER);
    }

    function test_unauthorizedPublicationAndWithdrawal() public {
        IMDDaily.IssueInput memory content = _content(0);
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        vm.prank(alice);
        daily.createIssue(content);
        assertEq(daily.issueCount(), 0);
        uint256 id = _publish(0);
        _buy(alice, id, 2, alice);
        vm.expectRevert(DailyAuthority.OnlyPublisher.selector);
        vm.prank(alice);
        vault.withdraw(PRICE);
        assertEq(vault.balance(), 2 * PRICE);
        assertEq(vault.totalWithdrawn(), 0);
    }

    function test_invalidPublicationDoesNotConsumeAnID() public {
        for (uint256 i; i < 7; ++i) {
            IMDDaily.IssueInput memory content = _content(0);
            if (i == 0) content.title = "";
            if (i == 1) content.pdfURL = "";
            if (i == 2) content.coverURL = "";
            if (i == 3) content.metadataURI = "";
            if (i == 4) content.pdfHash = bytes32(0);
            if (i == 5) content.coverHash = bytes32(0);
            if (i == 6) content.metadataHash = bytes32(0);
            vm.expectRevert(IMDDaily.InvalidContent.selector);
            vm.prank(PUBLISHER);
            daily.createIssue(content);
            assertEq(daily.issueCount(), 0);
        }
        assertEq(_publish(0), 1);
    }

    function test_nonexistentIDsRejectedAndAvailabilityFalse() public {
        uint256[2] memory invalid = [uint256(0), uint256(1)];
        for (uint256 i; i < invalid.length; ++i) {
            uint256 id = invalid[i];
            assertFalse(daily.isAvailable(id));
            assertFalse(daily.issueExists(id));
            vm.expectRevert(abi.encodeWithSelector(IMDDaily.UnknownIssue.selector, id));
            _buy(alice, id, 1, alice);
            vm.expectRevert(abi.encodeWithSelector(IMDDaily.UnknownIssue.selector, id));
            daily.getIssue(id);
            vm.expectRevert(abi.encodeWithSelector(IMDDaily.UnknownIssue.selector, id));
            daily.uri(id);
            vm.expectRevert(abi.encodeWithSelector(IMDDaily.UnknownIssue.selector, id));
            daily.issueStatus(id);
        }
    }

    function test_zeroQuantityZeroRecipientOverflowAndDeadline() public {
        uint256 id = _publish(0);
        vm.expectRevert(IMDDaily.ZeroQuantity.selector);
        _buy(alice, id, 0, alice);
        vm.expectRevert(IMDDaily.InvalidRecipient.selector);
        _buy(alice, id, 1, address(0));
        vm.expectRevert(stdError.arithmeticError);
        _buy(alice, id, type(uint256).max / PRICE + 1, alice);
        vm.expectRevert(IMDDaily.DeadlineExpired.selector);
        vm.prank(alice);
        daily.mint(id, 1, alice, opened - 1);
        _buy(alice, id, 1, alice); // Inclusive caller deadline.
        assertEq(daily.totalSupply(id), 1);
    }

    function test_insufficientBalanceAndAllowanceRollback() public {
        uint256 id = _publish(0);
        uint256 beforeBalance = token.balanceOf(alice);
        // Approval exceeds balance, so the first failure must exercise insufficient funds.
        vm.prank(alice);
        token.approve(address(daily), beforeBalance + PRICE);
        uint256 allowanceBefore = token.allowance(alice, address(daily));
        vm.expectRevert();
        _buy(alice, id, beforeBalance / PRICE + 1, alice);
        assertEq(token.balanceOf(alice), beforeBalance);
        assertEq(token.allowance(alice, address(daily)), allowanceBefore);
        vm.prank(alice);
        token.approve(address(daily), PRICE - 1);
        vm.expectRevert();
        _buy(alice, id, 1, alice);
        assertEq(token.allowance(alice, address(daily)), PRICE - 1);
        assertEq(token.balanceOf(alice), beforeBalance);
        assertEq(daily.totalCollected(), 0);
        assertEq(daily.totalSupply(id), 0);
        assertEq(vault.balance(), 0);
    }

    function test_receiverRejectionRollsBackPaymentAllowanceSupplyAndCounters() public {
        uint256 id = _publish(0);
        Receiver receiver = new Receiver(daily);
        receiver.configure(Receiver.Action.Reject, address(0), "");
        uint256 balanceBefore = token.balanceOf(alice);
        uint256 allowanceBefore = token.allowance(alice, address(daily));
        vm.expectRevert(bytes("receiver rejected"));
        _buy(alice, id, 9, address(receiver));
        assertEq(token.balanceOf(alice), balanceBefore);
        assertEq(token.allowance(alice, address(daily)), allowanceBefore);
        assertEq(vault.balance(), 0);
        assertEq(daily.totalSupply(id), 0);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(daily.balanceOf(address(receiver), id), 0);
        _buy(alice, id, 1, alice); // Rejection cannot lock future mints.
    }

    function test_wrongReceiverSelectorAndNonReceiverRevert() public {
        uint256 id = _publish(0);
        Receiver receiver = new Receiver(daily);
        receiver.configure(Receiver.Action.WrongSelector, address(0), "");
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(receiver))
        );
        _buy(alice, id, 1, address(receiver));
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155InvalidReceiver.selector, address(vault))
        );
        _buy(alice, id, 1, address(vault));
        assertEq(vault.balance(), 0);
        assertEq(daily.totalCollected(), 0);
    }

    function test_receiverCannotReenterMintAndObservesSettledState() public {
        uint256 id = _publish(0);
        Receiver receiver = new Receiver(daily);
        receiver.configure(Receiver.Action.Reenter, address(0), "");
        _fund(address(receiver), 10 * PRICE);
        receiver.buy(id, 2);
        assertFalse(receiver.callbackSucceeded());
        assertEq(
            receiver.callbackResult(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(receiver.observedSupply(), 2);
        assertEq(receiver.observedRevenue(), 2 * PRICE);
        assertEq(receiver.observedVaultBalance(), 2 * PRICE);
        assertEq(daily.totalSupply(id), 2);
        assertEq(vault.balance(), 2 * PRICE);
    }

    function test_bubbledReceiverReentrancyRollsBackAll() public {
        uint256 id = _publish(0);
        Receiver receiver = new Receiver(daily);
        receiver.configure(Receiver.Action.ReenterAndBubble, address(0), "");
        _fund(address(receiver), 10 * PRICE);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        receiver.buy(id, 2);
        assertEq(token.balanceOf(address(receiver)), 10 * PRICE);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.balance(), 0);
    }

    function test_receiverMayTransferItsFullyPaidCopies() public {
        uint256 id = _publish(0);
        Receiver receiver = new Receiver(daily);
        receiver.configure(Receiver.Action.TransferOnReceipt, bob, "");
        _buy(alice, id, 4, address(receiver));
        assertEq(daily.balanceOf(bob, id), 4);
        assertEq(daily.balanceOf(address(receiver), id), 0);
        assertEq(daily.totalSupply(id), 4);
        assertEq(vault.balance(), 4 * PRICE);
    }

    function test_rejectedMintAlsoRollsBackPublisherWithdrawalInCallback() public {
        uint256 id = _publish(0);
        Receiver receiverImplementation = new Receiver(daily);
        vm.etch(PUBLISHER, address(receiverImplementation).code);
        Receiver publisherReceiver = Receiver(PUBLISHER);
        publisherReceiver.configure(
            Receiver.Action.CallTargetAndReject, address(vault), abi.encodeCall(vault.withdraw, (2 * PRICE))
        );
        uint256 publisherBefore = token.balanceOf(PUBLISHER);
        uint256 payerBefore = token.balanceOf(alice);
        vm.expectRevert(bytes("receiver rejected after callback"));
        _buy(alice, id, 2, PUBLISHER);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.totalWithdrawn(), 0);
        assertEq(vault.balance(), 0);
        assertEq(token.balanceOf(PUBLISHER), publisherBefore);
        assertEq(token.balanceOf(alice), payerBefore);
    }

    function test_vaultHasNoAlternativeRecipientOrAuthoritySetter() public {
        vm.prank(alice);
        token.transfer(address(vault), PRICE);
        vm.startPrank(PUBLISHER);
        (bool redirected,) =
            address(vault).call(abi.encodeWithSignature("withdraw(address,uint256)", alice, PRICE));
        (bool transferred,) =
            address(vault).call(abi.encodeWithSignature("transferOwnership(address)", alice));
        (bool initialized,) = address(vault).call(abi.encodeWithSignature("initialize(address)", alice));
        vm.stopPrank();
        assertFalse(redirected);
        assertFalse(transferred);
        assertFalse(initialized);
        assertEq(vault.owner(), PUBLISHER);
        assertEq(vault.balance(), PRICE);
        assertEq(vault.totalWithdrawn(), 0);
    }

    function test_receiverCannotWithdrawOrPublish() public {
        uint256 id = _publish(0);
        Receiver receiver = new Receiver(daily);
        receiver.configure(
            Receiver.Action.CallTarget, address(vault), abi.encodeCall(vault.withdraw, (PRICE))
        );
        _buy(alice, id, 2, address(receiver));
        assertFalse(receiver.callbackSucceeded());
        assertEq(receiver.callbackResult(), abi.encodeWithSelector(DailyAuthority.OnlyPublisher.selector));
        receiver.configure(
            Receiver.Action.CallTarget, address(daily), abi.encodeCall(daily.createIssue, (_content(0)))
        );
        _buy(alice, id, 1, address(receiver));
        assertFalse(receiver.callbackSucceeded());
        assertEq(daily.issueCount(), 1);
        assertEq(vault.balance(), 3 * PRICE);
    }

    function test_donationsAndPartialWithdrawalHaveHonestCounters() public {
        uint256 id = _publish(0);
        _buy(alice, id, 10, alice);
        vm.prank(bob);
        token.transfer(address(vault), 7 * PRICE);
        assertEq(daily.totalCollected(), 10 * PRICE);
        assertEq(vault.balance(), 17 * PRICE);
        uint256 publisherBefore = token.balanceOf(PUBLISHER);
        vm.recordLogs();
        vm.prank(PUBLISHER);
        vault.withdraw(6 * PRICE);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        Vm.Log memory withdrawal = logs[logs.length - 1];
        assertEq(withdrawal.topics[0], keccak256("Withdrawal(address,uint256,uint256)"));
        assertEq(address(uint160(uint256(withdrawal.topics[1]))), PUBLISHER);
        assertEq(withdrawal.data, abi.encode(6 * PRICE, 6 * PRICE));
        assertEq(token.balanceOf(PUBLISHER), publisherBefore + 6 * PRICE);
        assertEq(vault.totalWithdrawn(), 6 * PRICE);
        assertEq(vault.balance(), 11 * PRICE);
        vm.prank(PUBLISHER);
        vault.withdraw(11 * PRICE);
        assertEq(vault.totalWithdrawn(), 17 * PRICE);
        assertEq(daily.totalCollected(), 10 * PRICE);
        assertEq(vault.balance(), 0);
        assertEq(token.balanceOf(PUBLISHER), publisherBefore + 17 * PRICE);
    }

    function test_zeroAndExcessWithdrawalRevert() public {
        vm.expectRevert(IMDDailyVault.ZeroAmount.selector);
        vm.prank(PUBLISHER);
        vault.withdraw(0);
        vm.expectRevert(abi.encodeWithSelector(IMDDailyVault.InsufficientFunds.selector, 0, 1));
        vm.prank(PUBLISHER);
        vault.withdraw(1);
        assertEq(vault.totalWithdrawn(), 0);
    }

    function test_transfersAndBatchTransfersAfterExpiryPreserveSupply() public {
        uint256 first = _publish(0);
        uint256 second = _publish(0);
        _buy(alice, first, 8, alice);
        _buy(alice, second, 5, alice);
        vm.warp(opened + 86400);
        vm.prank(alice);
        daily.safeTransferFrom(alice, bob, first, 2, "");
        vm.expectRevert(
            abi.encodeWithSelector(IERC1155Errors.ERC1155MissingApprovalForAll.selector, bob, alice)
        );
        vm.prank(bob);
        daily.safeTransferFrom(alice, bob, first, 1, "");
        vm.prank(alice);
        daily.setApprovalForAll(bob, true);
        uint256[] memory ids = new uint256[](2);
        uint256[] memory amounts = new uint256[](2);
        ids[0] = first;
        ids[1] = second;
        amounts[0] = 3;
        amounts[1] = 4;
        vm.prank(bob);
        daily.safeBatchTransferFrom(alice, bob, ids, amounts, "");
        assertEq(daily.balanceOf(alice, first), 3);
        assertEq(daily.balanceOf(bob, first), 5);
        assertEq(daily.balanceOf(alice, second), 1);
        assertEq(daily.balanceOf(bob, second), 4);
        assertEq(daily.totalSupply(first), 8);
        assertEq(daily.totalSupply(second), 5);
        assertEq(daily.totalCollected(), 13 * PRICE);
        assertEq(daily.uri(first), _content(0).metadataURI);
    }

    function test_nativeETHRejectedByEveryEntryPoint() public {
        uint256 id = _publish(0);
        uint256 initialCollectionETH = address(daily).balance;
        uint256 initialVaultETH = address(vault).balance;
        vm.deal(alice, 1 ether);
        bytes[] memory calls = new bytes[](3);
        calls[0] = "";
        calls[1] = abi.encodeCall(daily.mint, (id, 1, alice, opened));
        calls[2] = abi.encodeCall(daily.createIssue, (_content(0)));
        for (uint256 i; i < calls.length; ++i) {
            vm.prank(alice);
            (bool success,) = address(daily).call{value: 1}(calls[i]);
            assertFalse(success);
        }
        vm.prank(alice);
        (bool paidVault,) = address(vault).call{value: 1}("");
        assertFalse(paidVault);
        vm.deal(PUBLISHER, 1);
        vm.prank(PUBLISHER);
        (bool withdrewWithETH,) = address(vault).call{value: 1}(abi.encodeCall(vault.withdraw, (1)));
        assertFalse(withdrewWithETH);
        // Deterministic test addresses may already have dust on a real fork.
        assertEq(address(daily).balance, initialCollectionETH);
        assertEq(address(vault).balance, initialVaultETH);
        assertEq(daily.totalSupply(id), 0);
    }

    function test_noMutationUpgradeFreeMintOrReopenSelectors() public {
        uint256 id = _publish(0);
        bytes memory original = abi.encode(daily.getIssue(id));
        bytes[] memory probes = new bytes[](9);
        probes[0] = abi.encodeWithSignature("setURI(string)", "changed");
        probes[1] = abi.encodeWithSignature("setBaseURI(string)", "changed");
        probes[2] = abi.encodeWithSignature("setPrice(uint256)", 0);
        probes[3] = abi.encodeWithSignature("reopenIssue(uint256)", id);
        probes[4] = abi.encodeWithSignature("extendIssue(uint256,uint256)", id, type(uint256).max);
        probes[5] = abi.encodeWithSignature("ownerMint(address,uint256,uint256)", PUBLISHER, id, 1);
        probes[6] = abi.encodeWithSignature("upgradeTo(address)", alice);
        probes[7] = abi.encodeWithSignature("transferOwnership(address)", alice);
        probes[8] = abi.encodeWithSignature("initialize(address)", alice);
        for (uint256 i; i < probes.length; ++i) {
            vm.prank(PUBLISHER);
            (bool success,) = address(daily).call(probes[i]);
            assertFalse(success);
        }
        assertEq(abi.encode(daily.getIssue(id)), original);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.PRICE(), PRICE);
    }

    function testFuzz_paymentArithmeticAndRepeatMints(uint256 first, uint256 second) public {
        first = bound(first, 1, 5000);
        second = bound(second, 1, 5000);
        uint256 id = _publish(0);
        assertEq(daily.quote(first), first * PRICE);
        _buy(alice, id, first, alice);
        _buy(alice, id, second, alice);
        assertEq(daily.totalSupply(id), first + second);
        assertEq(daily.balanceOf(alice, id), first + second);
        assertEq(daily.totalCollected(), (first + second) * PRICE);
        assertEq(vault.balance(), (first + second) * PRICE);
    }

    function testFuzz_windowIndependentOfEditorialDate(uint256 editorialDate, uint32 elapsed) public {
        uint256 id = _publish(editorialDate);
        vm.warp(opened + uint256(elapsed));
        assertEq(daily.isAvailable(id), elapsed < 86400);
        if (elapsed < 86400) {
            _buy(alice, id, 1, alice);
            assertEq(daily.totalSupply(id), 1);
        } else {
            vm.expectRevert(abi.encodeWithSelector(IMDDaily.MintClosed.selector, id));
            _buy(alice, id, 1, alice);
            assertEq(daily.totalSupply(id), 0);
        }
    }
}

