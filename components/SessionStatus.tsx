import styles from "./WorkLogger.module.css";

type SessionStatusProps = {
  workingStatusText: string;
  isWorking: boolean;
  isOnBreak: boolean;
  unsyncedCount: number;
  syncedCount: number;
  failedCount: number;
  totalLogs: number;
  bannerMessage: string;
};

export default function SessionStatus({
  workingStatusText,
  isWorking,
  isOnBreak,
  unsyncedCount,
  syncedCount,
  failedCount,
  totalLogs,
  bannerMessage,
}: SessionStatusProps) {
  return (
    <>
      <div className={styles.statusCard}>
        <div className={styles.statusRow}>
          <div>
            <div className={styles.statusLabel}>Current status</div>
            <div className={styles.statusValue}>{workingStatusText}</div>
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
          <div className={styles.summaryValue}>{totalLogs}</div>
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
    </>
  );
}
