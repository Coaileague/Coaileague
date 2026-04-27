# COAILEAGUE REFACTOR - MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 - Claude (protocol expanded, jobs included, roles clarified)

---

## THREE-AGENT RELAY PROTOCOL

### Roles

**CLAUDE — Implementation lead (executes on `development`)**
- Audits + executes entire domains
- Boot-tests before every push
- One domain = one complete sweep = one coherent commit
- Syncs `development → refactor/service-layer` after every turn

**COPILOT — Acceleration helper (works on `refactor/service-layer`)**
- Narrow, repeated boilerplate only: Zod schemas, test scaffolds, helper replacements, repeated guard patterns
- Accelerates what Claude/Codex define — no architecture decisions, no merges to development independently
- Documents every change with line numbers before Claude integrates

**CODEX — Verification + hardening lead (works on `refactor/service-layer`)**
- Verifies Claude's fixes are correct and complete
- Strengthens weak code, removes bandaids, refactors within same domain
- Documents exact risks, line numbers, and either makes the fix on `refactor/service-layer` OR gives Claude exact instructions
- Decides: next domain needed? Or AUDIT COMPLETE?
- After Codex patches code, Claude integrates on `development` (or documents why a different implementation was used)

### Whole-Domain Definition

Every domain sweep must cover ALL of these before marking done:
```
Routes           → all HTTP endpoints, middleware, guards
Services         → business logic, calculations, transformations
Jobs             → cron jobs, scheduled tasks, recurring automations
Workers          → background workers, queue consumers, processors
Queues           → message queues, job queues, retry logic
Automations      → workflow automations, triggers, pipelines
Webhooks         → inbound/outbound webhook handlers
Storage          → file storage, vault, blob handling
Events           → platform event bus, event handlers, listeners
Migrations       → any DB changes implied by fixes
Tests            → test stubs or tests for critical paths
Validation       → Zod at every API boundary
User-facing paths → confirm workflows produce intended outcomes end-to-end
```

### Speed Rule
**One domain, one complete sweep, one coherent commit. Nothing left half-done.**

### Ownership Rule
No two agents edit the same files simultaneously.

---

## TURN TRACKER

```text
Current turn: COPILOT
  → Read this handoff
  → Narrow boilerplate targets (see Copilot Scope below)
  → Commit findings/changes to refactor/service-layer
  → Update this file with what was done and what's next

After Copilot: CODEX
  → Verify Phase H (bulk-operations, platform feedback, dev-execute)
  → Strengthen any weak Phase H code
  → Scan for any remaining domains not yet audited
  → Signal AUDIT COMPLETE or document Phase I targets
```

---

## CURRENT COMMIT

```text
origin/development           -> 8aca7e864  (Railway STABLE GREEN ✅)
origin/refactor/service-layer -> 16f21237d  (Codex role clarification)
```

Boot test (run before every push to development):
```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node build.mjs && node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18 && curl -s http://localhost:5000/api/workspace/health   # → {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt  # → 0
kill %1
```

---

## AUDIT STATUS — ALL PHASES

| Phase | Domain | Status | Dev Commit |
|---|---|---|---|
| 1-6 | Broad refactor (~97k lines removed) | ✅ | various |
| A | Auth/session (11 null-deref fixes) | ✅ | 5c7aef271 |
| B | Financial flows (Zod, transactions, FinancialCalc) | ✅ | 9273a3af3 |
| C | Scheduling/shift (Grade A, schedulingMath.ts) | ✅ | 443e8bce2 |
| D | Trinity action flows (validator, dual-AI, payroll gate) | ✅ | 0db5ac212 |
| E | Documents/compliance (PDF vault, signing, auditor portal) | ✅ | 3fca1f009 |
| F | Notifications/broadcasting (SMS consent, panic chain, NDS race) | ✅ | 3f868caef |
| G | Integrations (Plaid, QB, Stripe) | ✅ | e9e0e20a2 |
| H | Admin routes, upload security, platform guards | ✅ | 8aca7e864 |
| **I** | **Jobs, workers, queues, schedulers** | **🔄 NOT STARTED** | — |

**Queued Phase I target: background jobs and workers**

---

## COPILOT SCOPE (narrow — acceleration only)

Suggested targets — all narrow, repeated patterns:

**1. Shared isDeliverableEmployee helper**
Create `server/lib/isDeliverableEmployee.ts`:
```ts
export function isDeliverableEmployee(emp: { isActive: boolean; status?: string }): boolean {
  const BLOCKED = ['terminated','inactive','deactivated','suspended'];
  return emp.isActive === true && !BLOCKED.includes(emp.status || '');
}
```
Then replace the 3 duplicate `isActive + status` checks in:
  - `server/services/trinity/preExecutionValidator.ts`
  - `server/services/universalNotificationEngine.ts`
  - `server/services/ops/panicAlertService.ts`

**2. Zod schema sweep — remaining manual destructuring**
Search: `const { ... } = req.body` without a preceding `.safeParse()`
Priority files:
  - `server/routes/timeEntryRoutes.ts`
  - `server/routes/incidentRoutes.ts`
  - `server/routes/clientRoutes.ts`
  - `server/routes/contractRoutes.ts`
Add minimal Zod object schemas and wire `.safeParse()`. Document changes.

**3. @ts-expect-error cleanup**
Search: `// @ts-expect-error — TS migration: fix in refactoring sprint`
For each: check if the underlying type issue is trivially fixable.
If yes: fix and remove the comment.
If no: leave and note in handoff.

**4. Test stubs for critical security fixes**
Add stub test files (no test runner required yet) at `server/tests/`:
  - `security/notificationAckOwnership.test.ts` — ack IDOR
  - `security/panicAlertStateTransitions.test.ts` — double-ack/resolve
  - `security/broadcastTokenDoubleAccept.test.ts` — concurrent accept
  - `security/plaidEmployeeOwnership.test.ts` — self vs manager link
Document what each test should assert — Claude will wire to test runner.

**DO NOT:**
- Change auth patterns or architecture
- Merge to development independently
- Touch Trinity persona, action registry, or WebSocket core

---

## PHASE I — JOBS/WORKERS/QUEUES (Claude executes next after Copilot/Codex)

### Known background job files to audit
```
server/jobs/                          (if directory exists)
server/services/shiftMonitoringService.ts  (auto-replacement, NCNS detection)
server/services/automation/            (workflow automations)
server/services/ai-brain/seasonalSubagent.ts
server/services/ai-brain/approvalResumeOrchestrator.ts
server/services/helpOsQueue.ts         (support queue manager)
server/services/billing/platformAIBudgetService.ts
server/services/queueManager.ts        (if exists)
server/services/retryService.ts        (if exists)
```

### What to check per job/worker
- Does every scheduled job scope queries by workspaceId?
- Are cron intervals configurable or hardcoded?
- Do workers handle errors without crashing the whole process?
- Are any intervals not cleared on process shutdown? (memory leak)
- Do financial jobs use FinancialCalculator (not raw math)?
- Do any jobs send notifications without consent/delivery checks?
- Are any jobs duplicating work also done in routes (single source of truth)?

---

## QUEUED — POST-AUDIT ENHANCEMENT SPRINT

After AUDIT COMPLETE signal from Codex:

**Priority 1 — Core Infrastructure**
- RBAC + IRC mode consolidation (RBAC = permissions, room type = behavior)
- Action registry consolidation to <300 (currently ~561, warns at boot)
- E-P0-2: compliance report real PDF service
- E-P1-5: compliance document vault intake service

**Priority 2 — ChatDock Enhancement Sprint**
Full list in Claude's memory. Sequence:
1. Durable message store + Redis pub/sub
2. FCM + four-tier delivery (WS→FCM→RCS→SMS)
3. Typed WebSocket event protocol (Trinity/HelpAI streaming)
4. Read receipts + acknowledgment receipts
5. Reactions, replies, pins, polls, media gallery, archive, search
6. Presence tied to shift status
7. HelpAI scheduled messages + shift close summary cards
8. Moderation + report queue + legal hold + evidence export
9. Live call/radio button (WebRTC wired)
10. Async voice + Whisper transcription
KEEP: emoji, emoticons, picker, Seen/Acknowledged/Reviewed
SKIP: stickers, games, themes, word effects

**Priority 3 — Holistic Enhancement**
- All services as unified whole: ChatDock, email, forms, PDF, workflows, storage
- Login/logout/session persistence verification
- All action-triggering buttons/icons verified
- Auditor portal, client portal, workspace dashboards → Grade A

**Priority 4 — Trinity + UI**
- Gemini+Claude+GPT triad: genuine reasoning (not just routing)
- Seasonal/holiday theming restored on public pages
- Mobile offline-first (op-sqlite, optimistic sends)
- Update notification toast: Vivaldi-style minimal

---

## STANDARD: NO BANDAIDS

```text
No raw money math (FinancialCalculator only).
No raw scheduling hour math (schedulingMath.ts only).
No workspace IDOR — every query scoped by workspaceId.
No state transitions without expected-status conditional WHERE guard.
No user-facing legacy branding (Trinity Schedule, not ScheduleOS).
Every generated document = real branded PDF saved to tenant vault.
Every Trinity action = workspace scope + fail-closed gates + audit trail.
Trinity is one individual. No mode switching.
HelpAI is the only bot field workers see.
One domain, one complete sweep, one coherent commit.
Jobs/workers/queues are part of every domain — nothing left out.
```
