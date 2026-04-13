"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  clearDraft,
  clearLogs,
  clearSession,
  loadDraft,
  loadLogs,
  loadSession,
  saveDraft,
  saveLogs,
  saveSession,
} from "@/lib/workStorage";
import { getWorkingStatusText, minutesBetween } from "@/lib/workUtils";
import type {
  ActiveSession,
  CurrentUser,
  DraftState,
  LogItem,
  SyncStatus,
} from "@/types/work";

const TB_URL = process.env.NEXT_PUBLIC_PROJECT_LOGU_SYNC_URL ?? "";

export type WorkLoggerState = {
  currentUserFullName: string;
  jobId: string;
  setJobId: Dispatch<SetStateAction<string>>;
  location: string;
  setLocation: Dispatch<SetStateAction<string>>;
  role: string;
  setRole: Dispatch<SetStateAction<string>>;
  jobDocs: string;
  setJobDocs: Dispatch<SetStateAction<string>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  isWorking: boolean;
  isOnBreak: boolean;
  breakMinutes: number;
  bannerMessage: string;
  logs: LogItem[];
  expandedLogId: string | null;
  canStart: boolean;
  canBreak: boolean;
  canStop: boolean;
  canClearAll: boolean;
  unsyncedCount: number;
  syncedCount: number;
  failedCount: number;
  workingStatusText: string;
  handleStart: () => void;
  handleBreak: () => void;
  handleStop: () => void;
  handleSync: () => Promise<void>;
  handleClearAll: () => void;
  handleDeleteLog: (id: string) => void;
  toggleExpandedLog: (id: string) => void;
  getSyncBadgeClass: (status: SyncStatus) => string;
};

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useWorkLogger(currentUser: CurrentUser): WorkLoggerState {
  const [jobId, setJobId] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState<string>(currentUser.role);
  const [jobDocs, setJobDocs] = useState("");
  const [description, setDescription] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [breakStartTime, setBreakStartTime] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [bannerMessage, setBannerMessage] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const [loadedLogs, activeSession, draft] = await Promise.all([
        loadLogs(currentUser.id),
        loadSession(currentUser.id),
        loadDraft(currentUser.id),
      ]);

      if (cancelled) return;

      setLogs(loadedLogs);

      if (activeSession?.isWorking) {
        setJobId(activeSession.jobId);
        setLocation(activeSession.location);
        setRole(activeSession.role || currentUser.role);
        setJobDocs(activeSession.jobDocs);
        setDescription(activeSession.description);
        setIsWorking(true);
        setIsOnBreak(activeSession.isOnBreak);
        setStartTime(activeSession.startTime);
        setBreakStartTime(activeSession.breakStartTime);
        setBreakMinutes(activeSession.breakMinutes);
        setBannerMessage("Restored your active session from this device.");
      } else if (draft) {
        setJobId(draft.jobId);
        setLocation(draft.location);
        setRole(draft.role || currentUser.role);
        setJobDocs(draft.jobDocs);
        setDescription(draft.description);
      } else {
        setRole(currentUser.role);
      }

      setIsHydrated(true);
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveLogs(currentUser.id, logs);
  }, [currentUser.id, isHydrated, logs]);

  useEffect(() => {
    if (!isHydrated) return;

    if (isWorking) {
      const session: ActiveSession = {
        isWorking,
        isOnBreak,
        startTime,
        breakStartTime,
        breakMinutes,
        jobId,
        location,
        role,
        jobDocs,
        description,
      };

      void saveSession(currentUser.id, session);
      return;
    }

    void clearSession(currentUser.id);
  }, [
    breakMinutes,
    breakStartTime,
    currentUser.id,
    description,
    isHydrated,
    isOnBreak,
    isWorking,
    jobDocs,
    jobId,
    location,
    role,
    startTime,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    if (isWorking) return;

    const draft: DraftState = {
      jobId,
      location,
      role,
      jobDocs,
      description,
    };

    const hasMeaningfulDraft =
      draft.jobId.trim() !== "" ||
      draft.location.trim() !== "" ||
      draft.role.trim() !== "" ||
      draft.jobDocs.trim() !== "" ||
      draft.description.trim() !== "";

    if (hasMeaningfulDraft) {
      void saveDraft(currentUser.id, draft);
    } else {
      void clearDraft(currentUser.id);
    }
  }, [
    currentUser.id,
    description,
    isHydrated,
    isWorking,
    jobDocs,
    jobId,
    location,
    role,
  ]);

  const canStart =
    !isWorking &&
    jobId.trim() !== "" &&
    role.trim() !== "" &&
    location.trim() !== "";

  const canBreak = isWorking;
  const canStop = isWorking && !isOnBreak && description.trim() !== "";

  const unsyncedCount = useMemo(
    () => logs.filter((item) => item.syncStatus !== "synced").length,
    [logs]
  );

  const syncedCount = useMemo(
    () => logs.filter((item) => item.syncStatus === "synced").length,
    [logs]
  );

  const failedCount = useMemo(
    () => logs.filter((item) => item.syncStatus === "failed").length,
    [logs]
  );

  const canClearAll =
    logs.length > 0 && logs.every((item) => item.syncStatus === "synced");

  const workingStatusText = getWorkingStatusText(isWorking, isOnBreak);

  function validateBeforeStart(): string {
    if (jobId.trim() === "") return "Job ID is required.";
    if (role.trim() === "") return "Role is required.";
    if (location.trim() === "") return "Location is required.";
    return "";
  }

  function resetEntryFields() {
    setJobId("");
    setLocation("");
    setRole(currentUser.role);
    setJobDocs("");
    setDescription("");
    void clearDraft(currentUser.id);
  }

  function handleStart() {
    const validationError = validateBeforeStart();

    if (validationError) {
      setBannerMessage(validationError);
      return;
    }

    const now = new Date().toISOString();

    setDescription("");
    setIsWorking(true);
    setIsOnBreak(false);
    setStartTime(now);
    setBreakStartTime(null);
    setBreakMinutes(0);
    setBannerMessage("Work started. Add description before finishing.");
  }

  function handleBreak() {
    if (!isWorking) return;

    const now = new Date().toISOString();

    if (!isOnBreak) {
      setIsOnBreak(true);
      setBreakStartTime(now);
      setBannerMessage("Break started. Resume work before finishing the log.");
      return;
    }

    if (breakStartTime) {
      const mins = minutesBetween(breakStartTime, now);
      setBreakMinutes((prev) => prev + mins);
    }

    setIsOnBreak(false);
    setBreakStartTime(null);
    setBannerMessage("Break ended. Add description, then finish the log.");
  }

  function handleStop() {
    if (!isWorking || !startTime) return;

    if (isOnBreak) {
      setBannerMessage("Resume work before finishing the log.");
      return;
    }

    if (description.trim() === "") {
      setBannerMessage("Description is required before finishing.");
      return;
    }

    const stopTime = new Date().toISOString();
    const totalMinutes = minutesBetween(startTime, stopTime);
    const workedMinutes = Math.max(0, totalMinutes - breakMinutes);

    const logItem: LogItem = {
      id: makeUuid(),
      loguId: makeUuid(),
      ts: new Date(stopTime).getTime(),
      fullname: currentUser.fullName,
      jobId,
      location,
      role,
      jobDocs,
      description,
      startedAt: startTime,
      stoppedAt: stopTime,
      breakMinutes,
      workedMinutes,
      syncStatus: "pending",
      syncMessage: "Waiting to sync",
    };

    setLogs((prev) => [logItem, ...prev]);
    setIsWorking(false);
    setIsOnBreak(false);
    setStartTime(null);
    setBreakStartTime(null);
    setBreakMinutes(0);
    resetEntryFields();
    void clearSession(currentUser.id);
    setBannerMessage("Work finished. Log saved as pending.");
  }

  async function syncOneItem(item: LogItem): Promise<number> {
    if (!TB_URL) {
      throw new Error("Sync URL is not configured.");
    }

    setLogs((prev) =>
      prev.map((log) =>
        log.id === item.id
          ? {
              ...log,
              syncStatus: "syncing",
              syncMessage: "Syncing...",
            }
          : log
      )
    );

    const payload = {
      loguId: item.loguId,
      fullname: item.fullname,
      jobId: item.jobId,
      location: item.location,
      role: item.role,
      description: item.description,
      startedAt: item.startedAt,
      stoppedAt: item.stoppedAt,
      breakMinutes: item.breakMinutes,
      workedMinutes: item.workedMinutes,
    };

    const res = await fetch(TB_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Sync failed with status ${res.status}`);
    }

    return Date.now();
  }

  async function handleSync(): Promise<void> {
    const itemsToSync = logs.filter(
      (item) => item.syncStatus === "pending" || item.syncStatus === "failed"
    );

    if (itemsToSync.length === 0) {
      setBannerMessage("Nothing to sync.");
      return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const item of itemsToSync) {
      try {
        const syncedAt = await syncOneItem(item);

        setLogs((prev) =>
          prev.map((log) =>
            log.id === item.id
              ? {
                  ...log,
                  syncedAt,
                  syncStatus: "synced",
                  syncMessage: "Synced successfully",
                }
              : log
          )
        );

        successCount += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown sync error";

        setLogs((prev) =>
          prev.map((log) =>
            log.id === item.id
              ? {
                  ...log,
                  syncStatus: "failed",
                  syncMessage: message,
                }
              : log
          )
        );

        failCount += 1;
      }
    }

    if (failCount === 0) {
      setBannerMessage(`${successCount} log(s) synced successfully.`);
    } else {
      setBannerMessage(`${successCount} synced, ${failCount} failed. Retry failed logs.`);
    }
  }

  function handleClearAll() {
    if (!canClearAll) {
      setBannerMessage("Clear All is available only when every log is synced.");
      return;
    }

    const confirmed = window.confirm("Clear all saved logs?");
    if (!confirmed) return;

    setLogs([]);
    setExpandedLogId(null);
    void clearLogs(currentUser.id);
    setBannerMessage("All saved logs cleared.");
  }

  function toggleExpandedLog(id: string) {
    setExpandedLogId((prev) => (prev === id ? null : id));
  }

  function handleDeleteLog(id: string) {
    setLogs((prev) => prev.filter((log) => log.id !== id));
    setExpandedLogId((prev) => (prev === id ? null : prev));
  }

  function getSyncBadgeClass(status: SyncStatus) {
    switch (status) {
      case "pending":
        return "badgePending";
      case "syncing":
        return "badgeSyncing";
      case "synced":
        return "badgeSynced";
      case "failed":
      default:
        return "badgeFailed";
    }
  }

  return {
    currentUserFullName: currentUser.fullName,
    jobId,
    setJobId,
    location,
    setLocation,
    role,
    setRole,
    jobDocs,
    setJobDocs,
    description,
    setDescription,
    isWorking,
    isOnBreak,
    breakMinutes,
    bannerMessage,
    logs,
    expandedLogId,
    canStart,
    canBreak,
    canStop,
    canClearAll,
    unsyncedCount,
    syncedCount,
    failedCount,
    workingStatusText,
    handleStart,
    handleBreak,
    handleStop,
    handleSync,
    handleClearAll,
    handleDeleteLog,
    toggleExpandedLog,
    getSyncBadgeClass,
  };
}
