# Jack/GPT Handoff — Billing Domain Audit + Consolidation Plan

Branch: `development`
Date: 2026-04-25

## New Commit

This file: `docs: add Jack billing domain audit and consolidation plan`

## Context

Claude's latest go-live plan says payroll is done and billing is now Tier 1 priority.

Bryan directive:

- minimize
- optimize
- straight paths
- no bandaids
- no duplicate operation paths
- no new service files unless genuinely missing
- delete/consolidate before extracting

Immediate Jack task from `AGENT_HANDOFF.md`:

Audit these files before writing code:

- `server/routes/billing-api.ts`
- `server/routes/billingSettingsRoutes.ts`
- `server/routes/domains/billing.ts`
- `server/routes/stripeInlineRoutes.ts`

## Files Reviewed

### 1. `server/routes/billing-api.ts`

Large mixed billing API router.

Observed responsibilities:

- public-ish/subscription pricing:
  - `GET /tiers`
  - `GET /pricing`
- subscription dashboard:
  - `GET /subscription`
  - `GET /current-charges`
  - `GET /platform-invoices`
- reconciliation:
  - `GET /reconcile`
- usage metering:
  - `POST /usage`
  - `GET /usage/summary`
  - `GET /usage/metrics`
  - `POST /usage/estimate`
- credit/token ledger legacy surface:
  - `GET /credits`
  - `GET /credits/balance`
  - `GET /transactions`
  - `POST /credits/purchase` returns 410 retired
  - `GET/POST /credits/auto-recharge`
- platform invoice read path:
  - `GET /invoices`
  - `GET /invoices/:id`
- feature/add-on management:
  - `GET /features/:featureKey`
  - `GET /features`
  - `POST /features/:addonId/toggle`
  - `GET /addons/available`
  - likely additional add-on endpoints below truncation
- Stripe customer/subscription actions may also exist below truncation, but `stripeInlineRoutes.ts` owns the webhook and main Stripe flows.

Existing services already used:

- `usageMeteringService`
- `invoiceService`
- `accountStateService`
- `featureToggleService`
- `tokenManager`
- `featureGateService`
- `billingReconciliation`

Audit conclusion:

`billing-api.ts` should remain the authenticated tenant billing API, but should be thinned. It should not own Stripe webhook/connect/payment provider logic. It should use `billingTiersRegistry` for tier/feature/token policy instead of route-level ad hoc pricing/gating.

### 2. `server/routes/billingSettingsRoutes.ts`

Operational billing settings router.

Observed responsibilities:

- workspace billing/payroll settings:
  - `GET /workspace`
  - `POST /workspace`
  - `PATCH /workspace`
- client billing terms:
  - `GET /clients`
  - `GET /clients/:clientId`
  - `POST /clients/:clientId`
  - `PATCH /clients/:clientId`
  - `DELETE /clients/:clientId`
- payment methods for workspace Stripe customer:
  - `GET /payment-methods`
  - `POST /payment-methods/setup-intent`
  - `POST /payment-methods/set-default/:paymentMethodId`
  - `DELETE /payment-methods/:paymentMethodId`
- seat hard cap:
  - `GET /seat-hard-cap`
  - `PATCH /seat-hard-cap`

Important source-of-truth note already present:

- `workspaces.billingSettingsBlob` is called canonical source for payrollCycle and billing preferences.
- Dedicated workspace columns and `payrollSettings` table are compatibility mirrors.

Audit conclusion:

`billingSettingsRoutes.ts` should **not** be merged into `billing-api.ts` yet. It contains operational tenant/client invoice/payroll settings, not subscription billing API. It can stay separate under `/api/billing-settings` for now, but needs later service extraction and cleanup.

The payment-method routes inside this file are Stripe-customer management and overlap conceptually with `stripeInlineRoutes.ts`; however, they are specifically workspace billing payment methods and require owner controls. Keep them here for now unless Claude/Codex finds identical endpoints in `stripeInlineRoutes.ts`.

### 3. `server/routes/domains/billing.ts`

This is supposed to be a thin domain mount file, but currently contains many inline routes.

Observed responsibilities:

- financial auditor guard and rate limiter mounting
- route mounts:
  - `/api/billing`
  - `/api/billing-settings`
  - `/api/stripe`
  - `/api/usage`
  - `/api/credits`
  - `/api/invoices`
  - `/api/timesheet-invoices`
  - `/api/trinity/revenue`
  - `/api/disputes`
  - finance/quickbooks/budget/reporting mounts
- inline billing usage/reconciliation routes:
  - `GET /api/billing/daily-usage`
  - `GET /api/billing/monthly-usage`
  - `GET /api/billing/reconcile`
  - `GET /api/billing/transactions`
  - `GET /api/billing/org-summary`
  - `GET /api/billing/usage-breakdown`
  - `GET /api/billing/ai-usage`
- inline Trinity token metering routes:
  - `GET /api/billing/trinity/today`
  - `GET /api/billing/trinity/month/:year/:month`
  - `GET /api/billing/trinity/unbilled`

Critical overlap:

- `GET /api/billing/reconcile` exists inline in `domains/billing.ts` and `GET /reconcile` exists in `billing-api.ts` mounted at `/api/billing/reconcile`.
  - `billing-api.ts` calls `billingReconciliation.reconcilePlatformInvoices(workspaceId)`.
  - `domains/billing.ts` calls `billingReconciliation.reconcileCredits(workspaceId)`.
  - Same route path, different behavior. This is a serious duplicate/conflict.

- `GET /api/billing/transactions` exists inline in `domains/billing.ts`, while `billing-api.ts` exposes `GET /transactions` under `/api/billing/transactions` after mount.
  - Same route path, likely conflict.

Audit conclusion:

`domains/billing.ts` should become a pure mount file. Inline routes should move into existing routers or be removed/renamed. The duplicate `/api/billing/reconcile` and `/api/billing/transactions` must be resolved before go-live.

### 4. `server/routes/stripeInlineRoutes.ts`

Stripe router with special webhook/payment middleware concerns.

Observed responsibilities:

- Stripe public/config/status:
  - `GET /config`
  - `GET /connect-status`
  - `GET /fee-schedule`
- Stripe Connect:
  - `POST /connect-account`
  - `POST /onboarding-link`
- client invoice payment:
  - `POST /pay-invoice`
- subscription creation / checkout / billing portal:
  - `POST /create-subscription`
  - `POST /billing-portal`
  - `POST /create-subscription-checkout`
- webhook:
  - `POST /webhook`

Important special behavior:

- Stripe webhook must be mounted before generic `/api` auth middleware.
- Webhook has signature validation and DB-backed dedup via `stripeWebhookService.handleEvent()`.
- Webhook route should remain separate from authenticated billing API.

Audit conclusion:

`stripeInlineRoutes.ts` should stay separate. It should eventually be renamed or split into:

- `stripeWebhookRoutes.ts` for `/webhook`
- `stripeBillingRoutes.ts` or `stripeCustomerRoutes.ts` for authenticated Stripe actions

But do **not** merge this into `billing-api.ts` during this pass because webhook middleware ordering is critical.

## Confirmed Duplicate / Conflict List

### High confidence duplicates

1. `/api/billing/reconcile`

- In `billing-api.ts`: mounted `GET /reconcile` => `reconcilePlatformInvoices()`
- In `domains/billing.ts`: inline `GET /api/billing/reconcile` => `reconcileCredits()`

Same path, different result. One is shadowing or order-dependent.

Recommendation:

- Rename/split into explicit paths:
  - `/api/billing/reconcile/platform-invoices`
  - `/api/billing/reconcile/credits`
- Or keep `/api/billing/reconcile` as a combined summary endpoint that calls both services and returns both sections.
- For backward compatibility, preserve the currently active behavior temporarily and add aliases only after frontend audit.

2. `/api/billing/transactions`

- In `billing-api.ts`: mounted `GET /transactions` => `tokenManager.getUsageHistory()`
- In `domains/billing.ts`: inline `GET /api/billing/transactions` => `billingReconciliation.getRecentTransactions()`

Same path, different result.

Recommendation:

- Rename/split:
  - `/api/billing/usage-transactions`
  - `/api/billing/reconciliation-transactions`
- Or consolidate to one service/result shape if frontend expects one route.

### Medium confidence overlap

3. Usage/AI usage routes

- `billing-api.ts`: `/usage/*`
- `domains/billing.ts`: `/daily-usage`, `/monthly-usage`, `/usage-breakdown`, `/ai-usage`, `/trinity/*`
- `usageRouter` also mounted at `/api/usage` and `/api/credits`

Recommendation:

- Canonical public tenant usage/token path should be `/api/usage/*` via `usageRouter`.
- `/api/billing/*usage*` should become dashboard/read-only aliases or be moved into a dedicated existing usage router.
- Do not keep multiple independent usage logic blocks.

4. Pricing/tier config

- `billing-api.ts`: `/tiers` and `/pricing` query DB subscription tiers and calculate dollars.
- `billingTiersRegistry.ts` now exposes tier snapshot and billing policy helpers.
- `shared/billingConfig.ts` also contains tier/add-on constants.

Recommendation:

- Decide source of truth:
  - DB `subscriptionTiers` for admin-editable runtime pricing, or
  - `shared/billingConfig.ts` for product-defined pricing.
- `billingTiersRegistry` should become the canonical read surface either way.
- Routes should not independently calculate tier display repeatedly.

5. Payment methods vs Stripe routes

- `billingSettingsRoutes.ts`: payment methods/setup intent/default/detach
- `stripeInlineRoutes.ts`: billing portal, checkout, subscription, connect account, invoice payment

Recommendation:

- Keep separated for now:
  - `/api/billing-settings/payment-methods/*` = tenant billing payment methods on file
  - `/api/stripe/*` = Stripe operational actions and webhook
- Later rename `billingSettingsRoutes` payment method section into a Stripe payment method service, but do not merge routes yet.

## Recommended Consolidation Plan

### Phase 1 — No behavior change, remove duplicate route conflicts

Claude/Codex should locally inspect mounted route order and confirm which duplicate path currently wins.

Targets:

- `/api/billing/reconcile`
- `/api/billing/transactions`

Preferred safe change:

1. Leave current active path behavior intact.
2. Add explicit new paths for the shadowed behavior.
3. Mark old duplicate inline route for deletion after frontend audit.

No Jack code commit recommended until frontend/API caller audit confirms active usage.

### Phase 2 — Make `domains/billing.ts` thin

Move or delete inline routes from `domains/billing.ts`.

Keep it responsible only for:

- financial prefix guard middleware
- rate limiter mounting
- route mounting order
- Stripe webhook before generic auth

Inline route destinations:

- daily/monthly usage -> `usageRouter` or existing billing reconciliation route module
- org-summary/usage-breakdown -> existing `orgBillingService` backed router/module
- ai-usage/trinity token usage -> existing `usageRouter` or small existing billing router section, not inline mount file

### Phase 3 — Billing API route thinning

`billing-api.ts` should stay as authenticated `/api/billing` tenant billing API, but route logic should delegate to existing services:

- `billingTiersRegistry`
- `usageMeteringService`
- `tokenManager`
- `featureGateService`
- `featureToggleService`
- `accountStateService`
- `billingReconciliation`
- `invoiceService`

Do not create a new billing service unless an operation has no canonical service.

### Phase 4 — Billing settings cleanup

`billingSettingsRoutes.ts` should remain `/api/billing-settings` for operational settings, but later extract or reuse a settings service for:

- workspace settings read/write
- client billing settings CRUD
- payment method management
- seat hard cap toggle

Important:

- preserve `billingSettingsBlob` as source of truth for billing/payroll preferences
- keep `payrollSettings`/workspace columns as mirrors only until a migration retires them

### Phase 5 — Stripe route split only after duplicate cleanup

Do not touch webhook first.

Later split:

- webhook route remains unauthenticated and early-mounted
- authenticated Stripe actions can be moved to a cleaner service/module

## Immediate Recommended Next Commit For Claude

Preferred next action:

1. Run local route inventory:

```bash
grep -n "app\.get(\"/api/billing" server/routes/domains/billing.ts
grep -n "billingRouter\.get\|billingRouter\.post\|billingRouter\.patch\|billingRouter\.delete" server/routes/billing-api.ts
grep -n "router\.get\|router\.post\|router\.patch\|router\.delete" server/routes/billingSettingsRoutes.ts server/routes/stripeInlineRoutes.ts
```

2. Confirm duplicate winner by mount order for:

- `/api/billing/reconcile`
- `/api/billing/transactions`

3. Commit a route inventory document or update this file with the exact route list.

4. If confirmed safe, remove or rename the shadowed duplicate inline routes in `domains/billing.ts`.

## Jack/GPT Recommendation

Do not write billing code yet.

Reason:

- There are confirmed duplicate paths.
- Need mount-order/frontend caller verification before deleting or renaming.
- New service files would violate the current go-live rule unless a missing canonical operation is proven.

Jack's next contribution should be based on Claude's route inventory output.

## No New Runtime Code Added In This Commit

This is intentionally an audit/consolidation plan only.

## Notes

Stay in billing until route conflicts are resolved. Do not jump to scheduling/time/invoicing until billing has one clear canonical enforcement and route shape.
