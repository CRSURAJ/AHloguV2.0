import { getCurrentCognitoSession } from "@/lib/auth/cognitoClient";
import {
  convertProfileToCurrentUser,
  getBooleanValue,
  getProfileRecord,
  getStringValue,
  type ProfileRecord,
} from "@/lib/auth/currentUserProfile";
import type { CurrentUser, PermissionLevel } from "@/types/work";

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

export function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_AHLOGU_API_URL;

  if (!apiBaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_AHLOGU_API_URL.");
  }

  return apiBaseUrl.replace(/\/$/, "");
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

  if (!Array.isArray(responseJson)) {
    return [];
  }

  return responseJson.map((item) => {
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
    throw new Error(errorText || `Could not load AHlogu user profile. Status ${response.status}.`);
  }

  const responseJson = (await response.json()) as unknown;
  const profile = getProfileRecord(responseJson);

  const isActiveRaw = profile.isActive ?? profile.is_active;

  if (isActiveRaw === false || isActiveRaw === "false") {
    throw new Error("This AHlogu user is inactive.");
  }

  return convertProfileToCurrentUser(profile, fallbackEmail, fallbackSub);
}
