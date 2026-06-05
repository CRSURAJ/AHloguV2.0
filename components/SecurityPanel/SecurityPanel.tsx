"use client";

import { useState } from "react";
import type { CredentialType } from "@/types/work";
import styles from "./SecurityPanel.module.css";

type SecurityPanelProps = {
  credentialType: CredentialType;
  forced: boolean;
  onClose: () => void;
  onSubmit: (
    currentSecret: string,
    nextSecret: string,
    confirmSecret: string,
  ) => Promise<{ ok: boolean; message: string }>;
};

export default function SecurityPanel({
  credentialType,
  forced,
  onClose,
  onSubmit,
}: SecurityPanelProps) {
  const [currentSecret, setCurrentSecret] = useState("");
  const [nextSecret, setNextSecret] = useState("");
  const [confirmSecret, setConfirmSecret] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const label = credentialType === "pin" ? "PIN" : "Password";

  async function handleSave() {
    setSaving(true);
    const result = await onSubmit(currentSecret, nextSecret, confirmSecret);
    setMessage(result.message);
    setSaving(false);

    if (result.ok) {
      setCurrentSecret("");
      setNextSecret("");
      setConfirmSecret("");
      if (!forced) onClose();
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>Change {label}</h3>
            <p className={styles.subtitle}>
              {forced
                ? `You must change your ${label.toLowerCase()} before continuing.`
                : `Update your ${label.toLowerCase()} for this device.`}
            </p>
          </div>

          {!forced ? (
            <button type="button" className={styles.closeButton} onClick={onClose}>
              Close
            </button>
          ) : null}
        </div>

        {message ? <div className={styles.message}>{message}</div> : null}

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Current {label}</label>
            <input
              className={styles.input}
              type="password"
              value={currentSecret}
              onChange={(e) => setCurrentSecret(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>New {label}</label>
            <input
              className={styles.input}
              type="password"
              value={nextSecret}
              onChange={(e) => setNextSecret(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Confirm New {label}</label>
            <input
              className={styles.input}
              type="password"
              value={confirmSecret}
              onChange={(e) => setConfirmSecret(e.target.value)}
            />
          </div>

          <button
            type="button"
            className={styles.saveButton}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "Saving..." : `Save ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
