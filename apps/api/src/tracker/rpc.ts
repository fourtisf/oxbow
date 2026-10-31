/**
 * The two RPC calls the tracker makes, as plain JSON-RPC so transactions come
 * back exactly as the node encodes them (the shape `parse.ts` reads, and the
 * shape of the test fixtures). Requests are spaced to stay under the
 * provider's rate limit (`rps`, from RPC_RPS: Helius's free plan allows about
 * ten a second across all processes), and a 429 or a node hiccup is retried
 * with a growing wait.
 *
 * Histories (a wallet's, a program's, a token's market) are read with Helius's
 * getTransactionsForAddress where the provider has it: up to 100 full
 * transactions per request, billed as 10 credits instead of one call per
 * transaction. Elsewhere `readHistory` falls back to signatures plus one read each.
 */
import { PublicKey } from '@solana/web3.js';
import type { RawTx } from './parse';

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  blockTime: number | null;
}

/** One transaction of an address's history: its signature info, and the transaction itself when it could be read (never for failed ones on the fallback path). */
export interface HistoryEntry extends SignatureInfo {
  tx: RawTx | null;
}

export interface HistoryOpts {
  limit: number;
  /** Only transactions newer than this signature. */
  until?: string;
  /** Only transactions older than this one. */
  before?: { signature: string; slot: number };
  /** Leave failed transactions out. */
  succeededOnly?: boolean;
}

/** A history read and what it cost in provider credits (Helius pricing: 1 a plain call, 10 per 100 transactions of a history). */
export interface History {
  entries: HistoryEntry[];
  credits: number;
}

export interface TrackerRpc {
  getTransaction(signature: string): Promise<RawTx | null>;
  /** Newest first. `until` stops before that signature; `before` starts after it. */
  getSignatures(address: string, opts: { limit: number; until?: string; before?: string }): Promise<SignatureInfo[]>;
  /** Owners of the mint's largest token accounts that are ordinary wallets (pool vaults and other program accounts left out). */
  getTopHolders(mint: string): Promise<string[]>;
  /** Full transactions involving `address`, newest first, many per request. Optional: throws HistoryUnsupported where the provider lacks it. Use `readHistory`. */
  getHistory?(address: string, opts: HistoryOpts): Promise<History>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The node couldn't answer (network, rate limit, server error): nothing to do with the transaction asked about. */
export class RpcError extends Error {}

/** The node answered with a JSON-RPC error. */
class RpcMethodError extends RpcError {
  constructor(
    message: string,
    readonly code: number,
  ) {
    super(message);
  }
}

/** The provider has no bulk history method (or refused it): read signatures and transactions one by one instead. */
export class HistoryUnsupported extends Error {}

/** Runs `fn` over `items`, at most `n` at a time, keeping order. */
export async function mapLimit<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * Up to `o.limit` of `address`'s transactions, newest first, read in bulk where the provider can
 * (one request per 100) and one by one where it can't.
 */
export async function readHistory(rpc: TrackerRpc, address: string, o: HistoryOpts, concurrency = 4): Promise<History> {
  if (rpc.getHistory) {
    try {
      return await rpc.getHistory(address, o);
    } catch (e) {
      if (!(e instanceof HistoryUnsupported)) throw e;
    }
  }
  const sigs = await rpc.getSignatures(address, { limit: o.limit, until: o.until, before: o.before?.signature });
  const want = o.succeededOnly ? sigs.filter((s) => !s.err) : sigs;
  const txs = await mapLimit(want, concurrency, (s) => (s.err ? Promise.resolve(null) : rpc.getTransaction(s.signature).catch(() => null)));
  return { entries: want.map((s, i) => ({ ...s, tx: txs[i] ?? null })), credits: 1 + want.filter((s) => !s.err).length };
}

const HISTORY_PAGE = 100;
/** After this many JSON-RPC errors in a row from the bulk method, it is left alone for an hour. */
const HISTORY_STRIKES = 3;

export function jsonRpc(url: string, opts: { timeoutMs?: number; retries?: number; rps?: number } = {}): TrackerRpc {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 5;
  const gapMs = opts.rps && opts.rps > 0 ? 1000 / opts.rps : 0;
  let id = 0;
  let nextAt = 0;
  let historyStrikes = 0;
  let historyOffUntil = 0;

  /** Waits for this process's next turn under the rate limit. */
  async function turn() {
    if (!gapMs) return;
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + gapMs;
    if (at > now) await sleep(at - now);
  }

  /** `methodErrorsFinal`: a JSON-RPC error is the answer (not retried); rate limits and network trouble still are. */
  async function call<T>(method: string, params: unknown[], methodErrorsFinal = false): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        await turn();
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 429 || res.status >= 500) throw new RpcError(`rpc ${res.status}`);
        const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) throw new RpcMethodError(`rpc error ${body.error.code}: ${body.error.message}`, body.error.code);
        return body.result as T;
      } catch (e) {
        if (methodErrorsFinal && e instanceof RpcMethodError && e.code !== 429 && !/rate|limit|too many/i.test(e.message)) throw e;
        if (attempt >= retries) throw e instanceof RpcError ? e : new RpcError((e as Error).message);
        // 0.5, 1, 2, 4, 8 s: long enough for a rate limit window to pass.
        await sleep(500 * 2 ** attempt);
      }
    }
  }

  async function getHistory(address: string, o: HistoryOpts): Promise<History> {
    if (Date.now() < historyOffUntil) throw new HistoryUnsupported('bulk history off for now');
    const filters = { ...(o.before ? { slot: { lt: o.before.slot } } : {}), ...(o.succeededOnly ? { status: 'succeeded' } : {}) };
    const entries: HistoryEntry[] = [];
    let credits = 0;
    let token: string | null = null;
    while (entries.length < o.limit) {
      let page: { data: RawTx[]; paginationToken: string | null };
      try {
        page = await call(
          'getTransactionsForAddress',
          [
            address,
            {
              transactionDetails: 'full',
              encoding: 'json',
              maxSupportedTransactionVersion: 1,
              commitment: 'confirmed',
              sortOrder: 'desc',
              limit: Math.min(HISTORY_PAGE, o.limit - entries.length),
              ...(Object.keys(filters).length ? { filters } : {}),
              ...(token ? { paginationToken: token } : {}),
            },
          ],
          true,
        );
      } catch (e) {
        if (!(e instanceof RpcMethodError)) throw e;
        // No such method here (-32601), or refused (plan): fall back. Repeated refusals switch it off for a while.
        if (e.code === -32601 || ++historyStrikes >= HISTORY_STRIKES) {
          historyOffUntil = Date.now() + 3_600_000;
          historyStrikes = 0;
        }
        throw new HistoryUnsupported(e.message);
      }
      historyStrikes = 0;
      credits += 10;
      let reachedUntil = false;
      for (const tx of page.data) {
        const signature = tx.transaction.signatures[0]!;
        if (o.until && signature === o.until) {
          reachedUntil = true;
          break;
        }
        entries.push({ signature, slot: tx.slot, err: tx.meta?.err ?? null, blockTime: tx.blockTime ?? null, tx });
        if (entries.length >= o.limit) break;
      }
      token = page.paginationToken;
      if (reachedUntil || !token || !page.data.length) break;
    }
    return { entries, credits };
  }

  return {
    getHistory,
    getTransaction: (signature) =>
      call<RawTx | null>('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }]),
    async getTopHolders(mint) {
      const largest = await call<{ value: { address: string }[] }>('getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
      const accounts = largest.value.map((a) => a.address).slice(0, 20);
      if (!accounts.length) return [];
      const infos = await call<{ value: ({ data: { parsed?: { info?: { owner?: string } } } } | null)[] }>('getMultipleAccounts', [accounts, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
      const owners = infos.value.map((a) => a?.data?.parsed?.info?.owner).filter((o): o is string => typeof o === 'string');
      // Pools hold their tokens in accounts owned by program addresses, which are off the curve.
      return [...new Set(owners)].filter((o) => {
        try {
          return PublicKey.isOnCurve(new PublicKey(o).toBytes());
        } catch {
          return false;
        }
      });
    },
    getSignatures: (address, o) =>
      call<SignatureInfo[]>('getSignaturesForAddress', [address, { limit: o.limit, commitment: 'confirmed', ...(o.until ? { until: o.until } : {}), ...(o.before ? { before: o.before } : {}) }]),
  };
}
