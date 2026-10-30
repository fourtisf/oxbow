/**
 * Reads tracked wallets' transactions into WalletTrade rows.
 *
 * - `catchUp` walks a wallet's signatures from the newest down to the last one
 *   already read (or, the first time, its latest `backfillLimit`), oldest
 *   first, and moves the wallet's bookmark forward only past signatures that
 *   were read successfully, so a failure is retried on the next round.
 * - `ingest` reads one transaction; the worker calls it straight from the
 *   websocket for live trades.
 *
 * USD values use the SOL (or stablecoin) price at the time the trade is read:
 * exact for live trades, today's price for history read on the first visit.
 */
import { Prisma, type PrismaClient, type TrackedWallet, type WalletTrade } from '@oxbow/db';
import type { FeedTrade } from '@oxbow/shared';
import { parseTrades, walletChanges, WSOL, type RawTx } from './parse';
import { RpcError, type TrackerRpc } from './rpc';

/** A failure that says nothing about the transaction (no price yet, Jupiter or the node down): retry, never give up on it. */
export class TransientError extends Error {}
import { brief, quoteUsd, STALE, type TokenBook, type TokenMeta } from './tokens';

export interface IngestDeps {
  db: PrismaClient;
  rpc: TrackerRpc;
  tokens: TokenBook;
  /** Live trades go out on the feed (Redis pub/sub in production). */
  publish?: (trades: FeedTrade[]) => Promise<void>;
  log?: (msg: string) => void;
  now?: () => number;
  /** Transactions read the first time a wallet is tracked. */
  backfillLimit?: number;
}

/** Trades newer than this go out live when a catch-up finds them (the websocket missed them). */
const LIVE_WINDOW_MS = 10 * 60_000;
/** Pages of 100 signatures a catch-up may walk before it settles for the newest ones. */
const MAX_PAGES = 5;
/** A signature that fails this many rounds in a row is passed over, so one bad transaction can't stall a wallet. */
const MAX_FAILURES = 5;

export type WalletRef = Pick<TrackedWallet, 'address' | 'label' | 'featured' | 'source' | 'lastSignature' | 'backfilledAt'>;

export const ui = (raw: bigint, decimals: number) => Number(raw) / 10 ** decimals;

export class Ingestor {
  private readonly failures = new Map<string, number>();

  constructor(private readonly d: IngestDeps) {}

  private now() {
    return (this.d.now ?? Date.now)();
  }

  /**
   * Reads one transaction of `wallet` and stores its trades. Throws when the RPC or prices fail (so it is retried).
   * `pre` carries the transaction and token rows when the caller already fetched them.
   */
  async ingest(wallet: WalletRef, signature: string, opts: { publish?: boolean; pre?: { tx: RawTx; metas: ReadonlyMap<string, TokenMeta> } } = {}): Promise<WalletTrade[]> {
    const tx = opts.pre?.tx ?? (await this.d.rpc.getTransaction(signature));
    if (!tx) throw new Error(`transaction ${signature.slice(0, 8)}… not found`);
    const changes = walletChanges(tx, wallet.address);
    if (!changes || !changes.tokens.length) return [];

    const decimals = new Map(changes.tokens.map((l) => [l.mint, l.decimals]));
    const metas = opts.pre && [...decimals.keys(), WSOL].every((m) => opts.pre!.metas.has(m)) ? opts.pre.metas : await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals);
    const trades = parseTrades(tx, wallet.address, (m) => metas.get(m)?.stable === true);
    if (!trades.length) return [];
    // A token saved while Jupiter was failing may be a stablecoin it would have flagged: read this again later.
    // One Jupiter answered for without listing is an unknown token, and the reading stands.
    const legs = [...decimals.keys()];
    if (legs.some((m) => !metas.has(m) || metas.get(m)!.source === 'outage')) throw new TransientError('token data incomplete');

    const solUsd = trades.some((t) => t.quoteMint === WSOL) ? await this.d.tokens.solPrice() : null;
    const ts = new Date(tx.blockTime ? tx.blockTime * 1000 : this.now());
    const rows: Prisma.WalletTradeCreateManyInput[] = [];
    for (const t of trades) {
      const quotePrice = quoteUsd(t.quoteMint, metas, solUsd);
      // No SOL price (or Jupiter failing): retry later rather than store a $0 trade.
      // A token nobody prices can't value the other side: that leg is left out.
      if (quotePrice === null) {
        if (t.quoteMint === WSOL) throw new TransientError('no USD price for SOL');
        continue;
      }
      const amount = ui(t.amount, t.decimals);
      const quoteAmount = ui(t.quoteAmount, t.quoteDecimals);
      const usd = quoteAmount * quotePrice;
      rows.push({
        signature,
        wallet: wallet.address,
        ts,
        slot: BigInt(tx.slot),
        side: t.side,
        mint: t.mint,
        amount: new Prisma.Decimal(amount.toFixed(12)),
        quoteMint: t.quoteMint,
        quoteAmount: new Prisma.Decimal(quoteAmount.toFixed(12)),
        usd: new Prisma.Decimal(usd.toFixed(6)),
        priceUsd: new Prisma.Decimal(amount > 0 ? (usd / amount).toPrecision(18) : '0'),
      });
    }
    if (!rows.length) return [];
    const created = await this.d.db.walletTrade.createManyAndReturn({ data: rows, skipDuplicates: true });
    if (created.length) {
      await this.d.db.trackedWallet.updateMany({ where: { address: wallet.address, OR: [{ lastTradeAt: null }, { lastTradeAt: { lt: ts } }] }, data: { lastTradeAt: ts } });
      if (opts.publish && this.d.publish) await this.d.publish(created.map((r) => toFeedTrade(r, wallet, metas)));
    }
    return created;
  }

  /**
   * Reads every signature since the wallet's bookmark. Returns how many trades were stored.
   * `seen` skips signatures the websocket already handled.
   */
  async catchUp(wallet: WalletRef, seen?: (signature: string) => boolean): Promise<number> {
    const first = !wallet.lastSignature;
    const limit = first ? (this.d.backfillLimit ?? 100) : 100;
    const sigs = [];
    let before: string | undefined;
    for (let page = 0; page < (first ? 1 : MAX_PAGES); page++) {
      const batch = await this.d.rpc.getSignatures(wallet.address, { limit, until: wallet.lastSignature ?? undefined, before });
      sigs.push(...batch);
      if (batch.length < limit) break;
      before = batch[batch.length - 1]!.signature;
    }

    const newest = sigs[0]?.signature ?? null;
    const live = wallet.backfilledAt !== null;
    const liveAfter = this.now() - LIVE_WINDOW_MS;
    const todo = [...sigs].reverse();

    // Read the transactions first, then name every token in them with one batched lookup.
    const txs = new Map<string, RawTx>();
    for (const s of todo) {
      if (s.err || seen?.(s.signature)) continue;
      const tx = await this.d.rpc.getTransaction(s.signature).catch(() => null);
      if (!tx) break;
      txs.set(s.signature, tx);
    }
    const decimals = new Map<string, number>();
    for (const tx of txs.values()) for (const l of walletChanges(tx, wallet.address)?.tokens ?? []) decimals.set(l.mint, l.decimals);
    const metas = decimals.size ? await this.d.tokens.get([...decimals.keys(), WSOL], STALE.ingest, decimals) : new Map<string, TokenMeta>();

    let stored = 0;
    let bookmark: string | null = null;
    // Oldest first, so the bookmark only ever moves forward over finished work.
    for (const s of todo) {
      if (!s.err && !seen?.(s.signature)) {
        const fk = `${wallet.address}:${s.signature}`;
        try {
          const tx = txs.get(s.signature);
          const rows = await this.ingest(wallet, s.signature, { publish: live && (s.blockTime ?? 0) * 1000 > liveAfter, pre: tx ? { tx, metas } : undefined });
          stored += rows.length;
          this.failures.delete(fk);
        } catch (e) {
          // Outages don't count against the transaction: wait them out.
          if (e instanceof TransientError || e instanceof RpcError) {
            this.d.log?.(`${wallet.address.slice(0, 6)}… waiting at ${s.signature.slice(0, 8)}…: ${(e as Error).message}`);
            break;
          }
          const n = (this.failures.get(fk) ?? 0) + 1;
          if (n < MAX_FAILURES) {
            this.failures.set(fk, n);
            if (this.failures.size > 10_000) this.failures.delete(this.failures.keys().next().value!);
            this.d.log?.(`${wallet.address.slice(0, 6)}… stopped at ${s.signature.slice(0, 8)}… (${n}/${MAX_FAILURES}): ${(e as Error).message}`);
            break;
          }
          this.failures.delete(fk);
          this.d.log?.(`${wallet.address.slice(0, 6)}… passing over ${s.signature.slice(0, 8)}… after ${n} failures: ${(e as Error).message}`);
        }
      }
      bookmark = s.signature;
    }

    // History counts as read once a round gets all the way to the newest signature.
    const finishedHistory = !live && bookmark === newest;
    if (bookmark || finishedHistory) {
      await this.d.db.trackedWallet.update({
        where: { address: wallet.address },
        data: { ...(bookmark ? { lastSignature: bookmark } : {}), ...(finishedHistory ? { backfilledAt: new Date(this.now()) } : {}) },
      });
    }
    return stored;
  }
}

const n = (d: Prisma.Decimal | number) => Number(d);

/** A stored trade as the feed shows it. */
export function toFeedTrade(r: WalletTrade, wallet: Pick<TrackedWallet, 'address' | 'label' | 'featured' | 'source'>, metas: ReadonlyMap<string, TokenMeta>): FeedTrade {
  const quote = metas.get(r.quoteMint);
  return {
    id: r.id.toString(),
    signature: r.signature,
    wallet: wallet.address,
    walletLabel: wallet.label,
    featured: wallet.featured,
    smart: wallet.source === 'discovered',
    ts: r.ts.toISOString(),
    side: r.side,
    token: brief(metas.get(r.mint), r.mint),
    amount: n(r.amount),
    quoteSymbol: r.quoteMint === WSOL ? 'SOL' : (quote?.symbol ?? r.quoteMint.slice(0, 4)),
    quoteAmount: n(r.quoteAmount),
    usd: n(r.usd),
    priceUsd: n(r.priceUsd),
  };
}
