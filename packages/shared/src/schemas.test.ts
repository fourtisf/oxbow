import { describe, expect, it } from 'vitest';
import { isAddress } from './address';
import { PoolsQuerySchema, RegisterPoolBodySchema } from './schemas';

describe('address validation', () => {
  it('accepts base58 of 32–44 chars', () => {
    expect(isAddress('So11111111111111111111111111111111111111112')).toBe(true);
    expect(isAddress('Pebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe(true);
  });
  it('rejects 0, O, I, l and bad lengths', () => {
    expect(isAddress('0ebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe(false);
    expect(isAddress('Oebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe(false);
    expect(isAddress('short')).toBe(false);
    expect(isAddress('x'.repeat(45))).toBe(false);
  });
});

describe('PoolsQuerySchema', () => {
  it('fills defaults', () => {
    expect(PoolsQuerySchema.parse({})).toEqual({ quote: 'all', locked: false, sort: 'vol', limit: 25 });
  });
  it('parses query-string values', () => {
    const q = PoolsQuerySchema.parse({ q: '  mochi ', quote: 'SOL', locked: 'true', sort: 'apr', limit: '10' });
    expect(q).toMatchObject({ q: 'mochi', quote: 'SOL', locked: true, sort: 'apr', limit: 10 });
    expect(PoolsQuerySchema.parse({ locked: 'false' }).locked).toBe(false);
  });
  it('rejects unknown filters and oversized limits', () => {
    expect(() => PoolsQuerySchema.parse({ quote: 'BTC' })).toThrow();
    expect(() => PoolsQuerySchema.parse({ limit: 1000 })).toThrow();
  });
});

describe('RegisterPoolBodySchema', () => {
  it('requires a signature-shaped string and a known venue', () => {
    const sig = '5'.repeat(88);
    expect(RegisterPoolBodySchema.parse({ signature: sig, venue: 'RAYDIUM_CPMM' }).venue).toBe('RAYDIUM_CPMM');
    expect(() => RegisterPoolBodySchema.parse({ signature: 'abc', venue: 'RAYDIUM_CPMM' })).toThrow();
    expect(() => RegisterPoolBodySchema.parse({ signature: sig, venue: 'UNISWAP' })).toThrow();
  });
});
