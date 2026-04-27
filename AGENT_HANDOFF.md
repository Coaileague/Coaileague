# COAILEAGUE REFACTOR — MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 — Copilot acceleration pass complete; Codex next

---

## THREE-AGENT RELAY PROTOCOL

```
CLAUDE      → executes domain, boot-tests, commits
COPILOT     → boilerplate acceleration (Zod, test scaffolds, helper patterns)
CODEX       → verifies, decides next domain or signals AUDIT COMPLETE
```

Speed rule: One domain, one complete sweep, one coherent commit.

Role clarification (supersedes the shorthand above):
- CODEX verifies, but is also expected to strengthen weak code, remove bandaids,
  and perform scoped refactors/enhancements when a domain can be improved safely
  on `refactor/service-layer`. Codex documents exact risks, line numbers, fix
  instructions, validation, and any code changes made.
- CLAUDE remains implementation lead on `development`, integrates Copilot/Codex
  changes when made, boot-tests, and syncs back.
- COPILOT is acceleration only: repeated Zod/schema work, test scaffolds, helper
  replacements, and repeated route-guard sweeps after Claude/Codex define the
  canonical pattern. No architecture calls, final safety decisions, or independent
  merges.

Whole-domain definition: routes, services, jobs, schedulers, queues, workers,
automations, webhooks, storage, events, migrations, tests, validation, and
user-facing action paths. Nothing in the domain is considered done until the full
workflow is coherent end-to-end.

Ownership rule: no two agents edit the same files at the same time. If Codex
patches code during verification, Claude integrates those exact changes or
documents why a different implementation replaced them.

---

## TURN TRACKER

```text
Current turn: CODEX
  → Verify Phase H fixes (admin routes, upload security, platform guards)
  → Pull from origin/copilot/refactor-three-agent-protocol for Copilot's additions
  → Determine: any remaining domains needing audit?
  → Strengthen / refactor any weak Phase H code found
  → Signal AUDIT COMPLETE if nothing critical remains, else document Phase I

After Codex: CLAUDE
  → Integrate any Codex hardening patches onto development
  → Boot-test and sync back to refactor/service-layer
```

---

## CURRENT COMMIT

```text
origin/development                           -> 8aca7e864  (Railway STABLE GREEN ✅)
origin/copilot/refactor-three-agent-protocol -> merged development (conflict-free ✅)
origin/refactor/service-layer                -> 9ba04e70   (latest Codex handoff)
```

---

## STATUS SNAPSHOT

```text
Phases 1-6 broad refactor:             ✅ complete (~97k lines removed)
Phase A auth/session:                  ✅ complete
Phase B financial flows:               ✅ complete
Phase C scheduling/shift:              ✅ complete (Grade A)
Phase D Trinity action flows:          ✅ complete
Phase E documents/compliance:          ✅ complete
Phase F notifications/broadcasting:    ✅ complete
Phase G integrations (QB/Stripe/Plaid): ✅ complete
Phase H admin/upload/platform guards:  ✅ deployed + Copilot hardening applied
```

---

## COPILOT PASS — WHAT WAS DONE

Branch: `copilot/refactor-three-agent-protocol`
Tests: 139 passed, 0 failed after changes.

### Phase H forward-port (3 files from development → branch)

- `server/routes/adminDevExecuteRoute.ts`
  Added `NODE_ENV === 'production'` hard block inside the route handler so dev-
  execute is impossible to invoke in prod even if token auth passes.

- `server/routes/bulk-operations.ts`
  Added `requireManager` to the three import routes (employees, clients, shifts).
  Added secure multer config: 5 MB `fileSize` limit + MIME/extension allowlist
  (CSV and Excel only). Previously multer({ storage: memoryStorage() }) with no
  limits allowed any file type and unlimited size.

- `server/routes/platformFeedbackRoutes.ts`
  Added `requirePlatformStaff` guard to `POST /api/platform-feedback/surveys`.
  Previously any request (no auth header) could create platform-wide surveys.

### Phase G residual fixes

- `server/services/scheduling/index.ts`
  Removed truncated export block for `registerSchedulingWithOrchestration`,
  `checkSchedulingGovernance`, `getSchedulingOrchestrationStatus`. These symbols
  do not exist in any file — the source module was deleted. The dangling export
  was a compile blocker (tsc stops here before reaching Phase G files).

- `server/routes/quickbooks-sync.ts` — P2-10
  Changed 6 mutating POST routes from `requireProfessional` to `requireManager`:
  - POST /api/quickbooks/sync/initial
  - POST /api/quickbooks/invoice/create
  - POST /api/quickbooks/sync/cdc
  - POST /api/quickbooks/review-queue/:itemId/resolve
  - POST /api/admin/quickbooks/sync-staffing-clients
  - POST /api/quickbooks/sync/retry-queue/:logId
  Read-only GETs remain at `requireProfessional`. `requireManager` was already
  imported; only the route declarations were changed.

- `server/routes/notifications.ts` — P1-8
  Added `employees` to the schema import (already exported from @shared/schema).
  Added workspace membership lookup in `POST /api/notifications/send` between
  Zod parse and `NotificationDeliveryService.send`:
  ```
  SELECT id FROM employees
  WHERE userId = recipientUserId AND workspaceId = workspaceId
  LIMIT 1
  ```
  Returns 403 `Recipient is not a member of this workspace` if no row found.
  Prevents a manager in Workspace A from pushing notifications to users in
  Workspace B by knowing their userId.

### Test scaffolds added (4 new files, 139 total passing)

- `tests/api/quickbooks-guards.test.ts`
  Smoke tests: all 6 mutating QB routes return 401/403 unauthenticated.
  Read-only routes also reject unauthenticated. Unit section documents the
  mutating vs read-only inventory.

- `tests/api/notifications-isolation.test.ts`
  Unit tests for the workspace membership filter logic (all cases: same
  workspace, cross-workspace, unknown user). HTTP smoke: send route rejects
  unauthenticated, malformed payload does not 500.

- `tests/regression/phase-g-integrations.test.ts`
  Idempotency key uniqueness invariant. Stripe cents/decimal round-trip boundary
  (centsToDecimalString / decimalStringToCents helpers — no floating-point drift).
  QB, Plaid, and notification send routes all reject unauthenticated. None 500.

- `tests/regression/phase-h-admin-guards.test.ts`
  File-type allowlist unit tests (CSV/Excel pass, PDF/image/exe/zip fail).
  File-size boundary unit tests (1 MB, 5 MB pass; 6 MB fails).
  dev-execute production block unit test.
  HTTP smoke: bulk import routes, platform survey, admin routes reject
  unauthenticated. None 500.

---

## DELIBERATION FOR CODEX / CLAUDE

Items where Copilot made a decision that Codex should review before merging
to development:

1. **scheduling/index.ts — removed broken export**
   The three symbols (`registerSchedulingWithOrchestration`, etc.) were in an
   unterminated export block with no source module anywhere in the repo.
   Copilot removed the block entirely. Codex should confirm no caller site
   imports these names from the scheduling index; if a caller exists, Claude
   must create stub implementations or restore the module.
   Search: `grep -rn "registerSchedulingWithOrchestration" server/`

2. **notifications.ts — employees table used for membership check**
   The recipient workspace check queries `employees.userId = recipientUserId`.
   `employees.userId` is nullable (some employees don't have linked user accounts).
   For those employees, a notification can never be sent to them via this route.
   This is conservative and correct for the current security requirement, but
   if platform staff or workspace owners who lack an employee record need to
   receive notifications via this route, the check would need to also accept
   workspace owners via a `workspaces.ownerId` check. Codex should decide.

3. **QB requireManager sweep — requireProfessional still on two GET routes**
   `GET /api/quickbooks/review-queue` and `GET /api/quickbooks/sync/retry-queue`
   remain at `requireProfessional`. Codex should confirm this is the right
   floor for those read-only endpoints.

---

## STANDARD: NO BANDAIDS

```text
No raw money math. No raw scheduling duration math. No workspace IDOR.
No state transition without expected-status guard. No user-facing legacy branding.
Every generated document = real branded PDF saved to tenant vault.
Trinity action mutations = workspace scope + fail-closed gates + audit trail.
Trinity is one individual. No mode switching. HelpAI is the only bot field workers see.
One domain, one complete sweep, one coherent commit.
```

---

## QUEUED — POST-AUDIT ENHANCEMENT SPRINT

After Codex signals AUDIT COMPLETE:

### Priority 1 — Foundation
- RBAC + IRC mode consolidation: RBAC owns permissions, room type owns behavior.
- Action registry consolidation below 300.
- E-P0-2: compliance report PDF service.
- E-P1-5: compliance document vault intake service.

### Priority 2 — ChatDock Enhancement
1. Durable message store + Redis pub/sub.
2. FCM push + four-tier delivery: WS → FCM → RCS → SMS.
3. Typed WebSocket event protocol for Trinity/HelpAI streaming.
4. Read receipts + acknowledgment receipts for post orders.
5. Message replies, emoji reactions, pins, polls, media gallery, archive, search.
6. Presence tied to shift status: connected/offline/NCNS.
7. HelpAI scheduled messages + shift close summary cards.
8. Content moderation + report queue + legal hold + evidence export.
9. Live call/radio button (WebRTC already wired).
10. Async voice messages + Whisper transcription.

### Priority 3 — Holistic Audit
- All services as unified whole: ChatDock, email, forms, PDF, workflows, storage.
- Login/logout/session persistence verification.
- All action-triggering buttons/icons verified for correct workflow outcomes.
- Auditor portal, client portal, workspace dashboards → Grade A uniformity.

### Priority 4 — Trinity Brain + UI
- Gemini + Claude + GPT triad: genuine reasoning before Trinity speaks, not just routing.
- Trinity personality: one unified individual, no Business/Personal/Tech modes.
- HelpAI: field-supervisor voice and only worker-facing bot.
- Seasonal/holiday theming restored on public pages.
- Mobile offline-first: op-sqlite, optimistic sends.
- Update notification toast: minimal icon + version + arrow.

