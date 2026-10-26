import { calendarForLocale } from '@/lib/calendar';

const numberCache = new Map<string, Intl.NumberFormat>();

function numberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${locale}|${JSON.stringify(options ?? {})}`;
  const cached = numberCache.get(cacheKey);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(locale, options);
  numberCache.set(cacheKey, formatter);
  return formatter;
}

export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return numberFormat(locale, options).format(value);
}

/** `value` is a percentage of the maximum points and may be negative. */
export function formatPercent(value: number | null, locale: string): string {
  if (value === null) return '—';
  return numberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / 100);
}

export function formatDate(
  timestamp: number,
  locale: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(locale, {
    calendar: calendarForLocale(locale),
    ...options,
  }).format(timestamp);
}

export function formatDateTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    calendar: calendarForLocale(locale),
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}

export function formatTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    calendar: calendarForLocale(locale),
    timeStyle: 'short',
  }).format(timestamp);
}

/** Localized two-digit clock for a millisecond remainder: 04:31 or 1:02:09. */
export function formatClock(ms: number, locale: string): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const part = (value: number) =>
    formatNumber(value, locale, { minimumIntegerDigits: 2, useGrouping: false });
  return hours > 0 ? `${part(hours)}:${part(minutes)}:${part(seconds)}` : `${part(minutes)}:${part(seconds)}`;
}

/** Compact localizable duration, e.g. 4 min / 1 h 12 min, using Intl unit formatting. */
export function formatDuration(ms: number, locale: string): string {
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 1) {
    return numberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'short' }).format(
      Math.max(1, Math.round(ms / 1000)),
    );
  }
  if (totalMinutes < 60) {
    return numberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(
      totalMinutes,
    );
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hoursText = numberFormat(locale, {
    style: 'unit',
    unit: 'hour',
    unitDisplay: 'short',
  }).format(hours);
  if (minutes === 0) return hoursText;
  const minutesText = numberFormat(locale, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'short',
  }).format(minutes);
  return `${hoursText} ${minutesText}`;
}

/** Compact file size, e.g. 840 KB / 4.2 MB. */
export function formatBytes(bytes: number, locale: string): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 1) {
    return `${formatNumber(megabytes, locale, { maximumFractionDigits: 1 })} MB`;
  }
  const kilobytes = bytes / 1024;
  if (kilobytes >= 1) {
    return `${formatNumber(kilobytes, locale, { maximumFractionDigits: 0 })} KB`;
  }
  return `${formatNumber(bytes, locale)} B`;
}

