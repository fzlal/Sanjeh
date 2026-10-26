import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './format';
import {
  calendarForLocale,
  calendarFromTimestamp,
  calendarMonthLength,
  calendarMonthName,
  calendarWeekStartsOn,
  isJalaliLeapYear,
  shiftCalendarMonth,
  timestampFromCalendar,
} from './calendar';

describe('calendar selection', () => {
  it('maps Persian to Jalali and English to Gregorian', () => {
    expect(calendarForLocale('fa-IR')).toBe('persian');
    expect(calendarForLocale('en-US')).toBe('gregory');
  });

  it('starts the Persian week on Saturday and the Gregorian week on Sunday', () => {
    expect(calendarWeekStartsOn('persian')).toBe(6);
    expect(calendarWeekStartsOn('gregory')).toBe(0);
  });

  it('uses Persian month names for Jalali and localized names for Gregorian', () => {
    expect(calendarMonthName(1, 'persian', 'fa-IR')).toBe('فروردین');
    expect(calendarMonthName(8, 'persian', 'fa-IR')).toBe('آبان');
    expect(calendarMonthName(10, 'gregory', 'en-US')).toBe('October');
  });
});

describe('Jalali conversion', () => {
  it('converts known Gregorian dates to Jalali', () => {
    expect(calendarFromTimestamp(new Date(2024, 2, 20, 12).getTime(), 'persian')).toEqual({
      year: 1403,
      month: 1,
      day: 1,
    });
    expect(calendarFromTimestamp(new Date(2026, 2, 21, 12).getTime(), 'persian')).toEqual({
      year: 1405,
      month: 1,
      day: 1,
    });
    expect(calendarFromTimestamp(new Date(2026, 9, 25, 12).getTime(), 'persian')).toEqual({
      year: 1405,
      month: 8,
      day: 3,
    });
  });

  it('round-trips a Jalali date with its local time', () => {
    const timestamp = new Date(2026, 9, 25, 9, 30).getTime();
    expect(
      timestampFromCalendar({ year: 1405, month: 8, day: 3, hour: 9, minute: 30 }, 'persian'),
    ).toBe(timestamp);
  });

  it('keeps every Jalali date within a valid month and day range', () => {
    const start = new Date(2024, 0, 1, 12).getTime();
    const end = new Date(2029, 0, 1, 12).getTime();
    for (let timestamp = start; timestamp < end; timestamp += 86_400_000) {
      const date = calendarFromTimestamp(timestamp, 'persian');
      expect(date.month).toBeGreaterThanOrEqual(1);
      expect(date.month).toBeLessThanOrEqual(12);
      expect(date.day).toBeGreaterThanOrEqual(1);
      expect(date.day).toBeLessThanOrEqual(
        calendarMonthLength(date.year, date.month, 'persian'),
      );
      expect(calendarMonthName(date.month, 'persian', 'fa-IR')).not.toBe('');
    }
  });

  it('round-trips Gregorian dates unchanged', () => {
    const timestamp = new Date(2026, 9, 25, 18, 5).getTime();
    expect(
      timestampFromCalendar({ year: 2026, month: 10, day: 25, hour: 18, minute: 5 }, 'gregory'),
    ).toBe(timestamp);
    expect(calendarFromTimestamp(timestamp, 'gregory')).toEqual({
      year: 2026,
      month: 10,
      day: 25,
    });
  });

  it('handles Jalali leap years and month lengths', () => {
    expect(isJalaliLeapYear(1403)).toBe(true);
    expect(isJalaliLeapYear(1404)).toBe(false);
    expect(calendarMonthLength(1403, 12, 'persian')).toBe(30);
    expect(calendarMonthLength(1404, 12, 'persian')).toBe(29);
    expect(calendarMonthLength(1405, 6, 'persian')).toBe(31);
    expect(calendarMonthLength(1405, 7, 'persian')).toBe(30);
    expect(calendarMonthLength(2024, 2, 'gregory')).toBe(29);
    expect(calendarMonthLength(2026, 2, 'gregory')).toBe(28);
  });
});

describe('localized formatting', () => {
  it('shows Jalali dates with Persian digits for Persian', () => {
    const timestamp = new Date(2026, 9, 25, 12).getTime();
    const date = formatDate(timestamp, 'fa-IR');
    expect(date).toContain('۱۴۰۵');
    expect(date).toContain('آبان');
    expect(formatDateTime(timestamp, 'fa-IR')).toContain('۱۴۰۵');
  });

  it('shows Gregorian dates for English', () => {
    const timestamp = new Date(2026, 9, 25, 12).getTime();
    expect(formatDate(timestamp, 'en-US')).toContain('2026');
    expect(formatDateTime(timestamp, 'en-US')).toContain('2026');
  });
});

describe('month navigation', () => {
  it('crosses Jalali year boundaries in both directions', () => {
    expect(shiftCalendarMonth({ year: 1405, month: 12 }, 1, 'persian')).toEqual({
      year: 1406,
      month: 1,
    });
    expect(shiftCalendarMonth({ year: 1405, month: 1 }, -1, 'persian')).toEqual({
      year: 1404,
      month: 12,
    });
  });

  it('stops at the supported year bounds', () => {
    expect(shiftCalendarMonth({ year: 1, month: 1 }, -1, 'persian')).toBeNull();
    expect(shiftCalendarMonth({ year: 3177, month: 12 }, 1, 'persian')).toBeNull();
  });
});
