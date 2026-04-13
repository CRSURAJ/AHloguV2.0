"use client";

import { useState } from "react";
import LoginScreen from "@/components/LoginScreen/LoginScreen";
import SecurityPanel from "@/components/SecurityPanel/SecurityPanel";
import UserManagementPanel from "@/components/UserManagementPanel/UserManagementPanel";
import WorkLogger from "@/components/WorkLogger/WorkLogger";
import { useLocalAuth } from "@/hooks/useLocalAuth";

export default function Page() {
  const auth = useLocalAuth();
  const [securityRequested, setSecurityRequested] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);

  const securityForced = auth.currentUser?.mustChangeCredential === true;
  const securityOpen = securityForced || securityRequested;

  if (!auth.isReady) {
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

  if (!auth.currentUser) {
    return (
      <LoginScreen
        loginUsername={auth.loginUsername}
        setLoginUsername={auth.setLoginUsername}
        loginSecret={auth.loginSecret}
        setLoginSecret={auth.setLoginSecret}
        authMessage={auth.authMessage}
        handleLogin={auth.handleLogin}
      />
    );
  }

  return (
    <>
      <WorkLogger
        currentUser={auth.currentUser}
        onSignOut={auth.handleSignOut}
        onOpenSecurity={() => setSecurityRequested(true)}
        onOpenUserManagement={() => setUserManagementOpen(true)}
        canManageUsers={auth.canManageUsers}
        securityLabel={auth.securityLabel}
      />

      {securityOpen ? (
        <SecurityPanel
          credentialType={auth.currentUser.credentialType}
          forced={securityForced}
          onClose={() => setSecurityRequested(false)}
          onSubmit={auth.handleChangeOwnCredential}
        />
      ) : null}

      {userManagementOpen && auth.canManageUsers ? (
        <UserManagementPanel
          users={auth.users}
          onClose={() => setUserManagementOpen(false)}
          onCreateUser={auth.handleCreateUser}
          onResetCredential={auth.handleAdminResetCredential}
          onToggleActive={auth.handleToggleUserActive}
          onDeleteUser={auth.handleDeleteUser}
        />
      ) : null}
    </>
  );
}
