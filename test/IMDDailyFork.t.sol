// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {DailyBehavior} from "./DailyBehavior.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @dev No network or environment reads in the default suite. Opt in using forge test --fork-url.
///      Only local fork balances are changed; no transaction is ever broadcast.
contract IMDDailyForkTest is DailyBehavior {
    function _configureToken() internal override {
        try vm.activeFork() returns (uint256) {}
        catch {
            vm.skip(true);
        }
        assertEq(block.chainid, 1, "fork must be Ethereum mainnet");
        assertGt(IMD.code.length, 0, "real IMD is required");
        assertEq(IERC20Metadata(IMD).decimals(), 18);
        assertEq(IERC20Metadata(IMD).symbol(), "IMD");
    }
}
