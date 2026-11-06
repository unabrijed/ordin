/** Small framework-neutral checkout adapter. No private keys or app entitlement logic. */
export function createOrdinCheckout({request, provider, owner, local, onProgress=()=>{}}) {
 const sign=async typed=>local?undefined:provider.request({method:'eth_signTypedData_v4',params:[owner,JSON.stringify({...typed,types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],...typed.types}})]});
 return {
  async approve(reset=false){onProgress(reset?'Resetting previous allowance…':'Approving a finite token allowance…');const result=await request('/api/approval',{reset});if(result.call){
   const tx=await provider.request({method:'eth_sendTransaction',params:[{from:owner,...result.call}]});
   for(let i=0;i<120;i++){const receipt=await provider.request({method:'eth_getTransactionReceipt',params:[tx]});if(receipt){if(receipt.status!=='0x1')throw Error('Approval reverted');return tx;}await new Promise(r=>setTimeout(r,1000));}
   throw Error(`Approval still pending: ${tx}. Check the explorer before retrying.`);
  }return result.hash;},
  async subscribe(){onProgress('Preparing your payment terms…');const q=await request('/api/checkout/prepare',{});onProgress(local?'Authorizing with the local demo wallet…':'Sign the payment authorization in your wallet…');const signature=await sign(q.typedData);onProgress('Merchant is registering your policy…');return request('/api/checkout/submit',{id:q.id,signature});},
  async cancel(policyId){const q=await request('/api/cancel/prepare',{policyId});onProgress('Authorizing cancellation…');const signature=await sign(q.typedData);return request('/api/cancel/submit',{id:q.id,signature});}
 };
}
