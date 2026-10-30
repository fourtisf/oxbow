import { describe, expect, it } from 'vitest';
import { isAddress } from './address';
import { AddWalletBodySchema, FeedQuerySchema, SwapQuoteQuerySchema } from './schemas';

const A = 'So11111111111111111111111111111111111111112';

describe('address validation', () => {
  it('accepts base58 of 32–44 chars', () => {
    expect(isAddress(A)).toBe(true);
    expect(isAddress('Pebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe(true);
  });
  it('rejects 0, O, I, l and bad lengths', () => {
    expect(isAddress('0ebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe(false);
    expect(isAddress('Oebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe(false);
    expect(isAddress('short')).toBe(false);
    expect(isAddress('x'.repeat(45))).toBe(false);
  });
});

describe('FeedQuerySchema', () => {
  it('fills defaults', () => {
    expect(FeedQuerySchema.parse({})).toEqual({ limit: 40 });
  });
  it('splits, dedupes and validates the wallet list', () => {
    expect(FeedQuerySchema.parse({ wallets: `${A},${A}` }).wallets).toEqual([A]);
    expect(() => FeedQuerySchema.parse({ wallets: 'nope' })).toThrow();
  });
  it('takes only well-formed cursors', () => {
    expect(FeedQuerySchema.parse({ cursor: '1793363692000_42' }).cursor).toBe('1793363692000_42');
    expect(() => FeedQuerySchema.parse({ cursor: "1'; drop" })).toThrow();
  });
});

describe('AddWalletBodySchema', () => {
  it('wants an address and nothing else', () => {
    expect(AddWalletBodySchema.parse({ address: A, label: 'ignored' })).toEqual({ address: A });
    expect(() => AddWalletBodySchema.parse({ address: 'x' })).toThrow();
  });
});

describe('SwapQuoteQuerySchema', () => {
  it('wants a positive integer amount and bounded slippage', () => {
    expect(SwapQuoteQuerySchema.parse({ inputMint: A, outputMint: A, amount: '1000' }).slippageBps).toBe(100);
    expect(() => SwapQuoteQuerySchema.parse({ inputMint: A, outputMint: A, amount: '0' })).toThrow();
    expect(() => SwapQuoteQuerySchema.parse({ inputMint: A, outputMint: A, amount: '1.5' })).toThrow();
    expect(() => SwapQuoteQuerySchema.parse({ inputMint: A, outputMint: A, amount: '10', slippageBps: '9000' })).toThrow();
  });
});
