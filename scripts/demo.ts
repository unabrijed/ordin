import { encodeFunctionData, erc20Abi } from 'viem';
import { localFixture, artifact } from './local.ts';
import { approveTokenCall, createPolicyTypedData, registerSignedPolicyCall, cancelPolicyTypedData,
  cancelSignedPolicyCall, collectCall, policyId, paymentEvents } from '../sdk/index.ts';

const f = await localFixture();
try {
  const owner = f.accounts[0];
  await f.send(0, { to: f.token, data: encodeFunctionData({ abi: artifact('TestToken').abi, functionName: 'mint', args: [owner.address, 10_000_000n] }) });
  await f.send(0, approveTokenCall(f.token, f.contract, 15_000_000n));
  console.log('Local test token approved by customer. This initial transaction costs customer gas.');
  const deadline = f.terms.start + 3600n;
  const signature = await owner.signTypedData(createPolicyTypedData(f.contract, 31337, owner.address, f.terms, 0n, deadline));
  await f.send(3, registerSignedPolicyCall(f.contract, owner.address, f.terms, 0n, deadline, signature));
  const id = policyId(owner.address, 0n);
  console.log('Relayer registered a signed 5 TEST / 300-second policy:', id);
  for (const period of [0, 1]) {
    if (period) await f.time(f.terms.start + 300n);
    const receipt = await f.send(1, collectCall(f.contract, id));
    console.log('Spender-paid collection:', paymentEvents(f.contract, receipt.logs)[0].args);
  }
  await f.time(f.terms.start + 600n);
  try { await f.send(1, collectCall(f.contract, id)); throw new Error('Expected insufficient funds'); }
  catch (error) { if (String(error).includes('Expected insufficient')) throw error; console.log('Third payment rejected: customer balance exhausted.'); }
  const cancellation = await owner.signTypedData(cancelPolicyTypedData(f.contract, 31337, owner.address, id, 1n, deadline));
  await f.send(3, cancelSignedPolicyCall(f.contract, id, 1n, deadline, cancellation));
  console.log('Relayer paid to cancel. Future collections are blocked.');
  console.log('Merchant balance:', await f.client.readContract({ address: f.token, abi: erc20Abi, functionName: 'balanceOf', args: [f.accounts[2].address] }));
} finally { await f.connection.close(); }
