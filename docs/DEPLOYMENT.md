# Ordin — Whitechain Sepolia deployment

This is the shared protocol deployment used by Frame and other integrations. Each merchant configures this address and creates customer-authorized policies; it does not deploy a separate Ordin contract.

| Field | Recorded value |
|---|---|
| Network | Whitechain Sepolia |
| Chain ID | `1874` |
| Contract | `0x8b63f8f355a0ff64b181484c74701f96dab3df65` |
| Deployment transaction | `0x154b33903bb43e06c4aaa9ca5dbee88eef93fbb695a39f76a094da3a34fd7543` |
| Deployer | `0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A` |
| Receipt status | `success` |
| Deployment block | `12419421` |
| Estimated gas | `1716493` |
| Gas used | `1701819` |
| Reported execution gas cost | `0.008510796819 WBT` |
| Compiler | `0.8.30+commit.73712a01.Emscripten.clang` |

[Contract explorer](https://explorer.testnet.whitechain.io/address/0x8b63f8f355a0ff64b181484c74701f96dab3df65) · [Deployment receipt](https://explorer.testnet.whitechain.io/tx/0x154b33903bb43e06c4aaa9ca5dbee88eef93fbb695a39f76a094da3a34fd7543)

The figures above come from the deployment output supplied by the deployer and the matching `.ordin/sepolia.json` record. The explorer was not independently retrievable from this execution environment. Execution gas cost may exclude additional L1 data fees. The supplied receipt confirms L2 inclusion, not necessarily Ethereum finality.

## Integration configuration

```dotenv
ORDIN_ADDRESS=0x8b63f8f355a0ff64b181484c74701f96dab3df65
WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
```

Payment token: official testnet USDT at `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, with 6 decimals. WBT pays network fees.

The deployer is not automatically every merchant's spender or recipient. Those addresses are specified independently in each customer policy. Updating Frame or integrating another merchant requires no contract redeployment. Solidity changes require a new version because Ordin is non-upgradeable.

## Source verification

Status: **not yet confirmed**. A successful deployment is separate from explorer source verification.

Use the explorer's Solidity standard JSON verification flow:

- Contract: `Ordin`, source path `contracts/Ordin.sol`.
- Compiler: `v0.8.30+commit.73712a01`.
- Standard JSON: the deployment-time `.ordin/compiler-input.json`.
- Constructor arguments: none.
- Optimizer and EVM settings are included in the saved JSON (200 runs, Prague target).

Use the saved deployment-time input rather than recompiling changed sources. `.ordin/` stays gitignored; it is not a public secrets or runtime-data store.

## Payment evidence

The deployment receipt does not prove a subscription payment. Official-USDT first-payment, renewal and cancellation transaction links have not yet been recorded. Add them after completing the [Frame flow](FRAME-LIVE.md) or [CLI walkthrough](TESTNET.md). Public Frame hosting also remains unconfirmed.
