"use client";

import { useState } from "react";
import type { CognitoUser } from "amazon-cognito-identity-js";

import {
  completeNewCognitoPassword,
  getCurrentCognitoSession,
  getCurrentCognitoUser,
  signInWithCognito,
  signOutCognito,
} from "@/lib/auth/cognitoClient";

import styles from "./page.module.css";

export default function CognitoTestPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [challengeUser, setChallengeUser] = useState<CognitoUser | null>(null);

  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState("Not signed in yet.");

  async function handleSignIn() {
    setIsBusy(true);
    setStatus("Signing in...");

    try {
      const result = await signInWithCognito(email.trim(), password);

      if (result.status === "new-password-required") {
        setChallengeUser(result.cognitoUser ?? null);
        setStatus("New password required. Enter a new permanent password.");
        return;
      }

      const payload = result.session?.getIdToken().decodePayload();

      setChallengeUser(null);
      setPassword("");
      setStatus(
        `Signed in successfully. Token user: ${payload?.email ?? payload?.sub ?? "unknown"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-in failed.";

      setStatus(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCompleteNewPassword() {
    if (!challengeUser) {
      setStatus("Missing challenge user. Sign in again.");
      return;
    }

    setIsBusy(true);
    setStatus("Setting new password...");

    try {
      const session = await completeNewCognitoPassword(challengeUser, newPassword);

      const payload = session.getIdToken().decodePayload();

      setChallengeUser(null);
      setPassword("");
      setNewPassword("");

      setStatus(
        `New password saved. Signed in successfully. Token user: ${
          payload.email ?? payload.sub ?? "unknown"
        }`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to complete new password challenge.";

      setStatus(message);
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCheckSession() {
    setIsBusy(true);
    setStatus("Checking current session...");

    try {
      const currentUser = getCurrentCognitoUser();
      const session = await getCurrentCognitoSession();

      if (!session) {
        setStatus(`No valid session found. Cached user: ${currentUser?.getUsername() ?? "none"}`);
        return;
      }

      const payload = session.getIdToken().decodePayload();

      setStatus(`Valid session found for ${payload.email ?? payload.sub ?? "unknown user"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Session check failed.";

      setStatus(message);
    } finally {
      setIsBusy(false);
    }
  }

  function handleSignOut() {
    signOutCognito();
    setChallengeUser(null);
    setPassword("");
    setNewPassword("");
    setStatus("Signed out.");
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>AHlogu Login Test</p>
        <h1 className={styles.title}>Login Test</h1>
        <p className={styles.description}>
          Temporary test page only. This does not replace the current AHlogu local login yet.
        </p>

        <div className={styles.form}>
          <label className={styles.label}>
            Email
            <input
              className={styles.input}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label className={styles.label}>
            Temporary / Current Password
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
            />
          </label>

          {challengeUser ? (
            <label className={styles.label}>
              New Permanent Password
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="Enter new permanent password"
              />
            </label>
          ) : null}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSignIn}
            disabled={isBusy || !email || !password}
          >
            Sign In
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleCheckSession}
            disabled={isBusy}
          >
            Check Session
          </button>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleSignOut}
            disabled={isBusy}
          >
            Sign Out
          </button>
        </div>

        {challengeUser ? (
          <button
            type="button"
            className={styles.fullButton}
            onClick={handleCompleteNewPassword}
            disabled={isBusy || !newPassword}
          >
            Save New Password
          </button>
        ) : null}

        <p className={styles.status}>{status}</p>
      </section>
    </main>
  );
}
