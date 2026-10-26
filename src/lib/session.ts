import type { Booklet, BookletSnapshot, Exam, ExamSession, ExamSnapshot, OptionIndex } from '@/types';
import { bookletRanges, type BookletRange, isQuestionInBooklet } from './booklets';
import { createId } from './id';
import { normalizeSelection, scoreExam } from './scoring';
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
    answerKeyMode: exam.answerKeyMode,
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

export interface SessionSettlement {
  session: ExamSession;
  /** True when the deadline sweep changed the stored attempt. */
  changed: boolean;
}

/**
 * Brings an idle attempt up to date with the clock: expired booklets advance
 * and the final deadline submits it with a frozen result. This keeps an
 * attempt from staying resumable forever when its screen is not open.
 */
export function settleSession(
  session: ExamSession,
  now: number = Date.now(),
): SessionSettlement {
  if (session.status !== 'active') return { session, changed: false };
  const progress = syncBookletProgress(session, now);
  if (!progress.completed) {
    return progress.changed
      ? { session: progress.session, changed: true }
      : { session, changed: false };
  }
  const completedAt = progress.session.bookletEndsAt ?? now;
  return {
    changed: true,
    session: {
      ...progress.session,
      status: 'submitted',
      submittedAt: completedAt,
      result: scoreExam(progress.session.exam, progress.session.responses, completedAt),
    },
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
 * Selects exactly one option per question: picking another option replaces the
 * previous choice, and picking the current choice clears it. Questions outside
 * the active booklet are locked, so their stored answers cannot be changed.
 */
export function toggleResponse(
  session: ExamSession,
  questionId: string,
  option: OptionIndex,
): ExamSession {
  if (!isQuestionAnswerable(session, questionId)) return session;
  const current = responseFor(session, questionId);
  const next: OptionIndex[] = current.length === 1 && current[0] === option ? [] : [option];
  const responses = { ...session.responses };
  if (next.length === 0) {
    delete responses[questionId];
  } else {
    responses[questionId] = next;
  }
  return { ...session, responses };
}

/**
 * Applies the current answer key and editable metadata to an existing attempt.
 * Question order and count, booklet structure, and timing stay frozen; only
 * matching question ids receive the new key, and submitted attempts are
 * re-scored so results stay relational.
 */
export function syncSessionWithExam(session: ExamSession, exam: Exam): ExamSession {
  const keyById = new Map(exam.questions.map((question) => [question.id, question.key]));
  const questions = session.exam.questions.map((question) => {
    const key = keyById.get(question.id);
    return key ? { ...question, key: structuredClone(key) } : question;
  });
  const nextExam: ExamSnapshot = {
    ...session.exam,
    title: exam.title,
    description: exam.description,
    answerKeyMode: exam.answerKeyMode,
    questions,
    updatedAt: exam.updatedAt,
  };
  if (session.status === 'submitted' && session.result) {
    return {
      ...session,
      exam: nextExam,
      result: scoreExam({ questions }, session.responses, session.result.completedAt),
    };
  }
  return { ...session, exam: nextExam };
}

export function answeredCount(session: ExamSession): number {
  return session.exam.questions.filter(
    (question) => responseFor(session, question.id).length > 0,
  ).length;
}

/**
 * Re-derives a submitted attempt's result from its stored responses and keys.
 * This keeps saved percentages consistent when the scoring rules change.
 */
export function rescoreSubmittedSession(session: ExamSession): ExamSession {
  if (session.status !== 'submitted' || !session.result) return session;
  return {
    ...session,
    result: scoreExam(session.exam, session.responses, session.result.completedAt),
  };
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
