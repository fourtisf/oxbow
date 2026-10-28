import { describe, expect, it } from 'vitest';
import { usMarketHolidays, usMarketState } from './market';

const at = (iso: string) => Date.parse(iso);

describe('usMarketHolidays', () => {
  it('computes the 2026 NYSE calendar', () => {
    const h = usMarketHolidays(2026);
    expect([...h.keys()]).toEqual([
      '2026-01-01',
      '2026-01-19',
      '2026-02-16',
      '2026-04-03',
      '2026-05-25',
      '2026-06-19',
      '2026-07-03', // July 4 is a Saturday
      '2026-09-07',
      '2026-11-26',
      '2026-12-25',
    ]);
  });
  it('moves weekend holidays and skips a Saturday New Year', () => {
    const h = usMarketHolidays(2027);
    expect(h.get('2027-03-26')).toBe('Good Friday');
    expect(h.get('2027-06-18')).toBe('Juneteenth'); // June 19 is a Saturday
    expect(h.get('2027-07-05')).toBe('Independence Day'); // July 4 is a Sunday
    expect(h.get('2027-12-24')).toBe('Christmas Day'); // December 25 is a Saturday
    expect(usMarketHolidays(2022).has('2021-12-31')).toBe(false);
    expect(usMarketHolidays(2022).has('2022-01-01')).toBe(false);
  });
});

describe('usMarketState', () => {
  it('is open during the regular session (EST and EDT)', () => {
    // Monday Jan 5 2026, 10:00 ET = 15:00 UTC (EST)
    const w = usMarketState(at('2026-01-05T15:00:00Z'));
    expect(w.status).toBe('OPEN');
    expect(w.nextChange).toBe('2026-01-05T21:00:00.000Z');
    // Monday Mar 9 2026 after the DST switch: 9:30 ET = 13:30 UTC
    expect(usMarketState(at('2026-03-09T13:29:00Z')).status).toBe('CLOSED');
    expect(usMarketState(at('2026-03-09T13:30:00Z')).status).toBe('OPEN');
  });
  it('is closed overnight and points at the next open', () => {
    const s = usMarketState(at('2026-01-05T22:00:00Z'));
    expect(s).toMatchObject({ status: 'CLOSED', reason: 'OVERNIGHT', nextChange: '2026-01-06T14:30:00.000Z' });
  });
  it('is closed on weekends until Monday', () => {
    const s = usMarketState(at('2026-10-31T16:00:00Z')); // Saturday
    expect(s).toMatchObject({ status: 'CLOSED', reason: 'WEEKEND', nextChange: '2026-11-02T14:30:00.000Z' });
  });
  it('is closed on holidays and skips the long weekend', () => {
    const s = usMarketState(at('2026-04-03T15:00:00Z')); // Good Friday
    expect(s).toMatchObject({ status: 'CLOSED', reason: 'HOLIDAY', holiday: 'Good Friday', nextChange: '2026-04-06T13:30:00.000Z' });
  });
  it('closes at 1 PM ET on early-close days', () => {
    // Friday after Thanksgiving 2026 (Nov 27), EST: 13:00 ET = 18:00 UTC
    expect(usMarketState(at('2026-11-27T17:59:00Z'))).toMatchObject({ status: 'OPEN', earlyClose: true, nextChange: '2026-11-27T18:00:00.000Z' });
    expect(usMarketState(at('2026-11-27T18:01:00Z'))).toMatchObject({ status: 'CLOSED', reason: 'EARLY_CLOSE' });
  });
  it('honours unscheduled closures', () => {
    const s = usMarketState(at('2026-01-07T15:00:00Z'), ['2026-01-07']);
    expect(s).toMatchObject({ status: 'CLOSED', reason: 'CLOSURE', nextChange: '2026-01-08T14:30:00.000Z' });
  });
});
