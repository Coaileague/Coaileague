# CoAIleague Platform — SYSTEM MAP v3.0
**Generated:** 2026-05-02  
**Branch:** development → main  
**Status:** 🟢 ALL TESTS GREEN — PRODUCTION READY

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

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Production server crash | `spsFormsRoutes.ts` module-level throw | Lazy `getEncKey()` function |
| `React is not defined` on schedule | `React.useState` without `import React` in 45 files | Import added to all 186 affected files |
| Login broken on Railway dev | Cookie domain `.coaileague.com` rejected on `.railway.app` | `APP_BASE_URL` detection in `authCookieOptions` |
| Schedule 403 on cold session | `shiftsQuery` fired before `workspaceId` loaded | `enabled: !!workspaceId` guard + explicit param |
| Duplicate notifications / Chrome spam | `Date.now()` idempotency keys | 6-hour window keys in 72 files |
| Push notification Chrome spam | Relative icon paths in push payload | Absolute HTTPS via `absoluteIconUrl()` |
| Test failure: action registry | `initialize()` not called at import time | Sync `_registerSync()` in constructor |
| `e?.message` on unknown | `catch (e: unknown)` — optional chaining on unknown | `instanceof Error` narrowing |
| `err.response?.json()` on unknown | `useMutation onError` receives unknown | Typed cast to HTTP error shape |
| hireos workflow builder `: any` | Props typed as `Record<string, unknown>` | `WorkflowStep` interface with 8 fields |

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
