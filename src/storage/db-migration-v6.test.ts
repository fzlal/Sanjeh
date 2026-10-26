import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadExams, loadSessions } from './db';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const questions = [
  { id: 'q1', key: { kind: 'known', correct: [1] } },
  { id: 'q2', key: { kind: 'known', correct: [2] } },
];

const booklets = [
  {
    id: 'booklet-v5',
    title: 'Booklet',
    pdfs: [],
    questionCount: 2,
    durationMinutes: 10,
  },
];

const examV5 = {
  id: 'exam-v5',
  title: 'Version 5',
  description: '',
  answerPdfs: [],
  booklets,
  questions,
  scheduling: { mode: 'immediate' },
  createdAt: 1,
  updatedAt: 2,
};

const manualExamV5 = {
  ...examV5,
  id: 'exam-v5-manual',
  answerKeyMode: 'manual',
};

const sessionV5 = {
  id: 'session-v5',
  examId: 'exam-v5',
  exam: {
    id: 'exam-v5',
    title: 'Version 5',
    questions,
    booklets: [
      {
        id: 'booklet-v5',
        title: 'Booklet',
        questionCount: 2,
        durationMinutes: 10,
      },
    ],
    scheduling: { mode: 'immediate' },
    createdAt: 1,
    updatedAt: 2,
  },
  responses: {},
  startedAt: 100,
  bookletIndex: 0,
  bookletStartedAt: 100,
  bookletEndsAt: null,
  endsAt: null,
  status: 'active',
};

async function seedVersion5Database(): Promise<void> {
  await requestToPromise(indexedDB.deleteDatabase('sanjeh'));
  const open = indexedDB.open('sanjeh', 5);
  open.onupgradeneeded = () => {
    const database = open.result;
    database.createObjectStore('exams', { keyPath: 'id' });
    const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('examId', 'examId', { unique: false });
    database.createObjectStore('meta', { keyPath: 'key' });
  };
  const database = await requestToPromise(open);
  const transaction = database.transaction(['exams', 'sessions'], 'readwrite');
  transaction.objectStore('exams').put(examV5);
  transaction.objectStore('exams').put(manualExamV5);
  transaction.objectStore('sessions').put(sessionV5);
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

describe('version 5 to version 6 upgrade', () => {
  it('defaults legacy exams and snapshots to QZ1 and keeps explicit modes', async () => {
    await seedVersion5Database();

    const exams = await loadExams();
    expect(exams.find((exam) => exam.id === 'exam-v5')?.answerKeyMode).toBe('qz1');
    expect(exams.find((exam) => exam.id === 'exam-v5-manual')?.answerKeyMode).toBe('manual');

    const [session] = await loadSessions();
    expect(session.exam.answerKeyMode).toBe('qz1');
  });
});
