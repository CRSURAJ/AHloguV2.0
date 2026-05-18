"use client";

import { useMemo, useState } from "react";

import { useJobs } from "@/hooks/useJobs";
import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, WorkerRole } from "@/types/work";

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
  jobDocs: Job["jobDocs"];
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
  jobDocs: [],
  isActive: true,
};

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
  }

  function resetForm(): void {
    setForm(EMPTY_FORM);
    setEditingJobId(null);
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
      jobDocs: job.jobDocs,
      isActive: job.isActive,
    });

    if (jobMessage) clearJobMessage();
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
              Create local jobs and assign them to worker roles. Admin users can
              see all jobs automatically.
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

            <label>
              Job Docs
              <input
                value={
                  form.jobDocs.length === 0
                    ? "No documents attached yet"
                    : `${form.jobDocs.length} document(s) attached`
                }
                disabled
                readOnly
              />
            </label>
          </div>

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
                  {job.jobDocs.length === 0
                    ? "No job docs"
                    : `${job.jobDocs.length} job doc(s)`}
                </p>

                <p className={styles.jobRoles}>
                  Assigned to: {formatRoleList(job.assignedRoles)}
                </p>

                {job.description ? (
                  <p className={styles.jobDescription}>{job.description}</p>
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
