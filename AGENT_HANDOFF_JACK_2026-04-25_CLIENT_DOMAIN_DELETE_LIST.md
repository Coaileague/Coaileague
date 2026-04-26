# Jack/GPT Handoff — CLIENT Domain Delete Lists

Branch: `development`
Date: 2026-04-25

## Sync Check

Jack connector currently sees branch tip:

```text
8213a2dba043fa99b84940278f5ed753b78f0629
```

Claude's `AGENT_HANDOFF.md` says the previously verified remote tip was:

```text
c4f8d471e
```

The connector-visible tip is newer because it is Claude's sync-proof handoff commit. Jack proceeded because `fetch_commit development` returned `8213a2db` and `DEEP_ROUTE_INDEX.md` contains the CLIENT pre-audit rows.

## New Commit

This file: `docs: add Jack client domain delete lists`

## Context

Claude's latest visible commit:

```text
8213a2dba043fa99b84940278f5ed753b78f0629 — docs: sync-proof handoff — commit hash verification protocol
```

State from Claude:

- HR domain complete
- HR removed about `5,200L`
- cumulative removed about `14,841L`
- CLIENT domain is now active
- `DEEP_ROUTE_INDEX.md` has pre-audited delete rows for:
  - `clientRoutes.ts`
  - `contractPipelineRoutes.ts`
  - `proposalRoutes.ts`

## Target 1 — clientRoutes.ts

File:

```text
server/routes/clientRoutes.ts
```

Mount:

```text
/api/clients
```

Index status:

```text
16 alive / 12 dead
```

### Delete 12 dead handlers

```text
POST  /:id/collections/start
POST  /:id/collections/decline
POST  /:id/collections/resolve
POST  /:id/collections/write-off
GET   /:id/collections/log
GET   /:clientId/payments
GET   /dockchat/reports/:reportId
POST  /dockchat/reports/:reportId/acknowledge
POST  /dockchat/reports/:reportId/resolve
GET   /:clientId/coverage-schedule
PATCH /:clientId/coverage-schedule
GET   /:id/export
```

### Preserve active handlers

```text
GET    /
GET    /lookup
POST   /
PATCH  /:id
GET    /deactivated
POST   /:id/deactivate
POST   /:id/reactivate
DELETE /:id
POST   /dockchat/start
POST   /dockchat/message
POST   /dockchat/close
GET    /dockchat/reports
GET    /my-communications
POST   /contract-renewal-request
POST   /coi-request
GET    /my-portal-token
```

## Target 2 — contractPipelineRoutes.ts

File:

```text
server/routes/contractPipelineRoutes.ts
```

Mount:

```text
/api/contracts
```

Index status:

```text
5 alive / 20 dead
```

### Delete 20 dead handlers

```text
GET    /templates
POST   /templates
GET    /templates/:id
PATCH  /templates/:id
DELETE /templates/:id
GET    /usage
GET    /access
POST   /:id/send
POST   /:id/accept
POST   /:id/request-changes
POST   /:id/decline
GET    /:id/signatures
POST   /:id/sign
POST   /:id/signers
GET    /:id/signers
POST   /:id/remind
PATCH  /:id/signers/reorder
GET    /:id/audit
GET    /:id/evidence
GET    /:id/verify
```

### Preserve active handlers

```text
GET   /
POST  /
GET   /stats
GET   /:id
PATCH /:id
```

## Target 3 — proposalRoutes.ts

File:

```text
server/routes/proposalRoutes.ts
```

Mount:

```text
/api/proposals
```

Index status:

```text
3 alive / 6 dead
```

### Delete 6 dead handlers

```text
GET    /templates/:id
GET    /:id
PATCH  /:id
PATCH  /:id/status
DELETE /:id
POST   /:id/generate-pdf
```

### Preserve active handlers

```text
GET  /templates
GET  /
POST /
```

## Required Local Verification

Claude should run route inventories before deletion:

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/clientRoutes.ts
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/contractPipelineRoutes.ts
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/proposalRoutes.ts
```

Then delete the listed handlers and run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Dead-Path Verification

```bash
rg "collections/start|collections/decline|collections/resolve|collections/write-off|collections/log|clientId/payments|dockchat/reports/.*/acknowledge|dockchat/reports/.*/resolve|coverage-schedule|/:id/export" server/routes/clientRoutes.ts
rg "templates/:id|/usage|/access|/:id/send|/:id/accept|request-changes|/:id/decline|/:id/signatures|/:id/sign|/:id/signers|/:id/remind|signers/reorder|/:id/audit|/:id/evidence|/:id/verify" server/routes/contractPipelineRoutes.ts
rg "templates/:id|/:id/status|generate-pdf" server/routes/proposalRoutes.ts
```

## Likely Import Cleanup

Let TypeScript decide, but deletion may remove imports related to:

- collections / collection logs
- client payments
- DockChat report acknowledgement/resolution
- coverage schedule helpers
- client export/PDF/CSV
- contract template/signature/audit/evidence helpers
- proposal update/status/delete/PDF generation helpers

Do not remove blindly.

## Suggested Claude Commit Message

```text
refactor: CLIENT domain dead route cleanup
```

Commit body should include:

- `clientRoutes.ts`: 12 dead handlers deleted, before/after line count
- `contractPipelineRoutes.ts`: 20 dead handlers deleted, before/after line count
- `proposalRoutes.ts`: 6 dead handlers deleted, before/after line count
- active handlers preserved
- build result
- new remote tip hash verified with `git ls-remote origin development`

## Next Target After Claude

After this CLIENT cleanup:

1. Audit `salesRoutes.ts` locally.
2. Optionally audit `rfpPipelineRoutes.ts` and remaining sales/client routes.
3. Pre-audit COMPLIANCE domain in `DEEP_ROUTE_INDEX.md` as Claude planned.

## Recommended Next Owner

Claude goes next.

Claude action:

1. Pull latest `development`.
2. Confirm tip hash includes this handoff.
3. Delete listed CLIENT handlers from all 3 files.
4. Clean imports.
5. Build/type-check.
6. Update `AGENT_HANDOFF.md` and `DEEP_ROUTE_INDEX.md`.
7. Push and verify with `git ls-remote origin development`.
