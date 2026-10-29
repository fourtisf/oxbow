/**
 * Prisma client for the API, worker and scripts. Uses the pg driver adapter
 * (Prisma 7); DATABASE_URL comes from the environment.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

export function createDb(url = process.env.DATABASE_URL): PrismaClient {
  if (!url) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
