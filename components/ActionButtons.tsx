import styles from "./WorkLogger.module.css";

type ActionButtonsProps = {
  isOnBreak: boolean;
  canStart: boolean;
  canBreak: boolean;
  canStop: boolean;
  canClearAll: boolean;
  unsyncedCount: number;
  failedCount: number;
  handleStart: () => void;
  handleBreak: () => void;
  handleStop: () => void;
  handleSync: () => void | Promise<void>;
  handleClearAll: () => void;
};

export default function ActionButtons({
  isOnBreak,
  canStart,
  canBreak,
  canStop,
  canClearAll,
  unsyncedCount,
  failedCount,
  handleStart,
  handleBreak,
  handleStop,
  handleSync,
  handleClearAll,
}: ActionButtonsProps) {
  const pendingCount = Math.max(0, unsyncedCount - failedCount);

  let syncText = "All logs synced";
  if (pendingCount > 0 && failedCount > 0) {
    syncText = `${pendingCount} pending • ${failedCount} failed`;
  } else if (pendingCount > 0) {
    syncText = `${pendingCount} pending`;
  } else if (failedCount > 0) {
    syncText = `${failedCount} failed`;
  }

  return (
    <div className={styles.actionsWrap}>
      <div className={styles.primaryActions}>
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart}
          className={`${styles.actionButton} ${styles.startButton}`}
        >
          Start
        </button>

        <button
          type="button"
          onClick={handleBreak}
          disabled={!canBreak}
          className={`${styles.actionButton} ${styles.midButton}`}
        >
          {isOnBreak ? "Resume" : "Break"}
        </button>

        <button
          type="button"
          onClick={handleStop}
          disabled={!canStop}
          className={`${styles.actionButton} ${styles.finishButton}`}
        >
          Finish
        </button>
      </div>

      <div className={styles.utilityRow}>
        <button
          type="button"
          onClick={handleClearAll}
          disabled={!canClearAll}
          className={styles.clearButton}
        >
          Clear All
        </button>

        <div className={styles.syncGroup}>
          <button
            type="button"
            onClick={handleSync}
            className={styles.syncButton}
          >
            Sync
          </button>

          <span className={styles.syncStatus}>Sync status: {syncText}</span>
        </div>
      </div>
    </div>
  );
}
