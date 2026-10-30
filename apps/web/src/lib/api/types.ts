import type { FeedPage, FeedQueryInput, FeedTrade, HotToken, Status, TokenDetail, TokenSearchResult, WalletDetail, WalletSummary } from '@oxbow/shared';

/** Everything the UI reads, one method per API route. */
export interface OxbowApi {
  /** GET /api/feed — newest trades first. */
  feed(q: FeedQueryInput): Promise<FeedPage>;
  /** GET /api/wallets — leaderboard. */
  wallets(): Promise<WalletSummary[]>;
  /** GET /api/wallets/:address — null when the wallet isn't tracked. */
  wallet(address: string): Promise<WalletDetail | null>;
  /** GET /api/wallets/:address/trades */
  walletTrades(address: string, cursor?: string): Promise<FeedPage>;
  /** POST /api/wallets — start tracking. */
  addWallet(address: string): Promise<{ address: string; created: boolean }>;
  /** GET /api/tokens/hot */
  hot(): Promise<HotToken[]>;
  /** GET /api/tokens/:mint — null when no source knows it. */
  token(mint: string): Promise<TokenDetail | null>;
  /** GET /api/tokens/search?q= */
  searchTokens(q: string): Promise<TokenSearchResult[]>;
  /** GET /api/status */
  status(): Promise<Status>;
  /** GET /api/feed/stream (SSE). Returns an unsubscribe function. */
  subscribe(onTrade: (t: FeedTrade) => void): () => void;
}
