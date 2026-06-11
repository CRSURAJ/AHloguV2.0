import type { LogItem } from "@/types/work";

export function getSyncableWorkLogs(logs: LogItem[]): LogItem[] {
  return logs.filter((item) => item.syncStatus === "pending" || item.syncStatus === "failed");
}

export function markWorkLogSyncing(logs: LogItem[], id: string): LogItem[] {
  return logs.map((log) =>
    log.id === id
      ? {
          ...log,
          syncStatus: "syncing",
          syncMessage: "Syncing...",
        }
      : log,
  );
}

export function markWorkLogSynced(logs: LogItem[], id: string, syncedAt: number): LogItem[] {
  return logs.map((log) =>
    log.id === id
      ? {
          ...log,
          syncedAt,
          syncStatus: "synced",
          syncMessage: "Synced successfully",
        }
      : log,
  );
}

export function markWorkLogFailed(logs: LogItem[], id: string, message: string): LogItem[] {
  return logs.map((log) =>
    log.id === id
      ? {
          ...log,
          syncStatus: "failed",
          syncMessage: message,
        }
      : log,
  );
}

export function updateWorkLogStickyNote(logs: LogItem[], id: string, value: string): LogItem[] {
  return logs.map((log) => {
    if (log.id !== id) return log;

    if (log.syncStatus === "synced" || log.syncStatus === "syncing") {
      return log;
    }

    return {
      ...log,
      stickyNote: value,
    };
  });
}
