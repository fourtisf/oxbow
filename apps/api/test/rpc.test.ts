/**
 * The RPC client against a local JSON-RPC server: bulk histories with pages,
 * and the fall back to signatures plus single reads where the provider lacks them.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jsonRpc, readHistory } from '../src/tracker/rpc';
import { fakeSwapTx, addr, sig } from './fixtures';

const WALLET = addr();
const MINT = addr();
// Ten transactions, newest first.
const TXS = Array.from({ length: 10 }, (_, i) => {
  const signature = sig();
  return { signature, tx: fakeSwapTx({ signature, wallet: WALLET, blockTime: 1_793_000_000 - i * 60, mint: MINT, tokenDelta: 1000n, quoteDelta: -1_000_000_000n }) };
});

let server: Server;
let url = '';
let bulk = true;
const seen: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { id, method, params } = JSON.parse(body) as { id: number; method: string; params: [string, Record<string, unknown>] };
      seen.push(method);
      const reply = (x: object) => res.end(JSON.stringify({ jsonrpc: '2.0', id, ...x }));
      if (method === 'getTransactionsForAddress') {
        if (!bulk) return reply({ error: { code: -32601, message: 'Method not found' } });
        const o = params[1] as { limit: number; paginationToken?: string };
        const from = o.paginationToken ? Number(o.paginationToken) : 0;
        const page = TXS.slice(from, from + o.limit);
        return reply({ result: { data: page.map((t) => t.tx), paginationToken: from + o.limit < TXS.length ? String(from + o.limit) : null } });
      }
      if (method === 'getSignaturesForAddress') {
        const o = params[1] as { limit: number; until?: string };
        const end = o.until ? TXS.findIndex((t) => t.signature === o.until) : TXS.length;
        return reply({ result: TXS.slice(0, end < 0 ? TXS.length : end).slice(0, o.limit).map((t) => ({ signature: t.signature, slot: t.tx.slot, err: null, blockTime: t.tx.blockTime })) });
      }
      if (method === 'getTransaction') return reply({ result: TXS.find((t) => t.signature === (params[0] as unknown as string))?.tx ?? null });
      reply({ error: { code: -32601, message: 'Method not found' } });
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const a = server.address();
  url = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});

afterAll(() => server?.close());

describe('rpc histories', () => {
  it('reads whole transactions in bulk, page after page, stopping at `until`', async () => {
    bulk = true;
    seen.length = 0;
    const rpc = jsonRpc(url, { retries: 0 });
    const all = await readHistory(rpc, WALLET, { limit: 10 });
    expect(all.entries.map((e) => e.signature)).toEqual(TXS.map((t) => t.signature));
    expect(all.entries.every((e) => e.tx?.transaction.signatures[0] === e.signature)).toBe(true);
    expect(seen).toEqual(['getTransactionsForAddress']);
    const newer = await readHistory(rpc, WALLET, { limit: 10, until: TXS[3]!.signature });
    expect(newer.entries.map((e) => e.signature)).toEqual(TXS.slice(0, 3).map((t) => t.signature));
    expect(newer.credits).toBe(10);
  });

  it('falls back to signatures and single reads where the provider has no bulk method', async () => {
    bulk = false;
    seen.length = 0;
    const rpc = jsonRpc(url, { retries: 0 });
    const h = await readHistory(rpc, WALLET, { limit: 4 });
    expect(h.entries.map((e) => e.signature)).toEqual(TXS.slice(0, 4).map((t) => t.signature));
    expect(h.entries.every((e) => e.tx)).toBe(true);
    expect(h.credits).toBe(5);
    // Not asked again for a while: straight to the fallback.
    seen.length = 0;
    await readHistory(rpc, WALLET, { limit: 2 });
    expect(seen).toEqual(['getSignaturesForAddress', 'getTransaction', 'getTransaction']);
  });
});
