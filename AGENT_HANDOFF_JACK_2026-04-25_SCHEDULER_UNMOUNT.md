# Jack/GPT Handoff — Scheduler Router Unmount

Branch: `development`
Date: 2026-04-25

## New Runtime Commit

`c223e699ec6e4e0ec83a9952f99c03041e9448f2` — `refactor: unmount dead scheduler router`

## Files Changed

`server/routes/domains/scheduling.ts`

## What Changed

Removed the orphan `/api/scheduler` mount:

```ts
app.use("/api/scheduler", requireAuth, ensureWorkspaceAccess, schedulerRouter);
```

Also removed the unused import:

```ts
import schedulerRouter from "../schedulerRoutes";
```

Updated the canonical-prefix comment to remove `/api/scheduler`.

## Why This Was Safe

Jack audited visible `/api/scheduler/*` route families and found no active caller evidence outside `schedulerRoutes.ts` itself and old generated route inventory/docs.

Exact caller searches only pointed back to `server/routes/schedulerRoutes.ts` for:

- `/api/scheduler/profiles`
- `/api/scheduler/events`
- `/api/scheduler/snapshots`
- `/api/scheduler/weight-profiles`
- `/api/scheduler/ai-decisions`
- `/api/scheduler/acceptances`
- `/api/scheduler/notifications`
- `/api/scheduler/analytics`
- `/api/scheduler/schedules`
- `/api/scheduler/dev/simulate-clockins`

Broad `schedulerRoutes` search showed only:

- the route file itself
- route inventory files
- docs/audit artifacts
- the mount in `domains/scheduling.ts`

No frontend caller surfaced through the connector search.

## Why Jack Did Not Delete `schedulerRoutes.ts`

Jack can delete the file through the connector only if the blob SHA is cleanly available, but the safest sequence is:

1. Unmount first.
2. Let Claude run local build/type-check.
3. Confirm no compile/runtime import dependency remains.
4. Delete `server/routes/schedulerRoutes.ts` locally.

This avoids accidentally deleting a file still imported by a non-obvious path.

## Build Verification Required

Claude should run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Recommended Claude Follow-Up Runtime Commit

If build passes and local `rg` confirms no imports:

```bash
rg "schedulerRoutes|/api/scheduler|schedulerRouter" client server shared
```

Then delete:

```text
server/routes/schedulerRoutes.ts
```

Suggested commit message:

```text
refactor: delete orphan schedulerRoutes file
```

Commit body should include:

- `schedulerRoutes.ts` line count removed, expected about 886 lines
- caller audit result
- build result
- next scheduling target

## Notes For Local Verification

`/api/scheduler/dev/simulate-clockins` is dev-only but should still not remain mounted if the whole router has no callers. If local tests or dev scripts reference it, either migrate that behavior to an explicit dev route or document it before deleting.

Do not recreate `/api/scheduler` aliases unless a current frontend caller is found. The Scheduling domain already has active prefixes:

- `/api/shifts`
- `/api/scheduleos`
- `/api/schedules`
- `/api/scheduling`
- `/api/trinity/scheduling`
- `/api/orchestrated-schedule`

## Next Suggested Target After Claude Verifies

After `schedulerRoutes.ts` is deleted, move to:

1. `schedulesRoutes.ts` — 557L, mount `/api/schedules`
2. then `advancedSchedulingRoutes.ts` — 1,219L, mount `/api/scheduling`

Stay in Scheduling until these route surfaces have one clear ownership map.

## AGENT_HANDOFF.md Sync Note

Jack did not update `AGENT_HANDOFF.md` because long-file connector output is unsafe for whole-file replacement. Claude should update the top sync block locally after build-verifying and/or deleting `schedulerRoutes.ts`.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest development.
2. Build/type-check the unmount.
3. Run local `rg` for any remaining scheduler router references.
4. Delete `schedulerRoutes.ts` if clean.
5. Update `AGENT_HANDOFF.md` sync block.
6. Push.
