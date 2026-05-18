"use client";

import { useState } from "react";

import type { Job } from "@/types/work";
import styles from "./WorkerForm.module.css";

type WorkerFormProps = {
  jobId: string;
  setJobId: (value: string) => void;
  availableJobs: Job[];
  location: string;
  setLocation: (value: string) => void;
  jobDocs: string;
  setJobDocs: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isWorking: boolean;
  isOnBreak: boolean;
  canStart: boolean;
  canBreak: boolean;
  handleStart: () => void;
  handleBreak: () => void;
};

const DEFAULT_LOCATION_PLACEHOLDER = "Warehouse or Site Address";
const SITE_ADDRESS_PLACEHOLDER = "Enter Site Address Here";

function getJobOptionLabel(job: Job): string {
  const parts = [job.jobId, job.jobName, job.customerName].filter(
    (part) => part.trim() !== ""
  );

  return parts.length > 0 ? parts.join(" · ") : "Untitled job";
}

export default function WorkerForm({
  jobId,
  setJobId,
  availableJobs,
  location,
  setLocation,
  jobDocs,
  setJobDocs,
  description,
  setDescription,
  isWorking,
  isOnBreak,
  canStart,
  canBreak,
  handleStart,
  handleBreak,
}: WorkerFormProps) {
  const [locationPlaceholder, setLocationPlaceholder] = useState(
    DEFAULT_LOCATION_PLACEHOLDER
  );

  const descriptionDisabled = !isWorking || isOnBreak;
  const hasAvailableJobs = availableJobs.length > 0;
  const isWarehouseSelected = location === "Warehouse";
  const isSiteAddressMode =
    locationPlaceholder === SITE_ADDRESS_PLACEHOLDER && !isWarehouseSelected;

  const selectedJobMissing =
    jobId.trim() !== "" && !availableJobs.some((job) => job.jobId === jobId);

  function handleWarehouseClick(): void {
    setLocation("Warehouse");
    setLocationPlaceholder(DEFAULT_LOCATION_PLACEHOLDER);
  }

  function handleSiteAddressClick(): void {
    setLocation("");
    setLocationPlaceholder(SITE_ADDRESS_PLACEHOLDER);
  }

  return (
    <div className={styles.formWrap}>
      <div className={styles.fieldGrid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="jobId">
            Job ID *
          </label>

          {hasAvailableJobs ? (
            <select
              id="jobId"
              className={styles.input}
              value={jobId}
              onChange={(event) => setJobId(event.target.value)}
              disabled={isWorking}
            >
              <option value="">Select active job</option>

              {selectedJobMissing ? (
                <option value={jobId}>{jobId} (saved draft)</option>
              ) : null}

              {availableJobs.map((job) => (
                <option key={job.id} value={job.jobId}>
                  {getJobOptionLabel(job)}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input
                id="jobId"
                className={styles.input}
                type="text"
                value={jobId}
                onChange={(event) => setJobId(event.target.value)}
                disabled={isWorking}
                placeholder="Enter job ID"
              />

              <div className={styles.helperText}>
                No active assigned jobs found. Manual entry is still available.
              </div>
            </>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="jobDocs">
            Job Docs
          </label>

          <input
            id="jobDocs"
            className={styles.input}
            type="text"
            value={jobDocs}
            onChange={(event) => setJobDocs(event.target.value)}
            disabled
            readOnly
            placeholder="Please contact your manager"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.locationHeader}>
            <label className={styles.label} htmlFor="location">
              Location *
            </label>

            <div className={styles.locationActions}>
              <button
                className={`${styles.locationChip} ${
                  isWarehouseSelected ? styles.locationChipActive : ""
                }`}
                type="button"
                onClick={handleWarehouseClick}
                disabled={isWorking}
              >
                Warehouse
              </button>

              <button
                className={`${styles.locationChip} ${
                  isSiteAddressMode ? styles.locationChipActive : ""
                }`}
                type="button"
                onClick={handleSiteAddressClick}
                disabled={isWorking}
              >
                Site Address
              </button>
            </div>
          </div>

          <input
            id="location"
            className={styles.input}
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={isWorking}
            readOnly={isWarehouseSelected}
            placeholder={locationPlaceholder}
          />
        </div>

        <div className={styles.quickWorkControl}>
          <div className={styles.quickControlLabel}>Work Control</div>

          <div className={styles.quickWorkButtons}>
            <button
              className={`${styles.quickWorkButton} ${styles.quickStartButton}`}
              type="button"
              onClick={handleStart}
              disabled={!canStart}
            >
              Start
            </button>

            <button
              className={`${styles.quickWorkButton} ${
                isOnBreak ? styles.quickResumeButton : styles.quickBreakButton
              }`}
              type="button"
              onClick={handleBreak}
              disabled={!canBreak}
            >
              {isOnBreak ? "Resume" : "Break"}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="description">
          Description *
        </label>

        <div className={styles.textareaWrap}>
          <textarea
            id="description"
            className={styles.textarea}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={descriptionDisabled}
            rows={5}
            placeholder={
              !isWorking
                ? "Start work to add notes"
                : isOnBreak
                  ? "Resume work to continue editing"
                  : "Add notes about the job"
            }
          />

          <div className={styles.charCount}>{description.length}</div>
        </div>
      </div>
    </div>
  );
}
