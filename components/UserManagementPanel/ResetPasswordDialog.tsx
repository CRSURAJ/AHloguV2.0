"use client";

import type { FormEvent, RefObject } from "react";
import FeedbackMessage from "@/components/FeedbackMessage";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";
import type { AwsUserListItem } from "./UserManagementPanel";
import styles from "./UserManagementPanel.module.css";

type ResetPasswordDialogProps = {
  targetUser: AwsUserListItem | null;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
  message: string;
  isResetting: boolean;
  cardRef: RefObject<HTMLFormElement | null>;
  onTemporaryPasswordChange: (value: string) => void;
  onConfirmTemporaryPasswordChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export default function ResetPasswordDialog({
  targetUser,
  temporaryPassword,
  confirmTemporaryPassword,
  message,
  isResetting,
  cardRef,
  onTemporaryPasswordChange,
  onConfirmTemporaryPasswordChange,
  onClose,
  onSubmit,
}: ResetPasswordDialogProps) {
  if (!targetUser) {
    return null;
  }

  const displayName = targetUser.fullName || targetUser.email || targetUser.username || "this user";

  return (
    <div className={styles.modalBackdrop}>
      <form ref={cardRef} tabIndex={-1} className={styles.modalCard} onSubmit={onSubmit}>
        <h2 className={styles.modalTitle}>Reset Password</h2>

        <p className={styles.modalDescription}>
          Set a temporary password for <strong>{displayName}</strong>. They will be asked to choose
          a new password on next sign in.
        </p>

        <FeedbackMessage message={message} />

        <label className={styles.field}>
          <span className={styles.label}>Temporary Password</span>
          <input
            className={styles.input}
            type="password"
            value={temporaryPassword}
            onChange={(event) => onTemporaryPasswordChange(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Confirm Temporary Password</span>
          <input
            className={styles.input}
            type="password"
            value={confirmTemporaryPassword}
            onChange={(event) => onConfirmTemporaryPasswordChange(event.target.value)}
            autoComplete="new-password"
            required
          />
        </label>

        <PasswordRequirementsNote compact />

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onClose}
            disabled={isResetting}
          >
            Cancel
          </button>

          <button type="submit" className={styles.primaryButton} disabled={isResetting}>
            {isResetting ? "Resetting..." : "Reset Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
