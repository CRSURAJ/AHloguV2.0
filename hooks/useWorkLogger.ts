"use client";

import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { getJobsForRole, JOBS_CHANGED_EVENT } from "@/lib/jobStorage";
import { getCloudProvider } from "@/lib/cloud/client";
import { getWorkingStatusText, minutesBetween } from "@/lib/workUtils";
import { createPendingWorkLog } from "@/lib/workLogger/workLogItem";
import { uploadWorkLogToAws } from "@/lib/workLogger/workLogSync";
import {
  getSyncableWorkLogs,
  markWorkLogFailed,
  markWorkLogSynced,
  markWorkLogSyncing,
  updateWorkLogStickyNote,
} from "@/lib/workLogger/workLogStatus";
import {
  createActiveSessionSnapshot,
  createDraftSnapshot,
  hasMeaningfulDraft,
} from "@/lib/workLogger/workLoggerPersistence";
import {
  buildWorkerLiveStatusPayload,
  getWorkerLiveStatusSignature,
} from "@/lib/workLogger/workerStatusPayload";
import type { AuthActionResult, CurrentUser, Job, LogItem, SyncStatus } from "@/types/work";

export type WorkLoggerState = {
  currentUserFullName: string;
  jobId: string;
  setJobId: Dispatch<SetStateAction<string>>;
  availableJobs: Job[];
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
  canSaveAndSwitch: boolean;
  canClearAll: boolean;
  unsyncedCount: number;
  syncedCount: number;
  failedCount: number;
  workingStatusText: string;
  handleStart: () => void;
  handleBreak: () => void;
  handleStop: () => void;
  handleSaveAndSwitch: (nextJobId: string, nextLocation: string) => AuthActionResult;
  handleSync: () => Promise<void>;
  handleClearAll: () => void;
  handleDeleteLog: (id: string) => void;
  toggleExpandedLog: (id: string) => void;
  handleStickyNoteChange: (id: string, value: string) => void;
  getSyncBadgeClass: (status: SyncStatus) => string;
};

export function useWorkLogger(currentUser: CurrentUser): WorkLoggerState {
  const [jobId, setJobId] = useState("");
  const [availableJobs, setAvailableJobs] = useState<Job[]>([]);
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
  const lastWorkerStatusSignatureRef = useRef("");
  const workerStatusInFlightRef = useRef(false);
  const lastWorkerStatusSentAtRef = useRef(0);
  const lastJobsRefreshAtRef = useRef(0);
  const jobsRefreshInFlightRef = useRef(false);

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
        setBannerMessage("");
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

  const refreshAvailableJobs = useCallback(async () => {
    const now = Date.now();

    if (jobsRefreshInFlightRef.current) return;
    if (now - lastJobsRefreshAtRef.current < 5_000) return;

    jobsRefreshInFlightRef.current = true;
    lastJobsRefreshAtRef.current = now;

    try {
      const jobs = await getJobsForRole(currentUser.role);
      setAvailableJobs(jobs);
    } finally {
      jobsRefreshInFlightRef.current = false;
    }
  }, [currentUser.role]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAvailableJobs() {
      const jobs = await getJobsForRole(currentUser.role);

      if (cancelled) return;

      setAvailableJobs(jobs);
    }

    void hydrateAvailableJobs();

    return () => {
      cancelled = true;
    };
  }, [currentUser.role]);

  useEffect(() => {
    function refreshJobs(event?: Event) {
      if (event instanceof StorageEvent && event.key !== "project_logu:jobs") {
        return;
      }

      void refreshAvailableJobs();
    }

    window.addEventListener("focus", refreshJobs);
    window.addEventListener("online", refreshJobs);
    window.addEventListener("storage", refreshJobs);
    window.addEventListener(JOBS_CHANGED_EVENT, refreshJobs);

    return () => {
      window.removeEventListener("focus", refreshJobs);
      window.removeEventListener("online", refreshJobs);
      window.removeEventListener("storage", refreshJobs);
      window.removeEventListener(JOBS_CHANGED_EVENT, refreshJobs);
    };
  }, [refreshAvailableJobs]);

  useEffect(() => {
    if (!isHydrated) return;
    void saveLogs(currentUser.id, logs);
  }, [currentUser.id, isHydrated, logs]);

  useEffect(() => {
    if (!isHydrated) return;

    if (isWorking) {
      const session = createActiveSessionSnapshot({
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
      });

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

    const draft = createDraftSnapshot({
      jobId,
      location,
      role,
      jobDocs,
      description,
    });

    if (hasMeaningfulDraft(draft)) {
      void saveDraft(currentUser.id, draft);
    } else {
      void clearDraft(currentUser.id);
    }
  }, [currentUser.id, description, isHydrated, isWorking, jobDocs, jobId, location, role]);

  const canStart =
    !isWorking && jobId.trim() !== "" && role.trim() !== "" && location.trim() !== "";

  const canBreak = isWorking;
  const canStop = isWorking && !isOnBreak && description.trim() !== "";
  const canSaveAndSwitch = canStop;

  const unsyncedCount = useMemo(
    () => logs.filter((item) => item.syncStatus !== "synced").length,
    [logs],
  );

  const syncedCount = useMemo(
    () => logs.filter((item) => item.syncStatus === "synced").length,
    [logs],
  );

  const failedCount = useMemo(
    () => logs.filter((item) => item.syncStatus === "failed").length,
    [logs],
  );

  const canClearAll = logs.length > 0 && logs.every((item) => item.syncStatus === "synced");

  const workingStatusText = getWorkingStatusText(isWorking, isOnBreak);

  const publishWorkerStatus = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!isHydrated) return;

      const statusPayload = buildWorkerLiveStatusPayload({
        currentUser,
        logs,
        availableJobs,
        jobId,
        location,
        isWorking,
        isOnBreak,
        startTime,
        breakStartTime,
        breakMinutes,
        failedCount,
      });

      const signature = getWorkerLiveStatusSignature(statusPayload);

      const nowMs = Date.now();

      if (
        !options.force &&
        signature === lastWorkerStatusSignatureRef.current &&
        nowMs - lastWorkerStatusSentAtRef.current < 10 * 60 * 1000
      ) {
        return;
      }

      if (workerStatusInFlightRef.current) return;

      workerStatusInFlightRef.current = true;

      try {
        const result = await getCloudProvider().workerStatus.updateMine(statusPayload);

        if (!result.ok) {
          console.warn("Worker live status update failed:", result.message);
          return;
        }

        lastWorkerStatusSignatureRef.current = signature;
        lastWorkerStatusSentAtRef.current = nowMs;
      } catch (error) {
        console.warn("Worker live status update failed:", error);
      } finally {
        workerStatusInFlightRef.current = false;
      }
    },
    [
      availableJobs,
      breakMinutes,
      breakStartTime,
      currentUser,
      failedCount,
      isHydrated,
      isOnBreak,
      isWorking,
      jobId,
      location,
      logs,
      startTime,
    ],
  );

  useEffect(() => {
    void publishWorkerStatus();
  }, [publishWorkerStatus]);

  useEffect(() => {
    if (!isHydrated) return;

    const sendHeartbeat = () => {
      void publishWorkerStatus({ force: true });
    };

    const intervalId = window.setInterval(sendHeartbeat, 10 * 60 * 1000);

    window.addEventListener("focus", sendHeartbeat);
    window.addEventListener("online", sendHeartbeat);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", sendHeartbeat);
      window.removeEventListener("online", sendHeartbeat);
    };
  }, [isHydrated, publishWorkerStatus]);

  function handleStickyNoteChange(id: string, value: string) {
    setLogs((prev) => updateWorkLogStickyNote(prev, id, value));
  }
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
      setBannerMessage("");
      return;
    }

    const now = new Date().toISOString();

    setDescription("");
    setIsWorking(true);
    setIsOnBreak(false);
    setStartTime(now);
    setBreakStartTime(null);
    setBreakMinutes(0);
    setBannerMessage("");
  }

  function handleBreak() {
    if (!isWorking) return;

    const now = new Date().toISOString();

    if (!isOnBreak) {
      setIsOnBreak(true);
      setBreakStartTime(now);
      setBannerMessage("");
      return;
    }

    if (breakStartTime) {
      const mins = minutesBetween(breakStartTime, now);
      setBreakMinutes((prev) => prev + mins);
    }

    setIsOnBreak(false);
    setBreakStartTime(null);
    setBannerMessage("");
  }

  function handleStop() {
    if (!isWorking || !startTime) return;

    if (isOnBreak) {
      setBannerMessage("");
      return;
    }

    if (description.trim() === "") {
      setBannerMessage("");
      return;
    }

    const logItem = createPendingWorkLog({
      currentUser,
      jobId,
      location,
      role,
      jobDocs,
      description,
      startTime,
      stopTime: new Date().toISOString(),
      breakMinutes,
    });
    setLogs((prev) => [logItem, ...prev]);
    setIsWorking(false);
    setIsOnBreak(false);
    setStartTime(null);
    setBreakStartTime(null);
    setBreakMinutes(0);
    resetEntryFields();
    void clearSession(currentUser.id);
    setBannerMessage("");
  }

  function handleSaveAndSwitch(nextJobId: string, nextLocation: string): AuthActionResult {
    if (!isWorking || !startTime) {
      return { ok: false, message: "No active job to save." };
    }

    if (isOnBreak) {
      return { ok: false, message: "Resume work before switching jobs." };
    }

    if (description.trim() === "") {
      return {
        ok: false,
        message: "Add a description before switching jobs.",
      };
    }

    if (nextJobId.trim() === "") {
      return { ok: false, message: "Select the next Job ID." };
    }

    if (nextLocation.trim() === "") {
      return { ok: false, message: "Select or enter the next location." };
    }

    const logItem = createPendingWorkLog({
      currentUser,
      jobId,
      location,
      role,
      jobDocs,
      description,
      startTime,
      stopTime: new Date().toISOString(),
      breakMinutes,
    });
    const newStartTime = new Date().toISOString();

    setLogs((prev) => [logItem, ...prev]);
    setJobId(nextJobId.trim());
    setLocation(nextLocation.trim());
    setRole(currentUser.role);
    setJobDocs("");
    setDescription("");
    setIsWorking(true);
    setIsOnBreak(false);
    setStartTime(newStartTime);
    setBreakStartTime(null);
    setBreakMinutes(0);
    setBannerMessage("");

    return { ok: true, message: "Saved current job and started new job." };
  }

  async function syncOneItem(item: LogItem): Promise<number> {
    setLogs((prev) => markWorkLogSyncing(prev, item.id));

    return uploadWorkLogToAws(item);
  }

  async function handleSync(): Promise<void> {
    const itemsToSync = getSyncableWorkLogs(logs);

    if (itemsToSync.length === 0) {
      setBannerMessage("");
      return;
    }

    for (const item of itemsToSync) {
      try {
        const syncedAt = await syncOneItem(item);

        setLogs((prev) => markWorkLogSynced(prev, item.id, syncedAt));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown sync error";

        setLogs((prev) => markWorkLogFailed(prev, item.id, message));
      }
    }

    setBannerMessage("");
  }

  function handleClearAll() {
    if (!canClearAll) {
      setBannerMessage("");
      return;
    }

    const confirmed = window.confirm("Clear all saved logs?");
    if (!confirmed) return;

    setLogs([]);
    setExpandedLogId(null);
    void clearLogs(currentUser.id);
    setBannerMessage("");
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
    availableJobs,
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
    canSaveAndSwitch,
    canClearAll,
    unsyncedCount,
    syncedCount,
    failedCount,
    workingStatusText,
    handleStart,
    handleBreak,
    handleStop,
    handleSaveAndSwitch,
    handleSync,
    handleClearAll,
    handleDeleteLog,
    handleStickyNoteChange,
    toggleExpandedLog,
    getSyncBadgeClass,
  };
}
