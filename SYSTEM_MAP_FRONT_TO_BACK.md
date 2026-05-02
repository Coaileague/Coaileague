# CoAIleague — Front-to-Middle-to-Back System Map
**Last updated:** 2026-05-02 · **Branch:** `claude/audit-frontend-ui-Aho9f` · **Pass author:** Claude (full-stack audit)

> Companion to `SYSTEM_MAP.md` (route-level detail) and `SYSTEM_MANIFEST.md` (domain-level census).
> This document traces a **request from the browser to the database** and back, naming every file that participates.

---

## 1. Surface Dimensions

| Layer | Files | Lines |
|---|---|---|
| **Frontend** (`client/src/`) | 344 pages · 308 components · 68 hooks · 9 contexts · 2 providers | 313,553 |
| **Middle** (`shared/`) | 23 schema domains · 10 response schemas · 14 root config/util modules · 5 type modules | 56,265 |
| **Backend** (`server/`) | 320 route files · 15 domain orchestrators · 30 middleware files · 240+ service files | 741,086 |

---

## 2. The Three Layers (Top-Down)

```
┌────────────────────────────────────────────────────────────────────┐
│                   FRONT (client/src/)                              │
│  Vite + React 18 + TypeScript + Tailwind + shadcn/ui + wouter      │
│  TanStack Query + react-hook-form + Capacitor (mobile)             │
└────────────────────────────────────────────────────────────────────┘
                              │ HTTP / WebSocket
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    MIDDLE (shared/)                                │
│  • shared/apiRoutes.ts        — single-source URL constants        │
│  • shared/schema/             — 23 Drizzle table-domain folders    │
│  • shared/schemas/responses/  — Zod response shapes                │
│  • shared/types/              — domain types (chat, broadcasts…)   │
│  • shared/platformConfig.ts   — DOMAINS, env defaults              │
│  • shared/billingConfig.ts    — pricing constants                  │
│  • shared/positionRegistry.ts — role catalog                       │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                    BACK (server/)                                  │
│  Express + TypeScript + Drizzle ORM                                │
│  Neon Postgres · Stripe · Plaid · Twilio · Resend · Trinity AI     │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Request Lifecycle (concrete trace)

**Example:** A manager clicks "Approve" on a pending shift.

```
client/src/pages/shift-approvals.tsx
  └─ useMutation({ mutationFn })                                  ← TanStack Query
       └─ apiRequest("POST", API.shifts.approve(shiftId))         ← client/src/lib/queryClient.ts
            └─ uses route from shared/apiRoutes.ts                ← MIDDLE (typed URL)
                 └─ POST /api/shifts/:id/approve                  ← over HTTPS

server/index.ts → server/routes.ts:registerRoutes()
  ├─ middleware chain (in order):
  │    cookieParser → ensureCsrfToken → csrfProtection
  │    auditContextMiddleware → platformStaffAuditMiddleware
  │    dataAttributionMiddleware → trinityOrchestrationMiddleware
  │    Intrusion Detection → subscriptionReadOnlyGuard
  │    cancelledWorkspaceGuard → terminatedEmployeeGuard
  │    rate limiters → requestTimeout
  │
  ├─ mountSchedulingRoutes(app)  ← server/routes/domains/scheduling.ts
  │    └─ shiftRoutes.ts handles POST /:id/approve
  │         ├─ requireAuth + ensureWorkspaceAccess + requireManager
  │         ├─ validateRequest(zod schema)  ← from shared/schemas/...
  │         ├─ shiftService.approveShift(shiftId, workspaceId, userId)
  │         │    ├─ db.transaction(...)                    ← server/db.ts (Drizzle + Neon)
  │         │    │    └─ schema: shared/schema/scheduling.ts (shifts table)
  │         │    ├─ universalNotificationEngine.notify(...)
  │         │    │    ├─ NotificationDeliveryService → push/email/sms/in_app
  │         │    │    └─ broadcastToWorkspace(WsPayload)  ← server/websocket.ts
  │         │    └─ logActionAudit(...)                   ← actionAuditLogger
  │         └─ res.json({ success, shift, broadcasted })

   WebSocket frame  ◀────────────────────────────────────  server pushes to all
                                                          connected clients in
                                                          this workspace
client/src/providers/WebSocketProvider.tsx
  └─ message handler invalidates ["shifts"] in react-query cache
       └─ useQuery({ queryKey: ["shifts"] }) refetches
            └─ UI re-renders shift-approvals.tsx
```

---

## 4. FRONT (client/src/) — Layer Map

### 4.1 Entry Chain
```
client/index.html
  └─ <script src="/src/main.tsx">
       └─ client/src/main.tsx
            ├─ vite:preloadError handler (auto-reload on stale chunk)
            ├─ scroll-guard CSSStyleDeclaration trap (body.overflow=hidden block)
            ├─ HelmetProvider
            ├─ ErrorBoundary (top-level)
            └─ <App />  ← client/src/App.tsx (1998 LOC)
                 ├─ QueryClientProvider
                 ├─ ThemeProvider · WorkspaceBrandProvider
                 ├─ TooltipProvider · OverlayControllerProvider
                 ├─ UniversalLoadingGateProvider · TransitionProvider
                 ├─ ServiceHealthProvider · ForceRefreshProvider
                 ├─ WebSocketProvider · UniversalConfigProvider
                 ├─ TrinityModalProvider · TrinitySessionProvider
                 ├─ ChatDockProvider · LayerManagerProvider
                 ├─ TransitionLoaderProvider · PaymentEnforcementProvider
                 │
                 └─ AppContent()
                      ├─ AppUtilityCluster (workspace switcher + settings)
                      ├─ HeaderTrinityButton + HeaderChatButton + Mail
                      ├─ Switch with 594 <Route> declarations
                      ├─ MobileBottomNav (mobile)
                      ├─ UnifiedChatBubble · TrinityActivityBar
                      └─ NotificationsPopover · OnboardingWizard
```

### 4.2 Page Structure (`client/src/pages/`)
| Subdir | Pages | Examples |
|---|---|---|
| `pages/` (root) | ~310 | dashboard, billing, shifts, employees, clients, schedule |
| `pages/admin/` | 3 | support-console, support-console-tickets, support-console-workspace |
| `pages/client-portal/` | 1 | setup |
| `pages/compliance/` | 9 | index, employee-detail, approvals, expiration-alerts, regulator-portal |
| `pages/dashboards/` | 13 | role-specific dashboards (auditor, contractor, deputy-admin, etc.) — orchestrated by `pages/dashboard.tsx` |
| `pages/financial/` | 1 | pl-dashboard |
| `pages/settings/` | 3 | EmailManagement, DnsSetupGuide, HiringSettings |
| `pages/sra/` | 6 | SRALogin, SRAApply, SRAPortalDashboard, SRAOfficers, SRAFindings, SRAReportBuilder |
| `pages/training-certification/` | 2 | index, module-learning |

### 4.3 Component Structure (`client/src/components/`)
| Subdir | Purpose |
|---|---|
| `ui/` | shadcn/Radix primitives (button, card, dialog, etc.) |
| `chatdock/` | Unified chat UI bubble + Trinity thought bar |
| `chat/` | Message bubbles, conversation pane |
| `trinity/` | Trinity activity bar, task widget |
| `mobile/` | MobileBottomNav, MobileRouteGuard, PageTransition, PWAInstallPrompt |
| `mobile/documents/`, `mobile/forms/`, `mobile/schedule/` | Mobile-specific verticals |
| `dashboard/` | Dashboard widgets |
| `documents/` + `documents/fields/` | Document viewer + form-field renderers |
| `forms/` | Form-builder components |
| `onboarding/` + `onboarding/sps-forms/` | Onboarding wizard + SPS forms |
| `settings/`, `billing/`, `compliance/`, `finance/`, `email/`, `ai-brain/`, `helpai/` | Domain components |
| `canvas-hub/` | LayerManager, TransitionLoader |
| `errors/` | GlobalErrorBoundary |
| `navigation/` | ProgressiveHeader |
| `workboard/` | WorkboardDashboard |

### 4.4 Hooks (`client/src/hooks/`)
| Hook | Purpose |
|---|---|
| `useAuth` | Session/user state, called in App.tsx |
| `usePushNotifications` | Web Push subscription mgmt |
| `useTrinityNotificationRouting` | Routes Trinity events to UI |
| `useChatManager`, `useChatManagerInit`, `useChatManagerWebSocketBridge` | Chat lifecycle |
| `useTrinityTasks` | Surfaces approvals/onboarding/compliance tasks |
| `useIsMobile`, `ResponsiveAppFrame` | Responsive utilities |
| `useScrollLockGuard` | Prevents bgs from locking scroll |
| `useSessionSync` | Cross-tab session sync |
| `usePaymentEnforcement` | Payment-required state |
| `useNotificationSync`, `useNotificationWebsocket` | Notification streaming |
| `useChatroomWebsocket` | Chat WS lifecycle |
| `useConnectionStatus`, `useOverlayAwareness` | UI state |

### 4.5 Contexts & Providers
| File | Purpose |
|---|---|
| `contexts/ChatDockContext.tsx` | ChatDock open/close + room state |
| `contexts/ServiceHealthContext.tsx` | Backend health pings |
| `contexts/SimpleModeContext.tsx` | Simple-mode toggle |
| `contexts/ThemeContext.tsx` | WorkspaceBrandProvider (per-tenant theming) |
| `contexts/TrinitySessionContext.tsx` | Trinity AI session |
| `contexts/ForceRefreshProvider.tsx` | Force-refresh signal |
| `contexts/overlay-controller.tsx` | Modal/sheet controller |
| `contexts/transition-context.tsx` | Page transitions |
| `contexts/universal-loading-gate.tsx` | Universal loading gate |
| `providers/WebSocketProvider.tsx` | WS connection manager |
| `providers/universal-config-provider.tsx` | Config from /api/platform-flags |

### 4.6 Frontend Service Layer
| File | Purpose |
|---|---|
| `client/src/lib/queryClient.ts` | TanStack Query client + apiRequest helper |
| `client/src/lib/apiClient.ts` | Lower-level fetch wrapper |
| `client/src/lib/apiError.ts` | Error normalization |
| `client/src/lib/csrf.ts` | CSRF token handling |
| `client/src/lib/configManager.ts` | Runtime config |
| `client/src/lib/featureFlags.ts` | Feature-flag client |
| `client/src/lib/navigation.ts` | Route helpers |
| `client/src/lib/legacyRedirects.ts` | Old URL → new URL map |
| `client/src/lib/logoutHandler.ts` | Logout side-effects |
| `client/src/lib/pushNotifications.ts` | Web Push registration |
| `client/src/services/chatConnectionManager.ts` | Chat WS lifecycle |

---

## 5. MIDDLE (shared/) — Cross-Layer Contracts

### 5.1 The Single-URL-Source Pattern
```
shared/apiRoutes.ts
  • API_PATHS — raw paths for backend routers
  • API       — typed helper functions for frontend
  Client : apiRequest("POST", API.shifts.accept(id))
  Server : router.post(API_PATHS.shifts.accept, handler)
  → "Phantom Routes" become compile-time errors instead of 404s.
```

### 5.2 Shared Schema (Drizzle) — `shared/schema/`
| Subdir / File | Tables | Notes |
|---|---|---|
| `index.ts` | barrel | re-exports everything |
| `core.ts` | platform-wide | base extension types |
| `auth.ts` | 25 | users, sessions, mfa, oauth, api_keys |
| `enums.ts` | enum types | role enums, status enums |
| `relations.ts` | relations | drizzle table relations |
| `domains/auth/` | 25 | auth-domain tables |
| `domains/billing/` | 75 | invoices, payments, stripe_events, plaid |
| `domains/clients/` | 34 | clients, contracts, proposals |
| `domains/comms/` | 60 | chat_rooms, messages, broadcasts, sms_logs |
| `domains/compliance/` | 57 | guard_cards, licenses, certifications |
| `domains/ops/` | 57 | sites, incidents, post_orders |
| `domains/orgs/` | 41 | organizations, workspaces, workspace_members |
| `domains/payroll/` | 21 | payroll_runs, pay_stubs, direct_deposits |
| `domains/recruitment/` | 4 | applicants, job_postings |
| `domains/sales/` | 16 | leads, deals |
| `domains/scheduling/` | 42 | shifts, shift_assignments, swap_requests |
| `domains/sps/` | 19 | sps_workspaces, sub_tenants, regulatory |
| `domains/storage/` | 2 | documents, document_vault |
| `domains/support/` | 41 | support_tickets, escalations |
| `domains/time/` | 12 | time_entries, clock_events, timesheets |
| `domains/training/` | 9 | training_courses, completions |
| `domains/trinity/` | 103 | decision_log, ai_brain_memory, action_registry |
| `domains/voice/` | 6 | voice_calls, transcripts |
| `domains/workforce/` | 68 | employees, positions, departments |
| `domains/audit/` | 58 | audit_log, compliance_records |
| `domains/notifications-delivery/` | 1 | notification_deliveries |
| `domains/onboarding-tasks/` | 2 | onboarding_task_templates |
| `domains/DOMAIN_CONTRACT.ts` | meta | which domain owns which route file |

### 5.3 Shared Response Schemas (Zod) — `shared/schemas/responses/`
analytics · billing · clients · employees · invoices · payroll · shifts · trinity · workspace
+ `index.ts` barrel export

### 5.4 Shared Types — `shared/types/`
broadcasts · chat · domainExtensions (ShiftWithJoins, EmployeeWithStatus) · fieldOperations · inbox

### 5.5 Shared Config / Utility Modules
| File | Purpose |
|---|---|
| `apiRoutes.ts` | URL constants (front + back) |
| `platformConfig.ts` | DOMAINS, env defaults |
| `billingConfig.ts` | Pricing tiers, plan limits |
| `marketingConfig.ts` | Marketing site config |
| `commands.ts` | Command palette commands |
| `healthTypes.ts` | Health-check response shapes |
| `helpdeskUtils.ts` | Helpdesk shared utilities |
| `licenseTypes.ts` | License/cert type catalog |
| `positionRegistry.ts` | Role/position catalog |
| `quickbooks-editions.ts`, `quickbooks-terminology.ts` | QB integration constants |
| `trinityTaskSchema.ts` | Trinity task contract |
| `types.ts` | Common shared types |
| `workspaceFeatures.ts` | Feature gates by workspace tier |
| `lib/rbac/` | Role-based access control logic shared front+back |
| `validation/` | Shared zod validators |
| `config/` | Shared config bootstrap |
| `utils/` | Shared utility helpers |

---

## 6. BACK (server/) — Layer Map

### 6.1 Startup Chain
```
server/index.ts
  ├─ GCS_KEY_JSON → /tmp/gcs-service-account.json env bootstrap
  ├─ express() + helmet + cors + compression
  ├─ DB pool (Neon Postgres via @neondatabase/serverless)
  ├─ session (PG-backed, 24h TTL)
  ├─ passport (local strategy)
  ├─ registerRoutes(app)  ← server/routes.ts (1181 LOC)
  │   ├─ middleware stack (see SYSTEM_MAP.md)
  │   ├─ public routes
  │   ├─ webhooks (Resend, Twilio, Plaid, Stripe, message-bridge)
  │   ├─ special mounts (auditor, audit-suite, security-admin, sandbox, etc.)
  │   ├─ mount{Auth,Billing,Clients,Comms,Compliance,Ops,Orgs,
  │   │       Payroll,Sales,Scheduling,Support,Time,Trinity,
  │   │       Workforce,Audit}Routes(app)
  │   └─ featureStubRouter MUST stay LAST
  ├─ setupWebSocket(server)
  ├─ startAutonomousScheduler() — node-cron jobs
  └─ server.listen(PORT, '0.0.0.0')
```

### 6.2 Middleware Stack (`server/middleware/`)
`audit, auditorGuard, billingEnforcement, breakGlass, crawlerPrerender, csrf,
dataAttribution, errorHandler, idempotency, identityGuard, maintenanceMiddleware,
orgIsolation, persistentRateLimitStore, platformFeatureFlag, platformStaffAudit,
privacyMask, rateLimiter, requestId, requestTimeout, requireLegalAcceptance,
sraAuth, statewideGuard, subscriptionGuard, terminatedEmployeeGuard, trinityGuard,
trinityTokenTrackingMiddleware, usageTracking, validateRequest,
verifyOnboardingGate, virusScan`

### 6.3 Route Layer (`server/routes/`)
- 320 route files
- 15 domain orchestrators (`server/routes/domains/*.ts`) bundling related routes
- `server/routes/admin/`, `routes/ai/`, `routes/compliance/`, `routes/email/`, `routes/financialReporting/`, `routes/hr/`, `routes/sra/` — sub-domain folders
- Full mount order: see `SYSTEM_MAP.md` § "server/routes.ts — Full Mount Order"

### 6.4 Service Layer (`server/services/`)
| Subdir | File count | Notes |
|---|---|---|
| (root) | 240 | top-level shared services |
| `ai-brain/` | 236 | actionRegistry (4700 LOC) + Trinity action handlers |
| `ai-brain/skills/` | 14 | Trinity skill modules |
| `ai-brain/subagents/` | 10 | onboarding/gamification/visualQa/etc. |
| `ai-brain/trinity-orchestration/` | 9 | Claude / Gemini API clients |
| `billing/` | 58 | Stripe client, invoice gen, plaid |
| `trinity/` | 25 | orchestration + proactive scans |
| `trinity/proactive/` | (in 25) | anomalyWatch, officerWellness, preShiftIntelligence, weeklyBrief |
| `trinity/workflows/` | 12 | workflow definitions |
| `trinityVoice/` | 20 | Voice call handlers |
| `infrastructure/` | 24 | Platform infra services |
| `helpai/` | 20 | platformActionHub, helpAITriage |
| `orchestration/` | 15 | service orchestration |
| `automation/` | 15 | rule engines |
| `compliance/` | 14 | OC §1702 enforcement, license validation |
| `scheduling/` | 12 | autonomous scheduler, gamification |
| `integrations/` | 11 | OAuth integrations |
| `fieldOperations/` | 11 | field worker services |
| `recruitment/` | 8 | hiring pipeline |
| `bots/` | 8 | bot simulators |
| `payroll/` | 7 | payroll calculators |
| `ops/` | 7 | ops services |
| `sandbox/` | 9 | demo/sandbox |
| `documents/` | 9 | PDF generation |
| `chat/` | 9 | chatDock (event protocol, message store, pubsub) |
| `auditor/`, `partners/`, `sra/`, `uacp/`, `email/`, `sms/`, `tax/`, `pdf/`, `forms/`, `errors/`, `gamification/`, `github/`, `hiring/`, `hris/`, `oauth/`, `officers/`, `onboarding/`, `privacy/`, `quickFix/`, `rbac/`, `resilience/`, `session/`, `shared/`, `storage/`, `support/`, `training/`, `trinityStaffing/`, `universalLoader/`, `utils/`, `analytics/`, `auth/`, `automation/`, `autonomy/`, `businessInsights/`, `contracts/`, `currency/`, `finance/`, `financial/`, `helposService/`, `platform/` | 1-7 each | Specialized verticals |

### 6.5 Database Access (`server/db.ts` + Drizzle)
- Pool: `@neondatabase/serverless` over WebSocket
- ORM: `drizzle-orm`
- Schema: `shared/schema/index.ts` (re-exports all 661 tables)
- Migrations: `drizzle-kit push` → `migrations/`
- Transactions: `db.transaction()` for all financial writes
- Money: `FinancialCalculator` (decimal.js) — never floating-point
- Workspace isolation: every query MUST include `workspace_id` predicate

### 6.6 Real-Time Stack (`server/websocket.ts`)
- `ws` library bound to HTTP server
- `broadcastToWorkspace(workspaceId, WsPayload)` — used by 86+ files
- `WsPayload` strict type — no `data: any` or `shift?: any`
- ChatDock pub/sub via `server/services/chat/chatDockPubSub.ts` (Redis-backed when `REDIS_URL` set)

### 6.7 Trinity AI (`server/services/ai-brain/` + `server/services/trinity/`)
- One unified identity: Gemini + Claude + GPT triad
- `actionRegistry.ts` (4707 LOC) — central action hub, `aiBrainActionRegistry.initialize()` registers ~300 actions
- `helpaiOrchestrator` (in `server/services/helpai/platformActionHub.ts`) — runtime action dispatcher
- Sub-services: `trinityChatService`, `trinityFieldIntelligence`, `trinityInboundEmailProcessor`, `trinityCostService`, `trinityAuditIntelligenceService`, `trinityDeliberation`, `trinityEventBrain`, `trinityEscalationExecutor`, `trinityDisciplinaryWorkflow`, `trinityOrchestrationGateway`, `domainHealthValidator`, `preExecutionValidator`, `schedulingGateService`, `sopIndexingService`, `employmentVerificationService`, `eventBus`
- Proactive scans: anomalyWatch, officerWellness, preShiftIntelligence, revenueAtRisk, weeklyBrief

---

## 7. Notification Delivery Stack

```
Event (shift assigned, payment, alert) →
  broadcastToWorkspace(workspaceId, WsPayload)
    → WebSocket fan-out to all connected clients in workspace

  universalNotificationEngine.notify(payload)
    → resolves recipients by NOTIFICATION_ROLE_ROUTING
       → NotificationDeliveryService.send(payload)
          ├─ dedup window 30 min (same type+user+channel)
          ├─ rate limit 3 push/hr · 15 push/day per user
          ├─ critical bypass: panic_alert, payroll_failure
          ├─ channel: 'push'  → Web Push API (subscription store)
          ├─ channel: 'email' → Resend API
          ├─ channel: 'sms'   → Twilio
          └─ channel: 'in_app' → notification_deliveries table

  broadcastService.createBroadcast()        ← manager → employee
  staffingBroadcastService.createShiftBroadcast() ← coverage offers
```

---

## 8. Build Chain

```
npm run build = vite build && node build.mjs
npm run start = cross-env NODE_ENV=production node dist/index.js

vite build:
  • Entry: client/src/main.tsx
  • Output: dist/public/ (40 KB index.html + 400+ JS chunks)
  • rollupOptions.external: [@capacitor/haptics]

node build.mjs (esbuild server bundle):
  • Entry: server/index.ts
  • Output: dist/index.js (~24-38 MB single file)
  • external: date-fns, openai, twilio, typescript,
              @capacitor/{haptics,core,app,push-notifications}

Railway:
  nixpacks.toml: NODE_OPTIONS=--max-old-space-size=4096
  railway.toml:  buildCommand=npm run build · startCommand=npm run start
```

---

## 9. Verified This Pass (2026-05-02 — three iterations)

| Check | Result |
|---|---|
| `npm install` | ✅ 1101 packages |
| `npm run build` (vite + esbuild) | ✅ 4670 modules transformed, 23.99s; server+client bundles emitted |
| `npx vitest run` (full workspace) | ✅ **196/196 passed** (8 files / 55 tests skipped — need real DB/server) |
| `npx tsx tests/integration/platform.test.ts` | ✅ **31/31 passing** (was 28/31) |
| `npx tsc --noEmit` | ⚠️ **23,954 errors** (was 24,115 — **-161** in this pass) |
| Frontend audit (orphans/handlers/forms/mutations/nav) | ✅ all clean (4 wiring fixes shipped) |
| esbuild structural check (App.tsx + main.tsx) | ✅ 0 errors, 0 warnings |

### TS Debt Status (per pass)
| Pass | Errors | Δ | Notes |
|---|---|---|---|
| Baseline (entry) | 24,115 | — | post-feature freeze |
| After audit fixes | 24,115 | 0 | wiring fixes only — no type changes |
| After TS-debt sweep | **23,954** | **-161** | TS2300 down 124→12, TS2304 down 550→373 |

### Top Remaining TS-Error Buckets (debt to chip away)
| Code | Count | Fix path |
|---|---|---|
| TS18046 (`X is unknown`) | 7,152 | catch (e) → typed error access — per-file work |
| TS2339 (no such property) | 5,078 | Drizzle type inference + `Record<string, unknown>` casts — per-file |
| TS2322 (not assignable) | 3,067 | Drizzle insert/update value typings |
| TS2345 (arg not assignable) | 2,693 | Same as above |
| TS2769 (no overload matches) | 1,792 | Drizzle ORM overloads |
| TS2352 (cast may be mistake) | 954 | `as` cast through `unknown` |
| TS2571 (object is unknown) | 769 | Same as TS18046 family |
| TS2304 (cannot find name) | 373 | Mostly missing schema tables (`partnerApiUsageEvents`, `aiResponses`, `clientContractTemplates`) — needs schema decision |
| TS7006 (implicit any) | 307 | Add `: unknown` annotations |
| TS18047 (`X is null`) | 213 | Null guards |
| TS2353 (excess property) | 188 | Object literal trimming |
| TS18048 (`X is undefined`) | 179 | Optional chaining |
| TS2554 (wrong arg count) | 130 | Per-call review |
| TS2300 (duplicate identifier) | 12 | Mostly `type` keyword conflicts in object literals |

---

## 10. Open Items (carry-forward)

| ID | Item | Code Status | Env Required |
|---|---|---|---|
| KI-001 | ChatDock Redis pub/sub multi-replica | ✅ wired in startup | `REDIS_URL` |
| KI-007 | Web Push offline delivery | ✅ wired (pushNotificationService) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| KI-008 | ChatDock per-message store | ✅ imported in dockChatRoutes | full save/read wiring next phase |
| ENV-1 | PII field encryption | ✅ self-protecting (hard-crash if missing) | `FIELD_ENCRYPTION_KEY` (32 chars) |
| ENV-2 | Auditor token URLs | ✅ has `\|\| ''` fallbacks | `APP_BASE_URL` |

---

## 11. Architecture Rules (Permanent)

```
1. featureStubRouter MUST stay LAST in routes.ts
2. Trinity = ONE individual — no mode-switching, no personality toggles
3. HelpAI = only bot field workers see
4. Every workspace query: workspace_id predicate REQUIRED
5. Financial writes: db.transaction() REQUIRED
6. Money math: FinancialCalculator (decimal.js) REQUIRED
7. Every document: branded PDF to tenant vault — never raw data
8. WebSocket: WsPayload type — no data:any, no shift?:any
9. actionRegistry: < 300 total actions
10. New route: add to correct domain file — not routes.ts directly
11. New service: check SYSTEM_MAP.md before creating new
12. Trinity legal advice: never — hard-coded refusal in legally-adjacent outputs
```

---

## 12. Where to look next (for the agent on the other side of this map)

If you're doing the **back-end side** of the audit, start here:
- `server/index.ts` (startup) → `server/routes.ts` (mount table)
- `server/routes/domains/*.ts` (15 files — every endpoint reachable from the web)
- `server/services/ai-brain/actionRegistry.ts` (Trinity action surface)
- `server/middleware/` (request transforms applied to every API call)
- `server/db.ts` + `shared/schema/index.ts` (DB access + tables)
- `server/websocket.ts` (real-time fan-out)

If you're doing the **middle (contracts) side**, start here:
- `shared/apiRoutes.ts` (every URL named once)
- `shared/schema/domains/*` (every table named once)
- `shared/schemas/responses/*` (every API response shape)
- `shared/types/` (cross-layer types)
- `shared/platformConfig.ts` + `shared/workspaceFeatures.ts` (config)

If you're doing the **front-end side**, start here:
- `client/src/main.tsx` + `client/src/App.tsx` (entry + router)
- `client/src/lib/queryClient.ts` (TanStack Query + apiRequest)
- `client/src/providers/WebSocketProvider.tsx` (WS connection)
- `client/src/contexts/ChatDockContext.tsx` (chat state)
- `client/src/hooks/useAuth.ts` (session)

---

**End of map.** This file is meant to be diff-able — when adding a new route file, service, or page, update the relevant section in the same PR.
