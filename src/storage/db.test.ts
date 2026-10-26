import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeBooklet, makeExam, makePdf, makeQuestion } from '@/test/fixtures';
import { createSession, toggleResponse } from '@/lib/session';
import { scoreExam } from '@/lib/scoring';
import type { Exam, ExamSession, Settings } from '@/types';
import {
  StorageError,
  clearAllStores,
  getExam,
  getSession,
  loadExams,
  loadSessions,
  readSettingsRecord,
  replaceAllData,
  saveExam,
  saveSession,
  writeSettingsRecord,
} from './db';

const settings: Settings = {
  language: 'fa',
  theme: 'paper',
  appearance: 'light',
  onboardingComplete: true,
};

beforeEach(async () => {
  await clearAllStores();
});

function submit(
  exam: Exam,
  startedAt: number,
  responses: Record<string, [number]>,
): ExamSession {
  const session = createSession(exam, startedAt);
  let answered = session;
  for (const [questionId, option] of Object.entries(responses)) {
    answered = toggleResponse(answered, questionId, option[0] as 1 | 2 | 3 | 4);
  }
  return {
    ...answered,
    status: 'submitted',
    submittedAt: startedAt + 1000,
    result: scoreExam(exam, answered.responses, startedAt + 1000),
  };
}

describe('local persistence', () => {
  it('saves and reloads exams with native Blob PDFs and booklets', async () => {
    const exam = makeExam({
      id: 'exam-a',
      booklets: [
        makeBooklet({
          id: 'booklet-1',
          title: 'Booklet 1',
          questionCount: 1,
          durationMinutes: 15,
          pdfs: [makePdf('booklet-1.pdf', 'Booklet 1')],
        }),
        makeBooklet({
          id: 'booklet-2',
          title: 'Booklet 2',
          questionCount: 1,
          durationMinutes: 25,
          pdfs: [makePdf('booklet-2.pdf', 'Booklet 2')],
        }),
      ],
    });
    await saveExam(exam);
    const [reloaded] = await loadExams();
    expect(reloaded.id).toBe('exam-a');
    expect(reloaded.booklets).toHaveLength(2);
    expect(reloaded.booklets[1].title).toBe('Booklet 2');
    expect(reloaded.booklets[1].durationMinutes).toBe(25);
    const storedPdf = reloaded.booklets[0].pdfs[0];
    expect(storedPdf).toMatchObject({
      id: exam.booklets[0].pdfs[0].id,
      title: 'Booklet 1',
      name: 'booklet-1.pdf',
      type: 'application/pdf',
      digest: exam.booklets[0].pdfs[0].digest,
    });
    expect(storedPdf.blob).toBeInstanceOf(Blob);
    expect(await storedPdf.blob?.text()).toBe('%PDF-1.4\n%EOF\n');
    expect((await getExam('exam-a'))?.answerPdfs[0].name).toBe(exam.answerPdfs[0].name);
  });

  it('persists responses and the frozen booklet snapshot across reloads', async () => {
    const exam = makeExam({
      id: 'exam-b',
      questions: [
        makeQuestion({ id: 'q1' }),
        makeQuestion({ id: 'q2' }),
        makeQuestion({ id: 'q3' }),
      ],
      booklets: [makeBooklet({ questionCount: 3, durationMinutes: 20 })],
    });
    await saveExam(exam);

    const session = createSession(exam, 5_000);
    const answered = toggleResponse(toggleResponse(session, 'q2', 2), 'q2', 4);
    await saveSession(answered);

    const reloaded = await getSession(answered.id);
    expect(reloaded).toBeDefined();
    expect(reloaded?.exam.questions.map((question) => question.id)).toEqual(['q1', 'q2', 'q3']);
    expect(reloaded?.exam.booklets).toEqual([
      { id: exam.booklets[0].id, title: exam.booklets[0].title, questionCount: 3, durationMinutes: 20 },
    ]);
    expect(reloaded?.responses).toEqual({ q2: [4] });
    expect(reloaded?.bookletIndex).toBe(0);
    expect(reloaded?.bookletEndsAt).toBe(5_000 + 20 * 60_000);
    expect(reloaded?.endsAt).toBeNull();
    expect(reloaded?.status).toBe('active');
  });

  it('keeps submitted results and rejects nothing on reload', async () => {
    const exam = makeExam({ id: 'exam-c' });
    const session = createSession(exam, 100);
    const submitted = {
      ...toggleResponse(session, exam.questions[0].id, 1),
      status: 'submitted' as const,
      submittedAt: 200,
      result: scoreExam(exam, { [exam.questions[0].id]: [1] }, 200),
    };
    await saveSession(submitted);
    expect(await loadSessions()).toHaveLength(1);
    expect((await getSession(submitted.id))?.result?.correct).toBe(1);
  });

  it('re-derives stored percentages with the current scoring rules on load', async () => {
    const exam = makeExam({
      id: 'exam-rescore',
      questions: [makeQuestion({ id: 'q1', key: { kind: 'known', correct: [1] } })],
      booklets: [makeBooklet({ questionCount: 1 })],
    });
    const submitted = submit(exam, 1000, { q1: [1] });
    const stale: ExamSession = {
      ...submitted,
      result: { ...submitted.result!, percentage: 12.5 },
    };
    await saveSession(stale);
    expect((await getSession(stale.id))?.result?.percentage).toBe(100);
    expect((await loadSessions())[0]?.result?.percentage).toBe(100);
  });

  it('propagates answer-key edits and re-scores every attempt without changing counts', async () => {
    const exam = makeExam({
      id: 'exam-relational',
      questions: [
        makeQuestion({ id: 'q1', key: { kind: 'known', correct: [1] } }),
        makeQuestion({ id: 'q2', key: { kind: 'known', correct: [2] } }),
      ],
      booklets: [makeBooklet({ id: 'b1', questionCount: 2 })],
    });
    await saveExam(exam);

    const first = submit(exam, 1000, { q1: [1] });
    const second = submit(exam, 2000, { q1: [2] });
    await saveSession(first);
    await saveSession(second);
    expect(first.result?.correct).toBe(1);
    expect(second.result?.correct).toBe(0);

    const edited: Exam = {
      ...exam,
      questions: [
        { id: 'q1', key: { kind: 'known', correct: [2] } },
        { id: 'q2', key: { kind: 'known', correct: [2] } },
        { id: 'q3', key: { kind: 'known', correct: [3] } },
      ],
      updatedAt: 3000,
    };
    await saveExam(edited);

    const reloadedFirst = await getSession(first.id);
    const reloadedSecond = await getSession(second.id);
    expect(reloadedFirst?.result?.correct).toBe(0);
    expect(reloadedSecond?.result?.correct).toBe(1);
    expect(reloadedFirst?.result?.totalQuestions).toBe(2);
    expect(reloadedSecond?.result?.totalQuestions).toBe(2);
    expect(reloadedFirst?.exam.questions.map((question) => question.id)).toEqual(['q1', 'q2']);
    expect(reloadedFirst?.exam.questions[0].key).toEqual({
      kind: 'known',
      correct: [2],
    });
  });

  it('refuses to replace the bytes behind an existing PDF id', async () => {
    const exam = makeExam({ id: 'exam-immutable' });
    await saveExam(exam);
    const original = exam.booklets[0].pdfs[0];
    const changedBlob = new Blob(['different bytes'], { type: 'application/pdf' });
    const changed: Exam = {
      ...exam,
      booklets: exam.booklets.map((booklet) => ({
        ...booklet,
        pdfs: booklet.pdfs.map((pdf) =>
          pdf.id === original.id
            ? { ...pdf, size: changedBlob.size, digest: '', blob: changedBlob }
            : pdf,
        ),
      })),
    };

    await expect(saveExam(changed)).rejects.toMatchObject({
      name: 'StorageError',
      code: 'pdfImmutable',
    });
    const reloaded = await getExam('exam-immutable');
    expect(await reloaded?.booklets[0].pdfs[0].blob?.text()).toBe('%PDF-1.4\n%EOF\n');
  });

  it('stores and reads settings in the meta store', async () => {
    expect(await readSettingsRecord()).toBeNull();
    await writeSettingsRecord(settings);
    expect(await readSettingsRecord()).toEqual(settings);
  });

  it('replaces every store atomically for backup restore', async () => {
    await saveExam(makeExam({ id: 'old-exam' }));
    await writeSettingsRecord(settings);

    const nextExam = makeExam({
      id: 'new-exam',
      booklets: [makeBooklet({ pdfs: [makePdf('new.pdf')] })],
    });
    const nextSettings: Settings = { ...settings, language: 'en', theme: 'forest' };
    await replaceAllData({ exams: [nextExam], sessions: [], settings: nextSettings });

    expect((await loadExams()).map((exam) => exam.id)).toEqual(['new-exam']);
    expect((await readSettingsRecord())).toEqual(nextSettings);
    expect(await loadSessions()).toEqual([]);
  });

  it('clears all stores', async () => {
    await saveExam(makeExam({ id: 'x' }));
    await writeSettingsRecord(settings);
    await clearAllStores();
    expect(await loadExams()).toEqual([]);
    expect(await readSettingsRecord()).toBeNull();
  });
});

describe('storage errors', () => {
  it('marks PDF immutability errors separately from unavailable storage', () => {
    const error = new StorageError('nope', { code: 'pdfImmutable' });
    expect(error.code).toBe('pdfImmutable');
    expect(new StorageError('nope').code).toBe('storage');
  });
});
