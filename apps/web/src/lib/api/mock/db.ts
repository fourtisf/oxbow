/**
 * In-memory mock database. One instance per JS runtime: the server's copy is
 * read-only, the browser's copy is also mutated by the mock chain (create pool,
 * add liquidity, claim, withdraw) so the prototype's interactions keep working
 * until real transactions land in M3/M4.
 */
import {
  AssetRef,
  feeAprPct,
  feeRateFromBps,
  hash,
  HolderSlice,
  LpState,
  NATIVE_BRANDS,
  PoolDetail,
  PoolSummary,
  Position,
  QuoteAsset,
} from '@oxbow/shared';
import { brandFor, fakeMint, MockLp, MockPool, Q, SEED_POOLS, series } from './seed';

export interface MockPosition {
  id: string;
  poolId: string;
  share: number;
  earned: number;
  locked: boolean;
  isCreator: boolean;
}

export interface MockDb {
  /** True once this runtime's data diverged from the seed (a mock transaction ran). */
  dirty: boolean;
  pools: MockPool[];
  positions: MockPosition[];
  /** Base tokens the mock wallet "holds", by mint, after a token lookup. */
  held: Map<string, number>;
}

const g = globalThis as unknown as { __oxbowMockDb?: MockDb };

export function db(): MockDb {
  if (!g.__oxbowMockDb) g.__oxbowMockDb = { dirty: false, pools: SEED_POOLS(), positions: [], held: new Map() };
  return g.__oxbowMockDb;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function quoteAsset(sym: string): QuoteAsset {
  const q = Q[sym]!;
  return {
    mint: fakeMint(sym),
    symbol: q.sym,
    name: q.name,
    logoUri: null,
    brand: q.kind === 'STOCK' ? brandFor(sym) : NATIVE_BRANDS[sym as 'SOL' | 'USDC'] ?? null,
    kind: q.kind,
    priceUsd: q.price,
    change24h: q.chg,
    issuer: q.issuer,
  };
}

export function baseAsset(p: MockPool): AssetRef {
  return { mint: p.base.mint, symbol: p.base.sym, name: p.base.name, logoUri: null, brand: null };
}

function createdAtMs(p: MockPool, now: number): number {
  return p.createdAtMs ?? now - p.ageH * 36e5;
}

function unlockAtMs(lp: MockLp, p: MockPool, now: number): number | null {
  if (p.unlockAtMs) return p.unlockAtMs;
  return lp.left != null ? now + lp.left * 864e5 : null;
}

function lpState(p: MockPool, now: number): LpState {
  const at = unlockAtMs(p.lp, p, now);
  const status = ({ burned: 'BURNED', locked: 'LOCKED', partial: 'PARTIAL', unlocked: 'UNLOCKED' } as const)[p.lp.t];
  return { status, lockedPct: p.lp.pct, unlockAt: at && p.lp.t !== 'burned' ? iso(at) : null };
}

export function toSummary(p: MockPool, now = Date.now()): PoolSummary {
  const q = Q[p.quote]!;
  return {
    address: p.addr,
    venue: p.venue,
    feeBps: p.feeBps,
    base: baseAsset(p),
    quote: quoteAsset(p.quote),
    priceUsd: p.priceUSD,
    priceQuote: p.priceUSD / q.price,
    change24h: p.chg,
    tvlUsd: p.tvl,
    vol24hUsd: p.vol,
    marketCapUsd: p.priceUSD * p.base.supply,
    feeAprPct: feeAprPct(p.vol, feeRateFromBps(p.feeBps), p.tvl),
    createdAt: iso(createdAtMs(p, now)),
    lp: lpState(p, now),
    buys24h: p.buys,
    sells24h: 100 - p.buys,
    spark7d: p.vol ? series(p, '1W', 28) : [],
  };
}

/** The prototype's `holders()` split. */
function holders(p: MockPool, unlockAt: string | null): HolderSlice[] {
  const lp = p.lp;
  if (lp.t === 'burned')
    return [
      { kind: 'BURNED', pct: 97, unlockAt: null },
      { kind: 'OTHER', pct: 3, unlockAt: null },
    ];
  if (lp.t === 'locked')
    return [
      { kind: 'LOCKED', pct: 96, unlockAt },
      { kind: 'OTHER', pct: 4, unlockAt: null },
    ];
  if (lp.t === 'partial')
    return [
      { kind: 'LOCKED', pct: lp.pct, unlockAt },
      { kind: 'CREATOR', pct: 100 - lp.pct - 5, unlockAt: null },
      { kind: 'OTHER', pct: 5, unlockAt: null },
    ];
  return [
    { kind: 'CREATOR', pct: 92, unlockAt: null },
    { kind: 'OTHER', pct: 8, unlockAt: null },
  ];
}

export function toDetail(p: MockPool, now = Date.now()): PoolDetail {
  const s = toSummary(p, now);
  return {
    ...s,
    reserveBase: p.x,
    reserveQuote: p.y,
    creator: p.creator,
    createdTx: null,
    lpMint: p.venue === 'RAYDIUM_CPMM' ? fakeMint('lp-' + p.id) : null,
    positionNft: p.venue === 'RAYDIUM_CPMM' ? null : fakeMint('pos-' + p.id),
    holders: holders(p, s.lp.unlockAt),
  };
}

export function toPosition(x: MockPosition, p: MockPool, now = Date.now()): Position {
  const s = toSummary(p, now);
  return {
    id: x.id,
    pool: s,
    share: Math.min(1, x.share),
    valueUsd: p.tvl * x.share,
    baseAmount: p.x * x.share,
    quoteAmount: p.y * x.share,
    unclaimedFeesUsd: x.earned,
    isCreator: x.isCreator,
    lock: x.locked
      ? { status: s.lp.status, unlockAt: s.lp.unlockAt }
      : { status: 'UNLOCKED', unlockAt: null },
  };
}

/** Stable pseudo-order used by the prototype's ticker. */
export const tickerOrder = (a: MockPool, b: MockPool) => hash(a.id) - hash(b.id);
