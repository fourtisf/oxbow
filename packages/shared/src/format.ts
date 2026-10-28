/**
 * Number and date formatting, ported 1:1 from the prototype (`compact`, `tiny`,
 * `usd`, `amt`, `pct`, `signed`, `fmtAge`).
 *
 * One deliberate difference: the prototype wrote the zero count of very small
 * numbers as `<sub>5</sub>` HTML. These helpers return plain strings that use
 * Unicode subscript digits instead (`$0.0₅228`), so they are safe in toasts,
 * aria labels and API payloads. The web app renders those digits back as
 * `<sub>` to keep the prototype's look.
 */

const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
export const SUBSCRIPT_RE = /[₀-₉]+/;

export function toSubscript(n: number): string {
  return String(Math.trunc(Math.abs(n)))
    .split('')
    .map((d) => SUB_DIGITS[Number(d)])
    .join('');
}

export function fromSubscript(s: string): number {
  return Number(
    s
      .split('')
      .map((c) => SUB_DIGITS.indexOf(c))
      .join(''),
  );
}

export function compact(n: number, d = 2): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(d) + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(d) + 'M';
  if (a >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString('en-US', { maximumFractionDigits: a < 1 ? 4 : 2 });
}

/** `compact` without trailing zeros: 1e9 -> "1B", 1.5e9 -> "1.5B". */
export function compactTrim(n: number): string {
  return compact(n).replace(/\.0+([KMB])$/, '$1').replace(/(\.\d*?)0+([KMB])$/, '$1$2');
}

/** Small numbers in subscript-zero notation: 0.00000228 -> "0.0₅228". */
export function tiny(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  if (n < 0) return '-' + tiny(-n);
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: n < 10 ? 4 : 2 });
  if (n >= 0.001) return String(+n.toFixed(6));
  const m = n.toFixed(20).match(/^0\.(0+)(\d{1,4})/);
  if (!m || !m[1] || !m[2]) return n.toExponential(2);
  return '0.0' + toSubscript(m[1].length) + (m[2].replace(/0+$/, '') || '0');
}

export function usd(n: number): string {
  if (!Number.isFinite(n)) return '$0';
  const a = Math.abs(n);
  if (a >= 1e4) return '$' + compact(n);
  if (a >= 1) {
    const d = a < 1000 ? 2 : 0;
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  if (a === 0) return '$0';
  return '$' + tiny(n);
}

/** Token amounts. */
export function amt(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  if (a >= 1e4) return compact(n);
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: a < 100 ? 3 : 2 });
  return tiny(n);
}

export function pct(n: number): string {
  const a = Math.abs(n);
  if (a >= 1000) return Math.round(n).toLocaleString('en-US') + '%';
  return n.toFixed(a < 10 ? 2 : 1) + '%';
}

export function signed(n: number): string {
  return (n >= 0 ? '+' : '') + pct(n);
}

/** Pool age from hours: "New", "7h", "12d". */
export function fmtAge(hours: number): string {
  if (hours < 1) return 'New';
  if (hours < 24) return Math.round(hours) + 'h';
  return Math.round(hours / 24) + 'd';
}

export function ageHours(createdAt: string | number | Date, now: number = Date.now()): number {
  return Math.max(0, (now - new Date(createdAt).getTime()) / 36e5);
}

/** Whole days until a timestamp, never negative. */
export function daysUntil(at: string | number | Date, now: number = Date.now()): number {
  return Math.max(0, (new Date(at).getTime() - now) / 864e5);
}

/** "Jan 5, 2027" */
export function fmtDate(at: string | number | Date): string {
  return new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Date `days` from now, formatted like the prototype's `dateIn`. */
export function dateIn(days: number, now: number = Date.now()): string {
  return fmtDate(now + days * 864e5);
}

/** "AbCd…WxYz" */
export function shortAddr(a: string): string {
  return a.length > 10 ? a.slice(0, 4) + '…' + a.slice(-4) : a;
}

/** Lenient number parse for user input ("1,000.5" -> 1000.5). Returns 0 when invalid. */
export function num(v: unknown): number {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Fee in basis points as the UI shows it: 25 -> "0.25%". */
export function feePct(feeBps: number): string {
  return +(feeBps / 100).toFixed(2) + '%';
}

export function relTime(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 3) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}
