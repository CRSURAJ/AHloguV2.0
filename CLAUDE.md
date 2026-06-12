# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**AHlogu** is an offline-first work logging and time tracking PWA for field teams at Automatic Heating. Workers log time against jobs (with break tracking) in the field — even without internet — and the app syncs to the cloud when connectivity is restored.

## Commands

```bash
npm run dev           # Start dev server (port 3000)
npm run build         # Production build
npm run lint          # ESLint
npm run typecheck     # TypeScript check (no emit)
npm run format        # Prettier (apply)
npm run format:check  # Prettier (check only)
npm run check         # format:check → typecheck → lint → build (run before pushing)
```

There are no unit or e2e tests configured.

## Architecture

**Frontend**: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS v4, Framer Motion, Base UI React. PWA: `public/sw.js` (registered by `components/ServiceWorkerRegistrar.tsx` in `app/layout.tsx`) caches the app shell — network-first for navigations, cache-first with background revalidation for same-origin GETs.

**Backend**: AWS Lambda (`aws/lambda/AHloguApi/index.mjs`, single ~1,800-line handler) behind API Gateway with Cognito JWT authorizers. Direct DynamoDB DocumentClient calls — no ORM.

**Auth**: Amazon Cognito via `amazon-cognito-identity-js` (`lib/auth/cognitoClient.ts`). Handles sign-in, new-password-required challenge (first login), token refresh, and self-service password change (client-side Cognito call — no API endpoint). Password policy rules live in `lib/auth/passwordPolicy.ts` and are shared by first-login, change-password, and user-creation flows. ID token is pulled from browser storage and sent as a Bearer header on every API call.

### Key directories

| Path | Purpose |
|------|---------|
| `app/` | Next.js App Router — single page (`page.tsx`) handles auth routing |
| `components/` | Feature-based React components (each folder = one feature) |
| `hooks/` | All stateful domain logic (see hook layering below) |
| `lib/auth/` | Cognito SDK wrapper, config, password policy, user-profile helpers |
| `lib/cloud/` | `awsProvider.ts` (REST client), `awsUsersApi.ts` |
| `lib/workLogger/` | Work log sync, status, persistence logic |
| `lib/jobStorage.ts` | Job CRUD — cloud-backed with localStorage cache, offline writes queued |
| `lib/workStorage.ts` | Logs/session/draft persistence over IndexedDB |
| `lib/offlineDb.ts` | IndexedDB wrapper — three stores: `logs`, `sessions`, `drafts` |
| `types/work.ts` | All domain types |
| `aws/lambda/AHloguApi/` | Lambda handler (ES modules, `.mjs`) + deploy zip |

### Auth routing

`app/page.tsx` is the single entry point. It renders:

1. **LoadingScreen** — until session check completes
2. **CognitoLoginCard** — when unauthenticated (also handles new-password-required challenge)
3. **AdminDashboard** — for `admin` and `manager` roles (with modals for Job, User, WorkLog, and WorkerStatus panels)
4. **WorkLogger** — for `worker` role only

ChangePasswordDialog and AccountMessageDialog are mounted for both admin and worker views.

### Hook / component layering

Components are pure presenters — all domain logic lives in hooks:

- **`useWorkLogger`** is the single source of truth for worker state (`isWorking`, `isOnBreak`, `logs`, form fields, computed flags like `canStart`/`canStop`). It handles session persistence, draft persistence, job refresh (on focus/online/storage/`JOBS_CHANGED_EVENT`, throttled), and work-log upload via `handleSync()`.
- **`useWorkerHeartbeat`** (called by `useWorkLogger`) publishes `WorkerLiveStatus` — every 10 minutes, on focus/online, and whenever the payload signature changes (deduped via `workerStatusPayload.ts` signature).
- **`useJobs`** manages job CRUD for admin/manager users. Validates duplicate `jobId` (case-insensitive).
- **`useUserManagement`** — admin/manager user CRUD against `lib/cloud/awsUsersApi.ts` (create, activate/deactivate, reset password, delete).
- **`useChangePassword`** — change-password dialog state; verifies the current password by re-signing-in before calling Cognito's change-password.

### Work log state machine

```
pending → syncing → synced
                ↘
                 failed  (retriable)
```

`lib/workLogger/workLogStatus.ts` contains the pure state-machine functions. `stickyNote` edits are blocked once a log reaches `syncing` or `synced` — the field becomes immutable.

### Session vs. draft persistence

- **ActiveSession** (`sessions` store): saved only when `isWorking === true`; cleared on stop.
- **DraftState** (`drafts` store): saved only when `isWorking === false` AND the form has meaningful data; lets users resume partial entries after closing the app.

### Sync model

**Work logs (worker)**: writes go to IndexedDB first; each `LogItem` carries its own sync status (`pending → syncing → synced | failed`). `useWorkLogger.handleSync()` uploads pending logs via `lib/workLogger/workLogSync.ts` (`POST /work-logs` or `/work-logs/bulk`). There is no separate queue — the logs store *is* the queue. Uploads are idempotent: the Lambda keys records on `uploadedBy + loguId`, so retries cannot duplicate logs.

**Job mutations (admin/manager)**: `lib/jobStorage.ts` calls the cloud API directly and mirrors results into a localStorage jobs cache; offline job edits fail with an error (jobs are online-only — there is no offline queue for them).

DynamoDB is the cloud source of truth for both.

### IndexedDB schema

Database: `project_logu_offline` v1

| Store | Key | Indexes |
|-------|-----|---------|
| `logs` | `userId::logId` (composite) | `byUserId` (non-unique) |
| `sessions` | `userId` | — |
| `drafts` | `userId` | — |

### lib/workLogger modules

| File | Responsibility |
|------|----------------|
| `workLogItem.ts` | `createPendingWorkLog()` factory — builds a `LogItem` from session + form state, calculates `workedMinutes` |
| `workLogStatus.ts` | Pure state-machine functions for syncing/synced/failed transitions and sticky-note update |
| `workLogSync.ts` | `uploadWorkLogToAws()` — thin wrapper around `cloud.workLogs.upload()` |
| `workLoggerPersistence.ts` | Snapshot serializers for session/draft; `hasMeaningfulDraft()` guard |
| `workerStatusPayload.ts` | Builds `WorkerLiveStatus` payload (pending sync counts, current job) and its debounce signature |

### Role-based access

Three permission levels in `types/work.ts`: `admin > manager > worker`. The Lambda enforces permissions server-side (Cognito JWT sub → DynamoDB user lookup including `isActive`); the frontend mirrors checks for UI only. Managers cannot create admin users.

### API endpoints

All endpoints require a Cognito JWT Bearer token except `/health`.

| Method | Path | Access |
|--------|------|--------|
| `GET` | `/health` | Public |
| `GET` | `/me` | All |
| `GET` | `/jobs` | All |
| `POST` | `/jobs` | admin/manager |
| `PUT` | `/jobs/{id}` | admin/manager |
| `POST` | `/jobs/{id}/archive` | admin/manager |
| `DELETE` | `/jobs/{id}` | admin/manager |
| `GET` | `/users` | admin/manager |
| `POST` | `/users` | admin/manager |
| `PUT` | `/users/{id}` | admin/manager |
| `POST` | `/users/{id}/reset-password` | admin/manager |
| `DELETE` | `/users/{id}` | admin/manager |
| `GET` | `/work-logs` | admin/manager |
| `POST` | `/work-logs` | worker |
| `POST` | `/work-logs/bulk` | worker |
| `PUT` | `/work-logs/{id}` | admin/manager |
| `DELETE` | `/work-logs/{id}` | admin/manager |
| `GET` | `/worker-status` | admin/manager |
| `PUT` | `/worker-status/me` | worker |

### DynamoDB tables

Configured via Lambda environment variables: `USERS_TABLE`, `JOBS_TABLE`, `WORK_LOGS_TABLE`, `WORKER_STATUS_TABLE`, `SYNC_EVENTS_TABLE`.

## Environment

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_AHLOGU_CLOUD_PROVIDER=aws
NEXT_PUBLIC_AHLOGU_API_URL=https://<id>.execute-api.ap-southeast-4.amazonaws.com
NEXT_PUBLIC_AWS_REGION=ap-southeast-4
NEXT_PUBLIC_COGNITO_USER_POOL_ID=ap-southeast-4_...
NEXT_PUBLIC_COGNITO_APP_CLIENT_ID=...
```

## Lambda deployment

```bash
cd aws/lambda/AHloguApi
npm run zip   # produces ahlogu-api.zip → upload to AWS Lambda console
```

## Notes

- Timezone is hardcoded to Melbourne in `lib/melbourneTime.ts`.
- `@/*` path alias maps to the repo root (see `tsconfig.json`).
- Tailwind CSS v4 uses the PostCSS plugin (`@tailwindcss/postcss`) — no `tailwind.config` file.
- `jobId` uniqueness is enforced case-insensitively on both frontend and Lambda.
- Jobs carry `jobDocumentLinks` (URLs to drawings/documents) shown on the worker screen — file uploads were replaced by links.
- `AdminWorkLogsPanel` exports work logs to Excel via the `xlsx` package.
