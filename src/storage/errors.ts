export type StorageErrorCode = 'storage' | 'pdfImmutable';

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(message: string, options?: { cause?: unknown; code?: StorageErrorCode }) {
    super(message, options);
    this.name = 'StorageError';
    this.code = options?.code ?? 'storage';
  }
}
