# Run Frame on the shared Whitechain deployment

`yarn frame` now starts **Whitechain mode**. It never falls back to local tokens. The optional developer sandbox is available only through `yarn frame:local`.

## 1. Prepare the wallets

Use a dedicated testnet merchant wallet. It sponsors registrations, renewals and cancellation; it does not need to deploy Ordin. Fund it with test WBT on **Whitechain Sepolia, chain ID 1874** using the [Whitechain faucet](https://faucet.testnet.whitechain.io) or another funded wallet.

For this demo, the merchant wallet can also be the receiving treasury. The paying customer must use a **different wallet**, with official testnet USDT and a little WBT for token approval. The known customer address is `0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A`; its balance has not been verified from this environment.

## 2. Set local configuration

From the Ordin project folder:

```sh
yarn install --frozen-lockfile
cp -n .env.example .env
chmod 600 .env
```

Edit `.env` locally. Set:

```dotenv
ORDIN_ADDRESS=0x8b63f8f355a0ff64b181484c74701f96dab3df65
WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
MERCHANT_PRIVATE_KEY=0xYOUR_DEDICATED_TESTNET_PRIVATE_KEY
MERCHANT_TREASURY=0xYOUR_MERCHANT_WALLET_ADDRESS
```

Keep the key out of chat, screenshots, Git and browser code. The `0x` prefix is required.

## 3. Reuse the deployed contract

Ordin is already deployed at `0x8b63f8f355a0ff64b181484c74701f96dab3df65`. Setting `ORDIN_ADDRESS` above is sufficient. Do not run a deployment command merely to integrate Frame or another app.

See the [deployment record](DEPLOYMENT.md) for its successful receipt and compiler details. `yarn deploy:testnet` is reserved for a deliberate new protocol deployment or version, not normal application startup.

## 4. Verify the contract source

Open the [shared contract explorer page](https://explorer.testnet.whitechain.io/address/0x8b63f8f355a0ff64b181484c74701f96dab3df65). Source verification is performed once for the protocol; individual merchants need not repeat it. In **Contract → Verify**, select Solidity standard JSON input:

- Compiler: `v0.8.30+commit.73712a01`.
- Contract: `Ordin`, from `contracts/Ordin.sol`.
- Input file: `.ordin/compiler-input.json`.
- Constructor arguments: empty.

The JSON already includes compiler settings and imported sources. Deployment success and source verification are separate steps.

## 5. Run the real payment UI

```sh
yarn frame:check
yarn frame
```

Open **http://localhost:3210**. Although the website is served by your laptop, every approval, policy and payment is on **Whitechain Sepolia**, not a local blockchain.

Use the customer wallet, choose **Subscription → Start with Ordin**, and approve 3 test USDT. Sign the fixed authorization for 1 USDT per 120-second window, up to three windows. The merchant registers it and collects the first payment. The next payment runs automatically while the server stays running. The Merchant view links to real explorer receipts. Cancel from the customer view to stop future collection.

The UI has no demo wallet, mint button or time-advance controls in Whitechain mode. Premium access waits for two L2 confirmations. The customer pays initial approval gas; subsequent registration, renewal and cancellation are sponsored.

## 6. Host the same working application

Frame needs an always-running Node process and durable SQLite storage. The root `Dockerfile` packages both the UI and merchant service. Do not deploy only `examples/frame` as static files.

On Railway:

1. Create a separate project and service for Frame using this repository and its current branch (`sacred` in this checkout). Railway detects the root Dockerfile. Deploy the updated code first if GitHub still has the earlier version.
2. Attach a volume at `/data`. Keep one replica and disable sleeping/serverless mode.
3. Generate a public HTTPS domain. `RAILWAY_PUBLIC_DOMAIN` supplies the allowed browser origin automatically; `PORT` supplies the listening port.
4. Set `ORDIN_ADDRESS`, `MERCHANT_PRIVATE_KEY`, `MERCHANT_TREASURY`, and `WHITECHAIN_RPC_URL` in service variables. The hosted container does not have your local `.ordin/sepolia.json` or `.env`.
5. Set the service healthcheck path to `/api/ready`. Deploy/redeploy after the volume, public domain and secrets are configured.
6. Open the public URL. Check `/api/ready` for `ok: true`, `mode: whitechain`, and `chainId: 1874`, then complete a real subscription from the UI.

The daily estimated sponsorship cap defaults to `0.05` WBT and can be changed with `RELAYER_DAILY_GAS_BUDGET_WBT`.

If using Railway CLI, existing local secrets can be uploaded without putting their values in command arguments:

```sh
yarn frame:host-secrets --project PROJECT_ID --service SERVICE_ID --environment ENVIRONMENT_ID
railway up --project PROJECT_ID --service SERVICE_ID --environment ENVIRONMENT_ID --detach
```

Use the actual IDs for your Frame service. This helper does not create or change another linked project, does not print secret values, and does not deploy until the explicit `railway up` command.

## What to share

Share only the public contract address, deployment transaction hash, and later the hosted Frame URL. These let us verify the deployment and finish the explorer-linked judging documentation. Do not share `.env` or private keys.

## Current verification status

The shared Ordin deployment succeeded; its [receipt and address](DEPLOYMENT.md) are recorded. Explorer source verification, a successful official-USDT payment/renewal/cancellation flow, and public Frame hosting remain to be confirmed. Local integration checks do not substitute for that live evidence.
