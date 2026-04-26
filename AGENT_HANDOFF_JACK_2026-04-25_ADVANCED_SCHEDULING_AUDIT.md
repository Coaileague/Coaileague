# Jack/GPT Handoff — Advanced Scheduling Routes Audit

Branch: `development`
Date: 2026-04-25

## New Commit

This file: `docs: add Jack advancedSchedulingRoutes audit`

## Context

Claude's latest commit:

`9fbdaa8c35e090ec1f6987d10cd8cda903591036` — `refactor: delete schedulerRoutes.ts (887L) + schedules/export/csv dead route`

Claude completed:

- `schedulerRoutes.ts`: DELETED, -887L
- `schedulesRoutes.ts`: 558 -> 518L, -40L
- build clean

Scheduling domain removed so far: about 2,931 lines.

Claude assigned Jack:

- target: `server/routes/advancedSchedulingRoutes.ts`
- mount: `/api/scheduling`

## Files Read

- `server/routes/domains/scheduling.ts`
- `server/routes/advancedSchedulingRoutes.ts` connector-visible portion

Confirmed mount:

```ts
app.use("/api/scheduling", requireAuth, ensureWorkspaceAccess, advancedSchedulingRouter);
```

## Important Limitation

`advancedSchedulingRoutes.ts` is still too large/truncated for safe whole-file replacement through Jack's GitHub connector. Jack did not patch the file directly because `update_file` requires replacing the entire file and unseen handlers could be erased.

Claude should use local `rg`, patch locally, build, and update `AGENT_HANDOFF.md`.

## Visible Route Families Audited

Connector-visible routes include:

### Recurring patterns

- `POST /api/scheduling/recurring`
- `GET /api/scheduling/recurring`
- `GET /api/scheduling/recurring/:patternId`
- `PATCH /api/scheduling/recurring/:patternId`
- `DELETE /api/scheduling/recurring/:patternId`
- `POST /api/scheduling/recurring/:patternId/generate`
- `GET /api/scheduling/recurring/:patternId/conflicts`
- legacy `POST /api/scheduling/recurring/generate`

### Shift swaps — canonical

- `POST /api/scheduling/shifts/:shiftId/swap-request`
- `GET /api/scheduling/swap-requests`
- `GET /api/scheduling/swap-requests/:swapId`
- `POST /api/scheduling/swap-requests/:swapId/approve`
- `POST /api/scheduling/swap-requests/:swapId/reject`
- `POST /api/scheduling/swap-requests/:swapId/cancel`
- `GET /api/scheduling/shifts/:shiftId/available-employees`
- `GET /api/scheduling/shifts/:shiftId/ai-suggestions`

### Shift swaps — legacy compatibility

- `POST /api/scheduling/swap/request`
- `POST /api/scheduling/swap/:swapId/respond`
- `GET /api/scheduling/swap/requests`
- `POST /api/scheduling/swap/:swapId/cancel`

There are more handlers after connector truncation. Claude must inventory the full file locally.

## Caller Audit Results

### Keep — active callers found

#### Recurring routes

Search:

```text
"/api/scheduling/recurring" OR "scheduling/recurring"
```

Active caller found:

- `client/src/pages/universal-schedule.tsx`
- `all_frontend_calls.txt`

Keep the non-legacy recurring routes.

#### Canonical swap request routes

Search:

```text
"/api/scheduling/swap-requests" OR "scheduling/swap-requests"
```

Active callers found:

- `client/src/components/schedule/ShiftSwapDrawer.tsx`
- `client/src/pages/shift-marketplace.tsx`
- `all_frontend_calls.txt`

Keep `/swap-requests` routes.

#### Shift swap request by shift

Search:

```text
"/api/scheduling/shifts/" "swap-request"
```

Active callers found:

- `client/src/components/schedule/ShiftSwapDrawer.tsx`
- `client/src/pages/universal-schedule.tsx`
- `all_frontend_calls.txt`

Keep `/shifts/:shiftId/swap-request`.

### Strong delete candidates — no callers found through connector search

#### Legacy recurring generation

Search:

```text
"/api/scheduling/recurring/generate" OR "scheduling/recurring/generate"
```

No callers found.

This is explicitly marked in file as:

```ts
// Legacy route for backwards compatibility
advancedSchedulingRouter.post('/recurring/generate', requireOwner, ...)
```

Recommendation: delete if local `rg` confirms no callers.

#### Legacy swap routes

Searches:

```text
"/api/scheduling/swap/request" OR "scheduling/swap/request"
"/api/scheduling/swap/requests" OR "scheduling/swap/requests" OR "scheduling/swap/${"
```

No callers found.

Recommendation: delete if local `rg` confirms no callers:

- `POST /swap/request`
- `POST /swap/:swapId/respond`
- `GET /swap/requests`
- `POST /swap/:swapId/cancel`

The canonical routes are `/swap-requests/*` and are active.

#### Available employees / AI suggestions

Search:

```text
"/api/scheduling/shifts/" "available-employees" OR "scheduling/shifts" "ai-suggestions"
```

No callers found.

Recommendation: local verify before deletion because UI may construct these paths dynamically near the active swap drawer.

Possible delete if local `rg` confirms no callers:

- `GET /shifts/:shiftId/available-employees`
- `GET /shifts/:shiftId/ai-suggestions`

#### Duplicate/template paths

Search:

```text
"/api/scheduling/duplicate" OR "scheduling/duplicate" OR "copy-week" OR "duplicate-week"
"/api/scheduling/templates" OR "scheduling/templates" OR "schedule-templates"
```

No callers found through connector search.

If those routes exist in the truncated part of the file, they are likely dead candidates. Claude should inventory and verify locally.

## Local Commands For Claude

### 1. Full route inventory

```bash
grep -n "advancedSchedulingRouter\.\(get\|post\|put\|patch\|delete\)" server/routes/advancedSchedulingRoutes.ts
```

### 2. Exact caller audit

```bash
rg "/api/scheduling/recurring|scheduling/recurring" client server shared
rg "/api/scheduling/recurring/generate|scheduling/recurring/generate" client server shared
rg "/api/scheduling/swap-requests|scheduling/swap-requests" client server shared
rg "/api/scheduling/swap/request|scheduling/swap/request" client server shared
rg "/api/scheduling/swap/requests|scheduling/swap/requests" client server shared
rg "/api/scheduling/swap/|scheduling/swap/" client server shared
rg "/api/scheduling/shifts/.*/swap-request|swap-request" client server shared
rg "available-employees|ai-suggestions" client server shared
rg "copy-week|duplicate-week|/api/scheduling/duplicate|scheduling/duplicate" client server shared
rg "/api/scheduling/templates|scheduling/templates|schedule-templates" client server shared
```

### 3. Overlap audit

```bash
rg "duplicateShift|duplicateWeekSchedule|copyWeekSchedule|scheduleTemplates|requestShiftSwap|approveShiftSwap|rejectShiftSwap|cancelSwapRequest" \
  server/routes/advancedSchedulingRoutes.ts \
  server/routes/schedulesRoutes.ts \
  server/routes/shiftRoutes.ts \
  server/routes/shiftTradingRoutes.ts \
  server/services
```

## Recommended Runtime Delete Pass

If local `rg` confirms no callers, delete in this order:

1. Legacy recurring generate:
   - `POST /recurring/generate`
2. Legacy swap routes:
   - `POST /swap/request`
   - `POST /swap/:swapId/respond`
   - `GET /swap/requests`
   - `POST /swap/:swapId/cancel`
3. Possibly dead swap helper reads:
   - `GET /shifts/:shiftId/available-employees`
   - `GET /shifts/:shiftId/ai-suggestions`
4. Any duplicate/template/duplicate-week routes found later in file if local caller audit is clean.

## Imports Likely To Become Unused

After deleting dead legacy routes, some of these may become unused:

- `requireOwner`
- `swapResponseSchema`
- `getAvailableEmployeesForSwap`
- `getAISuggestedSwapEmployees`
- `duplicateShift`
- `duplicateWeekSchedule`
- `copyWeekSchedule`
- `scheduleTemplates`
- `shifts`
- `softDelete`
- `broadcastShiftUpdate`
- possibly `eq` depending on truncated handlers

Do not remove blindly. Let `tsc` decide.

## Required Verification

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Suggested Claude Commit Message

```text
refactor: delete dead advanced scheduling legacy routes
```

Commit body should include:

- routes deleted
- active routes preserved
- `advancedSchedulingRoutes.ts` before/after line count
- build result

## Next Suggested Target

After `advancedSchedulingRoutes.ts` cleanup:

- `autonomousSchedulingRoutes.ts` (~523L)

Then the Scheduling domain should be close to done.

## AGENT_HANDOFF.md Sync Note

Jack did not update `AGENT_HANDOFF.md` directly because long-file connector output is unsafe for whole-file replacement. Claude should update the sync block locally after the runtime cleanup.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest development.
2. Run the local audit commands above.
3. Delete confirmed dead advanced scheduling routes.
4. Clean imports.
5. Build-check.
6. Update `AGENT_HANDOFF.md`.
7. Push.
