import { INTL_TAG, type Locale } from './config';
import type { Messages } from './en';

/** "Jan 5, 2027" */
export const fmtDateL = (at: string | number | Date, locale: Locale) =>
  new Date(at).toLocaleDateString(INTL_TAG[locale], { month: 'short', day: 'numeric', year: 'numeric' });

/** Relative time in the catalog's words ("17s ago"). */
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

/** Short age for a token: "3h", "12d", "2y". */
export function ageShort(iso: string, now = Date.now()): string {
  const h = Math.max(0, (now - Date.parse(iso)) / 36e5);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  const d = h / 24;
  if (d < 365) return `${Math.round(d)}d`;
  return `${+(d / 365).toFixed(1)}y`;
}
