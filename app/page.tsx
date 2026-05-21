"use client";

import Image from "next/image";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import AdminDashboard from "@/components/AdminDashboard";
import JobManagementPanel from "@/components/JobManagementPanel/JobManagementPanel";
import UserManagementPanel from "@/components/UserManagementPanel/UserManagementPanel";
import WorkLogger from "@/components/WorkLogger/WorkLogger";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";
import {
  changeCurrentCognitoPassword,
  completeNewCognitoPassword,
  getCurrentCognitoSession,
  signInWithCognito,
  signOutCognito,
  type CognitoSignInResult,
} from "@/lib/auth/cognitoClient";
import { getPasswordPolicyError } from "@/lib/auth/passwordPolicy";
import type {
  AuthActionResult,
  CredentialType,
  CurrentUser,
  PermissionLevel,
  WorkerRole,
} from "@/types/work";

type ProfileRecord = Record<string, unknown>;

type CreateAwsUserPayload = {
  email: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
};


type AwsUserListItem = {
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

function getStringValue(source: ProfileRecord, keys: string[]): string {
  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function getBooleanValue(source: ProfileRecord, keys: string[]): boolean {
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

function getProfileRecord(responseJson: unknown): ProfileRecord {
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

function normalizeWorkerRole(value: string): WorkerRole {
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

function normalizePermissionLevel(profile: ProfileRecord): PermissionLevel {
  const permissionLevel = getStringValue(profile, [
    "permissionLevel",
    "permission_level",
    "accessLevel",
    "access_level",
  ]).toLowerCase();

  const role = getStringValue(profile, ["role", "userRole", "user_role"]).toLowerCase();

  const isAdmin = getBooleanValue(profile, ["isAdmin", "is_admin", "admin"]);

  if (isAdmin || permissionLevel === "admin" || role === "admin") {
    return "admin";
  }

  return "user";
}

function convertProfileToCurrentUser(
  profile: ProfileRecord,
  fallbackEmail: string,
  fallbackSub: string,
): CurrentUser {
  const username =
    getStringValue(profile, ["email", "username", "userName"]) || fallbackEmail;

  const fullName =
    getStringValue(profile, ["fullName", "full_name", "name", "displayName"]) ||
    username ||
    fallbackEmail;

  const role = normalizeWorkerRole(
    getStringValue(profile, [
      "workerRole",
      "worker_role",
      "tradeRole",
      "trade_role",
      "role",
    ]),
  );

  const credentialType: CredentialType = "password";

  return {
    id:
      getStringValue(profile, ["id", "userId", "user_id", "sub"]) ||
      fallbackSub ||
      username,
    username,
    fullName,
    permissionLevel: normalizePermissionLevel(profile),
    role,
    credentialType,
    mustChangeCredential: false,
  };
}

function getApiBaseUrl(): string {
  const apiBaseUrl = process.env.NEXT_PUBLIC_AHLOGU_API_URL;

  if (!apiBaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_AHLOGU_API_URL.");
  }

  return apiBaseUrl.replace(/\/$/, "");
}


async function fetchAwsUsersFromCloud(): Promise<AwsUserListItem[]> {
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

    const permissionLevel = getStringValue(record, ["permissionLevel"]) === "admin"
      ? "admin"
      : "user";

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

async function fetchCurrentUserFromCloud(
  session: NonNullable<Awaited<ReturnType<typeof getCurrentCognitoSession>>>,
): Promise<CurrentUser> {
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
    throw new Error(
      errorText || `Could not load AHlogu user profile. Status ${response.status}.`,
    );
  }

  const responseJson = (await response.json()) as unknown;
  const profile = getProfileRecord(responseJson);

  const isActiveRaw = profile.isActive ?? profile.is_active;

  if (isActiveRaw === false || isActiveRaw === "false") {
    throw new Error("This AHlogu user is inactive.");
  }

  return convertProfileToCurrentUser(profile, fallbackEmail, fallbackSub);
}

function LoadingScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#085153",
        color: "#eef7f3",
        fontWeight: 700,
      }}
    >
      Loading…
    </div>
  );
}

type CognitoLoginCardProps = {
  email: string;
  password: string;
  newPassword: string;
  confirmNewPassword: string;
  message: string;
  isBusy: boolean;
  requiresNewPassword: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmNewPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

function CognitoLoginCard({
  email,
  password,
  newPassword,
  confirmNewPassword,
  message,
  isBusy,
  requiresNewPassword,
  onEmailChange,
  onPasswordChange,
  onNewPasswordChange,
  onConfirmNewPasswordChange,
  onSubmit,
}: CognitoLoginCardProps) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at top left, rgba(83, 188, 123, 0.25), transparent 34%), #085153",
        color: "#eef7f3",
      }}
    >
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: "430px",
          border: "1px solid rgba(255,255,255,0.16)",
          borderRadius: "28px",
          padding: "28px",
          background: "rgba(17, 48, 45, 0.92)",
          boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
        }}
      >
        <div style={{ marginBottom: "24px" }}>
          <Image
            src="/AHlogu.png"
            alt="AH LOGU"
            width={160}
            height={48}
            priority
            style={{ objectFit: "contain", marginBottom: "18px" }}
          />

        </div>

        {message ? (
          <div
            style={{
              marginBottom: "16px",
              padding: "12px 14px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.1)",
              color: "#eef7f3",
              lineHeight: 1.45,
            }}
          >
            {message}
          </div>
        ) : null}

        {!requiresNewPassword ? (
          <>
            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "14px",
                fontWeight: 700,
              }}
            >
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                autoComplete="email"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
                fontWeight: 700,
              }}
            >
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                autoComplete="current-password"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>
          </>
        ) : (
          <>
            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "14px",
                fontWeight: 700,
              }}
            >
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => onNewPasswordChange(event.target.value)}
                autoComplete="new-password"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
                fontWeight: 700,
              }}
            >
              Confirm new password
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(event) =>
                  onConfirmNewPasswordChange(event.target.value)
                }
                autoComplete="new-password"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>
          </>
        )}

        {requiresNewPassword ? <PasswordRequirementsNote /> : null}

        <button
          type="submit"
          disabled={isBusy}
          style={{
            width: "100%",
            border: 0,
            borderRadius: "16px",
            padding: "14px 16px",
            background: isBusy ? "rgba(83,188,123,0.5)" : "#53BC7B",
            color: "#11302D",
            font: "inherit",
            fontWeight: 800,
            cursor: isBusy ? "not-allowed" : "pointer",
          }}
        >
          {isBusy
            ? "Please wait…"
            : requiresNewPassword
              ? "Set new password"
              : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function Page() {
  const [isReady, setIsReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [newPasswordUser, setNewPasswordUser] =
    useState<NonNullable<CognitoSignInResult["cognitoUser"]> | null>(null);
  const [accountMessage, setAccountMessage] = useState("");
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [changePasswordBusy, setChangePasswordBusy] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [awsUsers, setAwsUsers] = useState<AwsUserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMessage, setUsersMessage] = useState("");
  const [jobManagementOpen, setJobManagementOpen] = useState(false);

  const canManageUsers = currentUser?.permissionLevel === "admin";

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const session = await getCurrentCognitoSession();

        if (!isMounted) {
          return;
        }

        if (!session) {
          setIsReady(true);
          return;
        }

        const restoredUser = await fetchCurrentUserFromCloud(session);

        if (!isMounted) {
          return;
        }

        setCurrentUser(restoredUser);
      } catch (error) {
        signOutCognito();

        if (isMounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : "Could not restore your session.",
          );
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  async function finishSignIn(
    session: NonNullable<Awaited<ReturnType<typeof getCurrentCognitoSession>>>,
  ) {
    const cloudUser = await fetchCurrentUserFromCloud(session);
    setCurrentUser(cloudUser);
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setMessage("");
    setNewPasswordUser(null);
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");

    try {
      if (newPasswordUser) {
        const passwordPolicyError = getPasswordPolicyError(
          newPassword,
          "New password",
        );

        if (passwordPolicyError) {
          setMessage(passwordPolicyError);
          return;
        }

        if (newPassword !== confirmNewPassword) {
          setMessage("New passwords do not match.");
          return;
        }

        const session = await completeNewCognitoPassword(
          newPasswordUser,
          newPassword,
        );

        await finishSignIn(session);
        return;
      }

      const result = await signInWithCognito(email.trim(), password);

      if (result.status === "new-password-required" && result.cognitoUser) {
        setNewPasswordUser(result.cognitoUser);
        setPassword("");
        setMessage("Please set a new password before continuing.");
        return;
      }

      if (!result.session) {
        setMessage("Sign in succeeded but no session was returned.");
        return;
      }

      await finishSignIn(result.session);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Sign in failed.",
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function handleOpenUserManagement() {
    setUserManagementOpen(true);
    setUsersLoading(true);
    setUsersMessage("");

    try {
      const users = await fetchAwsUsersFromCloud();
      setAwsUsers(users);
    } catch (error) {
      setUsersMessage(
        error instanceof Error ? error.message : "Could not load Users.",
      );
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleCreateAwsUser(
    input: CreateAwsUserPayload,
  ): Promise<AuthActionResult> {
    setUsersMessage("");

    if (input.temporaryPassword !== input.confirmTemporaryPassword) {
      return {
        ok: false,
        message: "Passwords do not match.",
      };
    }

    const passwordPolicyError = getPasswordPolicyError(
      input.temporaryPassword,
      "Temporary password",
    );

    if (passwordPolicyError) {
      return {
        ok: false,
        message: passwordPolicyError,
      };
    }

    try {
      const session = await getCurrentCognitoSession();

      if (!session) {
        throw new Error("No valid session found.");
      }

      const idToken = session.getIdToken().getJwtToken();

      const response = await fetch(`${getApiBaseUrl()}/users`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
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
        const errorMessage =
          responseJson &&
          typeof responseJson === "object" &&
          "error" in responseJson &&
          typeof responseJson.error === "string"
            ? responseJson.error
            : `Could not create user. Status ${response.status}.`;

        throw new Error(errorMessage);
      }

      const users = await fetchAwsUsersFromCloud();
      setAwsUsers(users);

      return {
        ok: true,
        message:
          "User created successfully. They will be asked to set a new password on first login.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Could not create User.",
      };
    }
  }

  async function handleToggleAwsUserActive(
    userId: string,
    isActive: boolean,
  ): Promise<AuthActionResult> {
    setUsersMessage("");

    if (userId === currentUser?.id && !isActive) {
      return {
        ok: false,
        message: "You cannot deactivate your own admin account.",
      };
    }

    try {
      const session = await getCurrentCognitoSession();

      if (!session) {
        throw new Error("No valid session found.");
      }

      const idToken = session.getIdToken().getJwtToken();

      const response = await fetch(`${getApiBaseUrl()}/users/${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isActive,
        }),
      });

      const responseJson = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const errorMessage =
          responseJson &&
          typeof responseJson === "object" &&
          "error" in responseJson &&
          typeof responseJson.error === "string"
            ? responseJson.error
            : `Could not update user. Status ${response.status}.`;

        throw new Error(errorMessage);
      }

      const users = await fetchAwsUsersFromCloud();
      setAwsUsers(users);

      return {
        ok: true,
        message: isActive
          ? "User activated."
          : "User deactivated.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Could not update user.",
      };
    }
  }

  async function handleResetAwsUserPassword(
    userId: string,
    temporaryPassword: string,
  ): Promise<AuthActionResult> {
    setUsersMessage("");

    if (userId === currentUser?.id) {
      return {
        ok: false,
        message: "You cannot reset your own admin password from User Management.",
      };
    }

    const passwordPolicyError = getPasswordPolicyError(
      temporaryPassword,
      "Temporary password",
    );

    if (passwordPolicyError) {
      return {
        ok: false,
        message: passwordPolicyError,
      };
    }

    try {
      const session = await getCurrentCognitoSession();

      if (!session) {
        throw new Error("No valid session found.");
      }

      const idToken = session.getIdToken().getJwtToken();

      const response = await fetch(
        `${getApiBaseUrl()}/users/${encodeURIComponent(userId)}/reset-password`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            temporaryPassword,
          }),
        },
      );

      const responseJson = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const errorMessage =
          responseJson &&
          typeof responseJson === "object" &&
          "error" in responseJson &&
          typeof responseJson.error === "string"
            ? responseJson.error
            : `Could not reset password. Status ${response.status}.`;

        throw new Error(errorMessage);
      }

      return {
        ok: true,
        message:
          "Temporary password set. The user must set a new password on next sign-in.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Could not reset password.",
      };
    }
  }

  async function handleDeleteAwsUser(userId: string): Promise<AuthActionResult> {
    setUsersMessage("");

    if (userId === currentUser?.id) {
      return {
        ok: false,
        message: "You cannot delete your own admin account.",
      };
    }

    try {
      const session = await getCurrentCognitoSession();

      if (!session) {
        throw new Error("No valid session found.");
      }

      const idToken = session.getIdToken().getJwtToken();

      const response = await fetch(`${getApiBaseUrl()}/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });

      const responseJson = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const errorMessage =
          responseJson &&
          typeof responseJson === "object" &&
          "error" in responseJson &&
          typeof responseJson.error === "string"
            ? responseJson.error
            : `Could not delete user. Status ${response.status}.`;

        throw new Error(errorMessage);
      }

      const users = await fetchAwsUsersFromCloud();
      setAwsUsers(users);

      return {
        ok: true,
        message: "User deleted.",
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "Could not delete user.",
      };
    }
  }

  function handleOpenChangePassword() {
    setAccountMessage("");
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setChangePasswordOpen(true);
  }

  function handleCloseChangePassword() {
    if (changePasswordBusy) {
      return;
    }

    setChangePasswordOpen(false);
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
  }

  async function handleChangePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountMessage("");

    const passwordPolicyError = getPasswordPolicyError(
      newPasswordInput,
      "New password",
    );

    if (passwordPolicyError) {
      setAccountMessage(passwordPolicyError);
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      setAccountMessage("New passwords do not match.");
      return;
    }

    setChangePasswordBusy(true);

    try {
      await changeCurrentCognitoPassword(currentPasswordInput, newPasswordInput);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      setChangePasswordOpen(false);
      setAccountMessage("Password changed successfully.");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not change password.";

      setAccountMessage(
        errorMessage === "Incorrect username or password."
          ? "Incorrect password."
          : errorMessage,
      );
    } finally {
      setChangePasswordBusy(false);
    }
  }

  function handleSignOut() {
    signOutCognito();
    setCurrentUser(null);
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setNewPasswordUser(null);
    setAccountMessage("");
    setChangePasswordOpen(false);
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setUserManagementOpen(false);
    setJobManagementOpen(false);
    setMessage("");
  }

  if (!isReady) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return (
      <CognitoLoginCard
        email={email}
        password={password}
        newPassword={newPassword}
        confirmNewPassword={confirmNewPassword}
        message={message}
        isBusy={isBusy}
        requiresNewPassword={newPasswordUser !== null}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onNewPasswordChange={setNewPassword}
        onConfirmNewPasswordChange={setConfirmNewPassword}
        onSubmit={handleLoginSubmit}
      />
    );
  }

  if (canManageUsers) {
    return (
      <>
        <AdminDashboard
          currentUser={currentUser}
          securityLabel="Change Password"
          onOpenSecurity={handleOpenChangePassword}
          onOpenUserManagement={() => void handleOpenUserManagement()}
          onOpenJobManagement={() => setJobManagementOpen(true)}
          onSignOut={handleSignOut}
        />

        {accountMessage ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: "20px",
              background: "rgba(0,0,0,0.48)",
              zIndex: 100,
            }}
          >
            <div
              style={{
                width: "min(460px, 100%)",
                borderRadius: "24px",
                padding: "24px",
                background: "#11302D",
                color: "#eef7f3",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Account</h2>
              <p style={{ lineHeight: 1.5 }}>{accountMessage}</p>
              <button
                type="button"
                onClick={() => setAccountMessage("")}
                style={{
                  border: 0,
                  borderRadius: "14px",
                  padding: "12px 16px",
                  background: "#53BC7B",
                  color: "#11302D",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

        {changePasswordOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              display: "grid",
              placeItems: "center",
              padding: "20px",
              background: "rgba(0,0,0,0.48)",
              zIndex: 100,
            }}
          >
            <form
              onSubmit={(event) => void handleChangePasswordSubmit(event)}
              style={{
                width: "min(460px, 100%)",
                borderRadius: "24px",
                padding: "24px",
                background: "#11302D",
                color: "#eef7f3",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 24px 70px rgba(0,0,0,0.3)",
              }}
            >
              <h2 style={{ marginTop: 0 }}>Change Password</h2>

              {accountMessage ? (
                <div
                  style={{
                    marginBottom: "16px",
                    padding: "12px 14px",
                    borderRadius: "16px",
                    background: "rgba(255,255,255,0.1)",
                    color: "#eef7f3",
                    lineHeight: 1.45,
                  }}
                >
                  {accountMessage}
                </div>
              ) : null}

              <label
                style={{
                  display: "grid",
                  gap: "8px",
                  marginBottom: "14px",
                  fontWeight: 700,
                }}
              >
                Current password
                <input
                  type="password"
                  value={currentPasswordInput}
                  onChange={(event) => setCurrentPasswordInput(event.target.value)}
                  autoComplete="current-password"
                  required
                  style={{
                    width: "100%",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "16px",
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.08)",
                    color: "#eef7f3",
                    font: "inherit",
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "8px",
                  marginBottom: "14px",
                  fontWeight: 700,
                }}
              >
                New password
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(event) => setNewPasswordInput(event.target.value)}
                  autoComplete="new-password"
                  required
                  style={{
                    width: "100%",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "16px",
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.08)",
                    color: "#eef7f3",
                    font: "inherit",
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "8px",
                  marginBottom: "18px",
                  fontWeight: 700,
                }}
              >
                Confirm new password
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(event) => setConfirmPasswordInput(event.target.value)}
                  autoComplete="new-password"
                  required
                  style={{
                    width: "100%",
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "16px",
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.08)",
                    color: "#eef7f3",
                    font: "inherit",
                  }}
                />
              </label>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="submit"
                  disabled={changePasswordBusy}
                  style={{
                    border: 0,
                    borderRadius: "14px",
                    padding: "12px 16px",
                    background: changePasswordBusy ? "rgba(83,188,123,0.5)" : "#53BC7B",
                    color: "#11302D",
                    fontWeight: 800,
                    cursor: changePasswordBusy ? "not-allowed" : "pointer",
                  }}
                >
                  {changePasswordBusy ? "Changing..." : "Change Password"}
                </button>

                <button
                  type="button"
                  onClick={handleCloseChangePassword}
                  disabled={changePasswordBusy}
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    borderRadius: "14px",
                    padding: "12px 16px",
                    background: "rgba(255,255,255,0.08)",
                    color: "#eef7f3",
                    fontWeight: 800,
                    cursor: changePasswordBusy ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : null}


        {userManagementOpen ? (
          <UserManagementPanel
            users={awsUsers}
            currentUserId={currentUser.id}
            loading={usersLoading}
            message={usersMessage}
            onClose={() => setUserManagementOpen(false)}
            onRefresh={() => void handleOpenUserManagement()}
            onCreateUser={handleCreateAwsUser}
            onToggleActive={handleToggleAwsUserActive}
            onResetPassword={handleResetAwsUserPassword}
            onDeleteUser={handleDeleteAwsUser}
          />
        ) : null}

        {jobManagementOpen ? (
          <JobManagementPanel onClose={() => setJobManagementOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      {changePasswordOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(0,0,0,0.48)",
            zIndex: 100,
          }}
        >
          <form
            onSubmit={(event) => void handleChangePasswordSubmit(event)}
            style={{
              width: "min(460px, 100%)",
              borderRadius: "24px",
              padding: "24px",
              background: "#11302D",
              color: "#eef7f3",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 24px 70px rgba(0,0,0,0.3)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Change Password</h2>

            <PasswordRequirementsNote />

            {accountMessage ? (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "12px 14px",
                  borderRadius: "16px",
                  background: "rgba(255,255,255,0.1)",
                  color: "#eef7f3",
                  lineHeight: 1.45,
                }}
              >
                {accountMessage}
              </div>
            ) : null}

            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "14px",
                fontWeight: 700,
              }}
            >
              Current password
              <input
                type="password"
                value={currentPasswordInput}
                onChange={(event) => setCurrentPasswordInput(event.target.value)}
                autoComplete="current-password"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "14px",
                fontWeight: 700,
              }}
            >
              New password
              <input
                type="password"
                value={newPasswordInput}
                onChange={(event) => setNewPasswordInput(event.target.value)}
                autoComplete="new-password"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>

            <label
              style={{
                display: "grid",
                gap: "8px",
                marginBottom: "18px",
                fontWeight: 700,
              }}
            >
              Confirm new password
              <input
                type="password"
                value={confirmPasswordInput}
                onChange={(event) => setConfirmPasswordInput(event.target.value)}
                autoComplete="new-password"
                required
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "16px",
                  padding: "14px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  font: "inherit",
                }}
              />
            </label>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="submit"
                disabled={changePasswordBusy}
                style={{
                  border: 0,
                  borderRadius: "14px",
                  padding: "12px 16px",
                  background: changePasswordBusy ? "rgba(83,188,123,0.5)" : "#53BC7B",
                  color: "#11302D",
                  fontWeight: 800,
                  cursor: changePasswordBusy ? "not-allowed" : "pointer",
                }}
              >
                {changePasswordBusy ? "Changing..." : "Change Password"}
              </button>

              <button
                type="button"
                onClick={handleCloseChangePassword}
                disabled={changePasswordBusy}
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "14px",
                  padding: "12px 16px",
                  background: "rgba(255,255,255,0.08)",
                  color: "#eef7f3",
                  fontWeight: 800,
                  cursor: changePasswordBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {accountMessage && !changePasswordOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "grid",
            placeItems: "center",
            padding: "20px",
            background: "rgba(0,0,0,0.48)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: "min(460px, 100%)",
              borderRadius: "24px",
              padding: "24px",
              background: "#11302D",
              color: "#eef7f3",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <h2 style={{ marginTop: 0 }}>Account</h2>
            <p style={{ lineHeight: 1.5 }}>{accountMessage}</p>
            <button
              type="button"
              onClick={() => setAccountMessage("")}
              style={{
                border: 0,
                borderRadius: "14px",
                padding: "12px 16px",
                background: "#53BC7B",
                color: "#11302D",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <WorkLogger
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onOpenSecurity={handleOpenChangePassword}
        onOpenUserManagement={() => {}}
        canManageUsers={false}
        securityLabel="Change Password"
      />
    </>
  );
}
