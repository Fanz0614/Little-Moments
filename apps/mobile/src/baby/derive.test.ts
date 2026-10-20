import { describe, expect, it } from 'vitest';
import { ageOn, ageText, formatAge, isValidCalendarDate, zodiacSign } from './derive';

describe('ageOn', () => {
  it('counts whole calendar months plus remaining days', () => {
    expect(ageOn('2026-07-07', '2026-10-19')).toEqual({ kind: 'born', months: 3, days: 12 });
  });

  it('is zero on the birthday', () => {
    expect(ageOn('2026-10-19', '2026-10-19')).toEqual({ kind: 'born', months: 0, days: 0 });
  });

  it('reports days before birth', () => {
    expect(ageOn('2026-10-19', '2026-09-29')).toEqual({ kind: 'before-birth', days: 20 });
  });

  it('born Jan 31: one month is reached on the last day of February', () => {
    expect(ageOn('2026-01-31', '2026-02-27')).toEqual({ kind: 'born', months: 0, days: 27 });
    expect(ageOn('2026-01-31', '2026-02-28')).toEqual({ kind: 'born', months: 1, days: 0 });
    expect(ageOn('2024-01-31', '2024-02-29')).toEqual({ kind: 'born', months: 1, days: 0 }); // leap year
  });

  it('born Jan 31: months do not drift (two months is Mar 31, not Mar 28)', () => {
    expect(ageOn('2026-01-31', '2026-03-30')).toEqual({ kind: 'born', months: 1, days: 30 });
    expect(ageOn('2026-01-31', '2026-03-31')).toEqual({ kind: 'born', months: 2, days: 0 });
  });

  it('born Feb 29: first birthday is Feb 28 in a common year', () => {
    expect(ageOn('2024-02-29', '2025-02-27')).toEqual({ kind: 'born', months: 11, days: 29 });
    expect(ageOn('2024-02-29', '2025-02-28')).toEqual({ kind: 'born', months: 12, days: 0 });
    expect(ageOn('2024-02-29', '2028-02-29')).toEqual({ kind: 'born', months: 48, days: 0 });
  });

  it('crosses year boundaries', () => {
    expect(ageOn('2025-12-15', '2026-01-14')).toEqual({ kind: 'born', months: 0, days: 30 });
    expect(ageOn('2025-12-15', '2026-01-15')).toEqual({ kind: 'born', months: 1, days: 0 });
  });

  it('is not affected by DST transitions', () => {
    // Sydney DST starts first Sunday of October
    expect(ageOn('2026-10-03', '2026-10-05')).toEqual({ kind: 'born', months: 0, days: 2 });
  });

  it('rejects malformed dates', () => {
    expect(() => ageOn('2026-02-30', '2026-03-01')).toThrow();
    expect(() => ageOn('2026/01/01', '2026-03-01')).toThrow();
  });
});

describe('formatAge', () => {
  it.each([
    [{ kind: 'born', months: 0, days: 0 }, 'Born today'],
    [{ kind: 'born', months: 0, days: 1 }, '1 day'],
    [{ kind: 'born', months: 0, days: 12 }, '12 days'],
    [{ kind: 'born', months: 1, days: 0 }, '1 month'],
    [{ kind: 'born', months: 1, days: 1 }, '1 month 1 day'],
    [{ kind: 'born', months: 3, days: 12 }, '3 months 12 days'],
    [{ kind: 'born', months: 11, days: 30 }, '11 months 30 days'],
    [{ kind: 'born', months: 12, days: 5 }, '1 year'],
    [{ kind: 'born', months: 13, days: 0 }, '1 year 1 month'],
    [{ kind: 'born', months: 15, days: 9 }, '1 year 3 months'],
    [{ kind: 'born', months: 24, days: 0 }, '2 years'],
    [{ kind: 'before-birth', days: 1 }, '1 day before birth'],
    [{ kind: 'before-birth', days: 20 }, '20 days before birth'],
  ] as const)('%o -> %s', (age, text) => {
    expect(formatAge(age)).toBe(text);
  });

  it('ageText composes both', () => {
    expect(ageText('2026-07-07', '2026-10-19')).toBe('3 months 12 days');
  });
});

describe('zodiacSign', () => {
  it.each([
    ['2026-01-01', 'Capricorn'],
    ['2026-01-19', 'Capricorn'],
    ['2026-01-20', 'Aquarius'],
    ['2026-02-18', 'Aquarius'],
    ['2026-02-19', 'Pisces'],
    ['2024-02-29', 'Pisces'],
    ['2026-03-20', 'Pisces'],
    ['2026-03-21', 'Aries'],
    ['2026-04-19', 'Aries'],
    ['2026-04-20', 'Taurus'],
    ['2026-05-20', 'Taurus'],
    ['2026-05-21', 'Gemini'],
    ['2026-06-20', 'Gemini'],
    ['2026-06-21', 'Cancer'],
    ['2026-07-22', 'Cancer'],
    ['2026-07-23', 'Leo'],
    ['2026-08-22', 'Leo'],
    ['2026-08-23', 'Virgo'],
    ['2026-09-22', 'Virgo'],
    ['2026-09-23', 'Libra'],
    ['2026-10-22', 'Libra'],
    ['2026-10-23', 'Scorpio'],
    ['2026-11-21', 'Scorpio'],
    ['2026-11-22', 'Sagittarius'],
    ['2026-12-21', 'Sagittarius'],
    ['2026-12-22', 'Capricorn'],
    ['2026-12-31', 'Capricorn'],
  ])('%s -> %s', (date, sign) => {
    expect(zodiacSign(date)).toBe(sign);
  });
});

describe('isValidCalendarDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidCalendarDate('2024-02-29')).toBe(true);
    expect(isValidCalendarDate('2025-02-29')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});
