// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {IMDDaily} from "../src/IMDDaily.sol";
import {IMDDailyVault} from "../src/IMDDailyVault.sol";
import {MockIMD} from "./helpers/MockIMD.sol";
import {Receiver} from "./helpers/Receiver.sol";

/// @dev Drives mint with arbitrary, often invalid, arguments and checks the outcome against an
///      independent model of the brief: success iff the issue exists, start <= now < close,
///      quantity > 0, recipient accepts, now <= deadline, and balance and allowance cover the price.
///      Every call is low-level so a wrong outcome is an assertion, never a silent revert.
contract DailyModelHandler is Test {
    address internal constant PUBLISHER = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9;
    uint256 internal constant PRICE = 1e17;
    uint256 internal constant WINDOW = 86_400;

    IMDDaily public immutable daily;
    IMDDailyVault public immutable vault;
    MockIMD public immutable token;

    address[4] public actors;
    Receiver public rejecting;
    Receiver public reentrant;

    // Ghosts.
    uint256 public ghostIssues;
    uint256 public ghostCollected;
    uint256 public ghostCopies;
    uint256 public ghostVaultDonations;
    uint256 public ghostCollectionDonations;
    uint256 public ghostWithdrawn;
    uint256 public ghostFunded;
    mapping(uint256 id => uint256) public ghostSupply;
    mapping(uint256 id => uint256) public ghostPublishedAt;
    mapping(address payer => uint256) public ghostSpent;
    mapping(address payer => uint256) public ghostReceived;
    uint256 public successfulMints;
    uint256 public rejectedMints;

    constructor(IMDDaily daily_, IMDDailyVault vault_, MockIMD token_) {
        daily = daily_;
        vault = vault_;
        token = token_;
        actors = [makeAddr("model 1"), makeAddr("model 2"), makeAddr("model 3"), makeAddr("model 4")];
        rejecting = new Receiver(daily_);
        rejecting.configure(Receiver.Action.Reject, address(0), "");
        reentrant = new Receiver(daily_);
        reentrant.configure(Receiver.Action.Reenter, address(0), "");
        token.fund(address(reentrant), 1000 ether); // Lets its reentrant mint reach the guard.
        for (uint256 i; i < actors.length; ++i) {
            token.fund(actors[i], 300 ether);
            ghostFunded += 300 ether;
            vm.prank(actors[i]);
            token.approve(address(daily), 250 ether);
        }
    }

    function _content(uint256 seed) internal pure returns (IMDDaily.IssueInput memory c) {
        c = IMDDaily.IssueInput({
            title: "Model issue",
            editorialDate: seed,
            pdfURL: "https://test.invalid/model.pdf",
            coverURL: "https://test.invalid/model.png",
            metadataURI: "https://test.invalid/model.json",
            pdfHash: keccak256(abi.encode("pdf", seed)),
            coverHash: keccak256(abi.encode("cover", seed)),
            metadataHash: keccak256(abi.encode("metadata", seed))
        });
    }

    function publish(uint256 seed, uint256 callerSeed, uint8 corrupt) external {
        IMDDaily.IssueInput memory c = _content(seed);
        corrupt = uint8(bound(corrupt, 0, 20)); // 0..6 corrupt one field, 7..20 valid.
        if (corrupt == 0) c.title = "";
        if (corrupt == 1) c.pdfURL = "";
        if (corrupt == 2) c.coverURL = "";
        if (corrupt == 3) c.metadataURI = "";
        if (corrupt == 4) c.pdfHash = 0;
        if (corrupt == 5) c.coverHash = 0;
        if (corrupt == 6) c.metadataHash = 0;
        address caller = callerSeed % 3 == 0 ? actors[callerSeed % 4] : PUBLISHER;
        bool expectOk = caller == PUBLISHER && corrupt > 6;
        vm.prank(caller);
        (bool ok, bytes memory ret) = address(daily).call(abi.encodeCall(daily.createIssue, (c)));
        assertEq(ok, expectOk, "publication outcome differs from model");
        if (ok) {
            ++ghostIssues;
            assertEq(abi.decode(ret, (uint256)), ghostIssues, "issue ids must be sequential");
            ghostPublishedAt[ghostIssues] = vm.getBlockTimestamp();
        }
    }

    function fund(uint256 actorSeed, uint256 amount, uint256 allowance) external {
        address actor = actors[actorSeed % 4];
        amount = bound(amount, 0, 500 ether);
        token.fund(actor, amount);
        ghostFunded += amount;
        vm.prank(actor);
        token.approve(address(daily), bound(allowance, 0, 1000 ether));
    }

    struct MintCall {
        address payer;
        uint256 id;
        uint256 quantity;
        address recipient;
        uint256 deadline;
        uint256 cost;
        bool expectOk;
    }

    /// @dev Several consecutive mints in one step: repeat purchases of the same open issue.
    function mintBurst(uint256 seed) external {
        for (uint256 i; i < 3; ++i) {
            mint(seed, i, seed >> 8, seed >> 16, seed >> 24);
        }
    }

    function mint(
        uint256 payerSeed,
        uint256 idSeed,
        uint256 quantitySeed,
        uint256 recipientSeed,
        uint256 deadlineSeed
    ) public {
        // Seeds are mixed so dictionary-biased inputs (often 0) still spread over every branch.
        uint256 h =
            uint256(keccak256(abi.encode(payerSeed, idSeed, quantitySeed, recipientSeed, deadlineSeed)));
        MintCall memory m;
        m.payer = actors[h % 4];
        // Mostly the latest issues; sometimes 0, an unpublished id, or any older issue.
        uint256 pick = (h >> 8) % 8;
        m.id = pick == 0
            ? 0
            : pick == 1
                ? ghostIssues + 1
                : pick == 2
                    ? bound(h >> 16, 0, ghostIssues + 1)
                    : ghostIssues - (ghostIssues == 0 ? 0 : pick % 2);
        uint256 q = (h >> 24) % 10;
        m.quantity = q == 0 ? 0 : q == 1 ? bound(h >> 32, 1, 20_000) : bound(h >> 32, 1, 100);
        uint256 r = (h >> 64) % 8;
        m.recipient =
            r < 5 ? actors[r % 4] : r == 5 ? address(0) : r == 6 ? address(rejecting) : address(reentrant);
        uint256 nowTs = vm.getBlockTimestamp();
        m.deadline = (h >> 72) % 8 == 0 ? nowTs - bound(h >> 80, 1, nowTs) : nowTs + ((h >> 80) % 3 days);
        m.cost = m.quantity * PRICE;
        bool open = m.id >= 1 && m.id <= ghostIssues && nowTs >= ghostPublishedAt[m.id]
            && nowTs < ghostPublishedAt[m.id] + WINDOW;
        m.expectOk = open && m.quantity > 0 && m.recipient != address(0) && m.recipient != address(rejecting)
            && nowTs <= m.deadline && token.balanceOf(m.payer) >= m.cost
            && token.allowance(m.payer, address(daily)) >= m.cost;
        _executeMint(m);
    }

    function _executeMint(MintCall memory m) internal {
        uint256 payerBefore = token.balanceOf(m.payer);
        uint256 vaultBefore = token.balanceOf(address(vault));
        vm.prank(m.payer);
        (bool ok,) =
            address(daily).call(abi.encodeCall(daily.mint, (m.id, m.quantity, m.recipient, m.deadline)));
        assertEq(ok, m.expectOk, "mint outcome differs from model");
        if (ok) {
            ++successfulMints;
            ghostCollected += m.cost;
            ghostCopies += m.quantity;
            ghostSupply[m.id] += m.quantity;
            ghostSpent[m.payer] += m.cost;
            ghostReceived[m.recipient] += m.quantity;
            assertEq(payerBefore - token.balanceOf(m.payer), m.cost, "payer debit");
            assertEq(token.balanceOf(address(vault)) - vaultBefore, m.cost, "vault credit");
        } else {
            ++rejectedMints;
            assertEq(token.balanceOf(m.payer), payerBefore, "failed mint moved payer funds");
            assertEq(token.balanceOf(address(vault)), vaultBefore, "failed mint moved vault funds");
        }
    }

    /// @dev Small steps, or a jump to one second before, at, or after the latest issue's close.
    function warp(uint256 secondsSeed) external {
        uint256 nowTs = vm.getBlockTimestamp();
        uint256 target = nowTs + bound(secondsSeed, 0, 6 hours);
        if (secondsSeed % 4 == 0 && ghostIssues > 0) {
            uint256 edge = ghostPublishedAt[ghostIssues] + WINDOW - 1 + secondsSeed % 3;
            if (edge > nowTs) target = edge;
        }
        vm.warp(target);
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 idSeed, uint256 amountSeed) external {
        if (ghostIssues == 0) return;
        address from = actors[fromSeed % 4];
        address to = actors[toSeed % 4];
        uint256 id = bound(idSeed, 1, ghostIssues);
        uint256 held = daily.balanceOf(from, id);
        uint256 amount = bound(amountSeed, 0, held + 1);
        vm.prank(from);
        (bool ok,) = address(daily).call(abi.encodeCall(daily.safeTransferFrom, (from, to, id, amount, "")));
        assertEq(ok, amount <= held, "transfer outcome");
        if (ok) {
            ghostReceived[from] -= amount;
            ghostReceived[to] += amount;
        }
    }

    function donate(uint256 actorSeed, uint256 amountSeed, bool toCollection) external {
        address actor = actors[actorSeed % 4];
        uint256 held = token.balanceOf(actor);
        if (held == 0) return;
        uint256 amount = bound(amountSeed, 1, held);
        vm.prank(actor);
        token.transfer(toCollection ? address(daily) : address(vault), amount);
        ghostSpent[actor] += amount;
        if (toCollection) ghostCollectionDonations += amount;
        else ghostVaultDonations += amount;
    }

    function withdraw(uint256 amountSeed, uint256 callerSeed) external {
        uint256 available = token.balanceOf(address(vault));
        uint256 amount = bound(amountSeed, 0, available + 1);
        address caller = callerSeed % 4 == 0 ? actors[callerSeed % 4] : PUBLISHER;
        bool expectOk = caller == PUBLISHER && amount > 0 && amount <= available;
        vm.prank(caller);
        (bool ok,) = address(vault).call(abi.encodeCall(vault.withdraw, (amount)));
        assertEq(ok, expectOk, "withdraw outcome differs from model");
        if (ok) ghostWithdrawn += amount;
    }

    function actorCount() external pure returns (uint256) {
        return 4;
    }
}

contract DailyModelInvariantTest is StdInvariant, Test {
    address internal constant PUBLISHER = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9;
    address internal constant IMD = 0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7;

    IMDDaily internal daily;
    IMDDailyVault internal vault;
    MockIMD internal token;
    DailyModelHandler internal handler;

    function setUp() public {
        MockIMD implementation = new MockIMD();
        vm.etch(IMD, address(implementation).code);
        token = MockIMD(IMD);
        vault = new IMDDailyVault();
        daily = new IMDDaily(address(vault));
        handler = new DailyModelHandler(daily, vault, token);
        bytes4[] memory selectors = new bytes4[](8);
        selectors[0] = handler.publish.selector;
        selectors[1] = handler.fund.selector;
        selectors[2] = handler.mint.selector;
        selectors[3] = handler.warp.selector;
        selectors[4] = handler.transfer.selector;
        selectors[5] = handler.donate.selector;
        selectors[6] = handler.withdraw.selector;
        selectors[7] = handler.mintBurst.selector;
        targetSelector(FuzzSelector(address(handler), selectors));
        targetContract(address(handler));
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 64
    function invariant_vaultHoldsExactlyRevenuePlusDonationsMinusWithdrawals() public view {
        assertEq(daily.totalCollected(), handler.ghostCollected());
        assertEq(daily.totalCollected(), handler.ghostCopies() * daily.PRICE());
        assertEq(vault.totalWithdrawn(), handler.ghostWithdrawn());
        assertEq(
            token.balanceOf(address(vault)),
            handler.ghostCollected() + handler.ghostVaultDonations() - handler.ghostWithdrawn()
        );
        assertEq(vault.balance(), token.balanceOf(address(vault)));
        assertEq(token.balanceOf(PUBLISHER), handler.ghostWithdrawn(), "only the publisher is paid");
        assertEq(
            token.balanceOf(address(daily)),
            handler.ghostCollectionDonations(),
            "collection never keeps revenue"
        );
        assertLe(vault.totalWithdrawn(), daily.totalCollected() + handler.ghostVaultDonations());
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 64
    function invariant_payersLoseExactlyWhatTheyPaid() public view {
        uint256 held;
        for (uint256 i; i < handler.actorCount(); ++i) {
            address actor = handler.actors(i);
            held += token.balanceOf(actor);
        }
        uint256 spent;
        for (uint256 i; i < handler.actorCount(); ++i) {
            spent += handler.ghostSpent(handler.actors(i));
        }
        assertEq(held + spent, handler.ghostFunded());
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 64
    function invariant_issuesSupplyAndWindowsMatchModel() public view {
        assertEq(daily.issueCount(), handler.ghostIssues());
        assertFalse(daily.issueExists(0));
        assertFalse(daily.issueExists(handler.ghostIssues() + 1));
        uint256 total;
        uint256 nowTs = block.timestamp;
        for (uint256 id = 1; id <= handler.ghostIssues(); ++id) {
            IMDDaily.Issue memory issue = daily.getIssue(id);
            assertEq(issue.publishedAt, handler.ghostPublishedAt(id));
            assertEq(issue.closesAt, issue.publishedAt + 86_400);
            assertEq(issue.content.pdfHash, keccak256(abi.encode("pdf", issue.content.editorialDate)));
            assertEq(daily.totalSupply(id), handler.ghostSupply(id));
            assertEq(daily.isAvailable(id), nowTs >= issue.publishedAt && nowTs < issue.closesAt);
            total += daily.totalSupply(id);
        }
        assertEq(daily.totalSupply(), total);
        assertEq(daily.totalSupply(), handler.ghostCopies());
    }

    /// forge-config: default.invariant.runs = 256
    /// forge-config: default.invariant.depth = 64
    function invariant_copiesAreHeldOnlyByThoseWhoReceivedThem() public view {
        address[6] memory holders = [
            handler.actors(0),
            handler.actors(1),
            handler.actors(2),
            handler.actors(3),
            address(handler.reentrant()),
            address(handler.rejecting())
        ];
        uint256 sum;
        for (uint256 id = 1; id <= handler.ghostIssues(); ++id) {
            for (uint256 h; h < holders.length; ++h) {
                sum += daily.balanceOf(holders[h], id);
            }
        }
        assertEq(sum, daily.totalSupply());
        for (uint256 h; h < holders.length; ++h) {
            uint256 owned;
            for (uint256 id = 1; id <= handler.ghostIssues(); ++id) {
                owned += daily.balanceOf(holders[h], id);
            }
            assertEq(owned, handler.ghostReceived(holders[h]));
        }
        assertEq(handler.ghostReceived(address(handler.rejecting())), 0);
    }
}
