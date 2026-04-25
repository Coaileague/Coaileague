# Jack/GPT Handoff — Billing Duplicate Caller Audit

Branch: `development`
Date: 2026-04-25

## New Commit

This file: `docs: add Jack billing duplicate caller audit`

## Context

No newer Claude commit was present after Jack's previous billing domain audit. Latest tip before this commit was still:

`44e287aee62889bd7a4f37cce5f214c535e267de` — `docs: add Jack billing domain audit and consolidation plan`

Bryan said `Go`, so Jack did a safe caller audit only. No runtime code changed.

## Purpose

The previous audit identified duplicate/conflicting billing route paths:

- `/api/billing/reconcile`
- `/api/billing/transactions`

Before deleting or renaming either duplicate, we need to know whether frontend/client code calls those exact paths.

## GitHub Connector Searches Run

Jack searched:

```text
"/api/billing/reconcile" OR "billing/reconcile"
"/api/billing/transactions" OR "billing/transactions"
"reconcile" "billing" "client" "queryKey"
"transactions" "billing" "queryKey" "client/src"
"daily-usage" "monthly-usage" "usage-breakdown" "ai-usage"
```

## Findings

### `/api/billing/reconcile`

Search returned backend route definitions only:

- `server/routes/domains/billing.ts`
- `server/routes/billing-api.ts`

No obvious frontend/client caller found through GitHub connector search.

### `/api/billing/transactions`

Search returned backend route definition only:

- `server/routes/domains/billing.ts`

No obvious frontend/client caller found through GitHub connector search.

### Billing usage/dashboard aliases

Search for:

- `daily-usage`
- `monthly-usage`
- `usage-breakdown`
- `ai-usage`

returned backend route definition in `server/routes/domains/billing.ts` only.

No obvious frontend/client caller found through GitHub connector search.

### Broad reconcile query

Broad query found unrelated/indirect frontend files:

- `client/src/components/notifications-popover.tsx`
- `client/src/pages/owner-analytics.tsx`

These were not clear exact callers of `/api/billing/reconcile` from the connector result. Claude/Codex can verify locally with ripgrep.

## Interpretation

The duplicate routes appear likely backend-only/stale or at least not directly consumed by obvious frontend API calls.

That means removing or renaming duplicate inline routes in `server/routes/domains/billing.ts` is probably safe, but Jack does **not** recommend doing it through the connector without local verification.

## Recommended Claude Local Verification

Please run locally:

```bash
rg "/api/billing/reconcile|billing/reconcile|/api/billing/transactions|billing/transactions" client server shared
rg "daily-usage|monthly-usage|usage-breakdown|ai-usage" client server shared
```

Then confirm:

1. Which duplicate route currently wins by Express mount order.
2. Whether any frontend page uses these exact paths.
3. Whether route tests/docs expect these exact paths.

## Recommended Runtime Change If Local Verification Matches Jack Search

If local `rg` confirms no direct frontend callers:

### Option A — safest go-live change

Keep explicit names and remove conflict:

- Move `billing-api.ts` route from `/reconcile` to `/reconcile/platform-invoices`
- Move `domains/billing.ts` inline reconcile behavior to `/api/billing/reconcile/credits`
- Or create a combined `/api/billing/reconcile` response that returns both:

```ts
{
  platformInvoices: await billingReconciliation.reconcilePlatformInvoices(workspaceId),
  credits: await billingReconciliation.reconcileCredits(workspaceId),
}
```

Jack prefers the combined route if frontend/user-facing meaning is unclear.

### Option B — make `domains/billing.ts` thinner first

Remove or relocate inline `domains/billing.ts` routes if confirmed unused:

- `/api/billing/daily-usage`
- `/api/billing/monthly-usage`
- `/api/billing/reconcile`
- `/api/billing/transactions`
- `/api/billing/org-summary`
- `/api/billing/usage-breakdown`
- `/api/billing/ai-usage`
- `/api/billing/trinity/today`
- `/api/billing/trinity/month/:year/:month`
- `/api/billing/trinity/unbilled`

But do not delete Trinity token usage routes until confirming no dashboard or admin page calls them.

## Why Jack Did Not Write Runtime Code

Current team rule says:

- audit duplicates before touching
- no new files unless missing
- delete/consolidate before extracting
- large route edits require local verification/build

Jack only has GitHub connector access, not local `rg`, build, or test execution. This is exactly the kind of route deletion/rename that Claude or Codex should do locally.

## No Runtime Code Added

This is intentionally a caller-audit/handoff commit only.

## Next Suggested Claude Commit

If local verification matches this audit:

1. Remove conflict in `/api/billing/reconcile`.
2. Remove conflict in `/api/billing/transactions`.
3. Keep `stripeInlineRoutes.ts` untouched.
4. Run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

5. Commit with:

- route conflicts resolved
- no frontend callers found, or frontend caller migrated
- `domains/billing.ts` line count before/after

## Notes

Stay in billing. Do not jump to scheduling/time/invoicing until billing has clear route ownership and enforcement shape.
