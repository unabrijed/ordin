import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { network } from 'hardhat';
import { createPublicClient, createWalletClient, custom, erc20Abi, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { runChain, makeTerms, parseAmount } from '../scripts/chain.ts';
import { artifact } from '../scripts/local.ts';
import { WHITECHAIN_USDT, whitechainSepolia, readPolicy } from '../sdk/index.ts';

test('CLI rejects rounded amounts, zero payments, unsafe time ranges and self payments', () => {
  const owner = privateKeyToAccount(`0x${'1'.padStart(64, '0')}`).address;
  const recipient = privateKeyToAccount(`0x${'2'.padStart(64, '0')}`).address;
  assert.equal(parseAmount('1.000001'), 1_000_001n);
  for (const amount of ['0', '-1', '1.0000001', '1e6', 'NaN']) assert.throws(() => parseAmount(amount));
  assert.equal(parseAmount('0', true), 0n);
  assert.throws(() => makeTerms({ amount: '1', recipient: owner }, owner, 100n));
  assert.throws(() => makeTerms({ amount: '1', recipient, interval: '1' }, owner, 100n));
  assert.throws(() => makeTerms({ amount: '1', recipient, cycles: String(2n ** 64n) }, owner, 100n));
});

test('CLI refuses mainnet before loading a signing key or submitting transactions', async () => {
  const transport = custom({ request: async () => '0x753' });
  await assert.rejects(runChain(['deploy', '--send'], { transport, env: {}, stateDir: join(tmpdir(), 'ordin-no-state-mainnet'), log() {} }), /only supports Whitechain Sepolia/);
});

test('CLI deploy, allowance, policy, renewal, cancellation, history and receipts work end to end', async t => {
  const connection = await network.create({ network: 'local', override: { chainId: 1874 } });
  const stateDir = mkdtempSync(join(tmpdir(), 'ordin-cli-'));
  t.after(async () => { await connection.close(); rmSync(stateDir, { recursive: true, force: true }); });
  const transport = custom(connection.provider);
  const client = createPublicClient({ chain: whitechainSepolia, transport });
  const key = `0x${'1'.padStart(64, '0')}` as Hex;
  const owner = privateKeyToAccount(key);
  const recipient = privateKeyToAccount(`0x${'2'.padStart(64, '0')}`).address;
  await connection.provider.request({ method: 'hardhat_setBalance', params: [owner.address, '0x56BC75E2D63100000'] });
  const wallet = createWalletClient({ account: owner, chain: whitechainSepolia, transport });
  const token = artifact('TestToken');
  const tokenTx = await wallet.deployContract(token);
  const tokenReceipt = await client.waitForTransactionReceipt({ hash: tokenTx });
  const code = await client.getCode({ address: tokenReceipt.contractAddress! });
  // Only on the ephemeral EVM: install mock code at the configured token address.
  await connection.provider.request({ method: 'hardhat_setCode', params: [WHITECHAIN_USDT, code] });
  const mint = await wallet.writeContract({ address: WHITECHAIN_USDT, abi: token.abi, functionName: 'mint', args: [owner.address, 10_000_000n] });
  await client.waitForTransactionReceipt({ hash: mint });
  const messages: string[] = [];
  const run = (...args: string[]) => runChain(args, { transport, env: { PRIVATE_KEY: key }, stateDir, log: message => messages.push(message) });
  await run('balance', '--address', owner.address);
  assert.ok(messages.some(m => m.includes('"USDT": "10"')));
  await run('deploy');
  assert.equal(existsSync(join(stateDir, 'sepolia.json')), false);
  await run('deploy', '--send');
  const saved = JSON.parse(readFileSync(join(stateDir, 'sepolia.json'), 'utf8'));
  assert.equal(saved.chainId, 1874);
  await assert.rejects(run('deploy', '--send'), /already saved/);
  await run('approve', '--amount', '3');
  assert.equal(await client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'allowance', args: [owner.address, saved.address] }), 0n);
  await run('approve', '--amount', '3', '--send');
  await run('create', '--recipient', recipient, '--amount', '1', '--interval', '120', '--cycles', '3', '--send');
  const id = messages.find(m => m.startsWith('Policy ID: '))!.slice('Policy ID: '.length) as Hex;
  const policy = await readPolicy(client, saved.address, id);
  await run('collect', '--id', id, '--send');
  await assert.rejects(run('collect', '--id', id, '--send'));
  await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(policy.terms.start + 120n)] });
  await connection.provider.request({ method: 'evm_mine' });
  await run('collect', '--id', id, '--send');
  assert.equal(await client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'balanceOf', args: [recipient] }), 2_000_000n);
  await run('cancel', '--id', id, '--send');
  await run('policy', '--id', id);
  assert.ok(messages.some(m => m.includes('"status": "cancelled"')));
  await run('history', '--from-block', saved.deploymentBlock);
  assert.ok(messages.some(m => m.includes('"eventName": "PaymentCollected"')));
  await run('receipt', '--hash', saved.transactionHash);
  assert.ok(messages.some(m => m.includes('/tx/')));
  await assert.rejects(run('collect', '--id', id, '--send'));
});
