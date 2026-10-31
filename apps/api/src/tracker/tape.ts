/**
 * A token's market tape: its latest fills by any trader, read from the chain.
 * Signatures that touch the mint are read newest first; each transaction is
 * parsed for every signer (aggregator relayers pay fees for some traders),
 * the same way tracked wallets' trades are. The tape lives in Redis so the
 * API (token pages) and the worker (discovery) share it.
 *
 * `orderFlow` groups the tape like an order book: what filled at each price
 * level, buys against sells.
 */
import type { Redis } from 'ioredis';
import type { FlowLevel, MarketTrade, OrderFlow } from '@oxbow/shared';
import { parseTrades, walletChanges, WSOL, type RawTx } from './parse';
import { mapLimit, readHistory, type TrackerRpc } from './rpc';
import { quoteUsd, STALE, type TokenBook, type TokenMeta } from './tokens';
import { ui } from './ingest';

/** A fill as stored on the tape (no `tracked` flag: that is looked up when read). */
export type TapeTrade = Omit<MarketTrade, 'tracked'> & { slot: number };

const KEEP = 200;
const TTL_SEC = 3600;
const LOCK_SEC = 20;
const READ_CONCURRENCY = 5;

const key = (mint: string) => `oxbow:tape:${mint}`;

export { mapLimit } from './rpc';

/** The signers of `tx` that traded `mint` in it, as fills. `quotePrice` prices the other side in USD. */
export function fillsOf(tx: RawTx, signature: string, mint: string, metas: ReadonlyMap<string, TokenMeta>, solUsd: number | null): TapeTrade[] {
  const msg = tx.transaction.message;
  const out: TapeTrade[] = [];
  for (const signer of msg.accountKeys.slice(0, msg.header.numRequiredSignatures)) {
    for (const t of parseTrades(tx, signer, (m) => metas.get(m)?.stable === true)) {
      if (t.mint !== mint) continue;
      const px = quoteUsd(t.quoteMint, metas, solUsd);
      if (px === null) continue;
      const amount = ui(t.amount, t.decimals);
      const usd = ui(t.quoteAmount, t.quoteDecimals) * px;
      out.push({ signature, trader: signer, side: t.side, amount, usd, priceUsd: amount > 0 ? usd / amount : 0, ts: new Date((tx.blockTime ?? 0) * 1000).toISOString(), slot: tx.slot });
    }
  }
  return out;
}

export class MarketTape {
  constructor(
    private readonly d: { rpc: TrackerRpc; tokens: TokenBook; redis: Redis | null; now?: () => number; log?: (m: string) => void },
  ) {}

  private now() {
    return (this.d.now ?? Date.now)();
  }

  /** The stored tape, newest first. */
  async read(mint: string): Promise<TapeTrade[]> {
    if (!this.d.redis) return [];
    try {
      const raw = await this.d.redis.get(key(mint));
      return raw ? (JSON.parse(raw) as { trades: TapeTrade[] }).trades : [];
    } catch {
      return [];
    }
  }

  private async retries(mint: string): Promise<{ signature: string; tries: number }[]> {
    if (!this.d.redis) return [];
    try {
      const raw = await this.d.redis.get(`${key(mint)}:retry`);
      return raw ? (JSON.parse(raw) as { signature: string; tries: number }[]) : [];
    } catch {
      return [];
    }
  }

  /** When the tape was last refreshed (epoch ms), or 0. */
  async refreshedAt(mint: string): Promise<number> {
    if (!this.d.redis) return 0;
    const raw = await this.d.redis.get(`${key(mint)}:at`).catch(() => null);
    return raw ? Number(raw) : 0;
  }

  /**
   * Reads up to `maxNew` signatures newer than the tape's head and adds their fills. The head always
   * moves to the newest signature; any transaction that couldn't be read is retried on its own.
   * One refresh per mint at a time across processes; a caller that finds one running gets the stored tape.
   * `onCredits` hears what the reads cost (discovery keeps a daily budget).
   */
  async refresh(mint: string, maxNew: number, onCredits?: (credits: number) => void): Promise<TapeTrade[]> {
    const redis = this.d.redis;
    const token = Math.random().toString(36).slice(2);
    if (redis) {
      const got = await redis.set(`${key(mint)}:lock`, token, 'EX', LOCK_SEC, 'NX').catch(() => 'OK');
      if (got !== 'OK') return this.read(mint);
    }
    try {
      const head = (redis ? await redis.get(`${key(mint)}:head`).catch(() => null) : null) || null;
      const history = await readHistory(this.d.rpc, mint, { limit: maxNew, until: head ?? undefined, succeededOnly: true }, READ_CONCURRENCY);
      const newer = history.entries;
      // Transactions that couldn't be read last time are asked for again (up to three tries), on their own.
      const retry = await this.retries(mint);
      const again = retry.filter((r) => !newer.some((f) => f.signature === r.signature));
      const retried = await mapLimit(again, READ_CONCURRENCY, (r) => this.d.rpc.getTransaction(r.signature).catch(() => null));
      onCredits?.(history.credits + again.length);
      const sigs = [...newer, ...again.map((r) => ({ signature: r.signature }))];
      const txs = [...newer.map((e) => e.tx), ...retried];
      const old = await this.read(mint);
      if (!sigs.length) {
        await redis?.set(`${key(mint)}:at`, String(this.now()), 'EX', TTL_SEC).catch(() => {});
        return old;
      }
      const missing = sigs.flatMap((s, i) => (txs[i] ? [] : [{ signature: s.signature, tries: (retry.find((r) => r.signature === s.signature)?.tries ?? 0) + 1 }])).filter((r) => r.tries < 3);
      await redis?.set(`${key(mint)}:retry`, JSON.stringify(missing), 'EX', TTL_SEC).catch(() => {});
      const nextHead = newer[0]?.signature ?? head;
      const decimals = new Map<string, number>();
      for (const tx of txs) {
        if (!tx) continue;
        const msg = tx.transaction.message;
        for (const signer of msg.accountKeys.slice(0, msg.header.numRequiredSignatures))
          for (const l of walletChanges(tx, signer)?.tokens ?? []) decimals.set(l.mint, l.decimals);
      }
      const metas = await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
      const solUsd = await this.d.tokens.solPrice();
      const fresh = txs.flatMap((tx, i) => (tx ? fillsOf(tx, sigs[i]!.signature, mint, metas, solUsd) : []));
      const seen = new Set(fresh.map((t) => `${t.signature}:${t.trader}`));
      const trades = [...fresh, ...old.filter((t) => !seen.has(`${t.signature}:${t.trader}`))]
        .sort((a, b) => b.slot - a.slot)
        .slice(0, KEEP);
      if (redis) {
        const m = redis.multi().set(key(mint), JSON.stringify({ trades }), 'EX', TTL_SEC).set(`${key(mint)}:at`, String(this.now()), 'EX', TTL_SEC);
        if (nextHead) m.set(`${key(mint)}:head`, nextHead, 'EX', TTL_SEC);
        else m.del(`${key(mint)}:head`);
        await m.exec().catch(() => {});
      }
      return trades;
    } finally {
      // Only our own lock: one that expired and was taken by another refresh stays.
      await redis?.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, `${key(mint)}:lock`, token).catch(() => 0);
    }
  }
}

const LEVELS = 12;

/** Groups fills into price levels, highest first. Prices outside the middle 90% are folded into the end levels. */
export function orderFlow(mint: string, trades: MarketTrade[], lastPriceUsd: number | null, now: number): OrderFlow {
  const buys = trades.filter((t) => t.side === 'BUY');
  const sells = trades.filter((t) => t.side === 'SELL');
  const prices = trades
    .map((t) => t.priceUsd)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  const levels: FlowLevel[] = [];
  if (prices.length) {
    const lo = prices[Math.floor(prices.length * 0.05)]!;
    const hi = prices[Math.min(prices.length - 1, Math.ceil(prices.length * 0.95) - 1)]!;
    const n = hi > lo ? LEVELS : 1;
    // Log spacing: memecoin prices move in percentages.
    const step = n > 1 ? Math.log(hi / lo) / n : 0;
    for (let i = 0; i < n; i++) levels.push({ priceUsd: n > 1 ? lo * Math.exp(step * (i + 0.5)) : lo, buyUsd: 0, sellUsd: 0, buys: 0, sells: 0 });
    for (const t of trades) {
      if (t.priceUsd <= 0) continue;
      const i = n > 1 ? Math.min(n - 1, Math.max(0, Math.floor(Math.log(t.priceUsd / lo) / step))) : 0;
      const lv = levels[i]!;
      if (t.side === 'BUY') {
        lv.buyUsd += t.usd;
        lv.buys++;
      } else {
        lv.sellUsd += t.usd;
        lv.sells++;
      }
    }
    levels.reverse();
  }
  const times = trades.map((t) => Date.parse(t.ts)).filter((x) => x > 0);
  return {
    mint,
    trades,
    buys: { count: buys.length, usd: buys.reduce((s, t) => s + t.usd, 0) },
    sells: { count: sells.length, usd: sells.reduce((s, t) => s + t.usd, 0) },
    levels,
    lastPriceUsd: lastPriceUsd ?? trades[0]?.priceUsd ?? null,
    windowSec: times.length ? Math.round((Math.max(...times) - Math.min(...times)) / 1000) : 0,
    updatedAt: new Date(now).toISOString(),
  };
}
