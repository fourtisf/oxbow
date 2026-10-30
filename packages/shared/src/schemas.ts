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

/**
 * Token logo: an https URL or a path on this site ("/tokens/sol.svg"). Metadata
 * images on ipfs:// or ar:// are rewritten to an https gateway by the API;
 * anything else (http:, data:, javascript:, protocol-relative) is rejected.
 */
export const LogoUriSchema = z
  .string()
  .max(512)
  .refine((v) => /^https:\/\/[^\s"'<>]+$/i.test(v) || /^\/(?!\/)[^\s"'<>]*$/.test(v), 'logo must be an https URL or a site path');

/** Any token as the UI shows it. `symbol`/`name` come from metadata and are untrusted. */
export const AssetRefSchema = z.object({
  mint: AddressSchema,
  symbol: z.string().max(32),
  name: z.string().max(64),
  logoUri: LogoUriSchema.nullable(),
  brand: BrandSchema.nullable(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const MarketStateSchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']),
  reason: z.enum(['WEEKEND', 'HOLIDAY', 'OVERNIGHT', 'EARLY_CLOSE', 'CLOSURE']).nullable(),
  holiday: z.string().nullable(),
  /** Next open (when closed) or close (when open). */
  nextChange: z.string().datetime(),
  earlyClose: z.boolean(),
});

export const QuoteAssetSchema = AssetRefSchema.extend({
  kind: QuoteKindSchema,
  priceUsd: z.number().nonnegative(),
  change24h: z.number(),
  /** Stock issuer, e.g. "xStocks". Null for SOL and USDC. */
  issuer: z.string().nullable(),
  /** When the price feed last updated. */
  priceUpdatedAt: z.string().datetime(),
  /** Underlying stock market session. Null for SOL and USDC (they trade 24/7). */
  market: MarketStateSchema.nullable(),
  /** Issuer notice (split, dividend, halt…) shown on the stock and its pools. */
  notice: z.string().max(280).nullable(),
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

export const SafetyFlagSchema = z.enum([
  'FREEZABLE',
  'TRANSFER_HOOK',
  'PERMANENT_DELEGATE',
  'CREATOR_PULLED_BEFORE',
  'DUPLICATE_SYMBOL',
  'MINTABLE',
  'TRANSFER_FEE',
  'LP_UNLOCKED',
  'CONCENTRATED',
  'NEW_TOKEN',
  'LOW_LIQUIDITY',
]);
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;
export const SafetyLevelSchema = z.enum(['OK', 'CAUTION', 'DANGER']);
export type SafetyLevel = z.infer<typeof SafetyLevelSchema>;

/** Checks a buyer should see before trading. See `safety.ts` for the rules. */
export const TokenSafetySchema = z.object({
  level: SafetyLevelSchema,
  flags: z.array(SafetyFlagSchema),
  holderCount: z.number().int().nonnegative(),
  /** Share of supply held by the 10 largest holders (excluding pools and burn addresses), 0–100. */
  top10Pct: z.number().min(0).max(100),
  /** When the token's mint was created. */
  tokenCreatedAt: z.string().datetime().nullable(),
  mintAuthority: AddressSchema.nullable(),
  freezeAuthority: AddressSchema.nullable(),
  /** The pool creator's history on Oxbow. */
  creatorPools: z.number().int().nonnegative(),
  creatorPulled: z.number().int().nonnegative(),
});
export type TokenSafety = z.infer<typeof TokenSafetySchema>;

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
  safety: TokenSafetySchema,
});
export type PoolSummary = z.infer<typeof PoolSummarySchema>;

export const HolderKindSchema = z.enum(['BURNED', 'LOCKED', 'CREATOR', 'OTHER']);
export type HolderKind = z.infer<typeof HolderKindSchema>;

export const HolderSliceSchema = z.object({
  kind: HolderKindSchema,
  pct: z.number().min(0).max(100),
  unlockAt: z.string().datetime().nullable(),
  /** On-chain proof: the lock escrow / LP holder account, or the burn transaction. */
  proof: z.object({ kind: z.enum(['account', 'tx']), id: z.string().min(32).max(90) }).nullable(),
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
/** OHLC in USD, volume in USD, one per `stepMs`. */
export const CandleSchema = z.object({ t: z.number(), o: z.number(), h: z.number(), l: z.number(), c: z.number(), v: z.number().nonnegative() });
export type Candle = z.infer<typeof CandleSchema>;
export const ChartSeriesSchema = z.object({
  tf: TimeframeSchema,
  stepMs: z.number().int().positive(),
  points: z.array(ChartPointSchema),
  candles: z.array(CandleSchema),
});
export type ChartSeries = z.infer<typeof ChartSeriesSchema>;

export const TradeSideSchema = z.enum(['BUY', 'SELL']);
export type TradeSide = z.infer<typeof TradeSideSchema>;

/** `/api/pools/:address/trades` — most recent first. */
export const TradeSchema = z.object({
  sig: z.string(),
  ts: z.number(),
  side: TradeSideSchema,
  wallet: AddressSchema,
  amountUsd: z.number().nonnegative(),
  baseAmount: z.number().nonnegative(),
  quoteAmount: z.number().nonnegative(),
  priceUsd: z.number().nonnegative(),
});
export type Trade = z.infer<typeof TradeSchema>;

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
  logoUri: LogoUriSchema.nullable(),
  /** Token-2022 extension names, e.g. "TransferFeeConfig". */
  extensions: z.array(z.string()),
  risk: TokenRiskSchema,
  /** Another listed token already uses this symbol with a different mint. */
  symbolTaken: z.boolean(),
  /** When the mint was created, if known. */
  createdAt: z.string().datetime().nullable(),
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
  /** USD value of everything deposited, at deposit time. */
  depositedUsd: z.number().nonnegative(),
  /** Pool price (quote per base) at deposit time, for impermanent loss. */
  entryPriceQuote: z.number().nonnegative(),
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
  /** Comma-separated pool addresses (watchlist). */
  addresses: z
    .string()
    .max(100 * 45)
    .optional()
    .transform((v) => (v ? v.split(',').filter(Boolean) : undefined))
    .pipe(z.array(AddressSchema).max(100).optional()),
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

/** `/api/wallet/:address/activity` — the wallet's Oxbow transactions, most recent first. */
export const WalletActivitySchema = z.object({
  sig: z.string(),
  ts: z.number(),
  kind: z.enum(['CREATE', 'ADD', 'REMOVE', 'CLAIM', 'SWAP']),
  pool: z.object({ address: AddressSchema, base: AssetRefSchema, quote: AssetRefSchema }),
  amountUsd: z.number().nonnegative(),
});
export type WalletActivity = z.infer<typeof WalletActivitySchema>;

const Health = z.enum(['OK', 'DEGRADED', 'DOWN']);
export type HealthState = z.infer<typeof Health>;

/** `/api/status` — what the status page shows. */
export const StatusSchema = z.object({
  checkedAt: z.string().datetime(),
  api: Health,
  rpc: z.object({ state: Health, slot: z.number().int().nullable(), latencyMs: z.number().nullable() }),
  indexer: z.object({ state: Health, lagSec: z.number().nullable() }),
  prices: z.object({ state: Health, updatedAt: z.string().datetime().nullable() }),
  /** Mock data in use (M1). */
  sampleData: z.boolean(),
});
export type Status = z.infer<typeof StatusSchema>;

// ---------------------------------------------------------------- pool creation (M3)

const Signature = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/);
/** A decimal amount in UI units, as typed ("1500", "0.25"). Kept as a string so no precision is lost. */
const UiAmount = z.string().regex(/^\d{1,30}(\.\d{1,18})?$/);

/** `GET /api/venues` — where pools can be created right now, and what it costs. */
export const VenuesSchema = z.object({
  /** False until the treasury is configured on the server. */
  createEnabled: z.boolean(),
  oxbowFeeLamports: z.number().int().nonnegative(),
  venues: z.array(
    z.object({
      id: VenueIdSchema,
      enabled: z.boolean(),
      feeTiers: z.array(z.object({ feeBps: z.number().int().positive(), createPoolFeeLamports: z.number().int().nonnegative() })),
    }),
  ),
});
export type Venues = z.infer<typeof VenuesSchema>;

/** `POST /api/pools/build` — the unsigned create transaction for the creator's wallet. */
export const BuildCreateBodySchema = z.object({
  creator: AddressSchema,
  baseMint: AddressSchema,
  quoteMint: AddressSchema,
  baseAmount: UiAmount,
  quoteAmount: UiAmount,
  feeBps: z.number().int().positive(),
  venue: VenueIdSchema,
});
export type BuildCreateBody = z.infer<typeof BuildCreateBodySchema>;

export const BuiltTxSchema = z.object({
  /** Base64 of an unsigned v0 transaction. */
  transaction: z.string().min(1),
  pool: AddressSchema.optional(),
});
export type BuiltTx = z.infer<typeof BuiltTxSchema>;

/** `POST /api/tx/send` — a signed transaction for wallets that sign but don't send. */
export const SendTxBodySchema = z.object({ transaction: z.string().min(1).max(4096) });

/** `GET /api/tx/:signature` */
export const TxStatusSchema = z.object({ status: z.enum(['pending', 'confirmed', 'failed']) });
export type TxStatus = z.infer<typeof TxStatusSchema>;

/** `POST /api/pools/:address/lock` — the LP burn transaction to record. */
export const LockPoolBodySchema = z.object({ signature: Signature });

/** `POST /api/pools/:address/burn` — who burns (must be the pool's creator). */
export const BurnBuildBodySchema = z.object({ creator: AddressSchema });

/** `GET /api/wallet/:address/balances?mints=` — UI-unit balances by mint. */
export const BalancesSchema = z.record(AddressSchema, z.number().nonnegative());

/** `GET /api/tokens/popular` — quick picks for create step 1 (most traded on Jupiter, verified). */
export const PopularTokenSchema = z.object({
  mint: AddressSchema,
  symbol: z.string().max(32),
  name: z.string().max(64),
  logoUri: LogoUriSchema.nullable(),
});
export type PopularToken = z.infer<typeof PopularTokenSchema>;

/** `GET /api/tokens/search?q=` — tokens matching a name or ticker (Jupiter's token search). */
export const TokenSearchResultSchema = PopularTokenSchema.extend({
  /** On Jupiter's verified list. Unverified tokens are shown, marked. */
  verified: z.boolean(),
});
export type TokenSearchResult = z.infer<typeof TokenSearchResultSchema>;
