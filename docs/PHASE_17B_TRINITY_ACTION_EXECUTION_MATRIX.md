# Phase 17B — Trinity Action Execution Matrix

**Date:** 2026-04-17
**Branch:** `claude/audit-trinity-data-persistence-9WN25`
**Method:** Static code audit (no live-DB execution).
**Prerequisite status:** ⚠️ **Phase 17A did NOT pass** (10/18 tests, 4 cross-tenant
leaks, 0% audit-log coverage on the primary action path). Phase 17B was run
anyway to surface the full picture, but fixes from 17A must land before any
of these actions are declared production-ready.

---

## Executive Summary

| Audit | Result |
|---|---|
| 1. Registry inventory | ❌ 144 actions, **not 190**; 15/20 sampled actions missing or renamed |
| 2. Sample execution (static trace) | ⚠️ 5/20 sampled actions exist and trace cleanly; 15 cannot be tested |
| 3. Error paths | ❌ No Zod; inconsistent manual checks; no retry/DLQ on external APIs |
| 4. Workflow dependencies | ❌ No state machine enforced; `invoice.send` does not check `status=draft` |
| 5. Audit trail | ❌ 0 `systemAuditLogs`/`trinityAuditService` writes in `actionRegistry.ts` |
| 6. Performance baseline | ✅ Every handler captures `executionTimeMs` via `createResult(..., startTime)` |

**Headline corrections to Phase 17A claims:**

- Phase 17A reported "403+ actions" in `actionRegistry.ts`. The true count is
  **88** in `actionRegistry.ts` and **58** built-ins in
  `server/services/helpai/platformActionHub.ts`, totalling **144 actions** —
  **not** 190 or 403. The audit spec assumes 190. Either the spec is
  outdated, the registry has regressed, or several categories were never
  implemented.

**Trinity action readiness:** ~60% (down from Phase 17A's 68%). Major
functional categories (payroll cycle, finance, support tickets, hiring,
time-tracking clock_in, trinity custom workflows) are not registered at all.

---

## Audit 1 — Registry Inventory

| Source | Actions | File |
|---|---:|---|
| `AIBrainActionRegistry` | 88 | `server/services/ai-brain/actionRegistry.ts` |
| `PlatformActionHub` (built-ins) | 58 | `server/services/helpai/platformActionHub.ts` |
| **Total** | **144** | — |

**Metadata shape** (`platformActionHub.ts:143-155`, `ActionHandler` interface):
`actionId`, `name`, `category`, `description`, `requiredRoles?`, `inputSchema?`,
`outputSchema?`, `healthProbe?`, `handler`, `isTestTool?`, `isDeferred?`.
Every sampled registration provides all required fields.

**ActionRequest** (`platformActionHub.ts:109-129`): `actionId`, `category`,
`name`, `description`, `payload`, `workspaceId`, `userId`, `userRole`,
`platformRole`, `priority`, `requiresConfirmation`, `isTestMode`, `metadata`.

**ActionResult** (`platformActionHub.ts:131-141`): `success`, `actionId`,
`message`, `data?`, `error?`, `executionTimeMs`, `notificationSent`,
`broadcastSent`, `requiresHumanConfirmation`.

**Category distribution in `actionRegistry.ts` (88 actions):**

| Category | Count |
|---|---:|
| scheduling | 12 |
| billing | 11 |
| strategic | 8 |
| employees | 8 |
| onboarding | 7 |
| contracts | 7 |
| notify | 5 |
| memory | 5 |
| services / features / clients / universal / time_tracking / integrations / payroll / workspace / system / platform_roles / employee / compliance / client | 16 |

No duplicates; all 88 `actionId`s unique.

---

## Audit 2 — Sample Actions: What Actually Exists

**5/20 found, 15/20 missing or renamed.**

| Audit-spec actionId | Status | Actual registration |
|---|---|---|
| `scheduling.create_shift` | ✅ | `actionRegistry.ts:219` |
| `scheduling.get_shifts` | ✅ | `actionRegistry.ts:240` |
| `scheduling.create_open_shift_fill` | ✅ | `actionRegistry.ts:260` |
| `payroll.run_payroll_cycle` | ❌ | **Not registered.** Only `payroll.get_runs:460`, `payroll.approve_timesheet:1180` |
| `payroll.get_payroll_status` | ❌ | **Not registered** |
| `invoicing.create_invoice` | 🔄 | Registered as `billing.invoice_create` at `actionRegistry.ts:1208` |
| `invoicing.send_invoice` | 🔄 | Registered as `billing.invoice_send` at `actionRegistry.ts:1249` |
| `notifications.send_notification` | 🔄 | Registered as `notify.send` at `actionRegistry.ts:949` |
| `notifications.batch_notify` | ❌ | **Not registered** |
| `employees.create_employee` | 🔄 | Registered as `employees.create` at `actionRegistry.ts:579` |
| `employees.update_employee` | 🔄 | Registered as `employees.update` at `actionRegistry.ts:553` |
| `time_tracking.clock_in` | ❌ | **Not registered** (only `time_tracking.clock_out_officer:1269`) |
| `time_tracking.clock_out` | 🔄 | Registered as `time_tracking.clock_out_officer` |
| `finance.calculate_pnl` | ❌ | **Entire `finance.*` category absent** |
| `finance.record_expense` | ❌ | **Not registered** |
| `support.create_ticket` | ❌ | **Not registered** |
| `support.escalate_ticket` | 🔄 | Registered as `compliance.escalate` at `actionRegistry.ts:1297` |
| `hiring.create_job_posting` | ❌ | **Entire `hiring.*` category absent** |
| `onboarding.complete_employee_onboarding` | ❌ | No completion action (only `onboarding.gather_billing_preferences:1639`) |
| `trinity.execute_custom_workflow` | ❌ | **Not registered** |

**Static traces of the 5 confirmed actions:**

| Action | workspaceId in insert | Audit log | WS broadcast | Timing |
|---|---|---|---|---|
| `scheduling.create_shift` (`actionRegistry.ts:219-237`) | ✅ L227 | ❌ none | ❌ none | ✅ `start = Date.now()` → `createResult(..., start)` |
| `scheduling.get_shifts` (L240) | ✅ scoped read | n/a | n/a | ✅ |
| `scheduling.create_open_shift_fill` (L260-447) | ✅ L294 | ❌ none | ✅ 4× `broadcastToWorkspace` (L322,337,363,401); 2× `broadcastShiftUpdate` (L414,434) | ✅ |
| `billing.invoice_create` (L1207-1244) | ✅ L1221 | ❌ none | ❌ none (only `platformEventBus` L1234-1241 with `.catch(() => null)`) | ✅ |
| `billing.invoice_send` (L1249-1265) | delegates to `invoiceService.sendInvoice()` | ❌ none | ❌ none | ✅ |

**Nomenclature drift:** The audit spec uses `invoicing.*`, `notifications.*`,
`support.*`; the code uses `billing.*`, `notify.*`, `compliance.*`. Either
the spec or the registry is authoritative — choose one and reconcile.

---

## Audit 3 — Error Paths

| Scenario | Result | Detail |
|---|---|---|
| Missing required field | ❌ inconsistent | `billing.invoice_create` guards `clientId` (L1216); `scheduling.create_shift` accepts `null` `employeeId` (L228-229) |
| Invalid data type | ❌ | No Zod anywhere in `actionRegistry.ts`; no payload schema validation at dispatch |
| Permission denied | ✅ | `platformActionHub.ts:2224` + `isAuthorized()` L2799-2847; role hierarchy 10-100 (employee=50 … root_admin=100); `logs.warn` on denial |
| External API failure | ❌ | `billing.invoice_send` → `invoiceService.sendInvoice` → single attempt; no retry, no backoff, no DLQ |
| Concurrent write conflict | ✅ via DB | Relies on CLAUDE.md §C exclusion constraint; no try/catch mapping of `23P02` to a friendly message |

**Silent-swallow sites in `actionRegistry.ts`:** L615, L1241, L2824 — all
`.catch(() => null)` on `platformEventBus.publish`. Consistent with Phase
17A finding; forbidden under CLAUDE.md §B.

**Role hierarchy** (`platformActionHub.ts:2805-2839`):
`root_admin 100, sysop 95, deputy_admin 90, org_owner 88, co_owner 86,
org_admin 85, Bot 85, support_manager 78, support_agent 70, org_manager 68,
manager 65, department_manager 63, supervisor 58, auditor 55, contractor 52,
staff 51, employee 50, guest 10`.

**Auditor role guard** (`platformActionHub.ts:2240-2262`) blocks
`billing.*`, `payroll.*`, `invoicing.*`, `finance.*` categories regardless
of hierarchy.

---

## Audit 4 — Workflow Dependencies & Ordering

**State-machine file exists but is not wired:**
`server/services/ai-brain/orchestrationStateMachine.ts` defines
`intake → planning → validating → executing → reflecting → committing → completed`,
but `actionRegistry` dispatch does **not** consult it.

| Workflow | State machine | Status guards | Can steps be skipped? |
|---|---|---|---|
| Invoice (create → add_line_items → send) | ❌ | ❌ `billing.invoice_send` does not check `status='draft'` | **Yes** |
| Payroll (validate_timesheets → calculate_deductions → run_payroll_cycle) | ❌ | n/a — `run_payroll_cycle` is not registered | n/a |
| Hiring (create_job_posting → … → onboard_employee) | ❌ | n/a — `hiring.*` category is not registered | n/a |

`billing.invoice_create` hard-codes `status: 'draft'` at L1223, but
`billing.invoice_send` does not read the status back before sending. An
already-sent or voided invoice can be re-sent.

---

## Audit 5 — Audit Trail

**Finding: 0 audit-log writes in `actionRegistry.ts`.**

`grep` for `insertAuditLog`, `systemAuditLogs`, `auditLog.create`,
`trinityAuditService` inside `server/services/ai-brain/actionRegistry.ts`
returns **zero matches**. This is the same bug Phase 17A reported; it has
not regressed, but has not been fixed either.

`trinityAuditService` (`server/services/trinity/trinityAuditService.ts`)
exposes `logSkillExecution`, `logPermissionCheck`, `logSkillResult`,
`logSkillError` — all unused by the 88 registered actions.

Two handlers do publish to `platformEventBus` (`invoice_created` at L1234-
1241, `employee_hired` elsewhere), but event-bus publishes are **not** an
audit trail — they are fire-and-forget with `.catch(() => null)` and no
persistent record in `systemAuditLogs` or `trinity_audit_logs`.

Replay of "who did what when" from current logs is **not possible** for the
vast majority of Trinity actions.

---

## Audit 6 — Performance Baseline

✅ **Timing is instrumented consistently.**

`createResult(actionId, success, message, data, startTime?)`
(`actionRegistry.ts:46-60`) returns
`executionTimeMs = startTime ? Date.now() - startTime : 0`. Every sampled
handler captures `const start = Date.now()` at entry (L118, L132, L145,
L169, L225, …) and passes `start` to `createResult`.

`platformActionHub.executeAction` (`platformActionHub.ts:2206`) wraps the
entire dispatch with its own `Date.now()` measurement.

**Gaps:**
- No external metrics sink (no StatsD, Prometheus, OpenTelemetry). Timing
  is returned to caller only; nothing is aggregated.
- No p50/p95/p99 tracking, no slow-query alarms.

**Static-trace budget estimates** (not measured, can't run live):
- Reads — `scheduling.get_shifts`, single `db.select` with workspace
  filter, well under 100ms target.
- Writes — `scheduling.create_shift`, single `db.insert`, well under
  200ms target.
- External — `billing.invoice_send` waits on Resend send synchronously;
  variable (200-1000ms) as expected.
- AI — `scheduling.create_open_shift_fill` calls AI scoring + assignment;
  500-2000ms range expected.

---

## Must-Fix / Decide Before 17C

1. **Reconcile action naming.** The audit spec (`invoicing.*`,
   `notifications.*`, `support.*`, `time_tracking.clock_in`,
   `payroll.run_payroll_cycle`, `finance.*`, `hiring.*`,
   `trinity.execute_custom_workflow`, `onboarding.complete_employee_onboarding`)
   diverges from the registry (`billing.*`, `notify.*`, `compliance.*`,
   missing categories). Authoritative decision required: add missing
   actions, or update the spec.
2. **Close the audit-trail gap.** Every handler in `actionRegistry.ts` must
   call a shared `insertAuditLog(...)` helper. Blocker from Phase 17A
   carried forward.
3. **Wire the orchestration state machine** into the dispatcher, or at
   minimum add status guards to `billing.invoice_send` (`WHERE status =
   'draft'`).
4. **Add retry + DLQ** to external-API handlers (`invoice_send`, Resend,
   Stripe, QB). `withRetry` is available at `server/db.ts:210` — use it.
5. **Adopt Zod** for ActionRequest payloads. Manual `if (!field)` guards
   are inconsistent and silently skip validation in at least one sampled
   handler.
6. **Centralize WebSocket broadcast.** `create_shift` and `invoice_create`
   do not emit updates to subscribed clients, while `create_open_shift_fill`
   does. Trinity dashboard will miss shift-create events.

## Success-Criteria Scorecard

- ❌ 20-30 sample actions executing — only **5/20** (25%) registered and
  traceable.
- ❌ 100% audit logging coverage — **0/88** handlers write audit records.
- ❌ No silent swallows — **3** `.catch(() => null)` sites remain in
  `actionRegistry.ts`.
- ❌ Workflow sequencing enforced — **0/3** workflows guarded.
- ✅ Performance baselines — timing instrumentation present; external
  metrics sink missing.
- **Confidence: Trinity actions ~60% ready**, not the 90% target.

**Phase 17C (Workflow Orchestration) should not begin until the
reconciliation above is complete.** Running an orchestration layer on top
of a registry with 15 missing action IDs and no audit trail will produce
confident-looking workflows that silently fail.
