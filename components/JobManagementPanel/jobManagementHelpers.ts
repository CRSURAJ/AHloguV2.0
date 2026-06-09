import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, JobDrawing, WorkerRole } from "@/types/work";

export const MAX_JOB_DRAWINGS = 5;
export const MAX_JOB_DRAWING_SIZE_BYTES = 2 * 1024 * 1024;

function makeClientId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;

  const sizeKb = sizeBytes / 1024;
  if (sizeKb < 1024) return `${sizeKb.toFixed(1)} KB`;

  return `${(sizeKb / 1024).toFixed(1)} MB`;
}

export function readJobDrawingFile(file: File): Promise<JobDrawing> {
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
