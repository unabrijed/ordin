# Ordin

**Your terms. Every payment.**

Ordin enables recurring token payments on Whitechain. Customers authorize a fixed amount, merchant, billing interval and expiry; merchants collect eligible payments without asking for a new signature each time. Funds stay in the customer's wallet until payment succeeds.

A token allowance alone cannot express a subscription's terms. Ordin enforces those terms onchain and lets the customer cancel future payments.

## Whitechain deployment

**The shared Ordin contract is deployed on Whitechain Sepolia.** Frame and other merchant applications use this same address; integrating another app does not require redeploying Ordin.

| Setting | Value |
|---|---|
| Network | Whitechain Sepolia · chain ID `1874` |
| Ordin contract | [`0x8b63f8f355a0ff64b181484c74701f96dab3df65`](https://explorer.testnet.whitechain.io/address/0x8b63f8f355a0ff64b181484c74701f96dab3df65) |
| Deployment | [Successful transaction · block 12,419,421](https://explorer.testnet.whitechain.io/tx/0x154b33903bb43e06c4aaa9ca5dbee88eef93fbb695a39f76a094da3a34fd7543) |
| RPC | `https://rpc.testnet.whitechain.io` |
| Gas token | WBT |
| Payment token | USDT · 6 decimals · `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |

Deployment succeeded according to the supplied receipt and saved deployment record. Explorer source verification and official-USDT subscription payment evidence are not yet confirmed. Ordin is not audited or deployed to mainnet. [Full deployment record](docs/DEPLOYMENT.md).

## How it works

1. **Approve:** the customer grants Ordin a token allowance.
2. **Authorize:** the customer signs a policy defining the amount, spender, recipient and billing windows.
3. **Collect and renew:** the merchant's backend submits collections. Ordin checks the policy and transfers tokens directly to the recipient.
4. **Cancel:** the customer cancels the policy to stop future collections.

Each policy permits one successful payment per fixed billing window. Insufficient funds or allowance cause the collection to fail without a partial payment; missed windows do not accumulate into debt. Contracts do not run timers—a merchant service must submit each collection.

The customer currently pays initial token-approval gas. Policy registration and cancellation can be relayed, and the merchant pays renewal gas. Fully gasless onboarding is not implemented.

## Frame: an example integration

Frame is a software subscription app powered by Ordin. Confirmed payments unlock premium PNG generation and API access. Its UI includes customer billing, merchant receipts, automatic renewals and cancellation. Cancellation preserves access through the already-paid period.

The Whitechain demo charges **1 test USDT per 120-second window**, for at most **three windows**. Public Frame hosting and an end-to-end live payment demonstration remain to be confirmed.

Use Node.js 22.14+ and Yarn Classic 1.22.22:

```sh
yarn install --frozen-lockfile
cp -n .env.example .env
```

Set these in the root `.env`; keep the private key local:

```dotenv
ORDIN_ADDRESS=0x8b63f8f355a0ff64b181484c74701f96dab3df65
WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
MERCHANT_PRIVATE_KEY=0xYOUR_DEDICATED_TESTNET_KEY
MERCHANT_TREASURY=0xYOUR_RECEIVING_WALLET
```

Fund the merchant signer with test WBT. The customer needs official test USDT and WBT for approval, and must be different from the receiving wallet.

```sh
yarn frame:check
yarn frame
```

Open **http://localhost:3210**. The website runs on your machine; payments settle on **Whitechain Sepolia**. No protocol deployment step is required. [Setup and public hosting](docs/FRAME-LIVE.md).

## SDK integration

Use the [TypeScript SDK](sdk/index.ts) and [contract ABI](sdk/abi.ts) with chain ID `1874` and the deployed Ordin address above. Each merchant supplies its own spender and recipient; every customer authorizes their own policy. The SDK is currently consumed from this repository, not a published package.

[Contract interface and SDK examples](docs/PROTOCOL.md#contract-interface) · [Reusable checkout adapter](examples/frame/checkout.js)

## Development and documentation

```sh
yarn typecheck
yarn test
```

| Resource | Purpose |
|---|---|
| [Deployment record](docs/DEPLOYMENT.md) | Contract address, receipt, compiler and verification status |
| [Protocol reference](docs/PROTOCOL.md) | Policy rules, signatures, contract API and SDK integration |
| [Frame guide](docs/FRAME-LIVE.md) | Merchant configuration and Whitechain hosting |
| [CLI walkthrough](docs/TESTNET.md) | Manual payment, renewal, cancellation and receipt inspection |
| [Frame developer guide](services/merchant/README.md) | Local sandbox, API and implementation limits |

Use `yarn frame:local` only for the optional local EVM sandbox. It uses mock tokens and is separate from the Whitechain deployment.
