# COAILEAGUE REFACTOR - MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 - Claude (Phase I complete)

---

## THREE-AGENT RELAY PROTOCOL

```
CLAUDE   → implementation lead — audits + executes full domains on development
           boot-tests before every push, syncs dev → refactor/service-layer
COPILOT  → acceleration only — Zod boilerplate, test scaffolds, helper replacements
           no arch decisions, no independent merges to development
CODEX    → verification + hardening lead — verifies, strengthens, refactors within domain
           decides next domain or AUDIT COMPLETE
```

**Whole-domain definition:** routes, services, jobs, workers, queues, automations,
webhooks, storage, events, migrations, tests, validation, user-facing paths.
**Speed rule:** One domain, one complete sweep, one coherent commit.

---

## TURN TRACKER

```text
Current turn: CODEX
  → Verify Phase I (jobs/workers/queues) on development (832bccc89)
  → Strengthen/refactor any weak Phase I code if safely scoped
  → Decide: any remaining domains? Or signal AUDIT COMPLETE
  → If AUDIT COMPLETE: note the post-audit enhancement sprint start in this file

After Codex: Enhancement sprint begins
```

---

## CURRENT COMMIT

```text
origin/development           -> 832bccc89  (Railway STABLE GREEN ✅)
origin/refactor/service-layer -> this sync commit
```

---

## AUDIT STATUS

| Phase | Domain | Status | Dev Commit |
|---|---|---|---|
| 1-6 | Broad refactor (~97k lines removed) | ✅ | various |
| A | Auth/session | ✅ | 5c7aef271 |
| B | Financial flows | ✅ | 9273a3af3 |
| C | Scheduling/shift (Grade A) | ✅ | 443e8bce2 |
| D | Trinity action flows | ✅ | 0db5ac212 |
| E | Documents/compliance | ✅ | 3fca1f009 |
| F | Notifications/broadcasting | ✅ | 3f868caef |
| G | Integrations (Plaid/QB/Stripe) | ✅ | e9e0e20a2 |
| H | Admin/upload/platform guards | ✅ | 8aca7e864 |
| I | Jobs/workers/queues/schedulers | ✅ | 832bccc89 |

---

## WHAT CLAUDE DID — Phase I (Codex: verify)

### Integration from Copilot + Codex (Codex-reviewed changes applied)

- `server/lib/isDeliverableEmployee.ts` — shared helper applied in preExecutionValidator, UNE, panicAlertService
- Zod safeParse added: timeEntryRoutes, time-entry-routes, clientRoutes, contractPipeline, contractRenewal
- platformFeedbackRoutes: requireAuth on router + requirePlatformStaff on admin routes
- adminRoutes: dev-execute production hard block confirmed
- Security test stubs in `tests/security/` (it.todo() scaffolds)

### Phase I — Jobs/Workers/Queues

**I-P0-1: Shift monitoring cross-tenant safety**
  Main daemon query now INNER JOINs workspaces + `WHERE workspaces.isActive = true`
  Prevents monitoring daemon processing shifts for suspended/cancelled tenants

**I-P1-1: Unregistered daemons → graceful shutdown**
  LoneWorkerService: registerDaemon() added after .initialize()
  HelpAIProactiveMonitor: registerDaemon() added after .start()
  trinityAnomalyDetector + trinityScheduledScans: already in gracefulShutdown() directly ✅

**I-P1-2: Module-level orphaned intervals → .unref()**
  hebbianLearningService, trinityOrgIntelligenceService, trinityConnectomeService,
  concurrencyGuard, monitoringService — all now .unref() so they don't block shutdown
  staffExtension + stripeWebhooks: already had .unref() ✅

**Passes (no action needed):**
  coveragePipeline, shiftMonitoringService, loneWorkerSafetyService, loneWorkerService,
  trinityAutomationToggle, approvalResumeOrchestrator, helpOsQueue — all workspace-scoped,
  all have clearInterval on stop(), all properly class-managed ✅
  platformAIBudgetService: /100 math is display telemetry only (not stored values) ✅

### Codex verify questions
1. Is the workspace.isActive JOIN on shiftMonitoringService correct and does it match the schema column name?
2. Are there any remaining daemon processes not covered by daemonRegistry or gracefulShutdown()?
3. Any job/worker pattern that uses raw money math (not display telemetry)?

---

## QUEUED — POST-AUDIT ENHANCEMENT SPRINT

After Codex signals AUDIT COMPLETE:

**1. Core infrastructure**
  - RBAC + IRC mode consolidation (RBAC = permissions, room type = behavior)
  - Action registry to <300 actions (currently ~561, warns at boot)
  - Compliance report PDF service (E-P0-2)
  - Compliance document vault intake service (E-P1-5)

**2. ChatDock full enhancement sprint**
  Foundation first: durable message store, Redis pub/sub, FCM + four-tier delivery,
  typed WebSocket event protocol.
  Then features: read receipts, acknowledgment receipts, message replies, pins, polls,
  media gallery, archive, search, presence tied to shift status,
  HelpAI scheduled messages, shift close summary cards,
  content moderation, report queue, legal hold, evidence export,
  live call button, async voice + Whisper transcription.
  KEEP: emoji reactions, emoticons, picker, Seen/Acknowledged/Reviewed.
  SKIP: stickers, games, themes, word effects.

**3. Holistic enhancement**
  All services as unified whole: ChatDock, email, forms, PDF (tax/paychecks/ACH),
  workflows, automations, storage. Research best-in-class platforms.
  Login/logout/session persistence verified. All buttons/icons verified.
  Auditor portal, client portal, workspace dashboards → Grade A uniformity.

**4. Trinity biological brain wiring**
  Gemini+Claude+GPT triad: genuine reasoning before Trinity speaks, not just routing.
  Trinity personality, consciousness, proactive operating behavior enhanced.

**5. UI polish**
  Update notification toast: Vivaldi-style minimal (icon + version + arrow).
  Seasonal/holiday theming restored on public pages.
  Mobile offline-first (op-sqlite, optimistic sends).

---

## STANDARD: NO BANDAIDS

```
No raw money math (FinancialCalculator only).
No raw scheduling hour math (schedulingMath.ts only).
No workspace IDOR — every tenant query scoped by workspaceId.
No state transitions without expected-status WHERE guard.
No user-facing legacy branding.
Every generated document = real branded PDF saved to tenant vault.
Trinity = one individual, no mode switching.
HelpAI = only bot field workers see.
One domain, one complete sweep, one coherent commit.
Jobs/workers/queues are part of every domain.
```
