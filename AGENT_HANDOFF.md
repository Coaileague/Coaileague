# COAILEAGUE REFACTOR - MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 - Codex (Phase I verified + hardening applied; audit complete pending Claude sync)

---

## THREE-AGENT RELAY PROTOCOL

```text
CLAUDE   = implementation lead on development
           integrates reviewed Codex/Copilot changes
           runs build + boot validation before every push
           syncs development -> refactor/service-layer after every turn

COPILOT  = acceleration helper only
           good for repeated Zod/test/helper sweeps after canonical fix is defined
           no architecture calls, no direct development merges

CODEX    = verification + hardening lead on refactor/service-layer
           verifies Claude's domain sweep from remote truth
           strengthens weak code, removes bandaids, performs scoped refactors
           decides next domain or AUDIT COMPLETE
```

Whole-domain definition:
`routes, services, jobs, workers, queues, automations, webhooks, storage, events, migrations, tests, validation, user-facing paths`

Speed rule:
`One domain, one complete sweep, one coherent commit.`

Ownership rule:
`No two agents edit the same files at the same time. Claude integrates reviewed Codex/Copilot work into development.`

---

## TURN TRACKER

```text
AUDIT COMPLETE ✅
  All phases A-I verified and deployed.
  development -> 9a3dbb46b (Railway GREEN)
  Enhancement sprint is the next phase of work.

After Claude: enhancement sprint
  -> Start with scheduling UX + scheduling automation polish
  -> Then ChatDock / portal / Trinity enhancement tracks
```

---

## CURRENT COMMIT STATE

```text
origin/development              -> 9a3dbb46b  (AUDIT COMPLETE — Railway GREEN ✅)
origin/refactor/service-layer   -> this sync commit
```

Boot test before every push to `development`:

```bash
node build.mjs
node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18
curl -s http://localhost:5000/api/workspace/health
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt
kill %1
```

Expected:
- `/api/workspace/health` returns `{"message":"Unauthorized"}`
- grep count returns `0`

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
| G | Integrations (Plaid/QB/Stripe) | complete | e9e0e20a2 |
| H | Admin/upload/platform guards | complete | 8aca7e864 |
| I | Jobs/workers/queues/schedulers | verified + Codex hardened | 832bccc8 + Codex |

Audit verdict:
`Integration audit Phases A-I are AUDIT COMPLETE after Claude syncs Codex hardening into development.`

---

## CODEX PHASE I VERIFICATION RESULT

Result:
`Phase I was close, but not fully complete as synced. Codex verified it, fixed the remaining weak spots on refactor/service-layer, and now considers the audit complete after Claude merges these final hardenings to development.`

### Codex hardening applied in this turn

1. `server/services/automation/shiftMonitoringService.ts`
   - Fixed the Phase I workspace filter to use real workspace control fields.
   - Imported `workspaces` into the query.
   - Replaced the invalid `workspaces.isActive` filter with the actual operational guard:
     `isDeactivated = false`, `isSuspended = false`, `isFrozen = false`, `isLocked = false`, and subscription not `suspended` or `cancelled`.
   - This closes the real tenant-safety bug without introducing a runtime SQL failure on a non-existent column.

2. `server/routes/statusRoutes.ts`
   - `registerBackupVerificationCron()` is now singleton-protected, `.unref()`ed, and stoppable.
   - The module-scope status health loop is now singleton-owned, `.unref()`ed, and stoppable via `stopStatusHealthLoop()`.

3. `server/services/holidayService.ts`
   - `registerDecemberHolidayCron()` is now singleton-protected, `.unref()`ed, and stoppable.

4. `server/index.ts`
   - Registered daemon cleanup for:
     - `DecemberHolidayCron`
     - `BackupVerificationCron`
     - `StatusHealthLoop`
   - Removed the mistaken `LoneWorkerService` daemon registration. `loneWorkerService` is not the recurring worker and has no `stop()` API; `loneWorkerSafetyService` is the actual daemonized safety loop.

### Claude Phase I fixes that Codex verified as good

- `server/index.ts`
  - `HelpAIProactiveMonitor` now registers with daemon shutdown.
- `server/services/ai-brain/hebbianLearningService.ts`
  - Flush timer no longer blocks shutdown.
- `server/services/ai-brain/trinityConnectomeService.ts`
  - Decay timer no longer blocks shutdown.
- `server/services/ai-brain/trinityOrgIntelligenceService.ts`
  - Cleanup timer no longer blocks shutdown.
- `server/services/concurrencyGuard.ts`
  - Idempotency cleanup timer no longer blocks shutdown.
- `server/services/monitoringService.ts`
  - Metrics sampler no longer blocks shutdown.

### Questions resolved by Codex

1. Is the shift-monitoring workspace join correct?
   - Claude's intent was correct, but the exact implementation was not. `workspaces.isActive` is not a real column on the canonical schema. Codex replaced it with the real workspace operational-state guard listed above.

2. Are there remaining daemon processes not covered by the registry or shutdown path in the audited Phase I startup surface?
   - Yes, two cron paths and one status loop were still outside shutdown management:
     - backup verification cron
     - December holiday cron
     - status health loop
   - Codex fixed all three.

3. Any raw money math in the audited Phase I job/worker paths?
   - No new raw money-math violation was found in the Phase I paths Claude audited. The one noted `platformAIBudgetService` percent math remains display telemetry, not stored financial mutation logic.

---

## VALIDATION

- Remote truth fetched before verification:
  - `origin/development` = `832bccc8`
  - `origin/refactor/service-layer` = `255d4401`
- `git diff --check` is clean after Codex edits.
- Targeted TypeScript verification on touched files returned no matching errors after Codex hardening.
- Full repo `tsc --noEmit` still has unrelated pre-existing TypeScript debt outside Phase I scope, including `authCoreRoutes.ts`, `calendarRoutes.ts`, `documentLibraryRoutes.ts`, and others. Those are not blockers for the Phase I audit verdict, but they are still repo debt.

---

## CLAUDE NEXT ACTION

Merge the latest `refactor/service-layer` into `development`, then run build + boot validation.

Files Claude must carry into development from this Codex turn:
- `server/services/automation/shiftMonitoringService.ts`
- `server/routes/statusRoutes.ts`
- `server/services/holidayService.ts`
- `server/index.ts`
- `AGENT_HANDOFF.md`

After that sync:
`Integration audit is complete. Enhancement sprint begins.`

---

## ENHANCEMENT SPRINT - PRIORITY ORDER

### 1. Scheduling UX and automation polish - FIRST

This is the first enhancement track because scheduling is the front door to the rest of Trinity automation.

Required outcomes:
- desktop schedule board with strong drag-and-drop behavior similar to Sling
- mobile scheduling flow optimized for normal touch interactions rather than drag-and-drop
- fast add shift / edit shift / publish shift workflows on both desktop and mobile
- shift publishing must be reliable because downstream automations depend on published schedule truth
- schedule edits must stay coherent with Trinity scheduling automations, reminders, replacements, time tracking, and room creation

### 2. Core infrastructure

- RBAC + IRC mode consolidation
  - RBAC owns permissions
  - room type owns behavior
- Trinity action registry reduced to under 300 actions
- compliance report PDF service
- compliance document vault intake service

### 3. ChatDock enhancement sprint

Foundation first:
- durable message store
- Redis pub/sub
- FCM plus fallback delivery chain
- typed WebSocket event protocol

Then features:
- read receipts
- acknowledgment receipts
- replies
- emoji reactions
- pins
- polls
- media gallery
- archive
- search
- presence tied to shift status
- HelpAI scheduled messages
- shift close summary cards
- moderation
- report queue
- legal hold
- evidence export
- live call button
- async voice notes with transcription

Keep:
- emoji reactions
- emoticons
- picker
- seen / acknowledged / reviewed states

Skip:
- stickers
- games
- themes
- decorative consumer chat effects

### 4. Holistic platform enhancement

- ChatDock
- email
- online forms
- PDF generation
- tax forms
- paychecks
- ACH deposits
- workflows
- automations
- storage
- auditor portal
- client portal
- workspace dashboards
- login/logout/session persistence
- every action button/icon workflow

### 5. Trinity biological brain wiring

- Gemini + Claude + GPT triad should genuinely reason before Trinity speaks
- improve Trinity proactive behavior, operating coherence, and decision quality

### 6. UI polish

- scheduling UI polish comes before broader visual work
- then notification/toast polish
- seasonal public-page theming
- mobile offline-first improvements

---

## STANDARD: NO BANDAIDS

```text
No raw money math - FinancialCalculator only.
No raw scheduling hour math - schedulingMath.ts only.
No workspace IDOR - every tenant query scoped by workspaceId.
No state transitions without expected-status WHERE guard.
No user-facing legacy branding.
Every generated document = branded PDF saved to tenant vault.
Trinity = one individual, no mode switching.
HelpAI = the only bot field workers see.
One domain, one complete sweep, one coherent commit.
Jobs/workers/queues are part of every domain.
```
