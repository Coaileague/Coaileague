# Round 3 Remediation — Post-Merge Gap Fixes
**Date:** 2026-04-21
**Branch:** `claude/continue-audit-plan-1V3hH`
**Base:** PR #153 merge (54fa209) + prior audit SEMANTIC_AUDIT_2026_04_21.md
**Scope:** Round 3 phase prompt — 9 gaps across 7 domains

---

## Results

| # | Domain | Summary | Status |
|---|---|---|---|
| 1 | D09/D32 | Lone worker + handoff wiring in shift start/end | ✅ Fixed |
| 2 | D23 | Training cert insert on session complete | ✅ Fixed |
| 3 | D20 | Trespass registry mirror | ⚪ Not needed — false positive |
| 4 | D30 | Automation governance audit log | ✅ Fixed |
| 5 | D01 | Thalamic log coverage on critical events | ✅ Fixed |
| 6 | D04 | Transactions across top-10 files | 🟡 Deferred — needs domain review |
| 7 | Settings | Phone sync user ↔ employees | ✅ Already shipped (f48621c) |
| 8 | Settings | Forwarding email field mapping | ✅ Already shipped (f48621c) |
| 9 | D06 | Armory upload quota check | ⚪ Not needed — no uploads in route |

---

## Gap 1 — Lone worker + shift handoff (D09/D32) ✅

**File:** `server/routes/shiftRoutes.ts`

**Root cause:** The `/:shiftId/start` and `/:shiftId/end` routes went through
`shiftChatroomWorkflowService` which does not wire lone-worker monitoring or
shift handoff. These services ARE wired in `time-entry-routes.ts` (clock-in /
clock-out), but officers using the "Start Shift" button in mobile apps hit
the shift route — a parallel pathway that lacked the safety net.

**Fix:** Non-blocking imports + calls after successful shift start/end:
- `/:shiftId/start` → `loneWorkerSafetyService.startForEmployee(...)`
- `/:shiftId/end` →
  - `loneWorkerSafetyService.stopForEmployee(...)`
  - If a subsequent shift is assigned to a different officer on the same
    site, `shiftHandoffService.initiateHandoff(...)` with both shift contexts.

Both services are idempotent so the time-entry path remains the primary and
these additions are safe no-ops when time-entries fire first.

**Evidence:** `grep -c "loneWorkerSafetyService\|shiftHandoffService"
shiftRoutes.ts` → 7 (was 0).

---

## Gap 2 — Training certification insert (D23) ✅

**File:** `server/routes/trainingRoutes.ts`

**Root cause:** `POST /sessions/:id/complete` updated `training_attendance`
and set a `certificate_url` but never wrote to `employee_certifications` —
so compliance dashboards showed no training credentials for attendees.

**Fix:** After marking the session completed, loop over attendees and
`INSERT … ON CONFLICT DO NOTHING` into `employee_certifications` with:
- `certification_type = 'other'` (matches VALID_CERT_TYPES enum)
- `certification_name` from session title or course_name
- `issued_date = NOW()`, `expiration_date = NOW() + 1 year`
- `status = 'active'`

Non-blocking — failures log a warning but do not fail the complete call.

**Evidence:** `grep -c "employee_certifications" trainingRoutes.ts` → 2 (was 0).

---

## Gap 3 — Trespass registry (D20) ⚪ False positive

**Finding:** The phase prompt asserted a separate `trespass_registry` table
that visitor check-in reads. In reality, `visitorManagementRoutes.ts`
`checkIsBanned()` (lines 33–47) queries `trespass_notices` directly:

```sql
SELECT 1 FROM trespass_notices
WHERE workspace_id=$1 AND lower(subject_name)=lower($2) AND status='active'
```

So trespass notices already feed BOLO matching on check-in. No registry
table exists to mirror to, and none is needed.

---

## Gap 4 — Automation audit log (D30) ✅

**File:** `server/routes/automationGovernanceRoutes.ts`

**Root cause:** Only `/approve` and `/reject` handlers wrote to the canonical
audit log (`auditLogs` via `logActionAudit`). Three state-changing handlers —
`PATCH /policy`, `POST /consent`, `POST /org-consent` — mutated governance
state silently.

**Fix:** Added `logActionAudit(...)` calls after each success:
- `governance.update_policy` — records the policy delta + actor
- `governance.grant_user_consent` — records consent type + waiver
- `governance.grant_org_consent` — records org-level consent + waiver version

**Note:** The phase prompt referenced an `automation_audit_log` table that
does not exist in the schema. The correct target is the canonical
`auditLogs` table used by `logActionAudit` (already imported in this file).

**Evidence:** `grep -c "logActionAudit"
automationGovernanceRoutes.ts` → 6 (was 2).

---

## Gap 5 — Thalamic log coverage (D01) ✅

**File:** `server/services/trinityEventSubscriptions.ts`

**Root cause:** Only 1 `thalamic_log` insert existed (for `contract_executed`).
Trinity had no persistent record of its reactions to critical operational
signals — lone-worker missed check-ins, compliance alerts, calloff
escalations, billing events.

**Fix:**
- Added a `writeThalamicSignal(...)` helper that wraps the Drizzle insert
  with consistent fields (signalId, arrivedAt, sourceTrustTier, priorityScore).
- Appended calls to 6 additional high-priority event handlers:

| Event | Priority | Source |
|---|---|---|
| `lone_worker_missed_checkin` | 10 (urgent) / 8 | `lone_worker_service` |
| `panic_alert_resolved` | 7 | `panic_alert_service` |
| `compliance_cert_expired` | 9 | `compliance_engine` |
| `shift_calloff_escalated` | 9 | `coverage_pipeline` |
| `subscription_canceled` | 8 | `billing` |
| `invoice_overdue_escalated` | 8 | `billing` |

All inserts are non-fatal — helper catches and logs warnings.

**Evidence:** `grep -c "writeThalamicSignal\|thalamic_log\|thalamiclogs"
trinityEventSubscriptions.ts` → 15 (was 3).

---

## Gap 6 — Transaction integrity top-10 (D04) 🟡 Deferred

**Decision:** Not applied in this pass.

The phase prompt explicitly says "Only wrap mutations that are logically
atomic." Without domain review per file, blindly wrapping sibling writes in
`db.transaction()` risks turning independent operations (e.g., FAQ bulk
imports where each FAQ is its own try/catch) into all-or-nothing blocks
that *increase* failure blast radius rather than reduce it.

### Recommended follow-up phase

Approach file-by-file with these criteria per handler before wrapping:
1. Are all writes conditional on the same invariant succeeding?
2. Would a partial result leave the system in a state a user can perceive?
3. Are there non-DB side-effects (emails, events, webhooks) inside the
   write group? If yes, hoist them out *before* wrapping.

Priority files (from phase prompt):
1. `faq-routes.ts` — audit each of 14 mutations; most appear to be
   independent bulk imports (wrapping would break partial-success mode).
2. `resendWebhooks.ts` — webhook retries want idempotent single writes,
   not transactions.
3. `supportRoutes.ts` — ticket state transitions with audit logs are
   likely genuine atomic pairs worth wrapping.
4. `salesInlineRoutes.ts` — lead → conversion pipelines may have atomic
   multi-table writes.
5. `miscRoutes.ts` — grab-bag; needs per-handler review.
6. `chat-management.ts` / `chat-rooms.ts` — room creation with
   participant seeding is a likely atomic pair.
7. `workspace.ts` — workspace create + owner-membership seed is a likely
   atomic pair.
8. `endUserControlRoutes.ts` — DSR requests with child audit records.
9. `sraAuthRoutes.ts` — SRA session + token creation; likely atomic.

Each file deserves a focused phase prompt rather than a bulk wrap.

---

## Gap 7 — Phone sync (Settings) ✅ Already shipped

**Finding:** The phase prompt asserts the `employeeSync` object in
`PATCH /api/auth/profile` (authRoutes.ts:294–350) does not include phone.
Inspecting current HEAD confirms phone IS included (line 332):

```ts
const employeeSync: Record<string, any> = {
  firstName: firstName.trim(),
  lastName: lastName.trim(),
  updatedAt: new Date(),
  ...(phone !== undefined && { phone: phone ? phone.trim() : null }),
};
```

Shipped in commit `f48621c` (pre-round-3). No action needed.

**Remaining gap from Round 2 audit (unrelated):** the parallel route
`PATCH /api/employees/me/contact-info` does not mirror phone back to
`users.phone`. Captured as Round 2 item S11.

---

## Gap 8 — Forwarding email field map (Settings) ✅ Already shipped

**Finding:** The phase prompt asserts `inboundEmailForwardTo` is missing
from `fieldMapping` in `workspaceInlineRoutes.ts`. Inspection confirms it
IS present at line 612:

```ts
// Email forwarding — all inbound processed emails are also CC'd to this address
'inboundEmailForwardTo': 'inboundEmailForwardTo',
```

Shipped in commit `f48621c` (pre-round-3). No action needed.

---

## Gap 9 — Armory upload quota (D06) ⚪ Not applicable

**Finding:** `armoryRoutes.ts` contains no file-upload endpoints.
`grep -i "upload\|photo\|multer\|file\|Buffer\|stream" armoryRoutes.ts` → 0.
All routes in this file are JSON CRUD for weapon inspections, qualifications,
ammo inventory, and transaction ledgers. No GCS writes happen from this
router, so no quota check is needed here.

If in the future weapon photos or inspection attachments are added to this
router, the `storageQuotaService.checkCategoryQuota` pattern from
`chat-uploads.ts` should be applied at that time.

---

## Semantic Check Results

```
=== Gap 1 ===
grep -c "loneWorkerSafetyService\|shiftHandoffService" shiftRoutes.ts → 7

=== Gap 2 ===
grep -c "employee_certifications" trainingRoutes.ts → 2

=== Gap 4 ===
grep -c "logActionAudit" automationGovernanceRoutes.ts → 6

=== Gap 5 ===
grep -c "writeThalamicSignal\|thalamic_log\|thalamiclogs" trinityEventSubscriptions.ts → 15

=== Gap 7 (shipped earlier) ===
grep -c "phone.*trim\|employeeSync" authRoutes.ts → 4

=== Gap 8 (shipped earlier) ===
grep -c "inboundEmailForwardTo" workspaceInlineRoutes.ts → 1

=== TypeScript ===
npx tsc --noEmit → 29 errors (all pre-existing in seed/test scripts, unchanged
                               by this round's edits)
```

---

## Files Changed

- `server/routes/shiftRoutes.ts` — lone worker start on `/start`; lone
  worker stop + handoff initiation on `/end`
- `server/routes/trainingRoutes.ts` — `employee_certifications` insert
  loop in `/sessions/:id/complete`
- `server/routes/automationGovernanceRoutes.ts` — `logActionAudit` on
  `PATCH /policy`, `POST /consent`, `POST /org-consent`
- `server/services/trinityEventSubscriptions.ts` — `writeThalamicSignal`
  helper + inserts on 6 critical event handlers

---

## Outstanding Items

From Round 2 audit (SEMANTIC_AUDIT_2026_04_21.md):
- **S1–S4 critical blockers** — not part of Round 3 phase prompt; still required before Statewide go-live.
- **S5–S14** — high/medium items still open.

New in this round:
- **Gap 6 transactions** — deferred pending per-file domain review.
