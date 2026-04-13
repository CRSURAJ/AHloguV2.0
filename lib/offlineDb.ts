import type { ActiveSession, DraftState, LogItem } from "@/types/work";

const DB_NAME = "project_logu_offline";
const DB_VERSION = 1;

const LOGS_STORE = "logs";
const SESSIONS_STORE = "sessions";
const DRAFTS_STORE = "drafts";

type LogRecord = {
  id: string;
  userId: string;
  value: LogItem;
};

type SessionRecord = {
  userId: string;
  value: ActiveSession;
};

type DraftRecord = {
  userId: string;
  value: DraftState;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
  });
}

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

async function openDatabase(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) {
    throw new Error("IndexedDB is not available.");
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(LOGS_STORE)) {
        const logsStore = db.createObjectStore(LOGS_STORE, { keyPath: "id" });
        logsStore.createIndex("byUserId", "userId", { unique: false });
      }

      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: "userId" });
      }

      if (!db.objectStoreNames.contains(DRAFTS_STORE)) {
        db.createObjectStore(DRAFTS_STORE, { keyPath: "userId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open IndexedDB."));
  });

  return dbPromise;
}

export async function readLogs(userId: string): Promise<LogItem[]> {
  const db = await openDatabase();
  const tx = db.transaction(LOGS_STORE, "readonly");
  const index = tx.objectStore(LOGS_STORE).index("byUserId");
  const records = (await requestToPromise(index.getAll(userId))) as LogRecord[];
  await transactionDone(tx);

  return records
    .map((record) => record.value)
    .sort((a, b) => b.ts - a.ts);
}

export async function writeLogs(userId: string, logs: LogItem[]): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(LOGS_STORE, "readwrite");
  const store = tx.objectStore(LOGS_STORE);
  const index = store.index("byUserId");

  const existingKeys = (await requestToPromise(
    index.getAllKeys(IDBKeyRange.only(userId))
  )) as IDBValidKey[];

  existingKeys.forEach((key) => {
    store.delete(key);
  });

  logs.forEach((log) => {
    const record: LogRecord = {
      id: `${userId}::${log.id}`,
      userId,
      value: log,
    };
    store.put(record);
  });

  await transactionDone(tx);
}

export async function clearLogsForUser(userId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(LOGS_STORE, "readwrite");
  const store = tx.objectStore(LOGS_STORE);
  const index = store.index("byUserId");

  const existingKeys = (await requestToPromise(
    index.getAllKeys(IDBKeyRange.only(userId))
  )) as IDBValidKey[];

  existingKeys.forEach((key) => {
    store.delete(key);
  });

  await transactionDone(tx);
}

export async function readSession(userId: string): Promise<ActiveSession | null> {
  const db = await openDatabase();
  const tx = db.transaction(SESSIONS_STORE, "readonly");
  const record = (await requestToPromise(
    tx.objectStore(SESSIONS_STORE).get(userId)
  )) as SessionRecord | undefined;
  await transactionDone(tx);

  return record?.value ?? null;
}

export async function writeSession(
  userId: string,
  session: ActiveSession
): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(SESSIONS_STORE, "readwrite");
  const store = tx.objectStore(SESSIONS_STORE);

  const record: SessionRecord = {
    userId,
    value: session,
  };

  store.put(record);
  await transactionDone(tx);
}

export async function clearSessionForUser(userId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(SESSIONS_STORE, "readwrite");
  tx.objectStore(SESSIONS_STORE).delete(userId);
  await transactionDone(tx);
}

export async function readDraft(userId: string): Promise<DraftState | null> {
  const db = await openDatabase();
  const tx = db.transaction(DRAFTS_STORE, "readonly");
  const record = (await requestToPromise(
    tx.objectStore(DRAFTS_STORE).get(userId)
  )) as DraftRecord | undefined;
  await transactionDone(tx);

  return record?.value ?? null;
}

export async function writeDraft(userId: string, draft: DraftState): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(DRAFTS_STORE, "readwrite");
  const store = tx.objectStore(DRAFTS_STORE);

  const record: DraftRecord = {
    userId,
    value: draft,
  };

  store.put(record);
  await transactionDone(tx);
}

export async function clearDraftForUser(userId: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(DRAFTS_STORE, "readwrite");
  tx.objectStore(DRAFTS_STORE).delete(userId);
  await transactionDone(tx);
}
