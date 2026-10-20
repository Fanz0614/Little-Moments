/**
 * Pure calendar helpers for the baby profile. All dates are calendar dates
 * ('YYYY-MM-DD') with no time zone; arithmetic is done in UTC so DST and the
 * device time zone can never shift a day.
 */

export type CalendarDate = string; // YYYY-MM-DD

type YMD = { y: number; m: number; d: number }; // m is 1-12

export function parseCalendarDate(s: CalendarDate): YMD {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) throw new Error(`invalid calendar date: ${s}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`invalid calendar date: ${s}`);
  return { y, m, d };
}

export function isValidCalendarDate(s: string): boolean {
  try {
    parseCalendarDate(s);
    return true;
  } catch {
    return false;
  }
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUtc({ y, m, d }: YMD): number {
  return Date.UTC(y, m - 1, d);
}

const DAY_MS = 86_400_000;

function diffDays(from: YMD, to: YMD): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/**
 * `months` calendar months after `start`, clamped to the end of the month.
 * Always computed from the original start (Jan 31 + 2 months = Mar 31, not
 * Mar 28), so ages never drift.
 */
function addMonths(start: YMD, months: number): YMD {
  const total = start.m - 1 + months;
  const y = start.y + Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(start.d, daysInMonth(y, m)) };
}

export type Age =
  | { kind: 'before-birth'; days: number }
  | { kind: 'born'; months: number; days: number }; // months = whole calendar months, days = remainder

/**
 * Age of a baby born on `birthday` on the calendar day `on`.
 * A month is complete on the same day-of-month (or the month's last day when
 * that day doesn't exist: born Jan 31 -> 1 month on Feb 28/29; born Feb 29 ->
 * 1 year on Feb 28 in common years).
 */
export function ageOn(birthday: CalendarDate, on: CalendarDate): Age {
  const b = parseCalendarDate(birthday);
  const t = parseCalendarDate(on);
  const total = diffDays(b, t);
  if (total < 0) return { kind: 'before-birth', days: -total };

  let months = (t.y - b.y) * 12 + (t.m - b.m);
  if (toUtc(addMonths(b, months)) > toUtc(t)) months -= 1;
  return { kind: 'born', months, days: diffDays(addMonths(b, months), t) };
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * Display form:
 *   Born today | 12 days | 3 months 12 days | 3 months | 1 year 3 months | 1 year | 20 days before birth
 * From one year on, leftover days are dropped (nobody says "1 year 3 months 4 days").
 */
export function formatAge(age: Age): string {
  if (age.kind === 'before-birth') return `${plural(age.days, 'day')} before birth`;
  const { months, days } = age;
  if (months === 0) return days === 0 ? 'Born today' : plural(days, 'day');
  if (months < 12) return days === 0 ? plural(months, 'month') : `${plural(months, 'month')} ${plural(days, 'day')}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest === 0 ? plural(years, 'year') : `${plural(years, 'year')} ${plural(rest, 'month')}`;
}

export function ageText(birthday: CalendarDate, on: CalendarDate): string {
  return formatAge(ageOn(birthday, on));
}

export type ZodiacSign =
  | 'Capricorn'
  | 'Aquarius'
  | 'Pisces'
  | 'Aries'
  | 'Taurus'
  | 'Gemini'
  | 'Cancer'
  | 'Leo'
  | 'Virgo'
  | 'Libra'
  | 'Scorpio'
  | 'Sagittarius';

/** First day of each sign, in calendar order starting from January. */
const SIGN_STARTS: readonly [month: number, day: number, sign: ZodiacSign][] = [
  [1, 20, 'Aquarius'],
  [2, 19, 'Pisces'],
  [3, 21, 'Aries'],
  [4, 20, 'Taurus'],
  [5, 21, 'Gemini'],
  [6, 21, 'Cancer'],
  [7, 23, 'Leo'],
  [8, 23, 'Virgo'],
  [9, 23, 'Libra'],
  [10, 23, 'Scorpio'],
  [11, 22, 'Sagittarius'],
  [12, 22, 'Capricorn'],
];

/** Western (tropical) zodiac sign for a birthday, using the common fixed date table. */
export function zodiacSign(birthday: CalendarDate): ZodiacSign {
  const { m, d } = parseCalendarDate(birthday);
  let sign: ZodiacSign = 'Capricorn'; // Jan 1–19 continues December's sign
  for (const [sm, sd, s] of SIGN_STARTS) {
    if (m > sm || (m === sm && d >= sd)) sign = s;
  }
  return sign;
}
