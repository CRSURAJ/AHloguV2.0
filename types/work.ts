export type SyncStatus = "pending" | "syncing" | "synced" | "failed";
export type CredentialType = "pin" | "password";
export type PermissionLevel = "admin" | "user";

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
  { value: "user", label: "User" },
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

export type CreateLocalUserInput = {
  username: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  credentialType: CredentialType;
  secret: string;
};

export type LocalAuthSession = {
  userId: string;
  signedInAt: string;
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

export type OfflineUser = CurrentUser & {
  credentialHash: string;
  credentialSalt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ActiveSession = {
  isWorking: boolean;
  isOnBreak: boolean;
  startTime: string | null;
  breakStartTime: string | null;
  breakMinutes: number;
  jobId: string;
  location: string;
  role: string;
  jobDocs: string;
  description: string;
};

export type DraftState = {
  jobId: string;
  location: string;
  role: string;
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
  role: string;
  jobDocs: string;
  description: string;
  startedAt: string;
  stoppedAt: string;
  breakMinutes: number;
  workedMinutes: number;
  syncStatus: SyncStatus;
  syncMessage: string;
  syncedAt?: number;
};
