import type { Exam, ExamSession, Settings, StoredPdf } from '@/types';
import { base64ToBytes, bytesToBase64 } from '@/lib/file';
import { rescoreSubmittedSession } from '@/lib/session';
import { StorageError } from './errors';
import { migrateExamV5ToV6, migrateSessionV5ToV6 } from './migrations';

interface TauriInternals {
  invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

declare global {
  interface Window {
    __TAURI_INTERNALS__?: TauriInternals;
  }
}

export interface NativeSnapshot {
  ready: boolean;
  exams: Exam[];
  sessions: ExamSession[];
  settings: Settings | null;
}

export interface NativeReplacePayload {
  exams: Exam[];
  sessions: ExamSession[];
  settings: Settings;
}

export function isNativeRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.__TAURI_INTERNALS__?.invoke === 'function'
  );
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const runtime = window.__TAURI_INTERNALS__;
  if (!runtime) throw new StorageError('The local backend is not available.');
  try {
    return await runtime.invoke<T>(command, args);
  } catch (error) {
    const message = typeof error === 'string' ? error : String(error);
    throw new StorageError(message, {
      code: message.includes('pdfImmutable') ? 'pdfImmutable' : 'storage',
      cause: error,
    });
  }
}

type PdfMeta = Omit<StoredPdf, 'blob'>;

interface NativePdfPayload {
  id: string;
  digest: string;
  data: string;
}

interface NativeExamPayload {
  exam: Exam;
  pdfs: NativePdfPayload[];
}

function pdfMeta(pdf: StoredPdf): PdfMeta {
  return {
    id: pdf.id,
    title: pdf.title,
    name: pdf.name,
    type: pdf.type,
    size: pdf.size,
    digest: pdf.digest,
  };
}

async function pdfPayload(pdf: StoredPdf): Promise<{ meta: PdfMeta; bytes: NativePdfPayload | null }> {
  const meta = pdfMeta(pdf);
  if (!(pdf.blob instanceof Blob) || pdf.blob.size === 0) return { meta, bytes: null };
  const data = bytesToBase64(new Uint8Array(await pdf.blob.arrayBuffer()));
  return { meta, bytes: { id: pdf.id, digest: pdf.digest, data } };
}

async function examPayload(exam: Exam): Promise<NativeExamPayload> {
  const bytes: NativePdfPayload[] = [];
  const collect = async (pdf: StoredPdf): Promise<PdfMeta> => {
    const payload = await pdfPayload(pdf);
    if (payload.bytes) bytes.push(payload.bytes);
    return payload.meta;
  };
  const collectList = (pdfs: StoredPdf[]): Promise<PdfMeta[]> =>
    Promise.all(pdfs.map(collect));
  const meta: Exam = {
    ...exam,
    answerPdfs: await collectList(exam.answerPdfs),
    booklets: await Promise.all(
      exam.booklets.map(async (booklet) => ({
        ...booklet,
        pdfs: await collectList(booklet.pdfs),
      })),
    ),
  };
  return { exam: meta, pdfs: bytes };
}

export async function nativeReady(): Promise<boolean> {
  return invoke<boolean>('store_ready');
}

export async function nativeMarkReady(): Promise<void> {
  await invoke('store_mark_ready');
}

export async function nativeLoad(): Promise<NativeSnapshot> {
  const snapshot = await invoke<NativeSnapshot>('store_load');
  return {
    ...snapshot,
    exams: snapshot.exams.map((exam) => migrateExamV5ToV6(exam) as Exam),
    sessions: snapshot.sessions.map(
      (session) =>
        rescoreSubmittedSession(migrateSessionV5ToV6(session) as ExamSession),
    ),
  };
}

export async function nativeSaveExam(exam: Exam): Promise<void> {
  await invoke('store_save_exam', { payload: await examPayload(exam) });
}

export async function nativeSaveSession(session: ExamSession): Promise<void> {
  await invoke('store_save_session', { session });
}

export async function nativeSaveSettings(settings: Settings): Promise<void> {
  await invoke('store_save_settings', { settings });
}

export async function nativeDeleteExam(examId: string): Promise<void> {
  await invoke('store_delete_exam', { examId });
}

export async function nativeDeleteSession(sessionId: string): Promise<void> {
  await invoke('store_delete_session', { sessionId });
}

export async function nativeClear(): Promise<void> {
  await invoke('store_clear');
}

export async function nativeReplaceAll(payload: NativeReplacePayload): Promise<void> {
  await invoke('store_replace_all', {
    payload: {
      exams: await Promise.all(payload.exams.map(examPayload)),
      sessions: payload.sessions,
      settings: payload.settings,
    },
  });
}

export async function nativeLoadPdfBlob(pdfId: string): Promise<Blob> {
  const data = await invoke<string>('store_load_pdf', { pdfId });
  return new Blob([base64ToBytes(data)], { type: 'application/pdf' });
}

export async function nativeSaveDownload(fileName: string, dataBase64: string): Promise<string> {
  return invoke<string>('save_bytes_to_downloads', { fileName, dataBase64 });
}
