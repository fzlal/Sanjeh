import { ANSWER_KEY_MODES, type AnswerKeyMode } from '@/types';
import { base64ToBytes, defaultPdfTitle, PDF_MIME } from '@/lib/file';
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
 * Version 4 stored PDFs as base64 data URLs. Version 5 keeps native Blob
 * bytes in IndexedDB, adds a stable id, and records a digest when one exists.
 * A record that was already upgraded is left alone.
 */
function migratePdfV4ToV5(value: unknown): unknown {
  if (!isRecord(value) || value.blob instanceof Blob) return value;
  if (typeof value.data !== 'string') return value;
  const record = { ...value };
  const data = value.data;
  const comma = data.indexOf(',');
  let bytes: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
  if (comma >= 0) {
    try {
      bytes = base64ToBytes(data.slice(comma + 1));
    } catch {
      bytes = new Uint8Array(new ArrayBuffer(0));
    }
  }
  delete record.data;
  return {
    ...record,
    id: typeof record.id === 'string' && record.id ? record.id : createId(),
    digest: typeof record.digest === 'string' ? record.digest : '',
    size:
      bytes.byteLength > 0
        ? bytes.byteLength
        : typeof record.size === 'number'
          ? record.size
          : 0,
    blob: new Blob([bytes], { type: PDF_MIME }),
  };
}

function migratePdfListV4ToV5(value: unknown): unknown {
  return Array.isArray(value) ? value.map(migratePdfV4ToV5) : value;
}

/** Moves every stored base64 PDF in a version-4 exam to native Blob bytes. */
export function migrateExamV4ToV5(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const record = { ...value };
  if (Array.isArray(record.answerPdfs)) {
    record.answerPdfs = migratePdfListV4ToV5(record.answerPdfs);
  }
  if (Array.isArray(record.booklets)) {
    record.booklets = record.booklets.map((booklet) =>
      isRecord(booklet) ? { ...booklet, pdfs: migratePdfListV4ToV5(booklet.pdfs) } : booklet,
    );
  }
  return record;
}

function isAnswerKeyMode(value: unknown): value is AnswerKeyMode {
  return ANSWER_KEY_MODES.includes(value as AnswerKeyMode);
}

/**
 * Version 5 had one fixed answer-key workflow. Version 6 records the mode
 * explicitly; everything created before this version was QZ1-backed.
 */
export function migrateExamV5ToV6(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isAnswerKeyMode(value.answerKeyMode)) return value;
  return { ...value, answerKeyMode: 'qz1' };
}

export function migrateSessionV5ToV6(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!isRecord(value.exam)) return value;
  return { ...value, exam: migrateExamV5ToV6(value.exam) };
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
