// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Local test fixture only. Not a substitute for Whitechain USDT.
contract TestToken is ERC20 {
    bool public failTransfers;
    bool public chargeFee;
    constructor() ERC20("Test Dollar", "TEST") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setFailure(bool value) external { failTransfers = value; }
    function setFee(bool value) external { chargeFee = value; }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (failTransfers) return false;
        bool result = super.transferFrom(from, to, amount);
        if (chargeFee) _burn(to, 1);
        return result;
    }
}
