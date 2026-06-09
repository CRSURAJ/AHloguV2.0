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
const CUSTOM_JOB_OPTION = "__custom_job__";

function getJobOptionLabel(job: Job): string {
  const parts = [job.jobId, job.jobName].filter((part) => part.trim() !== "");

  return parts.length > 0 ? parts.join(" · ") : "Untitled job";
}

export default function WorkerForm({
  jobId,
  setJobId,
  availableJobs,
  location,
  setLocation,
  description,
  setDescription,
  isWorking,
  isOnBreak,
  canStart,
  canBreak,
  handleStart,
  handleBreak,
}: WorkerFormProps) {
  const [locationPlaceholder, setLocationPlaceholder] = useState(DEFAULT_LOCATION_PLACEHOLDER);
  const [customJobMode, setCustomJobMode] = useState(false);

  const descriptionDisabled = !isWorking || isOnBreak;
  const hasAvailableJobs = availableJobs.length > 0;
  const selectedJob = availableJobs.find((job) => job.jobId === jobId);
  const selectedJobIsAssigned = selectedJob !== undefined;
  const selectedJobDocumentLinks = selectedJob?.jobDocumentLinks ?? [];
  const showCustomJobInput =
    hasAvailableJobs && (customJobMode || (jobId.trim() !== "" && !selectedJobIsAssigned));
  const jobSelectValue = showCustomJobInput ? CUSTOM_JOB_OPTION : jobId;
  const isWarehouseSelected = location === "Warehouse";
  const isSiteAddressMode =
    locationPlaceholder === SITE_ADDRESS_PLACEHOLDER && !isWarehouseSelected;

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
            <>
              <select
                id="jobId"
                className={styles.input}
                value={jobSelectValue}
                onChange={(event) => {
                  if (event.target.value === CUSTOM_JOB_OPTION) {
                    setCustomJobMode(true);
                    setJobId("");
                    return;
                  }

                  setCustomJobMode(false);
                  setJobId(event.target.value);
                }}
                disabled={isWorking}
              >
                <option value="">Select active job</option>

                {availableJobs.map((job) => (
                  <option key={job.id} value={job.jobId}>
                    {getJobOptionLabel(job)}
                  </option>
                ))}

                <option value={CUSTOM_JOB_OPTION}>Custom Job</option>
              </select>

              {showCustomJobInput ? (
                <input
                  className={styles.input}
                  type="text"
                  value={jobId}
                  onChange={(event) => setJobId(event.target.value)}
                  disabled={isWorking}
                  placeholder="Enter custom Job ID"
                />
              ) : null}
            </>
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

        <div className={`${styles.field} ${styles.jobDocumentsField}`}>
          <span className={styles.label}>Job Drawings</span>

          {selectedJobDocumentLinks.length > 0 ? (
            <div className={styles.jobDocumentLinks}>
              {selectedJobDocumentLinks.map((doc) => (
                <a
                  className={styles.jobDocumentLink}
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  key={doc.id}
                >
                  {doc.title}
                </a>
              ))}
            </div>
          ) : (
            <div className={styles.helperText}>
              {jobId.trim()
                ? "No drawings attached to this job."
                : "Select an active job to view drawings."}
            </div>
          )}
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
