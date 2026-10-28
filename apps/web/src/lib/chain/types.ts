import type { QuoteAsset, TokenInfo, VenueId } from '@oxbow/shared';

export type LockChoice = { kind: 'burn' } | { kind: 'none' } | { kind: 'lock'; days: number; pct: number };

export interface CreatePoolParams {
  token: TokenInfo;
  quote: QuoteAsset;
  baseAmount: number;
  quoteAmount: number;
  venue: VenueId;
  feeBps: number;
  lock: LockChoice;
}

/**
 * Progress-modal steps, in order: approve in wallet, verify the quote's price
 * feed, create the pool, lock or burn, publish (register API call).
 */
export const CREATE_STEPS = ['approve', 'verify', 'create', 'lock', 'publish'] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

/**
 * Wallet-signed actions. M1 runs the mock below; M3/M4 implement this with the
 * venue adapters in @oxbow/solana and the user's wallet.
 */
export interface Chain {
  /** UI-unit balances for the given mints. */
  balances(wallet: string, mints: string[]): Promise<Record<string, number>>;
  /** Calls `onStep(i)` as step i becomes active, and `onStep(CREATE_STEPS.length)` when all are done. */
  createPool(wallet: string, p: CreatePoolParams, onStep: (i: number) => void): Promise<{ address: string }>;
  swap(wallet: string, pool: string, quoteIn: number): Promise<{ signature: string }>;
  addLiquidity(wallet: string, pool: string, baseIn: number): Promise<{ signature: string }>;
  claimFees(wallet: string, positionId: string): Promise<{ amountUsd: number }>;
  withdraw(wallet: string, positionId: string): Promise<{ signature: string }>;
}
