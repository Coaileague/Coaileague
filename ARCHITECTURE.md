# CoAIleague Platform Architecture
### Single Source of Truth Reference
**Version 2.0 | March 2026**

---

## Core Principle

Every feature, pipeline, and automation in CoAIleague has **exactly one canonical source**. When in doubt about where something lives, this document and `server/services/sourceOfTruthRegistry.ts` are the authority.

**Trinity is the final gate** — all AI-dispatched actions, automated workflows, and cross-domain operations flow through Trinity before execution. Trinity reads the Source-of-Truth Registry to validate routing.

---

## Server Architecture

### Entry Points (in order)

```
HTTP Request
  → server/index.ts                    ← starts Express + HTTP server
  → server/routes.ts                   ← domain orchestrator (NO direct routes here)
      → setupAuth()                    ← session + passport
      → trinityOrchestrationMiddleware ← Trinity injects context into every request
      → mountXxxRoutes(app)            ← one mount function per domain (see below)
  → printRegistryAtStartup()           ← validates Source-of-Truth Registry at boot
```

### Domain Routing Law

**No route is ever mounted directly in `server/routes.ts`.**
Every route belongs to exactly one domain file in `server/routes/domains/`.
Domain files import from leaf route files in `server/routes/*.ts`.

```
server/routes.ts                       ← orchestrator only
server/routes/domains/
  auth.ts        → /api/auth           ← authentication
  billing.ts     → /api/billing        ← Stripe, credits, invoices, QB
  clients.ts     → /api/clients        ← client accounts and sites
  comms.ts       → /api/conversations  ← chat, messages, notifications
  compliance.ts  → /api/compliance     ← documents, certs, i9
  ops.ts         → /api/incidents      ← RMS, CAD, guard tours
  orgs.ts        → /api/workspace      ← workspaces, onboarding
  payroll.ts     → /api/payroll        ← payroll, expenses
  sales.ts       → /api/proposals      ← leads, proposals, RFP
  scheduling.ts  → /api/shifts         ← shifts, availability
  support.ts     → /api/helpdesk       ← HelpAI, support tickets
  time.ts        → /api/time-entries   ← clock-in/out, timesheets
  trinity.ts     → /api/trinity        ← AI brain, automation, bots
  workforce.ts   → /api/employees      ← employee records, HRIS
  audit.ts       → /api/audit          ← catch-all + audit logs (MUST BE LAST)
```

---

## Source-of-Truth Registry

Machine-readable version: `server/services/sourceOfTruthRegistry.ts`

Every domain entry specifies:
- **canonicalApiPrefix** — the one true API path
- **canonicalRouteFile** — which file registers those routes
- **canonicalService** — which service handles the business logic
- **legacyAliases** — old paths that redirect to canonical (not duplicate implementations)
- **humanGateRequired** — whether Trinity requires human approval before executing

---

## Frontend Architecture

### Route Structure (`client/src/App.tsx`)

Three routing blocks, in priority order:

1. **`isPublicRoute` early-return** (lines ~1104–1162)
   — Renders immediately before auth loads. Canonical definition of all public/marketing pages.
   — Pages: `/`, `/login`, `/pricing`, `/terms`, `/privacy`, `/support`, `/register`, etc.

2. **Mobile block** (lines ~1197–1460)
   — Authenticated routes for mobile users. Rendered when `!isDesktop`.
   — Public pages appear here as **intentional fallbacks** for logged-in users who navigate to public URLs.
   — They MUST stay in sync with block #1. They are NOT duplicates — they serve a different context.

3. **Desktop block** (lines ~1574–1830)
   — Authenticated routes for desktop users with sidebar.
   — Same fallback pattern as mobile block for public pages.

### Page Ownership (Frontend Source of Truth)

| Feature | Canonical Page | Notes |
|---------|----------------|-------|
| Login / Auth | `pages/login.tsx` | |
| Dashboard (Owner) | `pages/dashboard.tsx` | Role determines which card set renders |
| Employees | `pages/employees.tsx` | |
| Schedule | `pages/universal-schedule.tsx` | Canonical. `schedule-mobile-first.tsx` is a legacy alias |
| Time Tracking | `pages/time-tracking.tsx` | |
| Payroll | `pages/payroll-dashboard.tsx` | |
| Invoices | `pages/invoices.tsx` | |
| Clients | `pages/clients.tsx` | |
| Compliance | `pages/compliance/index.tsx` | Module owns all sub-pages |
| Help Desk | `pages/helpdesk.tsx` | 5-line wrapper → `ChatDock.ChatFullPage` |
| Chat Rooms | `pages/chatrooms.tsx` | |
| Chat (IRC) | `pages/HelpDesk.tsx` | Full IRC/MSN component used at `/chat/:roomId` |
| AI Brain | `pages/ai-brain-dashboard.tsx` | |
| Trinity Chat | `pages/trinity-chat.tsx` | |
| Settings | `pages/settings.tsx` | |
| Workspace | `pages/workspace.tsx` | |

### Orphaned / Retired Pages

| File | Status | Reason |
|------|--------|--------|
| `pages/onboarding.tsx` | **Orphaned** | Imported but never routed. Superseded by `onboarding-start.tsx`, `employee-onboarding-wizard.tsx`, and `workspace-onboarding.tsx` |

---

## Service Layer (Backend)

### Canonical Services Per Domain

| Domain | Canonical Service | Legacy / Co-existing |
|--------|------------------|----------------------|
| Auth | `server/auth.ts` | `server/services/authService.ts` (extended logic) |
| AI Credits | `services/billing/creditsLedgerService.ts` (Singleton) | `creditLedger.ts` (legacy, read-only callers) |
| Notifications | `services/universalNotificationEngine.ts` | `notificationService.ts`, `notificationStateManager.ts` (adapters) |
| QuickBooks | `services/quickbooks/quickbooksPhase3Service.ts` | `quickbooksSyncService.ts`, `quickbooksService.ts` (legacy) |
| AI Orchestration | `services/ai-brain/aiBrainMasterOrchestrator.ts` | Multiple bot files are domain handlers, not duplicates |
| Chat | `services/ChatServerHub.ts` | Single WebSocket server, no alternative |
| HelpAI | `services/helpai/helpAIBotService.ts` | |
| Scheduling | `services/schedulingService.ts` | `autonomousScheduler.ts` handles cron automation |

### AI Route Files (All Distinct — No Conflicts)

| Mount Path | File | Purpose |
|------------|------|---------|
| `/api/ai/orchestra` | `aiOrchestraRoutes.ts` | Meta-cognition, usage, credit settings, model selection |
| `/api/ai-orchestrator` | `aiOrchestratorRoutes.ts` | Process/consult/verify/route/score requests |
| `/api/ai-brain` | `ai-brain-routes.ts` | Core AI brain actions and knowledge graph |
| `/api/ai-brain/control` | `aiBrainControlRoutes.ts` | Admin controls for the AI brain |
| `/api/ai-brain` (inline) | `aiBrainInlineRoutes.ts` | Inline workspace-scoped AI actions |
| `/api/ai` | `aiRoutes.ts` | Generic AI endpoint entry point |

---

## Trinity as Final Gate

### How Trinity Intercepts All Requests

Every HTTP request passes through `trinityOrchestrationMiddleware` (injected in `server/routes.ts`).
This middleware:
1. Identifies the requesting user and their workspace
2. Classifies the request (domain, complexity, role, urgency)
3. Logs the action to the Trinity audit trail
4. Applies any active blocks or restrictions

### Trinity Automation Routing

When Trinity dispatches an automation action, it:
1. Looks up the domain in `sourceOfTruthRegistry.getCanonicalEntry(domain)`
2. Confirms the `canonicalApiPrefix` is the target
3. If `humanGateRequired = true`, creates a pending approval before executing
4. Executes via the `Platform Action Hub` registered actions — NEVER via direct service calls

### Human Gate Domains

The following domains require explicit human approval before Trinity can execute write operations:

- **scheduling** — shift publish requires manager approval
- **time_tracking** — timesheet approvals require manager
- **payroll** — payroll runs require owner/manager approval
- **billing** — invoice actions require owner approval
- **sales** — proposals require owner review

---

## Notification System

Three services exist — they are **adapters, not competitors**:

| Service | Role |
|---------|------|
| `universalNotificationEngine.ts` | **Canonical engine** — all outbound notifications go through here |
| `notificationStateManager.ts` | WebSocket broadcast adapter — wraps the canonical engine for real-time push |
| `notificationService.ts` | Email/SMS adapter — wraps the canonical engine for async delivery |

**Rule:** Never call `notificationService` or `notificationStateManager` directly from routes.
Always go through `universalNotificationEngine`.

---

## QuickBooks Integration

Three files exist as a migration path — only Phase 3 is canonical for new work:

| File | Status |
|------|--------|
| `quickbooksService.ts` | Legacy v1 — read only, do not add new functionality |
| `quickbooksSyncService.ts` | Legacy v2 — read only, do not add new functionality |
| `quickbooksPhase3Service.ts` | **Canonical** — all new QB features go here |

---

## Credit Ledger

Two files exist as a migration path:

| File | Status |
|------|--------|
| `creditLedger.ts` | Legacy — existing callers still use it; do not add new functionality |
| `creditsLedgerService.ts` | **Canonical Singleton** — all new credit operations go here |

---

## Dev Sandbox Accounts

| Account | Email | ID |
|---------|-------|----|
| Owner | `owner@acme-security.test` | `dev-owner-001` |
| Manager | `manager@acme-security.test` | `dev-manager-001` |
| Workspace | `dev-acme-security-ws` | |
| HelpDesk Room | `e544d8dd-e498-4600-b906-17fc78571ff9` | slug=helpdesk, workspaceId=null |

**Dev Login:** `GET /api/auth/dev-login` — bypasses password auth and clears any account locks.
Never expires. Works in development only.

---

## Laws That Must Never Be Broken

1. **No DROP TABLE** — use `psql $DATABASE_URL -c "ALTER TABLE..."` for schema changes
2. **No raw hex colors** — always use CSS variables or `CHART_PALETTE.*`
3. **No routes in routes.ts** — all routes belong in domain files
4. **No direct service calls from Trinity dispatches** — always use Platform Action Hub
5. **No duplicate fixed bottom navs** — global `MobileBottomNav` is the only fixed bottom bar
6. **workspaceId from session** — always `(req.user as any)?.currentWorkspaceId`
7. **Dev accounts never get locked** — dev-login always calls `recordSuccessfulLogin`
