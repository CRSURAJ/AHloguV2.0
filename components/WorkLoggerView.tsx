import ActionButtons from "./ActionButtons";
import LogsList from "./LogsList";
import SessionStatus from "./SessionStatus";
import WorkerForm from "./WorkerForm";
import type { WorkLoggerState } from "@/hooks/useWorkLogger";
import styles from "./WorkLogger.module.css";

export default function WorkLoggerView(props: WorkLoggerState) {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.headerCard}>
          <div className={styles.eyebrow}>Project Logu</div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>Work logger with sync tracking</h1>
            <p className={styles.subtitle}>
              UI is now separated from logic, so layout changes become much easier.
            </p>
          </div>
        </div>

        <div className={styles.grid}>
          <div className={styles.leftColumn}>
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
            />

            <ActionButtons
              isOnBreak={props.isOnBreak}
              canStart={props.canStart}
              canBreak={props.canBreak}
              canStop={props.canStop}
              canClearAll={props.canClearAll}
              handleStart={props.handleStart}
              handleBreak={props.handleBreak}
              handleStop={props.handleStop}
              handleSync={props.handleSync}
              handleClearAll={props.handleClearAll}
            />
          </div>

          <div className={styles.rightColumn}>
            <SessionStatus
              workingStatusText={props.workingStatusText}
              isWorking={props.isWorking}
              isOnBreak={props.isOnBreak}
              unsyncedCount={props.unsyncedCount}
              syncedCount={props.syncedCount}
              failedCount={props.failedCount}
              totalLogs={props.logs.length}
              bannerMessage={props.bannerMessage}
            />
          </div>
        </div>

        <LogsList
          logs={props.logs}
          expandedLogId={props.expandedLogId}
          toggleExpandedLog={props.toggleExpandedLog}
          getSyncBadgeClass={props.getSyncBadgeClass}
        />
      </div>
    </main>
  );
}
