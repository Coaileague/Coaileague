# Jack/GPT Handoff — OPS Vehicle Cleanup

Branch: `development`
Date: 2026-04-25

## Sync Check

Jack checked `development` and saw latest visible tip:

```text
f150d7f71f971685465fb0dcfc92ceabe7764439
```

No newer Claude commit was visible yet after Jack's dispatch handoff.

## Runtime Commit

```text
8856067dfd8de1042535bb930bdc2571f903889e — refactor: trim dead vehicle routes and expose compliance
```

## File Changed

```text
server/routes/vehicleRoutes.ts
```

## What Changed

Reduced `vehicleRoutes.ts` to the two caller-backed routes:

```text
GET   /api/vehicles/compliance
PATCH /api/vehicles/:id
```

Deleted no-caller vehicle fleet management surfaces:

```text
GET    /api/vehicles
GET    /api/vehicles/assignments/list
GET    /api/vehicles/maintenance/list
GET    /api/vehicles/:id
POST   /api/vehicles
DELETE /api/vehicles/:id
POST   /api/vehicles/assignments
POST   /api/vehicles/assignments/:id/return
POST   /api/vehicles/maintenance
```

Also removed unused imports related to deleted assignments/maintenance/create/delete handlers.

## Important Bug Fixed

Before this cleanup, `GET /api/vehicles/compliance` was declared **after** `GET /api/vehicles/:id`.

In Express, that means the literal path `compliance` could be captured by `/:id`, causing the compliance page to receive `Vehicle not found` instead of the compliance payload.

This commit moves `/compliance` before `/:id` by deleting `GET /:id` and leaving `/compliance` first.

## Caller Audit Evidence

Search for `/api/vehicles` found active frontend caller:

```text
client/src/pages/fleet-compliance.tsx
```

Reading `fleet-compliance.tsx` confirmed active use of:

```text
GET   /api/vehicles/compliance
PATCH /api/vehicles/:id
```

The page description also states it updates dates inline via existing `PATCH /api/vehicles/:id`.

No caller evidence surfaced for:

```text
/api/vehicles/assignments
/api/vehicles/maintenance
/api/vehicles/assignments/list
/api/vehicles/maintenance/list
```

## Build Verification Required

Claude should run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Additional Pending Verification From Earlier Jack Commits

Claude still needs to verify these previous runtime commits if not already done locally:

```text
c6b339029a318836e7b87c9d973d0c2747092c88 — refactor: delete dead post order routes
07f803588049b2f2bfa99df397b134cba55aa4da — refactor: unmount dead dispatch router
```

If local build passes and `rg` confirms no imports remain, delete:

```text
server/routes/dispatch.ts
```

## Guard Tour Audit Result

File:

```text
server/routes/guardTourRoutes.ts
```

Mount:

```text
/api/guard-tours
```

Jack found active callers:

```text
client/src/pages/guard-tour.tsx
client/src/pages/guard-tours-scan.tsx
client/src/components/mobile/GuardTourScanner.tsx
```

Reading `client/src/pages/guard-tour.tsx` confirmed active use of:

```text
/api/guard-tours/tours
/api/guard-tours/tours/:tourId/checkpoints
/api/guard-tours/checkpoints/:id
/api/guard-tours/scans
/api/guard-tours/tours/:tourId/scans
```

Recommendation: do not delete from `guardTourRoutes.ts` this pass.

## Next OPS Targets

1. `equipmentRoutes.ts`
2. `incidentPatternRoutes.ts`
3. `situationRoutes.ts`
4. `safetyRoutes.ts`
5. `rmsRoutes.ts`
6. local CAD cleanup if Claude has not completed it
7. delete `dispatch.ts` if local verification is clean

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest development.
2. Confirm tip includes `8856067` and this handoff.
3. Build/type-check all pending Jack runtime commits.
4. Delete `server/routes/dispatch.ts` if clean.
5. Complete CAD local cleanup if clean.
6. Update `AGENT_HANDOFF.md` and `DEEP_ROUTE_INDEX.md`.
7. Push verified remote tip.
