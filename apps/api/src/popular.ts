/**
 * "Popular on Solana" picks for create step 1: Jupiter's most-traded verified
 * tokens. Every mint comes from Jupiter's token data (nothing is typed in by
 * hand), the response is parsed strictly, and anything unexpected means no
 * picks rather than wrong ones.
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
    const url = `${base.replace(/\/$/, '')}/tokens/v2/toptraded/24h?limit=50`;
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
