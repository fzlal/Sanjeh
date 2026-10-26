/**
 * Asks the browser to keep IndexedDB data persistently, so stored PDF Blobs
 * are not evicted the way cache entries can be. Failure is harmless: the app
 * still works with best-effort browser storage.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
