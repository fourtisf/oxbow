import type { PoolsQueryInput, Timeframe } from '@oxbow/shared';

/** React Query keys, shared by client hooks and server-side prefetching. */
export const qk = {
  stats: () => ['stats'] as const,
  ticker: () => ['ticker'] as const,
  movers: () => ['movers'] as const,
  stocks: () => ['stocks'] as const,
  quotes: () => ['quotes'] as const,
  venues: () => ['venues'] as const,
  pools: (q: PoolsQueryInput) => ['pools', q] as const,
  poolsInfinite: (q: Omit<PoolsQueryInput, 'cursor'>) => ['pools', 'infinite', q] as const,
  pool: (address: string) => ['pool', address] as const,
  chart: (address: string, tf: Timeframe) => ['chart', address, tf] as const,
  token: (mint: string) => ['token', mint] as const,
  positions: (wallet: string) => ['positions', wallet] as const,
  balances: (wallet: string) => ['balances', wallet] as const,
  trades: (address: string) => ['trades', address] as const,
  activity: (wallet: string) => ['activity', wallet] as const,
  status: () => ['status'] as const,
};
