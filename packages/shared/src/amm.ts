/**
 * Constant-product (x·y=k) math, matching the prototype's swap, add-liquidity,
 * preview and pricing-demo calculations. Reserves are in UI units (already
 * divided by decimals). Fee rates are fractions: 1% = 0.01.
 */

export interface Reserves {
  /** Reserve of the pool's base token (the memecoin). */
  base: number;
  /** Reserve of the quote asset (stock token, SOL or USDC). */
  quote: number;
}

export interface SwapQuote {
  /** Amount received. */
  out: number;
  /** How far the pool price moves, in percent (the prototype's "price impact"). */
  impactPct: number;
  /** Fee paid to liquidity providers, in the input asset. */
  fee: number;
  /** Reserves after the swap. The fee stays in the pool. */
  after: Reserves;
}

export const feeRateFromBps = (feeBps: number): number => feeBps / 10_000;

/** Pay `quoteIn` of the quote asset, receive base tokens. */
export function quoteBuy(r: Reserves, quoteIn: number, feeRate: number): SwapQuote {
  if (!(quoteIn > 0) || !(r.base > 0) || !(r.quote > 0)) {
    return { out: 0, impactPct: 0, fee: 0, after: { ...r } };
  }
  const yEff = r.quote + quoteIn * (1 - feeRate);
  const x1 = (r.base * r.quote) / yEff;
  return {
    out: r.base - x1,
    impactPct: (yEff / x1 / (r.quote / r.base) - 1) * 100,
    fee: quoteIn * feeRate,
    after: { base: x1, quote: r.quote + quoteIn },
  };
}

/** Pay `baseIn` of the base token, receive the quote asset. Impact is negative (price falls). */
export function quoteSell(r: Reserves, baseIn: number, feeRate: number): SwapQuote {
  if (!(baseIn > 0) || !(r.base > 0) || !(r.quote > 0)) {
    return { out: 0, impactPct: 0, fee: 0, after: { ...r } };
  }
  const xEff = r.base + baseIn * (1 - feeRate);
  const y1 = (r.base * r.quote) / xEff;
  return {
    out: r.quote - y1,
    impactPct: (y1 / xEff / (r.quote / r.base) - 1) * 100,
    fee: baseIn * feeRate,
    after: { base: r.base + baseIn, quote: y1 },
  };
}

/** Quote amount needed to add `baseIn` at the pool's current ratio, and the resulting share. */
export function matchDeposit(r: Reserves, baseIn: number): { quoteIn: number; sharePct: number } {
  if (!(baseIn > 0) || !(r.base > 0)) return { quoteIn: 0, sharePct: 0 };
  return {
    quoteIn: (baseIn * r.quote) / r.base,
    sharePct: (baseIn / (r.base + baseIn)) * 100,
  };
}

/** Starting price of one base token, in quote units, from the two deposits. */
export function startingPrice(baseDeposit: number, quoteDeposit: number): number {
  return baseDeposit > 0 && quoteDeposit > 0 ? quoteDeposit / baseDeposit : 0;
}

/** Both sides of a balanced constant-product pool are worth the same, so TVL is twice the quote side. */
export function poolLiquidityUsd(quoteReserve: number, quotePriceUsd: number): number {
  return quoteReserve * quotePriceUsd * 2;
}

/** Fee APR: vol24h × feeRate × 365 ÷ tvl × 100. */
export function feeAprPct(vol24hUsd: number, feeRate: number, tvlUsd: number): number {
  return tvlUsd > 0 ? ((vol24hUsd * feeRate * 365) / tvlUsd) * 100 : 0;
}
