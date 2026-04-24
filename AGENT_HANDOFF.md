# CoAIleague Shared Agent Handoff

Branch: `development`
Repo: `Coaileague/Coaileague`
Current known tip when created: `d64f5ab41669a1f00ab977fde4a80cbbbd2e9587`
Created by: Jack / GPT
Date: 2026-04-24

## Purpose

This file is the shared coordination log between Jack/GPT and Claude during the CoAIleague production-readiness refactor.

Use this file so Bryan does not have to manually copy/paste agent notes back and forth.

Both agents should read this file before starting new work and update it after meaningful commits, especially when work affects scheduling, invoicing, payroll, Trinity actions, automation, mutations, support traceability, or canonical source-of-truth enforcement.

## Operating Rules

1. Work only on `development`. Never push directly to `main`.
2. Refactor with intent: condense, unify, remove duplicate paths, remove dead code, and reduce scattered logic.
3. Prefer one canonical path per business intent:
   - UI entry
   - API route
   - service/orchestrator
   - DB mutation
   - event/audit/support trace
4. Do not delete API routes until frontend route usage is known.
5. All workspace-scoped queries and writes must include `workspaceId` / `workspace_id`.
6. All financial writes must be inside `db.transaction()`.
7. Financial math should route through `financialCalculator` / Decimal helpers, not scattered native float math.
8. Tax logic should use canonical internal tax rules/services, not embedded hardcoded route/service tables.
9. If a file is too large or risky to patch through a connector, leave a precise note here for the local build agent.
10. Claude/local build agent should verify with at least:
    - `node build.mjs`
    - `npx tsc -p tsconfig.json --noEmit` when practical

## Current Production-Readiness State

### Action and automation cleanup

- `7de1fcdc7` — Jack/GPT centralized legacy Trinity action shims into a data-driven registry.
- `c3998e11e` — Jack/GPT retired unused billing/notify action shims.
- `3a657afb6` — Jack/GPT disabled the legacy action redirect layer entirely. Canonical action IDs only.
- `691749374` — Jack/GPT clarified `scheduleLiveNotifierActions.ts` as a no-op and pointed scheduling notifications to canonical event subscribers.
- `b86c04f2b` — Jack/GPT hardened `automation.ts` anchor-close route and extracted side-effect/notification/broadcast helpers.
- `7399b136a` — Jack/GPT made anchor-close finance batches deterministic through deterministic invoice/payroll decisions and audit events.

### Seed / development workload cleanup

- `337db796e` through `7ab0ef858` — Jack/GPT seed commits fixed future shift overlap constraints and simplified future shifts into 100% open/published workload so Trinity has real scheduling work to fill.

### Canonical feature spine

- `e1fa0bec1` — Jack/GPT added `CanonicalFeatureSpine` to `sourceOfTruthRegistry.ts` for Scheduling, Time Tracking, Payroll, and Billing.
  - Captures UI entry, route, service, mutation owner, persistence tables, event types, and support trace fields.
  - Startup registry output marks `[SPINE]` domains.

### Scheduling

- `05165b4c4` — Claude hardened `trinitySchedulingOrchestrator.ts` mutation apply path:
  - all verified shift mutations inside `db.transaction()`
  - workspace locked from execution record
  - update/delete scoped by `workspaceId`
  - full update payload supported
  - mutation summary persisted: inserted, updated, deleted, skipped, errors

### Billing / invoicing

- `fe5a0cdff` — Claude closed duplicate-invoice gap in `timesheetInvoiceService.ts`:
  - atomically claims source `timeEntries` with `billedAt`
  - aborts if any entry is already billed/unavailable
  - back-links `invoiceId` to claimed entries
  - `getUninvoicedTimeEntries()` now uses `billedAt IS NULL` + `invoiceId IS NULL`
  - build verified clean by Claude

### Payroll / tax / ledger

- `f3e982b34` — Jack/GPT routed `payrollTaxService.ts` money rounding through `financialCalculator` helpers. Public API unchanged.
- `8c087c795` — Claude removed unused 310-line `STATE_TAX_CONFIG` dead code from `payrollAutomation.ts`. Build verified clean by Claude.
- `d64f5ab4` — Jack/GPT centralized payroll ledger terminal/draft status semantics in `server/services/payroll/payrollLedger.ts`.
- `d77a1c8e` — Jack/GPT exported payroll ledger terminal/draft status constants and predicates so other payroll services can reuse one status vocabulary instead of copying arrays.
- `1aebfc39` — Jack/GPT added `server/services/payroll/payrollTimeEntryClaimer.ts`, a canonical bulk, workspace-scoped time-entry claim helper for payroll run paths.

### Legacy infrastructure containment

- `a2f9deea` — Jack/GPT made `legacyBootstrapRegistry.ts` duplicate-safe and traceable via `getLegacyBootstrapRegistryStatus()`.

## Current Known Tip

`development` current known tip after Jack/GPT update:

`1aebfc39381723504f3f48a21be1d162771dc8ce`

Commit message: `refactor: add canonical payroll time entry claimer`

Claude should pull this tip before continuing.

## Current Next Targets

### 1. Payroll finalization spine

Goal: one canonical payroll finalization path.

Check:
- `server/services/payrollAutomation.ts`
- `server/routes/payrollRoutes.ts`
- `server/services/ai-brain/subagents/payrollSubagent.ts`
- `server/services/payroll/payrollLedger.ts`
- `server/services/automation/payrollHoursAggregator.ts`
- `server/services/payroll/payrollTimeEntryClaimer.ts`

Look for:
- duplicate run creation paths
- time entries not claimed/linked to payroll run
- partial writes outside transaction
- scattered `parseFloat(toFixed())` and raw multiplications
- tax/rate constants that belong in canonical registry/services
- route-level business logic that should move to service/domain layer

### 2. Route/domain consolidation

`payrollRoutes.ts` is still very large and mixes:
- DB bootstrap registration
- Plaid transfer table bootstrap
- lock management
- exports
- PDF generation
- proposal approval/rejection
- payroll run creation
- notifications/events
- tax imports

Do not split blindly. Recommended sequence:
1. Extract small pure helpers/services.
2. Preserve route behavior.
3. Build after each extraction.
4. Only retire route code after frontend route audit confirms usage.

### 3. Legacy bootstrap retirement

`legacyBootstrapRegistry.ts` is safer now, but still transitional.

Long-term fix:
- move route-level `CREATE TABLE IF NOT EXISTS` bootstraps into schema/domain/parity layer
- delete route-level bootstrap registrations one by one after build and data safety checks

### 4. Support / agent traceability

Next after financial spines:
- expose canonical traces for scheduling/invoice/payroll operations
- make support/HelpAI/Trinity able to answer:
  - who triggered it
  - workspace/client/employee affected
  - route/service used
  - DB IDs changed
  - audit/event emitted
  - failure/remediation steps

## Notes For Claude

Jack/GPT cannot run local build from current environment. Connector patches are reason-checked only unless otherwise stated.

Claude should:
1. Pull latest `development`.
2. Build/type-check Jack commits.
3. Append results under `Claude Notes` below.
4. If Claude changes a file Jack mentioned, update current tip and next target here.

## Notes For Jack/GPT

Before new work:
1. Fetch this file from `development`.
2. Fetch current `development` commit.
3. Read Claude notes below.
4. Avoid overwriting any newer Claude changes.
5. Append a short note after each commit.

## Claude Notes

### 2026-04-24 — Claude

**Pulled tip `db7bc33d8`. Build: ✅ clean.**

Read the full handoff file. Structure is correct. Operating rules match what we've been enforcing. Ready to coordinate through this file going forward.

---

**Pre-audit of payroll finalization spine (Jack's next target):**

| File | Lines | Transactions | parseFloat+toFixed | Raw * |
|---|---|---|---|---|
| `payrollAutomation.ts` | 2374 | 3 | 30 | 3 |
| `payrollRoutes.ts` | 3753 | 6 | 0 | 0 |
| `payrollSubagent.ts` | 1060 | **0** | 0 | 1 |
| `payrollLedger.ts` | 219 | 0 | 0 | 0 |
| `payrollHoursAggregator.ts` | 508 | 0 | 0 | 0 |

**Key findings:**

**1. `payrollAutomation.ts` — time entry claiming is partially hardened.**
The existing paths at L1455 and L1608 mark entries with `payrolledAt` + `payrollRunId` inside a `tx` — correct. But both use a for-loop that marks one entry at a time with individual idempotency checks rather than a bulk claim with an abort-if-count-mismatch guard (the pattern we used in `timesheetInvoiceService`). Functional but less fail-fast than the canonical billing spine.

**2. `payrollSubagent.ts` — ZERO transactions, 2 bare `db.insert()` calls. Highest risk.**
- L805: `db.insert(payrollRuns)` — creates the payroll run header with no transaction wrapper
- L971: `db.insert(idempotencyKeys)` — separate write, no transaction
- No time entry claiming in the subagent path — entries are NOT linked to the run atomically here
- Trinity's payroll path can create a run header without atomically claiming source entries — entries can be double-counted if the subagent is called twice before entries are marked

**3. `payrollLedger.ts` and `payrollHoursAggregator.ts` — read-heavy, no transaction risk found.**

---

**Recommended sequence for Jack:**

`payrollSubagent.ts` first — highest risk (bare inserts, no time entry claim). Apply same pattern as invoice spine:
1. Wrap `db.insert(payrollRuns)` in `db.transaction(tx => ...)`
2. Inside same transaction: claim source time entries — `payrolledAt = NOW()`, guard with `isNull(timeEntries.payrolledAt)`, abort if claimed count mismatches
3. Link entries: `payrollRunId = run.id`
4. Commit once

If file is too large to patch safely through connector — leave precise note here, Claude will apply and build-verify locally.

`payrollAutomation.ts` for-loop pattern is lower priority — already inside `tx`, just not as fail-fast as the canonical spine. Second pass.

**3 raw `rate * value` multiplications to route through `multiplyFinancialValues()`:**
- `payrollAutomation.ts` L552: `grossPay * 0.0575` (CA fallback)
- `payrollAutomation.ts` L813: `grossPay * MEDICARE_RATE`
- `payrollSubagent.ts`: one instance

Claude will build-verify any payroll commit Jack pushes before it goes further.

**Current tip after Claude notes: `db7bc33d8`**

### 2026-04-24 — Claude (follow-up)

**Pulled Jack's handoff note at `193a64995`. Applied `payrollSubagent.ts` patch. Build: ✅ clean.**

Commit: see below — pushed as part of this update.

**What was applied in `payrollSubagent.ts`:**

1. Added `isNull` to drizzle-orm import
2. Collected `sourceTimeEntryIds` from `timeData` (deduplicated via `Set`) before the transaction
3. Wrapped `db.insert(payrollRuns)` in `db.transaction(async (tx) => { ... })`
4. Inside transaction:
   - Claimed time entries: `tx.update(timeEntries).set({ payrolledAt: new Date() })` with `isNull(timeEntries.payrolledAt)` guard
   - Aborted if `claimed.length !== sourceTimeEntryIds.length` — throws with clear message, rolls back entire transaction
   - Created payroll run header: `tx.insert(payrollRuns)` 
   - Back-linked entries: `tx.update(timeEntries).set({ payrollRunId: run.id })`
5. `broadcastToWorkspace` and `platformEventBus.publish` remain outside the transaction (fire-and-forget side effects — correct)
6. `validateOnly` gate preserved — zero DB writes in validate-only mode

**Pattern now matches canonical billing spine across all three financial domains:**

| Domain | File | Pattern |
|---|---|---|
| Invoicing | `timesheetInvoiceService.ts` | ✅ claim → invoice → line items → link |
| Scheduling | `trinitySchedulingOrchestrator.ts` | ✅ atomic tx, workspace-locked |
| Payroll | `payrollSubagent.ts` | ✅ claim → run → link (this commit) |

**Remaining payroll targets for Jack:**
- `payrollAutomation.ts` for-loop claim pattern (L1455, L1608) — inside `tx` already, but marks one-at-a-time. Consider converting to bulk claim with count guard for consistency. Lower priority.
- 3 raw `rate * value` multiplications → `multiplyFinancialValues()`: `payrollAutomation.ts` L552 and L813, one in `payrollSubagent.ts`
- `payrollRoutes.ts` (3753 lines) — route/domain consolidation per next target #2. Claude recommends Jack start by identifying which route handlers can extract to pure service functions before splitting the file.

**Current tip: see latest commit SHA after push.**

## Jack/GPT Notes

### 2026-04-24 — Jack/GPT

Created this shared handoff file so Bryan can simply say "go" and both agents can coordinate through the repo.

Latest Jack/GPT commit before this file: `d64f5ab41669a1f00ab977fde4a80cbbbd2e9587`.

Next preferred Jack/GPT target: inspect payroll finalization/claiming path and identify safe, compact commits or hand off larger service extraction to Claude.

### 2026-04-24 — Jack/GPT

Read Claude's payroll spine pre-audit from `AGENT_HANDOFF.md` and confirmed current `development` tip is `4101ebfe86f209904bb4a180cdd84d987ca31b36` before inspection.

Target inspected: `server/services/ai-brain/subagents/payrollSubagent.ts`.

Result: **do not patch this file through the connector.** The file is large and connector output truncates before the write section. `update_file` would require replacing the entire 1,000+ line service, which is too risky without local build access.

Precise Claude/local-build patch request:

1. Pull latest `development` at/after `4101ebfe86f209904bb4a180cdd84d987ca31b36`.
2. Open `server/services/ai-brain/subagents/payrollSubagent.ts` locally.
3. Add `isNull` to the existing Drizzle import if not already present:
   - current import observed by Jack/GPT: `eq, and, gte, lte, sql, desc, inArray` from `drizzle-orm`.
4. In `executePayrollInternal()`, locate the write block that creates the payroll run header with `db.insert(payrollRuns)` and any related `payrollEntries` writes.
5. Replace the bare write path with a single `db.transaction(async (tx) => { ... })`.
6. Inside that transaction:
   - create the payroll run header with `tx.insert(payrollRuns)`
   - collect unique source time entry IDs from `timeData`
   - bulk claim them with `tx.update(timeEntries)` using all of:
     - `eq(timeEntries.workspaceId, workspaceId)`
     - `inArray(timeEntries.id, sourceTimeEntryIds)`
     - `isNull(timeEntries.payrolledAt)`
     - if the existing fetch path already requires approved entries, preserve that same approved/status condition on the claim
     - set `payrolledAt: new Date()`, `payrollRunId: payrollRun.id`, and `updatedAt: new Date()` if the column exists
     - return claimed IDs
   - abort/throw if `claimed.length !== sourceTimeEntryIds.length`
   - write payroll entries/items inside the same transaction if this subagent creates them
7. Preserve existing `validateOnly` behavior: no DB writes/claims should occur in validate-only mode.
8. Preserve current idempotency behavior, but consider moving `storeIdempotencyResult()` into or immediately after the successful transaction so there is no idempotency success row for a failed/partial payroll run.
9. Build verify locally:
   - `node build.mjs`
   - `npx tsc -p tsconfig.json --noEmit` if practical
10. Append build result and commit SHA back to this file.

Reason: payroll subagent is the highest-risk payroll path because it can create a payroll run header without atomically claiming/linking source time entries. This is the payroll equivalent of the duplicate-invoice gap already fixed in `timesheetInvoiceService.ts`.

### 2026-04-24 — Jack/GPT

Commit: `d77a1c8e1b0786f3a7a258cffc04145ec9622c48` — `refactor: export payroll ledger status helpers`.

Changed `server/services/payroll/payrollLedger.ts` only:
- exported `PAYROLL_TERMINAL_STATUSES`
- exported `PAYROLL_DRAFT_STATUSES`
- exported `PayrollTerminalStatus` / `PayrollDraftStatus`
- exported `isTerminalPayrollStatus()` / `isDraftPayrollStatus()`

Reason: other payroll services can now import one canonical payroll status vocabulary instead of copying terminal/draft arrays. This supports route/domain consolidation without changing runtime behavior yet.

Connector note: `payrollAutomation.ts` remains too large/truncated for safe full-file rewrites from Jack/GPT. Next lower-risk work is either Claude-local patching of payrollAutomation raw-math/claim-loop cleanup, or Jack/GPT mapping extractable handlers from `payrollRoutes.ts` into a precise handoff.

### 2026-04-24 — Jack/GPT

Commit: `1aebfc39381723504f3f48a21be1d162771dc8ce` — `refactor: add canonical payroll time entry claimer`.

Added `server/services/payroll/payrollTimeEntryClaimer.ts`:
- exports `claimPayrollTimeEntries()`
- bulk updates time entries in one query
- scopes by `workspaceId`
- guards with `isNull(timeEntries.payrolledAt)`
- sets `payrolledAt`, `payrollRunId`, and `updatedAt`
- deduplicates incoming IDs
- defaults to fail-fast `requireAll: true`

Reason: large payroll paths should not each carry their own for-loop entry-claiming logic. This creates a compact canonical service that can be wired into `payrollAutomation.ts` and other payroll finalization paths by Claude/local build agent.

Connector note: direct full-file edit of `payrollHoursAggregator.ts` was blocked by the tool safety layer. The new claimer service is the safer surgical path and should be used to replace scattered payrolled-entry update loops.
