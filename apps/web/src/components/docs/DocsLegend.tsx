'use client';

import type { MarketState } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { LpBadge, MarketChip, type LpBadgeInput } from '../ui/badges';

const LEGEND: LpBadgeInput[] = [
  { status: 'BURNED', lockedPct: 100 },
  { status: 'LOCKED', lockedPct: 100, days: 180 },
  { status: 'PARTIAL', lockedPct: 60 },
  { status: 'UNLOCKED', lockedPct: 0 },
];

/** Liquidity label legend for the docs. */
export function DocsLegend() {
  const t = useT();
  return (
    <div className="lg">
      {LEGEND.map((lp) => (
        <div key={lp.status}>
          <span>
            <LpBadge lp={lp} />
          </span>
          <p>{t.docs.legend[lp.status]}</p>
        </div>
      ))}
    </div>
  );
}

/** "Right now: MARKET OPEN · Closes Mon 4:00 PM ET" in the market-hours section. */
export function DocsMarketNow({ market }: { market: MarketState }) {
  const t = useT();
  return (
    <div className="mnow">
      <span className="label">{t.docs.hoursNow}</span>
      <MarketChip market={market} />
    </div>
  );
}
