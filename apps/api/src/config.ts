import { z } from 'zod';

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
});
export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
