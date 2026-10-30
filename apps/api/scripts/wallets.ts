/**
 * Manage tracked wallets from the server:
 *
 *   pnpm --filter @oxbow/api wallets add <address> [--label "Name"] [--featured]
 *   pnpm --filter @oxbow/api wallets feature <address> [--label "Name"]
 *   pnpm --filter @oxbow/api wallets unfeature <address>
 *   pnpm --filter @oxbow/api wallets remove <address>      (stops tracking; trades are kept)
 *   pnpm --filter @oxbow/api wallets list
 *
 * Featured wallets are the ones you pick: they carry a public label, are
 * always tracked, and lead the leaderboard. Use only addresses you have
 * checked yourself.
 */
import { parseArgs } from 'node:util';
import { Redis } from 'ioredis';
import { createDb } from '@oxbow/db';
import { AddressSchema } from '@oxbow/shared';
import { loadConfig } from '../src/config';
import { loadEnvFile } from '../src/env-file';
import { WALLETS_CHANNEL } from '../src/hub';

loadEnvFile();
const config = loadConfig();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { label: { type: 'string' }, featured: { type: 'boolean', default: false } },
});
const [cmd, rawAddress] = positionals;
const db = createDb(config.DATABASE_URL);

function address(): string {
  const a = AddressSchema.safeParse(rawAddress);
  if (!a.success) {
    console.error('Give a wallet address (base58).');
    process.exit(1);
  }
  return a.data;
}

function label(): string | undefined {
  const l = values.label?.trim();
  if (l === undefined) return undefined;
  if (!/^[\p{L}\p{N} ._\-]{1,32}$/u.test(l)) {
    console.error('Labels: 1–32 letters, numbers, spaces, . _ -');
    process.exit(1);
  }
  return l;
}

async function notify(a: string) {
  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    await redis.publish(WALLETS_CHANNEL, a);
  } catch {
    console.warn('Redis not reachable: the worker picks the wallet up within a minute anyway.');
  } finally {
    redis.disconnect();
  }
}

try {
  switch (cmd) {
    case 'add': {
      const a = address();
      const l = label();
      await db.trackedWallet.upsert({
        where: { address: a },
        create: { address: a, label: l ?? null, featured: values.featured },
        update: { active: true, ...(l !== undefined ? { label: l } : {}), ...(values.featured ? { featured: true } : {}) },
      });
      await notify(a);
      console.log(`Tracking ${a}${values.featured ? ' (featured)' : ''}${l ? ` as "${l}"` : ''}.`);
      break;
    }
    case 'feature':
    case 'unfeature': {
      const a = address();
      const l = label();
      const featured = cmd === 'feature';
      await db.trackedWallet.upsert({
        where: { address: a },
        create: { address: a, label: l ?? null, featured },
        update: { featured, active: true, ...(l !== undefined ? { label: l } : {}) },
      });
      await notify(a);
      console.log(`${a} ${featured ? 'featured' : 'no longer featured'}.`);
      break;
    }
    case 'remove': {
      const a = address();
      await db.trackedWallet.update({ where: { address: a }, data: { active: false, featured: false } });
      console.log(`Stopped tracking ${a}.`);
      break;
    }
    case 'list': {
      const rows = await db.trackedWallet.findMany({ orderBy: [{ featured: 'desc' }, { addedAt: 'asc' }], include: { _count: { select: { trades: true } } } });
      for (const r of rows)
        console.log(
          [r.featured ? '★' : ' ', r.active ? 'on ' : 'off', r.address.padEnd(44), String(r._count.trades).padStart(6), 'trades', r.backfilledAt ? '' : '(reading history)', r.label ?? ''].join(' '),
        );
      console.log(`${rows.filter((r) => r.active).length} tracked, ${rows.filter((r) => r.featured).length} featured.`);
      break;
    }
    default:
      console.log('Usage: wallets add|feature|unfeature|remove <address> [--label "Name"] [--featured] | wallets list');
      process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
