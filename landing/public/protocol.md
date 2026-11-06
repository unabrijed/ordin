# Ordin

**Your terms. Every payment.**

Ordin is a recurring-payment protocol for EVM wallets, targeting Whitechain. It lets a wallet owner authorize recurring token payments while retaining control of their funds and the ability to cancel future collections.

**Status:** Local prototype implemented: Solidity contract, TypeScript SDK, executable demo, and local EVM tests. Not deployed to Whitechain or audited. Live USDT compatibility and gasless initial token approval remain unverified.

## Run locally

Use Node.js 22.14+ (an even-numbered LTS release is recommended) and Yarn Classic 1.22.22.

```sh
yarn install --frozen-lockfile
yarn compile
yarn typecheck
yarn test
yarn demo
```

The demo deploys to an ephemeral, in-process Hardhat EVM. It uses deterministic public test keys and a local test token; no wallet secrets, faucet funds, RPC service, or external accounts are required. Never fund these test keys on a public network.

The demo approves a finite token allowance, registers an owner-signed policy through a separate relayer, collects two payments, rejects a third payment with insufficient funds, and relays cancellation. The initial token approval is paid by the customer in this example. Registration, renewal, and cancellation are paid by their submitting accounts.

To run the separate read-only live-network check:

```sh
yarn verify:network
# Optional alternative RPC:
WHITECHAIN_RPC_URL=https://your-rpc.example yarn verify:network
```

No `.env` file is loaded automatically. Supply overrides through your shell environment. This command sends no transactions. Successful `nonces` and `DOMAIN_SEPARATOR` reads alone do not prove that the token supports a working permit implementation.

## The problem

Recurring payments need more than a token allowance. An allowance alone does not express a billing schedule, fixed payment amount, approved recipient, or subscription expiry.

Customers need to authorize recurring payments without signing every renewal. Businesses need to collect those payments reliably, within rules the customer controls.

Ordin makes those rules enforceable onchain.

## What Ordin does

A wallet owner creates a payment policy specifying:

| Term | Meaning |
|---|---|
| Owner | The wallet funding the payments |
| Token | The token that may be collected |
| Spender | The address authorized to execute collections |
| Recipient | The address that receives payment |
| Amount | The fixed amount collected per billing period |
| Interval | The duration of each billing period |
| Start time | When collection becomes permitted |
| Expiry | An optional deadline after which collection is prohibited |

Once authorized, the spender can collect a payment when the policy permits it. The owner does not need to sign each renewal or keep an application open.

Funds remain in the owner's wallet until a collection succeeds.

## Example

A customer authorizes:

> Pay 5 USDT to a particular merchant once every 30 days, starting today, until the policy expires or I cancel it.

The authorized spender can collect exactly 5 USDT during each eligible period.

The contract prevents the spender from:

- Taking a different amount.
- Redirecting payment to another recipient.
- Collecting before the policy starts.
- Collecting twice for the same billing period.
- Collecting after expiry or confirmed cancellation.

Changing the payment terms requires a new owner authorization.

## Payment lifecycle

```text
Authorize token access
        ↓
Create payment policy
        ↓
Spender requests collection
        ↓
Contract checks policy and billing period
        ↓
Tokens move directly from owner to recipient
        ↓
Payment event is emitted
        ↓
Repeat in a subsequent billing period
```

The owner can cancel the policy to stop future collections.

**Token access and payment permission are separate.** The token allowance lets the Ordin contract transfer tokens. The policy restricts when, how much, and to whom the contract may transfer them.

A token allowance alone does not authorize an Ordin payment.

## Billing behavior

The first release supports fixed recurring payments.

- Billing periods are fixed-duration windows anchored to the policy's start time.
- “Every 30 days” means a fixed 30-day interval, rather than a calendar-month schedule.
- Each policy permits one successful collection per period.
- Collection transfers the full configured amount.
- Unpaid periods do not accumulate into arrears.
- Failed collections do not consume the current period's payment entitlement.
- Retrying a failed collection is allowed while that period remains eligible.
- A cancelled policy cannot be reactivated; continuing payments requires a new policy.

The protocol enforces payment eligibility. It does not decide whether a merchant should grant access to a service.

## Who triggers payments?

Contracts do not wake themselves up on a schedule.

The authorized spender submits a collection transaction. This may be a merchant's backend, an automation service, or a script using the Ordin SDK.

Ordin's first release supplies the contract and SDK. Operating a hosted scheduler, notification system, or retry service is outside this release.

## Gas and sponsorship

The account submitting a collection transaction pays its network fee. This allows merchants or their designated automation accounts to pay for renewals without requiring the customer to submit a transaction each time.

The desired setup experience is also gasless for the customer.

Gasless token approval depends on capabilities of the actual payment token, such as signed approvals. Signing an Ordin policy does not independently grant access to tokens.

**Whitechain USDT's signed-approval support remains unverified.** Fully gasless onboarding will not be advertised as implemented until it has been demonstrated with the required token. Owner-signed policy registration and cancellation are implemented using EIP-712 and can be submitted by a separate gas-paying account. These operations do not grant token allowance.

## Architecture

| Component | Responsibility |
|---|---|
| Solidity policy contract | Store policies, authenticate authorization, enforce collection rules, transfer tokens, and handle cancellation |
| TypeScript SDK | Prepare policy operations, read status, simulate collections, submit transactions, and decode events |
| Example scripts | Demonstrate authorization, collection, renewal, failed collection, and cancellation |
| Test suite | Verify payment rules, token interactions, authorization, and lifecycle behavior |

The contract is non-upgradeable, with no administrator mechanism to redirect customer funds or rewrite their payment terms. It uses OpenZeppelin's token-transfer, signature-validation, and reentrancy utilities. Tokens with transfer fees or observable balance changes inconsistent with the exact payment are rejected. Malicious tokens and arbitrary rebasing tokens are not supported assets.

SDK status checks help callers understand whether a collection is likely to succeed. The contract checks the current state again when the transaction executes.

### Contract interface

| Operation | Authorization |
|---|---|
| `createPolicy(terms)` | Owner sends the transaction |
| `createPolicyWithSignature(owner, terms, nonce, deadline, signature)` | Anyone submits a valid owner signature |
| `collect(policyId, paymentReference)` | Only the policy's named spender |
| `cancelPolicy(policyId)` | Only the policy owner |
| `cancelPolicyWithSignature(policyId, nonce, deadline, signature)` | Anyone submits a valid owner signature |
| `invalidateAuthorizations()` | Owner advances their signature nonce; existing policies remain active |
| `getPolicy(policyId)` / `policyStatus(policyId)` | Public read access |

Creation and signed cancellation share a sequential owner nonce. Direct creation also consumes a nonce. The SDK derives each policy ID from its owner and creation nonce. Signed operations bind the chain ID and contract address through the EIP-712 domain, and include a deadline. Both EOA and ERC-1271 signatures are supported. Invalidating authorizations revokes signatures at the current nonce; clients should only sign the current onchain nonce, not speculative future nonces.

`PolicyCreated`, `PaymentCollected`, and `PolicyCancelled` events provide an integration history. A payment reference is metadata, not a separate replay-protection key: duplicate-payment protection is enforced per policy and billing period. Separate policies have separate limits; authorizing multiple policies for the same merchant permits each to collect.

### SDK integration

Import from `sdk/index.ts` in this repository; the SDK is not yet published as an npm package. Transaction builders return `{ to, data }` for an integrating wallet or backend to submit.

```ts
import { createPolicyTypedData, registerSignedPolicyCall } from './sdk/index.ts';

// Use the owner's current onchain nonce and a short signature deadline.
const typedData = createPolicyTypedData(ordinAddress, chainId, owner, terms, nonce, deadline);
const signature = await ownerWallet.signTypedData(typedData);
const call = registerSignedPolicyCall(ordinAddress, owner, terms, nonce, deadline, signature);
// The relayer pays gas; it gains no authority to change the signed terms.
const hash = await relayerWallet.sendTransaction(call);
```

Additional helpers build direct creation, token approval, collection, and cancellation calls. Read helpers expose policy state and authorization nonces. `inspectPolicy` reads eligibility, balance, and allowance at one block; `simulateCollection` checks the actual spender call before sending. `canCollect` is a preliminary eligibility check, not a guarantee that token restrictions or intervening transactions will allow settlement.

### Project layout

```text
contracts/Ordin.sol       Payment policy contract
contracts/test/          Local token and adversarial fixtures
sdk/                     Typed data, transaction builders, reads, and generated ABI
scripts/compile.ts       Pinned solc compilation; exports artifacts and SDK ABI
scripts/local.ts         Ephemeral EVM fixture
scripts/demo.ts          End-to-end local payment lifecycle
scripts/verify-network.ts Read-only Whitechain/token probes
test/                    Contract and SDK integration tests
```

Compilation uses Solidity 0.8.30 with the Prague EVM target. The compiler is installed through Yarn, so compilation does not download a compiler at runtime. `artifacts/compiler-input.json` contains the standard JSON input including imported sources for later source verification.

## Failure handling

| Condition | Expected behavior |
|---|---|
| Insufficient balance | Collection fails without a partial payment |
| Insufficient token allowance | Collection fails; token access must be restored |
| Unauthorized caller | Collection is rejected |
| Policy has not started | Collection is rejected |
| Period already paid | Duplicate collection is rejected |
| Policy expired or cancelled | Collection is rejected |
| Token transfer fails | Transaction reverts without recording a successful payment |

Cancellation takes effect when its transaction is confirmed onchain. It stops future collections and does not refund earlier payments.

## Whitechain configuration

| Setting | Value |
|---|---|
| Network | Whitechain Sepolia |
| Chain ID | `1874` |
| Gas token | WBT |
| RPC | `https://rpc.testnet.whitechain.io` |
| Explorer | `https://explorer.testnet.whitechain.io` |
| Payment token | USDT |
| USDT address | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| USDT decimals | `6` |

Network settings are documented by [Whitechain](https://docs.whitechain.io/learn/network/testnet). The USDT address and decimals are listed in the [official token metadata](https://github.com/whitechain-labs/templates/blob/main/whitechain-token-lists/data/USDT/data.json).

These are documentation-verified values. Live contract behavior still needs verification.

## Verification before deployment

- Confirm the RPC reports chain ID `1874`.
- Confirm contract code exists at the required USDT address.
- Read token metadata and inspect the verified implementation.
- Determine whether signed approvals are supported.
- Validate allowance and transfer behavior against that token.
- Demonstrate collection with gas paid by the spender.
- Verify Ordin's deployed source code on the explorer.
- Record deployment addresses and successful payment transactions.

Live RPC and token ABI checks are currently incomplete: during the initial investigation, the development shell could not resolve the RPC hostname and the web tool could not retrieve the token ABI. This is an access limitation, not evidence that the token lacks signed approvals.

## First-release boundaries

Included: recurring-payment policies, collection, cancellation, policy inspection, SDK utilities, examples, and tests.

Deferred: dashboards, checkout UI, merchant accounts, hosted automation, notifications, variable billing, refunds, single-use payment intents, swaps, and cross-chain payments.

A marketing landing page may be developed separately. Its copy should distinguish planned capabilities from implemented functionality and should not promise fully gasless setup before verification.

Public deployment addresses and transaction evidence will be added after testnet validation. No hosted relayer or scheduler is included; the local demo shows how separate accounts can submit the relevant operations.
