"use client";

import { useEffect, useMemo, useState } from "react";
import { authProvider } from "@/lib/auth/provider";
import type {
  AuthActionResult,
  CreateLocalUserInput,
  CurrentUser,
  OfflineUser,
} from "@/types/work";

type UseLocalAuthReturn = {
  isReady: boolean;
  currentUser: CurrentUser | null;
  users: OfflineUser[];
  loginUsername: string;
  setLoginUsername: (value: string) => void;
  loginSecret: string;
  setLoginSecret: (value: string) => void;
  authMessage: string;
  handleLogin: () => Promise<void>;
  handleSignOut: () => void;
  canManageUsers: boolean;
  handleChangeOwnCredential: (
    currentSecret: string,
    nextSecret: string,
    confirmSecret: string
  ) => Promise<AuthActionResult>;
  handleCreateUser: (
    input: CreateLocalUserInput & { confirmSecret: string }
  ) => Promise<AuthActionResult>;
  handleAdminResetCredential: (
    userId: string,
    nextSecret: string,
    confirmSecret: string
  ) => Promise<AuthActionResult>;
  handleToggleUserActive: (userId: string) => AuthActionResult;
  handleDeleteUser: (userId: string) => AuthActionResult;
  securityLabel: string;
};

export function useLocalAuth(): UseLocalAuthReturn {
  const [isReady, setIsReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [users, setUsers] = useState<OfflineUser[]>([]);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginSecret, setLoginSecret] = useState("");
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const result = await authProvider.init();

      if (cancelled) return;

      setUsers(result.users);
      setCurrentUser(result.currentUser);
      setIsReady(true);
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  const canManageUsers = currentUser?.permissionLevel === "admin" || currentUser?.permissionLevel === "manager";

  const securityLabel = useMemo(() => {
    if (!currentUser) return "Change Credential";
    return currentUser.credentialType === "pin" ? "Change PIN" : "Change Password";
  }, [currentUser]);

  async function handleLogin(): Promise<void> {
    const result = await authProvider.signIn(users, loginUsername, loginSecret);

    if (!result.ok || !result.currentUser) {
      setAuthMessage(result.message);
      return;
    }

    if (result.users) {
      setUsers(result.users);
    }

    setCurrentUser(result.currentUser);
    setLoginUsername("");
    setLoginSecret("");
    setAuthMessage("");
  }

  function handleSignOut(): void {
    authProvider.signOut();
    setCurrentUser(null);
    setLoginUsername("");
    setLoginSecret("");
    setAuthMessage("");
  }

  async function handleChangeOwnCredential(
    currentSecret: string,
    nextSecret: string,
    confirmSecret: string
  ): Promise<AuthActionResult> {
    const result = await authProvider.changeOwnCredential(
      users,
      currentUser,
      currentSecret,
      nextSecret,
      confirmSecret
    );

    if (result.users) {
      setUsers(result.users);
    }

    if (result.currentUser !== undefined) {
      setCurrentUser(result.currentUser);
    }

    return {
      ok: result.ok,
      message: result.message,
    };
  }

  async function handleCreateUser(
    input: CreateLocalUserInput & { confirmSecret: string }
  ): Promise<AuthActionResult> {
    const result = await authProvider.createUser(users, currentUser, input);

    if (result.users) {
      setUsers(result.users);
    }

    return {
      ok: result.ok,
      message: result.message,
    };
  }

  async function handleAdminResetCredential(
    userId: string,
    nextSecret: string,
    confirmSecret: string
  ): Promise<AuthActionResult> {
    const result = await authProvider.adminResetCredential(
      users,
      currentUser,
      userId,
      nextSecret,
      confirmSecret
    );

    if (result.users) {
      setUsers(result.users);
    }

    if (result.currentUser !== undefined) {
      setCurrentUser(result.currentUser);
    }

    return {
      ok: result.ok,
      message: result.message,
    };
  }

  function handleToggleUserActive(userId: string): AuthActionResult {
    const result = authProvider.toggleUserActive(users, currentUser, userId);

    if (result.users) {
      setUsers(result.users);
    }

    if (result.currentUser !== undefined) {
      setCurrentUser(result.currentUser);
    }

    return {
      ok: result.ok,
      message: result.message,
    };
  }

  function handleDeleteUser(userId: string): AuthActionResult {
    const result = authProvider.deleteUser(users, currentUser, userId);

    if (result.users) {
      setUsers(result.users);
    }

    if (result.currentUser !== undefined) {
      setCurrentUser(result.currentUser);
    }

    return {
      ok: result.ok,
      message: result.message,
    };
  }

  return {
    isReady,
    currentUser,
    users,
    loginUsername,
    setLoginUsername,
    loginSecret,
    setLoginSecret,
    authMessage,
    handleLogin,
    handleSignOut,
    canManageUsers,
    handleChangeOwnCredential,
    handleCreateUser,
    handleAdminResetCredential,
    handleToggleUserActive,
    handleDeleteUser,
    securityLabel,
  };
}
