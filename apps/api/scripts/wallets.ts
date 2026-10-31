/**
 * Manage tracked wallets from the server:
 *
 *   pnpm --filter @oxbow/api wallets add <address> [--label "Name"] [--featured]
 *   pnpm --filter @oxbow/api wallets feature <address> [--label "Name"]
 *   pnpm --filter @oxbow/api wallets unfeature <address>
 *   pnpm --filter @oxbow/api wallets remove <address>      (stops tracking; trades are kept)
 *   pnpm --filter @oxbow/api wallets import <file> [--featured]  (one wallet per line: address, then an optional label)
 *   pnpm --filter @oxbow/api wallets list
 *   pnpm --filter @oxbow/api wallets discover               (one smart-money discovery round now)
 *   pnpm --filter @oxbow/api wallets discover --deep        (a big one-off round to fill an empty feed: ~5,000 RPC calls)
 *
 * Featured wallets are the ones you pick: they carry a public label, are
 * always tracked, and lead the leaderboard. Use only addresses you have
 * checked yourself.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Redis } from 'ioredis';
import { createDb } from '@oxbow/db';
import { AddressSchema } from '@oxbow/shared';
import { loadConfig } from '../src/config';
import { loadEnvFile } from '../src/env-file';
import { tradePublisher, WALLETS_CHANNEL } from '../src/hub';
import { jupiterClient } from '../src/jupiter';
import { Discovery } from '../src/tracker/discovery';
import { Ingestor } from '../src/tracker/ingest';
import { jsonRpc } from '../src/tracker/rpc';
import { MarketTape } from '../src/tracker/tape';
import { TokenBook } from '../src/tracker/tokens';

loadEnvFile();
const config = loadConfig();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { label: { type: 'string' }, featured: { type: 'boolean', default: false }, deep: { type: 'boolean', default: false } },
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
        create: { address: a, label: l ?? null, featured: values.featured, source: 'owner' },
        update: { active: true, source: 'owner', ...(l !== undefined ? { label: l } : {}), ...(values.featured ? { featured: true } : {}) },
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
        create: { address: a, label: l ?? null, featured, source: 'owner' },
        update: { featured, active: true, source: 'owner', ...(l !== undefined ? { label: l } : {}) },
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
    case 'import': {
      if (!rawAddress) {
        console.error('Give a file: one wallet per line, address then an optional label. Lines starting with # are skipped.');
        process.exit(1);
      }
      const lines = readFileSync(rawAddress, 'utf8').split(/\r?\n/);
      let added = 0;
      let skipped = 0;
      for (const line of lines) {
        const text = line.trim();
        if (!text || text.startsWith('#')) continue;
        const [addr, ...rest] = text.split(/[\s,;]+/);
        const label = rest.join(' ').trim().slice(0, 32);
        if (!AddressSchema.safeParse(addr).success || (label && !/^[\p{L}\p{N} ._\-]{1,32}$/u.test(label))) {
          console.warn(`skipped: ${text.slice(0, 60)}`);
          skipped++;
          continue;
        }
        await db.trackedWallet.upsert({
          where: { address: addr! },
          create: { address: addr!, label: label || null, featured: values.featured, source: 'owner' },
          update: { active: true, source: 'owner', ...(label ? { label } : {}), ...(values.featured ? { featured: true } : {}) },
        });
        await notify(addr!);
        added++;
      }
      console.log(`${added} wallet(s) tracked${values.featured ? ' as featured' : ''}, ${skipped} line(s) skipped. Their recent trades load within a few minutes.`);
      break;
    }
    case 'list': {
      const rows = await db.trackedWallet.findMany({ orderBy: [{ featured: 'desc' }, { addedAt: 'asc' }], include: { _count: { select: { trades: true } } } });
      for (const r of rows)
        console.log(
          [r.featured ? '★' : r.source === 'discovered' ? '◆' : ' ', r.active ? 'on ' : 'off', r.address.padEnd(44), String(r._count.trades).padStart(6), 'trades', r.backfilledAt ? '' : '(reading history)', r.label ?? ''].join(' '),
        );
      console.log(`${rows.filter((r) => r.active).length} tracked, ${rows.filter((r) => r.featured).length} featured (★), ${rows.filter((r) => r.active && r.source === 'discovered').length} discovered (◆).`);
      break;
    }
    case 'discover': {
      const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
      redis.on('error', () => {});
      const jup = jupiterClient(config.JUPITER_API_BASE, { apiKey: config.JUPITER_API_KEY });
      const rpc = jsonRpc(config.RPC_URL, { rps: config.RPC_RPS });
      const log = (m: string) => console.log(m);
      const tokens = new TokenBook(db, jup, { log });
      const ingestor = new Ingestor({ db, rpc, tokens, publish: tradePublisher(redis), log });
      const discovery = new Discovery({
        db,
        rpc,
        tokens,
        jup,
        redis,
        tape: new MarketTape({ rpc, tokens, redis, log }),
        ingestor,
        log,
        config: {
          evalsPerRun: config.DISCOVERY_EVALS,
          historyTxs: config.DISCOVERY_HISTORY_TXS,
          minPnlUsd: config.DISCOVERY_MIN_PNL_USD,
          minWinRate: config.DISCOVERY_MIN_WIN_RATE,
          bigWinUsd: config.DISCOVERY_BIG_WIN_USD,
          max: config.DISCOVERY_MAX,
          dailyCalls: config.DISCOVERY_DAILY_CALLS,
          // Deep: many more trending tokens, a much bigger sample of each, and every candidate found checked.
          ...(values.deep ? { winnersPerRun: 12, routerSample: 500, tokens: 6, samplePerToken: 40, evalsPerRun: 50, bootstrapBelow: 0, dailyCalls: 0 } : {}),
        },
      });
      if (values.deep) console.log(`Deep round: reads about 5,000 transactions at ${config.RPC_RPS} a second (RPC_RPS), so about ${Math.round(5000 / config.RPC_RPS / 60)} minutes.`);
      const r = await discovery.run();
      if (r.budget && !r.evaluated) {
        console.log(`Today's discovery budget (${config.DISCOVERY_DAILY_CALLS} RPC calls, DISCOVERY_DAILY_CALLS) is spent. Use --deep to run one anyway.`);
        redis.disconnect();
        break;
      }
      if (r.busy) {
        console.log('A discovery round is already running (the worker starts one every 15 minutes until ten smart wallets are found). It finishes on its own: check `wallets list` in a few minutes.');
        redis.disconnect();
        break;
      }
      console.log(`${r.sampled} trending token(s) sampled, ${r.evaluated} wallet(s) checked, ${r.promoted.length} new smart wallet(s).`);
      for (const a of r.promoted) await redis.publish(WALLETS_CHANNEL, a).catch(() => 0);
      redis.disconnect();
      break;
    }
    default:
      console.log('Usage: wallets add|feature|unfeature|remove <address> [--label "Name"] [--featured] | wallets import <file> [--featured] | wallets list | wallets discover [--deep]');
      process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
