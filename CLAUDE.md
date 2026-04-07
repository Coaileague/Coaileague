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
| R | (this commit) | CLAUDE.md verified-laws encoding |
