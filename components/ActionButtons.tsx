import styles from "./WorkLogger.module.css";

type ActionButtonsProps = {
  isOnBreak: boolean;
  canStart: boolean;
  canBreak: boolean;
  canStop: boolean;
  canClearAll: boolean;
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
  handleStart,
  handleBreak,
  handleStop,
  handleSync,
  handleClearAll,
}: ActionButtonsProps) {
  return (
    <div className={styles.buttonRow}>
      <button
        type="button"
        onClick={handleStart}
        disabled={!canStart}
        className={styles.primaryButton}
      >
        Start
      </button>

      <button
        type="button"
        onClick={handleBreak}
        disabled={!canBreak}
        className={styles.secondaryButton}
      >
        {isOnBreak ? "End break" : "Break"}
      </button>

      <button
        type="button"
        onClick={handleStop}
        disabled={!canStop}
        className={styles.dangerButton}
      >
        Stop
      </button>

      <button
        type="button"
        onClick={handleSync}
        className={styles.neutralButton}
      >
        Sync
      </button>

      <button
        type="button"
        onClick={handleClearAll}
        disabled={!canClearAll}
        className={styles.neutralButton}
      >
        Clear All
      </button>
    </div>
  );
}
