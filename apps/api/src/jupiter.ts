/**
 * Jupiter's public APIs: token data (names, logos, prices, audit facts),
 * token search, swap quotes and swap instructions. Every response is parsed;
 * fields Jupiter leaves out come back as null rather than guesses.
 */
import { z } from 'zod';
import { AddressSchema, LogoUriSchema } from '@oxbow/shared';
import type { JupiterSwapInstructions } from '@oxbow/solana/swap';

const num = z.number().finite().nullish();

const TokenRow = z
  .object({
    id: AddressSchema,
    symbol: z.string().max(64),
    name: z.string().max(128),
    icon: z.string().nullish(),
    decimals: z.number().int().min(0).max(18),
    holderCount: num,
    mcap: num,
    fdv: num,
    usdPrice: num,
    liquidity: num,
    organicScore: num,
    isVerified: z.boolean().nullish(),
    tags: z.array(z.string()).nullish(),
    stats24h: z.object({ priceChange: num }).passthrough().nullish(),
    firstPool: z.object({ createdAt: z.string().nullish() }).passthrough().nullish(),
    createdAt: z.string().nullish(),
    audit: z
      .object({
        mintAuthorityDisabled: z.boolean().nullish(),
        freezeAuthorityDisabled: z.boolean().nullish(),
        topHoldersPercentage: num,
        devBalancePercentage: num,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/** A token as Oxbow stores it (see TokenMeta in the Prisma schema). */
export interface JupiterToken {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUri: string | null;
  verified: boolean;
  stable: boolean;
  usdPrice: number | null;
  change24h: number | null;
  mcap: number | null;
  liquidity: number | null;
  holderCount: number | null;
  organicScore: number | null;
  mintAuthorityOff: boolean | null;
  freezeAuthorityOff: boolean | null;
  topHoldersPct: number | null;
  devPct: number | null;
  launchedAt: Date | null;
}

/** Strips control characters and caps length: names and symbols are untrusted. */
export const clean = (s: string, max: number) =>
  s
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .trim()
    .slice(0, max);

const pct = (v: number | null | undefined) => (v === null || v === undefined ? null : Math.max(0, Math.min(100, v)));
const date = (v: string | null | undefined) => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t) : null;
};

export function toToken(raw: unknown): JupiterToken | null {
  const r = TokenRow.safeParse(raw);
  if (!r.success) return null;
  const t = r.data;
  const tags = t.tags ?? [];
  return {
    mint: t.id,
    symbol: clean(t.symbol, 32) || t.id.slice(0, 4),
    name: clean(t.name, 64),
    decimals: t.decimals,
    logoUri: t.icon && LogoUriSchema.safeParse(t.icon).success ? t.icon : null,
    verified: t.isVerified === true,
    stable: t.isVerified === true && tags.includes('stable'),
    usdPrice: t.usdPrice ?? null,
    change24h: t.stats24h?.priceChange ?? null,
    mcap: t.mcap ?? t.fdv ?? null,
    liquidity: t.liquidity ?? null,
    holderCount: t.holderCount === null || t.holderCount === undefined ? null : Math.max(0, Math.round(t.holderCount)),
    organicScore: pct(t.organicScore),
    mintAuthorityOff: t.audit?.mintAuthorityDisabled ?? null,
    freezeAuthorityOff: t.audit?.freezeAuthorityDisabled ?? null,
    topHoldersPct: pct(t.audit?.topHoldersPercentage),
    devPct: pct(t.audit?.devBalancePercentage),
    launchedAt: date(t.firstPool?.createdAt) ?? date(t.createdAt),
  };
}

export interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: bigint;
  slippageBps: number;
}

/** Jupiter's quote, kept whole: the swap call wants it back unchanged. */
export interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  slippageBps: number;
  routePlan: { swapInfo: { label?: string } }[];
  [k: string]: unknown;
}

const QuoteSchema = z
  .object({
    inputMint: AddressSchema,
    outputMint: AddressSchema,
    inAmount: z.string().regex(/^\d+$/),
    outAmount: z.string().regex(/^\d+$/),
    otherAmountThreshold: z.string().regex(/^\d+$/),
    priceImpactPct: z.string(),
    slippageBps: z.number().int(),
    routePlan: z.array(z.object({ swapInfo: z.object({ label: z.string().optional() }).passthrough() }).passthrough()),
  })
  .passthrough();

const Ix = z.object({
  programId: AddressSchema,
  accounts: z.array(z.object({ pubkey: AddressSchema, isSigner: z.boolean(), isWritable: z.boolean() })),
  data: z.string(),
});
const SwapIxSchema = z.object({
  computeBudgetInstructions: z.array(Ix),
  setupInstructions: z.array(Ix),
  swapInstruction: Ix,
  cleanupInstruction: Ix.nullish(),
  otherInstructions: z.array(Ix).nullish(),
  addressLookupTableAddresses: z.array(AddressSchema),
  computeUnitLimit: z.number().int().positive().nullish(),
});

export interface Jupiter {
  /** Token data by mint, up to 100 per call. Unknown mints are simply missing. */
  tokens(mints: string[]): Promise<JupiterToken[]>;
  /** Search by name, ticker or mint. */
  search(query: string): Promise<JupiterToken[]>;
  quote(p: QuoteParams): Promise<JupiterQuote>;
  swapInstructions(quote: JupiterQuote, wallet: string): Promise<JupiterSwapInstructions>;
}

export class JupiterError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Jupiter ${status}: ${detail}`);
  }
}

/** Accounts per route, kept under Jupiter's default so the fee transfer always fits. */
const MAX_ACCOUNTS = 54;
/** Ceiling on the priority fee Jupiter may pick for a swap, in lamports. */
const MAX_PRIORITY_LAMPORTS = 2_000_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Waits after a 429 before trying again (Jupiter's free tier allows about one request a second). */
const RETRY_MS = [1200, 3000];

/**
 * `apiKey` (from portal.jup.ag) lifts the free tier's rate limit; it goes in
 * the x-api-key header and needs the api.jup.ag base.
 */
export function jupiterClient(base: string, opts: { timeoutMs?: number; apiKey?: string } = {}): Jupiter {
  const root = base.replace(/\/$/, '');
  const timeout = opts.timeoutMs ?? 8000;
  const auth: Record<string, string> = opts.apiKey ? { 'x-api-key': opts.apiKey } : {};

  async function call(path: string, init?: RequestInit): Promise<unknown> {
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      res = await fetch(root + path, {
        ...init,
        signal: AbortSignal.timeout(timeout),
        headers: { accept: 'application/json', ...auth, ...(init?.body ? { 'content-type': 'application/json' } : {}) },
      });
      if (res.status !== 429 || attempt >= RETRY_MS.length) break;
      await res.body?.cancel().catch(() => {});
      await sleep(RETRY_MS[attempt]!);
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON
    }
    if (!res.ok) {
      const msg = (body as { error?: unknown; errorCode?: unknown } | null)?.errorCode ?? (body as { error?: unknown } | null)?.error ?? text.slice(0, 120);
      throw new JupiterError(res.status, String(msg));
    }
    return body;
  }

  const tokenList = (raw: unknown) => (Array.isArray(raw) ? raw.map(toToken).filter((t): t is JupiterToken => !!t) : []);

  return {
    async tokens(mints) {
      if (!mints.length) return [];
      return tokenList(await call(`/tokens/v2/search?query=${mints.slice(0, 100).join(',')}`));
    },
    async search(query) {
      return tokenList(await call(`/tokens/v2/search?query=${encodeURIComponent(query)}`));
    },
    async quote(p) {
      const qs = new URLSearchParams({
        inputMint: p.inputMint,
        outputMint: p.outputMint,
        amount: p.amount.toString(),
        slippageBps: String(p.slippageBps),
        maxAccounts: String(MAX_ACCOUNTS),
      });
      const q = QuoteSchema.safeParse(await call(`/swap/v1/quote?${qs}`));
      if (!q.success) throw new JupiterError(502, 'unexpected quote');
      return q.data as JupiterQuote;
    },
    async swapInstructions(quote, wallet) {
      const body = {
        userPublicKey: wallet,
        quoteResponse: quote,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: MAX_PRIORITY_LAMPORTS, priorityLevel: 'high' } },
      };
      const r = SwapIxSchema.safeParse(await call('/swap/v1/swap-instructions', { method: 'POST', body: JSON.stringify(body) }));
      if (!r.success) throw new JupiterError(502, 'unexpected swap instructions');
      return r.data;
    },
  };
}
