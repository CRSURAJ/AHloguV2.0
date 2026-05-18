"use client";

import type { Job } from "@/types/work";
import styles from "./WorkerForm.module.css";

type WorkerFormProps = {
  jobId: string;
  setJobId: (value: string) => void;
  availableJobs: Job[];
  role: string;
  setRole: (value: string) => void;
  location: string;
  setLocation: (value: string) => void;
  jobDocs: string;
  setJobDocs: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  isWorking: boolean;
  isOnBreak: boolean;
};

function getJobOptionLabel(job: Job): string {
  const parts = [
    job.jobId,
    job.jobName,
    job.customerName,
  ].filter((part) => part.trim() !== "");

  return parts.length > 0 ? parts.join(" · ") : "Untitled job";
}

export default function WorkerForm({
  jobId,
  setJobId,
  availableJobs,
  role,
  setRole,
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

  return (
    <div className={styles.formWrap}>
      <div className={styles.fieldGrid}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="role">
            Role *
          </label>

          <input
            id="role"
            className={styles.input}
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled
            readOnly
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="jobId">
            Job ID *
          </label>

          {hasAvailableJobs ? (
            <>
              <select
                id="jobId"
                className={styles.input}
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
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

              <div className={styles.helperText}>
                Showing active jobs assigned to your role.
              </div>
            </>
          ) : (
            <>
              <input
                id="jobId"
                className={styles.input}
                type="text"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
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
          <label className={styles.label} htmlFor="location">
            Location *
          </label>

          <input
            id="location"
            className={styles.input}
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={isWorking}
            placeholder="Enter location"
          />
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
            onChange={(e) => setJobDocs(e.target.value)}
            disabled
            readOnly
            placeholder="Please contact your manager"
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
            onChange={(e) => setDescription(e.target.value)}
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
