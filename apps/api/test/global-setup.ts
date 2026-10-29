/**
 * Creates the test database and applies the migrations. The suite needs a
 * local Postgres and Redis (see README); without them it is skipped, loudly.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';
import { createDb } from '@oxbow/db';
import { Redis } from 'ioredis';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://oxbow:oxbow@127.0.0.1:5432/oxbow_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:6379/15';

declare module 'vitest' {
  export interface ProvidedContext {
    servicesReady: boolean;
  }
}

export default async function setup(project: TestProject) {
  const url = new URL(TEST_DATABASE_URL);
  const name = url.pathname.slice(1);
  const admin = new URL(TEST_DATABASE_URL);
  admin.pathname = '/postgres';
  let ready = false;
  const db = createDb(admin.toString());
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 0, enableOfflineQueue: false, retryStrategy: () => null });
  try {
    await redis.connect();
    await redis.ping();
    const found = await db.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${name}`;
    if (!found.length) await db.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: fileURLToPath(new URL('../../../packages/db', import.meta.url)),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: 'pipe',
    });
    ready = true;
  } catch (e) {
    console.warn(`\n[api tests] skipped: Postgres or Redis not reachable (${(e as Error).message.split('\n')[0]})\n`);
  } finally {
    await db.$disconnect();
    redis.disconnect();
  }
  project.provide('servicesReady', ready);
}
