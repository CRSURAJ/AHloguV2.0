"use client";

import Image from "next/image";

import type { CurrentUser } from "@/types/work";
import workerStyles from "@/components/WorkLoggerView/WorkLoggerView.module.css";
import styles from "./AdminDashboard.module.css";

type AdminDashboardProps = {
  currentUser: CurrentUser;
  securityLabel: string;
  onOpenSecurity: () => void;
  onOpenUserManagement: () => void;
  onOpenJobManagement: () => void;
  onSignOut: () => void;
};

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4Z"
      />
    </svg>
  );
}

function JobIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <path
        fill="currentColor"
        d="M10 4h4a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v4h-7v2h-4v-2H3V9a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2Zm0 3h4V6h-4v1Zm11 8v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3h7v2h4v-2h7Z"
      />
    </svg>
  );
}

function LogsIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.icon} aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 3h10a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2-2-1.33V5a2 2 0 0 1 2-2Zm2 5v2h6V8H9Zm0 4v2h6v-2H9Zm0 4v2h4v-2H9Z"
      />
    </svg>
  );
}

export default function AdminDashboard({
  currentUser,
  securityLabel,
  onOpenSecurity,
  onOpenUserManagement,
  onOpenJobManagement,
  onSignOut,
}: AdminDashboardProps) {
  return (
    <div className={workerStyles.page}>
      <div className={workerStyles.shell}>
        <div className={workerStyles.outerFrame}>
          <div className={workerStyles.topHeader}>
            <div className={workerStyles.brandWrap}>
              <Image
                src="/AHlogu.png"
                alt="AH LOGU"
                width={160}
                height={48}
                className={workerStyles.logoImage}
                priority
              />
            </div>
          </div>

          <section className={workerStyles.entryCard}>
            <div className={workerStyles.cardHeader}>
              <div className={workerStyles.headerText}>
                <h1 className={workerStyles.cardTitle}>
                  Hi, {currentUser.fullName}!
                </h1>

                <div className={workerStyles.headerMetaRow}>
                  <span
                    className={`${workerStyles.statusPill} ${workerStyles.statusReady}`}
                  >
                    Admin Mode
                  </span>
                </div>
              </div>

              <div className={workerStyles.headerMetaRow}>
                <button
                  type="button"
                  className={workerStyles.secondaryButton}
                  onClick={onOpenSecurity}
                >
                  {securityLabel}
                </button>

                <button
                  type="button"
                  className={workerStyles.signOutButton}
                  onClick={onSignOut}
                >
                  Sign out
                </button>
              </div>
            </div>

            <div className={workerStyles.banner}>
              Admin users manage the system from here. Worker start, break, and
              stop controls are hidden for admin accounts.
            </div>

            <div className={styles.actionGrid}>
              <button
                type="button"
                className={styles.actionCard}
                onClick={onOpenUserManagement}
              >
                <span className={styles.iconBox}>
                  <UserIcon />
                </span>

                <span className={styles.actionContent}>
                  <span className={styles.actionTitle}>User Management</span>
                  <span className={styles.actionText}>
                    Create users, reset credentials, and manage worker access.
                  </span>
                </span>

                <span className={styles.actionArrow}>→</span>
              </button>

              <button type="button" className={styles.actionCard} onClick={onOpenJobManagement}>
                <span className={styles.iconBox}>
                  <JobIcon />
                </span>

                <span className={styles.actionContent}>
                  <span className={styles.actionTitle}>Job Management</span>
                  <span className={styles.actionText}>
                    Add jobs and assign them to existing worker roles.
                  </span>
                </span>

                <span className={styles.actionArrow}>→</span>
              </button>

              <button type="button" className={styles.actionCardMuted} disabled>
                <span className={styles.iconBoxMuted}>
                  <LogsIcon />
                </span>

                <span className={styles.actionContent}>
                  <span className={styles.actionTitle}>Work Logs</span>
                  <span className={styles.actionText}>
                    Review submitted logs, sync status, and future exports.
                  </span>
                </span>

                <span className={styles.badge}>Later</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
