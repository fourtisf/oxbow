/**
 * The two RPC calls the tracker makes, as plain JSON-RPC so transactions come
 * back exactly as the node encodes them (the shape `parse.ts` reads, and the
 * shape of the test fixtures). Rate limits (429) and node hiccups are retried
 * a few times with backoff.
 */
import { PublicKey } from '@solana/web3.js';
import type { RawTx } from './parse';

export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
  blockTime: number | null;
}

export interface TrackerRpc {
  getTransaction(signature: string): Promise<RawTx | null>;
  /** Newest first. `until` stops before that signature; `before` starts after it. */
  getSignatures(address: string, opts: { limit: number; until?: string; before?: string }): Promise<SignatureInfo[]>;
  /** Owners of the mint's largest token accounts that are ordinary wallets (pool vaults and other program accounts left out). */
  getTopHolders(mint: string): Promise<string[]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The node couldn't answer (network, rate limit, server error): nothing to do with the transaction asked about. */
export class RpcError extends Error {}

export function jsonRpc(url: string, opts: { timeoutMs?: number; retries?: number } = {}): TrackerRpc {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retries = opts.retries ?? 3;
  let id = 0;

  async function call<T>(method: string, params: unknown[]): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.status === 429 || res.status >= 500) throw new RpcError(`rpc ${res.status}`);
        const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) throw new RpcError(`rpc error ${body.error.code}: ${body.error.message}`);
        return body.result as T;
      } catch (e) {
        if (attempt >= retries) throw e instanceof RpcError ? e : new RpcError((e as Error).message);
        await sleep(400 * 2 ** attempt);
      }
    }
  }

  return {
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
