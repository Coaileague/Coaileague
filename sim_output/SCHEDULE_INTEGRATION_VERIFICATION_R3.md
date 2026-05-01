# Schedule Interface — Round 3 Final Gap Analysis

Final pass: deep scan for loose ends, route conflicts, schema/code drift,
mobile sizing, and TypeScript debt across the schedule surface.

## Bottom Line

* Verifier: **28/28 PASS** (added one new test for the availability fix).
* TypeScript: schedule-scope errors **0** (was 21 at the start of round 1).
* Production build: succeeds, every schedule lazy chunk emitted.
* Email pipeline: still verified end-to-end.

## Real Bugs Found and Fixed (this round)

### 1. `POST /api/availability/exception` — every UI submission silently 400'd

The route's Zod schema (`availabilityRoutes.ts:178`) accepted
`['time_off', 'schedule_change', 'availability_update', 'other']` but the
service it forwards to only accepts `['vacation', 'sick', 'personal',
'unpaid']`. The two enums were completely disjoint. Meanwhile
`client/src/pages/availability.tsx:110` posts `requestType: 'vacation'`,
which Zod rejected before the request ever reached the service.

Verifier reproduces — pre-fix the call returned 400 "Validation failed";
post-fix it returns 200 and inserts a real time-off row. New test added:
`POST /api/availability/exception (Zod aligned with service) — 200`.

### 2. `shiftRoutes.ts` — `deniedAt` column was being assigned an ISO string

The deny handler stuffed `new Date().toISOString()` into the timestamp
column (with a `@ts-expect-error` mask). The DB driver coerces in some
cases but not all, and the type was wrong. Switched to `new Date()` and
removed the suppression. (Same column type lives behind drizzle's
`timestamp(...)`).

### 3. `trinityAutonomousScheduler.executeAutonomousScheduling` — couldn't be called from email/cron paths

The function declared a `SchedulingConfig` with all-required fields, but
two real callers (`trinityInboundEmailProcessor.ts:1227` for inbound email
and `auto-fill-internal` route for stress tests) only had `workspaceId`
and `mode`. The TS error masked a real impedance mismatch.

Fix:
* Kept `SchedulingConfig` strict (so the body of the method has narrow
  types).
* Added a public `PartialSchedulingConfig = Pick + Partial` for entry
  points.
* The method now accepts the partial type and normalizes via explicit
  defaults at the top.
* Added optional `triggeredBy` (audit attribution) and `sessionId`
  (correlation) fields to the contract.

### 4. `clientNameMap` — stale `@ts-expect-error` suppressing a sound warning

Replaced with a `?? ''` coercion that handles the schema's nullable
`companyName` properly. No more silent-error suppression.

## Visual / Accessibility Polish

`client/src/pages/schedule-mobile-first.tsx` view-mode tabs:

| Property      | Before | After  | Why |
|---------------|--------|--------|-----|
| Font size     | `text-[10px]` | `text-xs` (12px) | WCAG AA readability. |
| Vertical padding | `py-0.5` | `py-1` | Tap target inflated. |
| Pending badge | `text-[8px]` | `text-[10px]` | Unreadable → readable. |
| Role          | (none) | `role="tab"` + `role="tablist"` | Surfaces structure to AT. |
| State         | inferred from class | `aria-pressed={selected}` | Screen readers announce active tab. |
| Badge         | bare number | `aria-label="N pending shifts"` | Visually-hidden context. |

Touch surface is now ~32px tall (was ~22px); text passes WCAG-AA
visibility at standard mobile DPI.

## Comprehensive Audit Done This Round

* **Route mounts** — every schedule sub-router under
  `mountSchedulingRoutes` accounted for. Two routers share the
  `/api/scheduling` prefix (advanced + inline) but have **zero path
  collisions**: `swap-requests`, `shifts/:shiftId/{duplicate,swap-request}`,
  `duplicate-week`, `templates/:id`, `recurring/:patternId/generate`
  (advanced) vs `alerts`, `consecutive-days-warnings`,
  `overtime-predictions`, `generate-alerts` (inline).
* **Verb+path duplication inside each router** — none. Verified via
  `verb path` extract over all 13 schedule-related router files.
* **Storage method coverage** — every `storage.*` schedule call resolves
  to a defined method (`getShift`, `getShiftsByWorkspace`,
  `getShiftsByEmployeeAndDateRange`, `updateShift`, `deleteShift`,
  `createShift`).
* **Frontend → backend reachability** — every API string in
  `universal-schedule.tsx`, `schedule-mobile-first.tsx`,
  `team-schedule.tsx`, `shift-marketplace.tsx`, `shift-trading.tsx`,
  `shift-approvals.tsx`, `shift-accept.tsx`, `shift-offer-page.tsx`,
  `ShiftOfferSheet.tsx` mapped to a registered handler — including
  templated `${shift.id}/${endpoint}` paths.
* **N+1 queries** — none in the schedule services. All employee/client
  enrichments use `inArray()` batch lookups; `getSwapRequests` is the
  one I rewrote in round 1.
* **Defensive imports** — three `await import(...).catch(...)` patterns
  in `trinitySchedulingRoutes.ts` re-typed in round 2 stay clean.
* **Test-mode bypass** — `validateTestKey` blocked under
  `NODE_ENV=production`, mirrored by the limiter skip predicate.
  `ensureWorkspaceAccess` short-circuits to the seeded acme identity.
* **Tier guards** — `requireProfessional` on `/api/scheduling`'s
  advanced router is exempted via `GRANDFATHERED_TENANT_ID` for the
  dev workspace; production tenants honor the gate normally.

## TypeScript Debt — Schedule Surface

| Round | Schedule errors | Total errors |
|-------|----------------:|-------------:|
| Start of round 1 | 21 | 376 |
| End of round 2   | 2  | 358 |
| End of round 3   | **0** | **355** |

All zeroes are in files I touched: rateLimiter, advancedSchedulingRoutes,
advancedSchedulingService, schedulesRoutes, shiftRoutes,
trinitySchedulingRoutes, trinityAutonomousScheduler,
shiftRemindersService, ai-brain/actionRegistry, autonomousScheduler,
gamificationService, availabilityRoutes, universal-schedule,
schedule-mobile-first, IsolatedScheduleToolbar, ScheduleGrid,
CalendarSyncDialog.

## Files Touched This Round

* `server/routes/availabilityRoutes.ts` — Zod enum aligned with service.
* `server/routes/shiftRoutes.ts` — deniedAt Date fix + clientNameMap nullable handling.
* `server/services/scheduling/trinityAutonomousScheduler.ts` — partial config contract + defaults.
* `client/src/pages/schedule-mobile-first.tsx` — tab a11y + sizing polish.
* `scripts/verify-schedule-integration.mjs` — +1 test (availability/exception).

## Reproduction (unchanged)

```bash
pg_ctlcluster 16 main start
node scripts/verify-schedule-integration.mjs   # 28/28 PASS
node scripts/fire-proof-email.mjs              # email pipeline trace
npx tsc --noEmit -p tsconfig.json              # 0 schedule-scope errors
npm run build                                  # production bundle
```
