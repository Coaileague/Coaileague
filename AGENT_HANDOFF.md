# COAILEAGUE - MASTER HANDOFF
# ONE FILE. Update in place. Never create new handoff files.
# Last updated: 2026-04-28 - Codex (extended route cleanup + Copilot architecture TODOs logged)

---

## THREE-AGENT RELAY PROTOCOL

```
CLAUDE   -> implementation lead on development (domain fixes, UI polish, boot tests)
CODEX    -> verification + hardening lead (audits, refactors, weak-code removal)
COPILOT  -> acceleration only (Zod schemas, test scaffolds, repeated patterns)
```

Whole-domain = routes, services, jobs, workers, queues, automations, webhooks,
storage, events, migrations, tests, validation, and user-facing paths.
One domain, one complete sweep, one coherent commit.

---

## TURN TRACKER

```
Current state: PARALLEL LANES
  Claude - Email entity context panel + Trinity suggested actions landed on development.
  Codex  - Extended domain route mount condensation complete on refactor/service-layer.
  Copilot - Queued for narrow Zod/test batches only after the current lane is stable.

Next merge target:
  Codex pushes refactor/service-layer only.
  Claude reviews/merges into development with build + boot validation.
```

---

## CURRENT COMMITS

```
origin/development           -> 656e9750  (latest Claude demo-account startup fix)
origin/refactor/service-layer -> Codex extended route cleanup + Copilot architecture TODOs
local Codex lane             -> synced with origin/refactor/service-layer before patching
```

Boot test before any push to development:
```bash
node build.mjs
node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health  # must return {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt  # must return 0
kill %1
```

---

## PLATFORM STATUS - VERIFIED CLEAN

**62/62 features from features page verified present in codebase.**
**No feature was removed during audit phases A-I or Phase 0 registry consolidation.**

Registry: 143 handlers, 137 Trinity-visible, 0 duplicates, under the 300 cap.
Log fixes: 0 thought recording errors, 0 billing canary false positives.
All audit hardening phases A-I are deployed and stable.

---

## PHASE 1A - CLAUDE AUDIT RESULTS

### Scheduling Pipeline: Grade A
26/27 checks pass. The single reported failure was a false positive: the state
machine uses `eq(status, "submitted")` conditional WHERE, which correctly guards
the expected prior state for that transition.

Backend scheduling verified:
- `schedulingMath.ts` in use for hours, overtime, and GPS math.
- Timesheet state transitions are atomic with conditional WHERE + 409 on race.
- Shift monitoring filters to active workspaces only.
- Coverage pipeline is workspace-scoped and stoppable.
- Orchestrated schedule endpoints are workspace-scoped.
- Trinity action catalog has `fill_open_shifts`, `generate_schedule`, and `scheduling.*`.

Schedule UI status:
- `client/src/pages/universal-schedule.tsx` has drag/drop, week view, shift creation, overtime warnings, Trinity auto-fill, bulk publish, and templates.
- `client/src/pages/schedule-mobile-first.tsx` exists for mobile scheduling.

Remaining Phase 1A enhancement gaps:
- Trinity <-> Schedule data pipeline end-to-end verification.
- Shift room auto-creation on schedule publish.
- Schedule -> Payroll -> Invoice smoke test.
- Color-coded shift status indicators in grid.
- Fast add-shift flow: client + site + time + officer in fewer than 5 taps.
- Client transparency mode per shift.

### Email UI: Enhance Existing, Do Not Rebuild
`client/src/components/email/EmailHubCanvas.tsx` already has operational channel
folders, Trinity panel, compose, thread view, and sub-address routing.

Email polish status:
- Done on development: entity context panel and Trinity suggested actions.
- Remaining: channel tab bar, pre-drafted Trinity reply, action-needed/urgent/PDF tags, and smart views.

Claude owns email polish. Codex must not edit:
- `client/src/components/email/EmailHubCanvas.tsx`
- `client/src/pages/inbox.tsx`
- `client/src/components/email/`

---

## CODEX HOLISTIC CONSOLIDATION SWEEP 1 - HARNESS COMPLETE

**Result:** Complete on `refactor/service-layer` as a safe audit/coordination commit.
It adds a repeatable scanner and owner lanes without changing runtime behavior.

Command:
```bash
npm run audit:consolidation
```

Windows Codex fallback:
```powershell
& "C:\Users\txpsi\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" scripts\audit\holistic-consolidation-audit.mjs
```

Files changed by Codex harness:
- `scripts/audit/holistic-consolidation-audit.mjs`
- `package.json`
- `AGENT_HANDOFF.md`

Current scan result:
- 2,157 files scanned.
- P0: 2 coordination blockers.
- P1: 63 hardening/refactor candidates.
- P2: 1 large-file decomposition inventory.

### P0 - Codex Owns: RBAC + IRC Mode Consolidation
Finding: IRC/mode code still appears in permission-sensitive ChatDock surfaces.

Evidence examples:
- `server/services/ircEventRegistry.ts` includes admin-style IRC concepts such as kick, ban, mute, promote, and auth.
- `server/services/chatParityService.ts` still reasons about who can join rooms.
- `server/routes/chat-management.ts` has role/room mutation paths that must route through RBAC helpers.

Fix direction:
- RBAC owns all permission decisions.
- Room type owns behavior only: Shift Room, Team Channel, Direct Message.
- IRC/mode strings become internal routing metadata only.
- Do not rewrite `server/websocket.ts` until ChatDock durable foundation has tests.

### Codex Patch - RBAC/IRC Consolidation, Safe Slice
This turn intentionally avoided the WebSocket core and Claude's email files.

Files changed:
- `server/services/chatParityService.ts`
  - Removed local hard-coded `MANAGEMENT_ROLES` and `PLATFORM_STAFF_ROLES`.
  - Delegates role classification to shared RBAC helpers from `@shared/config/rbac`.
- `server/services/chat/chatPolicyService.ts`
  - Derives support staff and workspace leadership groups from shared RBAC `ROLE_GROUPS`.
  - Keeps the existing chat policy API so route callers do not churn.
- `server/services/roomLifecycleService.ts`
  - Accepts optional `platformRole` and passes it into `chatParityService.canCloseRoom()`.
  - Fixes the double-check bug where platform staff could pass the route guard but fail service validation because platform role was dropped.
- `server/routes/chat-rooms.ts`
  - Forwards the authenticated user's platform role into room lifecycle close.
- `scripts/audit/holistic-consolidation-audit.mjs`
  - Narrows the RBAC/IRC scanner to real IRC/mode permission surfaces instead of generic role strings.

Remaining RBAC/IRC work:
- `server/websocket.ts` still has mode/IRC permission-sensitive logic. Leave it for the ChatDock durable-foundation sprint because that file is large and needs pinned tests before refactor.
- `server/services/ircEventRegistry.ts` still exposes IRC-style moderation events. Keep as internal event metadata for now; do not let it become a permission source.

Validation:
- `npm run audit:consolidation` passes.
- `node build.mjs` passes.
- `git diff --check` clean.

### P0 - Claude Owns Later: ChatDock Durable Foundation
Direct WebSocket/in-memory broadcast patterns remain around ChatDock. Before
read receipts, reactions, polls, media gallery, or voice:
- Add durable message store with per-room sequence numbers.
- Add Redis pub/sub under `broadcastToWorkspace` for multi-replica Railway.
- Add FCM push before RCS/SMS fallbacks.
- Add typed WebSocket events.

### P1 - Copilot Owns: Zod Boundary Sweep
Scanner surfaced route files where mutation handlers read `req.body` without an
obvious local `z.object(...).safeParse(req.body)` boundary.

First batches:
- Chat: `chat-management.ts`, `chat-rooms.ts`, `chat-uploads.ts`, `chat.ts`, `chatInlineRoutes.ts`.
- Admin/AI: `adminRoutes.ts`, `ai-brain-routes.ts`, `aiBrainControlRoutes.ts`, `aiBrainInlineRoutes.ts`.
- Billing: `billing-api.ts`, `billingSettingsRoutes.ts`, `budgetRoutes.ts`.

### P1 - Codex Owns: Route Mount, PDF/Vault, Payroll/ACH
- Review duplicate route mounts in `server/routes/domains/*` one domain at a time.
- Verify document/tax/paystub routes produce branded PDFs and persist to tenant vault.
- Verify payroll/ACH/Plaid/paystub path for FinancialCalculator, idempotency, workspace ownership, and vault persistence before notification/transfer.

### P1 - Pre-Polish Architecture Leftovers From Copilot
These are larger refactors and should be handled before the broad polish sprint
unless Bryan explicitly defers them. They are the remaining architecture-grade
items after route mount condensation, registry consolidation, and audit phases.

ARCH-01 - Automation tracking truth-source consolidation:
- Current issue: `automationEventsService`, `workflowLedger`, and
  `automationExecutionTracker` are disconnected tracking systems.
- Risk: operators can see different execution states depending on which surface
  reads which tracker; retry/audit semantics stay hard to reason about.
- Fix direction: choose one canonical execution ledger, define adapters for
  legacy readers, and migrate callers domain by domain. Codex should map all
  writers/readers first; Claude implements the canonical service/migration after
  the map is reviewed. Copilot can scaffold tests around known event sequences.

WIRE-01 - Real automation retry execution:
- Current issue: `automationEventsService` retry is cosmetic; it records retry
  intent/status but does not reliably re-execute the failed work.
- Risk: UI can imply recovery while the underlying automation never ran again.
- Fix direction: retry must enqueue or call the canonical executor with
  idempotency keys, max-attempt policy, error capture, and durable status
  transitions. No "retry" label without real re-execution.

WIRE-04 - Approval gate durability:
- Current issue: approval gate lookup is in memory only and has no DB fallback
  after restart.
- Risk: Railway restart can orphan pending approval flows or cause Trinity to
  lose the reason/state for a blocked action.
- Fix direction: persist pending approvals with workspaceId, actor, action,
  payload hash, status, created/expires timestamps, and resume metadata. On
  startup, hydrate or reconcile pending approvals from DB.

STUB-01 - Workflow progress must be real:
- Current issue: `workflowStatusService.ts` still returns hardcoded progress.
- Risk: dashboards and Trinity status summaries can show fake confidence.
- Fix direction: derive progress from canonical workflow steps/ledger rows, or
  mark unknown explicitly. Hardcoded progress is not acceptable pre-live.

STUB-03 - Admin hourly rate persistence:
- Current issue: admin hourly rate is not persisted to DB.
- Risk: billing/cost/admin views can drift from configured reality after restart
  or redeploy.
- Fix direction: schema-backed setting with workspace/platform scope, audit log,
  validation, and migration/defaults. Requires schema work, so do not patch with
  another in-memory fallback.

Completion rule:
- The codebase-wide refactor/condense phase is not fully closed until these
  five items are either fixed and boot-validated or explicitly moved to a
  documented post-live hardening bucket by Bryan. After these are resolved,
  the remaining work becomes polish, UX uniformity, portal upgrades, and feature
  enhancement rather than structural cleanup.

### Codex Patch - Domain Route Mount Condensation, Safe Slice
This turn condensed repeated domain mount guard stacks without changing any route
prefix, router order, or handler implementation.

Files changed:
- `server/routes/domains/routeMounting.ts`
  - New `mountWorkspaceRoutes()` helper for the repeated
    `requireAuth + ensureWorkspaceAccess + router` mount pattern.
- `server/routes/domains/billing.ts`
- `server/routes/domains/clients.ts`
- `server/routes/domains/comms.ts`
- `server/routes/domains/ops.ts`
- `server/routes/domains/orgs.ts`
- `server/routes/domains/payroll.ts`
- `server/routes/domains/sales.ts`
- `server/routes/domains/scheduling.ts`
- `server/routes/domains/workforce.ts`

Validation:
- `node build.mjs` passes.
- `npm run audit:consolidation` passes.
- Consolidation scanner P1 count dropped from 63 to 55.
- `git diff --check` clean.

Claude review focus:
- Confirm mount order is unchanged in each touched domain file.
- Run boot validation after merge to `development`.

### Codex Patch - Domain Route Mount Follow-Up, Safe Slice
This turn continued the same mount-only cleanup across the remaining high-signal
domain files. No route prefixes, handler bodies, middleware semantics, or public
APIs were rewritten.

Files changed:
- `server/routes/domains/audit.ts`
  - Centralized remaining plain `requireAuth + ensureWorkspaceAccess` `app.use`
    mounts for alerts config, dashboard, audit, analytics, deletion protection,
    and insights.
  - Left intentional exceptions alone: export-limited reports route, platform
    staff routes, unauthenticated/public platform routes, and inline audit
    handlers.
- `server/routes/domains/compliance.ts`
  - Centralized compliance/document/SPS/insurance workspace route mounts.
  - Removed the literal duplicate `/api/sps/onboarding` mount while preserving
    `/api/sps/onboarding` and `/api/sps/forms` order.
  - Preserved public SPS and regulatory portal mounts unchanged.
- `server/routes/domains/time.ts`
  - Centralized workspace-scoped time entry, breaks, timesheet report, and
    mileage mounts.
  - Preserved the primary `timeEntryRouter` defense-in-depth auth mount and
    the internally guarded `timeOffRouter`.
- `server/routes/domains/trinity.ts`
  - Centralized Trinity workspace-scoped AI brain, staffing, chat/session,
    audit, automation, execution, control tower, quick fixes, VQA, and
    agent-activity mounts.
  - Left platform-staff, Trinity-access, bot/platform-role, public webhook,
    and unauthenticated inline mounts unchanged.

Validation:
- `node build.mjs` passes.
- `npm run audit:consolidation` passes through the bundled Node runtime.
- Consolidation scanner P1 count dropped from 55 to 48.
- `git diff --check` clean.

Claude review focus:
- Confirm mount order stayed identical in `audit.ts`, `compliance.ts`,
  `time.ts`, and `trinity.ts`.
- Run boot validation after merge to `development`.

### P2 - Large File Decomposition Inventory
Largest surviving files:
- `server/storage.ts`
- `server/websocket.ts`
- `server/services/ai-brain/aiBrainMasterOrchestrator.ts`
- `client/src/pages/settings.tsx`
- `server/routes/voiceRoutes.ts`

Rule: split only after tests pin behavior and only by domain boundary. No cosmetic churn before live.

---

## CODEX PARALLEL LANE - CURRENT FILE GUARDRAILS

Codex may touch:
- `server/routes/domains/`
- `server/services/ircEventRegistry.ts`
- `server/services/chatParityService.ts`
- Chat/RBAC helper files when needed
- Server compliance, payroll, ACH, PDF/vault audit files in later commits

Codex should avoid while Claude is polishing:
- `client/src/components/email/EmailHubCanvas.tsx`
- `client/src/pages/inbox.tsx`
- `client/src/components/email/`

Claude should avoid while Codex is hardening:
- `server/routes/domains/`
- `server/services/ircEventRegistry.ts`
- `server/services/chatParityService.ts`
- `server/websocket.ts`

---

## ACTIVE WORK - EMAIL POLISH (Claude)

Entity context panel landed in `EmailHubCanvas.tsx` on development.

Remaining email polish:
- Channel tab bar.
- Pre-drafted Trinity reply.
- Action-needed / urgent / PDF tags on inbox rows.
- Smart views.

Use existing components and routes where possible. Do not create a duplicate email hub.

---

## ENHANCEMENT SPRINT PRIORITY

**EMAIL** (current)
- Entity context panel. (done)
- Channel tab bar.
- Trinity suggested actions. (done)
- Pre-drafted replies.
- Tags on inbox rows.
- Smart views.

**SCHEDULE Phase 1A**
- Trinity <-> schedule pipeline E2E verification.
- Shift room auto-creation on publish.
- Color-coded shift status indicators.
- Fast add-shift modal.

**CHATDOCK**
- Redis pub/sub foundation.
- Durable message store.
- FCM + four-tier delivery.
- Read receipts, replies, reactions/emotes.
- Content moderation + legal hold.
- RBAC owns permissions; room type owns behavior.

**PORTALS**
- Workspace dashboard Grade A.
- Client portal read-only surface.
- Auditor portal PDF reports.

**HOLISTIC UX**
- All buttons/icons verified for coherent action outcomes.
- Forms mobile-optimized.
- Toast/error/success polish.
- No duplicate UI services.

**TRINITY BRAIN**
- Triad genuine reasoning.
- Proactive operating behavior.
- One unified Trinity personality, no mode switching.

---

## STANDARD: NO BANDAIDS

```
No raw money math - FinancialCalculator.
No raw scheduling hour math - schedulingMath.ts.
No workspace IDOR.
No state transitions without expected-status guard.
No user-facing legacy branding.
Every generated document = real branded PDF in tenant vault.
Trinity = one individual, no mode switching.
HelpAI = only bot field workers see.
One domain, one complete sweep, one coherent commit.
No duplicate UI services - edit what exists, do not create parallel versions.
```
