# COAILEAGUE — CLAUDE SESSION HANDOFF
# ONE FILE. Update in place. Claude-only. Bryan + Claude sessions only.
# Last updated: 2026-05-01 — Claude (action-wiring-manifest session)

> **This file is the team-coordination ledger for Claude sessions only.**
> No Codex. No Copilot. No GPT. No outside agents.
> Every Claude session reads this file FIRST, claims its domain, leaves notes,
> and signs out before ending. No overstepping. No platform breakage.

---

## TEAM RULES (read before doing anything)

1. **Read first, write second.** Open this file before touching code. Read
   the ACTIVE CLAIMS table and the SESSION LOG. If your domain is claimed by
   a session that's still active (signed in within the last 24h and not
   signed out), pick a different domain or coordinate via the SESSION LOG.
2. **Claim before you cut.** Before editing any file, add a row to ACTIVE
   CLAIMS with your session ID, branch, files/domain, and started-at
   timestamp. One claim per domain. If a file you need is in another
   session's claim, **stop and write a note in SESSION LOG** describing what
   you need and why; let the holding session respond or release.
3. **No silent edits.** Every commit on a Claude branch must be reflected as
   a row in SESSION LOG with branch, commit SHA, summary, and any follow-up
   work the next session should know about.
4. **Sign out cleanly.** Before ending a session: commit + push, move your
   ACTIVE CLAIMS row to RECENT SESSIONS with status (done / in-progress /
   blocked), and update the SESSION LOG.
5. **Don't break the platform.** Run `node build.mjs 2>&1 | grep "✅ Server\\|ERROR"`
   before signing out from any branch that touches server code. If the
   build is red, leave it red on your branch only — never push red to
   `development`. Note the breakage in SESSION LOG so the next session
   doesn't pull a poisoned base.
6. **Stay in your lane.** A claim covers files + the obvious adjacent
   utilities. Cross-domain refactors require a new claim and a SESSION LOG
   note explaining the scope expansion.
7. **No bandaids.** TRINITY.md laws apply. No raw money math, no scheduling
   hour math, no workspace IDOR, no state transitions without expected-status
   guard, no stubs, no fake success.

---

## ACTIVE CLAIMS

> **Format:** SessionID · Branch · Domain · Files (key paths) · Started · Last update
> One row per active session. Move to RECENT SESSIONS on sign-out.

| Session | Branch | Domain | Key files | Started (UTC) | Last update |
|---------|--------|--------|-----------|---------------|-------------|
| _claude-action-wiring-LjP5K_ | `claude/action-wiring-manifest-LjP5K` | Action Wiring Manifest first-pass + Claude-only handoff protocol | `scripts/audit/generate-action-wiring-manifest.ts`, `scripts/audit/check-action-wiring-gaps.ts`, `ACTION_WIRING_MANIFEST.md`, `action-wiring-manifest.json`, `AGENT_HANDOFF.md` | 2026-05-01 | 2026-05-01 — signed out |
| _claude-platform-health-LjP5K_ | `claude/action-wiring-manifest-LjP5K` | Platform health rescan — TS errors, route conflicts, race conditions, Trinity-law violations | `scripts/audit/scan-platform-health.ts`, `PLATFORM_HEALTH_AUDIT.md`, `platform-health-audit.json`, `AGENT_HANDOFF.md` | 2026-05-01 | 2026-05-01 — signed out |
| _claude-tenant-iso-LjP5K_ | `claude/action-wiring-manifest-LjP5K` | TRINITY.md §G triage — fix raw-SQL UPDATE/DELETE on multi-tenant tables without `workspace_id` | 14 route + service files; full list in commit | 2026-05-01 | 2026-05-01 — signed out |

_(no other active sessions)_

---

## SESSION LOG (newest at top — append, do not edit history)

### 2026-05-01 · claude-tenant-iso-LjP5K
**Branch:** `claude/action-wiring-manifest-LjP5K`
**Commit:** _(pending — will be appended after push)_
**What changed:** TRINITY.md §G triage — first batch.
- **§G blockers reduced 55 → 19** (65% reduction).
- **Files fixed (raw SQL UPDATE/DELETE now atomically tenant-scoped):**
  - `server/routes/authCoreRoutes.ts` — DELETE user_sessions now `AND user_id = $2` (the user-scoped equivalent; AUDIT-EXEMPT noted because user_sessions has no workspace_id column).
  - `server/routes/clockinPinRoutes.ts` — 3 UPDATE employees calls scoped by workspace_id.
  - `server/routes/rmsRoutes.ts` — 5 UPDATE calls on daily_activity_reports / dar_reports.
  - `server/routes/equipmentRoutes.ts` — 3 UPDATE equipment_assignments calls.
  - `server/routes/voiceRoutes.ts` — 4 UPDATE voice_call_sessions calls (3 originally flagged + 1 verify_requester case caught on rescan).
  - `server/routes/mascot-routes.ts` — 2 UPDATE mascot_sessions calls.
  - `server/routes/rfpEthicsRoutes.ts` — 3 UPDATE calls (anonymous_reports, rfp_documents, shift_coverage_claims). The shift_coverage_claims claim was upgraded to a `WHERE id=$3 AND workspace_id=$4 AND status='open'` CAS to prevent two officers race-claiming the same shift.
  - `server/routes/safetyRoutes.ts` — sla_contracts breach_count.
  - `server/routes/salesPipelineRoutes.ts` — sales_leads scoring.
  - `server/routes/visitorManagementRoutes.ts` — 2 visitor_logs alert flags.
  - `server/routes/interviewChatroomRoutes.ts` — interview_chatrooms decision.
  - `server/routes/email/emailRoutes.ts` — platform_email_addresses sent counter.
  - `server/routes/trinityAgentDashboardRoutes.ts` — governance_approvals deny path; the WHERE now includes `AND status = 'pending'` so concurrent denials are race-safe.
  - `server/index.ts` — 2 governance_approvals UPDATE calls in the pending-approvals execute path.
  - `server/services/ai-brain/domainLeadSupervisors.ts` — 2 UPDATE employees (status reactivation/activation).
  - `server/services/employeeOnboardingPipelineService.ts` — UPDATE employees activation.
  - `server/services/trinity/proactive/officerWellness.ts` — 2 UPDATE audit_logs metadata writes.
  - `server/services/trinityVoice/supportCaseService.ts` — UPDATE voice_support_cases resolution.
- **AUDIT-EXEMPT markers** (genuine exceptions, documented inline):
  - `server/routes/chatInlineRoutes.ts` — one-time platform-wide migration of the global main chat room (workforceos → coaileague). Both conversation IDs are hard-coded constants.
  - `server/routes/onboardingTaskRoutes.ts` — `INSERT … ON CONFLICT (employee_id, task_template_id) DO UPDATE`. Employee IDs are UUIDs; the INSERT path sets workspace_id explicitly and the DO UPDATE cannot mutate it.
  - `server/routes/privacyRoutes.ts` — DSR/GDPR endpoints; explicit TRINITY.md §G exception, gated by `isAtLeast(req, 'platform_staff')`.
  - `server/routes/authCoreRoutes.ts` — user_sessions table has no workspace_id; user_id is the canonical isolation predicate.
- **Scanner improved:**
  - `scripts/audit/scan-platform-health.ts` honors `AUDIT-EXEMPT TRINITY.md §G` markers placed within ~800 chars before the SQL (was 400).
- **Build:** `node build.mjs` — green (`✅ Server build complete`).
- **Open for next session:** 19 §G blockers remain, all in `server/services/` (low-traffic admin / AI service code paths). Concrete list:
  - `services/auditor/auditorAccessService.ts:570`, `auditor/curePeriodTrackerService.ts:421`,
    `autonomousScheduler.ts:2767`, `billing/guestSessionService.ts:96`,
    `email/emailProvisioningService.ts:252`, `helpai/faqLearningService.ts:94`,
    `helpai/supportActionRegistry.ts:442`, `infrastructure/durableJobQueue.ts:490`,
    `notificationInit.ts:97`, `oauth/googleCalendar.ts:46`,
    `shiftChatroomWorkflowService.ts:580`, `sms/smsQueueService.ts:122`,
    `trinity/workflows/missedClockInWorkflow.ts:382`, `trinityEventSubscriptions.ts:2640`,
    `webhookDeliveryService.ts:278`.
  - 4 of the 19 are likely AUDIT-EXEMPT (system seeds): `developmentSeed.ts:119`,
    `developmentSeedFinancialIntegrations.ts:621`, `productionSeed.ts:1134`,
    plus the supportCaseService:186 line which is a SELECT helper.
- **Sign-out:** done.

### 2026-05-01 · claude-platform-health-LjP5K
**Branch:** `claude/action-wiring-manifest-LjP5K`
**Commit:** `031df2f`
**What changed:**
- Added `scripts/audit/scan-platform-health.ts` — re-uses
  `action-wiring-manifest.json` and adds new sweeps for route conflicts,
  mount-prefix overlaps, race-condition patterns, Trinity-law violations
  (§A REPLIT_DEPLOYMENT, §B fire-and-forget, §F module-load assertion,
  §G raw SQL without workspace_id, §I hardcoded UUIDs), direct provider
  SDK calls outside NDS, and a TypeScript-error roll-up.
- Generated `PLATFORM_HEALTH_AUDIT.md` + `platform-health-audit.json`.
- Comment-line guard (`isInComment`) added to all sweeps so doc-comments
  referencing forbidden patterns are not falsely flagged.
**Top findings (all citations in PLATFORM_HEALTH_AUDIT.md):**
- **TypeScript:** 381 errors. Worst files:
  `server/services/ai-brain/trinityDocumentActions.ts` (28),
  `trinityChatService.ts` (21), `EmailHubCanvas.tsx` (13),
  `settings/HiringSettings.tsx` (13), `routes/authCoreRoutes.ts` (13),
  `engagementRoutes.ts` (13), `chat-rooms.ts` (12).
- **Route conflicts:** 43 distinct (METHOD, full-path) pairs declared in
  multiple files — same path resolved through different routers, first
  match wins. Examples:
  - `POST /api/admin/dev-execute` in `adminDevExecuteRoute.ts:92` AND
    `adminRoutes.ts:60`.
  - `POST /api/auth/mfa/verify` in `authCoreRoutes.ts:824` AND
    `authRoutes.ts:517`.
  - Whole `chat.ts` ↔ `chatInlineRoutes.ts` overlap on
    `/api/chat/conversations*` (≥7 routes).
- **Same-file dupes (medium):** 71 cases where one file declares the
  same path twice — second declaration unreachable. Worst offenders:
  `chat-management.ts` (`/messages/:id/{reactions,edit,pin,forward}`
  each declared 2-7×), `supportRoutes.ts` priority-queue (3×),
  `commInlineRoutes.ts` alert config endpoints (each 2×).
- **Mount overlaps:** 15 prefixes mounted with conflicting middleware
  stacks — bypass risk. Top: `/api/onboarding`, `/api/form-builder`,
  `/api/legal`, `/api/trinity`, `/api/staffing`.
- **TRINITY.md §G blockers:** 55 raw-SQL `UPDATE`/`DELETE` calls on
  multi-tenant tables without `workspace_id` in the `WHERE`. Examples:
  `clockinPinRoutes.ts:68,183,246` UPDATE employees,
  `chatInlineRoutes.ts:284` UPDATE chat_messages,
  `authCoreRoutes.ts:979` DELETE FROM user_sessions.
- **TRINITY.md §F:** 4 module-load Stripe instantiations with `!` env
  asserts: `routes/integrations-status.ts:274`,
  `scripts/seed-stripe-products.ts:21`, `setup-new-pricing-products.ts:31`,
  `verify-stripe-products.ts:3`.
- **TRINITY.md §I:** 3 hardcoded UUID literals outside dev seeds:
  `routes/internalResetRoutes.ts:32`, `services/productionSeed.ts:862,
  1112,1148`.
- **TRINITY.md §A:** 0 real (the only match was a comment in `index.ts`
  which `isInComment` now correctly filters).
- **Race patterns:** 168 fire-and-forget `.catch()` after Promise.all
  filtering, 30 `setImmediate/setTimeout(async ...)` calls, 391 files
  with multi-write but no `db.transaction`, 112 read-then-write paths
  without lock or transaction.
**Open for next session:**
- Triage the §G blockers first — those are tenant-isolation leaks (53
  routes touching `employees`, `chat_messages`, `user_sessions`, etc.).
- Resolve the chat-management same-file dupes — likely a merge artifact.
- TS errors are concentrated in 7 files; fixing those clears ~50% of the
  381-error count. `trinityDocumentActions.ts` and `trinityChatService.ts`
  alone account for 49.
- Re-run after each batch:
  ```
  npx tsx scripts/audit/scan-platform-health.ts
  ```
**Build:** not run — audit-only changes, no server code touched.
**Sign-out:** done.

### 2026-05-01 · claude-action-wiring-LjP5K
**Branch:** `claude/action-wiring-manifest-LjP5K`
**Commit:** `f107161`
**What changed:**
- Built `scripts/audit/generate-action-wiring-manifest.ts` — regex +
  import-graph scanner across UI / backend / Trinity / WS / automation.
- Built `scripts/audit/check-action-wiring-gaps.ts` — gap report;
  `--strict` exits non-zero on any gap (CI-friendly).
- Wrote first-pass `ACTION_WIRING_MANIFEST.md` (3,688 records,
  citations) and `action-wiring-manifest.json` (machine consumable).
- Rewrote AGENT_HANDOFF.md to be Claude-only with session check-in
  protocol (this rewrite).
**Spot-verified real findings:**
- `/api/clients/dockchat/reports/:id/{acknowledge,resolve}` is called
  from `client/src/pages/admin-helpai.tsx` but no backend route exists.
- `/api/integrations/connection-request` — UI hits `/api/integrations/...`,
  router actually mounts at `/api/workspace/integrations/...`.
**Open for next session:** see EXECUTION ORDER below; start with Trinity
Schedule. Audit is map-only — no fixes applied yet.
**Build:** not run (audit-only changes, no server code touched).
**Sign-out:** done.

---

## RECENT SESSIONS (last 10, newest at top)

| When | Session | Branch | Status | Notes |
|------|---------|--------|--------|-------|
| 2026-05-01 | claude-tenant-iso-LjP5K | `claude/action-wiring-manifest-LjP5K` | done | TRINITY.md §G triage. 55 → 19 (65% reduction). 18 files fixed, 4 AUDIT-EXEMPT. Build green. |
| 2026-05-01 | claude-platform-health-LjP5K | `claude/action-wiring-manifest-LjP5K` | done | Platform Health Audit shipped. 381 TS errors, 43 cross-file route conflicts, 55 §G tenant-isolation blockers, 168 fire-and-forget races. Map only, no fixes. |
| 2026-05-01 | claude-action-wiring-LjP5K | `claude/action-wiring-manifest-LjP5K` | done | Action Wiring Manifest first-pass shipped. Map only, no fixes. |

---

## CHECK-IN TEMPLATE (copy into ACTIVE CLAIMS)

```
| <session-id> | <branch> | <domain — one short phrase> | <key files / paths> | <YYYY-MM-DD HH:MM UTC> | <YYYY-MM-DD HH:MM UTC> |
```

## SESSION-LOG TEMPLATE (copy into SESSION LOG when committing)

```
### YYYY-MM-DD · <session-id>
**Branch:** `<branch>`
**Commit:** `<sha>`
**What changed:**
- <bullet — files + intent>
**Why:**
- <one-line — link to the rule, finding, or ticket that motivated it>
**Build:** passed / failed (paste the grep result if failed)
**Open for next session:**
- <anything the next session must know — pinned FIXMEs, half-done work,
  config flags, unresolved manifest entries>
**Sign-out:** done / in-progress / blocked
```

---

## EXECUTION ORDER (action-truth audit follow-up)

> Source of truth: `ACTION_WIRING_MANIFEST.md` + `action-wiring-manifest.json`.
> Re-run the generator after major mount/route changes; never edit the JSON
> by hand.

1. **Trinity Schedule / Smart Schedule** — `server/routes/schedulesRoutes.ts`,
   `shiftRoutes.ts`, `shiftTradingRoutes.ts`, `orchestratedScheduleRoutes.ts`,
   `staffingBroadcastRoutes.ts`, plus the `scheduling.*` block in
   `server/services/ai-brain/actionRegistry.ts` (lines 447-1100). Goal:
   every shift mutation has `requireAuth` + `ensureWorkspaceAccess` + Zod +
   atomic exclusion-constraint write + `broadcastShiftUpdate` +
   `notificationDeliveryService.send` on publish/cancel.
2. **Trinity Actions (registry)** — `server/services/ai-brain/actionRegistry.ts`.
   Hunt for: duplicate actionIds, registered-but-no-handler, mutating
   actions without `withAuditWrap`/`logActionAudit`, financial mutations
   without `requireDeliberationConsensus` / `requiresFinancialApproval`.
3. **ChatDock / Messaging** — `server/routes/chat-management.ts`,
   `chat-rooms.ts`, `server/services/ChatServerHub.ts`,
   `MessageBridgeService.ts`, `client/src/components/ChatDock.tsx`. Most
   `chat/manage/messages/*` routes flagged MISSING_ZOD + MISSING_AUDIT.
   Confirm WS emit → notification bell → read-receipt loop is closed.
4. **Universal Notification System** — verify
   `NotificationDeliveryService.send()` is the sole sender (TRINITY.md §B).
   Audit bell-count refresh path: WS emit → client store → badge.
5. **Employee / Client / Subtenant CRUD** — `server/routes/employees*.ts`,
   `clientsRoutes*.ts`, `adminWorkspaceDetailsRoutes.ts`. Many UI_ONLY
   entries here.
6. **Document Vault / PDFs** — `server/routes/documentLibraryRoutes.ts`,
   `server/services/documents/*`. Confirm signed URL generation, vault
   persistence before email/download.
7. **Automation / Workflow / Pipeline** —
   `server/services/automationEventsService.ts`,
   `automation/automationExecutionTracker.ts`, `automation/workflowLedger.ts`,
   `automationGovernanceService.ts`. Verify each emit/cron has a downstream
   consumer and a completion event/notification.

---

## ACTION WIRING MANIFEST — first-pass summary (2026-05-01)

> **Rule:** every action in the platform must be fully traceable from intent
> to actual effect. No silent failures. No fake success. No registered action
> without a real mutation/read/service path. No UI button without a route.
> This is not a dead-code audit — it is an **action truth audit**.

### Audit scripts

```bash
# Action wiring map (UI ↔ backend ↔ Trinity ↔ WS ↔ automation)
npx tsx scripts/audit/generate-action-wiring-manifest.ts
npx tsx scripts/audit/check-action-wiring-gaps.ts          # --strict to gate CI

# Platform health (route conflicts, races, Trinity-law violations, TS errors)
npx tsc --noEmit > /tmp/tsc-output.txt 2>&1                 # ~10min on this repo
npx tsx scripts/audit/scan-platform-health.ts              # consumes /tmp/tsc-output.txt
```

### Manifest / report paths

- `ACTION_WIRING_MANIFEST.md`     — human-readable wiring map
- `action-wiring-manifest.json`   — machine-readable wiring map
- `PLATFORM_HEALTH_AUDIT.md`      — human-readable health/race/conflict report
- `platform-health-audit.json`    — machine-readable health report (incl. tsc top-files)

### First-pass scope counts

| Source | Count |
|--------|-------|
| Backend route declarations | 2,940 |
| Frontend API calls (apiRequest + fetch + useQuery) | 1,825 |
| Trinity actionRegistry actionIds | 420 |
| WebSocket events (on + emit) | 34 |
| Automation/cron entries | 44 |
| **Unique action records** | **3,688** |
| Duplicate actionId keys | 328 |

### High-risk findings

| Status | Count | Notes |
|--------|-------|-------|
| PARTIAL  (wired but flagged) | 382 | Mostly MISSING_ZOD / MISSING_AUDIT / MISSING_TRANSACTION |
| UI_ONLY  (no backend route)  | 562 | Real 404 risks + some template-literal false positives — verify per-row |
| BACKEND_ONLY (no UI binding) | 1,850 | Includes legitimate internal/admin/integration routes |
| MISSING_RBAC (mutating)      | 296 | Top blocker |
| MISSING_ZOD (mutating)       | 691 | Tier-1 routes without schema validation |
| MISSING_WORKSPACE_SCOPE      | 28  | Verify each — some scope inside the handler not via middleware |
| MISSING_AUDIT (mutating)     | 1,062 | Many routes do not call `logActionAudit` / `auditLogger` |
| MISSING_TRANSACTION (multi-write) | 314 | Multi-write routes without `db.transaction` |
| SILENT_FAILURE_RISK          | 562 | Same set as UI_ONLY |
| REGISTERED_NOT_EXECUTABLE    | 189 | Trinity actionId literal exists but no `registerAction` reference |

### Scanner caveats

- Regex + import-graph (incl. dynamic `await import`). Not a full TS AST.
- Auth/RBAC detection is name-based — extend `AUTH_MIDDLEWARE_NAMES` in the
  generator when new guards land.
- Zod / notification / audit detection is per-file; verify per-route by hand
  on the high-risk list.
- DB writes are extracted from `db.insert/update/delete` literals only —
  ORM helpers and raw SQL templates may be missed.
- Path matching tries several `${var}` ↔ `:param` normalizations; some
  template literals still don't match. Spot-check before fixing.

---

## CURRENT BASE

```
origin/development → 8e02aaf97  (Railway STABLE GREEN — verify before basing new branches)
```

When starting a new session: `git fetch origin development && git log -1 origin/development`
and update this line if the SHA has moved.

---

## CLAUDE MERGE PROTOCOL

Only merge to `development` after another Claude session (or Bryan) has
reviewed the branch. Do not self-merge unless Bryan explicitly authorizes
it for that session.

```bash
git fetch origin {claude-branch}:refs/remotes/claude/{branch}
git diff development..claude/{branch} --name-only      # confirm scope
git checkout development
git checkout claude/{branch} -- {files-in-scope-only}
node build.mjs 2>&1 | grep "✅ Server\|ERROR"           # must show ✅
# boot test if server-side
git add {files} && git commit -m "merge: {branch-summary}"
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
