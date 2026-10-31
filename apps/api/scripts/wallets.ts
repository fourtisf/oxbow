/**
 * Manage tracked wallets from the server:
 *
 *   pnpm --filter @oxbow/api wallets add <address> [--label "Name"] [--featured]
 *   pnpm --filter @oxbow/api wallets feature <address> [--label "Name"]
 *   pnpm --filter @oxbow/api wallets unfeature <address>
 *   pnpm --filter @oxbow/api wallets remove <address>      (stops tracking; trades are kept)
 *   pnpm --filter @oxbow/api wallets import <file>          (checks each wallet like discovery does; tracks the ones that pass)
 *   pnpm --filter @oxbow/api wallets import <file> --trust  (tracks every wallet in it unchecked; --featured to feature them)
 *   pnpm --filter @oxbow/api wallets list
 *   pnpm --filter @oxbow/api wallets discover               (one smart-money discovery round now)
 *   pnpm --filter @oxbow/api wallets discover --deep [--minutes 20]  (big rounds back to back, to fill the feed fast)
 *
 * The import file can be anything with full wallet addresses in it: a list (one per line,
 * optionally followed by a name), a CSV, or a leaderboard page copied from GMGN, Kolscan,
 * FOMO or pump.fun.
 *
 * Featured wallets are the ones you pick: they carry a public label, are
 * always tracked, and lead the leaderboard. Use only addresses you have
 * checked yourself.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import { Redis } from 'ioredis';
import { createDb } from '@oxbow/db';
import { AddressSchema } from '@oxbow/shared';
import { loadConfig } from '../src/config';
import { loadEnvFile } from '../src/env-file';
import { tradePublisher, WALLETS_CHANNEL } from '../src/hub';
import { jupiterClient } from '../src/jupiter';
import { Discovery, type DiscoveryConfig } from '../src/tracker/discovery';
import { Ingestor } from '../src/tracker/ingest';
import { jsonRpc } from '../src/tracker/rpc';
import { MarketTape } from '../src/tracker/tape';
import { TokenBook } from '../src/tracker/tokens';
import { extractWallets } from '../src/tracker/wallet-list';

loadEnvFile();
const config = loadConfig();
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    label: { type: 'string' },
    featured: { type: 'boolean', default: false },
    deep: { type: 'boolean', default: false },
    trust: { type: 'boolean', default: false },
    minutes: { type: 'string' },
  },
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

/** Discovery wired up like the worker's, with `overrides` on top of the configured settings. */
function makeDiscovery(redis: Redis, overrides: Partial<DiscoveryConfig> = {}) {
  const jup = jupiterClient(config.JUPITER_API_BASE, { apiKey: config.JUPITER_API_KEY });
  const rpc = jsonRpc(config.RPC_URL, { rps: config.RPC_RPS });
  const log = (m: string) => console.log(m);
  const tokens = new TokenBook(db, jup, { log });
  const ingestor = new Ingestor({ db, rpc, tokens, publish: tradePublisher(redis), log });
  return new Discovery({
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
      ...overrides,
    },
  });
}

function readList(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    console.error(
      code === 'ENOENT'
        ? `No file at ${path}. Create it first (e.g. nano ${path}) and paste full wallet addresses into it: a list, a CSV, or a leaderboard page copied from GMGN, Kolscan, FOMO...`
        : `Can't read ${path}: ${(e as Error).message}`,
    );
    process.exit(1);
  }
}

const usd = (n: number) => `${n < 0 ? '-' : '+'}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

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
        console.error('Give a file with wallet addresses in it: a list, a CSV, or a leaderboard page copied from GMGN, Kolscan, FOMO...');
        process.exit(1);
      }
      const listed = extractWallets(readList(rawAddress));
      if (!listed.length) {
        console.error(`No full wallet addresses found in ${rawAddress}. Copy the whole address (GMGN, Kolscan and FOMO have a copy button next to each), not the shortened "5w4A…2Du9" form.`);
        process.exit(1);
      }
      const existing = new Map((await db.trackedWallet.findMany({ where: { address: { in: listed.map((w) => w.address) } } })).map((w) => [w.address, w]));
      const trusted = values.trust || values.featured;
      if (trusted) {
        // Only plain wallets: token accounts, mints and programs never sign trades.
        const conn = new Connection(config.RPC_URL, 'confirmed');
        let added = 0;
        let skipped = 0;
        for (let i = 0; i < listed.length; i += 100) {
          const batch = listed.slice(i, i + 100);
          const infos = await conn.getMultipleAccountsInfo(batch.map((w) => new PublicKey(w.address)));
          for (const [j, w] of batch.entries()) {
            if (!infos[j]?.owner.equals(SystemProgram.programId)) {
              console.warn(`skipped ${w.address}: not a wallet (or never used)`);
              skipped++;
              continue;
            }
            await db.trackedWallet.upsert({
              where: { address: w.address },
              create: { address: w.address, label: w.label ?? null, featured: values.featured, source: 'owner' },
              update: { active: true, source: 'owner', ...(w.label ? { label: w.label } : {}), ...(values.featured ? { featured: true } : {}) },
            });
            await notify(w.address);
            added++;
          }
        }
        console.log(`${added} wallet(s) tracked${values.featured ? ' as featured' : ''}, ${skipped} skipped. Their recent trades load within a few minutes.`);
        break;
      }
      // Checked: each wallet's own recent history, judged like discovery judges its finds.
      const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 });
      redis.on('error', () => {});
      const discovery = makeDiscovery(redis);
      console.log(`${listed.length} wallet(s) found in ${rawAddress}. Checking each one's last ${config.DISCOVERY_HISTORY_TXS} transactions (bots, losers and idle wallets are left out)...`);
      const passed: string[] = [];
      const reasons = new Map<string, number>();
      for (const [i, w] of listed.entries()) {
        const n = `[${i + 1}/${listed.length}] ${w.address}`;
        const had = existing.get(w.address);
        if (had?.active) {
          console.log(`${n}  already tracked`);
          continue;
        }
        const ev = await discovery.evaluate(w.address);
        if (!ev.verdict.ok) {
          const s = ev.verdict.summary;
          reasons.set(ev.verdict.reason, (reasons.get(ev.verdict.reason) ?? 0) + 1);
          console.log(`${n}  no: ${ev.verdict.reason}${s ? ` (${usd(s.realizedPnlUsd)}, ${s.wins}/${s.wins + s.losses} won)` : ''}`);
          continue;
        }
        await discovery.promote(w.address, ev);
        if (w.label) await db.trackedWallet.update({ where: { address: w.address }, data: { label: w.label } });
        await redis.publish(WALLETS_CHANNEL, w.address).catch(() => 0);
        passed.push(w.address);
        const s = ev.verdict.summary;
        console.log(`${n}  SMART (${ev.verdict.kind}): ${usd(s.realizedPnlUsd)} realized, ${s.wins}/${s.wins + s.losses} closed in profit`);
      }
      redis.disconnect();
      const why = [...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([r, k]) => `${r} ${k}`).join(', ');
      console.log(`${passed.length} new smart wallet(s) tracked.${why ? ` Left out: ${why}.` : ''} To track the rest anyway: add --trust.`);
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
      // Deep: much bigger samples, every lead checked, no daily budget, rounds back to back.
      const discovery = makeDiscovery(
        redis,
        values.deep ? { winnersPerRun: 20, coBuyerSample: 100, routerSample: 1000, pumpSample: 500, tokens: 8, samplePerToken: 60, evalsPerRun: 150, bootstrapBelow: 0, dailyCalls: 0 } : {},
      );
      const minutes = Math.max(1, Number(values.minutes ?? 20) || 20);
      const until = Date.now() + minutes * 60_000;
      if (values.deep) console.log(`Deep discovery for up to ${minutes} minutes (stops early at DISCOVERY_MAX=${config.DISCOVERY_MAX} smart wallets). Ctrl+C stops it safely.`);
      let total = 0;
      let rounds = 0;
      for (;;) {
        const r = await discovery.run();
        if (r.busy) {
          if (!values.deep || Date.now() > until) {
            console.log('A discovery round is already running (the worker starts one every 15 minutes). It finishes on its own: check `wallets list` in a few minutes.');
            break;
          }
          console.log('The worker is running a round; waiting for it...');
          await new Promise((res) => setTimeout(res, 30_000));
          continue;
        }
        if (r.budget && !r.evaluated) {
          console.log(`Discovery's budget for now (DISCOVERY_DAILY_CALLS=${config.DISCOVERY_DAILY_CALLS} RPC credits a day, spread over the day) is spent. Use --deep to run anyway.`);
          break;
        }
        rounds++;
        total += r.promoted.length;
        for (const a of r.promoted) await redis.publish(WALLETS_CHANNEL, a).catch(() => 0);
        console.log(`Round ${rounds}: ${r.sampled} trending token(s) sampled, ${r.evaluated} wallet(s) checked, ${r.promoted.length} new smart wallet(s).`);
        const found = await db.trackedWallet.count({ where: { source: 'discovered', active: true } });
        if (!values.deep || Date.now() > until || found >= config.DISCOVERY_MAX || r.evaluated === 0) {
          if (values.deep) console.log(`Done: ${total} new in ${rounds} round(s); ${found} discovered smart wallet(s) tracked in all.`);
          break;
        }
      }
      redis.disconnect();
      break;
    }
    default:
      console.log('Usage: wallets add|feature|unfeature|remove <address> [--label "Name"] [--featured] | wallets import <file> [--trust] [--featured] | wallets list | wallets discover [--deep] [--minutes 20]');
      process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}
