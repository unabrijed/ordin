import { encodeAbiParameters, keccak256, type Address, type Hex, type PublicClient } from 'viem';
import { inspectPolicy, ordinAbi } from '../../sdk/index.ts';

export type PaymentWindow = {
  owner: Address;
  paidThrough: bigint;
  period: bigint | null;
  renewable: boolean;
};

/** Access survives cancellation, but can never extend beyond a paid fixed window. */
export async function paymentWindow(client: PublicClient, contract: Address, id: Hex): Promise<PaymentWindow> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const policy = await client.readContract({ address: contract, abi: ordinAbi,
    functionName: 'getPolicy', args: [id], blockNumber });
  const paid = policy.lastPaidPeriodPlusOne;
  let paidThrough = paid === 0n ? 0n : policy.terms.start + paid * policy.terms.interval;
  if (policy.terms.expiry !== 0n && paidThrough > policy.terms.expiry) paidThrough = policy.terms.expiry;
  return { owner: policy.owner, paidThrough, period: paid === 0n ? null : paid - 1n,
    renewable: !policy.cancelled };
}

export function paymentReference(chainId: number, contract: Address, id: Hex, period: bigint): Hex {
  return keccak256(encodeAbiParameters([
    { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256' },
  ], [BigInt(chainId), contract, id, period]));
}

export type CollectionJob = { id: Hex; period: bigint; reference: Hex };
export type BillingDependencies = {
  client: PublicClient;
  contract: Address;
  spender: Address;
  chainId: number;
  policies(): Promise<Hex[]>;
  // The dispatcher must durably deduplicate and reconcile pending transactions.
  dispatch(job: CollectionJob): Promise<void>;
  report(id: Hex, state: string): void;
};

/** One bounded scan, reusable by a server timer or a deterministic integration test. */
export function createBillingWorker(deps: BillingDependencies) {
  let running = false;
  return async function tick() {
    if (running) return;
    running = true;
    try {
      for (const id of await deps.policies()) {
        try {
          const snapshot = await inspectPolicy(deps.client, deps.contract, id);
          if (!snapshot.policy || snapshot.policy.terms.spender.toLowerCase() !== deps.spender.toLowerCase()) {
            deps.report(id, 'unmanaged'); continue;
          }
          if (!snapshot.canCollect) {
            deps.report(id, snapshot.status === 'collectible' ? 'payment_needs_attention' : snapshot.status);
            continue;
          }
          const reference = paymentReference(deps.chainId, deps.contract, id, snapshot.period);
          await deps.client.simulateContract({ address: deps.contract, abi: ordinAbi,
            functionName: 'collect', args: [id, reference], account: deps.spender });
          await deps.dispatch({ id, period: snapshot.period, reference });
          deps.report(id, 'submitted');
        } catch {
          // RPC error objects may contain credentials in their transport URL.
          deps.report(id, 'retry_required');
        }
      }
    } finally { running = false; }
  };
}
