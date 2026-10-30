import type {
  ActivityItem,
  ChartSeries,
  PoolDetail,
  PoolsPage,
  PoolsQueryInput,
  PoolSummary,
  Position,
  QuoteAsset,
  Stats,
  Status,
  StockInfo,
  TickerItem,
  Timeframe,
  TokenInfo,
  PopularToken,
  TokenSearchResult,
  Trade,
  Venues,
  WalletActivity,
} from '@oxbow/shared';

/**
 * Everything the UI reads, one method per API route (brief section 6).
 * M1 ships the mock implementation; M2 adds an HTTP client with the same shape,
 * so components and hooks don't change.
 */
export interface OxbowApi {
  /** GET /api/stats */
  stats(): Promise<Stats>;
  /** GET /api/ticker */
  ticker(): Promise<TickerItem[]>;
  /** GET /api/movers */
  movers(): Promise<PoolSummary[]>;
  /** GET /api/pools */
  pools(query: PoolsQueryInput): Promise<PoolsPage>;
  /** GET /api/pools/:address — null when the pool isn't listed. */
  pool(address: string): Promise<PoolDetail | null>;
  /** GET /api/pools/:address/chart?tf= (line points and OHLCV candles) */
  chart(address: string, tf: Timeframe): Promise<ChartSeries>;
  /** GET /api/pools/:address/trades — recent swaps, newest first. */
  trades(address: string): Promise<Trade[]>;
  /** GET /api/stocks */
  stocks(): Promise<StockInfo[]>;
  /**
   * GET /api/quotes — every asset a pool can be paired with (verified stocks,
   * SOL, USDC) with USD prices. Not in the brief's route table; create step 2
   * and the preview need SOL/USDC prices alongside the stocks.
   */
  quotes(): Promise<QuoteAsset[]>;
  /** GET /api/venues — where pools can be created, fee tiers and the Oxbow fee. */
  venues(): Promise<Venues>;
  /** GET /api/tokens/popular — most-traded verified tokens, as quick picks in create step 1. */
  popularTokens(): Promise<PopularToken[]>;
  /** GET /api/tokens/search?q= — tokens matching a name or ticker. */
  searchTokens(query: string): Promise<TokenSearchResult[]>;
  /** GET /api/tokens/:mint — null when the mint doesn't exist. */
  token(mint: string): Promise<TokenInfo | null>;
  /** GET /api/wallet/:address/positions */
  positions(wallet: string): Promise<Position[]>;
  /** GET /api/wallet/:address/activity — the wallet's Oxbow transactions, newest first. */
  walletActivity(wallet: string): Promise<WalletActivity[]>;
  /** GET /api/status — API, RPC, indexer and price-feed health. */
  status(): Promise<Status>;
  /** Recent items for the live feed's first paint. */
  recentActivity(): Promise<ActivityItem[]>;
  /** GET /api/activity/stream (SSE). Returns an unsubscribe function. */
  subscribeActivity(onItem: (item: ActivityItem) => void): () => void;
}
