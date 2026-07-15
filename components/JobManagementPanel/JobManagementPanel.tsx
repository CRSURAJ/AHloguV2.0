"use client";

import { useMemo, useRef, useState } from "react";

import FeedbackMessage from "@/components/FeedbackMessage";
import { useJobs } from "@/hooks/useJobs";
import { useProjects } from "@/hooks/useProjects";
import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, PermissionLevel, Project, WorkerRole } from "@/types/work";

import BaajBoard from "./BaajBoard";
import type { DrawerFocus } from "./BaajBoard";
import DeliveryBoard from "./DeliveryBoard";
import GanttView from "./GanttView";

import {
  getArchiveJobConfirmationMessage,
  getDeleteJobConfirmationMessage,
  getInvalidJobDocumentLinkMessage,
  getJobDocumentLinkAddedMessage,
  getJobTitle,
  isDuplicateJobIdMessage,
  isValidJobDocumentUrl,
  makeJobDocumentLink,
} from "./jobManagementHelpers";

import JobCard from "./JobCard";
import JobStatsCards from "./JobStatsCards";
import styles from "./JobManagementPanel.module.css";

type JobManagementPanelProps = {
  onClose: () => void;
  currentPermissionLevel: PermissionLevel;
  currentUserName: string;
};

type PanelView = "board" | "jobs" | "dash" | "gantt";

type JobFormState = {
  caseNo: string;
  jobId: string;
  orderNo: string;
  jobName: string;
  customerName: string;
  location: string;
  description: string;
  assignedRoles: WorkerRole[];
  jobDocumentLinks: Job["jobDocumentLinks"];
  isActive: boolean;
  projectId: string;
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
  jobDocumentLinks: [],
  isActive: true,
  projectId: "",
};

export default function JobManagementPanel({
  onClose,
  currentPermissionLevel,
  currentUserName,
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

  const {
    projects,
    isLoadingProjects,
    handleCreateProject,
    handleUpdateProject,
    handleDeleteProject,
    getProjectById,
  } = useProjects();

  const [view, setView] = useState<PanelView>("board");
  // Set when jumping from BaajBoard so the kanban opens that project's drawer
  // (optionally with the related history section expanded).
  const [focusProjectId, setFocusProjectId] = useState<string | null>(null);
  const [focusSection, setFocusSection] = useState<DrawerFocus | null>(null);
  const [form, setForm] = useState<JobFormState>(EMPTY_FORM);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [jobDocumentTitle, setJobDocumentTitle] = useState("");
  const [jobDocumentUrl, setJobDocumentUrl] = useState("");
  const [jobDocumentMessage, setJobDocumentMessage] = useState("");
  const [isJobDocumentDialogOpen, setIsJobDocumentDialogOpen] = useState(false);
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
    if (jobDocumentMessage) setJobDocumentMessage("");
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
    if (jobDocumentMessage) setJobDocumentMessage("");
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
    setJobDocumentTitle("");
    setJobDocumentUrl("");
    setJobDocumentMessage("");
    setIsJobDocumentDialogOpen(false);
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
      jobDocumentLinks: job.jobDocumentLinks ?? [],
      isActive: job.isActive,
      projectId: job.projectId ?? "",
    });

    if (jobMessage) clearJobMessage();
    if (jobDocumentMessage) setJobDocumentMessage("");
    if (jobFormMessage) setJobFormMessage("");
    setJobErrorField("");
    setJobShakeField("");
    focusJobFormCard();
  }

  function addJobDocumentLink(): void {
    const title = jobDocumentTitle.trim();
    const url = jobDocumentUrl.trim();

    if (!title || !isValidJobDocumentUrl(url)) {
      setJobDocumentMessage(getInvalidJobDocumentLinkMessage());
      return;
    }

    const newDoc = makeJobDocumentLink(title, url);

    setForm((current) => ({
      ...current,
      jobDocumentLinks: [...current.jobDocumentLinks, newDoc],
    }));

    setJobDocumentTitle("");
    setJobDocumentUrl("");
    setJobDocumentMessage(getJobDocumentLinkAddedMessage(title));
    setIsJobDocumentDialogOpen(false);

    if (jobMessage) clearJobMessage();
  }

  function removeJobDocumentLink(docId: string): void {
    setForm((current) => ({
      ...current,
      jobDocumentLinks: current.jobDocumentLinks.filter((doc) => doc.id !== docId),
    }));

    setJobDocumentMessage("");
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
      <section className={`${styles.panel} ${view !== "jobs" ? styles.panelWide : ""}`}>
        <div className={styles.header}>
          <div>
            <h2>Project & Job Management</h2>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.viewToggle}>
              <button
                type="button"
                className={view === "dash" ? styles.viewToggleActive : ""}
                onClick={() => setView("dash")}
              >
                BaajBoard
              </button>
              <button
                type="button"
                className={view === "board" ? styles.viewToggleActive : ""}
                onClick={() => {
                  setFocusProjectId(null);
                  setFocusSection(null);
                  setView("board");
                }}
              >
                KannBoard
              </button>
              <button
                type="button"
                className={view === "gantt" ? styles.viewToggleActive : ""}
                onClick={() => setView("gantt")}
              >
                GanttBoard
              </button>
              <button
                type="button"
                className={view === "jobs" ? styles.viewToggleActive : ""}
                onClick={() => setView("jobs")}
              >
                Jobs
              </button>
            </div>

            <button className={styles.closeButton} type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {view === "gantt" ? (
          <GanttView
            projects={projects}
            isLoadingProjects={isLoadingProjects}
            onOpenProject={(project) => {
              setFocusProjectId(project.id);
              setFocusSection(null);
              setView("board");
            }}
          />
        ) : view === "dash" ? (
          <BaajBoard
            projects={projects}
            isLoadingProjects={isLoadingProjects}
            onOpenProject={(project, focus) => {
              setFocusProjectId(project.id);
              setFocusSection(focus ?? null);
              setView("board");
            }}
          />
        ) : view === "board" ? (
          <DeliveryBoard
            projects={projects}
            jobs={visibleJobs}
            isLoadingProjects={isLoadingProjects}
            currentUserName={currentUserName}
            canDeleteProjects={canArchiveOrDeleteJobs}
            initialSelectedProjectId={focusProjectId}
            initialDrawerFocus={focusSection}
            onCreateProject={handleCreateProject}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onCreateJobForProject={(project: Project) => {
              resetForm();
              setForm({
                ...EMPTY_FORM,
                projectId: project.id,
                customerName: project.customerName,
                location: project.location,
              });
              setView("jobs");
              focusJobFormCard();
            }}
            onEditJob={(job) => {
              setView("jobs");
              startEdit(job);
            }}
          />
        ) : (
          <>
            <JobStatsCards
              totalJobs={visibleJobs.length}
              activeJobs={activeJobs.length}
              inactiveJobs={inactiveJobs.length}
            />

            <div ref={jobFeedbackRef} tabIndex={-1} className={styles.feedbackFocusTarget}>
              <FeedbackMessage message={jobFormMessage || jobMessage} />
              <FeedbackMessage message={jobDocumentMessage} />
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

                <label>
                  Project
                  <select
                    value={form.projectId}
                    onChange={(event) => updateField("projectId", event.target.value)}
                  >
                    <option value="">No project (stand-alone job)</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.customerName || project.projectRef}
                        {project.projectRef ? ` (${project.projectRef})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.docsField}>
                  <span className={styles.docsLabel}>Technical Documents</span>

                  <button
                    className={styles.addDrawingButton}
                    type="button"
                    onClick={() => {
                      setJobDocumentMessage("");
                      setIsJobDocumentDialogOpen(true);
                    }}
                  >
                    + Add document link
                  </button>
                </div>
              </div>

              {form.jobDocumentLinks.length > 0 ? (
                <div className={styles.docList}>
                  {form.jobDocumentLinks.map((doc) => (
                    <div className={styles.docItem} key={doc.id}>
                      <div className={styles.docInfo}>
                        <span className={styles.docName}>{doc.title}</span>
                        <a href={doc.url} target="_blank" rel="noreferrer">
                          Open document
                        </a>
                      </div>

                      <button
                        className={styles.removeDocButton}
                        type="button"
                        onClick={() => removeJobDocumentLink(doc.id)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {isJobDocumentDialogOpen ? (
                <div className={styles.modalBackdrop}>
                  <form
                    className={styles.modalCard}
                    onSubmit={(event) => {
                      event.preventDefault();
                      addJobDocumentLink();
                    }}
                  >
                    <h2 className={styles.modalTitle}>Add Technical Document</h2>

                    <p className={styles.modalDescription}>
                      Add a OneDrive or SharePoint technical-document link. AHlogu stores the link
                      only; the original file remains in OneDrive or SharePoint.
                    </p>

                    <FeedbackMessage message={jobDocumentMessage} />

                    <label className={styles.modalField}>
                      <span className={styles.modalLabel}>Document Title</span>
                      <input
                        className={styles.modalInput}
                        autoFocus
                        value={jobDocumentTitle}
                        onChange={(event) => {
                          setJobDocumentTitle(event.target.value);
                          if (jobDocumentMessage) setJobDocumentMessage("");
                        }}
                        placeholder="e.g. P&ID Rev C, Electrical schematic"
                      />
                    </label>

                    <label className={styles.modalField}>
                      <span className={styles.modalLabel}>Document Link</span>
                      <input
                        className={styles.modalInput}
                        type="url"
                        value={jobDocumentUrl}
                        onChange={(event) => {
                          setJobDocumentUrl(event.target.value);
                          if (jobDocumentMessage) setJobDocumentMessage("");
                        }}
                        placeholder="https://..."
                      />
                    </label>

                    <div className={styles.modalActions}>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => {
                          setJobDocumentMessage("");
                          setIsJobDocumentDialogOpen(false);
                        }}
                      >
                        Cancel
                      </button>

                      <button type="submit" className={styles.primaryButton}>
                        Add Technical Document
                      </button>
                    </div>
                  </form>
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
                {sortedJobs.map((job) => {
                  const project = job.projectId ? getProjectById(job.projectId) : undefined;
                  const projectLabel = project
                    ? `${project.customerName || project.projectRef}${
                        project.projectRef ? ` (${project.projectRef})` : ""
                      }`
                    : undefined;

                  return (
                    <JobCard
                      canArchiveOrDeleteJobs={canArchiveOrDeleteJobs}
                      job={job}
                      key={job.id}
                      projectLabel={projectLabel}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                      onEdit={startEdit}
                      onToggleStatus={handleToggleJobStatus}
                    />
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
