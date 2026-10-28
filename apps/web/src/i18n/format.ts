import type { MarketState } from '@oxbow/shared';
import { INTL_TAG, type Locale } from './config';
import type { Messages } from './en';

/** "Jan 5, 2027" / "5 Jan 2027" */
export const fmtDateL = (at: string | number | Date, locale: Locale) =>
  new Date(at).toLocaleDateString(INTL_TAG[locale], { month: 'short', day: 'numeric', year: 'numeric' });

export const dateInL = (days: number, locale: Locale, now = Date.now()) => fmtDateL(now + days * 864e5, locale);

/** Relative time in the catalog's words ("17s ago" / "17 dtk lalu"). */
export function relTimeL(ts: number, t: Messages, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 3) return t.common.rel.justNow;
  if (s < 60) return t.common.rel.s(s);
  const m = Math.round(s / 60);
  if (m < 60) return t.common.rel.m(m);
  const h = Math.round(m / 60);
  if (h < 24) return t.common.rel.h(h);
  return t.common.rel.d(Math.round(h / 24));
}

/** "Mon 9:30 AM ET" / "Sen 09.30 ET" — market times are always shown in New York time. */
export function marketWhen(iso: string, locale: Locale): string {
  const s = new Date(iso).toLocaleString(INTL_TAG[locale], {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
  return `${s} ET`;
}

/** Why the market is closed, in words ("weekend", "Good Friday"). */
export function marketReason(m: MarketState, t: Messages): string {
  if (m.reason === 'HOLIDAY' && m.holiday) return t.market.holidays[m.holiday] ?? m.holiday;
  return m.reason ? t.market.reason[m.reason] : '';
}
