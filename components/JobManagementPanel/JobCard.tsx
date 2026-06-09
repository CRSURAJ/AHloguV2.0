"use client";

import type { Job } from "@/types/work";

import { formatBytes, formatRoleList, getJobTitle } from "./jobManagementHelpers";
import styles from "./JobManagementPanel.module.css";

type JobCardProps = {
  job: Job;
  canArchiveOrDeleteJobs: boolean;
  onEdit: (job: Job) => void;
  onToggleStatus: (job: Job) => Promise<void>;
  onArchive: (job: Job) => Promise<void>;
  onDelete: (job: Job) => Promise<void>;
};

export default function JobCard({
  job,
  canArchiveOrDeleteJobs,
  onEdit,
  onToggleStatus,
  onArchive,
  onDelete,
}: JobCardProps) {
  return (
    <article className={styles.jobItem}>
      <div className={styles.jobTopLine}>
        <div>
          <h4>{getJobTitle(job)}</h4>
          <p>
            Job ID: {job.jobId || "—"} · Case: {job.caseNo || "—"} · Order: {job.orderNo || "—"}
          </p>
        </div>

        <span className={job.isActive ? styles.activeBadge : styles.inactiveBadge}>
          {job.isActive ? "ACTIVE" : "INACTIVE"}
        </span>
      </div>

      <p className={styles.jobMeta}>
        {job.customerName || "No customer / site"} ·{" "}
        {job.jobDrawings.length === 0 ? "No job drawings" : `${job.jobDrawings.length} job doc(s)`}
      </p>

      <p className={styles.jobRoles}>Assigned to: {formatRoleList(job.assignedRoles)}</p>

      {job.description ? <p className={styles.jobDescription}>{job.description}</p> : null}

      {job.jobDrawings.length > 0 ? (
        <div className={styles.savedDocs}>
          <p className={styles.savedDocsTitle}>Job Drawings</p>

          <div className={styles.savedDocsList}>
            {job.jobDrawings.map((doc) => (
              <a
                className={styles.savedDocLink}
                href={doc.fileData}
                download={doc.fileName}
                key={doc.id}
              >
                {doc.fileName} · {formatBytes(doc.sizeBytes)}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.jobActions}>
        <button type="button" onClick={() => onEdit(job)}>
          Edit
        </button>

        <button type="button" onClick={() => void onToggleStatus(job)}>
          {job.isActive ? "Deactivate" : "Activate"}
        </button>

        {canArchiveOrDeleteJobs ? (
          <button type="button" onClick={() => void onArchive(job)}>
            Archive
          </button>
        ) : null}

        {canArchiveOrDeleteJobs ? (
          <button className={styles.dangerButton} type="button" onClick={() => void onDelete(job)}>
            Delete
          </button>
        ) : null}
      </div>
    </article>
  );
}
