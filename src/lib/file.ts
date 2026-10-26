import type { StoredPdf } from '@/types';
import { createId } from './id';

export const KEY_FILE_MAX_BYTES = 1024 * 1024;
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PDFS_PER_GROUP = 20;
export const PDF_MIME = 'application/pdf';
export const PDF_DATA_PREFIX = `data:${PDF_MIME};base64,`;

const BASE64_CHUNK = 0x8000;

/** Defaults a file's title to its name without the .pdf extension. */
export function defaultPdfTitle(name: string): string {
  const base = name.replace(/\.pdf$/i, '').trim();
  return base || name.trim() || 'PDF';
}

export class FileReadError extends Error {
  readonly code: 'tooLarge' | 'read' | 'notPdf';

  constructor(code: 'tooLarge' | 'read' | 'notPdf') {
    super(code);
    this.name = 'FileReadError';
    this.code = code;
  }
}

/** Reads a user-selected text file locally; nothing leaves the device. */export async function readTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new FileReadError('tooLarge');
  try {
    return await file.text();
  } catch {
    throw new FileReadError('read');
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/** Encodes PDF bytes for a portable JSON backup file only, never for storage. */
export async function blobToPdfDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  return `${PDF_DATA_PREFIX}${bytesToBase64(new Uint8Array(buffer))}`;
}

/** Rebuilds native PDF bytes from a portable backup data URL. */
export function pdfDataUrlToBlob(data: string): Blob {
  if (!data.startsWith(PDF_DATA_PREFIX)) throw new FileReadError('read');
  const bytes = base64ToBytes(data.slice(PDF_DATA_PREFIX.length));
  return new Blob([bytes], { type: PDF_MIME });
}

/** Returns a lowercase SHA-256 hex digest, or an empty string when unavailable. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return '';
  try {
    const digest = await subtle.digest('SHA-256', await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
  } catch {
    return '';
  }
}

/**
 * Keeps the PDF bytes locally so the booklet can be downloaded again later.
 * The bytes are retained as a Blob; the app never base64-encodes them for
 * storage, parses, renders, or uploads the document.
 */
export async function readPdfFile(file: File): Promise<StoredPdf> {
  if (file.size > PDF_MAX_BYTES) throw new FileReadError('tooLarge');
  const looksLikePdf =
    file.type === PDF_MIME || file.name.toLocaleLowerCase().endsWith('.pdf');
  if (!looksLikePdf || file.size === 0) throw new FileReadError('notPdf');
  try {
    const blob = new Blob([await file.arrayBuffer()], { type: PDF_MIME });
    const name = file.name || 'document.pdf';
    return {
      id: createId(),
      title: defaultPdfTitle(name),
      name,
      type: PDF_MIME,
      size: blob.size,
      digest: await sha256Hex(blob),
      blob,
    };
  } catch {
    throw new FileReadError('read');
  }
}
