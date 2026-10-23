import { defaultPdfTitle } from '@/lib/file';
import { createId } from '@/lib/id';

type RecordValue = Record<string, unknown>;

interface LegacyStoredPdf {
  title?: string;
  name: string;
  type: 'application/pdf';
  size: number;
  data: string;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withPdfTitle(pdf: LegacyStoredPdf): LegacyStoredPdf {
  return { ...pdf, title: pdf.title?.trim() || defaultPdfTitle(pdf.name) };
}

/** Version 2 stored one untitled PDF per booklet; version 3 stored titled lists. */
export function migrateExamV2ToV3(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const record = { ...value };
  const examPdf = record.examPdf as LegacyStoredPdf | undefined;
  const answerPdf = record.answerPdf as LegacyStoredPdf | undefined;
  if (!examPdf && !answerPdf) return value;
  delete record.examPdf;
  delete record.answerPdf;
  if (examPdf) record.examPdfs = [withPdfTitle(examPdf)];
  if (answerPdf) record.answerPdfs = [withPdfTitle(answerPdf)];
  return record;
}

/**
 * Version 3 kept every exam PDF in one flat list with one duration for the
 * whole attempt. Version 4 moves them into one booklet that covers every
 * question, preserving the previous timing behavior.
 */
export function migrateExamV3ToV4(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (Array.isArray(value.booklets)) return value;
  const record = { ...value };
  const questions = Array.isArray(record.questions) ? record.questions : [];
  const examPdfs = Array.isArray(record.examPdfs) ? record.examPdfs : [];
  const duration = record.durationMinutes;
  record.booklets = [
    {
      id: createId(),
      title: '',
      pdfs: examPdfs,
      questionCount: questions.length,
      durationMinutes: typeof duration === 'number' && Number.isFinite(duration) ? duration : 0,
    },
  ];
  delete record.examPdfs;
  delete record.durationMinutes;
  return record;
}

/**
 * Adds the active-booklet fields to a version-3 session. Its frozen snapshot
 * becomes one booklet so an in-flight attempt keeps its old deadline.
 */
export function migrateSessionV3ToV4(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const session = { ...value };
  if (isRecord(session.exam)) {
    const exam = { ...session.exam };
    if (!Array.isArray(exam.booklets)) {
      const questions = Array.isArray(exam.questions) ? exam.questions : [];
      const duration = exam.durationMinutes;
      exam.booklets = [
        {
          id: createId(),
          title: '',
          questionCount: questions.length,
          durationMinutes:
            typeof duration === 'number' && Number.isFinite(duration) ? duration : 0,
        },
      ];
      delete exam.durationMinutes;
    }
    session.exam = exam;
  }
  if (typeof session.bookletIndex !== 'number' || !Number.isFinite(session.bookletIndex)) {
    session.bookletIndex = 0;
  }
  if (
    typeof session.bookletStartedAt !== 'number' ||
    !Number.isFinite(session.bookletStartedAt)
  ) {
    session.bookletStartedAt =
      typeof session.startedAt === 'number' && Number.isFinite(session.startedAt)
        ? session.startedAt
        : Date.now();
  }
  if (!('bookletEndsAt' in session)) {
    session.bookletEndsAt =
      typeof session.endsAt === 'number' && Number.isFinite(session.endsAt)
        ? session.endsAt
        : null;
  }
  return session;
}
