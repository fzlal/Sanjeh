import type { AnswerKey, Booklet, Exam, OptionIndex, Question, StoredPdf } from '@/types';

let sequence = 0;

export function makePdf(name = 'exam.pdf', title = name.replace(/\.pdf$/i, '')): StoredPdf {
  return {
    title,
    name,
    type: 'application/pdf',
    size: 15,
    data: 'data:application/pdf;base64,JVBERi0xLjQKJUVPRgo=',
  };
}

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  sequence += 1;
  return {
    id: `q-${sequence}`,
    key: { kind: 'known', correct: [1] },
    ...overrides,
  };
}

export function makeBooklet(overrides: Partial<Booklet> = {}): Booklet {
  sequence += 1;
  return {
    id: `booklet-${sequence}`,
    title: `Booklet ${sequence}`,
    pdfs: [makePdf(`booklet-${sequence}.pdf`)],
    questionCount: 2,
    durationMinutes: 30,
    ...overrides,
  };
}

export function makeExam(overrides: Partial<Exam> = {}): Exam {
  const questions = overrides.questions ?? [makeQuestion(), makeQuestion()];
  const booklets = overrides.booklets ?? [
    makeBooklet({ questionCount: questions.length, durationMinutes: 30 }),
  ];
  return {
    id: 'exam-1',
    title: 'Test exam',
    description: '',
    answerPdfs: [makePdf('answers.pdf')],
    booklets,
    questions,
    scheduling: { mode: 'immediate' },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

export function key(correct: OptionIndex[]): AnswerKey {
  return { kind: 'known', correct };
}
