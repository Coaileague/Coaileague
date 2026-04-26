# Jack/GPT Handoff — Big Batch Audit: Misc + Dev + Shift Routes

Branch: `refactor/route-cleanup`
Date: 2026-04-26

## New Working Rule From Bryan

We should take bigger chunks per turn:

- Aim for at least half a domain per working turn when feasible.
- Try to keep each domain to about 4 turns max.
- Prefer 1-2 larger audit/work turns before handing Claude a local execution/build pass.

This handoff covers the next three large files together:

```text
miscRoutes.ts
/devRoutes.ts
shiftRoutes.ts
```

## Current Verified Tip Read By Jack

```text
d86021c930b8cf82b00000d864c3fae00f2ba07e
```

Claude status briefing says current refactor state includes:

```text
bcc86cdbc — training/perf/compliance deleted (-4,273L)
17289931a — comprehensive broken-prefix repair + ghost cleanup
204bef0fa — scheduler deleted, onboarding+benefit trimmed
```

Jack also saw the latest visible refactor branch commit as Claude's status briefing commit, not a runtime cleanup commit.

## Branch Rule

No cleanup on `development`.
All cleanup remains on:

```text
refactor/route-cleanup
```

## Files Audited This Turn

```text
server/routes/miscRoutes.ts
server/routes/devRoutes.ts
server/routes/shiftRoutes.ts
server/routes/domains/scheduling.ts
```

`shiftRoutes.ts` mount confirmed from `domains/scheduling.ts`:

```text
/api/shifts
```

`miscRoutes.ts` appears to define absolute `/api/...` paths internally. Do not assume a single prefix.

`devRoutes.ts` also mixes relative dev routes with absolute `/api/...` routes. Do not delete without local mount inventory.

## 1. shiftRoutes.ts Audit

### Status

Do not file-delete. It is mounted and active under:

```text
/api/shifts
```

Visible active/important handlers in fetched chunk:

```text
GET  /api/shifts
GET  /api/shifts/today
GET  /api/shifts/upcoming
GET  /api/shifts/pending
GET  /api/shifts/stats
GET  /api/shifts/:id
POST /api/shifts
```

The file is huge/truncated through Jack's connector, so Claude should locally inventory all handlers before trimming.

### Claude local commands

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/shiftRoutes.ts
rg "/api/shifts" client server shared scripts tests
rg "/api/shifts/today|/api/shifts/upcoming|/api/shifts/pending|/api/shifts/stats" client server shared scripts tests
```

### Recommendation

Keep file. Trim only individual handlers that local `rg` confirms have zero callers.

Because `/api/shifts` is a core scheduling surface, require stronger proof than normal before deleting any handler.

## 2. miscRoutes.ts Audit

### Status

Do not file-delete. This is a cross-cutting route bucket with multiple absolute `/api/...` surfaces.

Visible active or important surfaces:

```text
GET  /api/me/workspace-role
GET  /api/me/platform-role
GET  /api/me/workspace-features
GET  /api/feature-updates
POST /api/feature-updates/:id/dismiss
POST /api/voice/transcribe
POST /api/voice/tts
POST /api/voice-command
```

### Caller evidence found

Search surfaced references for:

```text
/api/me/workspace-role
/api/me/platform-role
/api/me/workspace-features
/api/feature-updates
```

in API config/documentation/route inventories.

Search did not surface direct frontend callers for:

```text
/api/voice/transcribe
/api/voice/tts
/api/voice-command
```

but these are platform UX/audio/AI features, so do not delete from connector-only evidence. Claude should local-audit exact callers first.

### Concrete bug candidate

`POST /api/feature-updates/:id/dismiss` visibly inserts:

```ts
workspaceId: workspaceId,
```

but `workspaceId` is not declared in the visible handler. Claude should fix locally to:

```ts
const workspaceId = req.workspaceId;
```

and either require it or omit it depending on schema requirements.

### Claude local commands

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/miscRoutes.ts
rg "/api/me/workspace-role|/api/me/platform-role|/api/me/workspace-features" client server shared scripts tests
rg "/api/feature-updates|feature-updates" client server shared scripts tests
rg "/api/voice/transcribe|/api/voice/tts|/api/voice-command|voice-command" client server shared scripts tests
rg "workspaceId: workspaceId" server/routes/miscRoutes.ts
```

### Recommendation

Keep file. Fix `feature-updates/:id/dismiss` workspaceId bug. Then trim only individual zero-caller surfaces after full local route inventory.

## 3. devRoutes.ts Audit

### Status

This is likely the biggest near-term win, but do not rewrite from connector view. The file is huge/truncated and mixes relative + absolute route paths.

Visible route groups include:

```text
POST /seed-emails
POST /seed-expired-keys
POST /trigger-automation/:jobType
GET  /automation-audit-logs
GET  /idempotency-keys
POST /api/test/autonomous/invoice
POST /api/test/autonomous/schedule
POST /api/test/autonomous/fill-open-shifts
POST /api/test/autonomous/payroll
POST /api/config/apply-changes
GET  /api/config/current
POST /trinity/fill-unassigned-shifts
POST /qb-sandbox-sync
```

Search only surfaced `devRoutes.ts` itself for the visible `/api/test/autonomous`, `/api/config`, and `/api/dev/qb-sandbox-sync` paths.

### Recommendation

Claude should local-audit whether `devRoutes.ts` is mounted only under a dev prefix and whether production excludes it. If the entire route file is development-only, the cleanest production hardening is one of:

1. unmount from production entirely, or
2. keep only platform-admin diagnostic endpoints that have active callers, or
3. move dev-only test endpoints behind an explicit non-production mount.

Do not delete if any deployment tooling or internal admin console uses them.

### Claude local commands

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/devRoutes.ts
rg "devRoutes|/api/dev|/api/test/autonomous|/api/config/current|/api/config/apply-changes|qb-sandbox-sync|trigger-automation|seed-expired-keys|seed-emails" client server shared scripts tests
rg "app.use.*dev|register.*dev|devRouter" server
```

### Delete candidates after local verification

If local `rg` confirms no active callers and these are dev-only leftovers, delete or unmount:

```text
POST /api/test/autonomous/invoice
POST /api/test/autonomous/schedule
POST /api/test/autonomous/fill-open-shifts
POST /api/test/autonomous/payroll
POST /api/config/apply-changes
GET  /api/config/current
POST /seed-emails
POST /seed-expired-keys
POST /trigger-automation/:jobType
GET  /automation-audit-logs
GET  /idempotency-keys
POST /qb-sandbox-sync
```

If any are kept, they should be gated consistently with `isProduction()` and `requirePlatformAdmin` or stronger.

## Why Jack Did Not Runtime-Patch This Batch

These files are huge and connector-truncated. Rewriting a truncated file is how we previously created broken router prefixes. Jack therefore did not rewrite runtime code here.

The value delivered in this pass is a larger three-file audit batch with exact local commands and specific high-confidence issues.

## Required Claude Verification / Execution Pass

Claude should now do a local pass over all three files in one turn:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
rg "\b(adRouter|dRouter|uter|outer|ter|er)\." server/routes
```

Then:

1. Fix `miscRoutes.ts` feature update dismiss `workspaceId` bug.
2. Inventory `devRoutes.ts` mount and caller state.
3. Trim/unmount dev-only zero-caller routes if local proof is clean.
4. Inventory full `shiftRoutes.ts`; trim only zero-caller handlers.
5. Update `AGENT_HANDOFF.md` because it is still stale.

## Recommended Next Owner

Claude goes next for local execution/build pass.
