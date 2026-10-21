// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IMDDaily} from "../src/IMDDaily.sol";
import {IMDDailyVault} from "../src/IMDDailyVault.sol";

/// @dev Rehearses the launch's CREATE2 dependency order in a single factory call.
contract FactoryRehearsal {
    function deploy(bytes32 vaultSalt, bytes32 dailySalt)
        external
        returns (IMDDailyVault vault, IMDDaily daily)
    {
        vault = IMDDailyVault(_deploy(type(IMDDailyVault).creationCode, vaultSalt));
        daily = IMDDaily(
            _deploy(abi.encodePacked(type(IMDDaily).creationCode, abi.encode(address(vault))), dailySalt)
        );
    }

    function _deploy(bytes memory initcode, bytes32 salt) private returns (address deployed) {
        assembly ("memory-safe") {
            deployed := create2(0, add(initcode, 32), mload(initcode), salt)
        }
        require(deployed != address(0), "constructor failed");
    }
}

contract DeploymentTest is Test {
    address internal constant PUBLISHER = 0x48E4E74fE1d0c14404cEB57B9fec5b21329C6ec9;

    function test_factoryDeploymentOnEmptyChainNeedsNoExternalContractOrSetup() public {
        vm.etch(0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7, "");
        FactoryRehearsal factory = new FactoryRehearsal();
        vm.prank(makeAddr("launch transaction sender"));
        (IMDDailyVault vault, IMDDaily daily) = factory.deploy(keccak256("vault"), keccak256("daily"));
        assertEq(vault.owner(), PUBLISHER);
        assertEq(daily.owner(), PUBLISHER);
        assertNotEq(daily.owner(), address(factory));
        assertEq(address(daily.vault()), address(vault));
        assertEq(daily.issueCount(), 0);
        assertEq(daily.totalSupply(), 0);
        assertEq(daily.totalCollected(), 0);
        assertEq(vault.totalWithdrawn(), 0);
        _checkRuntime(address(daily));
        _checkRuntime(address(vault));
        assertLe(type(IMDDaily).creationCode.length + 32, 49152);
        assertLe(type(IMDDailyVault).creationCode.length, 49152);
    }

    function test_constructorAcceptsStaticDependencyBeforeCodeExists() public {
        address futureVault = makeAddr("future vault address for constructor rehearsal");
        assertEq(futureVault.code.length, 0);
        IMDDaily daily = new IMDDaily(futureVault);
        assertEq(address(daily.vault()), futureVault);
        assertEq(daily.owner(), PUBLISHER);
    }

    function test_constructorRejectsInvalidVaultAddresses() public {
        vm.expectRevert(IMDDaily.InvalidVault.selector);
        new IMDDaily(address(0));
        vm.expectRevert(IMDDaily.InvalidVault.selector);
        new IMDDaily(PUBLISHER);
        vm.expectRevert(IMDDaily.InvalidVault.selector);
        new IMDDaily(0xD34a99Bc0f67aE1bbd63C660e6d0b0dd03E263B7);
    }

    function _checkRuntime(address deployed) private view {
        bytes memory code = deployed.code;
        assertGt(code.length, 0);
        assertLe(code.length, 24576);
        bool reachable = true;
        for (uint256 i; i < code.length; ++i) {
            uint8 op = uint8(code[i]);
            if (op == 0x5b) reachable = true;
            if (op >= 0x60 && op <= 0x7f) {
                i += op - 0x5f;
                continue;
            }
            if (reachable) {
                assertTrue(op != 0xf4 && op != 0xf2 && op != 0xff, "forbidden escape opcode");
                assertTrue(op != 0xf0 && op != 0xf5, "application cannot create hidden contracts");
            }
            if (op == 0x00 || op == 0x56 || op == 0xf3 || op == 0xfd || op == 0xfe || op == 0xff) {
                reachable = false;
            }
        }
    }
}

