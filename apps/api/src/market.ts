/**
 * Read side of the API: turns database rows into the shapes in
 * @oxbow/shared/schemas, using the same rules as the web app (safety flags,
 * fee APR, US market hours).
 */
import {
  CHART_TF,
  feeAprPct,
  feeRateFromBps,
  HolderSliceSchema,
  isAddress,
  NATIVE_BRANDS,
  safetyFlags,
  safetyLevel,
  usMarketState,
  type ActivityItem,
  type AssetRef,
  type Candle,
  type ChartSeries,
  type PoolDetail,
  type PoolsPage,
  type PoolsQuery,
  type PoolSummary,
  type QuoteAsset,
  type Stats,
  type StockInfo,
  type TickerItem,
  type Timeframe,
  type TokenRisk,
  type Trade as TradeOut,
  type WalletActivity,
} from '@oxbow/shared';
import { SOL_MINT } from '@oxbow/solana/rpc';
import { z } from 'zod';
import type { Pool, Prisma, PrismaClient, Token } from '@oxbow/db';
import type { Cache } from './cache';
import type { PriceRequest, PriceSource } from './prices';

export type PoolRow = Pool & { base: Token };

/** Stocks drawn as local tiles when their metadata has no logo (public/tokens). */
const LOCAL_TILES = new Set(['TSLAX', 'NVDAX', 'AAPLX', 'METAX', 'COINX', 'MSTRX', 'SPYX', 'QQQX']);
const SNAPSHOT_EVERY_MS = 5 * 60_000;
const DAY = 86_400_000;

const n = (d: Prisma.Decimal | number | null | undefined) => (d == null ? 0 : typeof d === 'number' ? d : d.toNumber());
const iso = (ms: number) => new Date(ms).toISOString();

interface QuoteBook {
  /** Every pairable asset by mint, priced. */
  assets: Record<string, QuoteAsset>;
  stocks: { mint: string; symbol: string; brandA: string; spark: number[] }[];
  pricesUpdatedAt: number | null;
}

export class Market {
  constructor(
    private readonly db: PrismaClient,
    private readonly priceSource: PriceSource,
    private readonly cache: Cache,
    private readonly now: () => number = Date.now,
  ) {}

  // ---------------------------------------------------------------- quote assets

  /** Enabled stocks plus SOL and USDC, with prices. Records a stock price snapshot every 5 minutes. Cached 30 s. */
  quoteBook(): Promise<QuoteBook> {
    return this.cache.wrap('quotes:v1', 30, async () => {
      const now = this.now();
      const [stocks, quoteTokens] = await Promise.all([
        this.db.stockAsset.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: 'asc' }, { symbol: 'asc' }] }),
        this.db.quoteToken.findMany(),
      ]);
      const req: PriceRequest[] = [
        ...stocks.map((s) => ({ mint: s.mint, source: s.priceSource === 'pyth' ? ('pyth' as const) : ('jupiter' as const), feedId: s.priceFeedId })),
        ...quoteTokens.map((q) => ({ mint: q.mint, source: 'jupiter' as const })),
      ];
      const prices = req.length ? await this.priceSource.prices(req) : new Map();

      // History for 24h change and sparklines, and fresh snapshots.
      const since = new Date(now - 26 * 3_600_000);
      const snaps = stocks.length
        ? await this.db.stockSnapshot.findMany({ where: { mint: { in: stocks.map((s) => s.mint) }, ts: { gte: since } }, orderBy: { ts: 'asc' } })
        : [];
      const byMint = new Map<string, { ts: number; p: number }[]>();
      for (const s of snaps) byMint.set(s.mint, [...(byMint.get(s.mint) ?? []), { ts: s.ts.getTime(), p: s.priceUsd }]);
      const fresh = stocks.filter((s) => {
        const last = byMint.get(s.mint)?.at(-1);
        return prices.has(s.mint) && (!last || now - last.ts >= SNAPSHOT_EVERY_MS);
      });
      if (fresh.length) {
        await this.db.stockSnapshot.createMany({ data: fresh.map((s) => ({ mint: s.mint, ts: new Date(now), priceUsd: prices.get(s.mint)!.usd })) });
        for (const s of fresh) byMint.set(s.mint, [...(byMint.get(s.mint) ?? []), { ts: now, p: prices.get(s.mint)!.usd }]);
      }

      const market = usMarketState(now);
      const assets: Record<string, QuoteAsset> = {};
      let pricesUpdatedAt: number | null = null;
      const book: QuoteBook['stocks'] = [];
      for (const s of stocks) {
        const hist = byMint.get(s.mint) ?? [];
        const price = prices.get(s.mint);
        const usdNow = price?.usd ?? hist.at(-1)?.p ?? 0;
        const dayAgo = hist.find((h) => h.ts >= now - DAY - 2 * 3_600_000 && h.ts <= now - 20 * 3_600_000);
        const change24h = price?.change24h ?? (dayAgo && dayAgo.p ? ((usdNow - dayAgo.p) / dayAgo.p) * 100 : 0);
        const updatedAt = price?.updatedAt ?? hist.at(-1)?.ts ?? 0;
        if (price) pricesUpdatedAt = Math.max(pricesUpdatedAt ?? 0, price.updatedAt);
        assets[s.mint] = {
          mint: s.mint,
          symbol: s.symbol,
          name: s.name,
          logoUri: s.logoUri ?? (LOCAL_TILES.has(s.symbol.toUpperCase()) ? `/tokens/${s.symbol.toLowerCase()}.svg` : null),
          brand: { a: s.brandColorA, b: s.brandColorB, monogram: s.monogram, stock: true },
          kind: 'STOCK',
          priceUsd: usdNow,
          change24h,
          issuer: s.issuer,
          priceUpdatedAt: iso(updatedAt),
          market,
          notice: s.notice,
        };
        const series = hist.slice(-30).map((h) => h.p);
        book.push({ mint: s.mint, symbol: s.symbol, brandA: s.brandColorA, spark: series.length >= 2 ? series : [usdNow, usdNow] });
      }
      for (const q of quoteTokens) {
        const price = prices.get(q.mint);
        const kind = q.kind === 'USDC' ? 'USDC' : 'SOL';
        assets[q.mint] = {
          mint: q.mint,
          symbol: q.symbol,
          name: q.name,
          logoUri: q.logoUri ?? (kind === 'SOL' ? '/tokens/sol.svg' : '/tokens/usdc.svg'),
          brand: NATIVE_BRANDS[kind],
          kind,
          priceUsd: price?.usd ?? (kind === 'USDC' ? 1 : 0),
          change24h: price?.change24h ?? 0,
          issuer: null,
          priceUpdatedAt: iso(price?.updatedAt ?? 0),
          market: null,
          notice: null,
        };
      }
      return { assets, stocks: book, pricesUpdatedAt };
    });
  }

  async quotes(): Promise<QuoteAsset[]> {
    const book = await this.quoteBook();
    const all = Object.values(book.assets);
    // Stocks first in seed order, then SOL, then USDC (the order create step 2 shows).
    const rank = (q: QuoteAsset) => (q.kind === 'STOCK' ? 0 : q.kind === 'SOL' ? 1 : 2);
    return all.sort((a, b) => rank(a) - rank(b));
  }

  async stocks(): Promise<StockInfo[]> {
    const book = await this.quoteBook();
    const counts = await this.db.pool.groupBy({ by: ['quoteMint'], where: { quoteKind: 'STOCK' }, _count: { _all: true } });
    const poolCount = new Map(counts.map((c) => [c.quoteMint, c._count._all]));
    return book.stocks.map((s) => ({ ...book.assets[s.mint]!, poolCount: poolCount.get(s.mint) ?? 0, spark: s.spark, orb: s.brandA }));
  }

  // ---------------------------------------------------------------- pools

  /** Turns pool rows into summaries, loading what the safety check and sparklines need in a few queries. */
  async summaries(rows: PoolRow[]): Promise<PoolSummary[]> {
    if (!rows.length) return [];
    const now = this.now();
    const book = await this.quoteBook();
    const addresses = rows.map((r) => r.address);
    const creators = [...new Set(rows.map((r) => r.creator))];
    const [snaps, dupGroups, creatorPools, pulled] = await Promise.all([
      this.db.poolSnapshot.findMany({ where: { poolAddress: { in: addresses }, ts: { gte: new Date(now - 7 * DAY) } }, orderBy: { ts: 'asc' }, select: { poolAddress: true, priceUsd: true } }),
      this.db.$queryRaw<{ symbol: string }[]>`SELECT upper("symbol") AS symbol FROM "Token" GROUP BY 1 HAVING COUNT(*) > 1`,
      this.db.pool.groupBy({ by: ['creator'], where: { creator: { in: creators } }, _count: { _all: true } }),
      this.db.$queryRaw<{ creator: string; pulled: bigint }[]>`
        SELECT p."creator", COUNT(DISTINCT p."address") AS pulled
        FROM "Pool" p JOIN "LiquidityEvent" e ON e."poolAddress" = p."address" AND e."wallet" = p."creator" AND e."kind" = 'REMOVE'
        WHERE p."creator" = ANY(${creators}::text[])
        GROUP BY p."creator"`,
    ]);
    const spark = new Map<string, number[]>();
    for (const s of snaps) spark.set(s.poolAddress, [...(spark.get(s.poolAddress) ?? []), n(s.priceUsd)]);
    const dupSymbols = new Set(dupGroups.map((g) => g.symbol));
    for (const s of book.stocks) dupSymbols.add(s.symbol.toUpperCase());
    const poolsBy = new Map(creatorPools.map((c) => [c.creator, c._count._all]));
    const pulledBy = new Map(pulled.map((p) => [p.creator, Number(p.pulled)]));

    return rows.map((r) => {
      const quote = book.assets[r.quoteMint] ?? missingQuote(r);
      const priceUsd = n(r.priceUsd);
      const tvl = n(r.tvlUsd);
      const vol = n(r.vol24hUsd);
      const risk = r.base.risk as unknown as TokenRisk;
      const ageDays = r.base.mintCreatedAt ? (now - r.base.mintCreatedAt.getTime()) / DAY : null;
      const flags = safetyFlags({
        duplicateSymbol: dupSymbols.has(r.base.symbol.toUpperCase()),
        tokenAgeDays: ageDays,
        top10Pct: r.base.top10Pct,
        mintable: !!r.base.mintAuthority,
        freezable: !!r.base.freezeAuthority,
        transferFee: !!risk?.transferFee,
        transferHook: !!risk?.transferHook,
        permanentDelegate: !!risk?.permanentDelegate,
        creatorPulled: pulledBy.get(r.creator) ?? 0,
        lpUnlocked: r.lpStatus === 'UNLOCKED',
        tvlUsd: tvl,
      });
      const series = downsample(spark.get(r.address) ?? [], 42);
      return {
        address: r.address,
        venue: r.venue,
        feeBps: r.feeBps,
        base: assetRef(r.base),
        quote,
        priceUsd,
        priceQuote: quote.priceUsd ? priceUsd / quote.priceUsd : n(r.reserveBase) ? n(r.reserveQuote) / n(r.reserveBase) : 0,
        change24h: n(r.change24h),
        tvlUsd: tvl,
        vol24hUsd: vol,
        marketCapUsd: priceUsd * n(r.base.supply),
        feeAprPct: feeAprPct(vol, feeRateFromBps(r.feeBps), tvl),
        createdAt: r.createdAt.toISOString(),
        lp: { status: r.lpStatus, lockedPct: r.lpLockedPct, unlockAt: r.lpUnlockAt?.toISOString() ?? null },
        buys24h: r.buys24h,
        sells24h: r.sells24h,
        spark7d: series.length >= 2 ? series : [priceUsd, priceUsd],
        safety: {
          level: safetyLevel(flags),
          flags,
          holderCount: r.base.holderCount,
          top10Pct: r.base.top10Pct,
          tokenCreatedAt: r.base.mintCreatedAt?.toISOString() ?? null,
          mintAuthority: r.base.mintAuthority,
          freezeAuthority: r.base.freezeAuthority,
          creatorPools: poolsBy.get(r.creator) ?? 0,
          creatorPulled: pulledBy.get(r.creator) ?? 0,
        },
      };
    });
  }

  async pools(q: PoolsQuery): Promise<PoolsPage> {
    const book = await this.quoteBook();
    const and: Prisma.PoolWhereInput[] = [];
    if (q.quote === 'stock') and.push({ quoteKind: 'STOCK' });
    else if (q.quote !== 'all') and.push({ quoteKind: q.quote });
    if (q.locked) and.push({ lpStatus: { in: ['BURNED', 'LOCKED'] } });
    if (q.addresses) and.push({ address: { in: q.addresses } });
    const text = q.q?.trim();
    if (text) {
      if (isAddress(text)) and.push({ OR: [{ address: text }, { baseMint: text }, { quoteMint: text }] });
      else {
        const lower = text.toLowerCase();
        const quoteMints = Object.values(book.assets)
          .filter((a) => a.symbol.toLowerCase().includes(lower) || a.name.toLowerCase().includes(lower))
          .map((a) => a.mint);
        and.push({
          OR: [
            { base: { symbol: { contains: text, mode: 'insensitive' } } },
            { base: { name: { contains: text, mode: 'insensitive' } } },
            ...(quoteMints.length ? [{ quoteMint: { in: quoteMints } }] : []),
          ],
        });
      }
    }
    const where: Prisma.PoolWhereInput = and.length ? { AND: and } : {};
    const offset = decodeCursor(q.cursor);
    const total = await this.db.pool.count({ where });

    let rows: PoolRow[];
    if (q.sort === 'apr') {
      // APR is computed, so sort in memory (pool counts are small).
      const all = await this.db.pool.findMany({ where, include: { base: true }, take: 5000 });
      const apr = (r: PoolRow) => feeAprPct(n(r.vol24hUsd), feeRateFromBps(r.feeBps), n(r.tvlUsd));
      rows = all.sort((a, b) => apr(b) - apr(a)).slice(offset, offset + q.limit);
    } else {
      const orderBy: Prisma.PoolOrderByWithRelationInput =
        q.sort === 'tvl' ? { tvlUsd: 'desc' } : q.sort === 'chg' ? { change24h: 'desc' } : q.sort === 'new' ? { createdAt: 'desc' } : { vol24hUsd: 'desc' };
      rows = await this.db.pool.findMany({ where, include: { base: true }, orderBy: [orderBy, { address: 'asc' }], skip: offset, take: q.limit });
    }
    const items = await this.summaries(rows);
    const next = offset + rows.length;
    return { items, total, nextCursor: next < total ? encodeCursor(next) : null };
  }

  async pool(address: string): Promise<PoolDetail | null> {
    const row = await this.db.pool.findUnique({ where: { address }, include: { base: true } });
    if (!row) return null;
    const [summary] = await this.summaries([row]);
    return {
      ...summary!,
      reserveBase: n(row.reserveBase),
      reserveQuote: n(row.reserveQuote),
      creator: row.creator,
      createdTx: row.createdTx,
      lpMint: row.lpMint,
      positionNft: row.positionNft,
      // Written by the indexer; anything malformed is left out rather than breaking the page.
      holders: z.array(z.unknown()).catch([]).parse(row.holders).flatMap((h) => {
        const r = HolderSliceSchema.safeParse(h);
        return r.success ? [r.data] : [];
      }),
    };
  }

  async chart(address: string, tf: Timeframe): Promise<ChartSeries> {
    const { stepMs, points } = CHART_TF[tf];
    const now = this.now();
    const start = now - (points - 1) * stepMs;
    const [row, snaps] = await Promise.all([
      this.db.pool.findUnique({ where: { address }, select: { priceUsd: true } }),
      this.db.poolSnapshot.findMany({ where: { poolAddress: address, ts: { gte: new Date(start - stepMs) } }, orderBy: { ts: 'asc' } }),
    ]);
    const current = n(row?.priceUsd);
    const buckets = new Map<number, Candle>();
    for (const s of snaps) {
      const t = start + Math.floor((s.ts.getTime() - start) / stepMs) * stepMs;
      const p = n(s.priceUsd);
      const c = buckets.get(t);
      if (!c) buckets.set(t, { t, o: p, h: p, l: p, c: p, v: n(s.volUsd) });
      else Object.assign(c, { h: Math.max(c.h, p), l: Math.min(c.l, p), c: p, v: c.v + n(s.volUsd) });
    }
    const candles: Candle[] = [];
    let prev: number | null = null;
    for (let t = start; t <= now; t += stepMs) {
      const c = buckets.get(t);
      if (c) {
        candles.push(c);
        prev = c.c;
      } else if (prev !== null) candles.push({ t, o: prev, h: prev, l: prev, c: prev, v: 0 });
    }
    if (candles.length < 2) {
      // No history yet: a flat line at the current price.
      const flat = (t: number): Candle => ({ t, o: current, h: current, l: current, c: current, v: 0 });
      return { tf, stepMs, points: [{ t: start, p: current }, { t: now, p: current }], candles: [flat(start), flat(now)] };
    }
    return { tf, stepMs, points: candles.map((c) => ({ t: c.t, p: c.c })), candles };
  }

  async trades(address: string): Promise<TradeOut[]> {
    const rows = await this.db.trade.findMany({ where: { poolAddress: address }, orderBy: { ts: 'desc' }, take: 20 });
    return rows.map((t) => ({
      sig: t.sig,
      ts: t.ts.getTime(),
      side: t.side,
      wallet: t.trader,
      amountUsd: n(t.amountUsd),
      baseAmount: n(t.baseAmount),
      quoteAmount: n(t.quoteAmount),
      priceUsd: n(t.baseAmount) ? n(t.amountUsd) / n(t.baseAmount) : 0,
    }));
  }

  // ---------------------------------------------------------------- home

  async movers(): Promise<PoolSummary[]> {
    const rows = await this.db.pool.findMany({ include: { base: true }, orderBy: [{ change24h: 'desc' }, { address: 'asc' }], take: 12 });
    return this.summaries(rows);
  }

  async stats(): Promise<Stats> {
    const now = this.now();
    const agg = await this.db.pool.aggregate({ _sum: { vol24hUsd: true, tvlUsd: true }, _count: { _all: true } });
    const top = await this.db.pool.findFirst({ where: { change24h: { gt: 0 } }, include: { base: true }, orderBy: { change24h: 'desc' } });
    let topGainer: Stats['topGainer'] = null;
    let gainer: number[] = [];
    if (top) {
      const [pool] = await this.summaries([top]);
      const day = await this.chart(top.address, '1D');
      gainer = downsample(day.points.map((p) => p.p), 40);
      topGainer = { pool: pool!, spark1d: gainer };
    }
    // Hourly totals across pools for the stat-card sparklines.
    // Per pool and hour first (average TVL, summed volume), so extra snapshots don't double-count.
    const hourly = await this.db.$queryRaw<{ h: Date; tvl: number; vol: number }[]>`
      SELECT h, SUM(tvl)::float AS tvl, SUM(vol)::float AS vol FROM (
        SELECT date_trunc('hour', "ts") AS h, "poolAddress", AVG("tvlUsd") AS tvl, SUM("volUsd") AS vol
        FROM "PoolSnapshot" WHERE "ts" >= ${new Date(now - DAY)} GROUP BY 1, 2
      ) per_pool GROUP BY h ORDER BY h`;
    return {
      vol24hUsd: n(agg._sum.vol24hUsd),
      tvlUsd: n(agg._sum.tvlUsd),
      marketCount: agg._count._all,
      topGainer,
      sparks: { vol: hourly.map((h) => h.vol), tvl: hourly.map((h) => h.tvl), gainer },
    };
  }

  async ticker(): Promise<TickerItem[]> {
    const book = await this.quoteBook();
    const rows = await this.db.pool.findMany({ include: { base: true }, orderBy: [{ vol24hUsd: 'desc' }, { address: 'asc' }], take: 12 });
    const items: TickerItem[] = rows.map((r) => ({ kind: 'pool', address: r.address, asset: assetRef(r.base), priceUsd: n(r.priceUsd), change24h: n(r.change24h) }));
    // Stocks interleaved every third slot, as in the prototype.
    book.stocks.slice(0, 6).forEach((s, i) => {
      const a = book.assets[s.mint]!;
      items.splice(Math.min(items.length, i * 3 + 1), 0, {
        kind: 'stock',
        address: null,
        asset: { mint: a.mint, symbol: a.symbol, name: a.name, logoUri: a.logoUri, brand: a.brand },
        priceUsd: a.priceUsd,
        change24h: a.change24h,
      });
    });
    return items;
  }

  // ---------------------------------------------------------------- activity

  private async pairRefs(addresses: string[]) {
    const book = await this.quoteBook();
    const pools = await this.db.pool.findMany({ where: { address: { in: [...new Set(addresses)] } }, include: { base: true } });
    return new Map(
      pools.map((p) => {
        const q = book.assets[p.quoteMint] ?? missingQuote(p);
        return [p.address, { address: p.address, base: assetRef(p.base), quote: { mint: q.mint, symbol: q.symbol, name: q.name, logoUri: q.logoUri, brand: q.brand } }];
      }),
    );
  }

  async recentActivity(limit = 20): Promise<ActivityItem[]> {
    const [trades, events] = await Promise.all([
      this.db.trade.findMany({ orderBy: { ts: 'desc' }, take: limit }),
      this.db.liquidityEvent.findMany({ where: { kind: { in: ['CREATE', 'ADD'] } }, orderBy: { ts: 'desc' }, take: limit }),
    ]);
    const refs = await this.pairRefs([...trades.map((t) => t.poolAddress), ...events.map((e) => e.poolAddress)]);
    const items: ActivityItem[] = [];
    for (const t of trades) {
      const pool = refs.get(t.poolAddress);
      if (pool) items.push({ id: t.sig, kind: t.side, pool, wallet: t.trader, amountUsd: n(t.amountUsd), ts: t.ts.getTime() });
    }
    for (const e of events) {
      const pool = refs.get(e.poolAddress);
      if (pool) items.push({ id: e.sig, kind: e.kind === 'CREATE' ? 'POOL' : 'ADD_LP', pool, wallet: e.wallet, amountUsd: n(e.amountUsd), ts: e.ts.getTime() });
    }
    return items.sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  async walletActivity(wallet: string): Promise<WalletActivity[]> {
    const [trades, events] = await Promise.all([
      this.db.trade.findMany({ where: { trader: wallet }, orderBy: { ts: 'desc' }, take: 50 }),
      this.db.liquidityEvent.findMany({ where: { wallet }, orderBy: { ts: 'desc' }, take: 50 }),
    ]);
    const refs = await this.pairRefs([...trades.map((t) => t.poolAddress), ...events.map((e) => e.poolAddress)]);
    const out: WalletActivity[] = [];
    for (const t of trades) {
      const pool = refs.get(t.poolAddress);
      if (pool) out.push({ sig: t.sig, ts: t.ts.getTime(), kind: 'SWAP', pool, amountUsd: n(t.amountUsd) });
    }
    for (const e of events) {
      const pool = refs.get(e.poolAddress);
      if (pool) out.push({ sig: e.sig, ts: e.ts.getTime(), kind: e.kind, pool, amountUsd: n(e.amountUsd) });
    }
    return out.sort((a, b) => b.ts - a.ts).slice(0, 50);
  }

  /** Symbols already used by listed tokens or verified stocks (for create step 1's duplicate warning). */
  async symbolTaken(symbol: string, mint: string): Promise<boolean> {
    const s = symbol.trim();
    if (!s) return false;
    const [token, stock] = await Promise.all([
      this.db.token.findFirst({ where: { symbol: { equals: s, mode: 'insensitive' }, NOT: { mint } }, select: { mint: true } }),
      this.db.stockAsset.findFirst({ where: { symbol: { equals: s, mode: 'insensitive' }, NOT: { mint } }, select: { mint: true } }),
    ]);
    return !!(token || stock);
  }
}

export function assetRef(t: Pick<Token, 'mint' | 'symbol' | 'name' | 'logoUri'>): AssetRef {
  return { mint: t.mint, symbol: t.symbol, name: t.name, logoUri: t.logoUri, brand: null };
}

/** A pool whose quote asset was disabled or never seeded: keep it listed, unpriced. */
function missingQuote(p: Pick<Pool, 'quoteMint' | 'quoteKind'>): QuoteAsset {
  const kind = p.quoteKind;
  return {
    mint: p.quoteMint,
    symbol: p.quoteMint === SOL_MINT ? 'SOL' : `${p.quoteMint.slice(0, 4)}…`,
    name: kind === 'STOCK' ? 'Unlisted stock token' : kind,
    logoUri: null,
    brand: kind === 'STOCK' ? null : NATIVE_BRANDS[kind],
    kind,
    priceUsd: 0,
    change24h: 0,
    issuer: null,
    priceUpdatedAt: iso(0),
    market: null,
    notice: null,
  };
}

function downsample(xs: number[], max: number): number[] {
  if (xs.length <= max) return xs;
  const step = (xs.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => xs[Math.round(i * step)]!);
}

const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString('base64url');
function decodeCursor(c: string | undefined): number {
  if (!c) return 0;
  const v = Number(Buffer.from(c, 'base64url').toString());
  return Number.isInteger(v) && v >= 0 ? v : 0;
}
