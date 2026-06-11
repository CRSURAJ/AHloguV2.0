import type { Job, LogItem } from "@/types/work";

import { getCloudProvider } from "./client";
import {
  getPendingSyncQueue,
  markSyncQueueItemFailed,
  markSyncQueueItemSyncing,
  removeSyncQueueItem,
  type SyncQueueItem,
} from "./syncQueue";
import type { CloudSyncResult } from "./types";

export type ProcessSyncQueueResult = {
  processed: number;
  synced: number;
  failed: number;
  skipped: number;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown sync error";
}

function isJobPayload(payload: unknown): payload is Job {
  return isRecord(payload) && typeof payload.id === "string" && typeof payload.jobId === "string";
}

function isJobDeletePayload(payload: unknown): payload is { jobId: string } {
  return isRecord(payload) && typeof payload.jobId === "string";
}

function isWorkLogPayload(payload: unknown): payload is LogItem {
  return (
    isRecord(payload) &&
    typeof payload.jobId === "string" &&
    typeof payload.description === "string"
  );
}

async function processSyncQueueItem(item: SyncQueueItem): Promise<CloudSyncResult> {
  const cloud = getCloudProvider();

  switch (item.action) {
    case "job.create": {
      if (!isJobPayload(item.payload)) {
        return {
          ok: false,
          message: "Invalid job.create payload.",
        };
      }

      return cloud.jobs.create(item.payload);
    }

    case "job.update": {
      if (!isJobPayload(item.payload)) {
        return {
          ok: false,
          message: "Invalid job.update payload.",
        };
      }

      return cloud.jobs.update(item.payload);
    }

    case "job.delete": {
      if (!isJobDeletePayload(item.payload)) {
        return {
          ok: false,
          message: "Invalid job.delete payload.",
        };
      }

      return cloud.jobs.delete(item.payload.jobId);
    }

    case "workLog.upload": {
      if (!isWorkLogPayload(item.payload)) {
        return {
          ok: false,
          message: "Invalid workLog.upload payload.",
        };
      }

      return cloud.workLogs.upload(item.payload);
    }

    default: {
      return {
        ok: false,
        message: "Unsupported sync queue action.",
      };
    }
  }
}

export async function processCloudSyncQueue(limit = 25) {
  const pendingItems = getPendingSyncQueue().slice(0, limit);

  const result: ProcessSyncQueueResult = {
    processed: 0,
    synced: 0,
    failed: 0,
    skipped: 0,
    message: "No pending sync items.",
  };

  if (pendingItems.length === 0) {
    return result;
  }

  for (const item of pendingItems) {
    result.processed += 1;
    markSyncQueueItemSyncing(item.id);

    try {
      const syncResult = await processSyncQueueItem(item);

      if (syncResult.ok) {
        removeSyncQueueItem(item.id);
        result.synced += 1;
      } else {
        markSyncQueueItemFailed(item.id, syncResult.message ?? "Cloud sync failed.");
        result.failed += 1;
      }
    } catch (error) {
      markSyncQueueItemFailed(item.id, getErrorMessage(error));
      result.failed += 1;
    }
  }

  result.message = `Processed ${result.processed} sync item(s). Synced ${result.synced}. Failed ${result.failed}.`;

  return result;
}
