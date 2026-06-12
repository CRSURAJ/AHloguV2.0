"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { changeCurrentCognitoPassword, signInWithCognito } from "@/lib/auth/cognitoClient";
import { getPasswordPolicyError } from "@/lib/auth/passwordPolicy";
import type { CurrentUser } from "@/types/work";

export type UseChangePasswordReturn = {
  changePasswordOpen: boolean;
  accountMessage: string;
  currentPasswordInput: string;
  newPasswordInput: string;
  confirmPasswordInput: string;
  changePasswordBusy: boolean;
  handleOpenChangePassword: () => void;
  handleCloseChangePassword: () => void;
  handleChangePasswordSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  setCurrentPasswordInput: (v: string) => void;
  setNewPasswordInput: (v: string) => void;
  setConfirmPasswordInput: (v: string) => void;
  setAccountMessage: (v: string) => void;
  resetAccountMessage: () => void;
};

export function useChangePassword(
  currentUser: CurrentUser | null,
  loginEmail: string,
): UseChangePasswordReturn {
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [accountMessage, setAccountMessage] = useState("");
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [changePasswordBusy, setChangePasswordBusy] = useState(false);

  function handleOpenChangePassword() {
    setAccountMessage("");
    setCurrentPasswordInput("");
    setNewPasswordInput("");
    setConfirmPasswordInput("");
    setChangePasswordOpen(true);
  }

  function handleCloseChangePassword() {
    if (changePasswordBusy) return;
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
    const signInIdentifier = currentUser?.username || currentUser?.id || loginEmail;

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

  return {
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
    setAccountMessage,
    resetAccountMessage: () => setAccountMessage(""),
  };
}
