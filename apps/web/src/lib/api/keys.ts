import type { FeedQueryInput } from '@oxbow/shared';

/** React Query keys, shared by client hooks and server-side prefetching. */
export const qk = {
  feed: (q: FeedQueryInput) => ['feed', q] as const,
  wallets: () => ['wallets'] as const,
  wallet: (address: string) => ['wallet', address] as const,
  walletTrades: (address: string) => ['walletTrades', address] as const,
  hot: () => ['hot'] as const,
  token: (mint: string) => ['token', mint] as const,
  search: (q: string) => ['search', q.toLowerCase()] as const,
  balances: (wallet: string, mints: string[]) => ['balances', wallet, mints] as const,
  status: () => ['status'] as const,
  flow: (mint: string) => ['flow', mint] as const,
  limitOrders: (wallet: string) => ['limitOrders', wallet] as const,
};
