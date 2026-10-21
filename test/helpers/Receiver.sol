// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IMDDaily} from "../../src/IMDDaily.sol";

contract Receiver is ERC1155Holder {
    enum Action {
        Accept,
        Reject,
        WrongSelector,
        Reenter,
        ReenterAndBubble,
        TransferOnReceipt,
        CallTarget,
        CallTargetAndReject
    }

    IMDDaily public immutable daily;
    Action public action;
    address public target;
    bytes public targetData;
    bool public callbackSucceeded;
    bytes public callbackResult;
    uint256 public observedSupply;
    uint256 public observedRevenue;
    uint256 public observedVaultBalance;

    constructor(IMDDaily daily_) {
        daily = daily_;
    }

    function configure(Action action_, address target_, bytes calldata targetData_) external {
        action = action_;
        target = target_;
        targetData = targetData_;
    }

    function buy(uint256 id, uint256 quantity) external {
        IERC20(daily.PAYMENT_TOKEN()).approve(address(daily), daily.PRICE() * quantity);
        daily.mint(id, quantity, address(this), block.timestamp);
    }

    function onERC1155Received(address, address, uint256 id, uint256 quantity, bytes memory)
        public
        override
        returns (bytes4)
    {
        observedSupply = daily.totalSupply(id);
        observedRevenue = daily.totalCollected();
        observedVaultBalance = daily.vault().balance();
        if (action == Action.Reject) revert("receiver rejected");
        if (action == Action.WrongSelector) return bytes4(0);
        if (action == Action.Reenter || action == Action.ReenterAndBubble) {
            (callbackSucceeded, callbackResult) = address(daily)
                .call(abi.encodeCall(daily.mint, (id, quantity, address(this), block.timestamp)));
            if (action == Action.ReenterAndBubble && !callbackSucceeded) {
                bytes memory reason = callbackResult;
                assembly ("memory-safe") {
                    revert(add(reason, 32), mload(reason))
                }
            }
        }
        if (action == Action.TransferOnReceipt) {
            daily.safeTransferFrom(address(this), target, id, quantity, "");
        }
        if (action == Action.CallTarget || action == Action.CallTargetAndReject) {
            (callbackSucceeded, callbackResult) = target.call(targetData);
            if (action == Action.CallTargetAndReject) {
                require(callbackSucceeded, "callback did not succeed");
                revert("receiver rejected after callback");
            }
        }
        return this.onERC1155Received.selector;
    }
}

