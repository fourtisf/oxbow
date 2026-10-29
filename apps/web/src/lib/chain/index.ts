import { SAMPLE_DATA } from '../api/mode';
import { liveChain } from './live';
import { mockChain } from './mock';
import type { Chain } from './types';

/**
 * Wallet-signed actions: simulated on sample data, real with live data. Pool
 * creation is live once the API says so (`/api/venues`); swaps and liquidity
 * management stay off until M4/M5, and the UI says "opens soon" for them.
 */
export const CHAIN_READY = SAMPLE_DATA;

export const chain: Chain = SAMPLE_DATA ? mockChain : liveChain;
