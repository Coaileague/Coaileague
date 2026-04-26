# AGENT SYNC BLOCK — Refactor Phase 2

Updated: 2026-04-26

## Branch rules

- `development` is the merged production branch.
- `refactor/route-cleanup` was merged by PR #206 and should now be treated as historical.
- Continue new cleanup work on `refactor/route-cleanup-2`.
- Do not push new cleanup directly to `development` unless explicitly instructed.

## Current baseline

`refactor/route-cleanup-2` was created from current `development` tip:

```text
3f8fa625a5539e27ba58a736095cebad128bf0a5
fix: ESM crash — replace require('stripe') with dynamic import
```

PR #206 merged the first route cleanup branch into `development`.

Reported route cleanup total from Phase 1:

```text
~24,335 lines removed
```

## Immediate post-merge note

The previous `AGENT_HANDOFF.md` contained raw merge-conflict markers after PR #206:

```text
<<<<<<< HEAD
=======
>>>>>>> 6af93acb
```

Jack cleaned this handoff on `refactor/route-cleanup-2` before continuing work.

## Required health checks before each execution batch

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
rg "\b(adRouter|dRouter|uter|outer|ter|er)\." server/routes
rg "<<<<<<<|=======|>>>>>>>" .
```

## Correct cleanup methodology

### Step 1 — check mount prefix first

```bash
grep -rn "/api/MOUNT_PREFIX" client/ server/ | grep -v ROUTE_FILE.ts
```

If the prefix has callers, keep the file and trim only exact dead handlers.

### Step 2 — check exact handler paths

```bash
grep -rn "/api/MOUNT/specific-path" client/ server/ scripts/ tests/ | grep -v ROUTE_FILE.ts
```

Delete only when exact path proof is clean and the route is not a public/payment/export/webhook/portal endpoint.

## Phase 1 completed areas

Large route cleanup already completed across:

- OPS / CAD / dispatch / vehicles / post orders
- HR / onboarding / benefits / HRIS / employee surfaces
- Scheduling / schedules / scheduleOS / advanced scheduling / shift routes
- Trinity / AI / HelpAI / automation tooling
- Payroll / billing / invoices
- Misc/dev routes

## High-risk routes to preserve unless proven dead by stronger evidence

- invoice portal/payment/PDF routes
- payroll runs/create-run/paystubs/tax/deductions/garnishments routes
- billing subscription/credits/Stripe/token usage routes
- `/api/automation/trinity/*`
- `/api/helpai/*` routes used by HelpAI integration panel
- `/api/schedules`, `/api/shifts`, `/api/time-off*`

## Phase 2 working targets

Use larger batches. Good next areas:

1. Integration routes and service status routes
   - `server/routes/integrations-status.ts`
   - integration/QuickBooks/Stripe/third-party route surfaces
2. Support and helpdesk routes
   - `server/routes/supportRoutes.ts`
   - `server/routes/helpdeskRoutes.ts`
   - `server/routes/supportActionRoutes.ts`
3. Client-side cleanup verification after recent component/hook/page deletions
   - find stale imports for deleted components/hooks
   - do not delete more UI until import graph is clean
4. Remaining large route files found by local `wc -l server/routes/*.ts`

## Recommended Claude/local execution pattern

For each larger batch:

```bash
# inventory
wc -l server/routes/*.ts | sort -nr | head -30
rg "<<<<<<<|=======|>>>>>>>" .
rg "\b(adRouter|dRouter|uter|outer|ter|er)\." server/routes

# after edits
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

## Who goes next

Jack continues auditing on `refactor/route-cleanup-2`, then Claude executes local build-verified batches.
