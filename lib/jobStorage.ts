import { getCloudProvider } from "@/lib/cloud/client";
import { WORKER_ROLE_OPTIONS } from "@/types/work";
import type { Job, JobDocumentLink, WorkerRole } from "@/types/work";

const JOBS_STORAGE_KEY = "project_logu:jobs";

export const JOBS_CHANGED_EVENT = "ahlogu:jobs-changed";

export type CreateJobInput = {
  caseNo: string;
  jobId: string;
  orderNo: string;
  jobName: string;
  customerName: string;
  location: string;
  description: string;
  assignedRoles: WorkerRole[];
  jobDocumentLinks?: Job["jobDocumentLinks"];
  isActive?: boolean;
  /** Record id of the Project this job belongs to (created in Build phase). */
  projectId?: string;
};

export type UpdateJobInput = Partial<CreateJobInput>;

const VALID_WORKER_ROLES = new Set<WorkerRole>(WORKER_ROLE_OPTIONS.map((option) => option.value));

function getCloud() {
  return getCloudProvider();
}

function shouldUseAwsJobs(): boolean {
  return getCloud().providerName === "aws";
}

const CLOUD_JOBS_REFRESH_MS = 15_000;
let cachedCloudJobs: Job[] | null = null;
let cachedCloudJobsAt = 0;
let inFlightCloudJobs: Promise<Job[]> | null = null;

async function listCloudJobsWithGuard(): Promise<Job[]> {
  const now = Date.now();

  if (cachedCloudJobs && now - cachedCloudJobsAt < CLOUD_JOBS_REFRESH_MS) {
    return cachedCloudJobs;
  }

  if (inFlightCloudJobs) {
    return inFlightCloudJobs;
  }

  inFlightCloudJobs = getCloud()
    .jobs.list()
    .then((jobs) => {
      cachedCloudJobs = jobs;
      cachedCloudJobsAt = Date.now();
      return jobs;
    })
    .finally(() => {
      inFlightCloudJobs = null;
    });

  return inFlightCloudJobs;
}

export function clearCloudJobsCache(): void {
  cachedCloudJobs = null;
  cachedCloudJobsAt = 0;
  inFlightCloudJobs = null;
}

async function loadLocalJobs(): Promise<Job[]> {
  if (typeof window === "undefined") return [];

  const raw = window.localStorage.getItem(JOBS_STORAGE_KEY);
  const parsed = parseJson<unknown[]>(raw);

  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeJob)
    .filter((job): job is Job => job !== null)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : value;
}

function cleanAssignedRoles(value: unknown): WorkerRole[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (role): role is WorkerRole =>
      typeof role === "string" && VALID_WORKER_ROLES.has(role as WorkerRole),
  );
}

function cleanJobDocumentLinks(value: unknown): JobDocumentLink[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((doc, index): JobDocumentLink | null => {
      if (!doc || typeof doc !== "object") return null;

      const item = doc as Partial<JobDocumentLink>;
      const title = cleanString(item.title);
      const url = cleanString(item.url);

      if (!title || !url) return null;

      return {
        id: cleanString(item.id) || makeId(`job-doc-link-${index}`),
        title,
        url,
        addedAt: cleanDate(item.addedAt, new Date().toISOString()),
      };
    })
    .filter((doc): doc is JobDocumentLink => doc !== null);
}

function normalizeJob(value: unknown, index: number): Job | null {
  if (!value || typeof value !== "object") return null;

  const item = value as Partial<Job>;
  const now = new Date().toISOString();

  const id = cleanString(item.id) || makeId(`job-${index}`);
  const createdAt = cleanDate(item.createdAt, now);
  const updatedAt = cleanDate(item.updatedAt, createdAt);

  return {
    id,
    caseNo: cleanString(item.caseNo),
    jobId: cleanString(item.jobId),
    orderNo: cleanString(item.orderNo),
    jobName: cleanString(item.jobName),
    customerName: cleanString(item.customerName),
    location: cleanString(item.location),
    description: cleanString(item.description),
    assignedRoles: cleanAssignedRoles(item.assignedRoles),
    jobDocumentLinks: cleanJobDocumentLinks(
      (item as { jobDocumentLinks?: unknown }).jobDocumentLinks,
    ),
    isActive: typeof item.isActive === "boolean" ? item.isActive : true,
    isArchived: item.isArchived === true ? true : undefined,
    createdAt,
    updatedAt,
    projectId: cleanString(item.projectId) || undefined,
  };
}

export async function loadJobs(): Promise<Job[]> {
  const localJobs = await loadLocalJobs();

  if (!shouldUseAwsJobs()) {
    return localJobs;
  }

  try {
    const cloudJobs = await listCloudJobsWithGuard();

    await saveJobs(cloudJobs, { notify: false });

    return cloudJobs;
  } catch (error) {
    console.warn("Could not load AWS jobs. Using local job cache.", error);
    return localJobs;
  }
}

type SaveJobsOptions = {
  notify?: boolean;
};

export async function saveJobs(jobs: Job[], options: SaveJobsOptions = {}): Promise<void> {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));

  if (options.notify === false) return;

  window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const jobs = await loadJobs();
  const now = new Date().toISOString();

  const job: Job = {
    id: makeId("job"),
    caseNo: input.caseNo.trim(),
    jobId: input.jobId.trim(),
    orderNo: input.orderNo.trim(),
    jobName: input.jobName.trim(),
    customerName: input.customerName.trim(),
    location: input.location.trim(),
    description: input.description.trim(),
    assignedRoles: cleanAssignedRoles(input.assignedRoles),
    jobDocumentLinks: input.jobDocumentLinks ?? [],
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
    projectId: input.projectId?.trim() || undefined,
  };

  if (shouldUseAwsJobs()) {
    const result = await getCloud().jobs.create(job);

    if (!result.ok) {
      throw new Error(result.message || "Could not create job in AWS.");
    }

    clearCloudJobsCache();
  }

  await saveJobs([job, ...jobs.filter((item) => item.id !== job.id)]);

  return job;
}

export async function updateJob(id: string, updates: UpdateJobInput): Promise<Job | null> {
  const jobs = await loadJobs();
  const existingJob = jobs.find((job) => job.id === id);

  if (!existingJob) return null;

  const updatedJob: Job = {
    ...existingJob,
    caseNo: updates.caseNo?.trim() ?? existingJob.caseNo,
    jobId: updates.jobId?.trim() ?? existingJob.jobId,
    orderNo: updates.orderNo?.trim() ?? existingJob.orderNo,
    jobName: updates.jobName?.trim() ?? existingJob.jobName,
    customerName: updates.customerName?.trim() ?? existingJob.customerName,
    location: updates.location?.trim() ?? existingJob.location,
    description: updates.description?.trim() ?? existingJob.description,
    assignedRoles: updates.assignedRoles
      ? cleanAssignedRoles(updates.assignedRoles)
      : existingJob.assignedRoles,
    jobDocumentLinks: updates.jobDocumentLinks ?? existingJob.jobDocumentLinks,
    isActive: updates.isActive ?? existingJob.isActive,
    updatedAt: new Date().toISOString(),
    projectId:
      updates.projectId !== undefined
        ? updates.projectId.trim() || undefined
        : existingJob.projectId,
  };

  if (shouldUseAwsJobs()) {
    const result = await getCloud().jobs.update(updatedJob);

    if (!result.ok) {
      throw new Error(result.message || "Could not update job in AWS.");
    }

    clearCloudJobsCache();
  }

  await saveJobs(jobs.map((job) => (job.id === id ? updatedJob : job)));

  return updatedJob;
}

export async function archiveJob(id: string): Promise<Job | null> {
  const jobs = await loadJobs();
  const existingJob = jobs.find((job) => job.id === id);

  if (!existingJob) return null;

  const now = new Date().toISOString();
  const archivedJob: Job = {
    ...existingJob,
    isActive: false,
    isArchived: true,
    archivedAt: now,
    updatedAt: now,
  };

  if (shouldUseAwsJobs()) {
    const result = await getCloud().jobs.archive(id);
    if (!result.ok) {
      throw new Error(result.message || "Could not archive job in AWS.");
    }
    clearCloudJobsCache();
  }

  await saveJobs(jobs.map((job) => (job.id === id ? archivedJob : job)));
  return archivedJob;
}

export async function deleteJob(id: string): Promise<void> {
  const jobs = await loadJobs();

  if (shouldUseAwsJobs()) {
    const result = await getCloud().jobs.delete(id);

    if (!result.ok) {
      throw new Error(result.message || "Could not delete job in AWS.");
    }

    clearCloudJobsCache();
  }

  await saveJobs(jobs.filter((job) => job.id !== id));
}

export async function getActiveJobs(): Promise<Job[]> {
  const jobs = await loadJobs();

  return jobs.filter((job) => job.isActive && job.isArchived !== true);
}

export async function getJobsForRole(role: WorkerRole): Promise<Job[]> {
  const jobs = await getActiveJobs();

  return jobs.filter((job) => job.assignedRoles.includes(role));
}
