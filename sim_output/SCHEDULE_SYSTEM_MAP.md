# Schedule Subsystem — Canonical System Map

This is the canonical wiring map for the schedule subsystem as it stands
on branch `claude/test-schedule-integration-0vxFL` (HEAD `b16d7b2`+). Use it
as the source of truth when concurrent Claude sessions touch any of the
files listed here so we don't fork the wiring again.

## 1. Frontend pages (8)

| Page                                          | Route                            | Lazy chunk                                  |
|-----------------------------------------------|----------------------------------|---------------------------------------------|
| `client/src/pages/universal-schedule.tsx`     | `/schedule`                      | `universal-schedule-*.js`                   |
| `client/src/pages/schedule-mobile-first.tsx`  | `/schedule-mobile`, fallback for `/schedule` on mobile | `schedule-mobile-first-*.js` |
| `client/src/pages/team-schedule.tsx`          | `/schedule/team`                 | `team-schedule-*.js`                        |
| `client/src/pages/shift-marketplace.tsx`      | `/shift-marketplace`             | `shift-marketplace-*.js`                    |
| `client/src/pages/shift-trading.tsx`          | `/shift-trading`                 | `shift-trading-*.js`                        |
| `client/src/pages/shift-approvals.tsx`        | `/shift-approvals`               | `shift-approvals-*.js`                      |
| `client/src/pages/shift-accept.tsx`           | `/shift-accept`                  | `shift-accept-*.js`                         |
| `client/src/pages/shift-offer-page.tsx`       | `/shifts/offers/:offerId`        | `shift-offer-page-*.js`                     |

## 2. Frontend components (16)

```
client/src/components/schedule/
  ScheduleGrid.tsx          — desktop week grid (canvas-style)
  ScheduleGridSkeleton.tsx  — loading state
  ScheduleFilters.tsx       — top-bar filters
  ScheduleLeftSidebar.tsx   — employee list / drag source
  ScheduleTemplates.tsx     — saved-week templates
  ScheduleUploadPanel.tsx   — CSV / iCal import
  ScheduleCreditPanel.tsx   — Trinity AI credit balance
  ScheduleDialogs.tsx       — confirm/delete/publish dialogs
  IsolatedScheduleToolbar.tsx — memoized top toolbar
  ShiftCreationModal.tsx    — create/edit shift form
  ShiftDetailSheet.tsx      — desktop side drawer
  ShiftBottomSheet.tsx      — mobile bottom sheet
  ShiftSwapDrawer.tsx       — swap-request UI
  EmployeeShiftCard.tsx     — shift card on the grid
  UnassignedShiftsPanel.tsx — open-shift queue
  CalendarSyncDialog.tsx    — Google Calendar / iCal export
  TrinitySchedulingProgress.tsx — Trinity orchestration progress
  TrinitySchedulingFeedback.tsx — accept/reject Trinity proposals

client/src/components/mobile/schedule/  (additional mobile shells)
client/src/components/ShiftOfferSheet.tsx  — shift-offer link landing page
```

## 3. Backend route mounts (`server/routes/domains/scheduling.ts`)

Every route is gated by `requireAuth → ensureWorkspaceAccess` at the mount
level (test-mode bypass via `x-test-key` valid in non-prod only).

| Prefix                                | Router file                          | Notes |
|---------------------------------------|--------------------------------------|-------|
| `/api/approvals`                      | `approvalRoutes`                     | shared with `/api/timesheet-edit-requests` |
| `/api/orchestrated-schedule`          | `orchestratedScheduleRoutes`         | AI orchestration (status, fill, trigger-session, executions) |
| `/api/coverage`                       | `coverageRoutes`                     | open-shift offers (accept, decline, status) |
| `/api/calendar`                       | `calendarRoutes`                     | iCal export, Google Calendar OAuth |
| `/api/scheduling`                     | `advancedSchedulingRouter` + `schedulingInlineRouter` | swap requests, recurring patterns, alerts; routers are paired with **zero path collision** |
| `/api/ai/scheduling`                  | `aiSchedulingRoutes`                 | suggestions, optimization-report |
| `/api/shifts`                         | `shiftRoutes` (router export `default`) | core CRUD + lifecycle (today, upcoming, pending, stats, accept, deny, pickup, send-reminder, …) |
| `/api/scheduleos`                     | `scheduleosRoutes`                   | AI toggle, smart-generate, proposals, trial start |
| `/api/trinity-staffing`               | `trinityStaffingRoutes`              | inbound-email staffing pipeline |
| `/api/public/trinity-staffing`        | `trinityStaffingPublicRouter`        | public webhook acceptors |
| `/api/trinity/scheduling`             | `trinitySchedulingRoutes`            | Trinity proposals, auto-fill |
| `/api/shift-handoff/pending`          | (inline)                             | pending shift handoff fetch |
| `/api/shift-chatrooms`                | `shiftChatroomRoutes`                | per-shift chat rooms |
| `/api/post-orders`                    | `postOrderRoutes`                    | post-order acks/sigs/photos |
| `/api/schedules`                      | `schedulesRoutes`                    | week stats, publish/unpublish, ai-insights, csv export, auto-fill preflight |
| `/api/staffing`                       | `staffingBroadcastRoutes`            | broadcast w/ public accept link |
| `/api/shift-trading`                  | `shiftTradingRoutes`                 | marketplace, availability, manager approve/reject |
| `/api/trinity/scheduling/auto-fill-internal` | (inline localhost-only)       | service-key gated stress-test entry |

## 4. Schema tables touched by the schedule subsystem

| Table                      | Origin                                              | Usage                                               |
|----------------------------|-----------------------------------------------------|-----------------------------------------------------|
| `shifts`                   | `shared/schema/domains/scheduling/index.ts`         | core grid                                           |
| `shift_swap_requests`      | same                                                | swap workflow (column is `requester_id`, not `requested_by_id`) |
| `recurring_shift_patterns` | same                                                | recurring schedules (Pro+ tier)                     |
| `shift_orders`             | same                                                | per-shift post-order acks                           |
| `published_schedules`      | same                                                | week publish/unpublish                              |
| `time_off_requests`        | `shared/schema/domains/time/index.ts`               | availability exceptions; **`request_type` enum is `vacation`/`sick`/`personal`/`unpaid`** |
| `idempotency_keys`         | platform                                            | shift reminder dedupe (8h window)                   |
| `notifications`            | platform                                            | per-employee reminder fan-out                       |

## 5. Server services

| Path                                                            | Purpose                                                  |
|-----------------------------------------------------------------|----------------------------------------------------------|
| `server/services/scheduling/trinityAutonomousScheduler.ts`      | end-to-end Trinity scheduling (mode, prioritizeBy, sessionId, triggeredBy) |
| `server/services/advancedSchedulingService.ts`                  | swap requests CRUD; manual `inArray()` hydration to avoid Postgres 100-arg limit |
| `server/services/shiftRemindersService.ts`                      | sendShiftReminder w/ DB idempotency; returns `'duplicate'` status (not null) on dupe |
| `server/services/aiSchedulingTriggerService.ts`                  | nudge orchestrator from external triggers                 |
| `server/services/scheduleLiveNotifier.ts`                       | broadcast schedule events via WebSocket                  |
| `server/services/scheduleMigration.ts`                           | one-time migration from old schedule format              |
| `server/services/scheduleRollbackService.ts`                    | rollback published schedule                              |
| `server/services/scheduleSmartAI.ts`                             | AI-recommended fills                                     |
| `server/services/shiftApprovalService.ts`                        | shift approval state machine                             |
| `server/services/shiftChatroomWorkflowService.ts`                | shift chat room lifecycle                                |
| `server/services/shiftEscalationService.ts`                      | escalate unfilled shifts                                 |

## 6. Cross-domain interactions

* **Email**: `shiftRoutes` → `shiftRemindersService` → `services/emailCore.sendCanSpamCompliantEmail` → Resend SDK (or `[DEV MODE]` noop).
* **Notifications**: `shiftRoutes` → `notificationService` → WebSocket broadcast + DB row.
* **Audit**: every state-changing action emits via `universalAuditService` (non-blocking).
* **Trinity orchestration**: `trinityOrchestrationGateway.middleware()` records every `/api/*` request; `[blocked]` log line is just a 4xx/5xx marker.
* **Tier guards**: `advancedSchedulingRouter.use(requireProfessional)`. `GRANDFATHERED_TENANT_ID=dev-acme-security-ws` exempts the dev workspace.

## 7. Verifier coverage (`scripts/verify-schedule-integration.mjs`)

28 endpoint tests, all real-data, all pass on `dev-acme-security-ws` against
the seeded acme workspace. Also see `scripts/fire-proof-email.mjs` for the
end-to-end email pipeline trace.

## 8. Sandbox bring-up (one-shot)

```bash
pg_ctlcluster 16 main start
sudo -u postgres createdb coaileague_sandbox || true
sudo -u postgres psql -c "CREATE USER coaisand PASSWORD 'sandbox123' SUPERUSER;" 2>/dev/null
sudo -u postgres psql -d coaileague_sandbox -c \
  'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'
DATABASE_URL=postgresql://coaisand:sandbox123@127.0.0.1:5432/coaileague_sandbox \
  npx drizzle-kit push --force
set -a; source .env; set +a
npm run dev &
node scripts/verify-schedule-integration.mjs   # 28/28 PASS
node scripts/fire-proof-email.mjs              # email pipeline trace
```

## 9. Coordination notes for concurrent Claude sessions

If you're working on this branch alongside another session that's touching:

* **`server/services/scheduling/trinityAutonomousScheduler.ts`** — be aware
  the public type is `PartialSchedulingConfig`. The internal `SchedulingConfig`
  is fully required and synthesized inside `executeAutonomousScheduling`.
* **`server/routes/advancedSchedulingRoutes.ts`** — both
  `POST /swap-requests` (collection) and `POST /shifts/:shiftId/swap-request`
  (nested) share `createSwapRequest()`. Don't re-introduce `requestedById`;
  schema column is `requester_id` / drizzle field `requesterId`.
* **`server/services/advancedSchedulingService.ts`** — `getSwapRequests`
  uses manual `inArray()` lookups, NOT drizzle's relational `with`. Reverting
  to `with: {...}` will re-trigger Postgres's 100-arg limit.
* **`server/middleware/rateLimiter.ts`** — `publicApiLimiter` and
  `mutationLimiter` skip on a valid `x-test-key`. The skip predicate
  `isCrawlerWithValidTestKey` refuses production via NODE_ENV check.
* **`server/routes/shiftRoutes.ts`** — duplicate-reminder mapping returns
  `200 { alreadySent: true }`. Don't revert to `404 Shift not found`.
* **`server/routes/calendarRoutes.ts`** — Google Calendar OAuth is wired
  through local helpers that delegate to `services/oauth/googleCalendar`.
  Don't re-introduce the bare `isGoogleCalendarConfigured` / `getGoogleOAuthUrl`
  identifiers without imports.
* **`server/services/ai-brain/trinityDocumentActions.ts`** — the four
  generator-backed business document actions (proof of employment, direct
  deposit, payroll run summary, W-3) were REMOVED because their generators
  don't exist. Re-introducing the registrations without implementing the
  generators in `services/documents/` will crash at runtime.

## 10. Current TS state (snapshot)

| Slice                            | Errors |
|----------------------------------|-------:|
| Schedule scope                   | 0      |
| Files I touched in rounds 1–4    | 0      |
| Total codebase                   | 225    |

The remaining 225 are out-of-scope for the schedule audit and are being
addressed by the `origin/development` Phase 1–12 TypeScript debt purge.
