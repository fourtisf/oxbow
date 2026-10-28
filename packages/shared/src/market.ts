/**
 * US equity market calendar (NYSE / Nasdaq regular session), used to tell
 * traders when a stock token's underlying market is closed and its price feed
 * stops moving. Holidays follow the NYSE rules and are computed, not listed,
 * so the calendar doesn't expire. Unscheduled closures (e.g. a national day of
 * mourning) can be passed in as `extraClosures` ("YYYY-MM-DD").
 */

const TZ = 'America/New_York';

export type MarketReason = 'WEEKEND' | 'HOLIDAY' | 'OVERNIGHT' | 'EARLY_CLOSE' | 'CLOSURE';

export interface MarketState {
  status: 'OPEN' | 'CLOSED';
  /** Why it's closed (null when open). */
  reason: MarketReason | null;
  /** Holiday name when reason is HOLIDAY. */
  holiday: string | null;
  /** Next open (when closed) or close (when open), ISO. */
  nextChange: string;
  /** True when today's session ends at 1:00 PM ET. */
  earlyClose: boolean;
}

type YMD = { y: number; m: number; d: number };

const key = ({ y, m, d }: YMD) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dow = ({ y, m, d }: YMD) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
const addDays = ({ y, m, d }: YMD, n: number): YMD => {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
};

/** n-th weekday (0=Sun) of a month; n = -1 for the last one. */
function nthWeekday(y: number, m: number, weekday: number, n: number): YMD {
  if (n > 0) {
    const first = dow({ y, m, d: 1 });
    return { y, m, d: 1 + ((weekday - first + 7) % 7) + (n - 1) * 7 };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lastDow = dow({ y, m, d: last });
  return { y, m, d: last - ((lastDow - weekday + 7) % 7) };
}

/** Gregorian Easter Sunday (anonymous algorithm). */
function easter(y: number): YMD {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y, m: month, d: day };
}

/** Fixed-date holiday moved to Friday/Monday when it falls on a weekend. */
function observed(day: YMD): YMD {
  const w = dow(day);
  return w === 6 ? addDays(day, -1) : w === 0 ? addDays(day, 1) : day;
}

/** NYSE full-day holidays for a year, keyed "YYYY-MM-DD". */
export function usMarketHolidays(y: number): Map<string, string> {
  const out = new Map<string, string>();
  // New Year's Day: a Saturday holiday is not moved to Friday Dec 31.
  const ny = { y, m: 1, d: 1 };
  if (dow(ny) !== 6) out.set(key(observed(ny)), "New Year's Day");
  out.set(key(nthWeekday(y, 1, 1, 3)), 'Martin Luther King Jr. Day');
  out.set(key(nthWeekday(y, 2, 1, 3)), "Washington's Birthday");
  out.set(key(addDays(easter(y), -2)), 'Good Friday');
  out.set(key(nthWeekday(y, 5, 1, -1)), 'Memorial Day');
  if (y >= 2022) out.set(key(observed({ y, m: 6, d: 19 })), 'Juneteenth');
  out.set(key(observed({ y, m: 7, d: 4 })), 'Independence Day');
  out.set(key(nthWeekday(y, 9, 1, 1)), 'Labor Day');
  out.set(key(nthWeekday(y, 11, 4, 4)), 'Thanksgiving Day');
  out.set(key(observed({ y, m: 12, d: 25 })), 'Christmas Day');
  return out;
}

/** Sessions that end at 1:00 PM ET: July 3, the day after Thanksgiving, December 24 (when they are trading days). */
function isEarlyClose(day: YMD, holidays: Map<string, string>): boolean {
  if (dow(day) === 0 || dow(day) === 6 || holidays.has(key(day))) return false;
  if (day.m === 7 && day.d === 3) return true;
  if (day.m === 12 && day.d === 24) return true;
  return key(day) === key(addDays(nthWeekday(day.y, 11, 4, 4), 1));
}

/** Minutes east of UTC for a time zone at an instant (ET: -300 or -240). */
function tzOffsetMin(at: number, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(at))
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUtc - Math.floor(at / 1000) * 1000) / 60000);
}

/** UTC ms of a New York wall-clock time. */
function etToUtc(day: YMD, h: number, min: number): number {
  const guess = Date.UTC(day.y, day.m - 1, day.d, h, min);
  const off1 = tzOffsetMin(guess - 5 * 36e5, TZ);
  const t = guess - off1 * 60000;
  const off2 = tzOffsetMin(t, TZ);
  return off2 === off1 ? t : guess - off2 * 60000;
}

function etDay(at: number): YMD & { minutes: number } {
  const local = at + tzOffsetMin(at, TZ) * 60000;
  const t = new Date(local);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

export function usMarketState(now: number | Date = Date.now(), extraClosures: readonly string[] = []): MarketState {
  const at = typeof now === 'number' ? now : now.getTime();
  const today = etDay(at);
  const holidaysFor = (y: number) => {
    const h = usMarketHolidays(y);
    for (const c of extraClosures) if (c.startsWith(String(y))) h.set(c, 'Market closure');
    return h;
  };
  const isTradingDay = (day: YMD) => dow(day) !== 0 && dow(day) !== 6 && !holidaysFor(day.y).has(key(day));
  const closeMin = (day: YMD) => (isEarlyClose(day, holidaysFor(day.y)) ? EARLY_CLOSE_MIN : CLOSE_MIN);

  const nextOpen = (from: YMD, includeToday: boolean): number => {
    let day = includeToday ? from : addDays(from, 1);
    for (let i = 0; i < 14 && !isTradingDay(day); i++) day = addDays(day, 1);
    return etToUtc(day, 9, 30);
  };

  const hol = holidaysFor(today.y).get(key(today)) ?? null;
  const base = { holiday: null as string | null, earlyClose: false };
  if (dow(today) === 0 || dow(today) === 6) return { ...base, status: 'CLOSED', reason: 'WEEKEND', nextChange: new Date(nextOpen(today, false)).toISOString() };
  if (hol) {
    const reason: MarketReason = extraClosures.includes(key(today)) ? 'CLOSURE' : 'HOLIDAY';
    return { ...base, status: 'CLOSED', reason, holiday: hol, nextChange: new Date(nextOpen(today, false)).toISOString() };
  }
  const close = closeMin(today);
  const early = close === EARLY_CLOSE_MIN;
  if (today.minutes < OPEN_MIN) return { ...base, earlyClose: early, status: 'CLOSED', reason: 'OVERNIGHT', nextChange: new Date(etToUtc(today, 9, 30)).toISOString() };
  if (today.minutes >= close)
    return { ...base, earlyClose: early, status: 'CLOSED', reason: early ? 'EARLY_CLOSE' : 'OVERNIGHT', nextChange: new Date(nextOpen(today, false)).toISOString() };
  return {
    ...base,
    earlyClose: early,
    status: 'OPEN',
    reason: null,
    nextChange: new Date(etToUtc(today, Math.floor(close / 60), close % 60)).toISOString(),
  };
}
