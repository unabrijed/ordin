# Ordin

**Your terms. Every payment.**

Ordin is a recurring-payment protocol for EVM wallets, targeting Whitechain. It lets a wallet owner authorize recurring token payments while retaining control of their funds and the ability to cancel future collections.

**Status:** Local prototype implemented: Solidity contract, TypeScript SDK, executable demo, testnet CLI, and 15 passing local EVM/CLI tests. Not deployed to Whitechain or audited. Live USDT compatibility and gasless initial token approval remain unverified.

## Start here

| What you want to do | Start with |
|---|---|
| See the lifecycle without funds or a wallet | `yarn demo` |
| Run the automated checks | `yarn test` and `yarn typecheck` |
| Check your testnet WBT and USDT | `yarn chain balance --address YOUR_ADDRESS` |
| Deploy and inspect real testnet transactions | [Testnet walkthrough](docs/TESTNET.md) |
| Integrate another application | [Contract and SDK interface](#contract-interface) |
| Preview the marketing page and browser simulation | [Landing page](landing/README.md) |

The core flow is **authorize → collect → renew → cancel**. A merchant or external scheduler submits each collection. The contract enforces the owner's terms; it does not run a timer or automatically submit transactions.

The landing page is a separate app in `landing/`. Run `yarn --cwd landing install --frozen-lockfile` and `yarn --cwd landing dev` to preview it. Its policy playground is a browser-only simulation and does not connect a wallet or transfer funds. The page has not been deployed to a public website.

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

`yarn verify:network` and `yarn chain` load a local `.env` if it exists. Shell variables take precedence. Network verification sends no transactions. Successful `nonces` and `DOMAIN_SEPARATOR` reads alone do not prove that the token supports a working permit implementation.

## Run on Whitechain and see transactions

Follow [the testnet walkthrough](docs/TESTNET.md) for wallet balances, deployment, allowance, policy creation, collections, cancellation, and explorer confirmation.

```sh
yarn chain --help
yarn chain balance --address 0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A
```

Read-only commands need no key. Write commands simulate or estimate by default and only broadcast with `--send`. The CLI prints explorer links, uses the official USDT address, and refuses networks other than Whitechain Sepolia. Deployment saves its address locally for subsequent commands. No public deployment is claimed until a successful receipt is obtained.

### Testnet quick start

First run `yarn compile`, then copy `.env.example` to `.env` **if you do not already have a `.env` file**. Set `PRIVATE_KEY` locally to a dedicated testnet wallet funded with WBT and USDT. Never share that key in chat. Select a different wallet you control as the recipient.

Run these one step at a time, replacing `RECIPIENT_ADDRESS` and then the printed `POLICY_ID`:

```sh
yarn chain deploy --send
yarn chain approve --amount 3 --send
yarn chain create --recipient RECIPIENT_ADDRESS --amount 1 --interval 120 --cycles 3 --send
yarn chain collect --id POLICY_ID --send
yarn chain policy --id POLICY_ID
yarn chain history
```

This authorizes a total token allowance of 3 USDT and creates a policy for 1 USDT per 120-second window, expiring after three windows. Creation itself does not collect a payment. By default the signing wallet is both owner and spender; specify `--spender` to demonstrate a separate account paying renewal gas. Initial approval and direct creation are not gasless.

Open the transaction link printed after collection. Confirm **Success**, a USDT **Transfer** from owner to recipient, and Ordin's **PaymentCollected** event. An immediate duplicate collection is rejected during simulation, so it creates no explorer transaction. Wait until the policy's `nextDueAt` window before collecting again.

Cancel and inspect an individual receipt with:

```sh
yarn chain cancel --id POLICY_ID --send
yarn chain receipt --hash TRANSACTION_HASH
```

The deployed address and block are saved in `.ordin/sepolia.json`. Exact source-verification input is saved alongside it. Source verification, insufficient funds, expired policies, and changing the spender wallet are covered in the [full walkthrough](docs/TESTNET.md).

### Common issues

| Symptom | Meaning / next step |
|---|---|
| `ENOTFOUND` / `EAI_AGAIN` | DNS failed before reaching the RPC. Try from your own terminal; this is not a balance or gas error. |
| HTTP `429` | RPC rate limit; wait and honor the provider's retry interval. |
| WBT is zero | Fund the signing wallet with testnet gas. |
| USDT is zero | Obtain the official test USDT; WBT cannot fund a subscription. |
| `NotCollectible` | Inspect policy status: the window may be paid, not started, expired, or cancelled. |
| Wrong signing wallet | Collection requires the named spender; direct cancellation requires the owner. |
| No receipt after broadcasting | Check the printed transaction hash before retrying; a timeout is not proof of failure. |

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
