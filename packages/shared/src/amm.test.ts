import { describe, expect, it } from 'vitest';
import {
  feeAprPct,
  feeRateFromBps,
  matchDeposit,
  poolLiquidityUsd,
  quoteBuy,
  quoteSell,
  startingPrice,
} from './amm';

// The Docs pricing demo pool: 412M MOCHI against 2,140 NVDAx at a 1% fee.
const DEMO = { base: 412e6, quote: 2140 };

describe('quoteBuy', () => {
  it('keeps x·y=k on the fee-adjusted input', () => {
    const q = quoteBuy(DEMO, 231.12, 0.01);
    const yEff = DEMO.quote + 231.12 * 0.99;
    expect(q.after.base * yEff).toBeCloseTo(DEMO.base * DEMO.quote, 0);
    expect(q.out).toBeCloseTo(DEMO.base - q.after.base, 6);
  });
  it('matches the prototype demo readout at 18% of the slider', () => {
    // Reference values computed with the prototype's heroUpdate(18): dy = 0.18 * 0.6 * 2140 = 231.12 NVDAx
    const q = quoteBuy(DEMO, 231.12, 0.01);
    expect(q.out).toBeCloseTo(39_796_046.688, 2);
    expect(q.impactPct).toBeCloseTo(22.5272, 4);
    expect(q.fee).toBeCloseTo(2.3112, 6);
    expect(q.after.quote).toBeCloseTo(2371.12, 6);
  });
  it('returns zeros for empty or invalid input', () => {
    expect(quoteBuy(DEMO, 0, 0.01)).toMatchObject({ out: 0, impactPct: 0, fee: 0 });
    expect(quoteBuy({ base: 0, quote: 0 }, 5, 0.01).out).toBe(0);
    expect(quoteBuy(DEMO, -5, 0.01).out).toBe(0);
  });
  it('price impact grows with trade size', () => {
    const small = quoteBuy(DEMO, 1, 0.01).impactPct;
    const big = quoteBuy(DEMO, 500, 0.01).impactPct;
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small);
  });
});

describe('quoteSell', () => {
  it('is the mirror of a buy and moves the price down', () => {
    const q = quoteSell(DEMO, 10e6, 0.01);
    expect(q.out).toBeGreaterThan(0);
    expect(q.out).toBeLessThan(DEMO.quote);
    expect(q.impactPct).toBeLessThan(0);
    const xEff = DEMO.base + 10e6 * 0.99;
    expect(q.after.quote * xEff).toBeCloseTo(DEMO.base * DEMO.quote, 0);
  });
});

describe('deposits', () => {
  it('matchDeposit keeps the pool ratio', () => {
    const r = { base: 1000, quote: 50 };
    const d = matchDeposit(r, 100);
    expect(d.quoteIn).toBeCloseTo(5);
    expect(d.sharePct).toBeCloseTo((100 / 1100) * 100);
    expect(matchDeposit(r, 0)).toEqual({ quoteIn: 0, sharePct: 0 });
  });
  it('startingPrice is quote per base', () => {
    expect(startingPrice(1e9, 5)).toBe(5e-9);
    expect(startingPrice(0, 5)).toBe(0);
  });
  it('poolLiquidityUsd counts both sides', () => {
    expect(poolLiquidityUsd(5, 192.6)).toBeCloseTo(1926);
  });
});

describe('feeAprPct', () => {
  it('vol × fee × 365 ÷ tvl × 100', () => {
    expect(feeAprPct(100_000, 0.01, 50_000)).toBeCloseTo(730);
    expect(feeAprPct(100_000, feeRateFromBps(25), 1_000_000)).toBeCloseTo(9.125);
  });
  it('is zero for an empty pool', () => {
    expect(feeAprPct(100, 0.01, 0)).toBe(0);
  });
});
