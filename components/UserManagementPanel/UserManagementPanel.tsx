"use client";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";
import FeedbackMessage from "@/components/FeedbackMessage";
import { getPasswordPolicyError } from "@/lib/auth/passwordPolicy";
import { useMemo, useRef, useState, type FormEvent } from "react";
import styles from "./UserManagementPanel.module.css";
import { PERMISSION_LEVEL_OPTIONS, WORKER_ROLE_OPTIONS } from "@/types/work";
import type { AuthActionResult, PermissionLevel, WorkerRole } from "@/types/work";

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

type CreateUserField =
  | "fullName"
  | "email"
  | "permissionLevel"
  | "role"
  | "temporaryPassword"
  | "confirmTemporaryPassword";

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
  return WORKER_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

function getPermissionLabel(permissionLevel: PermissionLevel): string {
  return (
    PERMISSION_LEVEL_OPTIONS.find((item) => item.value === permissionLevel)?.label ??
    permissionLevel
  );
}

function isValidEmailAddress(email: string): boolean {
  const value = email.trim().toLowerCase();

  if (!value) {
    return false;
  }

  if (value.length > 254) {
    return false;
  }

  if (value.includes("..")) {
    return false;
  }

  if (value.startsWith(".") || value.endsWith(".")) {
    return false;
  }

  const parts = value.split("@");

  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domainPart] = parts;

  if (!localPart || !domainPart) {
    return false;
  }

  if (localPart.length > 64) {
    return false;
  }

  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    domainPart.startsWith(".") ||
    domainPart.endsWith(".")
  ) {
    return false;
  }

  const domainLabels = domainPart.split(".");

  if (domainLabels.length < 2) {
    return false;
  }

  if (domainLabels.some((label) => !label || label.startsWith("-") || label.endsWith("-"))) {
    return false;
  }

  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value);
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
  const [permissionLevel, setPermissionLevel] = useState<PermissionLevel>("worker");
  const [role, setRole] = useState<WorkerRole>("plumber");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");
  const [deletingUserId, setDeletingUserId] = useState("");
  const [resetTargetUser, setResetTargetUser] = useState<AwsUserListItem | null>(null);
  const [resetTemporaryPassword, setResetTemporaryPassword] = useState("");
  const [resetConfirmTemporaryPassword, setResetConfirmTemporaryPassword] = useState("");
  const [resetPasswordMessage, setResetPasswordMessage] = useState("");
  const [createErrorField, setCreateErrorField] = useState<CreateUserField | "">("");
  const [createShakeField, setCreateShakeField] = useState<CreateUserField | "">("");

  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const permissionLevelInputRef = useRef<HTMLSelectElement>(null);
  const roleInputRef = useRef<HTMLSelectElement>(null);
  const temporaryPasswordInputRef = useRef<HTMLInputElement>(null);
  const confirmTemporaryPasswordInputRef = useRef<HTMLInputElement>(null);
  const userFeedbackRef = useRef<HTMLDivElement>(null);
  const resetPasswordCardRef = useRef<HTMLFormElement>(null);

  const currentUser = users.find((user) => user.id === currentUserId);
  const currentPermissionLevel = currentUser?.permissionLevel ?? "admin";
  const isAdminActor = currentPermissionLevel === "admin";
  const isManagerActor = currentPermissionLevel === "manager";

  const createPermissionOptions = useMemo(
    () =>
      isManagerActor
        ? PERMISSION_LEVEL_OPTIONS.filter((item) => item.value !== "admin")
        : PERMISSION_LEVEL_OPTIONS,
    [isManagerActor],
  );

  const sortedUsers = useMemo(
    () =>
      [...users]
        .filter((user) => user.id !== currentUserId)
        .filter((user) => !isManagerActor || user.permissionLevel !== "admin")
        .sort((a, b) => {
          const permissionRank: Record<PermissionLevel, number> = {
            admin: 0,
            manager: 1,
            worker: 2,
          };

          if (a.permissionLevel !== b.permissionLevel) {
            return permissionRank[a.permissionLevel] - permissionRank[b.permissionLevel];
          }

          return (a.email || a.username).localeCompare(b.email || b.username);
        }),
    [users, currentUserId, isManagerActor],
  );

  const displayMessage = localMessage || message;

  function getCreateInputClass(field: CreateUserField): string {
    return [
      styles.input,
      createErrorField === field ? styles.inputError : "",
      createShakeField === field ? styles.shakeField : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getCreateSelectClass(field: CreateUserField): string {
    return [
      styles.select,
      createErrorField === field ? styles.inputError : "",
      createShakeField === field ? styles.shakeField : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function clearCreateError(field: CreateUserField): void {
    if (createErrorField === field) {
      setCreateErrorField("");
    }
  }

  function markCreateError(
    field: CreateUserField,
    errorMessage: string,
    inputRef: {
      readonly current: HTMLInputElement | HTMLSelectElement | null;
    },
  ): void {
    setLocalMessage(errorMessage);
    setCreateErrorField(field);
    setCreateShakeField("");

    window.setTimeout(() => {
      setCreateShakeField(field);
      inputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      inputRef.current?.focus({ preventScroll: true });
    }, 0);

    window.setTimeout(() => {
      setCreateShakeField("");
    }, 420);
  }

  function focusResetPasswordCard(): void {
    window.setTimeout(() => {
      resetPasswordCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      resetPasswordCardRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  function focusUserFeedbackMessage(): void {
    window.setTimeout(() => {
      userFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      userFeedbackRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  async function handleCreate(): Promise<void> {
    setLocalMessage("");

    const trimmedFullName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedFullName) {
      markCreateError("fullName", "Full name is required.", fullNameInputRef);
      return;
    }

    if (!trimmedEmail) {
      markCreateError("email", "Email is required.", emailInputRef);
      return;
    }

    if (!isValidEmailAddress(trimmedEmail)) {
      markCreateError("email", "Enter a valid email address.", emailInputRef);
      return;
    }

    if (!permissionLevel) {
      markCreateError("permissionLevel", "Permission level is required.", permissionLevelInputRef);
      return;
    }

    if (isManagerActor && permissionLevel === "admin") {
      markCreateError(
        "permissionLevel",
        "Managers cannot create admin users.",
        permissionLevelInputRef,
      );
      return;
    }

    if (!role) {
      markCreateError("role", "Role is required.", roleInputRef);
      return;
    }

    if (!temporaryPassword) {
      markCreateError(
        "temporaryPassword",
        "Temporary password is required.",
        temporaryPasswordInputRef,
      );
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(temporaryPassword, "Temporary password");

    if (passwordPolicyError) {
      markCreateError("temporaryPassword", passwordPolicyError, temporaryPasswordInputRef);
      return;
    }

    if (!confirmTemporaryPassword) {
      markCreateError(
        "confirmTemporaryPassword",
        "Confirm temporary password is required.",
        confirmTemporaryPasswordInputRef,
      );
      return;
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      markCreateError(
        "confirmTemporaryPassword",
        "Temporary passwords do not match.",
        confirmTemporaryPasswordInputRef,
      );
      return;
    }

    setCreateErrorField("");
    setCreateShakeField("");
    setCreating(true);

    try {
      const result = await onCreateUser({
        email: trimmedEmail,
        fullName: trimmedFullName,
        permissionLevel,
        role,
        temporaryPassword,
        confirmTemporaryPassword,
      });

      setLocalMessage(result.message);
      focusUserFeedbackMessage();

      if (result.ok) {
        setFullName("");
        setEmail("");
        setPermissionLevel("worker");
        setRole("plumber");
        setTemporaryPassword("");
        setConfirmTemporaryPassword("");
        setCreateErrorField("");
        setCreateShakeField("");
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
      focusUserFeedbackMessage();
    } finally {
      setUpdatingUserId("");
    }
  }

  function handleOpenResetPassword(user: AwsUserListItem): void {
    setLocalMessage("");

    if (user.id === currentUserId) {
      setLocalMessage("You cannot reset your own admin password from User Management.");
      return;
    }

    setResetTargetUser(user);
    setResetTemporaryPassword("");
    setResetConfirmTemporaryPassword("");
    setResetPasswordMessage("");
    focusResetPasswordCard();
  }

  function handleCloseResetPassword(): void {
    if (resettingUserId) {
      return;
    }

    setResetTargetUser(null);
    setResetTemporaryPassword("");
    setResetConfirmTemporaryPassword("");
    setResetPasswordMessage("");
  }

  async function handleSubmitResetPassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setResetPasswordMessage("");
    setLocalMessage("");

    if (!resetTargetUser) {
      return;
    }

    if (!resetTemporaryPassword.trim()) {
      setResetPasswordMessage("Temporary password is required.");
      return;
    }

    const passwordPolicyError = getPasswordPolicyError(
      resetTemporaryPassword,
      "Temporary password",
    );

    if (passwordPolicyError) {
      setResetPasswordMessage(passwordPolicyError);
      return;
    }

    if (!resetConfirmTemporaryPassword.trim()) {
      setResetPasswordMessage("Confirm temporary password is required.");
      return;
    }

    if (resetTemporaryPassword !== resetConfirmTemporaryPassword) {
      setResetPasswordMessage("Temporary passwords do not match.");
      return;
    }

    setResettingUserId(resetTargetUser.id);

    try {
      const result = await onResetPassword(resetTargetUser.id, resetTemporaryPassword);

      if (result.ok) {
        setResetTargetUser(null);
        setResetTemporaryPassword("");
        setResetConfirmTemporaryPassword("");
        setResetPasswordMessage("");
        setLocalMessage(result.message);
        focusUserFeedbackMessage();
        return;
      }

      setResetPasswordMessage(result.message);
      focusResetPasswordCard();
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
    const confirmed = window.confirm(`Delete ${label}? This will remove the user from AHlogu.`);

    if (!confirmed) {
      return;
    }

    setDeletingUserId(user.id);

    try {
      const result = await onDeleteUser(user.id);
      setLocalMessage(result.message);
      focusUserFeedbackMessage();
    } finally {
      setDeletingUserId("");
    }
  }

  return (
    <div className={styles.backdrop}>
      {resetTargetUser ? (
        <div className={styles.modalBackdrop}>
          <form
            ref={resetPasswordCardRef}
            tabIndex={-1}
            className={styles.modalCard}
            onSubmit={(event) => void handleSubmitResetPassword(event)}
          >
            <h2 className={styles.modalTitle}>Reset Password</h2>

            <p className={styles.modalDescription}>
              Set a temporary password for{" "}
              <strong>
                {resetTargetUser.fullName ||
                  resetTargetUser.email ||
                  resetTargetUser.username ||
                  "this user"}
              </strong>
              . They will be asked to choose a new password on next sign in.
            </p>

            <FeedbackMessage message={resetPasswordMessage} />

            <label className={styles.field}>
              <span className={styles.label}>Temporary Password</span>
              <input
                className={styles.input}
                type="password"
                value={resetTemporaryPassword}
                onChange={(event) => setResetTemporaryPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Confirm Temporary Password</span>
              <input
                className={styles.input}
                type="password"
                value={resetConfirmTemporaryPassword}
                onChange={(event) => setResetConfirmTemporaryPassword(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>

            <PasswordRequirementsNote compact />

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCloseResetPassword}
                disabled={Boolean(resettingUserId)}
              >
                Cancel
              </button>

              <button
                type="submit"
                className={styles.primaryButton}
                disabled={Boolean(resettingUserId)}
              >
                {resettingUserId ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>User Management</h3>
            <p className={styles.subtitle}>
              Create users, assign Admin/Manager/Worker access and trade role, then store the
              matching profile in AHloguUsers.
            </p>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div ref={userFeedbackRef} tabIndex={-1} className={styles.feedbackFocusTarget}>
          <FeedbackMessage message={displayMessage} />
        </div>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Add User</div>

          <div className={styles.grid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-full-name">
                Full Name
              </label>
              <input
                id="user-full-name"
                ref={fullNameInputRef}
                className={getCreateInputClass("fullName")}
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  clearCreateError("fullName");
                }}
                aria-invalid={createErrorField === "fullName"}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-email">
                Email
              </label>
              <input
                id="user-email"
                ref={emailInputRef}
                className={getCreateInputClass("email")}
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearCreateError("email");
                }}
                aria-invalid={createErrorField === "email"}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-permission-level">
                Permission Level
              </label>
              <select
                id="user-permission-level"
                ref={permissionLevelInputRef}
                className={getCreateSelectClass("permissionLevel")}
                value={permissionLevel}
                onChange={(event) => {
                  setPermissionLevel(event.target.value as PermissionLevel);
                  clearCreateError("permissionLevel");
                }}
                aria-invalid={createErrorField === "permissionLevel"}
              >
                {createPermissionOptions.map((item) => (
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
                ref={roleInputRef}
                className={getCreateSelectClass("role")}
                value={role}
                onChange={(event) => {
                  setRole(event.target.value as WorkerRole);
                  clearCreateError("role");
                }}
                aria-invalid={createErrorField === "role"}
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
                ref={temporaryPasswordInputRef}
                className={getCreateInputClass("temporaryPassword")}
                type="password"
                value={temporaryPassword}
                onChange={(event) => {
                  setTemporaryPassword(event.target.value);
                  clearCreateError("temporaryPassword");
                }}
                aria-invalid={createErrorField === "temporaryPassword"}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="user-temp-password-confirm">
                Confirm Temporary Password
              </label>

              <input
                id="user-temp-password-confirm"
                ref={confirmTemporaryPasswordInputRef}
                className={getCreateInputClass("confirmTemporaryPassword")}
                type="password"
                value={confirmTemporaryPassword}
                onChange={(event) => {
                  setConfirmTemporaryPassword(event.target.value);
                  clearCreateError("confirmTemporaryPassword");
                }}
                aria-invalid={createErrorField === "confirmTemporaryPassword"}
              />
            </div>

            <div className={styles.passwordRequirementsRow}>
              <PasswordRequirementsNote compact />
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
              const canManageUser =
                isAdminActor || (isManagerActor && user.permissionLevel !== "admin");
              const canDeleteUser = isAdminActor;

              return (
                <div key={user.id || user.email} className={styles.userCard}>
                  <div className={styles.userTop}>
                    <div>
                      <div className={styles.userName}>
                        {user.fullName || user.email || "Unnamed user"}
                      </div>
                      <div className={styles.userMeta}>
                        {user.email || user.username} · {getPermissionLabel(user.permissionLevel)} ·{" "}
                        {getRoleLabel(user.role)}
                      </div>
                    </div>

                    <div className={styles.topRight}>
                      {isCurrentUser ? (
                        <span className={styles.selfUserBadge}>Current admin</span>
                      ) : null}

                      <div className={styles.badges}>
                        <span
                          className={`${styles.badge} ${
                            user.isActive ? styles.badgeActive : styles.badgeInactive
                          }`}
                        >
                          {user.isActive ? "ACTIVE" : "INACTIVE"}
                        </span>

                        {user.permissionLevel === "admin" ? (
                          <span className={`${styles.badge} ${styles.badgeWarn}`}>ADMIN</span>
                        ) : null}

                        {user.permissionLevel === "manager" ? (
                          <span className={styles.badge}>MANAGER</span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className={styles.actions}>
                    {canManageUser ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleOpenResetPassword(user)}
                        disabled={
                          isCurrentUser ||
                          isUpdatingUser ||
                          isResettingUser ||
                          isDeletingUser ||
                          !user.id
                        }
                      >
                        {isResettingUser ? "Resetting..." : "Reset Password"}
                      </button>
                    ) : null}

                    {canManageUser ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => void handleToggleActive(user)}
                        disabled={
                          isCurrentUser ||
                          isUpdatingUser ||
                          isResettingUser ||
                          isDeletingUser ||
                          !user.id
                        }
                      >
                        {isUpdatingUser ? "Updating..." : user.isActive ? "Deactivate" : "Activate"}
                      </button>
                    ) : null}

                    {canDeleteUser ? (
                      <button
                        type="button"
                        className={styles.dangerButton}
                        onClick={() => void handleDeleteUser(user)}
                        disabled={
                          isCurrentUser ||
                          isUpdatingUser ||
                          isResettingUser ||
                          isDeletingUser ||
                          !user.id
                        }
                      >
                        {isDeletingUser ? "Deleting..." : "Delete"}
                      </button>
                    ) : null}
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
