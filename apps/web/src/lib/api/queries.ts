'use client';

import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { isAddress, type FeedQueryInput } from '@oxbow/shared';
import { api } from './index';
import { qk } from './keys';

export { qk };

/** The feed, paged backwards with "Load more". Live trades are merged in by useLiveFeed. */
export const useFeed = (q: Omit<FeedQueryInput, 'cursor'>, enabled = true, refetchMs: number | false = false) =>
  useInfiniteQuery({
    queryKey: qk.feed(q),
    queryFn: ({ pageParam }) => api.feed({ ...q, cursor: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: refetchMs,
  });

export const useWallets = () => useQuery({ queryKey: qk.wallets(), queryFn: () => api.wallets(), staleTime: 60_000 });

export const useWalletDetail = (address: string) =>
  useQuery({
    queryKey: qk.wallet(address),
    queryFn: () => api.wallet(address),
    enabled: isAddress(address),
    // While its history is being read, ask again every few seconds.
    refetchInterval: (q) => (q.state.data && !q.state.data.backfilledAt ? 3000 : 30_000),
  });

export const useHot = () => useQuery({ queryKey: qk.hot(), queryFn: () => api.hot(), refetchInterval: 60_000 });

export const useToken = (mint: string) =>
  useQuery({ queryKey: qk.token(mint), queryFn: () => api.token(mint), enabled: isAddress(mint), refetchInterval: 30_000, retry: false });

export const useTokenSearch = (q: string) =>
  useQuery({ queryKey: qk.search(q), queryFn: () => api.searchTokens(q), enabled: q.trim().length >= 2, staleTime: 5 * 60_000, retry: false });

export const useFlow = (mint: string) => useQuery({ queryKey: qk.flow(mint), queryFn: () => api.flow(mint), enabled: isAddress(mint), refetchInterval: 15_000, retry: false });

export const useLimitOrders = (wallet: string | null | undefined) =>
  useQuery({ queryKey: qk.limitOrders(wallet ?? ''), queryFn: () => api.limitOrders(wallet!), enabled: !!wallet, refetchInterval: 30_000, retry: false });

export const useStatus = () => useQuery({ queryKey: qk.status(), queryFn: () => api.status(), refetchInterval: 30_000 });
