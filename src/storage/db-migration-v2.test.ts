import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { loadExams, loadSessions } from './db';

const PDF_DATA = 'data:application/pdf;base64,JVBERi0xLjQKJUVPRgo=';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const questions = [
  { id: 'a', key: { kind: 'known', correct: [1] } },
  { id: 'b', key: { kind: 'known', correct: [2] } },
];

const examV2 = {
  id: 'exam-v2',
  title: 'Version 2',
  description: '',
  examPdf: {
    name: 'exam-v2.pdf',
    type: 'application/pdf',
    size: 8,
    data: PDF_DATA,
  },
  answerPdf: {
    name: 'answers-v2.pdf',
    type: 'application/pdf',
    size: 8,
    data: PDF_DATA,
  },
  durationMinutes: 30,
  questions,
  scheduling: { mode: 'immediate' },
  createdAt: 1,
  updatedAt: 2,
};

/** A version-3 record can already sit inside a version-2 database. */
const examV3Shape = {
  id: 'exam-v3-shape',
  title: 'Mixed',
  description: '',
  examPdfs: [
    { title: 'Mixed booklet', name: 'mixed.pdf', type: 'application/pdf', size: 8, data: PDF_DATA },
  ],
  answerPdfs: [
    { title: 'Mixed key', name: 'mixed-answers.pdf', type: 'application/pdf', size: 8, data: PDF_DATA },
  ],
  durationMinutes: 15,
  questions: [{ id: 'm1', key: { kind: 'known', correct: [4] } }],
  scheduling: { mode: 'immediate' },
  createdAt: 1,
  updatedAt: 2,
};

async function seedVersion2Database(): Promise<void> {
  await requestToPromise(indexedDB.deleteDatabase('sanjeh'));
  const open = indexedDB.open('sanjeh', 2);
  open.onupgradeneeded = () => {
    const database = open.result;
    database.createObjectStore('exams', { keyPath: 'id' });
    const sessions = database.createObjectStore('sessions', { keyPath: 'id' });
    sessions.createIndex('examId', 'examId', { unique: false });
    database.createObjectStore('meta', { keyPath: 'key' });
  };
  const database = await requestToPromise(open);
  const transaction = database.transaction(['exams', 'sessions'], 'readwrite');
  transaction.objectStore('exams').put(examV2);
  transaction.objectStore('exams').put(examV3Shape);
  transaction.objectStore('sessions').put({
    id: 'session-v2',
    examId: 'exam-v2',
    exam: {
      id: 'exam-v2',
      title: 'Version 2',
      questions,
      durationMinutes: 30,
      scheduling: { mode: 'immediate' },
      createdAt: 1,
      updatedAt: 2,
    },
    responses: {},
    startedAt: 100,
    endsAt: null,
    status: 'active',
  });
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  database.close();
}

describe('version 2 to version 4 upgrade', () => {
  it('runs both migration steps and preserves already-migrated records', async () => {
    await seedVersion2Database();

    const exams = await loadExams();
    const migrated = exams.find((exam) => exam.id === 'exam-v2');
    expect(migrated).toBeDefined();
    const record = migrated as unknown as Record<string, unknown>;
    expect(record).not.toHaveProperty('examPdf');
    expect(record).not.toHaveProperty('answerPdf');
    expect(record).not.toHaveProperty('examPdfs');
    expect(record).not.toHaveProperty('durationMinutes');
    expect(migrated?.booklets).toHaveLength(1);
    expect(migrated?.booklets[0]).toMatchObject({
      title: '',
      questionCount: 2,
      durationMinutes: 30,
    });
    expect(migrated?.booklets[0].pdfs[0].title).toBe('exam-v2');
    expect(migrated?.answerPdfs[0].title).toBe('answers-v2');

    const mixed = exams.find((exam) => exam.id === 'exam-v3-shape');
    expect(mixed?.booklets[0]).toMatchObject({
      title: '',
      questionCount: 1,
      durationMinutes: 15,
    });
    expect(mixed?.booklets[0].pdfs[0].title).toBe('Mixed booklet');
    expect(mixed?.answerPdfs[0].title).toBe('Mixed key');

    const [session] = await loadSessions();
    expect(session).toMatchObject({
      bookletIndex: 0,
      bookletStartedAt: 100,
      bookletEndsAt: null,
      endsAt: null,
    });
    expect(session.exam.booklets).toHaveLength(1);
    expect(session.exam.booklets[0]).toMatchObject({
      questionCount: 2,
      durationMinutes: 30,
    });
  });
});
