/**
 * Verified stock list: reads the owner's stocks.json, checks every entry on
 * the chain and against the price and swap APIs, and writes the result to
 * StockAsset / QuoteToken. Addresses only ever come from that file, which the
 * owner fills from the issuer's official list; nothing here knows a mint.
 */
import { z } from 'zod';
import { AddressSchema, LogoUriSchema, type TokenInfo } from '@oxbow/shared';
import type { PrismaClient } from '@oxbow/db';
import { lookupToken, type AccountReader } from '@oxbow/solana/token';
import { SOL_MINT } from '@oxbow/solana/rpc';
import type { PriceSource } from './prices';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB color');
const SourceUrl = z.string().url('Paste the URL of the official list you copied this mint from');

export const StockEntrySchema = z
  .object({
    symbol: z.string().regex(/^[A-Za-z0-9.]{1,12}$/),
    name: z.string().trim().min(1).max(64),
    issuer: z.string().trim().min(1).max(64),
    mint: AddressSchema,
    /** Where the owner copied the mint from (issuer's official list). */
    source: SourceUrl,
    /** Expected decimals, cross-checked against the mint when given. */
    decimals: z.number().int().min(0).max(18).optional(),
    priceSource: z.enum(['jupiter', 'pyth']),
    priceFeedId: z
      .string()
      .regex(/^(0x)?[0-9a-fA-F]{64}$/, 'Expected a 32-byte hex Pyth feed id')
      .nullable()
      .optional(),
    brandColorA: Hex,
    brandColorB: Hex,
    monogram: z.string().trim().min(1).max(3),
    logoUri: LogoUriSchema.nullable().optional(),
    minLiquidityUsd: z.number().nonnegative().default(0),
    notice: z.string().trim().max(200).nullable().optional(),
    enabled: z.boolean().default(true),
  })
  .refine((s) => s.priceSource !== 'pyth' || !!s.priceFeedId, { message: 'priceFeedId is required when priceSource is "pyth"', path: ['priceFeedId'] });
export type StockEntry = z.infer<typeof StockEntrySchema>;

export const StocksFileSchema = z
  .object({
    quotes: z.object({ USDC: z.object({ mint: AddressSchema, source: SourceUrl }) }),
    stocks: z.array(StockEntrySchema).min(1),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.stocks.forEach((s, i) => {
      for (const key of [`sym:${s.symbol.toUpperCase()}`, `mint:${s.mint}`]) {
        if (seen.has(key)) ctx.addIssue({ code: 'custom', path: ['stocks', i], message: `Duplicate ${key.split(':')[0] === 'sym' ? 'symbol' : 'mint'}` });
        seen.add(key);
      }
      if (s.mint === f.quotes.USDC.mint || s.mint === SOL_MINT) ctx.addIssue({ code: 'custom', path: ['stocks', i, 'mint'], message: 'Same mint as a quote token' });
    });
  });
export type StocksFile = z.infer<typeof StocksFileSchema>;

/** Swap size the liquidity check quotes, and the most price impact it accepts. */
export const LIQUIDITY_CHECK_USD = 1000;
export const MAX_IMPACT_PCT = 2;

/** Buys a stock with USDC through the swap aggregator; returns the stock amount (UI units) or null. */
export type QuoteFn = (inputMint: string, outputMint: string, amountRaw: bigint) => Promise<{ outAmountRaw: bigint } | null>;

export interface CheckDeps {
  rpc: AccountReader;
  prices: PriceSource;
  quote: QuoteFn;
  fetchJson?: (url: string) => Promise<unknown | null>;
  ipfsGateway?: string;
}

export interface CheckResult {
  entry: StockEntry;
  token: TokenInfo | null;
  priceUsd: number | null;
  impactPct: number | null;
  /** Problems that stop the entry from being written at all. */
  errors: string[];
  /** Problems that keep it listed but disabled until fixed. */
  failures: string[];
  /** Worth a look, no effect. */
  warnings: string[];
}

export interface QuoteCheck {
  kind: 'SOL' | 'USDC';
  mint: string;
  token: TokenInfo | null;
  errors: string[];
  warnings: string[];
}

async function readMint(deps: CheckDeps, mint: string): Promise<{ token: TokenInfo | null; error: string | null }> {
  const r = await lookupToken(deps.rpc, mint, { fetchJson: deps.fetchJson, ipfsGateway: deps.ipfsGateway });
  if (r.status === 'not_found') return { token: null, error: 'Mint account not found on this cluster' };
  if (r.status === 'not_a_mint') return { token: null, error: 'Account is not an SPL / Token-2022 mint' };
  return { token: r.token, error: null };
}

export async function checkQuotes(deps: CheckDeps, file: StocksFile): Promise<QuoteCheck[]> {
  const out: QuoteCheck[] = [];
  for (const [kind, mint, decimals] of [
    ['SOL', SOL_MINT, 9],
    ['USDC', file.quotes.USDC.mint, 6],
  ] as const) {
    const { token, error } = await readMint(deps, mint);
    const errors = error ? [error] : [];
    const warnings: string[] = [];
    if (token && token.decimals !== decimals) errors.push(`Expected ${decimals} decimals, mint has ${token.decimals}`);
    if (token && kind === 'USDC' && token.symbol.toUpperCase() !== 'USDC') warnings.push(`On-chain symbol is "${token.symbol}"`);
    out.push({ kind, mint, token, errors, warnings });
  }
  return out;
}

export async function checkStocks(deps: CheckDeps, file: StocksFile): Promise<CheckResult[]> {
  const usdc = file.quotes.USDC.mint;
  const prices = await deps.prices.prices(file.stocks.map((s) => ({ mint: s.mint, source: s.priceSource, feedId: s.priceFeedId ?? null })));
  const results: CheckResult[] = [];
  for (const entry of file.stocks) {
    const errors: string[] = [];
    const failures: string[] = [];
    const warnings: string[] = [];
    const { token, error } = await readMint(deps, entry.mint);
    if (error) errors.push(error);
    if (token) {
      if (entry.decimals !== undefined && token.decimals !== entry.decimals) errors.push(`Expected ${entry.decimals} decimals, mint has ${token.decimals}`);
      if (token.symbol.toUpperCase() !== entry.symbol.toUpperCase()) warnings.push(`On-chain symbol is "${token.symbol}"`);
      if (token.risk.transferFee) warnings.push('Mint charges a transfer fee');
      if (token.risk.transferHook) warnings.push('Mint has a transfer hook');
    }
    const price = prices.get(entry.mint)?.usd ?? null;
    if (!price) failures.push(`No price from ${entry.priceSource}`);

    let impactPct: number | null = null;
    if (token && price) {
      try {
        const q = await deps.quote(usdc, entry.mint, BigInt(LIQUIDITY_CHECK_USD) * 1_000_000n);
        if (!q || q.outAmountRaw <= 0n) failures.push(`No swap route for $${LIQUIDITY_CHECK_USD}`);
        else {
          const got = Number(q.outAmountRaw) / 10 ** token.decimals;
          const paid = LIQUIDITY_CHECK_USD / got;
          impactPct = Math.max(0, ((paid - price) / price) * 100);
          if (impactPct >= MAX_IMPACT_PCT) failures.push(`$${LIQUIDITY_CHECK_USD} buy moves the price ${impactPct.toFixed(2)}% (max ${MAX_IMPACT_PCT}%)`);
        }
      } catch (e) {
        failures.push(`Swap quote failed: ${(e as Error).message}`);
      }
    }
    results.push({ entry, token, priceUsd: price, impactPct, errors, failures, warnings });
  }
  return results;
}

/** Writes checked entries. Entries with errors are skipped; stocks missing from the file are disabled. */
export async function writeStocks(db: PrismaClient, quotes: QuoteCheck[], results: CheckResult[], now = new Date()): Promise<{ written: number; disabled: number }> {
  if (quotes.some((q) => q.errors.length)) throw new Error('Quote tokens failed their checks; nothing written');
  const ok = results.filter((r) => !r.errors.length && r.token);
  return db.$transaction(async (tx) => {
    for (const q of quotes) {
      const t = q.token!;
      const data = { mint: q.mint, symbol: q.kind, name: q.kind === 'SOL' ? 'Solana' : t.name || 'USD Coin', decimals: t.decimals, logoUri: null };
      await tx.quoteToken.deleteMany({ where: { kind: q.kind, NOT: { mint: q.mint } } });
      await tx.quoteToken.upsert({ where: { mint: q.mint }, create: { ...data, kind: q.kind }, update: data });
    }
    // Free symbols that move to a different mint before upserting.
    for (const r of ok) await tx.stockAsset.deleteMany({ where: { symbol: r.entry.symbol, NOT: { mint: r.entry.mint } } });
    for (const [i, r] of results.entries()) {
      if (r.errors.length || !r.token) continue;
      const e = r.entry;
      const passed = !r.failures.length;
      const data = {
        symbol: e.symbol,
        name: e.name,
        issuer: e.issuer,
        decimals: r.token.decimals,
        tokenProgram: r.token.tokenProgram,
        priceSource: e.priceSource,
        priceFeedId: e.priceFeedId ?? null,
        brandColorA: e.brandColorA,
        brandColorB: e.brandColorB,
        monogram: e.monogram,
        logoUri: e.logoUri ?? r.token.logoUri,
        minLiquidityUsd: e.minLiquidityUsd,
        notice: e.notice ?? null,
        enabled: e.enabled && passed,
        verifiedAt: passed ? now : null,
        checkNote: passed ? null : r.failures.join('; '),
        sortOrder: i,
      };
      await tx.stockAsset.upsert({ where: { mint: e.mint }, create: { mint: e.mint, ...data }, update: data });
    }
    const { count } = await tx.stockAsset.updateMany({
      where: { mint: { notIn: results.map((r) => r.entry.mint) }, enabled: true },
      data: { enabled: false, checkNote: 'Not in stocks.json' },
    });
    return { written: ok.length, disabled: count };
  });
}

const JupiterQuote = z.object({ outAmount: z.string().regex(/^\d+$/) }).passthrough();

/** Jupiter swap quote (ExactIn). The host comes from config. */
export function jupiterQuote(base: string): QuoteFn {
  return async (inputMint, outputMint, amountRaw) => {
    const url = `${base.replace(/\/$/, '')}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=100&swapMode=ExactIn`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/json' } });
    if (res.status === 400 || res.status === 404) return null;
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
    const q = JupiterQuote.parse(await res.json());
    return { outAmountRaw: BigInt(q.outAmount) };
  };
}
