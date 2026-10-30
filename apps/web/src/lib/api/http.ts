import { z } from 'zod';
import {
  AddWalletResultSchema,
  FeedPageSchema,
  FeedTradeSchema,
  HotTokenSchema,
  StatusSchema,
  TokenDetailSchema,
  TokenSearchResultSchema,
  WalletDetailSchema,
  WalletSummarySchema,
  type FeedQueryInput,
} from '@oxbow/shared';
import type { OxbowApi } from './types';

const isBrowser = typeof window !== 'undefined';

/**
 * In the browser the API is on the same origin (nginx sends /api to it).
 * Server rendering calls it directly on this machine.
 */
const base = () => (isBrowser ? '' : (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/$/, ''));

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}`);
  }
}

export async function get<S extends z.ZodTypeAny>(path: string, schema: S, opts: { nullOn404?: boolean } = {}): Promise<z.output<S>> {
  const res = await fetch(base() + path, {
    headers: { accept: 'application/json' },
    // Server renders always ask the API, which has its own Redis cache.
    ...(isBrowser ? {} : { cache: 'no-store' as const }),
  });
  if (res.status === 404 && opts.nullOn404) return null;
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? 'error');
  }
  return schema.parse(await res.json());
}

/** POST JSON; errors carry the API's `{ error, ...details }` body. */
export async function post<S extends z.ZodTypeAny>(path: string, body: unknown, schema: S): Promise<z.output<S>> {
  const res = await fetch(base() + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as ({ error?: string } & Record<string, unknown>) | null;
  if (!res.ok) throw new ApiError(res.status, json?.error ?? (res.status === 429 ? 'rate_limited' : 'error'), json ?? {});
  return schema.parse(json);
}

const enc = encodeURIComponent;

export function qs(q: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** The Oxbow API over HTTP. Every response is checked against the shared schemas. */
export const httpApi: OxbowApi = {
  feed: (q: FeedQueryInput) => get(`/api/feed${qs(q)}`, FeedPageSchema),
  wallets: () => get('/api/wallets', z.array(WalletSummarySchema)),
  wallet: (address) => get(`/api/wallets/${enc(address)}`, WalletDetailSchema.nullable(), { nullOn404: true }),
  walletTrades: (address, cursor) => get(`/api/wallets/${enc(address)}/trades${qs({ cursor })}`, FeedPageSchema),
  addWallet: (address) => post('/api/wallets', { address }, AddWalletResultSchema),
  hot: () => get('/api/tokens/hot', z.array(HotTokenSchema)),
  token: (mint) => get(`/api/tokens/${enc(mint)}`, TokenDetailSchema.nullable(), { nullOn404: true }),
  searchTokens: (q) => get(`/api/tokens/search?q=${enc(q)}`, z.array(TokenSearchResultSchema)),
  status: () => get('/api/status', StatusSchema),
  subscribe(onTrade) {
    if (!isBrowser || typeof EventSource === 'undefined') return () => {};
    // EventSource reconnects on its own (the server suggests 5 s).
    const es = new EventSource('/api/feed/stream');
    es.addEventListener('trade', (e) => {
      try {
        const t = FeedTradeSchema.safeParse(JSON.parse((e as MessageEvent<string>).data));
        if (t.success) onTrade(t.data);
      } catch {
        // ignore malformed events
      }
    });
    return () => es.close();
  },
};
