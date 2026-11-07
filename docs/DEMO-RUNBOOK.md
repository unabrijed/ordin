# Frame live demo runbook

## Live application and current status

Open **https://frame-api-production-7da3.up.railway.app**. Railway serves both the browser UI and the merchant backend. This is the selected hosting setup: one Railway service, persistent SQLite storage and its built-in renewal worker.

Verified on 2026-11-07:

- Railway deployment `8f834988-9f3f-4389-8c8f-8946ef92b0c2` reported `SUCCESS`.
- The public `/api/ready` returned HTTP 200, `ok: true`, `mode: whitechain`, `chainId: 1874`, the shared Ordin contract address, and an empty worker error.
- The merchant's initial zero-WBT startup failure was resolved after funding.
- The public UI returned HTTP 200. RPC balance checks showed customer WBT `0.991384182180860643` and USDT `0`; merchant WBT `1` and USDT `0`. These are a verification snapshot, not guaranteed current balances.
- A successful USDT subscription, renewal and cancellation have **not** yet been demonstrated. Customer USDT funding is now verified; the next step is starting a subscription in the browser.
- Explorer source verification is not yet confirmed. No Vercel deployment or Postgres setup is required.

## Addresses and responsibilities

| Role | Address / setting | Responsibility |
| --- | --- | --- |
| Network | Whitechain Sepolia, `1874` | All demo payments settle here |
| RPC | `https://rpc.testnet.whitechain.io` | Reads and transaction submission |
| Shared Ordin | `0x8b63f8f355a0ff64b181484c74701f96dab3df65` | Enforces signed payment terms |
| Required USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, 6 decimals | Customer subscription balance |
| Customer | `0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A` | Holds USDT, approves and signs in browser |
| Merchant signer and treasury | `0x76C636de66BB5A58f3d6bA015082b0187Ed56F0e` | Pays WBT gas and receives USDT |

`MERCHANT_PRIVATE_KEY` is a secret signing credential. `MERCHANT_TREASURY` is the public receiving address. They currently belong to the same dedicated merchant wallet. The customer wallet is separate. The deployer key was not uploaded to Railway.

Latest funding check: at Whitechain block **12,420,913**, customer `0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A` held **14.557204 USDT** at the required token contract and **0.79004004340684907 WBT**. Public readiness again returned HTTP 200 with no worker error. Funding is resolved; this does not yet prove a subscription payment.

## Obtain the correct test USDT

The [official faucet](https://faucet.testnet.whitechain.io) and its [documentation](https://docs.whitechain.io/learn/get-started/get-testnet-wbt) describe WBT distribution. We have not verified a public faucet for the exact USDT contract above. WBT does not substitute for USDT, and importing a token only displays its balance.

The [Whitechain prize rules](https://ethglobal.com/events/mumbai/prizes/whitechain) require a payment using this exact USDT contract. A replacement token deployed by this project does not satisfy that requirement. Whitechain's [bridge announcement](https://whitechain.io/blog/whitechain-bridge-is-live) describes a Tron route receiving USDT.e; its destination address has not been confirmed to match the prize token, so it is not a verified funding route for this demo.

Contact the Whitechain booth or sponsor support channel at ETHGlobal. Official builder support is also available through [Whitechain DEVs Telegram](https://t.me/Whitechaindevs) and [Discord](https://discord.com/invite/7DRU8xEDTG), linked by the [Builders page](https://whitechain.io/builders). Ask for the faucet URL or a test-token transfer. Suggested message, for you to send:

> We are building Ordin / Frame for ETHGlobal Mumbai's Whitechain Operate track. Our app is live at https://frame-api-production-7da3.up.railway.app and WBT is funded. Could you provide the faucet for the required USDT contract, or send 10 test USDT on Whitechain Sepolia (chain 1874), token 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7, to customer wallet 0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A? We need 3 USDT per complete subscription test. The published faucet documentation only describes WBT.

No message has been sent on your behalf. Ten test USDT allows several runs; one complete run needs three. Share only the public address. Do not provide a private key or seed phrase to claim test tokens.

After funding, verify from the repository:

```sh
yarn chain balance --address 0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A
```

If local RPC access fails, use the [customer explorer page](https://explorer.testnet.whitechain.io/address/0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A) and inspect the token contract address, not just its symbol.

## Test through the UI

1. Open the live Frame site in a browser with an injected EVM wallet, using the customer account above. Select Whitechain Sepolia when prompted.
2. Try the free image preview before subscribing.
3. Go to **Subscription → Start with Ordin**. Authenticate with the wallet as prompted.
4. Approve exactly **3 USDT** to Ordin. This transaction costs the customer WBT; approval does not transfer payment by itself.
5. Review and sign the subscription: **1 USDT per 120-second billing window, at most three windows**. The merchant sponsors policy registration and eligible collection.
6. Wait for the first confirmed payment. Premium PNG generation and API access should unlock after the required two L2 confirmations. Save the payment transaction link from the UI.
7. Keep the subscription active into the next billing window. The hosted worker submits renewal without another customer signature. Confirm the second receipt and USDT transfer.
8. Cancel from the customer subscription view. Save its receipt; future collections stop while access lasts through the already-paid window.
9. Compare the customer and Merchant views and the explorer transactions. Approval, registration, payment and cancellation are distinct actions; only a successful collection transfers subscription USDT.

The worker checks periodically; the contract does not execute a timer. Missed billing windows do not accumulate as debt. Insufficient USDT or allowance cannot produce a successful payment. Cancellation testing should happen before all three windows finish.

## Hosting configuration and recovery

| Setting | Value |
| --- | --- |
| Railway project | `ordin-frame` / `8fc3573c-d970-43bf-82a2-98a26e13f05a` |
| Service | `frame-api` / `615c2f0c-96ec-42c7-ac66-3d8d797efebd` |
| Environment | `production` / `e574b076-50fe-41c8-8f3b-615bf1200c87` |
| Volume | `/data`, SQLite at `/data/frame.sqlite` |
| Process | `yarn start`, root `Dockerfile`, Node 22 |
| Port | `8080` |
| Health check | `/api/ready` |
| Replicas | One; sleeping disabled |
| Browser origin | Railway HTTPS domain unless `FRAME_ORIGIN` is explicitly set |
| Estimated daily sponsorship cap | `0.05` WBT |

Railway holds `ORDIN_ADDRESS`, `MERCHANT_PRIVATE_KEY`, `MERCHANT_TREASURY`, `WHITECHAIN_RPC_URL`, and `RELAYER_DAILY_GAS_BUDGET_WBT`. Keep secret values out of Git, frontend settings and logs. Local `.env` is not automatically uploaded when it changes.

Inspect recent server logs:

```sh
railway logs --project 8fc3573c-d970-43bf-82a2-98a26e13f05a --service 615c2f0c-96ec-42c7-ac66-3d8d797efebd --environment e574b076-50fe-41c8-8f3b-615bf1200c87 --deployment --lines 40
```

Redeploy the existing image after resolving a startup issue:

```sh
railway redeploy --project 8fc3573c-d970-43bf-82a2-98a26e13f05a --service 615c2f0c-96ec-42c7-ac66-3d8d797efebd --environment e574b076-50fe-41c8-8f3b-615bf1200c87 --yes
```

Upload updated application files without redeploying the protocol:

```sh
railway up --project 8fc3573c-d970-43bf-82a2-98a26e13f05a --service 615c2f0c-96ec-42c7-ac66-3d8d797efebd --environment e574b076-50fe-41c8-8f3b-615bf1200c87 --detach
```

Do not remove the volume to fix a restart: it holds sessions, billing records, signed transaction recovery data and usage. Changing signer, treasury or network against the existing database is deliberately rejected. Keep the current deployment identity for this demo.

Keep the UI and API on the same Railway origin. No external renewal scheduler is required; the running merchant process handles it.

## Judging evidence still to collect

- Confirm explorer source verification using [deployment instructions](DEPLOYMENT.md).
- Add the first successful USDT collection transaction to the main README; the deployment transaction does not prove a payment.
- Record renewal and cancellation links, plus a 2–4 minute video showing customer and merchant views.
- Keep [Whitechain feedback](../WHITECHAIN_FEEDBACK.md) updated with observed issues.

The current flow targets **Operate**. It does not yet meet Scale's zero-customer-gas requirement because the initial USDT approval costs customer WBT. Do not describe onboarding as fully gasless.
