import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeFunctionData } from 'viem';
import { localFixture, artifact } from '../scripts/local.ts';
import { approveTokenCall, createPolicyCall, policyId, collectCall, cancelPolicyCall } from '../sdk/index.ts';
import { createBillingWorker, paymentWindow } from '../services/merchant/billing.ts';

test('merchant worker renews without the customer and cancellation preserves only paid access', async t => {
  const f = await localFixture();
  t.after(() => f.connection.close());
  await f.send(0, { to: f.token, data: encodeFunctionData({ abi: artifact('TestToken').abi,
    functionName: 'mint', args: [f.accounts[0].address, 10_000_000n] }) });
  await f.send(0, approveTokenCall(f.token, f.contract, 10_000_000n));
  await f.send(0, createPolicyCall(f.contract, f.terms));
  const id = policyId(f.accounts[0].address, 0n);
  const states: string[] = [];
  let count = 0;
  const tick = createBillingWorker({ client: f.client, contract: f.contract,
    spender: f.accounts[1].address, chainId: 31337, policies: async () => [id],
    report: (_, state) => states.push(state), dispatch: async job => {
      count++;
      await f.send(1, collectCall(f.contract, job.id, job.reference));
    } });
  assert.equal((await paymentWindow(f.client, f.contract, id)).paidThrough, 0n);
  await Promise.all([tick(), tick()]);
  assert.equal(count, 1);
  await tick();
  assert.equal(count, 1);
  await f.time(f.terms.start + f.terms.interval);
  await tick();
  assert.equal(count, 2);
  const paidThrough = f.terms.start + 2n * f.terms.interval;
  assert.equal((await paymentWindow(f.client, f.contract, id)).paidThrough, paidThrough);
  await f.time(paidThrough);
  await tick();
  assert.equal(states.at(-1), 'payment_needs_attention');
  assert.equal(count, 2);
  await f.send(0, cancelPolicyCall(f.contract, id));
  await tick();
  assert.equal(states.at(-1), 'cancelled');
  const access = await paymentWindow(f.client, f.contract, id);
  assert.equal(access.paidThrough, paidThrough);
  assert.equal(access.renewable, false);
});
