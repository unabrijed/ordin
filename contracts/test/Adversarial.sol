// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Ordin} from "../Ordin.sol";

contract ReentrantToken is ERC20 {
    Ordin private target;
    bytes32 private policyId;
    bool public reentrySucceeded;
    constructor() ERC20("Adversarial", "BAD") {}
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function attack(Ordin ordin, bytes32 id) external {
        target = ordin;
        policyId = id;
        ordin.collect(id, bytes32(0));
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        (bool success,) = address(target).call(abi.encodeCall(Ordin.collect, (policyId, bytes32(0))));
        reentrySucceeded = success;
        return super.transferFrom(from, to, amount);
    }
}

/// @dev Minimal ERC-1271 wallet fixture, never a production wallet implementation.
contract TestWallet {
    address public immutable signer;
    constructor(address signer_) { signer = signer_; }
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return ECDSA.recover(hash, signature) == signer ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }
}
