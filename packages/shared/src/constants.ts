import type { Brand, VenueId } from './schemas';

export interface VenueInfo {
  id: VenueId;
  /** "Raydium CPMM" */
  label: string;
  /** "Raydium" */
  short: string;
  desc: string;
  /** Estimated one-time setup cost in SOL, shown in the cost breakdown. */
  setupSol: number;
}

/**
 * Venue copy and setup estimates from the prototype. From M3 the adapters in
 * `@oxbow/solana` report real fee tiers and costs; these stay as display defaults.
 */
export const VENUES: readonly VenueInfo[] = [
  {
    id: 'RAYDIUM_CPMM',
    label: 'Raydium CPMM',
    short: 'Raydium',
    desc: 'Classic pool. Picked up by Jupiter and most trading bots.',
    setupSol: 0.15,
  },
  {
    id: 'METEORA_DAMM_V2',
    label: 'Meteora DAMM v2',
    short: 'Meteora',
    desc: 'Can start with a high fee that falls over time to slow snipers.',
    setupSol: 0.02,
  },
  {
    id: 'ORCA_WHIRLPOOL',
    label: 'Orca Whirlpools',
    short: 'Orca',
    desc: 'Full-range position on Orca. Lowest setup cost.',
    setupSol: 0.01,
  },
];

export function venueInfo(id: VenueId): VenueInfo {
  return VENUES.find((v) => v.id === id) ?? VENUES[0]!;
}

export interface FeeTier {
  feeBps: number;
  desc: string;
}

export const FEE_TIERS: readonly FeeTier[] = [
  { feeBps: 25, desc: 'Liquid pairs' },
  { feeBps: 100, desc: 'Most memecoins' },
  { feeBps: 200, desc: 'Very volatile' },
  { feeBps: 500, desc: 'First hours only' },
];

/** Estimated rent for new accounts, in SOL. */
export const NETWORK_RENT_SOL = 0.03;

export const LOCK_DAY_OPTIONS = [30, 90, 180, 365] as const;

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Avatar tiles for the two non-stock quote assets. Stock brands come from `StockAsset`. */
export const NATIVE_BRANDS: Record<'SOL' | 'USDC', Brand> = {
  SOL: { a: '#9B4DFF', b: '#16D9A0', monogram: 'SOL', stock: false },
  USDC: { a: '#4A97EC', b: '#123F80', monogram: '$', stock: false },
};

/** Quick-pick deposit chips in create step 3, by quote kind. */
export function quoteChips(symbol: string, kind: 'STOCK' | 'SOL' | 'USDC'): number[] {
  if (kind === 'USDC' || symbol === 'USDC') return [500, 1000, 2500];
  if (kind === 'SOL' || symbol === 'SOL') return [2, 5, 10];
  return [1, 2, 5];
}
