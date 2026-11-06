import { createPublicClient, http, erc20Abi, parseAbi, zeroAddress } from 'viem';
import { whitechainSepolia, WHITECHAIN_USDT } from '../sdk/index.ts';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';

if (existsSync('.env')) loadEnvFile('.env');

const client = createPublicClient({ chain: whitechainSepolia,
  transport: http(process.env.WHITECHAIN_RPC_URL ?? whitechainSepolia.rpcUrls.default.http[0], { timeout: 15_000, retryCount: 0 }) });
try {
  const chainId = await client.getChainId();
  if (chainId !== 1874) throw new Error(`Unexpected chain ID ${chainId}`);
  const code = await client.getCode({ address: WHITECHAIN_USDT });
  if (!code || code === '0x') throw new Error('Required USDT address has no deployed code');
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: 'decimals' }),
  ]);
  console.log(JSON.stringify({ chainId, token: WHITECHAIN_USDT, symbol, decimals, codePresent: true }));
  if (symbol !== 'USDT' || decimals !== 6) throw new Error('Token metadata differs from official configuration');
  const abi = parseAbi(['function nonces(address) view returns (uint256)', 'function DOMAIN_SEPARATOR() view returns (bytes32)']);
  const probes = await Promise.allSettled([
    client.readContract({ address: WHITECHAIN_USDT, abi, functionName: 'nonces', args: [zeroAddress] }),
    client.readContract({ address: WHITECHAIN_USDT, abi, functionName: 'DOMAIN_SEPARATOR' }),
  ]);
  console.log(JSON.stringify({ permitReadProbes: probes.map((p, i) => ({ method: i ? 'DOMAIN_SEPARATOR' : 'nonces',
    status: p.status, ...(p.status === 'fulfilled' ? { value: String(p.value) } : {}) })) }));
  console.log('These read probes do not prove permit support. Verify the ABI/implementation and a valid signed permit on a fork before claiming gasless setup.');
} catch (error) {
  // Do not print full provider errors: a custom RPC URL may contain credentials.
  console.error('Network verification failed. Check RPC reachability, chain ID and required token metadata.');
  if (error instanceof Error && !('details' in error)) console.error(error.message);
  process.exitCode = 1;
}
