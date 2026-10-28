import { describe, expect, it } from 'vitest';
import {
  amt,
  compact,
  compactTrim,
  dateIn,
  feePct,
  fmtAge,
  fromSubscript,
  num,
  pct,
  relTime,
  shortAddr,
  signed,
  tiny,
  toSubscript,
  usd,
} from './format';

describe('tiny (subscript-zero notation)', () => {
  it('writes the zero count as subscript digits', () => {
    expect(tiny(0.00000228)).toBe('0.0₅228');
    expect(tiny(0.0001)).toBe('0.0₃1');
    expect(tiny(0.000012345)).toBe('0.0₄1234');
  });
  it('handles two-digit zero counts', () => {
    expect(tiny(1.5e-14)).toBe('0.0₁₃15');
  });
  it('uses plain decimals from 0.001 up', () => {
    expect(tiny(0.001)).toBe('0.001');
    expect(tiny(0.0123456789)).toBe('0.012346');
    expect(tiny(0.5)).toBe('0.5');
  });
  it('uses grouping at 1 and above', () => {
    expect(tiny(1.23456)).toBe('1.2346');
    expect(tiny(12345.678)).toBe('12,345.68');
  });
  it('handles zero, negatives and non-finite input', () => {
    expect(tiny(0)).toBe('0');
    expect(tiny(NaN)).toBe('0');
    expect(tiny(Infinity)).toBe('0');
    expect(tiny(-0.00000228)).toBe('-0.0₅228');
  });
  it('round-trips subscript digits', () => {
    expect(toSubscript(13)).toBe('₁₃');
    expect(fromSubscript('₁₃')).toBe(13);
  });
});

describe('usd', () => {
  it('matches the prototype across ranges', () => {
    expect(usd(0)).toBe('$0');
    expect(usd(0.00000228)).toBe('$0.0₅228');
    expect(usd(0.0423)).toBe('$0.0423');
    expect(usd(1)).toBe('$1.00');
    expect(usd(431.5)).toBe('$431.50');
    expect(usd(1234)).toBe('$1,234');
    expect(usd(9999.4)).toBe('$9,999');
    expect(usd(12_345)).toBe('$12.3K');
    expect(usd(2_480_000)).toBe('$2.48M');
    expect(usd(1.2e9)).toBe('$1.20B');
  });
  it('never prints NaN', () => {
    expect(usd(NaN)).toBe('$0');
  });
});

describe('compact', () => {
  it('abbreviates thousands, millions and billions', () => {
    expect(compact(9999)).toBe('9,999');
    expect(compact(10_000)).toBe('10.0K');
    expect(compact(412e6, 1)).toBe('412.0M');
    expect(compact(1e9)).toBe('1.00B');
    expect(compact(0.12345)).toBe('0.1235');
  });
  it('compactTrim drops trailing zeros', () => {
    expect(compactTrim(1e9)).toBe('1B');
    expect(compactTrim(1.5e9)).toBe('1.5B');
    expect(compactTrim(15_000)).toBe('15K');
    expect(compactTrim(2_480_000)).toBe('2.48M');
  });
});

describe('amt', () => {
  it('formats token amounts', () => {
    expect(amt(2140)).toBe('2,140');
    expect(amt(18.4)).toBe('18.4');
    expect(amt(3.12345)).toBe('3.123');
    expect(amt(123.456)).toBe('123.46');
    expect(amt(412e6)).toBe('412.00M');
    expect(amt(0.00004)).toBe('0.0₄4');
    expect(amt(NaN)).toBe('0');
  });
});

describe('pct and signed', () => {
  it('uses two decimals under 10, one above, none past 1000', () => {
    expect(pct(2.414)).toBe('2.41%');
    expect(pct(42.42)).toBe('42.4%');
    expect(pct(4321.7)).toBe('4,322%');
  });
  it('signs positive values', () => {
    expect(signed(1.18)).toBe('+1.18%');
    expect(signed(0)).toBe('+0.00%');
    expect(signed(-2.7)).toBe('-2.70%');
  });
});

describe('dates and ages', () => {
  it('fmtAge', () => {
    expect(fmtAge(0.4)).toBe('New');
    expect(fmtAge(5.4)).toBe('5h');
    expect(fmtAge(23.4)).toBe('23h');
    expect(fmtAge(24 * 12.4)).toBe('12d');
  });
  it('dateIn', () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(dateIn(30, now)).toMatch(/^Jan 31, 2026$/);
  });
  it('relTime', () => {
    const now = 1_000_000;
    expect(relTime(now - 1000, now)).toBe('just now');
    expect(relTime(now - 17_000, now)).toBe('17s ago');
    expect(relTime(now - 5 * 60_000, now)).toBe('5m ago');
  });
});

describe('misc', () => {
  it('num parses grouped input and rejects junk', () => {
    expect(num('1,000.5')).toBe(1000.5);
    expect(num('')).toBe(0);
    expect(num('abc')).toBe(0);
    expect(num(undefined)).toBe(0);
  });
  it('shortAddr', () => {
    expect(shortAddr('Pebb5Rk3vT9wZpXq2LmNa8bYcDe4FgHjKs7uVwXy')).toBe('Pebb…VwXy');
  });
  it('feePct', () => {
    expect(feePct(25)).toBe('0.25%');
    expect(feePct(100)).toBe('1%');
    expect(feePct(500)).toBe('5%');
  });
});
