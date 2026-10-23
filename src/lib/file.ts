import type { StoredPdf } from '@/types';

export const KEY_FILE_MAX_BYTES = 1024 * 1024;
export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PDFS_PER_GROUP = 20;
export const PDF_MIME = 'application/pdf';

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

/** Reads a user-selected text file locally; nothing leaves the device. */
export async function readTextFile(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new FileReadError('tooLarge');
  try {
    return await file.text();
  } catch {
    throw new FileReadError('read');
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new FileReadError('read'));
    };
    reader.onerror = () => reject(new FileReadError('read'));
    reader.onabort = () => reject(new FileReadError('read'));
    reader.readAsDataURL(file);
  });
}

/**
 * Keeps the PDF bytes locally so the booklet can be downloaded again later.
 * The app never parses, renders, or uploads the document.
 */
export async function readPdfFile(file: File): Promise<StoredPdf> {
  if (file.size > PDF_MAX_BYTES) throw new FileReadError('tooLarge');
  const looksLikePdf =
    file.type === PDF_MIME || file.name.toLocaleLowerCase().endsWith('.pdf');
  if (!looksLikePdf || file.size === 0) throw new FileReadError('notPdf');
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new FileReadError('read');
  const name = file.name || 'document.pdf';
  return {
    title: defaultPdfTitle(name),
    name,
    type: PDF_MIME,
    size: file.size,
    data: `data:${PDF_MIME};base64,${dataUrl.slice(comma + 1)}`,
  };
}

/** Triggers a local download of a stored PDF. Returns false if the data is unusable. */
export function downloadPdf(pdf: StoredPdf): boolean {
  try {
    const comma = pdf.data.indexOf(',');
    if (comma < 0) return false;
    const binary = atob(pdf.data.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: PDF_MIME }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = pdf.name || 'document.pdf';
    anchor.rel = 'noopener';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}
