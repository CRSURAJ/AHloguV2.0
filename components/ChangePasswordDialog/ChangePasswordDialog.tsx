"use client";

import type { FormEvent } from "react";
import FeedbackMessage from "@/components/FeedbackMessage";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";

type ChangePasswordDialogProps = {
  open: boolean;
  message: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  isBusy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
};

export default function ChangePasswordDialog({
  open,
  message,
  currentPassword,
  newPassword,
  confirmPassword,
  isBusy,
  onSubmit,
  onClose,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
}: ChangePasswordDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        placeItems: "center",
        padding: "20px",
        background: "rgba(0,0,0,0.48)",
        zIndex: 100,
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "min(460px, 100%)",
          borderRadius: "24px",
          padding: "24px",
          background: "#11302D",
          color: "#eef7f3",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.3)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Change Password</h2>

        <PasswordRequirementsNote />

        {message ? <FeedbackMessage message={message} /> : null}

        <label
          style={{
            display: "grid",
            gap: "8px",
            marginBottom: "14px",
            fontWeight: 700,
          }}
        >
          Current password
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => onCurrentPasswordChange(event.target.value)}
            autoComplete="current-password"
            required
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "16px",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.08)",
              color: "#eef7f3",
              font: "inherit",
            }}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: "8px",
            marginBottom: "14px",
            fontWeight: 700,
          }}
        >
          New password
          <input
            type="password"
            value={newPassword}
            onChange={(event) => onNewPasswordChange(event.target.value)}
            autoComplete="new-password"
            required
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "16px",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.08)",
              color: "#eef7f3",
              font: "inherit",
            }}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: "8px",
            marginBottom: "18px",
            fontWeight: 700,
          }}
        >
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => onConfirmPasswordChange(event.target.value)}
            autoComplete="new-password"
            required
            style={{
              width: "100%",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "16px",
              padding: "14px 16px",
              background: "rgba(255,255,255,0.08)",
              color: "#eef7f3",
              font: "inherit",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="submit"
            disabled={isBusy}
            style={{
              border: 0,
              borderRadius: "14px",
              padding: "12px 16px",
              background: isBusy ? "rgba(83,188,123,0.5)" : "#53BC7B",
              color: "#11302D",
              fontWeight: 800,
              cursor: isBusy ? "not-allowed" : "pointer",
            }}
          >
            {isBusy ? "Changing..." : "Change Password"}
          </button>

          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            style={{
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "14px",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.08)",
              color: "#eef7f3",
              fontWeight: 800,
              cursor: isBusy ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
