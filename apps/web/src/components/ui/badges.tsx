'use client';

/** Small labelled badges: ChangePill, VerifiedChip, FeaturedChip, SafetyPill, PnL. */
import { pct, usd, type SafetyLevel } from '@oxbow/shared';
import { useT } from '@/i18n/client';
import { ShieldIcon, StarIcon, WarnIcon } from './Icons';
import { cx, Fmt } from './primitives';

export function ChangePill({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={cx('chg', up ? 'up' : 'down')}>
      <i aria-hidden="true">{up ? '▲' : '▼'}</i>
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

export function FeaturedChip() {
  const t = useT();
  return (
    <span className="fchip-star" title={t.wallets.featured}>
      <StarIcon filled />
      <span className="sr-only">{t.common.featured}</span>
    </span>
  );
}

export function SafetyPill({ level }: { level: SafetyLevel }) {
  const t = useT();
  return (
    <span className={cx('spill', level.toLowerCase())}>
      {level === 'OK' ? <ShieldIcon /> : <WarnIcon />}
      {t.token.level[level]}
    </span>
  );
}

/** Signed USD with up/down colour: "+$1.2K" / "-$40". */
export function Pnl({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cx('muted', className)}>—</span>;
  const a = Math.abs(value);
  // Profit reads in cents: "-$0.09", not "-$0.091801".
  const s = a < 0.005 ? '$0' : (value > 0 ? '+' : '-') + (a < 1 ? '$' + a.toFixed(2) : usd(a));
  return (
    <span className={cx(value > 0.005 ? 'up' : value < -0.005 ? 'down' : 'muted', className)}>
      <Fmt>{s}</Fmt>
    </span>
  );
}
