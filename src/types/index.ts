export const OPTION_INDICES = [1, 2, 3, 4] as const;
export type OptionIndex = (typeof OPTION_INDICES)[number];

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
  /** Editable label shown in the app; defaults to the file name without .pdf. */
  title: string;
  name: string;
  type: 'application/pdf';
  size: number;
  /** Base64 data URL. Never uploaded, parsed, or rendered inside the app. */
  data: string;
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

export interface BackupFile {
  format: 'sanjeh-backup';
  version: 4;
  exportedAt: number;
  data: {
    exams: Exam[];
    sessions: ExamSession[];
    settings: Settings;
  };
}
