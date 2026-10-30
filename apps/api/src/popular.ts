/**
 * Token discovery for create step 1, from Jupiter's token data: "Popular on
 * Solana" picks (most traded, verified) and search by name or ticker. Every
 * mint comes from Jupiter (nothing is typed in by hand), responses are parsed
 * strictly, and anything unexpected means no results rather than wrong ones.
 */
import { z } from 'zod';
import { AddressSchema, LogoUriSchema } from '@oxbow/shared';

export interface PopularToken {
  mint: string;
  symbol: string;
  name: string;
  logoUri: string | null;
}

export type PopularSource = () => Promise<PopularToken[]>;

export interface SearchResult extends PopularToken {
  verified: boolean;
}
export type SearchSource = (query: string) => Promise<SearchResult[]>;

const JupiterToken = z
  .object({
    id: AddressSchema,
    symbol: z.string().min(1).max(32),
    name: z.string().max(64),
    icon: z.string().nullish(),
    isVerified: z.boolean().nullish(),
    tags: z.array(z.string()).nullish(),
  })
  .passthrough();

/** Stablecoins, staked SOL and wrapped majors aren't what people pair with a stock here. */
const NOT_A_PICK = /^(usd|usdc|usdt|pyusd|usds|eurc|sol|wsol|jitosol|msol|bsol|jupsol|inf|wbtc|cbbtc|weth|eth)$/i;

export function jupiterPopular(base: string, log: (m: string) => void = () => {}): PopularSource {
  return async () => {
    // A wide net: the server keeps only Solana-native tokens after checking each mint on chain.
    const url = `${base.replace(/\/$/, '')}/tokens/v2/toptraded/24h?limit=100`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
      const rows = z.array(z.unknown()).parse(await res.json());
      const out: PopularToken[] = [];
      for (const row of rows) {
        const t = JupiterToken.safeParse(row);
        if (!t.success || t.data.isVerified === false) continue;
        if (NOT_A_PICK.test(t.data.symbol) || t.data.tags?.some((x) => /lst|stable/i.test(x))) continue;
        const logo = t.data.icon && LogoUriSchema.safeParse(t.data.icon).success ? t.data.icon : null;
        out.push({ mint: t.data.id, symbol: t.data.symbol, name: t.data.name, logoUri: logo });
      }
      return out;
    } catch (e) {
      log(`Popular tokens unavailable: ${(e as Error).message}`);
      return [];
    }
  };
}

const logoOf = (icon: string | null | undefined) => (icon && LogoUriSchema.safeParse(icon).success ? icon : null);

/** Jupiter token search: name, ticker or mint. Verified tokens first, then the rest, marked. */
export function jupiterSearch(base: string, log: (m: string) => void = () => {}): SearchSource {
  return async (query) => {
    const url = `${base.replace(/\/$/, '')}/tokens/v2/search?query=${encodeURIComponent(query)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`);
      const rows = z.array(z.unknown()).parse(await res.json());
      const out: SearchResult[] = [];
      for (const row of rows) {
        const t = JupiterToken.safeParse(row);
        if (!t.success) continue;
        out.push({ mint: t.data.id, symbol: t.data.symbol, name: t.data.name, logoUri: logoOf(t.data.icon), verified: t.data.isVerified === true });
      }
      // Stable: Jupiter's own ranking within each group.
      return [...out.filter((r) => r.verified), ...out.filter((r) => !r.verified)];
    } catch (e) {
      log(`Token search unavailable: ${(e as Error).message}`);
      throw e;
    }
  };
}
