import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Keypair, PublicKey, type AccountInfo } from '@solana/web3.js';
import { MINT_SIZE, MintLayout, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { Redis } from 'ioredis';
import { z } from 'zod';
import {
  ActivityItemSchema,
  ChartSeriesSchema,
  PoolDetailSchema,
  PoolsPageSchema,
  PoolSummarySchema,
  PopularTokenSchema,
  QuoteAssetSchema,
  StatsSchema,
  StatusSchema,
  StockInfoSchema,
  TickerItemSchema,
  TokenInfoSchema,
  TradeSchema,
  WalletActivitySchema,
  type ActivityItem,
} from '@oxbow/shared';
import { createDb, type PrismaClient } from '@oxbow/db';
import { SOL_MINT } from '@oxbow/solana/rpc';
import { buildApp, type ChainReader } from '../src/app';
import { ACTIVITY_CHANNEL } from '../src/activity';
import type { Price, PriceRequest, PriceSource } from '../src/prices';
import { addr, makeIds, seedFixtures } from './fixtures';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './global-setup';

const ready = inject('servicesReady');
const NOW = Date.parse('2026-10-28T15:00:00Z'); // a Wednesday, US market open
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ids = makeIds();
const { M, P, creator, trader } = ids;

class FakePrices implements PriceSource {
  calls: PriceRequest[][] = [];
  table = new Map<string, Price>([
    [M.tsla, { usd: 250, change24h: 2.5, updatedAt: NOW - 60_000 }],
    [M.nvda, { usd: 140, change24h: null, updatedAt: NOW - 60_000 }],
    [SOL_MINT, { usd: 180, change24h: -1, updatedAt: NOW - 30_000 }],
    [M.usdc, { usd: 1, change24h: 0, updatedAt: NOW - 30_000 }],
  ]);
  async prices(req: PriceRequest[]) {
    this.calls.push(req);
    return new Map(req.flatMap((r) => (this.table.has(r.mint) ? [[r.mint, this.table.get(r.mint)!] as const] : [])));
  }
}

function mintAccount(decimals: number, supply: bigint, authority: PublicKey | null): AccountInfo<Buffer> {
  const data = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    {
      mintAuthorityOption: authority ? 1 : 0,
      mintAuthority: authority ?? PublicKey.default,
      supply,
      decimals,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  return { owner: TOKEN_PROGRAM_ID, data, executable: false, lamports: 1, rentEpoch: 0 };
}

class FakeRpc {
  async getTransaction() {
    return null;
  }
  accounts = new Map<string, AccountInfo<Buffer>>();
  down = false;
  async getSlot() {
    if (this.down) throw new Error('down');
    return 123_456;
  }
  async getSupply() {
    if (this.down) throw new Error('down');
    return { value: { circulating: 560_000_000 * 1e9 } };
  }
  async getAccountInfo(k: PublicKey) {
    if (this.down) throw new Error('down');
    return this.accounts.get(k.toBase58()) ?? null;
  }
}

describe.skipIf(!ready)('Oxbow API', () => {
  let db: PrismaClient;
  let redis: Redis;
  let prices: FakePrices;
  let rpc: FakeRpc;
  let built: Awaited<ReturnType<typeof buildApp>>;
  const app = () => built.app;
  const get = async (url: string, headers?: Record<string, string>) => {
    const res = await app().inject({ method: 'GET', url, headers });
    return { status: res.statusCode, body: res.json() as unknown, headers: res.headers };
  };

  beforeAll(async () => {
    db = createDb(TEST_DATABASE_URL);
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
    await seedFixtures(db, NOW, ids);
  });

  beforeEach(async () => {
    await redis.flushdb();
    await built?.app.close();
    prices = new FakePrices();
    rpc = new FakeRpc();
    built = await buildApp({ db, redis, prices, rpc: rpc as unknown as ChainReader, cluster: 'devnet', now: () => NOW, fetchJson: async () => null });
  });

  afterAll(async () => {
    await built?.app.close();
    await db?.$disconnect();
    redis?.disconnect();
  });

  it('answers health checks', async () => {
    expect((await get('/health')).body).toEqual({ ok: true });
    expect((await get('/api/health')).body).toEqual({ ok: true });
  });

  describe('assets', () => {
    it('lists quote assets: stocks in seed order, then SOL, then USDC, priced', async () => {
      const { status, body } = await get('/api/quotes');
      expect(status).toBe(200);
      const quotes = z.array(QuoteAssetSchema).parse(body);
      expect(quotes.map((q) => q.symbol)).toEqual(['TSLAx', 'NVDAx', 'SOL', 'USDC']);
      expect(quotes[0]).toMatchObject({ kind: 'STOCK', priceUsd: 250, change24h: 2.5, issuer: 'Backed', logoUri: '/tokens/tslax.svg' });
      expect(quotes[1]!.notice).toBe('Stock split 10:1 on Nov 3');
      expect(quotes[2]).toMatchObject({ kind: 'SOL', priceUsd: 180, logoUri: '/tokens/sol.svg', market: null });
      // Stocks carry the US market state; the fixed clock is a weekday afternoon in New York.
      expect(quotes[0]!.market?.status).toBe('OPEN');
      // Pyth feeds are asked for by feed id, Jupiter by mint.
      const req = prices.calls[0]!;
      expect(req).toContainEqual({ mint: M.nvda, source: 'pyth', feedId: 'ab'.repeat(32) });
      expect(req).toContainEqual({ mint: M.tsla, source: 'jupiter', feedId: null });
    });

    it('lists stocks with pool counts and records price snapshots at most every 5 minutes', async () => {
      await db.stockSnapshot.deleteMany();
      const stocks = z.array(StockInfoSchema).parse((await get('/api/stocks')).body);
      expect(stocks.find((s) => s.symbol === 'TSLAx')).toMatchObject({ poolCount: 1, orb: '#E82127' });
      expect(stocks.find((s) => s.symbol === 'NVDAx')?.poolCount).toBe(0);
      expect(await db.stockSnapshot.count()).toBe(2);
      // A second read inside 5 minutes (cache cleared) writes nothing new.
      await redis.flushdb();
      await get('/api/stocks');
      expect(await db.stockSnapshot.count()).toBe(2);
    });

    it('falls back to the last snapshot when a price source is down', async () => {
      prices.table.delete(M.nvda);
      const quotes = z.array(QuoteAssetSchema).parse((await get('/api/quotes')).body);
      expect(quotes.find((q) => q.symbol === 'NVDAx')?.priceUsd).toBe(140);
    });
  });

  describe('pools', () => {
    it('lists pools by 24h volume with the shared schema', async () => {
      const { status, body, headers } = await get('/api/pools');
      expect(status).toBe(200);
      expect(headers['cache-control']).toContain('public');
      const page = PoolsPageSchema.parse(body);
      expect(page.total).toBe(3);
      expect(page.items.map((p) => p.address)).toEqual([P.stock, P.sol, P.usdc]);
      const first = page.items[0]!;
      expect(first.quote.symbol).toBe('TSLAx');
      expect(first.priceQuote).toBeCloseTo(0.00002 / 250);
      // Fee APR = vol × fee × 365 ÷ TVL × 100
      expect(first.feeAprPct).toBeCloseTo(((50_000 * 0.0025 * 365) / 200_000) * 100);
      expect(first.marketCapUsd).toBeCloseTo(0.00002 * 1e9);
      expect(first.spark7d.length).toBeGreaterThan(2);
    });

    it('filters by pair asset, locked liquidity, search text and address', async () => {
      const ids = async (qs: string) => PoolsPageSchema.parse((await get(`/api/pools?${qs}`)).body).items.map((p) => p.address);
      expect(await ids('quote=stock')).toEqual([P.stock]);
      expect(await ids('quote=SOL')).toEqual([P.sol]);
      expect(await ids('quote=USDC')).toEqual([P.usdc]);
      expect(await ids('locked=true')).toEqual([P.stock, P.usdc]);
      expect(await ids('q=wif')).toEqual([P.sol]);
      expect(await ids('q=dogwif')).toEqual([P.sol]);
      // Searching a stock symbol finds pools paired with it.
      expect(await ids('q=TSLA')).toContain(P.stock);
      expect(await ids(`q=${M.bonk}`)).toEqual([P.stock]);
      expect(await ids(`q=${P.usdc}`)).toEqual([P.usdc]);
      expect(await ids(`addresses=${P.sol},${P.usdc}`)).toEqual([P.sol, P.usdc]);
    });

    it('sorts by TVL, change, APR and age, and pages with a cursor', async () => {
      const ids = async (qs: string) => PoolsPageSchema.parse((await get(`/api/pools?${qs}`)).body).items.map((p) => p.address);
      expect(await ids('sort=tvl')).toEqual([P.stock, P.usdc, P.sol]);
      expect(await ids('sort=chg')).toEqual([P.usdc, P.stock, P.sol]);
      expect(await ids('sort=apr')).toEqual([P.sol, P.stock, P.usdc]);
      expect(await ids('sort=new')).toEqual([P.sol, P.usdc, P.stock]);
      const one = PoolsPageSchema.parse((await get('/api/pools?limit=2')).body);
      expect(one.items).toHaveLength(2);
      expect(one.nextCursor).toBeTruthy();
      const two = PoolsPageSchema.parse((await get(`/api/pools?limit=2&cursor=${one.nextCursor}`)).body);
      expect(two.items.map((p) => p.address)).toEqual([P.usdc]);
      expect(two.nextCursor).toBeNull();
    });

    it('rejects bad query strings', async () => {
      expect((await get('/api/pools?sort=hot')).status).toBe(400);
      expect((await get('/api/pools?limit=1000')).status).toBe(400);
      expect((await get('/api/pools?addresses=nope')).status).toBe(400);
    });

    it('computes safety flags from token facts and creator history', async () => {
      const page = PoolsPageSchema.parse((await get('/api/pools')).body);
      const by = (a: string) => page.items.find((p) => p.address === a)!.safety;
      expect(by(P.stock)).toMatchObject({ level: 'DANGER', holderCount: 900, creatorPools: 3, creatorPulled: 1 });
      expect(by(P.stock).flags).toEqual(['CREATOR_PULLED_BEFORE']);
      expect(by(P.sol).flags).toEqual(expect.arrayContaining(['MINTABLE', 'LP_UNLOCKED', 'CONCENTRATED', 'NEW_TOKEN', 'LOW_LIQUIDITY']));
      // "tslax" copies a verified stock's symbol.
      expect(by(P.usdc).flags).toContain('DUPLICATE_SYMBOL');
    });

    it('returns pool detail, 404 for unknown pools and 400 for bad addresses', async () => {
      const { status, body } = await get(`/api/pools/${P.stock}`);
      expect(status).toBe(200);
      const d = PoolDetailSchema.parse(body);
      expect(d).toMatchObject({ creator, reserveQuote: 1000 });
      // The malformed slice is dropped.
      expect(d.holders).toEqual([{ kind: 'BURNED', pct: 100, unlockAt: null, proof: { kind: 'tx', id: expect.any(String) } }]);
      expect((await get(`/api/pools/${addr()}`)).status).toBe(404);
      expect((await get('/api/pools/not-an-address')).status).toBe(400);
    });

    it('builds charts from snapshots, flat when there is no history', async () => {
      const c = ChartSeriesSchema.parse((await get(`/api/pools/${P.stock}/chart?tf=1D`)).body);
      expect(c.tf).toBe('1D');
      expect(c.candles.length).toBeGreaterThan(80);
      expect(c.candles.at(-1)!.c).toBeCloseTo(0.00001 + 23 * 0.0000005);
      for (const k of c.candles) expect(k.h).toBeGreaterThanOrEqual(k.l);
      const flat = ChartSeriesSchema.parse((await get(`/api/pools/${P.sol}/chart?tf=1H`)).body);
      expect(flat.points).toHaveLength(2);
      expect(flat.points[0]!.p).toBe(1.8);
      expect((await get(`/api/pools/${P.sol}/chart?tf=5Y`)).status).toBe(400);
    });

    it('lists recent trades newest first', async () => {
      const trades = z.array(TradeSchema).parse((await get(`/api/pools/${P.stock}/trades`)).body);
      expect(trades.map((t) => t.side)).toEqual(['BUY', 'SELL']);
      expect(trades[0]!.priceUsd).toBeCloseTo(500 / 25_000_000);
    });
  });

  describe('home', () => {
    it('serves stats, ticker and movers', async () => {
      const stats = StatsSchema.parse((await get('/api/stats')).body);
      expect(stats).toMatchObject({ vol24hUsd: 60_000, tvlUsd: 284_000, marketCount: 3 });
      expect(stats.topGainer?.pool.address).toBe(P.usdc);
      expect(stats.sparks.tvl.length).toBeGreaterThan(10);

      const ticker = z.array(TickerItemSchema).parse((await get('/api/ticker')).body);
      expect(ticker.filter((t) => t.kind === 'stock').map((t) => t.asset.symbol)).toEqual(['TSLAx', 'NVDAx']);
      expect(ticker.filter((t) => t.kind === 'pool')).toHaveLength(3);

      const movers = z.array(PoolSummarySchema).parse((await get('/api/movers')).body);
      expect(movers.map((p) => p.address)).toEqual([P.usdc, P.stock, P.sol]);
    });

    it('serves recent activity for the live feed', async () => {
      const items = z.array(ActivityItemSchema).parse((await get('/api/activity/recent')).body);
      expect(items[0]).toMatchObject({ kind: 'BUY', wallet: trader, amountUsd: 50 });
      expect(items.map((i) => i.kind)).toEqual(expect.arrayContaining(['BUY', 'SELL', 'ADD_LP', 'POOL']));
    });
  });

  describe('tokens', () => {
    it('reads a mint from the chain and flags a taken symbol', async () => {
      const mint = Keypair.generate().publicKey;
      rpc.accounts.set(mint.toBase58(), mintAccount(6, 5_000_000n * 10n ** 6n, mint));
      const { status, body } = await get(`/api/tokens/${mint.toBase58()}`);
      expect(status).toBe(200);
      const t = TokenInfoSchema.parse(body);
      expect(t).toMatchObject({ decimals: 6, supply: 5_000_000, tokenProgram: 'spl-token', mintAuthority: mint.toBase58(), risk: { mintable: true } });
      expect(t.symbolTaken).toBe(false);
      // The old path still works for the web app's sample-data mode.
      expect((await get(`/api/token/${mint.toBase58()}`)).status).toBe(200);
    });

    it('uses the listed token record for symbol checks and creation time', async () => {
      rpc.accounts.set(M.wif, mintAccount(6, 10n ** 14n, null));
      const t = TokenInfoSchema.parse((await get(`/api/tokens/${M.wif}`)).body);
      expect(t.createdAt).toBe(new Date(NOW - DAY).toISOString());
    });

    it('gives wrapped SOL its logo and the circulating SOL supply', async () => {
      rpc.accounts.set(SOL_MINT, mintAccount(9, 0n, null));
      const t = TokenInfoSchema.parse((await get(`/api/tokens/${SOL_MINT}`)).body);
      expect(t).toMatchObject({ logoUri: '/tokens/sol.svg', supply: 560_000_000, decimals: 9 });
    });

    it('uses a verified stock’s logo when its metadata has none', async () => {
      rpc.accounts.set(M.tsla, mintAccount(8, 10n ** 12n, null));
      expect(TokenInfoSchema.parse((await get(`/api/tokens/${M.tsla}`)).body).logoUri).toBe('/tokens/tslax.svg');
    });

    it('answers 404 for missing mints and 502 when the RPC is down, without caching the failure', async () => {
      const missing = addr();
      expect((await get(`/api/tokens/${missing}`)).body).toEqual({ error: 'not_found' });
      const other = Keypair.generate().publicKey;
      rpc.down = true;
      expect((await get(`/api/tokens/${other.toBase58()}`)).status).toBe(502);
      rpc.down = false;
      rpc.accounts.set(other.toBase58(), mintAccount(9, 1n, null));
      expect((await get(`/api/tokens/${other.toBase58()}`)).status).toBe(200);
      expect((await get('/api/tokens/xyz')).status).toBe(400);
    });
  });

  describe('wallet', () => {
    it('lists a wallet’s trades and liquidity events, newest first, uncached', async () => {
      const { body, headers } = await get(`/api/wallet/${trader}/activity`);
      expect(headers['cache-control']).toBe('no-store');
      const items = z.array(WalletActivitySchema).parse(body);
      expect(items.map((i) => i.kind)).toEqual(['SWAP', 'SWAP', 'ADD']);
      expect(items[0]!.pool.quote.symbol).toBe('SOL');
    });

    it('returns no positions until pools can be created', async () => {
      expect((await get(`/api/wallet/${trader}/positions`)).body).toEqual([]);
      expect((await get('/api/wallet/nope/positions')).status).toBe(400);
    });
  });

  it('validates pool registration and waits for the transaction to confirm', async () => {
    const post = (payload: Record<string, string>) => app().inject({ method: 'POST', url: '/api/pools/register', payload });
    expect((await post({ signature: '5'.repeat(88), venue: 'RAYDIUM_CPMM' })).statusCode).toBe(409);
    expect((await post({ signature: 'short', venue: 'RAYDIUM_CPMM' })).statusCode).toBe(400);
    expect((await post({ signature: '5'.repeat(88), venue: 'UNISWAP' })).statusCode).toBe(400);
  });

  it('serves popular token picks without the pair assets', async () => {
    const other = addr();
    await built.app.close();
    built = await buildApp({
      db,
      redis,
      prices,
      rpc: rpc as unknown as ChainReader,
      cluster: 'devnet',
      now: () => NOW,
      popular: async () => [
        { mint: M.tsla, symbol: 'TSLAx', name: 'Tesla xStock', logoUri: null },
        { mint: other, symbol: 'BONK', name: 'Bonk', logoUri: 'https://arweave.net/b.png' },
      ],
    });
    const list = z.array(PopularTokenSchema).parse((await get('/api/tokens/popular')).body);
    expect(list).toEqual([{ mint: other, symbol: 'BONK', name: 'Bonk', logoUri: 'https://arweave.net/b.png' }]);
  });

  it('falls back to the project logo Jupiter lists when the metadata has no image', async () => {
    const mint = Keypair.generate().publicKey;
    rpc.accounts.set(mint.toBase58(), mintAccount(5, 10n ** 14n, null));
    await built.app.close();
    built = await buildApp({
      db,
      redis,
      prices,
      rpc: rpc as unknown as ChainReader,
      cluster: 'devnet',
      now: () => NOW,
      fetchJson: async () => null,
      popular: async () => [{ mint: mint.toBase58(), symbol: 'BONK', name: 'Bonk', logoUri: 'https://arweave.net/bonk.png' }],
    });
    expect(TokenInfoSchema.parse((await get(`/api/tokens/${mint.toBase58()}`)).body).logoUri).toBe('https://arweave.net/bonk.png');
  });

  it('reports service health on /api/status', async () => {
    const s = StatusSchema.parse((await get('/api/status')).body);
    expect(s).toMatchObject({ api: 'OK', sampleData: false, rpc: { state: 'OK', slot: 123_456 }, prices: { state: 'OK' } });
    // Pools exist but no indexer heartbeat yet.
    expect(s.indexer.state).toBe('DEGRADED');
    await redis.flushdb();
    rpc.down = true;
    prices.table.clear();
    await db.stockSnapshot.deleteMany();
    const down = StatusSchema.parse((await get('/api/status')).body);
    expect(down.rpc.state).toBe('DOWN');
    expect(down.prices.state).toBe('DOWN');
    await redis.set('oxbow:indexer:heartbeat', String(NOW - 10_000));
    await redis.del('status:v1');
    expect(StatusSchema.parse((await get('/api/status')).body).indexer).toEqual({ state: 'OK', lagSec: 10 });
  });

  it('limits reads to 60 a minute per client IP, keyed on the address nginx forwards', async () => {
    const as = (ip: string) => ({ 'x-forwarded-for': ip });
    for (let i = 0; i < 60; i++) expect((await get('/api/quotes', as('203.0.113.9'))).status).toBe(200);
    const over = await get('/api/quotes', as('203.0.113.9'));
    expect(over.status).toBe(429);
    expect(over.body).toEqual({ error: 'rate_limited' });
    // Another client is unaffected, and so is the web server on this machine.
    expect((await get('/api/quotes', as('198.51.100.4'))).status).toBe(200);
    expect((await get('/api/quotes')).status).toBe(200);
    // A client can't spoof its address unless the hop is local.
    const spoof = await app().inject({ method: 'GET', url: '/api/quotes', remoteAddress: '203.0.113.9', headers: as('10.9.9.9') });
    expect(spoof.statusCode).toBe(429);
  });

  it('limits registration to 10 a minute', async () => {
    const post = () => app().inject({ method: 'POST', url: '/api/pools/register', payload: { signature: '5'.repeat(88), venue: 'RAYDIUM_CPMM' }, headers: { 'x-forwarded-for': '203.0.113.50' } });
    for (let i = 0; i < 10; i++) expect((await post()).statusCode).toBe(409);
    expect((await post()).statusCode).toBe(429);
  });

  it('streams activity published on Redis over SSE', async () => {
    await app().listen({ port: 0, host: '127.0.0.1' });
    const { port } = app().server.address() as { port: number };
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/activity/stream`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const until = async (needle: string) => {
      while (!buf.includes(needle)) {
        const { value, done } = await reader.read();
        if (done) throw new Error('stream ended');
        buf += dec.decode(value);
      }
    };
    await until('retry:');
    const item: ActivityItem = {
      id: 'x1',
      kind: 'BUY',
      pool: { address: P.stock, base: { mint: M.bonk, symbol: 'BONK', name: 'Bonk', logoUri: null, brand: null }, quote: { mint: M.tsla, symbol: 'TSLAx', name: 'Tesla xStock', logoUri: null, brand: null } },
      wallet: trader,
      amountUsd: 42,
      ts: NOW,
    };
    // Give the subscription a moment to register, then publish junk and a real item.
    await new Promise((r) => setTimeout(r, 200));
    await redis.publish(ACTIVITY_CHANNEL, '{"not":"an item"}');
    await redis.publish(ACTIVITY_CHANNEL, JSON.stringify(item));
    await until('event: activity');
    await until('\n\n');
    const data = buf.split('\n').find((l) => l.startsWith('data: '))!;
    expect(JSON.parse(data.slice(6))).toEqual(item);
    expect(buf).not.toContain('not');
    ctrl.abort();
    await reader.cancel().catch(() => {});
  });

  it('caps open activity streams per IP', async () => {
    await built.app.close();
    built = await buildApp({ db, redis, prices, rpc: rpc as unknown as ChainReader, cluster: 'devnet', now: () => NOW, streamsPerIp: 1 });
    await app().listen({ port: 0, host: '127.0.0.1' });
    const { port } = app().server.address() as { port: number };
    const ctrl = new AbortController();
    const first = await fetch(`http://127.0.0.1:${port}/api/activity/stream`, { signal: ctrl.signal });
    expect(first.status).toBe(200);
    const second = await fetch(`http://127.0.0.1:${port}/api/activity/stream`);
    expect(second.status).toBe(429);
    ctrl.abort();
  });
});
