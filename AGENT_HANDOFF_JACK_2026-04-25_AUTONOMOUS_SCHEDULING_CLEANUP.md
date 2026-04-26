# Jack/GPT Handoff — Autonomous Scheduling Cleanup

Branch: `development`
Date: 2026-04-25

## New Runtime Commit

`7e10a29960e33c8671c47b4ed4e2c1cfed813199` — `refactor: delete dead autonomous scheduling routes`

## File Changed

`server/routes/autonomousSchedulingRoutes.ts`

## What Changed

Reduced the file to the only active caller-backed endpoint:

- kept `POST /api/trinity/import-schedule`

Deleted dead/no-caller route groups:

- `POST /api/trinity/autonomous-schedule`
- `GET /api/trinity/autonomous-schedule/status/:sessionId`
- `GET /api/trinity/templates`
- `POST /api/trinity/templates/from-week`
- `POST /api/trinity/templates/:templateId/apply`
- `DELETE /api/trinity/templates/:templateId`
- `GET /api/trinity/daemon/status`
- `POST /api/trinity/daemon/start`
- `POST /api/trinity/daemon/stop`
- `POST /api/trinity/daemon/trigger`

Removed unused imports:

- `z`
- `trinityAutonomousScheduler`
- `recurringScheduleTemplates`
- `autonomousSchedulingDaemon`
- `requireManager`
- unused `Request` type

## Caller Audit Evidence

### Kept route — active

`POST /api/trinity/import-schedule`

Caller found:

- `client/src/components/schedule/ScheduleUploadPanel.tsx`

### Deleted routes — no active caller found

Searches found only `server/routes/autonomousSchedulingRoutes.ts` for:

- `/api/trinity/autonomous-schedule`
- `/api/trinity/templates`
- `/api/trinity/templates/from-week`
- `/api/trinity/templates/:templateId/apply`
- `/api/trinity/daemon/*`

No active frontend caller surfaced.

## Why This Was Safe

The active schedule-import route is used by the frontend upload panel and still calls:

- `historicalScheduleImporter.importFromCSV()`
- `platformEventBus.publish('prior_schedules_imported')`
- `platformEventBus.publish('schedule_analysis_requested')`

The removed routes overlap with newer/canonical scheduling paths:

- Trinity scheduling orchestration
- ScheduleOS proposal/workflow routes
- advanced recurring/swap routes
- internal auto-fill endpoint in scheduling domain mount

Leaving those old endpoints mounted would keep multiple ways to trigger or manage autonomous scheduling.

## Expected Line Reduction

Approximate reduction:

- before: about 523 lines
- after: about 125 lines
- removed: about 398 lines

Claude should verify exact line count locally.

## Build Verification Required

Claude should run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Specific Verification Notes

Please verify:

- `ScheduleUploadPanel.tsx` still uploads to `/api/trinity/import-schedule` successfully.
- `registerAutonomousSchedulingRoutes(app)` still mounts cleanly from `domains/scheduling.ts`.
- no remaining imports of `trinityAutonomousScheduler`, `recurringScheduleTemplates`, or `autonomousSchedulingDaemon` in this route file.
- no dashboard/admin page expects `/api/trinity/daemon/*`.

Local caller check:

```bash
rg "/api/trinity/autonomous-schedule|trinity/autonomous-schedule|/api/trinity/templates|trinity/templates|/api/trinity/daemon|trinity/daemon" client server shared
rg "/api/trinity/import-schedule|trinity/import-schedule" client server shared
```

## Scheduling Domain Status

Scheduling reductions before this commit:

- `shiftRoutes.ts`: -1,383L
- `scheduleosRoutes.ts`: -621L
- `schedulerRoutes.ts`: -887L
- `schedulesRoutes.ts`: -40L
- `advancedSchedulingRoutes.ts`: -421L

This commit should add about -398L.

Scheduling total removed after Claude verification should be about **3,750 lines**.

## Next Suggested Domain

If Claude verifies this build-clean, Scheduling can be considered materially complete for this pass.

Next domain from sync block:

- TIME
- likely files:
  - `server/routes/time-entry-routes.ts` (~2,707L)
  - `server/routes/timeEntryRoutes.ts` (~924L)

Known issue from sync block: about 60% overlap.

## AGENT_HANDOFF.md Sync Note

Jack did not update `AGENT_HANDOFF.md` directly because long-file connector output is unsafe for whole-file replacement. Claude should update the top sync block locally after build-verifying this runtime cleanup.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest development.
2. Build/type-check.
3. Verify import/upload route still compiles.
4. Update `AGENT_HANDOFF.md` sync block.
5. Push.
