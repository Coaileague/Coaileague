# CoAIleague — Money Flow Go-Live Audit & Fix Prompt
## Everything That Can Lose Money, Break Payments, or Corrupt Financial Data

**Date:** March 3, 2026
**Context:** Post-audit v3.0. Credit lifecycle, race conditions, and fee migration verified. This document covers everything the audit DIDN'T test that touches real money.

---

## SEVERITY CLASSIFICATION

| Severity | Meaning | Launch Impact |
|----------|---------|---------------|
| 🔴 **BLOCKER** | Will lose money, corrupt data, or break payments | Cannot launch without fixing |
| 🟡 **HIGH** | Will confuse customers or prevent revenue collection | Fix before first paying customer |
| 🟢 **MEDIUM** | Technical debt that compounds over time | Fix within 30 days of launch |

---

## 🔴 BLOCKER 1: Drizzle Schema ↔ Database Parity

**Problem:** The audit created 6 billing tables via raw SQL (`CREATE TABLE`), but the Drizzle ORM schema file (`shared/schema.ts`) may not define them. This means:
- `db.insert(creditBalances)` will throw "table not found" in TypeScript
- Any Drizzle migration (`drizzle-kit push`) could DROP these tables
- The app compiles but crashes at runtime when billing code executes

**Verify:**
```bash
# Check if these tables exist in Drizzle schema (shared/schema.ts or wherever tables are defined)
grep -l "credit_balances\|financial_processing_fees\|platform_invoices\|usage_caps\|ai_token_usage\|platform_credit_pool" server/db/schema.ts shared/schema.ts
```

**Fix:** For each of the 6 tables, ensure a Drizzle table definition exists that EXACTLY matches the SQL table. The columns, types, defaults, indexes, and constraints must be identical. Do NOT run `drizzle-kit push` until you've verified the schema matches — it could destructively alter tables.

**Tables to verify:**
1. `credit_balances` — has `total_credits` as GENERATED ALWAYS column (Drizzle uses `generatedAlwaysAs`)
2. `financial_processing_fees` — needs index on unbilled fees (`WHERE billed_on_platform_invoice_id IS NULL`)
3. `platform_invoices` — has UNIQUE constraint on `(workspace_id, billing_cycle)`
4. `usage_caps` — has UNIQUE constraint on `(workspace_id, billing_cycle, feature_key)`
5. `ai_token_usage` — tracks per-request token costs
6. `platform_credit_pool` — holds expired credits for refunds/loyalty

Also verify:
- `subscription_tiers` schema has ALL columns from the spec (base_price_cents, per_invoice_fee_cents, per_payroll_fee_cents, per_qb_sync_fee_cents, included_employees, carryover_percentage, per_employee_overage_cents, monthly_credits)
- `org_subscriptions` schema has stripe_subscription_id, stripe_customer_id
- `credit_transactions` schema has sub_org_workspace_id, source_type, triggered_by

**Test:** After schema sync, restart the app and hit every billing endpoint. No "column does not exist" or "relation does not exist" errors should appear.

---

## 🔴 BLOCKER 2: Pricing Page Reads From Frontend Config, Not Database

**Problem:** The pricing/billing UI reads tier prices, features, and credit allocations from a hardcoded frontend config file — NOT from the `subscription_tiers` database table. If you change pricing in the database (which the billing engine uses for calculations), the UI will show stale/wrong prices.

**Why this loses money:** Customer sees $899/mo on pricing page. You update the database to $999/mo. Billing engine charges $999. Customer disputes the charge because the website said $899. You either eat the difference or lose the customer.

**Fix:**
1. Create an API endpoint: `GET /api/billing/tiers` that queries `subscription_tiers` and returns all tiers with pricing
2. Frontend pricing page fetches from this endpoint on load
3. Remove all hardcoded pricing constants from frontend config files
4. Cache the API response for 5 minutes (tiers don't change often)

**Files to update:** Search for any file containing hardcoded dollar amounts ($899, $1,999, $5,500, $9,999) or credit amounts (1000, 3500, 8000, 12000) in the frontend.

```bash
grep -rn "899\|1999\|5500\|9999\|1000.*credit\|3500.*credit\|8000.*credit\|12000.*credit" client/src/ --include="*.ts" --include="*.tsx"
```

**Test:** Change a tier price in the database. Refresh pricing page. New price should appear.

---

## 🔴 BLOCKER 3: Stripe Integration Does Not Exist

**Problem:** The billing spec defines Stripe fields (stripe_subscription_id, stripe_customer_id, stripe_payment_intent_id) on multiple tables, but there is NO Stripe integration code. This means:
- No way to collect subscription payments
- No way to process credit pack purchases
- No way to charge platform invoices
- Platform invoices generate but never get paid

**What needs to be built (in order):**

### 3A: Stripe Account Setup
- Create Stripe account (or verify existing)
- Get API keys (publishable + secret)
- Store secret key in environment variables (STRIPE_SECRET_KEY)
- Install stripe package: `npm install stripe`

### 3B: Customer Creation
When a workspace creates their subscription (or on first billing event):
```
POST /api/billing/setup-payment
→ Creates Stripe Customer
→ Returns Stripe Checkout Session for card setup
→ On success webhook, stores stripe_customer_id on org_subscriptions
```

### 3C: Subscription Billing
Monthly platform bill generation should:
1. Generate the platform_invoice record (already working)
2. Create a Stripe Invoice with line items matching the platform_invoice
3. Stripe auto-charges the card on file
4. Webhook confirms payment → update platform_invoice.status = 'paid', store stripe_payment_intent_id

### 3D: Credit Pack Purchases
```
POST /api/billing/purchase-credits
→ Creates Stripe Checkout Session for one-time payment
→ On success webhook:
   → purchased_credits += pack amount
   → credit_transaction recorded
   → Idempotency: check stripe payment_intent_id hasn't been processed before
```

### 3E: Webhook Handler
```
POST /api/webhooks/stripe
→ Verify webhook signature (STRIPE_WEBHOOK_SECRET)
→ Handle events:
   - checkout.session.completed → credit pack purchase or card setup
   - invoice.paid → subscription payment confirmed
   - invoice.payment_failed → flag account, send notification
   - customer.subscription.deleted → handle cancellation
```

### 3F: Failed Payment Handling (Dunning)
When Stripe reports a failed payment:
1. Update org_subscriptions.status = 'past_due'
2. Send notification to org owner
3. After 7 days: degrade to Tier 1 (free mode)
4. After 30 days: suspend account
5. Never delete data — just restrict access

**CRITICAL:** Until Stripe is wired up, you can launch in "invoice me" mode where you manually send invoices. But the platform cannot auto-collect payments.

**Test:** Create a test customer, add a test card (4242424242424242), process a $1 charge, verify webhook fires, verify platform_invoice updates to 'paid'.

---

## 🔴 BLOCKER 4: Credit Pack Purchase Flow Missing

**Problem:** The spec defines credit packs (e.g., 2,000 credits for $129) and the purchased_credits column exists, but there is NO purchase flow — no UI button, no checkout, no Stripe session, no webhook to add credits.

**The auto-purchase on depletion also doesn't exist.** The spec says: "If Stripe card on file, auto-purchases minimum credit pack." This is a revenue opportunity and a UX feature — when credits hit 0 and the org tries to use AI, the system should prompt to buy more.

**Fix:**
1. Add "Buy Credits" button in the credit dashboard
2. Wire to Stripe Checkout Session (one-time payment)
3. Webhook adds purchased_credits and records credit_transaction
4. Auto-purchase: when credits deplete AND card on file, auto-buy smallest pack with email notification

**Test:** Click buy → Stripe checkout → complete payment → credits appear in balance immediately.

---

## 🔴 BLOCKER 5: Monthly Billing Cron Not Verified End-to-End

**Problem:** The audit tested platform bill generation with SQL queries. It did NOT verify:
- The cron scheduler actually triggers on the correct day (1st of month)
- The cron generates bills for ALL active workspaces (not just Acme)
- The generated bill correctly links ALL unbilled financial_processing_fees
- The linkFeesToBill() function (was hardcoded to return 0, now fixed) actually works with real fee records
- The bill's total_cents actually equals subscription + fees + overage

**Fix:** Run a full end-to-end simulation:
1. Create 3+ financial_processing_fees records for the current billing cycle (some invoice fees, some payroll fees, some QB sync fees)
2. Trigger the monthly bill generation function manually
3. Verify the platform_invoice record has correct line items
4. Verify all fee records now have billed_on_platform_invoice_id set
5. Verify idempotency: trigger again, verify no duplicate bill created

**Test:** After the simulation, the platform_invoice.total_cents should equal:
`subscription_amount_cents + employee_overage_amount_cents + invoice_processing_total_cents + payroll_processing_total_cents + qb_sync_total_cents`

---

## 🟡 HIGH 1: Cap Enforcement Not Tested (Test 7 from Spec)

**Problem:** The usage cap system (200 free shifts/month for Starter, etc.) was never tested. If caps aren't enforced:
- Starter orgs get unlimited scheduling for $899/mo (should cap at 200, then charge credits)
- No upgrade pressure — why pay for Professional if Starter is unlimited?

**Fix:**
1. Verify the usageCapService checks the cap before every schedulable action
2. Run Test 7 from the spec: Schedule 200 shifts (free). Schedule shift 201 → should cost 3 credits.
3. Verify the usage_caps table increments correctly

**Test:** Reset usage_caps for a Starter org. Schedule exactly 200 shifts. Verify 0 credits consumed. Schedule shift 201. Verify 3 credits deducted.

---

## 🟡 HIGH 2: Subscription Tier Assignment for New Orgs

**Problem:** When a new org signs up, what tier do they get? The audit created records manually for Acme. But there's no code path for:
- New org registration → automatically creating org_subscriptions record
- New org → automatically creating credit_balances record
- New org → automatically creating initial usage_caps record
- Default tier assignment (free_trial? starter?)

**Fix:** In the org/workspace creation flow:
1. After workspace is created, automatically insert into org_subscriptions (tier = 'free_trial' or whatever default)
2. Insert into credit_balances with the tier's monthly_credits
3. Insert into usage_caps for the current billing cycle
4. All three inserts should be in a single database transaction

**Test:** Create a new workspace through the normal signup flow. Verify all three records exist with correct defaults.

---

## 🟡 HIGH 3: Graceful Degradation UI Missing

**Problem:** The spec says when credits hit 0, Trinity degrades to Tier 1 (database-only mode). The BACKEND logic was verified, but the FRONTEND doesn't show:
- Red "Credits Depleted" badge
- Warning modal when attempting AI actions
- "Buy Credits" CTA
- Indication of which features are degraded

**Fix:**
1. Query credit_balances on dashboard load
2. If total_credits <= 0, show degradation UI
3. If total_credits < 50 (low threshold), show warning banner
4. Block AI action buttons with "Purchase credits to use this feature" overlay

---

## 🟡 HIGH 4: Credit Usage Dashboard Doesn't Exist

**Problem:** Org owners have no visibility into:
- How many credits they have remaining
- What's consuming credits (breakdown by feature)
- Historical usage trends
- When their credits will likely run out at current burn rate

This is a revenue driver — when owners SEE credits depleting, they're more likely to upgrade or buy packs.

**Fix:** Build a dashboard component that queries:
1. `credit_balances` for current balances (subscription/carryover/purchased breakdown)
2. `credit_transactions` for recent activity (last 30 days)
3. `usage_caps` for current period usage vs limits
4. `financial_processing_fees` for current period fee accumulation

---

## 🟡 HIGH 5: Platform Bill View for Org Owners

**Problem:** Org owners can't see their monthly bills. The platform_invoices table generates bills, but there's no UI to:
- View current/past invoices
- See line item breakdown
- Download PDF invoice
- Make a payment

**Fix:** Build an invoices page at `/billing/invoices` that:
1. Lists all platform_invoices for the org (newest first)
2. Shows status badge (draft/sent/paid/overdue)
3. Click to expand line items
4. "Pay Now" button → Stripe Checkout

---

## 🟢 MEDIUM 1: Production Database Migration

**Problem:** All 6 new tables were created via SQL in the development database. When you deploy to production, those tables won't exist.

**Fix:**
1. Ensure Drizzle schema is updated (Blocker 1)
2. Run `drizzle-kit push` against production database
3. Seed subscription_tiers in production
4. Create org_subscriptions + credit_balances for any existing production workspaces

---

## 🟢 MEDIUM 2: QuickBooks OAuth in Production

**Problem:** QB OAuth tokens expire and need refresh. If the refresh fails silently, QB sync stops working, which means:
- Invoice sync stops → financial_processing_fees stop accumulating → platform bills are wrong
- Payroll data stops syncing

**Verify:** Test the OAuth refresh flow. Intentionally expire a token. Verify the refresh works. Verify there's error handling and notification if refresh fails.

---

## 🟢 MEDIUM 3: AI Token Cost Attribution

**Problem:** The ai_token_usage table exists but may not be wired into the AI orchestrator. Every AI call should record:
- Which model was used
- Input/output token counts
- Cost in cents
- Which workspace triggered it
- Which feature triggered it

This is how you prove your 2,000× token coverage ratios to investors and how you detect runaway AI costs.

---

## 🟢 MEDIUM 4: Multi-State Payroll Calculation Verification

**Problem:** The spec defines different OT rules per state (TX weekly after 40, CA daily after 8 + weekly after 40 + double-time after 12, NY spread-of-hours). If payroll calculates wrong, you're liable.

**Verify:** For each state where you have operations:
1. Create a test employee with edge-case hours
2. Run payroll calculation
3. Verify OT/double-time matches that state's law
4. Pay special attention to CA (most complex)

---

## IMPLEMENTATION ORDER

Execute in this exact order to unblock revenue collection:

```
Week 1 (BLOCKERS):
  Day 1-2: Blocker 1 — Drizzle schema parity (foundation for everything)
  Day 2-3: Blocker 2 — Pricing page from database
  Day 3-5: Blocker 5 — Monthly billing cron end-to-end verification

Week 2 (PAYMENTS):
  Day 1-3: Blocker 3 — Stripe integration (customer, checkout, webhooks)
  Day 3-4: Blocker 4 — Credit pack purchase flow
  Day 5:   High 1 — Cap enforcement test
           High 2 — New org subscription auto-creation

Week 3 (VISIBILITY):
  Day 1-2: High 3 — Graceful degradation UI
  Day 2-3: High 4 — Credit usage dashboard
  Day 3-4: High 5 — Platform bill view
  Day 5:   Medium 1 — Production database migration

Week 4 (HARDENING):
  Medium 2 — QB OAuth verification
  Medium 3 — AI token cost attribution
  Medium 4 — Multi-state payroll verification
  Full end-to-end smoke test with real Stripe test mode
```

---

## REPLIT AGENT INSTRUCTIONS

When implementing these fixes, follow these rules:

1. **Blocker 1 is FIRST** — nothing else works if Drizzle schema doesn't match the database
2. **Never run `drizzle-kit push` without first verifying** the schema matches existing tables
3. **Every Stripe webhook handler MUST be idempotent** — check payment_intent_id before processing
4. **Every financial mutation MUST use database transactions** with SELECT FOR UPDATE
5. **Test with Stripe test mode** — use card 4242424242424242, never real cards in dev
6. **The monthly billing cron must be idempotent** — running it twice in a month produces no duplicate bills
7. **Log every financial event** — credit deductions, fee recordings, bill generations, Stripe events
8. **Never delete financial records** — soft-delete or mark as voided
9. **All money amounts stored as cents (integers)** — never floating point dollars
10. **Do NOT touch Trinity scheduling logic, mobile UX files, or component structure**

---

END OF MONEY FLOW AUDIT v1.0
