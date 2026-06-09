import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, JobDocumentLink, WorkerRole } from "@/types/work";

function makeClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function isValidJobDocumentUrl(url: string): boolean {
  const value = url.trim();

  if (!value) return false;

  try {
    const parsedUrl = new URL(value);
    return parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:";
  } catch {
    return false;
  }
}

export function makeJobDocumentLink(title: string, url: string): JobDocumentLink {
  return {
    id: makeClientId("job-doc-link"),
    title: title.trim(),
    url: url.trim(),
    addedAt: new Date().toISOString(),
  };
}

export function getJobDocumentLinkAddedMessage(title: string): string {
  return `Added job document link: ${title.trim()}.`;
}

export function getInvalidJobDocumentLinkMessage(): string {
  return "Enter a document title and a valid http/https link.";
}

export function getRoleLabel(role: WorkerRole): string {
  return WORKER_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export function formatRoleList(roles: WorkerRole[]): string {
  if (roles.length === 0) return "No roles assigned";

  return roles.map(getRoleLabel).join(", ");
}

export function getJobTitle(job: Job): string {
  return job.jobName || job.jobId || job.caseNo || "Untitled Job";
}

export function isDuplicateJobIdMessage(message: string): boolean {
  const value = message.toLowerCase();

  return (
    value.includes("job id") &&
    (value.includes("already exists") || value.includes("unique") || value.includes("duplicate"))
  );
}

export function getArchiveJobConfirmationMessage(job: Job): string {
  return `Archive ${getJobTitle(job)}?\n\nThis will remove the job from workers, normal job lists, and normal work logs.\nAll existing work logs for this job will move to archived work logs.\n\nThis cannot be undone.`;
}

export function getDeleteJobConfirmationMessage(job: Job): string {
  return `Delete ${getJobTitle(job)}? This cannot be undone.`;
}

