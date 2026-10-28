import type { LpState, PoolSummary } from './schemas';

/** Share of 24h trades that were buys, 0–100 (50 when there were none). */
export function buysPct(p: Pick<PoolSummary, 'buys24h' | 'sells24h'>): number {
  const n = p.buys24h + p.sells24h;
  return n ? Math.round((p.buys24h / n) * 100) : 50;
}

/** Explore's "Locked or burned only" filter. Partial locks don't count, as in the prototype. */
export function isLockedOrBurned(lp: LpState): boolean {
  return lp.status === 'BURNED' || lp.status === 'LOCKED';
}

export function pairLabel(p: Pick<PoolSummary, 'base' | 'quote'>): string {
  return `${p.base.symbol}/${p.quote.symbol}`;
}
