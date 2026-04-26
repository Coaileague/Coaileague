# Jack/GPT Handoff — Trinity Tooling Batch Audit

Branch: `refactor/route-cleanup`
Date: 2026-04-26

## Current Refactor Tip Verified By Jack

```text
5b19de1a7c00074426de2c13b47810b4edddc0e6
```

Claude's latest Trinity/AI batch:

```text
refactor: Trinity/AI batch — -1,621L + HelpAI contract fixes
```

Claude reported:

- `ai-brain-routes.ts`: 1,645 -> 1,187L, -458L
- `aiBrainInlineRoutes.ts`: 1,171 -> 521L, -650L
- `helpai-routes.ts`: 1,296 -> 1,155L, -141L
- HelpAI frontend/backend contract fixes applied
- broken prefix scan: 0
- build: clean
- refactor branch total: about 20,694L removed

## Batch Audited This Turn

Jack audited the next Trinity tooling/automation cluster:

```text
server/routes/automationInlineRoutes.ts
server/routes/automation.ts
server/routes/workflowRoutes.ts
server/routes/workflowConfigRoutes.ts
server/routes/controlTowerRoutes.ts
server/routes/quickFixRoutes.ts
client/src/pages/automation-control.tsx
client/src/pages/automation-settings.tsx
```

Mounts from `server/routes/domains/trinity.ts`:

```text
/api/automation              automationInlineRouter + automationRouter
/api/workflows               workflowRouter
/api/workflow-configs        workflowConfigRouter
/api/control-tower           controlTowerRouter
/api/quick-fixes             quickFixRouter
```

## 1. automation.ts / automationInlineRoutes.ts

Status: **active — do not unmount `/api/automation` wholesale.**

Broad `/api/automation` caller audit found active frontend pages:

```text
client/src/pages/automation-control.tsx
client/src/pages/automation-settings.tsx
client/src/pages/automation-audit-log.tsx
client/src/pages/workspace-onboarding.tsx
```

Reading `automation-control.tsx` confirmed active use of:

```text
GET  /api/automation/status
POST /api/automation/schedule/generate
POST /api/automation/invoice/anchor-close
POST /api/automation/payroll/generate
POST /api/automation/compliance/scan
GET  /api/automation/trinity/history
POST /api/automation/trinity/resume/:requestId
POST /api/automation/trinity/approve/:requestId
POST /api/automation/trinity/reject/:requestId
POST /api/automation/trinity/pause/:requestId
PATCH /api/automation/trinity/revise/:requestId
POST /api/automation/trinity/reanalyze/:requestId
```

Reading `automation-settings.tsx` confirmed active use of:

```text
GET   /api/automation/trinity/settings
PATCH /api/automation/trinity/settings
```

`automationInlineRoutes.ts` is fully visible and contains these routes:

```text
GET  /api/automation/job-history
GET  /api/automation/job-summary
GET  /api/automation/triggers
POST /api/automation/trigger-ai-schedule
GET  /api/automation/ai-schedule-status
POST /api/automation/admin-hourly-rate
GET  /api/automation/admin-hourly-rate
```

No strong connector caller evidence was found for the visible inline automation routes except broad automation docs/pages. Claude should local-audit these exact paths before trimming.

### Potential automation cleanup candidates if local `rg` confirms no callers

```text
GET  /api/automation/job-history
GET  /api/automation/job-summary
GET  /api/automation/triggers
POST /api/automation/trigger-ai-schedule
GET  /api/automation/ai-schedule-status
POST /api/automation/admin-hourly-rate
GET  /api/automation/admin-hourly-rate
```

Do not delete live `automation.ts` routes used by `automation-control.tsx` and `automation-settings.tsx`.

Claude local commands:

```bash
grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/automationInlineRoutes.ts
grep -n "automationRouter\.\(get\|post\|put\|patch\|delete\)" server/routes/automation.ts
rg "/api/automation/job-history|/api/automation/job-summary|/api/automation/triggers|/api/automation/trigger-ai-schedule|/api/automation/ai-schedule-status|/api/automation/admin-hourly-rate" client server shared scripts tests
rg "/api/automation/status|/api/automation/schedule/generate|/api/automation/invoice/anchor-close|/api/automation/payroll/generate|/api/automation/compliance/scan|/api/automation/trinity" client server shared scripts tests
```

## 2. workflowRoutes.ts

File is small and fully visible.

Mounted at:

```text
/api/workflows
```

Visible handlers:

```text
GET /api/workflows/active
GET /api/workflows/summary
GET /api/workflows/:workflowId
```

Caller search for `/api/workflows` found no active caller evidence beyond `server/routes/domains/trinity.ts`.

Recommendation: local `rg`, then delete the file and unmount `/api/workflows` if clean.

Claude local commands:

```bash
rg "/api/workflows|api/workflows|workflowStatusService|getActiveWorkflows|getWorkflowStatusSummary|getWorkflowDetails" client server shared scripts tests
```

If no callers outside route/mount/service definitions:

```text
DELETE server/routes/workflowRoutes.ts
remove workflowRouter import and app.use('/api/workflows', ...)
```

## 3. workflowConfigRoutes.ts

File is small and fully visible.

Mounted at:

```text
/api/workflow-configs
```

Visible handlers:

```text
GET    /api/workflow-configs
POST   /api/workflow-configs
PATCH  /api/workflow-configs/:id
DELETE /api/workflow-configs/:id
```

Caller search for `/api/workflow-configs` found no active caller evidence beyond `server/routes/domains/trinity.ts`.

Recommendation: local `rg`, then delete file/unmount if clean.

Claude local commands:

```bash
rg "/api/workflow-configs|api/workflow-configs|getWorkflowConfigs|createWorkflowConfig|updateWorkflowConfig|deleteWorkflowConfig" client server shared scripts tests
```

If no callers outside route/mount/storage definitions:

```text
DELETE server/routes/workflowConfigRoutes.ts
remove workflowConfigRouter import and app.use('/api/workflow-configs', ...)
```

## 4. controlTowerRoutes.ts

File is fully visible.

Mounted at:

```text
/api/control-tower
```

Visible handlers:

```text
GET  /api/control-tower/summary
POST /api/control-tower/refresh
```

Caller search for `/api/control-tower` found no active caller evidence beyond `server/routes/domains/trinity.ts`.

Recommendation: local `rg`, then delete file/unmount if clean.

Claude local commands:

```bash
rg "/api/control-tower|api/control-tower|ControlTower|control tower|control-tower" client server shared scripts tests
```

If no callers outside route/mount/docs:

```text
DELETE server/routes/controlTowerRoutes.ts
remove controlTowerRouter import and app.use('/api/control-tower', ...)
```

## 5. quickFixRoutes.ts

File is large but mostly fully visible through connector.

Mounted at:

```text
/api/quick-fixes
```

Visible handlers:

```text
GET  /api/quick-fixes/actions
GET  /api/quick-fixes/suggestions
POST /api/quick-fixes/requests
GET  /api/quick-fixes/requests
GET  /api/quick-fixes/pending-approvals
POST /api/quick-fixes/requests/:id/approve
POST /api/quick-fixes/requests/:id/reject
POST /api/quick-fixes/requests/:id/execute
POST /api/quick-fixes/requests/:id/generate-code
GET  /api/quick-fixes/audit/:requestId
POST /api/quick-fixes/execute
```

Caller search for `/api/quick-fixes` found no active caller evidence beyond `server/routes/domains/trinity.ts`.

Important: route comments say `/execute` is used by notification popover for workflow approvals/hotpatch fixes. Search did not surface that, but this should be locally checked carefully before deleting.

Recommendation: local `rg`, then either:

1. delete entire quickFix router if no callers, or
2. keep only `POST /execute` if notification popover actually calls it, deleting request/approval history scaffolding.

Claude local commands:

```bash
rg "/api/quick-fixes|api/quick-fixes|quickFixService|quick fix|quick-fix|QuickFix" client server shared scripts tests
rg "quick-fixes/execute|/api/quick-fixes/execute|actionCode|notificationId" client server shared scripts tests
```

Potential delete if no callers:

```text
DELETE server/routes/quickFixRoutes.ts
remove quickFixRouter import and app.use('/api/quick-fixes', ...)
```

## Recommended Claude Execution Pass

Run one Trinity tooling local pass:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
rg "\b(adRouter|dRouter|uter|outer|ter|er)\." server/routes
```

Then:

1. Keep `/api/automation` and trim only exact zero-caller inline/admin helper handlers.
2. Delete/unmount `/api/workflows` if local `rg` confirms zero callers.
3. Delete/unmount `/api/workflow-configs` if local `rg` confirms zero callers.
4. Delete/unmount `/api/control-tower` if local `rg` confirms zero callers.
5. Delete/unmount `/api/quick-fixes` or trim to `/execute` only if local notification callers exist.
6. Build/type-check/startup test.
7. Update `AGENT_HANDOFF.md` with the real latest total. Current handoff is stale and still shows older ~13,247L total.

## Why Jack Did Not Runtime-Patch

Several of these routes are small enough for direct edits, but this batch crosses multiple mounted Trinity surfaces. Because the branch has recovered from earlier route-layer instability, Claude should execute the unmount/delete pass locally with full `rg`, build, and startup checks rather than connector patching.
