# Jack/GPT Handoff — Trinity/AI Batch Audit

Branch: `refactor/route-cleanup`
Date: 2026-04-26

## Current Refactor Tip Verified By Jack

```text
fd63778592bffc2bee34fd844636a7138e1b0d25
```

Claude's latest scheduling batch:

```text
refactor: scheduling batch 2 — -1,418L (schedules/scheduleos/advanced)
```

Claude reported:

- schedulesRoutes.ts: 558 -> 518L, -40L
- scheduleosRoutes.ts: 1,326 -> 830L, -496L
- advancedSchedulingRoutes.ts: 1,220 -> 309L, -911L
- broken prefix scan: 0
- build: clean
- refactor branch total: about 19,073L removed

## Batch Audited This Turn

Jack audited Trinity/AI route surfaces:

```text
server/routes/domains/trinity.ts
server/routes/ai-brain-routes.ts
server/routes/aiBrainInlineRoutes.ts
server/routes/helpai-routes.ts
client/src/components/helpai/helpai-integration-panel.tsx
```

## Mount Context

`server/routes/domains/trinity.ts` mounts multiple shared prefixes. Do not unmount `/api/ai-brain` or `/api/helpai` wholesale.

Relevant mounts:

```text
/api/ai-brain/console      -> aiBrainConsoleRouter
/api/ai-brain/control      -> aiBrainControlRouter
/api/ai-brain              -> aiBrainRouter
/api/ai-brain              -> aiBrainInlineRouter with requireAuth + workspace
/api/helpai                -> helpaiRouter
```

Because `/api/ai-brain` is shared by two routers, delete only exact no-caller handlers.

## 1. ai-brain-routes.ts

Status: active file, but visible route set contains many no-caller/platform-diagnostic endpoints.

### Visible route groups

```text
GET  /api/ai-brain/health
GET  /api/ai-brain/logs
GET  /api/ai-brain/system-status
GET  /api/ai-brain/model-router/status
POST /api/ai-brain/model-router/route
POST /api/ai-brain/trinity-scan
GET  /api/ai-brain/trinity-knowledge
GET  /api/ai-brain/trinity-persistence-test
GET  /api/ai-brain/skills
GET  /api/ai-brain/approvals
GET  /api/ai-brain/patterns
GET  /api/ai-brain/jobs/recent
POST /api/ai-brain/jobs
POST /api/ai-brain/jobs/:id/approve
POST /api/ai-brain/jobs/:id/reject
POST /api/ai-brain/feedback
POST /api/ai-brain/business-insight
POST /api/ai-brain/recommend
POST /api/ai-brain/chat
GET  /api/ai-brain/faqs
POST /api/ai-brain/faqs
POST /api/ai-brain/faqs/:id/helpful
GET  /api/ai-brain/checkpoints
POST /api/ai-brain/checkpoints/:id/resume
GET  /api/ai-brain/global-patterns
GET  /api/ai-brain/gaps
POST /api/ai-brain/gaps/:id/resolve
```

### Connector search result

Exact route searches for these visible groups mostly returned only `server/routes/ai-brain-routes.ts`.

No caller evidence found through connector for:

```text
/model-router/*
/trinity-scan
/trinity-knowledge
/trinity-persistence-test
/approvals
/jobs/*
/checkpoints/*
/global-patterns
/business-insight
/recommend
```

### Concrete bug candidate

`GET /api/ai-brain/global-patterns` visibly references:

```ts
aiGlobalPatterns
```

but the visible schema import list does not include `aiGlobalPatterns`. It is currently hidden behind `@ts-expect-error` comments.

Recommendation:

- If local `rg` confirms no callers for `/api/ai-brain/global-patterns`, delete this handler.
- If it must remain, import/define `aiGlobalPatterns` correctly and remove the masking comments.

Claude local commands:

```bash
grep -n "aiBrainRouter\.\(get\|post\|put\|patch\|delete\)" server/routes/ai-brain-routes.ts
rg "/api/ai-brain/global-patterns|global-patterns" client server shared scripts tests
rg "aiGlobalPatterns" server shared
rg "/api/ai-brain/model-router|model-router/" client server shared scripts tests
rg "/api/ai-brain/trinity-scan|trinity-scan|/api/ai-brain/trinity-knowledge|trinity-knowledge|trinity-persistence-test" client server shared scripts tests
rg "/api/ai-brain/jobs|ai-brain/jobs|/api/ai-brain/approvals|/api/ai-brain/checkpoints" client server shared scripts tests
```

## 2. aiBrainInlineRoutes.ts

Status: active file, likely high cleanup value.

Confirmed visible active-ish routes:

```text
POST /api/ai-brain/detect-issues
POST /api/ai-brain/guardrails/validate
GET  /api/ai-brain/guardrails/config
/knowledge/*
/fast-mode/*
```

However, latest connector exact searches did not surface frontend callers for many visible self-healing/service-watchdog/mailer endpoints.

### Strong local delete candidates if `rg` confirms no callers

```text
POST /api/ai-brain/workflow/execute
POST /api/ai-brain/workflow/high-priority-fixes
POST /api/ai-brain/workflow/search-and-fix
POST /api/ai-brain/workflow/execute-chain
POST /api/ai-brain/diagnostic/run-fast
GET  /api/ai-brain/services/registry
GET  /api/ai-brain/services/orphans
POST /api/ai-brain/services/:serviceId/heartbeat
POST /api/ai-brain/services/:serviceId/hotpatch
GET  /api/ai-brain/mailing-instructions
GET  /api/ai-brain/mailing-instructions/:category
POST /api/ai-brain/mailing-instructions/validate
POST /api/ai-brain/mailer/send
POST /api/ai-brain/command/execute
GET  /api/ai-brain/permissions/summary
GET  /api/ai-brain/graduation-status
POST /api/ai-brain/can-auto-approve
POST /api/ai-brain/knowledge/test-orchestration
```

These look like old autonomous self-healing/service-watchdog/test/mailer utilities. They may still be valuable as internal tooling, but should not stay mounted unless a UI or system caller exists and auth is correct.

Claude local commands:

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/aiBrainInlineRoutes.ts
rg "/api/ai-brain/workflow/execute|workflow/execute" client server shared scripts tests
rg "/api/ai-brain/workflow/high-priority-fixes|workflow/high-priority-fixes" client server shared scripts tests
rg "/api/ai-brain/workflow/search-and-fix|workflow/search-and-fix" client server shared scripts tests
rg "/api/ai-brain/workflow/execute-chain|workflow/execute-chain" client server shared scripts tests
rg "/api/ai-brain/diagnostic/run-fast|diagnostic/run-fast" client server shared scripts tests
rg "/api/ai-brain/services/registry|services/registry|/api/ai-brain/services/orphans|services/orphans" client server shared scripts tests
rg "/api/ai-brain/services/.*/heartbeat|services/.*/heartbeat|/api/ai-brain/services/.*/hotpatch|services/.*/hotpatch" client server shared scripts tests
rg "/api/ai-brain/mailing-instructions|mailing-instructions|/api/ai-brain/mailer/send|mailer/send" client server shared scripts tests
rg "/api/ai-brain/command/execute|/api/ai-brain/permissions/summary|/api/ai-brain/graduation-status|/api/ai-brain/can-auto-approve|knowledge/test-orchestration" client server shared scripts tests
```

## 3. helpai-routes.ts

Status: active file, but contract bugs exist and many orchestration/session routes may be no-caller.

### Confirmed frontend caller evidence

`client/src/components/helpai/helpai-integration-panel.tsx` actively calls:

```text
GET  /api/helpai/registry
GET  /api/helpai/integrations/config
POST /api/helpai/integrations/config
GET  /api/helpai/audit-log
```

### Important contract mismatches found

#### A. Frontend calls GET `/api/helpai/integrations/config`, but visible backend does not expose it

Backend visibly has:

```text
POST /api/helpai/integrations/config
GET  /api/helpai/integrations
```

Frontend query key + fetch:

```text
GET /api/helpai/integrations/config
```

Recommendation:

- Either add `GET /integrations/config` as an alias returning workspace integrations, or update frontend to use `GET /api/helpai/integrations`.
- Since the frontend already uses `/integrations/config` as the cache key, safest low-risk fix is backend alias:

```ts
helpaiRouter.get('/integrations/config', requireAuth, async (...same as GET /integrations...))
```

#### B. POST payload mismatch

Frontend sends:

```ts
{ apiRegistryId: apiId, configData: {} }
```

Backend visible route expects:

```ts
{ registryId, isEnabled, customEndpoint, customConfig, autoSyncEnabled, syncIntervalMinutes }
```

Recommendation:

Normalize backend to accept both:

```ts
const registryId = req.body.registryId || req.body.apiRegistryId;
const customConfig = req.body.customConfig || req.body.configData;
```

#### C. Response shape mismatch likely

Frontend reads:

```ts
const registryList = registryData?.data || []
const integrationsList = integrationsData?.data || []
const auditEntries = auditData?.data || []
```

Visible backend returns:

```text
GET /registry          -> { success, count, apis }
GET /integrations      -> { success, count, integrations }
GET /audit-log         -> { success, count, stats, logs }
```

Recommendation:

Add compatible `data` aliases without breaking existing clients:

```ts
registry: data = apis
integrations: data = integrations
audit-log: data = logs
```

### HelpAI routes with caller evidence

Keep/fix:

```text
GET  /registry
POST /integrations/config
GET  /integrations OR add GET /integrations/config alias
GET  /audit-log
```

### HelpAI no-caller candidates for local audit

Connector search did not find frontend caller evidence for:

```text
GET  /registry/:apiName
GET  /audit-log/export
POST /audit-log/verify/:logId
GET  /stats
GET  /orchestrator/actions
GET  /orchestrator/test-tools
POST /orchestrator/execute
GET  /orchestrator/health
POST /orchestrator/command
POST /chat
POST /session/start
POST /session/:id/message
```

Do not delete chat/session blindly if these are public/widget entrypoints. Local audit should include route usage outside `client/src`, embedded widgets, docs, and any public landing page.

Claude local commands:

```bash
grep -n "helpaiRouter\.\(get\|post\|put\|patch\|delete\)" server/routes/helpai-routes.ts
rg "/api/helpai/registry|helpai/registry" client server shared scripts tests
rg "/api/helpai/integrations/config|helpai/integrations/config|/api/helpai/integrations|helpai/integrations" client server shared scripts tests
rg "/api/helpai/audit-log|helpai/audit-log" client server shared scripts tests
rg "/api/helpai/orchestrator|helpai/orchestrator" client server shared scripts tests
rg "/api/helpai/chat|helpai/chat|/api/helpai/session|helpai/session" client server shared scripts tests
```

## Recommended Claude Execution Pass

Run one Trinity/AI local pass:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
rg "\b(adRouter|dRouter|uter|outer|ter|er)\." server/routes
```

Then:

1. Fix HelpAI integration frontend/backend contract mismatches.
2. Delete or fix `GET /api/ai-brain/global-patterns`.
3. Trim no-caller AI Brain inline self-healing/service/mailer routes.
4. Trim no-caller `ai-brain-routes.ts` model-router/trinity scan/jobs/checkpoints routes only if local proof is clean.
5. Do not unmount `/api/ai-brain` or `/api/helpai` wholesale.
6. Build/type-check/startup test.
7. Update `AGENT_HANDOFF.md` with latest refactor branch total.

## Why Jack Did Not Runtime-Patch

All three files are large/truncated in connector view, and `/api/ai-brain` is split across several routers. Rewriting through the connector would risk broken-prefix corruption again.

This handoff provides a larger batch map for Claude's full local execution/build pass.
