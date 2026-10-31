import { z } from 'zod';
import { AddressSchema } from '@oxbow/shared';

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** API and worker settings from the environment. Secrets (RPC key, DB password) never leave the server. */
export const ConfigSchema = z.object({
  PORT: z.preprocess(blank, z.coerce.number().int().default(4000)),
  HOST: z.preprocess(blank, z.string().default('127.0.0.1')),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.preprocess(blank, z.string().default('redis://127.0.0.1:6379')),
  /** Solana mainnet RPC (Helius or similar). Solana's public endpoint works for trying it out, slowly. */
  RPC_URL: z.preprocess(blank, z.string().url().default('https://api.mainnet-beta.solana.com')),
  /** Requests a second each process (API, worker, CLI) sends to RPC_URL. Helius free: keep the total under 10. */
  RPC_RPS: z.preprocess(blank, z.coerce.number().positive().max(500).default(5)),
  /** Websocket endpoint; derived from RPC_URL (https -> wss) when unset. */
  RPC_WS_URL: z.preprocess(blank, z.string().url().optional()),
  JUPITER_API_BASE: z.preprocess(blank, z.string().url().default('https://lite-api.jup.ag')),
  /** Optional key from portal.jup.ag for higher rate limits (use JUPITER_API_BASE=https://api.jup.ag with it). */
  JUPITER_API_KEY: z.preprocess(blank, z.string().optional()),
  IPFS_GATEWAY: z.preprocess(blank, z.string().url().optional()),
  /** Wallet that receives the swap fee. Swaps work without it, fee-free. */
  OXBOW_TREASURY: z.preprocess(blank, AddressSchema.optional()),
  /** Swap fee in basis points of the SOL side (50 = 0.5%). */
  OXBOW_FEE_BPS: z.preprocess(blank, z.coerce.number().int().min(0).max(200).default(50)),
  MAX_TRACKED_WALLETS: z.preprocess(blank, z.coerce.number().int().positive().default(1000)),
  /** Transactions read the first time a wallet is tracked. */
  BACKFILL_LIMIT: z.preprocess(blank, z.coerce.number().int().min(10).max(1000).default(100)),
  /** Seconds between catch-up rounds over every wallet (covers anything the websocket missed). */
  TRACKER_RESYNC_SEC: z.preprocess(blank, z.coerce.number().int().min(30).default(300)),
  /** Find profitable wallets automatically (traders around winners, Jupiter, pump.fun, busy tokens): "discovered" smart money. */
  DISCOVERY_ENABLED: z.preprocess(blank, z.enum(['0', '1', 'true', 'false']).default('1').transform((v) => v === '1' || v === 'true')),
  /** Minutes between discovery rounds once DISCOVERY_MAX smart wallets are tracked (every 15 until then). */
  DISCOVERY_EVERY_MIN: z.preprocess(blank, z.coerce.number().int().min(10).default(120)),
  /** Candidates evaluated per round (each reads DISCOVERY_HISTORY_TXS transactions: 10 credits on Helius). */
  DISCOVERY_EVALS: z.preprocess(blank, z.coerce.number().int().min(1).max(300).default(30)),
  DISCOVERY_HISTORY_TXS: z.preprocess(blank, z.coerce.number().int().min(20).max(200).default(100)),
  /** A discovered wallet needs at least this much realized profit (USD) in the history read. */
  DISCOVERY_MIN_PNL_USD: z.preprocess(blank, z.coerce.number().nonnegative().default(150)),
  /** ...and at least this share of closed positions in profit. */
  DISCOVERY_MIN_WIN_RATE: z.preprocess(blank, z.coerce.number().min(0).max(1).default(0.5)),
  /** ...or this much realized profit with no more losses than wins (whales close few positions). */
  DISCOVERY_BIG_WIN_USD: z.preprocess(blank, z.coerce.number().nonnegative().default(1500)),
  /** RPC credits discovery may spend a day, spread over the day; the tracker needs the rest of the plan. 0 = no limit. */
  DISCOVERY_DAILY_CALLS: z.preprocess(blank, z.coerce.number().int().min(0).default(15_000)),
  /** Most discovered wallets tracked at once. Each tracked wallet costs a read per transaction it makes. */
  DISCOVERY_MAX: z.preprocess(blank, z.coerce.number().int().min(0).default(100)),
  /** Days a wallet nobody follows or opens stays tracked (featured and discovered wallets always are). */
  WALLET_IDLE_DAYS: z.preprocess(blank, z.coerce.number().int().positive().default(14)),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
