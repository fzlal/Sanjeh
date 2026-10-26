import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  calendarForLocale,
  calendarFromTimestamp,
  calendarMonthLength,
  calendarMonthName,
  calendarWeekStartsOn,
  calendarWeekday,
  shiftCalendarMonth,
  timestampFromCalendar,
  type CalendarDate,
  type CalendarDateTime,
  type CalendarMonth,
  type CalendarSystem,
} from '@/lib/calendar';
import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const MINUTES = Array.from({ length: 60 }, (_, index) => index);
const PERSIAN_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'] as const;
const GREGORIAN_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function draftFromValue(value: number, calendar: CalendarSystem): CalendarDateTime {
  const date = new Date(Number.isFinite(value) ? value : Date.now());
  return {
    ...calendarFromTimestamp(date.getTime(), calendar),
    hour: date.getHours(),
    minute: date.getMinutes(),
  };
}

export function DateTimePicker({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: number;
  onChange: (timestamp: number) => void;
  className?: string;
}) {
  const { t, dir, locale } = useI18n();
  const calendar = calendarForLocale(locale);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CalendarDateTime>(() => draftFromValue(value, calendar));
  const [view, setView] = useState<CalendarMonth>(() => ({
    year: draft.year,
    month: draft.month,
  }));
  const [today, setToday] = useState<CalendarDate>(() => ({
    year: draft.year,
    month: draft.month,
    day: draft.day,
  }));

  const valid = Number.isFinite(value);
  const ChevronBack = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const ChevronForward = dir === 'rtl' ? ChevronLeft : ChevronRight;

  const openPicker = () => {
    const next = draftFromValue(value, calendar);
    setDraft(next);
    setToday(calendarFromTimestamp(Date.now(), calendar));
    setView({ year: next.year, month: next.month });
    setOpen(true);
  };

  const previousMonth = shiftCalendarMonth(view, -1, calendar);
  const nextMonth = shiftCalendarMonth(view, 1, calendar);
  const weekdays = calendar === 'persian' ? PERSIAN_WEEKDAYS : GREGORIAN_WEEKDAYS;
  const offset =
    (calendarWeekday({ year: view.year, month: view.month, day: 1 }, calendar) -
      calendarWeekStartsOn(calendar) +
      7) %
    7;
  const monthLength = calendarMonthLength(view.year, view.month, calendar);

  const selectDay = (day: number) => {
    setDraft((current) => ({ ...current, year: view.year, month: view.month, day }));
  };

  const goToday = () => {
    setDraft((current) => ({
      ...current,
      year: today.year,
      month: today.month,
      day: today.day,
    }));
    setView({ year: today.year, month: today.month });
  };

  const confirm = () => {
    onChange(timestampFromCalendar(draft, calendar));
    setOpen(false);
  };

  const twoDigits = (part: number) =>
    formatNumber(part, locale, { minimumIntegerDigits: 2, useGrouping: false });

  return (
    <>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-label={
          valid ? `${t('chooseDateTime')}: ${formatDateTime(value, locale)}` : t('selectDate')
        }
        onClick={openPicker}
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-glass-border bg-input/75 px-3.5 py-2 text-start text-sm text-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] backdrop-blur-md transition-colors hover:border-primary/25 focus-visible:border-primary/45',
          !valid && 'text-muted-foreground',
          className,
        )}
      >
        <span className="truncate">
          {valid ? formatDateTime(value, locale) : t('selectDate')}
        </span>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('close')} className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dateTimeTitle')}</DialogTitle>
            <DialogDescription>{t('localTimeNote')}</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border border-glass-border bg-input/50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('previousMonth')}
                disabled={!previousMonth}
                onClick={() => previousMonth && setView(previousMonth)}
              >
                <ChevronBack className="size-4" aria-hidden="true" />
              </Button>
              <span className="text-sm font-medium">
                {calendarMonthName(view.month, calendar, locale)}{' '}
                {formatNumber(view.year, locale, { useGrouping: false })}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('nextMonth')}
                disabled={!nextMonth}
                onClick={() => nextMonth && setView(nextMonth)}
              >
                <ChevronForward className="size-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {weekdays.map((label, index) => (
                <div
                  key={`weekday-${index}`}
                  aria-hidden="true"
                  className="flex h-8 items-center justify-center text-xs text-muted-foreground"
                >
                  {label}
                </div>
              ))}
              {Array.from({ length: offset }, (_, index) => (
                <div key={`empty-${index}`} aria-hidden="true" />
              ))}
              {Array.from({ length: monthLength }, (_, index) => {
                const day = index + 1;
                const selected =
                  draft.year === view.year &&
                  draft.month === view.month &&
                  draft.day === day;
                const isToday =
                  today.year === view.year && today.month === view.month && today.day === day;
                const dateLabel = formatDate(
                  timestampFromCalendar(
                    { year: view.year, month: view.month, day, hour: 12, minute: 0 },
                    calendar,
                  ),
                  locale,
                  { dateStyle: 'full' },
                );
                return (
                  <button
                    key={day}
                    type="button"
                    aria-label={dateLabel}
                    aria-pressed={selected}
                    aria-current={isToday ? 'date' : undefined}
                    onClick={() => selectDay(day)}
                    className={cn(
                      'flex aspect-square w-full items-center justify-center rounded-full text-sm transition-colors',
                      selected
                        ? 'bg-primary text-primary-foreground'
                        : isToday
                          ? 'border border-primary/45 text-primary'
                          : 'text-foreground hover:bg-secondary/70',
                    )}
                  >
                    {formatNumber(day, locale, { useGrouping: false })}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id ?? 'date-time'}-hour`}>{t('hour')}</Label>
              <Select
                value={String(draft.hour)}
                onValueChange={(next) =>
                  setDraft((current) => ({ ...current, hour: Number(next) }))
                }
              >
                <SelectTrigger id={`${id ?? 'date-time'}-hour`} className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOURS.map((hour) => (
                    <SelectItem key={hour} value={String(hour)}>
                      {twoDigits(hour)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id ?? 'date-time'}-minute`}>{t('minute')}</Label>
              <Select
                value={String(draft.minute)}
                onValueChange={(next) =>
                  setDraft((current) => ({ ...current, minute: Number(next) }))
                }
              >
                <SelectTrigger id={`${id ?? 'date-time'}-minute`} className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MINUTES.map((minute) => (
                    <SelectItem key={minute} value={String(minute)}>
                      {twoDigits(minute)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToday}>
                {t('today')}
              </Button>
              <Button size="sm" onClick={confirm}>
                {t('confirm')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
