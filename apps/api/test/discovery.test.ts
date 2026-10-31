/**
 * Smart-money discovery, the market tape behind order flow, and limit orders,
 * against a real Postgres and Redis with fake RPC and Jupiter.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { Redis } from 'ioredis';
import { createDb, type PrismaClient } from '@oxbow/db';
import { BuiltLimitSchema, FeedPageSchema, OrderFlowSchema, WalletSummarySchema } from '@oxbow/shared';
import { z } from 'zod';
import { JUPITER_TRIGGER_PROGRAM_ID } from '@oxbow/solana/swap';
import { buildApp, type ChainReader } from '../src/app';
import { Discovery, sandwiches } from '../src/tracker/discovery';
import { Ingestor } from '../src/tracker/ingest';
import { WSOL } from '../src/tracker/parse';
import { MarketTape, orderFlow } from '../src/tracker/tape';
import { TokenBook } from '../src/tracker/tokens';
import { FakeChain, FakeJupiter, FakeTrackerRpc, NOW, SOL_USD, token } from './fakes';
import { addr, sig, type FakeSwap } from './fixtures';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './global-setup';

const ready = inject('servicesReady');
const T = (minAgo: number) => Math.floor((NOW - minAgo * 60_000) / 1000);
const SOL = 1_000_000_000n;
const TOK = 1_000_000n;
const HOT = addr();
const OTHER = addr();
const MORE = [addr(), addr(), addr()];
const ALL = [HOT, OTHER, ...MORE];

describe('sandwich detection', () => {
  it('counts a buy and a sell of the same token a slot or two apart', () => {
    expect(
      sandwiches([
        { slot: 10, side: 'BUY', mint: 'A' },
        { slot: 11, side: 'SELL', mint: 'A' },
        { slot: 20, side: 'BUY', mint: 'B' },
        { slot: 90, side: 'SELL', mint: 'B' },
      ]),
    ).toBe(1);
  });
});

describe('order flow levels', () => {
  const fill = (side: 'BUY' | 'SELL', priceUsd: number, usd: number) => ({ signature: sig(), trader: addr(), side, amount: usd / priceUsd, usd, priceUsd, ts: new Date(NOW).toISOString(), tracked: false });
  it('groups fills by price, highest first, with totals per side', () => {
    const f = orderFlow('X', [fill('SELL', 1.2, 50), fill('BUY', 1.0, 100), fill('BUY', 0.8, 30), fill('SELL', 1.19, 20)], 1.1, NOW);
    expect(f.buys).toEqual({ count: 2, usd: 130 });
    expect(f.sells).toEqual({ count: 2, usd: 70 });
    expect(f.levels.length).toBe(12);
    expect(f.levels[0]!.priceUsd).toBeGreaterThan(f.levels[11]!.priceUsd);
    expect(f.levels.reduce((s, l) => s + l.buyUsd + l.sellUsd, 0)).toBeCloseTo(200);
    expect(f.lastPriceUsd).toBe(1.1);
  });
  it('is empty without fills', () => {
    expect(orderFlow('X', [], null, NOW)).toMatchObject({ levels: [], lastPriceUsd: null, windowSec: 0 });
  });
});

describe.skipIf(!ready)('discovery, tape and limit orders', () => {
  let db: PrismaClient;
  let redis: Redis;
  let jup: FakeJupiter;
  let rpc: FakeTrackerRpc;
  let tokens: TokenBook;
  let discovery: Discovery;
  const W = { smart: addr(), loser: addr(), bot: addr(), whale: addr(), small: addr(), idle: addr() };

  /** A swap by `wallet`, also filed under the token's market. */
  const swap = (s: Omit<FakeSwap, 'signature'>) => {
    const signature = sig();
    rpc.add({ ...s, signature });
    rpc.index(s.mint, signature, s.blockTime);
    return signature;
  };

  beforeAll(async () => {
    db = createDb(TEST_DATABASE_URL);
    redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  });

  beforeEach(async () => {
    await redis.flushdb();
    await db.$executeRawUnsafe('TRUNCATE "WalletTrade", "TrackedWallet", "TokenMeta" RESTART IDENTITY CASCADE');
    jup = new FakeJupiter([
      token(WSOL, { symbol: 'SOL', decimals: 9, usdPrice: SOL_USD }),
      token(HOT, { symbol: 'HOT', usdPrice: 0.01 }),
      token(OTHER, { symbol: 'OTH', usdPrice: 0.05 }),
      ...MORE.map((m, i) => token(m, { symbol: `M${i}`, usdPrice: 0.02 })),
    ]);
    jup.trending = [HOT];
    rpc = new FakeTrackerRpc();
    tokens = new TokenBook(db, jup, { now: () => NOW });
    const ingestor = new Ingestor({ db, rpc, tokens, now: () => NOW });
    discovery = new Discovery({ db, rpc, tokens, jup, redis, tape: new MarketTape({ rpc, tokens, redis, now: () => NOW }), ingestor, now: () => NOW });

    // Smart: three tokens bought and sold, all at a profit ($200 in, $400 out each).
    for (const [i, m] of [HOT, OTHER, MORE[0]!].entries()) {
      swap({ wallet: W.smart, blockTime: T(600 - i * 100), mint: m, tokenDelta: 1000n * TOK, quoteDelta: -1n * SOL, opensAccount: true });
      swap({ wallet: W.smart, blockTime: T(560 - i * 100), mint: m, tokenDelta: -1000n * TOK, quoteDelta: 2n * SOL, opensAccount: true });
    }
    // Loser: five tokens, each sold at a loss.
    for (const [i, m] of ALL.entries()) {
      swap({ wallet: W.loser, blockTime: T(500 - i * 60), mint: m, tokenDelta: 1000n * TOK, quoteDelta: -2n * SOL });
      swap({ wallet: W.loser, blockTime: T(470 - i * 60), mint: m, tokenDelta: -1000n * TOK, quoteDelta: 1n * SOL });
    }
    // Bot: a hundred trades in under two minutes, a while ago.
    for (let i = 0; i < 100; i++) swap({ wallet: W.bot, blockTime: T(2000) + i, mint: HOT, tokenDelta: i % 2 ? -TOK : TOK, quoteDelta: i % 2 ? SOL : -SOL });
    // Whale: one huge winning exit, plus a few small trades elsewhere.
    swap({ wallet: W.whale, blockTime: T(900), mint: HOT, tokenDelta: 100_000n * TOK, quoteDelta: -50n * SOL, opensAccount: true });
    swap({ wallet: W.whale, blockTime: T(30), mint: HOT, tokenDelta: -100_000n * TOK, quoteDelta: 80n * SOL });
    for (const [i, m] of MORE.entries()) swap({ wallet: W.whale, blockTime: T(800 - i * 10), mint: m, tokenDelta: 10n * TOK, quoteDelta: -SOL / 2n });
    // Idle: profitable, but nothing for two weeks.
    for (const [i, m] of [HOT, OTHER, MORE[0]!].entries()) {
      swap({ wallet: W.idle, blockTime: T(20_000 + i * 60), mint: m, tokenDelta: 1000n * TOK, quoteDelta: -1n * SOL });
      swap({ wallet: W.idle, blockTime: T(20_000 + i * 60 - 30), mint: m, tokenDelta: -1000n * TOK, quoteDelta: 3n * SOL });
    }
    // Small: tiny trades only.
    swap({ wallet: W.small, blockTime: T(40), mint: HOT, tokenDelta: TOK, quoteDelta: -SOL / 1000n });
  });

  afterAll(async () => {
    await db?.$disconnect();
    redis?.disconnect();
  });

  it('judges wallets by their own history', async () => {
    expect((await discovery.evaluate(W.smart)).verdict).toMatchObject({ ok: true, kind: 'consistent', summary: { wins: 3, losses: 0 } });
    expect((await discovery.evaluate(W.whale)).verdict).toMatchObject({ ok: true, kind: 'big_win' });
    expect((await discovery.evaluate(W.loser)).verdict).toMatchObject({ ok: false, reason: 'low_win_rate' });
    expect((await discovery.evaluate(W.bot)).verdict).toMatchObject({ ok: false, reason: 'too_fast' });
    expect((await discovery.evaluate(W.small)).verdict).toMatchObject({ ok: false, reason: 'inactive' });
    expect((await discovery.evaluate(W.idle)).verdict).toMatchObject({ ok: false, reason: 'stale' });
  });

  it('finds candidates on trending tapes, then tracks the winners as discovered', async () => {
    const r = await discovery.run();
    expect(r.sampled).toBe(1);
    expect(r.promoted.sort()).toEqual([W.smart, W.whale].sort());
    const smart = await db.trackedWallet.findUniqueOrThrow({ where: { address: W.smart } });
    expect(smart).toMatchObject({ source: 'discovered', active: true, featured: false });
    expect(smart.backfilledAt).not.toBeNull();
    // The history read during evaluation is stored as its trades.
    expect(await db.walletTrade.count({ where: { wallet: W.smart } })).toBe(6);
    // Bots never get that far: three or more fills in one token's sample rule them out early.
    expect(await redis.exists(`oxbow:disc:seen:${W.bot}`)).toBe(0);
    // Every candidate is checked once: a second round only looks at new leads (here the winners'
    // co-buyers), and finds no one new.
    const again = await discovery.run();
    expect(again.promoted).toEqual([]);
    expect(await redis.exists(`oxbow:disc:seen:${W.loser}`)).toBe(1);
    // Progress for the status page.
    expect(await redis.hgetall('oxbow:discovery:stats')).toMatchObject({ found: '2' });
  });

  it('stops for the day when its RPC budget is spent', async () => {
    const tight = new Discovery({ db, rpc, tokens, jup, redis, tape: new MarketTape({ rpc, tokens, redis, now: () => NOW }), ingestor: new Ingestor({ db, rpc, tokens, now: () => NOW }), now: () => NOW, config: { dailyCalls: 10 } });
    const r = await tight.run();
    expect(r.budget).toBe(true);
    expect(r.promoted).toEqual([]);
    expect(Number(await redis.get(`oxbow:discovery:calls:${new Date(NOW).toISOString().slice(0, 10)}`))).toBeGreaterThanOrEqual(10);
    expect((await tight.run()).evaluated).toBe(0);
  });

  it('runs one round at a time', async () => {
    await redis.set('oxbow:discovery:running', 'someone-else');
    expect(await discovery.run()).toMatchObject({ busy: true, evaluated: 0 });
    await redis.del('oxbow:discovery:running');
  });

  it('finds the early co-buyers of a smart wallet’s winning trades', async () => {
    const early = addr();
    // Bought HOT just before Smart did, and trades well on its own.
    swap({ wallet: early, blockTime: T(605), mint: HOT, tokenDelta: 1000n * TOK, quoteDelta: -1n * SOL, opensAccount: true });
    swap({ wallet: early, blockTime: T(300), mint: HOT, tokenDelta: -1000n * TOK, quoteDelta: 3n * SOL, opensAccount: true });
    for (const [i, m] of [OTHER, MORE[1]!].entries()) {
      swap({ wallet: early, blockTime: T(400 - i * 30), mint: m, tokenDelta: 500n * TOK, quoteDelta: -1n * SOL, opensAccount: true });
      swap({ wallet: early, blockTime: T(380 - i * 30), mint: m, tokenDelta: -500n * TOK, quoteDelta: 2n * SOL, opensAccount: true });
    }
    await discovery.promote(W.smart, await discovery.evaluate(W.smart));
    // No trending tokens and no router: co-buyers are the only lead.
    jup.trending = [];
    const r = await discovery.run();
    expect(r.promoted).toContain(early);
    // Each winning buy is looked up once.
    expect((await discovery.run()).promoted).not.toContain(early);
  });

  it('stops the bookmark before history it could not store, so the worker finishes it', async () => {
    const ev = await discovery.evaluate(W.smart);
    const lost = ev.sigs[2]!.signature;
    ev.txs.delete(lost);
    await discovery.promote(W.smart, ev);
    const w = await db.trackedWallet.findUniqueOrThrow({ where: { address: W.smart } });
    expect(w.backfilledAt).toBeNull();
    expect(w.lastSignature).toBe(ev.sigs[3]!.signature);
  });

  it('re-reads market fills it could not read the first time', async () => {
    const tape = new MarketTape({ rpc, tokens, redis, now: () => NOW });
    const newest = rpc.sigs.get(HOT)![0]!.signature;
    const saved = rpc.txs.get(newest)!;
    rpc.txs.delete(newest);
    const first = await tape.refresh(HOT, 10);
    expect(first.some((f) => f.signature === newest)).toBe(false);
    rpc.txs.set(newest, saved);
    await redis.del(`oxbow:tape:${HOT}:lock`);
    const second = await tape.refresh(HOT, 10);
    expect(second.some((f) => f.signature === newest)).toBe(true);
  });

  it('drops discovered wallets that stopped earning', async () => {
    await discovery.promote(W.loser, await discovery.evaluate(W.loser));
    // Five tokens closed at a loss inside the two-week window.
    expect(await discovery.prune()).toBe(1);
    expect(await db.trackedWallet.findUniqueOrThrow({ where: { address: W.loser } })).toMatchObject({ active: false });
  });

  it('serves order flow from the chain, marks tracked traders, and shows smart money in the feed', async () => {
    const r = await discovery.run();
    expect(r.promoted).toContain(W.smart);
    const chain = new FakeChain();
    const { app } = await buildApp({ db, redis, rpc: chain as unknown as ChainReader, jupiter: jup, trackerRpc: rpc, now: () => NOW, fetchJson: async () => null });
    const flow = OrderFlowSchema.parse((await app.inject({ method: 'GET', url: `/api/tokens/${HOT}/flow` })).json());
    expect(flow.trades.length).toBeGreaterThan(0);
    expect(flow.buys.count + flow.sells.count).toBe(flow.trades.length);
    expect(flow.trades.some((t) => t.trader === W.smart && t.tracked)).toBe(true);
    expect(flow.levels.length).toBeGreaterThan(0);

    const feed = FeedPageSchema.parse((await app.inject({ method: 'GET', url: '/api/feed' })).json());
    expect(feed.trades.find((t) => t.wallet === W.smart)?.smart).toBe(true);
    const board = z.array(WalletSummarySchema).parse((await app.inject({ method: 'GET', url: '/api/wallets' })).json());
    expect(board.find((w) => w.address === W.smart)?.smart).toBe(true);
    await app.close();
  });

  describe('limit orders', () => {
    const build = async () => buildApp({ db, redis, rpc: new FakeChain() as unknown as ChainReader, jupiter: jup, now: () => NOW, fetchJson: async () => null });

    it('passes a SOL-side order to Jupiter and returns the checked transaction', async () => {
      const { app } = await build();
      const maker = addr();
      const res = await app.inject({ method: 'POST', url: '/api/limit/create', payload: { wallet: maker, inputMint: WSOL, outputMint: HOT, makingAmount: '100000000', takingAmount: '2000000000' } });
      expect(res.statusCode).toBe(200);
      const b = BuiltLimitSchema.parse(res.json());
      expect(b.order).toBeTruthy();
      expect(jup.triggers[0]).toMatchObject({ maker, inputMint: WSOL, outputMint: HOT, makingAmount: '100000000', takingAmount: '2000000000' });
      await app.close();
    });

    it('refuses token-to-token orders, odd programs, and passes on Jupiter’s reasons', async () => {
      const { app } = await build();
      const post = (body: object) => app.inject({ method: 'POST', url: '/api/limit/create', payload: { wallet: addr(), makingAmount: '100000000', takingAmount: '2', ...body } }).then((r) => r.json());
      expect(await post({ inputMint: HOT, outputMint: OTHER })).toEqual({ error: 'sol_side_required' });
      jup.triggerProgram = addr();
      expect(await post({ inputMint: WSOL, outputMint: HOT })).toEqual({ error: 'unknown_program' });
      jup.triggerProgram = JUPITER_TRIGGER_PROGRAM_ID.toBase58();
      jup.triggerError = 'Order size must be at least 5 USD';
      expect(await post({ inputMint: WSOL, outputMint: HOT })).toEqual({ error: 'limit_rejected', detail: 'Order size must be at least 5 USD' });
      await app.close();
    });

    it('lists open orders and builds cancels', async () => {
      const { app } = await build();
      const maker = addr();
      const order = addr();
      jup.openOrders = [{ order, inputMint: WSOL, outputMint: HOT, makingAmount: '100000000', takingAmount: '2000000000', remainingMakingAmount: '100000000', createdAt: new Date(NOW).toISOString(), expiredAt: null, status: 'Open' }];
      expect((await app.inject({ method: 'GET', url: `/api/limit/orders?wallet=${maker}` })).json()).toEqual(jup.openOrders);
      const c = await app.inject({ method: 'POST', url: '/api/limit/cancel', payload: { wallet: maker, order } });
      expect(BuiltLimitSchema.parse(c.json()).transaction).toBeTruthy();
      await app.close();
    });
  });
});
