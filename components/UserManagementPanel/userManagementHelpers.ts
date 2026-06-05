import { PERMISSION_LEVEL_OPTIONS, WORKER_ROLE_OPTIONS } from "@/types/work";
import type { PermissionLevel } from "@/types/work";

export function getRoleLabel(role: string): string {
  return WORKER_ROLE_OPTIONS.find((item) => item.value === role)?.label ?? role;
}

export function getPermissionLabel(permissionLevel: PermissionLevel): string {
  return (
    PERMISSION_LEVEL_OPTIONS.find((item) => item.value === permissionLevel)?.label ??
    permissionLevel
  );
}

export function isValidEmailAddress(email: string): boolean {
  const value = email.trim().toLowerCase();

  if (!value) {
    return false;
  }

  if (value.length > 254) {
    return false;
  }

  if (value.includes("..")) {
    return false;
  }

  if (value.startsWith(".") || value.endsWith(".")) {
    return false;
  }

  const parts = value.split("@");

  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domainPart] = parts;

  if (!localPart || !domainPart) {
    return false;
  }

  if (localPart.length > 64) {
    return false;
  }

  if (
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    domainPart.startsWith(".") ||
    domainPart.endsWith(".")
  ) {
    return false;
  }

  const domainLabels = domainPart.split(".");

  if (domainLabels.length < 2) {
    return false;
  }

  if (domainLabels.some((label) => !label || label.startsWith("-") || label.endsWith("-"))) {
    return false;
  }

  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value);
}
