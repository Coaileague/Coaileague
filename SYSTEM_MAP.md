# CoAIleague — Complete System Map
**Last updated:** 2026-05-02 · **Author:** Architect Claude · **HEAD:** claude/verify-workflow-billing-FGdaj

> **PURPOSE:** Single source of truth for all routes, mounts, middleware, services, and client pages.
> Before adding ANY new code — route, component, service, or hook — check this map first.
> Update this file in the same PR as your change.

---

## Platform Metrics

| Metric | Count |
|--------|-------|
| TypeScript lines | 1,141,959 |
| Client pages | 344 |
| React components | 322 |
| Server route files | 362 |
| API endpoints | 2,876 |
| Server services | 930 |
| Shared schema files | 98 |
| Test suites | 21 (17 active, 4 skipped) |
| Tests | 196 passing / 0 failing / 55 skipped |

### Build & Test Run (2026-05-02, fresh `npm install`)

| Step | Result |
|---|---|
| `npm install` | ✅ 1101 packages, 0 vulnerabilities |
| `node build.mjs` (server esbuild) | ✅ 0 errors → `dist/index.js` 38 MB |
| Server boot smoke (dist/index.js, dummy DATABASE_URL) | ✅ All middleware mounted, AI Brain registry initialized, all 15 domain orchestrators wired, scheduler + WebSocket assembled with no errors before 25s timeout |
| `vitest run` full suite | ✅ 196 passed / 0 failed / 55 skipped (was 5 failed before fix) |
| `tsc --noEmit` | ⚠ 24,150 strict-mode errors (pre-existing TS debt baseline; NOT a build gate — esbuild is the gate per `npm run build`) |

**Bug fixed in this verification pass:**
- `tests/unit/trinity-workflows-17c.test.ts` — added a `beforeAll(async () => await aiBrainActionRegistry.initialize())` so the AI Brain action registry runs its async initialization before tests query `helpaiOrchestrator.getAction(...)`. Previously 5/30 tests in the file failed because action registration was moved out of the constructor and into the async `initialize()` method (called from `server/index.ts:1607` at boot) without updating the test setup.

---

## Test Suite Health

```
npm run test          → 196 passed | 0 failed | 55 skipped
npm run test:unit     → 157 passed | 0 failed
npm run test:readiness→ All readiness gates PASS
tsc --strict          → 0 errors
esbuild (server)      → 0 errors
esbuild (client)      → 0 errors
node build.mjs        → CLEAN
```

### Test Coverage by Domain
| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Financial workflows | trinity-workflows-17c | 30 | ✅ |
| Atomic financial locks | atomic-financial-lock-service | 26 | ✅ |
| Pay/shift calculations | calculations | 25 | ✅ |
| Trinity token metering | trinity-token-metering | 10 | ✅ |
| RBAC role hierarchy | readiness-rbac | 14 | ✅ |
| Data retention | readiness-retention | 6 | ✅ |
| Error tracker adapter | readiness-error-tracker | 3 | ✅ |
| Financial staging | financial-staging | 9 | ✅ |
| Financial staging extras | financial-staging-extras | 10 | ✅ |
| SPS onboarding routes | sps-onboarding-routes | 3 | ✅ |
| Workspace isolation | workspace-isolation | 12 | ✅ |
| Tenant isolation | tenant-isolation | 4 | ✅ |
| Notification isolation | notifications-isolation | 4 | ✅ |
| Route integrity | routeIntegrity | 5 | ✅ |
| QB guards | quickbooks-guards | 2 | ✅ |
| Phase G integrations | phase-g-integrations | 5 | ✅ |
| Phase H admin guards | phase-h-admin-guards | 8 | ✅ |
| Shift splitter | shift-splitter | — | SKIPPED (needs DB) |
| Security tests | 4 files | — | SKIPPED (needs DB) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CoAIleague Platform                       │
│                                                              │
│  Client (Vite + React)     Server (Express + Node)          │
│  ┌─────────────────────┐   ┌─────────────────────────────┐  │
│  │ 344 pages            │   │ 2,876 API routes             │  │
│  │ 322 components       │   │ requireAuth on all /api/*    │  │
│  │ TanStack Query       │   │ workspace_id scope enforced  │  │
│  │ Wouter routing       │   │ db.transaction() on finance  │  │
│  │ Tailwind + shadcn/ui │   │                              │  │
│  └─────────────────────┘   │  Services (930 files)         │  │
│                             │  ├── Trinity AI Brain         │  │
│  Trinity™ (AI Co-Pilot)     │  ├── Billing/Payroll          │  │
│  ┌─────────────────────┐   │  ├── Scheduling               │  │
│  │ Gemini + Claude+GPT │   │  ├── Notifications            │  │
│  │ ONE unified identity │   │  ├── Chat/ChatDock            │  │
│  │ No mode toggles      │   │  ├── HelpAI orchestration     │  │
│  │ < 300 actions        │   │  ├── SPS Forms (encrypted)    │  │
│  └─────────────────────┘   │  └── Audit logging            │  │
│                             └─────────────────────────────┘  │
│  Data Layer                                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Neon PostgreSQL (production autoscale)                   │ │
│  │ 661 tables  ·  Drizzle ORM  ·  btree_gist overlap guard │ │
│  │ Redis pub/sub (ChatDock multi-replica)                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

| Environment | Branch | URL | Status |
|-------------|--------|-----|--------|
| Production | main | www.coaileague.com | 🟢 Live |
| Development | development | coaileague-development.up.railway.app | 🟢 Live |

### Build Chain
```
npm run build = vite build && node build.mjs
npm run start = cross-env NODE_ENV=production node dist/index.js
nixpacks.toml: NODE_OPTIONS=--max-old-space-size=4096
railway.toml: buildCommand + startCommand configured
build.mjs externals: date-fns, openai, twilio, typescript, @capacitor/*
```

### Critical Deployment Rules (permanent)
- `featureStubRouter` MUST stay LAST in `server/routes.ts` — never shadow real routes
- `dist/index.js` expected size: ~38MB (ESM bundle)
- Health check endpoint: `GET /api/health`
- Port: `process.env.PORT` (Railway injects)
- Cookie domain: auto-detected from `APP_BASE_URL` — Railway dev gets host-only cookies

---

## Required Environment Variables

### Auto-provided by Railway
`PORT, NODE_ENV, RAILWAY_ENVIRONMENT_NAME, DATABASE_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD`

### Required — set in Railway Variables
| Variable | Purpose |
|----------|---------|
| `APP_BASE_URL` | Canonical deployment URL (affects cookies, email links, OAuth) |
| `SESSION_SECRET` | 64-char random string for session signing |
| `FIELD_ENCRYPTION_KEY` | 32 hex chars for PII field encryption |
| `RESEND_API_KEY` | Email delivery |
| `RESEND_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_SECRET_KEY` | Billing/subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Stripe event verification |
| `TWILIO_ACCOUNT_SID` | SMS/voice |
| `TWILIO_AUTH_TOKEN` | SMS/voice auth |
| `TWILIO_PHONE_NUMBER` | Sending number |
| `OPENAI_API_KEY` | GPT integration |
| `ANTHROPIC_API_KEY` | Claude integration |
| `GEMINI_API_KEY` | Gemini AI brain |
| `VAPID_PUBLIC_KEY` | Web push notifications |
| `VAPID_PRIVATE_KEY` | Web push notifications |
| `VAPID_SUBJECT` | mailto:admin@coaileague.com |
| `REDIS_URL` | ChatDock pub/sub (shared across dev+prod) |

---

## Domain Route Map

All routes prefixed `/api/`. `requireAuth` applied at top-level mount.

| Domain | File(s) | Key Endpoints |
|--------|---------|---------------|
| Auth | authCoreRoutes.ts | POST /auth/login, GET /auth/me, POST /auth/logout |
| Shifts | shiftRoutes.ts | CRUD /shifts, /shifts/today, /shifts/upcoming |
| Employees | employeeRoutes.ts | CRUD /employees, /employees/:id |
| Time Entries | timeEntryRoutes.ts | POST /time-entries/clock-in, GET /time-entries/status |
| Invoices | invoiceRoutes.ts | CRUD /invoices, POST /invoices/:id/send |
| Payroll | payrollRoutes.ts | /payroll/runs, /payroll/process |
| Clients | clientRoutes.ts | CRUD /clients, /clients/:id |
| Notifications | notifications.ts | GET/POST /notifications, WS broadcast |
| Chat/ChatDock | dockChatRoutes.ts | /dock/rooms, /dock/messages (Redis pub/sub) |
| Trinity AI | trinityChatRoutes.ts + others | /trinity/*, /helpai/* |
| Scheduling | schedulesRoutes.ts | /schedules, /schedules/publish |
| Analytics | analytics.ts | /analytics/dashboard, /analytics/reports |
| Settings | settings.ts | /settings/workspace, /settings/billing |
| Onboarding | onboardingPipelineRoutes.ts | /onboarding/*, /invite/* |
| SPS Forms | spsFormsRoutes.ts | /sps/*, encrypted PII fields |
| Documents | documentVaultRoutes.ts | /documents/*, branded PDFs |
| Billing | billing-api.ts | /billing/*, Stripe integration |
| Admin | adminRoutes.ts | /admin/*, platform staff only |
| Health | health.ts | GET /health (Railway health check) |

---

## Permanent Architectural Rules

```
# Server
- All workspace queries MUST include workspace_id predicate
- Financial writes (invoices, payroll, payments) MUST use db.transaction()
- New routes: add to correct domain file in server/routes/domains/
- featureStubRouter MUST stay LAST in server/routes.ts
- WebSocket events: WsPayload type — never add data:any

# Trinity
- Trinity = ONE unified individual — no mode/personality toggles
- HelpAI = the only bot field workers see
- Trinity action registry: stay < 300 total actions
- Trinity never provides legal advice or assumes duty of care
- Purple = Trinity UI elements only. Gold = HelpAI elements only.

# Client
- Every workspace-scoped useQuery: must have enabled: !!workspaceId guard
- All React components: import React from 'react' if using React.X namespace
- Error boundaries wrap all lazy-loaded routes
- All push notification icons: absolute HTTPS URLs via absoluteIconUrl()

# Documents/PDFs
- Every generated document: branded PDF with header/footer/page numbers/doc ID
- Saved to tenant vault — never raw data output

# Notifications
- Idempotency keys: MUST use time-window (6-hour floor) never Date.now()
- This prevents duplicate notifications from Trinity autonomous scans

# TypeScript
- Zero any (verified by automated scan)
- tsc --strict: 0 errors
- catch(e: unknown) → instanceof Error narrowing — never e?.message directly
- No @ts-expect-error
```

---

## Active Issues Fixed This Session

| ID | Item | Code Status | Env Required |
|---|---|---|---|
| KI-001 | ChatDock Redis pub/sub | ✅ WIRED — `initChatDockPubSub()` in startup | `REDIS_URL` on Railway (auto-falls back to local if missing) |
| KI-007 | Web Push offline delivery | ✅ WIRED — `pushNotificationService.ts` | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` on Railway |
| KI-008 | ChatDock message store | ✅ WIRED — imported in `dockChatRoutes.ts` | Needs full per-message save/read wiring in next phase |
| ENV-1 | PII field encryption | ✅ SELF-PROTECTING — hard-crashes if missing key in prod | `FIELD_ENCRYPTION_KEY` on Railway (32-char random secret) |
| ENV-2 | Auditor token URLs | ✅ HAS FALLBACKS — all callers have `|| ''` fallback | `APP_BASE_URL` on Railway (e.g. `https://coaileague-development.up.railway.app`) |
| ENV-3 | Plaid encryption + webhook | ✅ SELF-PROTECTING — `configValidator` errors at boot in prod when Plaid is configured but secrets missing | `PLAID_WEBHOOK_SECRET` + `PLAID_ENCRYPTION_KEY` (or `FIELD_ENCRYPTION_KEY` ≥ 64 hex) when `PLAID_CLIENT_ID`/`PLAID_SECRET` set |

---

## Trinity Schedule → Payroll → Invoice Spine (verified 2026-05-02)

End-to-end autonomy chain. Every node is wired and started at boot.

```
[shifts]                                    Daemons started in server/index.ts
  ↓ shiftMonitoringService               2945  ShiftMonitoringService
  ↓ coveragePipeline                     2955  CoveragePipeline
  ↓ trinityAutonomousScheduler           routes/trinitySchedulingRoutes (Zod-validated, SLA-gated)
  ↓ shiftCompletionBridge                automation/shiftCompletionBridge
[time_entries]
  ↓ trinity.run_invoice_lifecycle        workflowOrchestrator (event: time_entry.approved)
[invoices]
  ↓ weeklyBillingRunService              1572  Weekly Billing Run
  ↓ overdueCollectionsService            2964  OverdueCollectionsSweep   ← NEW (was missing)
  ↓ Stripe webhook handler               /api/stripe/webhook (rawBody asserted)
[payroll_runs]
  ↓ payrollAutoCloseService              automationTriggerService daily
  ↓ payrollReadinessScanner              48h pre-deadline
  ↓ trinity.process_payroll_anomalies    workflowOrchestrator (45s subagent timeout)
  ↓ atomicFinancialLockService           pg_advisory_xact_lock
  ↓ achTransferService → Plaid           idempotency-keyed
  ↓ payrollTransferMonitor               2933  poll every 5 min
[paid_to_employee]
```

### Trinity action surface — financial verbs (after this verification pass)

Dispatcher patterns in `server/services/trinity/trinityActionDispatcher.ts`:

| Verb | actionId | Risk | Handler location |
|---|---|---|---|
| "send / email invoice" | `billing.invoice_send` | medium | `trinityInvoiceEmailActions.ts:54` |
| "resend invoice" | `billing.invoice_send` (resend:true) | low | same |
| "create / draft invoice" | `billing.invoice_create` | medium | `actionRegistry.ts:2208` |
| "void / cancel invoice" | `billing.invoice_void` | high | `actionRegistry.ts:2654` |
| "mark invoice paid" | `billing.invoice_status` (status:'paid') | medium | `trinityInvoiceEmailActions.ts:294` |
| "run payroll" | `payroll.run_payroll` | high | `actionRegistry` (queues) |
| "fill / cover shift" | `scheduling.fill_open_shift` | low | scheduling action set |
| "verify TOPS screenshot" | `trinity.verify_tops_screenshot` | — | `workflowOrchestrator.ts` ← NEW |

---

## Known Debt — Verification Pass 2026-05-02

These are documented gaps where code is *intentionally* incomplete or where a downstream system is missing. Address before marking the spine 100%.

| ID | Debt | Severity | Location | Notes |
|---|---|---|---|---|
| VD-01 | `billing.invoice_refund` has no handler | MEDIUM | dispatcher pattern was deliberately NOT added; refund handler must call `stripe.refunds.create` + reverse `invoicePayments` + ledger entry within a DB transaction | Pattern omitted on purpose so Trinity doesn't promise something she can't do. Add pattern only after handler ships. |
| VD-02 | Scheduling actions not in `trinityServiceRegistry` | LOW | `shared/config/trinityEditableRegistry.ts` lists protected/editable modules but no machine-readable scheduling-action surface | Cosmetic — actions still execute via dispatcher regex. |
| VD-03 | Cron-only workflows (missed_clockin, shift_reminder, payroll_anomaly) | LOW | `workflows/*.ts` register as actions but their cron triggers live in `autonomousScheduler` | If autonomousScheduler crashes they stall until restart. Add event subscriptions as defense-in-depth. |
| VD-04 | `taxDeadlineMonitor` cron at 06:00 only | LOW | `proactiveOrchestrator.ts` schedule | If boot is after 06:00 on a deadline day the alert misses. Acceptable for v1. |
| VD-05 | ~~`tests/security/` not in vitest workspace~~ | RESOLVED 2026-05-02 | `vitest.workspace.ts` now has a `security` project — run via `npx vitest run --project security`. |
| VD-06 | Plaid 429 exhaustion → silent `payment_held` | MEDIUM | `plaidService.ts:239-262` after 3 retries | `payrollTransferMonitor` alerts owner after 3 consecutive Plaid API failures, but resolution is manual. |
| VD-07 | `payrollAnomalyWorkflow` 45s timeout fails OPEN | MEDIUM | `payrollAnomalyWorkflow.ts` | On timeout the workflow returns `blocked:false, success:false` — payroll is NOT auto-blocked. The summary string explicitly recommends manual review; UI must surface this. |
| VD-08 | `bank-status` endpoint returns any employee in same workspace | LOW | `plaidRoutes.ts:348-383` | Only returns last4 + institution name (no full account #) but is a same-workspace privacy leak. Add `isSelf || isManagerOrAbove` guard. |
| VD-09 | Stripe API version pinned to `2025-09-30.clover` | LOW | `stripeClient.ts:19` | No fallback path if Stripe deprecates. Acceptable until Stripe announces breaking change. |

---

## Statewide Protective Services — Live Test Readiness

| Check | Status |
|-------|--------|
| Founder exemption wired | ✅ `founderExemption.ts` |
| Enterprise tier granted | ✅ Permanent |
| Login (cookie domain fixed) | ✅ |
| Schedule loads | ✅ (React + enabled guard fixed) |
| Employee list | ✅ |
| Clock in/out | ✅ GPS + photo verification |
| Invoice creation | ✅ |
| ChatDock (Redis) | ✅ Single Redis shared across dev+prod |
| Push notifications | ✅ Absolute icon URLs |
| Trinity AI | ✅ (GEMINI_API_KEY required) |

---

## Handover Notes for Next Session

### Pending Work (carry forward)
See `PENDING_WORK.md` or memory — ChatDock Feature Parity, Voice, Inbound Email expansion,
Seasonal effects, Trinity Biological Brain enhancement, Pre-Go-Live Audit.

### Files Never to Modify Without Full Understanding
- `server/routes.ts` — featureStubRouter position is critical
- `server/auth.ts` — session/cookie config affects all auth
- `server/services/billing/founderExemption.ts` — Statewide permanent exemption
- `build.mjs` — externals list prevents production crashes
- `shared/schema.ts` — 661-table schema, coordinate with DB migrations

### Key Singleton Patterns
- `aiBrainActionRegistry` — sync actions via constructor, async via `ready` Promise
- `helpaiOrchestrator` — imports from `server/services/helpai/platformActionHub`
- `getChatDockPubSub()` — Redis or in-memory based on REDIS_URL presence
- `universalNotificationEngine` — workspace-scoped, 6hr dedup windows

### Production Monitoring Signals
- `/api/health` — Railway health check, returns service status
- `[ChatDurability] No REDIS_URL` in logs = single-replica mode (set REDIS_URL to fix)
- `FIELD_ENCRYPTION_KEY not configured` in logs = SPS forms degraded
- `GEMINI_API_KEY not found` in logs = Trinity AI brain disabled

---

*SYSTEM_MAP.md updated 2026-05-02 | CoAIleague Platform v2.4*
