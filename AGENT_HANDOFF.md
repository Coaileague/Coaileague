# COAILEAGUE — MASTER HANDOFF
# ONE FILE. Update in place.
# Last updated: 2026-05-01 — Claude (Action Wiring Manifest first pass)

---

## ACTION WIRING MANIFEST — 2026-05-01 (Bryan's audit)

> **Rule:** every action in the platform must be fully traceable from intent
> to actual effect. No silent failures. No fake success. No registered action
> without a real mutation/read/service path. No UI button without a route.
> This is not a dead-code audit — it is an **action truth audit**.

### Audit scripts

- `scripts/audit/generate-action-wiring-manifest.ts` — full scan, emits
  `ACTION_WIRING_MANIFEST.md` + `action-wiring-manifest.json`
- `scripts/audit/check-action-wiring-gaps.ts` — gap report from JSON
  (use `--strict` for CI)

```bash
npx tsx scripts/audit/generate-action-wiring-manifest.ts
npx tsx scripts/audit/check-action-wiring-gaps.ts
```

### Manifest paths

- `ACTION_WIRING_MANIFEST.md`     — human-readable
- `action-wiring-manifest.json`   — machine-readable

### First-pass scope counts (commit 2026-05-01)

| Source     | Count |
|------------|-------|
| Backend route declarations | 2,940 |
| Frontend API calls (apiRequest + fetch + useQuery) | 1,825 |
| Trinity actionRegistry actionIds | 420 |
| WebSocket events (on + emit) | 34 |
| Automation/cron entries | 44 |
| **Unique action records** | **3,688** |
| Duplicate actionId keys | 328 |

### High-risk findings (verified by spot-check)

| Status | Count | Notes |
|--------|-------|-------|
| PARTIAL  (wired but flagged) | 382 | Most carry MISSING_ZOD / MISSING_AUDIT / MISSING_TRANSACTION |
| UI_ONLY  (no backend route)  | 653 | Some are real 404 risks; some are template-literal path-match false positives — verify by hand |
| BACKEND_ONLY (no UI binding) | 1,920 | Includes legitimate internal/admin/integration routes; still useful to identify dead ghosts |
| MISSING_RBAC (mutating)      | high | Top blocker — see manifest |
| MISSING_ZOD (mutating)       | high | Tier-1 routes without schema validation |
| MISSING_WORKSPACE_SCOPE      | medium | Verify each — some routes scope inside the handler not via middleware |
| MISSING_AUDIT (mutating)     | high | Many routes do not call `logActionAudit` / `auditLogger` |
| MISSING_TRANSACTION (multi-write) | high | Multi-write routes without `db.transaction` |
| SILENT_FAILURE_RISK          | high | UI calls with no matched backend |

Spot-check confirmed real signal:
- `/api/clients/dockchat/reports/:id/acknowledge` — admin-helpai.tsx calls it, **no backend route exists**
- `/api/integrations/connection-request` — UI calls `/api/integrations/...` but the router is mounted at `/api/workspace/integrations/...` (real 404 risk)

### Trinity action registry (server/services/ai-brain/actionRegistry.ts)

- 420 actionId literals across ai-brain/* and inline `registerShiftTradingActions()` etc.
- See `ACTION_WIRING_MANIFEST.md` "Trinity actionRegistry" section for the audit-wrap / approval-gate matrix per actionId.

### Recommended next execution order (by domain)

1. **Trinity Schedule / Smart Schedule**
   - Files to inspect first:
     `server/routes/schedulesRoutes.ts`, `server/routes/shiftRoutes.ts`,
     `server/routes/shiftTradingRoutes.ts`, `server/routes/orchestratedScheduleRoutes.ts`,
     `server/routes/staffingBroadcastRoutes.ts`,
     `server/services/ai-brain/actionRegistry.ts` (`scheduling.*` block, lines 447-1100)
   - Targets: ensure every shift mutation passes `requireAuth`, `ensureWorkspaceAccess`,
     a Zod schema, atomic exclusion-constraint write, and emits a
     `broadcastShiftUpdate` + `notificationDeliveryService.send` on publish/cancel.
2. **Trinity Actions (registry)**
   - Audit `actionRegistry.ts` for: duplicate actionIds, registered-but-no-handler,
     mutating actions without `withAuditWrap` or explicit `logActionAudit`,
     financial mutations without `requireDeliberationConsensus` or
     `requiresFinancialApproval` gate.
3. **ChatDock / Messaging**
   - Files: `server/routes/chat-management.ts`, `server/routes/chat-rooms.ts`,
     `server/services/ChatServerHub.ts`, `server/services/MessageBridgeService.ts`,
     `client/src/components/ChatDock.tsx`.
   - Many `chat/manage/messages/*` routes flagged MISSING_ZOD + MISSING_AUDIT —
     start there. Also confirm websocket emit -> notification bell -> read receipt
     loop is closed.
4. **Universal Notification System**
   - Verify `NotificationDeliveryService.send()` is the sole sender (TRINITY.md §B).
   - Audit bell-count refresh path: WS emit -> client store -> badge counter.
5. **Employee / Client / Subtenant CRUD**
   - Files: `server/routes/employees*.ts`, `server/routes/clientsRoutes*.ts`,
     `server/routes/adminWorkspaceDetailsRoutes.ts`. Many UI_ONLY entries here.
6. **Document Vault / PDFs**
   - Files: `server/routes/documentLibraryRoutes.ts`, `server/services/documents/*`.
     Confirm signed URL generation, vault persistence before email/download.
7. **Automation / Workflow / Pipeline**
   - Files: `server/services/automationEventsService.ts`,
     `server/services/automation/automationExecutionTracker.ts`,
     `server/services/automation/workflowLedger.ts`,
     `server/services/automationGovernanceService.ts`.
   - 44 emit/cron entries detected — verify each has a downstream consumer
     and a completion event/notification.

### Scanner caveats (do not skip)

- Regex-based, not full TS AST. Each record carries a file+line citation;
  treat the manifest as a starting truth-table, not a verdict.
- Auth/RBAC detection is name-based (`requireAuth`, `ensureWorkspaceAccess`,
  `requirePlatformStaff`, etc.). Custom guards must be added to
  `AUTH_MIDDLEWARE_NAMES` in the generator.
- Zod / notification / audit detection is per-file presence, not per-route.
  If a file calls Zod _somewhere_ the routes in it pass the check — verify
  per-route by hand on the high-risk list.
- DB writes are extracted from `db.insert/update/delete` literals only —
  ORM helpers and raw SQL templates may be missed.
- Path matching uses several normalizations of `${var}` ↔ `:param`. Some
  template-literal interpolations may still fail to match. Spot-check before
  fixing.

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
