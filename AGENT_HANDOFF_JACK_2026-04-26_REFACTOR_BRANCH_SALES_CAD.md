# Jack/GPT Handoff — Refactor Branch Sales + CAD

Branch: `refactor/route-cleanup`
Date: 2026-04-26

## Branch Rule Confirmed

No route cleanup on `development`.

All work in this handoff is on:

```text
refactor/route-cleanup
```

## Starting Refactor Branch Tip

Jack confirmed:

```text
eb7c54f0c9464e400a19da18bcb473ab23514c5a
```

## Commit 1 — CAD Repair

```text
1c6d7dce — fix: repair CAD router references on refactor branch
```

Why:

The refactor branch version of `server/routes/cadRoutes.ts` was syntactically damaged after earlier deletion. Examples found in the actual file:

```text
adRouter.post(...)
dRouter.post(...)
Router.delete(...)
```

What changed:

- Replaced malformed router identifiers with `cadRouter`.
- Removed unused imports made dead by prior cleanup (`pool`, `db`, `sql`).
- Preserved the already-trimmed route set.

Claude should build-check this. This was a branch-health fix, not new route deletion.

## Commit 2 — Sales Cleanup

```text
a16c0106 — refactor: trim dead sales document delivery routes
```

File:

```text
server/routes/salesRoutes.ts
```

Mounts before:

```text
/api/sales
/api/document-delivery
```

Prefix audit:

```text
/api/sales              active callers found
/api/document-delivery  no callers found outside salesRoutes.ts
```

Active `/api/sales` callers found in:

```text
client/src/pages/workspace-sales.tsx
client/src/pages/outreach.tsx
all_frontend_calls.txt
```

## Sales Routes Preserved

```text
GET  /api/sales/invitations
POST /api/sales/invitations/send
GET  /api/sales/proposals
POST /api/sales/proposals
POST /api/sales/outreach/crawl
POST /api/sales/outreach/send
GET  /api/sales/outreach/pipeline
GET  /api/sales/outreach/pipeline/:stage
```

## Sales Cleanup Details

Deleted no-caller surfaces:

```text
/api/document-delivery/* router and mount
GET /api/sales/activities
```

Also removed the duplicate late `POST /api/sales/outreach/crawl` stub. The real crawler route using `trinityOutreachService.crawlMultipleWebsites()` remains.

Bug fixed:

```text
GET /api/sales/invitations
```

It referenced `workspaceId` without declaring it. Now it uses:

```ts
const workspaceId = req.workspaceId;
if (!workspaceId) return res.status(403).json({ error: "Workspace context required" });
```

Imports removed:

```text
verifyWorkspaceMembership helper
employees
activities
documentDeliveryService
hasManagerAccess
```

## Required Claude Verification

Run on `refactor/route-cleanup`:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

Additional sanity checks:

```bash
rg "adRouter|dRouter|Router\.delete" server/routes/cadRoutes.ts
rg "/api/document-delivery|document-delivery" client server shared scripts tests
rg "/api/sales/activities|sales/activities" client server shared scripts tests
```

Expected:

- no malformed CAD router identifiers
- no active document-delivery callers
- no active sales activities callers

## Next Target

Continue on `refactor/route-cleanup` only.

Recommended next file:

```text
vehicleRoutes.ts
```

Use the corrected method:

1. Prefix audit first: `/api/vehicles`.
2. If callers exist, keep file and trim only individual dead handlers.
3. Do not delete file unless prefix callers = 0.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull `refactor/route-cleanup`.
2. Confirm commits `1c6d7dce` and `a16c0106`.
3. Build/type-check.
4. Update `AGENT_HANDOFF.md` with new refactor branch tip.
5. Continue next refactor target or return to Jack.
