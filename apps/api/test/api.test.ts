/**
 * The tracker end to end against a real Postgres and Redis: wallets'
 * transactions are read through the ingestor (fake RPC, fake Jupiter), then
 * every route is checked against the shared schemas.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { z } from 'zod';
import { Redis } from 'ioredis';
import { ComputeBudgetProgram, PublicKey, SystemInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createDb, type PrismaClient } from '@oxbow/db';
import {
  BuiltSwapSchema,
  FeedPageSchema,
  FeedTradeSchema,
  HotTokenSchema,
  StatusSchema,
  SwapQuoteSchema,
  TokenDetailSchema,
  TokenSearchResultSchema,
  WalletDetailSchema,
  WalletSummarySchema,
  type FeedTrade,
} from '@oxbow/shared';
import { JUPITER_PROGRAM_ID } from '@oxbow/solana/swap';
import { buildApp, type ChainReader } from '../src/app';
import { ALT, FakeChain, FakeJupiter, FakeTrackerRpc, NOW, SOL_USD, system, token, TREASURY } from './fakes';
import { TRACKER_HEARTBEAT_KEY, TRACKER_LIVE_KEY, TRADES_CHANNEL, tradePublisher, WALLETS_CHANNEL } from '../src/hub';
import type { Jupiter } from '../src/jupiter';
import { Ingestor } from '../src/tracker/ingest';
import { WSOL } from '../src/tracker/parse';
import { TokenBook } from '../src/tracker/tokens';
import { addr, fakeSwapTx, sig, type FakeSwap } from './fixtures';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './global-setup';

const ready = inject('servicesReady');
const T = (minAgo: number) => Math.floor((NOW - minAgo * 60_000) / 1000);

const M = { meme: addr(), dog: addr(), usdc: addr(), rug: addr() };
const W = { alpha: addr(), beta: addr(), quiet: addr() };

const SOL = 1_000_000_000n;
const TOK = 1_000_000n; // one MEME/DOG/RUG in raw units

describe.skipIf(!ready)('Oxbow tracker API', () => {
  let db: PrismaClient;
  let redis: Redis;
  let jup: FakeJupiter;
  let chain: FakeChain;
  let rpc: FakeTrackerRpc;
  let ingestor: Ingestor;
  let published: FeedTrade[];
  let built: Awaited<ReturnType<typeof buildApp>>;
  const app = () => built.app;
  const get = async (url: string, headers?: Record<string, string>) => {
    const res = await app().inject({ method: 'GET', url, headers });
    return { status: res.statusCode, body: res.json() as unknown, headers: res.headers };
  };
  const post = async (url: string, payload: unknown, ip = '203.0.113.7') => {
    const res = await app().inject({ method: 'POST', url, payload: payload as object, headers: { 'x-forwarded-for': ip } });
    return { status: res.statusCode, body: res.json() as Record<string, unknown> };
  };
  const wallet = (address: string) => db.trackedWallet.findUniqueOrThrow({ where: { address } });

  async function rebuild(extra: Partial<Parameters<typeof buildApp>[0]> = {}) {
    await built?.app.close();
    built = await buildApp({
      db,
      redis,
      rpc: chain as unknown as ChainReader,
      jupiter: jup,
      swap: { treasury: TREASURY, feeBps: 50 },
      now: () => NOW,
      fetchJson: async () => null,
      ...extra,
    });
  }

  beforeAll(async () => {
    db = createDb(TEST_DATABASE_URL);
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
    await db.$executeRawUnsafe('TRUNCATE "WalletTrade", "TrackedWallet", "TokenMeta" RESTART IDENTITY CASCADE');
    jup = new FakeJupiter([
      token(WSOL, { symbol: 'SOL', name: 'Wrapped SOL', decimals: 9, usdPrice: SOL_USD, logoUri: null }),
      token(M.meme, { symbol: 'MEME', name: 'Meme Coin', usdPrice: 0.004 }),
      token(M.dog, { symbol: 'DOG', name: 'Dog', usdPrice: 0.02 }),
      token(M.usdc, { symbol: 'USDC', name: 'USD Coin', stable: true, usdPrice: 1 }),
      token(M.rug, { symbol: 'RUG', name: 'Rug', verified: false, usdPrice: 0.0001, liquidity: 900, mintAuthorityOff: false, launchedAt: new Date(NOW - 3_600_000), organicScore: 3 }),
    ]);
    chain = new FakeChain();
    rpc = new FakeTrackerRpc();
    published = [];
    const tokens = new TokenBook(db, jup, { now: () => NOW });
    ingestor = new Ingestor({ db, rpc, tokens, now: () => NOW, publish: async (t) => void published.push(...t) });

    await db.trackedWallet.createMany({
      data: [
        { address: W.alpha, label: 'Alpha', featured: true },
        { address: W.beta, featured: false },
        { address: W.quiet, featured: false },
      ],
    });
    // Alpha: buys MEME twice, sells half at a profit; buys DOG with USDC.
    rpc.add({ wallet: W.alpha, signature: sig(), blockTime: T(300), mint: M.meme, tokenDelta: 100_000n * TOK, quoteDelta: -2n * SOL, opensAccount: true });
    rpc.add({ wallet: W.alpha, signature: sig(), blockTime: T(240), mint: M.meme, tokenDelta: 100_000n * TOK, quoteDelta: -2n * SOL });
    rpc.add({ wallet: W.alpha, signature: sig(), blockTime: T(120), mint: M.meme, tokenDelta: -100_000n * TOK, quoteDelta: 3n * SOL });
    rpc.add({ wallet: W.alpha, signature: sig(), blockTime: T(60), mint: M.dog, tokenDelta: 5_000n * TOK, quoteDelta: -100n * TOK, quoteMint: M.usdc, opensAccount: true });
    // Beta: buys MEME and RUG, sells all of RUG at a loss.
    rpc.add({ wallet: W.beta, signature: sig(), blockTime: T(200), mint: M.meme, tokenDelta: 50_000n * TOK, quoteDelta: -1n * SOL, opensAccount: true });
    rpc.add({ wallet: W.beta, signature: sig(), blockTime: T(90), mint: M.rug, tokenDelta: 1_000_000n * TOK, quoteDelta: -SOL / 2n, opensAccount: true });
    rpc.add({ wallet: W.beta, signature: sig(), blockTime: T(30), mint: M.rug, tokenDelta: -1_000_000n * TOK, quoteDelta: SOL / 10n, opensAccount: true });

    for (const a of [W.alpha, W.beta, W.quiet]) await ingestor.catchUp(await wallet(a));
    chain.held.set(W.alpha, [
      [M.meme, 100_000],
      [M.dog, 5_000],
    ]);
  });

  beforeEach(async () => {
    await redis.flushdb();
    jup.down = false;
    chain.down = false;
    chain.treasuryLamports = 5_000_000;
    jup.swapProgram = JUPITER_PROGRAM_ID.toBase58();
    await rebuild();
  });

  afterAll(async () => {
    await built?.app.close();
    await db?.$disconnect();
    redis?.disconnect();
  });

  describe('ingestion', () => {
    it('reads each wallet’s history once and bookmarks the newest signature', async () => {
      const alpha = await wallet(W.alpha);
      expect(alpha.backfilledAt).not.toBeNull();
      expect(alpha.lastSignature).toBe(rpc.sigs.get(W.alpha)![0]!.signature);
      expect(await db.walletTrade.count({ where: { wallet: W.alpha } })).toBe(4);
      expect(await db.walletTrade.count({ where: { wallet: W.beta } })).toBe(3);
      // A wallet with no transactions still counts as read.
      expect((await wallet(W.quiet)).backfilledAt).not.toBeNull();
      // History isn't news: nothing went out live.
      expect(published).toEqual([]);
      // Nothing new: nothing read again.
      expect(await ingestor.catchUp(alpha)).toBe(0);
    });

    it('prices SOL trades at the SOL price and leaves out token-account rent', async () => {
      const first = await db.walletTrade.findFirstOrThrow({ where: { wallet: W.alpha }, orderBy: { ts: 'asc' } });
      expect(Number(first.usd)).toBeCloseTo(2 * SOL_USD);
      expect(Number(first.amount)).toBe(100_000);
      expect(Number(first.priceUsd)).toBeCloseTo(0.004);
      const dog = await db.walletTrade.findFirstOrThrow({ where: { mint: M.dog } });
      expect(dog).toMatchObject({ side: 'BUY', quoteMint: M.usdc });
      expect(Number(dog.usd)).toBeCloseTo(100);
    });

    it('publishes new trades live and retries a transaction it could not read yet', async () => {
      const late = sig();
      const missing: FakeSwap = { wallet: W.beta, signature: late, blockTime: T(2), mint: M.dog, tokenDelta: 10n * TOK, quoteDelta: -SOL / 100n };
      rpc.add(missing);
      rpc.txs.delete(late);
      rpc.add({ wallet: W.beta, signature: sig(), blockTime: T(1), mint: M.dog, tokenDelta: 20n * TOK, quoteDelta: -SOL / 50n });
      const before = (await wallet(W.beta)).lastSignature;
      expect(await ingestor.catchUp(await wallet(W.beta))).toBe(0);
      // Stopped at the unreadable one: the bookmark didn't move past it.
      expect((await wallet(W.beta)).lastSignature).toBe(before);

      rpc.txs.set(late, fakeSwapTx(missing));
      expect(await ingestor.catchUp(await wallet(W.beta))).toBe(2);
      expect(published.map((t) => t.amount)).toEqual([10, 20]);
      expect(published.every((t) => FeedTradeSchema.safeParse(t).success)).toBe(true);
      // Back to the suite's data set.
      await db.walletTrade.deleteMany({ where: { mint: M.dog, wallet: W.beta } });
      published.length = 0;
    });

    it('passes over a signature that keeps failing, so one bad transaction cannot stall a wallet', async () => {
      const bad = sig();
      rpc.add({ wallet: W.quiet, signature: bad, blockTime: T(4), mint: M.meme, tokenDelta: TOK, quoteDelta: -SOL });
      rpc.txs.delete(bad);
      const before = (await wallet(W.quiet)).lastSignature;
      for (let i = 0; i < 4; i++) await ingestor.catchUp(await wallet(W.quiet));
      expect((await wallet(W.quiet)).lastSignature).toBe(before);
      await ingestor.catchUp(await wallet(W.quiet));
      expect((await wallet(W.quiet)).lastSignature).toBe(bad);
      rpc.sigs.delete(W.quiet);
    });

    it('waits out a Jupiter outage instead of misreading tokens or giving up on them', async () => {
      const coin = addr();
      const stable = addr();
      const down = new TokenBook(db, { ...jup, tokens: async () => { throw new Error('down'); } } as unknown as Jupiter, { now: () => NOW });
      const ing = new Ingestor({ db, rpc, tokens: down, now: () => NOW });
      const s1 = sig();
      // Paid with a token Jupiter would call a stablecoin, while Jupiter is down.
      rpc.add({ wallet: W.quiet, signature: s1, blockTime: T(3), mint: coin, tokenDelta: 5n * TOK, quoteDelta: -100n * TOK, quoteMint: stable });
      const before = (await wallet(W.quiet)).lastSignature;
      for (let i = 0; i < 7; i++) await ing.catchUp(await wallet(W.quiet));
      // Never passed over, never stored as a token-for-token swap.
      expect((await wallet(W.quiet)).lastSignature).toBe(before);
      expect(await db.walletTrade.count({ where: { signature: s1 } })).toBe(0);
      expect((await db.tokenMeta.findUnique({ where: { mint: stable } }))?.source).toBe('outage');
      rpc.sigs.delete(W.quiet);
      rpc.txs.delete(s1);
    });

    it('keeps reading when a token is simply unknown to Jupiter (it answered)', async () => {
      const unknownA = addr();
      const unknownB = addr();
      const s1 = sig();
      // Token for token between two tokens nobody lists: nothing can price it, but it must not stall.
      rpc.add({ wallet: W.quiet, signature: s1, blockTime: T(3), mint: unknownA, tokenDelta: 5n * TOK, quoteDelta: 0n });
      const tx = rpc.txs.get(s1)!;
      tx.meta!.preTokenBalances!.push({ accountIndex: 3, mint: unknownB, owner: W.quiet, uiTokenAmount: { amount: '9000000', decimals: 6 } });
      tx.meta!.postTokenBalances!.push({ accountIndex: 3, mint: unknownB, owner: W.quiet, uiTokenAmount: { amount: '0', decimals: 6 } });
      await expect(ingestor.ingest(await wallet(W.quiet), s1)).resolves.toEqual([]);
      rpc.sigs.delete(W.quiet);
      rpc.txs.delete(s1);
    });

    it('stores nothing (so it is retried) when there is no SOL price', async () => {
      const blind = new TokenBook(db, { ...jup, tokens: async () => [] } as unknown as Jupiter, { now: () => NOW + 864e5 });
      await db.tokenMeta.update({ where: { mint: WSOL }, data: { usdPrice: null } });
      const s = sig();
      rpc.add({ wallet: W.quiet, signature: s, blockTime: T(5), mint: M.meme, tokenDelta: TOK, quoteDelta: -SOL });
      const ing = new Ingestor({ db, rpc, tokens: blind, now: () => NOW });
      await expect(ing.ingest(await wallet(W.quiet), s)).rejects.toThrow(/no USD price/);
      await db.tokenMeta.update({ where: { mint: WSOL }, data: { usdPrice: SOL_USD, updatedAt: new Date(NOW) } });
      rpc.sigs.delete(W.quiet);
      rpc.txs.delete(s);
    });
  });

  describe('feed', () => {
    it('lists trades newest first with token and wallet details', async () => {
      const { status, body } = await get('/api/feed');
      expect(status).toBe(200);
      const page = FeedPageSchema.parse(body);
      expect(page.trades).toHaveLength(7);
      expect(page.trades.map((t) => t.ts)).toEqual([...page.trades.map((t) => t.ts)].sort().reverse());
      const sell = page.trades.find((t) => t.side === 'SELL' && t.wallet === W.alpha)!;
      expect(sell).toMatchObject({ walletLabel: 'Alpha', featured: true, quoteSymbol: 'SOL', quoteAmount: 3, amount: 100_000, token: { symbol: 'MEME', verified: true } });
      expect(sell.usd).toBeCloseTo(600);
      expect(page.trades.find((t) => t.token.symbol === 'DOG')!.quoteSymbol).toBe('USDC');
    });

    it('pages with a cursor and filters by wallet, token, side and size', async () => {
      const first = FeedPageSchema.parse((await get('/api/feed?limit=3')).body);
      expect(first.trades).toHaveLength(3);
      const second = FeedPageSchema.parse((await get(`/api/feed?limit=3&cursor=${first.nextCursor}`)).body);
      const third = FeedPageSchema.parse((await get(`/api/feed?limit=3&cursor=${second.nextCursor}`)).body);
      const all = [...first.trades, ...second.trades, ...third.trades];
      expect(new Set(all.map((t) => t.id)).size).toBe(7);
      expect(third.nextCursor).toBeNull();

      const beta = FeedPageSchema.parse((await get(`/api/feed?wallets=${W.beta}`)).body);
      expect(beta.trades.length).toBe(3);
      expect(beta.trades.every((t) => t.wallet === W.beta)).toBe(true);
      expect(FeedPageSchema.parse((await get(`/api/feed?mint=${M.rug}`)).body).trades).toHaveLength(2);
      expect(FeedPageSchema.parse((await get('/api/feed?side=SELL')).body).trades).toHaveLength(2);
      expect(FeedPageSchema.parse((await get('/api/feed?minUsd=500')).body).trades.map((t) => t.usd)).toEqual([600]);
      expect((await get('/api/feed?cursor=bad')).status).toBe(400);
      expect((await get('/api/feed?wallets=notanaddress')).status).toBe(400);
    });

    it('keeps followed wallets tracked when their feed is read, within the cap', async () => {
      await db.trackedWallet.update({ where: { address: W.quiet }, data: { active: false, source: 'discovered', lastViewedAt: new Date(NOW - 30 * 864e5) } });
      // Full: the follow doesn't bring it back.
      await rebuild({ maxWallets: 2 });
      await get(`/api/feed?wallets=${W.quiet}`);
      expect(await wallet(W.quiet)).toMatchObject({ active: false });
      // A visit to its page doesn't either.
      await rebuild();
      await get(`/api/wallets/${W.quiet}`);
      expect(await wallet(W.quiet)).toMatchObject({ active: false });
      // With room it comes back, as an ordinary wallet (it had been dropped as smart money).
      // (Follow lists are checked once a minute; start that minute over.)
      await redis.flushdb();
      await get(`/api/feed?wallets=${W.quiet}`);
      expect(await wallet(W.quiet)).toMatchObject({ active: true, source: 'user' });
    });
  });

  describe('wallets', () => {
    it('ranks featured wallets first with PnL and win rate', async () => {
      const rows = z.array(WalletSummarySchema).parse((await get('/api/wallets')).body);
      expect(rows[0]).toMatchObject({ address: W.alpha, label: 'Alpha', featured: true });
      // Sold 100k MEME (cost $400 of the $800 paid) for $600.
      expect(rows[0]!.stats.realizedPnlUsd).toBeCloseTo(200);
      expect(rows[0]!.stats).toMatchObject({ trades: 4, wins: 1, losses: 0, winRate: 1, tokensTraded: 2 });
      const beta = rows.find((r) => r.address === W.beta)!;
      expect(beta.stats.realizedPnlUsd).toBeCloseTo(-80);
      expect(beta.stats.winRate).toBe(0);
    });

    it('shows holdings at today’s prices, capped by the balance on chain', async () => {
      const d = WalletDetailSchema.parse((await get(`/api/wallets/${W.alpha}`)).body);
      expect(d.backfilledAt).not.toBeNull();
      const meme = d.holdings.find((h) => h.token.symbol === 'MEME')!;
      expect(meme.amount).toBe(100_000);
      expect(meme.costUsd).toBeCloseTo(400);
      expect(meme.valueUsd).toBeCloseTo(400);
      expect(d.stats.unrealizedPnlUsd).toBeCloseTo(0);

      chain.held.set(W.alpha, [[M.meme, 25_000]]);
      await redis.flushdb();
      const capped = WalletDetailSchema.parse((await get(`/api/wallets/${W.alpha}`)).body);
      expect(capped.holdings.map((h) => [h.token.symbol, h.amount])).toEqual([['MEME', 25_000]]);
      chain.held.set(W.alpha, [
        [M.meme, 100_000],
        [M.dog, 5_000],
      ]);

      const beta = WalletDetailSchema.parse((await get(`/api/wallets/${W.beta}`)).body);
      expect(beta.closed).toMatchObject([{ token: { symbol: 'RUG' } }]);
      expect(beta.closed[0]!.realizedPnlUsd).toBeCloseTo(-80);
    });

    it('answers 404 for wallets it does not track, and shows one as soon as it is tracked', async () => {
      const fresh = addr();
      chain.accounts.set(fresh, system());
      expect((await get(`/api/wallets/${fresh}`)).status).toBe(404);
      expect((await post('/api/wallets', { address: fresh }, '203.0.113.30')).status).toBe(201);
      expect((await get(`/api/wallets/${fresh}`)).status).toBe(200);
      await db.trackedWallet.delete({ where: { address: fresh } });
    });

    it('lists one wallet’s trades', async () => {
      expect(FeedPageSchema.parse((await get(`/api/wallets/${W.alpha}/trades`)).body).trades).toHaveLength(4);
    });

    it('adds a wallet only when it is a plain wallet, and tells the worker', async () => {
      const sub = redis.duplicate();
      const heard: string[] = [];
      sub.on('message', (_c, m: string) => heard.push(m));
      await sub.subscribe(WALLETS_CHANNEL);

      expect((await post('/api/wallets', { address: 'nope' })).status).toBe(400);
      expect((await post('/api/wallets', { address: addr() })).body.error).toBe('no_activity');
      const tokenAccount = addr();
      chain.accounts.set(tokenAccount, { ...system(), owner: TOKEN_PROGRAM_ID });
      expect((await post('/api/wallets', { address: tokenAccount })).body.error).toBe('not_a_wallet');

      const fresh = addr();
      chain.accounts.set(fresh, system());
      expect(await post('/api/wallets', { address: fresh })).toEqual({ status: 201, body: { address: fresh, created: true } });
      expect((await post('/api/wallets', { address: fresh })).body).toEqual({ address: fresh, created: false });
      await new Promise((r) => setTimeout(r, 100));
      expect(heard).toContain(fresh);
      expect(await wallet(fresh)).toMatchObject({ active: true, featured: false, label: null });
      await sub.quit();
      await db.trackedWallet.delete({ where: { address: fresh } });
    });

    it('refuses new wallets when the tracker is full, and limits adds per IP', async () => {
      await rebuild({ maxWallets: 3 });
      const a = addr();
      chain.accounts.set(a, system());
      expect((await post('/api/wallets', { address: a }, '203.0.113.20')).body.error).toBe('tracker_full');
      await rebuild();
      for (let i = 0; i < 9; i++) await post('/api/wallets', { address: 'bad' }, '203.0.113.21');
      expect((await post('/api/wallets', { address: 'bad' }, '203.0.113.21')).status).toBe(400);
      expect((await post('/api/wallets', { address: 'bad' }, '203.0.113.21')).status).toBe(429);
    });
  });

  describe('tokens', () => {
    it('lists what tracked wallets are buying', async () => {
      const hot = z.array(HotTokenSchema).parse((await get('/api/tokens/hot')).body);
      expect(hot[0]).toMatchObject({ token: { symbol: 'MEME' }, buyers: 2, sellers: 1 });
      expect(hot[0]!.buyUsd).toBeCloseTo(1000);
      // Stablecoins are money, not picks.
      expect(hot.map((h) => h.token.symbol)).not.toContain('USDC');
    });

    it('shows a token with safety flags and the tracked wallets in it', async () => {
      const meme = TokenDetailSchema.parse((await get(`/api/tokens/${M.meme}`)).body);
      expect(meme).toMatchObject({ symbol: 'MEME', usdPrice: 0.004, safety: { level: 'OK', flags: [] } });
      expect(meme.traders.map((t) => t.address).sort()).toEqual([W.alpha, W.beta].sort());
      expect(meme.traders.find((t) => t.address === W.alpha)).toMatchObject({ netAmount: 100_000, lastSide: 'SELL', label: 'Alpha' });

      const rug = TokenDetailSchema.parse((await get(`/api/tokens/${M.rug}`)).body);
      expect(rug.safety.level).toBe('DANGER');
      expect(rug.safety.flags).toEqual(['MINTABLE', 'LOW_LIQUIDITY', 'NEW_TOKEN', 'LOW_ORGANIC', 'UNVERIFIED']);
    });

    it('answers 404 for a mint no source knows', async () => {
      expect((await get(`/api/tokens/${addr()}`)).status).toBe(404);
    });

    it('searches by ticker or CA, verified first, and says when search is down', async () => {
      expect(z.array(TokenSearchResultSchema).parse((await get('/api/tokens/search?q=me')).body).map((r) => r.symbol)).toEqual(['MEME']);
      expect(z.array(TokenSearchResultSchema).parse((await get(`/api/tokens/search?q=${M.rug}`)).body)[0]).toMatchObject({ symbol: 'RUG', verified: false });
      jup.down = true;
      expect((await get('/api/tokens/search?q=zzz')).body).toEqual({ error: 'search_unavailable' });
    });
  });

  describe('swaps', () => {
    it('takes the fee out of the SOL a buy puts in', async () => {
      jup.quotes = [];
      const q = SwapQuoteSchema.parse((await get(`/api/swap/quote?inputMint=${WSOL}&outputMint=${M.meme}&amount=1000000000&slippageBps=100`)).body);
      expect(jup.quotes[0]!.amount).toBe(995_000_000n);
      expect(q).toMatchObject({ feeLamports: '5000000', feeBps: 50, inAmount: '995000000', outAmount: String(49_750n * TOK), route: ['Whirlpool', 'Raydium'] });
      expect(q.priceImpactPct).toBeCloseTo(0.12);
    });

    it('takes the fee from the SOL a sale returns', async () => {
      const q = SwapQuoteSchema.parse((await get(`/api/swap/quote?inputMint=${M.meme}&outputMint=${WSOL}&amount=${50_000n * TOK}`)).body);
      expect(q).toMatchObject({ feeLamports: '5000000', outAmount: '995000000', minOutAmount: String(990_000_000n - 5_000_000n) });
    });

    it('charges nothing without a treasury that can receive SOL', async () => {
      chain.treasuryLamports = 1000;
      await rebuild();
      expect(SwapQuoteSchema.parse((await get(`/api/swap/quote?inputMint=${WSOL}&outputMint=${M.meme}&amount=1000000000`)).body).feeBps).toBe(0);
      await rebuild({ swap: { feeBps: 50 } });
      expect(SwapQuoteSchema.parse((await get(`/api/swap/quote?inputMint=${WSOL}&outputMint=${M.meme}&amount=1000000000`)).body).feeLamports).toBe('0');
    });

    it('tells "Jupiter is busy" apart from "no route"', async () => {
      const url = `/api/swap/quote?inputMint=${WSOL}&outputMint=${M.meme}&amount=1000000000`;
      jup.quoteStatus = 429;
      expect((await get(url)).body).toEqual({ error: 'jupiter_busy' });
      jup.quoteStatus = 400;
      expect((await get(url)).body).toMatchObject({ error: 'no_route' });
      jup.quoteStatus = null;
    });

    it('only swaps against SOL', async () => {
      expect((await get(`/api/swap/quote?inputMint=${M.dog}&outputMint=${M.meme}&amount=1000`)).body).toEqual({ error: 'sol_side_required' });
      expect((await get(`/api/swap/quote?inputMint=${WSOL}&outputMint=${WSOL}&amount=1000`)).body).toEqual({ error: 'sol_side_required' });
    });

    it('builds an unsigned transaction that ends with the fee transfer to the treasury', async () => {
      const trader = addr();
      const res = await app().inject({ method: 'POST', url: '/api/swap/build', payload: { wallet: trader, inputMint: WSOL, outputMint: M.meme, amount: '1000000000', slippageBps: 100 } });
      expect(res.statusCode).toBe(200);
      const built = BuiltSwapSchema.parse(res.json());
      const tx = VersionedTransaction.deserialize(Buffer.from(built.transaction, 'base64'));
      expect(tx.signatures.every((s) => s.every((b) => b === 0))).toBe(true);
      const msg = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: [ALT] });
      expect(msg.payerKey.toBase58()).toBe(trader);
      const last = msg.instructions[msg.instructions.length - 1]!;
      expect(SystemInstruction.decodeTransfer(last)).toEqual({ fromPubkey: new PublicKey(trader), toPubkey: new PublicKey(TREASURY), lamports: 5_000_000n });
      // Jupiter's compute limit plus room for the transfer, and no duplicate limit instruction.
      expect(msg.instructions[0]!.data.readUInt32LE(1)).toBe(170_090);
      expect(msg.instructions.filter((i) => i.programId.equals(ComputeBudgetProgram.programId))).toHaveLength(2);
      expect(built.quote.feeLamports).toBe('5000000');
    });

    it('refuses to pass on instructions for programs it does not know', async () => {
      jup.swapProgram = addr();
      const res = await app().inject({ method: 'POST', url: '/api/swap/build', payload: { wallet: addr(), inputMint: WSOL, outputMint: M.meme, amount: '1000000000' } });
      expect(res.json()).toEqual({ error: 'unknown_program' });
    });
  });

  describe('trades that would fail', () => {
    it('are refused with the reason before the wallet is asked', async () => {
      const body = { wallet: addr(), inputMint: WSOL, outputMint: M.meme, amount: '1000000000', slippageBps: 100 };
      chain.simulateLogs = ['Program JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4 invoke [1]', 'Program log: AnchorError occurred. Error Code: SlippageToleranceExceeded. Error Number: 6001. Error Message: Slippage tolerance exceeded.'];
      expect((await app().inject({ method: 'POST', url: '/api/swap/build', payload: body })).json()).toMatchObject({ error: 'slippage' });
      chain.simulateLogs = ['Transfer: insufficient lamports 19000000, need 1000000000'];
      chain.simulateErr = { InstructionError: [2, { Custom: 1 }] };
      expect((await app().inject({ method: 'POST', url: '/api/swap/build', payload: body })).json()).toMatchObject({ error: 'insufficient_sol' });
      chain.simulateLogs = null;
      expect((await app().inject({ method: 'POST', url: '/api/swap/build', payload: body })).statusCode).toBe(200);
    });

    it('says why the node refused a send', async () => {
      const unsigned = BuiltSwapSchema.parse((await app().inject({ method: 'POST', url: '/api/swap/build', payload: { wallet: addr(), inputMint: WSOL, outputMint: M.meme, amount: '1000000000' } })).json()).transaction;
      chain.sendError = 'Transaction simulation failed: Blockhash not found';
      expect((await post('/api/tx/send', { transaction: unsigned })).body).toMatchObject({ error: 'expired' });
      chain.sendError = 'Transaction simulation failed: Error processing Instruction 3: custom program error: 0x1771';
      expect((await post('/api/tx/send', { transaction: unsigned })).body).toMatchObject({ error: 'slippage' });
      chain.sendError = 'Transaction simulation failed: something else';
      expect((await post('/api/tx/send', { transaction: unsigned })).body).toMatchObject({ error: 'send_failed', detail: expect.stringContaining('something else') });
      chain.sendError = null;
    });
  });

  describe('transactions', () => {
    it('reports status and refuses garbage', async () => {
      expect((await get(`/api/tx/${sig()}`)).body).toEqual({ status: 'confirmed' });
      expect((await post('/api/tx/send', { transaction: 'not-a-tx' })).body.error).toBe('bad_transaction');
    });
  });

  describe('status', () => {
    it('reports the tracker from its heartbeat', async () => {
      let s = StatusSchema.parse((await get('/api/status')).body);
      expect(s.tracker).toMatchObject({ state: 'DOWN', lagSec: null, wallets: 3 });
      expect(s.lastTradeAt).not.toBeNull();
      await redis.flushdb();
      await redis.set(TRACKER_HEARTBEAT_KEY, String(NOW - 10_000));
      await redis.set(TRACKER_LIVE_KEY, '1');
      s = StatusSchema.parse((await get('/api/status')).body);
      expect(s).toMatchObject({ api: 'OK', swaps: 'OK', rpc: { state: 'OK' }, tracker: { state: 'OK', lagSec: 10, live: true } });
    });
  });

  describe('live stream', () => {
    it('streams trades published on Redis over SSE and drops junk', async () => {
      await app().listen({ port: 0, host: '127.0.0.1' });
      const { port } = app().server.address() as { port: number };
      const ctrl = new AbortController();
      const res = await fetch(`http://127.0.0.1:${port}/api/feed/stream`, { signal: ctrl.signal });
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
      const trade = FeedPageSchema.parse((await get('/api/feed?limit=1')).body).trades[0]!;
      await new Promise((r) => setTimeout(r, 200));
      await redis.publish(TRADES_CHANNEL, '{"not":"a trade"}');
      await tradePublisher(redis)([trade]);
      await until('event: trade');
      await until('\n\n');
      const data = buf.split('\n').find((l) => l.startsWith('data: '))!;
      expect(JSON.parse(data.slice(6))).toEqual(trade);
      expect(buf).not.toContain('"not"');
      ctrl.abort();
      await reader.cancel().catch(() => {});
    });

    it('caps open streams per IP', async () => {
      await rebuild({ streamsPerIp: 1 });
      await app().listen({ port: 0, host: '127.0.0.1' });
      const { port } = app().server.address() as { port: number };
      const ctrl = new AbortController();
      const first = await fetch(`http://127.0.0.1:${port}/api/feed/stream`, { signal: ctrl.signal });
      expect(first.status).toBe(200);
      const second = await fetch(`http://127.0.0.1:${port}/api/feed/stream`);
      expect(second.status).toBe(429);
      ctrl.abort();
    });
  });
});
