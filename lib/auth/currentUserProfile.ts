import type { CredentialType, CurrentUser, PermissionLevel, WorkerRole } from "@/types/work";

export type ProfileRecord = Record<string, unknown>;

const WORKER_ROLES: WorkerRole[] = [
  "plumber",
  "electrician",
  "gas_fitter",
  "hvac_technician",
  "refrigeration_technician",
  "apprentice",
  "supervisor",
  "other",
];

export function getStringValue(source: ProfileRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

export function getBooleanValue(source: ProfileRecord, keys: string[]): boolean {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();

      if (normalized === "true" || normalized === "yes") {
        return true;
      }

      if (normalized === "false" || normalized === "no") {
        return false;
      }
    }
  }

  return false;
}

export function getProfileRecord(responseJson: unknown): ProfileRecord {
  if (!responseJson || typeof responseJson !== "object") {
    return {};
  }

  const root = responseJson as ProfileRecord;

  for (const key of ["user", "profile", "me", "item"]) {
    const value = root[key];

    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as ProfileRecord;
    }
  }

  return root;
}

export function normalizeWorkerRole(value: string): WorkerRole {
  const normalized = value.trim().toLowerCase();

  if (WORKER_ROLES.includes(normalized as WorkerRole)) {
    return normalized as WorkerRole;
  }

  if (normalized === "admin") {
    return "supervisor";
  }

  if (normalized === "hvac technician") {
    return "hvac_technician";
  }

  if (normalized === "refrigeration technician") {
    return "refrigeration_technician";
  }

  if (normalized === "gas fitter") {
    return "gas_fitter";
  }

  return "other";
}

export function isManagementPermission(permissionLevel: PermissionLevel | undefined): boolean {
  return permissionLevel === "admin" || permissionLevel === "manager";
}

export function normalizePermissionLevel(profile: Record<string, unknown>): PermissionLevel {
  const permissionLevel = getStringValue(profile, [
    "permissionLevel",
    "permission_level",
    "accessLevel",
    "access_level",
  ]).toLowerCase();

  if (permissionLevel === "admin") {
    return "admin";
  }

  if (permissionLevel === "manager") {
    return "manager";
  }

  if (permissionLevel === "worker" || permissionLevel === "user") {
    return "worker";
  }

  const role = getStringValue(profile, ["role", "userRole", "user_role"]).toLowerCase();
  const isAdmin = getBooleanValue(profile, ["isAdmin", "is_admin", "admin"]);

  if (isAdmin || role === "admin") {
    return "admin";
  }

  if (role === "manager") {
    return "manager";
  }

  return "worker";
}

export function convertProfileToCurrentUser(
  profile: ProfileRecord,
  fallbackEmail: string,
  fallbackSub: string,
): CurrentUser {
  const username = getStringValue(profile, ["email", "username", "userName"]) || fallbackEmail;

  const fullName =
    getStringValue(profile, ["fullName", "full_name", "name", "displayName"]) ||
    username ||
    fallbackEmail;

  const role = normalizeWorkerRole(
    getStringValue(profile, ["workerRole", "worker_role", "tradeRole", "trade_role", "role"]),
  );

  const credentialType: CredentialType = "password";

  return {
    id: getStringValue(profile, ["id", "userId", "user_id", "sub"]) || fallbackSub || username,
    username,
    fullName,
    permissionLevel: normalizePermissionLevel(profile),
    role,
    credentialType,
    mustChangeCredential: false,
  };
}

export function normalizeLoginErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : "Sign in failed.";

  const value = rawMessage.toLowerCase();

  if (
    value.includes("user is disabled") ||
    value.includes("userdisabled") ||
    value.includes("user disabled") ||
    value.includes("user does not exist") ||
    value.includes("usernotfound") ||
    value.includes("notauthorized") ||
    value.includes("incorrect username or password")
  ) {
    return "Incorrect username or password.";
  }

  if (value.includes("attempt limit exceeded")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }

  return rawMessage;
}
