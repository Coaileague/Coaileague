# Claude Handoff — Finance Automation Fix

Branch target:
- `development`

Domain completed:
- core finance automation readiness
- Trinity invoice generation
- Trinity payroll generation
- anchor-close batch orchestration
- dev seed finance-data repair
- branch compile stability fixes uncovered during finance work

## What Was Broken

Before this pass:
- Trinity payroll anchor-close could return zero payroll runs even when approved time entries existed.
- Trinity invoice anchor-close could return zero invoices or zero-dollar manual-review fallbacks because rate resolution was weak and hard-coded.
- Single invoice generation still relied on a hard-coded billing rate path instead of using actual client/time-entry finance data.
- Dev seed reruns left stale/orphaned finance records behind, so time entries could reference employees/clients no longer aligned with the current seed state.
- Branch-level compile drift in chat/websocket/dev route files was hiding behind looser validation and made the `development` branch less trustworthy as a base.

## What Changed

### 1. Automation engine finance hardening

File:
- `server/services/automation-engine.ts`

Key fixes:
- Removed hard-coded invoice billing assumptions.
- Added deterministic rate parsing helpers for invoice and payroll fallback logic.
- Invoice fallback now derives totals from:
  - captured bill rates
  - client contract/billable rates
  - billable amounts on time entries
- Payroll fallback now derives totals from:
  - employee hourly rate
  - captured pay rate on time entries
  - approved worked hours
- `runAnchorPeriodInvoicing()` now:
  - queries approved, unbilled, closed time entries directly
  - groups them by client
  - reports orphaned client IDs for bad seed/data states
- `runAnchorPeriodPayroll()` now:
  - queries approved, unpayrolled, closed time entries directly
  - groups them by employee
  - reports orphaned employee IDs for bad seed/data states

Result:
- Trinity finance now has deterministic non-zero fallback behavior when AI enrichment fails.
- Silent “nothing to do” outcomes now surface diagnostics instead of failing quietly.

### 2. Automation route workspace + filtering fixes

File:
- `server/routes/automation.ts`

Key fixes:
- Added canonical route workspace resolution using:
  - request body/query workspace
  - scoped request workspace
  - current user workspace
  - RBAC workspace resolution
- Updated these endpoints to use resolved workspace context:
  - `/schedule/generate`
  - `/schedule/apply`
  - `/invoice/generate`
  - `/invoice/anchor-close`
  - `/payroll/generate`
  - `/payroll/anchor-close`
- Invoice generation route now filters unbilled entries by:
  - approved status
  - no invoiceId / billedAt
  - closed clockOut
  - requested date range
- Payroll generation route now filters entries by:
  - approved status
  - no payrollRunId / payrolledAt
  - closed clockOut
- Anchor-close responses now include diagnostics and warnings so missing client/employee references are visible.

Result:
- Trinity finance routes now work off the correct workspace and only process valid approved records.

### 3. Dev seed finance data repair

File:
- `server/services/comprehensiveDevSeed.ts`

Key fixes:
- Added repair step to clear stale finance records for the dev ACME workspace before reseeding:
  - `invoice_line_items`
  - `invoices`
  - `payroll_entries`
  - `payroll_runs`
  - `time_entries`
  - completed/past `shifts`
- Client upsert now maintains both:
  - `contract_rate`
  - `billable_hourly_rate`
- Time entries now store:
  - `hourly_rate = captured_pay_rate`
  - `total_amount = payable_amount`
  instead of incorrectly storing billable values in payroll-oriented columns.

Result:
- Seed reruns rebuild coherent finance-operational history instead of layering new data over broken references.
- Trinity payroll/invoicing gets cleaner source data to reason over.

### 4. Stability fixes found while validating the branch

Files:
- `server/middleware/subscriptionGuard.ts`
- `server/routes.ts`
- `server/routes/chat-rooms.ts`
- `server/routes/devRoutes.ts`
- `server/routes/privateMessageRoutes.ts`
- `server/services/chat/chatAccessService.ts`
- `server/websocket.ts`

Key fixes:
- Repaired request typing drift in subscription guards and route middleware wiring.
- Repaired stale chat room table references after previous refactors.
- Restored `broadcastToUser()` export in websocket for DM live updates.
- Fixed private message route websocket payload drift (`newMessage` vs `sentMessage`).
- Fixed dev routes to use Express `Response` typing and current `platformActionHub` path.
- Repaired chat access service imports to match current schema exports.

Result:
- The branch is back to a trustworthy validation baseline instead of “build passes but compile is drifting.”

## Validation

Validated locally:
- `tsc --noEmit`
- `node build.mjs`
- `vitest run --project unit`

Status:
- TypeScript: passed
- Server build: passed
- Unit tests: `7 files / 100 tests passed`

## Sync Guidance For Claude

Cherry-pick or replicate the finance domain changes from:
- `server/services/automation-engine.ts`
- `server/routes/automation.ts`
- `server/services/comprehensiveDevSeed.ts`

Also sync the branch-stability repairs from:
- `server/middleware/subscriptionGuard.ts`
- `server/routes.ts`
- `server/routes/chat-rooms.ts`
- `server/routes/devRoutes.ts`
- `server/routes/privateMessageRoutes.ts`
- `server/services/chat/chatAccessService.ts`
- `server/websocket.ts`

## Before / After Summary

Before:
- Trinity finance could silently do nothing with valid approved time-entry volume.
- Invoice generation still contained hard-coded billing behavior.
- Seed reruns preserved broken finance references.
- The branch had compile drift outside the finance path.

After:
- Trinity finance works from resolved workspace context and approved processable records.
- Invoice/payroll fallbacks are deterministic and data-backed.
- Seed runs repair stale finance history instead of compounding it.
- The full branch now passes TypeScript, build, and unit validation.
