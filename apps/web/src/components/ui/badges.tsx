'use client';

/** Badges with translated text: ChangePill, LpBadge, VerifiedChip, SafetyBadge, MarketChip. */
import { daysUntil, pct, type LpState, type MarketState, type SafetyLevel, type TokenSafety } from '@oxbow/shared';
import { useLocale, useT } from '@/i18n/client';
import { marketWhen } from '@/i18n/format';
import { FlameIcon, HalfIcon, LockIcon, ShieldIcon, UnlockIcon, WarnIcon } from './Icons';
import { cx } from './primitives';

export function ChangePill({ value }: { value: number }) {
  const t = useT();
  const up = value >= 0;
  return (
    <span className={cx('chg', up ? 'up' : 'down')}>
      <i aria-hidden="true">{up ? '▲' : '▼'}</i>
      <span className="sr-only">{up ? t.common.up : t.common.down} </span>
      {pct(Math.abs(value))}
    </span>
  );
}

export function VerifiedChip() {
  const t = useT();
  return (
    <span className="vchk">
      <ShieldIcon />
      {t.common.verified}
    </span>
  );
}

export interface LpBadgeInput {
  status: LpState['status'];
  lockedPct: number;
  unlockAt?: string | null;
  /** Days to show on LOCKED when there's no unlock time yet (create preview, docs legend). */
  days?: number;
}

export function LpBadge({ lp }: { lp: LpBadgeInput }) {
  const t = useT();
  switch (lp.status) {
    case 'BURNED':
      return (
        <span className="lp burned">
          <FlameIcon />
          {t.lp.burned}
        </span>
      );
    case 'LOCKED': {
      const d = lp.unlockAt ? daysUntil(lp.unlockAt) : lp.days ?? 0;
      return (
        <span className="lp locked" suppressHydrationWarning>
          <LockIcon />
          {t.lp.locked(Math.round(d))}
        </span>
      );
    }
    case 'PARTIAL':
      return (
        <span className="lp partial">
          <HalfIcon />
          {t.lp.partial(lp.lockedPct)}
        </span>
      );
    default:
      return (
        <span className="lp unlocked">
          <UnlockIcon />
          {t.lp.unlocked}
        </span>
      );
  }
}

/** Small warning mark next to a pair when its token has CAUTION or DANGER flags. */
export function SafetyMark({ safety }: { safety: Pick<TokenSafety, 'level' | 'flags'> }) {
  const t = useT();
  if (safety.level === 'OK') return null;
  const label = `${t.safety.short[safety.level]}: ${safety.flags.map((f) => t.safety.flag[f]).join('; ')}`;
  return (
    <span className={cx('smark', safety.level === 'DANGER' ? 'danger' : 'caution')} title={label} role="img" aria-label={label}>
      <WarnIcon />
    </span>
  );
}

export function SafetyPill({ level }: { level: SafetyLevel }) {
  const t = useT();
  return <span className={cx('spill', level.toLowerCase())}>{t.safety.short[level]}</span>;
}

/** "MARKET CLOSED · Opens Mon 9:30 AM ET" chip for stock tokens. */
export function MarketChip({ market }: { market: MarketState }) {
  const t = useT();
  const locale = useLocale();
  const open = market.status === 'OPEN';
  return (
    <span className={cx('mchip', open ? 'open' : 'closed')} suppressHydrationWarning>
      <span className="dot" aria-hidden="true" />
      {open ? t.market.open : t.market.closed}
      <span className="when">{open ? t.market.closes(marketWhen(market.nextChange, locale)) : t.market.opens(marketWhen(market.nextChange, locale))}</span>
    </span>
  );
}
