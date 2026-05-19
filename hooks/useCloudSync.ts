"use client";

import { useCallback, useEffect, useState } from "react";

import { checkCloudHealth } from "@/lib/cloud/health";
import {
  getSyncQueueCount,
  SYNC_QUEUE_CHANGED_EVENT,
} from "@/lib/cloud/syncQueue";
import {
  processCloudSyncQueue,
  type ProcessSyncQueueResult,
} from "@/lib/cloud/syncProcessor";

type CloudSyncState = {
  provider: string;
  isChecking: boolean;
  isSyncing: boolean;
  isOnline: boolean;
  pendingCount: number;
  lastMessage: string;
  lastSyncResult: ProcessSyncQueueResult | null;
};

export function useCloudSync() {
  const [state, setState] = useState<CloudSyncState>({
    provider: "unknown",
    isChecking: false,
    isSyncing: false,
    isOnline: false,
    pendingCount: 0,
    lastMessage: "Cloud status not checked yet.",
    lastSyncResult: null,
  });

  const refreshPendingCount = useCallback(() => {
    setState((current) => ({
      ...current,
      pendingCount: getSyncQueueCount(),
    }));
  }, []);

  const checkStatus = useCallback(async () => {
    setState((current) => ({
      ...current,
      isChecking: true,
    }));

    try {
      const result = await checkCloudHealth();

      setState((current) => ({
        ...current,
        provider: result.provider,
        isChecking: false,
        isOnline: result.ok,
        pendingCount: getSyncQueueCount(),
        lastMessage: result.message ?? "Cloud status checked.",
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cloud status check failed.";

      setState((current) => ({
        ...current,
        isChecking: false,
        isOnline: false,
        pendingCount: getSyncQueueCount(),
        lastMessage: message,
      }));
    }
  }, []);

  const syncNow = useCallback(async () => {
    setState((current) => ({
      ...current,
      isSyncing: true,
    }));

    try {
      const result = await processCloudSyncQueue();

      setState((current) => ({
        ...current,
        isSyncing: false,
        pendingCount: getSyncQueueCount(),
        lastMessage: result.message,
        lastSyncResult: result,
      }));

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cloud sync failed.";

      const failedResult: ProcessSyncQueueResult = {
        processed: 0,
        synced: 0,
        failed: 1,
        skipped: 0,
        message,
      };

      setState((current) => ({
        ...current,
        isSyncing: false,
        pendingCount: getSyncQueueCount(),
        lastMessage: message,
        lastSyncResult: failedResult,
      }));

      return failedResult;
    }
  }, []);


  useEffect(() => {
  const refresh = () => refreshPendingCount();

  window.addEventListener("storage", refresh);
  window.addEventListener("focus", refresh);
  window.addEventListener(SYNC_QUEUE_CHANGED_EVENT, refresh);

  return () => {
    window.removeEventListener("storage", refresh);
    window.removeEventListener("focus", refresh);
    window.removeEventListener(SYNC_QUEUE_CHANGED_EVENT, refresh);
  };
}, [refreshPendingCount]);

  return {
    ...state,
    checkStatus,
    syncNow,
    refreshPendingCount,
  };
}
