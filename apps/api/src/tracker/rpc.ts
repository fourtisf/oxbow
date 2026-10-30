/**
 * The two RPC calls the tracker makes, as plain JSON-RPC so transactions come
 * back exactly as the node encodes them (the shape `parse.ts` reads, and the
 * shape of the test fixtures). Rate limits (429) and node hiccups are retried
 * a few times with backoff.
 */
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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
        if (res.status === 429 || res.status >= 500) throw new Error(`rpc ${res.status}`);
        const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
        if (body.error) throw new Error(`rpc error ${body.error.code}: ${body.error.message}`);
        return body.result as T;
      } catch (e) {
        if (attempt >= retries) throw e;
        await sleep(400 * 2 ** attempt);
      }
    }
  }

  return {
    getTransaction: (signature) =>
      call<RawTx | null>('getTransaction', [signature, { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }]),
    getSignatures: (address, o) =>
      call<SignatureInfo[]>('getSignaturesForAddress', [address, { limit: o.limit, commitment: 'confirmed', ...(o.until ? { until: o.until } : {}), ...(o.before ? { before: o.before } : {}) }]),
  };
}
