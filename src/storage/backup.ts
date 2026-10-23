import type {
  AnswerKey,
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
import { isLanguageCode } from '@/i18n/languages';
import { MAX_PDFS_PER_GROUP, PDF_MAX_BYTES, defaultPdfTitle } from '@/lib/file';
import { isThemeId } from '@/themes';

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
const MAX_PDF_DATA = Math.ceil(PDF_MAX_BYTES / 3) * 4 + 64;
const PDF_DATA_PREFIX = 'data:application/pdf;base64,';

const OUTCOMES: readonly QuestionOutcome[] = [
  'correct',
  'incorrect',
  'unanswered',
  'excluded',
  'unresolved',
];

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

function asPdfFields(record: Record<string, unknown>, path: string) {
  const name = asString(record.name, `${path}.name`, 300);
  if (!name) fail(`${path}.name`, 'name is empty');
  if (record.type !== 'application/pdf') fail(`${path}.type`, 'expected application/pdf');
  const size = asInteger(record.size, `${path}.size`, 1, PDF_MAX_BYTES);
  const data = asString(record.data, `${path}.data`, MAX_PDF_DATA);
  if (!data.startsWith(PDF_DATA_PREFIX)) fail(`${path}.data`, 'expected PDF base64 data');
  return { name, type: 'application/pdf' as const, size, data };
}

function asStoredPdf(value: unknown, path: string): StoredPdf {
  const record = asRecord(value, path);
  const title = asString(record.title, `${path}.title`, 300).trim();
  if (!title) fail(`${path}.title`, 'title is empty');
  return { ...asPdfFields(record, path), title };
}

/** Version-2 backups had one untitled PDF per booklet. */
function asLegacyStoredPdf(value: unknown, path: string): StoredPdf {
  const fields = asPdfFields(asRecord(value, path), path);
  return { ...fields, title: defaultPdfTitle(fields.name) };
}

function asPdfList(value: unknown, path: string): StoredPdf[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (value.length === 0) fail(path, 'expected at least one PDF');
  if (value.length > MAX_PDFS_PER_GROUP) fail(path, 'too many PDFs');
  return value.map((pdf, index) => asStoredPdf(pdf, `${path}[${index}]`));
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

function asBooklet(value: unknown, path: string): Booklet {
  const record = asRecord(value, path);
  return {
    ...asBookletSnapshot(record, path),
    pdfs: asPdfList(record.pdfs, `${path}.pdfs`),
  };
}

function asBooklets(value: unknown, path: string): Booklet[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (value.length === 0) fail(path, 'expected at least one booklet');
  if (value.length > MAX_BOOKLETS) fail(path, 'too many booklets');
  const booklets = value.map((booklet, index) => asBooklet(booklet, `${path}[${index}]`));
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

function asExam(value: unknown, path: string, version: number): Exam {
  const record = asRecord(value, path);
  const questions = asQuestions(record, path);
  if (version < 4) {
    const duration = legacyDuration(record, path);
    const examPdfs =
      version === 2
        ? [asLegacyStoredPdf(record.examPdf, `${path}.examPdf`)]
        : asPdfList(record.examPdfs, `${path}.examPdfs`);
    const answerPdfs =
      version === 2
        ? [asLegacyStoredPdf(record.answerPdf, `${path}.answerPdf`)]
        : asPdfList(record.answerPdfs, `${path}.answerPdfs`);
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
  const booklets = asBooklets(record.booklets, `${path}.booklets`);
  return {
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
    answerPdfs: asPdfList(record.answerPdfs, `${path}.answerPdfs`),
  };
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
  return session;
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

export function validateBackup(value: unknown): BackupFile {
  const record = asRecord(value, 'backup');
  if (record.format !== 'sanjeh-backup') fail('backup.format', 'not a SANJEH backup');
  const version = record.version;
  if (version !== 2 && version !== 3 && version !== 4) {
    fail('backup.version', 'unsupported backup version');
  }
  asFiniteNumber(record.exportedAt, 'backup.exportedAt');
  const data = asRecord(record.data, 'backup.data');
  const examsValue = data.exams;
  const sessionsValue = data.sessions;
  if (!Array.isArray(examsValue)) fail('backup.data.exams', 'expected an array');
  if (!Array.isArray(sessionsValue)) fail('backup.data.sessions', 'expected an array');
  if (examsValue.length > MAX_EXAMS) fail('backup.data.exams', 'too many exams');
  if (sessionsValue.length > MAX_SESSIONS) fail('backup.data.sessions', 'too many sessions');
  const exams = examsValue.map((exam, index) =>
    asExam(exam, `backup.data.exams[${index}]`, version),
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
    version: 4,
    exportedAt: record.exportedAt as number,
    data: {
      exams,
      sessions,
      settings: asSettings(data.settings, 'backup.data.settings'),
    },
  };
}

export function parseBackupFile(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupValidationError('backup: invalid JSON');
  }
  return validateBackup(parsed);
}

export function createBackup(
  exams: Exam[],
  sessions: ExamSession[],
  settings: Settings,
): BackupFile {
  return {
    format: 'sanjeh-backup',
    version: 4,
    exportedAt: Date.now(),
    data: { exams, sessions, settings },
  };
}

export function backupFileName(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `sanjeh-backup-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}.json`;
}
