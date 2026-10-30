/**
 * The Oxbow API (brief section 6). Every route reads from Postgres through
 * Market, caches in Redis, and validates its input with the shared zod
 * schemas. Rate limits: 60/min per IP for reads, 10/min for register, kept in
 * Redis so they hold across processes. Requests from this machine (the web
 * server rendering pages) are not limited; nginx in front sets the client IP.
 */
import Fastify, { type FastifyBaseLogger, type FastifyReply, type FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import type { Redis } from 'ioredis';
import { z, ZodError } from 'zod';
import {
  AddressSchema,
  PoolsQuerySchema,
  TimeframeSchema,
  TokenInfoSchema,
  type ActivityItem,
  type HealthState,
  type Status,
  type TokenInfo,
} from '@oxbow/shared';
import type { PrismaClient } from '@oxbow/db';
import { lookupToken, type AccountReader } from '@oxbow/solana/token';
import { fetchJsonSafely } from '@oxbow/solana/safe-fetch';
import { SOL_MINT, type Cluster } from '@oxbow/solana/rpc';
import { PublicKey, type Connection } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, unpackMint } from '@solana/spl-token';
import { ActivityHub } from './activity';
import { Cache } from './cache';
import { registerCreateRoutes, type CreateConfig } from './create';
import { HttpError, priv, pub, withTimeout } from './http';
import { Market } from './market';
import type { PopularSource } from './popular';
import type { PriceSource } from './prices';

/** The RPC calls the API makes (a web3.js Connection in production). */
export type ChainReader = AccountReader &
  Pick<
    Connection,
    | 'getSlot'
    | 'getSupply'
    | 'getMultipleAccountsInfo'
    | 'getLatestBlockhash'
    | 'getTransaction'
    | 'getSignatureStatuses'
    | 'sendRawTransaction'
    | 'simulateTransaction'
    | 'getBalance'
    | 'getTokenAccountBalance'
    | 'getParsedTokenAccountsByOwner'
  >;

export interface Deps {
  db: PrismaClient;
  redis: Redis | null;
  prices: PriceSource;
  rpc: ChainReader;
  cluster: Cluster;
  /** Pool creation settings; creation stays off without a treasury. */
  create?: CreateConfig;
  ipfsGateway?: string;
  /** Metadata JSON fetcher for token logos (SSRF-safe by default). */
  fetchJson?: (url: string) => Promise<unknown | null>;
  now?: () => number;
  logger?: boolean | FastifyBaseLogger | Record<string, unknown>;
  /** Max open activity streams per IP. */
  streamsPerIp?: number;
  /** Most-traded tokens for create step 1 (Jupiter in production). */
  popular?: PopularSource;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const MAX_STREAMS = 5000;
const HEARTBEAT_MS = 20_000;
const RPC_TIMEOUT_MS = 5000;

const Address = z.object({ address: AddressSchema });
const Mint = z.object({ mint: AddressSchema });
const ChartQuery = z.object({ tf: TimeframeSchema.default('1D') });

type TokenLookup = { status: 'found'; token: TokenInfo } | { status: 'not_found' | 'not_a_mint' } | { status: 'unreadable' };

export async function buildApp(deps: Deps) {
  const now = deps.now ?? Date.now;
  const cache = new Cache(deps.redis);
  const market = new Market(deps.db, deps.prices, cache, now);
  const hub = new ActivityHub(deps.redis);
  const fetchJson = deps.fetchJson ?? ((u: string) => fetchJsonSafely(u));
  const streamsPerIp = deps.streamsPerIp ?? 4;
  const openStreams = new Map<string, number>();

  const app = Fastify({
    logger: deps.logger ?? false,
    bodyLimit: 16 * 1024,
    // Only nginx on this machine may set the client address.
    trustProxy: [...LOOPBACK],
  });

  await app.register(rateLimit, {
    global: true,
    max: 60,
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

  // ------------------------------------------------------------ market

  app.get('/api/stats', async (_req, reply) => {
    pub(reply, 15);
    return cache.wrap('stats:v1', 20, () => market.stats());
  });

  app.get('/api/ticker', async (_req, reply) => {
    pub(reply, 15);
    return cache.wrap('ticker:v1', 20, () => market.ticker());
  });

  app.get('/api/movers', async (_req, reply) => {
    pub(reply, 15);
    return cache.wrap('movers:v1', 20, () => market.movers());
  });

  app.get('/api/pools', async (req, reply) => {
    const q = PoolsQuerySchema.parse(req.query);
    pub(reply, 10);
    return cache.wrap(`pools:v1:${JSON.stringify(q)}`, 15, () => market.pools(q));
  });

  app.get('/api/pools/:address', async (req, reply) => {
    const { address } = Address.parse(req.params);
    const pool = await cache.wrap(`pool:v1:${address}`, 15, () => market.pool(address));
    if (!pool) throw new HttpError(404, 'not_found');
    pub(reply, 10);
    return pool;
  });

  app.get('/api/pools/:address/chart', async (req, reply) => {
    const { address } = Address.parse(req.params);
    const { tf } = ChartQuery.parse(req.query);
    pub(reply, 30);
    return cache.wrap(`chart:v1:${address}:${tf}`, tf === '1H' ? 30 : 60, () => market.chart(address, tf));
  });

  app.get('/api/pools/:address/trades', async (req, reply) => {
    const { address } = Address.parse(req.params);
    pub(reply, 5);
    return cache.wrap(`trades:v1:${address}`, 10, () => market.trades(address));
  });

  app.get('/api/stocks', async (_req, reply) => {
    pub(reply, 30);
    return cache.wrap('stocks:v1', 30, () => market.stocks());
  });

  app.get('/api/quotes', async (_req, reply) => {
    pub(reply, 30);
    return market.quotes();
  });

  // ------------------------------------------------------------ tokens

  /** Jupiter's most-traded verified tokens, cached half an hour (two minutes when the list came back empty). */
  const popularList = () => (deps.popular ? cache.wrap('popular:v2', (v: unknown[]) => (v.length ? 1800 : 120), () => solanaNative(deps.popular!)) : Promise.resolve([]));

  /**
   * Keeps tokens that are Solana's own: a classic SPL mint whose mint and freeze authorities are
   * revoked. That drops bridged coins (their bridge keeps minting), tokenized stocks (the issuer
   * mints, often on Token-2022) and anything that can still be frozen. One RPC call for the lot.
   */
  async function solanaNative(source: PopularSource) {
    const list = await source();
    if (!list.length) return [];
    try {
      const infos = await withTimeout(deps.rpc.getMultipleAccountsInfo(list.map((p) => new PublicKey(p.mint))), RPC_TIMEOUT_MS);
      return list.filter((p, i) => {
        const a = infos[i];
        if (!a || !a.owner.equals(TOKEN_PROGRAM_ID)) return false;
        try {
          const m = unpackMint(new PublicKey(p.mint), a, TOKEN_PROGRAM_ID);
          return !m.mintAuthority && !m.freezeAuthority;
        } catch {
          return false;
        }
      });
    } catch {
      return [];
    }
  }

  async function token(req: FastifyRequest, reply: FastifyReply) {
    const { mint } = Mint.parse(req.params);
    const found = await cache.wrap<TokenLookup>(
      `token:v1:${mint}`,
      (v) => (v.status === 'found' ? 600 : 60),
      async () => {
        let r: Awaited<ReturnType<typeof lookupToken>>;
        try {
          r = await withTimeout(lookupToken(deps.rpc, mint, { fetchJson, ipfsGateway: deps.ipfsGateway }), 12_000);
        } catch {
          // RPC down: not cached, so the next request asks again.
          throw new HttpError(502, 'rpc_unavailable');
        }
        if (r.status !== 'found') return { status: r.status };
        const parsed = TokenInfoSchema.safeParse(r.token);
        return parsed.success ? { status: 'found', token: parsed.data } : { status: 'unreadable' };
      },
    );
    if (found.status === 'unreadable') throw new HttpError(502, 'unreadable_metadata');
    if (found.status !== 'found') {
      reply.header('cache-control', 'public, max-age=60');
      return reply.code(404).send({ error: found.status });
    }
    const [listed, book] = await Promise.all([deps.db.token.findUnique({ where: { mint }, select: { mintCreatedAt: true } }), market.quoteBook()]);
    const isSol = mint === SOL_MINT;
    let supply = found.token.supply;
    if (isSol) {
      try {
        supply = await cache.wrap('sol-supply:v1', 3600, async () => {
          // Slow on some providers (it totals the non-circulating accounts), hence the longer wait.
          const s = await withTimeout(deps.rpc.getSupply({ excludeNonCirculatingAccountsList: true }), 15_000);
          return s.value.circulating / 1e9;
        });
      } catch (e) {
        // Keep the mint account's figure, and say why.
        req.log.warn(`SOL supply unavailable: ${(e as Error).message}`);
      }
    }
    pub(reply, 120);
    return {
      ...found.token,
      supply,
      // When the token's metadata has no image: the pair asset's or verified stock's own logo, then the
      // project logo Jupiter lists for it, then SOL's for wrapped SOL (whose metadata has none).
      logoUri:
        found.token.logoUri ?? book.assets[mint]?.logoUri ?? (await popularList()).find((p) => p.mint === mint)?.logoUri ?? (isSol ? '/tokens/sol.svg' : null),
      symbolTaken: await market.symbolTaken(found.token.symbol, mint),
      createdAt: listed?.mintCreatedAt?.toISOString() ?? found.token.createdAt,
    } satisfies TokenInfo;
  }
  // Each lookup costs RPC calls and a metadata fetch.
  const tokenOpts = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  // "Popular on Solana" quick picks, minus the pair assets themselves.
  app.get('/api/tokens/popular', async (_req, reply) => {
    const list = await popularList();
    const book = await market.quoteBook();
    pub(reply, 300);
    return list.filter((p) => !book.assets[p.mint]).slice(0, 8);
  });
  app.get('/api/tokens/:mint', tokenOpts, token);
  // The web app's sample-data mode calls the old path.
  app.get('/api/token/:mint', tokenOpts, token);

  // ------------------------------------------------------------ wallet

  app.get('/api/wallet/:address/positions', async (req, reply) => {
    Address.parse(req.params);
    priv(reply);
    // Read live from the pool programs once pools can be created (M3/M4).
    return [];
  });

  app.get('/api/wallet/:address/activity', async (req, reply) => {
    const { address } = Address.parse(req.params);
    priv(reply);
    return market.walletActivity(address);
  });

  // ------------------------------------------------------------ register

  registerCreateRoutes(app, { db: deps.db, rpc: deps.rpc, cluster: deps.cluster, cache, market, hub, now, config: deps.create, fetchJson, ipfsGateway: deps.ipfsGateway });

  // ------------------------------------------------------------ activity

  app.get('/api/activity/recent', async (_req, reply) => {
    pub(reply, 5);
    return cache.wrap('activity:v1', 5, () => market.recentActivity(20));
  });

  app.get('/api/activity/stream', async (req, reply) => {
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
    const send = (item: ActivityItem) => res.write(`event: activity\ndata: ${JSON.stringify(item)}\n\n`);
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

  // ------------------------------------------------------------ status

  app.get('/api/status', async (_req, reply) => {
    priv(reply);
    return cache.wrap('status:v1', 15, async (): Promise<Status> => {
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

      let prices: Status['prices'] = { state: 'DOWN', updatedAt: null };
      let indexer: Status['indexer'] = { state: 'DOWN', lagSec: null };
      if (dbOk) {
        const quotes = await market.quotes();
        const priced = quotes.filter((q) => Date.parse(q.priceUpdatedAt) > 0);
        const newest = Math.max(0, ...priced.map((q) => Date.parse(q.priceUpdatedAt)));
        const state: HealthState = !quotes.length || !priced.length ? 'DOWN' : priced.length < quotes.length ? 'DEGRADED' : 'OK';
        prices = { state, updatedAt: newest ? new Date(newest).toISOString() : null };

        // The indexer (worker) writes a heartbeat; with no pools there is nothing to index yet.
        const beat = deps.redis ? await deps.redis.get('oxbow:indexer:heartbeat').catch(() => null) : null;
        const lagSec = beat ? Math.max(0, Math.round((now() - Number(beat)) / 1000)) : null;
        const pools = await deps.db.pool.count();
        indexer = lagSec !== null ? { state: lagSec > 120 ? 'DEGRADED' : 'OK', lagSec } : { state: pools ? 'DEGRADED' : 'OK', lagSec: null };
      }

      return {
        checkedAt,
        api: dbOk && redisOk ? 'OK' : dbOk ? 'DEGRADED' : 'DOWN',
        rpc,
        indexer,
        prices,
        sampleData: false,
      };
    });
  });

  return { app, market, hub, cache };
}
