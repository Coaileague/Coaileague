# Agent 5a Audit Report — Auth, Workspace, Officers, Clients Workflows

**Branch:** `audit/features-workflows-test`  
**Auditor:** Agent 5a  
**Scope:** Auth, Workspace, Officers (Employees), Clients flows — frontend & backend

---

## 🔴 CRITICAL BUG FIXED

### AUTH — Login handler missing `workspaceId` and `activePlatformRole` variables

**File:** `server/routes/authCoreRoutes.ts`  
**Lines (before fix):** ~479–511

**Root cause:** The `/api/auth/login` handler (line 350) referenced `workspaceId` and `activePlatformRole` variables that were never declared in its scope. These variables existed only in the MFA verify handler (~line 577). Two `@ts-expect-error` comments suppressed TypeScript errors, hiding the bug entirely.

**Runtime impact:**
- Every successful password login returned `currentWorkspaceId: undefined` in the response.
- Every login returned `platformRole: null` even for platform staff.
- The frontend login redirect at `client/src/pages/custom-login.tsx:145` checks `result.user.currentWorkspaceId` to decide between `/dashboard` and `/onboarding/start`. Because it was always `undefined`, users with existing workspaces were incorrectly routed to the onboarding flow.
- The session workspace cache (`resolveAndCacheWorkspaceContext`) was never populated, causing redundant DB lookups on every authenticated request.

**Fix applied:** Added workspace resolution and platform-role lookup directly inside the login handler, matching the logic already present in the MFA verify handler:
```ts
let workspaceId = user.currentWorkspaceId;
if (!workspaceId) {
  const [emp] = await db.select().from(employees).where(eq(employees.userId, user.id)).limit(1);
  if (emp) {
    workspaceId = emp.workspaceId;
    await db.update(users).set({ currentWorkspaceId: workspaceId, ... }).where(...);
  }
}
const userPlatformRoles = await db.select().from(platformRoles).where(eq(platformRoles.userId, user.id));
const activePlatformRole = userPlatformRoles.find(pr => !pr.revokedAt);
```
Both `@ts-expect-error` suppressions removed.

---

## ✅ FLOWS AUDITED — No Additional Issues

### AUTH FLOW

| Check | Status | Notes |
|---|---|---|
| Login form validation | ✅ | `zodResolver(loginSchema)` — email + password required |
| API endpoint exists | ✅ | `POST /api/auth/login` in `authCoreRoutes.ts:350` |
| Session fixation protection | ✅ | `req.session.regenerate()` before assigning userId |
| Token storage | ✅ | httpOnly `auth_token` cookie + express-session |
| Workspace resolved on login | ✅ | **Fixed in this PR** |
| Platform role in response | ✅ | **Fixed in this PR** |
| Logout clears session + cookies | ✅ | `req.session.destroy()` + `clearCookie` for both `connect.sid` and `auth_token` with domain parity |
| Registration → `/create-org` | ✅ | Returns `needsOrgSetup: true`, frontend redirects correctly |
| Email verification flow | ✅ | Token created on register; `GET /api/auth/verify-email/:token` redirects to `/login?verified=true` |
| Forgot password | ✅ | `POST /api/auth/reset-password-request` — timing-safe (always 200) |
| Password reset confirm | ✅ | `POST /api/auth/reset-password-confirm` — frontend calls correct endpoint |
| Password strength validation | ✅ | Backend: `validatePassword()`; Frontend: Zod regex rules (uppercase/lowercase/number/symbol) |
| Rate limiting | ✅ | IP-based buckets on login (10/15 min), register (5/hr), reset (5/15 min) |
| MFA second-factor | ✅ | `POST /api/auth/mfa/verify` — pending token pattern, device trust cookie |

### WORKSPACE FLOW

| Check | Status | Notes |
|---|---|---|
| Workspace creation | ✅ | `POST /api/workspaces` — name required, max 10 per user |
| Owner employee record created | ✅ | `workspaceRole: 'org_owner'` employee row inserted on creation |
| `currentWorkspaceId` set on user | ✅ | `db.update(users).set({ currentWorkspaceId: workspace.id })` |
| Trial subscription initialized | ✅ | 14-day trial, `subscriptions` row inserted |
| Credit/usage tracking init | ✅ | `creditManager.initializeCredits()` + `workspaceUsageTracking` row |
| Tenant isolation on all queries | ✅ | All client/employee routes gate on `req.workspaceId` from session middleware |
| Workspace settings save | ✅ | `workspace.ts` PATCH handler updates via `storage.updateWorkspace()` |

### OFFICERS / EMPLOYEES FLOW

| Check | Status | Notes |
|---|---|---|
| Create form validation | ✅ | `insertEmployeeSchema.parse()` on both frontend and backend |
| Required fields enforced | ✅ | `firstName`, `lastName` required; email required for platform-role assignments |
| Workspace scoped | ✅ | `req.workspaceId` checked before insert |
| Seat limit enforcement | ✅ | `featureGateService.checkEmployeeLimits()` before insert |
| Role assignment RBAC | ✅ | Platform-role assignment gated on `isPlatformStaffCaller` check |
| Rehire detection | ✅ | Queries prior terminated employees by email within workspace |
| Worker type derivation | ✅ | `payType: 'contractor'` → `workerType: 'contractor'` + `is1099Eligible: true` |

### CLIENTS FLOW

| Check | Status | Notes |
|---|---|---|
| Create form validation | ✅ | `insertClientSchema.safeParse()` on backend |
| Workspace scoped | ✅ | `req.workspaceId` from session; all queries include `workspaceId` |
| CRM pipeline initialized | ✅ | `client_crm_pipeline` row inserted on creation |
| Client-officer linkage | ✅ | `site_assignments` / `shifts` tables link via `workspaceId + clientId` |
| Client portal | ✅ | `clientPortalInviteRoutes.ts` + `/my-portal-token` endpoint |
| External ID attached | ✅ | `attachClientExternalId()` called async post-create |

---

## ⚠️ OBSERVATIONS (non-blocking)

1. **`@ts-expect-error` overuse** — Multiple routes use `@ts-expect-error` to suppress TypeScript type errors instead of proper typing. These mask real bugs as seen in the login handler. Recommend a dedicated TS cleanup sprint.

2. **`attachClientExternalId` fire-and-forget** (`clientRoutes.ts:230`) — Called with `.catch()` but not awaited. Consistent with CLAUDE.md §B's allowed non-fatal pattern, but worth noting.

3. **Dev login endpoints are unprotected** (`/api/auth/dev-login`) — Protected by `isProduction()` check which returns the hardcoded seed user. Acceptable for dev; verified gated correctly.

---

## Summary

**1 critical bug fixed.** The login handler was returning `currentWorkspaceId: undefined` and `platformRole: null` for all password-based logins, causing incorrect redirects to `/onboarding/start` instead of `/dashboard` for existing workspace users. Fix adds the workspace and platform-role resolution logic (matching the MFA verify handler) directly into the login handler.
