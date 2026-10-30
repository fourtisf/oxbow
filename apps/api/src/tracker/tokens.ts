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
/** A stand-in row is retried after this long, even by trade reading. */
const STAND_IN_RETRY_MS = 10 * 60_000;

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
    const cutoff = this.now() - staleMs;
    const todo = want.filter((m) => !out.has(m) || out.get(m)!.updatedAt.getTime() < cutoff);
    if (!todo.length) return out;

    const fetched = new Map<string, JupiterToken>();
    for (let i = 0; i < todo.length; i += 100) {
      try {
        for (const t of await this.jup.tokens(todo.slice(i, i + 100))) fetched.set(t.mint, t);
      } catch (e) {
        this.opts.log?.(`Jupiter token data unavailable: ${(e as Error).message}`);
      }
    }
    for (const t of fetched.values()) out.set(t.mint, await this.save(t, 'jupiter'));

    // Never seen and unknown to Jupiter (or Jupiter unreachable): ask the chain, else keep what the transaction said.
    // A row we already have is kept as it is: stale data beats a stand-in.
    for (const mint of todo) {
      if (out.has(mint) || fetched.has(mint)) continue;
      const chain = await this.fromChain(mint);
      if (chain) out.set(mint, await this.save(chain, 'chain'));
      else if (decimals.has(mint)) out.set(mint, await this.save(placeholder(mint, decimals.get(mint)!), 'tx'));
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

  /** A stand-in (from the chain or the transaction) is dated so that Jupiter is asked again within minutes. */
  private save(t: JupiterToken, source: 'jupiter' | 'chain' | 'tx'): Promise<TokenMeta> {
    const standIn = source !== 'jupiter';
    const data = { ...t, source, updatedAt: new Date(this.now() - (standIn ? STALE.ingest - STAND_IN_RETRY_MS : 0)) };
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
