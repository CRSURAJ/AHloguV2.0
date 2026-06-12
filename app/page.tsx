"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import AccountMessageDialog from "@/components/AccountMessageDialog/AccountMessageDialog";
import ChangePasswordDialog from "@/components/ChangePasswordDialog/ChangePasswordDialog";
import AdminDashboard from "@/components/AdminDashboard";
import JobManagementPanel from "@/components/JobManagementPanel/JobManagementPanel";
import UserManagementPanel from "@/components/UserManagementPanel/UserManagementPanel";
import WorkerStatusPanel from "@/components/WorkerStatusPanel/WorkerStatusPanel";
import AdminWorkLogsPanel from "@/components/AdminWorkLogsPanel/AdminWorkLogsPanel";
import WorkLogger from "@/components/WorkLogger/WorkLogger";
import { CognitoLoginCard, LoadingScreen } from "@/components/CognitoLoginCard/CognitoLoginCard";
import {
  completeNewCognitoPassword,
  getCurrentCognitoSession,
  signInWithCognito,
  signOutCognito,
  type CognitoSignInResult,
} from "@/lib/auth/cognitoClient";
import { getPasswordPolicyError } from "@/lib/auth/passwordPolicy";
import type { CurrentUser } from "@/types/work";
import { isManagementPermission, normalizeLoginErrorMessage } from "@/lib/auth/currentUserProfile";
import {
  clearCachedCurrentUser,
  fetchCurrentUserFromCloud,
  isCloudAuthError,
  loadCachedCurrentUser,
} from "@/lib/cloud/awsUsersApi";
import { clearCloudJobsCache } from "@/lib/jobStorage";
import { clearUserDataOnSignOut } from "@/lib/workStorage";
import { useChangePassword } from "@/hooks/useChangePassword";
import { useUserManagement } from "@/hooks/useUserManagement";

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
  const [jobManagementOpen, setJobManagementOpen] = useState(false);
  const [workerStatusOpen, setWorkerStatusOpen] = useState(false);
  const [workLogsOpen, setWorkLogsOpen] = useState(false);

  const {
    changePasswordOpen,
    accountMessage,
    currentPasswordInput,
    newPasswordInput,
    confirmPasswordInput,
    changePasswordBusy,
    handleOpenChangePassword,
    handleCloseChangePassword,
    handleChangePasswordSubmit,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setConfirmPasswordInput,
    resetAccountMessage,
  } = useChangePassword(currentUser, email);

  const {
    userManagementOpen,
    awsUsers,
    usersLoading,
    usersMessage,
    handleOpenUserManagement,
    handleCloseUserManagement,
    handleCreateAwsUser,
    handleToggleAwsUserActive,
    handleResetAwsUserPassword,
    handleDeleteAwsUser,
  } = useUserManagement(currentUser);

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

        try {
          const restoredUser = await fetchCurrentUserFromCloud(session);

          if (!isMounted) {
            return;
          }

          setCurrentUser(restoredUser);
        } catch (error) {
          if (isCloudAuthError(error)) {
            // The credentials were explicitly rejected — sign out for real.
            signOutCognito();

            if (isMounted) {
              setMessage(error.message);
            }

            return;
          }

          // Network/server failure: keep the session so the worker can keep
          // logging offline, and fall back to the last profile we saw.
          const payload = session.getIdToken().decodePayload() as Record<string, unknown>;
          const sub = typeof payload.sub === "string" ? payload.sub : "";
          const cachedUser = loadCachedCurrentUser(sub);

          if (!isMounted) {
            return;
          }

          if (cachedUser) {
            setCurrentUser(cachedUser);
          } else {
            setMessage("You appear to be offline. Reconnect to the internet to sign in.");
          }
        }
      } catch {
        if (isMounted) {
          setMessage("Could not restore your session.");
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

  function handleSignOut() {
    signOutCognito();
    clearCloudJobsCache();
    if (currentUser) {
      clearCachedCurrentUser(currentUser.id);
      void clearUserDataOnSignOut(currentUser.id);
    }
    setCurrentUser(null);
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setNewPasswordUser(null);
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

        <AccountMessageDialog message={accountMessage} onClose={resetAccountMessage} />

        <ChangePasswordDialog
          open={changePasswordOpen}
          message={accountMessage}
          currentPassword={currentPasswordInput}
          newPassword={newPasswordInput}
          confirmPassword={confirmPasswordInput}
          isBusy={changePasswordBusy}
          onSubmit={(event) => void handleChangePasswordSubmit(event)}
          onClose={handleCloseChangePassword}
          onCurrentPasswordChange={setCurrentPasswordInput}
          onNewPasswordChange={setNewPasswordInput}
          onConfirmPasswordChange={setConfirmPasswordInput}
        />

        {userManagementOpen ? (
          <UserManagementPanel
            users={awsUsers}
            currentUserId={currentUser.id}
            loading={usersLoading}
            message={usersMessage}
            onClose={handleCloseUserManagement}
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
      <ChangePasswordDialog
        open={changePasswordOpen}
        message={accountMessage}
        currentPassword={currentPasswordInput}
        newPassword={newPasswordInput}
        confirmPassword={confirmPasswordInput}
        isBusy={changePasswordBusy}
        onSubmit={(event) => void handleChangePasswordSubmit(event)}
        onClose={handleCloseChangePassword}
        onCurrentPasswordChange={setCurrentPasswordInput}
        onNewPasswordChange={setNewPasswordInput}
        onConfirmPasswordChange={setConfirmPasswordInput}
      />

      <AccountMessageDialog
        message={!changePasswordOpen ? accountMessage : ""}
        onClose={resetAccountMessage}
      />

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
