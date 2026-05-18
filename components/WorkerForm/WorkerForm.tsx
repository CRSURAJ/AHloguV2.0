"use client";

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
};

const SITE_ADDRESS_PREFIX = "Site Address: ";

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
}: WorkerFormProps) {
  const descriptionDisabled = !isWorking || isOnBreak;
  const hasAvailableJobs = availableJobs.length > 0;
  const selectedJobMissing =
    jobId.trim() !== "" && !availableJobs.some((job) => job.jobId === jobId);

  function handleSiteAddressClick(): void {
    if (location.startsWith(SITE_ADDRESS_PREFIX)) return;

    setLocation(SITE_ADDRESS_PREFIX);
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
                className={styles.locationChip}
                type="button"
                onClick={() => setLocation("Warehouse")}
                disabled={isWorking}
              >
                Warehouse
              </button>

              <button
                className={styles.locationChip}
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
            placeholder="Warehouse or Site Address"
          />
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
