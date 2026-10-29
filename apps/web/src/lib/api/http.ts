import { z } from 'zod';
import {
  ActivityItemSchema,
  ChartSeriesSchema,
  PoolDetailSchema,
  PoolsPageSchema,
  PoolSummarySchema,
  PositionSchema,
  QuoteAssetSchema,
  StatsSchema,
  StatusSchema,
  StockInfoSchema,
  TickerItemSchema,
  TokenInfoSchema,
  TradeSchema,
  VenuesSchema,
  WalletActivitySchema,
  type PoolsQueryInput,
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
  if (!res.ok) throw new ApiError(res.status, json?.error ?? 'error', json ?? {});
  return schema.parse(json);
}

const enc = encodeURIComponent;

function poolsQs(q: PoolsQueryInput): string {
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
  stats: () => get('/api/stats', StatsSchema),
  ticker: () => get('/api/ticker', z.array(TickerItemSchema)),
  movers: () => get('/api/movers', z.array(PoolSummarySchema)),
  pools: (q) => get(`/api/pools${poolsQs(q)}`, PoolsPageSchema),
  pool: (address) => get(`/api/pools/${enc(address)}`, PoolDetailSchema.nullable(), { nullOn404: true }),
  chart: (address, tf) => get(`/api/pools/${enc(address)}/chart?tf=${tf}`, ChartSeriesSchema),
  trades: (address) => get(`/api/pools/${enc(address)}/trades`, z.array(TradeSchema)),
  stocks: () => get('/api/stocks', z.array(StockInfoSchema)),
  quotes: () => get('/api/quotes', z.array(QuoteAssetSchema)),
  venues: () => get('/api/venues', VenuesSchema),
  token: (mint) => get(`/api/tokens/${enc(mint)}`, TokenInfoSchema.nullable(), { nullOn404: true }),
  positions: (wallet) => get(`/api/wallet/${enc(wallet)}/positions`, z.array(PositionSchema)),
  walletActivity: (wallet) => get(`/api/wallet/${enc(wallet)}/activity`, z.array(WalletActivitySchema)),
  status: () => get('/api/status', StatusSchema),
  recentActivity: () => get('/api/activity/recent', z.array(ActivityItemSchema)),
  subscribeActivity(onItem) {
    if (!isBrowser || typeof EventSource === 'undefined') return () => {};
    // EventSource reconnects on its own (the server suggests 5 s).
    const es = new EventSource('/api/activity/stream');
    es.addEventListener('activity', (e) => {
      try {
        const item = ActivityItemSchema.safeParse(JSON.parse((e as MessageEvent<string>).data));
        if (item.success) onItem(item.data);
      } catch {
        // ignore malformed events
      }
    });
    return () => es.close();
  },
};
