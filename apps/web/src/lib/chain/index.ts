import { SAMPLE_DATA } from '../api/mode';
import { mockChain } from './mock';
import { ChainError, type Chain } from './types';

/**
 * Wallet-signed actions. Sample-data mode simulates them; with live data they
 * stay off until pool creation (M3) and liquidity management (M4) ship, and
 * the UI shows "opens soon" instead of a button that would fail.
 */
export const CHAIN_READY = SAMPLE_DATA;

const notReady = async (): Promise<never> => {
  throw new ChainError('NOT_READY');
};

const liveChain: Chain = {
  // Balances arrive with the wallet adapter; nothing can be spent yet anyway.
  balances: async (_wallet, mints) => Object.fromEntries(mints.map((m) => [m, 0])),
  createPool: notReady,
  swap: notReady,
  addLiquidity: notReady,
  claimFees: notReady,
  withdraw: notReady,
};

export const chain: Chain = SAMPLE_DATA ? mockChain : liveChain;
