# Frame — a working subscription app powered by Ordin

Frame generates downloadable social-card PNGs. A confirmed Ordin payment unlocks full-resolution images and API access. Its merchant service collects renewals without the customer browser and pays the registration, collection and cancellation gas.

## Whitechain is now the default

Set `ORDIN_ADDRESS=0x8b63f8f355a0ff64b181484c74701f96dab3df65`, configure the merchant wallet, then run `yarn frame:check` and `yarn frame`. The shared contract is already deployed. Follow [the live deployment guide](../../docs/FRAME-LIVE.md) for funding, environment values, contract verification and public hosting. Missing live configuration stops startup; there is no local fallback.

## Optional local developer sandbox

From the repository root, with Node 22.14+ and Yarn Classic:

```sh
yarn install --frozen-lockfile
yarn frame:local
```

Open **http://localhost:3210**. Keep that terminal running.

1. Click **Use demo wallet**. It has 10 mock USDT on a local EVM.
2. Open **Subscription**, select **Start with Ordin**, then **Approve & authorize**.
3. Watch the wallet lose 1 USDT and the merchant receive it. Expand the payment receipt to inspect the hash, block, gas and contract event.
4. Open **Playground** and generate/download a 1200 × 630 PNG. Before payment only the 600 × 315 watermarked preview is available.
5. Wait 30 seconds, or use **Advance to renewal**. Another payment happens without another authorization. You can close the browser and reopen it while the server keeps running.
6. Use **Check collection rule** in the same window to see a duplicate collection rejected without broadcasting.
7. Select **Cancel future payments**. Already-paid access remains until its window ends; the next collection is rejected.
8. In **Developer API**, generate a key and copy the curl request. Unpaid subscriptions receive HTTP 402; revoked keys receive HTTP 401.

To exercise failure recovery, empty the customer wallet before advancing to the next window. The worker reports that payment needs attention. **Add 10 test USDT** lets it retry successfully within that window.

This executes the actual Ordin contract on an in-process Hardhat EVM. It is not a browser balance animation. It uses a local mock token, not Whitechain USDT. The demo wallet signs on the server only in local mode. The server binds to loopback, and restarting resets its chain and demo data. Never fund these deterministic accounts on any public chain.

The local plan allows three payments of 1 mock USDT in fixed 30-second windows. After expiry, create a fresh subscription. Each window grants up to 100 premium renders.

## Whitechain mode

Use the shared Ordin contract in the [deployment record](../../docs/DEPLOYMENT.md). Obtain official testnet USDT for the customer and WBT for initial approval. Fund a separate merchant signer with WBT.

Configure these values in your untracked `.env`:

- `ORDIN_ADDRESS`: deployed Ordin contract.
- `MERCHANT_PRIVATE_KEY`: dedicated testnet signer, entered locally only.
- `MERCHANT_TREASURY`: recipient, different from the customer wallet.
- `WHITECHAIN_RPC_URL`: Whitechain Sepolia endpoint.
- `RELAYER_DAILY_GAS_BUDGET_WBT`: maximum estimated sponsored gas reserved per UTC day; defaults to 0.05 WBT.

```sh
yarn frame:whitechain
```

The same UI now uses an injected browser wallet, chain ID 1874, official testnet USDT, and real explorer links. The live plan is 1 USDT per 120-second window, for three windows maximum. The customer pays token approval gas; the merchant relays policy registration and cancellation and submits collections. An existing nonzero allowance may require a zero-reset transaction first.

There are no wallet allowlists. Public deployment still needs a running funded service; a static copy of the UI alone cannot perform billing.

Run one service instance with a persistent volume. Put `FRAME_DATABASE` on that volume and preserve both the application database and its `.queue.sqlite` companion. Configure `FRAME_HOST=0.0.0.0` for hosting and `FRAME_ORIGIN` to the exact browser origin. Use HTTPS through the host's proxy. Keep the service awake. Local demo mode intentionally cannot bind to public interfaces.

The shared contract deployment is recorded in the [deployment record](../../docs/DEPLOYMENT.md). Explorer source verification, live wallet/payment operation and a public Frame URL are not yet confirmed.

## Architecture

- Browser UI: dependency-free HTML, CSS and JavaScript, served by the merchant process.
- Reusable adapter: [checkout.js](../../examples/frame/checkout.js), used by the actual UI; handles approval, typed policy authorization and cancellation through supplied API/wallet adapters.
- Merchant HTTP API: Node HTTP, persistent SQLite sessions, authoritative policy quotes, API-key hashes and per-period usage.
- Contract: existing Ordin Solidity and TypeScript SDK. No contract changes are required.
- Worker: serialized signer operations, deterministic references and repeated policy inspection. Checks every two seconds locally and five seconds on Whitechain.
- Transaction queue: saves signed bytes before submission; reconciles or rebroadcasts the same hash after ambiguous network failures.
- Entitlements: onchain paid-window state at one local confirmation or two L2 confirmations on Whitechain. Cancellation preserves already-paid access. These are not claims of Ethereum finality.
- Renderer: original pixel typography and three fixed templates; generates actual PNG files with built-in zlib. No external font, image, model, browser, or rendering service is needed. Supports uppercase Latin letters, digits and basic punctuation.

The implementation uses the installed toolchain instead of downloading a new web framework or image package. This keeps the local test loop self-contained.

## Tests and limits

```sh
yarn typecheck
yarn test
```

The HTTP integration tests exercise the handlers directly against a real local EVM, including PNG dimensions, authorization, paid access, renewals, insufficient funds, cancellation and API-key revocation. Queue tests cover restart recovery. UI JavaScript has syntax checks; interactive browser QA was unavailable because this execution environment refused localhost binding.

Prototype limits: single process/merchant; no refunds, proration, embedded wallets, email login, or fully gasless first approval. The sponsorship budget and request limits bound demo use but are not a production abuse-prevention system. Dropped transactions with obsolete fees may require operator intervention; the queue deliberately does not silently replace them. Runtime histories are capped to recent receipts in the UI. Local time controls only affect the local EVM.

## Commit and push

Run `bash scripts/commit-frame.sh` from the checkout. It commits the service, UI, and documentation in groups, includes remaining project changes, and pushes the current branch to `unabrijed/ordin` without force. The managed environment could not write local Git metadata, and its GitHub connector returned HTTP 403, so no new remote commit is claimed.
