import type { StoredPdf } from '@/types';
import { bytesToBase64, PDF_MIME } from '@/lib/file';
import { isNativeRuntime, nativeLoadPdfBlob, nativeSaveDownload } from './native';

/** Reads PDF bytes from memory (web) or from the desktop file store. */
export async function pdfBlob(pdf: StoredPdf): Promise<Blob | null> {
  if (pdf.blob instanceof Blob && pdf.blob.size > 0) return pdf.blob;
  if (!isNativeRuntime()) return null;
  try {
    return await nativeLoadPdfBlob(pdf.id);
  } catch {
    return null;
  }
}

export async function saveBlobToDownloads(fileName: string, blob: Blob): Promise<boolean> {
  if (isNativeRuntime()) {
    try {
      const data = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
      await nativeSaveDownload(fileName, data);
      return true;
    } catch {
      return false;
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
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

/** Saves a stored PDF locally. Bytes are streamed from the desktop store. */
export async function downloadPdf(pdf: StoredPdf): Promise<boolean> {
  const blob = await pdfBlob(pdf);
  if (!blob) return false;
  const named = blob.type === PDF_MIME ? blob : new Blob([blob], { type: PDF_MIME });
  return saveBlobToDownloads(pdf.name || 'document.pdf', named);
}
