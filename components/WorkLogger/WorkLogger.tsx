"use client";

import { WorkLoggerView } from "@/components";
import { useWorkLogger } from "@/hooks/useWorkLogger";
import type { CurrentUser } from "@/types/work";

type WorkLoggerProps = {
  currentUser: CurrentUser;
  onSignOut: () => void;
  onOpenSecurity: () => void;
  onOpenUserManagement: () => void;
  canManageUsers: boolean;
  securityLabel: string;
};

export default function WorkLogger({
  currentUser,
  onSignOut,
  onOpenSecurity,
  onOpenUserManagement,
  canManageUsers,
  securityLabel,
}: WorkLoggerProps) {
  const workLogger = useWorkLogger(currentUser);

  return (
    <WorkLoggerView
      {...workLogger}
      currentUser={currentUser}
      onSignOut={onSignOut}
      onOpenSecurity={onOpenSecurity}
      onOpenUserManagement={onOpenUserManagement}
      canManageUsers={canManageUsers}
      securityLabel={securityLabel}
    />
  );
}
