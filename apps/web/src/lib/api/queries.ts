'use client';

import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  type QueryClient,
} from '@tanstack/react-query';
import { isAddress, type PoolsQueryInput, type Timeframe } from '@oxbow/shared';
import { api } from './index';
import { qk } from './keys';

export { qk };

export const useStats = () => useQuery({ queryKey: qk.stats(), queryFn: () => api.stats() });
export const useTicker = () => useQuery({ queryKey: qk.ticker(), queryFn: () => api.ticker() });
export const useMovers = () => useQuery({ queryKey: qk.movers(), queryFn: () => api.movers() });
export const useStocks = () => useQuery({ queryKey: qk.stocks(), queryFn: () => api.stocks() });
export const useQuotes = () => useQuery({ queryKey: qk.quotes(), queryFn: () => api.quotes() });

export const usePools = (q: PoolsQueryInput) =>
  useQuery({ queryKey: qk.pools(q), queryFn: () => api.pools(q), placeholderData: keepPreviousData });

export const usePoolsInfinite = (q: Omit<PoolsQueryInput, 'cursor'>) =>
  useInfiniteQuery({
    queryKey: qk.poolsInfinite(q),
    queryFn: ({ pageParam }) => api.pools({ ...q, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });

export const usePool = (address: string | null | undefined) =>
  useQuery({
    queryKey: qk.pool(address ?? ''),
    queryFn: () => api.pool(address!),
    enabled: !!address,
  });

export const useChart = (address: string | null | undefined, tf: Timeframe) =>
  useQuery({
    queryKey: qk.chart(address ?? '', tf),
    queryFn: () => api.chart(address!, tf),
    enabled: !!address,
    placeholderData: keepPreviousData,
  });

export const useToken = (mint: string) =>
  useQuery({
    queryKey: qk.token(mint),
    queryFn: () => api.token(mint),
    enabled: isAddress(mint),
    staleTime: 5 * 60_000,
    retry: false,
  });

export const usePositions = (wallet: string | null | undefined) =>
  useQuery({
    queryKey: qk.positions(wallet ?? ''),
    queryFn: () => api.positions(wallet!),
    enabled: !!wallet,
  });

/** After a (mock) transaction: refetch everything that might have changed. */
export function invalidateAfterTx(qc: QueryClient) {
  return qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'token' });
}
