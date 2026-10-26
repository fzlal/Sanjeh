import type { Exam, ExamSession, Settings, StoredPdf } from '@/types';
import { sha256Hex } from '@/lib/file';
import { rescoreSubmittedSession, syncSessionWithExam } from '@/lib/session';
import { readBootSettings } from './boot';
import { StorageError } from './errors';
import {
  migrateExamV2ToV3,
  migrateExamV3ToV4,
  migrateExamV4ToV5,
  migrateExamV5ToV6,
  migrateSessionV3ToV4,
  migrateSessionV5ToV6,
} from './migrations';
import {
  isNativeRuntime,
  nativeClear,
  nativeDeleteExam,
  nativeDeleteSession,
  nativeLoad,
  nativeMarkReady,
  nativeReady,
  nativeReplaceAll,
  nativeSaveExam,
  nativeSaveSession,
  nativeSaveSettings,
} from './native';

export { StorageError };

const DB_NAME = 'sanjeh';
// Version 2 replaced text-based exams with PDF-backed exams; version 3 allowed
// several titled PDFs per booklet; version 4 moved questions, time, and files
// into ordered booklets; version 5 stores native PDF Blobs instead of base64;
// version 6 records how each exam gets its answer key. Older records are
// migrated in place. The desktop build reads the same data through its local
// file store instead of IndexedDB.
const DB_VERSION = 6;

export const STORE_EXAMS = 'exams';
export const STORE_SESSIONS = 'sessions';
export const STORE_META = 'meta';

interface MetaRecord {
  key: string;
  value: unknown;
}

export const SETTINGS_KEY = 'settings';

let databasePromise: Promise<IDBDatabase> | null = null;
let nativeReadyPromise: Promise<void> | null = null;

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
      const previous = event.oldVersion;
      if (previous < 2) {
        for (const name of [STORE_EXAMS, STORE_SESSIONS, STORE_META]) {
          if (database.objectStoreNames.contains(name)) database.deleteObjectStore(name);
        }
        database.createObjectStore(STORE_EXAMS, { keyPath: 'id' });
        const sessions = database.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        sessions.createIndex('examId', 'examId', { unique: false });
        database.createObjectStore(STORE_META, { keyPath: 'key' });
        return;
      }
      const transaction = request.transaction;
      if (!transaction) return;

      const exams = transaction.objectStore(STORE_EXAMS);
      const examRequest = exams.openCursor();
      examRequest.onsuccess = () => {
        const cursor = examRequest.result;
        if (!cursor) return;
        let value = cursor.value;
        if (previous < 3) value = migrateExamV2ToV3(value);
        if (previous < 4) value = migrateExamV3ToV4(value);
        if (previous < 5) value = migrateExamV4ToV5(value);
        cursor.update(migrateExamV5ToV6(value));
        cursor.continue();
      };

      const sessions = transaction.objectStore(STORE_SESSIONS);
      const sessionRequest = sessions.openCursor();
      sessionRequest.onsuccess = () => {
        const cursor = sessionRequest.result;
        if (!cursor) return;
        const value =
          previous < 4
            ? migrateSessionV3ToV4(cursor.value)
            : cursor.value;
        cursor.update(migrateSessionV5ToV6(value));
        cursor.continue();
      };
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

async function closeBrowserDatabase(): Promise<void> {
  const pending = databasePromise;
  databasePromise = null;
  if (!pending) return;
  try {
    const database = await pending;
    database.close();
  } catch {
    /* the database never opened */
  }
}

function deleteBrowserDatabase(): Promise<void> {
  if (!isIndexedDbAvailable()) return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

/**
 * On the first desktop launch, copies any existing browser database into the
 * native file store and removes the browser copy. From then on the desktop
 * build never reads or writes exam data through IndexedDB.
 */
async function migrateBrowserDataToNative(): Promise<void> {
  if (!isIndexedDbAvailable()) {
    await nativeMarkReady();
    return;
  }
  let exams: Exam[] = [];
  let sessions: ExamSession[] = [];
  let settings: Settings | null = null;
  try {
    [exams, sessions, settings] = await Promise.all([
      readAllFromStore<Exam>(STORE_EXAMS),
      readAllFromStore<ExamSession>(STORE_SESSIONS),
      readFromStore<MetaRecord>(STORE_META, SETTINGS_KEY).then((record) =>
        record ? (record.value as Settings) : null,
      ),
    ]);
  } catch {
    // A browser profile without a usable database has nothing to migrate.
  }
  const migrated = exams.length > 0 || sessions.length > 0 || settings !== null;
  if (migrated) {
    const prepared = await Promise.all(exams.map((exam) => prepareExamForStorage(exam)));
    await nativeReplaceAll({
      exams: prepared,
      sessions,
      settings: settings ?? readBootSettings(),
    });
    await closeBrowserDatabase();
    await deleteBrowserDatabase();
    return;
  }
  await nativeMarkReady();
}

async function ensureNativeReady(): Promise<void> {
  if (!nativeReadyPromise) {
    nativeReadyPromise = (async () => {
      if (await nativeReady()) return;
      await migrateBrowserDataToNative();
    })().catch((error: unknown) => {
      nativeReadyPromise = null;
      throw error instanceof Error
        ? error
        : new StorageError('Could not prepare the local store.', { cause: error });
    });
  }
  await nativeReadyPromise;
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
  if (isNativeRuntime()) {
    await ensureNativeReady();
    return (await nativeLoad()).settings;
  }
  const record = await getFromStore<MetaRecord>(STORE_META, SETTINGS_KEY);
  return record ? (record.value as Settings) : null;
}

export function writeSettingsRecord(settings: Settings): Promise<void> {
  if (isNativeRuntime()) {
    return ensureNativeReady().then(() => nativeSaveSettings(settings));
  }
  return putInStore<MetaRecord>(STORE_META, { key: SETTINGS_KEY, value: settings });
}

export function clearAllStores(): Promise<void> {
  if (isNativeRuntime()) {
    return ensureNativeReady().then(() => nativeClear());
  }
  return writeToStores([STORE_EXAMS, STORE_SESSIONS, STORE_META], (transaction) => {
    for (const name of [STORE_EXAMS, STORE_SESSIONS, STORE_META]) {
      transaction.objectStore(name).clear();
    }
  });
}

export async function loadExams(): Promise<Exam[]> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    return (await nativeLoad()).exams;
  }
  return getAllFromStore<Exam>(STORE_EXAMS);
}

export async function loadSessions(): Promise<ExamSession[]> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    return (await nativeLoad()).sessions;
  }
  const sessions = await getAllFromStore<ExamSession>(STORE_SESSIONS);
  return sessions.map(rescoreSubmittedSession);
}

async function readSessionsForExam(examId: string): Promise<ExamSession[]> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    return (await nativeLoad()).sessions.filter((session) => session.examId === examId);
  }
  const database = await openDatabase();
  return new Promise<ExamSession[]>((resolve, reject) => {
    const transaction = database.transaction(STORE_SESSIONS, 'readonly');
    const request = transaction.objectStore(STORE_SESSIONS).index('examId').getAll(examId);
    request.onsuccess = () => resolve(request.result as ExamSession[]);
    request.onerror = () =>
      reject(new StorageError('A local storage read failed.', { cause: request.error }));
  });
}

function pdfsOfExam(exam: Exam): StoredPdf[] {
  return [...exam.answerPdfs, ...exam.booklets.flatMap((booklet) => booklet.pdfs)];
}

async function prepareExamForStorage(exam: Exam): Promise<Exam> {
  const ids = new Set<string>();
  const prepare = async (pdf: StoredPdf): Promise<StoredPdf> => {
    if (!pdf.id || ids.has(pdf.id)) {
      throw new StorageError('A stored PDF has a missing or duplicate identity.', {
        code: 'pdfImmutable',
      });
    }
    ids.add(pdf.id);
    const blob = pdf.blob;
    if (blob instanceof Blob && blob.size > 0) {
      let next = pdf.size === blob.size ? pdf : { ...pdf, size: blob.size };
      if (!next.digest) {
        const digest = await sha256Hex(blob);
        if (digest) next = { ...next, digest };
      }
      return next;
    }
    if (!Number.isFinite(pdf.size) || pdf.size <= 0 || !pdf.digest) {
      throw new StorageError('A stored PDF is missing its bytes.', { code: 'pdfImmutable' });
    }
    return pdf;
  };
  const answerPdfs = await Promise.all(exam.answerPdfs.map(prepare));
  const booklets = await Promise.all(
    exam.booklets.map(async (booklet) => ({
      ...booklet,
      pdfs: await Promise.all(booklet.pdfs.map(prepare)),
    })),
  );
  return { ...exam, answerPdfs, booklets };
}

async function blobsEqual(left: Blob, right: Blob): Promise<boolean> {
  if (left.size !== right.size) return false;
  const [leftBuffer, rightBuffer] = await Promise.all([
    left.arrayBuffer(),
    right.arrayBuffer(),
  ]);
  const leftBytes = new Uint8Array(leftBuffer);
  const rightBytes = new Uint8Array(rightBuffer);
  for (let index = 0; index < leftBytes.length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return false;
  }
  return true;
}

/**
 * Once a PDF id is stored, its bytes are immutable. Changing a document means
 * removing it and adding the new file under a fresh id.
 */
async function assertPdfsImmutable(
  existing: Exam | undefined,
  next: Exam,
): Promise<void> {
  if (!existing) return;
  const previous = new Map(pdfsOfExam(existing).map((pdf) => [pdf.id, pdf]));
  for (const pdf of pdfsOfExam(next)) {
    const before = previous.get(pdf.id);
    if (!before) continue;
    const unchanged =
      before.digest && pdf.digest
        ? before.digest === pdf.digest
        : before.blob && pdf.blob
          ? await blobsEqual(before.blob, pdf.blob)
          : true;
    if (!unchanged) {
      throw new StorageError('A stored PDF cannot be replaced.', { code: 'pdfImmutable' });
    }
  }
}

/**
 * Saves an exam and keeps its attempts relational: matching question ids get
 * the new answer key and submitted attempts are re-scored, while question
 * counts, booklet structure, and timing stay frozen in each session.
 */
export async function saveExam(exam: Exam): Promise<void> {
  if (isNativeRuntime()) await ensureNativeReady();
  const prepared = await prepareExamForStorage(exam);
  const [existing, sessions] = await Promise.all([
    getExam(prepared.id),
    readSessionsForExam(prepared.id),
  ]);
  if (!isNativeRuntime()) await assertPdfsImmutable(existing, prepared);
  const syncedSessions = sessions.map((session) => syncSessionWithExam(session, prepared));
  if (isNativeRuntime()) {
    await nativeSaveExam(prepared);
    for (const session of syncedSessions) await nativeSaveSession(session);
    return;
  }
  await writeToStores([STORE_EXAMS, STORE_SESSIONS], (transaction) => {
    transaction.objectStore(STORE_EXAMS).put(prepared);
    const sessionsStore = transaction.objectStore(STORE_SESSIONS);
    for (const session of syncedSessions) sessionsStore.put(session);
  });
}

export async function getExam(examId: string): Promise<Exam | undefined> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    return (await nativeLoad()).exams.find((exam) => exam.id === examId);
  }
  return getFromStore<Exam>(STORE_EXAMS, examId);
}

export async function removeExam(examId: string): Promise<void> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    await nativeDeleteExam(examId);
    return;
  }
  await deleteFromStore(STORE_EXAMS, examId);
}

export function saveSession(session: ExamSession): Promise<void> {
  if (isNativeRuntime()) {
    return ensureNativeReady().then(() => nativeSaveSession(session));
  }
  return putInStore(STORE_SESSIONS, session);
}

export async function removeSession(sessionId: string): Promise<void> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    await nativeDeleteSession(sessionId);
    return;
  }
  await deleteFromStore(STORE_SESSIONS, sessionId);
}

export async function getSession(sessionId: string): Promise<ExamSession | undefined> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    return (await nativeLoad()).sessions.find((session) => session.id === sessionId);
  }
  const session = await getFromStore<ExamSession>(STORE_SESSIONS, sessionId);
  return session ? rescoreSubmittedSession(session) : undefined;
}

export async function replaceAllData(data: {
  exams: Exam[];
  sessions: ExamSession[];
  settings: Settings;
}): Promise<void> {
  if (isNativeRuntime()) {
    await ensureNativeReady();
    const exams = await Promise.all(data.exams.map((exam) => prepareExamForStorage(exam)));
    await nativeReplaceAll({ exams, sessions: data.sessions, settings: data.settings });
    return;
  }
  await writeToStores([STORE_EXAMS, STORE_SESSIONS, STORE_META], (transaction) => {
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
