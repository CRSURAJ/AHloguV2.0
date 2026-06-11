"use client";

import type { AwsUserListItem } from "./UserManagementPanel";
import { getPermissionLabel, getRoleLabel } from "./userManagementHelpers";
import styles from "./UserManagementPanel.module.css";

type UserListRowProps = {
  user: AwsUserListItem;
  currentUserId: string;
  isAdminActor: boolean;
  isManagerActor: boolean;
  updatingUserId: string;
  resettingUserId: string;
  deletingUserId: string;
  onOpenResetPassword: (user: AwsUserListItem) => void;
  onToggleActive: (user: AwsUserListItem) => Promise<void>;
  onDeleteUser: (user: AwsUserListItem) => Promise<void>;
};

export default function UserListRow({
  user,
  currentUserId,
  isAdminActor,
  isManagerActor,
  updatingUserId,
  resettingUserId,
  deletingUserId,
  onOpenResetPassword,
  onToggleActive,
  onDeleteUser,
}: UserListRowProps) {
  const isCurrentUser = user.id === currentUserId;
  const isUpdatingUser = updatingUserId === user.id;
  const isResettingUser = resettingUserId === user.id;
  const isDeletingUser = deletingUserId === user.id;
  const canManageUser = isAdminActor || (isManagerActor && user.permissionLevel !== "admin");
  const canDeleteUser = isAdminActor;
  const actionsDisabled =
    isCurrentUser || isUpdatingUser || isResettingUser || isDeletingUser || !user.id;

  return (
    <div className={styles.userCard}>
      <div className={styles.userTop}>
        <div>
          <div className={styles.userName}>{user.fullName || user.email || "Unnamed user"}</div>
          <div className={styles.userMeta}>
            {user.email || user.username} · {getPermissionLabel(user.permissionLevel)} ·{" "}
            {getRoleLabel(user.role)}
          </div>
        </div>

        <div className={styles.topRight}>
          {isCurrentUser ? <span className={styles.selfUserBadge}>Current admin</span> : null}

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
            onClick={() => onOpenResetPassword(user)}
            disabled={actionsDisabled}
          >
            {isResettingUser ? "Resetting..." : "Reset Password"}
          </button>
        ) : null}

        {canManageUser ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void onToggleActive(user)}
            disabled={actionsDisabled}
          >
            {isUpdatingUser ? "Updating..." : user.isActive ? "Deactivate" : "Activate"}
          </button>
        ) : null}

        {canDeleteUser ? (
          <button
            type="button"
            className={styles.dangerButton}
            onClick={() => void onDeleteUser(user)}
            disabled={actionsDisabled}
          >
            {isDeletingUser ? "Deleting..." : "Delete"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
