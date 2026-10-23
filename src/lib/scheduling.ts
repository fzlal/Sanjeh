import type { Exam, Scheduling } from '@/types';

export const MINUTE_MS = 60_000;

export type ScheduleIssueCode =
  | 'invalidDuration'
  | 'invalidStart'
  | 'invalidEnd'
  | 'endBeforeStart'
  | 'durationExceedsWindow';

export interface ScheduleIssue {
  code: ScheduleIssueCode;
}

export interface ScheduleValidation {
  errors: ScheduleIssue[];
  warnings: ScheduleIssue[];
}

export type AvailabilityReason = 'not-started' | 'ended';

export interface Availability {
  available: boolean;
  reason?: AvailabilityReason;
  startsAt: number | null;
  endsAt: number | null;
}

export function getScheduleBounds(
  scheduling: Scheduling,
): { startsAt: number | null; endsAt: number | null } {
  switch (scheduling.mode) {
    case 'immediate':
      return { startsAt: null, endsAt: null };
    case 'scheduled':
      return { startsAt: scheduling.startsAt, endsAt: null };
    case 'window':
      return { startsAt: scheduling.startsAt, endsAt: scheduling.endsAt };
    case 'flexible':
      return { startsAt: scheduling.windowStart, endsAt: scheduling.windowEnd };
    default:
      return { startsAt: null, endsAt: null };
  }
}

export function getAvailability(exam: Exam, now: number = Date.now()): Availability {
  const { startsAt, endsAt } = getScheduleBounds(exam.scheduling);
  if (startsAt !== null && now < startsAt) {
    return { available: false, reason: 'not-started', startsAt, endsAt };
  }
  if (endsAt !== null && now >= endsAt) {
    return { available: false, reason: 'ended', startsAt, endsAt };
  }
  return { available: true, startsAt, endsAt };
}

export interface StartCheck {
  ok: boolean;
  reason?: AvailabilityReason;
}

export function canStartExam(exam: Exam, now: number = Date.now()): StartCheck {
  const availability = getAvailability(exam, now);
  return availability.available ? { ok: true } : { ok: false, reason: availability.reason };
}

/**
 * Deadline for one booklet. Each booklet gets its own full duration starting
 * when it begins, then the result is clamped to the hard end of a fixed or
 * flexible availability window.
 */
export function computeBookletDeadline(
  durationMinutes: number,
  startedAt: number,
  hardEnd: number | null,
): number | null {
  const durationMs = durationMinutes > 0 ? durationMinutes * MINUTE_MS : null;
  if (durationMs === null) return hardEnd;
  const individualDeadline = startedAt + durationMs;
  return hardEnd === null ? individualDeadline : Math.min(individualDeadline, hardEnd);
}

export function getRemainingMs(
  endsAt: number | null,
  now: number = Date.now(),
): number | null {
  if (endsAt === null) return null;
  return Math.max(0, endsAt - now);
}

export function validateSchedule(
  scheduling: Scheduling,
  durationMinutes: number,
): ScheduleValidation {
  const errors: ScheduleIssue[] = [];
  const warnings: ScheduleIssue[] = [];

  if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
    errors.push({ code: 'invalidDuration' });
  }

  const durationMs = durationMinutes * MINUTE_MS;

  switch (scheduling.mode) {
    case 'immediate':
      break;
    case 'scheduled':
      if (!Number.isFinite(scheduling.startsAt)) {
        errors.push({ code: 'invalidStart' });
      }
      break;
    case 'window':
      if (!Number.isFinite(scheduling.startsAt)) errors.push({ code: 'invalidStart' });
      if (!Number.isFinite(scheduling.endsAt)) errors.push({ code: 'invalidEnd' });
      if (
        Number.isFinite(scheduling.startsAt) &&
        Number.isFinite(scheduling.endsAt)
      ) {
        if (scheduling.endsAt <= scheduling.startsAt) {
          errors.push({ code: 'endBeforeStart' });
        } else if (durationMinutes > 0 && durationMs > scheduling.endsAt - scheduling.startsAt) {
          warnings.push({ code: 'durationExceedsWindow' });
        }
      }
      break;
    case 'flexible':
      if (!Number.isFinite(scheduling.windowStart)) errors.push({ code: 'invalidStart' });
      if (!Number.isFinite(scheduling.windowEnd)) errors.push({ code: 'invalidEnd' });
      if (
        Number.isFinite(scheduling.windowStart) &&
        Number.isFinite(scheduling.windowEnd)
      ) {
        if (scheduling.windowEnd <= scheduling.windowStart) {
          errors.push({ code: 'endBeforeStart' });
        } else if (
          durationMinutes > 0 &&
          durationMs > scheduling.windowEnd - scheduling.windowStart
        ) {
          warnings.push({ code: 'durationExceedsWindow' });
        }
      }
      break;
  }

  return { errors, warnings };
}
