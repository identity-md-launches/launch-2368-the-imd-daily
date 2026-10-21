// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IMDDaily} from "../src/IMDDaily.sol";
import {IMDDailyVault} from "../src/IMDDailyVault.sol";
import {MockIMD} from "./helpers/MockIMD.sol";

contract DailyHandler is Test {
    address internal constant PUBLISHER = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9;
    IMDDaily public daily;
    IMDDailyVault public vault;
    MockIMD public token;
    address[3] public actors;
    uint256 public minted;
    uint256 public donated;
    uint256 public withdrawn;
    mapping(uint256 => uint256) public issueMints;
    mapping(uint256 => bytes32) public issueCommitments;
    mapping(uint256 => bool) public closedRecorded;
    mapping(uint256 => uint256) public finalSupply;

    constructor(IMDDaily daily_, IMDDailyVault vault_, MockIMD token_) {
        daily = daily_;
        vault = vault_;
        token = token_;
        actors = [
            makeAddr("invariant collector 1"),
            makeAddr("invariant collector 2"),
            makeAddr("invariant collector 3")
        ];
        for (uint256 i; i < actors.length; ++i) {
            token.fund(actors[i], 1e36);
            vm.prank(actors[i]);
            token.approve(address(daily), 1e36);
        }
        publish(0);
    }

    function publish(uint256 date) public {
        IMDDaily.IssueInput memory content = IMDDaily.IssueInput({
            title: "Invariant issue",
            editorialDate: date,
            pdfURL: "https://test.invalid/pdf",
            coverURL: "https://test.invalid/cover",
            metadataURI: "https://test.invalid/metadata",
            pdfHash: sha256("pdf"),
            coverHash: sha256("cover"),
            metadataHash: sha256("metadata")
        });
        vm.prank(PUBLISHER);
        uint256 id = daily.createIssue(content);
        issueCommitments[id] = keccak256(abi.encode(daily.getIssue(id)));
    }

    function buy(uint256 issueSeed, uint256 payerSeed, uint256 recipientSeed, uint256 amountSeed) external {
        uint256 id = bound(issueSeed, 1, daily.issueCount());
        if (!daily.isAvailable(id)) return;
        uint256 quantity = bound(amountSeed, 1, 10000);
        address payer = actors[payerSeed % 3];
        address recipient = actors[recipientSeed % 3];
        vm.prank(payer);
        daily.mint(id, quantity, recipient, vm.getBlockTimestamp());
        minted += quantity;
        issueMints[id] += quantity;
    }

    function advance(uint256 secondsSeed) external {
        vm.warp(vm.getBlockTimestamp() + bound(secondsSeed, 0, 172800));
        for (uint256 id = 1; id <= daily.issueCount(); ++id) {
            if (!daily.isAvailable(id) && !closedRecorded[id]) {
                closedRecorded[id] = true;
                finalSupply[id] = daily.totalSupply(id);
            }
        }
    }

    function transferCopies(
        uint256 issueSeed,
        uint256 senderSeed,
        uint256 recipientSeed,
        uint256 quantitySeed
    ) external {
        uint256 id = bound(issueSeed, 1, daily.issueCount());
        address sender = actors[senderSeed % 3];
        address recipient = actors[recipientSeed % 3];
        uint256 balance = daily.balanceOf(sender, id);
        if (balance == 0) return;
        uint256 quantity = bound(quantitySeed, 1, balance);
        vm.prank(sender);
        daily.safeTransferFrom(sender, recipient, id, quantity, "");
    }

    function donate(uint256 actorSeed, uint256 amountSeed) external {
        uint256 amount = bound(amountSeed, 1, 100 ether);
        vm.prank(actors[actorSeed % 3]);
        token.transfer(address(vault), amount);
        donated += amount;
    }

    function withdraw(uint256 amountSeed) external {
        uint256 balance = vault.balance();
        if (balance == 0) return;
        uint256 amount = bound(amountSeed, 1, balance);
        vm.prank(PUBLISHER);
        vault.withdraw(amount);
        withdrawn += amount;
    }

    function tryExpiredMint(uint256 issueSeed) external {
        uint256 id = bound(issueSeed, 1, daily.issueCount());
        if (daily.isAvailable(id)) return;
        vm.prank(actors[0]);
        (bool success,) =
            address(daily).call(abi.encodeCall(daily.mint, (id, 1, actors[0], vm.getBlockTimestamp())));
        assertFalse(success);
    }
}

contract DailyInvariantTest is StdInvariant, Test {
    IMDDaily internal daily;
    IMDDailyVault internal vault;
    DailyHandler internal handler;

    function setUp() public {
        address imd = 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7;
        MockIMD implementation = new MockIMD();
        vm.etch(imd, address(implementation).code);
        vault = new IMDDailyVault();
        daily = new IMDDaily(address(vault));
        handler = new DailyHandler(daily, vault, MockIMD(imd));
        bytes4[] memory selectors = new bytes4[](7);
        selectors[0] = handler.publish.selector;
        selectors[1] = handler.buy.selector;
        selectors[2] = handler.advance.selector;
        selectors[3] = handler.transferCopies.selector;
        selectors[4] = handler.donate.selector;
        selectors[5] = handler.withdraw.selector;
        selectors[6] = handler.tryExpiredMint.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    function invariant_conservationOfPaymentsDonationsAndWithdrawals() public view {
        assertEq(daily.totalCollected(), handler.minted() * daily.PRICE());
        assertEq(vault.totalWithdrawn(), handler.withdrawn());
        assertEq(vault.balance() + vault.totalWithdrawn(), daily.totalCollected() + handler.donated());
        assertEq(daily.totalSupply(), handler.minted());
    }

    function invariant_supplyOwnershipExpiryAndContentArePermanent() public view {
        for (uint256 id = 1; id <= daily.issueCount(); ++id) {
            assertEq(daily.totalSupply(id), handler.issueMints(id));
            uint256 balances;
            for (uint256 i; i < 3; ++i) {
                balances += daily.balanceOf(handler.actors(i), id);
            }
            assertEq(balances, daily.totalSupply(id));
            assertEq(keccak256(abi.encode(daily.getIssue(id))), handler.issueCommitments(id));
            if (handler.closedRecorded(id)) assertEq(daily.totalSupply(id), handler.finalSupply(id));
        }
    }
}
