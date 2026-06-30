# Web System QA Report

Date: 2026-06-30

## Scope

- Production React build
- Frontend route and role guards
- Backend authentication/authorization structure
- Local startup and database connectivity
- Public page availability
- Test/lint automation coverage

Interactive browser coverage was attempted, but both available browser runners timed out in this environment. The findings below are based on successful build/startup checks, live HTTP checks, and source/API inspection.

## Remediation status

### Passed

- `npm run build` completes successfully.
- Backend starts and connects to the local `payroll_system` MySQL database.
- React/Vite frontend starts and `/login` returns HTTP 200.
- React routes have client-side login and role checks backed by the server session.
- Login includes account locking, OTP, reset-password, and temporary-password flows.
- `npm run qa` passes all 8 authorization tests, static QA checks, and the production build.
- The initial JavaScript bundle was reduced from about 1.19 MB to about 382 KB through route-level code splitting.

### Resolved: API authentication and authorization

All APIs now require a valid server session by default, with a narrow allowlist for login, OTP, password reset, session discovery, and health checks. Centralized rules enforce Admin and Admin/HR boundaries. Employee requests containing a user ID are restricted to the signed-in user, and employee payslips are ownership-checked in SQL. Uploads, cloud files, and Socket.IO rooms also require a matching authenticated session.

### Resolved: trusted session restoration

The frontend now restores identity through `/api/session`. Browser storage is only a UI cache and no longer establishes authentication. Server-side API authorization remains authoritative.

### Resolved: production sessions

Production startup now fails when `SESSION_SECRET` is absent. Sessions are persisted in MySQL, use an HTTP-only cookie, and roll their expiry on activity.

### Resolved: automated QA commands

Use `npm run qa` to run authorization tests, static security/accessibility checks, and the production build. Eight initial regression tests cover public login, missing sessions, role restrictions, account creation, and employee self-access.

### Resolved: oversized initial frontend bundle

Route-level lazy loading reduced the initial JavaScript bundle to about 382 KB (about 119 KB gzip), with separate chunks for feature pages and no Vite chunk-size warning.

### Improved: accessibility and interaction behavior

Blocking browser alerts were replaced with the shared toast system. Loading states announce themselves through ARIA live regions. The static QA check prevents browser alerts from being reintroduced.

## Verification

Run:

```bash
npm run qa
```

Current result: 8 tests passed, static QA passed, and the production build passed.

The in-app and installed headless browsers both timed out in this environment, so a final manual visual pass on representative Admin, HR, and Employee accounts is still recommended before production deployment.
