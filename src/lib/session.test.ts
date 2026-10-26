import { describe, expect, it } from 'vitest';
import type { Question } from '@/types';
import { makeBooklet, makeExam, makeQuestion } from '@/test/fixtures';
import {
  advanceBooklet,
  answeredCount,
  answeredInBookletCount,
  createSession,
  currentBookletRange,
  excludedCount,
  isQuestionAnswerable,
  isSessionExpired,
  responseFor,
  settleSession,
  syncBookletProgress,
  syncSessionWithExam,
  toggleResponse,
} from './session';
import { scoreExam } from './scoring';

const MINUTE = 60_000;
const start = 1000;

function baseQuestions(): Question[] {
  return [
    makeQuestion({ id: 'a' }),
    makeQuestion({ id: 'b' }),
    makeQuestion({ id: 'c' }),
    makeQuestion({ id: 'd' }),
    makeQuestion({ id: 'e', key: { kind: 'excluded' } }),
  ];
}

/** First booklet holds a–c (10 min), second holds d–e (20 min). */
function twoBookletExam() {
  return makeExam({
    questions: baseQuestions(),
    booklets: [
      makeBooklet({ id: 'b1', title: 'First', questionCount: 3, durationMinutes: 10 }),
      makeBooklet({ id: 'b2', title: 'Second', questionCount: 2, durationMinutes: 20 }),
    ],
  });
}

describe('createSession', () => {
  it('freezes question order and booklet metadata without PDFs', () => {
    const session = createSession(twoBookletExam(), start);
    expect(session.exam.questions.map((question) => question.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    expect(session.exam.booklets).toEqual([
      { id: 'b1', title: 'First', questionCount: 3, durationMinutes: 10 },
      { id: 'b2', title: 'Second', questionCount: 2, durationMinutes: 20 },
    ]);
    expect(session.exam.booklets[0]).not.toHaveProperty('pdfs');
    expect(session.exam).not.toHaveProperty('answerPdfs');
    expect(session.responses).toEqual({});
    expect(session.status).toBe('active');
  });

  it('starts on the first booklet with its own deadline', () => {
    const session = createSession(twoBookletExam(), start);
    expect(session.bookletIndex).toBe(0);
    expect(session.bookletStartedAt).toBe(start);
    expect(session.bookletEndsAt).toBe(start + 10 * MINUTE);
    expect(session.endsAt).toBeNull();
  });

  it('clamps the first booklet to a schedule window end', () => {
    const exam = twoBookletExam();
    exam.scheduling = { mode: 'window', startsAt: 0, endsAt: start + 5 * MINUTE };
    const session = createSession(exam, start);
    expect(session.endsAt).toBe(start + 5 * MINUTE);
    expect(session.bookletEndsAt).toBe(start + 5 * MINUTE);
  });

  it('keeps the snapshot independent from later exam edits', () => {
    const exam = twoBookletExam();
    const session = createSession(exam, start);
    exam.title = 'Changed later';
    exam.questions[0].key = { kind: 'unresolved' };
    exam.booklets[0].durationMinutes = 99;
    expect(session.exam.title).toBe('Test exam');
    expect(session.exam.questions[0].key.kind).toBe('known');
    expect(session.exam.booklets[0].durationMinutes).toBe(10);
  });

  it('assigns each attempt a unique id', () => {
    const exam = twoBookletExam();
    expect(createSession(exam, 1).id).not.toBe(createSession(exam, 1).id);
  });
});

describe('responded questions', () => {
  it('keeps exactly one selected option per question', () => {
    const session = createSession(makeExam({ questions: baseQuestions() }), 1);
    const afterFirst = toggleResponse(session, 'a', 3);
    const afterSecond = toggleResponse(afterFirst, 'a', 1);
    expect(afterFirst.responses.a).toEqual([3]);
    expect(responseFor(afterSecond, 'a')).toEqual([1]);
    expect(session.responses).toEqual({});
  });

  it('removes a question entry when its last option is toggled off', () => {
    const session = createSession(makeExam({ questions: baseQuestions() }), 1);
    const selected = toggleResponse(session, 'b', 2);
    const cleared = toggleResponse(selected, 'b', 2);
    expect(cleared.responses.b).toBeUndefined();
  });

  it('counts answered questions only', () => {
    let session = createSession(makeExam({ questions: baseQuestions() }), 1);
    session = toggleResponse(session, 'a', 1);
    session = toggleResponse(session, 'c', 4);
    expect(answeredCount(session)).toBe(2);
  });

  it('counts excluded questions from the snapshot key', () => {
    expect(excludedCount(createSession(makeExam({ questions: baseQuestions() }), 1))).toBe(1);
  });

  it('keeps responses attached to the stable question id', () => {
    const session = createSession(makeExam({ questions: baseQuestions() }), 1);
    const updated = toggleResponse(session, 'd', 2);
    expect(updated.responses.d).toEqual([2]);
    expect(responseFor(updated, 'd')).toEqual([2]);
    expect(responseFor(updated, 'a')).toEqual([]);
  });
});

describe('relational exam updates', () => {
  it('applies a new key and re-scores a submitted attempt by question id', () => {
    const exam = makeExam({
      id: 'exam-sync',
      questions: [
        makeQuestion({ id: 'q1', key: { kind: 'known', correct: [1] } }),
        makeQuestion({ id: 'q2', key: { kind: 'known', correct: [2] } }),
      ],
      booklets: [makeBooklet({ questionCount: 2 })],
    });
    const session = createSession(exam, 1000);
    const answered = {
      ...toggleResponse(session, 'q1', 1),
      status: 'submitted' as const,
      submittedAt: 2000,
      result: scoreExam(exam, { ...session.responses, q1: [1] }, 2000),
    };
    expect(answered.result.correct).toBe(1);
    expect(answered.result.percentage).toBe(50);

    const edited: typeof exam = {
      ...exam,
      title: 'Edited title',
      questions: [
        { id: 'q1', key: { kind: 'known', correct: [3] } },
        { id: 'q2', key: { kind: 'known', correct: [2] } },
        { id: 'q3', key: { kind: 'known', correct: [4] } },
      ],
      updatedAt: 3000,
    };
    const synced = syncSessionWithExam(answered, edited);

    expect(synced.exam.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
    expect(synced.exam.questions[0].key).toEqual({ kind: 'known', correct: [3] });
    expect(synced.exam.title).toBe('Edited title');
    expect(synced.result?.correct).toBe(0);
    expect(synced.result?.percentage).toBe(-16.7);
    expect(synced.result?.totalQuestions).toBe(2);
    expect(synced.result?.completedAt).toBe(2000);
  });

  it('updates an active attempt without adding questions', () => {
    const exam = makeExam({
      questions: [makeQuestion({ id: 'a', key: { kind: 'known', correct: [1] } })],
      booklets: [makeBooklet({ questionCount: 1 })],
    });
    const session = createSession(exam, 1000);
    const synced = syncSessionWithExam(session, {
      ...exam,
      questions: [
        { id: 'a', key: { kind: 'unresolved' } },
        { id: 'b', key: { kind: 'known', correct: [2] } },
      ],
    });
    expect(synced.exam.questions).toHaveLength(1);
    expect(synced.exam.questions[0].key).toEqual({ kind: 'unresolved' });
    expect(synced.result).toBeUndefined();
  });
});

describe('booklet progress', () => {
  it('exposes the question range of the active booklet', () => {
    const session = createSession(twoBookletExam(), start);
    expect(currentBookletRange(session)).toMatchObject({
      index: 0,
      startQuestion: 1,
      endQuestion: 3,
      count: 3,
    });
  });

  it('advances automatically when a booklet deadline passes', () => {
    const session = createSession(twoBookletExam(), start);
    const firstDeadline = start + 10 * MINUTE;

    const early = syncBookletProgress(session, firstDeadline - 1);
    expect(early.changed).toBe(false);
    expect(early.completed).toBe(false);
    expect(early.session).toBe(session);

    const next = syncBookletProgress(session, firstDeadline + 15 * MINUTE);
    expect(next.changed).toBe(true);
    expect(next.completed).toBe(false);
    expect(next.session.bookletIndex).toBe(1);
    expect(next.session.bookletStartedAt).toBe(firstDeadline);
    expect(next.session.bookletEndsAt).toBe(start + 30 * MINUTE);
  });

  it('completes when the last booklet deadline passes', () => {
    const session = createSession(twoBookletExam(), start);
    const late = syncBookletProgress(session, start + 30 * MINUTE);
    expect(late.changed).toBe(true);
    expect(late.completed).toBe(true);
    expect(late.session.bookletIndex).toBe(1);
  });

  it('walks through several expired booklets at once', () => {
    const exam = makeExam({
      questions: baseQuestions(),
      booklets: [
        makeBooklet({ questionCount: 2, durationMinutes: 5 }),
        makeBooklet({ questionCount: 2, durationMinutes: 5 }),
        makeBooklet({ questionCount: 1, durationMinutes: 5 }),
      ],
    });
    const session = createSession(exam, start);

    const middle = syncBookletProgress(session, start + 12 * MINUTE);
    expect(middle.session.bookletIndex).toBe(2);
    expect(middle.session.bookletStartedAt).toBe(start + 10 * MINUTE);
    expect(middle.session.bookletEndsAt).toBe(start + 15 * MINUTE);
    expect(middle.completed).toBe(false);

    expect(syncBookletProgress(session, start + 15 * MINUTE).completed).toBe(true);
  });

  it('never carries leftover time into the next booklet on a manual finish', () => {
    const session = createSession(twoBookletExam(), start);
    const now = start + 5 * MINUTE;
    const { session: next, completed } = advanceBooklet(session, now);

    expect(completed).toBe(false);
    expect(next.bookletIndex).toBe(1);
    expect(next.bookletStartedAt).toBe(now);
    expect(next.bookletEndsAt).toBe(now + 20 * MINUTE);
    expect(next.bookletEndsAt).not.toBe(start + 30 * MINUTE);
  });

  it('reports completion when finishing the last booklet manually', () => {
    const session = createSession(twoBookletExam(), start);
    const second = syncBookletProgress(session, start + 10 * MINUTE).session;
    const result = advanceBooklet(second, start + 12 * MINUTE);
    expect(result.completed).toBe(true);
    expect(result.session).toBe(second);
  });

  it('clamps the next booklet to the schedule window end', () => {
    const exam = twoBookletExam();
    const hardEnd = start + 25 * MINUTE;
    exam.scheduling = { mode: 'window', startsAt: 0, endsAt: hardEnd };
    const session = createSession(exam, start);
    const next = syncBookletProgress(session, start + 10 * MINUTE).session;
    expect(next.bookletEndsAt).toBe(hardEnd);
    expect(isSessionExpired(next, hardEnd)).toBe(true);
  });
});

describe('booklet locking', () => {
  it('only answers questions from the active booklet', () => {
    const session = createSession(twoBookletExam(), start);
    expect(isQuestionAnswerable(session, 'c')).toBe(true);
    expect(isQuestionAnswerable(session, 'd')).toBe(false);
    expect(toggleResponse(session, 'd', 2)).toBe(session);
  });

  it('locks earlier booklets after advancing and keeps their answers', () => {
    let session = createSession(twoBookletExam(), start);
    session = toggleResponse(session, 'a', 1);
    session = syncBookletProgress(session, start + 10 * MINUTE).session;

    expect(isQuestionAnswerable(session, 'a')).toBe(false);
    expect(isQuestionAnswerable(session, 'd')).toBe(true);
    expect(responseFor(session, 'a')).toEqual([1]);
    expect(toggleResponse(session, 'a', 2)).toBe(session);

    const answered = toggleResponse(session, 'd', 2);
    expect(answered.responses.d).toEqual([2]);
  });

  it('counts answers inside the active booklet', () => {
    let session = createSession(twoBookletExam(), start);
    session = toggleResponse(session, 'a', 1);
    session = toggleResponse(session, 'b', 2);
    expect(answeredInBookletCount(session)).toBe(2);

    session = syncBookletProgress(session, start + 10 * MINUTE).session;
    expect(answeredInBookletCount(session)).toBe(0);
    session = toggleResponse(session, 'd', 2);
    expect(answeredInBookletCount(session)).toBe(1);
    expect(answeredCount(session)).toBe(3);
  });
});

describe('automatic settlement', () => {
  it('submits an attempt once its final deadline passes', () => {
    let session = createSession(twoBookletExam(), start);
    session = toggleResponse(session, 'a', 1);

    const settled = settleSession(session, start + 30 * MINUTE);
    expect(settled.changed).toBe(true);
    expect(settled.session.status).toBe('submitted');
    expect(settled.session.submittedAt).toBe(start + 30 * MINUTE);
    expect(settled.session.result?.completedAt).toBe(start + 30 * MINUTE);
    expect(settled.session.result?.correct).toBe(1);
    expect(settled.session.result?.totalQuestions).toBe(5);
  });

  it('advances an expired booklet but keeps the attempt active', () => {
    const session = createSession(twoBookletExam(), start);
    const settled = settleSession(session, start + 15 * MINUTE);
    expect(settled.changed).toBe(true);
    expect(settled.session.status).toBe('active');
    expect(settled.session.bookletIndex).toBe(1);
    expect(settled.session.result).toBeUndefined();
  });

  it('leaves an attempt before any deadline untouched', () => {
    const session = createSession(twoBookletExam(), start);
    const settled = settleSession(session, start + MINUTE);
    expect(settled.changed).toBe(false);
    expect(settled.session).toBe(session);
  });

  it('never resettles a submitted attempt', () => {
    const session = createSession(twoBookletExam(), start);
    const submitted = settleSession(session, start + 30 * MINUTE).session;
    const again = settleSession(submitted, start + 60 * MINUTE);
    expect(again.changed).toBe(false);
    expect(again.session).toBe(submitted);
  });

  it('keeps untimed attempts active indefinitely', () => {
    const exam = makeExam({
      questions: baseQuestions(),
      booklets: [makeBooklet({ questionCount: 5, durationMinutes: 0 })],
    });
    const session = createSession(exam, start);
    const settled = settleSession(session, start + 10_000_000);
    expect(settled.changed).toBe(false);
    expect(settled.session.status).toBe('active');
  });
});

describe('expiry', () => {
  it('expires only when the last booklet deadline passes', () => {
    const session = createSession(twoBookletExam(), start);
    expect(isSessionExpired(session, start + 10 * MINUTE)).toBe(false);

    const second = syncBookletProgress(session, start + 10 * MINUTE).session;
    expect(isSessionExpired(second, start + 30 * MINUTE - 1)).toBe(false);
    expect(isSessionExpired(second, start + 30 * MINUTE)).toBe(true);
  });

  it('ignores untimed booklets', () => {
    const exam = makeExam({
      questions: baseQuestions(),
      booklets: [makeBooklet({ questionCount: 5, durationMinutes: 0 })],
    });
    const session = createSession(exam, start);
    expect(session.bookletEndsAt).toBeNull();
    expect(isSessionExpired(session, start + 10_000_000)).toBe(false);
  });
});
