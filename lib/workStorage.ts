import {
  clearDraftForUser,
  clearLogsForUser,
  clearSessionForUser,
  isIndexedDbAvailable,
  readDraft,
  readLogs,
  readSession,
  writeDraft,
  writeLogs,
  writeSession,
} from "@/lib/offlineDb";
import type { ActiveSession, DraftState, LogItem, SyncStatus } from "@/types/work";

const LEGACY_LOGS_KEY = "project_logu_logs";

function getStorageKeys(userId: string) {
  return {
    logs: `project_logu:${userId}:logs`,
    session: `project_logu:${userId}:session`,
    draft: `project_logu:${userId}:draft`,
  };
}

function safeStatus(value: unknown): SyncStatus {
  if (value === "pending" || value === "syncing" || value === "synced" || value === "failed") {
    return value;
  }

  return "pending";
}

function makeFallbackId(index: number): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `log-${Date.now()}-${index}`;
}

function normalizeLog(item: Partial<LogItem>, index: number): LogItem {
  return {
    id:
      typeof item.id === "string"
        ? item.id
        : typeof item.id === "number"
          ? String(item.id)
          : makeFallbackId(index),
    loguId:
      typeof item.loguId === "string" && item.loguId.trim() !== ""
        ? item.loguId
        : makeFallbackId(index + 1000),
    ts: typeof item.ts === "number" ? item.ts : Date.now(),
    syncedAt: typeof item.syncedAt === "number" ? item.syncedAt : undefined,
    fullname: typeof item.fullname === "string" ? item.fullname : "",
    jobId: typeof item.jobId === "string" ? item.jobId : "",
    location: typeof item.location === "string" ? item.location : "",
    role: typeof item.role === "string" ? item.role : "",
    jobDocs: typeof item.jobDocs === "string" ? item.jobDocs : "",
    description: typeof item.description === "string" ? item.description : "",
    startedAt: typeof item.startedAt === "string" ? item.startedAt : "",
    stoppedAt: typeof item.stoppedAt === "string" ? item.stoppedAt : "",
    breakMinutes: typeof item.breakMinutes === "number" ? item.breakMinutes : 0,
    workedMinutes: typeof item.workedMinutes === "number" ? item.workedMinutes : 0,
    syncStatus: safeStatus(item.syncStatus),
    syncMessage: typeof item.syncMessage === "string" ? item.syncMessage : "Waiting to sync",
  };
}

function normalizeSession(item: Partial<ActiveSession>): ActiveSession {
  return {
    isWorking: item.isWorking === true,
    isOnBreak: item.isOnBreak === true,
    startTime: typeof item.startTime === "string" ? item.startTime : null,
    breakStartTime: typeof item.breakStartTime === "string" ? item.breakStartTime : null,
    breakMinutes: typeof item.breakMinutes === "number" ? item.breakMinutes : 0,
    jobId: typeof item.jobId === "string" ? item.jobId : "",
    location: typeof item.location === "string" ? item.location : "",
    role: typeof item.role === "string" ? item.role : "",
    jobDocs: typeof item.jobDocs === "string" ? item.jobDocs : "",
    description: typeof item.description === "string" ? item.description : "",
  };
}

function normalizeDraft(item: Partial<DraftState>): DraftState {
  return {
    jobId: typeof item.jobId === "string" ? item.jobId : "",
    location: typeof item.location === "string" ? item.location : "",
    role: typeof item.role === "string" ? item.role : "",
    jobDocs: typeof item.jobDocs === "string" ? item.jobDocs : "",
    description: typeof item.description === "string" ? item.description : "",
  };
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadLogsFromLocalStorage(userId: string): LogItem[] {
  if (typeof window === "undefined") return [];

  const keys = getStorageKeys(userId);
  const raw = window.localStorage.getItem(keys.logs);

  if (raw) {
    const parsed = parseJson<Partial<LogItem>[]>(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLog);
  }

  const legacyRaw = window.localStorage.getItem(LEGACY_LOGS_KEY);
  const legacyParsed = parseJson<Partial<LogItem>[]>(legacyRaw);

  if (!Array.isArray(legacyParsed)) return [];
  return legacyParsed.map(normalizeLog);
}

function loadSessionFromLocalStorage(userId: string): ActiveSession | null {
  if (typeof window === "undefined") return null;

  const keys = getStorageKeys(userId);
  const raw = window.localStorage.getItem(keys.session);
  const parsed = parseJson<Partial<ActiveSession>>(raw);

  return parsed ? normalizeSession(parsed) : null;
}

function loadDraftFromLocalStorage(userId: string): DraftState | null {
  if (typeof window === "undefined") return null;

  const keys = getStorageKeys(userId);
  const raw = window.localStorage.getItem(keys.draft);
  const parsed = parseJson<Partial<DraftState>>(raw);

  return parsed ? normalizeDraft(parsed) : null;
}

function clearLocalCopies(userId: string): void {
  if (typeof window === "undefined") return;

  const keys = getStorageKeys(userId);
  window.localStorage.removeItem(keys.logs);
  window.localStorage.removeItem(keys.session);
  window.localStorage.removeItem(keys.draft);
  window.localStorage.removeItem(LEGACY_LOGS_KEY);
}

export async function loadLogs(userId: string): Promise<LogItem[]> {
  if (typeof window === "undefined") return [];

  if (!isIndexedDbAvailable()) {
    return loadLogsFromLocalStorage(userId);
  }

  try {
    const existing = await readLogs(userId);
    if (existing.length > 0) {
      return existing;
    }

    const migrated = loadLogsFromLocalStorage(userId);
    if (migrated.length > 0) {
      await writeLogs(userId, migrated);
      clearLocalCopies(userId);
      return migrated;
    }

    return [];
  } catch {
    return loadLogsFromLocalStorage(userId);
  }
}

export async function saveLogs(userId: string, logs: LogItem[]): Promise<void> {
  if (typeof window === "undefined") return;

  if (!isIndexedDbAvailable()) {
    const keys = getStorageKeys(userId);
    window.localStorage.setItem(keys.logs, JSON.stringify(logs));
    return;
  }

  try {
    await writeLogs(userId, logs);
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.logs);
    window.localStorage.removeItem(LEGACY_LOGS_KEY);
  } catch {
    const keys = getStorageKeys(userId);
    window.localStorage.setItem(keys.logs, JSON.stringify(logs));
  }
}

export async function clearLogs(userId: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (!isIndexedDbAvailable()) {
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.logs);
    return;
  }

  try {
    await clearLogsForUser(userId);
  } finally {
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.logs);
    window.localStorage.removeItem(LEGACY_LOGS_KEY);
  }
}

export async function loadSession(userId: string): Promise<ActiveSession | null> {
  if (typeof window === "undefined") return null;

  if (!isIndexedDbAvailable()) {
    return loadSessionFromLocalStorage(userId);
  }

  try {
    const existing = await readSession(userId);
    if (existing) {
      return existing;
    }

    const migrated = loadSessionFromLocalStorage(userId);
    if (migrated) {
      await writeSession(userId, migrated);
      const keys = getStorageKeys(userId);
      window.localStorage.removeItem(keys.session);
      return migrated;
    }

    return null;
  } catch {
    return loadSessionFromLocalStorage(userId);
  }
}

export async function saveSession(userId: string, session: ActiveSession): Promise<void> {
  if (typeof window === "undefined") return;

  if (!isIndexedDbAvailable()) {
    const keys = getStorageKeys(userId);
    window.localStorage.setItem(keys.session, JSON.stringify(session));
    return;
  }

  try {
    await writeSession(userId, session);
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.session);
  } catch {
    const keys = getStorageKeys(userId);
    window.localStorage.setItem(keys.session, JSON.stringify(session));
  }
}

export async function clearSession(userId: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (!isIndexedDbAvailable()) {
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.session);
    return;
  }

  try {
    await clearSessionForUser(userId);
  } finally {
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.session);
  }
}

export async function loadDraft(userId: string): Promise<DraftState | null> {
  if (typeof window === "undefined") return null;

  if (!isIndexedDbAvailable()) {
    return loadDraftFromLocalStorage(userId);
  }

  try {
    const existing = await readDraft(userId);
    if (existing) {
      return existing;
    }

    const migrated = loadDraftFromLocalStorage(userId);
    if (migrated) {
      await writeDraft(userId, migrated);
      const keys = getStorageKeys(userId);
      window.localStorage.removeItem(keys.draft);
      return migrated;
    }

    return null;
  } catch {
    return loadDraftFromLocalStorage(userId);
  }
}

export async function saveDraft(userId: string, draft: DraftState): Promise<void> {
  if (typeof window === "undefined") return;

  if (!isIndexedDbAvailable()) {
    const keys = getStorageKeys(userId);
    window.localStorage.setItem(keys.draft, JSON.stringify(draft));
    return;
  }

  try {
    await writeDraft(userId, draft);
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.draft);
  } catch {
    const keys = getStorageKeys(userId);
    window.localStorage.setItem(keys.draft, JSON.stringify(draft));
  }
}

export async function clearDraft(userId: string): Promise<void> {
  if (typeof window === "undefined") return;

  if (!isIndexedDbAvailable()) {
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.draft);
    return;
  }

  try {
    await clearDraftForUser(userId);
  } finally {
    const keys = getStorageKeys(userId);
    window.localStorage.removeItem(keys.draft);
  }
}
