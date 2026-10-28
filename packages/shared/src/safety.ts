/**
 * Token safety flags shown on pools and in create step 1. The API computes
 * the inputs (holders, token age, authorities, creator history); the rules
 * that turn them into flags and a level live here so every app agrees.
 */
import type { SafetyFlag, SafetyLevel } from './schemas';

/** Flags that alone make a pool DANGER. Everything else is CAUTION. */
const DANGER: ReadonlySet<SafetyFlag> = new Set<SafetyFlag>(['FREEZABLE', 'TRANSFER_HOOK', 'PERMANENT_DELEGATE', 'CREATOR_PULLED_BEFORE']);

export const flagSeverity = (f: SafetyFlag): 'danger' | 'caution' => (DANGER.has(f) ? 'danger' : 'caution');

export interface SafetyInputs {
  /** Other listed tokens use the same symbol with a different mint. */
  duplicateSymbol: boolean;
  tokenAgeDays: number | null;
  top10Pct: number;
  mintable: boolean;
  freezable: boolean;
  transferFee: boolean;
  transferHook: boolean;
  permanentDelegate: boolean;
  /** Pools by the same creator whose liquidity was later withdrawn. */
  creatorPulled: number;
  lpUnlocked: boolean;
  tvlUsd: number;
}

export const SAFETY_THRESHOLDS = {
  newTokenDays: 3,
  concentratedTop10Pct: 50,
  lowLiquidityUsd: 5_000,
} as const;

export function safetyFlags(i: SafetyInputs): SafetyFlag[] {
  const f: SafetyFlag[] = [];
  if (i.freezable) f.push('FREEZABLE');
  if (i.transferHook) f.push('TRANSFER_HOOK');
  if (i.permanentDelegate) f.push('PERMANENT_DELEGATE');
  if (i.creatorPulled > 0) f.push('CREATOR_PULLED_BEFORE');
  if (i.duplicateSymbol) f.push('DUPLICATE_SYMBOL');
  if (i.mintable) f.push('MINTABLE');
  if (i.transferFee) f.push('TRANSFER_FEE');
  if (i.lpUnlocked) f.push('LP_UNLOCKED');
  if (i.top10Pct > SAFETY_THRESHOLDS.concentratedTop10Pct) f.push('CONCENTRATED');
  if (i.tokenAgeDays !== null && i.tokenAgeDays < SAFETY_THRESHOLDS.newTokenDays) f.push('NEW_TOKEN');
  if (i.tvlUsd < SAFETY_THRESHOLDS.lowLiquidityUsd) f.push('LOW_LIQUIDITY');
  return f;
}

export function safetyLevel(flags: readonly SafetyFlag[]): SafetyLevel {
  if (flags.some((f) => DANGER.has(f))) return 'DANGER';
  return flags.length ? 'CAUTION' : 'OK';
}
