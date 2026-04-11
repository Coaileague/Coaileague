# Frontend Audit Report 1a — Forms, State, Routing
**Agent:** 1a  
**Branch:** audit/frontend-complete-check  
**Scope:** `client/src/pages/` and `client/src/`

---

## Summary

The audit covered 308 page files across `client/src/pages/`. The existing RBAC and routing infrastructure is solid — `RBACRoute`, `ProtectedRoute`, `LeaderRoute`, `OwnerRoute`, and `PlatformAdminRoute` are all correctly used. All protected app routes are wrapped in `ProtectedRoute` at the top level in `App.tsx`. Auth handling via session cookies (no token expiry issues) is managed through `useAuth`.

Five actionable issues were found and fixed.

---

## Issues Found & Fixed

### 1. Stale closure in `interview-chatroom.tsx` — polling never triggered (**State Bug**)

**File:** `client/src/pages/interview-chatroom.tsx`

**Problem:** The `setInterval` callback inside the first `useEffect` captured `room` from the initial render (value: `null`). `room?.status === 'active'` evaluated to `false` every tick, so `pollMessages()` was never called. Candidates would never see Trinity AI responses.

**Fix:** Added a `roomStatusRef` that is kept in sync with `room?.status` via a dedicated `useEffect`. The interval now reads from the ref instead of the stale closure variable.

```diff
+ const roomStatusRef = useRef<string | undefined>(undefined);
+ useEffect(() => { roomStatusRef.current = room?.status; }, [room?.status]);

  pollIntervalRef.current = setInterval(() => {
-   if (room?.status === 'active') pollMessages();
+   if (roomStatusRef.current === 'active') pollMessages();
  }, 3000);
```

---

### 2. `mutateAsync` unhandled rejections in `settings.tsx` (**Form Submission Error Handling**)

**File:** `client/src/pages/settings.tsx`

**Problems:**
- `updateWorkspaceMutation` (line 441, inside `WorkspaceSettingsForm`) had no `onError` callback.
- Eight handler functions (`handleCategoryChange`, `handleSeedTemplates`, `handleSaveWorkspace`, `handleSaveInvoiceFinancials`, `handleSavePayrollFinancials`, `handleSaveInvoicing`, `handleSavePayroll`, `handleSaveScheduling`, `handleSaveBreakCompliance`) called `mutateAsync` without try/catch, causing unhandled promise rejections when mutations fail.

**Fix:**
- Added `onError` callback to `updateWorkspaceMutation` showing a destructive toast.
- Wrapped all 9 handler functions in try/catch blocks to prevent unhandled rejections. Since mutations already handle errors via `onError`, the catch blocks are silent.

---

### 3. `mutateAsync` without try/catch in `schedule-mobile-first.tsx` (**Form Submission Error Handling**)

**File:** `client/src/pages/schedule-mobile-first.tsx`

**Problems:**
- `handleDeleteShift` called `deleteShiftMutation.mutateAsync` without try/catch.
- `handleSubmitShift` called `createShiftMutation.mutateAsync` without try/catch.

**Fix:** Wrapped both calls in try/catch blocks (errors already handled by mutation `onError` callbacks).

---

### 4. Step advances on error in `employee-onboarding-wizard.tsx` (**State Bug + Form Error Handling**)

**File:** `client/src/pages/employee-onboarding-wizard.tsx`

**Problems:**
- `updateAppMutation` had no `onError` callback — save failures were invisible to the user.
- `handleNext` called `mutateAsync` without try/catch. On failure, `setStep(s => s + 1)` still executed, advancing the wizard to the next step even though the data wasn't saved.

**Fix:**
- Added `onError` callback to `updateAppMutation` showing a "Save failed" destructive toast.
- Wrapped all `mutateAsync` calls in `handleNext` in a single try/catch block; `setStep(s => s + 1)` only executes if all mutations succeed.

---

### 5. `markPaidMutation.mutateAsync` unhandled rejection in `invoices.tsx` (**Form Submission Error Handling**)

**File:** `client/src/pages/invoices.tsx`

**Problem:** An `onClick` handler in the dropdown menu called `markPaidMutation.mutateAsync` without try/catch, causing an unhandled promise rejection if the server returned an error (the mutation does have `onError`, but React will still log an unhandled rejection).

**Fix:** Wrapped the `mutateAsync` call in a try/catch block.

---

### 6. Phone number validation missing in `sms-consent.tsx` (**Form Validation**)

**File:** `client/src/pages/sms-consent.tsx`

**Problem:** The SMS opt-in form accepted any non-empty string as a phone number (no format validation), and showed no error message for invalid inputs.

**Fix:**
- Added basic US phone number validation (10 digits, or 11 with leading `1`).
- Added a `phoneError` state variable and error display below the input.
- Clears the error on input change.

---

## What Was Left

- **`auditor-portal.tsx` and `compare.tsx`** use `useQuery` without destructuring `isLoading`/`isError`. These pages gracefully fall back to empty arrays — no visible bug, acceptable as-is.
- **`sms-consent.tsx`** does not POST to an API (it's a public marketing consent page). The actual opt-in is managed per-employee in `employee-profile.tsx`. The page's "submit" sets local UI state only — this appears intentional.
- **SRA portal pages** (`SRAPortalDashboard`, `SRAOfficers`, etc.) use a custom localStorage token for auth. The auth guard is in `SRAPortalLayout` which redirects to login if the token is missing — this is correct.
- **General `useQuery` pages without explicit loading/skeleton states** — 270+ pages were reviewed. Most show empty states gracefully or use `data ?? []` defaults. Adding skeleton loaders to all of them would be a large non-critical refactor outside scope.

---

## TypeScript

`tsc --noEmit` passes with **0 errors** after all changes.
