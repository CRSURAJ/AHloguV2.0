"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import FeedbackMessage from "@/components/FeedbackMessage";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";

export function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#085153",
        color: "#eef7f3",
        fontWeight: 700,
      }}
    >
      Loading…
    </div>
  );
}

type CognitoLoginCardProps = {
  email: string;
  password: string;
  newPassword: string;
  confirmNewPassword: string;
  message: string;
  isBusy: boolean;
  requiresNewPassword: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CognitoLoginCard({
  email,
  password,
  newPassword,
  confirmNewPassword,
  message,
  isBusy,
  requiresNewPassword,
  onEmailChange,
  onPasswordChange,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
  onSubmit,
}: CognitoLoginCardProps) {
  const inputStyle = {
    width: "100%",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "16px",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.08)",
    color: "#eef7f3",
    font: "inherit",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at top left, rgba(83, 188, 123, 0.25), transparent 34%), #085153",
        color: "#eef7f3",
      }}
    >
      <style>
        {`@keyframes loginMessageShake {
          0% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
          100% { transform: translateX(0); }
        }`}
      </style>

      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: "430px",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: "28px",
          padding: "28px",
          background: "rgba(17, 48, 45, 0.92)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <Image
            src="/AHlogu.png"
            alt="AH LOGU"
            width={160}
            height={40}
            priority
            style={{ width: "160px", height: "auto", objectFit: "contain", marginBottom: "18px" }}
          />
        </div>

        {message ? (
          <div key={message} style={{ animation: "loginMessageShake 0.38s ease-in-out" }}>
            <FeedbackMessage message={message} />
          </div>
        ) : null}

        {!requiresNewPassword ? (
          <>
            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "14px",
                fontWeight: 700,
              }}
            >
              Email
              <input
                type="text"
                inputMode="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                autoComplete="email"
                required
                style={inputStyle}
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
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete="current-password"
                required
                style={inputStyle}
              />
            </label>
          </>
        ) : (
          <>
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
                style={inputStyle}
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
                value={confirmNewPassword}
                onChange={(event) => onConfirmNewPasswordChange(event.target.value)}
                autoComplete="new-password"
                required
                style={inputStyle}
              />
            </label>
          </>
        )}

        {requiresNewPassword ? <PasswordRequirementsNote /> : null}

        <button
          type="submit"
          disabled={isBusy}
          style={{
            width: "100%",
            border: 0,
            borderRadius: "16px",
            padding: "14px 16px",
            background: isBusy ? "rgba(83,188,123,0.5)" : "#53BC7B",
            color: "#11302D",
            font: "inherit",
            fontWeight: 800,
            cursor: isBusy ? "not-allowed" : "pointer",
          }}
        >
          {isBusy ? "Please wait…" : requiresNewPassword ? "Set new password" : "Sign In"}
        </button>
      </form>
    </main>
  );
}
