/**
 * Finds smart money on its own, from on-chain data only:
 *
 * 1. Candidates: first, whoever bought a token just before a known smart
 *    wallet's winning buy of it (early into winners); then who is swapping
 *    right now through Jupiter's router and pump.fun (its bonding curve and
 *    PumpSwap, where trading terminals send memecoin orders directly), plus
 *    the market tapes of the tokens trading most (Jupiter's top-traded list,
 *    minus stablecoins, SOL and thin or unvetted tokens). Traders with real
 *    size who just took profit come first, then those seen in several tokens.
 *    (Big holders were tried and left out: almost all of them are passive.)
 * 2. Evaluation: each candidate's own recent history, read in one request
 *    where the RPC provider allows (rpc.ts) and priced like a tracked
 *    wallet's. Bots are dropped first, from the signature list alone (most
 *    transactions failing, or too many too fast), then for sandwich patterns
 *    (a buy and sell of the same token a slot or two apart), then wallets
 *    with no swap in the last week. What is left passes as
 *    "consistent" (enough closed positions, mostly at a profit, for a real
 *    amount) or "big win" (no more losses than wins, and a large realized
 *    profit: whales often close one or two positions for a lot), as long as
 *    a real part of the profit was made in tokens with organic trading
 *    (`isOrganic`): wash-trading farms of hundreds of wallets churn fresh
 *    copycat tokens nobody else trades, and their winners look profitable.
 * 3. Promotion: wallets that pass are tracked as "discovered", with the
 *    history already read stored as their first trades.
 *
 * Every candidate is evaluated at most once a week, passed or not.
 */
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@oxbow/db';
import { JUPITER_PROGRAM_ID } from '@oxbow/solana/swap';
import type { Jupiter } from '../jupiter';
import { Ingestor, ui } from './ingest';
import { parseTrades, walletChanges, WSOL, type RawTx } from './parse';
import { positions, summarize, type PnlTrade, type Summary } from './pnl';
import { readHistory, type HistoryEntry, type HistoryOpts, type TrackerRpc, type SignatureInfo } from './rpc';
import { fillsOf, type MarketTape } from './tape';
import { quoteUsd, STALE, type TokenBook, type TokenMeta } from './tokens';

export interface DiscoveryConfig {
  /** Winning trades of known smart wallets whose early co-buyers are looked up per run. */
  winnersPerRun: number;
  /** Transactions of a token's market read just before a smart wallet's winning buy. */
  coBuyerSample: number;
  /** Newest transactions through Jupiter's router read per run: mostly real people's swaps. */
  routerSample: number;
  /** Newest transactions read per run from each of pump.fun's programs (bonding curve and PumpSwap). */
  pumpSample: number;
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
  /** RPC credits discovery may spend a day (UTC), so it never eats the plan the tracker needs; spread over the day. 0 = no limit. */
  dailyCalls: number;
}

export const DEFAULT_DISCOVERY: DiscoveryConfig = {
  winnersPerRun: 6,
  coBuyerSample: 60,
  routerSample: 300,
  pumpSample: 200,
  tokens: 6,
  samplePerToken: 40,
  evalsPerRun: 30,
  historyTxs: 100,
  minPnlUsd: 150,
  minWinRate: 0.5,
  minClosed: 3,
  bigWinUsd: 1500,
  minTradeUsd: 50,
  max: 100,
  bootstrapBelow: 10,
  dailyCalls: 15_000,
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
  | { ok: false; reason: 'inactive' | 'stale' | 'bot' | 'too_fast' | 'sandwich' | 'wash' | 'few_closed' | 'low_win_rate' | 'low_pnl' | 'dust' | 'rpc'; summary?: Summary };

/**
 * A token with real trading behind it: Jupiter sees organic activity in it, has verified it, or
 * its market is deep. Wash-trading farms make their "profits" in tokens with none of these
 * (organic score 0, unverified, liquidity gone minutes after launch), and copying them buys rugs.
 */
export function isOrganic(m: Pick<TokenMeta, 'organicScore' | 'verified' | 'liquidity'> | undefined): boolean {
  return !!m && ((m.organicScore ?? 0) >= 1 || m.verified || (m.liquidity ?? 0) >= 50_000);
}

/**
 * pump.fun's bonding-curve program and its PumpSwap AMM, as published in pump.fun's SDKs
 * (@pump-fun/pump-sdk PUMP_PROGRAM_ID, @pump-fun/pump-swap-sdk PUMP_AMM_PROGRAM_ID) and seen
 * invoked in pump.fun tokens' trades on mainnet.
 */
export const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMP_AMM_PROGRAM_ID = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';

/** How long a verdict stands before the wallet may be checked again: bots and dust for a month, the rest for a few days (positions get closed). */
const SEEN_TTL_SEC: Record<string, number> = { sandwich: 30 * 86_400, bot: 30 * 86_400, wash: 14 * 86_400, too_fast: 7 * 86_400, dust: 7 * 86_400, inactive: 7 * 86_400, stale: 3 * 86_400 };
/** Close calls (few closed, low win rate or profit) are checked again the next day: positions get closed. */
const SEEN_TTL_DEFAULT_SEC = 86_400;
const seenKey = (a: string) => `oxbow:disc:seen:${a}`;
/** One round at a time across the worker and the CLI: two at once only trip the RPC rate limit. */
export const DISCOVERY_LOCK = 'oxbow:discovery:running';
/** Running totals for the status page and the empty feed: checked, found, lastRunAt. */
export const DISCOVERY_STATS = 'oxbow:discovery:stats';
/** RPC credits discovery spent on a day (UTC). */
export const callsKey = (day: string) => `oxbow:discovery:calls:${day}`;
/** A winning buy whose co-buyers were already looked up. */
const winnerKey = (signature: string) => `oxbow:disc:winner:${signature}`;
const WINNER_TTL_SEC = 30 * 86_400;
/** Winning trades are looked for in this recent window. */
const WINNERS_WITHIN_MS = 14 * 864e5;
/** More than this many transactions an hour on average reads as a bot (MEV bots do thousands; busy traders on trading bots stay under). */
const MAX_TX_PER_HOUR = 120;
/** Three or more fills in one token's short sample: a bot's rhythm, not a person's. */
const MAX_FILLS_PER_SAMPLE = 2;
const READ_CONCURRENCY = 4;
/** Sniper and arbitrage bots fire transactions that mostly fail; people's mostly land. */
const MAX_FAILED_SHARE = 0.5;
/** Smart money for a live feed has to be trading: a trade within this long. */
const ACTIVE_WITHIN_MS = 7 * 864e5;

export interface Evaluation {
  verdict: Verdict;
  sigs: SignatureInfo[];
  txs: Map<string, RawTx>;
  metas: ReadonlyMap<string, TokenMeta>;
}

export class Discovery {
  /** RPC calls this process spent in the current round, not yet added to today's total. */
  private spent = 0;
  private readonly rpc: TrackerRpc;

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
  ) {
    const count = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => (...a: A) => {
      this.spent++;
      return fn(...a);
    };
    const history = d.rpc.getHistory?.bind(d.rpc);
    this.rpc = {
      getTransaction: count((s: string) => d.rpc.getTransaction(s)),
      getSignatures: count((a: string, o: { limit: number; until?: string; before?: string }) => d.rpc.getSignatures(a, o)),
      getTopHolders: count((m: string) => d.rpc.getTopHolders(m)),
      ...(history
        ? {
            getHistory: async (a: string, o: HistoryOpts) => {
              const h = await history(a, o);
              this.spent += h.credits;
              return h;
            },
          }
        : {}),
    };
  }

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

  /**
   * Who is swapping right now, from a program's newest transactions: Jupiter's router (busy tokens'
   * own markets are mostly arbitrage bots; the router is mostly people) and pump.fun's programs
   * (where trading terminals send memecoin orders). Every signer's trades count.
   */
  private async programFills(program: string, sample: number, by: Map<string, Candidate>): Promise<void> {
    if (sample <= 0) return;
    const { entries } = await readHistory(this.rpc, program, { limit: sample, succeededOnly: true }, READ_CONCURRENCY);
    const txs = entries.map((e) => e.tx).filter((t): t is RawTx => !!t);
    const decimals = new Map<string, number>();
    for (const tx of txs) {
      const msg = tx.transaction.message;
      for (const signer of msg.accountKeys.slice(0, msg.header.numRequiredSignatures)) for (const l of walletChanges(tx, signer)?.tokens ?? []) decimals.set(l.mint, l.decimals);
    }
    const metas = await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
    const solUsd = await this.d.tokens.solPrice();
    const perTrader = new Map<string, number>();
    for (const tx of txs) {
      const msg = tx.transaction.message;
      for (const signer of msg.accountKeys.slice(0, msg.header.numRequiredSignatures)) {
        for (const t of parseTrades(tx, signer, (m) => metas.get(m)?.stable === true)) {
          const px = quoteUsd(t.quoteMint, metas, solUsd);
          if (px === null) continue;
          const usd = ui(t.quoteAmount, t.quoteDecimals) * px;
          const c = by.get(signer) ?? { address: signer, tokens: new Set<string>(), usd: 0, maxTradeUsd: 0, maxFillsInOne: 0, maxSellUsd: 0 };
          c.tokens.add(t.mint);
          c.usd += usd;
          c.maxTradeUsd = Math.max(c.maxTradeUsd, usd);
          if (t.side === 'SELL') c.maxSellUsd = Math.max(c.maxSellUsd, usd);
          perTrader.set(signer, (perTrader.get(signer) ?? 0) + 1);
          c.maxFillsInOne = Math.max(c.maxFillsInOne, perTrader.get(signer)!);
          by.set(signer, c);
        }
      }
    }
  }

  /**
   * Early co-buyers: for tokens a known smart wallet (discovered, featured or added by the owner) bought
   * and sold at a profit, whoever bought the same token just before it did. Getting into winners early
   * is what smart money does, so these are the best leads. Each winning buy is looked up once.
   */
  private async coBuyerFills(by: Map<string, Candidate>, early: Set<string>): Promise<void> {
    if (this.cfg.winnersPerRun <= 0) return;
    const known = await this.d.db.trackedWallet.findMany({ where: { active: true, OR: [{ source: { in: ['discovered', 'owner'] } }, { featured: true }] }, select: { address: true } });
    if (!known.length) return;
    const rows = await this.d.db.walletTrade.findMany({
      where: { wallet: { in: known.map((w) => w.address) }, ts: { gte: new Date(this.now() - WINNERS_WITHIN_MS) } },
      orderBy: [{ ts: 'asc' }, { id: 'asc' }],
      select: { wallet: true, ts: true, side: true, mint: true, amount: true, usd: true, signature: true, slot: true },
    });
    const byWallet = new Map<string, typeof rows>();
    for (const r of rows) byWallet.set(r.wallet, [...(byWallet.get(r.wallet) ?? []), r]);
    const winners: { mint: string; signature: string; slot: number; realized: number }[] = [];
    for (const list of byWallet.values()) {
      const pos = positions(list.map((r) => ({ ts: r.ts, side: r.side, mint: r.mint, amount: Number(r.amount), usd: Number(r.usd) })));
      for (const p of pos.values()) {
        if (!p.matched || p.realized <= 0) continue;
        const buy = list.find((r) => r.mint === p.mint && r.side === 'BUY');
        if (buy) winners.push({ mint: p.mint, signature: buy.signature, slot: Number(buy.slot), realized: p.realized });
      }
    }
    // Only winners in tokens with real trading: a farm's winners would only lead to more of the farm.
    const facts = new Map((await this.d.db.tokenMeta.findMany({ where: { mint: { in: [...new Set(winners.map((w) => w.mint))] } } })).map((m) => [m.mint, m]));
    winners.splice(0, winners.length, ...winners.filter((w) => isOrganic(facts.get(w.mint))));
    winners.sort((a, b) => b.realized - a.realized);
    let done = 0;
    for (const w of winners) {
      if (done >= this.cfg.winnersPerRun) break;
      if (this.d.redis && (await this.d.redis.exists(winnerKey(w.signature)).catch(() => 0))) continue;
      done++;
      await this.d.redis?.set(winnerKey(w.signature), '1', 'EX', WINNER_TTL_SEC).catch(() => {});
      const { entries } = await readHistory(this.rpc, w.mint, { limit: this.cfg.coBuyerSample, before: { signature: w.signature, slot: w.slot }, succeededOnly: true }, READ_CONCURRENCY).catch(() => ({ entries: [] as HistoryEntry[] }));
      const sigs = entries;
      const read = entries.map((e) => e.tx);
      const decimals = new Map<string, number>();
      for (const tx of read) {
        if (!tx) continue;
        const msg = tx.transaction.message;
        for (const signer of msg.accountKeys.slice(0, msg.header.numRequiredSignatures)) for (const l of walletChanges(tx, signer)?.tokens ?? []) decimals.set(l.mint, l.decimals);
      }
      const metas = await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
      const solUsd = await this.d.tokens.solPrice();
      const perTrader = new Map<string, number>();
      read.forEach((tx, i) => {
        if (!tx) return;
        for (const f of fillsOf(tx, sigs[i]!.signature, w.mint, metas, solUsd)) {
          perTrader.set(f.trader, (perTrader.get(f.trader) ?? 0) + 1);
          if (f.side !== 'BUY') continue;
          const c = by.get(f.trader) ?? { address: f.trader, tokens: new Set<string>(), usd: 0, maxTradeUsd: 0, maxFillsInOne: 0, maxSellUsd: 0 };
          c.tokens.add(w.mint);
          c.usd += f.usd;
          c.maxTradeUsd = Math.max(c.maxTradeUsd, f.usd);
          c.maxFillsInOne = Math.max(c.maxFillsInOne, perTrader.get(f.trader)!);
          by.set(f.trader, c);
          early.add(f.trader);
        }
      });
    }
  }

  /** Real-size traders: early co-buyers of smart wallets' winners, Jupiter's router, pump.fun and trending markets. Best first. */
  async candidates(mints: string[]): Promise<Candidate[]> {
    const by = new Map<string, Candidate>();
    const early = new Set<string>();
    try {
      await this.coBuyerFills(by, early);
    } catch (e) {
      this.d.log?.(`discovery: co-buyer lookup failed: ${(e as Error).message}`);
    }
    const programs: [string, string, number][] = [
      ['router', JUPITER_PROGRAM_ID.toBase58(), this.cfg.routerSample],
      ['pump.fun', PUMP_PROGRAM_ID, this.cfg.pumpSample],
      ['PumpSwap', PUMP_AMM_PROGRAM_ID, this.cfg.pumpSample],
    ];
    for (const [name, program, sample] of programs) {
      try {
        await this.programFills(program, sample, by);
      } catch (e) {
        this.d.log?.(`discovery: ${name} sample failed: ${(e as Error).message}`);
      }
    }
    for (const mint of mints) {
      let fills;
      try {
        // The tape reads with its own client and reports what it spent.
        fills = await this.d.tape.refresh(mint, this.cfg.samplePerToken, (n) => (this.spent += n));
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
    const isEarly = (c: Candidate) => (early.has(c.address) ? 1 : 0);
    traders.sort((a, b) => isEarly(b) - isEarly(a) || bigSale(b) - bigSale(a) || b.tokens.size - a.tokens.size || b.usd - a.usd);
    const list = traders;
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

  /** Prices the trades `address` made in `entries` (its history, already read). */
  private async readTrades(address: string, entries: HistoryEntry[]): Promise<{ txs: Map<string, RawTx>; metas: ReadonlyMap<string, TokenMeta>; trades: (PnlTrade & { slot: number })[] }> {
    const txs = new Map<string, RawTx>();
    for (const e of entries) if (e.tx && !e.err) txs.set(e.signature, e.tx);
    const decimals = new Map<string, number>();
    for (const tx of txs.values()) for (const l of walletChanges(tx, address)?.tokens ?? []) decimals.set(l.mint, l.decimals);
    const metas = await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
    const solUsd = await this.d.tokens.solPrice();
    const trades: (PnlTrade & { slot: number })[] = [];
    for (const tx of txs.values()) {
      for (const t of parseTrades(tx, address, (m) => metas.get(m)?.stable === true)) {
        const px = quoteUsd(t.quoteMint, metas, solUsd);
        if (px === null) continue;
        trades.push({ ts: new Date((tx.blockTime ?? 0) * 1000), slot: tx.slot, side: t.side, mint: t.mint, amount: ui(t.amount, t.decimals), usd: ui(t.quoteAmount, t.quoteDecimals) * px });
      }
    }
    return { txs, metas, trades };
  }

  /** Reads `address`'s recent history and judges it. */
  async evaluate(address: string): Promise<Evaluation> {
    const empty: Evaluation = { verdict: { ok: false, reason: 'inactive' }, sigs: [], txs: new Map(), metas: new Map() };
    let entries: HistoryEntry[];
    try {
      entries = (await readHistory(this.rpc, address, { limit: this.cfg.historyTxs }, READ_CONCURRENCY)).entries;
    } catch {
      return { ...empty, verdict: { ok: false, reason: 'rpc' } };
    }
    const sigs: SignatureInfo[] = entries.map(({ signature, slot, err, blockTime }) => ({ signature, slot, err, blockTime }));
    const ok = entries.filter((s) => !s.err);
    // Cheapest checks first: the signature list alone shows a bot.
    if (entries.length >= 20 && (entries.length - ok.length) / entries.length > MAX_FAILED_SHARE) return { ...empty, sigs, verdict: { ok: false, reason: 'bot' } };
    if (ok.length < 5) return { ...empty, sigs };
    if ((ok[0]?.blockTime ?? 0) * 1000 < this.now() - ACTIVE_WITHIN_MS) return { ...empty, sigs, verdict: { ok: false, reason: 'stale' } };
    const times = ok.map((s) => s.blockTime ?? 0).filter((t) => t > 0);
    const hours = times.length ? Math.max((Math.max(...times) - Math.min(...times)) / 3600, 1 / 6) : 1;
    if (ok.length / hours > MAX_TX_PER_HOUR) return { ...empty, sigs, verdict: { ok: false, reason: 'too_fast' } };

    const { txs, metas, trades } = await this.readTrades(address, ok);
    trades.sort((a, b) => a.slot - b.slot);
    const base = { sigs, txs, metas };
    if (sandwiches(trades) >= 2) return { ...base, verdict: { ok: false, reason: 'sandwich' } };

    const pos = positions(trades);
    const price = (m: string) => metas.get(m)?.usdPrice ?? null;
    const summary = summarize(pos.values(), price);
    // The same, counting only tokens with real trading behind them.
    const organic = summarize([...pos.values()].filter((p) => isOrganic(metas.get(p.mint))), price);
    const avgTradeUsd = trades.length ? summary.volumeUsd / trades.length : 0;
    const c = this.cfg;
    const fail = (reason: Exclude<Verdict, { ok: true }>['reason']): Evaluation => ({ ...base, verdict: { ok: false, reason, summary } });
    const closed = summary.wins + summary.losses;
    const win = summary.winRate ?? 0;
    if (avgTradeUsd < 25 || trades.length < 2) return fail('dust');
    // Its newest swap, not just any transaction (spam airdrops land on idle wallets too).
    if ((trades[trades.length - 1]?.ts.getTime() ?? 0) < this.now() - ACTIVE_WITHIN_MS) return fail('stale');
    if (closed >= 1 && win >= 0.5 && summary.realizedPnlUsd >= c.bigWinUsd) {
      return organic.realizedPnlUsd >= c.bigWinUsd / 2 ? { ...base, verdict: { ok: true, summary, avgTradeUsd, kind: 'big_win' } } : fail('wash');
    }
    if (trades.length < 4) return fail('dust');
    if (closed < c.minClosed) return fail('few_closed');
    if (win < c.minWinRate) return fail('low_win_rate');
    if (summary.realizedPnlUsd < c.minPnlUsd) return fail('low_pnl');
    if (organic.realizedPnlUsd < c.minPnlUsd / 2 || organic.wins < organic.losses) return fail('wash');
    return { ...base, verdict: { ok: true, summary, avgTradeUsd, kind: 'consistent' } };
  }

  /**
   * Tracks `address` as discovered and stores the history `ev` already read, oldest first.
   * If a transaction can't be stored, the bookmark stops before it and the worker's
   * catch-up finishes the history.
   */
  async promote(address: string, ev: Evaluation): Promise<void> {
    const wallet = await this.d.db.trackedWallet.upsert({
      where: { address },
      create: { address, source: 'discovered' },
      update: { active: true },
    });
    let bookmark: string | null = null;
    let complete = true;
    for (const s of [...ev.sigs].reverse()) {
      const tx = ev.txs.get(s.signature);
      if (!s.err) {
        if (!tx) {
          complete = false;
          break;
        }
        try {
          await this.d.ingestor.ingest(wallet, s.signature, { pre: { tx, metas: ev.metas } });
        } catch {
          complete = false;
          break;
        }
      }
      bookmark = s.signature;
    }
    await this.d.db.trackedWallet.update({
      where: { address },
      data: { lastSignature: bookmark, backfilledAt: complete ? new Date(this.now()) : null },
    });
  }

  /** One discovery round. Returns the wallets it started tracking; `busy` when another round is running. */
  async run(): Promise<{ sampled: number; evaluated: number; promoted: string[]; busy?: boolean; budget?: boolean }> {
    const redis = this.d.redis;
    const token = Math.random().toString(36).slice(2);
    if (redis && (await redis.set(DISCOVERY_LOCK, token, 'EX', 3600, 'NX').catch(() => 'OK')) !== 'OK') return { sampled: 0, evaluated: 0, promoted: [], busy: true };
    try {
      return await this.round();
    } finally {
      await redis?.hset(DISCOVERY_STATS, 'lastRunAt', String(this.now())).catch(() => 0);
      await redis?.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, DISCOVERY_LOCK, token).catch(() => 0);
    }
  }

  /** Calls spent today across rounds, plus this round's so far. */
  private async usedToday(): Promise<number> {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const stored = this.d.redis ? Number(await this.d.redis.get(callsKey(day)).catch(() => 0)) || 0 : 0;
    return stored + this.spent;
  }

  private async bank() {
    if (!this.spent) return;
    const day = new Date(this.now()).toISOString().slice(0, 10);
    const n = this.spent;
    this.spent = 0;
    await this.d.redis?.multi().incrby(callsKey(day), n).expire(callsKey(day), 2 * 86_400).exec().catch(() => 0);
  }

  private async overBudget(): Promise<boolean> {
    return this.cfg.dailyCalls > 0 && (await this.usedToday()) >= budgetSoFar(this.cfg.dailyCalls, this.now());
  }

  private async round(): Promise<{ sampled: number; evaluated: number; promoted: string[]; budget?: boolean }> {
    try {
      return await this.roundInner();
    } finally {
      await this.bank();
    }
  }

  private async roundInner(): Promise<{ sampled: number; evaluated: number; promoted: string[]; budget?: boolean }> {
    const active = await this.d.db.trackedWallet.count({ where: { source: 'discovered', active: true } });
    if (active >= this.cfg.max) return { sampled: 0, evaluated: 0, promoted: [] };
    if (await this.overBudget()) return { sampled: 0, evaluated: 0, promoted: [], budget: true };
    const mints = await this.trending();
    const candidates = await this.candidates(mints);
    const budget = Math.min(candidates.length, active < this.cfg.bootstrapBelow ? this.cfg.evalsPerRun * 3 : this.cfg.evalsPerRun);
    const promoted: string[] = [];
    let evaluated = 0;
    for (const c of candidates.slice(0, budget)) {
      if (active + promoted.length >= this.cfg.max) break;
      if (await this.overBudget()) return { sampled: mints.length, evaluated, promoted, budget: true };
      const ev = await this.evaluate(c.address);
      evaluated++;
      await this.d.redis?.hincrby(DISCOVERY_STATS, 'checked', 1).catch(() => 0);
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
      await this.d.redis?.hincrby(DISCOVERY_STATS, 'found', 1).catch(() => 0);
      const s = ev.verdict.summary;
      this.d.log?.(`discovered ${c.address.slice(0, 6)}… (${ev.verdict.kind}): +$${Math.round(s.realizedPnlUsd)} realized, ${s.wins}/${s.wins + s.losses} closed in profit`);
    }
    return { sampled: mints.length, evaluated, promoted };
  }

  /**
   * Stops tracking discovered wallets that stopped earning (over the last two weeks of tracked
   * trades, more closed at a loss than at a profit and the total realized negative) or turned
   * out to be bots (most of their recent transactions failing, or too many too fast): those
   * also cost the RPC plan a read for every transaction.
   */
  async prune(): Promise<number> {
    const since = new Date(this.now() - 14 * 864e5);
    const list = await this.d.db.trackedWallet.findMany({ where: { source: 'discovered', active: true }, select: { address: true } });
    let pruned = 0;
    for (const w of list) {
      const sigs = await this.d.rpc.getSignatures(w.address, { limit: 100 }).catch(() => null);
      if (sigs && looksLikeBot(sigs)) {
        await this.d.db.trackedWallet.update({ where: { address: w.address }, data: { active: false } });
        await this.d.redis?.set(seenKey(w.address), 'bot', 'EX', SEEN_TTL_SEC.bot!).catch(() => {});
        this.d.log?.(`discovery: ${w.address.slice(0, 6)}… acts like a bot; no longer tracked`);
        pruned++;
        continue;
      }
      const rows = await this.d.db.walletTrade.findMany({ where: { wallet: w.address, ts: { gte: since } }, orderBy: [{ ts: 'asc' }, { id: 'asc' }], select: { ts: true, side: true, mint: true, amount: true, usd: true } });
      const pos = positions(rows.map((r) => ({ ts: r.ts, side: r.side, mint: r.mint, amount: Number(r.amount), usd: Number(r.usd) })));
      const s = summarize(pos.values(), () => null);
      const facts = new Map((await this.d.db.tokenMeta.findMany({ where: { mint: { in: [...pos.keys()] } } })).map((m) => [m.mint, m]));
      const organic = summarize([...pos.values()].filter((p) => isOrganic(facts.get(p.mint))), () => null);
      if (s.wins + s.losses >= 5 && s.losses > s.wins && s.realizedPnlUsd < 0) {
        await this.d.db.trackedWallet.update({ where: { address: w.address }, data: { active: false } });
        pruned++;
      } else if (s.wins + s.losses >= 3 && s.realizedPnlUsd > 0 && organic.realizedPnlUsd <= 0) {
        // Wash trading: profit, but none of it in any token with real trading.
        await this.d.db.trackedWallet.update({ where: { address: w.address }, data: { active: false } });
        await this.d.redis?.set(seenKey(w.address), 'wash', 'EX', SEEN_TTL_SEC.wash!).catch(() => {});
        this.d.log?.(`discovery: ${w.address.slice(0, 6)}… only earns in tokens nobody else trades (wash trading); no longer tracked`);
        pruned++;
      }
    }
    return pruned;
  }
}

/**
 * Discovery's share of its daily budget available by `now` (UTC): what the hours so far are worth,
 * plus two hours' worth, so rounds spread over the day instead of spending it all after midnight.
 */
export function budgetSoFar(daily: number, now: number): number {
  const d = new Date(now);
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return Math.min(daily, (daily * (minutes + 120)) / 1440);
}

/** A bot's signature list: most transactions failing, or more than MAX_TX_PER_HOUR landing. */
export function looksLikeBot(sigs: SignatureInfo[]): boolean {
  if (sigs.length < 20) return false;
  const ok = sigs.filter((s) => !s.err);
  if ((sigs.length - ok.length) / sigs.length > MAX_FAILED_SHARE) return true;
  const times = ok.map((s) => s.blockTime ?? 0).filter((t) => t > 0);
  if (times.length < 20) return false;
  const hours = Math.max((Math.max(...times) - Math.min(...times)) / 3600, 1 / 6);
  return ok.length / hours > MAX_TX_PER_HOUR;
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
