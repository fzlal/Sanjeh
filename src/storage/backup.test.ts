import { describe, expect, it } from 'vitest';
import type { BackupFile } from '@/types';
import { makeBooklet, makeExam, makePdf, makeQuestion } from '@/test/fixtures';
import { createSession, toggleResponse } from '@/lib/session';
import { scoreExam } from '@/lib/scoring';
import {
  BackupValidationError,
  createBackup,
  parseBackupFile,
  validateBackup,
} from './backup';

function submittedSession() {
  const exam = makeExam({
    id: 'exam-1',
    questions: [
      makeQuestion({ id: 'q1', key: { kind: 'known', correct: [1, 3] } }),
      makeQuestion({ id: 'q2', key: { kind: 'excluded' } }),
    ],
  });
  const session = createSession(exam, 1000);
  const answered = toggleResponse(session, 'q1', 1);
  return {
    ...answered,
    status: 'submitted' as const,
    submittedAt: 2000,
    result: scoreExam(exam, answered.responses, 2000),
  };
}

function sampleExam() {
  return makeExam({
    id: 'exam-1',
    booklets: [
      makeBooklet({
        id: 'b1',
        title: 'First',
        questionCount: 1,
        durationMinutes: 15,
        pdfs: [makePdf('first.pdf', 'First')],
      }),
      makeBooklet({
        id: 'b2',
        title: 'Second',
        questionCount: 1,
        durationMinutes: 25,
        pdfs: [makePdf('second.pdf', 'Second')],
      }),
    ],
  });
}

function validBackup(): BackupFile {
  return createBackup(
    [sampleExam()],
    [submittedSession()],
    { language: 'fa', theme: 'paper', appearance: 'light', onboardingComplete: true },
  );
}

/** Flat v2/v3 exam shape before booklets existed. */
function legacyExam(version: 2 | 3) {
  const exam = sampleExam();
  const base = {
    id: exam.id,
    title: exam.title,
    description: exam.description,
    questions: exam.questions,
    scheduling: exam.scheduling,
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt,
    durationMinutes: 45,
  };
  if (version === 2) {
    return { ...base, examPdf: exam.booklets[0].pdfs[0], answerPdf: exam.answerPdfs[0] };
  }
  return {
    ...base,
    examPdfs: exam.booklets.flatMap((booklet) => booklet.pdfs),
    answerPdfs: exam.answerPdfs,
  };
}

function legacyBackup(version: 2 | 3) {
  const current = validBackup();
  return {
    format: 'sanjeh-backup',
    version,
    exportedAt: current.exportedAt,
    data: {
      exams: [legacyExam(version)],
      sessions: [],
      settings: current.data.settings,
    },
  };
}

describe('backup validation', () => {
  it('round-trips a backup through JSON, including booklet PDFs', () => {
    const backup = validBackup();
    const parsed = parseBackupFile(JSON.stringify(backup));
    expect(parsed.data.exams).toHaveLength(1);
    expect(parsed.data.exams[0].booklets).toHaveLength(2);
    expect(parsed.data.exams[0].booklets[0].pdfs[0].type).toBe('application/pdf');
    expect(parsed.data.exams[0].booklets[1].title).toBe('Second');
    expect(parsed.data.exams[0].booklets[1].pdfs[0].title).toBe('Second');
    expect(parsed.data.exams[0].booklets[1].durationMinutes).toBe(25);
    expect(parsed.data.exams[0].answerPdfs[0].title).toBe('answers');
    expect(parsed.data.sessions[0].result?.totalQuestions).toBeGreaterThan(0);
    expect(parsed.data.settings.language).toBe('fa');
  });

  it('upgrades a version-3 backup into one legacy booklet', () => {
    const parsed = validateBackup(legacyBackup(3));
    expect(parsed.version).toBe(4);
    expect(parsed.data.exams[0].booklets).toHaveLength(1);
    expect(parsed.data.exams[0].booklets[0]).toMatchObject({
      title: '',
      questionCount: 2,
      durationMinutes: 45,
    });
    expect(parsed.data.exams[0].booklets[0].pdfs.map((pdf) => pdf.title)).toEqual([
      'First',
      'Second',
    ]);
    expect(parsed.data.exams[0].answerPdfs[0].title).toBe('answers');
  });

  it('upgrades a version-2 backup with one PDF per booklet', () => {
    const parsed = validateBackup(legacyBackup(2));
    expect(parsed.version).toBe(4);
    expect(parsed.data.exams[0].booklets).toHaveLength(1);
    expect(parsed.data.exams[0].booklets[0].questionCount).toBe(2);
    expect(parsed.data.exams[0].booklets[0].durationMinutes).toBe(45);
    expect(parsed.data.exams[0].booklets[0].pdfs[0].title).toBe('first');
    expect(parsed.data.exams[0].answerPdfs[0].title).toBe('answers');
  });

  it('upgrades a version-3 session without booklet fields', () => {
    const current = validBackup();
    const session = current.data.sessions[0];
    const sessionFields = Object.fromEntries(
      Object.entries(session).filter(
        ([key]) => key !== 'bookletIndex' && key !== 'bookletStartedAt' && key !== 'bookletEndsAt',
      ),
    );
    const snapshotFields = Object.fromEntries(
      Object.entries(session.exam).filter(([key]) => key !== 'booklets'),
    );
    const legacy = {
      ...legacyBackup(3),
      data: {
        ...legacyBackup(3).data,
        sessions: [
          {
            ...sessionFields,
            exam: { ...snapshotFields, durationMinutes: 45 },
            endsAt: 123_456,
          },
        ],
      },
    };
    const parsed = validateBackup(legacy);
    expect(parsed.data.sessions[0]).toMatchObject({
      bookletIndex: 0,
      bookletStartedAt: session.startedAt,
      bookletEndsAt: 123_456,
      endsAt: 123_456,
    });
    expect(parsed.data.sessions[0].exam.booklets).toHaveLength(1);
    expect(parsed.data.sessions[0].exam.booklets[0].durationMinutes).toBe(45);
  });

  it('rejects non-JSON and foreign files', () => {
    expect(() => parseBackupFile('not json')).toThrow(BackupValidationError);
    expect(() => validateBackup({ format: 'other', version: 3 })).toThrow(
      BackupValidationError,
    );
    expect(() => validateBackup(null)).toThrow(BackupValidationError);
  });

  it('rejects unsupported versions', () => {
    expect(() => validateBackup({ ...validBackup(), version: 1 })).toThrow(/version/);
    expect(() => validateBackup({ ...validBackup(), version: 5 })).toThrow(/version/);
  });

  it('rejects malformed answer keys', () => {
    const backup = validBackup();
    backup.data.exams[0].questions[0].key = {
      kind: 'known',
      correct: [9],
    } as never;
    expect(() => validateBackup(backup)).toThrow(/option index/);

    const empty = validBackup();
    empty.data.exams[0].questions[0].key = { kind: 'known', correct: [] } as never;
    expect(() => validateBackup(empty)).toThrow(/at least one option/);
  });

  it('rejects missing or malformed booklets', () => {
    const missing = validBackup();
    delete (missing.data.exams[0] as { booklets?: unknown }).booklets;
    expect(() => validateBackup(missing)).toThrow(/booklets/);

    const empty = validBackup();
    empty.data.exams[0].booklets = [];
    expect(() => validateBackup(empty)).toThrow(/at least one booklet/);

    const mismatch = validBackup();
    mismatch.data.exams[0].booklets[0].questionCount = 5;
    expect(() => validateBackup(mismatch)).toThrow(/question counts cover/);

    const duplicate = validBackup();
    duplicate.data.exams[0].booklets[1].id = duplicate.data.exams[0].booklets[0].id;
    expect(() => validateBackup(duplicate)).toThrow(/duplicate booklet id/);

    const badDuration = validBackup();
    badDuration.data.exams[0].booklets[0].durationMinutes = -1;
    expect(() => validateBackup(badDuration)).toThrow(/durationMinutes/);
  });

  it('rejects missing or malformed PDFs', () => {
    const missing = validBackup();
    delete (missing.data.exams[0] as { answerPdfs?: unknown }).answerPdfs;
    expect(() => validateBackup(missing)).toThrow(/answerPdfs/);

    const noPdf = validBackup();
    delete (noPdf.data.exams[0].booklets[0] as { pdfs?: unknown }).pdfs;
    expect(() => validateBackup(noPdf)).toThrow(/pdfs/);

    const empty = validBackup();
    empty.data.exams[0].booklets[0].pdfs = [];
    expect(() => validateBackup(empty)).toThrow(/at least one PDF/);

    const untitled = validBackup();
    untitled.data.exams[0].booklets[0].pdfs[0].title = '  ';
    expect(() => validateBackup(untitled)).toThrow(/title/);

    const wrongType = validBackup();
    wrongType.data.exams[0].booklets[0].pdfs[0].type = 'text/plain' as never;
    expect(() => validateBackup(wrongType)).toThrow(/application\/pdf/);

    const wrongData = validBackup();
    wrongData.data.exams[0].booklets[0].pdfs[0].data = 'JVBERi0xLjQK';
    expect(() => validateBackup(wrongData)).toThrow(/base64/);
  });

  it('rejects duplicate exam ids', () => {
    const backup = validBackup();
    backup.data.exams.push(structuredClone(backup.data.exams[0]));
    expect(() => validateBackup(backup)).toThrow(/duplicate exam id/);
  });

  it('rejects duplicate question ids inside a session snapshot', () => {
    const backup = validBackup();
    const questions = backup.data.sessions[0].exam.questions;
    questions[1].id = questions[0].id;
    expect(() => validateBackup(backup)).toThrow(/duplicate question id/);
  });

  it('rejects a session snapshot whose booklet counts do not match', () => {
    const backup = validBackup();
    backup.data.sessions[0].exam.booklets[0].questionCount = 9;
    expect(() => validateBackup(backup)).toThrow(/question counts cover/);
  });

  it('rejects responses for unknown questions', () => {
    const backup = validBackup();
    backup.data.sessions[0].responses.ghost = [1];
    expect(() => validateBackup(backup)).toThrow(/unknown question/);
  });

  it('requires a result on submitted sessions', () => {
    const backup = validBackup();
    delete backup.data.sessions[0].result;
    expect(() => validateBackup(backup)).toThrow(/result/);
  });

  it('rejects unknown languages, themes, and appearances', () => {
    const language = validBackup();
    (language.data.settings as { language: string }).language = 'xx';
    expect(() => validateBackup(language)).toThrow(/language/);

    const theme = validBackup();
    (theme.data.settings as { theme: string }).theme = 'unknown-theme';
    expect(() => validateBackup(theme)).toThrow(/theme/);

    const appearance = validBackup();
    (appearance.data.settings as { appearance: string }).appearance = 'sepia';
    expect(() => validateBackup(appearance)).toThrow(/appearance/);
  });

  it('rejects impossible scheduling ranges', () => {
    const backup = validBackup();
    backup.data.exams[0].scheduling = {
      mode: 'window',
      startsAt: 1000,
      endsAt: 500,
    };
    expect(() => validateBackup(backup)).toThrow(/window/);
  });

  it('accepts a backup with no sessions', () => {
    const backup = validBackup();
    backup.data.sessions = [];
    expect(validateBackup(backup).data.sessions).toEqual([]);
  });
});
