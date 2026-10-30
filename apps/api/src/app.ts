/**
 * The Oxbow API: the smart-wallet feed, wallet and token pages, token search,
 * and copy-trade swaps. Reads come from Postgres (filled by the tracker
 * worker) and Jupiter, cached in Redis; every input is validated with the
 * shared zod schemas. Rate limits are kept in Redis so they hold across
 * processes. Requests from this machine (the web server rendering pages) are
 * not limited; nginx in front sets the client IP.
 */
import Fastify, { type FastifyBaseLogger } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Redis } from 'ioredis';
import { z, ZodError } from 'zod';
import {
  AddressSchema,
  AddWalletBodySchema,
  FeedQuerySchema,
  SendTxBodySchema,
  SignatureSchema,
  SOL_MINT,
  type FeedTrade,
  type HealthState,
  type Status,
  type TokenSearchResult,
  type TxStatus,
} from '@oxbow/shared';
import type { PrismaClient } from '@oxbow/db';
import { fetchJsonSafely } from '@oxbow/solana/safe-fetch';
import type { AccountReader } from '@oxbow/solana/token';
import { PublicKey, SystemProgram, VersionedTransaction, type Connection } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Cache } from './cache';
import { HttpError, priv, pub, withTimeout } from './http';
import { TRACKER_HEARTBEAT_KEY, TRACKER_LIVE_KEY, TradeHub, WALLETS_CHANNEL } from './hub';
import type { Jupiter } from './jupiter';
import { registerLimitRoutes } from './limit';
import { registerSwapRoutes, type SwapConfig } from './swap';
import { Reader } from './tracker/read';
import type { TrackerRpc } from './tracker/rpc';
import { MarketTape, orderFlow } from './tracker/tape';
import { STALE, TokenBook } from './tracker/tokens';

/** The RPC calls the API makes (a web3.js Connection in production). */
export type ChainReader = AccountReader &
  Pick<
    Connection,
    | 'getSlot'
    | 'getLatestBlockhash'
    | 'getAddressLookupTable'
    | 'getSignatureStatuses'
    | 'sendRawTransaction'
    | 'getBalance'
    | 'getMinimumBalanceForRentExemption'
    | 'getParsedTokenAccountsByOwner'
  >;

export interface Deps {
  db: PrismaClient;
  redis: Redis | null;
  rpc: ChainReader;
  jupiter: Jupiter;
  /** Raw JSON-RPC reads (transactions as the node encodes them), for token order flow. */
  trackerRpc?: TrackerRpc;
  swap?: SwapConfig;
  /** Most wallets tracked at once; adding more is refused until some go quiet. */
  maxWallets?: number;
  ipfsGateway?: string;
  /** Metadata JSON fetcher for tokens Jupiter doesn't list (SSRF-safe by default). */
  fetchJson?: (url: string) => Promise<unknown | null>;
  now?: () => number;
  logger?: boolean | FastifyBaseLogger | Record<string, unknown>;
  /** Max open feed streams per IP. */
  streamsPerIp?: number;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_STREAMS = 5000;
const HEARTBEAT_MS = 20_000;
const RPC_TIMEOUT_MS = 5000;
/** A token's order flow is read from the chain again when older than this. */
const FLOW_FRESH_MS = 15_000;
/** Newest signatures read per order-flow refresh. */
const FLOW_MAX_NEW = 25;
/** Seen within this long: a wallet's page visit doesn't need to be written down again. */
const TOUCH_MS = 3_600_000;

const Address = z.object({ address: AddressSchema });
const Mint = z.object({ mint: AddressSchema });

export async function buildApp(deps: Deps) {
  const now = deps.now ?? Date.now;
  const cache = new Cache(deps.redis);
  const hub = new TradeHub(deps.redis);
  const fetchJson = deps.fetchJson ?? ((u: string) => fetchJsonSafely(u));
  const tokens = new TokenBook(deps.db, deps.jupiter, { chain: deps.rpc, fetchJson, ipfsGateway: deps.ipfsGateway, now });
  const reader = new Reader(deps.db, tokens, now);
  const tape = deps.trackerRpc ? new MarketTape({ rpc: deps.trackerRpc, tokens, redis: deps.redis, now }) : null;
  const streamsPerIp = deps.streamsPerIp ?? 4;
  const maxWallets = deps.maxWallets ?? 1000;
  const openStreams = new Map<string, number>();

  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: 16 * 1024,
    // Only nginx on this machine may set the client address.
    trustProxy: [...LOOPBACK],
  });

  await app.register(rateLimit, {
    global: true,
    max: 90,
    timeWindow: '1 minute',
    redis: deps.redis ?? undefined,
    nameSpace: 'oxbow:rl:',
    skipOnError: true,
    allowList: (req) => LOOPBACK.has(req.ip),
    errorResponseBuilder: (_req, ctx) => ({ statusCode: ctx.statusCode, error: 'rate_limited', retryAfterSec: Math.ceil(ctx.ttl / 1000) }),
  });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: 'bad_request' });
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, ...err.extra });
    const e = err as { statusCode?: number; error?: string };
    if (e.statusCode === 429) return reply.code(429).send({ error: 'rate_limited' });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500) return reply.code(e.statusCode).send({ error: 'bad_request' });
    app.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' }));

  app.addHook('onClose', async () => {
    await hub.close();
  });

  // ------------------------------------------------------------ health

  const health = async () => ({ ok: true });
  app.get('/health', { config: { rateLimit: false } }, health);
  app.get('/api/health', { config: { rateLimit: false } }, health);

  // ------------------------------------------------------------ feed

  app.get('/api/feed', async (req, reply) => {
    const q = FeedQuerySchema.parse(req.query);
    if (q.wallets) {
      // Someone follows these: keep them tracked (wallets nobody looks at go quiet after a while).
      await deps.db.trackedWallet
        .updateMany({ where: { address: { in: q.wallets }, lastViewedAt: { lt: new Date(now() - TOUCH_MS) } }, data: { lastViewedAt: new Date(now()), active: true } })
        .catch(() => {});
      priv(reply);
      return reader.feed(q);
    }
    pub(reply, 5);
    return cache.wrap(`feed:v1:${JSON.stringify(q)}`, 5, () => reader.feed(q));
  });

  app.get('/api/feed/stream', async (req, reply) => {
    const ip = req.ip;
    const mine = openStreams.get(ip) ?? 0;
    if (hub.size >= MAX_STREAMS || mine >= streamsPerIp) return reply.code(429).send({ error: 'too_many_streams' });
    openStreams.set(ip, mine + 1);

    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // nginx: pass events through as they come.
      'x-accel-buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    const send = (t: FeedTrade) => res.write(`event: trade\ndata: ${JSON.stringify(t)}\n\n`);
    const stop = hub.listen(send);
    const beat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    beat.unref();
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(beat);
      stop();
      const left = (openStreams.get(ip) ?? 1) - 1;
      if (left > 0) openStreams.set(ip, left);
      else openStreams.delete(ip);
    };
    req.raw.on('close', close);
    res.on('close', close);
    res.on('error', close);
  });

  // ------------------------------------------------------------ wallets

  app.get('/api/wallets', async (_req, reply) => {
    pub(reply, 30);
    return cache.wrap('wallets:v1', 60, () => reader.wallets());
  });

  /** The wallet's token balances on chain (both token programs), so holdings never show what it no longer has. */
  async function balances(owner: string): Promise<Map<string, number> | null> {
    try {
      const rows = await cache.wrap(`held:v1:${owner}`, 60, async () => {
        const key = new PublicKey(owner);
        const lists = await Promise.all(
          [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) => withTimeout(deps.rpc.getParsedTokenAccountsByOwner(key, { programId }), RPC_TIMEOUT_MS)),
        );
        const out: [string, number][] = [];
        for (const l of lists)
          for (const a of l.value) {
            const info = (a.account.data.parsed as { info?: { mint?: string; tokenAmount?: { uiAmount?: number | null } } }).info;
            if (info?.mint) out.push([info.mint, Number(info.tokenAmount?.uiAmount ?? 0)]);
          }
        return out;
      });
      const m = new Map<string, number>();
      for (const [mint, amt] of rows) m.set(mint, (m.get(mint) ?? 0) + amt);
      return m;
    } catch {
      return null;
    }
  }

  app.get('/api/wallets/:address', async (req, reply) => {
    const { address } = Address.parse(req.params);
    const detail = await cache.wrap(`wallet:v1:${address}`, 20, async () => reader.wallet(address, await balances(address)));
    if (!detail) throw new HttpError(404, 'not_tracked');
    await deps.db.trackedWallet
      .updateMany({ where: { address, lastViewedAt: { lt: new Date(now() - TOUCH_MS) } }, data: { lastViewedAt: new Date(now()), active: true } })
      .catch(() => {});
    // Still reading its history: ask again soon.
    pub(reply, detail.backfilledAt ? 15 : 3);
    return detail;
  });

  app.get('/api/wallets/:address/trades', async (req, reply) => {
    const { address } = Address.parse(req.params);
    const q = FeedQuerySchema.omit({ wallets: true }).parse(req.query);
    pub(reply, 5);
    return reader.feed({ ...q, wallets: [address] });
  });

  // Each new wallet costs a history read (about a hundred RPC calls).
  app.post('/api/wallets', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const { address } = AddWalletBodySchema.parse(req.body);
    priv(reply);
    const existing = await deps.db.trackedWallet.findUnique({ where: { address }, select: { active: true } });
    if (existing) {
      if (!existing.active) {
        await assertRoom();
        await deps.db.trackedWallet.update({ where: { address }, data: { active: true, lastViewedAt: new Date(now()) } });
        await deps.redis?.publish(WALLETS_CHANNEL, address).catch(() => 0);
      }
      return { address, created: false };
    }
    await assertRoom();
    let acct;
    try {
      acct = await withTimeout(deps.rpc.getAccountInfo(new PublicKey(address)), RPC_TIMEOUT_MS);
    } catch {
      throw new HttpError(502, 'rpc_unavailable');
    }
    // Wallets are plain system accounts; token accounts, mints and programs never sign trades.
    if (!acct) throw new HttpError(400, 'no_activity');
    if (!acct.owner.equals(SystemProgram.programId)) throw new HttpError(400, 'not_a_wallet');
    await deps.db.trackedWallet.upsert({ where: { address }, create: { address }, update: { active: true } });
    await deps.redis?.publish(WALLETS_CHANNEL, address).catch(() => 0);
    await cache.drop('wallets:v1');
    return reply.code(201).send({ address, created: true });
  });

  async function assertRoom() {
    const count = await deps.db.trackedWallet.count({ where: { active: true } });
    if (count >= maxWallets) throw new HttpError(503, 'tracker_full');
  }

  // ------------------------------------------------------------ tokens

  app.get('/api/tokens/hot', async (_req, reply) => {
    pub(reply, 30);
    return cache.wrap('hot:v1', 30, () => reader.hot());
  });

  // Search by name, ticker or CA. Typing fires it, so it gets a higher limit than other reads.
  app.get('/api/tokens/search', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { q } = z.object({ q: z.string().trim().min(2).max(60) }).parse(req.query);
    let results: TokenSearchResult[];
    try {
      results = await cache.wrap(`search:v2:${q.toLowerCase()}`, 300, async () => {
        const found = await deps.jupiter.search(q);
        const list = found.map((t) => ({ mint: t.mint, symbol: t.symbol, name: t.name, logoUri: t.logoUri, verified: t.verified }));
        // Jupiter's own ranking within each group.
        return [...list.filter((r) => r.verified), ...list.filter((r) => !r.verified)];
      });
    } catch {
      throw new HttpError(502, 'search_unavailable');
    }
    pub(reply, 120);
    return results.slice(0, 8);
  });

  // Reading fills costs RPC calls: a shared tape per mint, refreshed at most every 15 s.
  app.get('/api/tokens/:mint/flow', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { mint } = Mint.parse(req.params);
    if (!tape) throw new HttpError(503, 'flow_unavailable');
    const stale = now() - (await tape.refreshedAt(mint)) > FLOW_FRESH_MS;
    const fills = stale ? await tape.refresh(mint, FLOW_MAX_NEW).catch(() => tape.read(mint)) : await tape.read(mint);
    const shown = fills.slice(0, 100);
    const traders = [...new Set(shown.map((f) => f.trader))];
    const tracked = new Set(
      traders.length ? (await deps.db.trackedWallet.findMany({ where: { address: { in: traders }, active: true }, select: { address: true } })).map((w) => w.address) : [],
    );
    const meta = (await tokens.get([mint], STALE.list)).get(mint);
    pub(reply, 5);
    return orderFlow(
      mint,
      shown.map(({ slot: _slot, ...f }) => ({ ...f, tracked: tracked.has(f.trader) })),
      meta?.usdPrice ?? null,
      now(),
    );
  });

  app.get('/api/tokens/:mint', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { mint } = Mint.parse(req.params);
    const detail = await cache.wrap(`token:v2:${mint}`, (v) => (v ? 30 : 60), () => reader.token(mint));
    if (!detail) throw new HttpError(404, 'not_found');
    pub(reply, 20);
    return detail;
  });

  // ------------------------------------------------------------ swaps

  registerLimitRoutes(app, deps.jupiter);

  const swaps = registerSwapRoutes(app, { jup: deps.jupiter, rpc: deps.rpc, config: deps.swap ?? { feeBps: 0 }, now, log: (m) => app.log.warn(m) });

  app.post('/api/tx/send', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { transaction } = SendTxBodySchema.parse(req.body);
    priv(reply);
    let bytes: Buffer;
    try {
      bytes = Buffer.from(transaction, 'base64');
      VersionedTransaction.deserialize(bytes);
    } catch {
      throw new HttpError(400, 'bad_transaction');
    }
    try {
      const signature = await withTimeout(deps.rpc.sendRawTransaction(bytes, { skipPreflight: false, maxRetries: 3 }), 12_000);
      return { signature };
    } catch (e) {
      throw new HttpError(400, 'send_failed', { detail: (e as Error).message.slice(0, 200) });
    }
  });

  app.get('/api/tx/:signature', async (req, reply): Promise<TxStatus> => {
    const { signature } = z.object({ signature: SignatureSchema }).parse(req.params);
    priv(reply);
    const { value } = await withTimeout(deps.rpc.getSignatureStatuses([signature]), RPC_TIMEOUT_MS);
    const s = value[0];
    if (!s) return { status: 'pending' };
    if (s.err) return { status: 'failed' };
    return { status: s.confirmationStatus === 'processed' ? 'pending' : 'confirmed' };
  });

  app.get('/api/wallet/:address/balances', async (req, reply) => {
    const { address } = Address.parse(req.params);
    const { mints } = z
      .object({
        mints: z
          .string()
          .max(10 * 45)
          .transform((v) => [...new Set(v.split(',').filter(Boolean))])
          .pipe(z.array(AddressSchema).min(1).max(10)),
      })
      .parse(req.query);
    priv(reply);
    const owner = new PublicKey(address);
    const out: Record<string, number> = {};
    await Promise.all(
      mints.map(async (mint) => {
        if (mint === SOL_MINT) {
          out[mint] = (await withTimeout(deps.rpc.getBalance(owner), RPC_TIMEOUT_MS)) / 1e9;
          return;
        }
        const res = await withTimeout(deps.rpc.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) }), RPC_TIMEOUT_MS);
        out[mint] = res.value.reduce((s, a) => s + Number((a.account.data.parsed as { info?: { tokenAmount?: { uiAmount?: number } } }).info?.tokenAmount?.uiAmount ?? 0), 0);
      }),
    );
    return out;
  });

  // ------------------------------------------------------------ status

  app.get('/api/status', async (_req, reply) => {
    priv(reply);
    return cache.wrap('status:v2', 15, async (): Promise<Status> => {
      const checkedAt = new Date(now()).toISOString();
      let dbOk = true;
      try {
        await deps.db.$queryRaw`SELECT 1`;
      } catch {
        dbOk = false;
      }
      let redisOk = !!deps.redis;
      try {
        if (deps.redis) await withTimeout(deps.redis.ping(), 1000);
      } catch {
        redisOk = false;
      }

      let rpc: Status['rpc'] = { state: 'DOWN', slot: null, latencyMs: null };
      const t0 = performance.now();
      try {
        const slot = await withTimeout(deps.rpc.getSlot(), RPC_TIMEOUT_MS);
        const latencyMs = Math.round(performance.now() - t0);
        rpc = { state: latencyMs > 2000 ? 'DEGRADED' : 'OK', slot, latencyMs };
      } catch {
        // stays DOWN
      }

      const [beat, live] = deps.redis ? await Promise.all([deps.redis.get(TRACKER_HEARTBEAT_KEY), deps.redis.get(TRACKER_LIVE_KEY)]).catch(() => [null, null]) : [null, null];
      const lagSec = beat ? Math.max(0, Math.round((now() - Number(beat)) / 1000)) : null;
      const wallets = dbOk ? await deps.db.trackedWallet.count({ where: { active: true } }) : 0;
      const last = dbOk ? await deps.db.walletTrade.findFirst({ orderBy: { ts: 'desc' }, select: { ts: true } }) : null;
      const trackerState: HealthState = lagSec === null || lagSec > 300 ? 'DOWN' : lagSec > 90 || live !== '1' ? 'DEGRADED' : 'OK';

      let swapState: HealthState = 'OK';
      try {
        await withTimeout(deps.jupiter.tokens([SOL_MINT]), 4000);
      } catch {
        swapState = 'DOWN';
      }
      if (swapState === 'OK' && deps.swap?.treasury && (await swaps.feeBps()) === 0) swapState = 'DEGRADED';

      return {
        checkedAt,
        api: dbOk && redisOk ? 'OK' : dbOk ? 'DEGRADED' : 'DOWN',
        rpc,
        tracker: { state: trackerState, lagSec, wallets, live: live === '1' },
        lastTradeAt: last?.ts.toISOString() ?? null,
        swaps: swapState,
      };
    });
  });

  return { app, hub, cache, tokens, reader, tape };
}
