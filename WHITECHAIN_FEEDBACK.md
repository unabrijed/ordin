# Whitechain integration feedback

Updated 2026-11-07 for Ordin / Frame.

- Standard EVM tooling worked for the shared Ordin deployment on chain 1874. The live Railway service successfully reads the contract, validates its EIP-712 domain and USDT decimals, and runs its billing worker.
- Explicit chain ID, RPC, token address and explorer links in the prize requirements were useful. Deployment evidence is recorded in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- WBT funding is resolved. The merchant initially had no WBT, causing startup to stop with a useful public-address error; after funding, readiness passed.
- Obtaining the required test USDT was a blocker, now resolved: the customer balance was verified at 14.557204 USDT at block 12,420,913. The funding source was not independently established. The published faucet guide describes WBT, but the prize requires a particular USDT contract. A direct USDT faucet link, claim instructions or documented sponsor funding channel beside that requirement would help.
- Public bridge documentation mentions USDT.e. An explicit mapping from that asset to the hackathon's required USDT address would clarify whether bridging is a valid funding route.
- This coding environment could not resolve the public RPC/explorer locally. The deployed Railway service could reach the RPC. This is an environment-specific observation, not evidence of a Whitechain outage.
- A live USDT payment, renewal and cancellation are still pending; this feedback does not imply end-to-end payment success.
