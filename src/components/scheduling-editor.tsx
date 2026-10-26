import { useMemo } from 'react';
import type { Scheduling } from '@/types';
import { useI18n } from '@/i18n';
import type { MessageKey } from '@/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DateTimePicker } from '@/components/date-time-picker';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { validateSchedule, type ScheduleIssueCode } from '@/lib/scheduling';

export function schedulingForMode(mode: Scheduling['mode'], current: Scheduling): Scheduling {
  const fallbackStart = Date.now() + 60 * 60_000;
  const fallbackEnd = Date.now() + 3 * 60 * 60_000;
  if (mode === 'immediate') return { mode };
  if (mode === 'scheduled') {
    return { mode, startsAt: current.mode === 'scheduled' ? current.startsAt : fallbackStart };
  }
  if (mode === 'window') {
    return {
      mode,
      startsAt: current.mode === 'window' ? current.startsAt : fallbackStart,
      endsAt: current.mode === 'window' ? current.endsAt : fallbackEnd,
    };
  }
  return {
    mode: 'flexible',
    windowStart: current.mode === 'flexible' ? current.windowStart : fallbackStart,
    windowEnd: current.mode === 'flexible' ? current.windowEnd : fallbackEnd,
  };
}

const SCHEDULE_MODE_LABELS: Record<Scheduling['mode'], MessageKey> = {
  immediate: 'scheduleImmediate',
  scheduled: 'scheduleStart',
  window: 'scheduleWindow',
  flexible: 'scheduleFlexible',
};

export function scheduleIssueKey(code: ScheduleIssueCode): MessageKey {
  switch (code) {
    case 'invalidDuration':
      return 'invalidDuration';
    case 'invalidStart':
      return 'invalidStart';
    case 'invalidEnd':
      return 'invalidEnd';
    case 'endBeforeStart':
      return 'endBeforeStart';
    case 'durationExceedsWindow':
      return 'durationExceedsWindow';
    default:
      return 'genericError';
  }
}

export function SchedulingEditor({
  scheduling,
  durationMinutes,
  onChange,
  idPrefix = 'schedule',
  className,
}: {
  scheduling: Scheduling;
  durationMinutes: number;
  onChange: (scheduling: Scheduling) => void;
  idPrefix?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const schedule = useMemo(
    () => validateSchedule(scheduling, durationMinutes),
    [scheduling, durationMinutes],
  );

  const startValue =
    scheduling.mode === 'flexible'
      ? scheduling.windowStart
      : scheduling.mode === 'scheduled' || scheduling.mode === 'window'
        ? scheduling.startsAt
        : Number.NaN;
  const endValue =
    scheduling.mode === 'window'
      ? scheduling.endsAt
      : scheduling.mode === 'flexible'
        ? scheduling.windowEnd
        : Number.NaN;

  const setStart = (timestamp: number) => {
    if (scheduling.mode === 'scheduled') {
      onChange({ mode: 'scheduled', startsAt: timestamp });
    } else if (scheduling.mode === 'window') {
      onChange({ mode: 'window', startsAt: timestamp, endsAt: scheduling.endsAt });
    } else if (scheduling.mode === 'flexible') {
      onChange({ mode: 'flexible', windowStart: timestamp, windowEnd: scheduling.windowEnd });
    }
  };

  const setEnd = (timestamp: number) => {
    if (scheduling.mode === 'window') {
      onChange({ mode: 'window', startsAt: scheduling.startsAt, endsAt: timestamp });
    } else if (scheduling.mode === 'flexible') {
      onChange({ mode: 'flexible', windowStart: scheduling.windowStart, windowEnd: timestamp });
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{t('scheduling')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-mode`}>{t('scheduleMode')}</Label>
          <Select
            value={scheduling.mode}
            onValueChange={(value) =>
              onChange(schedulingForMode(value as Scheduling['mode'], scheduling))
            }
          >
            <SelectTrigger id={`${idPrefix}-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SCHEDULE_MODE_LABELS) as Scheduling['mode'][]).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {t(SCHEDULE_MODE_LABELS[mode])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {scheduling.mode !== 'immediate' && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-start`}>
                {scheduling.mode === 'scheduled' || scheduling.mode === 'window'
                  ? t('startsAt')
                  : t('windowStart')}
              </Label>
              <DateTimePicker
                id={`${idPrefix}-start`}
                value={startValue}
                onChange={setStart}
              />
            </div>
            {scheduling.mode !== 'scheduled' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${idPrefix}-end`}>
                  {scheduling.mode === 'window' ? t('endsAt') : t('windowEnd')}
                </Label>
                <DateTimePicker
                  id={`${idPrefix}-end`}
                  value={endValue}
                  onChange={setEnd}
                />
              </div>
            )}
          </div>
        )}

        {schedule.errors.map((issue) => (
          <p key={`error-${issue.code}`} className="text-xs text-incorrect" role="alert">
            {t(scheduleIssueKey(issue.code))}
          </p>
        ))}
        {schedule.warnings.map((issue) => (
          <p key={`warning-${issue.code}`} className="text-xs text-warning">
            {t(scheduleIssueKey(issue.code))}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
