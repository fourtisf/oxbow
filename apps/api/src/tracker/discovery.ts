/**
 * Finds smart money on its own, from on-chain data only:
 *
 * 1. Candidates: the market tapes of the tokens trading most right now
 *    (Jupiter's top-traded list, minus stablecoins, SOL and thin or unvetted
 *    tokens): traders with real size, best those seen in several of them;
 *    then the largest holders of those tokens that are ordinary wallets.
 * 2. Evaluation: each candidate's own recent history, read and priced like a
 *    tracked wallet's. Bots are dropped first, from the signature list alone
 *    (too many transactions too fast), then for sandwich patterns (a buy and
 *    sell of the same token a slot or two apart), then wallets with no swap
 *    in the last week. What is left passes as
 *    "consistent" (enough closed positions, mostly at a profit, for a real
 *    amount) or "big win" (no more losses than wins, and a large realized
 *    profit: whales often close one or two positions for a lot).
 * 3. Promotion: wallets that pass are tracked as "discovered", with the
 *    history already read stored as their first trades.
 *
 * Every candidate is evaluated at most once a week, passed or not.
 */
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@oxbow/db';
import type { Jupiter } from '../jupiter';
import { Ingestor, ui } from './ingest';
import { parseTrades, walletChanges, WSOL, type RawTx } from './parse';
import { positions, summarize, type PnlTrade, type Summary } from './pnl';
import type { TrackerRpc, SignatureInfo } from './rpc';
import { mapLimit, type MarketTape } from './tape';
import { STALE, type TokenBook, type TokenMeta } from './tokens';

export interface DiscoveryConfig {
  /** Trending tokens sampled per run. */
  tokens: number;
  /** Newest signatures read from each token's market. */
  samplePerToken: number;
  /** Candidates evaluated per run (three times as many while fewer than `bootstrapBelow` are found). */
  evalsPerRun: number;
  /** Transactions read from each candidate's history. */
  historyTxs: number;
  minPnlUsd: number;
  minWinRate: number;
  minClosed: number;
  /** Realized profit that passes on its own with fewer closed positions ("big win"). */
  bigWinUsd: number;
  /** Smallest trade, USD, that makes a trader a candidate. */
  minTradeUsd: number;
  /** Most discovered wallets tracked at once. */
  max: number;
  bootstrapBelow: number;
}

export const DEFAULT_DISCOVERY: DiscoveryConfig = {
  tokens: 10,
  samplePerToken: 50,
  evalsPerRun: 8,
  historyTxs: 60,
  minPnlUsd: 250,
  minWinRate: 0.55,
  minClosed: 3,
  bigWinUsd: 2500,
  minTradeUsd: 100,
  max: 50,
  bootstrapBelow: 10,
};

export interface Candidate {
  address: string;
  tokens: Set<string>;
  usd: number;
  maxTradeUsd: number;
  /** Most fills in any one token's sample. */
  maxFillsInOne: number;
  /** Largest sale seen: someone taking profit is the best lead. */
  maxSellUsd: number;
}

export type Verdict =
  | { ok: true; summary: Summary; avgTradeUsd: number; kind: 'consistent' | 'big_win' }
  | { ok: false; reason: 'inactive' | 'stale' | 'too_fast' | 'sandwich' | 'few_closed' | 'low_win_rate' | 'low_pnl' | 'dust' | 'rpc'; summary?: Summary };

/** How long a verdict stands before the wallet may be checked again: bots and dust for a month, the rest for a few days (positions get closed). */
const SEEN_TTL_SEC: Record<string, number> = { too_fast: 30 * 86_400, sandwich: 30 * 86_400, dust: 14 * 86_400, inactive: 14 * 86_400 };
const SEEN_TTL_DEFAULT_SEC = 3 * 86_400;
const seenKey = (a: string) => `oxbow:disc:seen:${a}`;
/** More than this many transactions an hour on average reads as a bot. */
const MAX_TX_PER_HOUR = 60;
/** Three or more fills in one token's short sample: a bot's rhythm, not a person's. */
const MAX_FILLS_PER_SAMPLE = 2;
const READ_CONCURRENCY = 4;
/** Smart money for a live feed has to be trading: a trade within this long. */
const ACTIVE_WITHIN_MS = 7 * 864e5;

export interface Evaluation {
  verdict: Verdict;
  sigs: SignatureInfo[];
  txs: Map<string, RawTx>;
  metas: ReadonlyMap<string, TokenMeta>;
}

export class Discovery {
  constructor(
    private readonly d: {
      db: PrismaClient;
      rpc: TrackerRpc;
      tokens: TokenBook;
      jup: Jupiter;
      redis: Redis | null;
      tape: MarketTape;
      ingestor: Ingestor;
      config?: Partial<DiscoveryConfig>;
      log?: (m: string) => void;
      now?: () => number;
    },
  ) {}

  private get cfg(): DiscoveryConfig {
    return { ...DEFAULT_DISCOVERY, ...this.d.config };
  }

  private now() {
    return (this.d.now ?? Date.now)();
  }

  /** Mints worth sampling: busy, real markets that aren't money themselves. */
  async trending(): Promise<string[]> {
    // Half from the last hour (who is trading now), half from the last day (who already took profit).
    const [hour, day] = await Promise.all([this.d.jup.topTraded('1h', 50), this.d.jup.topTraded('24h', 50).catch(() => [])]);
    const good = (t: (typeof hour)[number]) => t.mint !== WSOL && !t.stable && (t.verified || (t.organicScore ?? 0) >= 50) && (t.liquidity ?? 0) >= 50_000 && (t.mcap ?? 0) >= 300_000;
    const out: string[] = [];
    const half = Math.ceil(this.cfg.tokens / 2);
    for (const t of hour.filter(good)) if (out.length < half && !out.includes(t.mint)) out.push(t.mint);
    for (const t of [...day, ...hour].filter(good)) if (out.length < this.cfg.tokens && !out.includes(t.mint)) out.push(t.mint);
    return out;
  }

  /** Traders on the tapes of `mints` with at least one real-size trade, not tracked or evaluated lately. Best first. */
  async candidates(mints: string[]): Promise<Candidate[]> {
    const by = new Map<string, Candidate>();
    for (const mint of mints) {
      let fills;
      try {
        fills = await this.d.tape.refresh(mint, this.cfg.samplePerToken);
      } catch (e) {
        this.d.log?.(`discovery: tape ${mint.slice(0, 6)}… failed: ${(e as Error).message}`);
        continue;
      }
      const perTrader = new Map<string, number>();
      for (const f of fills.slice(0, this.cfg.samplePerToken * 2)) {
        const c = by.get(f.trader) ?? { address: f.trader, tokens: new Set<string>(), usd: 0, maxTradeUsd: 0, maxFillsInOne: 0, maxSellUsd: 0 };
        c.tokens.add(mint);
        c.usd += f.usd;
        c.maxTradeUsd = Math.max(c.maxTradeUsd, f.usd);
        if (f.side === 'SELL') c.maxSellUsd = Math.max(c.maxSellUsd, f.usd);
        perTrader.set(f.trader, (perTrader.get(f.trader) ?? 0) + 1);
        c.maxFillsInOne = Math.max(c.maxFillsInOne, perTrader.get(f.trader)!);
        by.set(f.trader, c);
      }
    }
    const traders = [...by.values()].filter((c) => c.maxTradeUsd >= this.cfg.minTradeUsd && c.maxFillsInOne <= MAX_FILLS_PER_SAMPLE);
    const bigSale = (c: Candidate) => (c.maxSellUsd >= 500 ? 1 : 0);
    traders.sort((a, b) => bigSale(b) - bigSale(a) || b.tokens.size - a.tokens.size || b.usd - a.usd);
    // Big holders of what is trending: early buyers and whales. Two RPC calls a token.
    const holders = new Map<string, Candidate>();
    for (const mint of mints) {
      const owners = await this.d.rpc.getTopHolders(mint).catch(() => [] as string[]);
      for (const o of owners) {
        if (by.has(o)) continue;
        const c = holders.get(o) ?? { address: o, tokens: new Set<string>(), usd: 0, maxTradeUsd: 0, maxFillsInOne: 0, maxSellUsd: 0 };
        c.tokens.add(mint);
        holders.set(o, c);
      }
    }
    const list = [...traders, ...[...holders.values()].sort((a, b) => b.tokens.size - a.tokens.size)];
    if (!list.length) return [];
    const tracked = new Set((await this.d.db.trackedWallet.findMany({ where: { address: { in: list.map((c) => c.address) } }, select: { address: true } })).map((w) => w.address));
    const fresh: Candidate[] = [];
    for (const c of list) {
      if (tracked.has(c.address)) continue;
      const seen = this.d.redis ? await this.d.redis.exists(seenKey(c.address)).catch(() => 0) : 0;
      if (!seen) fresh.push(c);
    }
    return fresh;
  }

  /** Reads `address`'s recent history and judges it. */
  async evaluate(address: string): Promise<Evaluation> {
    const empty: Evaluation = { verdict: { ok: false, reason: 'inactive' }, sigs: [], txs: new Map(), metas: new Map() };
    let sigs: SignatureInfo[];
    try {
      sigs = await this.d.rpc.getSignatures(address, { limit: this.cfg.historyTxs });
    } catch {
      return { ...empty, verdict: { ok: false, reason: 'rpc' } };
    }
    const ok = sigs.filter((s) => !s.err);
    if (ok.length < 5) return { ...empty, sigs };
    if ((ok[0]?.blockTime ?? 0) * 1000 < this.now() - ACTIVE_WITHIN_MS) return { ...empty, sigs, verdict: { ok: false, reason: 'stale' } };
    const times = ok.map((s) => s.blockTime ?? 0).filter((t) => t > 0);
    const hours = times.length ? Math.max((Math.max(...times) - Math.min(...times)) / 3600, 1 / 6) : 1;
    // Cheapest check first: the signature list alone shows a bot's pace.
    if (ok.length / hours > MAX_TX_PER_HOUR) return { ...empty, sigs, verdict: { ok: false, reason: 'too_fast' } };

    const read = await mapLimit(ok, READ_CONCURRENCY, (s) => this.d.rpc.getTransaction(s.signature).catch(() => null));
    const txs = new Map<string, RawTx>();
    read.forEach((tx, i) => tx && txs.set(ok[i]!.signature, tx));
    const decimals = new Map<string, number>();
    for (const tx of txs.values()) for (const l of walletChanges(tx, address)?.tokens ?? []) decimals.set(l.mint, l.decimals);
    const metas = await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
    const solUsd = await this.d.tokens.solPrice();

    const trades: (PnlTrade & { slot: number })[] = [];
    for (const tx of txs.values()) {
      for (const t of parseTrades(tx, address, (m) => metas.get(m)?.stable === true)) {
        const quote = metas.get(t.quoteMint);
        const px = t.quoteMint === WSOL ? solUsd : quote?.stable ? (quote.usdPrice ?? 1) : (quote?.usdPrice ?? null);
        if (px === null) continue;
        trades.push({ ts: new Date((tx.blockTime ?? 0) * 1000), slot: tx.slot, side: t.side, mint: t.mint, amount: ui(t.amount, t.decimals), usd: ui(t.quoteAmount, t.quoteDecimals) * px });
      }
    }
    trades.sort((a, b) => a.slot - b.slot);
    const base = { sigs, txs, metas };
    if (sandwiches(trades) >= 2) return { ...base, verdict: { ok: false, reason: 'sandwich' } };

    const summary = summarize(positions(trades).values(), (m) => metas.get(m)?.usdPrice ?? null);
    const avgTradeUsd = trades.length ? summary.volumeUsd / trades.length : 0;
    const c = this.cfg;
    const fail = (reason: Exclude<Verdict, { ok: true }>['reason']): Evaluation => ({ ...base, verdict: { ok: false, reason, summary } });
    const closed = summary.wins + summary.losses;
    const win = summary.winRate ?? 0;
    if (avgTradeUsd < 25 || trades.length < 2) return fail('dust');
    // Its newest swap, not just any transaction (spam airdrops land on idle wallets too).
    if ((trades[trades.length - 1]?.ts.getTime() ?? 0) < this.now() - ACTIVE_WITHIN_MS) return fail('stale');
    if (closed >= 1 && win >= 0.5 && summary.realizedPnlUsd >= c.bigWinUsd) return { ...base, verdict: { ok: true, summary, avgTradeUsd, kind: 'big_win' } };
    if (trades.length < 4) return fail('dust');
    if (closed < c.minClosed) return fail('few_closed');
    if (win < c.minWinRate) return fail('low_win_rate');
    if (summary.realizedPnlUsd < c.minPnlUsd) return fail('low_pnl');
    return { ...base, verdict: { ok: true, summary, avgTradeUsd, kind: 'consistent' } };
  }

  /** Tracks `address` as discovered and stores the history `ev` already read. */
  async promote(address: string, ev: Evaluation): Promise<void> {
    const wallet = await this.d.db.trackedWallet.upsert({
      where: { address },
      create: { address, source: 'discovered' },
      update: { active: true },
    });
    for (const s of [...ev.sigs].reverse()) {
      const tx = ev.txs.get(s.signature);
      if (!tx) continue;
      await this.d.ingestor.ingest(wallet, s.signature, { pre: { tx, metas: ev.metas } }).catch(() => []);
    }
    await this.d.db.trackedWallet.update({
      where: { address },
      data: { lastSignature: ev.sigs[0]?.signature ?? null, backfilledAt: new Date(this.now()) },
    });
  }

  /** One discovery round. Returns the wallets it started tracking. */
  async run(): Promise<{ sampled: number; evaluated: number; promoted: string[] }> {
    const active = await this.d.db.trackedWallet.count({ where: { source: 'discovered', active: true } });
    if (active >= this.cfg.max) return { sampled: 0, evaluated: 0, promoted: [] };
    const mints = await this.trending();
    const candidates = await this.candidates(mints);
    const budget = Math.min(candidates.length, active < this.cfg.bootstrapBelow ? this.cfg.evalsPerRun * 3 : this.cfg.evalsPerRun);
    const promoted: string[] = [];
    let evaluated = 0;
    for (const c of candidates.slice(0, budget)) {
      if (active + promoted.length >= this.cfg.max) break;
      const ev = await this.evaluate(c.address);
      evaluated++;
      if (ev.verdict.ok || ev.verdict.reason !== 'rpc') {
        const why = ev.verdict.ok ? 'ok' : ev.verdict.reason;
        await this.d.redis?.set(seenKey(c.address), why, 'EX', SEEN_TTL_SEC[why] ?? SEEN_TTL_DEFAULT_SEC).catch(() => {});
      }
      if (!ev.verdict.ok) {
        const s = ev.verdict.summary;
        this.d.log?.(`discovery: ${c.address.slice(0, 6)}… passed over (${ev.verdict.reason}${s ? `, $${Math.round(s.realizedPnlUsd)} realized, ${s.wins}/${s.wins + s.losses} won` : ''})`);
        continue;
      }
      await this.promote(c.address, ev);
      promoted.push(c.address);
      const s = ev.verdict.summary;
      this.d.log?.(`discovered ${c.address.slice(0, 6)}… (${ev.verdict.kind}): +$${Math.round(s.realizedPnlUsd)} realized, ${s.wins}/${s.wins + s.losses} closed in profit`);
    }
    return { sampled: mints.length, evaluated, promoted };
  }

  /**
   * Stops tracking discovered wallets that stopped earning: over the last two weeks of
   * tracked trades, more closed at a loss than at a profit and the total realized is negative.
   */
  async prune(): Promise<number> {
    const since = new Date(this.now() - 14 * 864e5);
    const list = await this.d.db.trackedWallet.findMany({ where: { source: 'discovered', active: true }, select: { address: true } });
    let pruned = 0;
    for (const w of list) {
      const rows = await this.d.db.walletTrade.findMany({ where: { wallet: w.address, ts: { gte: since } }, orderBy: [{ ts: 'asc' }, { id: 'asc' }], select: { ts: true, side: true, mint: true, amount: true, usd: true } });
      const s = summarize(positions(rows.map((r) => ({ ts: r.ts, side: r.side, mint: r.mint, amount: Number(r.amount), usd: Number(r.usd) }))).values(), () => null);
      if (s.wins + s.losses >= 5 && s.losses > s.wins && s.realizedPnlUsd < 0) {
        await this.d.db.trackedWallet.update({ where: { address: w.address }, data: { active: false } });
        pruned++;
      }
    }
    return pruned;
  }
}

/** Buys followed by a sell of the same token within two slots: the shape of a sandwich bot. */
export function sandwiches(trades: { slot: number; side: 'BUY' | 'SELL'; mint: string }[]): number {
  const lastBuy = new Map<string, number>();
  let n = 0;
  for (const t of trades) {
    if (t.side === 'BUY') lastBuy.set(t.mint, t.slot);
    else {
      const b = lastBuy.get(t.mint);
      if (b !== undefined && t.slot - b <= 2) n++;
    }
  }
  return n;
}
