"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import FeedbackMessage from "@/components/FeedbackMessage";
import AdminDashboard from "@/components/AdminDashboard";
import JobManagementPanel from "@/components/JobManagementPanel/JobManagementPanel";
import UserManagementPanel from "@/components/UserManagementPanel/UserManagementPanel";
import WorkerStatusPanel from "@/components/WorkerStatusPanel/WorkerStatusPanel";
import AdminWorkLogsPanel from "@/components/AdminWorkLogsPanel/AdminWorkLogsPanel";
import WorkLogger from "@/components/WorkLogger/WorkLogger";
import PasswordRequirementsNote from "@/components/PasswordRequirementsNote";
import { CognitoLoginCard, LoadingScreen } from "@/components/CognitoLoginCard/CognitoLoginCard";
import {
  changeCurrentCognitoPassword,
  completeNewCognitoPassword,
  getCurrentCognitoSession,
  signInWithCognito,
  signOutCognito,
  type CognitoSignInResult,
} from "@/lib/auth/cognitoClient";
import { getPasswordPolicyError } from "@/lib/auth/passwordPolicy";
import type { AuthActionResult, CurrentUser, PermissionLevel, WorkerRole } from "@/types/work";
import { isManagementPermission, normalizeLoginErrorMessage } from "@/lib/auth/currentUserProfile";
import {
  fetchAwsUsersFromCloud,
  fetchCurrentUserFromCloud,
  getApiBaseUrl,
  type AwsUserListItem,
} from "@/lib/cloud/awsUsersApi";

type CreateAwsUserPayload = {
  email: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
};

export default function Page() {
  const [isReady, setIsReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [newPasswordUser, setNewPasswordUser] = useState<NonNullable<
    CognitoSignInResult["cognitoUser"]
  > | null>(null);
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
  const [workerStatusOpen, setWorkerStatusOpen] = useState(false);
  const [workLogsOpen, setWorkLogsOpen] = useState(false);

  const canManageUsers = isManagementPermission(currentUser?.permissionLevel);

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
          setMessage(error instanceof Error ? error.message : "Could not restore your session.");
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
        const passwordPolicyError = getPasswordPolicyError(newPassword, "New password");

        if (passwordPolicyError) {
          setMessage(passwordPolicyError);
          return;
        }

        if (newPassword !== confirmNewPassword) {
          setMessage("New passwords do not match.");
          return;
        }

        const session = await completeNewCognitoPassword(newPasswordUser, newPassword);

        await finishSignIn(session);
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        setMessage("Enter a valid email address.");
        return;
      }

      const result = await signInWithCognito(trimmedEmail, password);

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
      setMessage(normalizeLoginErrorMessage(error));
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
      setUsersMessage(error instanceof Error ? error.message : "Could not load Users.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleCreateAwsUser(input: CreateAwsUserPayload): Promise<AuthActionResult> {
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
        message: error instanceof Error ? error.message : "Could not create User.",
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
        message: isActive ? "User activated." : "User deactivated.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not update user.",
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

    const passwordPolicyError = getPasswordPolicyError(temporaryPassword, "Temporary password");

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
        message: "Temporary password set. The user must set a new password on next sign-in.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not reset password.",
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
        message: error instanceof Error ? error.message : "Could not delete user.",
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

    const currentPasswordValue = currentPasswordInput.trim();
    const newPasswordValue = newPasswordInput.trim();
    const confirmPasswordValue = confirmPasswordInput.trim();
    const signInIdentifier = currentUser?.username || currentUser?.id || email;

    setChangePasswordBusy(true);

    try {
      try {
        const verificationResult = await signInWithCognito(signInIdentifier, currentPasswordValue);

        if (!verificationResult.session) {
          setAccountMessage("Incorrect Current Password.");
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Incorrect password.";

        setAccountMessage(
          errorMessage.includes("Attempt limit exceeded")
            ? "Too many attempts. Please wait a few minutes and try again."
            : "Incorrect Current Password.",
        );
        return;
      }

      const passwordPolicyError = getPasswordPolicyError(newPasswordValue, "New password");

      if (passwordPolicyError) {
        setAccountMessage(passwordPolicyError);
        return;
      }

      if (newPasswordValue !== confirmPasswordValue) {
        setAccountMessage("New passwords do not match.");
        return;
      }

      await changeCurrentCognitoPassword(currentPasswordValue, newPasswordValue);
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");
      setChangePasswordOpen(false);
      setAccountMessage("Password changed successfully.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Could not change password.";

      setAccountMessage(
        errorMessage === "Incorrect username or password."
          ? "Incorrect Current Password."
          : errorMessage.includes("Attempt limit exceeded")
            ? "Too many attempts. Please wait a few minutes and try again."
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
    setWorkerStatusOpen(false);
    setWorkLogsOpen(false);
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
          onOpenWorkerStatus={() => setWorkerStatusOpen(true)}
          onOpenWorkLogs={() => setWorkLogsOpen(true)}
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
              <FeedbackMessage message={accountMessage} />
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

              <PasswordRequirementsNote />

              {accountMessage ? <FeedbackMessage message={accountMessage} /> : null}

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

        {workLogsOpen ? (
          <AdminWorkLogsPanel
            onClose={() => setWorkLogsOpen(false)}
            currentPermissionLevel={currentUser?.permissionLevel ?? "worker"}
          />
        ) : null}

        {workerStatusOpen ? <WorkerStatusPanel onClose={() => setWorkerStatusOpen(false)} /> : null}

        {jobManagementOpen ? (
          <JobManagementPanel
            onClose={() => setJobManagementOpen(false)}
            currentPermissionLevel={currentUser?.permissionLevel ?? "worker"}
          />
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

            <FeedbackMessage message={accountMessage} />

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
            <FeedbackMessage message={accountMessage} />
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
