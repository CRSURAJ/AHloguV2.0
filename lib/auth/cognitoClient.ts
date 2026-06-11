"use client";

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession,
} from "amazon-cognito-identity-js";

import { getCognitoConfig } from "./cognitoConfig";

function getUserPool() {
  const config = getCognitoConfig();

  return new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.appClientId,
  });
}

export type CognitoSignInResult = {
  status: "signed-in" | "new-password-required";
  session?: CognitoUserSession;
  cognitoUser?: CognitoUser;
};

export function getCurrentCognitoUser() {
  return getUserPool().getCurrentUser();
}

export function signInWithCognito(email: string, password: string): Promise<CognitoSignInResult> {
  const userPool = getUserPool();

  const cognitoUser = new CognitoUser({
    Username: email,
    Pool: userPool,
  });

  const authDetails = new AuthenticationDetails({
    Username: email,
    Password: password,
  });

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: (session) => {
        resolve({
          status: "signed-in",
          session,
          cognitoUser,
        });
      },

      onFailure: (error) => {
        reject(error);
      },

      newPasswordRequired: () => {
        resolve({
          status: "new-password-required",
          cognitoUser,
        });
      },
    });
  });
}

export function completeNewCognitoPassword(
  cognitoUser: CognitoUser,
  newPassword: string,
): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    cognitoUser.completeNewPasswordChallenge(
      newPassword,
      {},
      {
        onSuccess: (session) => {
          resolve(session);
        },

        onFailure: (error) => {
          reject(error);
        },
      },
    );
  });
}

export function getCurrentCognitoSession(): Promise<CognitoUserSession | null> {
  const cognitoUser = getCurrentCognitoUser();

  if (!cognitoUser) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    cognitoUser.getSession((error: Error | null, session: CognitoUserSession | null) => {
      if (error || !session || !session.isValid()) {
        resolve(null);
        return;
      }

      resolve(session);
    });
  });
}

export function changeCurrentCognitoPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const cognitoUser = getCurrentCognitoUser();

  if (!cognitoUser) {
    return Promise.reject(new Error("No signed-in Cognito user found."));
  }

  return new Promise((resolve, reject) => {
    cognitoUser.getSession((sessionError: Error | null) => {
      if (sessionError) {
        reject(sessionError);
        return;
      }

      cognitoUser.changePassword(currentPassword, newPassword, (changeError) => {
        if (changeError) {
          reject(changeError);
          return;
        }

        resolve();
      });
    });
  });
}

export function signOutCognito() {
  const cognitoUser = getCurrentCognitoUser();
  cognitoUser?.signOut();
}
