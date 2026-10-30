import { describe, expect, it } from 'vitest';
import { safetyFlags, safetyLevel, type SafetyInputs } from './safety';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const clean: SafetyInputs = {
  mintAuthorityOff: true,
  freezeAuthorityOff: true,
  liquidityUsd: 400_000,
  topHoldersPct: 18,
  devPct: 0,
  launchedAt: '2026-01-01T00:00:00Z',
  organicScore: 88,
  verified: true,
};

describe('safety', () => {
  it('a clean token is OK', () => {
    expect(safetyFlags(clean, NOW)).toEqual([]);
    expect(safetyLevel([])).toBe('OK');
  });
  it('market-shape risks are CAUTION', () => {
    const f = safetyFlags(
      { ...clean, liquidityUsd: 900, topHoldersPct: 61, devPct: 12, launchedAt: '2026-10-30T02:00:00Z', organicScore: 4, verified: false },
      NOW,
    );
    expect(f).toEqual(['LOW_LIQUIDITY', 'CONCENTRATED', 'DEV_HOLDS_MUCH', 'NEW_TOKEN', 'LOW_ORGANIC', 'UNVERIFIED']);
    expect(safetyLevel(f)).toBe('CAUTION');
  });
  it('a live mint or freeze authority is DANGER', () => {
    expect(safetyLevel(safetyFlags({ ...clean, mintAuthorityOff: false }, NOW))).toBe('DANGER');
    expect(safetyLevel(safetyFlags({ ...clean, freezeAuthorityOff: false }, NOW))).toBe('DANGER');
  });
  it('unknown inputs raise nothing', () => {
    const unknown: SafetyInputs = { mintAuthorityOff: null, freezeAuthorityOff: null, liquidityUsd: null, topHoldersPct: null, devPct: null, launchedAt: null, organicScore: null, verified: true };
    expect(safetyFlags(unknown, NOW)).toEqual([]);
  });
  it('stablecoins only answer for their authorities', () => {
    expect(safetyFlags({ ...clean, freezeAuthorityOff: false, liquidityUsd: 1, verified: false, stable: true }, NOW)).toEqual(['FREEZABLE']);
  });
});
