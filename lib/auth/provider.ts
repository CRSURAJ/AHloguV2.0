import {
  buildCredential,
  clearLocalAuthSession,
  createOfflineUser,
  ensureSeedUsers,
  findUserByUsername,
  hasAnotherActiveAdmin,
  loadLocalAuthSession,
  loadOfflineUsers,
  restoreCurrentUserFromSession,
  sanitizeUsernameInput,
  saveLocalAuthSession,
  saveOfflineUsers,
  toCurrentUser,
  validateSecret,
  verifyCredential,
} from "@/lib/localAuth";
import type {
  AuthActionResult,
  CreateLocalUserInput,
  CurrentUser,
  OfflineUser,
} from "@/types/work";

type AuthProviderResult = AuthActionResult & {
  users?: OfflineUser[];
  currentUser?: CurrentUser | null;
};

type AuthProviderInitResult = {
  users: OfflineUser[];
  currentUser: CurrentUser | null;
};

export type AuthProvider = {
  init: () => Promise<AuthProviderInitResult>;
  signIn: (
    users: OfflineUser[],
    username: string,
    secret: string
  ) => Promise<AuthProviderResult>;
  signOut: () => AuthProviderResult;
  changeOwnCredential: (
    users: OfflineUser[],
    currentUser: CurrentUser | null,
    currentSecret: string,
    nextSecret: string,
    confirmSecret: string
  ) => Promise<AuthProviderResult>;
  createUser: (
    users: OfflineUser[],
    actor: CurrentUser | null,
    input: CreateLocalUserInput & { confirmSecret: string }
  ) => Promise<AuthProviderResult>;
  adminResetCredential: (
    users: OfflineUser[],
    actor: CurrentUser | null,
    userId: string,
    nextSecret: string,
    confirmSecret: string
  ) => Promise<AuthProviderResult>;
  toggleUserActive: (
    users: OfflineUser[],
    actor: CurrentUser | null,
    userId: string
  ) => AuthProviderResult;
};

export const authProvider: AuthProvider = {
  async init() {
    await ensureSeedUsers();

    const users = loadOfflineUsers();
    const currentUser = restoreCurrentUserFromSession(
      users,
      loadLocalAuthSession()
    );

    return { users, currentUser };
  },

  async signIn(users, username, secret) {
    const safeUsername = sanitizeUsernameInput(username);

    if (!safeUsername || !secret) {
      return {
        ok: false,
        message: "Enter username and PIN/password.",
      };
    }

    const matchedUser = findUserByUsername(users, safeUsername);

    if (!matchedUser) {
      return {
        ok: false,
        message: "Invalid username or credential.",
      };
    }

    const valid = await verifyCredential(matchedUser, secret);

    if (!valid) {
      return {
        ok: false,
        message: "Invalid username or credential.",
      };
    }

    saveLocalAuthSession({
      userId: matchedUser.id,
      signedInAt: new Date().toISOString(),
    });

    return {
      ok: true,
      message: "Signed in successfully.",
      currentUser: toCurrentUser(matchedUser),
    };
  },

  signOut() {
    clearLocalAuthSession();

    return {
      ok: true,
      message: "Signed out.",
      currentUser: null,
    };
  },

  async changeOwnCredential(
    users,
    currentUser,
    currentSecret,
    nextSecret,
    confirmSecret
  ) {
    if (!currentUser) {
      return { ok: false, message: "No signed-in user." };
    }

    const targetUser = users.find((user) => user.id === currentUser.id);

    if (!targetUser) {
      return { ok: false, message: "Current user was not found." };
    }

    const currentValid = await verifyCredential(targetUser, currentSecret);

    if (!currentValid) {
      return { ok: false, message: "Current credential is incorrect." };
    }

    if (nextSecret !== confirmSecret) {
      return {
        ok: false,
        message: "New credential and confirm credential do not match.",
      };
    }

    const validation = validateSecret(targetUser.credentialType, nextSecret);

    if (validation) {
      return { ok: false, message: validation };
    }

    const { credentialHash, credentialSalt } = await buildCredential(nextSecret);

    const updatedUsers = users.map((user) =>
      user.id === targetUser.id
        ? {
            ...user,
            credentialHash,
            credentialSalt,
            mustChangeCredential: false,
            updatedAt: new Date().toISOString(),
          }
        : user
    );

    saveOfflineUsers(updatedUsers);

    const refreshedUser = updatedUsers.find(
      (user) => user.id === targetUser.id
    );

    return {
      ok: true,
      message:
        targetUser.credentialType === "pin"
          ? "PIN changed successfully."
          : "Password changed successfully.",
      users: updatedUsers,
      currentUser: refreshedUser ? toCurrentUser(refreshedUser) : currentUser,
    };
  },

  async createUser(users, actor, input) {
    if (!actor || actor.permissionLevel !== "admin") {
      return { ok: false, message: "Only admin can create users." };
    }

    const username = sanitizeUsernameInput(input.username);
    const fullName = input.fullName.trim();
    const permissionLevel = input.permissionLevel;
    const role = input.role;
    const credentialType =
      permissionLevel === "admin" ? "password" : input.credentialType;

    if (!username) {
      return { ok: false, message: "Username is required." };
    }

    if (!/^[a-z0-9._-]{3,32}$/i.test(username)) {
      return {
        ok: false,
        message:
          "Username must be 3 to 32 characters and use letters, numbers, dot, underscore, or dash.",
      };
    }

    if (!fullName) {
      return { ok: false, message: "Full name is required." };
    }

    if (findUserByUsername(users, username)) {
      return { ok: false, message: "That username already exists." };
    }

    if (input.secret !== input.confirmSecret) {
      return {
        ok: false,
        message: "Credential and confirm credential do not match.",
      };
    }

    const validation = validateSecret(credentialType, input.secret);

    if (validation) {
      return { ok: false, message: validation };
    }

    const newUser = await createOfflineUser({
      username,
      fullName,
      permissionLevel,
      role,
      credentialType,
      secret: input.secret,
    });

    const updatedUsers = [...users, newUser];
    saveOfflineUsers(updatedUsers);

    return {
      ok: true,
      message: "User created successfully.",
      users: updatedUsers,
    };
  },

  async adminResetCredential(users, actor, userId, nextSecret, confirmSecret) {
    if (!actor || actor.permissionLevel !== "admin") {
      return { ok: false, message: "Only admin can reset user credentials." };
    }

    const targetUser = users.find((user) => user.id === userId);

    if (!targetUser) {
      return { ok: false, message: "User not found." };
    }

    if (nextSecret !== confirmSecret) {
      return {
        ok: false,
        message: "Credential and confirm credential do not match.",
      };
    }

    const validation = validateSecret(targetUser.credentialType, nextSecret);

    if (validation) {
      return { ok: false, message: validation };
    }

    const { credentialHash, credentialSalt } = await buildCredential(nextSecret);

    const updatedUsers = users.map((user) =>
      user.id === userId
        ? {
            ...user,
            credentialHash,
            credentialSalt,
            mustChangeCredential: true,
            updatedAt: new Date().toISOString(),
          }
        : user
    );

    saveOfflineUsers(updatedUsers);

    const refreshedUser = updatedUsers.find((user) => user.id === userId);

    return {
      ok: true,
      message: "Credential reset successfully. User must change it at next sign-in.",
      users: updatedUsers,
      currentUser:
        actor.id === userId && refreshedUser ? toCurrentUser(refreshedUser) : actor,
    };
  },

  toggleUserActive(users, actor, userId) {
    if (!actor || actor.permissionLevel !== "admin") {
      return { ok: false, message: "Only admin can activate or deactivate users." };
    }

    if (actor.id === userId) {
      return {
        ok: false,
        message: "You cannot deactivate your own account from this screen.",
      };
    }

    const targetUser = users.find((user) => user.id === userId);

    if (!targetUser) {
      return { ok: false, message: "User not found." };
    }

    if (
      targetUser.permissionLevel === "admin" &&
      targetUser.isActive &&
      !hasAnotherActiveAdmin(users, userId)
    ) {
      return {
        ok: false,
        message: "At least one active admin must remain on this device.",
      };
    }

    const updatedUsers = users.map((user) =>
      user.id === userId
        ? {
            ...user,
            isActive: !user.isActive,
            updatedAt: new Date().toISOString(),
          }
        : user
    );

    saveOfflineUsers(updatedUsers);

    const updatedTarget = updatedUsers.find((user) => user.id === userId);

    return {
      ok: true,
      message: updatedTarget?.isActive
        ? "User activated successfully."
        : "User deactivated successfully.",
      users: updatedUsers,
      currentUser: actor,
    };
  },
};
