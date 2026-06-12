import { getCurrentCognitoSession } from "@/lib/auth/cognitoClient";
import {
  convertProfileToCurrentUser,
  getBooleanValue,
  getProfileRecord,
  getStringValue,
  type ProfileRecord,
} from "@/lib/auth/currentUserProfile";
import type { CurrentUser, PermissionLevel, WorkerRole } from "@/types/work";

type CognitoSession = NonNullable<Awaited<ReturnType<typeof getCurrentCognitoSession>>>;

export type AwsUserListItem = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: string;
  permissionLevel: PermissionLevel;
  isAdmin: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreateAwsUserInput = {
  email: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  temporaryPassword: string;
};

export function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_AHLOGU_API_URL;

  if (!apiBaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_AHLOGU_API_URL.");
  }

  return apiBaseUrl.replace(/\/$/, "");
}

export class CloudAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudAuthError";
  }
}

export function isCloudAuthError(error: unknown): error is CloudAuthError {
  return error instanceof Error && error.name === "CloudAuthError";
}

function getCachedProfileKey(userId: string) {
  return `ahlogu:current-user:${userId}`;
}

function cacheCurrentUser(user: CurrentUser): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(getCachedProfileKey(user.id), JSON.stringify(user));
  } catch {
    // Quota/private-mode failures only cost the offline fallback.
  }
}

export function loadCachedCurrentUser(userId: string): CurrentUser | null {
  if (typeof window === "undefined" || !userId) return null;

  const raw = window.localStorage.getItem(getCachedProfileKey(userId));
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as ProfileRecord;
    const id = getStringValue(record, ["id"]);
    if (!id) return null;

    return convertProfileToCurrentUser(record, getStringValue(record, ["username"]), id);
  } catch {
    return null;
  }
}

export function clearCachedCurrentUser(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.removeItem(getCachedProfileKey(userId));
}

export async function fetchAwsUsersFromCloud(): Promise<AwsUserListItem[]> {
  const session = await getCurrentCognitoSession();

  if (!session) {
    throw new Error("No valid session found.");
  }

  const idToken = session.getIdToken().getJwtToken();

  const response = await fetch(`${getApiBaseUrl()}/users`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });

  const responseJson = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const message =
      responseJson &&
      typeof responseJson === "object" &&
      "error" in responseJson &&
      typeof responseJson.error === "string"
        ? responseJson.error
        : `Could not load users. Status ${response.status}.`;

    throw new Error(message);
  }

  const items =
    responseJson &&
    typeof responseJson === "object" &&
    "items" in responseJson &&
    Array.isArray((responseJson as { items: unknown }).items)
      ? (responseJson as { items: unknown[] }).items
      : Array.isArray(responseJson)
        ? responseJson
        : [];

  return items.map((item) => {
    const record = item && typeof item === "object" ? (item as ProfileRecord) : {};

    const rawPermissionLevel = getStringValue(record, ["permissionLevel"]).toLowerCase();
    const permissionLevel: PermissionLevel =
      rawPermissionLevel === "admin"
        ? "admin"
        : rawPermissionLevel === "manager"
          ? "manager"
          : "worker";

    return {
      id: getStringValue(record, ["id"]),
      email: getStringValue(record, ["email"]),
      username: getStringValue(record, ["username", "email"]),
      fullName: getStringValue(record, ["fullName", "name", "email"]),
      role: getStringValue(record, ["role"]) || "other",
      permissionLevel,
      isAdmin: getBooleanValue(record, ["isAdmin"]),
      isActive: record.isActive !== false,
      createdAt: getStringValue(record, ["createdAt"]),
      updatedAt: getStringValue(record, ["updatedAt"]),
    };
  });
}

export async function fetchCurrentUserFromCloud(session: CognitoSession): Promise<CurrentUser> {
  const idToken = session.getIdToken().getJwtToken();
  const payload = session.getIdToken().decodePayload() as ProfileRecord;
  const fallbackEmail = getStringValue(payload, ["email", "username"]);
  const fallbackSub = getStringValue(payload, ["sub"]);

  const response = await fetch(`${getApiBaseUrl()}/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const message = errorText || `Could not load AHlogu user profile. Status ${response.status}.`;

    // Only an explicit rejection of the credentials is an auth error;
    // anything else (5xx, gateway issues) must not destroy the session.
    if (response.status === 401 || response.status === 403) {
      throw new CloudAuthError(message);
    }

    throw new Error(message);
  }

  const responseJson = (await response.json()) as unknown;
  const profile = getProfileRecord(responseJson);

  const isActiveRaw = profile.isActive ?? profile.is_active;

  if (isActiveRaw === false || isActiveRaw === "false") {
    throw new CloudAuthError("This AHlogu user is inactive.");
  }

  const currentUser = convertProfileToCurrentUser(profile, fallbackEmail, fallbackSub);
  cacheCurrentUser(currentUser);
  return currentUser;
}

async function getAwsAuthHeaders(): Promise<Record<string, string>> {
  const session = await getCurrentCognitoSession();

  if (!session) {
    throw new Error("No valid session found.");
  }

  const idToken = session.getIdToken().getJwtToken();

  return {
    Authorization: `Bearer ${idToken}`,
    "Content-Type": "application/json",
  };
}

function getAwsErrorMessage(responseJson: unknown, fallbackMessage: string): string {
  if (
    responseJson &&
    typeof responseJson === "object" &&
    "error" in responseJson &&
    typeof responseJson.error === "string"
  ) {
    return responseJson.error;
  }

  return fallbackMessage;
}

export async function createAwsUserInCloud(input: CreateAwsUserInput): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/users`, {
    method: "POST",
    headers: await getAwsAuthHeaders(),
    body: JSON.stringify({
      email: input.email,
      fullName: input.fullName,
      role: input.role,
      permissionLevel: input.permissionLevel,
      temporaryPassword: input.temporaryPassword,
    }),
  });

  const responseJson = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      getAwsErrorMessage(responseJson, `Could not create user. Status ${response.status}.`),
    );
  }
}

export async function updateAwsUserActiveInCloud(userId: string, isActive: boolean): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: await getAwsAuthHeaders(),
    body: JSON.stringify({
      isActive,
    }),
  });

  const responseJson = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      getAwsErrorMessage(responseJson, `Could not update user. Status ${response.status}.`),
    );
  }
}

export async function resetAwsUserPasswordInCloud(
  userId: string,
  temporaryPassword: string,
): Promise<void> {
  const response = await fetch(
    `${getApiBaseUrl()}/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "POST",
      headers: await getAwsAuthHeaders(),
      body: JSON.stringify({
        temporaryPassword,
      }),
    },
  );

  const responseJson = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      getAwsErrorMessage(responseJson, `Could not reset password. Status ${response.status}.`),
    );
  }
}

export async function deleteAwsUserFromCloud(userId: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: await getAwsAuthHeaders(),
  });

  const responseJson = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    throw new Error(
      getAwsErrorMessage(responseJson, `Could not delete user. Status ${response.status}.`),
    );
  }
}
