# Round 4 Remediation — Round 2 Critical Blockers (S1–S4 + S11)
**Date:** 2026-04-21
**Branch:** `claude/continue-audit-plan-1V3hH`
**Base:** Round 3 commit (a8fe01d)
**Scope:** The four critical blockers flagged in `SEMANTIC_AUDIT_2026_04_21.md`
(Section 1 — Employee Lifecycle) that were not part of Round 3's prompt.

---

## Results

| # | Summary | Files Touched | Status |
|---|---|---|---|
| S1 | `/access` deactivation kills sessions + sets grace window | `employeeRoutes.ts` | ✅ |
| S2 | `POST /api/employees` generates employee_number | `employeeRoutes.ts` | ✅ |
| S3 | `/me/contact-info` blocks unverified email changes | `employeeRoutes.ts` | ✅ |
| S4 | Login + workspace switch consult per-workspace `is_active` | `authCoreRoutes.ts`, `workspaceInlineRoutes.ts` | ✅ |
| S11 | `/me/contact-info` mirrors phone to `users.phone` | `employeeRoutes.ts` | ✅ |

TypeScript: 29 errors unchanged from baseline — **0 new errors** in touched files.

---

## S1 — Deactivation session invalidation

**Before:** `PATCH /api/employees/:employeeId/access` with `isActive=false` set
the flag and called the scheduling deactivation handler, but it did **not**
delete sessions and did **not** set `documentAccessExpiresAt`. The
`terminatedEmployeeGuard` middleware has a legacy-compat branch that
fail-opens when `documentAccessExpiresAt` is null — so a deactivated user
kept a live session AND kept full-read access. Termination got this right;
plain deactivation did not.

**Fix (employeeRoutes.ts `PATCH /:employeeId/access`):**
- When transitioning `true → false`:
  1. `await db.delete(sessions).where(eq(sessions.userId, targetEmployee.userId))`
  2. `UPDATE employees SET document_access_expires_at = NOW() + 7 days` — a
     shorter window than termination's 14-day grace, because deactivation
     is a lesser action and the user may be reactivated. The non-null value
     makes `terminatedEmployeeGuard` enforce read-only + path allow-list.
- When transitioning `false → true` (reactivate): `UPDATE … SET
  document_access_expires_at = NULL` to restore normal access.

All new DB calls are wrapped in try/catch and logged as non-blocking so the
primary transition keeps succeeding.

---

## S2 — employee_number generation

**Before:** Direct `POST /api/employees` called `storage.createEmployee` with
the validated form data and never populated `employeeNumber`. Only the
onboarding-accept pathways (`onboardingInlineRoutes.ts:355`,
`publicOnboardingRoutes.ts:97`) called `storage.generateEmployeeNumber`.
Manager-created records therefore had `NULL` employee_number, which breaks
kiosk clock-in, PIN verify-by-number, and report lookups.

**Fix (employeeRoutes.ts POST `/`):** Before the `db.transaction` that
inserts the row, if `validatedData.employeeNumber` is falsy, call
`storage.generateEmployeeNumber(workspaceId)` and set it on
`validatedData`. Guarded with try/catch so a number-generation failure
logs a warning rather than blocking the create.

---

## S3 — Block unverified email self-edit

**Before:** `PATCH /me/contact-info` included `'email'` in `allowedFields`
and persisted whatever email the caller sent. This let a logged-in user
silently change their email to an address they don't own, bypassing the
existing verified email-change flow (`POST /api/auth/request-email-change`
→ `POST /confirm`) — a straightforward account-takeover vector.

**Fix (employeeRoutes.ts `PATCH /me/contact-info`):**
- Early 403 if `req.body.email !== undefined && req.body.email !== employee.email`
  with error code `EMAIL_CHANGE_REQUIRES_VERIFICATION` and a message
  pointing the client at the verified flow.
- Removed `'email'` from `allowedFields`.

---

## S4 — Per-workspace `is_active` on login + workspace switch

**Before:** `POST /api/auth/login` only checked `users.passwordHash` and
`checkAccountLocked`. A user deactivated in workspace A (current workspace)
could authenticate, be loaded with `currentWorkspaceId = A`, and — combined
with S1's previously-missing session kill — land back in A. Workspace
switch (`workspaceInlineRoutes.ts:113`) similarly didn't check `is_active`.

**Fix (login — `authCoreRoutes.ts`):** After `workspaceId` is resolved,
look up the employee row scoped to user+workspace. If the row has
`isActive=false` AND `documentAccessExpiresAt` is past, look for any other
workspace where the user is active; swap `currentWorkspaceId` to that
workspace if found. If none found, return 403 `ACCOUNT_SUSPENDED`.
Users still within their grace window are allowed through so they can pull
records — `terminatedEmployeeGuard` enforces read-only + the allow-list.

**Fix (switch — `workspaceInlineRoutes.ts`):** In the existing access
validation, after confirming the user has an employee record in the
target workspace, if `employee.isActive === false` and their
`documentAccessExpiresAt` is past, return 403 `WORKSPACE_ACCESS_EXPIRED`.
Active and in-grace employees continue to be allowed.

---

## S11 — /me/contact-info phone sync

**Before:** `PATCH /api/auth/profile` syncs phone both ways
(`users.phone` and `employees.phone`) since commit f48621c. The parallel
route `PATCH /api/employees/me/contact-info` only updated
`employees.phone`, leaving `users.phone` stale.

**Fix (employeeRoutes.ts):** After `storage.updateEmployee`, if the
employee has a linked `userId` and the payload changed phone, also call
`storage.updateUser(employee.userId, { phone })`. Non-blocking on failure.

---

## Verification

```
npx tsc --noEmit → 29 errors (all pre-existing in seed/test scripts,
                              unchanged by this round)

grep SEMANTIC CHECKS
  S1  /access session kill + grace window    → 4 refs
  S2  employee_number generation             → 4 refs
  S3  EMAIL_CHANGE_REQUIRES_VERIFICATION     → 2 refs
  S4  ACCOUNT_SUSPENDED / WORKSPACE_ACCESS_EXPIRED → 3 refs
  S11 users.phone sync                       → 1 ref
```

---

## Remaining from Round 2 audit

Still open:
- **S5** role guard on `POST /api/employees` (workforce.ts mount)
- **S6** role guard on `POST /api/contracts/:id/send` (clients.ts mount)
- **S7** contract access token → signer email binding
- **S8** armed shift validation + guard-card expiry alert
- **S9** QB invoice auto-create on contract execution
- **S10** I-9 upload + guard-card verification compliance wiring
- **S12** org-code claim / manager-assignments role corrections
- **S13** lone-worker auto-activation on time-entry clock-in
  (note: Round 3 wired it on shift start/end; time-entry path was already done)
- **S14** calloff SLA escalation timer

Plus the carry-over audit table items: D04 transactions per-file sweep,
D01 Trinity registry enumeration.

---

## Go-live status

With S1–S4 + S11 shipped, the four **critical blockers** flagged as
preventing Statewide live ops are closed. S5–S8 remain as **high-risk
data-tampering gaps** and should ship next; S9–S14 are medium and can be
sequenced alongside remaining audit-table items.
