import type { AnswerKey, Booklet, Exam, OptionIndex, Question, StoredPdf } from '@/types';

let sequence = 0;
let pdfSequence = 0;

const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n%EOF\n');
const PDF_DIGEST = 'f246a0043abad99c6fe9964c6dbd54b20a506bdd2720b0bf7b14a21f9bc4aa61';

export function makePdf(name = 'exam.pdf', title = name.replace(/\.pdf$/i, '')): StoredPdf {
  pdfSequence += 1;
  return {
    id: `pdf-${pdfSequence}`,
    title,
    name,
    type: 'application/pdf',
    size: PDF_BYTES.byteLength,
    digest: PDF_DIGEST,
    blob: new Blob([PDF_BYTES], { type: 'application/pdf' }),
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
    answerKeyMode: 'qz1',
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
