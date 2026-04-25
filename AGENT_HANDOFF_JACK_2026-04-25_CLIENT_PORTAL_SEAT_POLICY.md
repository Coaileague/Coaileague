# Jack/GPT Handoff — Client Portal Seat Policy

Branch: `development`
Date: 2026-04-25

## New Commit

`00c6f4084c48a1c1b0f3c7e4c4bd89616a15e9e6` — `refactor: add client portal seat policy to billing registry`

## Context

Claude asked Jack/GPT to confirm the Bryan + Claude decision:

- Client Portal is **not** a paid monthly add-on.
- It is included in tier access.
- It should be gated by client portal login/seat count.
- Client portal activity uses the tenant's token allotment if AI is used.
- Revenue is captured through tenant subscription + transaction processing, not per-portal add-on charges.

Jack/GPT agrees with this model.

Reason: charging a flat add-on per client portal would punish enterprise customers with many clients and can become a deal-killer. Seat-count gating creates a natural upgrade path without nickel-and-diming.

## File Updated

`server/services/billing/billingTiersRegistry.ts`

## What Changed

The registry now imports and uses the new shared helpers:

```ts
getClientPortalSeatLimit()
hasClientPortalAccess()
```

Added:

```ts
ClientPortalSeatPolicyContext
ClientPortalSeatPolicyResult
getClientPortalSeatLimitForTier()
tierHasClientPortalAccess()
evaluateClientPortalSeatPolicy()
```

`BillingTierSnapshot` now includes:

```ts
clientPortalSeatLimit
clientPortalIncluded
```

`evaluateBillingFeatureGate()` now treats:

- `client_portal`
- `client_portal_access`

as tier-included seat-limited features, not add-on features.

## Policy Behavior

### Starter / Free / Trial

Denied with required tier:

```ts
requiredTier: 'professional'
```

### Professional

Allowed up to 50 client portal seats.

If projected seats exceed 50:

```ts
requiredTier: 'business'
```

### Business

Allowed up to 200 client portal seats.

If projected seats exceed 200:

```ts
requiredTier: 'enterprise'
```

### Enterprise / Strategic

Unlimited. `seatLimit: null`.

## Build Request For Claude

Please pull latest `development` and run:

```bash
node build.mjs
npx tsc -p tsconfig.json --noEmit
```

Watch for:

- Whether `getClientPortalSeatLimit` / `hasClientPortalAccess` are exported at the top level of `@shared/billingConfig` in this project setup.
- Whether `TierName` accepts `trial` but `CLIENT_PORTAL_SEAT_LIMITS` uses `free_trial`. Jack maps `trial -> free_trial` in the registry helper.
- Whether any existing code expects `BillingTierSnapshot` to contain only the previous fields.

## Recommended Claude/local-build wiring

Do **not** scatter client portal seat checks in individual route handlers.

Recommended route/middleware pattern:

1. Count active client portal users/logins for the workspace.
2. Call:

```ts
evaluateClientPortalSeatPolicy({
  tier: workspaceTier,
  currentClientPortalSeats,
  seatsToAdd: 1,
});
```

3. If denied, return a billing/upgrade response with:

```ts
{
  error: 'CLIENT_PORTAL_SEAT_LIMIT_EXCEEDED',
  requiredTier,
  seatLimit,
  currentClientPortalSeats,
  projectedClientPortalSeats,
  remainingSeats,
}
```

Suggested enforcement point:

- client portal invite/provision route
- not every client portal read route

Reason: existing client users should not suddenly get blocked from reading invoices if a tenant later exceeds cap. Gate new provisioning/invites, then use admin warning flows for overages.

## Notes

This is a billing policy/refactor commit only. It does not add tables or change route behavior yet.

This keeps Bryan's business model intact: client portal is valuable enough to drive tier upgrades, but not priced as a punitive per-client add-on.
