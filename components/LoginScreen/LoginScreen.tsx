"use client";

import Image from "next/image";
import styles from "./LoginScreen.module.css";

type LoginScreenProps = {
  loginUsername: string;
  setLoginUsername: (value: string) => void;
  loginSecret: string;
  setLoginSecret: (value: string) => void;
  authMessage: string;
  handleLogin: () => Promise<void>;
};

export default function LoginScreen({
  loginUsername,
  setLoginUsername,
  loginSecret,
  setLoginSecret,
  authMessage,
  handleLogin,
}: LoginScreenProps) {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <Image
            src="/AHlogu.png"
            alt="AH LOGU"
            width={160}
            height={48}
            className={styles.logo}
            priority
          />
          <p className={styles.subtitle}>
            Offline local login. No internet required.
          </p>
        </div>

        {authMessage ? <div className={styles.message}>{authMessage}</div> : null}

        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void handleLogin();
          }}
        >
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className={styles.input}
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-secret">
              PIN / Password
            </label>
            <input
              id="login-secret"
              className={styles.input}
              type="password"
              value={loginSecret}
              onChange={(e) => setLoginSecret(e.target.value)}
              placeholder="Enter PIN or password"
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className={styles.button}>
            Sign in
          </button>
        </form>

        <div className={styles.helpCard}>
          <div className={styles.helpTitle}>Forgot PIN or password?</div>
          <div className={styles.helpText}>
            Ask the admin to reset your credential on this device.
          </div>
        </div>

        <p className={styles.note}>
          Local offline sign-in is enabled on this device.
        </p>
      </div>
    </div>
  );
}
