import type { HardhatUserConfig } from 'hardhat/config';

export default {
  networks: { local: { type: 'edr-simulated', chainType: 'l1' } },
} satisfies HardhatUserConfig;
