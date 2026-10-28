/**
 * The prototype's sample data (design/oxbow.html: Q, BRAND, ORB, BAL, BASES,
 * QSEQ, FSEQ, LPSEQ, makePool), ported unchanged so the M1 build renders the
 * same markets, prices and charts as the prototype.
 *
 * Every mint and pool address generated here is a FAKE base58 string from a
 * seeded PRNG. None of them exist on-chain. Real stock mints are seeded from
 * the issuer's list in M2 (scripts/seed-stocks.ts).
 */
import { b58, hash, rng, VENUES, type Brand, type QuoteKind, type VenueId } from '@oxbow/shared';

export interface SeedQuote {
  sym: string;
  name: string;
  price: number;
  kind: QuoteKind;
  chg: number;
  issuer: string | null;
}

export const Q: Record<string, SeedQuote> = {
  TSLAx: { sym: 'TSLAx', name: 'Tesla', price: 431.5, kind: 'STOCK', chg: 2.41, issuer: 'xStocks' },
  NVDAx: { sym: 'NVDAx', name: 'Nvidia', price: 192.6, kind: 'STOCK', chg: 1.18, issuer: 'xStocks' },
  SPYx: { sym: 'SPYx', name: 'S&P 500 ETF', price: 668.2, kind: 'STOCK', chg: 0.42, issuer: 'xStocks' },
  AAPLx: { sym: 'AAPLx', name: 'Apple', price: 252.3, kind: 'STOCK', chg: -0.37, issuer: 'xStocks' },
  QQQx: { sym: 'QQQx', name: 'Nasdaq 100 ETF', price: 603.1, kind: 'STOCK', chg: 0.88, issuer: 'xStocks' },
  METAx: { sym: 'METAx', name: 'Meta', price: 738.9, kind: 'STOCK', chg: -1.06, issuer: 'xStocks' },
  COINx: { sym: 'COINx', name: 'Coinbase', price: 356.7, kind: 'STOCK', chg: 3.92, issuer: 'xStocks' },
  MSTRx: { sym: 'MSTRx', name: 'Strategy', price: 388.4, kind: 'STOCK', chg: -2.7, issuer: 'xStocks' },
  SOL: { sym: 'SOL', name: 'Solana', price: 182.4, kind: 'SOL', chg: 1.9, issuer: null },
  USDC: { sym: 'USDC', name: 'USD Coin', price: 1, kind: 'USDC', chg: 0, issuer: null },
};

const BRAND: Record<string, [string, string, string]> = {
  TSLAx: ['#F0373D', '#6E0B10', 'T'],
  NVDAx: ['#8FD12A', '#2F5604', 'N'],
  SPYx: ['#4D6BEA', '#121E57', 'SPY'],
  AAPLx: ['#EEF1F4', '#8A949E', 'A'],
  QQQx: ['#2BCBF0', '#0A4E7C', 'QQQ'],
  METAx: ['#3A86FF', '#0A2E86', 'M'],
  COINx: ['#3D76FF', '#0A2580', 'C'],
  MSTRx: ['#FF9A3D', '#7A3000', 'MS'],
  SOL: ['#9B4DFF', '#16D9A0', 'SOL'],
  USDC: ['#4A97EC', '#123F80', '$'],
};

export const ORB: Record<string, string> = {
  TSLAx: '#F0373D',
  NVDAx: '#8FD12A',
  SPYx: '#4D6BEA',
  AAPLx: '#C9D1D8',
  QQQx: '#2BCBF0',
  METAx: '#3A86FF',
  COINx: '#3D76FF',
  MSTRx: '#FF9A3D',
};

export const STOCKS = Object.keys(Q).filter((k) => Q[k]!.kind === 'STOCK');

/** Mock wallet balances by quote symbol. */
export const BAL: Record<string, number> = {
  SOL: 24.6,
  USDC: 5200,
  SPYx: 3.12,
  NVDAx: 18.4,
  TSLAx: 4.05,
  AAPLx: 7.7,
  QQQx: 2.4,
  METAx: 1.9,
  COINx: 5.3,
  MSTRx: 2.2,
};

export function brandFor(sym: string): Brand | null {
  const b = BRAND[sym];
  return b ? { a: b[0], b: b[1], monogram: b[2], stock: Q[sym]?.kind === 'STOCK' } : null;
}

/** Fake, deterministic mint for a mock symbol. */
export const fakeMint = (sym: string): string => b58(rng(hash('mint-' + sym)), 44);

const BASES: [string, string][] = [
  ['MOCHI', 'Mochi'],
  ['ORBIT', 'Orbit Cat'],
  ['GRAVY', 'Gravy Train'],
  ['PIXEL', 'Pixel Pup'],
  ['NOODL', 'Noodle'],
  ['KOI', 'Koi Pond'],
  ['ZEST', 'Zest'],
  ['TUSK', 'Tusk'],
  ['FROTH', 'Froth'],
  ['SPRK', 'Sparky'],
  ['HALO', 'Halo'],
  ['BRRR', 'Money Printer'],
  ['LUNE', 'Lune'],
  ['OTTER', 'Otter'],
  ['CRUMB', 'Crumb'],
  ['WOBBL', 'Wobble'],
  ['VOLT', 'Volt Frog'],
  ['CHAD', 'Chad Bull'],
];
const QSEQ = ['NVDAx', 'TSLAx', 'SPYx', 'TSLAx', 'SOL', 'AAPLx', 'NVDAx', 'QQQx', 'COINx', 'METAx', 'SOL', 'TSLAx', 'MSTRx', 'SPYx', 'USDC', 'NVDAx', 'COINx', 'TSLAx'];
const FSEQ = [1, 1, 1, 2, 0.25, 1, 2, 1, 0.25, 1, 5, 2, 1, 0.25, 1, 2, 1, 2];

export type MockLpKind = 'burned' | 'locked' | 'partial' | 'unlocked';
export interface MockLp {
  t: MockLpKind;
  pct: number;
  days?: number;
  /** Days left on the lock when the data was generated. */
  left?: number;
}
const LPSEQ: MockLp[] = [
  { t: 'locked', pct: 100, days: 180 },
  { t: 'burned', pct: 100 },
  { t: 'partial', pct: 60, days: 90 },
  { t: 'unlocked', pct: 0 },
  { t: 'locked', pct: 100, days: 365 },
  { t: 'burned', pct: 100 },
  { t: 'locked', pct: 100, days: 30 },
  { t: 'unlocked', pct: 0 },
  { t: 'burned', pct: 100 },
  { t: 'partial', pct: 45, days: 30 },
  { t: 'locked', pct: 100, days: 90 },
  { t: 'burned', pct: 100 },
  { t: 'unlocked', pct: 0 },
  { t: 'locked', pct: 100, days: 180 },
  { t: 'burned', pct: 100 },
  { t: 'partial', pct: 70, days: 180 },
  { t: 'burned', pct: 100 },
  { t: 'locked', pct: 100, days: 90 },
];

export interface MockPool {
  /** Seed id from the prototype ("p0".."p17", "n<timestamp>" for new pools). Drives the chart PRNG. */
  id: string;
  base: { sym: string; name: string; mint: string; supply: number };
  quote: string;
  venue: VenueId;
  feeBps: number;
  tvl: number;
  vol: number;
  /** Age in hours, frozen relative to "now" for seeded pools. */
  ageH: number;
  /** Real creation time for pools created in this session. */
  createdAtMs: number | null;
  lp: MockLp;
  /** Real unlock time for pools created in this session. */
  unlockAtMs: number | null;
  chg: number;
  priceUSD: number;
  /** Base reserve. */
  x: number;
  /** Quote reserve. */
  y: number;
  addr: string;
  /** Buy share of 24h trades, percent. */
  buys: number;
  creator: string;
}

export function makePool(i: number): MockPool {
  const r = rng(hash('pool-' + i));
  const [sym, name] = BASES[i]!;
  const q = Q[QSEQ[i]!]!;
  const tvl = Math.round(Math.exp(9.4 + r() * 5.2));
  const vol = Math.round(tvl * (0.2 + r() * r() * 6));
  const mc = tvl * (2.5 + r() * 9);
  const priceUSD = mc / 1e9;
  const lp: MockLp = { ...LPSEQ[i]! };
  const ageH = Math.max(0.6, Math.pow(r(), 2) * 24 * 40);
  if (lp.days) lp.left = Math.max(3, lp.days - ageH / 24);
  const g = r();
  const chg = g < 0.28 ? -(4 + r() * 62) : g > 0.82 ? 300 + Math.pow(r(), 2) * 5800 : r() * 140;
  const addr = b58(r, 44);
  const buys = Math.round(Math.min(84, Math.max(22, 50 + chg / 60 + (r() - 0.5) * 24)));
  return {
    id: 'p' + i,
    base: { sym, name, mint: fakeMint(sym), supply: 1e9 },
    quote: q.sym,
    venue: VENUES[i % 3]!.id,
    feeBps: Math.round(FSEQ[i]! * 100),
    tvl,
    vol,
    ageH,
    createdAtMs: null,
    lp,
    unlockAtMs: null,
    chg,
    priceUSD,
    x: tvl / 2 / priceUSD,
    y: tvl / 2 / q.price,
    addr,
    buys,
    creator: b58(rng(hash('creator-' + i)), 44),
  };
}

export const SEED_POOLS = (): MockPool[] => BASES.map((_, i) => makePool(i));

const TF_POINTS = { '1H': 60, '1D': 96, '1W': 84 } as const;
const TF_VOL = { '1H': 0.012, '1D': 0.035, '1W': 0.07 } as const;
export const TF_STEP_MS = { '1H': 60e3, '1D': 15 * 60e3, '1W': 2 * 36e5 } as const;

/** The prototype's `series()` price walk, ending at the pool's current price. */
export function series(p: Pick<MockPool, 'id' | 'chg' | 'priceUSD'>, tf: '1H' | '1D' | '1W', n2?: number): number[] {
  const n = n2 || TF_POINTS[tf];
  const vol = TF_VOL[tf];
  const r = rng(hash(p.id + tf));
  const drift = Math.pow(1 + p.chg / 100, 1 / n);
  let v = 1;
  const a: number[] = [];
  for (let i = 0; i < n; i++) {
    v *= (1 + (r() - 0.5) * vol) * (tf === '1D' ? drift : 1);
    a.push(v);
  }
  const s = p.priceUSD / a[n - 1]!;
  return a.map((x) => x * s);
}

/** Prototype example token for "Use an example token". Fake mint. */
export const EXAMPLE_MINT = 'Pebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy';
