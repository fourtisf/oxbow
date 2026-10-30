/**
 * API contract shared by the web app, the Fastify API and the tracker worker.
 * Every response the web app reads is described here, and every API input is
 * validated with these schemas.
 */
import { z } from 'zod';
import { BASE58_ADDRESS_RE } from './address';

export const AddressSchema = z.string().regex(BASE58_ADDRESS_RE, 'Expected a base58 address (32–44 chars)');
export const SignatureSchema = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);

/**
 * Token logo: an https URL or a path on this site ("/tokens/sol.svg"). Metadata
 * images on ipfs:// or ar:// are rewritten to an https gateway by the API;
 * anything else (http:, data:, javascript:, protocol-relative) is rejected.
 */
export const LogoUriSchema = z
  .string()
  .max(512)
  .refine((v) => /^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/(?!\/)[^\s"'<>]*$/.test(v), 'logo must be an https URL or a site path');

/** A token as lists show it. `symbol`/`name` come from token metadata and are untrusted. */
export const TokenBriefSchema = z.object({
  mint: AddressSchema,
  symbol: z.string().max(32),
  name: z.string().max(64),
  logoUri: LogoUriSchema.nullable(),
  decimals: z.number().int().min(0).max(18),
  verified: z.boolean(),
});
export type TokenBrief = z.infer<typeof TokenBriefSchema>;

export const TradeSideSchema = z.enum(['BUY', 'SELL']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

/** One buy or sell by a tracked wallet, as the feed shows it. */
export const FeedTradeSchema = z.object({
  id: z.string(),
  signature: SignatureSchema,
  wallet: AddressSchema,
  walletLabel: z.string().max(40).nullable(),
  featured: z.boolean(),
  /** Found profitable by Oxbow's discovery, not added by hand. */
  smart: z.boolean(),
  ts: z.string().datetime(),
  side: TradeSideSchema,
  token: TokenBriefSchema,
  /** UI units of `token`. */
  amount: z.number().nonnegative(),
  /** What it was paid with or sold for: "SOL", "USDC", or the other token for token-to-token swaps. */
  quoteSymbol: z.string().max(32),
  quoteAmount: z.number().nonnegative(),
  /** USD value when Oxbow read it. */
  usd: z.number().nonnegative(),
  priceUsd: z.number().nonnegative(),
});
export type FeedTrade = z.infer<typeof FeedTradeSchema>;

/** `GET /api/feed` — newest first. `nextCursor` pages further back. */
export const FeedPageSchema = z.object({
  trades: z.array(FeedTradeSchema),
  nextCursor: z.string().nullable(),
});
export type FeedPage = z.infer<typeof FeedPageSchema>;

export const FeedQuerySchema = z.object({
  /** Comma-separated wallet addresses (the viewer's following list); all tracked wallets when absent. */
  wallets: z
    .string()
    .optional()
    .transform((v) => (v ? [...new Set(v.split(',').filter(Boolean))] : undefined))
    .pipe(z.array(AddressSchema).max(100).optional()),
  mint: AddressSchema.optional(),
  side: TradeSideSchema.optional(),
  /** Only trades worth at least this much USD. */
  minUsd: z.coerce.number().nonnegative().max(1e9).optional(),
  cursor: z
    .string()
    .regex(/^\d{1,15}_\d{1,19}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type FeedQueryInput = z.input<typeof FeedQuerySchema>;

/** Wallet performance from the trades Oxbow has read (average-cost method). */
export const WalletStatsSchema = z.object({
  trades: z.number().int().nonnegative(),
  buys: z.number().int().nonnegative(),
  sells: z.number().int().nonnegative(),
  volumeUsd: z.number().nonnegative(),
  realizedPnlUsd: z.number(),
  /** Open positions at today's prices, against what was paid. */
  unrealizedPnlUsd: z.number(),
  /** Share of tokens sold at a profit, 0–1; null before the first sell. */
  winRate: z.number().min(0).max(1).nullable(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  tokensTraded: z.number().int().nonnegative(),
  firstTradeAt: z.string().datetime().nullable(),
  lastTradeAt: z.string().datetime().nullable(),
});
export type WalletStats = z.infer<typeof WalletStatsSchema>;

/** `GET /api/wallets` — leaderboard rows; `stats` cover the last 30 days. */
export const WalletSummarySchema = z.object({
  address: AddressSchema,
  label: z.string().max(40).nullable(),
  featured: z.boolean(),
  smart: z.boolean(),
  stats: WalletStatsSchema,
  /** USD volume over the last 7 days. */
  volume7dUsd: z.number().nonnegative(),
});
export type WalletSummary = z.infer<typeof WalletSummarySchema>;

export const HoldingSchema = z.object({
  token: TokenBriefSchema,
  /** UI units still held (capped by the wallet's balance on chain). */
  amount: z.number().nonnegative(),
  /** What the held amount cost, USD. */
  costUsd: z.number().nonnegative(),
  priceUsd: z.number().nonnegative().nullable(),
  valueUsd: z.number().nonnegative().nullable(),
  pnlUsd: z.number().nullable(),
  pnlPct: z.number().nullable(),
  realizedPnlUsd: z.number(),
  lastTradeAt: z.string().datetime(),
});
export type Holding = z.infer<typeof HoldingSchema>;

/** A token the wallet has sold out of, with what it made or lost. */
export const ClosedPositionSchema = z.object({
  token: TokenBriefSchema,
  boughtUsd: z.number().nonnegative(),
  soldUsd: z.number().nonnegative(),
  realizedPnlUsd: z.number(),
  lastTradeAt: z.string().datetime(),
});
export type ClosedPosition = z.infer<typeof ClosedPositionSchema>;

/** `GET /api/wallets/:address` */
export const WalletDetailSchema = z.object({
  address: AddressSchema,
  label: z.string().max(40).nullable(),
  featured: z.boolean(),
  smart: z.boolean(),
  /** Oxbow follows this wallet on chain. Untracked wallets return 404. */
  addedAt: z.string().datetime(),
  /** Null while its history is still being read (right after it was added). */
  backfilledAt: z.string().datetime().nullable(),
  stats: WalletStatsSchema,
  holdings: z.array(HoldingSchema),
  closed: z.array(ClosedPositionSchema),
});
export type WalletDetail = z.infer<typeof WalletDetailSchema>;

/**
 * `POST /api/wallets` — start tracking a wallet. Names are the viewer's own
 * (kept in their browser); only the owner's featured wallets carry a public label.
 */
export const AddWalletBodySchema = z.object({ address: AddressSchema });
export type AddWalletBody = z.infer<typeof AddWalletBodySchema>;

export const AddWalletResultSchema = z.object({ address: AddressSchema, created: z.boolean() });

export const SafetyFlagSchema = z.enum([
  'MINTABLE',
  'FREEZABLE',
  'LOW_LIQUIDITY',
  'CONCENTRATED',
  'DEV_HOLDS_MUCH',
  'NEW_TOKEN',
  'LOW_ORGANIC',
  'UNVERIFIED',
]);
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;
export const SafetyLevelSchema = z.enum(['OK', 'CAUTION', 'DANGER']);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

/** A tracked wallet's dealings in one token. */
export const TokenTraderSchema = z.object({
  address: AddressSchema,
  label: z.string().max(40).nullable(),
  featured: z.boolean(),
  smart: z.boolean(),
  boughtUsd: z.number().nonnegative(),
  soldUsd: z.number().nonnegative(),
  /** Bought minus sold, in UI units. Positive means it may still hold some. */
  netAmount: z.number(),
  lastSide: TradeSideSchema,
  lastTradeAt: z.string().datetime(),
});
export type TokenTrader = z.infer<typeof TokenTraderSchema>;

/** `GET /api/tokens/:mint` */
export const TokenDetailSchema = TokenBriefSchema.extend({
  usdPrice: z.number().nonnegative().nullable(),
  change24h: z.number().nullable(),
  mcap: z.number().nonnegative().nullable(),
  liquidity: z.number().nonnegative().nullable(),
  holderCount: z.number().int().nonnegative().nullable(),
  organicScore: z.number().min(0).max(100).nullable(),
  launchedAt: z.string().datetime().nullable(),
  mintAuthorityOff: z.boolean().nullable(),
  freezeAuthorityOff: z.boolean().nullable(),
  topHoldersPct: z.number().min(0).max(100).nullable(),
  devPct: z.number().min(0).max(100).nullable(),
  safety: z.object({ level: SafetyLevelSchema, flags: z.array(SafetyFlagSchema) }),
  traders: z.array(TokenTraderSchema),
  /** SOL's USD price now, for turning USD limit prices into SOL amounts. */
  solUsd: z.number().positive().nullable(),
});
export type TokenDetail = z.infer<typeof TokenDetailSchema>;

/** `GET /api/tokens/hot` — what tracked wallets bought most in the last 24 hours. */
export const HotTokenSchema = z.object({
  token: TokenBriefSchema,
  usdPrice: z.number().nonnegative().nullable(),
  change24h: z.number().nullable(),
  mcap: z.number().nonnegative().nullable(),
  /** Distinct tracked wallets that bought it. */
  buyers: z.number().int().nonnegative(),
  sellers: z.number().int().nonnegative(),
  buyUsd: z.number().nonnegative(),
  sellUsd: z.number().nonnegative(),
  lastTradeAt: z.string().datetime(),
});
export type HotToken = z.infer<typeof HotTokenSchema>;

/** `GET /api/tokens/search?q=` — tokens matching a name, ticker or CA (Jupiter's token search). */
export const TokenSearchResultSchema = z.object({
  mint: AddressSchema,
  symbol: z.string().max(32),
  name: z.string().max(64),
  logoUri: LogoUriSchema.nullable(),
  /** On Jupiter's verified list. Unverified tokens are shown, marked. */
  verified: z.boolean(),
});
export type TokenSearchResult = z.infer<typeof TokenSearchResultSchema>;

/** Raw token amounts travel as integer strings so no precision is lost. */
const RawAmount = z.string().regex(/^[1-9]\d{0,29}$/);

/** `GET /api/swap/quote` — one side is always SOL. */
export const SwapQuoteQuerySchema = z.object({
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  /** Raw units of the input token. */
  amount: RawAmount,
  slippageBps: z.coerce.number().int().min(10).max(5000).default(100),
});
export type SwapQuoteQuery = z.infer<typeof SwapQuoteQuerySchema>;

export const SwapQuoteSchema = z.object({
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  /** Raw input sent to the route (after Oxbow's fee on buys). */
  inAmount: z.string(),
  outAmount: z.string(),
  /** Least it can return within the slippage. */
  minOutAmount: z.string(),
  priceImpactPct: z.number(),
  slippageBps: z.number().int(),
  /** Oxbow's fee, in lamports of SOL. */
  feeLamports: z.string(),
  feeBps: z.number().int().nonnegative(),
  route: z.array(z.string()),
});
export type SwapQuote = z.infer<typeof SwapQuoteSchema>;

/** `POST /api/swap/build` */
export const SwapBuildBodySchema = SwapQuoteQuerySchema.extend({ wallet: AddressSchema });
export type SwapBuildBody = z.infer<typeof SwapBuildBodySchema>;

export const BuiltSwapSchema = z.object({
  /** Base64 of an unsigned v0 transaction. */
  transaction: z.string().min(1),
  quote: SwapQuoteSchema,
  lastValidBlockHeight: z.number().int(),
});
export type BuiltSwap = z.infer<typeof BuiltSwapSchema>;

/** One fill in a token's market, any trader (read from the chain). */
export const MarketTradeSchema = z.object({
  signature: SignatureSchema,
  trader: AddressSchema,
  side: TradeSideSchema,
  amount: z.number().nonnegative(),
  usd: z.number().nonnegative(),
  priceUsd: z.number().nonnegative(),
  ts: z.string().datetime(),
  /** The trader is a wallet Oxbow tracks. */
  tracked: z.boolean(),
});
export type MarketTrade = z.infer<typeof MarketTradeSchema>;

/** A price level of the order flow: what filled there, each side. */
export const FlowLevelSchema = z.object({
  priceUsd: z.number().nonnegative(),
  buyUsd: z.number().nonnegative(),
  sellUsd: z.number().nonnegative(),
  buys: z.number().int().nonnegative(),
  sells: z.number().int().nonnegative(),
});
export type FlowLevel = z.infer<typeof FlowLevelSchema>;

/** `GET /api/tokens/:mint/flow` — the token's latest fills grouped like an order book. */
export const OrderFlowSchema = z.object({
  mint: AddressSchema,
  trades: z.array(MarketTradeSchema),
  buys: z.object({ count: z.number().int().nonnegative(), usd: z.number().nonnegative() }),
  sells: z.object({ count: z.number().int().nonnegative(), usd: z.number().nonnegative() }),
  /** Highest price first. Levels above the last price are mostly sells, below mostly buys. */
  levels: z.array(FlowLevelSchema),
  lastPriceUsd: z.number().nonnegative().nullable(),
  /** Seconds between the oldest and newest fill shown. */
  windowSec: z.number().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type OrderFlow = z.infer<typeof OrderFlowSchema>;

/** `POST /api/limit/create` — a limit order through Jupiter (one side is SOL). Amounts are raw units. */
export const LimitCreateBodySchema = z.object({
  wallet: AddressSchema,
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  makingAmount: RawAmount,
  takingAmount: RawAmount,
  /** Unix seconds; never when absent. */
  expiredAt: z.number().int().positive().optional(),
});
export type LimitCreateBody = z.infer<typeof LimitCreateBodySchema>;

/** An unsigned transaction from Jupiter's limit-order service for the wallet to sign. */
export const BuiltLimitSchema = z.object({
  transaction: z.string().min(1),
  order: AddressSchema.optional(),
});
export type BuiltLimit = z.infer<typeof BuiltLimitSchema>;

export const LimitOrderSchema = z.object({
  order: AddressSchema,
  inputMint: AddressSchema,
  outputMint: AddressSchema,
  makingAmount: z.string(),
  takingAmount: z.string(),
  remainingMakingAmount: z.string(),
  createdAt: z.string().datetime().nullable(),
  expiredAt: z.string().datetime().nullable(),
  status: z.string().max(32),
});
export type LimitOrder = z.infer<typeof LimitOrderSchema>;

/** `POST /api/limit/cancel` */
export const LimitCancelBodySchema = z.object({ wallet: AddressSchema, order: AddressSchema });

/** `POST /api/tx/send` — a signed transaction for wallets that sign but don't send. */
export const SendTxBodySchema = z.object({ transaction: z.string().min(1).max(4096) });

/** `GET /api/tx/:signature` */
export const TxStatusSchema = z.object({ status: z.enum(['pending', 'confirmed', 'failed']) });
export type TxStatus = z.infer<typeof TxStatusSchema>;

/** `GET /api/wallet/:address/balances?mints=` — UI-unit balances by mint (SOL under the wrapped SOL mint). */
export const BalancesSchema = z.record(AddressSchema, z.number().nonnegative());
export type Balances = z.infer<typeof BalancesSchema>;

const Health = z.enum(['OK', 'DEGRADED', 'DOWN']);
export type HealthState = z.infer<typeof Health>;

/** `/api/status` — what the status page shows. */
export const StatusSchema = z.object({
  checkedAt: z.string().datetime(),
  api: Health,
  rpc: z.object({ state: Health, slot: z.number().int().nullable(), latencyMs: z.number().nullable() }),
  /** The worker that reads tracked wallets' transactions. */
  tracker: z.object({ state: Health, lagSec: z.number().nullable(), wallets: z.number().int().nonnegative(), live: z.boolean() }),
  /** Newest trade read, any wallet. */
  lastTradeAt: z.string().datetime().nullable(),
  /** Swaps can be built (Jupiter reachable). */
  swaps: Health,
});
export type Status = z.infer<typeof StatusSchema>;
