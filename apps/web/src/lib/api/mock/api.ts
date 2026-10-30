import {
  b58,
  FEE_TIERS,
  VENUES,
  hash,
  isAddress,
  isLockedOrBurned,
  PoolsQuerySchema,
  rng,
  rwalk,
  TokenInfoSchema,
  type ActivityItem,
  type ActivityKind,
  type Candle,
  type PoolSummary,
  type TickerItem,
  type Timeframe,
  type TokenInfo,
  type Trade,
} from '@oxbow/shared';
import { env } from '../../env';
import type { OxbowApi } from '../types';
import { baseAsset, db, fakeSig, quoteAsset, symbolTaken, tickerOrder, toActivity, toDetail, toPosition, toSummary } from './db';
import { ORB, Q, SAMPLE_TOKENS, series, STOCKS, TF_STEP_MS, type MockPool } from './seed';

const isBrowser = typeof window !== 'undefined';
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const byChg = (a: MockPool, b: MockPool) => b.chg - a.chg;

function sortKey(sort: string): (p: PoolSummary) => number {
  switch (sort) {
    case 'tvl':
      return (p) => -p.tvlUsd;
    case 'chg':
      return (p) => -p.change24h;
    case 'apr':
      return (p) => -p.feeAprPct;
    case 'new':
      return (p) => -Date.parse(p.createdAt);
    default:
      return (p) => -p.vol24hUsd;
  }
}

function activityItem(r: () => number, now: number): ActivityItem | null {
  const pools = db().pools;
  const p = pools[Math.floor(r() * pools.length)];
  if (!p) return null;
  const x = r();
  const kind: ActivityKind = x < 0.5 ? 'BUY' : x < 0.82 ? 'SELL' : x < 0.93 ? 'ADD_LP' : 'POOL';
  const amountUsd = kind === 'POOL' ? p.tvl * 0.02 : Math.exp(4 + r() * 5);
  return {
    id: b58(r, 16),
    kind,
    pool: { address: p.addr, base: baseAsset(p), quote: quoteAsset(p.quote) },
    wallet: b58(r, 44),
    amountUsd,
    ts: now,
  };
}

export const mockApi: OxbowApi = {
  async stats() {
    const pools = db().pools;
    const top = [...pools].sort(byChg)[0];
    return {
      vol24hUsd: pools.reduce((s, p) => s + p.vol, 0),
      tvlUsd: pools.reduce((s, p) => s + p.tvl, 0),
      marketCount: pools.length,
      topGainer: top ? { pool: toSummary(top), spark1d: series(top, '1D', 40) } : null,
      sparks: { vol: rwalk('v', 24, 0.12), tvl: rwalk('l', 24, 0.12), gainer: rwalk('g', 24, 0.12) },
    };
  },

  async ticker() {
    const items: TickerItem[] = [...db().pools]
      .sort(tickerOrder)
      .slice(0, 12)
      .map((p) => ({ kind: 'pool', address: p.addr, asset: baseAsset(p), priceUsd: p.priceUSD, change24h: p.chg }));
    // Interleave the first six stocks, same positions as the prototype.
    STOCKS.slice(0, 6).forEach((k, i) => {
      const q = quoteAsset(k);
      items.splice(i * 3 + 1, 0, {
        kind: 'stock',
        address: null,
        asset: { mint: q.mint, symbol: q.symbol, name: q.name, logoUri: q.logoUri, brand: q.brand },
        priceUsd: q.priceUsd,
        change24h: q.change24h,
      });
    });
    return items;
  },

  async movers() {
    return [...db().pools].sort(byChg).slice(0, 12).map((p) => toSummary(p));
  },

  async pools(input) {
    const q = PoolsQuerySchema.parse(input);
    const raw = (q.q ?? '').trim();
    const s = raw.toLowerCase();
    // A pasted address matches the pool, its token or its pair asset exactly.
    const byAddress = isAddress(raw);
    const now = Date.now();
    const list = db()
      .pools.map((p) => toSummary(p, now))
      .filter((p) => {
        if (q.addresses && !q.addresses.includes(p.address)) return false;
        if (byAddress) return p.address === raw || p.base.mint === raw || p.quote.mint === raw;
        if (q.quote === 'stock' && p.quote.kind !== 'STOCK') return false;
        if (q.quote !== 'all' && q.quote !== 'stock' && p.quote.symbol !== q.quote) return false;
        if (q.locked && !isLockedOrBurned(p.lp)) return false;
        if (
          s &&
          !(
            p.base.symbol.toLowerCase().includes(s) ||
            p.base.name.toLowerCase().includes(s) ||
            p.quote.symbol.toLowerCase().includes(s) ||
            p.quote.name.toLowerCase().includes(s)
          )
        )
          return false;
        return true;
      });
    const key = sortKey(q.sort);
    list.sort((a, b) => key(a) - key(b));
    const offset = Math.max(0, parseInt(q.cursor ?? '0', 10) || 0);
    const items = list.slice(offset, offset + q.limit);
    const next = offset + q.limit;
    return { items, total: list.length, nextCursor: next < list.length ? String(next) : null };
  },

  async pool(address) {
    const p = db().pools.find((x) => x.addr === address);
    return p ? toDetail(p) : null;
  },

  async chart(address, tf: Timeframe) {
    const p = db().pools.find((x) => x.addr === address);
    const data = p ? series(p, tf) : [];
    const step = TF_STEP_MS[tf];
    const now = Date.now();
    const t = (i: number) => now - (data.length - 1 - i) * step;
    // Candles built around the same walk: open = previous close, wicks and volume from a seeded PRNG.
    const r = rng(hash((p?.id ?? '') + tf + 'ohlc'));
    const wick = { '1H': 0.004, '1D': 0.012, '1W': 0.025 }[tf];
    const volPer = p && p.vol ? (p.vol * step) / 864e5 : 0;
    const candles: Candle[] = data.map((c, i) => {
      const o = i ? data[i - 1]! : c * (1 + (r() - 0.5) * wick);
      return { t: t(i), o, c, h: Math.max(o, c) * (1 + r() * wick), l: Math.min(o, c) * (1 - r() * wick), v: volPer * (0.3 + r() * 1.4) };
    });
    return { tf, stepMs: step, points: data.map((v, i) => ({ t: t(i), p: v })), candles };
  },

  async trades(address) {
    const p = db().pools.find((x) => x.addr === address);
    if (!p || !p.vol) return [];
    const r = rng(hash(p.id + 'trades'));
    const now = Date.now();
    const q = Q[p.quote]!;
    let ts = now - r() * 60_000;
    return Array.from({ length: 20 }, (_, i): Trade => {
      const side = r() * 100 < p.buys ? 'BUY' : 'SELL';
      const amountUsd = Math.exp(3 + r() * 6);
      const priceUsd = p.priceUSD * (1 + (r() - 0.5) * 0.01);
      ts -= (r() * r() * 30 + 0.2) * 60_000;
      return {
        sig: fakeSig(p.id + 't' + i),
        ts,
        side,
        wallet: b58(r, 44),
        amountUsd,
        baseAmount: amountUsd / priceUsd,
        quoteAmount: amountUsd / q.price,
        priceUsd,
      };
    });
  },

  async stocks() {
    const pools = db().pools;
    return STOCKS.map((k) => ({
      ...quoteAsset(k),
      poolCount: pools.filter((p) => p.quote === k).length,
      spark: rwalk(k, 30, Q[k]!.chg / 40),
      orb: ORB[k]!,
    }));
  },

  async quotes() {
    return [...STOCKS, 'SOL', 'USDC'].map(quoteAsset);
  },

  async popularTokens() {
    // Sample data offers its example token instead (a button under the field).
    return [];
  },

  async venues() {
    // The simulated chain offers every venue and fee tier.
    const feeTiers = FEE_TIERS.map((f) => ({ feeBps: f.feeBps, createPoolFeeLamports: 150_000_000 }));
    return {
      createEnabled: true,
      oxbowFeeLamports: env.feeLamports,
      venues: VENUES.map((v) => ({ id: v.id, enabled: true, feeTiers })),
    };
  },

  async token(mint) {
    const sample = SAMPLE_TOKENS[mint];
    let token: TokenInfo;
    if (sample) {
      if (isBrowser) await delay(650);
      const authority = sample.authority ? mint : null;
      token = {
        mint,
        symbol: sample.symbol,
        name: sample.name,
        decimals: 6,
        supply: 1e9,
        tokenProgram: 'spl-token',
        mintAuthority: authority,
        freezeAuthority: authority,
        logoUri: sample.logo,
        extensions: [],
        risk: { mintable: !!authority, freezable: !!authority, transferFee: false, transferHook: false, permanentDelegate: false },
        symbolTaken: false,
        createdAt: new Date(Date.now() - 30 * 864e5).toISOString(),
      };
    } else {
      // Any other mint is read from the chain, so a real token shows its own name and logo.
      if (!isBrowser) return null;
      const res = await fetch(`/api/token/${encodeURIComponent(mint)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`token lookup failed: ${res.status}`);
      token = TokenInfoSchema.parse(await res.json());
    }
    // The mock wallet holds the whole supply, so any deposit up to it can be tried.
    db().held.set(mint, token.supply);
    return { ...token, symbolTaken: symbolTaken(token.symbol, mint) };
  },

  async positions() {
    const d = db();
    const now = Date.now();
    return d.positions.flatMap((x) => {
      const p = d.pools.find((y) => y.id === x.poolId);
      return p ? [toPosition(x, p, now)] : [];
    });
  },

  async walletActivity() {
    return db().activity.flatMap((a) => {
      const x = toActivity(a);
      return x ? [x] : [];
    });
  },

  async status() {
    const now = new Date().toISOString();
    return {
      checkedAt: now,
      api: 'OK',
      rpc: { state: 'OK', slot: null, latencyMs: null },
      indexer: { state: 'OK', lagSec: 0 },
      prices: { state: 'OK', updatedAt: now },
      sampleData: true,
    };
  },

  async recentActivity() {
    // Random like the prototype's feed, so only generated in the browser.
    if (!isBrowser) return [];
    const now = Date.now();
    return Array.from({ length: 8 }, (_, i) => activityItem(Math.random, now - (i * 7 + 3) * 1000)).filter((x): x is ActivityItem => !!x);
  },

  subscribeActivity(onItem) {
    if (!isBrowser) return () => {};
    const t = setInterval(() => {
      if (document.hidden) return;
      const it = activityItem(Math.random, Date.now());
      if (it) onItem(it);
    }, 2600);
    return () => clearInterval(t);
  },
};

/** Deterministic fake pool address for a pool created in this browser session. */
export const newPoolAddress = (seed: string) => b58(rng(hash(seed)), 44);
