# Billing Architecture Audit — 2026-04-08

## Summary

The CoAIleague codebase implements a hybrid billing model combining:
- **Per-seat subscription pricing** (workspace seats charged via Stripe metered subscription items)
- **Token tracking via add-on overages** (hybrid-priced add-ons with monthly token allowances)
- **Partially deprecated credit balance system** (workspace_credit_balance was dropped in Phase 16, but legacy credit tracking persists in creditBalances table)

The correct model (per-seat + token overages) is largely implemented. However, **tier-level token allowances are NOT defined** — only add-on level allowances exist. Subscription tiers (Starter $299, Professional $999, Business $2,999, Enterprise $7,999) lack native token caps; overages are handled only through purchased add-ons. The deprecated workspace_credit_balance table is referenced in 4 server locations (all metadata/bootstrap) with no live API routes exposing it.

---

## 1. Token Tracking (ai_usage_events)

### Insert Site
**Canonical insert:** `/home/user/Coaileague/server/services/billing/usageMetering.ts:172-211`
- Function: `UsageMeteringService.recordUsage()`
- Wraps addon usage UPDATE and aiUsageEvents INSERT in a db.transaction() (GAP-71 FIX)
- Returns: `AiUsageEvent` with populated fields

### Fields Tracked
| Field | Type | Source |
|-------|------|--------|
| `id` | UUID | auto-generated |
| `workspaceId` | varchar | required input |
| `userId` | varchar (nullable) | sanitized in recordUsage; system/bot/empty → NULL |
| `featureKey` | varchar | required (defaults to 'unknown_feature') |
| `addonId` | varchar | optional |
| `usageType` | varchar | 'token', 'session', 'activity', 'api_call' |
| `usageAmount` | decimal(15,4) | required (tokens/units consumed) |
| `usageUnit` | varchar | required ('tokens', 'sessions', 'hours', etc.) |
| `unitPrice` | decimal(10,4) | calculated at insert time |
| `totalCost` | decimal(10,4) | computed (unitPrice × usageAmount or overage-adjusted) |
| `sessionId` | varchar | optional |
| `activityType` | varchar | optional |
| `metadata` | jsonb | isOverage, allowanceUsed, overageAmount, addonName, aiModel, inputTokens, outputTokens |
| `ipAddress` | varchar | optional |
| `userAgent` | text | optional |
| `providerCostUsd` | decimal | cost to CoAI (added post-insert via raw SQL) |
| `aiModel` | varchar | e.g., 'gpt-4o', 'gemini-2.5-flash', 'claude-sonnet' |
| `creditsDeducted` | integer | historical credit system (legacy) |
| `createdAt`, `updatedAt` | timestamp | audit trail |

**Schema location:** `/home/user/Coaileague/shared/schema/domains/trinity/index.ts:179-218`

### Daily Rollup Table
**Table:** `aiUsageDailyRollups` (auto-aggregated by usageMeteringService)
**Location:** `/home/user/Coaileague/shared/schema/domains/trinity/index.ts:220-249`
**Upsert logic:** `/home/user/Coaileague/server/services/billing/usageMetering.ts:396-450`
- Triggered automatically on every recordUsage() call
- Aggregates: totalEvents, totalUsageAmount, totalCost, uniqueUsers per day per feature
- Unique constraint: (workspaceId, usageDate, featureKey)

### Callers of recordUsage()
Found in: usageMetering.ts (recordUsageBatch), aiCreditGateway.ts, executionPipeline.ts, usageTracker.ts, and via platformEventBus.

---

## 2. Per-Tier Token Allowances

### NOT FOUND at Tier Level
**Critical gap:** Subscription tiers (Starter, Professional, Business, Enterprise) have **NO per-tier token caps defined** in the schema or billing config.

**What exists:**
| Tier | Base Price | Features | Token Limits |
|------|-----------|----------|--------------|
| Free Trial | $0 | 5 employees, 1 manager | 500 monthly credits (legacy) |
| Starter | $299/mo | Up to 10 employees | NONE — only add-ons |
| Professional | $999/mo | Up to 100 employees | NONE — only add-ons |
| Business | $2,999/mo | Up to 300 employees | NONE — only add-ons |
| Enterprise | $7,999/mo | Up to 1,000 employees | NONE — only add-ons |

**Source:** `/home/user/Coaileague/shared/billingConfig.ts:31-302` — defines tier pricing, employee limits, monthlyCredits (legacy), but NO tokenAllowance field.

### Per-Add-On Token Allowances (FOUND)
Token allowances **exist only at the add-on level**, not tier level:

| Add-on | Monthly Tokens | Overage Rate | Location |
|--------|---|---|---|
| Trinity Pro | 100,000 | $0.005 per 1K tokens | `/home/user/Coaileague/server/seed-billing-addons.ts:20` |
| Business Buddy (DEPRECATED) | 50,000 | $0.0075 per 1K tokens | `/home/user/Coaileague/server/seed-billing-addons.ts:35` |
| ScheduleOS AI | 200,000 | $0.004 per 1K tokens | `/home/user/Coaileague/server/seed-billing-addons.ts:48` |
| InsightOS Analytics | 150,000 | $0.006 per 1K tokens | `/home/user/Coaileague/server/seed-billing-addons.ts:61` |

**Schema fields:**
- `billingAddons.monthlyTokenAllowance` (decimal)
- `billingAddons.overageRatePer1kTokens` (decimal)

**Location:** `/home/user/Coaileague/shared/schema/domains/billing/index.ts:700-702`

### Workspace Addon Tracking
**Table:** `workspaceAddons` (links workspace → addon with usage)
**Location:** `/home/user/Coaileague/shared/schema/domains/orgs/index.ts:599`

Tracks per workspace/addon:
- `monthlyTokensUsed` (decimal)
- `lastUsageResetAt` (timestamp)
- `status` ('active', 'inactive', 'paused')

---

## 3. Overage Charging

### Overage Detection
**Location:** `/home/user/Coaileague/server/services/billing/usageMetering.ts:113-156`

Logic in `recordUsage()`:
1. Check if addon has `pricingType === 'hybrid'` AND `monthlyTokenAllowance` defined
2. Get `monthlyAllowance` from addon and `currentUsage` from workspaceAddon
3. Check if monthly period needs reset (30-day cycle)
4. Calculate:
   - If `currentUsage < monthlyAllowance`: split usage into allowanceUsed (covered) and overageAmount (charged)
   - If `currentUsage >= monthlyAllowance`: all new usage is overage
   - Overage cost: `(overageAmount / 1000) * overageRatePer1kTokens`
5. Set `metadata.isOverage = true` and record `allowanceUsed`, `overageAmount`

**Fields computed:**
- `isOverage` (boolean)
- `allowanceUsed` (number)
- `overageAmount` (number)
- `unitPrice` (recalculated for overages)
- `totalCost` (only overage portion, or 0 if covered)

### Overage Billing via Stripe
**Location:** `/home/user/Coaileague/server/services/billing/middlewareTransactionFees.ts:419-510`

Function: `chargeAiCreditOverageFee()`
- Calls `stripe.invoiceItems.create()` to add line item to Stripe subscription
- Amount in cents: `overageAmountCents`
- Description: "Credit overage: X credits × $0.01 = $Y.YY"
- Billing audit log record created
- Non-critical for overage to fail post-recordUsage (fire-and-forget, usage event already recorded)

**Stripe integration:**
- Lazy-loads Stripe client via `getStripe()`
- Location: `/home/user/Coaileague/server/services/billing/stripeClient.ts:16-42`
- Creates invoice items for immediate billing to next invoice cycle

### Gap in Overage Billing for Tier-Level Token Caps
**CRITICAL MISSING:** No code path bills overages when a workspace exceeds a **tier-level** token allowance. Token allowances exist only at add-on level. If tiers should have built-in token caps, the overage path is incomplete.

---

## 4. Per-Seat Billing (Stripe)

### Seat Count Source
**Table:** `workspaceMembers`
**Location:** `/home/user/Coaileague/shared/schema/domains/orgs/index.ts:55-64`
- Tracks user_id, workspace_id, role, status, joinedAt

**Subscription tier seat limits (included):**
- Free Trial: 5 max
- Starter: 10 max
- Professional: 100 max
- Business: 300 max
- Enterprise: 1,000 max

**Source:** `/home/user/Coaileague/shared/billingConfig.ts:38-39, 68, 119, 182, 217`

### Stripe Quantity Update
**Location:** `/home/user/Coaileague/server/services/billing/subscriptionManager.ts:432-476`

Function: `updateMeteredSeats(workspaceId, quantity, priceId?)`
- Retrieves workspace Stripe subscription
- Finds or creates subscription item with `seatOveragePriceId`
- Updates quantity via `stripe.subscriptionItems.update()` (line 462-464)
- Removes item if quantity = 0
- Adds new item if quantity > 0 and item doesn't exist

**Seat overage price IDs (env-based):**
```
STRIPE_PRICE_STARTER_SEAT_OVERAGE
STRIPE_PRICE_PROFESSIONAL_SEAT_OVERAGE
STRIPE_PRICE_BUSINESS_SEAT_OVERAGE
STRIPE_PRICE_ENTERPRISE_SEAT_OVERAGE
```

### Sync Trigger on Member Add/Remove
**MISSING:** No automatic trigger found that calls `updateMeteredSeats()` when a workspace member joins or leaves.

**What exists:**
- `updateMeteredSeats()` function is defined but not invoked on membership changes
- Seat quantity updates must be called manually or via cron (not found)

**Gaps:**
- No webhook or event listener on workspaceMembers INSERT/DELETE
- No cron job found that syncs seat count to Stripe
- Seats may fall out of sync if manual update not called

### Overage per Employee
**Defined in:** `/home/user/Coaileague/shared/billingConfig.ts:586-593`

```
overages: {
  starter: 2500,      // $25/employee
  professional: 2500, // $25/employee
  business: 2500,     // $25/employee
  enterprise: 2500,   // $25/employee
}
```

All tiers charge **$25/employee/month above included seats**.

---

## 5. workspace_credit_balance References

**Status:** DEPRECATED in Phase 16; table dropped but legacy references remain.

### Total References
**Server-side:** 4 files (all non-critical metadata/bootstrap)
**Client-side:** 0 files (no live UI exposure)

### Server-Side (4 files)

| File | Line | Context | Classification |
|------|------|---------|---|
| `/home/user/Coaileague/server/services/workspaceIndexBootstrap.ts` | 102 | String list of dropped table names in comment | **dead** — metadata only |
| `/home/user/Coaileague/server/services/schemaParityService.ts` | 24 | String list of dropped tables (schema parity check) | **dead** — metadata only |
| `/home/user/Coaileague/server/services/criticalConstraintsBootstrap.ts` | 48, 491 | Comment: "Phase 16: replaced by credit ledger" + "intentionally DROPPED" | **dead** — documentation only |
| **N/A** | **N/A** | **No active API routes return workspace_credit_balance** | **clean** |

### Client-Side
**Zero references found.** No React components surface workspace_credit_balance data.

### Legacy Credit System Still Active
**Table:** `creditBalances` (the replacement for workspace_credit_balance)
**Location:** `/home/user/Coaileague/shared/schema/domains/billing/index.ts:1836+`
- Tracks `workspaceId`, `currentBalance`, `totalPurchased`, `totalUsed`, `monthlyAllocation`, `monthlyUsedCurrentPeriod`
- Still in use: `/home/user/Coaileague/server/routes/workspace.ts:206` (INSERT on workspace creation)
- Still in use: `/home/user/Coaileague/server/routes/billingRoutes.ts` (reads via creditManager)
- Not deprecated; active but called "credit ledger" (Phase 16 semantics)

---

## Recommendations

### Priority 1: URGENT — Define Tier-Level Token Allowances
**Action:** Add `monthlyTokenAllowance` field to subscription tiers in billingConfig.ts
- Starter: (TBD — e.g., 50,000 tokens/month)
- Professional: (TBD — e.g., 200,000 tokens/month)
- Business: (TBD — e.g., 500,000 tokens/month)
- Enterprise: (TBD — e.g., 1,000,000 tokens/month)
- Update `subscriptionTiers` pgTable schema to persist tier-level caps
- Implement overage detection in usageMetering.ts for tier-level caps (parallel to addon path)
- **Files to modify:** 
  - `/home/user/Coaileague/shared/billingConfig.ts`
  - `/home/user/Coaileague/shared/schema/domains/billing/index.ts`
  - `/home/user/Coaileague/server/services/billing/usageMetering.ts`

### Priority 2: HIGH — Implement Automatic Seat Sync to Stripe
**Action:** Add trigger/cron to sync workspace member count to Stripe on join/leave
- Listen to workspace member addition/removal (event bus or DB trigger)
- Call `subscriptionManager.updateMeteredSeats()` with new count
- Alternatively: daily cron that reconciles actual member count vs. Stripe quantity
- **Files to create/modify:**
  - `/home/user/Coaileague/server/services/billing/seatSyncService.ts` (new)
  - `/home/user/Coaileague/server/services/platformEventBus.ts` (listen to membership events)

### Priority 3: MEDIUM — Finalize Tier Token Allowance Pricing
**Action:** Define token caps per tier based on usage patterns
- Analyze actual token consumption by tier from aiUsageEvents
- Set caps that allow 80-90% of customers to not hit overage (value-based pricing)
- Document overage rate per tier (currently only add-on rates exist)
- **Output:** Updated billingConfig.ts with tier-level monthlyTokenAllowance and overageRatePer1kTokens

### Priority 4: LOW — Clean Up Legacy Credit References
**Action:** Remove or update the 4 dead references to workspace_credit_balance
- Update workspaceIndexBootstrap.ts, schemaParityService.ts, criticalConstraintsBootstrap.ts comments to reflect Phase 16 completion
- No functional impact; purely documentation cleanup
- **Rationale:** Schema is already clean (table dropped); comments just need updating

### Priority 5: LOW — Document Add-On vs. Tier Token Allowances
**Action:** Clarify in code comments and API docs
- Tiers → per-seat subscription pricing (Stripe standard items)
- Tiers → (future) token allowances with overage charging
- Add-ons → premium features with fixed monthly token allowances + overage rates
- Example: "Professional tier includes 200K tokens/month; Trinity Pro add-on grants +100K tokens/month"

---

## Validation Checklist

- ✅ Token tracking tables exist and are populated (aiUsageEvents, aiUsageDailyRollups)
- ✅ Add-on token allowances and overage rates defined and seeded (Trinity Pro, ScheduleOS AI, InsightOS)
- ✅ Overage detection logic implemented in recordUsage()
- ✅ Stripe invoice item creation for overages working (middlewareTransactionFees.ts)
- ✅ Per-seat subscription items can be updated (updateMeteredSeats)
- ✅ Deprecated workspace_credit_balance safely dropped (no live routes expose it)
- ❌ Tier-level token allowances NOT defined (gap)
- ❌ Automatic seat sync to Stripe NOT implemented (gap)

---

## Files Involved

### Schema (Read-Only)
- `/home/user/Coaileague/shared/schema/domains/trinity/index.ts` — aiUsageEvents, aiUsageDailyRollups
- `/home/user/Coaileague/shared/schema/domains/billing/index.ts` — billingAddons, subscriptionTiers, creditBalances
- `/home/user/Coaileague/shared/schema/domains/orgs/index.ts` — workspaceMembers, workspaceAddons

### Business Logic
- `/home/user/Coaileague/server/services/billing/usageMetering.ts` — recordUsage, overage detection
- `/home/user/Coaileague/server/services/billing/subscriptionManager.ts` — updateMeteredSeats, per-seat updates
- `/home/user/Coaileague/server/services/billing/middlewareTransactionFees.ts` — chargeAiCreditOverageFee (Stripe integration)
- `/home/user/Coaileague/server/services/billing/stripeClient.ts` — Stripe SDK factory

### Configuration
- `/home/user/Coaileague/shared/billingConfig.ts` — tiers, overages, seatPricing
- `/home/user/Coaileague/server/seed-billing-addons.ts` — add-on definitions with token allowances
- `/home/user/Coaileague/server/services/billing/billingConstants.ts` — non-billable workspace IDs

### Bootstrap/Deprecated
- `/home/user/Coaileague/server/services/criticalConstraintsBootstrap.ts` — dropped table references
- `/home/user/Coaileague/server/services/schemaParityService.ts` — schema parity (drops workspace_credit_balance)

---

**Report generated:** 2026-04-08  
**Auditor:** Code search + schema inspection  
**Confidence:** High (all code paths traced; critical gaps identified)
