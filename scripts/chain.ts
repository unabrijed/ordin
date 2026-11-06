import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createPublicClient, createWalletClient, http, erc20Abi, formatEther, formatUnits,
  getAddress, parseUnits, parseEventLogs, decodeEventLog, type Address, type Hex, type Transport } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ordinAbi, whitechainSepolia, WHITECHAIN_USDT, inspectPolicy, readPolicy, type PolicyTerms } from '../sdk/index.ts';

const explorer = whitechainSepolia.blockExplorers.default.url;
export class UsageError extends Error {}
export const help = `Ordin on Whitechain Sepolia (1874)

yarn chain balance --address 0x...             Read WBT and official USDT balances
yarn chain deploy [--send]                     Deploy and save the contract address
yarn chain approve --amount 3 [--send]         Set USDT allowance to exactly 3
yarn chain create --recipient 0x... --amount 1 --interval 120 --cycles 3 [--spender 0x...] [--send]
yarn chain policy --id 0x...                   Read policy, eligibility and next window
yarn chain collect --id 0x... [--send]          Collect as the named spender
yarn chain cancel --id 0x... [--send]           Cancel as the owner
yarn chain history [--from-block 123]          Read the latest 1,000 blocks of events
yarn chain receipt --hash 0x...               Inspect a transaction and decode its events

Writes simulate/estimate by default; --send broadcasts a transaction.
PRIVATE_KEY selects the signing wallet. Keep it only in your local .env.
ORDIN_ADDRESS or --contract overrides the address saved by deploy.
No command mints USDT, auto-funds wallets, or runs a recurring scheduler.
`;
export function parseAmount(value: string | undefined, allowZero = false): bigint {
  if (!value || !/^\d+(\.\d{1,6})?$/.test(value)) throw new UsageError('Use --amount with a decimal USDT amount and at most 6 fractional digits.');
  const amount = parseUnits(value, 6);
  if ((!allowZero && amount === 0n) || amount >= 2n ** 256n) throw new UsageError('Amount must be positive and fit uint256.');
  return amount;
}
function positive(value: string | undefined, label: string): bigint {
  if (!value || !/^[1-9]\d*$/.test(value)) throw new UsageError(`${label} must be a positive integer.`);
  return BigInt(value);
}
function address(value: string | undefined, label: string): Address {
  try { if (value) return getAddress(value); } catch { /* Report a stable error, without the supplied value. */ }
  throw new UsageError(`${label} must be a valid 0x address.`);
}
function hash(value: string | undefined, label: string): Hex {
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new UsageError(`${label} must be 32 bytes of hex.`);
  return value as Hex;
}
export function makeTerms(options: { amount?: string; interval?: string; cycles?: string; recipient?: string; spender?: string }, owner: Address, now: bigint): PolicyTerms {
  const interval = positive(options.interval ?? '120', '--interval');
  const cycles = positive(options.cycles ?? '3', '--cycles');
  const expiry = now + interval * cycles;
  if (interval < 10n || expiry >= 2n ** 64n) throw new UsageError('Interval must be at least 10 seconds and expiry must fit uint64.');
  const recipient = address(options.recipient, '--recipient');
  if (recipient.toLowerCase() === owner.toLowerCase() || /^0x0{40}$/i.test(recipient)) throw new UsageError('Recipient must be a nonzero wallet different from the owner.');
  const spender = options.spender ? address(options.spender, '--spender') : owner;
  if (/^0x0{40}$/i.test(spender)) throw new UsageError('Spender cannot be the zero address.');
  return { token: WHITECHAIN_USDT, spender, recipient, amount: parseAmount(options.amount), interval, start: now, expiry };
}

type Options = {
  env?: NodeJS.ProcessEnv; transport?: Transport; stateDir?: string; log?: (message: string) => void;
};
export async function runChain(argv: string[], options: Options = {}) {
  const { values, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    send: { type: 'boolean' }, help: { type: 'boolean' }, address: { type: 'string' },
    contract: { type: 'string' }, amount: { type: 'string' }, interval: { type: 'string' },
    cycles: { type: 'string' }, recipient: { type: 'string' }, spender: { type: 'string' },
    id: { type: 'string' }, hash: { type: 'string' }, 'from-block': { type: 'string' },
  } });
  const log = options.log ?? console.log;
  if (values.help || positionals.length === 0) { log(help); return; }
  const command = positionals[0];
  if (positionals.length !== 1 || !['balance', 'deploy', 'approve', 'create', 'policy', 'collect', 'cancel', 'history', 'receipt'].includes(command)) {
    throw new UsageError('Unknown command. Run yarn chain --help.');
  }
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? '.ordin';
  const statePath = join(stateDir, 'sepolia.json');
  const saved = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : undefined;
  if (saved && saved.chainId !== 1874) throw new UsageError('Saved deployment is not Whitechain Sepolia.');
  const transport = options.transport ?? http(env.WHITECHAIN_RPC_URL || whitechainSepolia.rpcUrls.default.http[0], { timeout: 15_000, retryCount: 2 });
  const client = createPublicClient({ chain: whitechainSepolia, transport, cacheTime: 0 });
  const chainId = await client.getChainId();
  if (chainId !== 1874) throw new UsageError('Wrong network: this command only supports Whitechain Sepolia (1874).');
  const output = (value: unknown) => log(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  const contractValue = values.contract ?? (env.ORDIN_ADDRESS || undefined) ?? saved?.address;
  function contract() { return address(contractValue, 'Contract address (deploy first or set ORDIN_ADDRESS)'); }

  async function checkToken() {
    const code = await client.getCode({ address: WHITECHAIN_USDT });
    if (!code || code === '0x') throw new UsageError('Official USDT contract has no code on this RPC.');
    const decimals = await client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'decimals' });
    if (decimals !== 6) throw new UsageError('USDT decimals differ from the expected 6; refusing to continue.');
  }
  function signingWallet() {
    const key = env.PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new UsageError('Set PRIVATE_KEY in your local .env to a dedicated funded testnet key. Do not send it in chat.');
    let account;
    try { account = privateKeyToAccount(key as Hex); } catch { throw new UsageError('PRIVATE_KEY is invalid.'); }
    return createWalletClient({ account, chain: whitechainSepolia, transport });
  }
  async function showReceipt(txHash: Hex) {
    log(`Transaction: ${explorer}/tx/${txHash}`);
    const receipt = await client.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 });
    output({ status: receipt.status, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed,
      executionGasCostWBT: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
      note: 'Execution gas only; explorer may show additional L1 data fees. Included on L2, not necessarily finalized on Ethereum.' });
    if (receipt.status !== 'success') throw new UsageError('Transaction reverted. Inspect the explorer link; do not assume payment succeeded.');
    return receipt;
  }
  if (command === 'balance') {
    const wallet = address(values.address ?? env.WALLET_ADDRESS, '--address or WALLET_ADDRESS');
    await checkToken();
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const [wbt, usdt] = await Promise.all([
      client.getBalance({ address: wallet, blockNumber }),
      client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'balanceOf', args: [wallet], blockNumber }),
    ]);
    output({ address: wallet, chainId, blockNumber, WBT: formatEther(wbt), USDT: formatUnits(usdt, 6), explorer: `${explorer}/address/${wallet}` });
    return;
  }
  if (command === 'receipt') {
    const txHash = hash(values.hash, '--hash');
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    output({ hash: txHash, status: receipt.status, blockNumber: receipt.blockNumber, contractAddress: receipt.contractAddress, explorer: `${explorer}/tx/${txHash}` });
    const scope = contractValue ? contract().toLowerCase() : receipt.contractAddress?.toLowerCase();
    for (const entry of receipt.logs) {
      if (scope && entry.address.toLowerCase() !== scope) continue;
      try { output({ emitter: entry.address, ...decodeEventLog({ abi: ordinAbi, data: entry.data, topics: entry.topics }) }); }
      catch { /* Token and unrelated events remain visible in the explorer. */ }
    }
    return;
  }
  if (command === 'deploy') {
    if (saved) throw new UsageError('A deployment is already saved in .ordin/sepolia.json. Reuse it; archive that file explicitly before a deliberate redeployment.');
    const wallet = signingWallet();
    if (!existsSync('artifacts/Ordin.json')) throw new UsageError('Run yarn compile first.');
    const artifact = JSON.parse(readFileSync('artifacts/Ordin.json', 'utf8'));
    const gas = await client.estimateGas({ account: wallet.account, data: artifact.bytecode });
    output({ action: 'deploy', from: wallet.account.address, chainId, estimatedGas: gas, compiler: artifact.compiler });
    if (!values.send) { log('Preview only. Repeat with --send to deploy.'); return; }
    const txHash = await wallet.deployContract({ abi: ordinAbi, bytecode: artifact.bytecode });
    const receipt = await showReceipt(txHash);
    if (!receipt.contractAddress) throw new UsageError('Receipt has no contract address.');
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(statePath, JSON.stringify({ chainId, address: receipt.contractAddress, deploymentBlock: receipt.blockNumber.toString(), transactionHash: txHash, compiler: artifact.compiler }, null, 2) + '\n');
    if (existsSync('artifacts/compiler-input.json')) writeFileSync(join(stateDir, 'compiler-input.json'), readFileSync('artifacts/compiler-input.json'));
    log(`Contract: ${explorer}/address/${receipt.contractAddress}`);
    log(`Saved deployment to ${statePath}. Source verification is a separate explorer step.`);
    return;
  }
  const target = contract();
  const code = await client.getCode({ address: target });
  if (!code || code === '0x') throw new UsageError('Configured Ordin address has no code.');
  // Catch accidental selection of a token or unrelated contract before requesting approvals.
  const domain = await client.readContract({ address: target, abi: ordinAbi, functionName: 'eip712Domain' });
  if (domain[1] !== 'Ordin' || domain[2] !== '1' || domain[3] !== 1874n || domain[4].toLowerCase() !== target.toLowerCase()) {
    throw new UsageError('Contract does not identify as Ordin v1 on this chain.');
  }
  if (command === 'policy') {
    output(await inspectPolicy(client, target, hash(values.id, '--id')));
    log(`Contract: ${explorer}/address/${target}`);
    return;
  }
  if (command === 'history') {
    const latest = await client.getBlockNumber({ cacheTime: 0 });
    if (values['from-block'] !== undefined && !/^\d+$/.test(values['from-block'])) throw new UsageError('--from-block must be a nonnegative integer.');
    const from = values['from-block'] !== undefined ? BigInt(values['from-block']) : latest > 999n ? latest - 999n : 0n;
    if (from > latest) throw new UsageError('--from-block is ahead of the chain.');
    const to = from + 999n < latest ? from + 999n : latest;
    const logs = await client.getLogs({ address: target, fromBlock: from, toBlock: to });
    output({ fromBlock: from, toBlock: to, latestBlock: latest, nextFromBlock: to < latest ? to + 1n : null });
    for (const entry of logs) {
      const event = decodeEventLog({ abi: ordinAbi, topics: entry.topics, data: entry.data });
      output({ ...event, blockNumber: entry.blockNumber, transaction: `${explorer}/tx/${entry.transactionHash}` });
    }
    return;
  }
  const wallet = signingWallet();
  log(`Signing wallet: ${wallet.account.address}`);
  async function submit(request: Parameters<typeof wallet.writeContract>[0]) {
    if (!values.send) { log('Simulation succeeded. Repeat with --send to broadcast.'); return undefined; }
    const txHash = await wallet.writeContract(request);
    return showReceipt(txHash);
  }
  if (command === 'approve') {
    await checkToken();
    const amount = parseAmount(values.amount, true);
    const current = await client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'allowance', args: [wallet.account.address, target] });
    output({ action: 'approve', token: WHITECHAIN_USDT, spender: target, allowanceUSDT: formatUnits(amount, 6), currentAllowanceUSDT: formatUnits(current, 6) });
    if (current === amount) { log('Allowance is already set; no transaction needed.'); return; }
    if (current !== 0n && amount !== 0n) throw new UsageError('First run approve --amount 0 --send, then set the new allowance.');
    const { request } = await client.simulateContract({ account: wallet.account, address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'approve', args: [target, amount] });
    await submit(request);
    return;
  }
  if (command === 'create') {
    await checkToken();
    const now = (await client.getBlock()).timestamp;
    const terms = makeTerms(values, wallet.account.address, now);
    output({ action: 'create', owner: wallet.account.address, terms, amountUSDT: formatUnits(terms.amount, 6), note: 'Creating a policy does not collect payment. No hosted scheduler is running.' });
    const { request } = await client.simulateContract({ account: wallet.account, address: target, abi: ordinAbi, functionName: 'createPolicy', args: [terms] });
    const receipt = await submit(request);
    if (receipt) {
      const event = parseEventLogs({ abi: ordinAbi, eventName: 'PolicyCreated', logs: receipt.logs.filter(l => l.address.toLowerCase() === target.toLowerCase()) })[0];
      if (!event) throw new UsageError('Creation event missing; inspect transaction before retrying.');
      log(`Policy ID: ${event.args.policyId}`);
      output(await inspectPolicy(client, target, event.args.policyId));
    }
    return;
  }
  const id = hash(values.id, '--id');
  const policy = await readPolicy(client, target, id);
  const required = command === 'collect' ? policy.terms.spender : policy.owner;
  if (required.toLowerCase() !== wallet.account.address.toLowerCase()) throw new UsageError(`Use the ${command === 'collect' ? 'spender' : 'owner'} wallet for this action: ${required}`);
  output({ action: command, policyId: id, recipient: policy.terms.recipient, amountUnits: policy.terms.amount });
  if (command === 'collect') {
    const { request } = await client.simulateContract({ account: wallet.account, address: target, abi: ordinAbi, functionName: 'collect', args: [id, `0x${'00'.repeat(32)}`] });
    await submit(request);
  } else {
    const { request } = await client.simulateContract({ account: wallet.account, address: target, abi: ordinAbi, functionName: 'cancelPolicy', args: [id] });
    await submit(request);
  }
  output(await inspectPolicy(client, target, id));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (existsSync('.env')) loadEnvFile('.env');
  runChain(process.argv.slice(2)).catch(error => {
    if (error instanceof UsageError) console.error(error.message);
    else {
      // Do not print full provider errors: they can contain credential-bearing RPC URLs.
      console.error('RPC request or simulation failed. Check connectivity, WBT gas, USDT balance/allowance and policy eligibility. No success is implied.');
      let cause = error;
      for (let depth = 0; cause && depth < 12; depth++, cause = cause.cause) {
        if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT'].includes(cause.code)) {
          console.error(`Network error: ${cause.code}. This does not indicate an onchain transaction failure.`);
          break;
        }
      }
      const contractError = error?.walk?.((e: { name?: string }) => e.name === 'ContractFunctionRevertedError');
      if (contractError?.data?.errorName) console.error(`Contract error: ${contractError.data.errorName}`);
    }
    process.exitCode = 1;
  });
}
