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
  onStickyNoteChange: (id: string, value: string) => void;
};

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.deleteIcon}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.8c0-.9.7-1.6 1.6-1.6h4.8c.9 0 1.6.7 1.6 1.6V6" />
      <path d="M6.8 6l.8 12.1c.1 1.4 1.2 2.5 2.6 2.5h3.6c1.4 0 2.5-1.1 2.6-2.5L17.2 6" />
      <path d="M10 10.2v6.2" />
      <path d="M14 10.2v6.2" />
    </svg>
  );
}

export default function LogsList({
  logs,
  expandedLogId,
  toggleExpandedLog,
  getSyncBadgeClass,
  onDelete,
  onStickyNoteChange,
}: LogsListProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openStickyEditors, setOpenStickyEditors] = useState<Record<string, boolean>>({});

function toggleStickyEditor(id: string) {
  setOpenStickyEditors((prev) => ({
    ...prev,
    [id]: !prev[id],
  }));
}
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
                const stickyLocked =
                  item.syncStatus === "synced" || item.syncStatus === "syncing";
                const stickyValue = item.stickyNote ?? "";  
                const stickyOpen = openStickyEditors[item.id] ?? false;
                const hasStickyNote = stickyValue.trim().length > 0;
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
                    <div className={styles.stickyNoteSection}>
  <button
    type="button"
    className={`${styles.stickyToggleButton} ${hasStickyNote ? styles.stickyToggleButtonFilled : ""}`}
    onClick={() => toggleStickyEditor(item.id)}
  >
    <span className={styles.stickyToggleLabel}>Sticky Note</span>
    <span className={styles.stickyToggleStatus}>
      {hasStickyNote ? "↑" : "+"}
    </span>
  </button>

  {stickyOpen ? (
    <div className={styles.stickyNoteCard}>
      <div className={styles.stickyNoteHeader}>
        <span className={styles.stickyNoteTitle}>Sticky note</span>
        <span className={styles.stickyNoteState}>
          {stickyLocked ? "Read only after sync" : ""}
        </span>
      </div>

      <textarea
        className={styles.stickyNoteInput}
        value={stickyValue}
        onChange={(e) => onStickyNoteChange(item.id, e.target.value)}
        placeholder="Add anything you forgot before syncing..."
        rows={3}
        disabled={stickyLocked}
      />
    </div>
  ) : null}
</div>
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
                          title="Delete log"
                        >
                          <TrashIcon />
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
