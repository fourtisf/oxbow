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
  /** Days a wallet nobody follows or opens stays tracked (featured wallets always are). */
  WALLET_IDLE_DAYS: z.preprocess(blank, z.coerce.number().int().positive().default(14)),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
