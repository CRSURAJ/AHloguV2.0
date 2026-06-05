"use client";

import { useCloudSync } from "@/hooks/useCloudSync";

import styles from "./CloudSyncStatus.module.css";

export default function CloudSyncStatus() {
  const {
    provider,
    isChecking,
    isSyncing,
    isOnline,
    pendingCount,
    lastMessage,
    checkStatus,
    syncNow,
  } = useCloudSync();

  const statusText = isOnline ? "Cloud ready" : "Local mode";
  const providerText = provider;

  return (
    <section className={styles.card} aria-label="Cloud sync status">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Cloud Sync</p>
          <h3 className={styles.title}>{statusText}</h3>
        </div>

        <span className={isOnline ? styles.onlinePill : styles.localPill}>{providerText}</span>
      </div>

      <div className={styles.metaGrid}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Pending</span>
          <strong className={styles.metaValue}>{pendingCount}</strong>
        </div>

        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Status</span>
          <strong className={styles.metaValue}>
            {isSyncing ? "Syncing..." : isChecking ? "Checking..." : "Ready"}
          </strong>
        </div>
      </div>

      <p className={styles.message}>{lastMessage}</p>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={checkStatus}
          disabled={isChecking || isSyncing}
        >
          Check
        </button>

        <button
          type="button"
          className={styles.primaryButton}
          onClick={syncNow}
          disabled={isChecking || isSyncing || pendingCount === 0}
        >
          Sync Cloud
        </button>
      </div>
    </section>
  );
}
