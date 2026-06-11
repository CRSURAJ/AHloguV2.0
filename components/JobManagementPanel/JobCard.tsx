"use client";

import type { Job } from "@/types/work";

import { formatRoleList, getJobTitle } from "./jobManagementHelpers";
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
  const jobDocumentLinks = job.jobDocumentLinks ?? [];

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
        {jobDocumentLinks.length === 0
          ? "No job documents"
          : `${jobDocumentLinks.length} job document link(s)`}
      </p>

      <p className={styles.jobRoles}>Assigned to: {formatRoleList(job.assignedRoles)}</p>

      {job.description ? <p className={styles.jobDescription}>{job.description}</p> : null}

      {jobDocumentLinks.length > 0 ? (
        <div className={styles.savedDocs}>
          <p className={styles.savedDocsTitle}>Job Documents / Drawings</p>

          <div className={styles.savedDocsList}>
            {jobDocumentLinks.map((doc) => (
              <a
                className={styles.savedDocLink}
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                key={doc.id}
              >
                {doc.title}
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
