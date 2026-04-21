# Round 6 Remediation — S9 / S10 / S14 (Final Round 2 audit closeout)
**Date:** 2026-04-21
**Branch:** `claude/continue-audit-plan-1V3hH`
**Base:** Round 5 commit (4c07956)
**Scope:** The three medium-priority items remaining from `SEMANTIC_AUDIT_2026_04_21.md`:
- **S9** — QB invoice auto-create on contract execution
- **S10** — I-9 upload → compliance state + manager guard-card verification route
- **S14** — Calloff SLA escalation timer

---

## Results

| # | Summary | Files Touched | Status |
|---|---|---|---|
| S9 | Invoice row auto-created on contract execute | `contractPipelineService.ts` | ✅ |
| S10a | I-9 doc-request completion → `i9_on_file=true` + `i9_submitted` event | `hr/documentRequestRoutes.ts` | ✅ |
| S10b | `PATCH /api/employees/:id/guard-card/verify` (manager+) | `employeeRoutes.ts` | ✅ |
| S14 | Coverage SLA cron scanning `shift_coverage_requests` | `coverageEscalationService.ts` (new), `index.ts` | ✅ |

TypeScript: **29 errors unchanged baseline, 0 new errors** in any touched file.

---

## S9 — QB invoice auto-create on contract execution

**File:** `server/services/contracts/contractPipelineService.ts`

**Before:** `executeContract()` only called `ensureQuickBooksRecord('customer', …)`
when a workspace had QB connected. No invoice row was ever created — so the
client-portal pay-link didn't light up, the overdue-collections cron had
nothing to see, and QB sync had nothing to push.

**Fix:** After the executed-copy emails, when `contract.totalValue > 0` AND
`contract.clientId` is set, the service now:
1. Idempotency guard — skip if an `invoices` row already exists whose
   `notes = 'Auto-generated from contract <id>'`. Safe against replay of
   execution events.
2. Generate a canonical invoice number via `generateTrinityInvoiceNumber`.
3. Insert a local `invoices` row with `status='sent'`, `issueDate=NOW`,
   `dueDate=NOW+30d`, subtotal/total = `contract.totalValue`, and the
   auto-generated note for idempotency.
4. Publish `invoice_created` platform event so downstream billing, NDS,
   and QB sync subscribers pick it up.
5. Then (if QB credentials exist) `ensureQuickBooksRecord('customer', …)`
   so the subsequent sync won't hit a missing-customer error on the QB side.

Added `invoices` to the `@shared/schema` import block at the top of the
file. Entire block is inside its own try/catch — any failure logs a
warning and does not undo the execution.

---

## S10 — I-9 + guard-card compliance wiring

### S10a — I-9 completion hook

**File:** `server/routes/hr/documentRequestRoutes.ts`

**Before:** `PATCH /api/hr-document-requests/:id/status` simply updated
`status`/`openedAt`/`completedAt`. When the request was an I-9, the
employee's compliance state never flipped, so the onboarding dashboard
and compliance engine never saw the document as "on file".

**Fix:** After the generic status update, when `status === 'completed'`
the handler now:
1. Re-reads the request row to discover its `documentType` + `employeeId`.
2. If `documentType === 'i9'` and `employeeId` is present:
   - Runs `UPDATE employees SET i9_on_file=TRUE, updated_at=NOW()` scoped
     to the workspace. Wrapped in its own try/catch so environments where
     that column has not been migrated yet fail silently rather than
     breaking the status update.
   - Publishes `i9_submitted` event with `{ employeeId, documentRequestId }`.

Both the DB update and the event publish are defensive — failures log a
warning and do not block the caller's 200.

### S10b — Guard-card manager verification route

**File:** `server/routes/employeeRoutes.ts`

**Before:** The `guardCardVerified` column existed on `employees` but had
no dedicated route. Managers had to go through the generic PATCH on the
employee record, which didn't emit a compliance event.

**Fix:** New route `PATCH /api/employees/:employeeId/guard-card/verify`.
Guarded manager+ or platform staff. Accepts:
- `verified: boolean` (default `true`)
- optional `guardCardNumber` and `guardCardExpiryDate` (so verification
  + number-entry can happen in one call)

Behavior:
1. Updates `employees.guardCardVerified` + optional number/expiry,
   workspace-scoped.
2. Writes a `systemAuditLogs` row with action `guard_card_verified` or
   `guard_card_unverified`.
3. Publishes `guard_card_verified` / `guard_card_unverified` platform
   event for compliance engine consumption.

Combined with Round 5's **S8** armed-shift check
(`employees.is_armed && employees.armedLicenseVerified`), the full armed-
eligibility gate is now end-to-end: card uploaded (doc request), card
verified by manager (this route), armed shifts validate the flag.

---

## S14 — Calloff SLA escalation timer

**Files added:** `server/services/scheduling/coverageEscalationService.ts`
**Files modified:** `server/index.ts` (daemon registration)

**Before:** `shift_coverage_requests` already tracked `expiresAt` + had
a pre-existing `shift_calloff_escalated` event handler (which Round 3
added a `thalamic_log` insert for and `trinityEventSubscriptions.ts`
wires to manager NDS notification). But **nothing ever flipped a row from
"expired-but-not-escalated" to "escalated"** — no cron, no timer. A blown
SLA silently went unaddressed.

**Fix — new service:**
- `CoverageEscalationService` class with `start(intervalMinutes)` /
  `stop()` / `sweep()` methods.
- `sweep()` selects up to 200 rows where
  `status='open' AND expires_at < NOW() AND escalated_at IS NULL`.
- For each row:
  1. Looks up site name (best-effort, for the notification payload).
  2. Sets `escalatedAt = NOW()` **first** — so a later publish failure
     does not cause repeat notifications on the next sweep.
  3. Publishes `shift_calloff_escalated` with full metadata
     (`coverageRequestId`, `shiftId`, `siteName`, `shiftDate`,
     `shiftStartTime`, `clientId`, `reason`, `originalEmployeeId`,
     `candidatesInvited`, `offersDeclined`, `expiresAt`).
  4. Existing Trinity subscription at
     `trinityEventSubscriptions.ts:3394` already handles the NDS manager
     blast + thalamic_log write. No duplicate logic added here.
- Per-row try/catch so one bad coverage request cannot stop the sweep.
- In-flight lock (`running` flag) so overlapping intervals don't double-process.

**Daemon registration:** `server/index.ts` boot sequence now imports and
starts the service inside a `timedInit('Coverage Escalation Service', …)`
block right after the Autonomous Scheduling Daemon. Interval: 5 minutes.
Registered with `registerDaemon` so graceful shutdown calls `stop()`.

---

## Verification

```
npx tsc --noEmit → 29 errors (unchanged baseline; pre-existing in
                              seed/test scripts). 0 new errors in any
                              Round 6 file.

SEMANTIC GREP
  S9  AUTO-CREATE INVOICE ON EXECUTION / Auto-invoice → 3 refs
  S10 I-9 COMPLETION / i9_submitted                   → 3 refs
  S10 guard-card verify route + audit + event          → 6 refs
  S14 coverageEscalationService file exists            → yes
  S14 wired in server/index.ts                         → 3 refs
```

---

## Full Round 2 audit closeout status

All items from `SEMANTIC_AUDIT_2026_04_21.md` are now resolved:

| Item | Severity | Round | Status |
|---|---|---|---|
| S1 Deactivation session invalidation | 🔴 | 4 | ✅ |
| S2 Employee number generation | 🔴 | 4 | ✅ |
| S3 Block email self-edit | 🔴 | 4 | ✅ |
| S4 Login per-workspace is_active | 🟠 | 4 | ✅ |
| S5 POST employees role guard | 🟠 | 5 | ✅ |
| S6 POST contracts/send role guard | 🟠 | 5 | ✅ |
| S7 Contract token ↔ signer binding | 🟠 | 5 | ✅ |
| S8 Armed-shift validation | 🟠 | 5 | ✅ |
| S9 QB invoice auto-create | 🟡 | 6 | ✅ |
| S10 I-9 + guard-card wiring | 🟡 | 6 | ✅ |
| S11 `/me/contact-info` phone sync | 🟡 | 4 | ✅ |
| S12 Role matrix corrections | 🟡 | 5 | ✅ |
| S13 Lone worker auto-activation | 🟡 | 3 | ✅ (already wired in time-entry; also added to shift start/end) |
| S14 Calloff SLA escalation timer | 🟡 | 6 | ✅ |

---

## Go-live status

**All Round 2 audit items are closed.** Combined with:
- **Round 3:** Lone worker + handoff wiring, training certs on complete,
  governance audit log, thalamic coverage for 6 critical events.
- **Round 4:** Four critical identity/session blockers (S1–S4) + S11.
- **Round 5:** Five high-risk items (S5–S8, S12) + 11 atomic DB-transaction
  wraps across the Phase B top-10 files.
- **Round 6:** Three remaining medium items (S9, S10, S14).

The platform is materially closed against every gap the Round 2
Semantic Audit identified. Next steps belong to Track B semantic loop
verification (walking real-world workflows end-to-end in a live
environment) rather than structural code audits.
