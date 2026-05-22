"use client";

import { useEffect, useMemo, useState } from "react";
import { getCloudProvider } from "@/lib/cloud/client";
import type { WorkerLiveStatus } from "@/types/work";
import styles from "./WorkerStatusPanel.module.css";

function formatRole(role: string): string {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatStatus(status: string): string {
  switch (status) {
    case "working":
      return "Working";
    case "on_break":
      return "On break";
    case "available":
      return "Available";
    case "online":
      return "Online";
    case "offline":
      return "Offline";
    case "deactivated":
      return "Deactivated";
    default:
      return status || "Unknown";
  }
}

function formatLastSeen(lastSeenAt: string): string {
  if (!lastSeenAt) return "Never";

  const lastSeenMs = Date.parse(lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) return "Unknown";

  const diffMs = Date.now() - lastSeenMs;
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes === 1) return "1 min ago";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function getStatusClassName(status: string): string {
  switch (status) {
    case "working":
      return `${styles.statusPill} ${styles.statusWorking}`;
    case "on_break":
      return `${styles.statusPill} ${styles.statusBreak}`;
    case "available":
    case "online":
      return `${styles.statusPill} ${styles.statusOnline}`;
    case "deactivated":
      return `${styles.statusPill} ${styles.statusDeactivated}`;
    case "offline":
      return `${styles.statusPill} ${styles.statusOffline}`;
    default:
      return styles.statusPill;
  }
}

type WorkerStatusPanelProps = {
  onClose: () => void;
};

export default function WorkerStatusPanel({ onClose }: WorkerStatusPanelProps) {
  const [statuses, setStatuses] = useState<WorkerLiveStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function loadWorkerStatuses() {
    try {
      setMessage("");
      const data = await getCloudProvider().workerStatus.list();
      setStatuses(data);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not load worker status.";
      setMessage(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkerStatuses();

    const intervalId = window.setInterval(() => {
      void loadWorkerStatuses();
    }, 5 * 60 * 1000);

    const handleFocus = () => {
      void loadWorkerStatuses();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const summary = useMemo(() => {
    const working = statuses.filter((item) => item.status === "working").length;
    const onBreak = statuses.filter((item) => item.status === "on_break").length;
    const offline = statuses.filter((item) => item.status === "offline").length;

    return { working, onBreak, offline };
  }, [statuses]);

  return (
    <div className={styles.backdrop}>
      <section className={styles.panel}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Worker Status</h2>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => void loadWorkerStatuses()}
            >
              Refresh
            </button>

            <button type="button" className={styles.closeButton} onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <span>Working</span>
            <strong>{summary.working}</strong>
          </div>

          <div className={styles.summaryCard}>
            <span>On break</span>
            <strong>{summary.onBreak}</strong>
          </div>

          <div className={styles.summaryCard}>
            <span>Offline</span>
            <strong>{summary.offline}</strong>
          </div>
        </div>

        {message ? <div className={styles.message}>{message}</div> : null}

        {isLoading ? (
          <p className={styles.emptyText}>Loading worker status...</p>
        ) : statuses.length === 0 ? (
          <p className={styles.emptyText}>No workers found yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Status</th>
                  <th>Current Job</th>
                  <th>Sync</th>
                  <th>Last Seen</th>
                </tr>
              </thead>

              <tbody>
                {statuses.map((item) => (
                  <tr key={item.userId}>
                    <td>
                      <div className={styles.workerName}>{item.fullName}</div>
                      <div className={styles.workerMeta}>{formatRole(item.role)}</div>
                    </td>

                    <td>
                      <span className={getStatusClassName(item.status)}>
                        {formatStatus(item.status)}
                      </span>

                      {item.status === "offline" &&
                      item.lastKnownStatus &&
                      item.lastKnownStatus !== "offline" ? (
                        <div className={styles.muted}>
                          was {formatStatus(item.lastKnownStatus)}
                        </div>
                      ) : null}
                    </td>

                    <td>
                      {item.currentJobId ? (
                        <>
                          <div className={styles.jobId}>{item.currentJobId}</div>
                          <div className={styles.muted}>
                            {item.currentJobName || item.currentJobLocation || "-"}
                          </div>
                        </>
                      ) : (
                        <span className={styles.muted}>-</span>
                      )}
                    </td>

                    <td>
                      <div className={styles.syncCell}>
                        <strong>{item.pendingSyncCount}</strong>
                        <span>pending</span>
                        <strong>{item.failedSyncCount}</strong>
                        <span>failed</span>
                      </div>
                    </td>

                    <td>
                      <span className={styles.muted}>
                        {formatLastSeen(item.lastSeenAt)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
