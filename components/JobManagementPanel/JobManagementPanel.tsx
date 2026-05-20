"use client";

import { useMemo, useState } from "react";

import { useJobs } from "@/hooks/useJobs";
import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, JobDrawing, WorkerRole } from "@/types/work";

import styles from "./JobManagementPanel.module.css";

type JobManagementPanelProps = {
  onClose: () => void;
};

type JobFormState = {
  caseNo: string;
  jobId: string;
  orderNo: string;
  jobName: string;
  customerName: string;
  location: string;
  description: string;
  assignedRoles: WorkerRole[];
  jobDrawings: Job["jobDrawings"];
  isActive: boolean;
};

const EMPTY_FORM: JobFormState = {
  caseNo: "",
  jobId: "",
  orderNo: "",
  jobName: "",
  customerName: "",
  location: "",
  description: "",
  assignedRoles: [],
  jobDrawings: [],
  isActive: true,
};

const MAX_JOB_DRAWINGS = 5;
const MAX_JOB_DRAWING_SIZE_BYTES = 2 * 1024 * 1024;

function makeClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) return `${sizeKb.toFixed(1)} KB`;

  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

function readJobDrawingFile(file: File): Promise<JobDrawing> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Could not read file."));
        return;
      }

      resolve({
        id: makeClientId("job-doc"),
        fileName: file.name,
        fileData: reader.result,
        mimeType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        uploadedAt: new Date().toISOString(),
      });
    });

    reader.addEventListener("error", () => {
      reject(new Error("Could not read file."));
    });

    reader.readAsDataURL(file);
  });
}

function getRoleLabel(role: WorkerRole): string {
  return WORKER_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

function formatRoleList(roles: WorkerRole[]): string {
  if (roles.length === 0) return "No roles assigned";

  return roles.map(getRoleLabel).join(", ");
}

function getJobTitle(job: Job): string {
  return job.jobName || job.jobId || job.caseNo || "Untitled Job";
}

export default function JobManagementPanel({ onClose }: JobManagementPanelProps) {
  const {
    jobs,
    activeJobs,
    inactiveJobs,
    isLoadingJobs,
    jobMessage,
    handleCreateJob,
    handleUpdateJob,
    handleDeleteJob,
    handleToggleJobActive,
    clearJobMessage,
  } = useJobs();

  const [form, setForm] = useState<JobFormState>(EMPTY_FORM);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobDrawingMessage, setJobDrawingMessage] = useState("");

  const sortedJobs = useMemo(
    () =>
      [...jobs].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

        return getJobTitle(a).localeCompare(getJobTitle(b));
      }),
    [jobs]
  );

  function updateField<K extends keyof JobFormState>(
    field: K,
    value: JobFormState[K]
  ): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (jobMessage) clearJobMessage();
    if (jobDrawingMessage) setJobDrawingMessage("");
    if (jobDrawingMessage) setJobDrawingMessage("");
  }

  function toggleRole(role: WorkerRole): void {
    setForm((current) => {
      const hasRole = current.assignedRoles.includes(role);

      return {
        ...current,
        assignedRoles: hasRole
          ? current.assignedRoles.filter((item) => item !== role)
          : [...current.assignedRoles, role],
      };
    });

    if (jobMessage) clearJobMessage();
    if (jobDrawingMessage) setJobDrawingMessage("");
    if (jobDrawingMessage) setJobDrawingMessage("");
  }

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditingJobId(null);
    setJobDrawingMessage("");
  }

  function startEdit(job: Job): void {
    setEditingJobId(job.id);
    setForm({
      caseNo: job.caseNo,
      jobId: job.jobId,
      orderNo: job.orderNo,
      jobName: job.jobName,
      customerName: job.customerName,
      location: job.location,
      description: job.description,
      assignedRoles: job.assignedRoles,
      jobDrawings: job.jobDrawings,
      isActive: job.isActive,
    });

    if (jobMessage) clearJobMessage();
    if (jobDrawingMessage) setJobDrawingMessage("");
    if (jobDrawingMessage) setJobDrawingMessage("");
  }

  async function handleJobDrawingsUpload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const remainingSlots = MAX_JOB_DRAWINGS - form.jobDrawings.length;

    if (remainingSlots <= 0) {
      setJobDrawingMessage(`Maximum ${MAX_JOB_DRAWINGS} job drawings can be attached to one job.`);
      return;
    }

    const acceptedFiles = selectedFiles
      .filter((file) => file.size <= MAX_JOB_DRAWING_SIZE_BYTES)
      .slice(0, remainingSlots);

    if (acceptedFiles.length === 0) {
      setJobDrawingMessage(
        `No files added. Each job drawing must be ${formatBytes(
          MAX_JOB_DRAWING_SIZE_BYTES
        )} or smaller.`
      );
      return;
    }

    const newDocs = await Promise.all(acceptedFiles.map(readJobDrawingFile));

    setForm((current) => ({
      ...current,
      jobDrawings: [...current.jobDrawings, ...newDocs],
    }));

    const rejectedCount = selectedFiles.length - acceptedFiles.length;

    setJobDrawingMessage(
      rejectedCount > 0
        ? `Added ${newDocs.length} job drawing(s). ${rejectedCount} file(s) were skipped due to size/count limit.`
        : `Added ${newDocs.length} job drawing(s).`
    );
  }

  function removeJobDrawing(docId: string): void {
    setForm((current) => ({
      ...current,
      jobDrawings: current.jobDrawings.filter((doc) => doc.id !== docId),
    }));

    setJobDrawingMessage("");
  }

  async function handleSubmit(): Promise<void> {
    if (editingJobId) {
      const result = await handleUpdateJob(editingJobId, form);

      if (result.ok) resetForm();

      return;
    }

    const result = await handleCreateJob(form);

    if (result.ok) resetForm();
  }

  async function handleDelete(job: Job): Promise<void> {
    const confirmed = window.confirm(
      `Delete ${getJobTitle(job)}? This cannot be undone.`
    );

    if (!confirmed) return;

    const result = await handleDeleteJob(job.id);

    if (result.ok && editingJobId === job.id) resetForm();
  }

  return (
    <div className={styles.backdrop}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2>Job Management</h2>
            <p className={styles.subtitle}>
              Create jobs and assign them to worker roles. Jobs are stored in AWS
              and cached locally for offline viewing. Job drawings remain local-only until S3 is added.
            </p>
          </div>

          <button className={styles.closeButton} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span>Total Jobs</span>
            <strong>{jobs.length}</strong>
          </div>

          <div className={styles.statCard}>
            <span>Active</span>
            <strong>{activeJobs.length}</strong>
          </div>

          <div className={styles.statCard}>
            <span>Inactive</span>
            <strong>{inactiveJobs.length}</strong>
          </div>
        </div>

        {jobMessage ? <p className={styles.message}>{jobMessage}</p> : null}
        {jobDrawingMessage ? <p className={styles.message}>{jobDrawingMessage}</p> : null}

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>{editingJobId ? "Edit Job" : "Add Job"}</h3>

            {editingJobId ? (
              <button
                className={styles.textButton}
                type="button"
                onClick={resetForm}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          <div className={styles.formGrid}>
            <label>
              Case No.
              <input
                value={form.caseNo}
                onChange={(event) => updateField("caseNo", event.target.value)}
              />
            </label>

            <label>
              Job ID
              <input
                value={form.jobId}
                onChange={(event) => updateField("jobId", event.target.value)}
              />
            </label>

            <label>
              Order No.
              <input
                value={form.orderNo}
                onChange={(event) => updateField("orderNo", event.target.value)}
              />
            </label>

            <label>
              Job Name
              <input
                value={form.jobName}
                onChange={(event) => updateField("jobName", event.target.value)}
              />
            </label>

            <label>
              Customer / Site
              <input
                value={form.customerName}
                onChange={(event) =>
                  updateField("customerName", event.target.value)
                }
              />
            </label>

            <div className={styles.docsField}>
              <span className={styles.docsLabel}>Job Drawings</span>

              <label className={styles.fileUploadBox}>
                <input
                  className={styles.fileInput}
                  type="file"
                  multiple
                  onChange={(event) => {
                    void handleJobDrawingsUpload(event.currentTarget.files);
                    event.currentTarget.value = "";
                  }}
                />
                <span>Upload job drawings</span>
              </label>

              <span className={styles.docsHelp}>
                Max {MAX_JOB_DRAWINGS} files, {formatBytes(MAX_JOB_DRAWING_SIZE_BYTES)} each.
              </span>
            </div>
          </div>

          {form.jobDrawings.length > 0 ? (
            <div className={styles.docList}>
              {form.jobDrawings.map((doc) => (
                <div className={styles.docItem} key={doc.id}>
                  <div className={styles.docInfo}>
                    <span className={styles.docName}>{doc.fileName}</span>
                    <span className={styles.docSize}>{formatBytes(doc.sizeBytes)}</span>
                  </div>

                  <button
                    className={styles.removeDocButton}
                    type="button"
                    onClick={() => removeJobDrawing(doc.id)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <label className={styles.fullWidthLabel}>
            Description / Notes
            <textarea
              value={form.description}
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              rows={4}
            />
          </label>

          <div className={styles.roleSection}>
            <p>Assign To</p>

            <div className={styles.roleGrid}>
              {WORKER_ROLE_OPTIONS.map((role) => (
                <label
                  className={styles.roleOption}
                  key={role.value}
                >
                  <input
                    type="checkbox"
                    checked={form.assignedRoles.includes(role.value)}
                    onChange={() => toggleRole(role.value)}
                  />
                  <span>{role.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className={styles.formActions}>
            <label className={styles.activeToggle}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  updateField("isActive", event.target.checked)
                }
              />
              Active Job
            </label>

            <button
              className={styles.primaryButton}
              type="button"
              onClick={() => void handleSubmit()}
            >
              {editingJobId ? "Save Job" : "Create Job"}
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <h3>Existing Jobs</h3>

          {isLoadingJobs ? <p className={styles.emptyText}>Loading jobs...</p> : null}

          {!isLoadingJobs && sortedJobs.length === 0 ? (
            <p className={styles.emptyText}>No jobs created yet.</p>
          ) : null}

          <div className={styles.jobList}>
            {sortedJobs.map((job) => (
              <article className={styles.jobItem} key={job.id}>
                <div className={styles.jobTopLine}>
                  <div>
                    <h4>{getJobTitle(job)}</h4>
                    <p>
                      Job ID: {job.jobId || "—"} · Case: {job.caseNo || "—"} ·
                      Order: {job.orderNo || "—"}
                    </p>
                  </div>

                  <span
                    className={
                      job.isActive ? styles.activeBadge : styles.inactiveBadge
                    }
                  >
                    {job.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>

                <p className={styles.jobMeta}>
                  {job.customerName || "No customer / site"} ·{" "}
                  {job.jobDrawings.length === 0
                    ? "No job drawings"
                    : `${job.jobDrawings.length} job doc(s)`}
                </p>

                <p className={styles.jobRoles}>
                  Assigned to: {formatRoleList(job.assignedRoles)}
                </p>

                {job.description ? (
                  <p className={styles.jobDescription}>{job.description}</p>
                ) : null}

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
                  <button type="button" onClick={() => startEdit(job)}>
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleToggleJobActive(job.id)}
                  >
                    {job.isActive ? "Deactivate" : "Activate"}
                  </button>

                  <button
                    className={styles.dangerButton}
                    type="button"
                    onClick={() => void handleDelete(job)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
