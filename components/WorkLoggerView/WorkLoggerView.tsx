import Image from "next/image";
import { ActionButtons, LogsList, WorkerForm } from "@/components";
import type { WorkLoggerState } from "@/hooks/useWorkLogger";
import type { CurrentUser } from "@/types/work";
import styles from "./WorkLoggerView.module.css";

type WorkLoggerViewProps = WorkLoggerState & {
  currentUser: CurrentUser;
  onSignOut: () => void;
  onOpenSecurity: () => void;
  onOpenUserManagement: () => void;
  canManageUsers: boolean;
  securityLabel: string;
};

export default function WorkLoggerView(props: WorkLoggerViewProps) {
  const pillClass = props.isOnBreak
    ? styles.statusBreak
    : props.isWorking
      ? styles.statusWorking
      : styles.statusReady;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.outerFrame}>
          <div className={styles.topHeader}>
            <div className={styles.brandWrap}>
              <Image
                src="/AHlogu.png"
                alt="AH LOGU"
                width={160}
                height={48}
                className={styles.logoImage}
                priority
              />
            </div>
          </div>

          <section className={styles.entryCard}>
            <div className={styles.cardHeader}>
              <div className={styles.headerText}>
                <h1 className={styles.cardTitle}>Hi, {props.currentUserFullName}!</h1>

                <div className={styles.headerMetaRow}>
                  <span className={`${styles.statusPill} ${pillClass}`}>
                    {props.workingStatusText}
                  </span>
                </div>
              </div>

              <div className={styles.headerMetaRow}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={props.onOpenSecurity}
                >
                  {props.securityLabel}
                </button>

                {props.canManageUsers ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={props.onOpenUserManagement}
                  >
                    User Management
                  </button>
                ) : null}

                <button
                  type="button"
                  className={styles.signOutButton}
                  onClick={props.onSignOut}
                >
                  Sign out
                </button>
              </div>
            </div>

            <WorkerForm
              jobId={props.jobId}
              setJobId={props.setJobId}
              availableJobs={props.availableJobs}
              location={props.location}
              setLocation={props.setLocation}
              jobDocs={props.jobDocs}
              setJobDocs={props.setJobDocs}
              description={props.description}
              setDescription={props.setDescription}
              isWorking={props.isWorking}
              isOnBreak={props.isOnBreak}
            />

            <ActionButtons
              isOnBreak={props.isOnBreak}
              canStart={props.canStart}
              canBreak={props.canBreak}
              canStop={props.canStop}
              canClearAll={props.canClearAll}
              unsyncedCount={props.unsyncedCount}
              failedCount={props.failedCount}
              handleStart={props.handleStart}
              handleBreak={props.handleBreak}
              handleStop={props.handleStop}
              handleSync={props.handleSync}
              handleClearAll={props.handleClearAll}
            />

            <LogsList
              logs={props.logs}
              expandedLogId={props.expandedLogId}
              toggleExpandedLog={props.toggleExpandedLog}
              getSyncBadgeClass={props.getSyncBadgeClass}
              onDelete={props.handleDeleteLog}
              onStickyNoteChange={props.handleStickyNoteChange}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
