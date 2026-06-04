import type {
  CreateLocalUserInput,
  CredentialType,
  CurrentUser,
  LocalAuthSession,
  OfflineUser,
  PermissionLevel,
  WorkerRole,
} from "@/types/work";

const USERS_KEY = "project_logu:local_auth:users";
const SESSION_KEY = "project_logu:local_auth:session";

const DEFAULT_USERS = [
  {
    id: "local-admin",
    username: "admin",
    fullName: "Local Admin",
    permissionLevel: "admin" as const,
    role: "supervisor" as const,
    credentialType: "password" as const,
    secret: "Admin1234!",
  },
  {
    id: "suraj-dhungana",
    username: "suraj",
    fullName: "Suraj Dhungana",
    permissionLevel: "worker" as const,
    role: "plumber" as const,
    credentialType: "pin" as const,
    secret: "1234",
  },
];

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isPermissionLevel(value: unknown): value is PermissionLevel {
  return value === "admin" || value === "manager" || value === "worker" || value === "user";
}

function isWorkerRole(value: unknown): value is WorkerRole {
  return (
    value === "plumber" ||
    value === "electrician" ||
    value === "gas_fitter" ||
    value === "hvac_technician" ||
    value === "refrigeration_technician" ||
    value === "apprentice" ||
    value === "supervisor" ||
    value === "other"
  );
}

function normalizePermissionLevel(value: unknown): PermissionLevel {
  
  if (value === "admin") return "admin";
  if (value === "manager") return "manager";
  return "worker";
}

function normalizeWorkerRole(
  value: unknown,
  permissionLevel: PermissionLevel
): WorkerRole {
  if (isWorkerRole(value)) return value;
  return permissionLevel === "admin" || permissionLevel === "manager" ? "supervisor" : "plumber";
}

async function deriveCredentialHash(
  secret: string,
  saltBase64: string
): Promise<string> {
  const encoder = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: base64ToArrayBuffer(saltBase64),
      iterations: 250000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
}

export async function buildCredential(secret: string): Promise<{
  credentialSalt: string;
  credentialHash: string;
}> {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);

  const credentialSalt = bytesToBase64(saltBytes);
  const credentialHash = await deriveCredentialHash(secret, credentialSalt);

  return { credentialSalt, credentialHash };
}

export async function verifyCredential(
  user: OfflineUser,
  secret: string
): Promise<boolean> {
  const hash = await deriveCredentialHash(secret, user.credentialSalt);
  return hash === user.credentialHash;
}

export function validateSecret(
  credentialType: CredentialType,
  secret: string
): string {
  const trimmed = secret.trim();

  if (credentialType === "pin") {
    if (!/^\d{4,8}$/.test(trimmed)) {
      return "PIN must be 4 to 8 digits.";
    }
    return "";
  }

  if (trimmed.length < 8) {
    return "Password must be at least 8 characters.";
  }

  return "";
}

function migrateStoredUser(item: unknown): OfflineUser | null {
  if (!item || typeof item !== "object") return null;

  const raw = item as Record<string, unknown>;

  const id = typeof raw.id === "string" ? raw.id : makeUuid();
  const username =
    typeof raw.username === "string" ? normalizeUsername(raw.username) : "";
  const fullName =
    typeof raw.fullName === "string" ? raw.fullName.trim() : "";
  const credentialType =
    raw.credentialType === "password" ? "password" : "pin";
  const credentialHash =
    typeof raw.credentialHash === "string" ? raw.credentialHash : "";
  const credentialSalt =
    typeof raw.credentialSalt === "string" ? raw.credentialSalt : "";

  const permissionLevel = normalizePermissionLevel(
    raw.permissionLevel ?? raw.role
  );

  const role = normalizeWorkerRole(raw.role, permissionLevel);

  if (!username || !fullName || !credentialHash || !credentialSalt) {
    return null;
  }

  return {
    id,
    username,
    fullName,
    permissionLevel,
    role,
    credentialType,
    credentialHash,
    credentialSalt,
    mustChangeCredential: Boolean(raw.mustChangeCredential),
    isActive: raw.isActive !== false,
    createdAt:
      typeof raw.createdAt === "string"
        ? raw.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date().toISOString(),
  };
}

export function loadOfflineUsers(): OfflineUser[] {
  if (!isBrowser()) return [];

  const raw = window.localStorage.getItem(USERS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    let needsRewrite = false;

    const users = parsed
      .map((item) => {
        const migrated = migrateStoredUser(item);

        if (!migrated) {
          needsRewrite = true;
          return null;
        }

        const legacy = item as Record<string, unknown>;

        if (
          !isPermissionLevel(legacy.permissionLevel) ||
          !isWorkerRole(legacy.role)
        ) {
          needsRewrite = true;
        }

        return migrated;
      })
      .filter((item): item is OfflineUser => item !== null);

    if (needsRewrite) {
      saveOfflineUsers(users);
    }

    return users;
  } catch {
    return [];
  }
}

export function saveOfflineUsers(users: OfflineUser[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function ensureSeedUsers(): Promise<void> {
  if (!isBrowser()) return;

  const existing = loadOfflineUsers();
  if (existing.length > 0) return;

  const seededUsers: OfflineUser[] = [];

  for (const item of DEFAULT_USERS) {
    const { credentialHash, credentialSalt } = await buildCredential(item.secret);

    seededUsers.push({
      id: item.id,
      username: normalizeUsername(item.username),
      fullName: item.fullName,
      permissionLevel: item.permissionLevel,
      role: item.role,
      credentialType: item.credentialType,
      credentialHash,
      credentialSalt,
      mustChangeCredential: item.permissionLevel !== "worker",
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  saveOfflineUsers(seededUsers);
}

export async function createOfflineUser(
  input: CreateLocalUserInput
): Promise<OfflineUser> {
  const { credentialHash, credentialSalt } = await buildCredential(input.secret);
  const now = new Date().toISOString();

  return {
    id: makeUuid(),
    username: normalizeUsername(input.username),
    fullName: input.fullName.trim(),
    permissionLevel: input.permissionLevel,
    role: input.role,
    credentialType: input.permissionLevel === "admin" || input.permissionLevel === "manager" ? "password" : input.credentialType,
    credentialHash,
    credentialSalt,
    mustChangeCredential: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function loadLocalAuthSession(): LocalAuthSession | null {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LocalAuthSession;

    if (
      typeof parsed?.userId === "string" &&
      typeof parsed?.signedInAt === "string"
    ) {
      return parsed;
    }

    return null;
  } catch {
    return null;
  }
}

export function saveLocalAuthSession(session: LocalAuthSession): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearLocalAuthSession(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function toCurrentUser(user: OfflineUser): CurrentUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    permissionLevel: user.permissionLevel,
    role: user.role,
    credentialType: user.credentialType,
    mustChangeCredential: user.mustChangeCredential,
  };
}

export function restoreCurrentUserFromSession(
  users: OfflineUser[],
  session: LocalAuthSession | null
): CurrentUser | null {
  if (!session) return null;

  const matched = users.find(
    (user) => user.id === session.userId && user.isActive
  );

  return matched ? toCurrentUser(matched) : null;
}

export function findUserByUsername(
  users: OfflineUser[],
  username: string
): OfflineUser | null {
  const normalized = normalizeUsername(username);

  return (
    users.find(
      (user) => normalizeUsername(user.username) === normalized && user.isActive
    ) ?? null
  );
}

export function hasAnotherActiveAdmin(
  users: OfflineUser[],
  userIdToExclude: string
): boolean {
  return users.some(
    (user) =>
      user.id !== userIdToExclude &&
      user.permissionLevel === "admin" &&
      user.isActive
  );
}

export function sanitizeUsernameInput(username: string): string {
  return normalizeUsername(username).replace(/\s+/g, "");
}
