export type CalendarSystem = 'persian' | 'gregory';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface CalendarDateTime extends CalendarDate {
  hour: number;
  minute: number;
}

export interface CalendarMonth {
  year: number;
  month: number;
}

/** fa always follows the Persian calendar; every other locale uses Gregorian. */
export function calendarForLocale(locale: string): CalendarSystem {
  return locale.toLowerCase().startsWith('fa') ? 'persian' : 'gregory';
}

const MIN_PERSIAN_YEAR = 1;
const MAX_PERSIAN_YEAR = 3177;
const MIN_GREGORIAN_YEAR = 1;
const MAX_GREGORIAN_YEAR = 9999;

const PERSIAN_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

const JALALI_BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192,
  2262, 2324, 2394, 2456, 3178,
] as const;

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

interface JalCalResult {
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number, withoutLeap = false): JalCalResult {
  if (!Number.isInteger(jy) || jy < JALALI_BREAKS[0] || jy >= JALALI_BREAKS[JALALI_BREAKS.length - 1]) {
    throw new RangeError(`Unsupported Jalali year: ${jy}`);
  }

  const gy = jy + 621;
  let leapJ = -14;
  let jp: number = JALALI_BREAKS[0];
  let jump = 0;

  for (let i = 1; i < JALALI_BREAKS.length; i += 1) {
    const jm = JALALI_BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  let leap = 0;
  if (!withoutLeap) {
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
  }

  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let day =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  day = day - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return day;
}

function d2g(jdn: number): CalendarDate {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const day = div(mod(i, 153), 5) + 1;
  const month = mod(div(i, 153), 12) + 1;
  const year = div(j, 1461) - 100100 + div(8 - month, 6);
  return { year, month, day };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy, true);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): CalendarDate {
  const gy = d2g(jdn).year;
  const jy = gy - 621;
  const r = jalCal(jy, false);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  let year = jy;

  if (k >= 0) {
    if (k <= 185) {
      return { year, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    year -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  return { year, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

export function isJalaliLeapYear(year: number): boolean {
  return jalCal(year, false).leap === 0;
}

function toGregorianDate(date: CalendarDate, calendar: CalendarSystem): CalendarDate {
  if (calendar === 'gregory') return date;
  return d2g(j2d(date.year, date.month, date.day));
}

export function calendarFromTimestamp(timestamp: number, calendar: CalendarSystem): CalendarDate {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return calendar === 'persian' ? d2j(g2d(year, month, day)) : { year, month, day };
}

export function timestampFromCalendar(
  dateTime: CalendarDateTime,
  calendar: CalendarSystem,
): number {
  const gregorian = toGregorianDate(dateTime, calendar);
  return new Date(
    gregorian.year,
    gregorian.month - 1,
    gregorian.day,
    dateTime.hour,
    dateTime.minute,
    0,
    0,
  ).getTime();
}

export function calendarMonthLength(
  year: number,
  month: number,
  calendar: CalendarSystem,
): number {
  if (calendar === 'gregory') return new Date(year, month, 0).getDate();
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeapYear(year) ? 30 : 29;
}

export function calendarWeekday(date: CalendarDate, calendar: CalendarSystem): number {
  const gregorian = toGregorianDate(date, calendar);
  return new Date(gregorian.year, gregorian.month - 1, gregorian.day, 12).getDay();
}

export function calendarWeekStartsOn(calendar: CalendarSystem): number {
  return calendar === 'persian' ? 6 : 0;
}

export function calendarMonthName(
  month: number,
  calendar: CalendarSystem,
  locale: string,
): string {
  if (calendar === 'persian') return PERSIAN_MONTHS[month - 1] ?? '';
  return new Intl.DateTimeFormat(locale, {
    calendar: 'gregory',
    month: 'long',
    timeZone: 'UTC',
  }).format(Date.UTC(2020, month - 1, 15));
}

export function shiftCalendarMonth(
  view: CalendarMonth,
  delta: number,
  calendar: CalendarSystem,
): CalendarMonth | null {
  const total = view.year * 12 + (view.month - 1) + delta;
  const year = Math.floor(total / 12);
  const month = mod(total, 12) + 1;
  const minYear = calendar === 'persian' ? MIN_PERSIAN_YEAR : MIN_GREGORIAN_YEAR;
  const maxYear = calendar === 'persian' ? MAX_PERSIAN_YEAR : MAX_GREGORIAN_YEAR;
  if (year < minYear || year > maxYear) return null;
  return { year, month };
}
