import { ActionButtons, LogsList, WorkerForm } from "@/components";


import type { WorkLoggerState } from "@/hooks/useWorkLogger";
import styles from "./WorkLoggerView.module.css";

export default function WorkLoggerView(props: WorkLoggerState) {
  const pillClass = props.isOnBreak
    ? styles.statusBreak
    : props.isWorking
      ? styles.statusWorking
      : styles.statusReady;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.outerFrame}>
          <header className={styles.topHeader}>
            <div className={styles.brandWrap}>
              <div className={styles.brandIcon}>AH</div>
              <div className={styles.brandText}>
                <h1 className={styles.pageTitle}>AHlogu</h1>
              </div>
            </div>
          </header>

          <section className={styles.entryCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>New Log Entry</h2>
              </div>

              <div className={`${styles.statusPill} ${pillClass}`}>
                {props.workingStatusText}
              </div>
            </div>

            <WorkerForm
              fullNameOptions={props.fullNameOptions}
              fullname={props.fullname}
              setFullname={props.setFullname}
              jobId={props.jobId}
              setJobId={props.setJobId}
              role={props.role}
              setRole={props.setRole}
              location={props.location}
              setLocation={props.setLocation}
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
          </section>

          <LogsList
            logs={props.logs}
            expandedLogId={props.expandedLogId}
            toggleExpandedLog={props.toggleExpandedLog}
            getSyncBadgeClass={props.getSyncBadgeClass}
          />
        </div>
      </div>
    </main>
  );
}
