/**
 * Test data: two stocks, SOL and USDC, three tokens and three pools (one per
 * pair kind) with snapshots, trades and liquidity events. Every address is a
 * random key made for the run. Used by the API tests and, through
 * scripts/e2e-fixtures.ts, by the web app's live-data end-to-end tests.
 */
import { Keypair } from '@solana/web3.js';
import type { PrismaClient } from '@oxbow/db';
import { SOL_MINT } from '@oxbow/solana/rpc';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const addr = () => Keypair.generate().publicKey.toBase58();
export const sig = () => Buffer.from(Keypair.generate().secretKey).toString('base64url').replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'x').slice(0, 88);

export function makeIds() {
  return {
    M: { tsla: addr(), nvda: addr(), usdc: addr(), bonk: addr(), wif: addr(), fake: addr() },
    P: { stock: addr(), sol: addr(), usdc: addr() },
    creator: addr(),
    trader: addr(),
  };
}
export type Ids = ReturnType<typeof makeIds>;

export async function seedFixtures(db: PrismaClient, NOW: number, ids: Ids = makeIds()): Promise<Ids> {
  const { M, P, creator, trader } = ids;
  await db.$executeRawUnsafe(
    'TRUNCATE "Trade", "PoolSnapshot", "LiquidityEvent", "Pool", "Token", "StockSnapshot", "StockAsset", "QuoteToken" RESTART IDENTITY CASCADE',
  );
  await db.stockAsset.createMany({
    data: [
      { mint: M.tsla, symbol: 'TSLAx', name: 'Tesla xStock', issuer: 'Backed', decimals: 8, tokenProgram: 'token-2022', priceSource: 'jupiter', brandColorA: '#E82127', brandColorB: '#8A0E12', monogram: 'T', sortOrder: 0 },
      { mint: M.nvda, symbol: 'NVDAx', name: 'NVIDIA xStock', issuer: 'Backed', decimals: 8, tokenProgram: 'token-2022', priceSource: 'pyth', priceFeedId: 'ab'.repeat(32), brandColorA: '#76B900', brandColorB: '#3E6200', monogram: 'N', sortOrder: 1, notice: 'Stock split 10:1 on Nov 3' },
    ],
  });
  await db.quoteToken.createMany({
    data: [
      { mint: SOL_MINT, kind: 'SOL', symbol: 'SOL', name: 'Solana', decimals: 9 },
      { mint: M.usdc, kind: 'USDC', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    ],
  });
  const risk = { mintable: false, freezable: false, transferFee: false, transferHook: false, permanentDelegate: false };
  await db.token.createMany({
    data: [
      { mint: M.bonk, symbol: 'BONK', name: 'Bonk', decimals: 5, supply: 1e9, tokenProgram: 'spl-token', risk, mintCreatedAt: new Date(NOW - 300 * DAY), holderCount: 900, top10Pct: 20 },
      { mint: M.wif, symbol: 'WIF', name: 'dogwifhat', decimals: 6, supply: 1e8, tokenProgram: 'spl-token', mintAuthority: creator, risk: { ...risk, mintable: true }, mintCreatedAt: new Date(NOW - DAY), holderCount: 40, top10Pct: 70 },
      // Same symbol as a verified stock: an impersonation attempt.
      { mint: M.fake, symbol: 'tslax', name: 'Totally Tesla', decimals: 6, supply: 1e6, tokenProgram: 'spl-token', risk, mintCreatedAt: new Date(NOW - 10 * DAY) },
    ],
  });
  const pool = (o: { address: string; baseMint: string; quoteMint: string; quoteKind: 'STOCK' | 'SOL' | 'USDC'; tvl: number; vol: number; chg: number; price: number; lp: 'BURNED' | 'LOCKED' | 'UNLOCKED'; ageDays: number }) => ({
    address: o.address,
    venue: 'RAYDIUM_CPMM' as const,
    baseMint: o.baseMint,
    quoteMint: o.quoteMint,
    quoteKind: o.quoteKind,
    feeBps: 25,
    creator,
    createdTx: sig(),
    createdAt: new Date(NOW - o.ageDays * DAY),
    lpStatus: o.lp,
    lpLockedPct: o.lp === 'UNLOCKED' ? 0 : 100,
    reserveBase: o.tvl / 2 / o.price,
    reserveQuote: 1000,
    priceUsd: o.price,
    tvlUsd: o.tvl,
    vol24hUsd: o.vol,
    change24h: o.chg,
    buys24h: 10,
    sells24h: 5,
    holders: [{ kind: 'BURNED', pct: 100, unlockAt: null, proof: { kind: 'tx', id: sig() } }, { kind: 'OTHER', pct: 'junk' }],
  });
  await db.pool.createMany({
    data: [
      pool({ address: P.stock, baseMint: M.bonk, quoteMint: M.tsla, quoteKind: 'STOCK', tvl: 200_000, vol: 50_000, chg: 12, price: 0.00002, lp: 'BURNED', ageDays: 20 }),
      pool({ address: P.sol, baseMint: M.wif, quoteMint: SOL_MINT, quoteKind: 'SOL', tvl: 4_000, vol: 9_000, chg: -3, price: 1.8, lp: 'UNLOCKED', ageDays: 1 }),
      pool({ address: P.usdc, baseMint: M.fake, quoteMint: M.usdc, quoteKind: 'USDC', tvl: 80_000, vol: 1_000, chg: 40, price: 0.5, lp: 'LOCKED', ageDays: 5 }),
    ],
  });
  // Hourly snapshots over the last day for the stock pool.
  await db.poolSnapshot.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({ poolAddress: P.stock, ts: new Date(NOW - (23 - i) * HOUR - 5 * 60_000), priceUsd: 0.00001 + i * 0.0000005, tvlUsd: 190_000 + i * 400, volUsd: 2000 })),
  });
  await db.trade.createMany({
    data: [
      { sig: sig(), poolAddress: P.stock, ts: new Date(NOW - 60_000), side: 'BUY', trader, amountUsd: 500, baseAmount: 25_000_000, quoteAmount: 2 },
      { sig: sig(), poolAddress: P.stock, ts: new Date(NOW - 120_000), side: 'SELL', trader: addr(), amountUsd: 100, baseAmount: 5_000_000, quoteAmount: 0.4 },
      { sig: sig(), poolAddress: P.sol, ts: new Date(NOW - 30_000), side: 'BUY', trader, amountUsd: 50, baseAmount: 27, quoteAmount: 0.27 },
    ],
  });
  await db.liquidityEvent.createMany({
    data: [
      { sig: sig(), poolAddress: P.sol, ts: new Date(NOW - DAY), kind: 'CREATE', wallet: creator, amountUsd: 4000 },
      { sig: sig(), poolAddress: P.usdc, ts: new Date(NOW - 5 * DAY), kind: 'CREATE', wallet: creator, amountUsd: 80_000 },
      // The creator pulled liquidity from one of their pools.
      { sig: sig(), poolAddress: P.usdc, ts: new Date(NOW - 2 * DAY), kind: 'REMOVE', wallet: creator, amountUsd: 10_000 },
      { sig: sig(), poolAddress: P.stock, ts: new Date(NOW - HOUR), kind: 'ADD', wallet: trader, amountUsd: 1_000 },
    ],
  });
  return ids;
}
