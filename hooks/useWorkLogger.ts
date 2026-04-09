"use client";

import { useEffect, useMemo, useState } from "react";
import { clearLogs, loadLogs, saveLogs } from "@/lib/workStorage";
import { getWorkingStatusText, minutesBetween } from "@/lib/workUtils";
import type { LogItem, SyncStatus } from "@/types/work";

const TB_URL = process.env.NEXT_PUBLIC_PROJECT_LOGU_SYNC_URL ?? "";

export const FULL_NAME_OPTIONS = ["", "Suraj", "Name 2", "Name 3"];

export type WorkLoggerState = {
  fullname: string;
  setFullname: React.Dispatch<React.SetStateAction<string>>;
  jobId: string;
  setJobId: React.Dispatch<React.SetStateAction<string>>;
  location: string;
  setLocation: React.Dispatch<React.SetStateAction<string>>;
  role: string;
  setRole: React.Dispatch<React.SetStateAction<string>>;
  description: string;
  setDescription: React.Dispatch<React.SetStateAction<string>>;

  isWorking: boolean;
  isOnBreak: boolean;
  breakMinutes: number;
  bannerMessage: string;

  logs: LogItem[];
  expandedLogId: number | null;

  canStart: boolean;
  canBreak: boolean;
  canStop: boolean;
  canClearAll: boolean;

  unsyncedCount: number;
  syncedCount: number;
  failedCount: number;

  workingStatusText: string;
  fullNameOptions: string[];

  handleStart: () => void;
  handleBreak: () => void;
  handleStop: () => void;
  handleSync: () => Promise<void>;
  handleClearAll: () => void;
  toggleExpandedLog: (id: number) => void;
  getSyncBadgeClass: (status: SyncStatus) => string;
};

export function useWorkLogger(): WorkLoggerState {
  const [fullname, setFullname] = useState("");
  const [jobId, setJobId] = useState("");
  const [location, setLocation] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");

  const [isWorking, setIsWorking] = useState(false);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [startTime, setStartTime] = useState<string | null>(null);
  const [breakStartTime, setBreakStartTime] = useState<string | null>(null);
  const [breakMinutes, setBreakMinutes] = useState(0);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [bannerMessage, setBannerMessage] = useState("");
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setLogs(loadLogs());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    saveLogs(logs);
  }, [logs, isHydrated]);

  const canStart =
    !isWorking &&
    fullname.trim() !== "" &&
    jobId.trim() !== "" &&
    role.trim() !== "" &&
    location.trim() !== "";

  const canBreak = isWorking;
  const canStop = isWorking && description.trim() !== "";

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
    if (fullname.trim() === "") return "Full name is required.";
    if (jobId.trim() === "") return "Job ID is required.";
    if (role.trim() === "") return "Role is required.";
    if (location.trim() === "") return "Location is required.";
    return "";
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
    setBannerMessage("Work started. Complete description before stopping.");
  }

  function handleBreak() {
    if (!isWorking) return;

    const now = new Date().toISOString();

    if (!isOnBreak) {
      setIsOnBreak(true);
      setBreakStartTime(now);
      setBannerMessage("Break started.");
      return;
    }

    if (breakStartTime) {
      const mins = minutesBetween(breakStartTime, now);
      setBreakMinutes((prev) => prev + mins);
    }

    setIsOnBreak(false);
    setBreakStartTime(null);
    setBannerMessage("Break ended.");
  }

  function handleStop() {
    if (!isWorking || !startTime) return;

    if (description.trim() === "") {
      setBannerMessage("Description is required before stopping.");
      return;
    }

    const stopTime = new Date().toISOString();

    let finalBreakMinutes = breakMinutes;

    if (isOnBreak && breakStartTime) {
      finalBreakMinutes += minutesBetween(breakStartTime, stopTime);
    }

    const totalMinutes = minutesBetween(startTime, stopTime);
    const workedMinutes = Math.max(0, totalMinutes - finalBreakMinutes);

    const logItem: LogItem = {
      id: Date.now(),
      ts: new Date(stopTime).getTime(),
      fullname,
      jobId,
      location,
      role,
      description,
      startedAt: startTime,
      stoppedAt: stopTime,
      breakMinutes: finalBreakMinutes,
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
    setDescription("");
    setBannerMessage("Work stopped. Log saved as pending.");
  }

  async function syncOneItem(item: LogItem) {
    if (!TB_URL) {
      throw new Error("Sync URL is not configured.");
    }

    setLogs((prev) =>
      prev.map((log) =>
        log.id === item.id
          ? { ...log, syncStatus: "syncing", syncMessage: "Syncing..." }
          : log
      )
    );

    const payload = {
      ts: item.ts,
      values: {
        fullname: item.fullname,
        jobId: item.jobId,
        location: item.location,
        role: item.role,
        description: item.description,
        startedAt: item.startedAt,
        stoppedAt: item.stoppedAt,
        breakMinutes: item.breakMinutes,
        workedMinutes: item.workedMinutes,
      },
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
  }

  async function handleSync() {
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
        await syncOneItem(item);

        setLogs((prev) =>
          prev.map((log) =>
            log.id === item.id
              ? {
                  ...log,
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
    clearLogs();
    setBannerMessage("All saved logs cleared.");
  }

  function toggleExpandedLog(id: number) {
    setExpandedLogId((prev) => (prev === id ? null : id));
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
    fullname,
    setFullname,
    jobId,
    setJobId,
    location,
    setLocation,
    role,
    setRole,
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
    fullNameOptions: FULL_NAME_OPTIONS,

    handleStart,
    handleBreak,
    handleStop,
    handleSync,
    handleClearAll,
    toggleExpandedLog,
    getSyncBadgeClass,
  };
}
