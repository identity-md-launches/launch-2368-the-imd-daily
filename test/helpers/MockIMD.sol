// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Test-only payment token installed at IMD's address on the local EVM.
contract MockIMD is ERC20 {
    enum Mode {
        Normal,
        FalseReturn,
        NoReturn,
        Fee,
        NoMovement,
        RevertCall,
        SenderFee
    }

    Mode public fromMode;
    Mode public outMode;
    bool public badDecimals;
    address public callbackTarget;
    bytes public callbackData;
    bool public callbackSucceeded;
    bytes public callbackResult;

    constructor() ERC20("Mock IMD", "IMD") {}

    function decimals() public view override returns (uint8) {
        return badDecimals ? 6 : 18;
    }

    function fund(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function setModes(Mode from, Mode out) external {
        fromMode = from;
        outMode = out;
    }

    function setBadDecimals(bool value) external {
        badDecimals = value;
    }

    function setCallback(address target, bytes calldata data) external {
        callbackTarget = target;
        callbackData = data;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (fromMode == Mode.NoMovement) return true;
        super.transferFrom(from, to, amount);
        if (fromMode == Mode.SenderFee) _burn(from, amount / 10);
        if (callbackTarget != address(0)) {
            (callbackSucceeded, callbackResult) = callbackTarget.call(callbackData);
        }
        return _finish(fromMode, to, amount);
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (outMode == Mode.NoMovement) return true;
        super.transfer(to, amount);
        if (outMode == Mode.SenderFee) _burn(msg.sender, amount / 10);
        if (callbackTarget != address(0)) {
            (callbackSucceeded, callbackResult) = callbackTarget.call(callbackData);
        }
        return _finish(outMode, to, amount);
    }

    function _finish(Mode mode, address to, uint256 amount) private returns (bool) {
        if (mode == Mode.FalseReturn) return false;
        if (mode == Mode.RevertCall) revert("mock payment rejected");
        if (mode == Mode.Fee) _burn(to, amount / 10);
        if (mode == Mode.NoReturn) {
            assembly ("memory-safe") {
                return(0, 0)
            }
        }
        return true;
    }
}

