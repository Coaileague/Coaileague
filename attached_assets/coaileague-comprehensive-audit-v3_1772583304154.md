# COAILEAGUE COMPREHENSIVE PLATFORM AUDIT v3.0

## FOR REPLIT AGENT — THIS IS A FULL-SYSTEM AUDIT

Read this ENTIRE document before executing ANY code. This audit covers:
- Every new system added in the billing economy overhaul
- Every known past issue to verify it hasn't regressed
- A full Trinity autonomous simulation with real data
- Mother-org / sub-org billing flow verification
- Credit economy lifecycle testing
- Financial processing fee accumulation and platform bill generation
- Every route, path, and pipeline verified for semantic correctness
- Zero tolerance for silent failures

**METHODOLOGY — The 7-Step Process:**
For EVERY system, feature, and pipeline in this audit, follow these 7 steps:

```
STEP 1: DISCOVER   — Read the code. Find the actual implementation. Don't assume.
STEP 2: TRACE      — Follow the data flow from trigger to final write. Map every hop.
STEP 3: VERIFY     — Run the code with real or simulated data. Check the output.
STEP 4: STRESS     — Test edge cases. What happens at zero? At max? Concurrently?
STEP 5: VALIDATE   — Compare results against the spec. Does output match expectation?
STEP 6: DOCUMENT   — Record what you found. Pass, fail, or concern.
STEP 7: FIX        — If broken, fix it. Re-run steps 3-5 to confirm the fix works.
```

**DO NOT** declare "looks good" without evidence.
**DO NOT** skip to the next section until the current one passes.
**DO NOT** touch mobile UX files (T001-T005) — permanently banned.
**DO NOT** overcomplicate any fix. Simple, direct, testable.

---

# ═══════════════════════════════════════════════════
# SECTION 1: NEW BILLING ECONOMY TABLES
# ═══════════════════════════════════════════════════

## 1A: Schema vs Database Parity Check

For EACH of these tables, verify the Drizzle schema (shared/schema.ts) matches the actual Postgres database. Column names, types, constraints, defaults — everything must match.

```
TABLES TO VERIFY:
  subscription_tiers          — Does it exist? All columns present? Seed data loaded?
  org_subscriptions           — Does it exist? FK to workspaces? FK to subscription_tiers?
  credit_balances             — Does it exist? Generated column (total_credits) working?
  credit_transactions         — Does it exist? All indexes created?
  financial_processing_fees   — Does it exist? All indexes? mother_org_workspace_id column?
  platform_invoices           — Does it exist? UNIQUE constraint on (workspace_id, billing_cycle)?
  usage_caps                  — Does it exist? UNIQUE constraint on (workspace_id, billing_cycle)?
  ai_token_usage              — Does it exist? All indexes?
  platform_credit_pool        — Does it exist?
```

For each table, run:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = '<table>'
ORDER BY ordinal_position;
```

Compare against Drizzle schema definition. Report ANY mismatch — wrong type, missing column, wrong default, missing constraint.

**KNOWN PAST ISSUE: Schema-DB desync caused silent failures.** The org_ledger table previously didn't exist in the database even though the Drizzle schema defined it. Ledger writes silently failed for weeks. Check EVERY new table actually exists in the database, not just in the schema file.

## 1B: Subscription Tier Seed Data

Verify all 4 tiers are seeded with EXACT values from the billing spec:

```
free_trial:    $0, 5 emp, 100 credits, 0 processing fees
starter:       $899/mo, 15 emp, 1000 credits, $3.50/invoice, $6.00/emp payroll
professional:  $1999/mo, 50 emp, 3500 credits, $2.50/invoice, $4.50/emp payroll, $1.50/sync
enterprise:    $9999/mo, 0 included emp (all at $15/emp), 12000 base + 10/emp credits,
               $1.75/invoice, $3.50/emp payroll, $1.00/sync
```

Run: `SELECT * FROM subscription_tiers ORDER BY base_price_cents;`
Verify every field matches. Report any discrepancy.

## 1C: Mother-Org / Sub-Org Structure

Verify the workspace table additions:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'workspaces'
AND column_name IN ('parent_workspace_id', 'is_mother_org', 'operating_state');
```

All three columns must exist. `parent_workspace_id` must be a FK to workspaces(id).

---

# ═══════════════════════════════════════════════════
# SECTION 2: CREDIT SERVICE VERIFICATION
# ═══════════════════════════════════════════════════

## 2A: Credit Consumption — Drain Order Test

Create a test workspace with:
- 100 subscription credits
- 50 carryover credits
- 25 purchased credits

Consume 130 credits for a test action. Verify:
- subscription_credits = 0 (drained first, all 100 used)
- carryover_credits = 20 (drained second, 30 of 50 used)
- purchased_credits = 25 (untouched — drain order correct)
- credit_transactions record exists with amount = -130
- balance_after = 45

**If the drain order is wrong (e.g., purchased credits consumed before carryover), this is a critical bug.**

## 2B: Credit Consumption — Race Condition Test

Simulate 10 concurrent credit deductions of 5 credits each against a balance of 40.
Expected result: 8 succeed (consuming 40 credits total), 2 fail (insufficient credits).
If all 10 succeed (consuming 50 from a balance of 40), the SELECT FOR UPDATE lock is broken.

## 2C: Credit Consumption — Idempotency Test

Attempt to consume credits for the same reference_id + feature_key twice.
Expected result: First call succeeds, second call is a no-op (idempotent).
If both succeed, double-charging is possible.

## 2D: Monthly Reset Test

Set up a workspace on Professional tier (3,500 credits/month, 10% carryover = 350 max):
- subscription_credits = 500 (unused from this month)
- carryover_credits = 100 (from last month)
- purchased_credits = 200

Run processMonthlyReset(). Verify:
- NEW subscription_credits = 3,500 (fresh deposit)
- NEW carryover_credits = 350 (min(500+100, 350) = 350, capped at 10%)
- purchased_credits = 200 (UNCHANGED — never expires)
- Expired to platform pool: (500 + 100) - 350 = 250 credits
- platform_credit_pool record exists with amount = 250, type = 'expired_credits_deposit'
- credit_transactions has: 1 expiration_debit (-250), 1 subscription_deposit (+3500), 1 carryover_deposit (+350)
- usage_caps reset to all zeros for the new billing cycle

## 2E: Enterprise Scaling Credits Test

Create an Enterprise workspace with 300 employees.
Verify monthly credits = 12,000 + (300 × 10) = 15,000.
Add 50 more employees. Verify next reset deposits 12,000 + (350 × 10) = 15,500.

## 2F: Graceful Degradation Test

Set a workspace's credits to 0 (all three pools = 0).
Verify:
- Trinity Tier 1 scans still run (DB-only monitoring = free)
- Attempting an AI action (e.g., schedule a shift) returns an error or degrades gracefully
- The UI status badge shows "depleted" / red indicator
- A notification was sent to the org owner about credit depletion
- If org has Stripe card on file, verify the manual override prompt works (warns + auto-buys pack)

---

# ═══════════════════════════════════════════════════
# SECTION 3: FINANCIAL PROCESSING FEES
# ═══════════════════════════════════════════════════

## 3A: Invoice Generation Fee Test

Generate an invoice for a Professional tier org. Verify:
- A `financial_processing_fees` record is created with fee_type = 'invoice_generation'
- amount_cents = 250 (Professional rate = $2.50)
- billing_cycle matches current YYYY-MM
- reference_id points to the invoice
- The fee is NOT consuming credits (old system charged 6 credits — verify this is removed)

## 3B: Payroll Processing Fee Test

Process payroll for 30 employees on a Professional tier. Verify:
- A `financial_processing_fees` record is created with fee_type = 'payroll_processing'
- amount_cents = 13500 (30 × $4.50 = $135.00)
- employee_count = 30
- per_unit_rate_cents = 450

## 3C: QuickBooks Sync Fee Test

Trigger a QB auto-sync on a Professional tier. Verify:
- A `financial_processing_fees` record is created with fee_type = 'quickbooks_sync'
- amount_cents = 150 ($1.50)
- Starter tier should NOT have QB auto-sync available (verify it's blocked)

## 3D: Fee Deduplication Test

Call recordFee() twice with the same reference_id + fee_type + billing_cycle.
Verify only ONE record exists. If two records exist, double-charging on the platform bill.

## 3E: Old Credit Charges Removed

Search the ENTIRE codebase for any remaining credit charges for:
- Invoice generation (was 6 credits) — must be $$ fee now
- Payroll processing (was 2 credits) — must be $$ fee now
- QB sync (was 5 credits) — must be $$ fee now

```bash
grep -rn "invoice.*credit\|payroll.*credit\|quickbooks.*credit\|qb.*credit" server/ --include="*.ts" | grep -v node_modules | grep -v "\.d\.ts"
```

Any result that shows credit charges for invoicing/payroll/QB sync is a bug — these are dollar fees now.

---

# ═══════════════════════════════════════════════════
# SECTION 4: USAGE CAP ENFORCEMENT
# ═══════════════════════════════════════════════════

## 4A: Within-Cap Actions Are Free

Starter tier: cap_ai_scheduled_shifts = 200.
Schedule 200 shifts. Verify:
- All 200 succeed
- Zero credits consumed (all within cap)
- usage_caps.ai_scheduled_shifts_used = 200

## 4B: Over-Cap Actions Cost Credits

Schedule shift #201 on the same Starter org.
Verify:
- Shift is scheduled successfully
- 3 credits consumed from the org's balance
- credit_transactions has a record for this deduction
- usage_caps.ai_scheduled_shifts_used = 201

## 4C: Unavailable Features Blocked

Attempt a contract review on a Starter tier (cap = 0).
Verify:
- Action is blocked with appropriate error message
- Zero credits consumed
- Feature not available message returned to UI

## 4D: Unlimited Caps Work

Enterprise tier: cap_analytics_reports = -1 (unlimited).
Generate 100 analytics reports. Verify:
- All succeed
- Zero credits consumed (unlimited = always free)
- usage_caps correctly tracks the count even though it's unlimited

## 4E: Daily Bot Cap Resets

Set bot_interactions_today to the cap limit. Wait for the next day (or simulate date change). Verify the counter resets to 0.

---

# ═══════════════════════════════════════════════════
# SECTION 5: MOTHER-ORG / SUB-ORG BILLING
# ═══════════════════════════════════════════════════

## 5A: Create Test Mother-Org Structure

Create an Enterprise mother org with 3 sub-orgs:
```
Mother: "National Guard Services" (HQ) — Enterprise tier
  Sub-org: "NGS Texas" — 80 employees, operating_state = 'TX'
  Sub-org: "NGS California" — 60 employees, operating_state = 'CA'
  Sub-org: "NGS Florida" — 50 employees, operating_state = 'FL'
Total: 190 employees
```

Verify:
- Mother org's is_mother_org = true
- Each sub-org's parent_workspace_id points to the mother org
- Credit balance exists ONLY on the mother org (NOT on sub-orgs)
- Credit balance = 12,000 + (190 × 10) = 13,900

## 5B: Sub-Org Credit Consumption Uses Mother Pool

NGS Texas schedules 50 shifts (50 × 3 = 150 credits).
Verify:
- Mother org's credit_balances decreases by 150
- credit_transactions shows workspace_id = mother org, sub_org_workspace_id = NGS Texas
- NGS Texas does NOT have its own credit_balances row

## 5C: Sub-Org Financial Fees Recorded Per Sub-Org

NGS Texas generates 5 invoices. NGS California runs payroll for 60 employees.
Verify:
- Invoice fees: 5 records with workspace_id = NGS Texas, mother_org_workspace_id = mother org
- Payroll fees: 1 record with workspace_id = NGS California, mother_org_workspace_id = mother org
- All fees have the correct billing_cycle

## 5D: Platform Bill Aggregates to Mother Org

Generate the monthly platform bill for the mother org. Verify:
- ONE bill generated (not 4 separate bills)
- subscription_amount_cents = 999900 (base) + (190 × 1500) = 999900 + 285000 = 1284900
- Invoice processing includes fees from ALL sub-orgs
- Payroll processing includes fees from ALL sub-orgs
- QB sync includes fees from ALL sub-orgs
- Total is correct sum of all line items

## 5E: Multi-State Payroll Attribution

NGS Texas payroll uses TX tax rates (0% state income tax).
NGS California payroll uses CA tax rates (progressive 1-13.3%).
Verify different tax calculations per sub-org based on operating_state.

---

# ═══════════════════════════════════════════════════
# SECTION 6: PLATFORM MONTHLY BILL GENERATION
# ═══════════════════════════════════════════════════

## 6A: Bill Generation Cron

Trigger the monthly billing cron for a test Professional org that had this activity:
- 62 employees (50 included + 12 overage at $8/each)
- 18 invoices generated
- 2 payroll runs for 62 employees each
- 22 QB sync events
- Purchased 1 credit pack ($129)
- Financial Intelligence add-on ($199)

Verify the platform_invoice record:
```
subscription_amount_cents:            199900
employee_overage_amount_cents:        9600  (12 × 800)
employee_overage_count:               12
invoice_processing_total_cents:       4500  (18 × 250)
invoice_processing_count:             18
payroll_processing_total_cents:       55800  (2 × 62 × 450)
payroll_processing_runs:              2
payroll_processing_employee_total:    124
qb_sync_total_cents:                  3300  (22 × 150)
qb_sync_count:                        22
credit_pack_purchases_cents:          12900
addon_modules_total_cents:            19900
subtotal_cents:                       305900
total_cents:                          305900  (assuming $0 tax on SaaS)
```

## 6B: Bill Idempotency

Run the billing cron twice for the same workspace + billing_cycle.
Verify only ONE bill exists. The second run must be a no-op.

## 6C: Financial Processing Fees Linked to Bill

After bill generation, verify every financial_processing_fee record for that billing_cycle has billed_on_platform_invoice_id pointing to the bill.

## 6D: Auto-Pay via Stripe

If the org has auto_pay_enabled = true and a stripe_customer_id:
- Verify the bill status transitions to 'paid'
- Verify paid_at timestamp is set
- Verify stripe_payment_intent_id is recorded

If auto_pay is disabled:
- Verify the bill status transitions to 'sent'
- Verify sent_at timestamp is set
- Verify an email notification was sent to the org owner

---

# ═══════════════════════════════════════════════════
# SECTION 7: CLIENT PORTAL & AUDITOR PORTAL
# ═══════════════════════════════════════════════════

## 7A: Client Read Access Is Free

A client user accesses the portal and views: GPS tracking, incident reports, officer profiles, shift schedule, invoices.
Verify ZERO credits consumed for ALL read operations.

## 7B: Client DockChat Costs Org Credits

A client submits a DockChat complaint through the portal.
Verify:
- 10 credits consumed from the ORG's pool (not the client's — they don't have one)
- credit_transactions shows triggered_by = 'client_portal'
- If org has insufficient credits, the action is blocked with appropriate message to client

## 7C: Auditor Portal Access

An auditor accesses compliance dashboard, certification status, audit trails.
Verify ZERO credits consumed.

## 7D: Auditor Compliance Report Costs Org Credits

An auditor requests a SOX compliance report.
Verify 10 credits consumed from the org's pool with triggered_by = 'auditor_portal'.

---

# ═══════════════════════════════════════════════════
# SECTION 8: TRINITY AUTONOMOUS SIMULATION
# (The Main Event — Run This and Watch Her Work)
# ═══════════════════════════════════════════════════

## 8A: Simulation Setup

Use the Acme sandbox workspace. Ensure it has:
- At least 100 active employees (mix of W2 and 1099)
- At least 10 active clients with staffing demands
- A credit_balances row with the tier's monthly credits loaded
- All automation toggles enabled (auto-fill, auto-approve, auto-invoice)
- An org_subscriptions row linked to a tier (use Professional or Enterprise)

## 8B: Run Trinity — Full Autonomous Chain

Trigger Trinity using the setTimeout in-process approach (NOT HTTP endpoint — avoids auth/CSRF):

```
EXPECTED AUTONOMOUS CHAIN:
  1. Trinity scans for open/unfilled shifts
  2. Pre-run conflict scan → resolves any existing double-bookings
  3. Employee scoring and placement → fills shifts
  4. Zero double-bookings after run
  5. ShiftCompletionBridge detects completed shifts → creates time entries
  6. Auto-approve fires → time entries approved
  7. Billing automation → invoices generated from approved time entries
     → financial_processing_fee recorded per invoice (NOT credits)
  8. Invoice auto-send → invoices marked as sent
  9. Ledger entries created (inside same transaction as invoice)
  10. Payroll calculation → payroll entries created
  11. Approval gate created → waiting for manager approval
  12. Credit deductions recorded for each AI action
  13. AI token usage recorded in ai_token_usage table
```

## 8C: Verify Payload Data

After Trinity completes, query and report:

```sql
-- Shifts filled
SELECT COUNT(*) as filled_shifts FROM staged_shifts
WHERE workspace_id = '<acme>' AND assigned_employee_id IS NOT NULL
AND start_time > NOW();

-- Time entries created
SELECT COUNT(*) as time_entries FROM time_entries
WHERE workspace_id = '<acme>' AND created_at > '<run_start>';

-- Invoices generated
SELECT COUNT(*) as invoices, SUM(total_cents) as total_billed
FROM invoices WHERE workspace_id = '<acme>' AND created_at > '<run_start>';

-- Financial processing fees recorded (NOT credits)
SELECT fee_type, COUNT(*) as count, SUM(amount_cents) as total_cents
FROM financial_processing_fees
WHERE workspace_id = '<acme>' AND created_at > '<run_start>'
GROUP BY fee_type;

-- Credit transactions (AI actions only, NOT invoicing/payroll)
SELECT feature_key, COUNT(*) as count, SUM(ABS(amount)) as total_credits
FROM credit_transactions
WHERE workspace_id = '<acme>' AND created_at > '<run_start>'
AND transaction_type = 'action_debit'
GROUP BY feature_key;

-- AI token usage tracking
SELECT provider, model, feature_key, COUNT(*) as calls,
       SUM(input_tokens) as total_input, SUM(output_tokens) as total_output,
       SUM(raw_cost_usd) as total_cost, SUM(credits_charged) as total_credits
FROM ai_token_usage
WHERE workspace_id = '<acme>' AND created_at > '<run_start>'
GROUP BY provider, model, feature_key;

-- Credit balance after run
SELECT * FROM credit_balances WHERE workspace_id = '<acme>';

-- Ledger entries
SELECT entry_type, COUNT(*) as count, SUM(amount_cents) as total
FROM org_ledger WHERE workspace_id = '<acme>' AND created_at > '<run_start>'
GROUP BY entry_type;

-- Approval gates (payroll should be waiting)
SELECT * FROM approval_gates
WHERE workspace_id = '<acme>' AND status = 'pending';
```

Report ALL results. Every query must return data. If any query returns empty/zero, something in the chain failed silently.

## 8D: Verify No Leaks

After the run, verify:
```
ZERO credit deductions for:     invoice_generation, payroll_processing, quickbooks_sync
                                (these are $$ fees now, not credits)

ZERO unattributed AI calls:     Every ai_token_usage row has a workspace_id that is NOT
                                'platform' or 'system' or NULL. Token costs are always
                                attributed to the org that triggered the action.

ZERO orphaned records:          Every invoice has ledger entries. Every payroll run has
                                ledger entries. Every time entry references a shift.
                                Every financial_processing_fee has a valid reference_id.

ZERO double-bookings:           No employee assigned to overlapping shifts.

ZERO $0 invoices:               Every invoice has total_cents > 0.

ZERO NULL rates:                No time entry has NULL captured_pay_rate or captured_bill_rate.
```

---

# ═══════════════════════════════════════════════════
# SECTION 9: RE-VERIFY ALL KNOWN PAST ISSUES
# ═══════════════════════════════════════════════════

These bugs were found and fixed in previous audit sessions. Verify NONE have regressed.

## 9A: "Auto-Fill All" Button Was a Stub

**PAST BUG:** The primary automation button returned fake `{success: true}` without doing anything.
**VERIFY:** Click "Fill Open Shifts" or trigger auto-fill. Confirm it calls the actual autonomous scheduler and fills real shifts. Not a stub.

## 9B: NULL Pay Rates on Financial Records

**PAST BUG:** Employee pay rates were NULL, causing $0 payroll calculations.
**VERIFY:** Query: `SELECT COUNT(*) FROM employees WHERE pay_rate IS NULL AND status = 'active';`
Must return 0. Also check: `SELECT COUNT(*) FROM time_entries WHERE captured_pay_rate IS NULL;`

## 9C: Org Financial Ledger Table Missing

**PAST BUG:** The org_ledger table existed in Drizzle schema but NOT in the actual database. All ledger writes silently failed.
**VERIFY:** `SELECT COUNT(*) FROM org_ledger;` — must return rows, not an error.

## 9D: Payroll Without Approval Gates

**PAST BUG:** Payroll could be processed without manager approval — no gate blocking disbursement.
**VERIFY:** Process a payroll run. Confirm an approval_gate record is created with status = 'pending'. Confirm payroll cannot complete until the gate is approved.

## 9E: Approval Gates Not Persisting Across Restart

**PAST BUG:** Approval gates were in-memory only. Server restart wiped them.
**VERIFY:** Create an approval gate. Restart the server (or simulate). Confirm the gate is still in the approval_gates table and the in-memory map reloads from DB.

## 9F: Sandbox Data in Production Workspace

**PAST BUG:** Dev seed data had contaminated the Statewide production workspace.
**VERIFY:** Query Statewide workspace for any records with `ai_generated = false` or any demo/test data. Must be clean.

## 9G: AI Token Costs Not Attributed to Orgs

**PAST BUG:** AI API calls were absorbed by the platform instead of metered to the workspace that triggered them.
**VERIFY:** Check all AI call sites (Gemini, Claude, OpenAI). Every call must pass workspaceId and record to ai_token_usage. Zero unattributed calls.

## 9H: Double-Booking Race Condition

**PAST BUG:** nearbyShiftMap had a 2-second cache TTL. During rapid assignment, stale cache allowed the same employee to be assigned to overlapping shifts.
**VERIFY:** Run Trinity on 500+ shifts. Confirm zero double-bookings. The triple-layer protection must be active: pre-run scan, belt-and-suspenders DB check, runTracker in-memory.

## 9I: Invoice Tax Calculation Was a Stub

**PAST BUG:** Tax calculation returned 0 for all invoices regardless of client tax status.
**VERIFY:** Generate invoice for taxable client → correct state tax applied. Generate invoice for tax-exempt client → $0 tax.

## 9J: Ledger Write Atomicity

**PAST BUG:** Ledger writes were OUTSIDE the billing/payroll transaction. If ledger failed, orphaned records with no matching ledger entry.
**VERIFY:** Generate an invoice. Confirm the ledger entry was created in the SAME database transaction (same commit). Check: `SELECT COUNT(*) FROM org_ledger WHERE reference_type = 'invoice';` — every invoice must have a matching ledger entry.

## 9K: Invoice Adjustment Cascade (GAP-016)

**PAST BUG:** Editing a time entry after invoicing didn't update the invoice.
**VERIFY:** Create an invoice from time entries. Edit one of the linked time entries (change hours). Confirm: if invoice was draft → voided and regenerated. If invoice was sent → credit adjustment ledger entry created.

## 9L: Seeder Creates Double-Bookings

**PAST BUG:** Dev seed script assigned same employees to overlapping shifts across multiple seed runs.
**VERIFY:** Run the seeder. Query for double-bookings: `SELECT employee_id, COUNT(*) FROM shifts WHERE overlapping... GROUP BY employee_id HAVING COUNT(*) > 1;` — must return zero.

## 9M: 135 Schedule Conflicts / OT Distribution

**PAST BUG:** Trinity stacked 64 hours on one employee (Robert Williams). OT fallback wasn't distributing.
**VERIFY:** After Trinity's fill run, check the top 10 employees by weekly hours. No W2 employee should exceed 60 hours under any circumstance. Hours should be distributed, not front-loaded.

## 9N: Oversize Shifts (>12 hours)

**PAST BUG:** Shifts exceeding 12 hours existed in the database, blocking all employees due to daily hours cap.
**VERIFY:** `SELECT COUNT(*) FROM staged_shifts WHERE EXTRACT(EPOCH FROM (end_time - start_time))/3600 > 12;` — must return 0.

## 9O: Workspace Type Guards

**PAST BUG:** No guards prevented seed/reset operations on production workspaces.
**VERIFY:** Attempt to call the seed endpoint against the Statewide production workspace. Must be blocked. Attempt reset against the platform workspace. Must be blocked.

## 9P: Test Mode Auth Bypass

**PAST BUG:** x-test-key header bypassed authentication in production.
**VERIFY:** In production mode (NODE_ENV=production), attempt to access a protected endpoint with x-test-key. Must be rejected.

## 9Q: Drizzle ORM vs Raw SQL

**PAST BUG:** Some code used raw `db.execute(string, [params])` instead of Drizzle ORM `sql` tagged templates, causing parameter binding errors.
**VERIFY:** Search for `db.execute` with string parameters (not `sql` template):
```bash
grep -rn "db\.execute(" server/ --include="*.ts" | grep -v "sql\`" | grep -v node_modules
```

## 9R: Enum Mismatches

**PAST BUG:** Drizzle schema defined enum values that didn't match the database enum. E.g., code tried 'cancelled' but DB only had 'canceled'.
**VERIFY:** For every pgEnum in shared/schema.ts, compare against DB:
```sql
SELECT typname, enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid ORDER BY typname, enumsortorder;
```

---

# ═══════════════════════════════════════════════════
# SECTION 10: ROUTE & PATH SEMANTIC VERIFICATION
# ═══════════════════════════════════════════════════

## 10A: All Financial Routes Behind RBAC

Every endpoint that touches money (credits, invoices, payroll, platform bills, processing fees) must require manager or owner role.

```bash
# Find all financial route files
grep -rn "router\.\(get\|post\|put\|patch\|delete\)" server/routes/ --include="*.ts" | grep -i "billing\|payroll\|invoice\|credit\|financial\|ledger"
```

For each one, verify `requireAuth` or `requireRole(['owner', 'manager'])` is applied.

## 10B: No Dead Routes

Search for route handlers that reference functions, services, or tables that don't exist:

```bash
# Find all import statements in route files
grep -rn "from.*service\|from.*automation" server/routes/ --include="*.ts" | sort
```

Verify every imported service actually exists and exports the referenced function.

## 10C: Webhook Security

Stripe webhooks must verify the webhook signature. QuickBooks OAuth callbacks must validate state parameters.

```bash
grep -rn "stripe.*webhook\|constructEvent\|webhook.*secret" server/ --include="*.ts"
```

Verify signature verification exists and isn't bypassed.

## 10D: No Hardcoded Pricing

Search the entire codebase for hardcoded dollar amounts or credit costs that should come from the subscription_tiers table:

```bash
grep -rn "899\|1999\|5999\|9999\|credits.*=.*[0-9]" server/ --include="*.ts" | grep -v node_modules | grep -v schema | grep -v seed | grep -v migration
```

Credit costs per action can be hardcoded in a constants file but tier pricing must come from the database.

---

# ═══════════════════════════════════════════════════
# SECTION 11: AI BOT & SUPPORT AGENT CAPABILITIES
# ═══════════════════════════════════════════════════

## 11A: Bot Execution Model

Verify each of the 5 AI bots can:
- Execute autonomously when their trigger conditions are met
- Consume 2 credits per interaction from the org's pool
- Record the interaction in ai_token_usage
- Respect the daily bot interaction cap for the org's tier
- Degrade gracefully when credits are depleted (return helpful message, not error)

## 11B: Support Agent Tools

Verify the CoAI support org has access to:
- Read any workspace's data (for troubleshooting)
- Issue credit refunds from the platform credit pool
- View any org's platform bill
- NOT modify production financial records
- NOT bypass approval gates

## 11C: Trinity Tier 1/2/3 Separation

Verify Trinity correctly operates at 3 intelligence levels:

```
TIER 1 (Free — always active):
  - Database scanning (cron-based monitoring)
  - Pattern detection from historical data
  - Alert generation (no AI reasoning, just threshold checks)
  - VERIFY: Runs when credits = 0

TIER 2 (Credits — basic AI):
  - Employee scoring and ranking
  - Shift placement with optimization
  - Basic scheduling decisions
  - VERIFY: Consumes credits per action

TIER 3 (Credits — deep AI):
  - Contract review and risk analysis
  - Financial forecasting
  - Complex compliance analysis
  - Natural language report generation
  - VERIFY: Consumes higher credits per action
  - VERIFY: Degrades to Tier 2 when credits are very low (1-10%)
```

---

# ═══════════════════════════════════════════════════
# SECTION 12: NOTIFICATION SYSTEM
# ═══════════════════════════════════════════════════

## 12A: Universal Notification Engine (UNE)

Verify all Trinity-generated notifications go through UNE:
- Credit low warning (10-25%) → org owner
- Credit very low (1-10%) → org owner
- Credit depleted (0%) → org owner
- Invoice generated → org owner + client (if auto-send)
- Payroll approval gate created → org owner + authorized managers
- Shift assignment → employee
- Schedule published → all affected employees
- DockChat complaint → org owner/manager
- Staffing gap alert → org owner + managers
- Platform bill generated → org owner

## 12B: No Duplicate Notifications

Trigger the same event twice. Verify only ONE notification is delivered. UNE must deduplicate.

## 12C: Multi-Channel Delivery

Verify notifications are delivered via:
- In-app (WebSocket push)
- Email (Resend)
- SMS (where configured)

Not all notifications need all channels — but credit depletion should hit all available channels.

## 12D: Workspace-Scoped Notifications

A notification for Org A must NEVER appear in Org B's notification feed. Verify strict workspace isolation.

---

# ═══════════════════════════════════════════════════
# SECTION 13: REDUNDANT ORCHESTRATION CHECK
# ═══════════════════════════════════════════════════

## 13A: No Duplicate Event Processing

When Trinity completes a shift, the ShiftCompletionBridge fires. Verify the bridge doesn't fire twice for the same shift. Check for:
- Duplicate time entries for the same shift
- Duplicate invoice line items
- Duplicate ledger entries

## 13B: No Redundant Cron Executions

If the scheduling cron fires while a previous run is still executing, verify:
- The second run detects the lock and skips
- No partial or corrupted state from overlapping runs
- A log entry records "skipped — previous run still active"

## 13C: Event Bus → Service Path Clarity

Verify every event in the platformEventBus has exactly ONE handler. No event should trigger two services that both try to write the same record.

```bash
grep -rn "platformEventBus.on\|eventBus.on\|\.subscribe(" server/ --include="*.ts" | sort
```

For each event listener, trace what it does. Flag any event with multiple listeners that write to the same table.

---

# ═══════════════════════════════════════════════════
# SECTION 14: COMPREHENSIVE SEARCH FOR SILENT FAILURES
# ═══════════════════════════════════════════════════

## 14A: Swallowed Errors

Search for empty catch blocks or catch blocks that only log without re-throwing:

```bash
grep -rn "catch.*{" server/ --include="*.ts" -A 2 | grep -B 1 "console\.\(log\|warn\)\|// ignore\|// silent\|{}"
```

Every catch block in a financial pipeline must either re-throw or return an error. Silent swallowing in billing/payroll/ledger code is a critical bug.

## 14B: Missing Await

Search for fire-and-forget async calls that should be awaited:

```bash
grep -rn "\.then(\|Promise\.\|async.*=>" server/services/ --include="*.ts" | grep -v "await"
```

In financial code, every async database write MUST be awaited. Unawaited writes can fail silently.

## 14C: Null/Undefined Checks

Search for database reads that don't check for null results:

```bash
grep -rn "\.findFirst\|\.findMany\|\.select()" server/services/ --include="*.ts" -A 3 | grep -v "if.*null\|if.*!\|if.*length\|\.length\|??\|?.\|throw"
```

Every database read in a financial pipeline must handle the "not found" case.

## 14D: Transaction Boundary Check

Verify every financial write that spans multiple tables uses a database transaction:

```
Invoice creation:     invoice + line_items + time_entry updates + ledger = ONE transaction
Payroll processing:   payroll_run + payroll_entries + time_entry updates + ledger = ONE transaction
Credit consumption:   credit_balance update + credit_transaction insert = ONE transaction
Platform bill:        platform_invoice + fee linking = ONE transaction
```

If any of these write to multiple tables WITHOUT a transaction wrapper, data integrity is at risk.

---

# ═══════════════════════════════════════════════════
# SECTION 15: FEATURES PAGE & PRICING UI
# ═══════════════════════════════════════════════════

## 15A: Remove Old Pricing References

Search the frontend for any remaining references to:
- "Trinity Thought Stream powered by Claude" → must be removed
- "Premium features use 2× credits" → must be removed
- "6 credits per invoice" → must show $2.50/invoice
- "2 credits per employee processed" → must show $4.50/employee
- "5 credits per sync" → must show $1.50/sync
- Any reference to the old 2,500 / 10,000 / 50,000 credit allocations

```bash
grep -rn "thought.*stream\|2x credits\|2× credits\|credits per invoice\|credits per employee\|credits per sync\|10000.*credit\|50000.*credit\|2500.*credit" client/ --include="*.tsx" --include="*.ts"
```

## 15B: Pricing Page Reads from Database

The pricing page should pull tier pricing from the subscription_tiers table via an API call, NOT from hardcoded frontend values. Verify the API endpoint exists and returns the correct tier data.

## 15C: Credit Dashboard Exists

Verify the credit usage dashboard component exists and shows:
- Current balance (subscription / carryover / purchased)
- Usage vs caps (progress bars)
- Consumption chart
- "Buy Credits" button
- Financial processing fees this month

---

# ═══════════════════════════════════════════════════
# SECTION 16: AUDIT REPORT FORMAT
# ═══════════════════════════════════════════════════

After completing ALL sections, produce a final report in this format:

```
═══════════════════════════════════════════
COAILEAGUE PLATFORM AUDIT v3.0 — RESULTS
Date: [date]
═══════════════════════════════════════════

SECTION 1: Billing Economy Tables
  1A: Schema parity ............ [PASS/FAIL] [details if fail]
  1B: Tier seed data ........... [PASS/FAIL]
  1C: Mother-org structure ..... [PASS/FAIL]

SECTION 2: Credit Service
  2A: Drain order .............. [PASS/FAIL]
  2B: Race condition ........... [PASS/FAIL]
  2C: Idempotency .............. [PASS/FAIL]
  2D: Monthly reset ............ [PASS/FAIL]
  2E: Enterprise scaling ....... [PASS/FAIL]
  2F: Graceful degradation ..... [PASS/FAIL]

[...continue for all sections...]

SECTION 8: Trinity Autonomous Simulation
  8A: Setup .................... [PASS/FAIL]
  8B: Full chain ............... [PASS/FAIL]
  8C: Payload data ............. [report numbers]
  8D: No leaks ................. [PASS/FAIL]

SECTION 9: Past Issue Regression
  9A: Auto-fill stub ........... [PASS/FAIL]
  9B: NULL pay rates ........... [PASS/FAIL]
  [... all 18 past issues ...]

CRITICAL BUGS FOUND: [count]
HIGH PRIORITY ISSUES: [count]
MEDIUM CONCERNS: [count]
INFORMATIONAL NOTES: [count]

[List each bug/issue with fix plan]
```

Fix critical bugs immediately. Report high priority issues for next sprint. Document everything.

---

END OF AUDIT v3.0

Execute sections in order. Do NOT skip ahead. Report results per section. Fix before moving on.
