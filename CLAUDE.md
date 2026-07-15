# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**AHlogu** is an offline-first work logging and time tracking PWA for field teams at Automatic Heating. Workers log time against jobs (with break tracking) in the field — even without internet — and the app syncs to the cloud when connectivity is restored. Admins and managers also track post-sale project delivery on a stage-gated kanban board (see **Project & Job Management** below).

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
| `lib/projectStorage.ts` | Project CRUD — cloud-backed with localStorage cache, normalization of gates/trades/dateLog |
| `lib/projectManagement.ts` | Delivery-board domain: stages, trades, exit-criteria, and pure gate/date/progress logic |
| `lib/workStorage.ts` | Logs/session/draft persistence over IndexedDB |
| `lib/offlineDb.ts` | IndexedDB wrapper — three stores: `logs`, `sessions`, `drafts` |
| `types/work.ts` | All domain types |
| `aws/lambda/AHloguApi/` | Lambda handler (ES modules, `.mjs`) + deploy zip |

### Auth routing

`app/page.tsx` is the single entry point. It renders:

1. **LoadingScreen** — until session check completes
2. **CognitoLoginCard** — when unauthenticated (also handles new-password-required challenge)
3. **AdminDashboard** — for `admin` and `manager` roles (with modals for Project & Job, User, WorkLog, and WorkerStatus panels)
4. **WorkLogger** — for `worker` role only

ChangePasswordDialog and AccountMessageDialog are mounted for both admin and worker views.

### Hook / component layering

Components are pure presenters — all domain logic lives in hooks:

- **`useWorkLogger`** is the single source of truth for worker state (`isWorking`, `isOnBreak`, `logs`, form fields, computed flags like `canStart`/`canStop`). It handles session persistence, draft persistence, job refresh (on focus/online/storage/`JOBS_CHANGED_EVENT`, throttled), and work-log upload via `handleSync()`.
- **`useWorkerHeartbeat`** (called by `useWorkLogger`) publishes `WorkerLiveStatus` — every 10 minutes, on focus/online, and whenever the payload signature changes (deduped via `workerStatusPayload.ts` signature).
- **`useJobs`** manages job CRUD for admin/manager users. Validates duplicate `jobId` (case-insensitive).
- **`useProjects`** manages project CRUD for the delivery board. Validates duplicate `projectRef` (case-insensitive).
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

### Project & Job Management (delivery board)

**Projects and jobs are distinct entities.** A **Project** (`types/work.ts` `Project`, DynamoDB `PROJECTS_TABLE`) is the post-sale delivery pipeline record — it starts at Handover and advances through stage gates to Closed. A **Job** is a worker work order — the thing workers log time against. Jobs are typically created once a project reaches the **Build** phase and link back via `Job.projectId`; one project can have many jobs (a job can also be stand-alone).

`JobManagementPanel` has four views toggled in its header:

- **BaajBoard** — `BaajBoard.tsx`, the management dashboard: KPI tiles (open/blocked/overdue projects, deliveries due ≤ 14 days, value in pipeline), projects-per-stage and value-by-stage bar charts, plus action lists — ready-to-advance (`stageComplete` but not moved), stuck-in-stage (≥ 7 days since last stage move, via `stageAgeDays`), upcoming deliveries, blocked projects, blocked trades in Build, overdue stage targets, and a recent-activity feed across all projects. Read-only — derived entirely from the projects list (no work-log fetch; hours reporting lives in the Work Logs panel).
- **Board** (default) — `DeliveryBoard.tsx`, a drag-and-drop kanban of **projects** across delivery stages. Projects are created/edited/deleted via a dialog on the board (delete is admin-only). `ProjectDrawer.tsx` opens per project for stage sign-offs, trades, dates, and linked jobs.
- **GanttBoard** — `GanttView.tsx`, a portfolio timeline of open projects. Upper lane per row: planned stage bars from `stageTargets` (each stage spans from the previous stage's target — or `createdAt` for the first — to its own target; same/earlier targets clamp to a half-day sliver), with done/current/overdue/planned states. Lower lane: **actual** spans carved from activity-log stage-move timestamps (projects with no recorded moves show one span since creation). Delivery-date diamonds, today line, week/month ticks. Clicking a row opens a per-project drill-in popup (one row per stage, planned vs actual, delivery line); clicking the popup's chart or its button pushes on to the kanban drawer.
- **Jobs** — the job create/edit form + list (fields worker time-logging depends on: `jobId`, `assignedRoles`, `jobDocumentLinks`), plus an optional **Project** selector that sets `projectId`.

Project fields: `projectRef` (unique, case-insensitive — e.g. "AH-1088"), `customerName`, `location`, `department` (install/service), `value` (display string) + `valueAmount` (whole dollars, auto-parsed from `value` via `parseMoney` — "$186k"/"1.2M"/"186,000" all work; sums on BaajBoard use it), `stage`, `gates`, `trades`, `blocked`/`blockedReason`, `targetDate`, `deliveryDate`, `stageTargets`, `dateLog`, `activityLog`.

- **Stages** (`STAGES` in `lib/projectManagement.ts`): handover → procurement → engineering → build → qa → dispatch → commissioning → closed. Projects move **one stage at a time**, and forward moves are blocked until every exit criterion for the current stage is signed off (`stageComplete`). Enforced in both drag-drop and the drawer's advance button.
- **Exit criteria** (`EXIT_CRITERIA`, per stage) — each is signed off with a `ProjectSignOff` (`by` + timestamp + comment and/or **document link**; a comment is required when no link is attached). Owners are role labels, not real users; sign-offs are attributed to the logged-in user (`currentUser.fullName`, passed from `page.tsx`).
- **Trades** (`TRADES`: plumbing/electrical/prefab/controller) appear in the Build stage — each has a checklist, a state machine (`not_started → in_progress → complete → signed_off`), and a block/reason flag. The Build "all trades complete" criterion is `auto` — it clears from trade state rather than a manual sign-off.
- **Linked jobs & logged hours** — from Build onward, the drawer lists the project's jobs (`job.projectId`) with **real labour hours** aggregated from synced work logs (`GET /work-logs`, summed by `AdminWorkLog.jobId` — the human job code). "New job for this project" jumps to the Jobs form pre-filled with `projectId`, customer, and location. Board cards show job count + total logged time.
- **Dates** — each stage has its own completion target in `stageTargets` (keyed by stage; the legacy `targetDate` mirrors the *current* stage's target and rolls forward on stage moves — `getStageTarget()` handles the fallback). The drawer's "Stage due" row edits the current stage; a collapsible "Stage targets" list edits any stage. `deliveryDate` is the customer delivery date. Every date change requires a reason and is appended to `dateLog` (target entries record their `stage`).
- **Project blocked flag** — `blocked` + `blockedReason` put the whole project on hold (distinct from per-trade blocks): flagged/unflagged in the drawer header (reason required), shown red on board cards, and forward stage moves are refused while set (`canDropOn`, `moveStage`, advance button).
- **Activity log** — `activityLog` (`ProjectActivityEntry`: kind `stage`/`field`/`blocked`, from → to, by, timestamp, note) audits stage moves, project-detail edits (diffed via `diffProjectFields()`), and block/unblock. Entries are appended client-side in `DeliveryBoard.tsx` handlers and shown in the drawer's collapsible "Activity" section. Date changes stay in `dateLog`.

Persistence mirrors the jobs pattern: `useProjects` → `lib/projectStorage.ts` (localStorage cache + cloud) → `/projects` API → `PROJECTS_TABLE`. The Lambda sanitizes every project field server-side (allowlisted stage/department, bounded strings, structured `gates`/`trades`/`stageTargets`/`dateLog`/`activityLog`) and enforces unique `projectRef`.

Sign-off documents are **links** (OneDrive/SharePoint), consistent with `jobDocumentLinks` — no file uploads.

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
| `DELETE` | `/jobs/{id}` | admin |
| `GET` | `/projects` | admin/manager |
| `POST` | `/projects` | admin/manager |
| `PUT` | `/projects/{id}` | admin/manager |
| `DELETE` | `/projects/{id}` | admin |
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

Configured via Lambda environment variables: `USERS_TABLE`, `JOBS_TABLE`, `PROJECTS_TABLE`, `WORK_LOGS_TABLE`, `WORKER_STATUS_TABLE`, `SYNC_EVENTS_TABLE`. All tables use partition key `id` (string).

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
