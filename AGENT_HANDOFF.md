# COAILEAGUE REFACTOR - MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 - Codex (Phase H verified + hardening applied; Claude next)

---

## THREE-AGENT RELAY PROTOCOL

### Roles

**CLAUDE - Implementation lead (executes on `development`)**
- Audits + executes entire domains.
- Integrates reviewed Codex/Copilot changes from `refactor/service-layer` into `development`.
- Boot-tests before every push to `development`.
- One domain = one complete sweep = one coherent commit.
- Syncs `development -> refactor/service-layer` after every turn.

**COPILOT - Acceleration helper**
- Works only on narrow repeated patterns after Claude/Codex define the canonical fix.
- Good targets: Zod boilerplate, test scaffolds, helper replacements, repeated route guards.
- No architecture decisions, no direct merge to `development`, no independent safety calls.
- Copilot branches are helper branches; Claude or Codex integrates reviewed work.

**CODEX - Verification + hardening lead (works on `refactor/service-layer`)**
- Verifies Claude's fixes are correct and complete.
- Strengthens weak code, removes bandaids, and performs scoped refactors within the same domain.
- Documents exact risks, line numbers, validation, and either makes the fix on `refactor/service-layer` or gives Claude exact instructions.
- Decides: next domain needed, or AUDIT COMPLETE.

### Whole-Domain Definition

Every domain sweep must cover all of these before marking done:
```text
Routes             all HTTP endpoints, middleware, guards
Services           business logic, calculations, transformations
Jobs               cron jobs, scheduled tasks, recurring automations
Workers            background workers, queue consumers, processors
Queues             message queues, job queues, retry logic
Automations        workflow automations, triggers, pipelines
Webhooks           inbound/outbound webhook handlers
Storage            file storage, vault, blob handling
Events             platform event bus, event handlers, listeners
Migrations         DB changes implied by fixes
Tests              test stubs or tests for critical paths
Validation         Zod at every API boundary
User-facing paths  workflows produce intended outcomes end-to-end
```

### Speed Rule

One domain, one complete sweep, one coherent commit. Nothing left half-done.

### Ownership Rule

No two agents edit the same files simultaneously. Copilot should not open or merge
PRs to `development`; Claude integrates reviewed Copilot/Codex work in one sweep.

---

## TURN TRACKER

```text
Current turn: CLAUDE
  -> Integrate Codex-reviewed Copilot + Codex hardening from refactor/service-layer into development.
  -> Run build/boot validation before pushing development.
  -> Sync development back to refactor/service-layer and update this file.
  -> Then execute Phase I (jobs/workers/queues/schedulers) if integration is clean.

After Claude: CODEX
  -> Verify Phase I from remote truth.
  -> Strengthen/refactor Phase I weak code if safely scoped.
  -> Decide next domain or AUDIT COMPLETE.
```

---

## CURRENT COMMIT STATE

```text
origin/development            -> 13b5e513 (latest fetched before Codex merge)
origin/refactor/service-layer  -> Codex will push this handoff + merged dev/Copilot hardening
origin/copilot/refactor-service-layer -> reviewed and integrated into Codex branch
```

Boot test before every push to `development`:
```bash
# Use deployment-provided DATABASE_URL and SESSION_SECRET. Do not commit live secrets here.
node build.mjs
node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health   # must return {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt  # must return 0
kill %1
```

---

## AUDIT STATUS

| Phase | Domain | Status | Dev Commit |
|---|---|---|---|
| 1-6 | Broad refactor (~97k lines removed) | complete | various |
| A | Auth/session | complete | 5c7aef271 |
| B | Financial flows | complete | 9273a3af3 |
| C | Scheduling/shift | complete | 443e8bce2 |
| D | Trinity action flows | complete | 0db5ac212 |
| E | Documents/compliance | complete | 3fca1f009 |
| F | Notifications/broadcasting | complete | 3f868caef |
| G | Integrations (Plaid, QB, Stripe) | complete | e9e0e20a2 |
| H | Admin routes, upload security, platform guards | verified + Codex hardened | 8aca7e864 + Codex |
| I | Jobs, workers, queues, schedulers | NOT STARTED | - |

---

## CODEX PHASE H VERIFICATION RESULT

Result: Phase H is verified after Codex hardening below. Not AUDIT COMPLETE yet:
Phase I jobs/workers/queues/schedulers still needs a whole-domain sweep.

Codex reconciled branch drift by merging latest `origin/development` into the
Codex verification branch, then fast-forwarding/reviewing Copilot's helper branch.

### Phase H Verified

- `server/routes/bulk-operations.ts`
  - Import endpoints now require `requireAuth` + `requireManager`.
  - Multer memory upload has 5 MB cap.
  - CSV/Excel MIME and extension guard exists.

- `server/routes/platformFeedbackRoutes.ts`
  - Survey creation route has `requirePlatformStaff`.
  - Codex hardened the rest of the platform-feedback surface; see below.

- `server/routes/adminRoutes.ts`
  - Mounted `/api/admin/dev-execute` route now has explicit production hard block.
  - Token check remains constant-time and command whitelist-only.

### Codex Hardening Applied

1. `server/routes/adminRoutes.ts`
   - Added production hard block directly to the mounted `/api/admin/dev-execute`
     route. The separate `adminDevExecuteRoute.ts` already had this guard, but
     Codex did not find that route mounted. The mounted route needed the fix.

2. `server/routes/platformFeedbackRoutes.ts`
   - Added `requireAuth` to the platform feedback router.
   - Added `requirePlatformStaff` to admin list/update/analytics routes:
     `GET /surveys`, `PUT /surveys/:id`, `GET /analytics`.
   - Removed trust in body-supplied `workspaceId` for feedback responses; response
     attribution now uses authenticated request workspace context.

3. `server/lib/isDeliverableEmployee.ts`
   - Accepted Copilot helper, then normalized `status` with trim/lowercase before
     checking blocked lifecycle states.

4. `server/services/scheduling/index.ts`
   - Latest development merge removes the previously truncated export tail that
     blocked TypeScript parsing.

---

## COPILOT WORK REVIEWED + INTEGRATED

Copilot branch: `origin/copilot/refactor-service-layer` at `6911e96b`.

Codex reviewed and integrated the helper branch into the audit branch. Do not PR
merge Copilot directly to `development`; Claude should integrate the reviewed
audit branch instead.

### Accepted

- `server/lib/isDeliverableEmployee.ts`
  - Shared helper for active/not-blocked employee lifecycle checks.
  - Applied in:
    - `server/services/trinity/preExecutionValidator.ts`
    - `server/services/universalNotificationEngine.ts`
    - `server/services/ops/panicAlertService.ts`

- Zod safeParse sweep in:
  - `server/routes/timeEntryRoutes.ts`
  - `server/routes/time-entry-routes.ts`
  - `server/routes/clientRoutes.ts`
  - `server/routes/contractPipelineRoutes.ts`
  - `server/routes/contractRenewalRoutes.ts`

- Security test stubs in `tests/security/`:
  - notification ACK ownership
  - panic alert state transitions
  - broadcast token double-accept
  - Plaid employee ownership

### Notes for Claude

- Copilot test stubs use `it.todo()` and are scaffolds only. Wire real fixtures
  when test infrastructure is ready.
- Keep an eye on Zod numeric form fields. Codex did not broaden every schema to
  `z.coerce.number()` because that should match the actual frontend payloads.

---

## PHASE I - JOBS / WORKERS / QUEUES / SCHEDULERS

Claude executes this next after integrating Codex-reviewed changes into
`development`.

### Known background job files to audit

```text
server/jobs/                                   if present
server/services/shiftMonitoringService.ts     auto-replacement, NCNS detection
server/services/automation/                   workflow automations
server/services/automation/loneWorkerSafetyService.ts
server/services/fieldOperations/presenceMonitorService.ts
server/services/ai-brain/seasonalSubagent.ts
server/services/ai-brain/approvalResumeOrchestrator.ts
server/services/helpOsQueue.ts
server/services/billing/platformAIBudgetService.ts
server/services/queueManager.ts               if present
server/services/retryService.ts               if present
```

### What to check per job/worker

- Every scheduled job scopes tenant data by `workspaceId`.
- Cron/interval timing is configurable or deliberately documented.
- Workers handle errors without crashing the process.
- Intervals/timers clear on shutdown and do not duplicate on hot reload/import.
- Financial jobs use `FinancialCalculator`, never raw money math.
- Scheduling jobs use `schedulingMath.ts`, never raw duration math.
- Notification jobs respect consent, workspace isolation, and delivery idempotency.
- Queue consumers have retry limits, dead-letter behavior, and duplicate protection.
- State transitions use expected-status guards.
- Multi-table job writes use `db.transaction()`.

---

## QUEUED - POST-AUDIT ENHANCEMENT SPRINT

After Codex signals AUDIT COMPLETE:

1. RBAC + IRC mode consolidation: RBAC owns permissions, room type owns behavior.
2. Action registry to fewer than 300 actions.
3. Compliance report PDF service.
4. Compliance document vault intake service.
5. ChatDock full enhancement sprint:
   durable store, Redis pub/sub, FCM/RCS/SMS fallback, typed events, receipts,
   acknowledgments, replies, emoji reactions, pins, polls, media gallery, archive,
   search, presence, HelpAI scheduled messages, shift close cards, moderation,
   report queue, legal hold, evidence export, live call, voice notes.
6. Holistic audit of ChatDock, email, online forms, PDF generation, tax forms,
   paychecks, ACH deposits, portals, dashboards, login/logout/session persistence,
   and every action button/icon workflow.
7. Trinity biological brain wiring enhancement.
8. UI polish: update toast, seasonal effects, mobile offline.

Skip entertainment chat features: stickers, games, themes, word effects.
Keep operational expression: emoji reactions, emoticons, picker, seen,
acknowledged, reviewed states.

---

## STANDARD: NO BANDAIDS

```text
No raw money math: FinancialCalculator only.
No raw scheduling duration math: schedulingMath.ts only.
No workspace IDOR: every tenant query scoped by workspaceId.
No state transition without expected-status WHERE guard.
No user-facing legacy branding.
Every generated document = real branded PDF saved to tenant vault.
Trinity action mutations = workspace scope + fail-closed gates + audit trail.
Trinity is one individual. No mode switching.
HelpAI is the only bot field workers see.
One domain, one complete sweep, one coherent commit.
Jobs/workers/queues are part of every domain.
```
