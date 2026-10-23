import { describe, expect, it } from 'vitest';
import {
  migrateExamV2ToV3,
  migrateExamV3ToV4,
  migrateSessionV3ToV4,
} from './migrations';

const examPdf = {
  name: 'exam-1.pdf',
  type: 'application/pdf' as const,
  size: 10,
  data: 'data:application/pdf;base64,JVBERi0xLjQK',
};

const answerPdf = {
  name: 'answers.pdf',
  type: 'application/pdf' as const,
  size: 10,
  data: 'data:application/pdf;base64,JVBERi0xLjQK',
};

describe('migrateExamV2ToV3', () => {
  it('turns single PDF fields into titled lists', () => {
    const migrated = migrateExamV2ToV3({
      id: 'exam-1',
      examPdf,
      answerPdf: { ...answerPdf, title: 'Key' },
    }) as Record<string, unknown>;

    expect(migrated).not.toHaveProperty('examPdf');
    expect(migrated).not.toHaveProperty('answerPdf');
    expect(migrated.examPdfs).toEqual([{ ...examPdf, title: 'exam-1' }]);
    expect(migrated.answerPdfs).toEqual([{ ...answerPdf, title: 'Key' }]);
  });

  it('leaves untouched records alone', () => {
    const untouched = { id: 'exam-1', examPdfs: [examPdf] };
    expect(migrateExamV2ToV3(untouched)).toBe(untouched);
    expect(migrateExamV2ToV3(null)).toBeNull();
  });
});

describe('migrateExamV3ToV4', () => {
  it('moves every PDF and the duration into one booklet', () => {
    const questions = [{ id: 'q1' }, { id: 'q2' }];
    const migrated = migrateExamV3ToV4({
      id: 'exam-1',
      examPdfs: [examPdf],
      durationMinutes: 45,
      questions,
    }) as Record<string, unknown>;

    expect(migrated).not.toHaveProperty('examPdfs');
    expect(migrated).not.toHaveProperty('durationMinutes');
    const booklets = migrated.booklets as Array<Record<string, unknown>>;
    expect(booklets).toHaveLength(1);
    expect(booklets[0]).toMatchObject({
      title: '',
      pdfs: [examPdf],
      questionCount: 2,
      durationMinutes: 45,
    });
    expect(typeof booklets[0].id).toBe('string');
  });

  it('defaults the duration to zero when it is missing or invalid', () => {
    const migrated = migrateExamV3ToV4({
      examPdfs: [examPdf],
      questions: [{ id: 'q1' }],
      durationMinutes: 'soon',
    }) as Record<string, unknown>;
    expect((migrated.booklets as Array<{ durationMinutes: number }>)[0].durationMinutes).toBe(0);
  });

  it('is idempotent once booklets exist', () => {
    const current = { booklets: [{ id: 'b1' }] };
    expect(migrateExamV3ToV4(current)).toBe(current);
  });
});

describe('migrateSessionV3ToV4', () => {
  it('freezes the legacy attempt into one booklet with its old deadline', () => {
    const migrated = migrateSessionV3ToV4({
      id: 'session-1',
      startedAt: 1000,
      endsAt: 2000,
      exam: {
        id: 'exam-1',
        questions: [{ id: 'q1' }, { id: 'q2' }],
        durationMinutes: 30,
      },
    }) as Record<string, unknown>;

    expect(migrated.bookletIndex).toBe(0);
    expect(migrated.bookletStartedAt).toBe(1000);
    expect(migrated.bookletEndsAt).toBe(2000);
    const exam = migrated.exam as Record<string, unknown>;
    expect(exam).not.toHaveProperty('durationMinutes');
    expect(exam.booklets).toEqual([
      expect.objectContaining({ questionCount: 2, durationMinutes: 30 }),
    ]);
  });

  it('uses a null booklet deadline for untimed legacy attempts', () => {
    const migrated = migrateSessionV3ToV4({
      startedAt: 1000,
      endsAt: null,
      exam: { questions: [] },
    }) as Record<string, unknown>;
    expect(migrated.bookletEndsAt).toBeNull();
  });

  it('keeps existing booklet progress untouched', () => {
    const current = {
      startedAt: 1000,
      bookletIndex: 1,
      bookletStartedAt: 1500,
      bookletEndsAt: 2500,
      endsAt: 3000,
      exam: { questions: [], booklets: [{ id: 'b1' }, { id: 'b2' }] },
    };
    expect(migrateSessionV3ToV4(current)).toEqual(current);
  });
});
