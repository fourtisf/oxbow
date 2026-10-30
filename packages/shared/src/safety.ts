/**
 * Token safety flags for the token page and the buy panel. The API gathers
 * the inputs (Jupiter's audit data and the mint account); the rules that turn
 * them into flags and a level live here so every app agrees.
 */
import type { SafetyFlag, SafetyLevel } from './schemas';

/** Flags that alone make a token DANGER. Everything else is CAUTION. */
const DANGER: ReadonlySet<SafetyFlag> = new Set<SafetyFlag>(['FREEZABLE', 'MINTABLE']);

export const flagSeverity = (f: SafetyFlag): 'danger' | 'caution' => (DANGER.has(f) ? 'danger' : 'caution');

/** Unknown inputs (null) raise no flag: the token page shows them as "unknown". */
export interface SafetyInputs {
  mintAuthorityOff: boolean | null;
  freezeAuthorityOff: boolean | null;
  liquidityUsd: number | null;
  /** Share of supply held by the top 10 holders, percent. */
  topHoldersPct: number | null;
  devPct: number | null;
  launchedAt: string | Date | null;
  /** Jupiter's organic score, 0–100. */
  organicScore: number | null;
  verified: boolean;
  /** Stablecoins and SOL itself skip the market-shape checks. */
  stable?: boolean;
}

export const SAFETY_THRESHOLDS = {
  lowLiquidityUsd: 20_000,
  concentratedTopHoldersPct: 40,
  devHoldsPct: 5,
  newTokenHours: 24,
  lowOrganicScore: 30,
} as const;

export function safetyFlags(i: SafetyInputs, now: number = Date.now()): SafetyFlag[] {
  const f: SafetyFlag[] = [];
  if (i.mintAuthorityOff === false) f.push('MINTABLE');
  if (i.freezeAuthorityOff === false) f.push('FREEZABLE');
  if (i.stable) return f;
  const t = SAFETY_THRESHOLDS;
  if (i.liquidityUsd !== null && i.liquidityUsd < t.lowLiquidityUsd) f.push('LOW_LIQUIDITY');
  if (i.topHoldersPct !== null && i.topHoldersPct > t.concentratedTopHoldersPct) f.push('CONCENTRATED');
  if (i.devPct !== null && i.devPct > t.devHoldsPct) f.push('DEV_HOLDS_MUCH');
  if (i.launchedAt !== null && now - new Date(i.launchedAt).getTime() < t.newTokenHours * 36e5) f.push('NEW_TOKEN');
  if (i.organicScore !== null && i.organicScore < t.lowOrganicScore) f.push('LOW_ORGANIC');
  if (!i.verified) f.push('UNVERIFIED');
  return f;
}

export function safetyLevel(flags: readonly SafetyFlag[]): SafetyLevel {
  if (flags.some((f) => DANGER.has(f))) return 'DANGER';
  return flags.length ? 'CAUTION' : 'OK';
}
