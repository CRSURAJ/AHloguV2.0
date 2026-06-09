const SYNC_QUEUE_STORAGE_KEY = "ahlogu:cloud-sync-queue";
export const SYNC_QUEUE_CHANGED_EVENT = "ahlogu:cloud-sync-queue-changed";
export type SyncQueueAction =
  | "job.create"
  | "job.update"
  | "job.delete"
  | "workLog.upload";

export type SyncQueueStatus = "pending" | "syncing" | "failed";

export type SyncQueueItem = {
  id: string;
  action: SyncQueueAction;
  payload: unknown;
  status: SyncQueueStatus;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

function isBrowser() {
  return typeof window !== "undefined";
}

function createQueueId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `queue_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function readQueue(): SyncQueueItem[] {
  if (!isBrowser()) {
    return [];
  }

  const raw = window.localStorage.getItem(SYNC_QUEUE_STORAGE_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as SyncQueueItem[];
  } catch {
    return [];
  }
}

function writeQueue(queue: SyncQueueItem[]) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(SYNC_QUEUE_CHANGED_EVENT));
}

export function getSyncQueue() {
  return readQueue();
}

export function getPendingSyncQueue() {
  return readQueue().filter((item) => item.status === "pending" || item.status === "failed");
}

export function getSyncQueueCount() {
  return getPendingSyncQueue().length;
}

export function addToSyncQueue(action: SyncQueueAction, payload: unknown) {
  const now = new Date().toISOString();

  const item: SyncQueueItem = {
    id: createQueueId(),
    action,
    payload,
    status: "pending",
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const queue = readQueue();
  writeQueue([item, ...queue]);

  return item;
}

export function markSyncQueueItemSyncing(id: string) {
  const now = new Date().toISOString();

  const queue = readQueue().map((item) =>
    item.id === id
      ? {
          ...item,
          status: "syncing" as const,
          attemptCount: item.attemptCount + 1,
          updatedAt: now,
          lastError: undefined,
        }
      : item,
  );

  writeQueue(queue);
}

export function markSyncQueueItemFailed(id: string, errorMessage: string) {
  const now = new Date().toISOString();

  const queue = readQueue().map((item) =>
    item.id === id
      ? {
          ...item,
          status: "failed" as const,
          updatedAt: now,
          lastError: errorMessage,
        }
      : item,
  );

  writeQueue(queue);
}

export function removeSyncQueueItem(id: string) {
  const queue = readQueue().filter((item) => item.id !== id);
  writeQueue(queue);
}

export function clearSyncQueue() {
  writeQueue([]);
}
