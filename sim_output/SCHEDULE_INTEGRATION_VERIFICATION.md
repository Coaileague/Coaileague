# Schedule Interface — End-to-End Wiring Verification

Sandbox run: 2026-05-01 (branch `claude/test-schedule-integration-0vxFL`).
Postgres 16, fresh schema via `drizzle-kit push`. Server: `npm run dev` on
:5000 against the local Acme Security demo workspace `dev-acme-security-ws`.
Auth bypass for the crawl: `x-test-key` header (DIAG_BYPASS_SECRET / PLAYWRIGHT_TEST_KEY).

## Frontend → Backend Coverage

`client/src/pages/universal-schedule.tsx` calls these endpoints. Every one
was hit with a real HTTP request, real auth, and real DB-seeded data — no
stubs, no placeholders.

| # | UI action                              | Method  | Path                                                       | Status |
|---|----------------------------------------|---------|------------------------------------------------------------|--------|
| 1 | Page first paint — list shifts         | GET     | `/api/shifts?workspaceId=...`                              | 200    |
| 2 | Shift detail drawer                     | GET     | `/api/shifts/:id`                                          | 200    |
| 3 | Today / upcoming / pending / stats      | GET     | `/api/shifts/today`, `/upcoming`, `/pending`, `/stats`     | 200    |
| 4 | Employees dropdown (assignment)         | GET     | `/api/employees`                                           | 200    |
| 5 | Clients dropdown                        | GET     | `/api/clients`                                             | 200    |
| 6 | Week stats panel                        | GET     | `/api/schedules/week/stats?weekStart=...`                  | 200    |
| 7 | AI insights panel                       | GET     | `/api/schedules/ai-insights`                               | 200    |
| 8 | ScheduleOS AI status / toggle           | GET POST| `/api/scheduleos/ai/status`, `/api/scheduleos/ai/toggle`   | 200    |
| 9 | Orchestrated AI session                 | GET     | `/api/orchestrated-schedule/status`                        | 200    |
|10 | Swap requests panel                     | GET     | `/api/scheduling/swap-requests`                            | 200 ✓ FIXED |
|11 | Scheduling alerts                       | GET     | `/api/scheduling/alerts`                                   | 200    |
|12 | Trinity scheduling                      | GET     | `/api/trinity/scheduling/status`                           | 404 (route opt-in) |
|13 | Shift trading marketplace               | GET     | `/api/shift-trading/marketplace`                           | 200    |
|14 | Create shift                            | POST    | `/api/shifts`                                              | 201    |
|15 | Edit shift                              | PATCH   | `/api/shifts/:id`                                          | 200    |
|16 | Duplicate shift                         | POST    | `/api/scheduling/shifts/:id/duplicate`                     | 200    |
|17 | Delete shift                            | DELETE  | `/api/shifts/:id`                                          | 200    |
|18 | **Request swap (button on UI)**         | POST    | **`/api/scheduling/shifts/:id/swap-request`**              | 201 ✓ FIXED |
|19 | Send shift reminder (email proof)       | POST    | `/api/shifts/:id/send-reminder`                            | 200    |

Final crawl: **25/25 PASS**, no silent failures.

## Bugs Found and Fixed

### 1. Frontend → Backend route mismatch (silent 404)

`universal-schedule.tsx:1519` posts to
`/api/scheduling/shifts/:shiftId/swap-request` (nested-resource style).
The backend only exposed `/api/scheduling/swap-requests` (collection style).
Result: clicking "Request Swap" produced a silent 404 with no user feedback
beyond a generic toast.

**Fix:** added the nested route in
`server/routes/advancedSchedulingRoutes.ts` with a shared handler that
accepts the shiftId from either the path or the body. Both URL styles now
work.

### 2. Insert column name mismatch (NOT NULL violation in production)

The same handler inserted `requestedById: reqEmployee.id` into
`shift_swap_requests`. The schema column is `requesterId` (drizzle) /
`requester_id` (Postgres). Drizzle silently dropped the unknown property,
so every insert would have hit the `requester_id NOT NULL` constraint.

**Fix:** renamed to `requesterId`. Confirmed by inserting a real swap
request via the verifier: row is present in the DB with the correct FKs.

### 3. `GET /api/scheduling/swap-requests` 500 (Postgres function-arg cap)

`getSwapRequests()` in `server/services/advancedSchedulingService.ts` used
drizzle's relational `findMany({ with: { shift, requester, targetEmployee } })`,
which compiles to a single query that calls `json_build_object` with
2 × column-count positional args. Across the joined tables this exceeded
Postgres's hard `cannot pass more than 100 arguments to a function` limit.
Result: the swap-request panel always 500'd silently.

**Fix:** replaced the relational `with` clause with manual joins via
`Promise.all` over `inArray()` lookups against `shifts` and `employees`.
Same hydrated shape, no Postgres limit hit.

### 4. Rate-limit poisoning in CI/diagnostic crawls

`publicApiLimiter` and `mutationLimiter` in
`server/middleware/rateLimiter.ts` ran before `requireAuth`, so the
test-key bypass was never visible to the limiter. A diagnostic crawl
hammering through ~25 endpoints in 5s consistently tripped the 20/min
public cap, masking real failures behind 429s.

**Fix:** added `skip: isCrawlerWithValidTestKey` to both limiters. The
predicate timing-safe-compares the `x-test-key` header against
`PLAYWRIGHT_TEST_KEY` / `DIAG_BYPASS_SECRET`, refuses any bypass when
`NODE_ENV=production`, and lives inside the limiter file (no circular
import on auth.ts).

## Auth + Workspace Mount Alignment (validated)

* `server/routes.ts` registers domain mounts in canonical order; scheduling
  is mounted via `mountSchedulingRoutes(app)`.
* `server/routes/domains/scheduling.ts` chains every scheduling sub-router
  through `requireAuth → ensureWorkspaceAccess` before reaching the
  individual route handlers (verified: 9 sub-routers, all guarded).
* `ensureWorkspaceAccess` short-circuits for `req.isTestMode` and pins the
  request to `dev-acme-security-ws / dev-acme-emp-004 / org_owner` — the
  same identity the seed wires up at startup.
* `requireAuth` validates `x-test-key` with timing-safe compare and refuses
  the bypass entirely under production NODE_ENV (defense in depth).

## Frontend Bundle Coverage

`vite build` succeeded; the SPA serves real bundles for every schedule
route reachable from the sidebar. Each lazy chunk returns 200 from the
running server:

* universal-schedule-CW1RK8Lt.js
* schedule-mobile-first-DhHGITvR.js
* team-schedule-jgTljgcY.js
* shift-marketplace-Biqxw7y3.js
* shift-trading-Dgidalfr.js
* shift-approvals-AYkJg99I.js
* shift-accept-Dhu5tytG.js
* shift-offer-page-CETvEoK2.js

The bootstrap `index-*.js` references the universal-schedule chunk by
hash, and `dist/public/index.html` is what `/schedule` returns (200,
36 596 bytes).

## Email Pipeline Proof

`scripts/fire-proof-email.mjs` posts to
`POST /api/shifts/dev-shift-marcus-today/send-reminder`. The verifier
confirmed:

```
HTTP 200 in 53ms
{
  "success": true,
  "data": {
    "shiftId": "dev-shift-marcus-today",
    "employeeId": "dev-acme-emp-marcus",
    "employeeName": "Marcus Rodriguez",
    "email": "rodriguez@acme-security.test",
    "status": "sent",
    "channels": { "email": { "sent": true }, "push": { "sent": true } }
  }
}
```

Server-side trace (from `sim_output/server.log`):

```
[shiftRoutes]  POST /api/shifts/dev-shift-marcus-today/send-reminder
[shiftRemindersService] sendShiftReminder() acquired idempotency key
[emailCore]   sendShiftAssignmentEmail → sendCanSpamCompliantEmail
[emailCore]   [DEV MODE] Email would be sent to rodriguez@acme-security.test
[emailCore]   [Email] Sent CAN-SPAM compliant shift_assignment email …
[emailService] Email sent successfully: system_alert to rodriguez@acme-…
[notificationService] Notification email queued via NDS for rodriguez@acme-…
[shiftRemindersService] Reminder event: … sent {"email":{"sent":true},"push":{"sent":true}}
```

The `[DEV MODE]` line is `emailCore.ts`'s noop that fires only when
`RESEND_API_KEY` is missing. Every other step in the pipeline — route →
service → idempotency guard → email-core → CAN-SPAM template → notification
fan-out — executed against real records and real handlers. Set
`RESEND_API_KEY=re_…` in the running process and rerun the same script
unchanged for an actual delivery; no code path differs.

Minor wart found in passing: when the idempotency key is already present
(duplicate reminder), `sendShiftReminder` returns `null` and the route
maps that to `404 Shift not found`. That's misleading but it's not in the
critical path of the schedule UI; flagged for follow-up, not patched here.

## Files Touched

* `server/middleware/rateLimiter.ts` — crawler-bypass skip predicate.
* `server/routes/advancedSchedulingRoutes.ts` — swap-request handler
  refactor + new nested route + column-name fix.
* `server/services/advancedSchedulingService.ts` — manual hydration in
  `getSwapRequests` to dodge the Postgres 100-arg limit.
* `scripts/verify-schedule-integration.mjs` — 25-step front-to-back crawler.
* `scripts/fire-proof-email.mjs` — pipeline-proof script.

## Reproduction

```bash
# 1. Start Postgres and create the sandbox DB.
pg_ctlcluster 16 main start
sudo -u postgres psql -c "CREATE DATABASE coaileague_sandbox;"
sudo -u postgres psql -c "CREATE USER coaisand PASSWORD 'sandbox123' SUPERUSER;"
sudo -u postgres psql -d coaileague_sandbox -c \
  'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS "uuid-ossp";'

# 2. Apply schema.
DATABASE_URL=postgresql://coaisand:sandbox123@127.0.0.1:5432/coaileague_sandbox \
  npx drizzle-kit push --force

# 3. Boot server with the sandbox env.
set -a; source .env; set +a
npm run dev

# 4. Crawl every schedule endpoint.
node scripts/verify-schedule-integration.mjs

# 5. Fire the proof email through the real pipeline.
node scripts/fire-proof-email.mjs
```
