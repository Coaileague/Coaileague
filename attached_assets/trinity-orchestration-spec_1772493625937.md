# TRINITY AI — FULL ORCHESTRATION SPECIFICATION

## CoAIleague Workforce Management Platform

**Version:** 1.0 — Production Readiness Spec
**Date:** March 2, 2026
**Author:** Bryan Guillen, CEO — CoAIleague / Statewide Protective Services
**Purpose:** This document is the single source of truth for Trinity's orchestration cycle. Any developer, AI agent, or contractor working on this platform MUST follow this spec. If the code contradicts this document, the code is wrong.

---

## CORE PRINCIPLE

Trinity is an **autonomous workforce orchestrator**, not an assistant. She doesn't wait to be told what to do. She proactively monitors, analyzes, decides, and acts. She owns the full revenue cycle from client demand through employee payment. Her intelligence comes from continuous learning of organizational patterns, not hardcoded rules.

**The Revenue Cycle (one continuous loop):**

```
DEMAND → SCHEDULE → WORK → BILL → PAY → LEARN → REPEAT
```

Every feature, every service, every database write exists to serve this cycle. Nothing else matters.

---

## SECTION 1: TRINITY'S ACTIVATION TRIGGERS

Trinity activates in five ways. All five feed into the same orchestration pipeline.

| Trigger | Source | When |
|---------|--------|------|
| **Scheduled Scan** | Cron daemon (twice daily) | AM scan: 05:00–08:00 (Day/1st shifts). PM scan: 13:00–16:00 (Evening/2nd + Overnight/3rd shifts) |
| **Client Demand** | Client settings change or new client onboarded | Immediately when staffing requirements are created or modified |
| **Manual Shift Creation** | End-user creates a shift with no employee assigned | Immediately — Trinity auto-fills using her logic |
| **Fill Open Shifts** | End-user clicks "Fill Open Shifts" or toggles auto-fill | Immediately — Trinity scans all unfilled shifts and places employees |
| **Chat Command** | End-user tells Trinity via chat to fix schedule issues | Immediately — Trinity reads the schedule, identifies issues, fixes them inline while reporting in chat |

**Regardless of trigger, Trinity always executes the same pipeline. There are no separate code paths per trigger.**

---

## SECTION 2: THE SCHEDULING PIPELINE

### Step 2.1 — FETCH (Data Gathering)

Trinity gathers ALL relevant data before making any decisions. She never operates on partial data.

**Client Data (per org):**
- Client name, status (active/inactive), location, geofence coordinates
- Contract rate (billable rate per hour)
- Tax status (taxable or tax-exempt) and state for tax calculation
- Staffing demands: how many guards needed, which days of week, which hours, shift types (Day/Evening/Overnight)
- Assignment preferences: specific employees requested or blacklisted
- Coverage requirements: minimum staffing levels per shift
- Service history: past complaints, incident reports, scoring

**Employee Data (per org):**
- Name, status (active/inactive), employment type (W2 or 1099)
- Pay rate (hourly), overtime rate (1.5x or custom)
- Availability: which days/hours they can work
- Certifications, licenses, training completion
- Performance score (composite of reliability, complaints, punctuality)
- Distance from client sites (calculated from home address to site geofence)
- Current week hours (for OT threshold tracking — 40hr federal, state-specific where applicable)
- Rest compliance: hours since last shift ended (minimum 8hr gap required)
- Complaint history: any complaints from specific clients (affects placement)

**Schedule State:**
- All shifts for current period: open, assigned, draft, published, completed, cancelled
- Which shifts are filled vs unfilled
- Which employees are already scheduled and when
- OT projections: if assigning this employee to this shift would push them over 40hrs
- Conflict detection: double-bookings, rest violations, blacklisted pairings

### Step 2.2 — ANALYZE (Intelligence Layer)

Trinity evaluates the data using these priorities, in order:

1. **Compliance First** — Never violate labor laws. No shift without proper rest gap. No OT without awareness. No minor working restricted hours.
2. **Client Satisfaction** — Meet staffing demands exactly. Honor assignment preferences. Don't send employees with complaint history to that client.
3. **Profit Optimization** — Place employees where (client bill rate - employee pay rate) is maximized. Factor in distance/travel costs mentally.
4. **Employee Fairness** — Distribute hours equitably. Don't overwork reliable employees just because they're available. Rotate assignments.
5. **Pattern Learning** — Apply what Trinity has learned about this org. If every Monday Client X calls off, proactively schedule a backup. If Employee Y always requests shift swaps on Fridays, flag it.

**Conflict Detection (runs during analysis):**
- OT risk: employee projected to exceed 40hrs this week
- Rest violation: less than 8 hours between shift end and next shift start
- Double booking: employee assigned to overlapping shifts
- Blacklist violation: employee assigned to client who filed complaint against them
- Distance concern: employee lives unreasonably far from site
- Certification gap: employee lacks required certification for this site

### Step 2.3 — DELIBERATE (Decision Engine)

Trinity builds the schedule:

1. For each unfilled shift, rank eligible employees by composite score (availability + distance + rate margin + performance + no conflicts)
2. Place highest-scoring employee in each shift
3. Re-evaluate after each placement (because placing Employee A in Shift 1 affects their availability for Shift 2)
4. Flag any shifts that cannot be filled (no eligible employees) — these become coverage alerts
5. Flag any placements that required tradeoffs (e.g., "placed Employee B despite moderate distance because no closer alternative")

**Output of deliberation:**
- A complete draft schedule with all placements
- A list of unfillable shifts with reasons
- A list of warnings/tradeoffs for owner review
- OT projections per employee for the period

### Step 2.4 — PRESENT (Review Gate)

Two modes based on org settings:

**Manual Review (auto-fill toggle OFF):**
- Trinity presents the draft schedule to the org owner/manager
- Shows placements, warnings, unfillable shifts, OT projections
- Owner can approve all, reject specific placements, make manual edits
- Trinity notes all manual overrides for learning

**Auto-Publish (auto-fill toggle ON):**
- Trinity publishes the schedule immediately
- All shifts go live
- Employees are notified via push/WebSocket
- Owner can still review and override after the fact
- Trinity still notes any manual post-publish edits for learning

### Step 2.5 — EXECUTE (Go Live)

When shifts are published:
- Shift status changes from 'draft' → 'scheduled' (or 'assigned' if employee is placed)
- WebSocket broadcast to all connected clients in the org
- Employee mobile devices receive schedule updates
- GPS geofencing activates for clock-in/clock-out validation
- Trinity's monitoring daemon begins watching for no-shows, late arrivals, call-offs

---

## SECTION 3: THE WORK TRACKING PIPELINE

### Step 3.1 — Clock In/Out

- Employee arrives at site → GPS validates they're within geofence → clock-in recorded
- Employee leaves site → GPS validates → clock-out recorded
- Time entry created automatically with: start time, end time, total hours, shift reference, employee, client, pay rate (captured at time of entry), bill rate (captured at time of entry)
- **captured_pay_rate and captured_bill_rate are snapshotted at entry creation** — they don't change if rates are updated later. This protects financial accuracy.

### Step 3.2 — Shift Completion Bridge

When a shift's end time passes:
- ShiftCompletionBridge checks: does a time entry exist for this shift?
- If employee clocked in/out → time entry already exists → mark shift complete
- If employee did NOT clock in → flag as no-show → create coverage alert → notify manager
- Bridge fires `time_entries_approved` event (if auto-approve is on) or creates approval request for manager

### Step 3.3 — Manager Approval (if required)

- Manager reviews time entries for accuracy
- Can approve, reject, or edit
- **If edited**: `manually_edited` flag is set to TRUE, `pre_edit_snapshot` saves the original values
- Approved entries flow to billing and payroll
- Trinity notes all manual edits for pattern learning

---

## SECTION 4: THE BILLING PIPELINE

### Step 4.1 — Invoice Generation

**Trigger:** `time_entries_approved` event fires (either from auto-approve or manager approval)

**Process:**
1. Group approved, unbilled time entries by client
2. For each client:
   a. Sum total hours from approved entries
   b. Multiply hours × client's contract/bill rate = subtotal
   c. Check client tax status:
      - If taxable: calculate state tax based on client's state → add to subtotal
      - If tax-exempt: no tax applied, invoice amount = subtotal
   d. Create invoice record: client, org, period, subtotal, tax, total, status='draft'
   e. Create line items: one per time entry with hours, rate, amount, employee reference
   f. Mark time entries as billed (set `billed_at` timestamp and `invoice_id` FK)

**CRITICAL — Billing Race Condition Protection:**
- Use atomic claim pattern: UPDATE time_entries SET billed_at = NOW() WHERE billed_at IS NULL first
- Only entries successfully claimed get invoiced
- Prevents double-billing if two invoice generation cycles run simultaneously

### Step 4.2 — Invoice Delivery

**Auto-send mechanism (based on org settings):**
- If auto_invoicing_enabled = true: invoice transitions draft → sent automatically
- Client receives invoice via email (or portal notification)
- If auto_invoicing_enabled = false: invoice stays draft for manual review/send

### Step 4.3 — Payment Tracking

Clients pay through one of these methods:
- **Online (Stripe):** webhook marks invoice as paid automatically
- **ACH:** manual or automated confirmation, reference number recorded
- **Check:** manager marks paid manually with check number as reference
- **Cash:** manager marks paid manually with receipt reference
- **Wire:** manager marks paid with wire confirmation number

**When any invoice is marked paid:**
1. Invoice status → 'paid'
2. Payment record created in `payment_records` table with: method, reference number, amount, date
3. Org ledger updated with the payment entry
4. All downstream records sync: the invoice, the time entries, the ledger — all reflect the payment
5. WebSocket broadcast: all connected users see the update in real-time

### Step 4.4 — Ledger Sync

Every financial event writes to the org ledger:
- Invoice created → ledger entry (accounts receivable)
- Payment received → ledger entry (cash received, AR reduced)
- Payroll processed → ledger entry (labor expense)
- All entries categorized for tax reporting
- Ledger is the org's single source of financial truth
- QuickBooks sync pushes ledger entries to QBO for accounting

---

## SECTION 5: THE PAYROLL PIPELINE

### Step 5.1 — Payroll Calculation

**Trigger:** Approved time entries exist that are billed but not yet payrolled

**For each employee with approved entries:**

**W2 Employee:**
1. Sum regular hours (up to 40/week)
2. Sum overtime hours (over 40/week) — rate = base × 1.5 (or custom OT rate)
3. Gross pay = (regular hours × pay rate) + (OT hours × OT rate)
4. Calculate tax withholdings: federal, state, FICA, Medicare (based on employee W4 and state)
5. Net pay = gross - withholdings
6. Create payroll entry: employee, period, gross, deductions, net, status

**1099 Contractor:**
1. Sum ALL hours (no OT distinction for contractors)
2. Gross pay = total hours × contractor rate
3. No tax withholding (contractor handles their own taxes)
4. Net pay = gross pay
5. Create payroll entry: contractor, period, gross, net, status
6. If Stripe Connect is set up: queue payout via Stripe

### Step 5.2 — Payroll Approval Gate

- Payroll processing requires manager/owner approval (not auto-approved by default)
- Trinity creates an approval gate with the payroll summary
- Manager reviews: total amounts, per-employee breakdown, OT costs, any flagged anomalies
- Manager approves → payroll executes
- Manager rejects → entries return to review queue with notes

**CRITICAL — Approval Gate Persistence:**
- Gates MUST persist to the `approval_gates` database table (not just in-memory)
- On server restart, all pending gates are loaded from DB and restored to the in-memory map
- Uses Drizzle ORM `sql` tagged templates — NOT raw `db.execute()` with parameter arrays

### Step 5.3 — Payment Disbursement

**W2 Employees:**
- Payroll run marked complete
- Pay stubs generated
- Integration with payroll provider (or manual distribution)

**1099 Contractors (Stripe Connect):**
- Verify contractor has completed Stripe onboarding (payouts_enabled = true)
- Create Stripe transfer for net amount
- Stripe handles actual bank deposit
- Platform records payout confirmation
- If contractor hasn't completed Stripe onboarding: flag for manual payment

### Step 5.4 — Payroll Ledger Entry

- Payroll completion writes to org ledger: labor expense, tax liability, net disbursement
- All entries marked with payroll run ID for audit trail
- Time entries updated: `payrolled_at` timestamp and `payroll_run_id` FK set
- QuickBooks sync pushes payroll journal entries

---

## SECTION 6: THE LEARNING PIPELINE

Trinity gets smarter every cycle. This is what separates her from a dumb scheduler.

### What Trinity Tracks:
- **Manual corrections:** Every time a human edits something Trinity did, she records what changed and why (if provided). Over time, she adjusts her logic to reduce corrections.
- **Call-off patterns:** Which employees call off frequently? Which days? Which clients? Trinity proactively schedules backups for high-risk slots.
- **Client preferences:** Which employees does Client X prefer? Which ones got complaints? Trinity weights these in future placements.
- **OT patterns:** Is the org consistently running OT? Trinity surfaces this as a hiring recommendation.
- **No-show patterns:** Which shifts/times/clients have highest no-show rates? Trinity flags these for monitoring.
- **Scheduling efficiency:** How many shifts required manual override? Trinity aims to reduce this number each cycle.
- **Financial patterns:** Are certain clients consistently late paying? Are certain employees consistently generating billing anomalies? Trinity flags these.

### Where Learning Data Lives:
- `trinity_org_intel` — per-org pattern memory (persistent across sessions)
- `trinity_reflection_log` — Trinity's self-evaluation after each major action
- `manually_edited` flag on time entries — signals where Trinity or the system got it wrong
- Coverage request history — which shifts needed escalation and why

---

## SECTION 7: MANUAL CORRECTION HANDLING

**This is critical for financial integrity.**

When ANY record in the revenue pipeline is manually edited:

### Time Entry Edit:
1. Set `manually_edited = true`
2. Save `pre_edit_snapshot` (JSON of original values)
3. If the edit changes hours: recalculate billable amount for the associated invoice line item
4. If the edit changes rate: recalculate both invoice line item AND payroll entry
5. Log the edit in audit trail with: who edited, when, what changed, original values
6. Trinity notes the correction pattern for learning

### Invoice Edit:
1. Recalculate totals based on changed line items
2. If invoice was already sent: create a revision or credit memo
3. Update ledger entries to match new amounts
4. Log the edit in audit trail

### Payroll Edit:
1. Recalculate net pay based on changes
2. If payroll was already disbursed: flag for manual reconciliation
3. Update ledger entries to match new amounts
4. Log the edit in audit trail

**Rule: No financial record is ever deleted. Corrections create new records or update existing ones with full audit trail. The original data is always preserved in snapshots.**

---

## SECTION 8: CLIENT DEACTIVATION HANDLING

When a client is deactivated:

1. All FUTURE shifts for that client are cancelled (status → 'cancelled')
2. All PAST shifts remain untouched — they are financial records
3. All existing time entries remain untouched — employees worked those hours
4. All existing invoices remain untouched — those are billable records
5. All existing payroll entries remain untouched — employees must be paid
6. Client's staffing demands are zeroed out so Trinity stops generating new shifts
7. Trinity removes client from active scheduling pool
8. WebSocket broadcast notifies all connected users of the deactivation and shift count affected

**Financial records are PERMANENT. They persist for tax purposes, audits, and legal compliance regardless of client status.**

---

## SECTION 9: DATA DEPENDENCIES MAP

This shows what data each pipeline step READS and WRITES.

```
SCHEDULING:
  Reads:  clients, employees, shifts, time_entries (for hours tracking), org_settings
  Writes: shifts (create/update), coverage_requests, notifications

BILLING:
  Reads:  time_entries (approved + unbilled), clients (rate + tax status), org_settings
  Writes: invoices, invoice_line_items, time_entries (billed_at + invoice_id), ledger_entries

PAYROLL:
  Reads:  time_entries (approved + billed + unpayrolled), employees (rate + type), org_settings
  Writes: payroll_runs, payroll_entries, time_entries (payrolled_at + payroll_run_id), ledger_entries, approval_gates

PAYMENT:
  Reads:  invoices, payment intents (Stripe)
  Writes: invoices (status), payment_records, ledger_entries

LEARNING:
  Reads:  ALL of the above + manual edits + correction patterns
  Writes: trinity_org_intel, trinity_reflection_log
```

---

## SECTION 10: CRITICAL TECHNICAL RULES

1. **Use Drizzle ORM for ALL database operations.** No raw `pool.query()` or `db.execute(string, [params])`. Use `sql` tagged templates from `drizzle-orm` for any raw SQL needs.

2. **The 'system' workspace is Trinity's identity.** It is a real row in the workspaces table. Use it for all Trinity-initiated operations. NEVER use 'platform' as a workspace ID — it has no DB row and causes FK violations.

3. **All financial writes use transactions.** Invoice creation, payroll processing, payment recording — all wrapped in DB transactions for atomicity.

4. **Billing uses atomic claim pattern.** UPDATE billed_at first, then create invoice. Prevents double-billing race conditions.

5. **Approval gates persist to database.** Not just in-memory. On restart, load all pending gates from DB and rebuild in-memory maps.

6. **Notifications go through UNE only.** Universal Notification Engine is the single notification path. Services do NOT also publish through platformEventBus for user-facing alerts. One path, one gate, no duplicates.

7. **Captured rates are immutable.** `captured_pay_rate` and `captured_bill_rate` on time entries are snapshotted at creation and never change. If rates are updated on the employee or client, existing entries are unaffected.

8. **Manual edits always set the flag.** Any human edit to a time entry, invoice, or payroll record sets `manually_edited = true` and saves the pre-edit snapshot.

9. **No hardcoded test data in production pipelines.** Trinity operates on real org data. Dev environment uses realistic simulated data in the Acme sandbox workspace. Seeded test data is for unit tests only.

10. **Every automation trigger and approval gate uses matching parameter names.** The caller's parameter names must exactly match the callee's expected parameter names. No `action` when the function expects `actionId`. No `metadata` when it expects `payload`. Type mismatches cause silent failures.

---

## SECTION 11: PRODUCTION READINESS CHECKLIST

Before any org goes live, verify:

**Database Layer:**
- [ ] All enums in DB match what code expects
- [ ] All FK constraints are satisfiable
- [ ] No NULL values in required financial fields (pay_rate, bill_rate, overtime_rate)
- [ ] No duplicate records (clients, employees)
- [ ] Automation triggers table is populated and persisting
- [ ] Approval gates table is populated and persisting

**Scheduling:**
- [ ] Trinity can fetch client demands from real org data
- [ ] Trinity can fetch employee availability from real org data
- [ ] Trinity generates shifts matching client demands (correct days, hours, staffing levels)
- [ ] Trinity assigns employees using scoring logic (not random)
- [ ] OT detection works (flags employees approaching 40hrs)
- [ ] Rest compliance works (enforces 8hr gap)
- [ ] Conflict detection works (no double-bookings)
- [ ] Draft → Published transition works (manual or auto)
- [ ] Employee notifications fire on schedule publish

**Billing:**
- [ ] Approved time entries generate invoices automatically
- [ ] Invoice amounts = hours × rate + applicable tax
- [ ] Tax-exempt clients get invoices without tax
- [ ] No double-billing (atomic claim pattern verified)
- [ ] Draft invoices transition to sent (auto or manual)
- [ ] Payment recording works for all methods (Stripe, ACH, check, cash)
- [ ] Payments update invoice status, payment_records, and ledger
- [ ] Ledger reflects all billing activity accurately

**Payroll:**
- [ ] W2 employees: correct regular + OT calculation
- [ ] 1099 contractors: straight pay, no withholding
- [ ] Approval gates persist across server restarts
- [ ] Approved gates trigger actual payroll execution
- [ ] Payroll entries created with correct amounts
- [ ] Time entries marked as payrolled after processing
- [ ] Stripe Connect payouts work for 1099 contractors
- [ ] Ledger reflects all payroll activity accurately

**Manual Corrections:**
- [ ] Editing a time entry sets manually_edited flag
- [ ] Pre-edit snapshot is saved
- [ ] Downstream recalculation triggers (billing/payroll)
- [ ] Audit trail captures all changes

**Integration:**
- [ ] QuickBooks sync working (invoices, payments, payroll journals)
- [ ] Stripe Connect webhook handling (account.updated, capability.updated)
- [ ] WebSocket broadcasts working for all state changes
- [ ] Trinity chat commands trigger correct backend actions

---

## SECTION 12: WHAT TRINITY IS NOT

- Trinity is NOT a chatbot. She is an orchestrator who happens to have a chat interface.
- Trinity does NOT create religion... er, processes for their own sake. Every action serves the revenue cycle.
- Trinity does NOT wait to be told what to do. She proactively monitors and acts within her authority.
- Trinity does NOT guess. If she doesn't have data, she asks. If she can't fill a shift, she escalates.
- Trinity does NOT delete financial records. Ever. For any reason. Corrections create audit trails.
- Trinity does NOT operate on hardcoded data. She reads the org's real data every time.

---

**END OF SPECIFICATION**

*This document is the authority. If code contradicts this spec, the code is wrong. Fix the code.*
