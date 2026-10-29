import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { Keypair, PublicKey, type AccountInfo } from '@solana/web3.js';
import { MINT_SIZE, MintLayout, NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createDb, type PrismaClient } from '@oxbow/db';
import { checkQuotes, checkStocks, StocksFileSchema, writeStocks, type CheckDeps, type QuoteFn, type StocksFile } from '../src/seed';
import type { PriceRequest } from '../src/prices';
import { TEST_DATABASE_URL } from './global-setup';

function mint(decimals: number, program = TOKEN_PROGRAM_ID): AccountInfo<Buffer> {
  // Token-2022 mints without extensions are laid out like classic ones.
  const data = Buffer.alloc(MINT_SIZE);
  MintLayout.encode(
    { mintAuthorityOption: 0, mintAuthority: PublicKey.default, supply: 10n ** 12n, decimals, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default },
    data,
  );
  return { owner: program, data, executable: false, lamports: 1, rentEpoch: 0 };
}

const key = () => Keypair.generate().publicKey.toBase58();
const USDC = key();
const A = key();
const B = key();
const C = key();

const entry = (symbol: string, m: string, extra: Partial<StocksFile['stocks'][number]> = {}) => ({
  symbol,
  name: `${symbol} xStock`,
  issuer: 'xStocks',
  mint: m,
  source: 'https://issuer.example/list',
  priceSource: 'jupiter' as const,
  brandColorA: '#112233',
  brandColorB: '#445566',
  monogram: symbol[0]!,
  ...extra,
});

function deps(over: { prices?: Record<string, number>; out?: Record<string, bigint | null> } = {}): CheckDeps {
  const accounts = new Map([
    [NATIVE_MINT.toBase58(), mint(9)],
    [USDC, mint(6)],
    [A, mint(8, TOKEN_2022_PROGRAM_ID)],
    [B, mint(8)],
  ]);
  const prices = over.prices ?? { [A]: 100, [B]: 50 };
  // $1,000 buys 9.9 of A (1% over $100) and 18 of B (11% over $50) by default.
  const out = over.out ?? { [A]: 990_000_000n, [B]: 1_800_000_000n };
  const quote: QuoteFn = async (_in, outMint) => (out[outMint] == null ? null : { outAmountRaw: out[outMint]! });
  return {
    rpc: { getAccountInfo: async (k: PublicKey) => accounts.get(k.toBase58()) ?? null },
    prices: { prices: async (req: PriceRequest[]) => new Map(req.filter((r) => prices[r.mint]).map((r) => [r.mint, { usd: prices[r.mint]!, change24h: null, updatedAt: 0 }])) },
    quote,
  };
}

describe('stocks.json', () => {
  it('requires a mint, a source URL and a Pyth feed id for Pyth prices', () => {
    const bad = StocksFileSchema.safeParse({
      quotes: { USDC: { mint: '', source: '' } },
      stocks: [entry('TSLAx', ''), entry('NVDAx', A, { priceSource: 'pyth' })],
    });
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['quotes.USDC.mint', 'quotes.USDC.source', 'stocks.0.mint', 'stocks.1.priceFeedId']));
  });

  it('rejects duplicate symbols and mints, and stocks reusing a quote mint', () => {
    const r = StocksFileSchema.safeParse({
      quotes: { USDC: { mint: USDC, source: 'https://circle.example' } },
      stocks: [entry('TSLAx', A), entry('tslax', B), entry('X', A), entry('Y', USDC)],
    });
    expect(r.success).toBe(false);
    expect(r.error!.issues.map((i) => i.message)).toEqual(expect.arrayContaining(['Duplicate symbol', 'Duplicate mint', 'Same mint as a quote token']));
  });
});

describe('stock checks', () => {
  const file = StocksFileSchema.parse({
    quotes: { USDC: { mint: USDC, source: 'https://circle.example' } },
    stocks: [entry('AAAx', A, { decimals: 8 }), entry('BBBx', B), entry('CCCx', C)],
  });

  it('checks quote tokens', async () => {
    const q = await checkQuotes(deps(), file);
    expect(q.map((x) => [x.kind, x.errors])).toEqual([
      ['SOL', []],
      ['USDC', []],
    ]);
  });

  it('separates hard errors, liquidity failures and passes', async () => {
    const [a, b, c] = await checkStocks(deps(), file);
    expect(a).toMatchObject({ errors: [], failures: [], priceUsd: 100 });
    expect(a!.impactPct).toBeCloseTo(1.0101, 3);
    expect(a!.token?.tokenProgram).toBe('token-2022');
    expect(b!.errors).toEqual([]);
    expect(b!.failures[0]).toMatch(/moves the price 11\.11%/);
    expect(c!.errors).toEqual(['Mint account not found on this cluster']);
  });

  it('fails stocks with no price or no route', async () => {
    const [a, b] = await checkStocks(deps({ prices: { [B]: 50 }, out: { [B]: null } }), file);
    expect(a!.failures).toEqual(['No price from jupiter']);
    expect(b!.failures).toEqual(['No swap route for $1000']);
  });
});

describe.skipIf(!inject('servicesReady'))('writing stocks', () => {
  let db: PrismaClient;
  beforeAll(async () => {
    db = createDb(TEST_DATABASE_URL);
    await db.$executeRawUnsafe('TRUNCATE "Trade", "PoolSnapshot", "LiquidityEvent", "Pool", "Token", "StockSnapshot", "StockAsset", "QuoteToken" RESTART IDENTITY CASCADE');
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('writes verified stocks enabled, failing ones disabled with a note, skips errors, and disables stocks dropped from the file', async () => {
    await db.stockAsset.create({ data: { mint: key(), symbol: 'OLDx', name: 'Old', issuer: 'x', decimals: 8, tokenProgram: 'spl-token', priceSource: 'jupiter', brandColorA: '#000000', brandColorB: '#000000', monogram: 'O' } });
    const file = StocksFileSchema.parse({
      quotes: { USDC: { mint: USDC, source: 'https://circle.example' } },
      stocks: [entry('AAAx', A, { notice: 'Split 2:1' }), entry('BBBx', B), entry('CCCx', C)],
    });
    const d = deps();
    const res = await writeStocks(db, await checkQuotes(d, file), await checkStocks(d, file), new Date('2026-10-29T00:00:00Z'));
    expect(res).toEqual({ written: 2, disabled: 1 });
    const rows = await db.stockAsset.findMany({ orderBy: { symbol: 'asc' } });
    expect(rows.map((r) => [r.symbol, r.enabled, r.sortOrder])).toEqual([
      ['AAAx', true, 0],
      ['BBBx', false, 1],
      ['OLDx', false, 0],
    ]);
    expect(rows[0]).toMatchObject({ tokenProgram: 'token-2022', decimals: 8, notice: 'Split 2:1', checkNote: null });
    expect(rows[0]!.verifiedAt?.toISOString()).toBe('2026-10-29T00:00:00.000Z');
    expect(rows[1]!.checkNote).toMatch(/moves the price/);
    expect(rows[2]!.checkNote).toBe('Not in stocks.json');
    const quotes = await db.quoteToken.findMany({ orderBy: { kind: 'asc' } });
    expect(quotes.map((q) => [q.kind, q.mint, q.decimals])).toEqual([
      ['SOL', NATIVE_MINT.toBase58(), 9],
      ['USDC', USDC, 6],
    ]);

    // A re-run with a new USDC mint and a symbol moved to another mint replaces both.
    const usdc2 = key();
    const d2 = deps();
    (d2.rpc as { getAccountInfo: (k: PublicKey) => Promise<AccountInfo<Buffer> | null> }).getAccountInfo = async (k) =>
      k.toBase58() === usdc2 ? mint(6) : k.toBase58() === C ? mint(8) : deps().rpc.getAccountInfo(k);
    const file2 = StocksFileSchema.parse({ quotes: { USDC: { mint: usdc2, source: 'https://circle.example' } }, stocks: [entry('AAAx', C)] });
    await writeStocks(db, await checkQuotes(d2, file2), await checkStocks({ ...d2, prices: deps({ prices: { [C]: 10 } }).prices, quote: async () => ({ outAmountRaw: 100n * 10n ** 8n }) }, file2));
    expect((await db.stockAsset.findUnique({ where: { symbol: 'AAAx' } }))?.mint).toBe(C);
    expect((await db.quoteToken.findUnique({ where: { kind: 'USDC' } }))?.mint).toBe(usdc2);
  });

  it('refuses to write anything when a quote token fails', async () => {
    const file = StocksFileSchema.parse({ quotes: { USDC: { mint: key(), source: 'https://circle.example' } }, stocks: [entry('AAAx', A)] });
    const d = deps();
    await expect(writeStocks(db, await checkQuotes(d, file), await checkStocks(d, file))).rejects.toThrow(/nothing written/);
  });
});
