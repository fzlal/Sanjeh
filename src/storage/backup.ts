import type {
  AnswerKey,
  AnswerKeyMode,
  BackupFile,
  Booklet,
  BookletSnapshot,
  Exam,
  ExamSession,
  ExamSnapshot,
  OptionIndex,
  Question,
  QuestionOutcome,
  ResultSnapshot,
  Scheduling,
  Settings,
  StoredPdf,
} from '@/types';
import { ANSWER_KEY_MODES } from '@/types';
import { isLanguageCode } from '@/i18n/languages';
import {
  MAX_PDFS_PER_GROUP,
  PDF_DATA_PREFIX,
  PDF_MAX_BYTES,
  PDF_MIME,
  base64ToBytes,
  defaultPdfTitle,
  sha256Hex,
} from '@/lib/file';
import { createId } from '@/lib/id';
import { rescoreSubmittedSession } from '@/lib/session';
import { createZip, looksLikeZip, readZip } from '@/lib/zip';
import { isThemeId } from '@/themes';
import { pdfBlob } from './downloads';

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

const MAX_EXAMS = 1000;
const MAX_BOOKLETS = 50;
const MAX_QUESTIONS = 500;
const MAX_SESSIONS = 2000;
const MAX_TEXT = 20_000;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_PDF_DATA = Math.ceil(PDF_MAX_BYTES / 3) * 4 + 64;

const OUTCOMES: readonly QuestionOutcome[] = [
  'correct',
  'incorrect',
  'unanswered',
  'excluded',
  'unresolved',
];

type PdfFiles = Map<string, Uint8Array>;

interface PdfMeta extends Omit<StoredPdf, 'blob'> {
  /** Archive path inside a version-6 ZIP backup. */
  file: string;
}

interface SerializedBooklet extends Omit<Booklet, 'pdfs'> {
  pdfs: PdfMeta[];
}

interface SerializedExam extends Omit<Exam, 'booklets' | 'answerPdfs'> {
  booklets: SerializedBooklet[];
  answerPdfs: PdfMeta[];
}

interface BackupManifest {
  format: 'sanjeh-backup';
  version: 6;
  exportedAt: number;
  data: {
    exams: SerializedExam[];
    sessions: ExamSession[];
    settings: Settings;
  };
}

function fail(path: string, detail: string): never {
  throw new BackupValidationError(`${path}: ${detail}`);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string, maxLength = MAX_TEXT): string {
  if (typeof value !== 'string') fail(path, 'expected a string');
  if (value.length > maxLength) fail(path, 'text is too long');
  return value;
}

function asFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a number');
  return value;
}

function asInteger(value: unknown, path: string, min: number, max: number): number {
  const number = asFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < min || number > max) {
    fail(path, `expected an integer between ${min} and ${max}`);
  }
  return number;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'expected a boolean');
  return value;
}

function asOptionList(value: unknown, path: string, allowEmpty: boolean): OptionIndex[] {
  if (!Array.isArray(value)) fail(path, 'expected an array of options');
  const seen = new Set<number>();
  const result: OptionIndex[] = [];
  for (const entry of value) {
    if (!Number.isInteger(entry) || entry < 1 || entry > 4) fail(path, 'invalid option index');
    if (seen.has(entry)) fail(path, 'duplicate option index');
    seen.add(entry);
    result.push(entry as OptionIndex);
  }
  if (!allowEmpty && result.length === 0) fail(path, 'expected at least one option');
  return result.sort((a, b) => a - b);
}

function asAnswerKeyMode(value: unknown, path: string): AnswerKeyMode {
  if (value === undefined) return 'qz1';
  if (ANSWER_KEY_MODES.includes(value as AnswerKeyMode)) return value as AnswerKeyMode;
  return fail(path, 'unknown answer-key mode');
}

function asAnswerKey(value: unknown, path: string): AnswerKey {
  const record = asRecord(value, path);
  const kind = record.kind;
  if (kind === 'known') {
    return { kind: 'known', correct: asOptionList(record.correct, `${path}.correct`, false) };
  }
  if (kind === 'unresolved') return { kind: 'unresolved' };
  if (kind === 'excluded') return { kind: 'excluded' };
  return fail(`${path}.kind`, 'unknown answer-key kind');
}

function asQuestion(value: unknown, path: string): Question {
  const record = asRecord(value, path);
  const question: Question = {
    id: asString(record.id, `${path}.id`, 200),
    key: asAnswerKey(record.key, `${path}.key`),
  };
  if (!question.id) fail(`${path}.id`, 'id is empty');
  return question;
}

function asQuestions(record: Record<string, unknown>, path: string): Question[] {
  const questionsValue = record.questions;
  if (!Array.isArray(questionsValue)) fail(`${path}.questions`, 'expected an array');
  if (questionsValue.length > MAX_QUESTIONS) fail(`${path}.questions`, 'too many questions');
  const questions = questionsValue.map((question, index) =>
    asQuestion(question, `${path}.questions[${index}]`),
  );
  const ids = new Set<string>();
  for (const question of questions) {
    if (ids.has(question.id)) fail(`${path}.questions`, 'duplicate question id');
    ids.add(question.id);
  }
  return questions;
}

async function pdfBytes(
  record: Record<string, unknown>,
  path: string,
  files: PdfFiles | undefined,
): Promise<{ bytes: Uint8Array; size: number }> {
  const size = asInteger(record.size, `${path}.size`, 1, PDF_MAX_BYTES);
  if (files) {
    const file = asString(record.file, `${path}.file`, 500).trim();
    if (!file) fail(`${path}.file`, 'file is empty');
    const bytes = files.get(file);
    if (!bytes) fail(`${path}.file`, 'the PDF is missing from the archive');
    if (bytes.byteLength !== size) fail(`${path}.file`, 'size does not match the PDF data');
    return { bytes, size };
  }
  const data = asString(record.data, `${path}.data`, MAX_PDF_DATA);
  if (!data.startsWith(PDF_DATA_PREFIX)) fail(`${path}.data`, 'expected PDF base64 data');
  try {
    const bytes = base64ToBytes(data.slice(PDF_DATA_PREFIX.length));
    if (bytes.byteLength !== size) fail(`${path}.data`, 'size does not match the PDF data');
    return { bytes, size };
  } catch (error) {
    if (error instanceof BackupValidationError) throw error;
    fail(`${path}.data`, 'expected PDF base64 data');
  }
}

async function asPdfFields(
  record: Record<string, unknown>,
  path: string,
  files: PdfFiles | undefined,
): Promise<Omit<StoredPdf, 'title'>> {
  const name = asString(record.name, `${path}.name`, 300);
  if (!name) fail(`${path}.name`, 'name is empty');
  if (record.type !== PDF_MIME) fail(`${path}.type`, 'expected application/pdf');
  const { bytes, size } = await pdfBytes(record, path, files);
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const blob = new Blob([copy], { type: PDF_MIME });
  const digest = await sha256Hex(blob);
  const declaredDigest =
    record.digest === undefined ? '' : asString(record.digest, `${path}.digest`, 128);
  if (declaredDigest && digest && declaredDigest !== digest) {
    fail(`${path}.digest`, 'digest mismatch');
  }
  const id =
    record.id === undefined ? createId() : asString(record.id, `${path}.id`, 200);
  if (!id) fail(`${path}.id`, 'id is empty');
  return {
    id,
    name,
    type: 'application/pdf' as const,
    size,
    digest: digest || declaredDigest,
    blob,
  };
}

async function asStoredPdf(
  value: unknown,
  path: string,
  files: PdfFiles | undefined,
): Promise<StoredPdf> {
  const record = asRecord(value, path);
  const title = asString(record.title, `${path}.title`, 300).trim();
  if (!title) fail(`${path}.title`, 'title is empty');
  return { ...(await asPdfFields(record, path, files)), title };
}

/** Version-2 backups had one untitled PDF per booklet. */
async function asLegacyStoredPdf(value: unknown, path: string): Promise<StoredPdf> {
  const fields = await asPdfFields(asRecord(value, path), path, undefined);
  return { ...fields, title: defaultPdfTitle(fields.name) };
}

async function asPdfList(
  value: unknown,
  path: string,
  files: PdfFiles | undefined,
): Promise<StoredPdf[]> {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (value.length > MAX_PDFS_PER_GROUP) fail(path, 'too many PDFs');
  return Promise.all(value.map((pdf, index) => asStoredPdf(pdf, `${path}[${index}]`, files)));
}

function asBookletSnapshot(value: unknown, path: string): BookletSnapshot {
  const record = asRecord(value, path);
  const id = asString(record.id, `${path}.id`, 200);
  if (!id) fail(`${path}.id`, 'id is empty');
  return {
    id,
    title: asString(record.title, `${path}.title`, 500).trim(),
    questionCount: asInteger(record.questionCount, `${path}.questionCount`, 1, MAX_QUESTIONS),
    durationMinutes: asInteger(record.durationMinutes, `${path}.durationMinutes`, 0, 100_000),
  };
}

function asBookletSnapshots(value: unknown, path: string): BookletSnapshot[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (value.length === 0) fail(path, 'expected at least one booklet');
  if (value.length > MAX_BOOKLETS) fail(path, 'too many booklets');
  const booklets = value.map((booklet, index) =>
    asBookletSnapshot(booklet, `${path}[${index}]`),
  );
  const ids = new Set<string>();
  for (const booklet of booklets) {
    if (ids.has(booklet.id)) fail(path, 'duplicate booklet id');
    ids.add(booklet.id);
  }
  return booklets;
}

async function asBooklet(
  value: unknown,
  path: string,
  files: PdfFiles | undefined,
): Promise<Booklet> {
  const record = asRecord(value, path);
  return {
    ...asBookletSnapshot(record, path),
    pdfs: await asPdfList(record.pdfs, `${path}.pdfs`, files),
  };
}

async function asBooklets(
  value: unknown,
  path: string,
  files: PdfFiles | undefined,
): Promise<Booklet[]> {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (value.length === 0) fail(path, 'expected at least one booklet');
  if (value.length > MAX_BOOKLETS) fail(path, 'too many booklets');
  const booklets = await Promise.all(
    value.map((booklet, index) => asBooklet(booklet, `${path}[${index}]`, files)),
  );
  const ids = new Set<string>();
  for (const booklet of booklets) {
    if (ids.has(booklet.id)) fail(path, 'duplicate booklet id');
    ids.add(booklet.id);
  }
  return booklets;
}

function legacyDuration(record: Record<string, unknown>, path: string): number {
  return record.durationMinutes === undefined
    ? 0
    : asInteger(record.durationMinutes, `${path}.durationMinutes`, 0, 100_000);
}

function legacyBooklet(
  questions: Question[],
  durationMinutes: number,
): BookletSnapshot {
  return {
    id: 'legacy-booklet',
    title: '',
    questionCount: questions.length,
    durationMinutes,
  };
}

function asScheduling(value: unknown, path: string): Scheduling {
  const record = asRecord(value, path);
  const mode = record.mode;
  if (mode === 'immediate') return { mode: 'immediate' };
  if (mode === 'scheduled') {
    return { mode: 'scheduled', startsAt: asFiniteNumber(record.startsAt, `${path}.startsAt`) };
  }
  if (mode === 'window') {
    const startsAt = asFiniteNumber(record.startsAt, `${path}.startsAt`);
    const endsAt = asFiniteNumber(record.endsAt, `${path}.endsAt`);
    if (endsAt <= startsAt) fail(path, 'window ends before it starts');
    return { mode: 'window', startsAt, endsAt };
  }
  if (mode === 'flexible') {
    const windowStart = asFiniteNumber(record.windowStart, `${path}.windowStart`);
    const windowEnd = asFiniteNumber(record.windowEnd, `${path}.windowEnd`);
    if (windowEnd <= windowStart) fail(path, 'window ends before it starts');
    return { mode: 'flexible', windowStart, windowEnd };
  }
  return fail(`${path}.mode`, 'unknown scheduling mode');
}

function asCoreExam(
  record: Record<string, unknown>,
  path: string,
  questions: Question[],
  booklets: BookletSnapshot[],
): ExamSnapshot {
  const covered = booklets.reduce((sum, booklet) => sum + booklet.questionCount, 0);
  if (covered !== questions.length) {
    fail(
      `${path}.booklets`,
      `question counts cover ${covered} questions but the exam has ${questions.length}`,
    );
  }
  const exam: ExamSnapshot = {
    id: asString(record.id, `${path}.id`, 200),
    title: asString(record.title, `${path}.title`, 500),
    answerKeyMode: asAnswerKeyMode(record.answerKeyMode, `${path}.answerKeyMode`),
    questions,
    booklets,
    scheduling: asScheduling(record.scheduling, `${path}.scheduling`),
    createdAt: asFiniteNumber(record.createdAt, `${path}.createdAt`),
    updatedAt: asFiniteNumber(record.updatedAt, `${path}.updatedAt`),
  };
  if (record.description !== undefined) {
    exam.description = asString(record.description, `${path}.description`);
  }
  if (!exam.id) fail(`${path}.id`, 'id is empty');
  return exam;
}

async function asExam(
  value: unknown,
  path: string,
  version: number,
  files: PdfFiles | undefined,
): Promise<Exam> {
  const record = asRecord(value, path);
  const questions = asQuestions(record, path);
  if (version < 4) {
    const duration = legacyDuration(record, path);
    const examPdfs =
      version === 2
        ? [await asLegacyStoredPdf(record.examPdf, `${path}.examPdf`)]
        : await asPdfList(record.examPdfs, `${path}.examPdfs`, undefined);
    const answerPdfs =
      version === 2
        ? [await asLegacyStoredPdf(record.answerPdf, `${path}.answerPdf`)]
        : await asPdfList(record.answerPdfs, `${path}.answerPdfs`, undefined);
    const booklets: Booklet[] = [
      {
        ...legacyBooklet(questions, duration),
        pdfs: examPdfs,
      },
    ];
    return {
      ...asCoreExam(record, path, questions, booklets),
      booklets,
      answerPdfs,
    };
  }
  const booklets = await asBooklets(record.booklets, `${path}.booklets`, files);
  const answerPdfs = await asPdfList(record.answerPdfs, `${path}.answerPdfs`, files);
  const exam: Exam = {
    ...asCoreExam(
      record,
      path,
      questions,
      booklets.map(({ id, title, questionCount, durationMinutes }) => ({
        id,
        title,
        questionCount,
        durationMinutes,
      })),
    ),
    booklets,
    answerPdfs,
  };
  const pdfIds = new Set<string>();
  for (const pdf of [...answerPdfs, ...booklets.flatMap((booklet) => booklet.pdfs)]) {
    if (pdfIds.has(pdf.id)) fail(`${path}.pdfs`, 'duplicate PDF id');
    pdfIds.add(pdf.id);
  }
  return exam;
}

function asExamSnapshot(value: unknown, path: string, version: number): ExamSnapshot {
  const record = asRecord(value, path);
  const questions = asQuestions(record, path);
  const booklets =
    version < 4
      ? [legacyBooklet(questions, legacyDuration(record, path))]
      : asBookletSnapshots(record.booklets, `${path}.booklets`);
  return asCoreExam(record, path, questions, booklets);
}

function asOutcome(value: unknown, path: string): QuestionOutcome {
  if (typeof value !== 'string' || !OUTCOMES.includes(value as QuestionOutcome)) {
    fail(path, 'unknown question outcome');
  }
  return value as QuestionOutcome;
}

function asResult(value: unknown, path: string): ResultSnapshot {
  const record = asRecord(value, path);
  const perQuestionValue = record.perQuestion;
  if (!Array.isArray(perQuestionValue)) fail(`${path}.perQuestion`, 'expected an array');
  const perQuestion = perQuestionValue.map((entry, index) => {
    const item = asRecord(entry, `${path}.perQuestion[${index}]`);
    const correct =
      item.correct === null
        ? null
        : asOptionList(item.correct, `${path}.perQuestion[${index}].correct`, false);
    return {
      questionId: asString(item.questionId, `${path}.perQuestion[${index}].questionId`, 200),
      outcome: asOutcome(item.outcome, `${path}.perQuestion[${index}].outcome`),
      selected: asOptionList(item.selected, `${path}.perQuestion[${index}].selected`, true),
      correct,
    };
  });
  const percentage =
    record.percentage === null
      ? null
      : asFiniteNumber(record.percentage, `${path}.percentage`);
  return {
    totalQuestions: asInteger(record.totalQuestions, `${path}.totalQuestions`, 0, MAX_QUESTIONS),
    scoredQuestions: asInteger(record.scoredQuestions, `${path}.scoredQuestions`, 0, MAX_QUESTIONS),
    correct: asInteger(record.correct, `${path}.correct`, 0, MAX_QUESTIONS),
    incorrect: asInteger(record.incorrect, `${path}.incorrect`, 0, MAX_QUESTIONS),
    unanswered: asInteger(record.unanswered, `${path}.unanswered`, 0, MAX_QUESTIONS),
    excluded: asInteger(record.excluded, `${path}.excluded`, 0, MAX_QUESTIONS),
    unresolved: asInteger(record.unresolved, `${path}.unresolved`, 0, MAX_QUESTIONS),
    percentage,
    completedAt: asFiniteNumber(record.completedAt, `${path}.completedAt`),
    perQuestion,
  };
}

function asSession(value: unknown, path: string, version: number): ExamSession {
  const record = asRecord(value, path);
  const exam = asExamSnapshot(record.exam, `${path}.exam`, version);
  const knownIds = new Set(exam.questions.map((question) => question.id));
  const responsesRecord = asRecord(record.responses, `${path}.responses`);
  const responses: Record<string, OptionIndex[]> = {};
  for (const [questionId, selection] of Object.entries(responsesRecord)) {
    if (!knownIds.has(questionId)) fail(`${path}.responses`, 'response for an unknown question');
    responses[questionId] = asOptionList(selection, `${path}.responses.${questionId}`, true);
  }
  const status = record.status;
  if (status !== 'active' && status !== 'submitted') fail(`${path}.status`, 'invalid status');
  const startedAt = asFiniteNumber(record.startedAt, `${path}.startedAt`);
  const bookletIndex =
    version < 4
      ? 0
      : asInteger(record.bookletIndex, `${path}.bookletIndex`, 0, exam.booklets.length - 1);
  const bookletStartedAt =
    version < 4
      ? startedAt
      : asFiniteNumber(record.bookletStartedAt, `${path}.bookletStartedAt`);
  const bookletEndsAt =
    version < 4
      ? record.endsAt === null
        ? null
        : asFiniteNumber(record.endsAt, `${path}.endsAt`)
      : record.bookletEndsAt === null
        ? null
        : asFiniteNumber(record.bookletEndsAt, `${path}.bookletEndsAt`);
  const session: ExamSession = {
    id: asString(record.id, `${path}.id`, 200),
    examId: asString(record.examId, `${path}.examId`, 200),
    exam,
    responses,
    startedAt,
    bookletIndex,
    bookletStartedAt,
    bookletEndsAt,
    endsAt:
      record.endsAt === null ? null : asFiniteNumber(record.endsAt, `${path}.endsAt`),
    status,
  };
  if (record.submittedAt !== undefined) {
    session.submittedAt = asFiniteNumber(record.submittedAt, `${path}.submittedAt`);
  }
  if (record.result !== undefined && record.result !== null) {
    session.result = asResult(record.result, `${path}.result`);
  }
  if (session.status === 'submitted' && !session.result) {
    fail(`${path}.result`, 'submitted sessions require a result');
  }
  return rescoreSubmittedSession(session);
}

export function asSettings(value: unknown, path = 'settings'): Settings {
  const record = asRecord(value, path);
  if (!isLanguageCode(record.language)) fail(`${path}.language`, 'unknown language');
  if (typeof record.theme !== 'string' || !isThemeId(record.theme)) {
    fail(`${path}.theme`, 'unknown theme');
  }
  if (record.appearance !== 'light' && record.appearance !== 'dark' && record.appearance !== 'system') {
    fail(`${path}.appearance`, 'unknown appearance');
  }
  return {
    language: record.language,
    theme: record.theme,
    appearance: record.appearance,
    onboardingComplete: asBoolean(record.onboardingComplete, `${path}.onboardingComplete`),
  };
}

export async function validateBackup(
  value: unknown,
  options: { files?: PdfFiles } = {},
): Promise<BackupFile> {
  const record = asRecord(value, 'backup');
  if (record.format !== 'sanjeh-backup') fail('backup.format', 'not a SANJEH backup');
  const version = record.version;
  if (version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6) {
    fail('backup.version', 'unsupported backup version');
  }
  const files = options.files;
  if (version === 6 && !files) {
    fail('backup', 'version 6 backups must be read from a ZIP archive');
  }
  asFiniteNumber(record.exportedAt, 'backup.exportedAt');
  const data = asRecord(record.data, 'backup.data');
  const examsValue = data.exams;
  const sessionsValue = data.sessions;
  if (!Array.isArray(examsValue)) fail('backup.data.exams', 'expected an array');
  if (!Array.isArray(sessionsValue)) fail('backup.data.sessions', 'expected an array');
  if (examsValue.length > MAX_EXAMS) fail('backup.data.exams', 'too many exams');
  if (sessionsValue.length > MAX_SESSIONS) fail('backup.data.sessions', 'too many sessions');
  const exams = await Promise.all(
    examsValue.map((exam, index) =>
      asExam(exam, `backup.data.exams[${index}]`, version, files),
    ),
  );
  const examIds = new Set<string>();
  for (const exam of exams) {
    if (examIds.has(exam.id)) fail('backup.data.exams', 'duplicate exam id');
    examIds.add(exam.id);
  }
  const sessions = sessionsValue.map((session, index) =>
    asSession(session, `backup.data.sessions[${index}]`, version),
  );
  return {
    format: 'sanjeh-backup',
    version: 6,
    exportedAt: record.exportedAt as number,
    data: {
      exams,
      sessions,
      settings: asSettings(data.settings, 'backup.data.settings'),
    },
  };
}

export type BackupInput = string | Blob | ArrayBuffer | Uint8Array;

async function inputBytes(input: BackupInput): Promise<Uint8Array | null> {
  if (typeof input === 'string') return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

export async function parseBackupFile(input: BackupInput): Promise<BackupFile> {
  const bytes = await inputBytes(input);
  if (bytes && looksLikeZip(bytes)) {
    let files: PdfFiles;
    try {
      files = readZip(bytes).entries;
    } catch (error) {
      throw new BackupValidationError(
        error instanceof Error ? error.message : 'backup: invalid ZIP archive',
      );
    }
    const manifest = files.get('manifest.json');
    if (!manifest) throw new BackupValidationError('backup: manifest.json is missing');
    if (manifest.byteLength > MAX_MANIFEST_BYTES) {
      throw new BackupValidationError('backup: manifest.json is too large');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(manifest));
    } catch {
      throw new BackupValidationError('backup: invalid JSON');
    }
    return validateBackup(parsed, { files });
  }
  let text: string;
  if (typeof input === 'string') text = input;
  else if (bytes) text = new TextDecoder().decode(bytes);
  else throw new BackupValidationError('backup: unreadable file');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new BackupValidationError('backup: invalid JSON');
  }
  return validateBackup(parsed);
}

function pdfMeta(pdf: StoredPdf, file: string): PdfMeta {
  return {
    id: pdf.id,
    title: pdf.title,
    name: pdf.name,
    type: pdf.type,
    size: pdf.size,
    digest: pdf.digest,
    file,
  };
}

/** Builds a clean ZIP: a JSON manifest plus one raw PDF per stored file. */
export async function createBackup(
  exams: Exam[],
  sessions: ExamSession[],
  settings: Settings,
): Promise<Blob> {
  const files: { name: string; data: Uint8Array }[] = [];
  const fileById = new Map<string, string>();
  const digestById = new Map<string, string>();

  const ensurePdf = async (pdf: StoredPdf): Promise<PdfMeta> => {
    let path = fileById.get(pdf.id);
    let digest = pdf.digest || digestById.get(pdf.id) || '';
    if (!path) {
      const blob = await pdfBlob(pdf);
      if (!blob) throw new Error(`The bytes for PDF ${pdf.id} are missing.`);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > PDF_MAX_BYTES) {
        throw new Error(`PDF ${pdf.id} has an invalid size.`);
      }
      if (!digest) {
        digest = await sha256Hex(blob);
        if (!digest) throw new Error(`PDF ${pdf.id} could not be verified.`);
      }
      digestById.set(pdf.id, digest);
      path = `pdfs/${String(files.length + 1).padStart(5, '0')}.pdf`;
      fileById.set(pdf.id, path);
      files.push({ name: path, data: bytes });
    }
    return pdfMeta({ ...pdf, digest }, path);
  };

  const serializedExams: SerializedExam[] = [];
  for (const exam of exams) {
    const answerPdfs = await Promise.all(exam.answerPdfs.map(ensurePdf));
    const booklets = await Promise.all(
      exam.booklets.map(async (booklet) => ({
        ...booklet,
        pdfs: await Promise.all(booklet.pdfs.map(ensurePdf)),
      })),
    );
    serializedExams.push({ ...exam, answerPdfs, booklets });
  }

  const manifest: BackupManifest = {
    format: 'sanjeh-backup',
    version: 6,
    exportedAt: Date.now(),
    data: {
      exams: serializedExams,
      sessions: structuredClone(sessions),
      settings: structuredClone(settings),
    },
  };
  const archive = createZip([
    {
      name: 'manifest.json',
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    },
    ...files,
  ]);
  return new Blob([archive], { type: 'application/zip' });
}

export function backupFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `sanjeh-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}.zip`;
}
