export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type CredentialType = "pin" | "password";
export type PermissionLevel = "admin" | "manager" | "worker";

export type WorkerRole =
  | "plumber"
  | "electrician"
  | "gas_fitter"
  | "hvac_technician"
  | "refrigeration_technician"
  | "apprentice"
  | "supervisor"
  | "other";

export const PERMISSION_LEVEL_OPTIONS: ReadonlyArray<{
  value: PermissionLevel;
  label: string;
}> = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "worker", label: "Worker" },
];

export const WORKER_ROLE_OPTIONS: ReadonlyArray<{
  value: WorkerRole;
  label: string;
}> = [
  { value: "plumber", label: "Plumber" },
  { value: "electrician", label: "Electrician" },
  { value: "gas_fitter", label: "Gas Fitter" },
  { value: "hvac_technician", label: "HVAC Technician" },
  { value: "refrigeration_technician", label: "Refrigeration Technician" },
  { value: "apprentice", label: "Apprentice" },
  { value: "supervisor", label: "Supervisor" },
  { value: "other", label: "Other" },
];

export type AuthActionResult = {
  ok: boolean;
  message: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  credentialType: CredentialType;
  mustChangeCredential: boolean;
};

export type ActiveSession = {
  isWorking: boolean;
  isOnBreak: boolean;
  startTime: string | null;
  breakStartTime: string | null;
  breakMinutes: number;
  jobId: string;
  location: string;
  role: WorkerRole;
  jobDocs: string;
  description: string;
};

export type DraftState = {
  jobId: string;
  location: string;
  role: WorkerRole;
  jobDocs: string;
  description: string;
};

export type LogItem = {
  id: string;
  loguId: string;
  ts: number;
  fullname: string;
  jobId: string;
  location: string;
  role: WorkerRole;
  jobDocs: string;
  description: string;
  startedAt: string;
  stoppedAt: string;
  breakMinutes: number;
  workedMinutes: number;
  syncStatus: SyncStatus;
  syncMessage: string;
  stickyNote?: string;
  syncedAt?: number;
};

export type JobDocumentLink = {
  id: string;
  title: string;
  url: string;
  addedAt: string;
};

export type ProjectStageKey =
  | "handover"
  | "procurement"
  | "engineering"
  | "build"
  | "qa"
  | "dispatch"
  | "commissioning"
  | "closed";

export type ProjectDepartment = "install" | "service";

/**
 * A recorded approval on an exit-criterion or trade sub-step. The record is
 * kept for audit — a comment is required when no document link is attached.
 */
export type ProjectSignOff = {
  by: string;
  at: string;
  comment: string;
  documentUrl?: string;
  documentTitle?: string;
};

export type TradeState = "not_started" | "in_progress" | "complete" | "signed_off";

export type ProjectTradeChecklistItem = {
  label: string;
  signoff: ProjectSignOff | null;
};

export type ProjectTrade = {
  state: TradeState;
  blocked: boolean;
  reason: string;
  checklist: ProjectTradeChecklistItem[];
};

/** Per-stage → per-criterion sign-off. `null` means the criterion is unmet. */
export type ProjectGates = Record<string, Record<string, ProjectSignOff | null>>;

/** Keyed by trade key (plumbing/electrical/prefab/controller). */
export type ProjectTrades = Record<string, ProjectTrade>;

export type ProjectDateField = "target" | "delivery";

export type ProjectDateLogEntry = {
  field: ProjectDateField;
  from: string | null;
  to: string;
  at: string;
  by: string;
  reason: string;
};

/**
 * A Project is the post-sale delivery pipeline entity — it starts at Handover
 * and advances through stage gates to Closed. Projects are what the delivery
 * board tracks. Jobs (worker work orders) are created under a project once it
 * reaches the Build phase and link back via `Job.projectId`.
 */
export type Project = {
  id: string;
  /** Human reference, e.g. "AH-1088". Unique (case-insensitive). */
  projectRef: string;
  customerName: string;
  location: string;
  description: string;
  department: ProjectDepartment;
  /** Display-only contract value, e.g. "$186k". */
  value: string;
  stage: ProjectStageKey;
  gates: ProjectGates;
  trades: ProjectTrades;
  targetDate: string | null;
  deliveryDate: string | null;
  dateLog: ProjectDateLogEntry[];
  isArchived?: boolean;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Job = {
  id: string;
  caseNo: string;
  jobId: string;
  orderNo: string;
  jobName: string;
  customerName: string;
  location: string;
  description: string;
  assignedRoles: WorkerRole[];
  jobDocumentLinks: JobDocumentLink[];
  isActive: boolean;
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  createdAt: string;
  updatedAt: string;
  /** Record id of the Project this job was created under (Build phase). */
  projectId?: string;
};

export type WorkerLiveStatusValue =
  | "online"
  | "available"
  | "working"
  | "on_break"
  | "offline"
  | "deactivated";

export type WorkerLiveStatus = {
  userId: string;
  fullName: string;
  email: string;
  role: WorkerRole;
  status: WorkerLiveStatusValue;
  lastKnownStatus?: WorkerLiveStatusValue;

  currentJobId?: string;
  currentJobName?: string;
  currentJobLocation?: string;

  startedAt?: string;
  breakStartedAt?: string;
  breakMinutes: number;

  pendingSyncCount: number;
  failedSyncCount: number;
  oldestPendingSyncAt?: string;

  lastSeenAt: string;
  updatedAt: string;
};

export type AdminWorkLog = {
  id: string;
  uploadedAt: string;
  syncedAt: string;
  startedAt: string;
  stoppedAt: string;
  jobId: string;
  fullname: string;
  role: WorkerRole;
  description: string;
  location: string;
  workedMinutes: number;
  breakMinutes: number;
  stickyNote?: string;
  uploadedBy?: string;
  uploadedByEmail?: string;
  updatedAt?: string;
  isJobArchived?: boolean;
  jobArchivedAt?: string;
  jobArchivedBy?: string;
};
