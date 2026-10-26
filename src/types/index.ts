export const OPTION_INDICES = [1, 2, 3, 4] as const;
export type OptionIndex = (typeof OPTION_INDICES)[number];

export const ANSWER_KEY_MODES = ['qz1', 'manual', 'none'] as const;
export type AnswerKeyMode = (typeof ANSWER_KEY_MODES)[number];

export type AnswerKey =
  | { kind: 'known'; correct: OptionIndex[] }
  | { kind: 'unresolved' }
  | { kind: 'excluded' };

export interface Question {
  id: string;
  key: AnswerKey;
}

/** A PDF kept verbatim on this device so it can be downloaded again. */
export interface StoredPdf {
  /** Stable identity. The bytes behind an id can never be replaced. */
  id: string;
  /** Editable label shown in the app; defaults to the file name without .pdf. */
  title: string;
  name: string;
  type: 'application/pdf';
  size: number;
  /** SHA-256 of the bytes when known; empty for records migrated from base64. */
  digest: string;
  /**
   * Native PDF bytes while they are held by the web build. The desktop build
   * streams bytes from its local file store on demand instead of keeping every
   * PDF in memory.
   */
  blob?: Blob;
}

export type Scheduling =
  | { mode: 'immediate' }
  | { mode: 'scheduled'; startsAt: number }
  | { mode: 'window'; startsAt: number; endsAt: number }
  | { mode: 'flexible'; windowStart: number; windowEnd: number };

/** One printed booklet: its own files, question range, and time limit. */
export interface Booklet {
  id: string;
  title: string;
  pdfs: StoredPdf[];
  /** How many of the exam's questions belong to this booklet. */
  questionCount: number;
  /** 0 means no time limit for this booklet. */
  durationMinutes: number;
}

/** The booklet metadata that is frozen into a session; PDFs stay in the exam. */
export type BookletSnapshot = Omit<Booklet, 'pdfs'>;

export interface Exam {
  id: string;
  title: string;
  description?: string;
  /**
   * How this exam gets its correct options: one imported QZ1 key, a manually
   * entered key, or no key at all (choices-only results).
   */
  answerKeyMode: AnswerKeyMode;
  answerPdfs: StoredPdf[];
  /** Ordered printed booklets; together they cover every question exactly once. */
  booklets: Booklet[];
  questions: Question[];
  scheduling: Scheduling;
  createdAt: number;
  updatedAt: number;
}

/** The part of an exam frozen into a session; PDFs stay in the exam record only. */
export interface ExamSnapshot {
  id: string;
  title: string;
  description?: string;
  answerKeyMode: AnswerKeyMode;
  questions: Question[];
  booklets: BookletSnapshot[];
  scheduling: Scheduling;
  createdAt: number;
  updatedAt: number;
}

export type QuestionOutcome = 'correct' | 'incorrect' | 'unanswered' | 'excluded' | 'unresolved';

export interface ReviewedQuestion {
  questionId: string;
  outcome: QuestionOutcome;
  selected: OptionIndex[];
  correct: OptionIndex[] | null;
}

export interface ResultSnapshot {
  totalQuestions: number;
  scoredQuestions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  excluded: number;
  unresolved: number;
  /** null when there is no scorable question. */
  percentage: number | null;
  completedAt: number;
  perQuestion: ReviewedQuestion[];
}

export interface ExamSession {
  id: string;
  examId: string;
  /** Frozen copy of the exam so later edits cannot corrupt an in-flight session. */
  exam: ExamSnapshot;
  responses: Record<string, OptionIndex[]>;
  startedAt: number;
  /** Index of the booklet the attempt is currently on. */
  bookletIndex: number;
  /** When the current booklet began; a manual finish never adds leftover time. */
  bookletStartedAt: number;
  /** Deadline of the current booklet; null only when it is untimed and unbounded. */
  bookletEndsAt: number | null;
  /** Hard end imposed by the schedule window; null when there is no window. */
  endsAt: number | null;
  status: 'active' | 'submitted';
  submittedAt?: number;
  result?: ResultSnapshot;
}

export type LanguageCode = 'fa' | 'en';

export type AppearanceMode = 'light' | 'dark' | 'system';

export interface Settings {
  language: LanguageCode;
  theme: string;
  appearance: AppearanceMode;
  onboardingComplete: boolean;
}

/** A validated, in-memory backup whose PDFs are native Blobs. */
export interface BackupFile {
  format: 'sanjeh-backup';
  version: 6;
  exportedAt: number;
  data: {
    exams: Exam[];
    sessions: ExamSession[];
    settings: Settings;
  };
}
