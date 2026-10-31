/**
 * The Oxbow API, mocked in the browser: every /api request is answered from
 * the fixtures below (page.route), so the suite needs no database, RPC or
 * Jupiter. The test server's own API URL points nowhere, so server rendering
 * finds nothing and the pages load their data in the browser, from here.
 * Every address is a random key made for these tests.
 */
import type { Page, Route } from '@playwright/test';

export const SOL = 'So11111111111111111111111111111111111111112';
export const W = {
  alpha: 'D7eBunak7CEatz4zjjHddr34worubamHYJvKGSwrRg7V',
  beta: 'HDWjMLuRAg1Cvze7D5dUzkDutPRHa8VKTdTBkwNw5rJ6',
  fresh: '6Qa6dEbqbQzNDCNyJ3ogHT9CKCjJUZbK4kTu5C9xmJtQ',
  me: '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
};
export const M = { meme: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', rug: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr' };

const NOW = Date.now();
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const tok = (mint: string, symbol: string, name: string, verified = true) => ({ mint, symbol, name, logoUri: null, decimals: 6, verified });
export const MEME = tok(M.meme, 'MEME', 'Meme Coin');
export const RUG = tok(M.rug, 'RUG', 'Rug Token', false);

const sig = (n: number) => String(n).padStart(2, '1').repeat(44).slice(0, 88).replace(/0/g, '2');
export const trade = (n: number, wallet: string, side: 'BUY' | 'SELL', token = MEME, usd = 400, minAgo = n) => ({
  id: String(n),
  signature: sig(n),
  wallet,
  walletLabel: wallet === W.alpha ? 'Alpha' : null,
  featured: wallet === W.alpha,
  smart: wallet === W.beta,
  ts: iso(minAgo),
  side,
  token,
  amount: usd * 250,
  quoteSymbol: 'SOL',
  quoteAmount: usd / 200,
  usd,
  priceUsd: 0.004,
});

export const TRADES = [trade(1, W.alpha, 'SELL', MEME, 600), trade(2, W.beta, 'BUY', RUG, 100), trade(3, W.alpha, 'BUY', MEME, 400), trade(4, W.beta, 'BUY', MEME, 200)];

const stats = (o: Record<string, unknown>) => ({
  trades: 3,
  buys: 2,
  sells: 1,
  volumeUsd: 1400,
  realizedPnlUsd: 200,
  unrealizedPnlUsd: 0,
  winRate: 1,
  wins: 1,
  losses: 0,
  tokensTraded: 1,
  firstTradeAt: iso(300),
  lastTradeAt: iso(1),
  ...o,
});

export const WALLETS = [
  { address: W.alpha, label: 'Alpha', featured: true, smart: false, stats: stats({}), volume7dUsd: 1400 },
  { address: W.beta, label: null, featured: false, smart: true, stats: stats({ realizedPnlUsd: -80, winRate: 0, wins: 0, losses: 1 }), volume7dUsd: 300 },
];

export const walletDetail = (address: string, backfilled = true) => ({
  address,
  label: address === W.alpha ? 'Alpha' : null,
  featured: address === W.alpha,
  smart: address === W.beta,
  addedAt: iso(600),
  backfilledAt: backfilled ? iso(590) : null,
  stats: stats({}),
  holdings: [{ token: MEME, amount: 100_000, costUsd: 400, priceUsd: 0.005, valueUsd: 500, pnlUsd: 100, pnlPct: 25, realizedPnlUsd: 200, lastTradeAt: iso(1) }],
  closed: [{ token: RUG, boughtUsd: 100, soldUsd: 20, realizedPnlUsd: -80, lastTradeAt: iso(5) }],
});

const tokenDetail = (t: typeof MEME, danger = false) => ({
  ...t,
  usdPrice: 0.004,
  change24h: 12.5,
  mcap: 4_000_000,
  liquidity: danger ? 900 : 800_000,
  holderCount: 12_000,
  organicScore: danger ? 3 : 80,
  launchedAt: danger ? iso(60) : iso(60 * 24 * 90),
  mintAuthorityOff: !danger,
  freezeAuthorityOff: true,
  topHoldersPct: 18,
  devPct: 0,
  safety: danger ? { level: 'DANGER', flags: ['MINTABLE', 'LOW_LIQUIDITY', 'NEW_TOKEN', 'LOW_ORGANIC', 'UNVERIFIED'] } : { level: 'OK', flags: [] },
  solUsd: 200,
  traders: [{ address: W.alpha, label: 'Alpha', featured: true, smart: false, boughtUsd: 800, soldUsd: 600, netAmount: 100_000, lastSide: 'SELL', lastTradeAt: iso(1) }],
});

export const HOT = [{ token: MEME, usdPrice: 0.004, change24h: 12.5, mcap: 4_000_000, buyers: 2, sellers: 1, buyUsd: 600, sellUsd: 600, lastTradeAt: iso(1) }];

const fill = (n: number, side: 'BUY' | 'SELL', usd: number, priceUsd: number, trader: string, tracked = false) => ({
  signature: sig(50 + n),
  trader,
  side,
  amount: usd / priceUsd,
  usd,
  priceUsd,
  ts: iso(n),
  tracked,
});
export const FLOW = {
  mint: M.meme,
  trades: [fill(1, 'BUY', 300, 0.0041, W.alpha, true), fill(2, 'SELL', 100, 0.0042, W.fresh), fill(3, 'BUY', 200, 0.0039, W.me)],
  buys: { count: 2, usd: 500 },
  sells: { count: 1, usd: 100 },
  levels: [
    { priceUsd: 0.0042, buyUsd: 0, sellUsd: 100, buys: 0, sells: 1 },
    { priceUsd: 0.0041, buyUsd: 300, sellUsd: 0, buys: 1, sells: 0 },
    { priceUsd: 0.0039, buyUsd: 200, sellUsd: 0, buys: 1, sells: 0 },
  ],
  lastPriceUsd: 0.004,
  windowSec: 180,
  updatedAt: new Date(NOW).toISOString(),
};

export interface MockState {
  /** Builds fail with a slippage error below this many basis points. */
  slippageNeeded?: number;
  tracked: Set<string>;
  orders: Record<string, unknown>[];
  posts: { path: string; body: unknown }[];
  /** Extra events the SSE stream sends once. */
  live: unknown[];
  feedQueries: URLSearchParams[];
}

/** 1 SOL buys 50 raw units per lamport; the 0.5% fee comes off the SOL side. */
function quoteFor(q: URLSearchParams) {
  const amount = BigInt(q.get('amount')!);
  const buy = q.get('inputMint') === SOL;
  const fee = buy ? (amount * 50n) / 10_000n : 5_000_000n;
  return {
    inputMint: q.get('inputMint'),
    outputMint: q.get('outputMint'),
    inAmount: String(amount - (buy ? fee : 0n)),
    outAmount: buy ? String((amount - fee) * 50n) : '995000000',
    minOutAmount: buy ? String(((amount - fee) * 50n * 99n) / 100n) : '980000000',
    priceImpactPct: 0.12,
    slippageBps: Number(q.get('slippageBps') ?? 100),
    feeLamports: String(fee),
    feeBps: 50,
    route: ['Whirlpool'],
  };
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

export async function mockApi(page: Page, opts: { live?: unknown[]; empty?: boolean } = {}): Promise<MockState> {
  const state: MockState = { tracked: new Set([W.alpha, W.beta]), orders: [], posts: [], live: opts.live ?? [], feedQueries: [] };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    if (req.method() === 'POST') state.posts.push({ path: p, body: req.postDataJSON() });

    if (p === '/api/feed/stream') {
      const body = 'retry: 600000\n\n' + state.live.map((t) => `event: trade\ndata: ${JSON.stringify(t)}\n\n`).join('');
      state.live = [];
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body });
    }
    if (p === '/api/feed') {
      state.feedQueries.push(url.searchParams);
      const wallets = url.searchParams.get('wallets')?.split(',');
      const mint = url.searchParams.get('mint');
      const min = Number(url.searchParams.get('minUsd') ?? 0);
      const trades = opts.empty ? [] : TRADES.filter((t) => (!wallets || wallets.includes(t.wallet)) && (!mint || t.token.mint === mint) && t.usd >= min);
      return json(route, { trades, nextCursor: null });
    }
    if (p === '/api/wallets' && req.method() === 'GET') return json(route, WALLETS);
    if (p === '/api/wallets' && req.method() === 'POST') {
      const { address } = req.postDataJSON() as { address: string };
      if (address === W.me) return json(route, { error: 'not_a_wallet' }, 400);
      const created = !state.tracked.has(address);
      state.tracked.add(address);
      return json(route, { address, created }, created ? 201 : 200);
    }
    const wm = p.match(/^\/api\/wallets\/(\w+)$/);
    if (wm) return state.tracked.has(wm[1]!) ? json(route, walletDetail(wm[1]!, wm[1] !== W.fresh)) : json(route, { error: 'not_tracked' }, 404);
    if (p === '/api/tokens/hot') return json(route, HOT);
    if (p.endsWith('/flow')) return json(route, FLOW);
    if (p === '/api/limit/orders') return json(route, state.orders);
    if (p === '/api/limit/create') {
      const b = req.postDataJSON() as Record<string, string>;
      if (b.makingAmount === '1') return json(route, { error: 'limit_rejected', detail: 'Order size must be at least 5 USD' }, 400);
      const order = W.fresh;
      state.orders.push({ order, inputMint: b.inputMint, outputMint: b.outputMint, makingAmount: b.makingAmount, takingAmount: b.takingAmount, remainingMakingAmount: b.makingAmount, createdAt: new Date().toISOString(), expiredAt: null, status: 'Open' });
      return json(route, { transaction: 'AQID', order });
    }
    if (p === '/api/limit/cancel') {
      const b = req.postDataJSON() as { order: string };
      state.orders = state.orders.filter((o) => o.order !== b.order);
      return json(route, { transaction: 'AQID' });
    }
    if (p === '/api/tokens/search') return json(route, [{ ...MEME, verified: true }]);
    const tm = p.match(/^\/api\/tokens\/(\w+)$/);
    if (tm) return tm[1] === M.meme ? json(route, tokenDetail(MEME)) : tm[1] === M.rug ? json(route, tokenDetail(RUG, true)) : json(route, { error: 'not_found' }, 404);
    if (p === '/api/swap/quote') return json(route, quoteFor(url.searchParams));
    if (p === '/api/swap/build') {
      const b = req.postDataJSON() as Record<string, string | number>;
      // The price runs away from anything under 3% slippage.
      if (state.slippageNeeded && Number(b.slippageBps) < state.slippageNeeded) return json(route, { error: 'slippage', detail: 'Error Message: Slippage tolerance exceeded.' }, 400);
      return json(route, { transaction: 'AQID', quote: quoteFor(new URLSearchParams(b as Record<string, string>)), lastValidBlockHeight: 1 });
    }
    if (p.startsWith('/api/tx/')) return json(route, { status: 'confirmed' });
    if (p.startsWith('/api/wallet/') && p.endsWith('/balances')) return json(route, { [SOL]: 2.5, [M.meme]: 50_000 });
    if (p === '/api/status')
      return json(route, {
        checkedAt: new Date().toISOString(),
        api: 'OK',
        rpc: { state: 'OK', slot: 1, latencyMs: 80 },
        tracker: { state: 'OK', lagSec: 4, wallets: opts.empty ? 0 : 2, live: true },
        lastTradeAt: iso(1),
        discovery: { running: !!opts.empty, checked: opts.empty ? 37 : 120, found: opts.empty ? 0 : 2, lastRunAt: iso(5), paused: false },
        swaps: 'OK',
      });
    return json(route, { error: 'not_found' }, 404);
  });
  return state;
}

/** A Wallet Standard wallet named Phantom: approves connects and "sends" whatever it is asked to sign. */
export async function fakePhantom(page: Page, address = W.me) {
  await page.addInitScript((addr) => {
    const acct = { address: addr, publicKey: new Uint8Array(32), chains: ['solana:mainnet'], features: [] };
    const wallet = {
      version: '1.0.0',
      name: 'Phantom',
      icon: 'data:image/svg+xml;base64,PHN2Zy8+',
      chains: ['solana:mainnet'],
      accounts: [] as unknown[],
      features: {
        'solana:signAndSendTransaction': {
          version: '1.0.0',
          supportedTransactionVersions: [0],
          signAndSendTransaction: async () => {
            const w = window as unknown as { signs: number; signMode?: string };
            w.signs = (w.signs ?? 0) + 1;
            if (w.signMode === 'reject') throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
            return [{ signature: new Uint8Array(64).fill(7) }];
          },
        },
        'standard:connect': {
          version: '1.0.0',
          connect: async () => {
            wallet.accounts = [acct];
            return { accounts: wallet.accounts };
          },
        },
        'standard:events': { version: '1.0.0', on: () => () => {} },
      },
    };
    window.addEventListener('wallet-standard:app-ready', (e) => (e as CustomEvent).detail.register(wallet));
  }, address);
}
