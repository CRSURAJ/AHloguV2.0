"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./WorkLogger.module.css";

const TB_URL =
  "https://ahconnect.automaticheating.com.au/api/v1/W3fZovDPT4Au9WuhnSar/telemetry";

const FULL_NAME_OPTIONS = ["", "Suraj", "Name 2", "Name 3"];

type SyncStatus = "pending" | "syncing" | "synced" | "failed";

type LogItem = {
  id: number;
  ts: number;
  fullname: string;
  jobId: string;
  location: string;
  role: string;
  description: string;
  startedAt: string;
  stoppedAt: string;
  breakMinutes: number;
  workedMinutes: number;
  syncStatus: SyncStatus;
  syncMessage: string;
};

export default function WorkLogger() {
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

  useEffect(() => {
    const raw = localStorage.getItem("project_logu_logs");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as Partial<LogItem>[];
      const safeLogs: LogItem[] = parsed.map((item, index) => ({
        id: item.id ?? Date.now() + index,
        ts: item.ts ?? Date.now(),
        fullname: item.fullname ?? "",
        jobId: item.jobId ?? "",
        location: item.location ?? "",
        role: item.role ?? "",
        description: item.description ?? "",
        startedAt: item.startedAt ?? "",
        stoppedAt: item.stoppedAt ?? "",
        breakMinutes: item.breakMinutes ?? 0,
        workedMinutes: item.workedMinutes ?? 0,
        syncStatus: item.syncStatus ?? "pending",
        syncMessage: item.syncMessage ?? "Waiting to sync",
      }));
      setLogs(safeLogs);
    } catch {
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("project_logu_logs", JSON.stringify(logs));
  }, [logs]);

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

  function getWorkingStatusText() {
    if (isOnBreak) return "On break";
    if (isWorking) return "Working";
    return "Idle";
  }

  function validateBeforeStart() {
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

    const now = new Date();

    if (!isOnBreak) {
      setIsOnBreak(true);
      setBreakStartTime(now.toISOString());
      setBannerMessage("Break started.");
      return;
    }

    if (breakStartTime) {
      const diffMs = now.getTime() - new Date(breakStartTime).getTime();
      const mins = Math.round(diffMs / 60000);
      setBreakMinutes((prev) => prev + Math.max(0, mins));
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
      const diffMs =
        new Date(stopTime).getTime() - new Date(breakStartTime).getTime();
      finalBreakMinutes += Math.max(0, Math.round(diffMs / 60000));
    }

    const totalMinutes = Math.max(
      0,
      Math.round(
        (new Date(stopTime).getTime() - new Date(startTime).getTime()) / 60000
      )
    );

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
      setBannerMessage(
        `${successCount} synced, ${failCount} failed. Retry failed logs.`
      );
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
    localStorage.removeItem("project_logu_logs");
    setBannerMessage("All saved logs cleared.");
  }

  function getSyncBadgeClass(status: SyncStatus) {
    if (status === "pending") return styles.badgePending;
    if (status === "syncing") return styles.badgeSyncing;
    if (status === "synced") return styles.badgeSynced;
    return styles.badgeFailed;
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>Project Logu</h1>
        <p className={styles.subtitle}>Work logger with sync tracking</p>

        <div className={styles.formGrid}>
          <div>
            <label className={styles.label}>Full Name *</label>
            <select
              value={fullname}
              onChange={(e) => setFullname(e.target.value)}
              disabled={isWorking}
              className={styles.input}
            >
              <option value="">Select full name</option>
              {FULL_NAME_OPTIONS.filter(Boolean).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.label}>Job ID *</label>
            <input
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              disabled={isWorking}
              className={styles.input}
            />
          </div>

          <div>
            <label className={styles.label}>Role *</label>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isWorking}
              placeholder="Plumber / Technician / Apprentice"
              className={styles.input}
            />
          </div>

          <div>
            <label className={styles.label}>Location *</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isWorking}
              className={styles.input}
            />
          </div>
        </div>

        <div className={styles.buttonRow}>
          <button
            onClick={handleStart}
            disabled={!canStart}
            className={`${styles.button} ${styles.startButton}`}
          >
            Start
          </button>

          <button
            onClick={handleBreak}
            disabled={!canBreak}
            className={`${styles.button} ${styles.breakButton}`}
          >
            {isOnBreak ? "End break" : "Break"}
          </button>

          <button
            onClick={handleStop}
            disabled={!canStop}
            className={`${styles.button} ${styles.stopButton}`}
          >
            Stop
          </button>

          <button
            onClick={handleSync}
            className={`${styles.button} ${styles.syncButton}`}
          >
            Sync
          </button>

          <button
            onClick={handleClearAll}
            disabled={!canClearAll}
            className={`${styles.button} ${styles.clearButton}`}
          >
            Clear All
          </button>
        </div>

        <div className={styles.descriptionBlock}>
          <label className={styles.label}>Description {isWorking ? "*" : ""}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!isWorking}
            placeholder={
              isWorking
                ? "Enter work description before stopping"
                : "Description becomes available after Start"
            }
            className={styles.textarea}
          />
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusRow}>
            <div>
              <div className={styles.statusLabel}>Current status</div>
              <div className={styles.statusValue}>{getWorkingStatusText()}</div>
            </div>

            <div className={styles.statusPill}>
              {isWorking ? (isOnBreak ? "BREAK" : "LIVE") : "READY"}
            </div>
          </div>

          <div className={styles.statusText}>Unsynced logs: {unsyncedCount}</div>

          {bannerMessage && <div className={styles.banner}>{bannerMessage}</div>}
        </div>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Logs</div>
            <div className={styles.summaryValue}>{logs.length}</div>
          </div>

          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Synced</div>
            <div className={styles.summaryValue}>{syncedCount}</div>
          </div>

          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Failed</div>
            <div className={styles.summaryValue}>{failedCount}</div>
          </div>
        </div>

        <div className={styles.logsSection}>
          <div className={styles.logsHeader}>
            <h2 className={styles.logsTitle}>Saved Logs</h2>
            <span className={styles.logsCount}>{logs.length} total</span>
          </div>

          {logs.length === 0 ? (
            <div className={styles.emptyState}>No logs yet.</div>
          ) : (
            <div className={styles.logsScroller}>
              <div className={styles.logsGrid}>
                {logs.map((item) => {
                  const safeStatus = item.syncStatus ?? "pending";
                  const isExpanded = expandedLogId === item.id;
                  const canExpand = (item.description ?? "").length > 80;

                  return (
                    <div key={item.id} className={styles.logCard}>
                      <div className={styles.logTop}>
                        <div className={styles.logHeadingWrap}>
                          <div className={styles.logHeading}>
                            {item.fullname} · {item.jobId}
                          </div>
                          <div className={styles.logSubHeading}>
                            {item.role} · {item.location}
                          </div>
                        </div>

                        <span
                          className={`${styles.badge} ${getSyncBadgeClass(
                            safeStatus
                          )}`}
                        >
                          {safeStatus.toUpperCase()}
                        </span>
                      </div>

                      <div className={styles.logMetaRow}>
                        <span className={styles.metaTag}>
                          Worked: {item.workedMinutes} min
                        </span>
                        <span className={styles.metaTag}>
                          Break: {item.breakMinutes} min
                        </span>
                      </div>

                      <div
                        className={`${styles.logDescriptionText} ${
                          isExpanded ? styles.expanded : ""
                        }`}
                      >
                        {item.description || "No description"}
                      </div>

                      {canExpand && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() =>
                            setExpandedLogId(isExpanded ? null : item.id)
                          }
                        >
                          {isExpanded ? "Show less" : "Show more"}
                        </button>
                      )}

                      <div className={styles.logFooter}>
                        <div className={styles.logMessage}>
                          {item.syncMessage ?? "Waiting to sync"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
