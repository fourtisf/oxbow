/**
 * API contract shared by the web app (mock layer in M1, HTTP client from M2),
 * the Fastify API and the worker. Every response the web app consumes is
 * described here, and every API input is validated with these schemas.
 */
import { z } from 'zod';
import { BASE58_ADDRESS_RE } from './address';

export const AddressSchema = z.string().regex(BASE58_ADDRESS_RE, 'Expected a base58 address (32–44 chars)');

export const VenueIdSchema = z.enum(['RAYDIUM_CPMM', 'METEORA_DAMM_V2', 'ORCA_WHIRLPOOL']);
export type VenueId = z.infer<typeof VenueIdSchema>;

export const QuoteKindSchema = z.enum(['STOCK', 'SOL', 'USDC']);
export type QuoteKind = z.infer<typeof QuoteKindSchema>;

export const LpStatusSchema = z.enum(['BURNED', 'LOCKED', 'PARTIAL', 'UNLOCKED']);
export type LpStatus = z.infer<typeof LpStatusSchema>;

export const TimeframeSchema = z.enum(['1H', '1D', '1W']);
export type Timeframe = z.infer<typeof TimeframeSchema>;

const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Generated avatar tile for stocks, SOL and USDC. */
export const BrandSchema = z.object({
  a: HexColor,
  b: HexColor,
  monogram: z.string().min(1).max(4),
  /** Draws the small "x" badge used for tokenized stocks. */
  stock: z.boolean(),
});
export type Brand = z.infer<typeof BrandSchema>;

/** Any token as the UI shows it. `symbol`/`name` come from metadata and are untrusted. */
export const AssetRefSchema = z.object({
  mint: AddressSchema,
  symbol: z.string().max(32),
  name: z.string().max(64),
  logoUri: z.string().url().nullable(),
  brand: BrandSchema.nullable(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const QuoteAssetSchema = AssetRefSchema.extend({
  kind: QuoteKindSchema,
  priceUsd: z.number().nonnegative(),
  change24h: z.number(),
  /** Stock issuer, e.g. "xStocks". Null for SOL and USDC. */
  issuer: z.string().nullable(),
});
export type QuoteAsset = z.infer<typeof QuoteAssetSchema>;

export const LpStateSchema = z.object({
  status: LpStatusSchema,
  /** Share of the pool's liquidity that is burned or locked, 0–100. */
  lockedPct: z.number().min(0).max(100),
  /** ISO time the lock ends. Null for burned or unlocked. */
  unlockAt: z.string().datetime().nullable(),
});
export type LpState = z.infer<typeof LpStateSchema>;

export const PoolSummarySchema = z.object({
  address: AddressSchema,
  venue: VenueIdSchema,
  feeBps: z.number().int().min(1).max(10_000),
  base: AssetRefSchema,
  quote: QuoteAssetSchema,
  priceUsd: z.number().nonnegative(),
  /** Price of one base token in quote units. */
  priceQuote: z.number().nonnegative(),
  change24h: z.number(),
  tvlUsd: z.number().nonnegative(),
  vol24hUsd: z.number().nonnegative(),
  marketCapUsd: z.number().nonnegative(),
  feeAprPct: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  lp: LpStateSchema,
  buys24h: z.number().int().nonnegative(),
  sells24h: z.number().int().nonnegative(),
  /** 7-day price series for the table sparkline (oldest first). */
  spark7d: z.array(z.number()),
});
export type PoolSummary = z.infer<typeof PoolSummarySchema>;

export const HolderKindSchema = z.enum(['BURNED', 'LOCKED', 'CREATOR', 'OTHER']);
export type HolderKind = z.infer<typeof HolderKindSchema>;

export const HolderSliceSchema = z.object({
  kind: HolderKindSchema,
  pct: z.number().min(0).max(100),
  unlockAt: z.string().datetime().nullable(),
});
export type HolderSlice = z.infer<typeof HolderSliceSchema>;

export const PoolDetailSchema = PoolSummarySchema.extend({
  reserveBase: z.number().nonnegative(),
  reserveQuote: z.number().nonnegative(),
  creator: AddressSchema,
  createdTx: z.string().nullable(),
  lpMint: AddressSchema.nullable(),
  positionNft: AddressSchema.nullable(),
  /** "Who holds the liquidity" breakdown, sums to 100. */
  holders: z.array(HolderSliceSchema),
});
export type PoolDetail = z.infer<typeof PoolDetailSchema>;

export const ChartPointSchema = z.object({ t: z.number(), p: z.number() });
export const ChartSeriesSchema = z.object({
  tf: TimeframeSchema,
  stepMs: z.number().int().positive(),
  points: z.array(ChartPointSchema),
});
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

export const StatsSchema = z.object({
  vol24hUsd: z.number(),
  tvlUsd: z.number(),
  marketCount: z.number().int(),
  /** Biggest 24h gainer, with a 40-point 1D series for the hero's floating chip. */
  topGainer: z.object({ pool: PoolSummarySchema, spark1d: z.array(z.number()) }).nullable(),
  sparks: z.object({ vol: z.array(z.number()), tvl: z.array(z.number()), gainer: z.array(z.number()) }),
});
export type Stats = z.infer<typeof StatsSchema>;

export const TickerItemSchema = z.object({
  kind: z.enum(['pool', 'stock']),
  /** Pool address for pool items. */
  address: AddressSchema.nullable(),
  asset: AssetRefSchema,
  priceUsd: z.number(),
  change24h: z.number(),
});
export type TickerItem = z.infer<typeof TickerItemSchema>;

export const StockInfoSchema = QuoteAssetSchema.extend({
  poolCount: z.number().int().nonnegative(),
  /** Decorative 30-point series for the verified-stock card. */
  spark: z.array(z.number()),
  /** Background orb color on the verified-stock card. */
  orb: HexColor,
});
export type StockInfo = z.infer<typeof StockInfoSchema>;

export const TokenRiskSchema = z.object({
  mintable: z.boolean(),
  freezable: z.boolean(),
  transferFee: z.boolean(),
  transferHook: z.boolean(),
  permanentDelegate: z.boolean(),
});
export type TokenRisk = z.infer<typeof TokenRiskSchema>;

/** `/api/tokens/:mint` — create step 1 lookup. */
export const TokenInfoSchema = z.object({
  mint: AddressSchema,
  symbol: z.string().max(32),
  name: z.string().max(64),
  decimals: z.number().int().min(0).max(18),
  /** UI units (raw supply / 10^decimals). */
  supply: z.number().nonnegative(),
  tokenProgram: z.enum(['spl-token', 'token-2022']),
  mintAuthority: AddressSchema.nullable(),
  freezeAuthority: AddressSchema.nullable(),
  logoUri: z.string().url().nullable(),
  /** Token-2022 extension names, e.g. "TransferFeeConfig". */
  extensions: z.array(z.string()),
  risk: TokenRiskSchema,
});
export type TokenInfo = z.infer<typeof TokenInfoSchema>;

export const ActivityKindSchema = z.enum(['BUY', 'SELL', 'ADD_LP', 'POOL']);
export type ActivityKind = z.infer<typeof ActivityKindSchema>;

export const ActivityItemSchema = z.object({
  id: z.string(),
  kind: ActivityKindSchema,
  pool: z.object({ address: AddressSchema, base: AssetRefSchema, quote: AssetRefSchema }),
  wallet: AddressSchema,
  amountUsd: z.number().nonnegative(),
  ts: z.number(),
});
export type ActivityItem = z.infer<typeof ActivityItemSchema>;

export const PositionSchema = z.object({
  id: z.string(),
  pool: PoolSummarySchema,
  /** Share of the pool, 0–1. */
  share: z.number().min(0).max(1),
  valueUsd: z.number().nonnegative(),
  baseAmount: z.number().nonnegative(),
  quoteAmount: z.number().nonnegative(),
  unclaimedFeesUsd: z.number().nonnegative(),
  isCreator: z.boolean(),
  lock: z.object({ status: LpStatusSchema, unlockAt: z.string().datetime().nullable() }),
});
export type Position = z.infer<typeof PositionSchema>;

export const PoolSortSchema = z.enum(['vol', 'tvl', 'chg', 'apr', 'new']);
export type PoolSort = z.infer<typeof PoolSortSchema>;

export const QuoteFilterSchema = z.enum(['all', 'stock', 'SOL', 'USDC']);
export type QuoteFilter = z.infer<typeof QuoteFilterSchema>;

/** `/api/pools` query string. */
export const PoolsQuerySchema = z.object({
  q: z.string().trim().max(64).optional(),
  quote: QuoteFilterSchema.default('all'),
  locked: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
  sort: PoolSortSchema.default('vol'),
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PoolsQueryInput = z.input<typeof PoolsQuerySchema>;
export type PoolsQuery = z.output<typeof PoolsQuerySchema>;

export const PoolsPageSchema = z.object({
  items: z.array(PoolSummarySchema),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
});
export type PoolsPage = z.infer<typeof PoolsPageSchema>;

/** `POST /api/pools/register` body. Pool data is never taken from the client. */
export const RegisterPoolBodySchema = z.object({
  signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
  venue: VenueIdSchema,
});
export type RegisterPoolBody = z.infer<typeof RegisterPoolBodySchema>;
