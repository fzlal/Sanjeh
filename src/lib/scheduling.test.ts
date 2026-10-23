import { describe, expect, it } from 'vitest';
import type { Scheduling } from '@/types';
import { makeExam } from '@/test/fixtures';
import {
  MINUTE_MS,
  canStartExam,
  computeBookletDeadline,
  getAvailability,
  getRemainingMs,
  validateSchedule,
} from './scheduling';

const start = 1_800_000_000_000;
const hour = 60 * MINUTE_MS;

describe('availability', () => {
  it('always makes immediate exams available', () => {
    const exam = makeExam({ scheduling: { mode: 'immediate' } });
    expect(getAvailability(exam, start).available).toBe(true);
    expect(canStartExam(exam, start)).toEqual({ ok: true });
  });

  it('never treats a scheduled exam as available before its start', () => {
    const exam = makeExam({ scheduling: { mode: 'scheduled', startsAt: start + hour } });
    expect(getAvailability(exam, start)).toMatchObject({
      available: false,
      reason: 'not-started',
    });
    expect(canStartExam(exam, start + hour)).toEqual({ ok: true });
  });

  it('closes a fixed window at its end', () => {
    const exam = makeExam({
      scheduling: { mode: 'window', startsAt: start, endsAt: start + 2 * hour },
    });
    expect(getAvailability(exam, start + hour).available).toBe(true);
    expect(getAvailability(exam, start + 2 * hour)).toMatchObject({
      available: false,
      reason: 'ended',
    });
  });

  it('allows flexible starts only inside the window', () => {
    const exam = makeExam({
      scheduling: { mode: 'flexible', windowStart: start, windowEnd: start + 3 * hour },
    });
    expect(getAvailability(exam, start - 1).available).toBe(false);
    expect(getAvailability(exam, start + hour).available).toBe(true);
    expect(getAvailability(exam, start + 3 * hour).available).toBe(false);
  });
});

describe('computeBookletDeadline', () => {
  it('adds the booklet duration when there is no hard end', () => {
    expect(computeBookletDeadline(45, start, null)).toBe(start + 45 * MINUTE_MS);
  });

  it('returns null for an untimed booklet with no hard end', () => {
    expect(computeBookletDeadline(0, start, null)).toBeNull();
  });

  it('clamps the booklet duration to a hard window deadline', () => {
    expect(computeBookletDeadline(90, start, start + 30 * MINUTE_MS)).toBe(
      start + 30 * MINUTE_MS,
    );
  });

  it('uses the hard end for an untimed booklet inside a window', () => {
    expect(computeBookletDeadline(0, start + hour, start + 2 * hour)).toBe(start + 2 * hour);
  });
});

describe('validateSchedule', () => {
  const cases: Array<[string, Scheduling, number, string[]]> = [
    ['negative duration', { mode: 'immediate' }, -1, ['invalidDuration']],
    ['missing start', { mode: 'scheduled', startsAt: Number.NaN }, 10, ['invalidStart']],
    [
      'end before start',
      { mode: 'window', startsAt: start, endsAt: start - 1 },
      10,
      ['endBeforeStart'],
    ],
    [
      'invalid flexible end',
      { mode: 'flexible', windowStart: start, windowEnd: Number.NaN },
      10,
      ['invalidEnd'],
    ],
  ];

  it.each(cases)('%s', (_label, scheduling, duration, expected) => {
    const result = validateSchedule(scheduling, duration);
    expect(result.errors.map((issue) => issue.code)).toEqual(expected);
  });

  it('warns when duration exceeds the window but does not block it', () => {
    const result = validateSchedule(
      { mode: 'window', startsAt: start, endsAt: start + 20 * MINUTE_MS },
      60,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map((issue) => issue.code)).toEqual(['durationExceedsWindow']);
  });

  it('accepts an exact-fit window without warnings', () => {
    const result = validateSchedule(
      { mode: 'flexible', windowStart: start, windowEnd: start + hour },
      60,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('getRemainingMs', () => {
  it('never reports negative time', () => {
    expect(getRemainingMs(start, start + 5)).toBe(0);
    expect(getRemainingMs(start, start - 5)).toBe(5);
    expect(getRemainingMs(null, start)).toBeNull();
  });
});
