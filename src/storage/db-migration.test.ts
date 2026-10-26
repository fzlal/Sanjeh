import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadExams, loadSessions } from './db';

const PDF_DATA = 'data:application/pdf;base64,JVBERi0xLjQKJUVPRgo=';

function pdf(name: string, title: string) {
  return { title, name, type: 'application/pdf', size: 8, data: PDF_DATA };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const questions = [
  { id: 'c', key: { kind: 'known', correct: [3] } },
  { id: 'd', key: { kind: 'excluded' } },
  { id: 'e', key: { kind: 'known', correct: [4] } },
];

const examV3 = {
  id: 'exam-v3',
  title: 'Version 3',
  description: '',
  examPdfs: [pdf('exam-v3.pdf', 'Booklet A')],
  answerPdfs: [pdf('answers-v3.pdf', 'Key')],
  durationMinutes: 40,
  questions,
  scheduling: { mode: 'immediate' },
  createdAt: 1,
  updatedAt: 2,
};

async function seedVersion3Database(): Promise<void> {
  await requestToPromise(indexedDB.deleteDatabase('sanjeh'));
  const open = indexedDB.open('sanjeh', 3);
  open.onupgradeneeded = () => {
    const database = open.result;
    database.createObjectStore('exams', { keyPath: 'id' });
    const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('examId', 'examId', { unique: false });
    database.createObjectStore('meta', { keyPath: 'key' });
  };
  const database = await requestToPromise(open);
  const transaction = database.transaction(['exams', 'sessions'], 'readwrite');
  transaction.objectStore('exams').put(examV3);
  transaction.objectStore('sessions').put({
    id: 'session-v3',
    examId: 'exam-v3',
    exam: {
      id: 'exam-v3',
      title: 'Version 3',
      questions,
      durationMinutes: 40,
      scheduling: { mode: 'immediate' },
      createdAt: 1,
      updatedAt: 2,
    },
    responses: {},
    startedAt: 200,
    endsAt: 5000,
    status: 'active',
  });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

describe('version 3 to version 4 upgrade', () => {
  it('wraps legacy exams and sessions into one booklet in place', async () => {
    await seedVersion3Database();

    const [exam] = await loadExams();
    expect(exam.id).toBe('exam-v3');
    expect(exam as unknown as Record<string, unknown>).not.toHaveProperty('examPdfs');
    expect(exam as unknown as Record<string, unknown>).not.toHaveProperty('durationMinutes');
    expect(exam.booklets).toHaveLength(1);
    expect(exam.booklets[0]).toMatchObject({
      title: '',
      questionCount: 3,
      durationMinutes: 40,
    });
    const pdf = exam.booklets[0].pdfs[0];
    expect(pdf.title).toBe('Booklet A');
    expect(pdf).not.toHaveProperty('data');
    expect(pdf.blob).toBeInstanceOf(Blob);
    expect(pdf.size).toBe(14);
    expect(pdf.id).toBeTruthy();
    expect(exam.answerPdfs[0].title).toBe('Key');

    const [session] = await loadSessions();
    expect(session).toMatchObject({
      bookletIndex: 0,
      bookletStartedAt: 200,
      bookletEndsAt: 5000,
      endsAt: 5000,
    });
    expect(session.exam.booklets[0].durationMinutes).toBe(40);
  });
});
