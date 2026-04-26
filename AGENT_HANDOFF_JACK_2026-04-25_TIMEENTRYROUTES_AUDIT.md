# Jack/GPT Handoff — timeEntryRoutes Audit

Branch: `development`
Date: 2026-04-25

## New Commit

This file: `docs: add Jack timeEntryRoutes audit`

## Context

Claude's latest commit:

`f90b14b494a3fdb4fee663af6ab0afa252cdf144` — `refactor: scheduling DONE + time-entry-routes.ts -1,493L — TIME domain started`

Claude verified Jack's autonomous scheduling cleanup, completed Scheduling, and started TIME:

- Scheduling removed about 3,757 lines total
- `time-entry-routes.ts`: `2,708 -> 1,215` lines, -1,493L
- build clean

Claude assigned Jack:

- target: `server/routes/timeEntryRoutes.ts`
- mount: `/api/time-entries`

Important distinction from Claude:

- `time-entry-routes.ts` = clock/status/active IoT/officer operations
- `timeEntryRoutes.ts` = management CRUD/approval layer
- both mount under `/api/time-entries`, but they are different systems and should not be treated as simple duplicates

## File Read

`server/routes/timeEntryRoutes.ts`

Connector-visible route families include:

- `GET /api/time-entries/export/csv`
- `GET /api/time-entries/`
- `POST /api/time-entries/`
- `PATCH /api/time-entries/:id/approve`
- `PATCH /api/time-entries/:id/reject`
- `GET /api/time-entries/pending`
- `POST /api/time-entries/bulk-approve`
- `GET /api/time-entries/post-order-quiz/:shiftId`
- `POST /api/time-entries/post-order-quiz/:shiftId/submit`
- `POST /api/time-entries/gps-ping`
- `POST /api/time-entries/manual-override`
- `PATCH /api/time-entries/:id/clock-out`
- likely more routes after connector truncation

## Important Limitation

`timeEntryRoutes.ts` is still too long/truncated for safe whole-file replacement through Jack's GitHub connector. Jack did not patch it directly because unseen handlers after truncation could be erased.

Claude should patch locally with `rg`, run build/type-check, and update `AGENT_HANDOFF.md`.

## Caller Audit Results

### Confirmed active — keep

#### `GET /api/time-entries/pending`

Active caller found:

- `client/src/pages/pending-time-entries.tsx`

#### `POST /api/time-entries/bulk-approve`

Active caller found:

- `client/src/pages/pending-time-entries.tsx`

#### `PATCH /api/time-entries/:id/approve`

Active caller found:

- `client/src/pages/pending-time-entries.tsx`

#### `PATCH /api/time-entries/:id/reject`

Active caller found:

- `client/src/pages/pending-time-entries.tsx`

#### `PATCH /api/time-entries/:id/clock-out`

Active callers found in connector search:

- `client/src/pages/worker-dashboard.tsx`
- `client/src/pages/time-tracking.tsx`
- `client/src/components/UniversalFAB.tsx`
- `client/src/components/mobile/MobileQuickActionsFAB.tsx`
- `client/public/sw.js`
- `tests/e2e/clock-in-flow.test.ts`

Keep. This is still live for field clock-out.

### Possibly active / verify before deletion

#### `GET /api/time-entries/export/csv`

Initial exact search surfaced only:

- `client/src/config/apiEndpoints.ts`

A follow-up exact search for usage did **not** find active component/page callers.

Recommendation:

- Local `rg` should verify whether any caller uses `API_ENDPOINTS.timeEntries.exportCsv` dynamically.
- If no callers, delete backend route and remove endpoint config constant.

### Strong delete candidates — no active callers found through connector search

These showed no active caller evidence:

#### Post-order quiz

- `GET /api/time-entries/post-order-quiz/:shiftId`
- `POST /api/time-entries/post-order-quiz/:shiftId/submit`

Searches:

```text
"/api/time-entries/post-order-quiz" OR "post-order-quiz" OR "postOrderQuiz"
```

No results.

#### GPS ping

- `POST /api/time-entries/gps-ping`

Searches:

```text
"/api/time-entries/gps-ping" OR "gps-ping" OR "lastGpsPing"
```

No results.

#### Manual override

- `POST /api/time-entries/manual-override`

Searches:

```text
"/api/time-entries/manual-override" OR "manual_clockin_overrides" OR "manual override" "time-entries"
```

No results.

These look like field-officer/mobile leftovers now displaced by canonical `time-entry-routes.ts` active clock/status paths and other field operations services.

## Stale Client Endpoint Constants

`client/src/config/apiEndpoints.ts` still lists several time-entry constants that did not show usage through connector search:

- `calculateHours: "/api/time-entries/calculate-hours"`
- `exportCsv: "/api/time-entries/export/csv"`
- `startBreak: "/api/time-entries/:id/start-break"`
- `endBreak: "/api/time-entries/:id/end-break"`
- `approveEdit: "/api/time-entries/timesheet-edits/:id/review"`

Search:

```text
"timeEntries.exportCsv" OR "timeEntries.startBreak" OR "timeEntries.endBreak" OR "timeEntries.calculateHours" OR "timeEntries.approveEdit"
```

No active callers found.

Recommendation:

- After server cleanup, prune stale constants from `apiEndpoints.ts` if local `rg` confirms no dynamic usage.

Do not remove `list`, `create`, `get`, `update`, `delete`, `clockIn`, `clockOut`, `pendingApprovals`, `approve`, `reject`, or `bulkApprove` yet.

## Local Commands For Claude

### 1. Route inventory

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/timeEntryRoutes.ts
```

### 2. Exact caller audit

```bash
rg "/api/time-entries/export/csv|time-entries/export/csv|timeEntries\.exportCsv" client server shared
rg "/api/time-entries/pending|time-entries/pending" client server shared
rg "/api/time-entries/bulk-approve|time-entries/bulk-approve" client server shared
rg "/api/time-entries/.*/approve|timeEntries\.approve" client server shared
rg "/api/time-entries/.*/reject|timeEntries\.reject" client server shared
rg "/api/time-entries/post-order-quiz|post-order-quiz|postOrderQuiz" client server shared
rg "/api/time-entries/gps-ping|gps-ping|lastGpsPing" client server shared
rg "/api/time-entries/manual-override|manual_clockin_overrides|manual override" client server shared
rg "/api/time-entries/.*/clock-out|timeEntries\.clockOut|time-entries/.*clock-out" client server shared
```

### 3. Stale endpoint constants audit

```bash
rg "timeEntries\.(calculateHours|exportCsv|startBreak|endBreak|approveEdit)" client server shared
rg "calculate-hours|start-break|end-break|timesheet-edits/.*/review" client server shared
```

## Recommended Runtime Delete Pass

If local `rg` confirms Jack's caller audit:

1. Delete post-order quiz routes:
   - `GET /post-order-quiz/:shiftId`
   - `POST /post-order-quiz/:shiftId/submit`
2. Delete GPS ping route:
   - `POST /gps-ping`
3. Delete manual override route:
   - `POST /manual-override`
4. Delete export CSV route only if no active caller:
   - `GET /export/csv`
5. Remove stale endpoint constants from `client/src/config/apiEndpoints.ts` if no dynamic usage:
   - `calculateHours`
   - `exportCsv`
   - `startBreak`
   - `endBreak`
   - `approveEdit`

## Imports Likely To Become Unused

After deletion, these may become unused:

- `createFilterContext`
- `canViewPayRates`
- `stagedShifts`
- `sites`
- `typedPoolExec`
- `lt`
- maybe `clients` if only pending route uses it (likely still used)
- dynamic imports to `postOrderQuizService`
- dynamic imports to `presenceMonitorService`

Do not remove blindly. Let `tsc` confirm.

## Required Verification

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Suggested Claude Commit Message

```text
refactor: delete dead time entry management routes
```

Commit body should include:

- exact routes deleted
- exact active routes preserved
- `timeEntryRoutes.ts` before/after line count
- whether `apiEndpoints.ts` stale constants were pruned
- build result

## Next Target After Claude

After `timeEntryRoutes.ts` cleanup:

- `server/routes/timeOffRoutes.ts` (~708L)

Then continue TIME domain cleanup.

## AGENT_HANDOFF.md Sync Note

Jack did not update `AGENT_HANDOFF.md` directly because long-file connector output is unsafe for whole-file replacement. Claude should update the top sync block locally after runtime cleanup.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest development.
2. Run local route inventory + caller audit.
3. Delete confirmed dead time-entry management routes.
4. Prune stale endpoint constants if clean.
5. Build/type-check.
6. Update `AGENT_HANDOFF.md`.
7. Push.
