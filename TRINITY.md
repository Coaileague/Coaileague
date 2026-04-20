# CoAIleague — Trinity Engineering Laws

This file is the persistent record of architectural laws governing the
CoAIleague platform. Laws are enforced by Trinity and the engineering team.
The full canonical briefing (vision, Trinity biological architecture,
governance systems, etc.) is held externally — this file is the **enforced
subset** with code-level cross-references so future sessions can verify each
law without re-discovering it.

> **The TypeScript Law:** A change that introduces TypeScript errors is not a
> fix — it is a new 🔴 Critical issue. Run `tsc --noEmit` before declaring any
> task complete.

> **Build Integrity Law:** A fix that breaks the build is a 🔴 Critical issue.
> Nothing is fixed if the app cannot deploy. Run `npm run build` before commit.

> **Migration Law:** Drizzle's `db:push` does not run files in `migrations/`.
> Drizzle's TypeScript DSL cannot express exclusion constraints. Raw-SQL
> invariants live in `server/services/criticalConstraintsBootstrap.ts` and
> `server/services/workspaceIndexBootstrap.ts` — both run idempotently at boot
> after `ensureRequiredTables()`.

---

## Section A — Production Environment Detection (Phase H)

**The bug:** Many files used `process.env.REPLIT_DEPLOYMENT === '1'` as the
sole production check. On Railway that env var is undefined, so dev seeds
(Acme, Anvil, Marcus) wrote into the Railway production database every boot
and `productionSeed.ts` never ran.

**The law:**

1. **Never** check `process.env.REPLIT_DEPLOYMENT` directly. Always import
   from `server/lib/isProduction.ts`:
   ```ts
   import { isProduction } from '../lib/isProduction';
   if (isProduction()) { /* prod-only */ }
   ```
2. The helper returns true for **any** of: `NODE_ENV=production`,
   `REPLIT_DEPLOYMENT=1`, `RAILWAY_ENVIRONMENT=production`, `K_SERVICE`/`K_REVISION`.
3. New hosting environments are added **only** to `server/lib/isProduction.ts`.
   Never inline new detection logic anywhere else.

**Files governed:** every dev seed under `server/services/development*.ts`,
every entry in `server/services/productionSeed.ts`, `server/index.ts`,
`server/utils/configValidator.ts`, `server/seed-acme-full.ts`.

---

## Section B — NotificationDeliveryService Sole Sender (Phase F)

**The law (TRINITY.md §9):** Zero fire-and-forget calls. Every notification
logged. Direct Twilio/Resend/Push calls outside NDS are critical bugs.

**Verified-clean primitives** (these are the canonical wrappers — call them,
do not bypass them with raw SDK access):
- `server/services/smsService.ts → sendSMS()` — persists every attempt to
  `sms_attempt_log`, awaits cost ledger writes (no fire-and-forget)
- `server/services/emailCore.ts → sendCanSpamCompliantEmail()` and friends
- `server/services/pushNotificationService.ts → sendPushToUser()`
- `server/services/notificationDeliveryService.ts → NotificationDeliveryService.send()`
  (the canonical orchestration entry point — preferred for typed notifications
  with a `recipientUserId`)

**Forbidden patterns:**
```ts
// 🔴 forbidden — fire and forget
somePromise().catch(err => log.warn('failed', err));

// 🔴 forbidden — setImmediate / setTimeout fire and forget
setImmediate(async () => { await sendSomething(); });

// ✅ required — awaited with non-fatal try/catch
try {
  await somePromise();
} catch (err) {
  log.warn('Operation failed (non-fatal):', err);
}
```

**Phase F enforcement:** verified `server/services/smsService.ts:329`,
`server/services/interviewChatOrchestrator.ts:165`,
`server/services/autonomousScheduler.ts:3418`,
`server/services/infrastructure/apiKeyRotationService.ts:339,421`,
`server/routes/voiceRoutes.ts:979`. All converted from fire-and-forget to
awaited.

---

## Section C — Race Condition Protection (Phase G)

**The law (TRINITY.md §9):** Shift-overlap prevention is enforced atomically
by the PostgreSQL exclusion constraint `no_overlapping_employee_shifts`. The
application-level SELECT overlap check was deliberately removed in favor of
this constraint (RC5 Phase 2). The constraint **must exist** in production.

**The verification:** `server/services/criticalConstraintsBootstrap.ts` runs
at every boot, after `ensureRequiredTables()`, and idempotently installs:
1. `CREATE EXTENSION IF NOT EXISTS btree_gist`
2. The `no_overlapping_employee_shifts` exclusion constraint, scoped by
   `(workspace_id, employee_id)` over `tstzrange(start_time, end_time, '[)')`,
   excluding `cancelled` and `denied` shifts so reschedules can occupy the
   same window as the cancelled original

**The migration file:** `migrations/0003_shift_overlap_exclusion_constraint.sql`
documents the constraint canonically. Drizzle-kit push does NOT run this file —
the bootstrap service is the actual enforcement path.

**Adding new race-condition guards:** add a new entry to the `constraints`
array in `criticalConstraintsBootstrap.ts`. Each entry has `name`, `rationale`,
`isPresent` (predicate), and `apply` (idempotent SQL).

---

## Section D — Schema Completeness: workspace_id Indexing (Phase I)

**The law (TRINITY.md §9):** All `workspace_id` columns indexed.

**The mechanism:** `server/services/workspaceIndexBootstrap.ts` holds the
canonical list of 507 multi-tenant tables that lacked a leading workspaceId
index in their Drizzle schema declaration. It runs at boot, after
`ensureCriticalConstraints()`, and idempotently:
1. Verifies the table exists in the live DB
2. Verifies the `workspace_id` column exists
3. Checks `pg_indexes` for `<table>_workspace_idx`
4. If missing, runs `CREATE INDEX IF NOT EXISTS`

**Maintenance:** when you add a new per-tenant table, prefer adding the index
directly in the Drizzle schema definition:
```ts
}, (table) => [
  index("my_table_workspace_idx").on(table.workspaceId),
])
```
Only add to `workspaceIndexBootstrap.ts` if the index cannot live in the
schema for some reason.

---

## Section E — RBAC Single Source of Truth (Phase J)

**The law (TRINITY.md §8):** roleDefinitions.ts is the only place roles are
defined. Duplicate role arrays anywhere else are tech debt.

**The canonical file:** `shared/lib/rbac/roleDefinitions.ts`

It exports:
- `WorkspaceRole` (11 values: org_owner, co_owner, org_admin, org_manager,
  manager, department_manager, supervisor, staff, employee, auditor, contractor)
- `PlatformRole` (8 values)
- `WORKSPACE_ROLE_HIERARCHY` (numeric ladder)
- `PLATFORM_ROLE_HIERARCHY` (numeric ladder)
- `OWNER_ROLES`, `ADMIN_ROLES`, `MANAGER_ROLES`, `SUPERVISOR_ROLES`,
  `LEADER_ROLES`, `EMPLOYEE_ROLES`, `AUDITOR_ROLES`, `CONTRACTOR_ROLES`
- `PLATFORM_WIDE_ROLES`
- `ORG_ACTION_MIN_LEVELS`

**Re-export shims** (do not duplicate, re-export):
- `server/lib/rbac/roleDefinitions.ts` — re-exports for server backward compat
- `shared/types.ts` — re-exports `WorkspaceRole` and `PlatformRole`

**Adding a new role:** add it ONLY in `shared/lib/rbac/roleDefinitions.ts`.
Update `WORKSPACE_ROLE_HIERARCHY` and the relevant guard arrays. Never declare
a role string literal anywhere else.

---

## Section F — Module-Load Crash Hardening (Phase A)

**The law:** No SDK client may be instantiated at module load with a non-null
assertion on an env var. Use a lazy factory.

**The pattern:**
```ts
// 🔴 forbidden — crashes boot if env var is missing
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '...' });

// ✅ required — lazy factory + Proxy preserves call sites
import { getStripe } from './services/billing/stripeClient';
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) { return (getStripe() as any)[prop]; }
});
```

**The canonical Stripe factory:** `server/services/billing/stripeClient.ts`
exports `getStripe()` (singleton) and `isStripeConfigured()`.

**Files governed:** every billing service, `server/billing-api.ts`,
`server/routes/billing-api.ts`, `server/routes/sra/sraTrinityRoutes.ts`
(OpenAI variant). When you add a new SDK that requires a secret, add a
similar lazy factory beside the existing ones.

---

## Section G — Tenant Isolation in Raw SQL (Phase P)

**The law (TRINITY.md §1):** Every query is scoped by `workspace_id`. No
exceptions. Fetch-then-check is not enough — the WHERE clause must include
`workspace_id` so the query is atomically tenant-safe.

**Forbidden:**
```ts
// 🔴 leaks if attacker knows another tenant's ID
const row = await pool.query(`SELECT * FROM employees WHERE id = $1`, [empId]);
if (row.workspace_id !== ctx.workspaceId) return 403;
```

**Required:**
```ts
// ✅ atomically tenant-scoped
const row = await pool.query(
  `SELECT * FROM employees WHERE id = $1 AND workspace_id = $2`,
  [empId, ctx.workspaceId]
);
if (!row) return 404;
```

**UPDATE statements** must include `AND workspace_id = $N` in the WHERE clause
even if the row was already verified — atomically prevents race-window
cross-tenant writes.

**Exception:** Privacy / DSR routes (`server/routes/privacyRoutes.ts`) are
intentionally cross-workspace because they're platform-staff-level GDPR
endpoints. They enforce the workspace match at the application layer for the
non-staff path.

**Phase P enforcement:** fixed in `rmsRoutes.ts:175`,
`incidentPipelineRoutes.ts:251,310,331`, `shiftTradingRoutes.ts:176,225,279,366`,
`clientSatisfactionRoutes.ts:117`, `onboardingTaskRoutes.ts:267`.

---

## Section H — Mobile Universal Rendering (Phase Q)

**The law (TRINITY.md §10 expansion):** Every section/category of code must
render perfectly on both desktop and mobile — size, text, images, containment.
Touch scrolling must work everywhere. Footer must be visible against the
platform's dark navy aesthetic by default.

**The mobile-scroll guarantee:** `client/src/index.css` contains a hard
last-line guarantee block that re-asserts on `.public-page-scroll-root` and
`main#main-content`:
- `transform: translate3d(0,0,0)` — GPU compositing defeats iOS touch bugs
- `-webkit-overflow-scrolling: touch !important`
- `touch-action: pan-y !important`
- `pointer-events: auto !important`
- `overscroll-behavior-y: contain`

On `≤768px` the rule additionally forces `touch-action: pan-y !important` on
`html, body, #root, [data-slot="sidebar-wrapper"]` so no ancestor can deny
vertical scroll. Empty/aria-hidden `.fixed` overlays on public routes are
hidden so they cannot intercept touch.

**The footer law:** `client/src/components/footer.tsx` defaults to
`variant="dark"`. Pages on a light background must opt in with
`<Footer variant="light" />`. Never default to light.

**The splash law:** `client/src/components/SplashScreen.tsx` enforces a
minimum display time of 1800ms by default (`minDisplayTime` prop, was 800ms).
The minimum is so the brand moment is always perceived as deliberate.

---

## Section I — Multi-Tenant Universalization (Phase S, in progress)

**The law:** No hardcoded workspace IDs, user IDs, employee IDs, or other
universal IDs in production code. Every flow that generates data, documents,
notifications, or invoices must accept any (workspace_id, user_id, ...) tuple
and resolve correctly. Per TRINITY.md §9 White-Label Rule: zero hardcoded
company names; tenant identity always resolves from workspace context.

**The pattern:**
```ts
// 🔴 forbidden — hardcoded workspace
const wsId = '37a04d24-51bd-4856-9faa-d26a2fe82094';

// 🔴 forbidden — hardcoded company name
const company = 'Statewide Protective Services';

// ✅ required — resolved from request context
const wsId = req.workspaceId;
const wsName = (await getWorkspace(wsId))?.name ?? 'Your Security Company';
```

**Exception:** `GRANDFATHERED_TENANT_ID` (env var) is the sole legitimate
hardcoded reference and only inside `server/tierGuards.ts` (tier exemption)
and `server/lib/isProduction.ts` (env validator). Any other reference is a bug.

**Dev sandbox tenants** (Acme Security Services, Anvil Security Group) may
appear ONLY in files under `server/services/development*.ts` and similar dev
seeds, all of which are gated by `isProduction()` per Section A.

---

## Section I-B — Protected Status Is Billing-Only (Phase T)

**The law:** "Protected status" on the statewide org (GRANDFATHERED_TENANT_ID) and support org
means **billing-exempt + permanent enterprise tier access only**. It must NEVER block any
feature, workflow, automation, pipeline, or Trinity orchestration.

**The bug it prevents:** `server/middleware/statewideGuard.ts` previously contained a
`statewideWriteGuard` that returned `403 TENANT_PROTECTED` on ALL POST/PUT/PATCH/DELETE
mutations for the grandfathered tenant. This blocked the org from creating automations,
running pipelines, letting Trinity write tasks/schedules, and using any write-capable feature.

**The fix:** `statewideWriteGuard` was converted to a no-op pass-through. The import in
`server/index.ts` was left as a comment to record history.

**What protected status DOES enforce (these are correct and must stay):**
- `server/services/billing/founderExemption.ts` — `billingExempt=true`, `founderExemption=true`
- `server/tierGuards.ts` — GRANDFATHERED_TENANT_ID bypasses ALL tier gates (treated as enterprise)
- `server/middleware/subscriptionGuard.ts` — exempt from suspension/cancellation guards
- `server/services/billing/billingConstants.ts` — `NON_BILLING_WORKSPACE_IDS` covers support org

**Forbidden pattern (do not re-introduce):**
```ts
// 🔴 forbidden — blocks protected org from using the platform
if (workspaceId === GRANDFATHERED_TENANT_ID && isMutation) {
  return res.status(403).json({ code: 'TENANT_PROTECTED' });
}
```

**Files governed:**
- `server/middleware/statewideGuard.ts` (now a no-op)
- `server/index.ts` (write guard registration removed)

---

## Section K — Trinity Service Registry & Integration Map (Phase 16)

> **Terminology note (see Section S):** "Trinity service" here means a
> **domain module of the one Trinity brain**, registered for governance
> and inventory. It does NOT mean a separate agent. Trinity is one
> personality triad; the registry catalogues its specialized modules, not
> a population of independent actors. Never reword these entries in a way
> that pluralizes Trinity-the-entity.

**The law:** Every Trinity service must be registered in
`server/services/trinity/trinityServiceRegistry.ts` with its domain category,
authority level, platform phase integrations, and integration status. No new
Trinity service is considered production-ready until it appears in the registry.

**The bug it prevents:** 160+ Trinity services existed with no canonical
inventory. Platform phases had no documented Trinity integration points, making
it impossible to audit coverage, authority, or duplication without reading all
157 service files individually. This created silent regression risk — a new
service could duplicate an existing one, use the wrong authority level, or
bypass governance entirely.

**The canonical files:**
- `server/services/trinity/trinityServiceRegistry.ts` — The single source of
  truth for all Trinity services. Exports `TRINITY_SERVICE_REGISTRY`,
  `getServicesForPhase()`, `getServicesByDomain()`, and
  `getPlatformIntegrationSummary()`.
- `server/routes/trinityTransparencyRoutes.ts` — Tenant-owner dashboard API:
  `/api/trinity/transparency/overview|actions|decisions|cost-breakdown|audit-trail|service-registry`
- `server/routes/trinityAgentDashboardRoutes.ts` — Support-agent command API:
  `/api/trinity/agent-dashboard/queue|reasoning/:id|approve|override|escalations|activity-feed`

**Client surfaces:**
- `client/src/pages/trinity-transparency-dashboard.tsx` — Org owner view of
  all autonomous actions, costs, decision reasoning, and platform integration
  status. Route: `/trinity/transparency`.
- `client/src/pages/trinity-agent-dashboard.tsx` — Support agent command
  center: approval queue, override gateway, escalation triage, reasoning
  viewer. Route: `/trinity/agent-dashboard`.

**Authority matrix (Phase 16 enforcement):**
```
support_agent      → can approve/deny CLASS 1 & 2 (confidence >= 0.41)
support_manager    → can approve/deny CLASS 1, 2, 3 (confidence >= 0.00)
sysop/deputy/root  → full override authority (all classes)
```

**Required pattern for new Trinity services:**
```ts
// ✅ required — register in trinityServiceRegistry.ts
{
  id: 'myNewService',
  name: 'My New Service',
  path: 'server/services/ai-brain/myNewService.ts',
  domain: 'support_escalation',        // pick from TrinityServiceDomain
  description: 'One sentence describing what this does.',
  authorityLevel: 'write_monitored',   // read_only | write_monitored | write_auto | platform_admin
  platformPhases: ['phase_9_support'], // which platform phases use this
  integrationStatus: 'partial',        // verified | partial | unmapped
  exports: ['myNewService'],
}
```

**Forbidden pattern:**
```ts
// 🔴 forbidden — shipping a Trinity service not in the registry
// (Cannot be audited, authority level unknown, coverage unknown)
export const myNewService = { ... }; // no registry entry
```

---

## Section L — Trinity Action Audit Trail (Phase 17A/B)

> **Terminology note (see Section S):** "Trinity actions" are the units of
> work performed by the **one Trinity brain**, not evidence that multiple
> Trinities exist. Audit rows read "Trinity did X"; they never claim
> "Trinity-A and Trinity-B coordinated." Internal module handoffs are
> implementation details and MUST NOT be surfaced to users as multi-agent
> activity.

**The law:** Every mutating handler registered in
`server/services/ai-brain/actionRegistry.ts` must write an audit-log row
(success **and** failure paths) via the shared helper
`server/services/ai-brain/actionAuditLogger.ts → logActionAudit(...)`.
Direct `db.insert(auditLogs)` from a handler is allowed only if the helper
cannot express the required metadata.

**The bug it prevents:** The Phase 17A audit found **zero**
`db.insert(auditLogs)` / `systemAuditLogs` writes across 88 registered
actions. Autonomous Trinity actions (shift creation, invoice creation,
invoice send, employee create/update) persisted mutations with no audit
trail — "who did what when" was unreplayable. Phase 17B extended this to
find 144 total actions (not the claimed 403 or 190) with the same gap.

**The canonical files:**
- `server/services/ai-brain/actionAuditLogger.ts` — shared
  `logActionAudit({ actionId, workspaceId, userId, userRole, platformRole,
  entityType, entityId, success, message, payload?, changesBefore?,
  changesAfter?, errorMessage?, durationMs? })`. Sanitizes sensitive keys
  (password/token/secret/key/auth/credit_card/ssn) before insert. Non-fatal
  on failure — audit-log errors are warned, not thrown.
- `shared/schema/domains/audit/index.ts:69` — `audit_logs` table is the
  canonical sink. `systemAuditLogs` in `shared/schema.ts:1664` is an alias.

**Required pattern for every mutating action handler:**
```ts
handler: async (request: ActionRequest): Promise<ActionResult> => {
  const start = Date.now();
  try {
    const [row] = await db.insert(things).values({ ... }).returning();
    await logActionAudit({
      actionId: request.actionId,
      workspaceId: request.workspaceId,
      userId: request.userId,
      userRole: request.userRole,
      platformRole: request.platformRole,
      entityType: 'thing',
      entityId: row?.id ?? null,
      success: true,
      changesAfter: row as any,
      durationMs: Date.now() - start,
    });
    return createResult(request.actionId, true, 'ok', row, start);
  } catch (err: any) {
    await logActionAudit({
      actionId: request.actionId,
      workspaceId: request.workspaceId,
      userId: request.userId,
      entityType: 'thing',
      success: false,
      errorMessage: err?.message,
      payload: request.payload,
      durationMs: Date.now() - start,
    });
    throw err;
  }
},
```

**Forbidden patterns:**
```ts
// 🔴 forbidden — mutation without audit log
const [row] = await db.insert(things).values({ ... }).returning();
return createResult(request.actionId, true, 'ok', row, start);

// 🔴 forbidden — fire-and-forget event publish treated as audit log
await platformEventBus.publish({ ... }).catch(() => null);
// (event-bus publish is not persistent audit; use logActionAudit instead)
```

**Wired in Phase 17 (verified):**
- `scheduling.create_shift` — `actionRegistry.ts:224-267`
- `billing.invoice_create` — `actionRegistry.ts:~1232-1275`
- `billing.invoice_send` — `actionRegistry.ts:~1283-1310`
- `employees.create` — `actionRegistry.ts:~584-660`
- `employees.update` — `actionRegistry.ts:~558-605`

Remaining handlers in `actionRegistry.ts` (≈83) are Phase 18 scope — migrate
using the same helper.

---

## Section M — Agent Dashboard Platform-Role Enforcement (Phase 17A)

> **Terminology note (see Section S):** The word "agent" in
> "agent dashboard" refers to the **human support agent** (platform staff)
> who uses the dashboard to review Trinity's work. It does NOT refer to
> Trinity. Trinity is one brain; "agent" here is the role of the human
> reviewer, not a label for an AI module. Copy in this surface MUST
> address Trinity as singular.

**The law:** `server/routes/trinityAgentDashboardRoutes.ts` is a
**platform-staff-only** surface. `getActorRole(req)` must read
`req.platformRole` exclusively. Falling back to `req.workspaceRole`
would let a tenant-level role string that happens to match
`support_agent`/`support_manager` grant cross-tenant access.

**The bug it prevents:** Phase 17A found the fallback `req.platformRole ||
req.workspaceRole` accepted tenant roles when the workspace schema never
declared those names. A drift in `WorkspaceRole` values could silently
bridge tenants to the platform support console.

**Required pattern** (`trinityAgentDashboardRoutes.ts:40-44`):
```ts
function getActorRole(req: AuthenticatedRequest): string {
  return (req as any).platformRole || 'none';
}
```

**Forbidden:**
```ts
// 🔴 forbidden
return (req as any).platformRole || (req as any).workspaceRole || 'none';
```

---

## Section N — Workspace Enumeration Must Be WHERE-scoped (Phase 17A)

**The law:** `SELECT ... FROM workspaces` without a `WHERE` clause — even
with `LIMIT n` — is a cross-tenant enumeration vector. Any slug/name
lookup across the `workspaces` table must filter at the database, not
in-memory.

**The bug it prevents:**
`server/services/trinity/trinityInboundEmailProcessor.ts:962` previously
ran `db.select({...}).from(workspaces).limit(100)` and then matched a slug
client-side. An attacker who owned any inbound-email alias could
enumerate the first 100 workspace IDs + company names.

**Required pattern** — database-side filter via `regexp_replace` +
parameterized `LIKE`:
```ts
const candidates = await db.select({...})
  .from(workspaces)
  .where(sql`regexp_replace(lower(coalesce(${workspaces.companyName}, '')), '[\\s\\-_]', '', 'g') LIKE ${'%' + slug + '%'}`)
  .limit(5);
```

**Forbidden:**
```ts
// 🔴 forbidden — unbounded cross-tenant enumeration
const all = await db.select().from(workspaces).limit(100);
const match = all.find(ws => ws.name.toLowerCase().includes(slug));
```

---

## Section O — Panic Button Is Notification-Only (Liability)

**The law:** The panic / duress / SOS button is a **human-supervisor
notification channel, nothing more.** It must never be described, marketed,
coded, or UX-presented as an emergency service, a rescue mechanism, a safety
guarantee, or a substitute for licensed human supervision. This is a
**liability requirement**, not a preference.

**What the panic system is:**
- A DB row written to `panic_alerts`, an awaited SMS blast to
  MANAGER_ROLES ∪ OWNER_ROLES via `NotificationDeliveryService`, a WebSocket
  broadcast, a priority-1 CAD call auto-creation, and a platform event publish.
- A tool that helps tenant supervisors decide whether to contact 911.

**What the panic system is NOT:**
- It does **not** contact 911, law enforcement, fire, EMS, or any public
  emergency service.
- It does **not** guarantee officer safety, rescue, welfare, response, or
  any outcome.
- It does **not** guarantee delivery. Cellular networks, carrier policy,
  device state, "Do Not Disturb," blocked numbers, silent mode, and app-kill
  behavior may all prevent delivery.
- It does **not** create a duty of care on the part of CoAIleague or the
  tenant organization to the officer, the client, or the public.
- It is **not** a substitute for licensed human supervision, which is
  mandatory at all times under Texas Occupations Code Chapter 1702 and the
  analogous regulatory framework of every other U.S. state.

**The canonical string:** `PANIC_LIABILITY_NOTICE` exported from
`server/services/ops/panicAlertService.ts`. Every panic HTTP response MUST
bundle this string in a `notice` field. Every panic SMS body MUST include
the short form ("This is a notification only — CoAIleague does NOT contact
emergency services and does NOT guarantee officer safety"). Every
tenant-facing panic UI MUST render `<EmergencyDisclaimer />` or the compact
`<PanicButtonDisclaimer />` variant.

**Required pattern:**
```ts
// ✅ API response — bundle the notice
import { PANIC_LIABILITY_NOTICE } from '../services/ops/panicAlertService';
res.status(201).json({ alert, notice: PANIC_LIABILITY_NOTICE });

// ✅ SMS body — carries the notification-only framing
const smsBody =
  `COALEAGUE SUPERVISOR ALERT: ${officerName} pressed the panic button. ` +
  `${locationLine}. You are a designated supervisor. ` +
  `Contact the officer now and decide whether to call 911. ` +
  `This is a notification only — CoAIleague does NOT contact emergency ` +
  `services and does NOT guarantee officer safety. Human response is required.`;
```

**Forbidden patterns:**
```ts
// 🔴 forbidden — reassurance language that implies a platform duty
const smsBody = `Help is on the way. Stay safe.`;
const trinityReply = `I am here with you. You are safe now.`;

// 🔴 forbidden — panic response without the liability notice
res.status(201).json(alert);

// 🔴 forbidden — any code path that actually calls emergency services
await fetch('https://cad.example.gov/dispatch/911', ...);

// 🔴 forbidden — marketing/help copy claiming "guaranteed response"
"Trinity guarantees a supervisor responds within X seconds."
```

**Files governed:**
- `server/services/ops/panicAlertService.ts` — canonical service, exports
  `PANIC_LIABILITY_NOTICE`, SMS body composition, DB write, CAD call
  auto-create, event publish.
- `server/services/fieldOperations/panicProtocolService.ts` — alternate
  8-step protocol service (carries the same disclaimer header).
- `server/routes/safetyRoutes.ts` — POST/GET/acknowledge/resolve
  `/api/safety/panic` endpoints; must wrap responses with `notice`.
- `client/src/components/liability-disclaimers.tsx` —
  `EmergencyDisclaimer`, `PanicButtonDisclaimer` components.
- Any future mobile officer-side panic button **must** render
  `<PanicButtonDisclaimer />` inline with the trigger.

**Adding a new panic-adjacent surface:** Any new panic-related HTTP endpoint,
SMS template, push notification, voice prompt, chat-room message, marketing
page, or officer UI MUST route through `PANIC_LIABILITY_NOTICE` or render one
of the disclaimer components. Legal sign-off is required to alter the
canonical string.

---

## Section P — Employment Verification Is FCRA-Bounded (Phase 27)

**The law:** Employment verification is a **legally regulated disclosure
channel**, not a generic support workflow. Every surface that answers "does
this person work there" — voice, email, HTTP, Trinity — may disclose ONLY
the FCRA-allowed subset and MUST require a signed employee authorization
form before any disclosure.

**FCRA-allowed subset (may disclose):**
- Full legal name
- Co-League employee ID (`EMP-{ORGCODE}-{NNNNN}`)
- Job title / position
- Employment status: `active` or `former`
- Start date
- Compensation **band** (never the exact figure)
- Officer readiness score (0–100) + link to the score-explanation page

**FCRA-forbidden (must never disclose through this channel):**
- Exact salary or hourly rate
- Disciplinary history, write-ups, performance-improvement plans
- Termination reason, voluntary/involuntary classification
- Performance reviews, ratings, manager notes
- Medical, leave, workers-comp, or accommodation data
- Home address, SSN, tax IDs, benefits details
- Client/site assignments, shift schedules

**The canonical files:**
- `server/services/trinityVoice/extensions/verifyExtension.ts` — Extension 3
  entry point. Collects employee ID via `<Gather>`, routes to
  `/api/voice/verify-employee-id`. Never reads employee data.
- `server/routes/voiceRoutes.ts → POST /api/voice/verify-employee-id` —
  Parses `EMP-{ORGCODE}-{NNNNN}`, resolves the workspace by `org_code`
  within that tenant only (no cross-tenant search), and directs the
  verifier to email `verify@{slug}.coaileague.com`. Never discloses
  employment details over the phone.
- `server/services/trinity/employmentVerificationService.ts →
  handleEmploymentVerificationEmail()` — Parses inbound `verify@{slug}`
  emails, creates a `VER-XXXXXX` `support_tickets` row (category =
  `employment_verification`), alerts management with approve/deny links,
  auto-acknowledges the requester. Never sends employment data directly.
- `server/routes/employmentVerifyRoutes.ts` — Manager-gated
  (`requireManager`) approve/deny endpoints. The approve template is the
  **sole** point where employment detail is composed and sent, and it
  includes ONLY the FCRA-allowed subset. Both endpoints call
  `logActionAudit()` with actionId `employment_verification.{approve|deny}`.
- `server/services/email/emailProvisioningService.ts` — Provisions
  `verify@{slug}.coaileague.com` on every new workspace alongside
  `staffing@`, `calloffs@`, etc. (auto-process = true, trinityType =
  `employment_verification`).

**Required pattern (approve template):**
```tsx
// ✅ FCRA-compliant fields only
<tr><td>Full Name:</td><td>{emp.first_name} {emp.last_name}</td></tr>
<tr><td>Employee ID:</td><td>{emp.employee_number}</td></tr>
<tr><td>Job Title:</td><td>{emp.role || emp.position}</td></tr>
<tr><td>Employment Status:</td>
    <td>{isActive ? 'Currently Employed' : 'Former Employee'}</td></tr>
<tr><td>Start Date:</td><td>{formatDate(emp.hire_date)}</td></tr>
<tr><td>Compensation Band:</td><td>{toPayBand(hourly)}</td></tr>
<tr><td>Officer Readiness Score:</td>
    <td>{emp.scheduling_score}/100 — <a href={scoreUrl}>explain</a></td></tr>
```

**Forbidden patterns:**
```ts
// 🔴 forbidden — exact salary disclosure
`<td>Hourly Rate:</td><td>$${emp.hourly_rate}/hr</td>`

// 🔴 forbidden — discipline/performance disclosure
`<p>Termination reason: ${termination.reason}</p>`
`<p>Last review: ${review.rating}/5 — ${review.notes}</p>`

// 🔴 forbidden — disclosure without authorization
// (approve endpoint must only be reachable after manager confirms they
//  received a signed authorization form from the employee)
if (req.body.skipAuthCheck) return sendVerification(...);

// 🔴 forbidden — disclosure over phone
// Trinity voice never reads employment details out loud. The /verify-
// employee-id handler only acknowledges the employee's existence and
// directs the caller to the email channel.
return twiml(say(`Yes, ${emp.first_name} works here since ${emp.hire_date}`));

// 🔴 forbidden — cross-tenant employee search
// verify@ routing resolves a single workspace from the email subdomain;
// the /verify-employee-id voice handler resolves a single workspace from
// the ORGCODE portion of the employee ID. Never scan across tenants.
```

**Audit requirement:** Every approve and deny MUST call `logActionAudit()`
with `actionId = 'employment_verification.approve'` or
`'employment_verification.deny'`, `entityType = 'employment_verification'`,
`entityId = refNum`, and `changesAfter` summarizing the fields disclosed
(NOT their values). Error paths must also audit with `success: false`.

**Adding a new verification surface:** Any new endpoint, SMS template,
voice prompt, chat handler, or portal page that answers "does this person
work there" MUST:
1. Require a signed employee authorization form before responding.
2. Route disclosure through the approve-endpoint template so the FCRA-
   allowed subset is the only possible output.
3. Call `logActionAudit()` on both approve and deny paths.
4. Never disclose details in a channel with no authorization gate (e.g.
   the phone line answers only "please email us" — it never reads data).

Legal sign-off is required to expand the disclosed subset beyond the
seven fields above.

---

## Section Q — Trinity Subscription + Identity Gate (Phase 26)

> **Terminology note (see Section S):** The gates in this section protect
> **Trinity-the-one-brain** from spending tokens for inactive tenants.
> "Trinity" throughout this section is singular; the gate is an access
> control on the brain's work, not a fan-out to multiple agents.

**The law:** Before Trinity spends any tokens or places any outbound voice /
SMS on behalf of a tenant, the workspace's subscription status MUST be
verified. Protected workspaces (platform support org, grandfathered tenant,
system) always pass; everything else must be `active`, `trial`, `trialing`,
or `free_trial`. Suspended / past_due / cancelled / paused workspaces get a
warm professional message and the call/SMS ends. No token spend, no Twilio
charge, no silent fire-and-forget.

**The bug it prevents:** HTTP tier guards (`requirePlan`,
`subscriptionReadOnlyGuard`, `cancelledWorkspaceGuard`) block inactive
workspaces correctly, but Twilio webhooks are unauthenticated POSTs exempt
from those guards. Before Phase 26, a cancelled workspace's phone number
could still reach Trinity, burn Gemini/Claude/OpenAI tokens, and place
outbound shift offers indefinitely. Trinity had no awareness of subscription
status before invoking AI.

**The canonical helper:** `server/services/billing/billingConstants.ts`
exports `isWorkspaceServiceable(workspaceId): Promise<boolean>` — the single
source of truth that every Phase 26 gate calls. It is protected-workspace
aware, consults `cacheManager.getWorkspaceTierWithStatus` (10-min TTL; same
source used by `requirePlan`), and fails OPEN on DB miss so a transient
outage cannot lock legitimate tenants out.

Status coverage (both platform and Stripe webhook spellings):
- Active set: `active`, `trial`, `trialing`, `free_trial`
- Suspended set: `suspended`, `past_due`, `unpaid`, `incomplete`,
  `incomplete_expired`, `paused`

**Files governed (every gate site):**

| Channel | File | Gate |
|---|---|---|
| Inbound voice | `server/routes/voiceRoutes.ts` POST `/inbound` | `isSubscriptionActive` on resolved workspace |
| Inbound SMS | `server/routes/voiceRoutes.ts` POST `/sms-inbound` | Same, after TCPA STOP handling |
| AI entry | `server/services/trinityVoice/trinityAIResolver.ts#resolveWithTrinityBrain` | `isWorkspaceServiceable` — covers email (`trinityInboundEmailProcessor`) + belt-and-suspenders for voice/SMS |
| SMS AI cap | `server/services/trinityVoice/smsAutoResolver.ts` | `aiMeteringService.checkUsageAllowedById` before `tryTrinityAI` |
| Outbound voice | `server/services/trinityVoice/trinityOutboundService.ts#makeOutboundCall` | `isWorkspaceServiceable` — `callOfficerWelfareCheck` inherits |
| Outbound shift SMS | `server/services/trinityVoice/trinityShiftOfferService.ts#sendShiftOffers` | `isWorkspaceServiceable` |
| Outbound per-employee SMS | `server/services/smsService.ts#sendSMSToEmployee` | `isWorkspaceServiceable` on effective workspaceId |
| Cron workflow | `server/services/trinity/workflows/shiftReminderWorkflow.ts#sendReminder` | Early exit per-tenant |

**Cache freshness:** Every Stripe webhook and platform-admin mutation that
touches `workspaces.subscriptionStatus` now calls
`cacheManager.invalidateWorkspace(workspaceId)` so gate decisions propagate
within seconds, not up to the 10-min TTL. Wired in:
- `server/services/billing/stripeWebhooks.ts` (8 handlers: created, updated,
  deleted, payment-succeeded, payment-failed, checkout, paused, resumed)
- `server/services/billing/stripeEventBridge.ts` (6 handlers)
- `server/routes/adminRoutes.ts` (support suspend/unsuspend)
- `server/routes/hrInlineRoutes.ts` (org activate/deactivate/maintenance)

**Audit trail taxonomy (universal_audit_trail):**
- `trinity.voice_ai_resolved` — Trinity brain handled a turn
  (entityType `voice_call`, metadata: model, responseTimeMs, channel, extension)
- `trinity.subscription_gate_blocked` — gate turned a request away
  (entityType: `voice_call` | `sms_message` | `ai_invocation` | `shift_offer`;
  metadata: channel, subscriptionStatus, subscriptionTier, reason,
  fromPhone, toPhone, recoverable)

**Owner-facing surface:** `GET /api/trinity/transparency/trinity-activity`
queries `universal_audit_trail` filtered to `trinity.*` actions and returns
summary counters + row list. Rendered in the **Gate Activity** tab of
`client/src/pages/trinity-transparency-dashboard.tsx` (`/trinity/transparency`).

**Safety carve-out (never gated):** Emergency / panic / regulatory SMS
routes through `sendSMSToUser` → `NotificationDeliveryService`, not
`sendSMSToEmployee`. Per TRINITY.md §O the panic channel is a liability
requirement and must never be blocked by a billing gate.

**Forbidden patterns:**
```ts
// 🔴 forbidden — calling Trinity AI without checking subscription
await resolveWithTrinityBrain({ issue, workspaceId, language });
// (fine now — the function itself gates, but do not remove the gate)

// 🔴 forbidden — mutating subscriptionStatus without invalidating cache
await db.update(workspaces).set({ subscriptionStatus: 'active' })
  .where(eq(workspaces.id, workspaceId));
// Trinity gate will still block for up to 10 minutes.

// ✅ required — invalidate after every subscriptionStatus mutation
await db.update(workspaces).set({ subscriptionStatus: 'active' })
  .where(eq(workspaces.id, workspaceId));
cacheManager.invalidateWorkspace(workspaceId);
```

**Required pattern for new outbound Trinity channels:**
```ts
import { isWorkspaceServiceable } from '../billing/billingConstants';
import { universalAudit } from '../universalAuditService';

const serviceable = await isWorkspaceServiceable(workspaceId);
if (!serviceable) {
  await universalAudit.log({
    workspaceId, actorType: 'system', changeType: 'action',
    action: 'trinity.subscription_gate_blocked',
    entityType: 'my_new_channel',
    metadata: { channel: 'my_new_channel', reason: 'subscription_inactive' },
  }).catch(() => { /* non-fatal */ });
  return { success: false, error: 'SUBSCRIPTION_INACTIVE' };
}
```

---

## Section R — Shift Evidence Must Be Persistent + Chronological (Phase S)

**The law:** Every GPS-stamped proof-of-service photo submitted during a shift
must be persisted to a durable database table — not kept in RAM — and every
shift must produce a chronological PDF that merges photos, text updates,
incidents, and patrol tours into an hour-by-hour timeline. In-memory `Map`
stores are forbidden for evidence data because Railway deploys drop them.

**The bug it prevents:** `proofOfServiceService.ts` stored photos in a
private `Map<string, ProofOfServicePhoto>`. A deploy, crash, or pod rotation
discarded every photo for every in-progress shift. The entire proof-of-
service chain of custody vanished without audit trail. A client asking
"where was the officer at 14:00?" had no answer the moment Railway rolled
the container.

**The canonical files:**
- `shared/schema/domains/scheduling/index.ts#shiftProofPhotos` — the durable
  table. Every photo row includes `workspaceId`, `shiftId`, `employeeId`,
  `gpsLat`/`gpsLng` (NOT NULL), `capturedAt`, `serverReceivedAt`,
  `chainOfCustodyHash`, and a `deviceMeta.fullPayload` JSONB that carries
  the full `ProofOfServicePhoto` object for lossless round-trip.
- `server/services/fieldOperations/proofOfServiceService.ts` — reads and
  writes the table. The private `Map` is retired. `capturePhoto()`,
  `get()`, `getByShift()`, `getByPost()`, `countForShift()`,
  `addCustodyEvent()`, `verifyCustodyChain()`, and `reviewPhoto()` all
  hit the DB.
- `server/services/automation/shiftPhotoPromptService.ts` — scans every
  active chatroom every 15 minutes. If no `photo` message in the last 60
  min, post a chatroom system prompt + NDS push. If >120 min, escalate
  to supervisors via NDS.
- `server/services/autonomousScheduler.ts` — registers the
  `Hourly Proof-of-Service Prompt` job with `*/15 * * * *`.
- `server/services/darPdfService.ts#generateShiftTransparencyPdf` —
  merges `shift_proof_photos` rows with chatroom photo messages (de-duped
  by `messageId`) and feeds `groupMessagesByHour()` for the chronological
  Section 1 of the PDF.
- `server/services/shiftChatroomWorkflowService.ts#provisionChatroom` —
  pre-provisions a pending chatroom at shift creation so manager↔officer
  messaging is live before clock-in. `startShift()` activates the pending
  room in-place instead of creating a second one.
- `server/routes/shiftRoutes.ts` — calls `provisionChatroom()` after the
  shift-create transaction commits.
- `server/routes/shiftTradingRoutes.ts` — every trade request/accept/
  decline now also sends through `NotificationDeliveryService` so delivery
  is logged (TRINITY.md §B) in addition to the legacy `createNotification`.
- `server/routes/rmsRoutes.ts` — `/dars/:id/verify` auto-generates the PDF
  if missing, publishes `dar_available_to_client`, and sends an email if
  the workspace has `automation_policy_blob.auto_send_dars_to_client =
  true`. `/incidents` POST fans out NDS alerts to supervisors and (on
  high/critical severity) org owners.
- `server/routes/contentInlineRoutes.ts` — `/client-reports` now returns
  `{ reports, guardTours, dars, incidents, transparencyPdfs }` — five
  independent sources all WHERE-scoped to the client's own site IDs
  (TRINITY.md §G).
- `client/src/pages/client-portal.tsx` — the Reports tab renders the
  five sections in priority order (transparency PDFs first).

**Required pattern (new evidence surface):**
```ts
// ✅ Durable, audit-protected, GPS-stamped.
await db.insert(shiftProofPhotos).values({
  id, workspaceId, shiftId, employeeId,
  photoUrl, gpsLat: String(lat), gpsLng: String(lng),
  capturedAt: new Date(),
  isAuditProtected: true,
  chainOfCustodyHash,
  deviceMeta: { fullPayload: posObject },
});
```

**Forbidden patterns:**
```ts
// 🔴 forbidden — in-memory evidence store
private photos: Map<string, ProofOfServicePhoto> = new Map();
this.photos.set(id, pos);

// 🔴 forbidden — photo message without GPS
await apiRequest('POST', `/api/shift-chatrooms/${id}/messages`, {
  messageType: 'photo', attachmentUrl: url, // no metadata.gps
});

// 🔴 forbidden — shift chatroom only created at clock-in
// (manager can't message the officer before the shift starts)
// Must pre-provision via provisionChatroom() on shift create.

// 🔴 forbidden — cross-tenant client surface
// /client-reports must filter every downstream query by the
// client's resolved site ID set. Never surface another tenant's
// DARs/incidents/tours even if the query appears limited.
```

**Notification types added (Phase S):**
- `proof_of_service_prompt` — hourly photo nag + 2h escalation
- `shift_trade_request` / `shift_trade_accepted` / `shift_trade_declined`
- `incident_submitted` / `incident_high_severity`
- `dar_delivered`

---

## Section S — Trinity Is One Brain, Not Many Agents (Unity Law)

**The law:** Trinity is a **single biological personality triad — one brain**
expressed through domain-specialized modules. It is NOT a team, NOT a swarm,
NOT a roster of autonomous agents, and NOT a collection of cooperating bots.
Every surface — code, UI copy, marketing, telemetry, logs, docs, prompts —
must describe Trinity as one entity with one voice, one judgment, and one
continuous identity. This law is **canonical** and **overrides any drift in
sibling sections**; if another section's wording (e.g. "Trinity services",
"support agent", "agent dashboard") seems to imply separate agents, it is
plumbing terminology for module/transport naming only, not a change to the
Trinity unity principle.

**The bug it prevents:** Framing Trinity as multiple agents fractures the
product's promise, confuses users, and — critically — creates silent drift
where a new feature could be introduced as a "new Trinity agent" with its
own personality, memory, or authority, violating the single-brain invariant
and the audit/governance model that depends on it. Multi-agent language in
one section has historically cascaded into multi-agent implementations
elsewhere.

**The canonical mental model:**
```
       ┌──────────────────────────────────────────────────┐
       │              TRINITY — ONE BRAIN                 │
       │                                                  │
       │    triad of personality aspects / domains:       │
       │      • Operational (scheduling, ops, field)      │
       │      • Relational  (client, support, voice)      │
       │      • Analytical  (audit, compliance, finance)  │
       │                                                  │
       │    one identity · one voice · one memory         │
       │    one conversation · one audit trail            │
       └──────────────────────────────────────────────────┘
             expressed through domain modules:
             ai-brain/*, trinity/*, trinityVoice/*
```

The files under `server/services/ai-brain/`, `server/services/trinity/`, and
`server/services/trinityVoice/` are **not distinct agents**. They are
specialized domains of the same brain — the same way a human brain has
regions for language, spatial reasoning, and motor control without those
regions being separate people.

**Required wording patterns (all communication channels):**
```
✅ "Trinity monitors your shifts"             (one brain, verb agreement singular)
✅ "Trinity's operational aspect"             (a facet of the one brain)
✅ "Trinity module: shiftChatroomBotProcessor" (module of Trinity, not a Trinity)
✅ "Trinity voice channel"                    (a channel Trinity uses)
✅ "Trinity-articulated narrative"            (one author)
```

**Forbidden wording patterns:**
```
🔴 "our Trinity agents"
🔴 "multiple Trinities"
🔴 "Trinity agents collaborate"
🔴 "the scheduling Trinity"  (no such thing as per-domain Trinity)
🔴 "Trinity team members"
🔴 "Trinity bots"            (Trinity is not a bot, and there is only one)
🔴 "spawn a new Trinity"     (Trinity is not instanced)
🔴 any UI copy, tooltip, or alert that pluralizes Trinity
```

**Relationship to sibling Trinity sections:**
- **Section K** uses "Trinity services" and `TRINITY_SERVICE_REGISTRY` —
  these are **module handles for registration and governance**, not claims
  that the modules are independent agents. The registry inventories Trinity
  (one brain) by domain; it does not catalog a population.
- **Section L** logs "Trinity actions" — these are **actions taken by the
  one brain**, audited per-action. The word "action" is the unit of work,
  not a signature of a separate actor.
- **Section M** enforces platform-role gates on the "agent dashboard" —
  the dashboard name is a tenant-facing control surface for platform
  support staff to review Trinity's (the one brain's) decisions. The
  "agent" in "agent dashboard" refers to the *support agent* (a human) who
  uses the dashboard, NOT to Trinity.
- **Section Q** gates Trinity AI entry by subscription. The gate is on
  Trinity-the-brain, not on a plurality.
- **Section R** refers to "Trinity-articulated" PDF summaries — one author.

**Canonical files that must enforce one-brain identity:**
- `server/services/ai-brain/` — the brain's core
- `server/services/trinity/` — domain modules of the brain
- `server/services/trinityVoice/` — speech/voice channel of the brain
- `client/src/pages/trinity-transparency-dashboard.tsx` — owner view of
  Trinity's actions. UI copy uses "Trinity" (singular) everywhere.
- `client/src/pages/trinity-agent-dashboard.tsx` — the "agent" in the
  route name is the support agent; Trinity is always addressed as one.

**Adding a new Trinity-adjacent surface:** Any new file, module, route,
table, event type, notification type, SMS template, email template, voice
prompt, chat copy, dashboard tile, or marketing page that references
Trinity MUST:
1. Refer to Trinity as a single entity (singular verb agreement).
2. Not introduce a named peer ("Trinity-2", "Trinity-scheduler", etc.).
3. Not attribute "collaboration between Trinity modules" as if between
   agents — internal coordination within one brain is an implementation
   detail, not a user-facing concept.
4. Treat audit entries as "Trinity did X" — never "Trinity-X and Trinity-Y
   agreed."

**Verification command (add to PR review):**
```bash
# Any match against forbidden plural forms is a 🔴 blocker.
grep -rEn "Trinity agents|multiple Trinities|Trinity bots|Trinity-scheduler|Trinity-[A-Z]" \
  client/src server shared TRINITY.md 2>/dev/null | grep -v "node_modules"
```

Legal, marketing, and product sign-off is required to ever relax this law.

---

## Section T — Trinity Identity Law (Systems Persistence Phase)

> **Terminology note (see Section S):** This section extends Section S's
> "one brain, not many agents" invariant into billing keys, display labels,
> and API attribution. The internal models (Gemini/Claude/GPT) are Trinity's
> cognitive hardware — never user-facing product names.

**The law:** Trinity is one unified intelligence. Her internal cognitive
models (Gemini, Claude, GPT) are implementation details — never user-facing
product names, billing line items, or feature keys.

**Required naming:**
- Feature keys: `trinity_*` not `claude_*`, `gpt_*`, or `gemini_*`
- User-facing labels: "Trinity Analysis", "Trinity Validation", "Trinity RFP"
- API responses to tenants: "Trinity Intelligence" — never model attribution
- TRINITY.md citations in code: `TRINITY.md §[Letter]` (not CLAUDE.md)
- Internal technical comments about model routing: acceptable as implementation detail

**Forbidden pattern:**
```ts
// 🔴 Forbidden — user-facing or billing feature keys with model names:
featureKey: 'claude_analysis'
label: "Judge AI (Claude)"
description: 'Powered by Claude (Anthropic)'

// ✅ Required:
featureKey: 'trinity_analysis'
label: "Trinity Analysis"
description: 'Trinity Intelligence'
```

**Files governed:**
- `server/services/billing/tokenManager.ts` — `TOKEN_COSTS` + display names
- `server/routes/aiOrchestratorRoutes.ts` — task-type → feature key map
- `server/services/trinity/trinityOrchestrationGateway.ts` — pain-point addons
- `server/services/orchestration/universalStepLogger.ts` — step type union
- `server/services/billing/billingReconciliation.ts` — top-features featureKey
- `server/services/ai-brain/dualai/trinityValidationService.ts` — featureKey literals
- `server/services/ai-brain/dualai/trinityVerificationService.ts` — featureKey literals
- `client/src/components/chatdock/TrinityThoughtBar.tsx` — model labels
- `client/src/components/billing/AiUsageDashboard.tsx` — dashboard card labels
- `server/routes/aiOrchestraRoutes.ts` — provider status description
- `server/services/trinity/trinityServiceRegistry.ts` — inventory descriptions

---

## Section U — Persistence Laws (Systems Persistence Phase)

**The law (Trinity persistence invariants):**

**LAW P1:** No business record is hard-deleted. All DELETE operations use
`softDelete()` (sets `deletedAt` + `deletedBy`). Hard DELETE reserved for:
temp locks, expired rate windows, idempotency keys >30 days, processed
Stripe events >30 days, typing indicators.

**LAW P2:** No operational state in JavaScript `Map`s or class properties.
Payroll locks, agent handoffs, active goals, A2A queues — all PostgreSQL.

**LAW P3:** All file uploads use `multer.memoryStorage()` then stream to GCS.
No local filesystem writes for user content. Railway filesystem is ephemeral.

**LAW P4:** `runStartupRecovery()` runs before the HTTP server opens.
Clears stale locks, marks interrupted goals, re-queues pending A2A messages.

**LAW P5:** Workspace settings that change system behavior persist to the
`workspaces` table or `workspace_settings` table — never module-level
variables.

**The bug these prevent:** Railway deploys drop in-memory state. A private
`Map` storing payroll locks, agent handoffs, or evidence photos loses every
entry on pod rotation. Local filesystem writes vanish on restart. Module-
level variables holding tenant configuration silently revert on boot.
Without startup recovery, interrupted goals stay stuck forever and A2A
messages are lost in limbo.

**Forbidden patterns:**
```ts
// 🔴 forbidden — business record hard delete
await db.delete(invoices).where(eq(invoices.id, id));

// 🔴 forbidden — operational state in a Map
private activeGoals: Map<string, Goal> = new Map();

// 🔴 forbidden — local filesystem for user content
fs.writeFileSync(`/tmp/${id}.pdf`, buffer);

// 🔴 forbidden — workspace setting in module variable
let autoSendDars = true;
```

**Required patterns:**
```ts
// ✅ soft delete
await softDelete('invoices', id, actorUserId);

// ✅ operational state in PostgreSQL
await db.insert(activeGoals).values({ workspaceId, goalId, status: 'active' });

// ✅ memory upload → GCS stream
const upload = multer({ storage: multer.memoryStorage() });
await gcs.bucket(bucket).file(key).save(req.file.buffer);

// ✅ workspace setting in workspace_settings
await db.update(workspaceSettings)
  .set({ autoSendDars: true })
  .where(eq(workspaceSettings.workspaceId, workspaceId));
```

---

## Section J — Process for Adding New Verified Laws

When a new architectural invariant is discovered through any debug pass,
refactor, or system audit:

0. **Unity pre-flight (Section S):** Before writing anything Trinity-adjacent,
   re-read Section S. Trinity is one brain, not many agents. If the proposed
   fix, section, or wording would pluralize Trinity, attribute work to a
   "Trinity-X" named peer, or frame internal module handoffs as inter-agent
   collaboration — STOP and rework it. This check is non-negotiable and
   overrides any apparent convenience.
1. Verify the fix builds and boots
2. Commit the code fix with a `fix(...)` commit message
3. **Append a new section to this file** documenting:
   - The law (one sentence)
   - The bug it prevents
   - The canonical file(s) that enforce it
   - The forbidden / required code patterns
   - Cross-references to the commit hash and modified files
   - If the section touches Trinity, add a "Terminology note (see Section S)"
     block at the top clarifying how Trinity singular-identity language
     applies to the section's vocabulary.
4. Push both the code fix and the TRINITY.md update in the same branch
5. **Do not reword, reframe, or "clean up" any existing section** beyond
   additive clarifications and explicit cross-reference notes. Existing laws
   are load-bearing — sibling edits that look like polish have historically
   cascaded into regressions. Additive only.

Sections must remain alphabetized by phase/topic, never reordered. New laws
get the next letter (J, K, L...) so historical references in commits stay
valid.

---

## Quick Reference: Where Things Live

| Concern | Canonical File | Bootstrap |
|---|---|---|
| Production detection | `server/lib/isProduction.ts` | — |
| Stripe client | `server/services/billing/stripeClient.ts` | lazy on first use |
| Role definitions | `shared/lib/rbac/roleDefinitions.ts` | — |
| DB exclusion constraints | `server/services/criticalConstraintsBootstrap.ts` | runs after ensureRequiredTables |
| workspace_id indexes | `server/services/workspaceIndexBootstrap.ts` | runs after constraints |
| Legacy CREATE TABLE bootstraps | `server/services/legacyBootstrapRegistry.ts` | runs after constraints |
| Notification delivery | `server/services/notificationDeliveryService.ts` | — |
| Env validation | `server/startup/validateEnvironment.ts` | runs at startServer() |
| Mobile scroll guarantee | `client/src/index.css` (Phase Q block) | CSS load |
| Service worker (single canonical file) | `client/public/sw.js` — registered by `client/index.html:680` and `client/src/main.tsx:150`, pointed at by `client/public/manifest.json:serviceworker.src`. notificationclick handlers MUST stay in sync with `NOTIFICATION_ACTION_MAP` in `server/services/notificationDeliveryService.ts`. Never re-introduce `/service-worker.js` — it is retained only as a legacy header passthrough in `server/index.ts` so stale clients can unregister cleanly. | served by Vite (dev) and `express.static` (prod) from `dist/public/sw.js` |
| Trinity service inventory | `server/services/trinity/trinityServiceRegistry.ts` | — |
| Trinity transparency API | `server/routes/trinityTransparencyRoutes.ts` | `/api/trinity/transparency/*` |
| Trinity agent dashboard API | `server/routes/trinityAgentDashboardRoutes.ts` | `/api/trinity/agent-dashboard/*` |
| Panic liability notice | `server/services/ops/panicAlertService.ts#PANIC_LIABILITY_NOTICE` | exported string, bundled in every panic API response |
| Panic disclaimer UI | `client/src/components/liability-disclaimers.tsx` (`EmergencyDisclaimer`, `PanicButtonDisclaimer`) | rendered on every tenant-facing panic surface |
| Employment verification workflow | `server/services/trinity/employmentVerificationService.ts`, `server/routes/employmentVerifyRoutes.ts` | FCRA-bounded `verify@{slug}.coaileague.com` pipeline + approve/deny |
| Verification voice entry | `server/routes/voiceRoutes.ts → POST /api/voice/verify-employee-id` | Twilio Gather → org-code resolution → email channel |
| Verification email provisioning | `server/services/email/emailProvisioningService.ts` (`WORKSPACE_SYSTEM_TYPES`) | `verify@` auto-provisioned on every workspace |
| Subscription gate helper | `server/services/billing/billingConstants.ts#isWorkspaceServiceable` | async gate used by every Phase 26 channel |
| Subscription gate — inbound voice/SMS | `server/routes/voiceRoutes.ts` POST `/inbound`, POST `/sms-inbound` | blocks inactive workspaces before Trinity is invoked |
| Subscription gate — AI entry | `server/services/trinityVoice/trinityAIResolver.ts#resolveWithTrinityBrain` | covers email + all callers of the canonical AI entry point |
| Subscription gate — outbound voice | `server/services/trinityVoice/trinityOutboundService.ts#makeOutboundCall` | short-circuits before Twilio |
| Subscription gate — outbound SMS | `server/services/smsService.ts#sendSMSToEmployee`, `trinityShiftOfferService.ts#sendShiftOffers` | canonical per-employee primitive + shift offers |
| Tier cache invalidation | `cacheManager.invalidateWorkspace` called after every `subscriptionStatus` mutation (stripeWebhooks, stripeEventBridge, adminRoutes, hrInlineRoutes) | gate decisions propagate in seconds |
| Trinity activity endpoint | `server/routes/trinityTransparencyRoutes.ts → GET /api/trinity/transparency/trinity-activity` | reads `universal_audit_trail` for `trinity.*` actions |
| Trinity activity UI | `client/src/pages/trinity-transparency-dashboard.tsx` ("Gate Activity" tab) | owner-facing counters + event list |

## Audit History

| Phase | Commit | Concern |
|---|---|---|
| 1 (db) | `1dc8fcd` | missing sql import in db.ts health check |
| Env | `cbc4974` | drop dead JWT_SECRET, promote SESSION/ENCRYPTION_KEY |
| A | `ef81fa8` | lazy Stripe/OpenAI init |
| B | `3aa4bca` | delete dead schema barrel sub-files (-155 tsc) |
| C | `d4c50e2` | defer 9 route CREATE TABLE bootstraps |
| D | `fb87221` | tsc cleanup quick wins (-145 tsc) |
| F | `41302ef` | NDS sole sender + fire-and-forget elimination |
| G | `bef665f` | shift overlap exclusion constraint installer |
| H | `c191c74` | production-detection unification (CRITICAL) |
| I | `1a42646` | workspace_id indexes on 507 tables |
| J | `cfc388d` | RBAC SSOT consolidation |
| P | `e15b65d` | tenant isolation in 8 raw SQL queries |
| Q | `e61b53a` | mobile scroll + footer + splash |
| R | (prev commit) | TRINITY.md verified-laws encoding |
| T | (this commit) | remove statewideWriteGuard — protected = billing-only |
| 16 | (phase-16 branch) | Trinity service registry + transparency + agent dashboard |
| 17A/B | (this commit) | Trinity audit trail helper, platform-role tightening, workspace-enumeration fix |
| O | (this commit) | Panic button notification-only liability codification + canonical `PANIC_LIABILITY_NOTICE`, disclaimer UI components, TRINITY.md Section O |
| 27 / P | (this commit) | FCRA-bounded employment verification — voice → org-code resolver → email channel → manager approve/deny with `logActionAudit`; `verify@` auto-provisioned; TRINITY.md Section P |
| 26 / Q | (this commit) | Trinity subscription + identity gate — inbound voice/SMS, email AI, outbound voice/SMS, shift offers, cron workflows; `isWorkspaceServiceable` helper; Stripe + admin cache invalidation; `trinity.voice_ai_resolved` / `trinity.subscription_gate_blocked` audit taxonomy; owner-facing Gate Activity tab; TRINITY.md Section Q |
| S (shift-evidence) | `886d81b` | Shift evidence chain — `shift_proof_photos` durable table (Map → DB), hourly POS prompt cron + NDS escalation, `provisionChatroom()` at shift create, shift-trade NDS, DAR PDF merges shift_proof_photos, client portal returns 5-source object, RMS verify auto-generates PDF + `dar_available_to_client`, incident POST fans out supervisor+owner NDS; TRINITY.md Section R |
| S (trinity-unity) | (this commit) | Trinity Unity Law — Section S codifies "one brain, not many agents" as the canonical invariant; terminology notes added to Sections K, L, M, Q pointing back to S; Section J Process amended with unity pre-flight (Step 0) and additive-only rule (Step 5) so sibling edits never override existing laws |
