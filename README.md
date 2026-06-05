# AHlogu

AHlogu is an offline-first work logging web app for field teams. It is built for shared devices and supports local offline sign-in, active job sessions, breaks, saved drafts, and manual sync to a remote endpoint.

## What this version includes

- local offline authentication per device
- clear separation between:
  - `permissionLevel` for access control (`admin` / `user`)
  - `role` for worker trade or job type (`plumber`, `electrician`, etc.)
- per-user work logs, drafts, and active sessions
- IndexedDB-backed offline storage for logs, drafts, and sessions
- localStorage fallback where IndexedDB is unavailable
- basic service worker for offline app-shell caching
- admin user management on the device
- PIN/password reset flow
- manual sync to `NEXT_PUBLIC_PROJECT_LOGU_SYNC_URL`

## Current auth model

This version still uses device-local offline auth.

That means:

- users are stored locally on the device
- credentials are stored as salted PBKDF2 hashes
- sign-in works without internet
- admin/user lifecycle is device-local for now

This is intentional so the app can keep working offline. The auth layer is now abstracted so cloud auth can replace it later with less UI churn.

## Local data storage

Work logs, active sessions, and drafts are stored in IndexedDB first.

Fallback behavior:

- if IndexedDB is not available, localStorage is used
- old localStorage log/session/draft data is migrated into IndexedDB on load

## Environment variable

Create a `.env.local` file with:

```bash
NEXT_PUBLIC_PROJECT_LOGU_SYNC_URL=https://your-endpoint.example.com
```
