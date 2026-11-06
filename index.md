# Ordin — Recurring payments. Your terms.

Ordin is a recurring-payment protocol for EVM wallets, targeting Whitechain. It lets a wallet owner approve a fixed amount, recipient, and billing interval. Funds remain in the wallet until a successful collection.

## How payments work

### 1. You authorize

Approve token access for the Ordin contract, then separately authorize a payment policy. The policy specifies the token, authorized spender, recipient, fixed amount, billing interval, start time, and optional expiry. Token allowance alone does not authorize a payment.

Example: authorize 5 USDT to one merchant once every 30 days.

### 2. Your merchant requests collection

The authorized spender submits a collection transaction when a billing period is eligible. This can be a merchant backend, an external automation service, or a script. The contract does not run a timer or submit transactions automatically. The transaction submitter pays the network fee.

### 3. Ordin checks, then transfers

The contract checks the caller, policy status, start and expiry times, and whether the period has already been paid. If the collection succeeds, exactly the approved amount moves directly from the owner's wallet to the approved recipient.

Only one successful collection is permitted per period. A failed collection does not count as a payment. Unpaid periods do not accumulate into arrears.

## Owner control

Confirmed onchain cancellation stops future collections. It does not refund earlier payments. A cancelled policy cannot be reactivated; changing terms or continuing payments requires a new owner authorization.

## Current status

The contract, TypeScript SDK, local demo, and tests are implemented as a local prototype. Ordin is not deployed to Whitechain or audited. Live USDT compatibility and fully gasless initial token approval remain unverified. This website is informational and does not connect wallets or move tokens.

## Read more

- [Protocol overview and interfaces](/README.md)
- [Testnet walkthrough](/docs/TESTNET.md)
- [LLM documentation index](/llms.txt)
