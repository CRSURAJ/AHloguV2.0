"use client";

import Image from "next/image";
import { useState } from "react";
import { ActionButtons, LogsList, WorkerForm } from "@/components";
import type { WorkLoggerState } from "@/hooks/useWorkLogger";
import type { CurrentUser } from "@/types/work";
import styles from "./WorkLoggerView.module.css";

const CUSTOM_SWITCH_JOB_OPTION = "__custom_switch_job__";

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

  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchJobId, setSwitchJobId] = useState("");
  const [switchCustomJobMode, setSwitchCustomJobMode] = useState(false);
  const [switchLocation, setSwitchLocation] = useState("");
  const [switchLocationPlaceholder, setSwitchLocationPlaceholder] = useState(
    "Warehouse or Site Address",
  );
  const [switchMessage, setSwitchMessage] = useState("");

  const selectedSwitchJobIsAssigned = props.availableJobs.some((job) => job.jobId === switchJobId);
  const showSwitchCustomJobInput =
    props.availableJobs.length > 0 &&
    (switchCustomJobMode || (switchJobId.trim() !== "" && !selectedSwitchJobIsAssigned));
  const switchJobSelectValue = showSwitchCustomJobInput ? CUSTOM_SWITCH_JOB_OPTION : switchJobId;

  function openSwitchModal() {
    setSwitchJobId("");
    setSwitchCustomJobMode(false);
    setSwitchLocation("");
    setSwitchLocationPlaceholder("Warehouse or Site Address");
    setSwitchMessage("");
    setSwitchOpen(true);
  }

  function handleSwitchSiteAddress() {
    setSwitchLocation("");
    setSwitchLocationPlaceholder("Enter Site Address Here");
  }

  function handleSaveAndSwitch() {
    const result = props.handleSaveAndSwitch(switchJobId, switchLocation);

    if (!result.ok) {
      setSwitchMessage(result.message);
      return;
    }

    setSwitchOpen(false);
    setSwitchMessage("");
  }

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
                height={40}
                className={styles.logoImage}
                style={{ width: "160px", height: "auto" }}
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

                <button type="button" className={styles.signOutButton} onClick={props.onSignOut}>
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
              description={props.description}
              setDescription={props.setDescription}
              isWorking={props.isWorking}
              isOnBreak={props.isOnBreak}
              canStart={props.canStart}
              canBreak={props.canBreak}
              handleStart={props.handleStart}
              handleBreak={props.handleBreak}
            />

            <ActionButtons
              canStop={props.canStop}
              canSaveAndSwitch={props.canSaveAndSwitch}
              canClearAll={props.canClearAll}
              unsyncedCount={props.unsyncedCount}
              failedCount={props.failedCount}
              handleStop={props.handleStop}
              onOpenSaveAndSwitch={openSwitchModal}
              handleSync={props.handleSync}
              handleClearAll={props.handleClearAll}
            />

            {switchOpen ? (
              <div className={styles.switchBackdrop}>
                <div className={styles.switchModal}>
                  <div className={styles.switchHeader}>
                    <h2>Save & Switch Job</h2>
                    <p>Save the current job log and immediately start the next job.</p>
                  </div>

                  {switchMessage ? (
                    <div className={styles.switchMessage}>{switchMessage}</div>
                  ) : null}

                  <div className={styles.switchGrid}>
                    <label className={styles.switchField}>
                      Job ID
                      {props.availableJobs.length > 0 ? (
                        <>
                          <select
                            className={styles.switchInput}
                            value={switchJobSelectValue}
                            onChange={(event) => {
                              if (event.target.value === CUSTOM_SWITCH_JOB_OPTION) {
                                setSwitchCustomJobMode(true);
                                setSwitchJobId("");
                                return;
                              }

                              setSwitchCustomJobMode(false);
                              setSwitchJobId(event.target.value);
                            }}
                          >
                            <option value="">Select next active job</option>

                            {props.availableJobs.map((job) => (
                              <option key={job.id} value={job.jobId}>
                                {[job.jobId, job.jobName]
                                  .filter((item) => item.trim() !== "")
                                  .join(" · ")}
                              </option>
                            ))}

                            <option value={CUSTOM_SWITCH_JOB_OPTION}>Custom Job</option>
                          </select>

                          {showSwitchCustomJobInput ? (
                            <input
                              className={styles.switchInput}
                              value={switchJobId}
                              onChange={(event) => setSwitchJobId(event.target.value)}
                              placeholder="Enter custom Job ID"
                            />
                          ) : null}
                        </>
                      ) : (
                        <input
                          className={styles.switchInput}
                          value={switchJobId}
                          onChange={(event) => setSwitchJobId(event.target.value)}
                          placeholder="Enter next Job ID"
                        />
                      )}
                    </label>

                    <label className={styles.switchField}>
                      Location
                      <div className={styles.switchLocationButtons}>
                        <button
                          type="button"
                          className={styles.switchChip}
                          onClick={() => {
                            setSwitchLocation("Warehouse");
                            setSwitchLocationPlaceholder("Warehouse or Site Address");
                          }}
                        >
                          Warehouse
                        </button>

                        <button
                          type="button"
                          className={styles.switchChip}
                          onClick={handleSwitchSiteAddress}
                        >
                          Site Address
                        </button>
                      </div>
                      <input
                        className={styles.switchInput}
                        value={switchLocation}
                        onChange={(event) => setSwitchLocation(event.target.value)}
                        readOnly={switchLocation === "Warehouse"}
                        placeholder={switchLocationPlaceholder}
                      />
                    </label>
                  </div>

                  <div className={styles.switchActions}>
                    <button
                      type="button"
                      className={styles.switchCancelButton}
                      onClick={() => setSwitchOpen(false)}
                    >
                      Cancel
                    </button>

                    <button
                      type="button"
                      className={styles.switchPrimaryButton}
                      onClick={handleSaveAndSwitch}
                    >
                      Start New Job
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div className={styles.cloudSyncSection}></div>
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
