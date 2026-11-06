import { readFileSync } from 'node:fs';
import { network } from 'hardhat';
import { createPublicClient, createWalletClient, custom, type Abi, type Address, type Hex } from 'viem';
import { hardhat } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ordinAbi, type PolicyTerms } from '../sdk/index.ts';

export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  return JSON.parse(readFileSync(new URL(`../artifacts/${name}.json`, import.meta.url), 'utf8'));
}
export async function localFixture() {
  const connection = await network.create('local');
  const transport = custom(connection.provider);
  const client = createPublicClient({ chain: hardhat, transport });
  // Public deterministic test-only keys. Never used outside this ephemeral local network.
  const accounts = [1, 2, 3, 4].map(n => privateKeyToAccount(`0x${n.toString(16).padStart(64, '0')}`));
  for (const account of accounts) await connection.provider.request({ method: 'hardhat_setBalance', params: [account.address, '0x56BC75E2D63100000'] });
  const wallets = accounts.map(account => createWalletClient({ account, chain: hardhat, transport }));
  async function send(index: number, call: { to: Address; data: Hex }) {
    const hash = await wallets[index].sendTransaction(call);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error('Transaction reverted');
    return receipt;
  }
  async function deploy(name: string, args: readonly unknown[] = []) {
    const data = artifact(name);
    const hash = await wallets[0].deployContract({ ...data, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress || receipt.status !== 'success') throw new Error('Deployment failed');
    return receipt.contractAddress;
  }
  const contract = await deploy('Ordin');
  const token = await deploy('TestToken');
  const now = (await client.getBlock()).timestamp;
  const terms: PolicyTerms = { token, spender: accounts[1].address, recipient: accounts[2].address,
    amount: 5_000_000n, interval: 300n, start: now, expiry: 0n };
  async function time(timestamp: bigint) {
    await connection.provider.request({ method: 'evm_setNextBlockTimestamp', params: [Number(timestamp)] });
    await connection.provider.request({ method: 'evm_mine' });
  }
  return { connection, client, accounts, wallets, send, deploy, contract, token, terms, time, ordinAbi };
}
