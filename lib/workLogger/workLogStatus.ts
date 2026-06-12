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

/**
 * Reconcile logs reloaded from storage (written by another tab) with this
 * tab's in-memory state. Stored wins once a log is synced (terminal state);
 * otherwise local edits win. In-memory logs missing from storage are kept
 * only while unsynced — a missing synced log means another tab deleted it.
 */
export function mergeWorkLogs(stored: LogItem[], inMemory: LogItem[]): LogItem[] {
  const byId = new Map(stored.map((log) => [log.id, log]));

  for (const log of inMemory) {
    const storedLog = byId.get(log.id);

    if (storedLog) {
      if (storedLog.syncStatus !== "synced") {
        byId.set(log.id, log);
      }
    } else if (log.syncStatus !== "synced") {
      byId.set(log.id, log);
    }
  }

  return [...byId.values()].sort((a, b) => b.ts - a.ts);
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
