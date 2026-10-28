import {
  b58,
  hash,
  isLockedOrBurned,
  PoolsQuerySchema,
  rng,
  rwalk,
  type ActivityItem,
  type ActivityKind,
  type PoolSummary,
  type TickerItem,
  type Timeframe,
} from '@oxbow/shared';
import type { OxbowApi } from '../types';
import { baseAsset, db, quoteAsset, tickerOrder, toDetail, toPosition, toSummary } from './db';
import { EXAMPLE_MINT, ORB, Q, series, STOCKS, TF_STEP_MS, type MockPool } from './seed';

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

function activityItem(r: () => number, now: number): ActivityItem {
  const pools = db().pools;
  const p = pools[Math.floor(r() * pools.length)]!;
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
        asset: { mint: q.mint, symbol: q.symbol, name: q.name, logoUri: null, brand: q.brand },
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
    const s = (q.q ?? '').toLowerCase();
    const now = Date.now();
    const list = db()
      .pools.map((p) => toSummary(p, now))
      .filter((p) => {
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
    return { tf, stepMs: step, points: data.map((v, i) => ({ t: now - (data.length - 1 - i) * step, p: v })) };
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

  async token(mint) {
    // The prototype's fake lookup: a short wait, then a token named after the mint's letters.
    if (isBrowser) await delay(650);
    let sym: string;
    let name: string;
    if (mint === EXAMPLE_MINT) {
      sym = 'PEBL';
      name = 'Pebble';
    } else {
      const letters = mint.replace(/[^A-Za-z]/g, '').toUpperCase();
      sym = letters.slice(0, 4) || 'TKN';
      name = sym.charAt(0) + sym.slice(1).toLowerCase() + ' token';
    }
    db().held.set(mint, 1e9);
    return {
      mint,
      symbol: sym,
      name,
      decimals: 6,
      supply: 1e9,
      tokenProgram: 'spl-token',
      mintAuthority: null,
      freezeAuthority: null,
      logoUri: null,
      extensions: [],
      risk: { mintable: false, freezable: false, transferFee: false, transferHook: false, permanentDelegate: false },
    };
  },

  async positions() {
    const d = db();
    const now = Date.now();
    return d.positions.flatMap((x) => {
      const p = d.pools.find((y) => y.id === x.poolId);
      return p ? [toPosition(x, p, now)] : [];
    });
  },

  async recentActivity() {
    // Random like the prototype's feed, so only generated in the browser.
    if (!isBrowser) return [];
    const now = Date.now();
    return Array.from({ length: 8 }, (_, i) => activityItem(Math.random, now - (i * 7 + 3) * 1000));
  },

  subscribeActivity(onItem) {
    if (!isBrowser) return () => {};
    const t = setInterval(() => {
      if (document.hidden) return;
      onItem(activityItem(Math.random, Date.now()));
    }, 2600);
    return () => clearInterval(t);
  },
};

/** Deterministic fake pool address for a pool created in this browser session. */
export const newPoolAddress = (seed: string) => b58(rng(hash(seed)), 44);
