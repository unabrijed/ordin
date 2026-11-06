// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Fixed recurring payments. No custody, upgrade key, scheduler, or protocol fees.
contract Ordin is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Terms {
        address token;
        address spender;
        address recipient;
        uint256 amount;
        uint64 interval;
        uint64 start;
        uint64 expiry; // zero means no expiry; otherwise exclusive
    }

    struct Policy {
        address owner;
        Terms terms;
        uint256 lastPaidPeriodPlusOne;
        bool cancelled;
    }

    enum Status { Unknown, Scheduled, Collectible, Paid, Expired, Cancelled }

    bytes32 public constant CREATE_TYPEHASH = keccak256(
        "CreatePolicy(address owner,address token,address spender,address recipient,uint256 amount,uint64 interval,uint64 start,uint64 expiry,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant CANCEL_TYPEHASH = keccak256(
        "CancelPolicy(address owner,bytes32 policyId,uint256 nonce,uint256 deadline)"
    );

    mapping(bytes32 => Policy) private policies;
    /// @notice Shared sequential nonce for signed creation/cancellation. Direct creation also consumes it.
    mapping(address => uint256) public nonces;

    error InvalidTerms();
    error UnknownPolicy();
    error Unauthorized();
    error InvalidAuthorization();
    error AuthorizationExpired();
    error NotCollectible(Status status);
    error UnsupportedTokenTransfer();
    error AlreadyCancelled();

    event PolicyCreated(bytes32 indexed policyId, address indexed owner, address indexed spender, Terms terms);
    event PaymentCollected(bytes32 indexed policyId, uint256 indexed period, address indexed recipient, uint256 amount, bytes32 paymentReference);
    event PolicyCancelled(bytes32 indexed policyId, address indexed owner);
    event AuthorizationsInvalidated(address indexed owner, uint256 nextNonce);

    constructor() EIP712("Ordin", "1") {}

    function createPolicy(Terms calldata terms) external nonReentrant returns (bytes32) {
        uint256 nonce = nonces[msg.sender]++;
        return _create(msg.sender, terms, nonce);
    }

    /// @notice A relayer can pay for registration; token allowance is a separate prerequisite to collection.
    function createPolicyWithSignature(
        address owner, Terms calldata terms, uint256 nonce, uint256 deadline, bytes calldata signature
    ) external nonReentrant returns (bytes32) {
        bytes32 structHash = keccak256(abi.encode(
            CREATE_TYPEHASH, owner, terms.token, terms.spender, terms.recipient,
            terms.amount, terms.interval, terms.start, terms.expiry, nonce, deadline
        ));
        _authorize(owner, nonce, deadline, structHash, signature);
        return _create(owner, terms, nonce);
    }

    function cancelPolicy(bytes32 policyId) external nonReentrant {
        Policy storage policy = policies[policyId];
        if (policy.owner == address(0)) revert UnknownPolicy();
        if (policy.owner != msg.sender) revert Unauthorized();
        _cancel(policyId, policy);
    }

    /// @notice Anyone can relay an owner's cancellation without receiving spending authority.
    function cancelPolicyWithSignature(
        bytes32 policyId, uint256 nonce, uint256 deadline, bytes calldata signature
    ) external nonReentrant {
        Policy storage policy = policies[policyId];
        if (policy.owner == address(0)) revert UnknownPolicy();
        bytes32 structHash = keccak256(abi.encode(CANCEL_TYPEHASH, policy.owner, policyId, nonce, deadline));
        _authorize(policy.owner, nonce, deadline, structHash, signature);
        _cancel(policyId, policy);
    }

    /// @notice Invalidates signatures at the current nonce; does not cancel existing policies.
    function invalidateAuthorizations() external {
        emit AuthorizationsInvalidated(msg.sender, ++nonces[msg.sender]);
    }

    function collect(bytes32 policyId, bytes32 paymentReference) external nonReentrant {
        Policy storage policy = policies[policyId];
        if (policy.owner == address(0)) revert UnknownPolicy();
        if (msg.sender != policy.terms.spender) revert Unauthorized();
        (Status status, uint256 period,) = policyStatus(policyId);
        if (status != Status.Collectible) revert NotCollectible(status);

        policy.lastPaidPeriodPlusOne = period + 1;
        IERC20 token = IERC20(policy.terms.token);
        uint256 ownerBefore = token.balanceOf(policy.owner);
        uint256 recipientBefore = token.balanceOf(policy.terms.recipient);
        token.safeTransferFrom(policy.owner, policy.terms.recipient, policy.terms.amount);
        uint256 ownerAfter = token.balanceOf(policy.owner);
        uint256 recipientAfter = token.balanceOf(policy.terms.recipient);
        // Reject taxed/rebasing/nonstandard transfers: both parties must observe the exact amount.
        if (ownerAfter > ownerBefore || recipientAfter < recipientBefore
            || ownerBefore - ownerAfter != policy.terms.amount
            || recipientAfter - recipientBefore != policy.terms.amount) revert UnsupportedTokenTransfer();

        emit PaymentCollected(policyId, period, policy.terms.recipient, policy.terms.amount, paymentReference);
    }

    /// @notice Eligibility only; token balance/allowance and token restrictions can still prevent a transfer.
    /// @dev nextDueAt is zero for terminal or unknown policies; otherwise the next eligible window start.
    function policyStatus(bytes32 policyId) public view returns (Status status, uint256 period, uint256 nextDueAt) {
        Policy storage policy = policies[policyId];
        if (policy.owner == address(0)) return (Status.Unknown, 0, 0);
        if (policy.cancelled) return (Status.Cancelled, 0, 0);
        Terms storage terms = policy.terms;
        if (terms.expiry != 0 && block.timestamp >= terms.expiry) return (Status.Expired, 0, 0);
        if (block.timestamp < terms.start) return (Status.Scheduled, 0, terms.start);
        period = (block.timestamp - terms.start) / terms.interval;
        if (policy.lastPaidPeriodPlusOne == period + 1) {
            uint256 next = uint256(terms.start) + (period + 1) * terms.interval;
            return (Status.Paid, period, terms.expiry != 0 && next >= terms.expiry ? 0 : next);
        }
        return (Status.Collectible, period, uint256(terms.start) + period * terms.interval);
    }

    function getPolicy(bytes32 policyId) external view returns (Policy memory) {
        if (policies[policyId].owner == address(0)) revert UnknownPolicy();
        return policies[policyId];
    }

    function _create(address owner, Terms calldata terms, uint256 nonce) private returns (bytes32 policyId) {
        if (owner == address(0) || terms.token.code.length == 0 || terms.spender == address(0)
            || terms.recipient == address(0) || terms.recipient == owner || terms.amount == 0
            || terms.interval == 0 || (terms.expiry != 0 && (terms.expiry <= terms.start || terms.expiry <= block.timestamp))) {
            revert InvalidTerms();
        }
        policyId = keccak256(abi.encode(owner, nonce));
        policies[policyId] = Policy(owner, terms, 0, false);
        emit PolicyCreated(policyId, owner, terms.spender, terms);
    }

    function _cancel(bytes32 policyId, Policy storage policy) private {
        if (policy.cancelled) revert AlreadyCancelled();
        policy.cancelled = true;
        emit PolicyCancelled(policyId, policy.owner);
    }

    function _authorize(address owner, uint256 nonce, uint256 deadline, bytes32 structHash, bytes calldata signature) private {
        if (block.timestamp > deadline) revert AuthorizationExpired();
        if (owner == address(0) || nonce != nonces[owner]
            || !SignatureChecker.isValidSignatureNow(owner, _hashTypedDataV4(structHash), signature)) {
            revert InvalidAuthorization();
        }
        nonces[owner] = nonce + 1;
    }
}
