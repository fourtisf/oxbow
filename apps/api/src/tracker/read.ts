/**
 * What the pages read: the trade feed, the wallet leaderboard, one wallet's
 * performance and holdings, one token's facts and who among the tracked
 * wallets trades it, and the tokens tracked wallets are buying right now.
 */
import { Prisma, type PrismaClient, type TrackedWallet } from '@oxbow/db';
import {
  safetyFlags,
  safetyLevel,
  type ClosedPosition,
  type FeedPage,
  type FeedTrade,
  type Holding,
  type HotToken,
  type TokenDetail,
  type TokenTrader,
  type WalletDetail,
  type WalletStats,
  type WalletSummary,
} from '@oxbow/shared';
import type { FeedQuery } from './feed-query';
import { toFeedTrade } from './ingest';
import { WSOL } from './parse';
import { openPart, positions, summarize, type PnlTrade } from './pnl';
import { brief, STALE, type TokenBook } from './tokens';

type WalletInfo = Pick<TrackedWallet, 'address' | 'label' | 'featured'>;
const n = (d: Prisma.Decimal | number | null) => (d === null ? 0 : Number(d));
const iso = (d: Date | null) => (d ? d.toISOString() : null);

export class Reader {
  constructor(
    private readonly db: PrismaClient,
    private readonly tokens: TokenBook,
    private readonly now: () => number = Date.now,
  ) {}

  // ------------------------------------------------------------ feed

  async feed(q: FeedQuery): Promise<FeedPage> {
    const where: Prisma.WalletTradeWhereInput = {
      trader: { active: true },
      ...(q.wallets ? { wallet: { in: q.wallets } } : {}),
      ...(q.mint ? { mint: q.mint } : {}),
      ...(q.side ? { side: q.side } : {}),
      ...(q.minUsd ? { usd: { gte: q.minUsd } } : {}),
    };
    if (q.cursor) {
      const [ms, id] = q.cursor.split('_');
      const ts = new Date(Number(ms));
      where.OR = [{ ts: { lt: ts } }, { ts, id: { lt: BigInt(id!) } }];
    }
    const rows = await this.db.walletTrade.findMany({
      where,
      orderBy: [{ ts: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      include: { trader: { select: { address: true, label: true, featured: true } } },
    });
    const page = rows.slice(0, q.limit);
    const metas = await this.tokens.get(
      page.flatMap((r) => [r.mint, r.quoteMint]),
      STALE.ingest,
    );
    const last = page[page.length - 1];
    return {
      trades: page.map((r) => toFeedTrade(r, r.trader, metas)),
      nextCursor: rows.length > q.limit && last ? `${last.ts.getTime()}_${last.id}` : null,
    };
  }

  // ------------------------------------------------------------ wallets

  /** Featured wallets first, then the rest by realized profit. */
  async wallets(limit = 100): Promise<WalletSummary[]> {
    const list = await this.db.trackedWallet.findMany({
      where: { active: true },
      orderBy: [{ featured: 'desc' }, { lastTradeAt: { sort: 'desc', nulls: 'last' } }],
      take: 500,
      select: { address: true, label: true, featured: true },
    });
    if (!list.length) return [];
    const trades = await this.db.walletTrade.findMany({
      where: { wallet: { in: list.map((w) => w.address) } },
      orderBy: [{ ts: 'asc' }, { id: 'asc' }],
      select: { wallet: true, ts: true, side: true, mint: true, amount: true, usd: true },
    });
    const byWallet = new Map<string, PnlTrade[]>();
    for (const t of trades) {
      const arr = byWallet.get(t.wallet) ?? [];
      arr.push({ ts: t.ts, side: t.side, mint: t.mint, amount: n(t.amount), usd: n(t.usd) });
      byWallet.set(t.wallet, arr);
    }
    const prices = await this.prices(new Set(trades.map((t) => t.mint)));
    const weekAgo = this.now() - 7 * 864e5;
    const rows = list.map((w): WalletSummary => {
      const ts = byWallet.get(w.address) ?? [];
      return {
        address: w.address,
        label: w.label,
        featured: w.featured,
        stats: stats(ts, prices),
        volume7dUsd: ts.reduce((s, t) => (t.ts.getTime() >= weekAgo ? s + t.usd : s), 0),
      };
    });
    rows.sort((a, b) => Number(b.featured) - Number(a.featured) || b.stats.realizedPnlUsd - a.stats.realizedPnlUsd);
    return rows.slice(0, limit);
  }

  /** `held` gives the wallet's token balances on chain (UI units), when they could be read. */
  async wallet(address: string, held: ReadonlyMap<string, number> | null): Promise<WalletDetail | null> {
    const w = await this.db.trackedWallet.findUnique({ where: { address } });
    if (!w) return null;
    const rows = await this.db.walletTrade.findMany({
      where: { wallet: address },
      orderBy: [{ ts: 'asc' }, { id: 'asc' }],
      select: { ts: true, side: true, mint: true, amount: true, usd: true },
    });
    const trades = rows.map((t) => ({ ts: t.ts, side: t.side, mint: t.mint, amount: n(t.amount), usd: n(t.usd) }));
    const pos = positions(trades);
    const metas = await this.tokens.get(pos.keys(), STALE.list);
    const price = (m: string) => metas.get(m)?.usdPrice ?? null;
    const balance = (m: string) => (held ? (held.get(m) ?? 0) : null);

    const holdings: Holding[] = [];
    const closed: ClosedPosition[] = [];
    for (const p of pos.values()) {
      const open = openPart(p, balance(p.mint));
      if (open) {
        const px = price(p.mint);
        const value = px === null ? null : open.qty * px;
        holdings.push({
          token: brief(metas.get(p.mint), p.mint),
          amount: open.qty,
          costUsd: open.cost,
          priceUsd: px,
          valueUsd: value,
          pnlUsd: value === null ? null : value - open.cost,
          pnlPct: value === null || open.cost <= 0 ? null : ((value - open.cost) / open.cost) * 100,
          realizedPnlUsd: p.realized,
          lastTradeAt: p.lastTradeAt.toISOString(),
        });
      } else if (p.matched) {
        closed.push({ token: brief(metas.get(p.mint), p.mint), boughtUsd: p.boughtUsd, soldUsd: p.soldUsd, realizedPnlUsd: p.realized, lastTradeAt: p.lastTradeAt.toISOString() });
      }
    }
    holdings.sort((a, b) => (b.valueUsd ?? b.costUsd) - (a.valueUsd ?? a.costUsd));
    closed.sort((a, b) => b.lastTradeAt.localeCompare(a.lastTradeAt));

    const s = summarize(pos.values(), price, balance);
    return {
      address: w.address,
      label: w.label,
      featured: w.featured,
      addedAt: w.addedAt.toISOString(),
      backfilledAt: iso(w.backfilledAt),
      stats: {
        ...s,
        firstTradeAt: iso(trades[0]?.ts ?? null),
        lastTradeAt: iso(trades[trades.length - 1]?.ts ?? null),
      },
      holdings,
      closed: closed.slice(0, 50),
    };
  }

  // ------------------------------------------------------------ tokens

  async token(mint: string): Promise<TokenDetail | null> {
    const meta = (await this.tokens.get([mint], STALE.page)).get(mint);
    if (!meta) return null;
    const rows = await this.db.walletTrade.findMany({
      where: { mint, trader: { active: true } },
      orderBy: [{ ts: 'asc' }, { id: 'asc' }],
      take: 5000,
      include: { trader: { select: { address: true, label: true, featured: true } } },
    });
    const by = new Map<string, TokenTrader>();
    for (const r of rows) {
      const t = by.get(r.wallet) ?? { address: r.wallet, label: r.trader.label, featured: r.trader.featured, boughtUsd: 0, soldUsd: 0, netAmount: 0, lastSide: r.side, lastTradeAt: '' };
      if (r.side === 'BUY') {
        t.boughtUsd += n(r.usd);
        t.netAmount += n(r.amount);
      } else {
        t.soldUsd += n(r.usd);
        t.netAmount -= n(r.amount);
      }
      t.lastSide = r.side;
      t.lastTradeAt = r.ts.toISOString();
      by.set(r.wallet, t);
    }
    const traders = [...by.values()].sort((a, b) => b.lastTradeAt.localeCompare(a.lastTradeAt)).slice(0, 50);
    const flags = safetyFlags(
      {
        mintAuthorityOff: meta.mintAuthorityOff,
        freezeAuthorityOff: meta.freezeAuthorityOff,
        liquidityUsd: meta.liquidity,
        topHoldersPct: meta.topHoldersPct,
        devPct: meta.devPct,
        launchedAt: meta.launchedAt,
        organicScore: meta.organicScore,
        verified: meta.verified,
        stable: meta.stable || mint === WSOL,
      },
      this.now(),
    );
    return {
      ...brief(meta, mint),
      usdPrice: meta.usdPrice,
      change24h: meta.change24h,
      mcap: meta.mcap,
      liquidity: meta.liquidity,
      holderCount: meta.holderCount,
      organicScore: meta.organicScore,
      launchedAt: iso(meta.launchedAt),
      mintAuthorityOff: meta.mintAuthorityOff,
      freezeAuthorityOff: meta.freezeAuthorityOff,
      topHoldersPct: meta.topHoldersPct,
      devPct: meta.devPct,
      safety: { level: safetyLevel(flags), flags },
      traders,
    };
  }

  /** Tokens the most tracked wallets bought in the last 24 hours. */
  async hot(limit = 12): Promise<HotToken[]> {
    const since = new Date(this.now() - 864e5);
    const rows = await this.db.$queryRaw<
      { mint: string; buyers: bigint; sellers: bigint; buyUsd: Prisma.Decimal | null; sellUsd: Prisma.Decimal | null; lastTradeAt: Date }[]
    >`
      SELECT t."mint",
        COUNT(DISTINCT t."wallet") FILTER (WHERE t."side" = 'BUY') AS "buyers",
        COUNT(DISTINCT t."wallet") FILTER (WHERE t."side" = 'SELL') AS "sellers",
        SUM(t."usd") FILTER (WHERE t."side" = 'BUY') AS "buyUsd",
        SUM(t."usd") FILTER (WHERE t."side" = 'SELL') AS "sellUsd",
        MAX(t."ts") AS "lastTradeAt"
      FROM "WalletTrade" t
      JOIN "TrackedWallet" w ON w."address" = t."wallet" AND w."active"
      LEFT JOIN "TokenMeta" m ON m."mint" = t."mint"
      WHERE t."ts" > ${since} AND COALESCE(m."stable", false) = false
      GROUP BY t."mint"
      HAVING COUNT(*) FILTER (WHERE t."side" = 'BUY') > 0
      ORDER BY "buyers" DESC, "buyUsd" DESC NULLS LAST
      LIMIT ${limit}`;
    const metas = await this.tokens.get(
      rows.map((r) => r.mint),
      STALE.list,
    );
    return rows.map((r) => {
      const m = metas.get(r.mint);
      return {
        token: brief(m, r.mint),
        usdPrice: m?.usdPrice ?? null,
        change24h: m?.change24h ?? null,
        mcap: m?.mcap ?? null,
        buyers: Number(r.buyers),
        sellers: Number(r.sellers),
        buyUsd: n(r.buyUsd),
        sellUsd: n(r.sellUsd),
        lastTradeAt: r.lastTradeAt.toISOString(),
      };
    });
  }

  private async prices(mints: Set<string>): Promise<(m: string) => number | null> {
    const metas = await this.tokens.get(mints, STALE.list);
    return (m) => metas.get(m)?.usdPrice ?? null;
  }
}

function stats(trades: PnlTrade[], price: (m: string) => number | null): WalletStats {
  return {
    ...summarize(positions(trades).values(), price),
    firstTradeAt: iso(trades[0]?.ts ?? null),
    lastTradeAt: iso(trades[trades.length - 1]?.ts ?? null),
  };
}

export type { FeedTrade, WalletInfo };
