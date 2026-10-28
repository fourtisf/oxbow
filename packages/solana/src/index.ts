/**
 * Venue adapters (Raydium CPMM, Meteora DAMM v2, Orca Whirlpools), lock
 * helpers and transaction utilities. M1 defines only the shared interface from
 * brief section 8; implementations land in M3 (Raydium) and M4 (Meteora, Orca,
 * locks). Transaction types stay structural here so this package doesn't pull
 * in @solana/web3.js before it's needed.
 */
import type { VenueId } from '@oxbow/shared';

export interface FeeTier {
  feeBps: number;
  /** Venue-side config id (e.g. Raydium's CPMM fee config). */
  configId?: string;
  /** Meteora's decaying "slow snipers" schedule, when supported. */
  scheduler?: { startBps: number; endBps: number; durationSec: number };
}

export interface MintInfo {
  mint: string;
  decimals: number;
  tokenProgram: 'spl-token' | 'token-2022';
  /** Token-2022 extension names. */
  extensions: string[];
}

export type LockMode = { kind: 'burn' } | { kind: 'none' } | { kind: 'time'; untilUnix: number; pct: number };

export interface CreateParams {
  payer: string;
  base: MintInfo;
  quote: MintInfo;
  /** Raw amounts (base units). */
  baseAmount: bigint;
  quoteAmount: bigint;
  fee: FeeTier;
  lock: LockMode;
  /** Oxbow fee transfer appended to the create transaction. */
  oxbowFee: { treasury: string; lamports: bigint };
}

export interface LockParams {
  owner: string;
  pool: string;
  lock: LockMode;
}

export interface LiquidityParams {
  owner: string;
  pool: string;
  amount: bigint;
  slippageBps: number;
}

export interface PositionInfo {
  pool: string;
  owner: string;
  share: number;
  baseAmount: bigint;
  quoteAmount: bigint;
  unclaimedBase: bigint;
  unclaimedQuote: bigint;
  lock: LockMode;
}

/** A serialized, unsigned v0 transaction, built in the browser and signed in the wallet. */
export type UnsignedTx = Uint8Array;

export interface VenueAdapter {
  id: VenueId;
  feeTiers(): Promise<FeeTier[]>;
  supportsMint(mint: MintInfo): boolean;
  buildCreatePool(p: CreateParams): Promise<UnsignedTx[]>;
  buildLock(p: LockParams): Promise<UnsignedTx[]>;
  buildAddLiquidity(p: LiquidityParams): Promise<UnsignedTx[]>;
  buildRemoveLiquidity(p: LiquidityParams): Promise<UnsignedTx[]>;
  buildClaimFees(p: { owner: string; pool: string }): Promise<UnsignedTx[]>;
  readPosition(owner: string, pool: string): Promise<PositionInfo>;
}
