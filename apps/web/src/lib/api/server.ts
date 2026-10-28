import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { PoolsQueryInput, Timeframe } from '@oxbow/shared';
import { api } from './index';
import { qk } from './keys';

/**
 * Server-side prefetching so pages render with data on first paint. Each page
 * lists what it needs; the client picks the cache up through <HydrationBoundary>.
 */
export class Prefetch {
  readonly qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

  stats = () => this.qc.prefetchQuery({ queryKey: qk.stats(), queryFn: () => api.stats() });
  ticker = () => this.qc.prefetchQuery({ queryKey: qk.ticker(), queryFn: () => api.ticker() });
  movers = () => this.qc.prefetchQuery({ queryKey: qk.movers(), queryFn: () => api.movers() });
  stocks = () => this.qc.prefetchQuery({ queryKey: qk.stocks(), queryFn: () => api.stocks() });
  quotes = () => this.qc.prefetchQuery({ queryKey: qk.quotes(), queryFn: () => api.quotes() });
  pools = (q: PoolsQueryInput) => this.qc.prefetchQuery({ queryKey: qk.pools(q), queryFn: () => api.pools(q) });
  poolsInfinite = (q: Omit<PoolsQueryInput, 'cursor'>) =>
    this.qc.prefetchInfiniteQuery({
      queryKey: qk.poolsInfinite(q),
      queryFn: ({ pageParam }) => api.pools({ ...q, cursor: (pageParam as string | null) ?? undefined }),
      initialPageParam: null as string | null,
    });
  pool = (address: string) => this.qc.prefetchQuery({ queryKey: qk.pool(address), queryFn: () => api.pool(address) });
  chart = (address: string, tf: Timeframe) =>
    this.qc.prefetchQuery({ queryKey: qk.chart(address, tf), queryFn: () => api.chart(address, tf) });

  state(): DehydratedState {
    return dehydrate(this.qc);
  }
}
