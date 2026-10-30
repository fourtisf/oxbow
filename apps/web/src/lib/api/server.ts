import 'server-only';
import { dehydrate, QueryClient, type DehydratedState } from '@tanstack/react-query';
import type { FeedQueryInput } from '@oxbow/shared';
import { api } from './index';
import { qk } from './keys';

/**
 * Server-side prefetching so pages render with data on first paint. Each page
 * lists what it needs; the client picks the cache up through <Hydrate>.
 * A failed prefetch just leaves that query for the browser to fetch.
 */
export class Prefetch {
  readonly qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false } } });

  feed = (q: Omit<FeedQueryInput, 'cursor'>) =>
    this.qc.prefetchInfiniteQuery({ queryKey: qk.feed(q), queryFn: () => api.feed(q), initialPageParam: null as string | null });
  wallets = () => this.qc.prefetchQuery({ queryKey: qk.wallets(), queryFn: () => api.wallets() });
  wallet = (address: string) => this.qc.prefetchQuery({ queryKey: qk.wallet(address), queryFn: () => api.wallet(address) });
  hot = () => this.qc.prefetchQuery({ queryKey: qk.hot(), queryFn: () => api.hot() });
  token = (mint: string) => this.qc.prefetchQuery({ queryKey: qk.token(mint), queryFn: () => api.token(mint) });
  status = () => this.qc.prefetchQuery({ queryKey: qk.status(), queryFn: () => api.status() });

  state(): DehydratedState {
    return dehydrate(this.qc);
  }
}
