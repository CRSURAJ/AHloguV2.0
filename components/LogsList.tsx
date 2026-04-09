import { formatDateTime } from "@/lib/workUtils";
import type { LogItem } from "@/types/work";
import styles from "./WorkLogger.module.css";

type LogsListProps = {
  logs: LogItem[];
  expandedLogId: number | null;
  toggleExpandedLog: (id: number) => void;
  getSyncBadgeClass: (
    status: "pending" | "syncing" | "synced" | "failed"
  ) => string;
};

export default function LogsList({
  logs,
  expandedLogId,
  toggleExpandedLog,
  getSyncBadgeClass,
}: LogsListProps) {
  return (
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
                      className={`${styles.badge} ${
                        styles[getSyncBadgeClass(item.syncStatus)]
                      }`}
                    >
                      {item.syncStatus.toUpperCase()}
                    </span>
                  </div>

                  <div className={styles.logTime}>
                    {formatDateTime(item.startedAt)} →{" "}
                    {formatDateTime(item.stoppedAt)}
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
                      onClick={() => toggleExpandedLog(item.id)}
                    >
                      {isExpanded ? "Show less" : "Show more"}
                    </button>
                  )}

                  <div className={styles.logFooter}>
                    <div className={styles.logMessage}>
                      {item.syncMessage || "Waiting to sync"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
