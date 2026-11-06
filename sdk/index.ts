import { defineChain, encodeAbiParameters, encodeFunctionData, erc20Abi, keccak256, parseEventLogs,
  type Address, type Hex, type PublicClient, type Log } from 'viem';
import { ordinAbi } from './abi.ts';
export { ordinAbi };

export const whitechainSepolia = defineChain({
  id: 1874, name: 'Whitechain Sepolia', nativeCurrency: { name: 'WhiteBIT Coin', symbol: 'WBT', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.whitechain.io'] } },
  blockExplorers: { default: { name: 'Whitechain Explorer', url: 'https://explorer.testnet.whitechain.io' } },
  testnet: true,
});
export const WHITECHAIN_USDT: Address = '0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7';
export const USDT_DECIMALS = 6;
export const statuses = ['unknown', 'scheduled', 'collectible', 'paid', 'expired', 'cancelled'] as const;
export type PolicyTerms = {
  token: Address; spender: Address; recipient: Address; amount: bigint;
  interval: bigint; start: bigint; expiry: bigint;
};

const termFields = [
  { name: 'token', type: 'address' }, { name: 'spender', type: 'address' },
  { name: 'recipient', type: 'address' }, { name: 'amount', type: 'uint256' },
  { name: 'interval', type: 'uint64' }, { name: 'start', type: 'uint64' }, { name: 'expiry', type: 'uint64' },
] as const;
const authorizationFields = [{ name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] as const;

export function policyId(owner: Address, nonce: bigint): Hex {
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [owner, nonce]));
}
function domain(contract: Address, chainId: number) {
  return { name: 'Ordin', version: '1', chainId, verifyingContract: contract } as const;
}
export function createPolicyTypedData(contract: Address, chainId: number, owner: Address, terms: PolicyTerms, nonce: bigint, deadline: bigint) {
  return { domain: domain(contract, chainId), primaryType: 'CreatePolicy', types: {
    CreatePolicy: [{ name: 'owner', type: 'address' }, ...termFields, ...authorizationFields],
  }, message: { owner, ...terms, nonce, deadline } } as const;
}
export function cancelPolicyTypedData(contract: Address, chainId: number, owner: Address, id: Hex, nonce: bigint, deadline: bigint) {
  return { domain: domain(contract, chainId), primaryType: 'CancelPolicy', types: {
    CancelPolicy: [{ name: 'owner', type: 'address' }, { name: 'policyId', type: 'bytes32' }, ...authorizationFields],
  }, message: { owner, policyId: id, nonce, deadline } } as const;
}

// Wallet-agnostic transaction builders. Callers choose signer, gas policy and broadcasting service.
export function createPolicyCall(contract: Address, terms: PolicyTerms) {
  return { to: contract, data: encodeFunctionData({ abi: ordinAbi, functionName: 'createPolicy', args: [terms] }) };
}
export function registerSignedPolicyCall(contract: Address, owner: Address, terms: PolicyTerms, nonce: bigint, deadline: bigint, signature: Hex) {
  return { to: contract, data: encodeFunctionData({ abi: ordinAbi, functionName: 'createPolicyWithSignature', args: [owner, terms, nonce, deadline, signature] }) };
}
export function collectCall(contract: Address, id: Hex, reference: Hex = `0x${'00'.repeat(32)}`) {
  return { to: contract, data: encodeFunctionData({ abi: ordinAbi, functionName: 'collect', args: [id, reference] }) };
}
export function cancelPolicyCall(contract: Address, id: Hex) {
  return { to: contract, data: encodeFunctionData({ abi: ordinAbi, functionName: 'cancelPolicy', args: [id] }) };
}
export function cancelSignedPolicyCall(contract: Address, id: Hex, nonce: bigint, deadline: bigint, signature: Hex) {
  return { to: contract, data: encodeFunctionData({ abi: ordinAbi, functionName: 'cancelPolicyWithSignature', args: [id, nonce, deadline, signature] }) };
}
export function approveTokenCall(token: Address, contract: Address, allowance: bigint) {
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [contract, allowance] }) };
}

export async function readPolicy(client: PublicClient, contract: Address, id: Hex) {
  return client.readContract({ address: contract, abi: ordinAbi, functionName: 'getPolicy', args: [id] });
}
export async function readNonce(client: PublicClient, contract: Address, owner: Address) {
  return client.readContract({ address: contract, abi: ordinAbi, functionName: 'nonces', args: [owner] });
}
export async function inspectPolicy(client: PublicClient, contract: Address, id: Hex) {
  // One block for a consistent snapshot; simulation is still required immediately before sending.
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const [status, period, nextDueAt] = await client.readContract({ address: contract, abi: ordinAbi, functionName: 'policyStatus', args: [id], blockNumber });
  if (status === 0) return { status: statuses[status], period, nextDueAt, blockNumber, canCollect: false };
  const policy = await client.readContract({ address: contract, abi: ordinAbi, functionName: 'getPolicy', args: [id], blockNumber });
  const [balance, allowance] = await Promise.all([
    client.readContract({ address: policy.terms.token, abi: erc20Abi, functionName: 'balanceOf', args: [policy.owner], blockNumber }),
    client.readContract({ address: policy.terms.token, abi: erc20Abi, functionName: 'allowance', args: [policy.owner, contract], blockNumber }),
  ]);
  return { status: statuses[status], period, nextDueAt, blockNumber, policy, balance, allowance,
    canCollect: status === 2 && balance >= policy.terms.amount && allowance >= policy.terms.amount };
}
export async function simulateCollection(client: PublicClient, contract: Address, id: Hex, spender: Address) {
  return client.simulateContract({ address: contract, abi: ordinAbi, functionName: 'collect',
    args: [id, `0x${'00'.repeat(32)}`], account: spender });
}
export function paymentEvents(contract: Address, logs: Log[]) {
  return parseEventLogs({ abi: ordinAbi, eventName: 'PaymentCollected',
    logs: logs.filter(log => log.address.toLowerCase() === contract.toLowerCase()) });
}
