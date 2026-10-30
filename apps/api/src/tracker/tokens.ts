/**
 * What Oxbow knows about each token, kept in TokenMeta: Jupiter's data first,
 * the chain when Jupiter has never heard of the token (brand-new launches),
 * and, when both fail, a placeholder from the decimals seen in the
 * transaction so a trade is never lost for want of a name.
 */
import type { PrismaClient, TokenMeta } from '@oxbow/db';
import type { TokenBrief } from '@oxbow/shared';
import { lookupToken, type AccountReader } from '@oxbow/solana/token';
import type { Jupiter, JupiterToken } from '../jupiter';
import { WSOL } from './parse';

export type { TokenMeta };

export interface TokenBookOptions {
  /** On-chain fallback for tokens Jupiter doesn't list. */
  chain?: AccountReader | null;
  fetchJson?: (url: string) => Promise<unknown | null>;
  ipfsGateway?: string;
  log?: (msg: string) => void;
  now?: () => number;
}

/** How old token data may be before it is fetched again, by use. */
export const STALE = {
  /** Token page: prices and audit facts. */
  page: 2 * 60_000,
  /** Lists, holdings and PnL. */
  list: 5 * 60_000,
  /** Reading trades: only names, decimals and the stablecoin flag matter. */
  ingest: 6 * 3_600_000,
} as const;

const SOL_PRICE_MS = 30_000;
const SOL_PRICE_MAX_AGE_MS = 3_600_000;
/** A stand-in row (Jupiter didn't know the token) is asked about again after this long. */
const STAND_IN_RETRY_MS = 10 * 60_000;

/**
 * USD value of one unit of a trade's quote token: SOL at `solUsd`, a stablecoin at its
 * price (or $1), anything else at its listed price. Null when there is no price.
 */
export function quoteUsd(quoteMint: string, metas: ReadonlyMap<string, TokenMeta>, solUsd: number | null): number | null {
  if (quoteMint === WSOL) return solUsd;
  const q = metas.get(quoteMint);
  return q?.stable ? (q.usdPrice ?? 1) : (q?.usdPrice ?? null);
}

export class TokenBook {
  private solUsd: { usd: number; at: number } | null = null;

  constructor(
    private readonly db: PrismaClient,
    private readonly jup: Jupiter,
    private readonly opts: TokenBookOptions = {},
  ) {}

  private now() {
    return (this.opts.now ?? Date.now)();
  }

  /**
   * Token rows for `mints`, fetching any that are missing or older than `staleMs`.
   * `decimals` holds what transactions said, for tokens no source can name.
   */
  async get(mints: Iterable<string>, staleMs: number, decimals: ReadonlyMap<string, number> = new Map()): Promise<Map<string, TokenMeta>> {
    const want = [...new Set(mints)];
    const out = new Map<string, TokenMeta>();
    if (!want.length) return out;
    for (const r of await this.db.tokenMeta.findMany({ where: { mint: { in: want } } })) out.set(r.mint, r);
    // Stand-ins for tokens Jupiter doesn't list are asked about again every ten minutes; ones saved while
    // Jupiter was failing ("outage") every time.
    const todo = want.filter((m) => {
      const r = out.get(m);
      if (!r || r.source === 'outage') return true;
      return r.updatedAt.getTime() < this.now() - (r.source === 'jupiter' ? staleMs : STAND_IN_RETRY_MS);
    });
    if (!todo.length) return out;

    const fetched = new Map<string, JupiterToken>();
    const failed = new Set<string>();
    for (let i = 0; i < todo.length; i += 100) {
      const batch = todo.slice(i, i + 100);
      try {
        for (const t of await this.jup.tokens(batch)) fetched.set(t.mint, t);
      } catch (e) {
        batch.forEach((m) => failed.add(m));
        this.opts.log?.(`Jupiter token data unavailable: ${(e as Error).message}`);
      }
    }
    for (const t of fetched.values()) out.set(t.mint, await this.save(t, 'jupiter'));

    // Never seen and unknown to Jupiter (or Jupiter unreachable): ask the chain, else keep what the transaction said.
    // A row we already have is kept as it is: stale data beats a stand-in.
    for (const mint of todo) {
      if (fetched.has(mint)) continue;
      const have = out.get(mint);
      // Keep what we have, except an outage stand-in once Jupiter has answered without listing the token.
      if (have && (have.source !== 'outage' || failed.has(mint))) continue;
      const row = (await this.fromChain(mint)) ?? (decimals.has(mint) ? placeholder(mint, decimals.get(mint)!) : null);
      // Jupiter failing says nothing about the token (it may be a stablecoin it would flag): mark it so.
      if (row) out.set(mint, await this.save(row, failed.has(mint) ? 'outage' : row.name || row.logoUri ? 'chain' : 'tx'));
    }
    return out;
  }

  /**
   * SOL's USD price from Jupiter, refreshed every 30 s. While Jupiter can't be reached the
   * last price is used for up to an hour; after that, null (and trades wait to be priced).
   */
  async solPrice(): Promise<number | null> {
    if (this.solUsd && this.now() - this.solUsd.at < SOL_PRICE_MS) return this.solUsd.usd;
    const row = (await this.get([WSOL], SOL_PRICE_MS)).get(WSOL);
    if (!row?.usdPrice || row.source !== 'jupiter' || this.now() - row.updatedAt.getTime() > SOL_PRICE_MAX_AGE_MS) return null;
    // (An "outage" stand-in never replaces a stored Jupiter row: rows we have are kept as they are.)
    if (this.now() - row.updatedAt.getTime() < SOL_PRICE_MS) this.solUsd = { usd: row.usdPrice, at: this.now() };
    return row.usdPrice;
  }

  private async fromChain(mint: string): Promise<JupiterToken | null> {
    if (!this.opts.chain) return null;
    try {
      const r = await lookupToken(this.opts.chain, mint, { fetchJson: this.opts.fetchJson, ipfsGateway: this.opts.ipfsGateway });
      if (r.status !== 'found') return null;
      const t = r.token;
      return { ...placeholder(mint, t.decimals), symbol: t.symbol, name: t.name, logoUri: t.logoUri, mintAuthorityOff: !t.risk.mintable, freezeAuthorityOff: !t.risk.freezable };
    } catch {
      return null;
    }
  }

  private save(t: JupiterToken, source: 'jupiter' | 'chain' | 'tx' | 'outage'): Promise<TokenMeta> {
    const data = { ...t, source, updatedAt: new Date(this.now()) };
    return this.db.tokenMeta.upsert({ where: { mint: t.mint }, create: data, update: data });
  }
}

function placeholder(mint: string, decimals: number): JupiterToken {
  return {
    mint,
    symbol: mint.slice(0, 4),
    name: '',
    decimals,
    logoUri: null,
    verified: false,
    stable: false,
    usdPrice: null,
    change24h: null,
    mcap: null,
    liquidity: null,
    holderCount: null,
    organicScore: null,
    mintAuthorityOff: null,
    freezeAuthorityOff: null,
    topHoldersPct: null,
    devPct: null,
    launchedAt: null,
  };
}

/** SOL shows its own logo even if Jupiter's is missing. */
export function brief(t: TokenMeta | undefined, mint: string): TokenBrief {
  if (!t) return { mint, symbol: mint.slice(0, 4), name: '', logoUri: mint === WSOL ? '/tokens/sol.svg' : null, decimals: 0, verified: false };
  return { mint, symbol: t.symbol, name: t.name, logoUri: t.logoUri ?? (mint === WSOL ? '/tokens/sol.svg' : null), decimals: t.decimals, verified: t.verified };
}
