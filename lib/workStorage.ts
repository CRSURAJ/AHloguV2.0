import type { LogItem, SyncStatus } from "@/types/work";

const STORAGE_KEY = "project_logu_logs";

function safeStatus(value: unknown): SyncStatus {
  if (
    value === "pending" ||
    value === "syncing" ||
    value === "synced" ||
    value === "failed"
  ) {
    return value;
  }

  return "pending";
}

function normalizeLog(item: Partial<LogItem>, index: number): LogItem {
  return {
    id: typeof item.id === "number" ? item.id : Date.now() + index,
    ts: typeof item.ts === "number" ? item.ts : Date.now(),
    fullname: typeof item.fullname === "string" ? item.fullname : "",
    jobId: typeof item.jobId === "string" ? item.jobId : "",
    location: typeof item.location === "string" ? item.location : "",
    role: typeof item.role === "string" ? item.role : "",
    description: typeof item.description === "string" ? item.description : "",
    startedAt: typeof item.startedAt === "string" ? item.startedAt : "",
    stoppedAt: typeof item.stoppedAt === "string" ? item.stoppedAt : "",
    breakMinutes:
      typeof item.breakMinutes === "number" ? item.breakMinutes : 0,
    workedMinutes:
      typeof item.workedMinutes === "number" ? item.workedMinutes : 0,
    syncStatus: safeStatus(item.syncStatus),
    syncMessage:
      typeof item.syncMessage === "string"
        ? item.syncMessage
        : "Waiting to sync",
  };
}

export function loadLogs(): LogItem[] {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as Partial<LogItem>[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLog);
  } catch {
    return [];
  }
}

export function saveLogs(logs: LogItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
}

export function clearLogs(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
