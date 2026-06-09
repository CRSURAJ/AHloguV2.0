"use client";

import type { AwsUserListItem } from "./UserManagementPanel";
import UserListRow from "./UserListRow";
import styles from "./UserManagementPanel.module.css";

type UserListSectionProps = {
  users: AwsUserListItem[];
  currentUserId: string;
  loading: boolean;
  isAdminActor: boolean;
  isManagerActor: boolean;
  updatingUserId: string;
  resettingUserId: string;
  deletingUserId: string;
  onRefresh: () => void;
  onOpenResetPassword: (user: AwsUserListItem) => void;
  onToggleActive: (user: AwsUserListItem) => Promise<void>;
  onDeleteUser: (user: AwsUserListItem) => Promise<void>;
};

export default function UserListSection({
  users,
  currentUserId,
  loading,
  isAdminActor,
  isManagerActor,
  updatingUserId,
  resettingUserId,
  deletingUserId,
  onRefresh,
  onOpenResetPassword,
  onToggleActive,
  onDeleteUser,
}: UserListSectionProps) {
  return (
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
        {loading && users.length === 0 ? (
          <div className={styles.userCard}>Loading users...</div>
        ) : null}

        {!loading && users.length === 0 ? (
          <div className={styles.userCard}>No AWS users found.</div>
        ) : null}

        {users.map((user) => (
          <UserListRow
            currentUserId={currentUserId}
            deletingUserId={deletingUserId}
            isAdminActor={isAdminActor}
            isManagerActor={isManagerActor}
            key={user.id || user.email}
            onDeleteUser={onDeleteUser}
            onOpenResetPassword={onOpenResetPassword}
            onToggleActive={onToggleActive}
            resettingUserId={resettingUserId}
            updatingUserId={updatingUserId}
            user={user}
          />
        ))}
      </div>
    </section>
  );
}
