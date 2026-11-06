# Frame merchant service — implementation in progress

Frame is a software subscription demonstration for Ordin: confirmed USDT payments will unlock a PNG-generation playground and API.

## Implemented

- A billing scan that inspects each policy, checks the configured spender, simulates collection, and dispatches eligible payments.
- Stable payment references bound to chain, contract, policy, and billing period.
- Payment-window calculation that preserves previously paid access after cancellation.
- A SQLite transaction queue that stores signed bytes before broadcasting and reconciles the same transaction after restart. It serializes signer work and blocks new nonce allocation while an earlier transaction remains unresolved.
- Integration tests for renewal, duplicate scans, insufficient balance, cancellation, and transaction recovery.

These are building blocks, not a running HTTP service. The billing scan's dispatcher must be connected to the transaction queue before live use. `paymentWindow` reads the latest state; the eventual entitlement service must apply the planned confirmation and reorganization checks before granting access.

## Remaining implementation

1. HTTP API, wallet authentication, authoritative checkout terms, and sponsored registration/cancellation.
2. Live signer adapter, persisted subscription discovery, periodic worker, gas budgeting, and receipt synchronization.
3. Confirmed entitlements, API keys, image rendering, and quotas.
4. Reusable checkout and Frame website.
5. Local browser verification, official-USDT testnet lifecycle, and public hosting.

Use Node 22.13 or newer for the built-in SQLite module. From the repository root, `yarn test` runs the integration tests and `yarn typecheck` checks their types. Runtime database files and signing keys must never be committed.
