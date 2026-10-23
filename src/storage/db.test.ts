import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { makeBooklet, makeExam, makePdf, makeQuestion } from '@/test/fixtures';
import { createSession, toggleResponse } from '@/lib/session';
import { scoreExam } from '@/lib/scoring';
import type { Settings } from '@/types';
import {
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

describe('local persistence', () => {
  it('saves and reloads exams with their booklets and titled PDFs', async () => {
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
    expect(reloaded).toEqual(exam);
    expect(reloaded.booklets).toHaveLength(2);
    expect(reloaded.booklets[1].title).toBe('Booklet 2');
    expect(reloaded.booklets[1].durationMinutes).toBe(25);
    expect(reloaded.booklets[0].pdfs[0].data).toMatch(/^data:application\/pdf;base64,/);
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
    expect(reloaded?.responses).toEqual({ q2: [2, 4] });
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
