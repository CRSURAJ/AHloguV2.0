"use client";

import { useMemo, useRef, useState } from "react";

import FeedbackMessage from "@/components/FeedbackMessage";
import { useJobs } from "@/hooks/useJobs";
import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, PermissionLevel, WorkerRole } from "@/types/work";

import {
  formatBytes,
  formatRoleList,
  getAcceptedJobDrawingFiles,
  getArchiveJobConfirmationMessage,
  getDeleteJobConfirmationMessage,
  getJobDrawingUploadMessage,
  getJobTitle,
  getNoAcceptedJobDrawingMessage,
  getNoJobDrawingSlotsMessage,
  getRemainingJobDrawingSlots,
  isDuplicateJobIdMessage,
  MAX_JOB_DRAWING_SIZE_BYTES,
  MAX_JOB_DRAWINGS,
  readJobDrawingFile,
} from "./jobManagementHelpers";

import JobStatsCards from "./JobStatsCards";
import styles from "./JobManagementPanel.module.css";

type JobManagementPanelProps = {
  onClose: () => void;
  currentPermissionLevel: PermissionLevel;
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

type JobFormField = "caseNo" | "jobId" | "orderNo" | "jobName" | "customerName" | "assignedRoles";

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

export default function JobManagementPanel({
  onClose,
  currentPermissionLevel,
}: JobManagementPanelProps) {
  const canArchiveOrDeleteJobs = currentPermissionLevel === "admin";
  const {
    jobs,
    activeJobs,
    inactiveJobs,
    isLoadingJobs,
    jobMessage,
    handleCreateJob,
    handleUpdateJob,
    handleDeleteJob,
    handleArchiveJob,
    handleToggleJobActive,
    clearJobMessage,
  } = useJobs();

  const [form, setForm] = useState<JobFormState>(EMPTY_FORM);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobDrawingMessage, setJobDrawingMessage] = useState("");
  const [jobFormMessage, setJobFormMessage] = useState("");
  const [jobErrorField, setJobErrorField] = useState<JobFormField | "">("");
  const [jobShakeField, setJobShakeField] = useState<JobFormField | "">("");

  const caseNoInputRef = useRef<HTMLInputElement>(null);
  const jobIdInputRef = useRef<HTMLInputElement>(null);
  const orderNoInputRef = useRef<HTMLInputElement>(null);
  const jobNameInputRef = useRef<HTMLInputElement>(null);
  const customerNameInputRef = useRef<HTMLInputElement>(null);
  const assignedRolesRef = useRef<HTMLDivElement>(null);
  const jobFeedbackRef = useRef<HTMLDivElement>(null);
  const jobFormCardRef = useRef<HTMLDivElement>(null);

  const visibleJobs = useMemo(() => jobs.filter((job) => job.isArchived !== true), [jobs]);

  const sortedJobs = useMemo(
    () =>
      [...visibleJobs].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

        return getJobTitle(a).localeCompare(getJobTitle(b));
      }),
    [visibleJobs],
  );

  function getJobInputClass(field: JobFormField): string {
    return [
      jobErrorField === field ? styles.inputError : "",
      jobShakeField === field ? styles.shakeField : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function getRoleSectionClass(): string {
    return [
      styles.roleSection,
      jobErrorField === "assignedRoles" ? styles.roleSectionError : "",
      jobShakeField === "assignedRoles" ? styles.shakeField : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function clearJobFormError(field?: JobFormField): void {
    if (!field || jobErrorField === field) {
      setJobErrorField("");
    }

    if (jobFormMessage) {
      setJobFormMessage("");
    }
  }

  function markJobFormError(
    field: JobFormField,
    message: string,
    targetRef: {
      readonly current: HTMLElement | null;
    },
  ): void {
    setJobFormMessage(message);
    setJobErrorField(field);
    setJobShakeField("");

    window.setTimeout(() => {
      setJobShakeField(field);
      targetRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      if (targetRef.current instanceof HTMLInputElement) {
        targetRef.current.focus({ preventScroll: true });
      }
    }, 0);

    window.setTimeout(() => {
      setJobShakeField("");
    }, 420);
  }

  function updateField<K extends keyof JobFormState>(field: K, value: JobFormState[K]): void {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (jobMessage) clearJobMessage();
    if (jobDrawingMessage) setJobDrawingMessage("");
    clearJobFormError(field as JobFormField);
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
    clearJobFormError("assignedRoles");
  }

  function focusJobFormCard(): void {
    window.setTimeout(() => {
      jobFormCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      jobFormCardRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditingJobId(null);
    setJobDrawingMessage("");
    setJobFormMessage("");
    setJobErrorField("");
    setJobShakeField("");
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
    if (jobFormMessage) setJobFormMessage("");
    setJobErrorField("");
    setJobShakeField("");
    focusJobFormCard();
  }

  async function handleJobDrawingsUpload(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    const remainingSlots = getRemainingJobDrawingSlots(form.jobDrawings.length);

    if (remainingSlots <= 0) {
      setJobDrawingMessage(getNoJobDrawingSlotsMessage());
      return;
    }

    const acceptedFiles = getAcceptedJobDrawingFiles(selectedFiles, remainingSlots);

    if (acceptedFiles.length === 0) {
      setJobDrawingMessage(getNoAcceptedJobDrawingMessage());
      return;
    }

    const newDocs = await Promise.all(acceptedFiles.map(readJobDrawingFile));

    setForm((current) => ({
      ...current,
      jobDrawings: [...current.jobDrawings, ...newDocs],
    }));

    const rejectedCount = selectedFiles.length - acceptedFiles.length;

    setJobDrawingMessage(getJobDrawingUploadMessage(newDocs.length, rejectedCount));
  }

  function removeJobDrawing(docId: string): void {
    setForm((current) => ({
      ...current,
      jobDrawings: current.jobDrawings.filter((doc) => doc.id !== docId),
    }));

    setJobDrawingMessage("");
  }

  function focusJobFeedbackMessage(): void {
    window.setTimeout(() => {
      jobFeedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      jobFeedbackRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  async function handleSubmit(): Promise<void> {
    setJobFormMessage("");

    if (!form.caseNo.trim()) {
      markJobFormError("caseNo", "Case No. is required.", caseNoInputRef);
      return;
    }

    if (!form.jobId.trim()) {
      markJobFormError("jobId", "Job ID is required.", jobIdInputRef);
      return;
    }

    if (!form.orderNo.trim()) {
      markJobFormError("orderNo", "Order No. is required.", orderNoInputRef);
      return;
    }

    if (!form.jobName.trim()) {
      markJobFormError("jobName", "Job Name is required.", jobNameInputRef);
      return;
    }

    if (!form.customerName.trim()) {
      markJobFormError("customerName", "Customer / Site is required.", customerNameInputRef);
      return;
    }

    if (form.assignedRoles.length === 0) {
      markJobFormError("assignedRoles", "Assign at least one role.", assignedRolesRef);
      return;
    }

    if (editingJobId) {
      const result = await handleUpdateJob(editingJobId, form);

      if (!result.ok && isDuplicateJobIdMessage(result.message)) {
        markJobFormError("jobId", "Job ID already exists. Use a unique Job ID.", jobIdInputRef);
        return;
      }

      if (result.ok) {
        resetForm();
        setJobFormMessage(result.message);
        focusJobFeedbackMessage();
      }

      return;
    }

    const result = await handleCreateJob(form);

    if (!result.ok && isDuplicateJobIdMessage(result.message)) {
      markJobFormError("jobId", "Job ID already exists. Use a unique Job ID.", jobIdInputRef);
      return;
    }

    if (result.ok) {
      resetForm();
      setJobFormMessage(result.message);
      focusJobFeedbackMessage();
    }
  }

  async function handleToggleJobStatus(job: Job): Promise<void> {
    setJobFormMessage("");

    await handleToggleJobActive(job.id);

    focusJobFeedbackMessage();
  }

  async function handleArchive(job: Job): Promise<void> {
    const confirmed = window.confirm(getArchiveJobConfirmationMessage(job));

    if (!confirmed) return;

    const result = await handleArchiveJob(job.id);

    if (result.ok && editingJobId === job.id) {
      resetForm();
    }

    focusJobFeedbackMessage();
  }

  async function handleDelete(job: Job): Promise<void> {
    const confirmed = window.confirm(getDeleteJobConfirmationMessage(job));

    if (!confirmed) return;

    const result = await handleDeleteJob(job.id);

    if (result.ok && editingJobId === job.id) {
      resetForm();
    }

    focusJobFeedbackMessage();
  }

  return (
    <div className={styles.backdrop}>
      <section className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2>Job Management</h2>
            <p className={styles.subtitle}>
              Create jobs and assign them to worker roles. Jobs are stored in AWS and cached locally
              for offline viewing. Job drawings remain local-only until S3 is added.
            </p>
          </div>

          <button className={styles.closeButton} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <JobStatsCards
          totalJobs={visibleJobs.length}
          activeJobs={activeJobs.length}
          inactiveJobs={inactiveJobs.length}
        />

        <div ref={jobFeedbackRef} tabIndex={-1} className={styles.feedbackFocusTarget}>
          <FeedbackMessage message={jobFormMessage || jobMessage} />
          <FeedbackMessage message={jobDrawingMessage} />
        </div>

        <div ref={jobFormCardRef} tabIndex={-1} className={styles.card}>
          <div className={styles.cardHeader}>
            <h3>{editingJobId ? "Edit Job" : "Add Job"}</h3>

            {editingJobId ? (
              <button className={styles.textButton} type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
          </div>

          <div className={styles.formGrid}>
            <label>
              Case No.
              <input
                ref={caseNoInputRef}
                className={getJobInputClass("caseNo")}
                value={form.caseNo}
                onChange={(event) => updateField("caseNo", event.target.value)}
                aria-invalid={jobErrorField === "caseNo"}
              />
            </label>

            <label>
              Job ID
              <input
                ref={jobIdInputRef}
                className={getJobInputClass("jobId")}
                value={form.jobId}
                onChange={(event) => updateField("jobId", event.target.value)}
                aria-invalid={jobErrorField === "jobId"}
              />
            </label>

            <label>
              Order No.
              <input
                ref={orderNoInputRef}
                className={getJobInputClass("orderNo")}
                value={form.orderNo}
                onChange={(event) => updateField("orderNo", event.target.value)}
                aria-invalid={jobErrorField === "orderNo"}
              />
            </label>

            <label>
              Job Name
              <input
                ref={jobNameInputRef}
                className={getJobInputClass("jobName")}
                value={form.jobName}
                onChange={(event) => updateField("jobName", event.target.value)}
                aria-invalid={jobErrorField === "jobName"}
              />
            </label>

            <label>
              Customer / Site
              <input
                ref={customerNameInputRef}
                className={getJobInputClass("customerName")}
                value={form.customerName}
                onChange={(event) => updateField("customerName", event.target.value)}
                aria-invalid={jobErrorField === "customerName"}
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
              onChange={(event) => updateField("description", event.target.value)}
              rows={4}
            />
          </label>

          <div ref={assignedRolesRef} className={getRoleSectionClass()}>
            <p>Assign To</p>

            <div className={styles.roleGrid}>
              {WORKER_ROLE_OPTIONS.map((role) => (
                <label className={styles.roleOption} key={role.value}>
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
                onChange={(event) => updateField("isActive", event.target.checked)}
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
                      Job ID: {job.jobId || "—"} · Case: {job.caseNo || "—"} · Order:{" "}
                      {job.orderNo || "—"}
                    </p>
                  </div>

                  <span className={job.isActive ? styles.activeBadge : styles.inactiveBadge}>
                    {job.isActive ? "ACTIVE" : "INACTIVE"}
                  </span>
                </div>

                <p className={styles.jobMeta}>
                  {job.customerName || "No customer / site"} ·{" "}
                  {job.jobDrawings.length === 0
                    ? "No job drawings"
                    : `${job.jobDrawings.length} job doc(s)`}
                </p>

                <p className={styles.jobRoles}>Assigned to: {formatRoleList(job.assignedRoles)}</p>

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

                  <button type="button" onClick={() => void handleToggleJobStatus(job)}>
                    {job.isActive ? "Deactivate" : "Activate"}
                  </button>

                  {canArchiveOrDeleteJobs ? (
                    <button type="button" onClick={() => void handleArchive(job)}>
                      Archive
                    </button>
                  ) : null}

                  {canArchiveOrDeleteJobs ? (
                    <button
                      className={styles.dangerButton}
                      type="button"
                      onClick={() => void handleDelete(job)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
