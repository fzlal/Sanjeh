import type { Booklet, BookletSnapshot, Exam, ExamSession, ExamSnapshot, OptionIndex } from '@/types';
import { bookletRanges, type BookletRange, isQuestionInBooklet } from './booklets';
import { createId } from './id';
import { normalizeSelection } from './scoring';
import { computeBookletDeadline, getScheduleBounds } from './scheduling';

function snapshotBooklets(booklets: Booklet[]): BookletSnapshot[] {
  return booklets.map((booklet) => ({
    id: booklet.id,
    title: booklet.title,
    questionCount: booklet.questionCount,
    durationMinutes: booklet.durationMinutes,
  }));
}

function snapshotExam(exam: Exam): ExamSnapshot {
  return {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    questions: structuredClone(exam.questions),
    booklets: snapshotBooklets(exam.booklets),
    scheduling: structuredClone(exam.scheduling),
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
  };
}

/**
 * Creates one attempt with a frozen exam snapshot. Questions stay in the
 * printed order so the on-screen answer sheet matches the paper booklet.
 */
export function createSession(exam: Exam, now: number = Date.now()): ExamSession {
  const first = exam.booklets[0];
  const hardEnd = getScheduleBounds(exam.scheduling).endsAt;
  return {
    id: createId(),
    examId: exam.id,
    exam: snapshotExam(exam),
    responses: {},
    startedAt: now,
    bookletIndex: 0,
    bookletStartedAt: now,
    bookletEndsAt: first
      ? computeBookletDeadline(first.durationMinutes, now, hardEnd)
      : hardEnd,
    endsAt: hardEnd,
    status: 'active',
  };
}

export function isBookletExpired(session: ExamSession, now: number = Date.now()): boolean {
  return session.bookletEndsAt !== null && now >= session.bookletEndsAt;
}

export function isLastBooklet(session: ExamSession): boolean {
  return session.bookletIndex >= session.exam.booklets.length - 1;
}

export function isSessionExpired(session: ExamSession, now: number = Date.now()): boolean {
  return isLastBooklet(session) && isBookletExpired(session, now);
}

export interface BookletSync {
  session: ExamSession;
  /** True when the active booklet changed. */
  changed: boolean;
  /** True when the final booklet's deadline has passed. */
  completed: boolean;
}

/**
 * Moves through every booklet whose deadline has already passed. The next
 * booklet starts exactly at the previous deadline, so leftover time is
 * discarded instead of being carried forward.
 */
export function syncBookletProgress(
  session: ExamSession,
  now: number = Date.now(),
): BookletSync {
  let next = session;
  let changed = false;

  while (true) {
    if (next.bookletEndsAt === null || now < next.bookletEndsAt) {
      return { session: next, changed, completed: false };
    }
    if (isLastBooklet(next)) {
      return { session: next, changed, completed: true };
    }
    const following = next.exam.booklets[next.bookletIndex + 1];
    const startedAt = next.bookletEndsAt;
    next = {
      ...next,
      bookletIndex: next.bookletIndex + 1,
      bookletStartedAt: startedAt,
      bookletEndsAt: computeBookletDeadline(following.durationMinutes, startedAt, next.endsAt),
    };
    changed = true;
  }
}

/**
 * Ends the current booklet on demand. The next booklet starts now with its own
 * full duration; the current booklet's remaining time is never added to it.
 */
export function advanceBooklet(
  session: ExamSession,
  now: number = Date.now(),
): { session: ExamSession; completed: boolean } {
  if (isLastBooklet(session)) return { session, completed: true };
  const following = session.exam.booklets[session.bookletIndex + 1];
  return {
    session: {
      ...session,
      bookletIndex: session.bookletIndex + 1,
      bookletStartedAt: now,
      bookletEndsAt: computeBookletDeadline(following.durationMinutes, now, session.endsAt),
    },
    completed: false,
  };
}

export function currentBookletRange(session: ExamSession): BookletRange | undefined {
  return bookletRanges(session.exam.booklets)[session.bookletIndex];
}

export function isQuestionAnswerable(session: ExamSession, questionId: string): boolean {
  const questionIndex = session.exam.questions.findIndex(
    (question) => question.id === questionId,
  );
  if (questionIndex < 0) return false;
  return isQuestionInBooklet(
    bookletRanges(session.exam.booklets),
    session.bookletIndex,
    questionIndex,
  );
}

export function responseFor(session: ExamSession, questionId: string): OptionIndex[] {
  return normalizeSelection(session.responses[questionId]);
}

/**
 * Toggles one option while preserving other selections. Questions outside the
 * active booklet are locked, so their stored answers cannot be changed.
 */
export function toggleResponse(
  session: ExamSession,
  questionId: string,
  option: OptionIndex,
): ExamSession {
  if (!isQuestionAnswerable(session, questionId)) return session;
  const current = responseFor(session, questionId);
  const next = current.includes(option)
    ? current.filter((value) => value !== option)
    : [...current, option].sort((a, b) => a - b);
  const responses = { ...session.responses };
  if (next.length === 0) {
    delete responses[questionId];
  } else {
    responses[questionId] = next as OptionIndex[];
  }
  return { ...session, responses };
}

export function answeredCount(session: ExamSession): number {
  return session.exam.questions.filter(
    (question) => responseFor(session, question.id).length > 0,
  ).length;
}

export function answeredInBookletCount(session: ExamSession): number {
  const range = currentBookletRange(session);
  if (!range) return 0;
  return session.exam.questions
    .slice(range.startIndex, range.endIndex)
    .filter((question) => responseFor(session, question.id).length > 0).length;
}

export function excludedCount(session: ExamSession): number {
  return session.exam.questions.filter((question) => question.key.kind === 'excluded').length;
}
