"use client";

import { useMemo, useState } from "react";
import styles from "./UserManagementPanel.module.css";
import {
  PERMISSION_LEVEL_OPTIONS,
  WORKER_ROLE_OPTIONS,
} from "@/types/work";
import type {
  AuthActionResult,
  CredentialType,
  OfflineUser,
  PermissionLevel,
  WorkerRole,
} from "@/types/work";

type UserManagementPanelProps = {
  users: OfflineUser[];
  onClose: () => void;
  onCreateUser: (input: {
    username: string;
    fullName: string;
    permissionLevel: PermissionLevel;
    role: WorkerRole;
    credentialType: CredentialType;
    secret: string;
    confirmSecret: string;
  }) => Promise<AuthActionResult>;
  onResetCredential: (
    userId: string,
    nextSecret: string,
    confirmSecret: string
  ) => Promise<AuthActionResult>;
  onToggleActive: (userId: string) => AuthActionResult;
  onDeleteUser: (userId: string) => AuthActionResult;
};

function getRoleLabel(role: WorkerRole): string {
  return WORKER_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

function getPermissionLabel(permissionLevel: PermissionLevel): string {
  return (
    PERMISSION_LEVEL_OPTIONS.find((item) => item.value === permissionLevel)?.label ??
    permissionLevel
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.iconSvg}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.8c0-.9.7-1.6 1.6-1.6h4.8c.9 0 1.6.7 1.6 1.6V6" />
      <path d="M6.8 6l.8 12.1c.1 1.4 1.2 2.5 2.6 2.5h3.6c1.4 0 2.5-1.1 2.6-2.5L17.2 6" />
      <path d="M10 10.2v6.2" />
      <path d="M14 10.2v6.2" />
    </svg>
  );
}

export default function UserManagementPanel({
  users,
  onClose,
  onCreateUser,
  onResetCredential,
  onToggleActive,
  onDeleteUser,
}: UserManagementPanelProps) {
  const [message, setMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [permissionLevel, setPermissionLevel] =
    useState<PermissionLevel>("user");
  const [role, setRole] = useState<WorkerRole>("plumber");
  const [credentialType, setCredentialType] =
    useState<CredentialType>("pin");
  const [secret, setSecret] = useState("");
  const [confirmSecret, setConfirmSecret] = useState("");
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetSecret, setResetSecret] = useState("");
  const [resetConfirmSecret, setResetConfirmSecret] = useState("");

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (a.permissionLevel !== b.permissionLevel) {
          return a.permissionLevel === "admin" ? -1 : 1;
        }
        return a.username.localeCompare(b.username);
      }),
    [users]
  );

  async function handleCreate(): Promise<void> {
    const result = await onCreateUser({
      username,
      fullName,
      permissionLevel,
      role,
      credentialType: permissionLevel === "admin" ? "password" : credentialType,
      secret,
      confirmSecret,
    });

    setMessage(result.message);

    if (result.ok) {
      setFullName("");
      setUsername("");
      setPermissionLevel("user");
      setRole("plumber");
      setCredentialType("pin");
      setSecret("");
      setConfirmSecret("");
    }
  }

  async function handleReset(): Promise<void> {
    if (!resetUserId) return;

    const result = await onResetCredential(
      resetUserId,
      resetSecret,
      resetConfirmSecret
    );

    setMessage(result.message);

    if (result.ok) {
      setResetUserId(null);
      setResetSecret("");
      setResetConfirmSecret("");
    }
  }

  function handleDelete(user: OfflineUser): void {
    const confirmed = window.confirm(
      `Delete ${user.fullName}? This cannot be undone.`
    );

    if (!confirmed) return;

    const result = onDeleteUser(user.id);
    setMessage(result.message);

    if (result.ok && resetUserId === user.id) {
      setResetUserId(null);
      setResetSecret("");
      setResetConfirmSecret("");
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>User Management</h3>
            <p className={styles.subtitle}>
              Create users, assign permission level and trade role, reset
              PIN/password, activate, deactivate, or delete accounts.
            </p>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        {message ? <div className={styles.message}>{message}</div> : null}

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Add User</div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-full-name">
                Full Name
              </label>
              <input
                id="user-full-name"
                className={styles.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-username">
                Username
              </label>
              <input
                id="user-username"
                className={styles.input}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-permission-level">
                Permission Level
              </label>
              <select
                id="user-permission-level"
                className={styles.select}
                value={permissionLevel}
                onChange={(e) => {
                  const nextLevel = e.target.value as PermissionLevel;
                  setPermissionLevel(nextLevel);

                  if (nextLevel === "admin") {
                    setCredentialType("password");
                  }
                }}
              >
                {PERMISSION_LEVEL_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-role">
                Role
              </label>
              <select
                id="user-role"
                className={styles.select}
                value={role}
                onChange={(e) => setRole(e.target.value as WorkerRole)}
              >
                {WORKER_ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-credential-type">
                Credential Type
              </label>
              <select
                id="user-credential-type"
                className={styles.select}
                value={permissionLevel === "admin" ? "password" : credentialType}
                onChange={(e) =>
                  setCredentialType(e.target.value as CredentialType)
                }
                disabled={permissionLevel === "admin"}
              >
                <option value="pin">PIN</option>
                <option value="password">Password</option>
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-secret">
                {permissionLevel === "admin" ||
                credentialType === "password"
                  ? "Password"
                  : "PIN"}
              </label>
              <input
                id="user-secret"
                className={styles.input}
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-secret-confirm">
                Confirm{" "}
                {permissionLevel === "admin" ||
                credentialType === "password"
                  ? "Password"
                  : "PIN"}
              </label>
              <input
                id="user-secret-confirm"
                className={styles.input}
                type="password"
                value={confirmSecret}
                onChange={(e) => setConfirmSecret(e.target.value)}
              />
            </div>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleCreate()}
          >
            Create User
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Existing Users</div>

          <div className={styles.userList}>
            {sortedUsers.map((user) => (
              <div key={user.id} className={styles.userCard}>
                <div className={styles.userTop}>
                  <div>
                    <div className={styles.userName}>{user.fullName}</div>
                    <div className={styles.userMeta}>
                      @{user.username} · {getPermissionLabel(user.permissionLevel)} ·{" "}
                      {getRoleLabel(user.role)} · {user.credentialType}
                    </div>
                  </div>

                  <div className={styles.topRight}>
                    <button
                      type="button"
                      className={styles.iconDangerButton}
                      onClick={() => handleDelete(user)}
                      aria-label={`Delete user ${user.fullName}`}
                      title="Delete user"
                    >
                      <TrashIcon />
                    </button>

                    <div className={styles.badges}>
                      <span
                        className={`${styles.badge} ${
                          user.isActive ? styles.badgeActive : styles.badgeInactive
                        }`}
                      >
                        {user.isActive ? "ACTIVE" : "INACTIVE"}
                      </span>

                      {user.mustChangeCredential ? (
                        <span className={`${styles.badge} ${styles.badgeWarn}`}>
                          MUST CHANGE
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      const result = onToggleActive(user.id);
                      setMessage(result.message);
                    }}
                  >
                    {user.isActive ? "Deactivate" : "Activate"}
                  </button>

                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => {
                      setResetUserId((prev) => (prev === user.id ? null : user.id));
                      setResetSecret("");
                      setResetConfirmSecret("");
                    }}
                  >
                    Reset {user.credentialType === "pin" ? "PIN" : "Password"}
                  </button>
                </div>

                {resetUserId === user.id ? (
                  <div className={styles.resetBox}>
                    <div className={styles.resetTitle}>
                      Reset {user.credentialType === "pin" ? "PIN" : "Password"}
                    </div>

                    <div className={styles.grid}>
                      <div className={styles.field}>
                        <label className={styles.label} htmlFor={`reset-${user.id}`}>
                          New {user.credentialType === "pin" ? "PIN" : "Password"}
                        </label>
                        <input
                          id={`reset-${user.id}`}
                          className={styles.input}
                          type="password"
                          value={resetSecret}
                          onChange={(e) => setResetSecret(e.target.value)}
                        />
                      </div>

                      <div className={styles.field}>
                        <label
                          className={styles.label}
                          htmlFor={`reset-confirm-${user.id}`}
                        >
                          Confirm{" "}
                          {user.credentialType === "pin" ? "PIN" : "Password"}
                        </label>
                        <input
                          id={`reset-confirm-${user.id}`}
                          className={styles.input}
                          type="password"
                          value={resetConfirmSecret}
                          onChange={(e) => setResetConfirmSecret(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void handleReset()}
                    >
                      Save Reset
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
