// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DailyBehavior} from "./DailyBehavior.sol";
import {stdError} from "forge-std/StdError.sol";
import {MockIMD} from "./helpers/MockIMD.sol";
import {IMDDaily} from "../src/IMDDaily.sol";
import {IMDDailyVault} from "../src/IMDDailyVault.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract IMDDailyTest is DailyBehavior {
    MockIMD internal mock;

    function _configureToken() internal override {
        MockIMD implementation = new MockIMD();
        vm.etch(IMD, address(implementation).code);
        mock = MockIMD(IMD);
    }

    function test_falseReturnPaymentRollsBackEvenAfterTokenMoved() public {
        uint256 id = _publish(0);
        mock.setModes(MockIMD.Mode.FalseReturn, MockIMD.Mode.Normal);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, IMD));
        _buy(alice, id, 1, alice);
        assertEq(token.balanceOf(alice), 1000 ether);
        assertEq(token.allowance(alice, address(daily)), 1000 ether);
        assertEq(daily.totalSupply(id), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.balance(), 0);
    }

    function test_paymentFailureModesAreAtomic() public {
        uint256 id = _publish(0);
        MockIMD.Mode[4] memory modes =
            [MockIMD.Mode.Fee, MockIMD.Mode.NoMovement, MockIMD.Mode.RevertCall, MockIMD.Mode.SenderFee];
        for (uint256 i; i < modes.length; ++i) {
            mock.setModes(modes[i], MockIMD.Mode.Normal);
            vm.expectRevert();
            _buy(alice, id, 2, alice);
            assertEq(token.balanceOf(alice), 1000 ether);
            assertEq(token.allowance(alice, address(daily)), 1000 ether);
            assertEq(daily.totalSupply(id), 0);
            assertEq(daily.totalCollected(), 0);
            assertEq(vault.balance(), 0);
        }
    }

    function test_noReturnTokenIsSupportedForPaymentAndWithdrawal() public {
        uint256 id = _publish(0);
        mock.setModes(MockIMD.Mode.NoReturn, MockIMD.Mode.NoReturn);
        _buy(alice, id, 2, alice);
        vm.prank(PUBLISHER);
        vault.withdraw(PRICE);
        assertEq(daily.totalSupply(id), 2);
        assertEq(daily.totalCollected(), 2 * PRICE);
        assertEq(vault.balance(), PRICE);
        assertEq(vault.totalWithdrawn(), PRICE);
        assertEq(token.balanceOf(PUBLISHER), PRICE);
    }

    function test_withdrawalFailureModesRollbackCountersAndBalances() public {
        uint256 id = _publish(0);
        _buy(alice, id, 3, alice);
        MockIMD.Mode[5] memory modes = [
            MockIMD.Mode.FalseReturn,
            MockIMD.Mode.Fee,
            MockIMD.Mode.NoMovement,
            MockIMD.Mode.RevertCall,
            MockIMD.Mode.SenderFee
        ];
        for (uint256 i; i < modes.length; ++i) {
            mock.setModes(MockIMD.Mode.Normal, modes[i]);
            vm.expectRevert();
            vm.prank(PUBLISHER);
            vault.withdraw(PRICE);
            assertEq(vault.balance(), 3 * PRICE);
            assertEq(vault.totalWithdrawn(), 0);
            assertEq(token.balanceOf(PUBLISHER), 0);
        }
    }

    function test_wrongDecimalsFailBeforeTakingPayment() public {
        uint256 id = _publish(0);
        mock.setBadDecimals(true);
        vm.expectRevert(IMDDaily.PaymentDecimalsMismatch.selector);
        _buy(alice, id, 1, alice);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.balance(), 0);
    }

    function test_paymentTokenCallbackCannotReenterMint() public {
        uint256 id = _publish(0);
        mock.setCallback(address(daily), abi.encodeCall(daily.mint, (id, 1, alice, opened)));
        _buy(alice, id, 2, alice);
        assertFalse(mock.callbackSucceeded());
        assertEq(
            mock.callbackResult(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(daily.totalSupply(id), 2);
        assertEq(vault.balance(), 2 * PRICE);
    }

    function testFuzz_quoteOverflow(uint256 quantity) public {
        quantity = bound(quantity, type(uint256).max / PRICE + 1, type(uint256).max);
        vm.expectRevert(stdError.arithmeticError);
        daily.quote(quantity);
    }

    function test_zeroQuoteRejected() public {
        vm.expectRevert(IMDDaily.ZeroQuantity.selector);
        daily.quote(0);
    }

    function test_missingOrMismatchedVaultFailsAtUse() public {
        address missingVault = makeAddr("vault without code");
        daily = new IMDDaily(missingVault);
        uint256 id = _publish(0);
        vm.expectRevert();
        _buy(alice, id, 1, alice);
        assertEq(daily.totalCollected(), 0);

        daily = new IMDDaily(address(vault));
        id = _publish(0);
        vm.mockCall(address(vault), abi.encodeCall(vault.PUBLISHER, ()), abi.encode(alice));
        vm.expectRevert(IMDDaily.InvalidVault.selector);
        _buy(alice, id, 1, alice);
        vm.clearMockedCalls();
        vm.mockCall(address(vault), abi.encodeCall(vault.PAYMENT_TOKEN, ()), abi.encode(alice));
        vm.expectRevert(IMDDaily.InvalidVault.selector);
        _buy(alice, id, 1, alice);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.balance(), 0);
    }

    function test_withdrawalTokenCallbackCannotReenter() public {
        uint256 id = _publish(0);
        _buy(alice, id, 3, alice);
        mock.setCallback(address(vault), abi.encodeCall(vault.withdraw, (PRICE)));
        vm.prank(PUBLISHER);
        vault.withdraw(PRICE);
        assertFalse(mock.callbackSucceeded());
        assertEq(
            mock.callbackResult(),
            abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector)
        );
        assertEq(vault.totalWithdrawn(), PRICE);
        assertEq(vault.balance(), 2 * PRICE);
    }

    function test_noTokenCodeFailsClosed() public {
        uint256 id = _publish(0);
        vm.etch(IMD, "");
        vm.expectRevert();
        _buy(alice, id, 1, alice);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.totalCollected(), 0);
    }
}

