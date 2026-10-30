/**
 * Oxbow API entry point: reads config from the environment, connects to
 * Postgres, Redis and the Solana RPC, and serves on 127.0.0.1 (nginx in front).
 * The tracker worker (src/worker.ts) runs as its own process.
 */
import { Redis } from 'ioredis';
import { Connection } from '@solana/web3.js';
import { createDb } from '@oxbow/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import { loadEnvFile } from './env-file';
import { jupiterClient } from './jupiter';

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
  rpc: new Connection(config.RPC_URL, 'confirmed'),
  jupiter: jupiterClient(config.JUPITER_API_BASE, { apiKey: config.JUPITER_API_KEY }),
  swap: { treasury: config.OXBOW_TREASURY, feeBps: config.OXBOW_FEE_BPS },
  maxWallets: config.MAX_TRACKED_WALLETS,
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
