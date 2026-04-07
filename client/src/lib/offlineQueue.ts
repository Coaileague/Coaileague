/**
 * Offline Queue System - Queues requests when offline and syncs when connected
 * Uses IndexedDB for persistent storage across sessions
 */
import { secureFetch } from "@/lib/csrf";

const DB_NAME = 'CoAIleagueOffline';
const DB_VERSION = 1;
const STORE_NAME = 'pendingRequests';

interface QueuedRequest {
  id?: number;
  url: string;
  method: string;
  body: string | null;
  headers: Record<string, string>;
  timestamp: number;
  type: 'clock-in' | 'clock-out' | 'incident' | 'time-entry' | 'other';
}

let db: IDBDatabase | null = null;
let syncInProgress = false;

async function openDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };
  });
}

export async function queueRequest(
  url: string,
  method: string,
  body: any,
  type: QueuedRequest['type'] = 'other'
): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);

  const request: Omit<QueuedRequest, 'id'> = {
    url,
    method,
    body: body ? JSON.stringify(body) : null,
    headers: { 'Content-Type': 'application/json' },
    timestamp: Date.now(),
    type,
  };

  store.add(request);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getPendingCount(): Promise<number> {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const countRequest = store.count();

    return new Promise((resolve) => {
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

export async function getPendingRequests(): Promise<QueuedRequest[]> {
  try {
    const database = await openDB();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    return new Promise((resolve) => {
      getAllRequest.onsuccess = () => resolve(getAllRequest.result || []);
      getAllRequest.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function removeRequest(id: number): Promise<void> {
  const database = await openDB();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  store.delete(id);

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function syncPendingRequests(): Promise<{
  synced: number;
  failed: number;
}> {
  if (syncInProgress || !navigator.onLine) {
    return { synced: 0, failed: 0 };
  }

  syncInProgress = true;
  let synced = 0;
  let failed = 0;

  try {
    const requests = await getPendingRequests();

    for (const request of requests) {
      try {
        const response = await secureFetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });

        if (response.ok && request.id) {
          await removeRequest(request.id);
          synced++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }
  } finally {
    syncInProgress = false;
  }

  return { synced, failed };
}

export function setupOnlineSync(onSync?: (result: { synced: number; failed: number }) => void): () => void {
  const handleOnline = async () => {
    const result = await syncPendingRequests();
    onSync?.(result);
  };

  window.addEventListener('online', handleOnline);

  return () => {
    window.removeEventListener('online', handleOnline);
  };
}

export async function fetchWithOfflineFallback(
  url: string,
  method: string,
  body: any,
  type: QueuedRequest['type'] = 'other'
): Promise<{ queued: boolean; response?: Response }> {
  if (!navigator.onLine) {
    await queueRequest(url, method, body, type);
    return { queued: true };
  }

  try {
    const response = await secureFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { queued: false, response };
  } catch (error: any) {
    if (!navigator.onLine || error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError') || error?.name === 'TypeError') {
      await queueRequest(url, method, body, type);
      return { queued: true };
    }
    throw error;
  }
}

export default {
  queueRequest,
  getPendingCount,
  getPendingRequests,
  removeRequest,
  syncPendingRequests,
  setupOnlineSync,
  fetchWithOfflineFallback,
};
