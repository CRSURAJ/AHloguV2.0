"use client";

import { useState } from "react";
import {
  createAwsUserInCloud,
  deleteAwsUserFromCloud,
  fetchAwsUsersFromCloud,
  resetAwsUserPasswordInCloud,
  updateAwsUserActiveInCloud,
  type AwsUserListItem,
} from "@/lib/cloud/awsUsersApi";
import { getPasswordPolicyError } from "@/lib/auth/passwordPolicy";
import type { AuthActionResult, CurrentUser, PermissionLevel, WorkerRole } from "@/types/work";

export type CreateAwsUserPayload = {
  email: string;
  fullName: string;
  permissionLevel: PermissionLevel;
  role: WorkerRole;
  temporaryPassword: string;
  confirmTemporaryPassword: string;
};

export type UseUserManagementReturn = {
  userManagementOpen: boolean;
  awsUsers: AwsUserListItem[];
  usersLoading: boolean;
  usersMessage: string;
  handleOpenUserManagement: () => Promise<void>;
  handleCloseUserManagement: () => void;
  handleCreateAwsUser: (input: CreateAwsUserPayload) => Promise<AuthActionResult>;
  handleToggleAwsUserActive: (userId: string, isActive: boolean) => Promise<AuthActionResult>;
  handleResetAwsUserPassword: (
    userId: string,
    temporaryPassword: string,
  ) => Promise<AuthActionResult>;
  handleDeleteAwsUser: (userId: string) => Promise<AuthActionResult>;
};

export function useUserManagement(currentUser: CurrentUser | null): UseUserManagementReturn {
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [awsUsers, setAwsUsers] = useState<AwsUserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMessage, setUsersMessage] = useState("");

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

  function handleCloseUserManagement() {
    setUserManagementOpen(false);
  }

  async function handleCreateAwsUser(input: CreateAwsUserPayload): Promise<AuthActionResult> {
    setUsersMessage("");
    if (input.temporaryPassword !== input.confirmTemporaryPassword) {
      return { ok: false, message: "Passwords do not match." };
    }
    const passwordPolicyError = getPasswordPolicyError(
      input.temporaryPassword,
      "Temporary password",
    );
    if (passwordPolicyError) {
      return { ok: false, message: passwordPolicyError };
    }
    try {
      await createAwsUserInCloud({
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        permissionLevel: input.permissionLevel,
        temporaryPassword: input.temporaryPassword,
      });
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
      return { ok: false, message: "You cannot deactivate your own admin account." };
    }
    try {
      await updateAwsUserActiveInCloud(userId, isActive);
      const users = await fetchAwsUsersFromCloud();
      setAwsUsers(users);
      return { ok: true, message: isActive ? "User activated." : "User deactivated." };
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
      return { ok: false, message: passwordPolicyError };
    }
    try {
      await resetAwsUserPasswordInCloud(userId, temporaryPassword);
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
      return { ok: false, message: "You cannot delete your own admin account." };
    }
    try {
      await deleteAwsUserFromCloud(userId);
      const users = await fetchAwsUsersFromCloud();
      setAwsUsers(users);
      return { ok: true, message: "User deleted." };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not delete user.",
      };
    }
  }

  return {
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
  };
}
