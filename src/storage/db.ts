import type { Exam, ExamSession, Settings } from '@/types';
import {
  migrateExamV2ToV3,
  migrateExamV3ToV4,
  migrateSessionV3ToV4,
} from './migrations';

const DB_NAME = 'sanjeh';
// Version 2 replaced text-based exams with PDF-backed exams; version 3 allowed
// several titled PDFs per booklet; version 4 moves questions, time, and files
// into ordered booklets. Older records are migrated in place.
const DB_VERSION = 4;

export const STORE_EXAMS = 'exams';
export const STORE_SESSIONS = 'sessions';
export const STORE_META = 'meta';

interface MetaRecord {
  key: string;
  value: unknown;
}

export const SETTINGS_KEY = 'settings';

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}

let databasePromise: Promise<IDBDatabase> | null = null;

function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    return Promise.reject(new StorageError('IndexedDB is not available in this environment.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      if (event.oldVersion < 2) {
        for (const name of [STORE_EXAMS, STORE_SESSIONS, STORE_META]) {
          if (database.objectStoreNames.contains(name)) database.deleteObjectStore(name);
        }
        database.createObjectStore(STORE_EXAMS, { keyPath: 'id' });
        const sessions = database.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessions.createIndex('examId', 'examId', { unique: false });
        database.createObjectStore(STORE_META, { keyPath: 'key' });
        return;
      }
      if (event.oldVersion < 4) {
        const transaction = request.transaction;
        if (!transaction) return;
        const exams = transaction.objectStore(STORE_EXAMS);
        const cursorRequest = exams.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          let value = cursor.value;
          if (event.oldVersion < 3) value = migrateExamV2ToV3(value);
          cursor.update(migrateExamV3ToV4(value));
          cursor.continue();
        };

        const sessions = transaction.objectStore(STORE_SESSIONS);
        const sessionRequest = sessions.openCursor();
        sessionRequest.onsuccess = () => {
          const cursor = sessionRequest.result;
          if (!cursor) return;
          cursor.update(migrateSessionV3ToV4(cursor.value));
          cursor.continue();
        };
      }
    };

    request.onblocked = () => {
      reject(new StorageError('Another SANJEH tab is blocking a storage upgrade.'));
    };
    request.onerror = () => {
      reject(new StorageError('Could not open local storage.', { cause: request.error }));
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
  }).catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });

  return databasePromise;
}

function readFromStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDatabase().then(
    (database) =>
      new Promise<T | undefined>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result as T | undefined);
        request.onerror = () =>
          reject(new StorageError('A local storage read failed.', { cause: request.error }));
      }),
  );
}

function readAllFromStore<T>(storeName: string): Promise<T[]> {
  return openDatabase().then(
    (database) =>
      new Promise<T[]>((resolve, reject) => {
        const transaction = database.transaction(storeName, 'readonly');
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () =>
          reject(new StorageError('A local storage read failed.', { cause: request.error }));
      }),
  );
}

async function writeToStores(
  storeNames: string[],
  action: (transaction: IDBTransaction) => void,
): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeNames, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(new StorageError('A local storage write failed.', { cause: transaction.error }));
    transaction.onabort = () =>
      reject(new StorageError('A local storage write was aborted.', { cause: transaction.error }));
    try {
      action(transaction);
    } catch (error) {
      transaction.abort();
      reject(error instanceof Error ? error : new StorageError('A local storage write failed.'));
    }
  });
}

export function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return readAllFromStore<T>(storeName);
}

export function getFromStore<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return readFromStore<T>(storeName, key);
}

export function putInStore<T>(storeName: string, value: T): Promise<void> {
  return writeToStores([storeName], (transaction) => {
    transaction.objectStore(storeName).put(value);
  });
}

export function deleteFromStore(storeName: string, key: IDBValidKey): Promise<void> {
  return writeToStores([storeName], (transaction) => {
    transaction.objectStore(storeName).delete(key);
  });
}

export async function readSettingsRecord(): Promise<Settings | null> {
  const record = await getFromStore<MetaRecord>(STORE_META, SETTINGS_KEY);
  return record ? (record.value as Settings) : null;
}

export function writeSettingsRecord(settings: Settings): Promise<void> {
  return putInStore<MetaRecord>(STORE_META, { key: SETTINGS_KEY, value: settings });
}

export function clearAllStores(): Promise<void> {
  return writeToStores([STORE_EXAMS, STORE_SESSIONS, STORE_META], (transaction) => {
    for (const name of [STORE_EXAMS, STORE_SESSIONS, STORE_META]) {
      transaction.objectStore(name).clear();
    }
  });
}

export function loadExams(): Promise<Exam[]> {
  return getAllFromStore<Exam>(STORE_EXAMS);
}

export function loadSessions(): Promise<ExamSession[]> {
  return getAllFromStore<ExamSession>(STORE_SESSIONS);
}

export function saveExam(exam: Exam): Promise<void> {
  return putInStore(STORE_EXAMS, exam);
}

export function getExam(examId: string): Promise<Exam | undefined> {
  return getFromStore<Exam>(STORE_EXAMS, examId);
}

export function removeExam(examId: string): Promise<void> {
  return deleteFromStore(STORE_EXAMS, examId);
}

export function saveSession(session: ExamSession): Promise<void> {
  return putInStore(STORE_SESSIONS, session);
}

export function removeSession(sessionId: string): Promise<void> {
  return deleteFromStore(STORE_SESSIONS, sessionId);
}

export function getSession(sessionId: string): Promise<ExamSession | undefined> {
  return getFromStore<ExamSession>(STORE_SESSIONS, sessionId);
}

export function replaceAllData(data: {
  exams: Exam[];
  sessions: ExamSession[];
  settings: Settings;
}): Promise<void> {
  return writeToStores([STORE_EXAMS, STORE_SESSIONS, STORE_META], (transaction) => {
    const exams = transaction.objectStore(STORE_EXAMS);
    const sessions = transaction.objectStore(STORE_SESSIONS);
    const meta = transaction.objectStore(STORE_META);
    exams.clear();
    sessions.clear();
    for (const exam of data.exams) exams.put(exam);
    for (const session of data.sessions) sessions.put(session);
    meta.put({ key: SETTINGS_KEY, value: data.settings } satisfies MetaRecord);
  });
}
