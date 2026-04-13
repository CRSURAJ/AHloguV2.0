"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/workUtils";
import type { LogItem, SyncStatus } from "@/types/work";
import styles from "./LogsList.module.css";

type LogsListProps = {
  logs: LogItem[];
  expandedLogId: string | null;
  toggleExpandedLog: (id: string) => void;
  getSyncBadgeClass: (status: SyncStatus) => string;
  onDelete: (id: string) => void;
};

export default function LogsList({
  logs,
  expandedLogId,
  toggleExpandedLog,
  getSyncBadgeClass,
  onDelete,
}: LogsListProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={styles.logsCard}>
      <button
        type="button"
        className={styles.logsToggle}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div className={styles.logsTitleWrap}>
          <div className={styles.logsTitle}>Recent Logs</div>
          <div className={styles.logsSubtitle}>
            {logs.length} saved log{logs.length === 1 ? "" : "s"}
          </div>
        </div>

        <span
          className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {isOpen ? (
        <div className={styles.logsBody}>
          {logs.length === 0 ? (
            <div className={styles.emptyState}>No logs yet.</div>
          ) : (
            <div className={styles.logsList}>
              {logs.map((item) => {
                const isExpanded = expandedLogId === item.id;
                const canExpand =
                  (item.description ?? "").length > 120 ||
                  (item.description ?? "").includes("\n");

                const badgeClassKey = getSyncBadgeClass(item.syncStatus);
                const badgeClass =
                  styles[badgeClassKey as keyof typeof styles] ?? "";

                return (
                  <article key={item.id} className={styles.logItem}>
                    <div className={styles.logTop}>
                      <div className={styles.logIdentity}>
                        <div className={styles.logTitle}>
                          {item.fullname} · {item.jobId}
                        </div>
                        <div className={styles.logMeta}>
                          {formatDateTime(item.startedAt)} →{" "}
                          {formatDateTime(item.stoppedAt)}
                        </div>
                      </div>

                      <span className={`${styles.badge} ${badgeClass}`}>
                        {item.syncStatus.toUpperCase()}
                      </span>
                    </div>

                    <div className={styles.metaChips}>
                      <span className={styles.metaChip}>{item.role}</span>
                      <span className={styles.metaChip}>{item.location}</span>
                      <span className={styles.metaChip}>
                        {item.workedMinutes} min worked
                      </span>
                      <span className={styles.metaChip}>
                        {item.breakMinutes} min break
                      </span>
                      {item.jobDocs ? (
                        <span className={styles.metaChip}>{item.jobDocs}</span>
                      ) : null}
                    </div>

                    <div
                      className={`${styles.logDescription} ${
                        isExpanded ? styles.logDescriptionExpanded : ""
                      }`}
                    >
                      {item.description || "No description"}
                    </div>

                    {canExpand ? (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => toggleExpandedLog(item.id)}
                      >
                        {isExpanded ? "Show less" : "Show more"}
                      </button>
                    ) : null}

                    <div className={styles.logFooter}>
                      <div className={styles.logMessage}>{item.syncMessage}</div>

                      <div className={styles.logActions}>
                        <button
                          type="button"
                          className={styles.deleteButton}
                          onClick={() => {
                            const confirmed = window.confirm(
                              "Delete this saved log?"
                            );
                            if (confirmed) {
                              onDelete(item.id);
                            }
                          }}
                          aria-label={`Delete log ${item.jobId}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
