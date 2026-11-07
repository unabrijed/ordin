# See Ordin working on Whitechain Sepolia

This walkthrough sends real **testnet** transactions and links each one to the Whitechain explorer. It uses the official USDT token, not a locally minted replacement. Test WBT pays gas; test USDT pays the subscription.

The walkthrough is a manual protocol demonstration. Each `collect` command represents the transaction a merchant or scheduler would submit. This CLI does not run a scheduler; the [Frame merchant service](FRAME-LIVE.md) supplies the automatic billing workflow.

## 1. Check the wallet

From the project directory:

```sh
yarn install --frozen-lockfile
yarn compile
yarn chain balance --address 0x1Dda4b932633cAd2a182f444bd5DE39BB01c278A
```

This reads WBT and USDT at one block and prints a link to the wallet. It requires no private key. The command refuses networks other than Whitechain Sepolia, chain ID 1874.

If WBT is zero, claim it from [the faucet](https://faucet.testnet.whitechain.io). If USDT is zero, obtain test USDT for `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` from the Whitechain team or its supported test-token flow. WBT alone cannot pay the subscription. Importing the token into a wallet only makes its balance visible; it does not fund the wallet.

## 2. Configure signing locally

```sh
cp -n .env.example .env
```

Edit `.env` locally. Set `PRIVATE_KEY` to a **dedicated testnet wallet's** key, including its `0x` prefix. The signing wallet must have WBT; the policy owner's wallet must also have USDT. Never paste the key into chat or commit `.env`.

`yarn chain` and `yarn verify:network` load `.env` automatically. Shell environment variables take precedence. Each write command prints the public signing address before submission so you can identify the actor.

For the quickest first demo, use the funded wallet as deployer, owner, and spender. Choose a **different wallet you control** as the recipient. That recipient does not need gas merely to receive tokens. This single-signer demonstration proves collection rules but does not demonstrate customer gas sponsorship. The separate-spender variant below does.

## 3. Reuse the shared Ordin contract

Set this in the root `.env`:

```dotenv
ORDIN_ADDRESS=0x8b63f8f355a0ff64b181484c74701f96dab3df65
```

The [shared deployment](DEPLOYMENT.md) is already available on Whitechain Sepolia. No deployment command is needed for this walkthrough or for a new merchant integration.

For a deliberate new protocol version only, `yarn deploy:testnet` compiles and broadcasts deployment, then saves its address and compiler input under `.ordin/`. It reuses a configured or saved address. Inspect any existing deployment receipt before deliberately replacing deployment configuration.

## 4. Approve a small allowance

```sh
yarn chain approve --amount 3
yarn chain approve --amount 3 --send
```

This sets the owner's allowance to **3 USDT total** for Ordin. It does not transfer USDT or create a subscription. Approval costs the signing owner WBT in this implementation.

On the explorer, this transaction targets the USDT contract. Look for its `Approval` event. If an existing nonzero allowance differs from the desired value, first run `yarn chain approve --amount 0 --send`, then set the new allowance.

## 5. Create a short demo policy

Replace `RECIPIENT_ADDRESS` with a different wallet you control:

```sh
yarn chain create --recipient RECIPIENT_ADDRESS --amount 1 --interval 120 --cycles 3
yarn chain create --recipient RECIPIENT_ADDRESS --amount 1 --interval 120 --cycles 3 --send
```

This creates permission to collect **1 USDT per 120-second window**, expiring after three windows. By default the signing owner is also the spender. Preview and submission calculate their start times from the latest block independently; the printed submitted terms are authoritative.

The command prints a **Policy ID** from the confirmed `PolicyCreated` event. Copy that ID for the remaining commands. Policy creation does not transfer the first payment.

```sh
yarn chain policy --id POLICY_ID
```

The result shows the owner, spender, recipient, amount, interval, expiry, balance, allowance, current status, and next eligible window timestamp. `canCollect` is a preliminary eligibility check; the collection command also simulates the actual transfer.

## 6. Collect and observe a transfer

```sh
yarn chain collect --id POLICY_ID
yarn chain collect --id POLICY_ID --send
```

The first command simulates. The second sends the transaction as the named spender. Open its printed transaction URL.

Look for:

- **Success** and the transaction's block number.
- The spender as the transaction sender and Ordin as the target.
- A **USDT transfer** from the policy owner to the recipient.
- Ordin's **PaymentCollected** event and the corresponding token **Transfer** event.
- Network fees charged to the transaction sender.

Immediately try `yarn chain collect --id POLICY_ID` again. It should reject the duplicate in simulation, without broadcasting a transaction or charging gas. A rejected simulation will not appear on the explorer. The local test suite also verifies the onchain rule.

Run `yarn chain policy --id POLICY_ID` to see `paid` and `nextDueAt`. Wait until that next billing window, then collect again. The second successful transaction should transfer another 1 USDT. Missed windows do not accumulate into debt. A period is a fixed window, so a payment near its end can be followed soon afterward by a payment in the next window.

## 7. Cancel

```sh
yarn chain cancel --id POLICY_ID --send
yarn chain policy --id POLICY_ID
yarn chain collect --id POLICY_ID
```

Cancellation emits `PolicyCancelled` and makes future collection impossible under that policy. The last command should fail simulation. Earlier payments are not refunded. The token allowance is separate and remains until consumed or explicitly revoked.

## Read transactions and history

```sh
yarn chain receipt --hash TRANSACTION_HASH
yarn chain history
yarn chain history --from-block DEPLOYMENT_BLOCK
```

`receipt` prints transaction status and decoded Ordin events. `history` reads a bounded 1,000-block range and prints explorer links. Its default range is the latest 1,000 blocks. If more history exists, use its `nextFromBlock` value for the next page. Find `deploymentBlock` in `.ordin/sepolia.json`.

An L2 receipt confirms inclusion and execution on Whitechain. It does not imply Ethereum finality. The CLI's execution-gas cost excludes any additional L1 data fee; inspect the explorer for the full fee breakdown.

## Demonstrate a different account paying renewal gas

Create a new policy with `--spender SPENDER_ADDRESS`, where the spender is a separate testnet account funded with WBT. Keep the recipient explicit. Then run collection with that spender's `PRIVATE_KEY` selected locally. The owner supplies USDT; the spender submits the transaction and pays gas. Switch back to the owner key for direct cancellation.

The SDK and local demo also support owner-signed creation and cancellation relayed by another account. The testnet CLI currently uses direct owner creation/cancellation. Initial token approval is not gasless, and this walkthrough does not claim otherwise.

## Verify the deployed source

Open the printed contract link, choose the explorer's contract verification flow, and select Solidity standard JSON input. Use `.ordin/compiler-input.json`, the compiler version recorded in `.ordin/sepolia.json` (currently `v0.8.30+commit.73712a01`), and contract `contracts/Ordin.sol:Ordin`. There are no constructor arguments. Optimization and the Prague EVM target are included in the JSON input.

Source verification is separate from deployment and transaction success. The CLI does not automatically publish source. Keep the saved compiler input from deployment so a later code change does not change the source you submit for that address.

Whitechain's [explorer documentation](https://docs.whitechain.io/build/block-explorer/overview) explains transaction, token-transfer, and verified-contract views.
