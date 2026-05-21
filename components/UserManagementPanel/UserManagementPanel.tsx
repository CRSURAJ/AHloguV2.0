"use client";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";
import {
  PASSWORD_REQUIREMENTS_TEXT,
  getPasswordPolicyError,
} from "@/lib/auth/passwordPolicy";
import { useMemo, useState } from "react";
import styles from "./UserManagementPanel.module.css";
import {
  PERMISSION_LEVEL_OPTIONS,
  WORKER_ROLE_OPTIONS,
} from "@/types/work";
import type {
  AuthActionResult,
  PermissionLevel,
  WorkerRole,
} from "@/types/work";

export type AwsUserListItem = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  permissionLevel: PermissionLevel;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateAwsUserInput = {
  email: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
};

type UserManagementPanelProps = {
  users: AwsUserListItem[];
  currentUserId: string;
  loading: boolean;
  message: string;
  onClose: () => void;
  onRefresh: () => void;
  onCreateUser: (input: CreateAwsUserInput) => Promise<AuthActionResult>;
  onToggleActive: (userId: string, isActive: boolean) => Promise<AuthActionResult>;
  onResetPassword: (userId: string, temporaryPassword: string) => Promise<AuthActionResult>;
  onDeleteUser: (userId: string) => Promise<AuthActionResult>;
};

function getRoleLabel(role: string): string {
  return (
    WORKER_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role
  );
}

function getPermissionLabel(permissionLevel: PermissionLevel): string {
  return (
    PERMISSION_LEVEL_OPTIONS.find((item) => item.value === permissionLevel)
      ?.label ?? permissionLevel
  );
}

export default function UserManagementPanel({
  users,
  currentUserId,
  loading,
  message,
  onClose,
  onRefresh,
  onCreateUser,
  onToggleActive,
  onResetPassword,
  onDeleteUser,
}: UserManagementPanelProps) {
  const [localMessage, setLocalMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [permissionLevel, setPermissionLevel] =
    useState<PermissionLevel>("user");
  const [role, setRole] = useState<WorkerRole>("plumber");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");

  const sortedUsers = useMemo(
    () =>
      [...users].filter((user) => user.id !== currentUserId).sort((a, b) => {
        if (a.permissionLevel !== b.permissionLevel) {
          return a.permissionLevel === "admin" ? -1 : 1;
        }

        return (a.email || a.username).localeCompare(b.email || b.username);
      }),
    [users, currentUserId],
  );

  const displayMessage = localMessage || message;

  async function handleCreate(): Promise<void> {
    setLocalMessage("");

    if (temporaryPassword !== confirmTemporaryPassword) {
      setLocalMessage("Passwords do not match.");
      return;
    }

    setCreating(true);

    try {
      const result = await onCreateUser({
        email,
        fullName,
        permissionLevel,
        role,
        temporaryPassword,
        confirmTemporaryPassword,
      });

      setLocalMessage(result.message);

      if (result.ok) {
        setFullName("");
        setEmail("");
        setPermissionLevel("user");
        setRole("plumber");
        setTemporaryPassword("");
        setConfirmTemporaryPassword("");
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(user: AwsUserListItem): Promise<void> {
    setLocalMessage("");

    if (user.id === currentUserId) {
      setLocalMessage("You cannot deactivate your own admin account.");
      return;
    }

    const nextActiveState = !user.isActive;

    setUpdatingUserId(user.id);

    try {
      const result = await onToggleActive(user.id, nextActiveState);
      setLocalMessage(result.message);
    } finally {
      setUpdatingUserId("");
    }
  }

  async function handleResetPassword(user: AwsUserListItem): Promise<void> {
    setLocalMessage("");

    if (user.id === currentUserId) {
      setLocalMessage("You cannot reset your own admin password from User Management.");
      return;
    }

    const label = user.fullName || user.email || user.username || "this user";
const temporaryPassword = window.prompt(
  `Enter a temporary password for ${label}.

Password requirements:
- ${PASSWORD_REQUIREMENTS_TEXT}

The user will need to set a new password on next sign-in.`,
);

    if (temporaryPassword === null) {
      return;
    }

    const confirmTemporaryPassword = window.prompt(
      "Confirm the temporary password.",
    );

    if (confirmTemporaryPassword === null) {
      return;
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      setLocalMessage("Temporary passwords do not match.");
      return;
    }

const passwordPolicyError = getPasswordPolicyError(
  temporaryPassword,
  "Temporary password",
);
if (passwordPolicyError) {
  setLocalMessage(passwordPolicyError);
  return;
}

    setResettingUserId(user.id);

    try {
      const result = await onResetPassword(user.id, temporaryPassword);
      setLocalMessage(result.message);
    } finally {
      setResettingUserId("");
    }
  }

  async function handleDeleteUser(user: AwsUserListItem): Promise<void> {
    setLocalMessage("");

    if (user.id === currentUserId) {
      setLocalMessage("You cannot delete your own admin account.");
      return;
    }

    const label = user.fullName || user.email || user.username || "this user";
    const confirmed = window.confirm(
      `Delete ${label}? This will remove the user from AHlogu.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);

    try {
      const result = await onDeleteUser(user.id);
      setLocalMessage(result.message);
    } finally {
      setDeletingUserId("");
    }
  }

  return (
    <div className={styles.backdrop}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>User Management</h3>
            <p className={styles.subtitle}>
              Create users, assign admin/user access and trade role,
              then store the matching profile in AHloguUsers.
            </p>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        {displayMessage ? (
          <div className={styles.message}>{displayMessage}</div>
        ) : null}

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
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-email">
                Email
              </label>
              <input
                id="user-email"
                className={styles.input}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
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
                onChange={(event) =>
                  setPermissionLevel(event.target.value as PermissionLevel)
                }
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
                onChange={(event) => setRole(event.target.value as WorkerRole)}
              >
                {WORKER_ROLE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-temp-password">
                Temporary Password
              </label>
              <input
                id="user-temp-password"
                className={styles.input}
                type="password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label
                className={styles.label}
                htmlFor="user-temp-password-confirm"
              >
                Confirm Temporary Password
              </label>
<PasswordRequirementsNote compact />
              <input
                id="user-temp-password-confirm"
                className={styles.input}
                type="password"
                value={confirmTemporaryPassword}
                onChange={(event) =>
                  setConfirmTemporaryPassword(event.target.value)
                }
              />
            </div>
          </div>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? "Creating User..." : "Create User"}
          </button>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Existing Users</div>

          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRefresh}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Users"}
          </button>

          <div className={styles.userList}>
            {loading && sortedUsers.length === 0 ? (
              <div className={styles.userCard}>Loading users...</div>
            ) : null}

            {!loading && sortedUsers.length === 0 ? (
              <div className={styles.userCard}>No AWS users found.</div>
            ) : null}

            {sortedUsers.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              const isUpdatingUser = updatingUserId === user.id;
              const isResettingUser = resettingUserId === user.id;
              const isDeletingUser = deletingUserId === user.id;

              return (
                <div key={user.id || user.email} className={styles.userCard}>
                  <div className={styles.userTop}>
                    <div>
                      <div className={styles.userName}>
                        {user.fullName || user.email || "Unnamed user"}
                      </div>
                      <div className={styles.userMeta}>
                        {user.email || user.username} ·{" "}
                        {getPermissionLabel(user.permissionLevel)} ·{" "}
                        {getRoleLabel(user.role)}
                      </div>
                    </div>

                    <div className={styles.topRight}>
                      {isCurrentUser ? (
                        <span className={styles.selfUserBadge}>
                          Current admin
                        </span>
                      ) : null}

                      <div className={styles.badges}>
                        <span
                          className={`${styles.badge} ${
                            user.isActive
                              ? styles.badgeActive
                              : styles.badgeInactive
                          }`}
                        >
                          {user.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>

                        {user.permissionLevel === "admin" ? (
                          <span className={`${styles.badge} ${styles.badgeWarn}`}>
                            ADMIN
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void handleResetPassword(user)}
                      disabled={isCurrentUser || isUpdatingUser || isResettingUser || isDeletingUser || !user.id}
                    >
                      {isResettingUser ? "Resetting..." : "Reset Password"}
                    </button>

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void handleToggleActive(user)}
                      disabled={isCurrentUser || isUpdatingUser || isResettingUser || isDeletingUser || !user.id}
                    >
                      {isUpdatingUser
                        ? "Updating..."
                        : user.isActive
                          ? "Deactivate User"
                          : "Activate User"}
                    </button>

                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void handleDeleteUser(user)}
                      disabled={isCurrentUser || isUpdatingUser || isResettingUser || isDeletingUser || !user.id}
                    >
                      {isDeletingUser ? "Deleting..." : "🗑 Delete User"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
