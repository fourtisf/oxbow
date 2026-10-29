import { z } from 'zod';
import { AddressSchema } from '@oxbow/shared';

const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** API settings from the environment. Secrets (RPC key, DB password) never leave the server. */
export const ConfigSchema = z.object({
  PORT: z.preprocess(blank, z.coerce.number().int().default(4000)),
  HOST: z.preprocess(blank, z.string().default('127.0.0.1')),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.preprocess(blank, z.string().default('redis://127.0.0.1:6379')),
  SOLANA_CLUSTER: z.preprocess(blank, z.enum(['devnet', 'mainnet-beta']).default('devnet')),
  RPC_URL: z.preprocess(blank, z.string().url().optional()),
  JUPITER_API_BASE: z.preprocess(blank, z.string().url().default('https://lite-api.jup.ag')),
  PYTH_HERMES_URL: z.preprocess(blank, z.string().url().default('https://hermes.pyth.network')),
  IPFS_GATEWAY: z.preprocess(blank, z.string().url().optional()),
  /** Wallet that receives the Oxbow fee. Pool creation is off until it is set. */
  OXBOW_TREASURY: z.preprocess(blank, AddressSchema.optional()),
  /** Oxbow fee per pool, in lamports (0.1 SOL). */
  OXBOW_FEE_LAMPORTS: z.preprocess(blank, z.coerce.bigint().nonnegative().default(100_000_000n)),
  /** Priority fee for create transactions, micro-lamports per compute unit. */
  PRIORITY_FEE_MICROLAMPORTS: z.preprocess(blank, z.coerce.number().int().nonnegative().default(50_000)),
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
