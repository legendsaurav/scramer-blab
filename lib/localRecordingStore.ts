// Minimal IndexedDB-backed local recording store for fallback
// Stores completed recording blobs keyed by project + tool + date

export type LocalRecordingEntry = {
  id: string;
  projectId: string;
  tool: string;
  date: string; // YYYY-MM-DD
  filename: string;
  blob: Blob;
};

const DB_NAME = 'recordings-db';
const STORE_NAME = 'recordings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        const store = req.transaction?.objectStore(STORE_NAME);
        if (store) {
          store.createIndex('by_project', 'projectId', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocalRecording(entry: LocalRecordingEntry): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listLocalRecordings(projectId: string): Promise<LocalRecordingEntry[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index('by_project');
    const req = idx.getAll(projectId);
    req.onsuccess = () => resolve((req.result || []) as LocalRecordingEntry[]);
    req.onerror = () => reject(req.error);
  });
}

export async function toMergedSessions(projectId: string): Promise<{ tool: string; date: string; paths: Record<string, string> }[]> {
  const entries = await listLocalRecordings(projectId);
  const grouped = new Map<string, { tool: string; date: string; paths: Record<string, string> }>();
  for (const e of entries) {
    const key = `${e.tool}:${e.date}:${e.filename}`;
    const url = URL.createObjectURL(e.blob);
    grouped.set(key, { tool: e.tool, date: e.date, paths: { '1x': url } });
  }
  return Array.from(grouped.values());
}
