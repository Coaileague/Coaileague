# Jack/GPT Handoff — Billing Tiers Registry

Branch: `development`
Date: 2026-04-25

## New Commit

`132626ea1e815231395a31f86e8fdcb1e375e694` — `refactor: add canonical billing tiers registry`

## File Added

`server/services/billing/billingTiersRegistry.ts`

## Why

Bryan flagged a core business risk: premium features/add-ons/events must be charged correctly so CoAIleague does not lose revenue.

Claude's latest handoff offered Option B as the next foundation:

- read tier pricing/config from `shared/billingConfig.ts`
- gate features by tier
- record every token usage event
- fire Trinity warnings at 70/80/95/100% thresholds
- enforce never-throttle actions for payroll, calloffs, scheduling, invoicing

Jack/GPT added the registry as a policy/orchestration layer, not a replacement for existing services.

## Important Existing Code Respected

Existing services already found:

- `server/lib/tiers/tierDefinitions.ts` — canonical tier hierarchy + feature tier minimums
- `server/services/billing/featureGateService.ts` — route-level gates and workspace usage tracking
- `server/services/billing/usageMetering.ts` — AI usage events, daily rollups, billing audit logs, provider cost tracking

The new registry reuses these where possible instead of duplicating them.

## What the registry exports

```ts
billingTiersRegistry
normalizeBillingTier()
getBillingTierConfig()
getBillingTierSnapshot()
evaluateBillingFeatureGate()
evaluateTokenUsagePolicy()
recordBillingTokenUsage()
getTokenWarningThresholds()
getNeverThrottleActions()
isNeverThrottleAction()
getPremiumEventCatalog()
getMonthlyFeatureAddonCatalog()
```

## Behavior

### Tier config

Reads from `BILLING.PLATFORM_TIERS` if present, otherwise falls back to `BILLING.tiers`.

### Feature gates

`evaluateBillingFeatureGate()` checks:

1. `BILLING.featureMatrix` first
2. add-on requirements when matrix value is `'addon'`
3. `server/lib/tiers/tierDefinitions.ts` fallback via `getMinimumTierForFeature()` and `tierMeetsOrExceeds()`

### Token policy

`evaluateTokenUsagePolicy()` checks:

- monthly token limits
- hard token limits
- warning thresholds
- projected usage
- never-throttle exceptions

Default warning thresholds if config constants are absent:

```ts
[70, 80, 95, 100]
```

Default never-throttle actions include payroll, calloffs, scheduling, invoicing, panic, incident, emergency dispatch.

### Usage recording

`recordBillingTokenUsage()`:

1. evaluates token policy
2. refuses non-never-throttle events above hard cap
3. calls `usageMeteringService.recordUsage()` for allowed usage
4. emits `billing_token_threshold_crossed` event through `platformEventBus` when thresholds are crossed

## Build Request For Claude

Please pull latest `development` and run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

Watch for:

- whether `BILLING.PLATFORM_TIERS`, `PREMIUM_EVENTS`, `MONTHLY_FEATURE_ADDONS`, `TOKEN_WARNING_THRESHOLDS`, `NEVER_THROTTLE_ACTIONS` are exported as nested properties or top-level named exports
- whether `UsageEventInput` fields imported from `usageMetering.ts` match `BillingUsageRecordInput`
- whether platform event shape accepts `type: 'billing_token_threshold_crossed'`

## Recommended Claude/local-build wiring

After build is clean, recommended order:

1. Wire `recordBillingTokenUsage()` into the main AI token/gateway path, not scattered call sites.
2. Wire `evaluateBillingFeatureGate()` into `featureGateService.checkTierFeatureAccess()` only after preserving existing bypasses/support behavior.
3. Add support/admin diagnostic route later:

```ts
GET /api/billing/tiers/registry/snapshot
GET /api/billing/tiers/registry/premium-events
```

4. Keep payroll/calloff/scheduling/invoicing never-throttle behavior: allowed to run, usage recorded, billing/review flagged.

## Notes

This commit adds no tables and no route behavior changes yet. It creates the canonical enforcement surface that future billing/token gates should call.
