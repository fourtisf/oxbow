/**
 * Oxbow API entry point: reads config from the environment, connects to
 * Postgres, Redis and the Solana RPC, and serves on 127.0.0.1 (nginx in front).
 */
import { Redis } from 'ioredis';
import { createDb } from '@oxbow/db';
import { connect } from '@oxbow/solana/rpc';
import { buildApp } from './app';
import { loadConfig } from './config';
import { loadEnvFile } from './env-file';
import { LivePrices } from './prices';

loadEnvFile();
const config = loadConfig();
const db = createDb(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, lazyConnect: false });
redis.on('error', () => {
  // Logged by status checks; the API keeps serving without the cache.
});

const { app } = await buildApp({
  db,
  redis,
  rpc: connect(config.RPC_URL, config.SOLANA_CLUSTER),
  cluster: config.SOLANA_CLUSTER,
  create: { treasury: config.OXBOW_TREASURY, feeLamports: config.OXBOW_FEE_LAMPORTS, priorityMicroLamports: config.PRIORITY_FEE_MICROLAMPORTS },
  prices: new LivePrices(config.JUPITER_API_BASE, config.PYTH_HERMES_URL, (m) => app.log.warn(m)),
  ipfsGateway: config.IPFS_GATEWAY,
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
});

const shutdown = async () => {
  await app.close();
  await db.$disconnect();
  redis.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

app.listen({ port: config.PORT, host: config.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
