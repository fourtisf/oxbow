/**
 * In-memory mock database. One instance per JS runtime: the server's copy is
 * read-only, the browser's copy is also mutated by the mock chain (create pool,
 * add liquidity, swap, claim, withdraw) so the prototype's interactions keep
 * working until real transactions land in M3/M4.
 */
import {
  b58,
  feeAprPct,
  feeRateFromBps,
  hash,
  NATIVE_BRANDS,
  rng,
  safetyFlags,
  safetyLevel,
  usMarketState,
  type AssetRef,
  type HolderSlice,
  type LpState,
  type PoolDetail,
  type PoolSummary,
  type Position,
  type QuoteAsset,
  type TokenSafety,
  type WalletActivity,
} from '@oxbow/shared';
import { brandFor, fakeMint, logoFor, Q, SEED_POOLS, series, type MockLp, type MockPool } from './seed';

export interface MockPosition {
  id: string;
  poolId: string;
  share: number;
  earned: number;
  locked: boolean;
  isCreator: boolean;
  depositedUsd: number;
  entryPriceQuote: number;
}

export interface MockActivity {
  sig: string;
  ts: number;
  kind: WalletActivity['kind'];
  poolId: string;
  amountUsd: number;
}

export interface MockDb {
  /** True once this runtime's data diverged from the seed (a mock transaction ran). */
  dirty: boolean;
  pools: MockPool[];
  positions: MockPosition[];
  activity: MockActivity[];
  /** Base tokens the mock wallet "holds", by mint, after a token lookup. */
  held: Map<string, number>;
}

const g = globalThis as unknown as { __oxbowMockDb?: MockDb };

export function db(): MockDb {
  if (!g.__oxbowMockDb) g.__oxbowMockDb = { dirty: false, pools: SEED_POOLS(), positions: [], activity: [], held: new Map() };
  return g.__oxbowMockDb;
}

const iso = (ms: number) => new Date(ms).toISOString();

export const fakeSig = (seed: string) => b58(rng(hash('sig-' + seed)), 88);

export function quoteAsset(sym: string, now = Date.now()): QuoteAsset {
  const q = Q[sym]!;
  const stock = q.kind === 'STOCK';
  return {
    mint: fakeMint(sym),
    symbol: q.sym,
    name: q.name,
    logoUri: logoFor(sym),
    brand: stock ? brandFor(sym) : NATIVE_BRANDS[sym as 'SOL' | 'USDC'] ?? null,
    kind: q.kind,
    priceUsd: q.price,
    change24h: q.chg,
    issuer: q.issuer,
    // Mock feeds are always fresh; real ones report their own publish time (M2).
    priceUpdatedAt: iso(now - 8_000),
    market: stock ? usMarketState(now) : null,
    notice: null,
  };
}

export function baseAsset(p: MockPool): AssetRef {
  return { mint: p.base.mint, symbol: p.base.sym, name: p.base.name, logoUri: p.base.logo, brand: null };
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

/** Another listed pool's base token uses this symbol with a different mint. */
export function symbolTaken(symbol: string, mint: string): boolean {
  const s = symbol.toUpperCase();
  return db().pools.some((p) => p.base.sym.toUpperCase() === s && p.base.mint !== mint);
}

function safety(p: MockPool): TokenSafety {
  const t = p.token;
  const flags = safetyFlags({
    duplicateSymbol: symbolTaken(p.base.sym, p.base.mint),
    tokenAgeDays: t.ageDays,
    top10Pct: t.top10Pct,
    mintable: !!t.mintAuthority,
    freezable: !!t.freezeAuthority,
    transferFee: t.transferFee,
    transferHook: t.transferHook,
    permanentDelegate: t.permanentDelegate,
    creatorPulled: t.creatorPulled,
    lpUnlocked: p.lp.t === 'unlocked',
    tvlUsd: p.tvl,
  });
  const created = t.ageDays == null ? null : iso(createdAtMs(p, Date.now()) - (t.ageDays - p.ageH / 24) * 864e5);
  return {
    level: safetyLevel(flags),
    flags,
    holderCount: t.holders,
    top10Pct: t.top10Pct,
    tokenCreatedAt: created,
    mintAuthority: t.mintAuthority,
    freezeAuthority: t.freezeAuthority,
    creatorPools: t.creatorPools,
    creatorPulled: t.creatorPulled,
  };
}

export function toSummary(p: MockPool, now = Date.now()): PoolSummary {
  const q = Q[p.quote]!;
  return {
    address: p.addr,
    venue: p.venue,
    feeBps: p.feeBps,
    base: baseAsset(p),
    quote: quoteAsset(p.quote, now),
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
    safety: safety(p),
  };
}

/** The prototype's `holders()` split, with fake proof accounts. */
function holders(p: MockPool, unlockAt: string | null): HolderSlice[] {
  const lp = p.lp;
  const lockProof = { kind: 'account' as const, id: fakeMint('lock-' + p.id) };
  const burnProof = { kind: 'tx' as const, id: fakeSig('burn-' + p.id) };
  const s = (kind: HolderSlice['kind'], pct: number, extra: Partial<HolderSlice> = {}): HolderSlice => ({ kind, pct, unlockAt: null, proof: null, ...extra });
  if (lp.t === 'burned') return [s('BURNED', 97, { proof: burnProof }), s('OTHER', 3)];
  if (lp.t === 'locked') return [s('LOCKED', 96, { unlockAt, proof: lockProof }), s('OTHER', 4)];
  if (lp.t === 'partial') return [s('LOCKED', lp.pct, { unlockAt, proof: lockProof }), s('CREATOR', 100 - lp.pct - 5, { proof: { kind: 'account', id: p.creator } }), s('OTHER', 5)];
  return [s('CREATOR', 92, { proof: { kind: 'account', id: p.creator } }), s('OTHER', 8)];
}

export function toDetail(p: MockPool, now = Date.now()): PoolDetail {
  const s = toSummary(p, now);
  return {
    ...s,
    reserveBase: p.x,
    reserveQuote: p.y,
    creator: p.creator,
    createdTx: fakeSig('create-' + p.id),
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
    depositedUsd: x.depositedUsd,
    entryPriceQuote: x.entryPriceQuote,
    isCreator: x.isCreator,
    lock: x.locked ? { status: s.lp.status, unlockAt: s.lp.unlockAt } : { status: 'UNLOCKED', unlockAt: null },
  };
}

export function toActivity(a: MockActivity): WalletActivity | null {
  const p = db().pools.find((x) => x.id === a.poolId);
  if (!p) return null;
  const q = quoteAsset(p.quote);
  return {
    sig: a.sig,
    ts: a.ts,
    kind: a.kind,
    amountUsd: a.amountUsd,
    pool: { address: p.addr, base: baseAsset(p), quote: { mint: q.mint, symbol: q.symbol, name: q.name, logoUri: q.logoUri, brand: q.brand } },
  };
}

export function logActivity(kind: MockActivity['kind'], poolId: string, amountUsd: number, ts = Date.now()) {
  db().activity.unshift({ sig: fakeSig(kind + poolId + ts + Math.random()), ts, kind, poolId, amountUsd });
}

/** Stable pseudo-order used by the prototype's ticker. */
export const tickerOrder = (a: MockPool, b: MockPool) => hash(a.id) - hash(b.id);
