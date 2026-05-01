# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 — Claude (Trinity sweep + push notification fix)

---

## ACTIVE BRANCH — Trinity sweep

```
Branch: claude/fix-trinity-notifications-EVDKv
Scope: Trinity actions, Trinity Voice, Trinity AI surfaces — out-of-scope debt closed.

Round 1 (push notifications, shipped):
  • Android badge silhouette PNG so the status bar stops showing a white square
  • Stable per-(type,workspace,user) push tag — Android collapses repeats
  • 60-s in-memory dedup in deliverPushNotification absorbs fan-out storms
  • SW bumped v4.10.0 / cache v14

Round 2 (Trinity TS-debt sweep, this commit):
  • ConversationMode + chat-time `mode` toggle FULLY RETIRED. The DB column
    `trinity_conversation_sessions.mode` stays at the literal 'business' for
    back-compat; Trinity decides depth/posture from org state, emotional
    signals, and high-stakes keywords. switchMode() removed. ChatRequest /
    ChatResponse / ConversationHistory `mode` field removed. SPIRITUAL_/
    ACCOUNTABILITY_ option tables deleted (their settings page is gone).
  • Trinity Document Actions (28 → 0 errors): structural fix. The 4 elite
    AI actions (contract_analysis, compliance_audit_report,
    incident_investigation_report, officer_performance_review) now call
    claudeService.call() instead of the wrong claudeVerificationService.verify()
    shape. Business document generators (proof_of_employment, direct_deposit_
    confirmation, payroll_run_summary, w3_transmittal, etc.) lifted out of
    `scanOverdueI9s` (they were orphaned where `orchestrator` wasn't in scope)
    into `registerBusinessDocumentGenerators`, called from registerTrinity-
    DocumentActions. Local mkAction helper added. Stub generators return
    structured "not implemented" until the Phase: Business Forms work lands.
  • Trinity Chat Service (21 → 0 errors): legacy mode references removed
    everywhere — destructure, log lines, prompt template strings, RL context,
    DB queries (literal 'business' constant LEGACY_BUSINESS_MODE used at
    insert/select).
  • Trinity Inbound Email Processor (6 → 0): EmailCategory now includes
    'staffing' and 'billing'; prompts/actionMap entries added; bad import
    path '../../universalNotificationEngine' fixed; dead `sql` re-import
    dropped; unused @ts-expect-error directives removed.
  • Trinity Scheduling Routes (6 → 0): null userId guarded; trinity-
    ProposedActions schema-miss cast.
  • Trinity Autonomous Scheduler (5 → 0): SchedulingConfig widened (userId,
    prioritizeBy, useContractorFallback, maxShiftsPerEmployee, respectAvail-
    ability now optional with defaults), call sites use ?? fallbacks. Added
    triggeredBy + sessionId for inbound-email triggered runs.
  • Trinity Context Manager (4 → 0): WorkspaceContext gained tokenBalance/
    tokenAllocation/tokenPercentUsed aliases alongside creditBalance.
  • Trinity ACC Service (2 → 0): callers use `contradictionDescription`
    (the actual field) instead of `description` shorthand.
  • Trinity Tax Compliance Actions (2 → 0): mkTaxAction now returns ActionResult
    shape with required `message` field on both branches.
  • Trinity Content Guardrails (1 → 0): added `legal_advice` refusal copy.
  • Trinity Org State Routes (1 → 0): removed duplicate requirePlatformStaff
    import shadowing the local declaration.
  • Trinity Thought Status Routes (1 → 0): added optional metadata bag to
    OrchestrationContext.
  • Trinity Voice voiceRoutes (2 → 0): replaced `node-fetch` (untyped) with
    Node 20 native fetch; fixed wrong import path
    `voiceEventClassifier` → `voicemailSentimentService`.
  • Action Registry (8 → 0): duplicate `employees` import removed; shift
    select pulls updatedAt for the optimistic-lock check; `c` parameter typed
    explicitly; getContracts return shape unwrapped.
  • Trinity Anomaly Watch (2 → 0): Anomaly interface widened to accept
    title/description/affectedEntity*/metadata fields the call sites use.
  • Universal Notification Engine (3 → 0): sendPlatformUpdate payload type
    gained optional idempotencyKey.
  • shared/config/rbac.ts (2 → 0): PLATFORM_ROLES + PLATFORM_ROLE_LEVEL now
    list system / automation / helpai / trinity-brain (Trinity-tier service
    actors). WORKSPACE_ROLES + WORKSPACE_ROLE_LEVEL now list `client`
    (client-portal users with read-only scoped access).
  • package.json: added `@anthropic-ai/sdk` (Trinity's Claude brain — was
    referenced by ai-brain/trinity-orchestration/claudeService.ts but never
    declared as a dependency).

Net TS impact (server tsconfig): 384 → 293 errors (-91). Trinity-specific
errors: 94 → 1 (the @anthropic-ai/sdk import; resolves at deploy when
npm install runs against the new package.json).

Out-of-scope, deferred (tracked in TS_DEBT.md):
  - 80+ mutating handlers in actionRegistry.ts still missing logActionAudit
    (Section L Phase 18 backlog)
  - High-density non-Trinity files (mascot-routes, authCoreRoutes, chat-rooms,
    sales/engagement/review/calendar routes, paystubService) — those pre-date
    this branch and belong to their domain owners.
```

---

## TURN TRACKER

```
PARALLEL LANES — ALL ACTIVE NOW:

  LANE A — CLAUDE
    Branch: enhancement/lane-a-claude
    Working on: A1 (Scheduling), A2 (Email), A3 (Zod Tier 1)

  LANE B — CODEX
    Branch: enhancement/lane-b-codex
    Working on: B1 (ChatDock durable), B2 (RBAC/IRC), B3 (large files), B4 (middleware)

  LANE C — COPILOT
    Branch: enhancement/lane-c-copilot
    Working on: C1 (ChatDock features), C2 (Zod sweep), C3 (document PDFs)

ARCHITECT: CLAUDE
  → Pulls all agent branches when submitted
  → Reviews diff, verifies correctness, runs build + boot test
  → Merges clean to development
  → Pushes to Railway
```

---

## CURRENT BASE

```
origin/development → 8e02aaf97  (Railway STABLE GREEN ✅)
```

---

## FULL PLAN

See: ENHANCEMENT_SPRINT_PLAN.md (same directory)
Contains: domain map, success criteria, merge protocol, agent assignments

---

## AGENT SUBMISSION FORMAT

When done with a domain, submit using this format:

```
AGENT: {Claude/Codex/Copilot}
BRANCH: enhancement/lane-{x}-{agent}
COMMIT: {sha}
DOMAIN: {what was worked on}
FILES CHANGED: {list — own domain only}
WHAT WAS DONE: {3-5 line summary}
CONFLICTS WITH: none / {list if any}
BOOT TEST: passed / failed
READY TO MERGE: yes
```

---

## DOMAIN OWNERSHIP (prevents conflicts)

**CLAUDE owns:** universal-schedule.tsx, EmailHubCanvas.tsx, inbox.tsx,
  schedulesRoutes, availabilityRoutes, engagementRoutes, uacpRoutes,
  reviewRoutes, mileageRoutes, hrInlineRoutes, permissionMatrixRoutes

**CODEX owns:** websocket.ts, storage.ts, ircEventRegistry.ts,
  chat-management.ts, chatParityService.ts, chatServer.ts,
  chat/broadcaster.ts (new), chat/shiftRoomManager.ts (new)

**COPILOT owns:** ChatDock.tsx and chatdock/ directory,
  chatInlineRoutes, commInlineRoutes, salesInlineRoutes, formBuilderRoutes,
  services/documents/ (PDF), all remaining un-Zodded routes

---

## ARCHITECT MERGE PROTOCOL (Claude executes)

```bash
git fetch origin {agent-branch}:refs/remotes/agent/{lane}
git diff development..agent/{lane} --name-only  # check ownership
git checkout development
git checkout agent/{lane} -- {owned-files-only}
node build.mjs 2>&1 | grep "✅ Server|ERROR"
# boot test
git add {files} && git commit -m "merge: {agent} {domain}"
git push origin development
```

---

## STANDARD: NO BANDAIDS

```
No raw money math. No raw scheduling hour math. No workspace IDOR.
No state transitions without expected-status guard. No stubs/placeholders.
Every button wired. Every endpoint real DB data.
Trinity = one individual. HelpAI = only bot field workers see.
One domain, one complete sweep, one coherent commit.
```
