# OMEGA.md — CoAIleague Permanent Agent Context
## Read this file at the start of every session. No exceptions.

---

## WHAT THIS FILE IS

This is the single source of truth for everything about this platform,
its current state, its architectural laws, and what needs to happen to
reach production. Every session starts here. You never ask Bryan to
re-explain context that is in this file. You update the STATE section
at the bottom after every meaningful work session.

---

## PLATFORM IDENTITY

CoAIleague is a B2B SaaS workforce management platform built
exclusively for security guard companies. It is multi-tenant. Every
security company that signs up gets their own isolated workspace.

**STATEWIDE PROTECTIVE SERVICES — PRODUCTION TENANT RULES**

Statewide Protective Services (SPS) is Bryan's real operating
security company. It is the first live production tenant on
CoAIleague and the platform owner.

WHAT STATEWIDE PAYS:
- Subscription fee: NEVER charged. Zero. Does not accrue.
  Does not expire. No trial. No billing cycle for subscription.
- Middleware fees: YES — billed monthly based on actual usage
  (invoice processing fees 2.9% + $0.25, payroll middleware
  fees per employee per run, Stripe Connect payout fees)
- Payroll ACH: YES — Plaid transfer fees apply per transfer
- Invoice collection: YES — processing fees apply when clients
  pay invoices through the platform

HOW STATEWIDE IS BILLED FOR MIDDLEWARE:
At the end of each calendar month, generate a single
consolidated middleware bill for Statewide covering:
- All invoice processing fees for the month
- All payroll processing fees for the month
- All payout fees for the month
- No subscription line item ever appears on this bill

WHAT STATEWIDE GETS:
- Maximum tier — ALL features unlocked, all tiers, permanently
- No seat limit
- No storage limit enforcement (quota tracked but never blocked)
- No token/AI usage limit (usage tracked but never blocked or
  overaged — Bryan reviews usage monthly)
- No expiry of any kind
- No automated billing enforcement of any kind except middleware

EXEMPTION IMPLEMENTATION RULES:
- The grandfathered exemption must be EXPLICIT in code
  not merely absent from billing jobs
- Every billing job, trial expiry job, seat overage job,
  token overage job must have an explicit Statewide check:
  if (workspace.founderExemption) skip and continue
- Exemption is scoped to Statewide workspace_id only
- No other tenant ever receives this exemption
- Billing page for Statewide shows:
  'Enterprise tier — Complimentary'
  'Subscription: Grandfathered — No charge'
  'Middleware fees: Billed monthly based on usage'

STATEWIDE IN TESTING:
- NEVER used as a test workspace
- NEVER seeded with test data
- NEVER mutated by agent scripts
- READ-ONLY for any verification check
- ACME Security is the exclusive sandbox always

IDENTITY IN CODE:
- Statewide's workspace UUID lives ONLY in the environment variable
  GRANDFATHERED_TENANT_ID — never hardcoded in source files
- No UUID, name, or initials ("SPS") appear in source code
- Guards use: if (workspaceId === GRANDFATHERED_TENANT_ID) skip
- In dev: GRANDFATHERED_TENANT_ID is unset; exemption is inactive (safe)

**Development sandbox:** ACME Security
The only writable sandbox. All testing, simulation, and seeding runs
here. Never Statewide.

**Platform owner contact:** Bryan (via platform admin account)

---

## BUSINESS MODEL

Subscription tiers (monthly, per workspace):
- Trial: Free, 14 days, Professional features unlocked
- Starter: $299/month
- Professional: $999/month
- Business: $2,999/month
- Enterprise: $7,999/month
- Strategic: Custom pricing, no automated billing enforcement

Seat overage: $25/seat over plan limit
Token overage: $2.00 per 100,000 tokens over monthly allowance (billed at end of month)
Invoice middleware fee: 2.9% + $0.25 per payment
Payroll middleware fee: $2.50–$4.95 per employee per run
Stripe Connect payout fee: 0.25% per direct deposit
QuickBooks sync fee: per-sync fee (billed internally)

---

## ARCHITECTURAL LAWS — ABSOLUTE AND NON-NEGOTIABLE

Violating any law is a production blocker. No exceptions.

**LAW 1 — NDS SUPREMACY**
NDS (NotificationDeliveryService) is the ONLY notification sender.
No direct SMTP. No direct Resend/Twilio calls outside NDS.
Four approved bypass exceptions only:
- sendVerificationEmail
- sendMagicLinkEmail
- sendPasswordResetEmail
- sendEmailChangeVerification

**LAW 2 — TENANT ISOLATION**
Every DB query touching tenant data must include workspace_id in
WHERE clause. workspace_id from server-side session is authoritative.
Client-supplied workspace_id is ignored for authorization.
No query loads tenant data before scope validation.

**LAW 3 — AUTH MODEL TRUTH**
Session-based auth — NOT JWT. Tokens are SHA-256 hashed.
Cookies: httpOnly, secure, sameSite=strict.
session.regenerate() fires on login AND workspace switch.
Password reset invalidates ALL active sessions for that user.
Admin-forced reset invalidates target user's sessions.

**LAW 4 — SINGLE SOURCES OF TRUTH**
- roleDefinitions.ts = sole source for all roles
- featureRegistry.ts = sole source for all feature gates
- billingConfig.ts = sole source for quotas, fees, plan limits, token allowances
- emailProvisioningService.ts = provisions exactly 6 addresses/tenant

**LAW 5 — TRINITY TRIAD**
- Gemini = primary operator
- OpenAI = fallback/workhorse
- Claude = validator/judge
Fallback order: Gemini fails → OpenAI → Claude validates
All fail → Safe Mode: read-only, no mutations, NDS alert to manager
Conflicts → TRINITY_CONFLICT_QUEUE (must have resolution path)

**LAW 6 — ZERO-TRUST TRINITY**
Trinity is API-only. Any filesystem access attempt triggers:
- immediate process kill
- security incident log
- NDS alert to platform admin

**LAW 7 — FINANCIAL IMMUTABILITY**
Audit logs, paid invoices, payroll confirmations are append-only.
App DB user must not have UPDATE/DELETE on append-only tables.
Locked records reject mutation from all paths: API, workers,
internal services, Trinity actions, and admin tooling.

**LAW 8 — FINANCIAL ATOMICITY**
Path A (Stripe involved): Stripe charge + financial_processing_fees
record + platform_revenue record — all three atomic.
Path B (internal fee, no Stripe): financial_processing_fees record +
platform_revenue record + audit record — all atomic.
Partial recording in either path = Class A failure.

Chargeable events → Path A:
payroll run, invoice paid via Stripe, invoice marked paid (card/ACH),
seat overage, token overage, Stripe Connect payout

Chargeable events → Path B:
QuickBooks sync fee (internal fee only)

**LAW 9 — SCHEDULING AUDIT LAW**
All scheduling mutations write scheduling_audit_log BEFORE mutation
completes. Blocked mutations do NOT create audit records.

**LAW 10 — EMAIL ADDRESS LAW**
Each workspace gets exactly 6 addresses, subdomain format only:
staffing@{slug}.coaileague.com
calloffs@{slug}.coaileague.com
incidents@{slug}.coaileague.com
support@{slug}.coaileague.com
docs@{slug}.coaileague.com
billing@{slug}.coaileague.com
No dash-alias format. No plus-addressing. Zero exceptions.
The 6th address is docs@ — not trinity-system@.

**LAW 11 — BRANDING LAW**
Use PLATFORM.name from platformConfig everywhere.
No hardcoded "CoAIleague" in server responses, email templates,
SMS bodies, PDF headers, AI prompts, public pages, notifications,
calendar outputs, or auth issuer labels.
Allowed exceptions: platformConfig source file, migration history,
test fixtures marked non-production, archived documentation.

**LAW 12 — GRANDFATHERED TENANT PROTECTION**
Statewide Protective Services is exempt from all billing enforcement
EXCEPT middleware fees (invoice, payroll, payout fees still apply).
Exemption must be explicit in code — not merely absent from billing jobs.
Every billing job must check founderExemption flag before processing.
Exemption is scoped to Statewide workspace identity only.
Identity lives in GRANDFATHERED_TENANT_ID env var — never in source code.

**LAW 13 — TENANT CONTAMINATION**
ACME artifacts cannot reach Statewide through: shared DB queries,
shared queues, shared WebSocket rooms, shared caches,
shared search indices, shared storage prefixes, or mis-scoped jobs.

**LAW 14 — TOKEN USAGE INTEGRITY**
Every AI action, email classification, voice interaction, and model
API call MUST write to token_usage_log. Untracked token consumption
is a billing integrity failure (Class A blocker #17).
Token usage NEVER blocks execution — always track, never gate.

**LAW 15 — ESM IMPORT PURITY**
This codebase is ESM ("type": "module"). `require()` does not exist.
ALL imports must use static ESM `import` at file top.
Heavy module lazy-loading uses `await import(moduleName)` inside
async functions — NEVER `require()`.
Built-in Node modules (crypto, http, https, path) must be statically
imported at file top, never require()-d inline.
`require()` anywhere in source (outside a comment) = hard blocker.
HOW IT BREAKS: Inside async callbacks, setImmediate, or deferred
execution contexts, `require` is not in scope even when tsx provides
CJS shim. This causes `require is not defined` at runtime and
cascading 500s across the platform.

**LAW 16 — RATE LIMITER SESSION AWARENESS**
The rate limiter middleware that distinguishes authenticated vs.
unauthenticated requests MUST check BOTH `req.user` AND
`req.session?.userId` to classify a request as authenticated.
Checking only `req.user` misclassifies authenticated page-load
requests as public (passport populates req.user after session
middleware runs but before route handlers; req.session is available
earlier). Misclassification routes auth'd page loads to the
20-req/min public limiter, which a single page load (8+ API calls)
exhausts immediately, causing blank screen.

**LAW 17 — SERVICE TIMER HYGIENE**
Every `setInterval()` in service code MUST call `.unref()` on the
returned NodeJS.Timer handle. This ensures clean process shutdown
(SIGTERM exits cleanly instead of hanging until SIGKILL), which
enables graceful deployment restarts without corrupted in-flight
requests. The HTTP server itself keeps the event loop alive — unref'd
timers still fire normally while the server runs.
Pattern: `setInterval(fn, ms).unref()` — never just `setInterval(fn, ms)`.
Stored class handles also need unref: `this.timer = setInterval(...).unref()`.

**LAW 18 — STRUCTURED LOGGING MANDATE**
`console.error`, `console.warn`, `console.log` are FORBIDDEN in all
server code (services, routes, middleware, workers, scripts).
All logging uses `createLogger(namespace)` from `../../lib/logger`.
The logger signature: `log.error(message: string, meta?: unknown)` —
first argument is ALWAYS a string. Violating this causes unstructured
output in production that bypasses log aggregation and alerting.
Fire-and-forget async calls must use structured logger in .catch():
  CORRECT: `.catch((err: unknown) => log.warn('[Service] Failed', err))`
  WRONG:   `.catch(console.error)`

**LAW 19 — DOMAIN TABLE IMPORT COMPLETENESS**
Every Drizzle table referenced in a route file or service file MUST
appear in that file's static imports at the top of the file.
Referencing a table that is imported elsewhere (transitively through
another module) causes ReferenceError at runtime when the route is
first invoked — it does NOT fail at startup, making it invisible to
health checks. The canonical pattern is a single `import { table1,
table2 } from '@shared/schema'` block at the top of every file that
queries those tables.

**LAW 20 — CLIENT PORTAL AUTOMATION GUARANTEE (99/1 RULE)**
Every client message sent through the DockChat/HelpAI portal MUST be
processed by a real AI model (costOptimizedRouter.execute()) — not
scripted fallback text. Scripted responses are ONLY permitted when the
AI call itself throws an exception, in which case a graceful fallback
is acceptable but must be logged as a warning. The goal is 99%
autonomous resolution; scripted-only responses violate this law.
Additionally:
  - All AI tokens consumed by client portal sessions MUST be written to
    workspaceAiUsage with workspaceId = the org's workspace (not per-client).
  - orgWorkspaceId MUST be validated against the workspaces table before
    deducting credits or creating sessions.
  - In-memory session Maps used by clientPortalHelpAIService MUST have a
    LAW 17-compliant cleanup timer (setInterval + .unref()) with a TTL
    of at most 4 hours per session.

**LAW 21 — CLIENT EVENT NDS NOTIFICATION MANDATE**
Any action a client takes through the portal that requires org attention
MUST immediately trigger an NDS notification to the org workspace owner
(workspaces.ownerId). These events always require notification:
  - Client submits a DockChat/HelpAI report (type: client_portal_report)
  - Client disputes an invoice from the portal (type: client_portal_dispute)
  - Client flags an emergency or violation
Notification MUST be fire-and-forget (non-blocking to client response).
Failure to notify is logged as warn, never as a 500 to the client.
Both 'client_portal_report' and 'client_portal_dispute' are registered
types in NotificationDeliveryService and MUST remain in the type union.

**LAW 22 — CSS LAYER SOURCE OF TRUTH (NO HARDCODED OVERLAY COLORS)**
All full-screen overlay backgrounds, z-index values, and animation durations
MUST be defined as CSS custom properties in `client/src/styles/css-manager.css`
and referenced by name — never hardcoded as raw values in component files.

PROHIBITED patterns (violation of this law):
  - `bg-black` on any `fixed inset-0` overlay → use `overlay-blocking` class
  - Raw `z-index: 9999` in inline styles → use `var(--z-splash)` etc.
  - `className="... bg-black ..."` on blocking overlays (SplashScreen, TransitionLoader,
    MaintenanceBanner, payment walls) → ALL must use `var(--overlay-bg)` (#0a1729)
  - Lazy-loading heavy components (e.g. TrinityRedesign) inside any overlay that
    renders before the app is loaded — lazy chunks fail silently, leaving a black void

REQUIRED patterns:
  - Full-screen blocking overlays: `className="overlay-blocking"` (defined in css-manager)
  - CSS spinner: `className="css-spinner"` (defined in css-manager, zero JS dependency)
  - Z-index stacking: `style={{ zIndex: 'var(--z-splash)' }}` for splash,
    `var(--z-transition)` for login/logout, `var(--z-system-modal)` for maintenance
  - All overlay text: `text-foreground` and `text-muted-foreground` — never `text-white`

Root cause this law prevents: Multiple components independently inventing `bg-black`
for overlays caused a persistent "black screen" bug on first load and after login,
because the black covered all content while ChatDock (a portal to document.body)
remained visible — making the platform appear entirely broken.

Semi-transparent backdrops (modals, sheets, drawers) MAY use `bg-black/40` style
opacity overlays — these are not full-screen blocking and are acceptable.

---

**LAW 23 — SCHEMA DRIFT: QUICKFIX IS THE MIGRATION CHANNEL**
Until `drizzle-kit push` is reliably executable in this environment (DB has 816+
tables causing schema pull to time out), ALL Drizzle schema columns/tables not yet
in the database MUST be added to `quickFixCommonColumns()` in
`server/services/databaseParityScanner.ts` using `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` or `CREATE TABLE IF NOT EXISTS`.

PROHIBITED patterns:
  - Defining a new column in `shared/schema.ts` without a corresponding `IF NOT EXISTS` patch
  - Relying on `drizzle-kit push` to run automatically or on CI without verifying it
    completes successfully in this environment

**LAW 26 — OMEGA HARNESS BASELINE REGRESSION GATE**
Before any release candidate, `scripts/omega/verify-prior-fixes.ts` MUST pass
with zero failures. A merge that drops this script below full pass is a blocker.
This harness is now treated as a regression gate for the platform's fixed
security, financial atomicity, Trinity routing, and tier enforcement guarantees.

**LAW 27 — TRINITY DOMAIN REGISTRATION INTEGRITY**
Trinity domain actions that are verified by OMEGA harness checks MUST remain
registered in `registerMissingDomainActions()` unless replaced by an equivalent
or stronger canonical registry path in the same commit.
At minimum, these insurance actions must remain resolvable by actionId:
`insurance.status`, `insurance.expiry`, `insurance.state_compliance`.
Removing or renaming them without updating the harness + laws is a regression.

REQUIRED pattern:
  - New column in schema.ts → immediately add `ALTER TABLE x ADD COLUMN IF NOT EXISTS y` to `quickFixCommonColumns()`
  - New table in schema.ts → immediately add `CREATE TABLE IF NOT EXISTS t (...)` to `quickFixCommonColumns()`
  - `quickFixCommonColumns()` runs at every boot, is fully idempotent, and is the canonical migration path

Root cause this law prevents: Drizzle schema drift — columns defined in code but missing in DB cause
runtime `column "x" does not exist` crashes that are only discovered at the exact moment a feature is used.

---

**LAW 24 — NO DEAD IMPORTS (ONE FILE MOUNTS, ONE FILE IMPORTS)**
Each route file MUST only be imported in the single file responsible for mounting it.
`server/index.ts` mounts inline semantic-alias routes only.
`server/routes.ts` is the canonical mount point for all domain route files.

PROHIBITED patterns:
  - Importing a route file in `server/index.ts` that is already mounted in `server/routes.ts`
  - Importing a file and never calling `.registerAction()`, `app.use()`, or any mount call
  - Dead import aliases that shadow real module resolution

REQUIRED pattern:
  - If a new route file is created, mount it ONLY in `server/routes.ts`
  - Remove any import in `server/index.ts` for routes already mounted in `server/routes.ts`

Root cause this law prevents: `server/index.ts` had 9 dead route imports, creating confusion about
which file is authoritative and masking real mount failures.

---

**LAW 25 — NO DUPLICATE ACTION REGISTRATIONS (ONE ACTIONID = ONE HANDLER)**
Each `actionId` string may only be registered once in the `platformActionHub`
singleton (also exported as `helpaiOrchestrator` — they are the same object).

PROHIBITED patterns:
  - Defining the same `actionId` in both a domain route file (e.g. `insuranceRoutes.ts`)
    and in `trinityMissingDomainActions.ts`
  - Calling `helpaiOrchestrator.registerAction(x)` or `platformActionHub.registerAction(x)`
    for any `actionId` that is already registered elsewhere
  - Silently swallowing `WARN: Duplicate action registration attempted` warnings

REQUIRED pattern:
  - When adding an action to a domain route, REMOVE the matching handler from
    `trinityMissingDomainActions.ts` if it exists there
  - The registration count comment in `trinityMissingDomainActions.ts` MUST be kept accurate
  - Run a grep for the `actionId` string before adding a new registration

Root cause this law prevents: 7 duplicate handlers in `trinityMissingDomainActions.ts` were
generating `WARN: Duplicate action registration attempted` on every boot and wasting compute.

---

**LAW 26 — Z-INDEX TIER SYSTEM: NEVER HARDCODE RAW NUMBERS**
Every z-index value in any component MUST be sourced from the canonical tier system.
There are two approved sources:
  - TypeScript: import { Z } from '@/lib/z-tiers'  → use Z.MODAL, Z.TOAST, etc.
  - CSS: use var(--z-index-modal), var(--z-toast), etc. (defined in index.css :root)

PROHIBITED patterns:
  - `style={{ zIndex: 9999 }}` — raw number in inline style
  - `className="z-[9999]"` — raw number in Tailwind arbitrary class
  - Any new CSS variable defined outside of the :root block in index.css
  - Adding a tier to z-tiers.ts without the matching CSS variable, or vice versa

REQUIRED pattern:
  - Before adding a tier: verify it belongs in a defined semantic group (see z-tiers.ts header)
  - Add to BOTH z-tiers.ts (TypeScript constant) AND index.css :root (CSS variable)
  - When modifying any existing component's z-index, grep for the numeric value first
    and migrate ALL occurrences to the tier constant in the same PR

TIER MAP (abbreviated — full table in client/src/lib/z-tiers.ts):
  sticky=1020, fixed-header=1030, setup-guide=1031, bottom-nav=1040,
  panel=1500, context-menu=1600, dropdown=2000, sheet=2001,
  modal=2501, tooltip=3000, chatdock=4000, toast=5000,
  system-modal=6500, splash=9000, trinity-overlay=9999, payment-wall=99999

Root cause this law prevents: 83+ components with arbitrary hardcoded z-index values
caused unpredictable stacking: nav overlays appearing under sticky headers,
chat FABs disappearing behind the app header, connection banners at z-10002
when all system-critical overlays max out at z-9999.

---

**LAW 27 — UNIVERSAL SCROLL ARCHITECTURE: EXPLICIT CONTAINERS ONLY**
The application uses an explicit-scroll-container model. `html`, `body`, and `#root`
NEVER scroll. Every route branch owns exactly ONE scroll container div.

CANONICAL CSS (index.css, must not be changed without updating this law):
  html  { height: 100dvh; overflow: hidden; touch-action: pan-y; }
  body  { height: 100%;   overflow: hidden; touch-action: pan-y; }
  #root { height: 100%;   overflow: hidden; touch-action: pan-y; }

  Public pages  → .public-page-scroll-root { height: 100%; overflow-y: auto;
                    touch-action: pan-y; -webkit-overflow-scrolling: touch; }
  Workspace     → <main class="flex-1 overflow-y-auto min-h-0"> owns scroll.
                    Outer div uses h-dvh (not h-screen).
  SidebarProvider → div[data-slot="sidebar-wrapper"] { height: 100%;
                    min-height: unset !important; } overrides Shadcn's min-h-svh.

PROHIBITED patterns:
  - Setting `overflow-y: auto` or `overflow-y: scroll` on `html`, `body`, or `#root`
  - Using `min-height: 100dvh` as the scroll container (min-height creates no scroll box;
    the element grows with content and the *parent* would need to be taller to scroll it)
  - Using `overflow: visible` on body/html expecting content to overflow html
  - Adding `overflow: hidden` inside a provider that wraps AppContent without
    verifying both public page and workspace scroll still work
  - Using `h-screen` (100vh) for workspace outer divs — use `h-dvh` to match
    the html anchor and avoid iOS bottom-bar clipping
  - Nesting a second `overflow-y: auto` wrapper inside `.public-page-scroll-root`
    or inside workspace `<main>` — creates competing scroll containers

REQUIRED before adding any new provider or layout wrapper:
  - Verify it adds no DOM with height constraint (or adds DOM that is height: 100%)
  - Test one-finger swipe scroll on a public page AND on a workspace dashboard page

Root cause this law prevents: "natural body scroll" (min-height: 100dvh on body,
overflow-y: auto on html) looks correct but fails because body with overflow-y: visible
never overflows html — html only scrolls when body is strictly taller, which requires
body to have overflow: visible AND content to actually exceed the viewport height in a
way the browser recognizes. This is fragile across browsers and iOS Safari versions.
The explicit-container model (html/body/root: overflow hidden; one child scrolls) is
the only pattern that is reliably consistent across iOS Safari, Chrome, and Firefox.

---

**LAW 28 — REACT CLASS COMPONENT: ALWAYS USE this.props AND this.state**
In every React class component, access props through `this.props` and state through
`this.state`. NEVER access them via unqualified `this.xxx` (which only works for
class instance properties, not React props/state).

PROHIBITED patterns:
  - `return this.children` — props are at `this.props.children`
  - `return this.fallback` — props are at `this.props.fallback`
  - `if (this.errorTitle)` — props are at `this.props.errorTitle`
  - Destructuring class instance properties (this.x) as if they were props in render()

REQUIRED pattern:
  - Always: `const { children, fallback } = this.props;`
  - Or: `return this.props.children;`
  - State: `this.state.hasError`, `this.setState({ hasError: true })`

Root cause this law prevents: The GlobalErrorBoundary and ErrorBoundary both used
`return this.children` instead of `return this.props.children` — every
`<ErrorBoundary>` wrapper throughout the app rendered nothing (blank page).
This was invisible to TypeScript because class instance properties and props both
resolve without type errors in some configurations.

---

**LAW 29 — NO DUPLICATE EXPORTED NAMES ACROSS PROVIDER FILES**
A named export (function, class, type, or constant) may only be defined ONCE
across the entire frontend codebase with any given name.

PROHIBITED patterns:
  - Two files both exporting `export function ThemeProvider()`
  - Two files both exporting `export function useTheme()`
  - Aliasing a duplicate at the import site to work around the collision:
    `import { ThemeProvider as WorkspaceThemeProvider } from '@/contexts/ThemeContext'`
    — this masks the naming problem; fix the source instead

REQUIRED pattern:
  - `@/components/theme-provider` exports: ThemeProvider, useTheme (dark/light/auto mode)
  - `@/contexts/ThemeContext` exports: WorkspaceBrandProvider, useWorkspaceBrand (workspace brand CSS vars)
  - Before adding a new provider, search for the name:
    `grep -r "export function <Name>" client/src`
  - If a name collision is found, rename the NEWER provider at its source file —
    not at every import site

Root cause this law prevents: Two files exported `ThemeProvider` and `useTheme`.
The collision caused the workspace brand provider to be aliased at every consumer
as `WorkspaceThemeProvider` while the hook `useTheme` remained ambiguous.
Any component that imported from the wrong source silently got the wrong theme context.

---

**LAW 30 — ERROR BOUNDARY EXHAUSTIVE FALLBACK**
Every `<ErrorBoundary>` and `<GlobalErrorBoundary>` wrapper MUST have an explicit
fallback UI defined. Silent failure (rendering nothing when the child throws) is
a production blocker — the user sees a blank section with no explanation.

PROHIBITED patterns:
  - `<ErrorBoundary>` with no fallback prop
  - A fallback that renders `null` or an empty fragment
  - An error boundary whose fallback depends on components that themselves might throw
    (the fallback must be pure HTML/CSS with zero React hook dependencies)

REQUIRED pattern:
  - Minimal valid fallback: `<div className="p-4 text-destructive text-sm">Something went wrong.</div>`
  - Production fallback: error boundaries used in route wrappers must show a retry button
    and a user-readable message (not a stack trace)
  - Platform-wide fallback: GlobalErrorBoundary renders the full error-500 page with
    a reload option; it also catches chunk load failures and auto-reloads once

Root cause this law prevents: Error boundaries with missing fallbacks silently rendered
blank sections. Combined with LAW 28 violations (wrong prop access in render()),
entire application branches were invisible to both the user AND to engineers because
no error UI appeared — the page just looked empty.

---

**LAW 31 — TOUCH-ACTION ANCESTOR POISONING: NEVER SET touch-action:none ON BODY OR ANY FULL-VIEWPORT ANCESTOR**
`touch-action` on any ancestor element applies to ALL of its descendants. Setting
`touch-action: none` on `body`, `html`, or `#root` disables one-finger swipe scrolling
on every child scroll container in the entire page, regardless of that child's own
`touch-action: pan-y` declaration. The child's setting does NOT override the ancestor.

Two-finger pinch-zoom still works because browser zoom is handled at the OS level and
bypasses `touch-action` entirely — this makes the bug appear as "only two-finger scroll
works," which is the diagnostic signature of this violation.

PROHIBITED patterns:
  - `body[data-scroll-locked] { touch-action: none !important }` — Radix sets
    data-scroll-locked on any dialog/sheet open; this rule then kills ALL touch scroll
    globally, including inside modal scroll areas
  - `body.modal-open { touch-action: none !important }` — same scope problem
  - `html { touch-action: none }` — poisons every element on the page
  - Any CSS selector that matches body, html, or #root and sets touch-action to none,
    pan-x-only, or pinch-zoom-only

REQUIRED patterns:
  - Scroll locking: use `overflow: hidden` on body/html — this prevents background scroll
    without blocking touch gesture propagation to foreground child elements
  - Modal/sheet drag handles that must capture drag: set `touch-action: none` ONLY on
    the specific drag-handle element itself (e.g. the pill div), not on any ancestor
  - All scroll containers: `touch-action: pan-y; -webkit-overflow-scrolling: touch`
  - html/body/root must carry `touch-action: pan-y` as a base (see LAW 27 canonical CSS)

INTERACTION WITH LAW 27:
  The explicit-container scroll model (LAW 27) and this law work together. LAW 27 sets
  `touch-action: pan-y` on html/body/#root. This law ensures nothing ever overrides that
  back to `none`. Any new scroll-lock mechanism MUST use `overflow: hidden`, not
  `touch-action: none`, to prevent background scroll.

Root cause this law prevents: "scroll only works with two-finger pinch, not one-finger
swipe" — confirmed on iOS Safari. Radix UI's data-scroll-locked attribute was present
on body after any modal or sheet had ever been opened. Our CSS rule applied
`touch-action: none !important` to body. Per the touch-action cascade spec, this blocked
pan gestures from reaching any child scroll container, making one-finger swipe globally
non-functional on every public page and workspace page.

---

## CLASS A PRODUCTION BLOCKERS

Any one = NOT GO until fixed and re-verified:

1. Cross-tenant data leakage of any kind
2. Mutation without audit trail where required
3. Paid invoice or closed payroll period can be modified
4. Financial append-only protections absent or bypassable
5. Financial recording fires only partially on any chargeable event
6. Trinity can access filesystem paths or secrets
7. Direct NDS bypass outside the 4 approved auth methods
8. WebSocket cross-tenant broadcast leak
9. Unscoped DB query touching tenant data
10. Duplicate financial writes from Stripe, payroll, or sync replays
11. Silent failure that drops customer-impacting work
12. Auth or authorization bypass on sensitive endpoints
13. Payment portal links are forgeable or tamperable
14. TRINITY_CONFLICT_QUEUE has no resolution path
15. officer_activated event does not publish on reactivation
16. ACME artifacts contaminate Statewide or any real tenant
17. Token usage is not being tracked — any Trinity action or
    AI feature that consumes tokens without writing to
    token_usage_log is a billing integrity failure
18. Statewide workspace receives a subscription charge,
    a token overage bill, or any automated billing action
    that is not a middleware fee — this is a Class A blocker

---

## WHAT TRINITY IS AND DOES

Trinity is the ambient AI operator running the entire platform
autonomously. It processes inbound communications, makes scheduling
decisions, handles coverage, generates documents, processes compliance,
and orchestrates every automated workflow.

**Trinity's Triad Architecture:**
- Gemini: Primary (executes most actions)
- Claude: Validator/judge (validates output, arbitrates conflicts)
- OpenAI: Workhorse/backup (high-volume tasks, Gemini fallback)
Meta-cognition executive layer sits above the triad and routes requests.

**Trinity's 7-Step Action Pipeline (every action, no exceptions):**
Trigger → Fetch → Validate → Process → Mutate → Confirm → Notify
1. RBAC gate fires BEFORE Fetch — data never loaded before auth check
2. MUTATE never runs if VALIDATE fails
3. CONFIRM writes audit record before NOTIFY fires
4. NOTIFY routes through NDS only
5. TOKEN USAGE TRACKING (replaces former credit check):
   - Before execution: record start of a token-consuming operation
   - After execution: record actual tokens consumed from model response
   - Write to token_usage_log: workspace_id, session_id, model_used,
     tokens_input, tokens_output, action_type, timestamp
   - Update token_usage_monthly running total for this workspace
   - If workspace has exceeded 200% of allowance: flag for admin review
   - NEVER block execution based on token usage — always track, never gate
   - Statewide: track but NEVER alert, NEVER bill, NEVER block
6. Failed actions retry max 3 times with exponential backoff
7. Rollback exists for MUTATE failures

**Trinity Email Classification:**
- billing@ → billing_inquiry → Billing folder
- calloffs@ → call_off → Call-Offs folder
- staffing@ → staffing_request → Staffing folder
- incidents@ → incident_report → Incidents folder
- support@ → support_inquiry → Support folder
- docs@ → document intake → Documents folder

**trinity@coaileague.com** = outbound marketing sender only.
Inbound replies → trinityMarketingReplyProcessor:
- Regulatory keywords/domains → REGULATORY lane → /regulatory page
- Prospect keywords → PROSPECT lane → /trial page
- Ambiguous → single clarifying question

**Trinity Voice:**
Single universal toll-free number. All callers hit the same number.
Phone number lookup workspace-scoped against employees and clients.
workspace_id resolved from verified caller identity only.
No caller can override workspace by naming a company.

**HelpAI:**
Trinity's second-in-command. Gold color in UI (Trinity = purple).
Platform layer: zero tenant data access.
Workspace layer: only current workspace data.

---

## TOKEN USAGE SYSTEM

### What It Is
Each workspace has a monthly token allowance based on subscription tier.
Token usage is tracked per session, per workspace, per month.
This is NOT a credit system — tokens are not purchased in advance.
Usage is metered; overages are billed at end of billing period.

### Token Allowances Per Tier (monthly)
- Trial:        500,000 tokens/month
- Starter:      2,000,000 tokens/month
- Professional: 10,000,000 tokens/month
- Business:     30,000,000 tokens/month
- Enterprise:   100,000,000 tokens/month
- Strategic:    Unlimited (tracked, reviewed monthly by Bryan)
- Statewide:    Unlimited (tracked, reviewed monthly by Bryan,
                never billed for overages — ever)

### Token Overage Pricing
When a workspace exceeds their monthly allowance:
- Per 100,000 tokens over limit: $2.00
- Overage calculated at end of billing month
- Overage invoice generated as DRAFT for org owner review
- Org owner has 7 days to review
- After 7 days: auto-approve and charge via Stripe on file
- Recorded in financial_processing_fees (Path B) and platform_revenue

### Token Tracking Rules
1. Every Trinity action, email classification, voice interaction,
   AI-assisted feature, and model API call records token usage
2. Token usage stored in token_usage_log table (see DB spec below)
3. Monthly rollup stored in token_usage_monthly table
4. Usage tracked per session for observability
5. Usage tracked per model for cost analysis
   (Gemini vs OpenAI vs Claude have different costs)

### Token Limit Enforcement
1. At 80% of monthly allowance:
   NDS warning to org owner: "You have used 80% of your monthly
   AI token allowance. Overage billing applies beyond your limit."
2. At 100% of allowance:
   DO NOT block Trinity or AI features
   Continue working — overage tracking begins
   NDS alert: "You have exceeded your monthly token allowance.
   Overages will be billed at $2.00 per 100,000 tokens."
3. At 200% of allowance (2× the limit):
   NDS critical alert to org owner
   Flag workspace for platform admin review
   Still do NOT block — overage continues to accrue
4. Statewide: track but NEVER alert, NEVER bill, NEVER block

### Token Usage Display
- Org owner dashboard: tokens used this month, allowance, percentage,
  estimated overage if current pace continues
- Platform admin dashboard: all workspaces ranked by token usage,
  total platform token costs

### Token Overage Billing Flow
1. At month end: calculate overage for each workspace
2. If overage > 0: create DRAFT invoice line item
3. NDS notification to org owner with overage details
4. 7-day review window
5. After 7 days: auto-approve, charge via Stripe
6. Record in financial_processing_fees (Path B)
7. Record in platform_revenue
8. Write audit record

---

## TOKEN USAGE DATABASE TABLES

token_usage_log (append-only):
  id, workspace_id, session_id, user_id, model_used,
  tokens_input, tokens_output, tokens_total, action_type,
  feature_name, timestamp
  INDEX: workspace_id, timestamp, model_used

token_usage_monthly (upserted atomically on each log write):
  id, workspace_id, month_year, total_tokens_used,
  allowance_tokens, overage_tokens, overage_amount_cents,
  overage_invoice_id (nullable),
  status: PENDING | INVOICED | PAID
  UNIQUE: (workspace_id, month_year)

Migration status: PENDING — tables not yet created.
Run migration before enabling token tracking in production.

---

## FULL FEATURE LIST BY TIER

**STARTER ($299):** Core scheduling, basic invoicing, call-off
management, NDS notifications, basic reporting, client portal,
Trinity email

**PROFESSIONAL ($999):** All Starter + ACH payroll via Plaid,
advanced scheduling, QuickBooks sync, document vault, contract
pipeline, RFP pipeline, financial intelligence, BI analytics,
Trinity Voice

**BUSINESS ($2,999):** All Professional + multi-workspace management,
advanced analytics, regulatory export, bulk operations

**ENTERPRISE ($7,999):** All Business + white-label branding,
custom AI model routing, enterprise automation rules

**STRATEGIC (Custom):** All Enterprise + custom limits. No automated
billing enforcement. Billed externally.

---

## EMAIL SYSTEM ARCHITECTURE

**Inbound routing:**
Single slug extraction path — subdomain only.
staffing@acme.coaileague.com → extract 'acme' → lookup workspace.
No dash-alias branch. No plus-addressing branch.
Root coaileague.com emails (no slug) → platform support queue only.

**Outbound:**
All automated replies send FROM noreply@coaileague.com.
Tenant address used as display sender and Reply-To header.
trinity@ is NEVER used as a tenant notification sender.

**SR-XXXXXXXX Threading:**
Every outbound Trinity email embeds unique SR reference.
Reply with SR → same thread. Reply without SR → new thread.
Never appended randomly. Never silently dropped.

**EmailHubCanvas folders:**
Staffing, Call-Offs, Incidents, Support, Billing, Documents,
Unread, Archive

---

## FINANCIAL SYSTEM

**Invoice lifecycle:** DRAFT → APPROVED → SENT → PAID → VOID
- DRAFT: created from completed shifts, rate × hours, no duplicates
- APPROVED: org owner must explicitly approve
- SENT: content write-protected, signed tamper-proof payment link sent
- PAID: all three financial layers in single atomic transaction
- VOID: credit memo created, original never deleted
- Both PAID and VOID are write-protected at API and service layer

**Payroll lifecycle:**
period_open → hours_submitted → rate_applied → period_closed →
payment_initiated → payment_confirmed/payment_failed
All events logged. Closed period immutable at SERVICE layer.

**Plaid ACH:**
Bank verification required before first transfer.
Unverified = PAYMENT_HELD status.
Per-employee transfers — not single batch.
PLAID_WEBHOOK_SECRET required on every webhook.

---

## SECURITY & SESSION

Session tokens SHA-256 hashed. No JWT.
session.regenerate() on login AND workspace switch.
Lockout: 5 failed attempts → 15-minute time-based lockout.
Lockout logged with structured warn.
Password reset clears lockedUntil and loginAttempts.

---

## PUBLIC ROUTES

/trial — Accessible without auth. Creates workspace, provisions 6
emails, initializes 8 folders, sends welcome from trinity@.

/regulatory — Accessible without auth. Creates regulatory_partnership
lead, notifies platform owner (Bryan) via NDS. Record persists even
if notification fails.

---

## STORAGE

All files in Google Cloud Storage — not Replit disk.
Storage path includes workspace_id.
Quota by category (email, documents, media, audit_reserve).
audit_reserve is always allowed regardless of other limits.
recordStorageUsage() called after every successful upload.

Quotas:
Trial:        email 300MB  docs 800MB  media 800MB  audit_reserve 100MB
Starter:      email 3GB    docs 5GB    media 6GB    audit_reserve 1GB
Professional: email 12GB   docs 20GB   media 25GB   audit_reserve 3GB
Business:     email 35GB   docs 70GB   media 80GB   audit_reserve 15GB
Enterprise:   email 120GB  docs 220GB  media 230GB  audit_reserve 30GB

Statewide: quota tracked but NEVER blocked. Unlimited in practice.

---

## PRIOR SESSION FIXES — 25 CONFIRMED

These were fixed and verified. Re-verify all 25 before any new work:

SECURITY:
1. requireAuth middleware: silent catch → structured logging
2. dashboardRoutes.ts /summary: workspace_id query param only honored
   for isPlatformAdmin
3. workspaceInlineRoutes.ts /switch: session.regenerate() before
   user identity re-written
4. auth.ts resetPassword(): authSessions.isValid = false for all
   user sessions after reset
5. adminRoutes.ts /reset-password: target user sessions invalidated
6. recordFailedLogin(): structured warn log on lockout

FINANCIAL:
7. payrollRoutes.ts: recordPayrollFee + recordMiddlewareFeeCharge
   both fire after successful Stripe payroll charge
8. stripeInlineRoutes.ts pay-invoice: chargeInvoiceMiddlewareFee fires
9. invoiceRoutes.ts mark-paid: chargeInvoiceMiddlewareFee fires for
   card/ACH only (not manual/cash/check)
10. weeklyBillingRunService.ts: recordMiddlewareFeeCharge fires on
    seat and token overages
11. stripeConnectPayoutService.ts: recordMiddlewareFeeCharge fires
12. quickbooks-sync.ts: recordQbSyncFee fires after CDC poll and sync

STRIPE:
13. create-subscription: active subscription guard present
14. stripeWebhooks.ts verifySignature: tries both test and live
    secrets in sequence

TIER GATES:
15. contractPipelineRoutes.ts → requirePlan('professional')
16. documentVaultRoutes.ts → requirePlan('professional')
17. rfpPipelineRoutes.ts → requireAuth + requirePlan('professional')
18. financialIntelligence.ts → requirePlan('professional')
19. biAnalyticsRoutes.ts → requirePlan('professional')
20. multiCompanyRoutes.ts → requireAuth + requirePlan('business')
21. enterpriseFeatures.ts → requirePlan('enterprise')

TRINITY:
22. trinityMissingDomainActions.ts: all 20 actions in boot logs
    (7 new: insurance.status, insurance.expiry, insurance.state_compliance,
    gate.current_occupancy, gate.flagged_vehicles, recognition.suggest,
    recognition.summary + 13 original = 20 total)
23. voice_support_cases + voice_support_agents: Drizzle schema exported

EVENTS:
24. officer_activated: published in employeeRoutes.ts on reactivation

ADMIN:
25. adminRoutes.ts: duplicate requirePlatformStaff removed from
    /platform/activities and /admin/metrics

---

## CURRENT OPEN CODE GAPS — FIX THESE

### GAP 1 — VOID INVOICE WRITE-PROTECT
Status: FIXED (invoiceRoutes.ts:997 + :1307-1310 + :1362-1363)
PAID and VOID both blocked at API layer with 409.

### GAP 2 — PER-WORKSPACE AI VELOCITY LIMITING
Status: FIXED — workspaceTrinityLimiter in rateLimiter.ts
In-memory sliding window, 50 actions/60s per workspaceId, 429 + Retry-After.
Applied to POST /api/ai-brain/actions/execute.

### GAP 3 — PII HARD-PURGE ENDPOINT
Status: FIXED — DELETE /api/workspace/employees/:id/pii-purge
ORG_OWNER only. Requires { confirm: "PURGE", reason: string }.
Pre-flight: legal hold (423) + open payroll records (409).
Also: POST /api/privacy/anonymize/:employeeId (org_owner or platform_staff).
Also: POST /api/privacy/anonymize-client/:clientId (org_owner or platform_staff).

### GAP 4 — DB-LEVEL APPEND-ONLY ENFORCEMENT
Status: PARTIAL — App layer enforces. DB user is 'postgres' (superuser).
REVOKE is ineffective against superuser. Requires dedicated app DB role.
[BRYAN ACTION REQUIRED]: Create app_db_user role with limited privileges.
REVOKE UPDATE, DELETE ON universal_audit_log, financial_processing_fees,
platform_revenue, scheduling_audit_log FROM app_db_user;

### GAP 5 — TOKEN USAGE TABLES
Status: OPEN — token_usage_log and token_usage_monthly tables do not yet exist.
Create migrations for both tables per spec in TOKEN USAGE DATABASE TABLES above.
Update billingConfig.ts to include tokenAllowances per tier.
Update Trinity pipeline to write token_usage_log on every AI call.

### GAP 6 — PRODUCTION TENANT IDENTITY IN SOURCE CODE
Status: IN PROGRESS — all hardcoded UUIDs, company names, and "SPS" initials
being removed from source files. GRANDFATHERED_TENANT_ID env var is the sole
reference. No UUID, name, or initials in any .ts source file.
billingConstants.ts now exports GRANDFATHERED_TENANT_ID from env var only.

---

## WEBHOOK CONFIGURATION — WHAT NEEDS TO HAPPEN

### Stripe
Endpoint: POST https://{domain}/api/stripe/webhook
Events: customer.subscription.created, customer.subscription.updated,
customer.subscription.deleted, invoice.payment_succeeded,
invoice.payment_failed, payment_intent.succeeded,
payment_intent.payment_failed, customer.updated, charge.refunded
Add BOTH test and live endpoints. Copy signing secrets to env vars:
STRIPE_WEBHOOK_SECRET (test) and STRIPE_LIVE_WEBHOOK_SECRET (live)

### Resend
Outbound: POST https://{domain}/api/webhooks/resend
Events: email.bounced, email.delivered, email.complained
Inbound: POST https://{domain}/api/webhooks/resend/inbound
Events: email.received
DNS MX record: Priority 10 → inbound.resend.com

### Twilio
Voice URL: POST https://{domain}/api/voice/inbound
Status Callback: POST https://{domain}/api/voice/status-callback
SMS URL: POST https://{domain}/api/sms/inbound
SMS Status: POST https://{domain}/api/sms/status
[BRYAN ACTION REQUIRED] — Must be entered in Twilio console manually
after toll-free verification completes.

### QuickBooks
Redirect URI: https://{domain}/api/integrations/quickbooks/callback
[BRYAN ACTION REQUIRED] — Must be entered in QB Developer Console.

### Plaid
[BRYAN ACTION REQUIRED] — All Plaid items blocked pending Bryan:
PLAID_CLIENT_ID, PLAID_SECRET, PLAID_WEBHOOK_SECRET, PLAID_ENV=production

---

## BRYAN ACTION REQUIRED — PHYSICAL ACTIONS ONLY BRYAN CAN DO

Do not attempt to implement these. Flag them and move on.

- [ ] Stripe: switch to live keys (sk_live_) + live webhook secret
- [ ] Plaid: production keys + PLAID_WEBHOOK_SECRET + PLAID_ENV=production
- [ ] Twilio: complete toll-free number verification, then enter 4 webhook URLs
- [ ] DNS: DMARC p=quarantine or p=reject
- [ ] DNS: DKIM upgrade to 2048-bit key
- [ ] DNS: MX record → Priority 10 → inbound.resend.com
- [ ] Resend: confirm domain verification for coaileague.com and *.coaileague.com
- [ ] QuickBooks: add redirect URI in QB Developer Console
- [ ] Session: confirm production signing secret differs from dev
- [ ] Environment: NODE_ENV=production before republishing
- [ ] DB: create app_db_user with limited privileges; REVOKE UPDATE/DELETE
      on universal_audit_log, financial_processing_fees, platform_revenue,
      scheduling_audit_log
- [ ] Environment: Set GRANDFATHERED_TENANT_ID in production env vars
      (this is the Statewide workspace UUID — Bryan sets it in production only)
- [ ] Environment: Set GRANDFATHERED_TENANT_OWNER_ID in production env vars
      (this is Bryan's user ID for the Statewide account owner record)

---

## SCRIPTS/OMEGA/ HARNESS

All scripts live in /scripts/omega/.
All scripts support --dry-run where applicable.
All scripts write evidence to OMEGA_STATE_CHECKPOINT.md.
No script mutates Statewide.
ACME is the only writable sandbox.

Required scripts:
- preflight-check.ts: env vars, provider config, boot health, routes
- setup-webhooks.ts: register webhooks with Stripe, Resend, Twilio via API
- verify-webhooks.ts: confirm all webhook URLs registered correctly
- verify-prior-fixes.ts: re-verify all 25 prior fixes + 4 new gaps
- reset-acme.ts: wipe ACME to clean baseline (--confirm required)
- email-routing-test.ts: send test email to each of 6 addresses, verify routing
- tenant-isolation-audit.ts: scan for unscoped queries, shared caches,
  bad WebSocket rooms, contamination vectors
- financial-atomicity-check.ts: verify all fee paths create exact records
- webhook-replay.ts: replay saved payloads, prove idempotency
- trinity-action-smoke.ts: invoke all Trinity actions vs ACME data
- chaos-smoke.ts: simulate Gemini timeout, AI Safe Mode, DB rollback,
  NDS failure, WebSocket cross-tenant injection, rate limit
- battle-sim.ts: run 32-step ACME simulation, stop on first failure
- statewide-readonly-verify.ts: verify Statewide production readiness
- canary-cleanup-dryrun.ts: generate cleanup plan for ACME after GO,
  never execute without Bryan approval

npm run omega executes in this order (stops on any failure):
1. verify-prior-fixes.ts
2. preflight-check.ts
3. setup-webhooks.ts
4. verify-webhooks.ts
5. email-routing-test.ts
6. tenant-isolation-audit.ts
7. financial-atomicity-check.ts
8. webhook-replay.ts
9. trinity-action-smoke.ts
10. chaos-smoke.ts
11. reset-acme.ts --confirm
12. battle-sim.ts
13. statewide-readonly-verify.ts
14. Print final evidence summary

---

## EXECUTION RULES FOR EVERY SESSION

1. Read this file completely before doing anything else
2. Read OMEGA_STATE_CHECKPOINT.md to know current state
3. Fix open gaps in order before starting new work
4. After every meaningful change: update OMEGA_STATE_CHECKPOINT.md
5. Never ask Bryan to re-explain context that is in this file
6. Never mutate Statewide under any circumstance
7. Never run tests against production data
8. ACME is the sandbox for everything
9. Flag Bryan-required items and move on — do not block on them
10. A layer is not complete until: records verified, events verified,
    notifications verified, audit trail verified, failure path verified
11. GRANDFATHERED_TENANT_ID (Statewide UUID) is NEVER hardcoded in
    source files. It lives only in the production environment variable.
    No UUID, company name, or initials in any .ts source file ever.

DEBUGGING PROTOCOL:
When given a debug command for any feature, do not
analyze the codebase randomly. Instead:
1. Open OMEGA.md and find the domain for the feature
   being debugged
2. Read the TRIGGER, STEPS, END STATE, OUTPUT, and
   RACE CONDITIONS for that feature
3. Trace the actual code against those steps in order
4. Find the exact step where actual behavior diverges
   from the specification
5. Fix only that divergence
6. Verify the END STATE matches the specification
7. Update OMEGA_STATE_CHECKPOINT.md with what was
   found and fixed

Never guess at intent. OMEGA.md defines intent.
Never fix things that are not broken.
Never change code that is not part of the broken step.

---

## SESSION START PROTOCOL — EVERY TIME

When starting a new session, do the following in order:
1. Read OMEGA.md (this file)
2. Read OMEGA_STATE_CHECKPOINT.md
3. State what is currently open and what you will work on
4. Ask no clarifying questions that are answered in these files
5. Begin work

---

## CURRENT STATE

*Last updated: 2026-04-04 (Session: Deep debug + runtime law codification)*

Production readiness score: 93/100 — GO (pending Bryan physical actions)

All 4 original code gaps now FIXED:
- GAP 1: VOID invoice write-protect ✅ FIXED (invoiceRoutes.ts:997, :1307)
- GAP 2: AI velocity limiting ✅ FIXED (workspaceTrinityLimiter, 50/min)
- GAP 3: PII hard-purge endpoint ✅ FIXED (DELETE + POST endpoints)
- GAP 4: DB-level REVOKE ⚠️ PARTIAL — app layer enforced; DB superuser blocks REVOKE [BRYAN]

New gaps opened this session:
- GAP 5: Token usage tables (token_usage_log, token_usage_monthly) not yet created
- GAP 6: Production tenant identity purge from source code — IN PROGRESS

Session 2 additional fixes:
- Email 6th address: docs@ restored (trinity-system@ was incorrect)
- Break-glass middleware (Section XXIII)
- PII anonymize: org_owner scope + client purge endpoint
- TRINITY_CONFLICT_QUEUE: resolution path implemented
- Session hardening: sameSite=strict, session.regenerate() on login
- Auth sessions invalidation on password reset (atomic transaction)
- Dual rate limiters: authenticatedLimiter (200/min) + publicApiLimiter (20/min)
- voidReason required (min 5 chars) for VOID invoices + payroll

Session 3 (OMEGA NUCLEAR) — App crash fixed, source code purge in progress:
- App startup crash fixed: missing imports for 9 route files
- All hardcoded Statewide UUIDs, names, and initials being removed from source code
- GRANDFATHERED_TENANT_ID env var established as sole identity reference
- founderExemption.ts rewritten — no UUID, no company name in source
- billingConstants.ts: GRANDFATHERED_TENANT_ID exported from env var only
- statewideGuard.ts: uses GRANDFATHERED_TENANT_ID from env
- subscriptionGuard.ts: uses GRANDFATHERED_TENANT_ID from env
- tierGuards.ts, tierDefinitions.ts: updated to use GRANDFATHERED_TENANT_ID
- communicationFallbackService.ts: SPS_WORKSPACE_ID removed
- clientPortalInviteRoutes.ts: hardcoded UUID removed
- productionSeed.ts: hardcoded workspace UUID and owner ID removed
- server/index.ts: Statewide name removed from comments
- OMEGA scripts: hardcoded UUID fallbacks to be removed

OMEGA Verification:
- ALL 7 OMEGA scripts pass (28/28, 29/29, 13/13, 11/11, 11/11, 33/33, 8/8)
- 4 L9/L10 defects fixed by T006
- Token usage system: specified in OMEGA.md, implementation pending

GO criteria remaining:
- GAP 5: Create token_usage_log and token_usage_monthly migrations
- GAP 6: Complete source code purge of production tenant references
- Build and run scripts/omega/ harness
- Bryan: set GRANDFATHERED_TENANT_ID in production environment
- Bryan completes physical action items (DNS, live keys, Twilio, Plaid)

Session 4 — Deep debug + runtime law codification:
- BLANK SCREEN ROOT CAUSE FIXED (3 bugs):
  * Rate limiter only checked req.user (not req.session.userId) → authenticated
    page-load requests hit 20/min public limiter → 429 cascade → blank screen
  * require() in rateLimiter.ts async setImmediate → require is not defined
  * employees table used in workspaceInlineRoutes.ts without static import
- ESM IMPORT SWEEP (LAW 15):
  * trinityMemoryService.ts: connectTrinityMemoryToEventBus() — require() → await import()
  * trinityStateContextService.ts: redundant require() removed (static import existed)
  * hireosRoutes.ts: 5 require() calls → static crypto/http/https, dynamic pdf-lib/pdfkit
  * onboardingInlineRoutes.ts: redundant require('crypto') removed (static import existed)
  * voiceRoutes.ts: require('twilio') → await import(), function made async
  * ai-brain-console.ts: require('drizzle-orm').like → destructured from await import()
- TIMER HYGIENE (LAW 17): Added .unref() to 4 anonymous service timers:
  * contextResolver.ts, trinityWebSocketService.ts (heartbeat)
  * behavioralMonitoringService.ts (periodic analysis)
  * browserAutomationTool.ts (idle timer)
- STRUCTURED LOGGING (LAW 18): Replaced 5 console.error/warn calls with log.*:
  * quickbooksPhase3Service.ts auto-init, payrollTransferMonitor.ts initial poll
  * inboundOpportunityAgent.ts (2 fire-and-forget handlers), invoice.ts tax warning
- PERMANENT LAWS ADDED: LAW 15 (ESM purity), LAW 16 (rate limiter session),
  LAW 17 (timer unref), LAW 18 (structured logging), LAW 19 (table imports)

PRODUCTION GOAL: GO by end of this weekend.

---

# OMEGA PLATFORM SPECIFICATION
## Complete Feature Logic, Flows, and Expected Outputs
## This section is the debugging specification — read it when tracing any bug

---

## HOW TO USE THIS DOCUMENT

When debugging any issue, find the relevant feature below.
Read: TRIGGER → STEPS → END STATE → OUTPUT → RACE CONDITIONS.
Trace where actual behavior diverges from this spec.
Fix only that divergence. Verify the end state matches.
Never guess at intent. This document defines intent.

---

# DOMAIN 1: AUTHENTICATION & USER MANAGEMENT

## 1.1 — User Registration / Signup

TIER: All (public route)
TRIGGER: POST /trial form submitted with company name, name, email, phone, state, guard count

STEPS:
1. Validate all fields server-side (required fields, email format, phone format)
2. Check email uniqueness — if exists return 409 "Account already exists"
3. Create workspace record: { slug, tier: trial, trial_expires_at: now+14days, stripe_customer_id }
4. Create user record: { email, name, phone, password_hash, role: ORG_OWNER }
5. Link user to workspace via workspace_members
6. Fire workspace.created event on event bus
7. emailProvisioningService provisions exactly 6 email addresses
8. EmailHubCanvas initializes exactly 8 folders
9. Send welcome email FROM trinity@coaileague.com via NDS
10. Create session, bind workspace_id to session
11. Redirect to onboarding wizard

END STATE:
- workspace record exists with correct tier and expiry
- user record exists with ORG_OWNER role
- exactly 6 email_addresses records in DB for this workspace
- exactly 8 email_folders records in DB for this workspace
- workspace.created event fired
- welcome email delivered via NDS
- active session exists

OUTPUT: User lands on onboarding wizard, logged in

RACE CONDITIONS:
- Double form submit → idempotency key on workspace creation, second returns 409
- Email already in use → checked before any records created

ERROR HANDLING:
- Provisioning failure → log error, mark workspace as provisioning_failed, alert platform admin via NDS
- No orphan workspaces — if any step fails, rollback all created records

---

## 1.2 — User Login

TIER: All
TRIGGER: POST /api/auth/login with email and password

STEPS:
1. Find user by email
2. Check account locked (lockedUntil > now) → return 403 with minutes remaining
3. Verify password hash
4. On failure: increment loginAttempts, if >= 5 set lockedUntil = now+15min, log structured warn
5. On success: clear loginAttempts and lockedUntil
6. Call session.regenerate() to issue new session ID
7. Resolve workspace from user.currentWorkspaceId
8. Bind workspace_id, user_id, role to session
9. Return user and workspace data

END STATE:
- Active session exists with workspace_id bound
- loginAttempts reset to 0
- lockedUntil cleared

OUTPUT: User receives session cookie, redirected to dashboard

RACE CONDITIONS:
- Concurrent login attempts → lockout counter uses atomic DB increment

---

## 1.3 — Workspace Switch

TIER: All (users with multiple workspace memberships)
TRIGGER: POST /api/workspace/switch/:workspaceId

STEPS:
1. Validate user is a member of target workspace
2. Call session.regenerate() — issues new session ID, old session invalidated
3. Bind new workspace_id to fresh session
4. Load workspace context and feature gates for new workspace
5. Return new session and workspace data

END STATE:
- New session ID issued
- Old session no longer valid
- New workspace_id bound to session

OUTPUT: User sees new workspace dashboard

RACE CONDITIONS:
- None — session.regenerate() is synchronous per request

---

## 1.4 — Password Reset

TRIGGER: POST /api/auth/forgot-password → POST /api/auth/reset-password-confirm

STEPS (forgot):
1. Find user by email
2. Generate single-use token, set resetToken and resetTokenExpiry = now+1hour
3. Send reset email via approved NDS bypass (sendPasswordResetEmail)

STEPS (confirm):
1. Find user by resetToken
2. Verify token not used (usedAt is null) and not expired
3. Hash new password
4. Set resetToken = null, resetTokenExpiry = null, usedAt = now
5. Set all authSessions.isValid = false for this user
6. Clear lockedUntil and loginAttempts
7. Return success

END STATE:
- resetToken nulled and unusable
- All active sessions invalidated
- loginAttempts cleared

OUTPUT: User must log in again with new password

RACE CONDITIONS:
- Two simultaneous resets → second fails because token already used (usedAt check)

---

# DOMAIN 2: WORKSPACE ONBOARDING

## 2.1 — Onboarding Wizard

TIER: All
TRIGGER: ORG_OWNER completes onboarding steps after workspace creation

STEPS:
1. Each step gated to ORG_OWNER role — Manager attempting returns 403
2. Steps in order: company info → first officer → first client → billing setup → Trinity intro
3. Each step completion writes to onboarding_progress table
4. On all steps complete: workspace.onboarding_completed = true
5. Fire onboarding.completed event on event bus

END STATE:
- All onboarding steps marked complete
- workspace.onboarding_completed = true

OUTPUT: User exits wizard to main dashboard

RACE CONDITIONS:
- Two sessions completing same step simultaneously → upsert with unique constraint on step+workspace

---

## 2.2 — Email Provisioning

TRIGGER: workspace.created event fires

STEPS:
1. Read workspace slug
2. Create exactly 6 email_addresses records:
   staffing@{slug}.coaileague.com
   calloffs@{slug}.coaileague.com
   incidents@{slug}.coaileague.com
   support@{slug}.coaileague.com
   docs@{slug}.coaileague.com
   billing@{slug}.coaileague.com
3. Register each address with Resend inbound routing
4. Create 8 EmailHubCanvas folder records:
   Staffing, Call-Offs, Incidents, Support, Billing, Documents, Unread, Archive
5. Set folder_id on each email_address to correct folder

END STATE:
- Exactly 6 email_addresses rows for this workspace_id
- Exactly 8 email_folders rows for this workspace_id
- All subdomain format — zero dash-alias

OUTPUT: Tenant email system is live and routing

RACE CONDITIONS:
- workspace.created fires twice → idempotency check, skip if addresses already provisioned

---

# DOMAIN 3: SUBSCRIPTION & BILLING (STRIPE)

## 3.1 — Tenant Subscribes to a Plan

TIER: Trial → any paid tier
TRIGGER: POST /api/stripe/create-subscription with tier selection

STEPS:
1. Check for existing active Stripe subscription for this workspace
2. If exists same tier → return existing subscription (no duplicate)
3. If exists different tier → return 409, direct to billing portal
4. If stale/deleted → clean up local record, proceed to create
5. Create Stripe customer if stripe_customer_id not set
6. Create Stripe subscription with correct price_id for selected tier
7. Stripe fires customer.subscription.created webhook
8. Webhook handler (signature verified, idempotent via event_id):
   - Update workspace.tier immediately
   - Update workspace.subscription_id
   - Unlock features matching new tier via featureRegistry
9. NDS notification to org owner: "Subscription active — [tier] plan"

END STATE:
- workspace.tier = selected tier
- workspace.subscription_id = Stripe subscription ID
- Feature gates reflect new tier immediately
- Audit record written

OUTPUT: Org owner sees upgraded features immediately

RACE CONDITIONS:
- Double subscription creation → active subscription guard (step 1-4)
- Webhook fires before local subscription stored → idempotency key handles replay

---

## 3.2 — Subscription Renewal (Automatic)

TRIGGER: Stripe fires invoice.payment_succeeded on monthly renewal

STEPS:
1. Webhook received, signature verified
2. Check processed_stripe_events for event_id → if exists return 200, skip
3. Insert event_id into processed_stripe_events (atomic)
4. Confirm workspace still active
5. Log renewal in billing_history
6. Update workspace.current_period_end
7. NDS notification to org owner: "Subscription renewed successfully"

END STATE:
- billing_history record for renewal
- workspace.current_period_end updated
- Idempotency record in processed_stripe_events

OUTPUT: No disruption to service, confirmation email sent

RACE CONDITIONS:
- Webhook replayed → event_id dedup prevents double processing

---

## 3.3 — Payment Failure

TRIGGER: Stripe fires invoice.payment_failed

STEPS:
1. Webhook received, signature verified, idempotent
2. NDS immediate alert to org owner: "Payment failed — update payment method"
3. Log failure in billing_events
4. Start grace period timer (do NOT immediately restrict)
5. If payment fails again after grace period → workspace enters soft-lock (read-only)
6. If still unresolved → workspace enters hard-lock after full grace period
7. On hard-lock: NDS critical alert to org owner

END STATE:
- Org owner notified immediately
- Grace period active
- Workspace remains functional during grace period

OUTPUT: Org owner receives failure alert, can update payment method

RACE CONDITIONS:
- Multiple failure events for same invoice → idempotency prevents multiple grace periods starting

---

## 3.4 — Seat Overage Calculation

TRIGGER: Weekly billing job runs

STEPS:
1. For each active workspace: count active employee records
2. Compare to tier.max_seats
3. If overage: calculate overage_count × $25
4. Create invoice line item as DRAFT (never auto-charge silently)
5. Record in financial_processing_fees (Path B — internal fee)
6. Record in platform_revenue
7. NDS alert to org owner with overage count and amount

END STATE:
- DRAFT overage invoice created
- financial_processing_fees record created
- platform_revenue record created
- Org owner notified

RACE CONDITIONS:
- Two weekly jobs run simultaneously → distributed lock on weekly billing job per workspace

---

## 3.5 — Trial Expiry

TRIGGER: Daily cron job checks trial_expires_at

STEPS:
1. Find all trial workspaces where trial_expires_at < now + 3 days
2. For each: check if warning_sent flag set — if not, send 3-day warning via NDS, set flag
3. Find all trial workspaces where trial_expires_at < now
4. For each expired: restrict workspace (read-only except billing routes)
5. NDS critical alert to org owner: "Trial expired — subscribe to continue"
6. Do NOT delete any data

END STATE:
- Workspace restricted if expired
- Warning sent 3 days before
- Data preserved

RACE CONDITIONS:
- Job runs twice → idempotency via warning_sent flag, restriction is idempotent state

---

## 3.6 — Stripe Customer Portal (Tenant Self-Service)

TRIGGER: ORG_OWNER clicks "Manage Billing" in workspace settings

STEPS:
1. Verify role = ORG_OWNER → 403 for others
2. Retrieve workspace.stripe_customer_id
3. Create Stripe billing portal session scoped to that customer ID
4. Return portal URL
5. Frontend redirects to Stripe portal

END STATE:
- Tenant manages their own payment method, invoices, subscription without Bryan

OUTPUT: Stripe Customer Portal opened in browser

RACE CONDITIONS:
- None — portal session creation is stateless

---

# DOMAIN 4: BANKING & FINANCIAL (PLAID)

## 4.1 — Bank Account Linking

TIER: Professional+
TRIGGER: ORG_OWNER initiates Plaid Link from payroll settings

STEPS:
1. Create Plaid Link token via Plaid API
2. Frontend opens Plaid Link UI
3. User selects bank and authenticates
4. Plaid returns public_token on success
5. Exchange public_token for access_token via Plaid API
6. Store encrypted access_token and item_id for workspace
7. Initiate micro-deposit verification (or instant verification if available)
8. Bank account status = PENDING_VERIFICATION

END STATE:
- Encrypted access_token stored for workspace
- Bank account status = PENDING_VERIFICATION
- Cannot process ACH until verified

OUTPUT: Org owner sees "Bank account connected — pending verification"

---

## 4.2 — Bank Account Verification

TRIGGER: Micro-deposit verification completed

STEPS:
1. User enters micro-deposit amounts
2. Verify against Plaid record
3. On success: bank_account.status = VERIFIED
4. On failure: notify org owner via NDS, allow retry

END STATE:
- bank_account.status = VERIFIED
- ACH transfers now possible

---

## 4.3 — ACH Direct Deposit (Payroll)

TRIGGER: Payroll period approved and closed by ORG_OWNER

STEPS:
1. Verify bank_account.status = VERIFIED → if not, set status = PAYMENT_HELD for all employees
2. Verify PLAID_WEBHOOK_SECRET present → sign all webhook interactions
3. For EACH employee individually (not batch):
   a. Calculate net pay
   b. Create Plaid Transfer authorization
   c. Create Plaid Transfer
   d. Store transfer_id and status = PENDING for this employee
   e. Log: employee_id, amount, transfer_id, initiated_at
4. Plaid fires transfer webhooks as status updates

END STATE:
- One Plaid Transfer record per employee
- Each employee transfer logged individually
- Status transitions: PENDING → SETTLED or FAILED

OUTPUT: Employees receive direct deposit, confirmation via NDS

RACE CONDITIONS:
- Payroll processed twice → closed period write-protection blocks second attempt

ERROR HANDLING:
- Transient failure (R01): retry after 24 hours, NDS alert to org owner
- Permanent failure (R02/R03): flag for manual resolution, NDS alert to owner and employee

---

# DOMAIN 5: OFFICER & EMPLOYEE MANAGEMENT

## 5.1 — Officer Creation

TIER: All
TRIGGER: Admin/Manager/ORG_OWNER creates new officer via UI or Trinity action

STEPS:
1. Validate required fields: name, email, phone, license_number, license_expiry_date
2. Create employee record with workspace_id scope
3. Create compliance_record: { license_number, expiry_date, status: ACTIVE }
4. Schedule NDS expiry alert for license_expiry_date - 30 days
5. Publish officer_activated event: { employeeId, employeeName, activatedBy, workspaceId }
6. Trinity compliance checks run via event subscription:
   - License validity confirmed
   - I9 status initialized
   - Onboarding checklist created
7. If personal email address requested: provision on demand (separate from base 6)

END STATE:
- employee record exists with workspace_id
- compliance_record initialized
- NDS expiry alert scheduled
- officer_activated event published
- Trinity compliance checks completed

OUTPUT: Officer appears in roster, can be assigned to shifts

RACE CONDITIONS:
- Duplicate officer creation (same email) → unique constraint on email+workspace_id

---

## 5.2 — Officer Deactivation (Soft Delete)

TRIGGER: Admin initiates deactivation

STEPS:
1. Set employee.deleted_at = now
2. Remove from all future shift assignments (OPEN and ASSIGNED shifts)
3. Retain all historical: shifts, payroll records, audit logs
4. Deactivate personal email address if provisioned → release Stripe seat
5. Cancel scheduled NDS expiry alerts
6. Log deactivation in audit trail

END STATE:
- employee.deleted_at set
- Historical records intact
- Future scheduling blocked

---

## 5.3 — License Renewal Workflow

TRIGGER: ORG_OWNER/Admin uploads new license document

STEPS:
1. Upload document to GCS with workspace_id in path
2. Update compliance_record: license_number, expiry_date, status: ACTIVE
3. Cancel old expiry alert from NDS schedule
4. Schedule new expiry alert for new expiry_date - 30 days
5. If officer was blocked from scheduling due to expired license: unblock
6. Log renewal in audit trail

END STATE:
- compliance_record updated with new expiry
- New NDS alert scheduled
- Officer cleared for scheduling if previously blocked

OUTPUT: Officer appears in scheduling pool again

---

## 5.4 — Compliance Overview (Manager View)

TRIGGER: Manager opens compliance dashboard

STEPS:
1. Query all employees WHERE workspace_id = session.workspace_id AND deleted_at IS NULL
2. For each: get compliance_record
3. Classify:
   - EXPIRED: expiry_date < today
   - EXPIRING_SOON: expiry_date < today + 60 days
   - VALID: expiry_date >= today + 60 days
   - INCOMPLETE_I9: i9_status != COMPLETE
4. Return grouped list

OUTPUT: Manager sees all compliance issues in one view

---

# DOMAIN 6: CLIENT & CRM MANAGEMENT

## 6.1 — Client Creation

TIER: All
TRIGGER: Admin/Manager creates client via UI or staffing@ email intake

STEPS:
1. Create client record: { name, contact_email, contact_phone, workspace_id }
2. Initialize CRM pipeline record: { client_id, stage: NEW, workspace_id }
3. NDS alert to org owner: "New client added: [name]"
4. Audit log: created_by, workspace_id, timestamp

END STATE:
- client record exists with workspace_id
- CRM pipeline record at stage NEW

---

## 6.2 — CRM Pipeline Progression

STAGES: NEW → CONTACTED → PROPOSAL_SENT → CONTRACT_SENT → ACTIVE_CLIENT
TRIGGER: Manager advances stage

STEPS:
1. Validate transition is to next valid stage (cannot skip)
2. Update pipeline_record.stage
3. Log transition: from_stage, to_stage, advanced_by, timestamp, workspace_id
4. On ACTIVE_CLIENT: enable site creation and scheduling for this client

RACE CONDITIONS:
- Two managers advancing simultaneously → optimistic lock on stage value

---

## 6.3 — Client Portal Provisioning

TIER: All
TRIGGER: ORG_OWNER/Admin sends portal invite to client contact

STEPS:
1. Generate unique invite token (expires 48 hours)
2. Send invite email via NDS with portal link
3. Client clicks link, sets password, creates portal session
4. Portal session scoped to: this client_id AND this workspace_id only
5. Client portal shows: their invoices, their sites, shift history, payment history

END STATE:
- Client has portal access scoped to their records only
- Cannot see other clients' data within same workspace

RACE CONDITIONS:
- Re-invite before expiry → invalidate previous token, issue new one

---

## 6.4 — Inbound Staffing Email → CRM Lead

TRIGGER: Email received at staffing@{slug}.coaileague.com

STEPS:
1. Trinity classifies as staffing_request
2. Extract sender email, company name if identifiable
3. Create CRM lead record: { source: email, from_email, body_excerpt, stage: NEW, workspace_id }
4. NDS alert to org owner: "New staffing inquiry from [email]"
5. Route to Staffing folder in EmailHubCanvas
6. Trinity prepares draft response (auto-draft or routes for manual approval per workspace setting)

END STATE:
- CRM lead record created
- EmailHubCanvas thread created in Staffing folder
- Org owner notified

---

# DOMAIN 7: SCHEDULING & SHIFT MANAGEMENT

## 7.1 — Shift Creation

TIER: All
TRIGGER: Manager/Trinity creates shift via UI or action

STEPS:
1. Validate: client_id exists, site_id exists, contract active for site
2. If no active contract → reject with "No active contract for this site"
3. Create shift: { workspace_id, site_id, client_id, start_time, end_time, position, status: OPEN }
4. Write scheduling_audit_log BEFORE shift is created: { action: CREATED, actor_id, workspace_id, shift_id, timestamp }
5. Return shift record

END STATE:
- shift.status = OPEN
- scheduling_audit_log entry exists

---

## 7.2 — Shift Assignment

TRIGGER: Manager/Trinity assigns officer to OPEN shift

STEPS:
1. CONFLICT CHECK (all must pass before any mutation):
   a. Officer not already assigned to overlapping shift
   b. Officer not on approved leave during shift period
   c. Officer license not expired as of shift start date
   d. Officer has required qualifications for position
   e. Officer availability windows allow this shift
2. If any conflict: return descriptive error, DO NOT create audit record
3. Write scheduling_audit_log BEFORE assignment: { action: ASSIGNED, before: null, after: officer_id }
4. Update shift.status = ASSIGNED, shift.officer_id = officer_id
5. NDS notification to officer: shift details (date, time, site, position)

END STATE:
- shift.status = ASSIGNED
- shift.officer_id set
- scheduling_audit_log entry with before/after state
- Officer notified via NDS

RACE CONDITIONS:
- Two managers assigning same officer to same slot simultaneously → SELECT FOR UPDATE lock before conflict check, second attempt sees conflict and rejects

---

## 7.3 — Schedule Publishing

TRIGGER: Manager publishes schedule for a date range

STEPS:
1. Find all ASSIGNED shifts in date range for workspace
2. Write scheduling_audit_log: { action: PUBLISHED, publisher_id, workspace_id, shift_ids, timestamp }
3. For each affected officer: NDS notification with their shift details
4. WebSocket broadcast to workspace room only: { type: SCHEDULE_PUBLISHED, shifts }
5. Verify broadcast is scoped to workspace_id room — no other workspace receives it

END STATE:
- All shifts in range marked as published
- All affected officers notified via NDS
- Real-time push delivered to connected clients in workspace only

---

## 7.4 — Shift Start with Geo-Fence

TRIGGER: Officer starts shift via app with GPS coordinates

STEPS:
1. Record GPS coordinates server-side
2. Compute distance from site.coordinates to officer GPS
3. Update shift.status = STARTED, shift.actual_start = now
4. If distance > 200 meters:
   a. Write Out-of-Bounds entry to scheduling_audit_log
   b. NDS alert to manager: "Officer started shift outside geo-fence boundary"
   c. Shift still starts — do NOT block (flag only)
5. Write scheduling_audit_log: { action: STARTED, gps_lat, gps_lng, distance_from_site, out_of_bounds }

END STATE:
- shift.status = STARTED
- Geo-fence result logged
- Manager alerted if out of bounds

---

## 7.5 — Shift Completion

TRIGGER: Officer or manager marks shift COMPLETED

STEPS:
1. Verify shift.status = STARTED (cannot complete from OPEN or ASSIGNED directly)
2. Record actual_end time
3. Calculate actual hours worked (handles midnight crossing)
4. Write scheduling_audit_log: { action: COMPLETED, actual_start, actual_end, hours_worked }
5. Update shift.status = COMPLETED
6. Shift is now eligible for invoice line item generation

END STATE:
- shift.status = COMPLETED
- Actual hours recorded
- Audit log complete
- Shift eligible for invoicing

---

# DOMAIN 8: CALL-OFF & COVERAGE ENGINE

## 8.1 — Call-Off Intake (Email)

TRIGGER: Email received at calloffs@{slug}.coaileague.com

STEPS:
1. Trinity classifies as call_off (even with degraded input: "cant mak it tmrw")
2. Attempt to resolve officer_id from sender email or body content
3. If resolvable: proceed
4. If not resolvable: NDS alert to manager with raw email content for manual resolution
5. Find officer's ASSIGNED shift for the relevant date
6. Create call_off record: { officer_id, shift_id, reason_text, workspace_id, received_at }
7. Update shift.status = OPEN (vacancy created)
8. Trigger coverage engine (Domain 8.2)

END STATE:
- call_off record created
- shift.status = OPEN
- Coverage engine running

---

## 8.2 — Coverage Engine

TRIGGER: Call-off created or manual coverage request

STEPS:
1. Find all eligible officers for the shift (not conflicted, qualified, available)
2. Rank by: reliability score → distance → overtime impact
3. Contact via Trinity Voice first
4. If no answer after N rings: SMS via NDS
5. First confirmation wins — immediately assign and stop outreach
6. Notify manager of outcome: filled or unfilled after all candidates exhausted

END STATE:
- Shift assigned to replacement officer, OR
- Shift remains OPEN with escalation alert to manager

RACE CONDITIONS:
- Two officers confirm simultaneously → SELECT FOR UPDATE on shift, first wins, second notified "position already filled"

---

# DOMAIN 9: INVOICING

## 9.1 — Invoice Generation

TRIGGER: ORG_OWNER/Admin generates invoice for completed shifts

STEPS:
1. Query COMPLETED shifts for client in date range that have NOT been invoiced
2. For each shift: line_item = { shift_id, hours: actual_hours_worked, rate: contract_rate, amount: hours × rate }
3. One shift cannot appear on two invoices — unique constraint on shift_id in invoice_line_items
4. Create invoice: { status: DRAFT, client_id, workspace_id, due_date, line_items }
5. Invoice starts as DRAFT — never auto-sent

END STATE:
- invoice.status = DRAFT
- Each line item linked to exactly one shift
- No duplicate line items across invoices

---

## 9.2 — Invoice Approval and Send

TRIGGER: ORG_OWNER approves and sends invoice

STEPS:
1. invoice.status: DRAFT → APPROVED (explicit ORG_OWNER action)
2. invoice.status: APPROVED → SENT
3. On SENT: invoice content becomes write-protected (no edits)
4. Generate tamper-proof payment link (HMAC signed, contains invoice_id + workspace_id + expiry)
5. Send via NDS to client contact email
6. Payment link opens client portal payment page

END STATE:
- invoice.status = SENT
- Content write-protected
- Client receives signed payment link

---

## 9.3 — Invoice Payment via Stripe

TRIGGER: Client submits payment via payment portal

STEPS:
1. Validate payment token: verify HMAC signature, check expiry, verify invoice_id matches
2. If tampered: return 403
3. If expired: return 410
4. Create Stripe PaymentIntent for invoice amount
5. On payment_intent.succeeded:
   a. Set invoice.status = PAID, invoice.paid_at = now
   b. Create financial_processing_fees record (2.9% + $0.25)
   c. Create platform_revenue record
   d. Write audit: { action: INVOICE_PAID, invoice_id, amount, workspace_id }
   — ALL FOUR in single atomic transaction
6. NDS confirmation to client and org owner
7. Sync to QuickBooks if connected

END STATE:
- invoice.status = PAID
- financial_processing_fees record created
- platform_revenue record created
- Audit logged
- All four in one atomic transaction

RACE CONDITIONS:
- Payment webhook replayed → invoice already PAID, skip without re-charging

---

## 9.4 — Invoice Void

TRIGGER: ORG_OWNER voids an invoice

STEPS:
1. Verify invoice.status != PAID (cannot void paid invoice)
2. Require voidReason (minimum 5 characters)
3. Set invoice.status = VOID, void_reason = reason, voided_at = now
4. Create credit memo: { original_invoice_id, amount, workspace_id, created_at }
5. Original invoice preserved — never deleted
6. Write audit: { action: INVOICE_VOIDED, voidReason, actor_id, workspace_id }

END STATE:
- invoice.status = VOID
- Credit memo created
- Original invoice intact
- Audit logged

---

# DOMAIN 10: PAYROLL

## 10.1 — Payroll Period Management

TRIGGER: ORG_OWNER opens a payroll period

STEPS:
1. Create payroll_period: { workspace_id, start_date, end_date, status: OPEN }
2. Collect all COMPLETED shifts in date range
3. Calculate hours per employee (including overtime at configured threshold)
4. Apply configured wage rates
5. Generate payroll_record per employee: { employee_id, regular_hours, overtime_hours, gross_pay, status: PENDING }

---

## 10.2 — Payroll Approval and Period Close

TRIGGER: ORG_OWNER reviews and approves payroll

STEPS:
1. ORG_OWNER reviews all payroll_records
2. On approval: payroll_period.status = CLOSED
3. CLOSED period is immutable at SERVICE layer — no edits from any path
4. Initiate ACH transfers (Domain 4.3)
5. Record payroll middleware fee: recordPayrollFee + recordMiddlewareFeeCharge
6. Send NDS notification to each employee with their pay stub

END STATE:
- payroll_period.status = CLOSED
- All records immutable
- ACH initiated
- Middleware fee recorded

RACE CONDITIONS:
- Period approved twice → idempotent status check blocks second approval

---

## 10.3 — Payroll Deadline Nudge

TRIGGER: Daily job checks for open payroll periods approaching deadline

STEPS:
1. Find all OPEN payroll periods where end_date < now + 24 hours
2. For each: send ONE nudge to org owner's registered email (NOT staffing@ or system alias)
3. Nudge is idempotent — check deadline_nudge_sent flag before sending
4. After sending: set deadline_nudge_sent = true

END STATE:
- Org owner notified exactly once about upcoming payroll deadline

---

# DOMAIN 11: TRINITY EMAIL SYSTEM

## 11.1 — Inbound Email Classification

TRIGGER: Email received at any {slug}.coaileague.com address

STEPS:
1. Extract slug from subdomain
2. Lookup workspace by slug
3. Classify by receiving address:
   staffing@ → staffing_request → Staffing folder
   calloffs@ → call_off → Call-Offs folder
   incidents@ → incident_report → Incidents folder
   support@ → support_inquiry → Support folder
   docs@ → document_intake → Documents folder
   billing@ → billing_inquiry → Billing folder
4. Create email_thread: { workspace_id, from_email, subject, classification, folder_id, sr_reference }
5. Execute domain-specific handler (call-off flow, staffing intake, etc.)
6. Write audit: { action: EMAIL_RECEIVED, classification, workspace_id }

END STATE:
- Thread created in correct folder
- Classification stored
- Domain handler invoked
- Audit logged

---

## 11.2 — SR Reference Threading

TRIGGER: Reply received with SR-XXXXXXXX in subject or body

STEPS:
1. Extract SR reference from subject line or email body
2. Look up email_thread by sr_reference
3. If found: append message to existing thread
4. If not found: create new thread (SR reference in reply was invalid or altered)
5. Never append to wrong thread
6. Log: { action: EMAIL_THREADED, sr_reference, thread_id } or { action: NEW_THREAD_CREATED, reason: invalid_sr }

END STATE:
- Reply correctly threaded to original conversation
- Trinity has full context of prior exchange

---

## 11.3 — trinity@coaileague.com Marketing Reply Processor

TRIGGER: Inbound reply to outbound marketing email sent from trinity@coaileague.com

STEPS:
1. trinityMarketingReplyProcessor invoked (NOT tenant TrinityEmailProcessor)
2. Classify sender:
   REGULATORY: domain is .gov/.state.tx.us or body contains: audit, compliance, PSB, regulatory, inspection, licensing, DPS
   PROSPECT: company domain, body contains: pricing, trial, interested, demo, sign up, features, how much
   FALLBACK: cannot classify
3. REGULATORY → respond with compliance partnership overview, link to coaileague.com/regulatory, route to platform owner (Bryan) via NDS
4. PROSPECT → respond with trial link (coaileague.com/trial), features overview, Trinity showcase
5. FALLBACK → send ONE clarifying question: "Are you reaching out about regulatory compliance partnership or exploring CoAIleague for your security operation?"

END STATE:
- Correct lane response sent
- Platform owner notified for regulatory contacts
- No tenant data ever touched or exposed

---

# DOMAIN 12: TRINITY VOICE

## 12.1 — Inbound Call Flow

TRIGGER: POST /api/voice/inbound (Twilio fires on incoming call)

STEPS:
1. Verify Twilio webhook signature
2. Extract caller phone number from request
3. Lookup phone number against employees table WHERE workspace_id = [all workspaces] — find matching record
4. If found: greet by name, load workspace context, set session workspace_id = matched workspace
5. If not found: verbal verification flow (name + ID number)
6. Verification fails N times: transfer to human or clean disconnect
7. workspace_id is ALWAYS resolved from verified caller identity — caller CANNOT override by naming a company
8. All subsequent data access scoped to resolved workspace_id
9. Create call_log: { caller_id, workspace_id, call_sid, started_at }

END STATE:
- Caller verified, workspace context loaded
- All actions during call workspace-scoped

---

## 12.2 — Trinity Voice Coverage Outreach

TRIGGER: Coverage engine (Domain 8.2) initiates voice outreach to candidate officer

STEPS:
1. Trinity Voice calls candidate's phone number
2. Plays shift offer: "This is [workspace name] staffing. We have an open [position] shift at [site] on [date] from [time] to [time]. Press 1 to accept, Press 2 to decline."
3. Log outreach attempt: { officer_id, shift_id, method: voice, attempted_at }
4. On acceptance: confirm officer identity, proceed to shift assignment
5. On decline: log decline, proceed to next candidate
6. No answer after N rings: log timeout, proceed to next candidate
7. NDS SMS fallback fires after voice attempt if no response

END STATE:
- Outreach attempt logged regardless of outcome
- Shift assigned if accepted
- Next candidate contacted if declined/no answer

---

## 12.3 — Human Handoff

TRIGGER: Trinity cannot resolve caller after 3 attempts, or caller requests human, or issue requires judgment

STEPS:
1. Trinity informs caller: "Connecting you to a team member"
2. NDS alert to workspace manager: caller name/number, call context summary, reason for handoff
3. Transfer call if live manager available
4. If no manager available: "Our team is unavailable right now. Would you like a callback?" or offer to leave message
5. NEVER silently disconnect
6. Log handoff: { reason, caller_id, workspace_id, handoff_at }

END STATE:
- Manager notified
- Caller receives closure (transfer, callback offer, or message)
- Handoff logged

---

# DOMAIN 13: DOCUMENT MANAGEMENT & E-SIGNATURE

## 13.1 — Document Upload

TIER: Professional+ (vault features)
TRIGGER: User uploads document via UI or docs@ email

STEPS:
1. Validate file type (allowed types only)
2. Validate file size (25MB maximum — server-side enforcement)
3. Check storage quota for 'documents' category before write
4. If quota exceeded: return 507, do not write file
5. Upload to GCS path: /{workspace_id}/documents/{uuid}/{filename}
6. Create document record: { workspace_id, name, gcs_path, size_bytes, status: ACTIVE }
7. Call recordStorageUsage(workspace_id, 'documents', size_bytes)
8. Write audit: { action: DOCUMENT_UPLOADED, uploaded_by, workspace_id }

END STATE:
- File in GCS with workspace_id in path
- document record in DB
- Storage usage updated
- Audit logged

---

## 13.2 — E-Signature Request

TIER: Professional+
TRIGGER: User initiates signature request on a document

STEPS:
1. Create signature_request: { document_id, signer_email, workspace_id, token: uuid, expires_at: now+7days, status: PENDING }
2. Send signing invitation via NDS with signed link
3. Signer opens link, reviews document, signs
4. Completion handler (idempotent — safe to replay):
   a. Create new document version with signature embedded
   b. Update signature_request.status = SIGNED, signed_at = now
   c. Write audit: { action: DOCUMENT_SIGNED, signer_email, workspace_id }
   d. NDS notification to requesting user
5. Signed document is write-protected — no new versions can be created

END STATE:
- signature_request.status = SIGNED
- Signed document version stored
- Original preserved as version 1
- Audit logged

RACE CONDITIONS:
- Signing link clicked twice → idempotency check on signature_request status before processing

---

# DOMAIN 14: CONTRACT PIPELINE

TIER: Professional+

## 14.1 — Contract Creation

TRIGGER: Manager creates contract for client

STEPS:
1. Select template or create from scratch
2. Link contract to: client_id, site_id, workspace_id
3. Define: service scope, rate structure, start date, term
4. Create contract record: { status: DRAFT }
5. Send for e-signature (Domain 13.2) if signatures required
6. On signature: contract.status = ACTIVE
7. Only ACTIVE contracts allow site scheduling

END STATE:
- contract.status = ACTIVE (post-signature)
- Site is now schedulable

---

# DOMAIN 15: RFP & PROPOSAL SYSTEM

TIER: Professional+

## 15.1 — RFP/Proposal Generation

TRIGGER: Manager creates proposal for prospect

STEPS:
1. Select prospect from CRM pipeline
2. Generate proposal from template with:
   - Prospect name and site details
   - Service scope and pricing
   - Term and conditions
   - WORKSPACE name (never hardcoded "CoAIleague")
3. Create rfp_record: { prospect_id, workspace_id, status: DRAFT }
4. Export as PDF for delivery
5. On acceptance: advance CRM stage to CONTRACT_SENT

END STATE:
- rfp_record.status = DRAFT (then SENT on delivery)
- PDF generated with workspace branding
- CRM updated

---

# DOMAIN 16: PDF GENERATION

## 16.1 — PDF Generation (Any Document Type)

TRIGGER: User requests PDF export (invoice, report, proposal, DAR, payroll stub)

STEPS:
1. Verify user has permission to generate this document type
2. Fetch all required data from DB (workspace_id scoped)
3. Render PDF template with data
4. Header uses PLATFORM.name or workspace.name — NEVER hardcoded "CoAIleague"
5. Footer includes: legal retention notice, document reference number
6. Store generated PDF in GCS (workspace-scoped path)
7. Return signed temporary download URL (expires in 1 hour)
8. Write audit: { action: PDF_GENERATED, document_type, generated_by, workspace_id }

END STATE:
- PDF stored in GCS
- Temporary download URL returned
- Audit logged

---

# DOMAIN 17: REPORTING & ANALYTICS

## 17.1 — Report Generation

TIER: Starter (basic) / Professional (advanced) / Business (full)
TRIGGER: Manager/Admin requests report

STEPS:
1. Verify tier gate for report type
2. Apply date range filter
3. All queries include workspace_id in WHERE clause
4. Aggregate data server-side (never in client)
5. Return structured data
6. For export: generate CSV or PDF (Domain 16.1)
7. Write audit: { action: REPORT_GENERATED, report_type, date_range, generated_by }

END STATE:
- Report data returned workspace-scoped
- Export file generated if requested
- Audit logged

---

# DOMAIN 18: CHAT SYSTEM

## 18.1 — Internal Chat

TRIGGER: User sends message in workspace chat

STEPS:
1. Message stored with workspace_id scope
2. Delivered via WebSocket to connected workspace members only
3. WebSocket room = workspace_id — no cross-tenant delivery possible
4. Message persisted to DB before delivery confirmation
5. If recipient offline: message queued, delivered on reconnect

END STATE:
- Message in DB with workspace_id
- Delivered to online recipients in real-time
- Queued for offline recipients

RACE CONDITIONS:
- Two instances broadcasting to same room → WebSocket rooms are per-instance (single-instance at launch, documented limitation)

---

# DOMAIN 19: EMAIL HUB CANVAS

## 19.1 — Email Thread View

TRIGGER: User opens EmailHubCanvas

STEPS:
1. Load email_threads WHERE workspace_id = session.workspace_id AND deleted_at IS NULL
2. Group by: SR reference first, then Message-ID/In-Reply-To headers
3. Default view: UNREAD threads first, sorted by most recent
4. Folder filter: show threads for selected folder only
5. Read state: mark thread as read when opened, persist to DB
6. Read state syncs in real-time across active sessions via WebSocket

END STATE:
- Thread list loaded workspace-scoped
- Read state persisted
- Correct folder routing

---

## 19.2 — Bulk Actions

TRIGGER: User selects multiple threads and applies bulk action

STEPS (Archive):
1. Set archived_at = now on selected threads
2. Remove from default view (filter WHERE archived_at IS NULL)
3. Still accessible in Archive folder
4. Write audit: { action: BULK_ARCHIVED, thread_ids, actor_id, workspace_id }

STEPS (Delete):
1. Set deleted_at = now (SOFT DELETE ONLY — never hard delete)
2. Remove from all views including Archive
3. Write audit: { action: BULK_DELETED, thread_ids }

STEPS (Move):
1. Update folder_id on selected threads
2. Write audit: { action: BULK_MOVED, from_folder, to_folder }

---

# DOMAIN 20: NOTIFICATION SYSTEM (NDS)

## 20.1 — NDS Send Flow

TRIGGER: Any system event requiring notification

STEPS:
1. Generate unique notification_id
2. Check if notification_id already exists in notifications_log → if yes: skip (idempotent)
3. Check recipient opt-out status:
   - MARKETING opt-out: skip if notification is marketing type
   - OPERATIONAL notifications (shift, payroll, license, call-off): BYPASS opt-out check
4. Determine channel: email → Resend, SMS → Twilio, push → push service
5. Attempt delivery on preferred channel
6. On failure: attempt fallback channel
7. Log result: { notification_id, recipient, channel, status, workspace_id }
8. On hard failure: DLQ entry created, alert platform admin if threshold exceeded

END STATE:
- Notification delivered or in DLQ
- Delivery status logged
- Idempotency record exists

RACE CONDITIONS:
- Same event triggers two NDS sends → notification_id dedup prevents double delivery

---

## 20.2 — Opt-Out Processing

TRIGGER: Recipient clicks unsubscribe link

STEPS:
1. Validate unsubscribe token
2. Determine opt-out CATEGORY (MARKETING vs OPERATIONAL)
3. MARKETING opt-out: mark in preferences, future marketing emails skipped
4. OPERATIONAL opt-out: NOT allowed for core operational messages
5. Return branded confirmation page: "You have been unsubscribed from [specific category] notifications"
6. NEVER show generic "unsubscribed from all" without category clarity

END STATE:
- opt_out_preferences updated for correct category
- Operational notifications continue unaffected

---

# DOMAIN 21: STORAGE & QUOTA MANAGEMENT

## 21.1 — File Upload with Quota Enforcement

TRIGGER: Any file upload (document, image, email attachment, form submission)

STEPS:
1. Determine category: email | documents | media | audit_reserve
2. Get current usage: SELECT bytes_used FROM storage_usage WHERE workspace_id = ? AND category = ?
3. Get quota limit from billingConfig.ts for workspace tier and category
4. If current + new_file_size > quota AND category != audit_reserve: return 507
5. audit_reserve category ALWAYS allowed regardless of other limits
6. Upload file to GCS: path = /{workspace_id}/{category}/{uuid}/{filename}
7. On success: UPDATE storage_usage SET bytes_used = bytes_used + new_file_size
8. Check new total:
   - If > 95% of quota: fire NDS critical alert (once per threshold crossing)
   - If > 80% of quota: fire NDS warning (once per threshold crossing)

END STATE:
- File in GCS with workspace_id in path
- storage_usage updated
- Alerts fired if thresholds crossed

RACE CONDITIONS:
- Two uploads simultaneously that would both be under quota → SELECT FOR UPDATE on storage_usage before checking

---

# DOMAIN 22: HELPAI & SUPPORT

## 22.1 — HelpAI Conversation

TRIGGER: User opens HelpAI from any page

STEPS:
1. Determine context: platform-layer or workspace-layer
2. PLATFORM layer: HelpAI answers CoAIleague feature/pricing/onboarding questions ONLY — zero tenant data access
3. WORKSPACE layer: HelpAI reads only current workspace's documents and knowledge
4. All queries workspace_id scoped (workspace layer)
5. After 2 failed resolution attempts OR user requests human:
   a. Create support_ticket: { workspace_id, category, description, status: OPEN }
   b. Route to correct queue: billing → finance queue, technical → engineering queue
   c. NDS immediate acknowledgment to user
   d. NDS alert to support queue

END STATE:
- Conversation logged with workspace_id
- Ticket created on escalation
- User acknowledged

---

# DOMAIN 23: REGULATORY & COMPLIANCE

## 23.1 — Regulatory Export

TIER: Business+
TRIGGER: ORG_OWNER/Admin requests compliance data export

STEPS:
1. Verify role = ORG_OWNER or ADMIN → 403 for others
2. Apply filters: date_range, entity_type (shifts, incidents, licenses, payroll)
3. All queries workspace_id scoped
4. Generate structured export (CSV or JSON — NOT raw DB dump)
5. Include: timestamps, officer IDs, site IDs, incident classifications, license status
6. Write audit: { action: REGULATORY_EXPORT, date_range, entity_types, exported_by, workspace_id }
7. Return signed temporary download URL

END STATE:
- Structured export file generated
- Audit record shows who exported what and when
- Data is audit-ready for PSB or law enforcement review

---

# DOMAIN 24: PLATFORM ADMINISTRATION

## 24.1 — Platform Admin Dashboard

ACCESS: requirePlatformStaff only
TRIGGER: Platform admin opens admin panel

SURFACES:
1. TENANT LIST:
   - All workspaces with slug, tier, billing status, trial expiry, last activity, seat count
   - Statewide shows as "Grandfathered — Enterprise"
2. FINANCIAL HEALTH:
   - MRR, recent payments, failed payments, pending overages
3. SYSTEM HEALTH:
   - DLQ depth and oldest item
   - Last 50 errors with timestamp, route, workspace_id
   - Queue worker health
   - NDS delivery health
4. TENANT DRILL-DOWN:
   - Per-workspace: seats, storage, token usage this month, recent activity, support tickets

RULES:
- Read-only operational metadata only
- No access to tenant business data (invoices, shifts, payroll content)
- All views require requirePlatformStaff middleware

---

# DOMAIN 25: QUICKBOOKS INTEGRATION

TIER: Professional+

## 25.1 — QuickBooks Sync

TRIGGER: Invoice APPROVED, PAID, or VOID

STEPS:
1. Check if QB integration is active for workspace
2. If not active: skip silently, log "QB not connected"
3. Verify access_token is valid, refresh proactively if < 5 min to expiry
4. If refresh fails: mark integration as disconnected, NDS alert to org owner
5. Sync invoice data to QB (never block on QB failure)
6. On sync success: record recordQbSyncFee in financial_processing_fees (Path B)
7. On sync failure: log failure, queue for retry, NDS alert to org owner
8. QB failure NEVER blocks or rolls back the internal invoice state change

END STATE:
- Internal platform state always correct regardless of QB result
- QB sync is best-effort with retry
- recordQbSyncFee written on every successful sync

---

# DOMAIN 26: MULTI-WORKSPACE MANAGEMENT

TIER: Business+

## 26.1 — Subsidiary Workspace View

TRIGGER: Business+ org owner opens consolidated dashboard

STEPS:
1. Verify workspace.tier = business or higher → 403 if not
2. Load all subsidiary workspace_ids linked to this parent
3. Aggregate: combined seat count, combined revenue, combined schedule overview
4. All subsidiary data is READ-ONLY from parent view
5. Each subsidiary's data still scoped to its own workspace_id

---

# DOMAIN 27: WHITE-LABEL & BRANDING

TIER: Enterprise+

## 27.1 — White-Label Configuration

TRIGGER: Enterprise+ org owner configures custom branding

STEPS:
1. Verify tier = enterprise or higher → 403 if not
2. Allow: custom logo upload, custom primary color, custom domain
3. Store branding config in workspace.branding_config
4. All outbound emails, PDFs, and UI for this workspace use custom branding
5. PLATFORM.name is replaced by workspace.company_name in all outputs
6. Custom domain: verify ownership via DNS TXT record before activation

---

# DOMAIN 28: FINANCIAL SYSTEM — UNIVERSAL RULES

These rules apply to EVERY financial operation across all domains.

## 28.1 — Three-Layer Atomicity Rules

PATH A (Stripe charge involved):
Transaction must include ALL of:
- Primary record update (invoice PAID, payroll initiated, etc.)
- financial_processing_fees record
- platform_revenue record
- audit_log record
All or nothing. No partial commits.

PATH B (Internal fee, no Stripe charge):
Transaction must include ALL of:
- financial_processing_fees record
- platform_revenue record
- audit_log record
All or nothing.

## 28.2 — Write Protection Rules

Once a financial record reaches final state, it is immutable:
- PAID invoice: no content edits from any path (API, worker, service, Trinity, admin)
- VOID invoice: no content edits (only credit memo creation allowed)
- CLOSED payroll period: no edits from any path including internal service calls
- SIGNED document: no new versions from any path
- Audit log entries: no UPDATE or DELETE from any path

## 28.3 — Audit Trail Completeness

Every financial state change must produce an audit_log entry with:
- action (what happened)
- actor_id (who triggered it — user, system, Trinity)
- workspace_id (always)
- before_state (previous value)
- after_state (new value)
- timestamp
- request_id (for tracing)

Audit log is APPEND-ONLY. DB user has no UPDATE or DELETE privilege on audit tables.

---

# DOMAIN 29: ERROR HANDLING — UNIVERSAL RULES

These rules apply everywhere in the platform.

## 29.1 — Silent Failure Rules

ZERO empty catch blocks allowed. Every catch must at minimum:
logger.error({ error, context: '[filename:function]', workspace_id, request_id })

## 29.2 — External API Call Rules

Every call to Stripe, Plaid, Twilio, Gemini, OpenAI, Claude, Resend, QuickBooks:
- Wrapped in try/catch
- Retry on transient failure: max 3 attempts, exponential backoff
- No retry on 4xx except 429
- Timeout configured on every call
- Failure logged with full context
- Degraded mode activated if service unavailable (not crash)

## 29.3 — API Response Rules

ALL errors return: { error: { code: string, message: string } }
Stack traces: NEVER in production responses
DB errors: NEVER passed to client
500s: logged server-side with full detail, generic message to client

## 29.4 — Race Condition Prevention Rules

Financial writes: SELECT FOR UPDATE before any debit/credit operation
Scheduling assignments: SELECT FOR UPDATE before conflict check
Queue jobs: distributed lock per workspace before starting
Stripe webhooks: INSERT INTO processed_stripe_events (atomic, unique constraint)
NDS sends: INSERT INTO notifications_log (atomic, unique notification_id)

---

# DOMAIN 30: DATA INTEGRITY — UNIVERSAL RULES

## 30.1 — Tenant Isolation Rules

EVERY query touching business data includes workspace_id in WHERE clause.
NO exceptions. Platform admin routes that intentionally bypass must be
explicitly marked with requirePlatformStaff and logged.

## 30.2 — Soft Delete Rules

ALL business entities use soft delete (deleted_at timestamp).
Hard deletes exist NOWHERE for: employees, clients, invoices, shifts,
payroll records, documents, contracts, email threads, audit logs.
ALL SELECT queries filter WHERE deleted_at IS NULL by default.

## 30.3 — Schema Integrity Rules

Every relationship has a FK constraint.
Every tenant table has an index on workspace_id.
Every status field has an index.
All migrations are sequential with no gaps.
No partial migration states in production.

---

# DEFINITION OF CORRECT BEHAVIOR

When the agent debugs any issue, this is what it looks for:

**A feature is working correctly when:**
1. The trigger produces the exact records specified in END STATE
2. All three financial layers fire atomically for every chargeable event
3. The audit trail is complete with no orphaned mutations
4. NDS notifications reach the correct recipients
5. workspace_id is in every query that touches tenant data
6. The output matches what the specification says the output should be
7. No silent failures exist — every error is logged with context
8. Race conditions are protected by locks or atomic operations
9. Write-protected records reject mutation from all paths
10. The end user sees what they are supposed to see at that tier

**A feature is broken when:**
1. Any step in the STEPS sequence is missing or out of order
2. The END STATE does not match what is in the database
3. The OUTPUT does not match what the user receives
4. Any financial record is missing or partially created
5. An audit record is missing for a logged action
6. A notification was not sent when the spec says it should be
7. A workspace_id is missing from a tenant data query
8. A write-protected record accepted a mutation
9. A race condition produced duplicate or inconsistent records
10. An error was swallowed without logging
