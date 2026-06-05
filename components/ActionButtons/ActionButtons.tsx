import styles from "./ActionButtons.module.css";

type ActionButtonsProps = {
  canStop: boolean;
  canSaveAndSwitch: boolean;
  canClearAll: boolean;
  unsyncedCount: number;
  failedCount: number;
  handleStop: () => void;
  onOpenSaveAndSwitch: () => void;
  handleSync: () => void | Promise<void>;
  handleClearAll: () => void;
};

export default function ActionButtons({
  canStop,
  canSaveAndSwitch,
  canClearAll,
  unsyncedCount,
  failedCount,
  handleStop,
  onOpenSaveAndSwitch,
  handleSync,
  handleClearAll,
}: ActionButtonsProps) {
  const pendingCount = Math.max(0, unsyncedCount - failedCount);

  let syncText = "All logs synced";
  let syncToneClass = styles.syncOk;

  if (pendingCount > 0 && failedCount > 0) {
    syncText = `${pendingCount} pending • ${failedCount} failed`;
    syncToneClass = styles.syncWarn;
  } else if (pendingCount > 0) {
    syncText = `${pendingCount} pending`;
    syncToneClass = styles.syncWarn;
  } else if (failedCount > 0) {
    syncText = `${failedCount} failed`;
    syncToneClass = styles.syncFail;
  }

  return (
    <div className={styles.actionsWrap}>
      <div className={styles.primaryActions}>
        <button
          type="button"
          className={`${styles.actionButton} ${styles.finishButton}`}
          onClick={handleStop}
          disabled={!canStop}
        >
          Finish Job
        </button>

        <button
          type="button"
          className={`${styles.actionButton} ${styles.switchButton}`}
          onClick={onOpenSaveAndSwitch}
          disabled={!canSaveAndSwitch}
        >
          Save & Switch Job
        </button>
      </div>

      <div className={styles.utilityRow}>
        <button
          type="button"
          className={styles.clearButton}
          onClick={handleClearAll}
          disabled={!canClearAll}
        >
          Clear All
        </button>

        <button type="button" className={styles.syncButton} onClick={handleSync}>
          Sync
        </button>

        <div className={`${styles.syncStatusBox} ${syncToneClass}`}>
          <span className={styles.syncStatusLabel}>Sync status</span>
          <span className={styles.syncStatusValue}>{syncText}</span>
        </div>
      </div>
    </div>
  );
}
