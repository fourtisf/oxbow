import type { QuoteAsset, TokenInfo, TradeSide, VenueId } from '@oxbow/shared';

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

export interface SwapParams {
  /** BUY pays the quote asset for base tokens; SELL pays base tokens for the quote asset. */
  side: TradeSide;
  amountIn: number;
  /** Lowest acceptable output after slippage; the swap fails below it. */
  minOut: number;
}

/**
 * Progress-modal steps, in order: approve in wallet, verify the quote's price
 * feed, create the pool, lock or burn, publish (register API call).
 */
export const CREATE_STEPS = ['approve', 'verify', 'create', 'lock', 'publish'] as const;
export type CreateStep = (typeof CREATE_STEPS)[number];

/** Error codes the UI turns into readable messages. */
export type ChainErrorCode = 'SLIPPAGE' | 'NOT_FOUND' | 'INSUFFICIENT';
export class ChainError extends Error {
  constructor(readonly code: ChainErrorCode) {
    super(code);
  }
}

/**
 * Wallet-signed actions. M1 runs the mock; M3/M4 implement this with the
 * venue adapters in @oxbow/solana and the user's wallet.
 */
export interface Chain {
  /** UI-unit balances for the given mints. */
  balances(wallet: string, mints: string[]): Promise<Record<string, number>>;
  /** Calls `onStep(i)` as step i becomes active, and `onStep(CREATE_STEPS.length)` when all are done. */
  createPool(wallet: string, p: CreatePoolParams, onStep: (i: number) => void): Promise<{ address: string }>;
  swap(wallet: string, pool: string, p: SwapParams): Promise<{ signature: string; out: number }>;
  addLiquidity(wallet: string, pool: string, baseIn: number): Promise<{ signature: string }>;
  claimFees(wallet: string, positionId: string): Promise<{ amountUsd: number }>;
  /** Withdraw `pct` (1–100) of a position. */
  withdraw(wallet: string, positionId: string, pct: number): Promise<{ signature: string }>;
}
