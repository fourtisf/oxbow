/**
 * Tracker worker (PM2 process `oxbow-worker`): follows every active tracked
 * wallet on chain and stores its buys and sells.
 *
 * - Live: one websocket log subscription per wallet; each new transaction is
 *   read within seconds and published on the feed.
 * - Catch-up: every TRACKER_RESYNC_SEC each wallet's signatures since its
 *   bookmark are read, covering anything the websocket missed (restarts,
 *   dropped connections). New wallets get their history read the same way.
 * - Discovery: every DISCOVERY_EVERY_MIN (every 15 minutes while fewer than
 *   ten are found), traders of the tokens trading most
 *   right now are checked and the profitable ones tracked as smart money
 *   (tracker/discovery.ts); once a day, discovered wallets that stopped
 *   earning are dropped.
 * - Upkeep: token data refreshed for what was traded today, and wallets nobody
 *   has followed or opened for WALLET_IDLE_DAYS stop being tracked.
 */
import { Redis } from 'ioredis';
import { Connection, PublicKey } from '@solana/web3.js';
import { createDb } from '@oxbow/db';
import { fetchJsonSafely } from '@oxbow/solana/safe-fetch';
import { loadConfig } from './config';
import { loadEnvFile } from './env-file';
import { TRACKER_HEARTBEAT_KEY, TRACKER_LIVE_KEY, tradePublisher, WALLETS_CHANNEL } from './hub';
import { jupiterClient } from './jupiter';
import { Discovery } from './tracker/discovery';
import { Ingestor, type WalletRef } from './tracker/ingest';
import { jsonRpc } from './tracker/rpc';
import { MarketTape } from './tracker/tape';
import { STALE, TokenBook } from './tracker/tokens';

loadEnvFile();
const config = loadConfig();
const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const db = createDb(config.DATABASE_URL);
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
redis.on('error', () => {});
const sub = redis.duplicate();
sub.on('error', () => {});

const conn = new Connection(config.RPC_URL, { commitment: 'confirmed', wsEndpoint: config.RPC_WS_URL });
const jup = jupiterClient(config.JUPITER_API_BASE, { apiKey: config.JUPITER_API_KEY });
const rpc = jsonRpc(config.RPC_URL);
const tokens = new TokenBook(db, jup, { chain: conn, fetchJson: (u) => fetchJsonSafely(u), ipfsGateway: config.IPFS_GATEWAY, log });
const ingestor = new Ingestor({ db, rpc, tokens, publish: tradePublisher(redis), log, backfillLimit: config.BACKFILL_LIMIT });
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
  },
});

/** A bounded set of signatures (oldest dropped first). */
class SeenSet {
  private readonly items = new Set<string>();
  constructor(private readonly max: number) {}
  has = (s: string) => this.items.has(s);
  add(s: string) {
    this.items.add(s);
    if (this.items.size > this.max) this.items.delete(this.items.values().next().value!);
  }
  delete = (s: string) => this.items.delete(s);
}

/** Signatures the websocket path stored: catch-up rounds skip only these, never ones still being read. */
const done = new SeenSet(50_000);
/** Signatures the websocket path is reading right now (a log can arrive twice). */
const reading = new Set<string>();
const subs = new Map<string, number>();
const wallets = new Map<string, WalletRef>();
const LIVE_RETRY_MS = [2_000, 6_000, 20_000];
let stopping = false;

/** At most `n` jobs at a time, in arrival order. */
function limiter(n: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(job: () => Promise<T>): Promise<T> => {
    if (active >= n) await new Promise<void>((r) => waiting.push(r));
    active++;
    try {
      return await job();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
const liveQueue = limiter(4);
const catchUpQueue = limiter(2);
const catchingUp = new Set<string>();

async function readLive(address: string, signature: string) {
  if (done.has(signature) || reading.has(signature)) return;
  reading.add(signature);
  try {
    for (let attempt = 0; ; attempt++) {
      const w = wallets.get(address);
      if (!w || stopping) return;
      try {
        const rows = await ingestor.ingest(w, signature, { publish: w.backfilledAt !== null });
        done.add(signature);
        if (rows.length) log(`${address.slice(0, 6)}… ${rows.map((r) => r.side).join('+')} ${signature.slice(0, 8)}…`);
        return;
      } catch (e) {
        // Fresh transactions can take a moment to be readable. If it never works, the next catch-up reads it.
        if (attempt >= LIVE_RETRY_MS.length) {
          log(`live read gave up on ${signature.slice(0, 8)}…: ${(e as Error).message}`);
          return;
        }
        await new Promise((r) => setTimeout(r, LIVE_RETRY_MS[attempt]));
      }
    }
  } finally {
    reading.delete(signature);
  }
}

function subscribe(address: string) {
  if (subs.has(address)) return;
  try {
    const id = conn.onLogs(
      new PublicKey(address),
      (logs) => {
        if (!logs.err) void liveQueue(() => readLive(address, logs.signature));
      },
      'confirmed',
    );
    subs.set(address, id);
  } catch (e) {
    log(`subscribe ${address.slice(0, 6)}… failed: ${(e as Error).message}`);
  }
}

function unsubscribe(address: string) {
  const id = subs.get(address);
  subs.delete(address);
  if (id !== undefined) conn.removeOnLogsListener(id).catch(() => {});
}

function catchUp(address: string) {
  if (catchingUp.has(address)) return Promise.resolve();
  catchingUp.add(address);
  return catchUpQueue(async () => {
    try {
      if (stopping) return;
      // Fresh bookmark from the database: live reads don't move it.
      const w = await db.trackedWallet.findUnique({ where: { address } });
      if (!w?.active) return;
      const stored = await ingestor.catchUp(w, done.has);
      wallets.set(address, (await db.trackedWallet.findUnique({ where: { address } })) ?? w);
      if (stored) log(`${address.slice(0, 6)}… caught up: ${stored} trade(s)`);
    } catch (e) {
      log(`catch-up ${address.slice(0, 6)}… failed: ${(e as Error).message}`);
    } finally {
      catchingUp.delete(address);
    }
  });
}

/** Matches subscriptions to the active wallets in the database; new ones get their history read. */
async function refreshWallets() {
  const rows = await db.trackedWallet.findMany({ where: { active: true } });
  const active = new Set(rows.map((r) => r.address));
  for (const r of rows) {
    const isNew = !wallets.has(r.address);
    wallets.set(r.address, r);
    subscribe(r.address);
    if (isNew && !r.backfilledAt) void catchUp(r.address);
  }
  for (const a of [...wallets.keys()]) {
    if (active.has(a)) continue;
    wallets.delete(a);
    unsubscribe(a);
  }
}

async function resync() {
  await refreshWallets();
  await Promise.all([...wallets.keys()].map((a) => catchUp(a)));
}

async function upkeep() {
  const idle = new Date(Date.now() - config.WALLET_IDLE_DAYS * 864e5);
  const { count } = await db.trackedWallet.updateMany({ where: { active: true, featured: false, source: { not: 'discovered' }, lastViewedAt: { lt: idle } }, data: { active: false } });
  if (count) log(`${count} idle wallet(s) no longer tracked`);
  const traded = await db.walletTrade.findMany({ where: { ts: { gt: new Date(Date.now() - 864e5) } }, distinct: ['mint'], select: { mint: true }, take: 500 });
  await tokens.get(
    traded.map((t) => t.mint),
    STALE.list,
  );
}

/** While fewer than this many smart wallets are tracked, discovery runs every 15 minutes to fill the feed. */
const BOOTSTRAP_BELOW = 10;
const BOOTSTRAP_EVERY_MS = 15 * 60_000;
let lastDiscovery = 0;

/** Checked every 15 minutes; runs a round when bootstrapping or when DISCOVERY_EVERY_MIN has passed. */
async function discoverTick() {
  const found = await db.trackedWallet.count({ where: { source: 'discovered', active: true } });
  if (found >= BOOTSTRAP_BELOW && Date.now() - lastDiscovery < config.DISCOVERY_EVERY_MIN * 60_000) return;
  lastDiscovery = Date.now();
  await discover();
}

async function discover() {
  const r = await discovery.run();
  log(`discovery: ${r.sampled} token(s) sampled, ${r.evaluated} wallet(s) checked, ${r.promoted.length} new`);
  if (r.promoted.length) await refreshWallets();
}

async function prune() {
  const n = await discovery.prune();
  if (n) {
    log(`${n} discovered wallet(s) stopped earning; no longer tracked`);
    await refreshWallets();
  }
}

const wsLive = () => (conn as unknown as { _rpcWebSocketConnected?: boolean })._rpcWebSocketConnected === true;

async function heartbeat() {
  await redis.set(TRACKER_HEARTBEAT_KEY, String(Date.now()), 'EX', 3600).catch(() => {});
  await redis.set(TRACKER_LIVE_KEY, wsLive() || subs.size === 0 ? '1' : '0', 'EX', 3600).catch(() => {});
}

function every(ms: number, fn: () => Promise<unknown>) {
  let running = false;
  const tick = async () => {
    if (running || stopping) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      log(`${fn.name || 'job'} failed: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, ms);
}

sub.on('message', (_ch, address: string) => {
  log(`new wallet ${address.slice(0, 6)}…`);
  void refreshWallets()
    .then(() => catchUp(address))
    .catch(() => {});
});
await sub.subscribe(WALLETS_CHANNEL);

const timers = [every(config.TRACKER_RESYNC_SEC * 1000, resync), every(15_000, heartbeat), every(3_600_000, upkeep), every(60_000, refreshWallets)];
if (config.DISCOVERY_ENABLED) timers.push(every(BOOTSTRAP_EVERY_MS, discoverTick), every(86_400_000, prune));
log(`tracker up: ${config.RPC_URL.replace(/api-key=[^&]+/, 'api-key=…')}`);

const shutdown = async () => {
  stopping = true;
  timers.forEach(clearInterval);
  for (const a of [...subs.keys()]) unsubscribe(a);
  await sub.quit().catch(() => {});
  redis.disconnect();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// A dropped connection somewhere (websocket, proxy, database) shouldn't take the tracker down;
// anything else is a bug, and PM2 restarts the process.
process.on('uncaughtException', (e: NodeJS.ErrnoException) => {
  log(`uncaught: ${e.code ?? ''} ${e.message}`);
  if (!['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN'].includes(e.code ?? '')) process.exit(1);
});
