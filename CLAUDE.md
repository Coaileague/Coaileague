# CoAIleague — Verified Engineering Laws

This file is the persistent record of architectural laws verified and enforced
by Claude Code debug passes. The full canonical briefing (vision, Trinity
biological architecture, governance systems, etc.) is held externally — this
file is the **enforced subset** with code-level cross-references so future
sessions can verify each law without re-discovering it.

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

**The law (CLAUDE.md §9):** Zero fire-and-forget calls. Every notification
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

**The law (CLAUDE.md §9):** Shift-overlap prevention is enforced atomically
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

**The law (CLAUDE.md §9):** All `workspace_id` columns indexed.

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

**The law (CLAUDE.md §8):** roleDefinitions.ts is the only place roles are
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

**The law (CLAUDE.md §1):** Every query is scoped by `workspace_id`. No
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

**The law (CLAUDE.md §10 expansion):** Every section/category of code must
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
and resolve correctly. Per CLAUDE.md §9 White-Label Rule: zero hardcoded
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

## Section J — Process for Adding New Verified Laws

When Claude Code (or any future debug session) discovers a new architectural
law that should be enforced going forward:

1. Verify the fix builds and boots
2. Commit the code fix with a `fix(...)` commit message
3. **Append a new section to this file** documenting:
   - The law (one sentence)
   - The bug it prevents
   - The canonical file(s) that enforce it
   - The forbidden / required code patterns
   - Cross-references to the commit hash and modified files
4. Push both the code fix and the CLAUDE.md update in the same branch

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
| Trinity service inventory | `server/services/trinity/trinityServiceRegistry.ts` | — |
| Trinity transparency API | `server/routes/trinityTransparencyRoutes.ts` | `/api/trinity/transparency/*` |
| Trinity agent dashboard API | `server/routes/trinityAgentDashboardRoutes.ts` | `/api/trinity/agent-dashboard/*` |
| Panic liability notice | `server/services/ops/panicAlertService.ts#PANIC_LIABILITY_NOTICE` | exported string, bundled in every panic API response |
| Panic disclaimer UI | `client/src/components/liability-disclaimers.tsx` (`EmergencyDisclaimer`, `PanicButtonDisclaimer`) | rendered on every tenant-facing panic surface |

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
| R | (prev commit) | CLAUDE.md verified-laws encoding |
| T | (this commit) | remove statewideWriteGuard — protected = billing-only |
| 16 | (phase-16 branch) | Trinity service registry + transparency + agent dashboard |
| 17A/B | (this commit) | Trinity audit trail helper, platform-role tightening, workspace-enumeration fix |
| O | (this commit) | Panic button notification-only liability codification + canonical `PANIC_LIABILITY_NOTICE`, disclaimer UI components, CLAUDE.md Section O |
