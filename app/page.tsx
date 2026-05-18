"use client";

import { useState } from "react";
import AdminDashboard from "@/components/AdminDashboard";
import LoginScreen from "@/components/LoginScreen/LoginScreen";
import SecurityPanel from "@/components/SecurityPanel/SecurityPanel";
import UserManagementPanel from "@/components/UserManagementPanel/UserManagementPanel";
import JobManagementPanel from "@/components/JobManagementPanel/JobManagementPanel";
import WorkLogger from "@/components/WorkLogger/WorkLogger";
import { useLocalAuth } from "@/hooks/useLocalAuth";

export default function Page() {
  const auth = useLocalAuth();
  const [securityRequested, setSecurityRequested] = useState(false);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [jobManagementOpen, setJobManagementOpen] = useState(false);

  const securityForced = auth.currentUser?.mustChangeCredential === true;

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

  if (securityForced) {
    return (
      <SecurityPanel
        credentialType={auth.currentUser.credentialType}
        forced={true}
        onClose={() => {}}
        onSubmit={auth.handleChangeOwnCredential}
      />
    );
  }

  if (auth.canManageUsers) {
    return (
      <>
        <AdminDashboard
          currentUser={auth.currentUser}
          securityLabel={auth.securityLabel}
          onOpenSecurity={() => setSecurityRequested(true)}
          onOpenUserManagement={() => setUserManagementOpen(true)}

          onOpenJobManagement={() => setJobManagementOpen(true)}
          onSignOut={auth.handleSignOut}
        />

        {securityRequested ? (
          <SecurityPanel
            credentialType={auth.currentUser.credentialType}
            forced={false}
            onClose={() => setSecurityRequested(false)}
            onSubmit={auth.handleChangeOwnCredential}
          />
        ) : null}

        {userManagementOpen ? (
          <UserManagementPanel
            users={auth.users}
            currentUserId={auth.currentUser.id}
            onClose={() => setUserManagementOpen(false)}
            onCreateUser={auth.handleCreateUser}
            onResetCredential={auth.handleAdminResetCredential}
            onToggleActive={auth.handleToggleUserActive}
            onDeleteUser={auth.handleDeleteUser}
          />
        ) : null}

        {jobManagementOpen ? (
          <JobManagementPanel onClose={() => setJobManagementOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <WorkLogger
        currentUser={auth.currentUser}
        onSignOut={auth.handleSignOut}
        onOpenSecurity={() => setSecurityRequested(true)}
        onOpenUserManagement={() => {}}
        canManageUsers={false}
        securityLabel={auth.securityLabel}
      />

      {securityRequested ? (
        <SecurityPanel
          credentialType={auth.currentUser.credentialType}
          forced={false}
          onClose={() => setSecurityRequested(false)}
          onSubmit={auth.handleChangeOwnCredential}
        />
      ) : null}
    </>
  );
}
