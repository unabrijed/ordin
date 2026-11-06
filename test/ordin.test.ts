import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeErrorResult, encodeFunctionData, erc20Abi, zeroAddress, type Hex } from 'viem';
import { localFixture, artifact } from '../scripts/local.ts';
import { approveTokenCall, createPolicyCall, collectCall, cancelPolicyCall, policyId, inspectPolicy,
  createPolicyTypedData, registerSignedPolicyCall, cancelPolicyTypedData, cancelSignedPolicyCall,
  ordinAbi, readNonce, readPolicy, paymentEvents, simulateCollection } from '../sdk/index.ts';

function errorNamed(name: string) {
  return (error: unknown) => {
    const data = /return data: (0x[0-9a-f]+)/i.exec(String(error))?.[1] as Hex | undefined;
    if (!data) return false;
    return decodeErrorResult({ abi: ordinAbi, data }).errorName === name;
  };
}

type Fixture = Awaited<ReturnType<typeof localFixture>>;
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const f = await localFixture();
  t.after(() => f.connection.close());
  await tokenCall(f, 'mint', [f.accounts[0].address, 100_000_000n]);
  await f.send(0, approveTokenCall(f.token, f.contract, 100_000_000n));
  return f;
}
async function tokenCall(f: Fixture, functionName: string, args: unknown[]) {
  return f.send(0, { to: f.token, data: encodeFunctionData({ abi: artifact('TestToken').abi, functionName, args }) });
}
async function create(f: Fixture) {
  const nonce = await readNonce(f.client, f.contract, f.accounts[0].address);
  await f.send(0, createPolicyCall(f.contract, f.terms));
  return policyId(f.accounts[0].address, nonce);
}
async function balance(f: Fixture, index: number) {
  return f.client.readContract({ address: f.token, abi: erc20Abi, functionName: 'balanceOf', args: [f.accounts[index].address] });
}

test('customer keeps funds; spender pays gas; collection transfers exactly once and emits a receipt', async t => {
  const f = await fixture(t);
  const id = await create(f);
  assert.equal(await balance(f, 0), 100_000_000n);
  const customerGasBefore = await f.client.getBalance({ address: f.accounts[0].address });
  const spenderGasBefore = await f.client.getBalance({ address: f.accounts[1].address });
  const reference = `0x${'12'.repeat(32)}` as Hex;
  await simulateCollection(f.client, f.contract, id, f.accounts[1].address);
  const receipt = await f.send(1, collectCall(f.contract, id, reference));
  assert.equal(await balance(f, 0), 95_000_000n);
  assert.equal(await balance(f, 2), 5_000_000n);
  assert.equal(await f.client.getBalance({ address: f.accounts[0].address }), customerGasBefore);
  assert.ok(await f.client.getBalance({ address: f.accounts[1].address }) < spenderGasBefore);
  const events = paymentEvents(f.contract, receipt.logs);
  assert.equal(events.length, 1);
  assert.equal(events[0].args.paymentReference, reference);
  assert.equal(events[0].args.period, 0n);
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("NotCollectible"));
});

test('period boundaries, skipped periods, and expiry are enforced without arrears', async t => {
  const f = await fixture(t);
  f.terms.start += 30n;
  f.terms.expiry = f.terms.start + 1500n;
  const id = await create(f);
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("NotCollectible"));
  await f.time(f.terms.start);
  await f.send(1, collectCall(f.contract, id));
  await f.time(f.terms.start + 300n);
  await f.send(1, collectCall(f.contract, id));
  await f.time(f.terms.start + 1200n);
  await f.send(1, collectCall(f.contract, id));
  assert.equal(await balance(f, 2), 15_000_000n);
  assert.equal((await readPolicy(f.client, f.contract, id)).lastPaidPeriodPlusOne, 5n);
  await f.time(f.terms.expiry);
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("NotCollectible"));
});

test('only the spender collects; only the owner cancels; cancellation remains permanent', async t => {
  const f = await fixture(t);
  const id = await create(f);
  await assert.rejects(f.send(3, collectCall(f.contract, id)), errorNamed("Unauthorized"));
  await assert.rejects(f.send(1, cancelPolicyCall(f.contract, id)), errorNamed("Unauthorized"));
  await f.send(0, cancelPolicyCall(f.contract, id));
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("NotCollectible"));
  await f.time(f.terms.start + 900n);
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("NotCollectible"));
  await assert.rejects(f.send(0, cancelPolicyCall(f.contract, id)), errorNamed("AlreadyCancelled"));
  const next = await create(f);
  assert.notEqual(next, id);
  assert.equal((await readPolicy(f.client, f.contract, id)).cancelled, true);
});

test('insufficient balance and allowance roll back payment state and allow retry', async t => {
  const f = await fixture(t);
  const id = await create(f);
  await f.send(0, approveTokenCall(f.token, f.contract, 0n));
  await assert.rejects(f.send(1, collectCall(f.contract, id)));
  assert.equal((await readPolicy(f.client, f.contract, id)).lastPaidPeriodPlusOne, 0n);
  await f.send(0, approveTokenCall(f.token, f.contract, 100_000_000n));
  await f.send(0, { to: f.token, data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [f.accounts[3].address, 99_000_000n] }) });
  await assert.rejects(f.send(1, collectCall(f.contract, id)));
  assert.equal((await readPolicy(f.client, f.contract, id)).lastPaidPeriodPlusOne, 0n);
  await tokenCall(f, 'mint', [f.accounts[0].address, 4_000_000n]);
  await f.send(1, collectCall(f.contract, id));
  assert.equal(await balance(f, 2), 5_000_000n);
});

test('false-returning and fee-charging transfers revert atomically', async t => {
  const f = await fixture(t);
  const id = await create(f);
  await tokenCall(f, 'setFailure', [true]);
  await assert.rejects(f.send(1, collectCall(f.contract, id)));
  await tokenCall(f, 'setFailure', [false]);
  await tokenCall(f, 'setFee', [true]);
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("UnsupportedTokenTransfer"));
  assert.equal(await balance(f, 0), 100_000_000n);
  assert.equal(await balance(f, 2), 0n);
  assert.equal((await readPolicy(f.client, f.contract, id)).lastPaidPeriodPlusOne, 0n);
  await tokenCall(f, 'setFee', [false]);
  await f.send(1, collectCall(f.contract, id));
});

test('invalid terms and unknown policies are rejected', async t => {
  const f = await fixture(t);
  for (const change of [{ amount: 0n }, { interval: 0n }, { token: zeroAddress }, { spender: zeroAddress },
    { recipient: zeroAddress }, { recipient: f.accounts[0].address }, { expiry: f.terms.start }]) {
    await assert.rejects(f.send(0, createPolicyCall(f.contract, { ...f.terms, ...change })), errorNamed("InvalidTerms"));
  }
  assert.equal(await readNonce(f.client, f.contract, f.accounts[0].address), 0n);
  const id = policyId(f.accounts[0].address, 99n);
  await assert.rejects(f.send(1, collectCall(f.contract, id)), errorNamed("UnknownPolicy"));
  assert.equal((await inspectPolicy(f.client, f.contract, id)).status, 'unknown');
});

test('signed creation and cancellation can be sponsored; signatures cannot be replayed', async t => {
  const f = await fixture(t);
  const owner = f.accounts[0];
  const deadline = f.terms.start + 1000n;
  const signature = await owner.signTypedData(createPolicyTypedData(f.contract, 31337, owner.address, f.terms, 0n, deadline));
  const call = registerSignedPolicyCall(f.contract, owner.address, f.terms, 0n, deadline, signature);
  const before = await f.client.getBalance({ address: owner.address });
  await f.send(3, call);
  await assert.rejects(f.send(3, call), errorNamed("InvalidAuthorization"));
  const id = policyId(owner.address, 0n);
  await f.send(1, collectCall(f.contract, id));
  const cancellation = await owner.signTypedData(cancelPolicyTypedData(f.contract, 31337, owner.address, id, 1n, deadline));
  await f.send(3, cancelSignedPolicyCall(f.contract, id, 1n, deadline, cancellation));
  await assert.rejects(f.send(3, cancelSignedPolicyCall(f.contract, id, 1n, deadline, cancellation)), errorNamed("InvalidAuthorization"));
  assert.equal(await f.client.getBalance({ address: owner.address }), before);
  assert.equal((await readPolicy(f.client, f.contract, id)).cancelled, true);
});

test('authorization binds terms, chain, contract, owner, nonce and deadline', async t => {
  const f = await fixture(t);
  const owner = f.accounts[0];
  const deadline = f.terms.start + 1000n;
  const data = createPolicyTypedData(f.contract, 31337, owner.address, f.terms, 0n, deadline);
  const signature = await owner.signTypedData(data);
  await assert.rejects(f.send(3, registerSignedPolicyCall(f.contract, owner.address, { ...f.terms, amount: 1n }, 0n, deadline, signature)), errorNamed("InvalidAuthorization"));
  for (const altered of [
    { ...data, domain: { ...data.domain, chainId: 1874 } },
    { ...data, domain: { ...data.domain, verifyingContract: f.token } },
  ]) {
    const sig = await owner.signTypedData(altered);
    await assert.rejects(f.send(3, registerSignedPolicyCall(f.contract, owner.address, f.terms, 0n, deadline, sig)), errorNamed("InvalidAuthorization"));
  }
  const wrongOwner = await f.accounts[3].signTypedData(data);
  await assert.rejects(f.send(3, registerSignedPolicyCall(f.contract, owner.address, f.terms, 0n, deadline, wrongOwner)), errorNamed("InvalidAuthorization"));
  await f.send(0, { to: f.contract, data: encodeFunctionData({ abi: f.ordinAbi, functionName: 'invalidateAuthorizations' }) });
  await assert.rejects(f.send(3, registerSignedPolicyCall(f.contract, owner.address, f.terms, 0n, deadline, signature)), errorNamed("InvalidAuthorization"));
  const fresh = await owner.signTypedData(createPolicyTypedData(f.contract, 31337, owner.address, f.terms, 1n, deadline));
  await f.time(deadline + 1n);
  await assert.rejects(f.send(3, registerSignedPolicyCall(f.contract, owner.address, f.terms, 1n, deadline, fresh)), errorNamed("AuthorizationExpired"));
});

test('SDK eligibility combines window, allowance and balance at the same block', async t => {
  const f = await fixture(t);
  const id = await create(f);
  assert.equal((await inspectPolicy(f.client, f.contract, id)).canCollect, true);
  await f.send(0, approveTokenCall(f.token, f.contract, 0n));
  assert.equal((await inspectPolicy(f.client, f.contract, id)).canCollect, false);
});

test('token callback cannot reenter collection', async t => {
  const f = await fixture(t);
  const token = await f.deploy('ReentrantToken');
  const abi = artifact('ReentrantToken').abi;
  await f.send(0, { to: token, data: encodeFunctionData({ abi, functionName: 'mint', args: [f.accounts[0].address, 50_000_000n] }) });
  await f.send(0, approveTokenCall(token, f.contract, 50_000_000n));
  f.terms.token = token;
  f.terms.spender = token;
  const id = await create(f);
  await f.send(1, { to: token, data: encodeFunctionData({ abi, functionName: 'attack', args: [f.contract, id] }) });
  assert.equal(await f.client.readContract({ address: token, abi, functionName: 'reentrySucceeded' }), false);
  assert.equal(await f.client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [f.accounts[2].address] }), 5_000_000n);
});

test('ERC-1271 owners can authorize creation and cancellation', async t => {
  const f = await fixture(t);
  const wallet = await f.deploy('TestWallet', [f.accounts[0].address]);
  const deadline = f.terms.start + 1000n;
  const signature = await f.accounts[0].signTypedData(createPolicyTypedData(f.contract, 31337, wallet, f.terms, 0n, deadline));
  await f.send(3, registerSignedPolicyCall(f.contract, wallet, f.terms, 0n, deadline, signature));
  const id = policyId(wallet, 0n);
  assert.equal((await readPolicy(f.client, f.contract, id)).owner.toLowerCase(), wallet.toLowerCase());
  const cancellation = await f.accounts[0].signTypedData(cancelPolicyTypedData(f.contract, 31337, wallet, id, 1n, deadline));
  await f.send(3, cancelSignedPolicyCall(f.contract, id, 1n, deadline, cancellation));
  assert.equal((await readPolicy(f.client, f.contract, id)).cancelled, true);
});

test('cancellation signatures cannot cancel a different policy or be forged', async t => {
  const f = await fixture(t);
  const first = await create(f);
  const second = await create(f);
  const deadline = f.terms.start + 1000n;
  const data = cancelPolicyTypedData(f.contract, 31337, f.accounts[0].address, first, 2n, deadline);
  const sig = await f.accounts[0].signTypedData(data);
  await assert.rejects(f.send(3, cancelSignedPolicyCall(f.contract, second, 2n, deadline, sig)), errorNamed('InvalidAuthorization'));
  const forged = await f.accounts[1].signTypedData(data);
  await assert.rejects(f.send(3, cancelSignedPolicyCall(f.contract, first, 2n, deadline, forged)), errorNamed('InvalidAuthorization'));
  assert.equal((await readPolicy(f.client, f.contract, first)).cancelled, false);
});
