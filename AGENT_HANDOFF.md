# COAILEAGUE — MASTER AGENT HANDOFF
# ONE FILE — update in place.
# Last updated: 2026-05-02 — Claude (support role + support org pass)

---

## CURRENT BASE

```
origin/development → 5c8f43b2  (🟢 GREEN — build clean, Railway auto-deploying)
TS debt: 8,566 → 2124 combined (-75.2% from baseline)
```

---

## 2026-05-02 — support role / support org audit pass
Branch: `claude/fix-workspace-pages-ZyETl`
Scope: support-role-protected pages (admin/support-console*, support-queue,
support-bug-dashboard, support-chatrooms, support-ai-console, support-command-console,
HelpDesk, my-tickets, admin-ticket-reviews, admin-helpai, role-management,
end-user-controls), CRUD + fetch/post/query wiring, support roles cross-check.
esbuild parse exit=0 across all 19 audited support pages.

### Canonical support roles (frozen — used by `requireSupportRole` everywhere)
`root_admin`, `deputy_admin`, `sysop`, `support_manager`, `support_agent`
(`Bot` is added only in `trinityNotificationRoutes.ts` for Trinity-originated calls.)
`AALV_SUPPORT_ROLES` in `aiRoutes.ts` and `SUPPORT_ROLES` in
`endUserControlRoutes.ts` and `trinityNotificationRoutes.ts` and
`chat-rooms.ts` (lines 2046, 2183) all reference the same five roles —
verified consistent.

### Fixed
| Where | Issue | Fix |
|---|---|---|
| `pages/admin/support-console.tsx` | `useState<null>(null)` for `selectedTicket` and `selectedWorkspace`; access to `.id`, `.ticket_number`, `.subject`, `.workspace_id`, `.workspaceId`, `.entity_type`, etc. on a `null`-typed value | Added `SupportTicket` and `SupportWorkspaceRef` interfaces, retyped both states + the search-results `.map(r: SupportWorkspaceRef, i: number)` callback |
| `pages/admin/support-console.tsx` | Stray module-scoped `const Icon = ({ name, className }: any) => …` (dead — local destructure `icon: Icon` already provides the component inside the dashboard) | Deleted |
| `pages/admin/support-console-workspace.tsx` | Same dead `const Icon = … : any` at module scope; also `Section` had `icon: string \| React.ReactNode` instead of a component type, breaking `<Icon className=… />` rendering | Removed dead `Icon`; retyped `Section` `icon` as `React.ComponentType<{ className?: string }>` |
| `components/motd-dialog.tsx` | `iconMap: Record<string, unknown>` made `<IconComponent />` unrenderable | Imported `LucideIcon` and retyped to `Record<string, LucideIcon>` |
| `components/motd-dialog.tsx` | `MotdMessage` interface was private — HelpDesk had no shared type | Exported `MotdMessage` |
| `pages/HelpDesk.tsx` | `useState<null>(null)` for `motdData`, then `.id` and `.requiresAcknowledgment` accessed; `useQuery<{ motd: unknown, … }>` left motd untyped | Imported `MotdMessage` from the dialog, retyped both the state and the query response |

### Verified routed + reachable (support surface)
`/support`, `/my-tickets`, `/support/queue`, `/support/bugs`,
`/support/chatrooms`, `/support/ai-console`, `/support/assisted-onboarding`,
`/admin/support-console`, `/admin/support-console/tickets`,
`/admin/support-console/workspace`, `/role-management`, `/end-user-controls`,
`/chat/:roomId` (HelpDesk), `/helpdesk`, `/admin/ticket-reviews`,
`/admin/helpai`. Legacy redirects intact: `/support/console`,
`/trinity/command-center`, `/helpai-orchestration` → `/support/ai-console`.

### Verified support CRUD endpoints (server, all `requireSupportRole`-gated)
- `endUserControlRoutes.ts`: `GET /workspaces`, `GET /workspace/:id`,
  `POST /suspend`, `POST /unsuspend`, `POST /toggle-ai-brain`,
  `PATCH /access-config`, `POST /freeze-user`, `POST /unfreeze-user`,
  `POST /suspend-employee`, `POST /reactivate-employee`
- `trinityNotificationRoutes.ts`: `POST /whats-new`, `POST /support-escalation`,
  `POST /insight`, `GET /metrics`, `GET /watchdog-status`, `POST /batch-send`
- `support-command-console.ts`: `GET /test-broadcast`, `POST /force-whats-new`,
  `POST /force-notification`, `POST /force-sync`, `POST /broadcast-message`,
  `POST /maintenance-mode`
- `adminPermissionRoutes.ts`: `PATCH/DELETE /workspaces/:wsId/matrix`,
  `PATCH /workspaces/:wsId/users/:userId/role` (`requireSupportManager`)
- `aiRoutes.ts` AALV: 4 endpoints gated to `AALV_SUPPORT_ROLES`

All endpoints checked have a routed UI consumer except the
`support-command-console.ts` set (see orphan note below).

### Orphans flagged (NOT fixed — needs product call)
- `pages/support-command-console.tsx` (1559 lines) — orphan: not lazy-imported
  in `App.tsx`, no router entry. `support-ai-console.tsx` appears to be its
  canonical replacement (legacy redirects `/support/console` and
  `/trinity/command-center` both point to `/support/ai-console`). Decide
  to (a) route at `/support/command-console`, or (b) delete the page +
  the unconsumed `supportCommandRouter` endpoints.

### Out-of-scope but observed
- `pages/support-command-console.tsx:1404` `MobileToolsPanel({…}: any)` —
  one big destructured prop bag still typed `any`. Listed in TS-DEBT bucket.

---

## 2026-05-02 — workspace / sub-tenant / workflow audit pass
Branch: `claude/fix-workspace-pages-ZyETl`
Scope: workspace tools, login, fetch/query wiring, cross-platform tenant /
sub-tenant / end-user / client pages, action + workflow CRUD, activate /
deactivate. Audited 18 in-scope pages; esbuild parse exit=0 across all.

### Fixed
| Page | Issue | Fix |
|------|-------|-----|
| `client/src/App.tsx` | `pages/sub-orgs.tsx` existed but had **no route** — page unreachable | Added `lazy(() => import('@/pages/sub-orgs'))` and `Route path="/sub-orgs"` in both desktop and mobile router branches |
| `pages/sub-orgs.tsx` | `createMut`/`switchMut` mutations returned raw `Response`, then `data?.workspaceName` was read on a Response object — switch-toast always showed "undefined". `err?.message` / `err?.response?.json()` accessed unknown without narrowing | Mutations now `await res.json()`; `onError` narrows `err instanceof Error` and casts `response?.json` access through a typed shape |
| `pages/workspace.tsx` | `iconMap: Record<string, unknown>` made `<Icon className=… />` un-renderable (`unknown` is not a JSX element type) | Imported `LucideIcon` from `lucide-react`, retyped `iconMap: Record<string, LucideIcon>` |
| `pages/workflow-approvals.tsx` | `useState<null>(null)` for `selectedProposal` broke `selectedProposal.id` access; `proposal: unknown` parameters in `handleApprove/handleReject` blocked typed property reads downstream | Imported `ScheduleProposal \| InvoiceProposal \| PayrollProposal` from the hook, declared local `AnyProposal` union, retyped the state and handlers |

### Verified routed + reachable
`/workspace`, `/workspace-onboarding`, `/workspace-sales` (also `/sales`,
`/platform/sales`), `/workflow-approvals`, `/owner/hireos/workflow-builder`,
`/clients`, `/sub-orgs` (newly added), `/end-user-controls`, `/client/portal`,
`/client-portal/setup`, `/client-portal/:tempCode`, `/client-signup`,
`/client-status-lookup`, `/client-communications`, `/client-satisfaction`,
`/client-profitability`, `/sps-client-pipeline`, `/login`, `/auditor/login`,
`/co-auditor/login`, `/regulatory-audit/login`.

### Verified CRUD / activate / deactivate endpoints (server)
- `clientRoutes.ts`: `POST /:id/deactivate`, `POST /:id/reactivate`
- `deactivateRoutes.ts`: workspace + employee deactivate/reactivate
- `workspaceInlineRoutes.ts`: full sub-orgs CRUD + attach/detach/batch
- `platformRoutes.ts`: staff suspend/unsuspend
- `service-control.ts`: per-workspace service suspend
- `workOrderRoutes.ts`, `scheduleosRoutes.ts`, `enterpriseOnboardingRoutes.ts`,
  `onboardingPipelineRoutes.ts`: activate flows
All endpoints have a UI consumer in the audited pages.

### Out-of-scope but observed (not fixed — flag for follow-up)
- `pages/auditor-login.tsx`: `err.response?.json()` in `onError` accesses a
  property not on `Error` (TanStack v5 default). esbuild compiles, but strict
  `tsc` would flag. Same pattern in `co-auditor-login.tsx` (`e?.message`).
- `pages/hireos-workflow-builder.tsx` lines 34, 117: `: any` on two
  internal sub-components. Listed under TS-DEBT.

---

## SESSION MONITORING STATUS — ALL PASSES COMPLETE

### Branches Verified / Merged / Rejected

| Branch | Status | Unique Value | Action Taken |
|--------|--------|-------------|--------------|
| claude/test-chatdock-integration-dOzPS | ✅ DONE | ChatDock split + hooks | MERGED |
| claude/setup-onboarding-workflow-uE8II | ✅ DONE | 7 onboarding components | MERGED |
| claude/test-email-system-9n4d2 | ✅ DONE | Email template system | MERGED |
| claude/test-schedule-integration-0vxFL | ✅ DONE | Schedule + availability routes | MERGED |
| claude/action-wiring-manifest-LjP5K | ✅ DONE | Trinity agent routes + tenant-iso | MERGED |
| claude/fix-trinity-notifications-EVDKv | ✅ DONE | skillActionBridge.ts + badges | MERGED |
| claude/document-pdf-system-SvGgk | ✅ DONE (handoff) | 9 new files (PDF streaming, encryption, mobile UI) | MERGED |
| claude/unify-duplicate-services-7ZzYF | ✅ DONE (closed) | 14 dead services + 5 dead routes deleted | MERGED |
| copilot/verify-email-flow-forgot-password | ✅ DONE | CAN-SPAM password reset | MERGED |
| refactor/service-layer | ✅ DONE | ChatDock pub/sub, message store | MERGED |
| pr-195 / client-cleanup | ✅ | 53 missing imported components recovered | MERGED |
| claude/fix-ghost-routes-typescript-COkzh | ⏭ PARTIAL | businessArtifactCatalog.ts only | TS fix commit REJECTED (302 regressions) |
| enhancement/lane-a-* | ⏭ REJECTED | — | Re-introduce as any/ts-expect-error |
| copilot/merge-dev-into-codex-refactor | ⏭ REJECTED | — | billing-api @ts-expect-error |
| codex/fix-dashboard-crash-issue | ✅ ABSORBED | — | Already in dev |
| texas-licensing, trinity-texas, synapse-golive, fix-failed-deploys, fix-bell, acme-simulation | ✅ ABSORBED | — | No unique content |

---

## WHAT'S IN DEVELOPMENT NOW

### New Files Added (All Sessions Combined)
**ChatDock:** ConversationPane.tsx, useChatActions.ts, useChatViewState.ts, chatdock-helpers.ts,
  chatDockEventProtocol.ts, chatDockMessageStore.ts, chatDockPubSub.ts, haptics.ts

**Email:** templates/ (account, billing, onboarding, scheduling, support), wrapInlineEmailHtml.ts,
  emailTemplateBase.ts

**Onboarding:** employee-blocking-banner.tsx, onboarding-progress-banner.tsx,
  settings-sync-listener.tsx, use-settings-sync.ts, sub-orgs.tsx, settingsSyncBroadcaster.ts,
  inviteReaperService.ts

**Schedule:** ScheduleGrid.tsx, availabilityRoutes.ts, calendarRoutes.ts, gamificationService.ts

**Action-wiring:** trinityAgentDashboardRoutes.ts, skillActionBridge.ts

**Documents / PDF:** pdfResponseHeaders.ts, submissionPdfService.ts, auditorTokenService.ts,
  auditorPublicRoutes.ts, fieldEncryption.ts, persistentRateLimitStore.ts,
  MobileDocumentSafeSheet.tsx, MobilePayStubSheet.tsx, MobileFormPager.tsx,
  businessArtifactCatalog.ts

**Missing components recovered (53):** CustomFormRenderer, DocumentUpload, TrinityScorecard,
  ai-brain/index.ts, chat/index.ts, helpai/index.ts, SnowfallEngine, ScheduleToolbar,
  ShiftCard, navigation.ts, featureFlags.ts, stateRegulatoryRoutes.ts, + 41 more

### Dead Code Removed (All Sessions)
**Services (14):** automationMetrics, communicationFallbackService, expansionSeed,
  fileStorageIsolationService, redisPubSubAdapter, sentimentAnalysis, timeEntryDisputeService,
  trainingRateService, notificationThrottleService, trinityOrchestrationBridge,
  aiSchedulingTriggerService, documentDeliveryService, notificationRuleEngine,
  scheduleRollbackService

**Routes (5):** gamificationRoutes, gpsRoutes, tokenRoutes, trainingRoutes, workflowRoutes

---

## CRITICAL ARCHITECTURE RULES (unchanged)

```
server/routes.ts → featureStubRouter MUST stay LAST (after all domain mounts)
server/routes/featureStubRoutes.ts → 11 genuine stubs only
shared/types/domainExtensions.ts → new types (ShiftWithJoins, EmployeeWithStatus, etc.)
server/websocket.ts → WsPayload type — do NOT re-introduce data:any or shift?:any
Trinity = ONE unified individual — no mode toggles
HelpAI = only bot field workers see
```

---

## OPEN ITEMS (carry forward)

| ID | Item | Priority |
|----|------|----------|
| KI-001 | ChatDock Redis pub/sub multi-replica (chatDockPubSub.ts ready, needs wiring) | HIGH |
| KI-007 | FCM push notifications offline workers | HIGH |
| KI-008 | Durable per-room message sequencing (chatDockMessageStore.ts ready) | HIGH |
| ENV | FIELD_ENCRYPTION_KEY must be set before PII encryption activates | HIGH |
| ENV | APP_BASE_URL must be set for auditor token URL composition | MEDIUM |
| ENV | PLAID_WEBHOOK_SECRET + PLAID_ENCRYPTION_KEY (≥64 hex) required in prod when Plaid is wired | HIGH |
| TS-DEBT | Remaining 2124 combined any (deep Trinity AI + Drizzle internals) | LOW |
| VD-01 | `billing.invoice_refund` action handler missing (Stripe refund + ledger reversal) | MEDIUM |
| VD-06 | Plaid 429 exhaustion → `payment_held` resolves only via manual owner action | MEDIUM |
| VD-07 | `payrollAnomalyWorkflow` 45s timeout fails OPEN (returns blocked:false) — UI must surface | MEDIUM |
| VD-08 | `/api/plaid/employee/:employeeId/bank-status` lacks self/manager guard within workspace | LOW |

---

## PLATFORM METRICS — FINAL

```
TS combined any: 8,566 → 2124 (-75.2%)
catch(e: any):       246 → 0   (-100%) ✅
res: any handlers:    95 → 0   (-100%) ✅
.values(as any):       9 → 0   (-100%) ✅
middleware as any:   183 → 0   (-100%) ✅
@ts-expect-error:    142 → 4   (-97%)  ✅
Broken routes:        34 → 0           ✅
Dead services removed: 14              ✅
Dead routes removed:    5              ✅
Build: 0 server + 0 client errors      ✅
```

---

## MERGE PROTOCOL FOR NEXT AGENT

1. Read this file FIRST
2. git pull origin development (this IS the canonical base)
3. git fetch origin — check for new branches with commits ahead of development
4. For each: find truly unique code (diff --diff-filter=A vs ANCESTOR 438cca2d)
5. Check TS regressions before applying — reject if adds > removes
6. Compile: esbuild sweep must stay at 0 errors
7. Build: node build.mjs must succeed
8. Update this file with what you did

---

## DEPLOYMENT VERIFICATION (2026-05-01 — Final)

### ALL PREVIOUS FAILURE CAUSES — CONFIRMED FIXED

| # | Failure | Fix | Status |
|---|---------|-----|--------|
| 1 | @capacitor/haptics build crash (ROOT CAUSE) | vite.config.ts rollupOptions.external | ✅ In HEAD |
| 2 | integrations-status.ts missing default export | `export default router` added | ✅ In HEAD |
| 3 | Wrong ErrorBoundary import path (4 pages) | `@/components/ErrorBoundary` corrected | ✅ In HEAD |
| 4 | Dashboard crash (TrinityAnimatedLogo failing) | TrinityArrowMark in LoadingSpinner | ✅ In HEAD |
| 5 | GeoCompliance runtime crash (ReferenceError) | Import added to timeEntryRoutes.ts | ✅ In HEAD |
| 6 | Dead route files still in DOMAIN_CONTRACT | Stale string entries removed | ✅ In HEAD |

### Build Verification
- `npm run build` = `vite build && node build.mjs`
- esbuild: **0 server errors, 0 client errors**
- `node build.mjs`: ✅ Server build complete
- `dist/index.js`: 24.6 MB ✅
- `dist/public/`: 453 files, 402 JS bundles ✅
- `railway.toml` build command: `npm run build` → `npm run start` ✅
- `nixpacks.toml` NODE_OPTIONS: `--max-old-space-size=4096` (prevents OOM) ✅

### Current HEAD
```
5c8f43b2 merge(session-watch-2): unify phase5 dead routes + continuous green baseline
```

### TS Debt — Final State
- **Baseline:** 8,566
- **Current:** ~2,127 (75.1% eliminated)
- **Zero error categories:** catch(e:any), res:any, .values(as any), middleware as any
- **esbuild:** 0 errors — platform will run cleanly

---

## SESSION 2026-05-02 — Schedule → Payroll → Invoice Spine Verification
**Branch:** `claude/verify-workflow-billing-FGdaj`

### What was verified (audit-only, no edits)
1. **Scheduling spine** — front (`universal-schedule.tsx` + 13 mutations) → routes (`/api/trinity/scheduling/*` + `/api/trinity-staffing/*` with `requireAuth` + `ensureWorkspaceAccess`) → `trinityAutonomousScheduler` → `shifts` schema. Daemons all booted in `index.ts`.
2. **Payroll + Plaid** — UI (4 pages) → 50 endpoints in `payrollRoutes.ts` (`pg_advisory_lock` on approve, `idempotencyMiddleware` on create-run) → `payrollAutomation` → Plaid (RSA-JWT webhook signature, AES-256-GCM token storage, 429 backoff with idempotency key) → `payrollTransferMonitor` (5-min poll). State machine in `payrollStatus.ts`. Atomic locks via `atomicFinancialLockService`.
3. **Invoice + Stripe** — Atomic numbering via `pg_advisory_xact_lock` (`trinityInvoiceNumbering.ts` — no collisions). Stripe webhook with dual-secret verification, in-memory + DB dedup. `invoiceLifecycleWorkflow` triggered on `time_entry.approved`. Stripe Connect for payouts.
4. **Trinity orchestration** — 8 workflows registered, 4 proactive monitors (cron via `proactiveOrchestrator` wired through `autonomousScheduler:4667`), pre-execution validator (5 hard gates), append-only audit logs.

### What was fixed in this branch (10 changes)

| File | Change |
|---|---|
| `server/index.ts` (~2964) | Wired `runOverdueCollectionsSweep()` daemon — first run after 60s, then every 24h. Registered in shutdown via `registerDaemon`. |
| `server/utils/configValidator.ts` | Added `CONDITIONAL_PRODUCTION_CONFIGS` — `PLAID_WEBHOOK_SECRET` + `PLAID_ENCRYPTION_KEY` (≥64 hex) become hard prod errors when Plaid is configured. |
| `server/routes/stripeInlineRoutes.ts:491` | Replaced silent `JSON.stringify(req.body)` fallback with **500 error + log** when `req.rawBody` is missing. Refuses to verify against re-serialized body. |
| `server/routes/invoiceRoutes.ts:2849` | Added idempotency key `pi-portal-${invoiceId}-${amountCents}-${6h-bucket}` to client-portal `paymentIntents.create`. |
| `server/stripe-config-updated.ts` | DELETED — zero references; canonical is `stripe-config.ts`. |
| `server/services/trinity/workflows/workflowOrchestrator.ts` | Added `trinity.verify_tops_screenshot` action handler wrapping `verifyTOPSScreenshot()`. Brings Trinity workflow action count from 7 → 8. |
| `server/routes/trinitySchedulingRoutes.ts` | (a) Added Zod `autoFillBodySchema` (replaces raw `req.body` destructure). (b) SLA-gate probe before AI scheduling — returns 409 `sla_urgent_blackout` if any urgent ticket is at SLA risk. |
| `server/services/trinity/workflows/payrollAnomalyWorkflow.ts` | Wrapped `payrollSubagent.detectAnomalies()` in 45s `Promise.race` timeout. On timeout returns `success:false, blocked:false` with summary that explicitly says "Manual review recommended" — fails OPEN by design (don't block payroll on subagent hang). |
| `server/services/trinity/trinityActionDispatcher.ts` | Added 3 invoice patterns: `void/cancel`→`billing.invoice_void` (high), `mark…paid`→`billing.invoice_status` (medium), `resend`→`billing.invoice_send` (low, payload.resend=true). All map to existing canonical handlers — no orphan action IDs. |
| `tests/security/plaidEmployeeOwnership.test.ts` | Implemented all 6 `.todo` tests as supertest+vitest harness. Note: `tests/security/` is not in the workspace projects yet — run via `npx vitest run tests/security`. |

### Files NOT touched but verified working as designed
- Raw-body parser (`server/index.ts:451-459`) is correctly mounted with `verify` hook for `/api/stripe/webhook` and the 6 other webhook paths. The new assertion in `stripeInlineRoutes.ts` is defense-in-depth.
- `proactiveOrchestrator.registerProactiveMonitors` is wired through `autonomousScheduler.ts:4667`. `registerProactiveActions` is called from `actionRegistry.ts:271`. Both already start at boot.
- Stripe `paymentIntents.create` calls in `stripeInlineRoutes.ts:196`, `invoiceRoutes.ts:2029`, `billing-api.ts:696` already have idempotency keys.

### Verification results (after `npm install`)
- `npx tsc --noEmit -p tsconfig.server.json` → **exit 0, zero errors.**
- `npx vitest run --project security` → **6/6 pass** (Plaid ownership IDOR guards).
- `npx vitest run --project integration` → **39 pass / 0 fail / 55 skipped.**
- `npx vitest run --project unit` → **152 pass / 5 fail.**
  The 5 failures are in `tests/unit/trinity-workflows-17c.test.ts` (`billing.invoice_add_line_items` / `billing.invoice_create` handlers return undefined under that test's mock setup). Confirmed pre-existing — they fail identically against `git stash`'d HEAD. Not caused by this branch.

### Follow-up cleanup in same branch
- `vitest.workspace.ts` — added a `security` project so `tests/security/` runs by default (closes VD-05).
- `tests/security/plaidEmployeeOwnership.test.ts` — `requireAuth` is exported from `server/auth`, not `server/rbac`; mock now covers both modules so the auth bypass actually applies.

### Architecture Law added 2026-05-02 — PUBLIC SAFETY BOUNDARY
Trinity/HelpAI **never** call 911, dispatch responders, or guarantee anyone's
safety. A human supervisor is **always** required. This avoids public-duty /
assumption-of-duty tort exposure and TX Occ. Code §1702 violation.

Defense-in-depth enforcement landed in this branch:

| Layer | File | New code |
|---|---|---|
| Action | `server/services/ai-brain/trinityConscience.ts` | Principle 8 — hard `block` verdict for `safety.call_911` / `emergency.dispatch` / `dispatch.911` / `*.guarantee_safety` etc. Runs FIRST so role + confirmation can't override. |
| Intent | `server/services/trinity/trinityActionDispatcher.ts` | `PUBLIC_SAFETY_REFUSAL_PATTERNS` — chat/voice/email intents like "call 911", "dispatch police", "guarantee my safety" return `status: 'blocked'` with the canonical disclaimer before any action is queued. |
| Language | `server/services/ai-brain/publicSafetyGuard.ts` (NEW) | `guardOutbound()` wraps every Trinity chat response. Rewrites first-person 911 claims ("I called 911", "help is on the way") and safety guarantees ("I'll keep you safe", "you're safe with me") with `[redacted: claim outside Trinity's authority]` and appends `PUBLIC_SAFETY_DISCLAIMER`. Idempotent. |
| Tests | `tests/security/publicSafetyGuard.test.ts`, `tests/security/trinityConsciencePublicSafety.test.ts` | 30+ assertions across pattern matching, rewriting, idempotency, and conscience principle 8. |
| Docs | `CLAUDE.md`, `SYSTEM_MAP.md` rule #13 | Full law statement with approved/prohibited phrasing tables and per-state legal basis. |

Existing infrastructure was already aligned (no rewrites required):
- `panicAlertService.ts:65-74` `PANIC_LIABILITY_NOTICE` — bundled with every panic API response.
- `stateRegulatoryKnowledgeBase.ts` — per-state `prohibitedLanguage` lists already enumerate "Never say 'we guarantee your safety'."
- `smsService.ts:25` already declares "Autonomous 911 contact removed by design."
- `bots/shiftRoomBotOrchestrator.ts:1240` and `compliance/stateRegulatoryKnowledgeBase.ts` instruct the human to call 911 — that's approved phrasing, not Trinity claiming dispatch.
