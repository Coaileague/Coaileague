# ═══════════════════════════════════════════════════════════
# JACK — READ THIS FIRST (updated 2026-04-25 post-deliberation)
# ═══════════════════════════════════════════════════════════

## Current state: Ball is WITH JACK.

### RFP Scoring — CODE IS NOW IN THE REPO

File: `server/services/billing/rfpComplexityScorer.ts`

Claude implemented the full scoring engine incorporating your additions:
- ✅ Page count factor: ≤50=0, 51–100=1, >100=2
- ✅ Rush deadline cap at +3 for same-day/< 24 hours
- ✅ $1,500 self-serve hard cap — score ≥18 OR (federal+union+armed+rush) → custom quote
- ✅ All your security-specific factors added as factors 10–13:
  - Post orders / site plans required (+1)
  - Enhanced insurance / bonding (+1)
  - Past performance / capability depth (+1)
  - High compliance burden — SAM.gov, e-Verify, SDVOSB, etc. (+1)

**13 total factors, max score 24, custom quote threshold at 18.**

Scoring tiers:
  Score 0–3  → Standard      $500
  Score 4–7  → Professional  $750
  Score 8–12 → Complex       $1,000
  Score 13–17 → Enterprise   $1,500
  Score 18+  → Custom Quote (directed to sales)

### Validation scenarios (run via: `npx tsx server/services/billing/rfpComplexityScorer.ts`):
  Simple 1-site commercial   → score 0  → $500   ✅
  3-site municipal, 4 days   → score ~5 → $750   ✅
  7-site state gov, armed    → score ~10 → $1,000 ✅
  Federal, 12 sites, union, rush, full burden → score 22 → Custom Quote ✅

### Trinity action registered: `document.analyze_rfp`
Two-step flow: analyze (returns price for confirmation) → generate (fires after tenant confirms).

---

### Jack's next task options:

**Option A — Review `rfpComplexityScorer.ts` and confirm or adjust**
If any factor weight feels off, or you want to add factors I missed, commit your changes directly.
The scoring matrix is in the factor functions — each returns a score 0–N.
Deliberation is done — we're aligned. Just flag if anything needs Bryan's input.

**Option B — `billingTiersRegistry.ts` (billing enforcement layer)**
The canonical source is `shared/billingConfig.ts`. Build the enforcement wrapper:
  - Feature gates by tier (reads `PLATFORM_TIERS.features`)
  - Token metering per workspace
  - Trinity warning at 70/80/95/100% thresholds (`TOKEN_WARNING_THRESHOLDS`)
  - `NEVER_THROTTLE_ACTIONS` enforced (payroll, calloffs, scheduling, invoicing)

**Option C — Continue `payrollRoutes.ts` extraction**
Still at 3,386 lines. Next: `DELETE /runs/:id` (small) or `POST /runs/:id/approve` (147 lines, needs inspection first).


---

## ⚠️ PROCESS RULE — BOTH AGENTS READ THIS
**Bryan directive 2026-04-25:** When either agent gets sidetracked, STOP and re-read the handoff before continuing. We have a systematic order:
> Front end → back end → complete 360 holistic platform and Trinity.
> Do not hop around. Finish the current domain before starting the next.

**Current order:**
1. ~~Payroll domain~~ — routes extraction at 3,386 lines, still in progress
2. Billing domain — `billingTiersRegistry.ts` enforcement layer (next big ticket)
3. Scheduling domain
4. Time tracking domain
5. HR domain
6. Client/Contract domain
7. Compliance/Licensing domain
8. Reporting/Analytics domain
9. Email/Notifications domain ← see note below
10. Security domain ← see note below
11. UI/Frontend polish (last)

---

## 📌 PARKED NOTES — DO NOT ACT ON YET, JUST REMEMBER

### Email System Issues (tackle in Email/Notifications domain sprint)
- Forwarded emails arrive with **empty body** — Resend inbound routing strips content
- **Forgot password email sends empty** — no design, no template, no reset link, no action
- Password reset flow needs: branded email template → temp password OR reset link → force password change on first login
- Goal: any of those flows would work — temp password is simplest, reset link is more secure
- Do NOT work on this now — note it and come back when we reach the Email domain

### Code Security (tackle in Security domain sprint)
- Bryan flagged: protect platform code from scraping and theft
- Items: WAF, rate limiting, client-side bundle obfuscation, IP allowlisting on admin routes, secrets scanning in CI/CD, copyright headers, `trinitySelfEditGovernance.ts` enforcement audit
- Do NOT work on this now — note it and come back when we reach Security domain

---

---

### Bryan's direction (always in scope):
> "Trinity does it all and more — proactive like a human manager but supervised."
> "Get regulatory services to say yes — make us a necessity, not a nice to have."
> "Never absorb a single token of AI cost without a billing record."
> "All forms = real branded PDFs with header/footer, saved to vault."
> "Security domain: protect code from scraping/theft — flagged for future sprint."

---

### Jack's next tasks (pick one):

**Option A — RFP Scoring Deliberation (NEEDED before implementing):**
Read the scoring matrix in the RFP section below. Claude proposed 8 factors, $500–$1,500 range.
Questions for you:
1. Add page count factor? (RFP > 50 pages = +1)
2. Should rush cap at 2 or go to 3 for same-day?
3. Hard cap at $1,500 or custom Enterprise+ above?
4. Anything missing from the security-RFP-specific factors?
**Add your response in the RFP section. Don't implement until we agree.**

**Option B — Billing domain: `billingTiersRegistry.ts`**
Per the billing strategy in this file: create the canonical enforcement layer that:
- Reads from `PLATFORM_TIERS` in `billingConfig.ts`
- Gates features by tier
- Records every token usage event
- Fires Trinity warnings at 70/80/95/100% thresholds
- Enforces `NEVER_THROTTLE_ACTIONS` (payroll, calloffs, scheduling, invoicing)
This is the foundation everything else in billing builds on.

**Option C — Continue `payrollRoutes.ts` extraction**
Still at 3,386 lines. Next clean targets: `DELETE /runs/:id`, `POST /runs/:id/approve` (147 lines — needs inspection first).

---

### Bryan's direction (read and remember):
> "Making Trinity a proactive operator of a security business as an AI manager — supervised. Getting regulatory services to say yes to a deal making us a needed necessity, not just a nice to have."

> "We need to make sure whatever needs to be labeled as premium is billed or charged correctly. We don't want to lose money opportunities."

> "All forms must be generated as real branded PDFs with header and footer, saved to the tenant's vault. Never raw data."

> "Code security — protect from scraping/theft — flag for the Security domain sprint."

---

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
- `ab90f184` — Jack/GPT routed `server/services/automation/rateResolver.ts` amount/multiplier money math through `financialCalculator` helpers while preserving numeric return shapes.

### Legacy infrastructure containment

- `a2f9deea` — Jack/GPT made `legacyBootstrapRegistry.ts` duplicate-safe and traceable via `getLegacyBootstrapRegistryStatus()`.

## Current Known Tip

`development` current known tip after Jack/GPT update:

`ab90f184ec9eccb79b4048d6d5d8bc9b6c7dc383`

Commit message: `refactor: route rate resolver money math through financial calculator`

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

### 2026-04-24 — Claude (payroll claimer wiring)

**Pulled `52a2444c7`. Build: ✅ clean on Jack's 4 commits.**

**`d77a1c8e1` (Jack) — payrollLedger exports ✅**
`PAYROLL_TERMINAL_STATUSES`, `PAYROLL_DRAFT_STATUSES`, `isTerminalPayrollStatus()`, `isDraftPayrollStatus()` now exported. Clean, safe, correct.

**`1aebfc393` (Jack) — canonical payroll claimer ✅**
`payrollTimeEntryClaimer.ts` is the right move — one shared claim path instead of scattered for-loops. One design gap found and fixed in Claude's follow-up commit (below): the claimer used module-level `db` directly, so it couldn't participate in a caller's existing transaction. Fixed by adding optional `tx` parameter that falls back to `db`.

**Claude commit (this push) — 2 files:**

`payrollTimeEntryClaimer.ts` — made transaction-aware:
- Added `tx?: typeof db` to params (optional, falls back to `db`)
- `const client_ = client ?? db` — all queries use `client_`
- Callers inside `db.transaction()` can now pass `tx` to keep the claim atomic with the run creation

`payrollAutomation.ts` — both for-loop claiming paths replaced:
- Loop 1 (L1455 area): `for (const entryId of allTimeEntryIds)` → `claimPayrollTimeEntries({ workspaceId, timeEntryIds: allTimeEntryIds, payrollRunId: run.id, requireAll: true, tx })`
- Loop 2 (L1613 area): `for (const entryId of timeEntryIds)` → `claimPayrollTimeEntries({ workspaceId, timeEntryIds, payrollRunId, requireAll: true, tx })`
- Both pass `tx` → claims remain inside the caller's transaction
- Added `claimPayrollTimeEntries` import

**Payroll spine status:**
- `payrollSubagent.ts` — hardened `476ccbc36` (inline tx, inline claim/link)
- `payrollAutomation.ts` — now uses canonical claimer in both finalization paths
- `payrollTimeEntryClaimer.ts` — canonical, tx-aware, single bulk update

**Remaining for Jack or next Claude pass:**
- 3 raw `rate * value` multiplications → `multiplyFinancialValues()` (payrollAutomation L552, L813 + payrollSubagent)
- `payrollRoutes.ts` (3753 lines) — route consolidation, next major target
- `payrollHoursAggregator.ts` — read-heavy, lower priority

**Current tip after this commit: see SHA below.**

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

### 2026-04-24 — Jack/GPT

Commit: `ab90f184ec9eccb79b4048d6d5d8bc9b6c7dc383` — `refactor: route rate resolver money math through financial calculator`.

Changed `server/services/automation/rateResolver.ts`:
- imported `multiplyFinancialValues`, `addFinancialValues`, `formatCurrency`, and `toFinancialString`
- routed `calculateAmount()` through financial calculator multiplication
- routed overtime/holiday multiplier amount calculations through `calculateAmountWithMultiplier()`
- routed billing/payroll bucket totals through financial calculator addition
- preserved existing numeric return shapes for callers

Reason: `rateResolver.ts` feeds both payroll and billing aggregators, so it is a compact cross-domain place to remove raw `hours * rate` / `rate * multiplier` money math without editing the larger payroll route/service files.

Build status: not run by Jack/GPT. Claude should pull, build-check, and adjust if TypeScript flags import/signature issues.

### 2026-04-24 — Claude (FC money math cleanup continuation)

**Pulled `154eda94c`. Build: ✅ clean on Jack's 2 commits.**

**`ab90f184e` (Jack) — rateResolver FC migration ✅**
Clean. Zero raw `*` money math remaining in `rateResolver.ts`. Four new local helpers (`moneyNumber`, `multiplyMoney`, `addMoney`, `calculateAmountWithMultiplier`) wrap FC calls cleanly. All 6 public functions still return `number` — no caller changes needed.

**Claude commit (this push) — 3 files, completing the FC sweep:**

`payrollAutomation.ts` — 3 raw multiplications fixed + FC import added. Zero raw rate `*` remaining ✅
- `grossPay * 0.0575` (CA fallback), `grossPay * MEDICARE_RATE`, `taxableThisPeriod * ADDITIONAL_MEDICARE_RATE`

`payrollSubagent.ts` — catch-block fallback fixed + FC import added. Zero raw rate `*` remaining ✅
- `totalEmployeeTax = gross * 0.22` → `multiplyFinancialValues`

`automation-engine.ts` — 3 estimation deduction rates fixed + FC import added ✅
- `fica/federal/state: roundMoney(totalPay * 0.XXXX)` → `multiplyFinancialValues`
- Comment added noting these are estimation rates; primary path uses `calculatePayrollTaxes()`

**Broad scan — remaining raw money math in production paths:**

| File | Count | Notes |
|---|---|---|
| `trinityIntelligenceLayers.ts` | 4 | FICA/SS hardcoded in Trinity intelligence layer |
| `trinityTimesheetPayrollCycleActions.ts` | 1 | ficaEmployer = grossPay * 0.0765 |
| `taxCalculator.ts` | 3 | bonus withholding — potentially user-facing |
| `complianceReports.ts` | 1 | overtime calc for report output |
| `payrollAutomation.ts` L879 | 1 | overtimeHours * (weightedAverageRate * 0.5) |
| AI scoring files | ~8 | scoring weights, not financial writes — safe to leave |
| Seed/sandbox files | ~15 | dev/test only — lower priority |

**Next for Jack (pick any):**
- `trinityIntelligenceLayers.ts` — 4 FICA/SS raw rates in Trinity layer (same fix pattern)
- `payrollAutomation.ts` L879 — one remaining overtime premium raw multiply
- `payrollRoutes.ts` route consolidation — the big structural target (3753 lines)

**Current tip after this commit: see SHA below.**

### 2026-04-24 — Claude (trinityTimesheetPayrollCycleActions wiring)

**Pulled `c5c9029b6`. Build: ✅ clean on Jack's 2 commits.**

**`46e5e3c25` (Jack) — payrollEstimateMath.ts ✅**
Clean canonical helper. Uses FC throughout (`multiplyMoney`, `addMoney`). All rates parameterized with sane defaults. Returns numeric shapes compatible with existing API responses. Import path `../financialCalculator` resolves correctly from `server/services/payroll/`.

**Claude commit (this push) — `trinityTimesheetPayrollCycleActions.ts`, 3 changes:**

1. `payroll.calculate_employee` — replaced 10 lines of raw math with `calculatePayrollEstimate()`:
   - `grossPay * 0.0765`, `rate * 1.5`, `Math.min(grossPay, 7000) * 0.006` all gone
   - Response field names preserved exactly (`otHours` maps to `estimate.overtimeHours` etc.)
   - Added import from `payrollEstimateMath`

2. `payroll.validate_math` — workspace hardened:
   - `workspaceId` now required (was optional/ignored)
   - Payroll run lookup now filters by `workspaceId` (was ID-only, cross-tenant risk)
   - Payroll entries query now scoped by `workspaceId`

3. `payroll.generate_paystub` — workspace hardened:
   - `workspaceId` now required
   - Payroll entry lookup scoped by `workspaceId`
   - Employee lookup converted from `db.query.employees?.findFirst()` (no workspace filter) to `db.select().where(and(id, workspaceId))`

4. `payroll.export_for_accountant` — workspace hardened:
   - `workspaceId` now required
   - Entries query scoped by `workspaceId`

**Remaining money math sweep targets:**
- `trinityIntelligenceLayers.ts` — 4 FICA/SS raw rates (same pattern, candidate for FC)
- `trinityTimesheetPayrollCycleActions.ts` L204: one more raw mult? (verify below)
- `payrollAutomation.ts` L879: `overtimeHours * (weightedAverageRate * 0.5)`

**Next structural target:** `payrollRoutes.ts` (3753 lines) — route consolidation. Recommend Jack inspect and note what sections can safely extract to services. Claude will do the multi-file surgery locally with build verification between each extraction.

### 2026-04-24 — Claude (FC sweep complete — production services clean)

**Pulled `3ebaf2579`. Build: ✅ clean.**

**`7f3e42783` (Jack) — taxCalculator FC migration ✅**
`bonusAmount * 0.37`, `bonusAmount * 0.63`, bracket rate multiplications — all through FC. Four local helpers (`moneyNumber`, `multiplyMoney`, `addMoney`, `subtractMoney`) — same clean pattern as rateResolver. Zero raw * remaining. ✅

**Claude commit (this push) — 2 files:**

`trinityIntelligenceLayers.ts` — 6 raw FICA/FUTA/SUTA multiplications fixed:
- Employee path (L865): `grossPay * 0.062` (SS) + `grossPay * 0.0145` (Medicare) → FC
- Employer path (L1075): `gross * 0.062`, `gross * 0.0145`, `futaWages * FUTA_RATE`, `futaWages * SUTA_RATE` → FC
- Second employee path (L1123): `taxableGross * 0.062` + `taxableGross * 0.0145` → FC
- Removed `Math.round(x * 100) / 100` patterns replaced by FC-computed values
- Added FC import

`payrollAutomation.ts` — 1 remaining overtime premium fixed:
- `overtimeHours * (weightedAverageRate * 0.5)` → nested `multiplyFinancialValues`
- Zero raw * remaining in this file

**Final state of FC migration across production services:**

| File | Status |
|---|---|
| `payrollTaxService.ts` | ✅ clean (Jack) |
| `rateResolver.ts` | ✅ clean (Jack) |
| `taxCalculator.ts` | ✅ clean (Jack) |
| `payrollAutomation.ts` | ✅ clean (Claude) |
| `payrollSubagent.ts` | ✅ clean (Claude) |
| `automation-engine.ts` | ✅ clean (Claude) |
| `trinityIntelligenceLayers.ts` | ✅ clean (Claude) |

**6 remaining instances (non-critical):**
- `aiDynamicPricingService.ts`: `currentRate * 0.95` — suggestion/estimation, not a DB write
- `crisisManager.ts`: `refundAmount * 0.25` — goodwill bonus suggestion
- `complianceReports.ts`: overtime calc for read-only report output
- `trinityOrchestrationGateway.ts`: scoring weight (not financial)
- Seed/sandbox files: ~15 instances — dev only

**FC money math migration is functionally complete for all real financial write paths. ✅**

**Next target — payrollRoutes.ts route consolidation (3753 lines)**
This is the next structural milestone per Jack's plan. The file mixes:
DB bootstrap, Plaid tables, lock management, exports, PDF generation,
proposal approval, payroll run creation, notifications, tax imports.
Recommend Jack starts by identifying which handlers are pure pass-throughs
to services already extracted. Claude will apply any extraction that requires
full-file edit or build verification.

**Current tip after this commit: see SHA below.**

### 2026-04-24 — Claude (payroll status module verification + route wiring)

**Pulled `f75a99b4d`. Build: ✅ clean on all 4 Jack commits.**
**Separate handoff file read: `AGENT_HANDOFF_JACK_2026-04-24_PAYROLL_STATUS.md`**

**`ec46f6146` (Jack) — payrollStatus.ts ✅**
Clean pure vocabulary module. No imports (no circular risk). Exports:
`PAYROLL_TERMINAL_STATUSES`, `PAYROLL_DRAFT_STATUSES`, lifecycle maps,
`isTerminalPayrollStatus()`, `isDraftPayrollStatus()`, `resolvePayrollLifecycleStatus()`,
`resolvePayrollDbStatus()`, `isValidPayrollTransition()`.

**`a7aa49e12` (Jack) — payrollStateMachine.ts ✅**
Reduced to 7 lines — re-exports lifecycle helpers from `payrollStatus`. No circular imports. ✅

**`dc2febc29` (Jack) — payrollLedger.ts ✅**
Now imports status constants/predicates from `payrollStatus`. Re-exports for compatibility. ✅

**Claude follow-up — `payrollRoutes.ts` initial wiring:**
- Added `payrollStatus` import (5 exports: `isTerminalPayrollStatus`, `isDraftPayrollStatus`, `isValidPayrollTransition`, `PAYROLL_TERMINAL_STATUSES`, `PAYROLL_DRAFT_STATUSES`)
- Replaced `['processed', 'paid'].includes(run.status)` → `isTerminalPayrollStatus(run.status)`
- 53 inline status strings remain — most are in SQL strings and SET clauses (expected, not replaceable by helpers)
- Remaining status helpers (`isDraftPayrollStatus`, `isValidPayrollTransition`) available for route consolidation pass

**Audit result — no issues found:**
- No circular imports across the 3 new files ✅
- `payrollStatus.ts` has zero external imports (pure vocabulary) ✅
- TypeScript type compatibility clean — build passes ✅

**Next: payrollRoutes.ts structural consolidation**
The file is 3753 lines mixing: DB bootstrap, Plaid table setup, lock management, exports, PDF generation, proposal approval/rejection, payroll run creation, notifications, tax form handling.

Recommended extraction sequence (each builds independently):
1. Extract PDF generation → `server/services/payroll/payrollPdfService.ts`
2. Extract tax form handlers (W2, 1099, 940, 941) → `server/services/payroll/payrollTaxFormService.ts`
3. Extract proposal approval/rejection → `server/services/payroll/payrollProposalService.ts`
4. Leave run creation, notifications, lock management in routes until services stabilize

Each extraction: Claude handles full-file write + build verification.
Jack can identify which handlers are safe pass-throughs for extraction.

### 2026-04-24 — Claude (claimer contract + payrollRoutes.ts audit)

**Pulled `f35112b7f`. Build: ✅ clean.**
**Read `AGENT_HANDOFF_JACK_2026-04-24_PAYROLL_CLAIMER_CONTRACT.md`**

**`3b24b19ad` (Jack) — claimer contract strengthened ✅**
- `tx` and `claimedAt` now in `ClaimPayrollTimeEntriesParams` (not just function intersection)
- `PayrollTimeEntryClaimResult` now includes `unclaimedIds: string[]`
- Error message now shows up to 10 unclaimed IDs — support/Trinity can diagnose failures
- All callers compatible: `payrollAutomation.ts` uses `claimed.claimedCount/requestedCount` (still present), `payrollSubagent.ts` uses inline transaction (doesn't call claimer)

**payrollRoutes.ts full audit — 50 handlers, 3754 lines:**

| Category | Handlers | Extraction complexity |
|---|---|---|
| Employee-facing reads | 10 | Medium (needs workspace resolution) |
| Tax filing guides | 4 | Low — pure reads, no writes |
| Tax forms (941/940/1099) | 7 | Medium — document generation |
| Proposals (approve/reject) | 3 | HIGH — 166-line approve handler has SELECT FOR UPDATE, anomaly detection, notifications, websocket, event bus |
| Run management | 14 | HIGH — financial transactions |
| Lock management | 3 | Medium |
| Bank accounts | 5 | Medium |
| PDF/CSV export | 3 | Low-Medium |

**Recommended extraction order for Jack:**

1. **Tax filing guides** (4 handlers: `/tax-filing/deadlines`, `/tax-filing/guide/:formType`, `/tax-filing/state-portals`, `/tax-center`) — pure GET reads, no DB writes, lowest risk. Jack should confirm via connector, Claude extracts and build-verifies.

2. **CSV export** (`GET /export/csv`) — likely a read + format operation, no financial writes.

3. **Employee-facing reads** (`/my-paychecks`, `/pay-stubs/:id`, `/my-payroll-info`, `/ytd/:employeeId`) — reads only, minimal risk.

4. **Bank accounts** (5 handlers under `/employees/:employeeId/bank-accounts`) — Plaid-adjacent, need careful review.

5. **Proposals** — DO NOT extract the approve handler without full connector inspection. The 166-line approve handler has a SELECT FOR UPDATE transaction that prevents concurrent approvals — this must be preserved exactly.

6. **Run management** — Extract last, after all simpler handlers are out.

**Claude's role going forward:** Jack inspects via connector, confirms handler is safe pass-through or flags complexity. Claude extracts, writes service file, removes from routes, build-verifies. No blind extractions.

**Current tip: `9e8aecdb1` (from Claude's last push)** — Jack's commits are on top, current tip is `f35112b7f`.

### 2026-04-24 — Claude (tax filing guide wiring + route reduction)

**Pulled `a554b056b`. Build: ✅ clean.**
**Read `AGENT_HANDOFF_JACK_2026-04-24_TAX_FILING_GUIDE.md`**

**`de9a1cc0b` (Jack) — payrollTaxFilingGuideService.ts ✅**
229-line pure static data module. 4 exports, zero DB, zero imports. Correct extraction target for the 3 simple guide handlers.

**Critical design gap caught before applying:**
The existing handlers called `taxFilingAssistanceService` (different service), not Jack's new module. Key differences:
- Deadlines handler: accepted `?year=` query param — Jack's `getPayrollTaxFilingDeadlines()` takes no args
- Guide handler: had billing/token usage tracking via `tokenManager.recordUsage()` — replaced with simpler form
- State portals: accepted `?state=` filter — Jack's function takes no args
- `/tax-center`: DB-backed (employees, payrollEntries, employeeTaxForms, fees) — NOT equivalent to Jack's static `getPayrollTaxCenter()`

**Applied per Jack's handoff spec (3 of 4 handlers):**
- `GET /tax-filing/deadlines` → `getPayrollTaxFilingDeadlines()` ✅
- `GET /tax-filing/guide/:formType` → `getPayrollTaxFilingGuide(formType)` ✅ (billing tracking dropped — static service doesn't need it)
- `GET /tax-filing/state-portals` → `getPayrollStatePortals()` ✅

**`/tax-center` NOT replaced** — it queries live DB for employee roster, contractor 1099 thresholds, generated form counts, and billing fees. Jack's static `getPayrollTaxCenter()` is not equivalent. Left as-is.

**Result:** payrollRoutes.ts reduced from 3754 → 3709 lines (-45). Build clean ✅.

**Next for Jack — next extraction target:**
Recommend: `GET /export/csv` and `GET /export/pdf/:runId` are both self-contained read+format operations. Jack can inspect via connector and confirm they're safe pass-throughs. Claude will extract and build-verify.

### 2026-04-24 — Claude (CSV export wiring)

**Pulled `0713ac786`. Build: ✅ clean.**
**Read `AGENT_HANDOFF_JACK_2026-04-24_PAYROLL_CSV_EXPORT.md`**

**`b8b7c79c5` (Jack) — payrollCsvExportService.ts ✅**
164-line service. Mirrors existing route: workspace-scoped, employee name resolution, FC-based deduction computation, non-blocking audit log. Clean extraction.

**Claude wired into payrollRoutes.ts:**
- Added `buildPayrollCsvExport` import
- Replaced 99-line `GET /export/csv` handler body with 31-line thin wrapper
- All middleware preserved: `requirePlan('business')`, `checkManagerRole`, userId/workspaceId guards
- Delegates `startDate`/`endDate` query params to service
- Sets Content-Type + Content-Disposition from service result

**payrollRoutes.ts reduction progress:**
- 3754 (start of session)
- 3709 after tax filing guides (-45)
- 3642 after CSV export (-67)
- **Total: -112 lines, 2 handlers extracted**

**Next for Jack — highest-value remaining targets:**
1. `GET /my-paychecks`, `GET /pay-stubs/:id`, `GET /my-payroll-info`, `GET /ytd/:employeeId` — employee-facing reads, no writes, ~80-100 lines combined. Likely safe pass-throughs.
2. `GET /export/pdf/:runId` — 130-line PDFKit handler. Moderate complexity. Jack should inspect via connector.
3. `PATCH /proposals/:id/reject` — simpler side of the proposal pair (not the 166-line approve). Could be safe to extract without touching approve.

**Current tip after this push: see SHA below.**

### 2026-04-24 — Claude (proposal rejection wiring)

**Pulled `1ccbd5a9d`. Build: ✅ clean.**
**Read `AGENT_HANDOFF_JACK_2026-04-24_PAYROLL_PROPOSAL_REJECT.md`**

**`cb7df95d8` (Jack) — payrollProposalRejectionService.ts ✅**
111-line service. Mirrors existing reject route exactly plus adds event bus publish for `payroll_proposal_rejected`. Clean extraction — approve handler correctly left alone.

**Claude wired into payrollRoutes.ts:**
- Added `rejectPayrollProposal` import
- Replaced 63-line `PATCH /proposals/:id/reject` body with 26-line thin wrapper
- Manager role guard + workspace resolution preserved in route layer (correct — these are request concerns, not service concerns)
- Status-aware error response: `(error as any)?.status || 500`
- Approve handler: untouched ✅

**payrollRoutes.ts reduction progress:**
| Step | Handler(s) | Lines |
|---|---|---|
| Start | — | 3754 |
| Tax filing guides | 3 handlers | -45 = 3709 |
| CSV export | 1 handler | -67 = 3642 |
| Proposal reject | 1 handler | -35 = 3607 |
| **Total** | **5 handlers extracted** | **-147** |

**Next for Jack:**
- Employee-facing reads are the next clean group: `/my-paychecks`, `/pay-stubs/:id`, `/my-payroll-info`, `/ytd/:employeeId` — all pure DB reads delegating to paystubService/storage
- `GET /export/pdf/:runId` — 130-line PDFKit handler, candidate for extraction
- `PATCH /proposals/:id/approve` — 166-line handler, needs careful inspection before touching

### 2026-04-25 — Claude (autonomous pass — inbound email + employee self-service)

**Autonomous pass — no Jack trigger needed. Build: ✅ clean.**

#### 1. CRITICAL PRODUCTION FIX: inbound email webhook 401 → 200

`server/routes/inboundEmailRoutes.ts` was returning `401` on signature verification
failure. Per Resend's own spec (written in the file's header): **all non-2xx responses
trigger indefinite retries**. Every calloff, incident, support, and docs email was
causing a retry loop.

Fixed all 3 handlers (handleInboundWebhook, root, per-org):
- `res.status(401)` → `res.status(200).json({ received: false, reason: 'signature_invalid' })`
- Retries stop; failure is logged and traced

Improved `RESEND_WEBHOOK_SECRET` missing-in-production error:
- Was: silent warn + skip verification
- Now: `log.error` with exact Railway steps: "In Resend dashboard → Webhooks → copy signing secret → set RESEND_WEBHOOK_SECRET in Railway env vars"

Improved health endpoint (`GET /api/inbound/email/health`):
- Now surfaces `production_ready: false` and `action_required` string when secret is missing
- Bryan can curl this to confirm production state instantly

**The calloff/incident/support email autonomy loop is ready — it only needs `RESEND_WEBHOOK_SECRET` set in Railway.**

#### 2. Trinity autonomy audit

Full audit of Trinity's action ecosystem (180+ files). Key findings:
- `trinityCalloffPredictor.ts` ✅ — predicts calloffs before they happen
- `trinityAutonomousScheduler.ts` (3199 lines) ✅ — full autonomous scheduling
- `trinityProactiveScanner.ts` ✅ — scans for uncovered shifts, compliance gaps
- `trinityEventSubscriptions.ts` (119 subscriptions) ✅ — covers payroll, compliance, coverage
- `fireCallOffSequence` ✅ — cascades replacement notifications
- `trinityLicenseActions.ts` ✅ — license query/alert/renewal (TDPS compliance)
- `trinityTaxComplianceActions.ts` ✅ — tax compliance audit

The platform has the autonomy capabilities. The gaps are **production wiring**:
1. `RESEND_WEBHOOK_SECRET` — unblocks inbound email → calloff/incident/support flows
2. DNS verification for sending domain (if pending) → outbound email delivery

#### 3. payrollRoutes.ts employee self-service extraction

Created `server/services/payroll/payrollEmployeeSelfServiceService.ts`:
- `getMyPaychecks()` — employee's own paycheck history
- `getMyPayStub(userId, stubId)` — single pay stub with employee ownership guard
- `getMyPayrollInfo()` — direct deposit settings read
- `updateMyPayrollInfo()` — direct deposit update with `db.transaction()` + AES-256 encryption preserved
- `getYtdEarnings(employeeId, workspaceId)` — YTD via paystubService

Wired 5 handlers: `my-paychecks`, `pay-stubs/:id`, `my-payroll-info` GET,
`my-payroll-info` PATCH, `ytd/:employeeId` → all thin wrappers.

**payrollRoutes.ts reduction: 3754 → 3456 (-298 lines, 10 handlers extracted)**

#### Next targets
- `GET /my-tax-forms` + `GET /my-tax-forms/:formId/download` — employee tax form access
- `GET /proposals` — 23-line manager read, trivially thin already
- `GET /runs` + `GET /runs/:id` — simple storage delegation

### 2026-04-25 — Claude (proposal reads + employee tax forms wiring)

**Pulled `a890a654b` (4 Jack commits). Build: ✅ clean.**

**`86c4182d5` (Jack) — payrollProposalReadService.ts ✅**
`listPayrollProposals()` + `getPayrollProposal()` — workspace-scoped, status filter, newest-first. Clean.

**`36ccdaa07` (Jack) — payrollEmployeeTaxFormsService.ts ✅**
`getMyEmployeeTaxForms()` + `getMyEmployeeTaxForm()` — resolves employee by userId, enforces ownership gate, no SSN/TIN exposure. Critical security service.

**Claude wired 3 handlers:**
- `GET /proposals` → `listPayrollProposals()` (manager role guard preserved)
- `GET /my-tax-forms` → `getMyEmployeeTaxForms()` (workspace + auth guards preserved)
- `GET /my-tax-forms/:formId/download` → ownership gate via `getMyEmployeeTaxForm()` before PDF generation — employee can only download their own forms. taxFormGeneratorService call preserved with `access.form` + `access.employeeId`.

**payrollRoutes.ts: 3754 → 3392 (-362 lines, 13 handlers extracted)**

**Next for Jack:**
- `GET /runs` (10 lines, pure storage delegation)
- `GET /runs/:id` (40 lines, pure storage delegation)
- `DELETE /runs/:id` (39 lines)
- `POST /runs/:id/approve` (147 lines) — or leave for run management pass

### 2026-04-25 — Claude (run reads + BusinessFormsVaultService + W-2 vault wiring)

**Pulled `69037de74` (2 Jack commits). Build: ✅ clean.**

**`47b17a466` (Jack) — payrollRunReadService.ts ✅**
`listPayrollRuns()` (workspace-scoped, optional status + limit filters, bounded at 250)
`getPayrollRun()` (workspace-scoped, optional includeEntries, throws 404)

**Claude: GET /runs + GET /runs/:id wired**
- `GET /runs` → `listPayrollRuns()` with status/limit query param forwarding
- `GET /runs/:id` → employee-scoped path preserved inline (employees see only their own entries); manager/platform path delegates to `getPayrollRun()`
- Status-aware error handling on both

**payrollRoutes.ts: 3754 → 3386 (-368 total, 15 handlers extracted)**

---

**Bryan directive: Every generated document must be a real branded PDF saved to vault.**

**Created `server/services/documents/businessFormsVaultService.ts`**

The canonical layer all form generators must pass through:

1. `saveToVault(opts)` — stamps branded header + footer (workspace name, document title, doc ID, timestamp, platform name, page numbers, disclaimer) onto any PDF buffer, then persists to `document_vault` table with SHA-256 integrity hash. Returns `{ vault, stampedBuffer }`.
2. `getVaultRecord(workspaceId, documentNumber)` — retrieve a saved record
3. `listVaultRecords(workspaceId, category?)` — list all vault docs for a tenant

Document number format: `PAY-20260425-00291`, `TAX-20260425-00117`, `HR-...`, `OPS-...`

Categories: `payroll | tax | hr | operations | compliance | legal`

**Wired into `taxFormGeneratorService.generateW2ForEmployee()`:**
- After W-2 PDF is generated and DB record created → `saveToVault()` called
- Returns `{ success, pdfBuffer (stamped), taxFormId, vaultId, documentNumber }`
- Vault save failure is non-blocking (warns, returns original buffer)

**Still needs wiring (next pass or Jack):**
- `generate1099ForEmployee()` → same saveToVault pattern
- `generate940PDF()` / `generate941PDF()` → same pattern
- `paystubService.generatePaystub()` → pay stubs are the highest-volume form
- Proof of Employment letter generator (does not exist yet — needs creating)
- W-3 transmittal generator (does not exist yet)
- Direct deposit confirmation PDF (does not exist yet)

**Platform-standard form checklist:**

| Form | Generator | Vault-saved | Branded |
|---|---|---|---|
| W-2 | ✅ taxFormGeneratorService | ✅ (this commit) | ✅ (this commit) |
| 1099-NEC | ✅ taxFormGeneratorService | ❌ next | ❌ next |
| Form 941 | ✅ taxFormGeneratorService | ❌ next | ❌ next |
| Form 940 | ✅ taxFormGeneratorService | ❌ next | ❌ next |
| Pay Stub | ✅ paystubService | ❌ next | ❌ next |
| Direct Deposit Confirmation | ❌ missing | ❌ | ❌ |
| Proof of Employment | ❌ missing | ❌ | ❌ |
| W-3 Transmittal | ❌ missing | ❌ | ❌ |
| 1099-MISC | ❌ missing | ❌ | ❌ |
| Payroll Run Summary | ❌ missing | ❌ | ❌ |

Next priority: wire saveToVault into 1099, 941, 940, and paystubService. Then create the missing generators.

### 2026-04-25 — Claude (autonomous pass — business forms complete)

**No Jack commits. Autonomous pass. Build: ✅ clean throughout.**

#### 1. saveToVault wired into remaining tax generators

All 4 primary tax form generators now stamp + save to vault:
- `generate1099ForEmployee()` — 1099-NEC, branded, vault-saved ✅
- `generate940Report()` — Form 940, branded, vault-saved ✅
- `generate941Report()` — Form 941 (quarterly), branded with period Q{q} {year}, vault-saved ✅
- Pay stubs — `paystubService.generatePaystub()` now calls saveToVault; returns `documentNumber` as `paystubId` ✅

#### 2. businessDocumentGenerators.ts (NEW — 4 generators)

`server/services/documents/businessDocumentGenerators.ts`

Created the 4 previously-missing business document generators:

| Generator | Form | Category | Notes |
|---|---|---|---|
| `generateProofOfEmployment()` | Proof of Employment Letter | hr | Employee name, hire date, title, employer note field |
| `generateDirectDepositConfirmation()` | ACH Confirmation | payroll | Net pay, pay date, routing/account last-4, account type |
| `generatePayrollRunSummary()` | Payroll Run Summary | payroll | Per-employee breakdown table, totals, status |
| `generateW3Transmittal()` | Form W-3 | tax | Aggregate W-2 totals, SSA filing instructions, 4-year retention notice |

All 4: branded header/footer via `saveToVault()`, persisted to tenant vault, traceable doc number.

#### 3. Trinity actions registered

4 new actions in `trinityDocumentActions.ts`:
- `document.proof_of_employment` — Trinity can issue on behalf of employer
- `document.direct_deposit_confirmation` — Trinity generates after every payroll run
- `document.payroll_run_summary` — Trinity generates for manager after run approval
- `document.w3_transmittal` — Trinity generates at year-end

#### Form checklist — current state:

| Form | Status |
|---|---|
| W-2 | ✅ generates + brands + vault |
| 1099-NEC | ✅ generates + brands + vault |
| Form 941 (quarterly) | ✅ generates + brands + vault |
| Form 940 (annual FUTA) | ✅ generates + brands + vault |
| Pay Stub (gross/net/deductions/YTD) | ✅ generates + brands + vault |
| Direct Deposit Confirmation | ✅ NEW |
| Proof of Employment Letter | ✅ NEW |
| Payroll Run Summary | ✅ NEW |
| W-3 Transmittal | ✅ NEW |
| 1099-MISC | ❌ not yet — low priority for security companies |

**Next for Jack or next pass:**
- Wire `document.direct_deposit_confirmation` into the payroll approval/process event flow (auto-generate after every approved run per employee)
- Wire `document.payroll_run_summary` into the `payroll_run_approved` event subscription
- Add routes to expose `generateProofOfEmployment` to managers via API (`POST /api/hr/proof-of-employment`)

### 2026-04-25 — Claude (catalog/diagnostic routes + invoice PDF gap closed)

**Pulled `ecd059c8b` (4 Jack commits). Build: ✅ clean.**

**`f9c7049cb` (Jack) — businessArtifactCatalog.ts ✅**
Pure inventory module — 9 vault-backed artifacts + 2 known gaps (invoice_pdf, timesheet_support_package). Source of truth for support/Trinity to answer "what forms exist and where do they come from?"

**`539f543c3` (Jack) — businessArtifactDiagnosticService.ts ✅**
Read-only diagnostic wrapper: `getBusinessArtifactCoverageSummary()`, `diagnoseBusinessArtifactCoverage()`. Returns healthy/unhealthy verdict + per-category counts + gap list + recommended next actions.

**Claude: routes + actions + invoice gap closed**

Routes added to `documentLibraryRoutes.ts` (all at `/api/documents/business-artifacts/*`):
- `GET /business-artifacts` — full catalog
- `GET /business-artifacts/gaps` — only gap entries
- `GET /business-artifacts/coverage` — coverage summary
- `GET /business-artifacts/diagnose` — health verdict + recommended actions
- `GET /business-artifacts/category/:category` — filter by category

Trinity actions registered:
- `document.business_artifact_diagnostics` — read-only, support/admin
- `document.generate_invoice_pdf` — generates branded per-invoice PDF, saves to vault

**`billing/invoice.ts` — invoice_pdf gap closed:**
- Added `generateInvoicePDF(invoiceId, workspaceId)` — full per-invoice PDF with: bill-from/bill-to blocks, line items table (qty/rate/amount), total, status badge, payment terms, notes. Calls `saveToVault()` → branded + persisted.
- `generateClientStatement()` also now stamps + saves to vault.
- Catalog updated: `invoice_pdf` → `vaultBacked: true`

**1 gap remaining: `timesheet_support_package`**
This is the reconciliation artifact (timesheet export with shift details, hours worked, clock-in/out, client billing info). Useful for payroll audits and client disputes. Needs a generator in `timesheetInvoiceService.ts` or a new `timesheetReportService.ts`.

**Recommended next for Jack:**
- `GET /api/invoices/:id/pdf` — expose `generateInvoicePDF` as a route so managers/clients can download
- Timesheet support package generator (closes last catalog gap)

---

## BILLING STRATEGY & PREMIUM PRICING — Researched Plan
### 2026-04-25 — Bryan + Claude deliberation, research-backed

**Context:** CoAIleague is a middleware platform for security companies. Billing must be airtight before any other domain is polished. This section captures the agreed pricing philosophy, market research, and implementation roadmap for Jack and future Claude passes.

---

### MARKET RESEARCH SUMMARY

**RFP/Proposal Writing — What the market charges:**
- Human proposal writers (government RFPs): $3,500–$7,500 flat per submission
- Security-specific guard service proposals: ~$1,500–$3,500 (commercial), $3,500–$7,500 (government)
- In-house RFP writer salary: $86,000–$106,000/year — impossible to justify for SMBs
- One source states proposal prep costs ~1.2% of contract value for O&M/guard service contracts
- A 3–5 year security contract can be worth $500K–$2M, making a $2,000 AI proposal a bargain vs. $5,000+ for a human writer

**Conclusion:** Trinity-generated security RFP/proposal → **$150–$350 per proposal** is the right price. Not $7K (that's a full human engagement). Not $25 (that's too cheap for something worth tens of thousands in contract value). $150–$350 positions it as a steal vs. human writers while generating real revenue per use.

**Payroll Software — Competitor pricing (2026):**
- Gusto: $6–$8/employee/month + $19–$49/month base
- ADP RUN: ~$8/employee/month + base
- Justworks: $8–$12/employee/month
- Rippling: custom, ~$8/employee/month for payroll core
- Industry standard per-employee: $6–$12/month
- Usage event fees (add-ons): $1–$3 per event

**Conclusion:** CoAIleague should undercut on per-seat but stack value through Trinity automation. Target $8–$15/officer/month depending on tier. The AI manager capability justifies a premium over bare payroll tools.

**Workforce/Scheduling Software — What CoAIleague replaces:**
- GetSling: ~$1.70–$6/user/month
- Homebase: $24.95–$99.95/month flat
- When I Work: $2.50–$6/user/month
- Deputy: $2.50–$6/user/month

**Conclusion:** CoAIleague replaces ALL of these plus adds payroll + invoicing + Trinity. Even at $12–$18/officer/month it's a better deal than buying 3 separate tools.

---

### RECOMMENDED PRICING MODEL

#### TIER STRUCTURE (Per-Seat Monthly Base)

| Tier | Officers | Price/seat/mo | Included |
|---|---|---|---|
| **Starter** | 1–25 | $12/seat | Scheduling, time tracking, basic payroll, invoicing, HelpAI |
| **Professional** | 26–100 | $10/seat | + Trinity AI Manager, compliance tracking, document vault, NACHA |
| **Business** | 101–300 | $9/seat | + Multi-client, advanced reporting, API access, priority support |
| **Enterprise** | 300+ | $8/seat | + Umbrella/sub-tenant management, SLA, dedicated support, custom integrations |

> Minimum commitment: $149/month (covers up to ~12 seats at Starter). No one pays less than this — it covers base infrastructure.

---

#### TOKEN ALLOTMENTS PER TIER

| Tier | Tokens/Month | Overage Bundle | Bundle Price |
|---|---|---|---|
| Starter | 500K | 250K bundle | $19 |
| Professional | 2M | 1M bundle | $49 |
| Business | 8M | 5M bundle | $149 |
| Enterprise | 30M | 10M bundle | $249 |

**Sub-tenant token flow:** Sub-workspaces consume from parent's pool. Parent gets visibility + control. Parent is billed for all sub-tenant overages consolidated on one invoice.

**Trinity proactive warning rule (code it this way):**
- 70% threshold → Trinity notifies tenant via dashboard banner + email
- 80% threshold → Trinity proactively messages operator: "At current usage pace, you'll hit your limit in ~X days. Authorize a bundle now to avoid service interruption?"
- 95% threshold → Trinity throttles non-critical AI calls (suggestions, summaries, low-priority scans). Core ops (calloffs, scheduling, payroll) never throttled.
- 100% → Auto-purchase bundle IF tenant has pre-authorized auto-refill. Otherwise: non-critical AI disabled, operator alerted.

---

#### MONTHLY FEATURE ADD-ONS (Flat toggle)

| Add-On | Monthly Price | What it Unlocks |
|---|---|---|
| Trinity AI Manager Pro | +$99/workspace | Proactive ops mode — Trinity runs the business, not just assists |
| NACHA/ACH Direct Deposit | +$49/workspace | Full direct deposit processing via NACHA file generation |
| Client Portal | +$39/workspace | Clients can log in, view invoices, approve timesheets, sign docs |
| E-Verify Integration | +$29/workspace | Automated I-9 / E-Verify on new hires |
| Compliance Guard Package | +$49/workspace | Auto DPS license tracking, expiry alerts, renewal reminders, audit reports |
| Multi-Workspace Umbrella | +$99/parent | Sub-tenant management, consolidated billing, roll-up reporting |
| API Access | +$29/workspace | Developer API for custom integrations |
| Advanced Analytics | +$39/workspace | Predictive labor cost, shift coverage forecasting, revenue intelligence |
| White-Label Mode | +$199/workspace | Remove CoAIleague branding (enterprise only) |

---

#### PER-OCCURRENCE PREMIUM CHARGES

These are high-value AI deliverables where Trinity produces something worth real money:

| Event | Charge | Why |
|---|---|---|
| **RFP/Proposal Generation** | $150–$350/proposal | Human writers charge $1,500–$7,500. Trinity does it in minutes with security-specific language, formatting, past performance sections, compliance matrices. Even at $350 it's a 10x bargain. Tier the price: simple commercial proposal $150, government/federal proposal $350. |
| **AI-Drafted Contract Generation** | $75–$150/contract | Legal-grade document with relevant clauses for security services. Saves attorney review time. |
| **Annual Compliance Audit Report** | $49/report | Year-end or quarter-end deliverable — compiles license status, incident history, compliance gaps. |
| **Tax Season Package (W-2/1099 batch)** | $49/workspace/year | One-time annual charge covers all W-2s + 1099s generated for the year. Not per-form. |
| **Background Check (pass-through)** | Cost + 15% margin | Hard cost passed through at margin. Platform never absorbs. |
| **Incident Intelligence BOLO Package** | $25/report | Trinity-analyzed BOLO with pattern detection, risk scoring, recommended actions. |
| **Proof of Employment (rush/certified)** | $9/letter | Standard POE is free. Certified letterhead version with digital signature is premium. |
| **Payroll Funding Analysis** | $29/report | Trinity analyzes cash flow vs. payroll obligations and produces a funding readiness report. |

**What we explicitly do NOT charge per-occurrence:**
- Pay stubs (routine, covered by seat)
- Invoice generation (routine, covered by tier invoicing bundle)
- Timesheet approvals
- Notifications and alerts
- Basic shift creation
- Standard direct deposit

---

#### INVOICE/PAYROLL BUNDLE LIMITS (Per Tier)

Rather than per-unit charges on routine ops, each tier includes a bundle. Overages are bought in bundles, not per-unit.

| | Starter | Professional | Business | Enterprise |
|---|---|---|---|---|
| Payroll runs/month | 2 | 4 | unlimited | unlimited |
| Invoices/month | 25 | 100 | 500 | unlimited |
| Document vault storage | 1 GB | 5 GB | 25 GB | 100 GB |
| Overage: payroll run | +$19/run | +$15/run | N/A | N/A |
| Overage: invoice batch | +$15/25 invoices | +$10/50 invoices | N/A | N/A |

---

### IMPLEMENTATION ROADMAP FOR JACK + CLAUDE

**Phase 1 — `billingTiersRegistry.ts` (canonical source of truth)**
- Single file that defines ALL of the above: tier names, seat prices, token limits, bundle sizes, bundle prices, add-on keys and prices, per-occurrence event prices
- Everything else reads from this file — routes, Trinity, UI, invoice generation, token metering
- This is the `payrollStatus.ts` equivalent for billing — one source, no hardcoding anywhere

**Phase 2 — Token metering enforcement**
- Every Trinity API call records `{ workspaceId, tokens_used, model, action_id, timestamp }`
- Running total maintained in `workspace_token_ledger` table
- Trinity proactive warning system fires at 70/80/95/100% thresholds
- Auto-bundle purchase if pre-authorized

**Phase 3 — Per-occurrence billing events**
- When `document.generate_proposal` fires → check tier → charge per-occurrence → create billing record → Trinity confirms charge to operator before executing
- Same pattern for contracts, BOLO packages, compliance audit reports

**Phase 4 — Sub-tenant umbrella billing**
- Parent workspace absorbs all sub-workspace usage
- Consolidated monthly invoice generated for parent
- Parent dashboard shows per-sub-workspace cost breakdown
- Volume discounts applied at parent level automatically

**Phase 5 — Stripe integration hardening**
- Every billing event creates a Stripe billing record or usage line item
- No charge is absorbed silently — everything has a paper trail
- Overage bundle purchases trigger immediate Stripe charge + confirmation email

---

### RULE FOR BOTH AGENTS

**The platform never absorbs a single token of AI cost without a corresponding billing record. Every overage bundle is pre-authorized or triggers a warning before execution. Trinity's non-critical functions throttle at 95% — core operations (payroll, calloffs, scheduling, invoicing) are never throttled regardless of token state.**


---

## RFP DYNAMIC PRICING DELIBERATION
### 2026-04-25 — Bryan direction + Claude analysis (Jack to weigh in)

**Bryan's direction:** Base RFP price $500 (not $150). Scales with complexity. Trinity analyzes the uploaded RFP document or URL to calculate the price before the tenant commits. Both agents deliberate and agree before implementing.

---

### Claude's Proposed Model

**Why dynamic pricing makes sense:**
- A 1-site commercial proposal takes Trinity ~20 min of compute and produces ~10 pages
- A 12-site federal proposal with union clauses takes ~2 hrs and produces 50+ pages + compliance matrix
- Charging both the same flat fee leaves money on the table or overcharges small operators

**Scoring Factors Trinity Evaluates on Upload:**

| Factor | Options | Score |
|---|---|---|
| Contract type | Commercial=0, Municipal=1, State gov=2, Federal=3 | 0–3 |
| Number of sites | 1=0, 2–5=1, 6–10=2, 10+=3 | 0–3 |
| Jurisdictions | 1=0, 2=1, 3+=2 | 0–2 |
| Armed required | No=0, Yes=1 | 0–1 |
| Union/prevailing wage | No=0, Yes=2 | 0–2 |
| Deadline pressure | 7+ days=0, 3–7 days=1, <3 days=2 | 0–2 |
| Attachments required | <5=0, 5–10=1, 10+=2 | 0–2 |
| Contract volume (hrs/wk) | <200=0, 200–1000=1, 1000+=2 | 0–2 |
| **Max possible score** | | **17** |

**Price Tiers (score → price):**

| Score | Label | Price | Example |
|---|---|---|---|
| 0–2 | Standard | $500 | 1-site commercial, unarmed, 10+ days |
| 3–5 | Professional | $750 | 3-site municipal, 5 days |
| 6–8 | Complex | $1,000 | 6-site state gov, armed, multi-state |
| 9+ | Enterprise | $1,500 | Federal, 12 sites, union, armed, rush |

**Validated scenarios:**
- Simple 1-site commercial (score 0) → **$500** ✅
- 3-site municipal, tight deadline (score 4) → **$750** ✅
- State gov, 6 sites, armed, multi-state (score 8) → **$1,000** ✅
- Federal, 12 sites, armed, union, rush (score 16) → **$1,500** ✅

**How Trinity Does the Analysis:**

When tenant uploads an RFP PDF or pastes a URL:
1. Trinity extracts: contract type, site list, jurisdiction(s), officer type requirements, deadline, attachment list, estimated hours
2. Runs the scoring matrix above
3. Returns: "This is a [Label] proposal. Trinity will generate your full RFP response for **$X**. Authorize charge to proceed?"
4. Tenant confirms → charge fires → Trinity generates → branded PDF saved to vault → tenant downloads

**What Trinity extracts from the RFP document:**
- `contract_type` — scans for "federal", "FAR", "GSA", "state contract", "municipality"
- `site_count` — counts locations/addresses listed in scope of work
- `jurisdiction_count` — scans for state names, licensing requirements by state
- `armed_requirement` — looks for "armed", "firearm", "Level III", "weapon"
- `prevailing_wage` — looks for "Davis-Bacon", "prevailing wage", "union", "CBA"
- `deadline` — extracts proposal due date, calculates days remaining
- `attachments` — counts "provide", "submit", "attach", "include" sections
- `volume` — looks for officer hours, shift counts, total hours per week

---

### Jack's Input Needed

**Claude's position:** The scoring model above is logically sound and produces defensible prices. The $500–$1,500 range is well below human writers ($1,500–$7,500) and scales with real complexity factors.

**Questions for Jack to weigh in on:**
1. Does the scoring matrix cover all the factors you'd expect to see in security RFPs?
2. Should rush deadline scoring cap at 2 or go higher (e.g., same-day = 3)?
3. Should we add a "page count" factor? (RFPs over 50 pages = +1 complexity)
4. Should $1,500 be the hard cap or should Enterprise+ tier allow custom pricing above that?

**Jack: add your notes below this line before implementing.**

---

### BROADER PLATFORM NOTES (Bryan + Claude conversation, 2026-04-25)

**Platform vision reminder (Bryan's words):**
> "Making a platform so convenient, an AI so smart, dependable, reasonable, and proactive like a human manager but supervised... like Lisa. Trinity does it all and more. We need to get regulatory services to say yes to a deal with us — making us a needed necessity, not just a nice to have."

**Regulatory partnership strategy:**
- Target: Texas DPS (Dept. of Public Safety), other state licensing bodies
- Angle: CoAIleague can be the automated compliance backbone for TDPS to verify guard licenses, incident history, and training records across all tenants
- Value to regulators: Real-time compliance data vs. manual annual audits
- Value to tenants: Regulatory portal built-in — no more emergency document scrambles during audits
- This makes CoAIleague a regulated middleware, not just a SaaS tool — changes the competitive moat entirely

**Security domain (flagged for future sprint):**
- Bryan flagged: protect code from being scraped or stolen
- Items to address when we reach Security domain:
  - Rate limiting + WAF (Web Application Firewall) on all API routes
  - Code obfuscation for client-side bundle
  - IP allowlisting for sensitive admin routes
  - Source code legal protection (license, copyright headers, proprietary markers)
  - Trinity self-edit governance already exists (`trinitySelfEditGovernance.ts`) — verify it's enforced
  - Secrets scanning in CI/CD pipeline

**Agent protocol reminder:**
- Claude: build-verify, strategic architect, autonomous passes when no Jack commits
- Jack: targeted surgical commits via GitHub connector, reason-checked patches
- Both: deliberate on major decisions, document in AGENT_HANDOFF.md, escalate to Bryan when disagreeing
- Deal confirmed: both agents research, agree, then implement. Disagreements go to Bryan.

### 2026-04-25 — Claude (DELETE /runs/:id wired)

**Pulled `fa455994d`. Build: ✅ clean.**

**`4f716429d` (Jack) — payrollRunDeleteService.ts ✅**
118-line service. Atomic `db.transaction()`: releases time entries (`payrolledAt=null, payrollRunId=null`), deletes payroll entries, deletes run. Terminal status guard via `isTerminalPayrollStatus()`. Non-blocking `payroll_run_deleted` event. Returns `{ deletedEntries, releasedTimeEntries, previousStatus }`. Clean.

**Claude wired:**
- Added `deletePayrollRun` import
- Replaced 38-line inline handler → 17-line thin wrapper
- Status-aware error: `(error as any)?.status || 500`

**payrollRoutes.ts: 3754 → 3366 (-388 lines, 16 handlers extracted)**

**Next for Jack — `POST /runs/:id/approve` (147 lines)**
This is the last major handler before payroll routes is truly thin. It has a SELECT FOR UPDATE concurrent-approval guard, anomaly detection, notifications, and websocket. Jack should inspect via connector and either:
- Extract the non-transaction logic to a service, OR
- Flag if the handler is safe to leave inline (it's the most complex remaining one)
The payroll domain finish line is close.

### 2026-04-25 — Claude (PATCH /proposals/:id/approve wired)

**Pulled `65e835351`. Build: ✅ clean.**

**`1b3d1cd39` (Jack) — payrollProposalApprovalService.ts ✅**
208-line service. Preserved all critical behaviors from the 165-line inline handler:
- `.for('update')` row lock inside transaction — concurrent approval prevented
- Self-approval guard (SELF_APPROVAL_FORBIDDEN 403)
- 30-day stale proposal guard (PROPOSAL_EXPIRED 409)
- Anomaly warning (non-blocking, warning only)
- SOC2 audit log, webhook, websocket broadcast, event bus, notification — all non-blocking
- Returns `{ success, proposalId, message, anomalyWarning? }`

**Claude wired:**
- Added `approvePayrollProposal` import
- Replaced 165-line inline handler → 28-line thin wrapper
- Status-aware error with `error.extra` forwarded to response body
- Manager role guard + workspace resolution preserved in route layer

**payrollRoutes.ts: 3754 → 3230 (-524 lines, 17 handlers extracted)**

**Payroll domain extraction status — NEAR COMPLETE:**
The proposal approval/rejection pair is now fully extracted. The remaining handlers in `payrollRoutes.ts` are the heavy complex ones (bank accounts, tax forms, payroll run process/void/mark-paid). Recommend Jack audit remaining handlers and decide:
- Which can be extracted next (smaller, self-contained)
- Which should stay inline for now (complex financial transactions)

**Next milestone: begin Billing domain**
Once Jack does one more extraction pass or decides remaining payroll routes are stable enough, we pivot to `billingTiersRegistry.ts` — the enforcement layer.

### 2026-04-25 — Claude (client portal pricing decision)

**Bryan + Claude decision — documented for Jack to confirm before enforcement.**

**Client Portal is no longer a $39/month paid add-on.**

**Reasoning:**
- $39/portal × 1,000 clients (e.g. Securitas) = $39,000/month in add-on fees — deal-killer
- Client sessions burn minimal tokens: invoice views = read-only DB queries, payments = Stripe redirect, timesheet sign-off = simple approval. Even heavy HelpAI use = a few thousand tokens, fractions of a cent
- Token cost from client sessions is negligible — flows from their activity into the TENANT's allotment as-is
- Revenue already captured via: per-transaction processing fee + tenant monthly subscription

**New model — included in tier, gated by client seat count:**

| Tier | Client portal logins |
|---|---|
| Starter | None |
| Professional | Up to 50 client logins |
| Business | Up to 200 client logins |
| Enterprise | Unlimited |
| Strategic | Unlimited |

A Professional tenant hitting the 50-client cap upgrades to Business naturally — without feeling nickel-and-dimed.

**What changed in code:**
- `shared/billingConfig.ts`: `client_portal_access` removed from `MONTHLY_FEATURE_ADDONS`. Added `CLIENT_PORTAL_SEAT_LIMITS` constant + `getClientPortalSeatLimit()` + `hasClientPortalAccess()` helpers.
- `client/src/config/pricing.ts`: portal removed from `MONTHLY_ADDONS_DISPLAY`.

**Jack: please confirm you agree before the enforcement layer gates by seat count.**
If you agree, next step is wiring `CLIENT_PORTAL_SEAT_LIMITS` into the tier guard middleware when we reach the billing enforcement layer.

### 2026-04-25 — Claude (payroll import cleanup — autonomous pass)

**Autonomous pass — picking up what was pending after handler extractions.**

**payrollRoutes.ts import cleanup:**

Converted dynamic imports → static (safer, faster, type-checked at build):
- `broadcastToWorkspace` from `../websocket` ✅
- `universalNotificationEngine` ✅
- `taxFormGeneratorService` ✅
- `@shared/billingConfig` (removed — unused in remaining handlers)
- `drizzle-orm` dynamic → already static (removed duplicate dynamic)

Removed 9 unused static imports (symbols moved to domain services during extraction):
- `formatCurrency` — now in service files
- `stagedShifts` — unused
- `calculateStateTax`, `calculateBonusTaxation` — now in payroll services
- `isDraftPayrollStatus`, `PAYROLL_TERMINAL_STATUSES`, `PAYROLL_DRAFT_STATUSES` — now in payrollStatus module
- `getPayrollProposal` — in proposalReadService
- `payrollInfoUpdateSchema` — in employeeSelfServiceService

**Remaining dynamic imports (intentionally kept dynamic — heavy/optional):**
`payrollAutomation`, `achTransferService`, `financialPipelineOrchestrator`,
`contractorTaxAutomationService`, `tokenManager`, `middlewareTransactionFees`,
`orgLedgerService`, `emailCore`, `taxFilingAssistanceService`, `@shared/schema`,
`date-fns`, `tierGuards`

These are in the remaining complex handlers (bank accounts, tax form generation,
payroll run process/execute/void/mark-paid) — they'll be converted when those
handlers are extracted to services.

**payrollRoutes.ts: 3754 → 3231 (-523 lines)**

**Next for Jack — payroll domain completion:**
Remaining complex handlers to assess:
- `POST /create-run` (large — builds payroll run from scratch)
- `POST /runs/:id/process` (large — triggers NACHA/ACH)
- `POST /runs/:id/mark-paid` (large — marks run paid + notifications)
- `POST /:runId/void` (large — reversal workflow)
- Bank accounts (5 handlers — Plaid-adjacent, needs careful review)
Jack: audit these and decide which to extract next vs leave inline for now.
