# Jack/GPT Handoff — HRIS + Hiring Delete Lists

Branch: `development`
Date: 2026-04-25

## New Commit

This file: `docs: add Jack hris and hiring delete lists from deep index`

## Context

Claude's latest commit:

`072df47a3e543d69caf99a8fdc64174e4794a6e6` — `refactor: hrInlineRoutes.ts -483L — 17 dead routes deleted`

Claude completed:

- `hrInlineRoutes.ts`: `1,795 -> 1,312` lines, `-483L`
- HR domain total so far: `-1,394L`
- cumulative removed: about `11,035L`
- build clean

Claude also updated `DEEP_ROUTE_INDEX.md` with pre-audited HRIS and Hiring route maps.

## Targets

### 1. `server/routes/hrisRoutes.ts`

Mount:

```text
/api/hris
```

Before:

```text
248 lines
```

Deep index status:

```text
2 alive / 6 dead
```

### 2. `server/routes/hiringRoutes.ts`

Mount:

```text
/api/hiring
```

Before:

```text
416 lines
```

Deep index status:

```text
3 alive / 8 dead
```

## HRIS — Dead Routes To Delete — 6 Total

Delete these handlers from `server/routes/hrisRoutes.ts`:

```text
GET    /employees
GET    /auth/:provider
GET    /callback/:provider
POST   /sync/:provider
DELETE /disconnect/:provider
GET    /sync-status/:provider
```

## HRIS — Alive Routes To Preserve — 2 Total

Preserve:

```text
GET /providers
GET /connections
```

## Hiring — Dead Routes To Delete — 8 Total

Delete these handlers from `server/routes/hiringRoutes.ts`:

```text
GET   /applicants/:id
PATCH /applicants/:id/stage
POST  /applicants/:id/verify-license
POST  /applicants/:id/score-interview
POST  /applicants/:id/assess
GET   /question-sets
GET   /sessions/:id
POST  /postings/:id/draft-approve
```

## Hiring — Alive Routes To Preserve — 3 Total

Preserve:

```text
GET  /pipeline
GET  /training-pipeline
POST /seed
```

## Required Local Verification

Claude should run:

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/hrisRoutes.ts
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/hiringRoutes.ts
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

After deletion, verify dead paths are gone:

```bash
rg "employees|auth/:provider|callback/:provider|sync/:provider|disconnect/:provider|sync-status/:provider" server/routes/hrisRoutes.ts
rg "applicants/:id|verify-license|score-interview|assess|question-sets|sessions/:id|draft-approve" server/routes/hiringRoutes.ts
```

Expected result:

- HRIS search should only show imports/comments if any, not route registrations for deleted paths.
- Hiring search should not show route registrations for deleted paths.

## Suggested Claude Commit Message

```text
refactor: hrisRoutes + hiringRoutes dead route cleanup
```

Commit body should include:

- HRIS routes deleted: 6
- Hiring routes deleted: 8
- before/after line counts for both files
- alive route list preserved
- build result

## Next Target After Claude

Use `DEEP_ROUTE_INDEX.md` next.

Remaining HR targets needing local audit:

```text
onboardingRoutes.ts      mount /api/sps/onboarding
terminationRoutes.ts     mount /api/terminations
performanceRoutes.ts     mount /api/performance-notes
trainingRoutes.ts        mount /api/training-compliance
benefitRoutes.ts         mount /api/benefits
```

Claude's note says after HRIS/Hiring, run local audit on `onboardingRoutes.ts` and `trainingRoutes.ts` because they are larger remaining targets.

## AGENT_HANDOFF.md Sync Note

Jack did not update `AGENT_HANDOFF.md` directly because long-file connector output is unsafe for whole-file replacement. Claude should update the top sync block locally after runtime deletion.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest development.
2. Delete the 6 HRIS dead routes.
3. Delete the 8 Hiring dead routes.
4. Clean imports.
5. Build/type-check.
6. Update `DEEP_ROUTE_INDEX.md` if new route maps are available.
7. Update `AGENT_HANDOFF.md` sync block.
8. Push.
