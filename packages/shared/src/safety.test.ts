import { describe, expect, it } from 'vitest';
import { safetyFlags, safetyLevel, type SafetyInputs } from './safety';
import { PoolsQuerySchema } from './schemas';

const clean: SafetyInputs = {
  duplicateSymbol: false,
  tokenAgeDays: 120,
  top10Pct: 22,
  mintable: false,
  freezable: false,
  transferFee: false,
  transferHook: false,
  permanentDelegate: false,
  creatorPulled: 0,
  lpUnlocked: false,
  tvlUsd: 250_000,
};

describe('safety', () => {
  it('a clean token is OK', () => {
    expect(safetyFlags(clean)).toEqual([]);
    expect(safetyLevel([])).toBe('OK');
  });
  it('soft risks are CAUTION', () => {
    const f = safetyFlags({ ...clean, duplicateSymbol: true, top10Pct: 61, tokenAgeDays: 1, lpUnlocked: true, tvlUsd: 900 });
    expect(f).toEqual(['DUPLICATE_SYMBOL', 'LP_UNLOCKED', 'CONCENTRATED', 'NEW_TOKEN', 'LOW_LIQUIDITY']);
    expect(safetyLevel(f)).toBe('CAUTION');
  });
  it('freeze authority or a creator who pulled liquidity before is DANGER', () => {
    expect(safetyLevel(safetyFlags({ ...clean, freezable: true }))).toBe('DANGER');
    expect(safetyLevel(safetyFlags({ ...clean, creatorPulled: 2 }))).toBe('DANGER');
  });
  it('unknown token age does not count as new', () => {
    expect(safetyFlags({ ...clean, tokenAgeDays: null })).toEqual([]);
  });
});

describe('PoolsQuerySchema addresses', () => {
  it('splits and validates a comma list', () => {
    const a = 'So11111111111111111111111111111111111111112';
    expect(PoolsQuerySchema.parse({ addresses: `${a},${a}` }).addresses).toEqual([a, a]);
    expect(() => PoolsQuerySchema.parse({ addresses: 'nope' })).toThrow();
  });
});
