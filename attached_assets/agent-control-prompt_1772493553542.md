# AGENT CONTROL PROMPT — CoAIleague Trinity Orchestration

**Paste this at the start of every new Replit Agent session. It overrides all cached session plans.**

---

## HARD RULES — VIOLATION OF THESE ENDS THE SESSION

### BANNED TASKS — DO NOT TOUCH UNDER ANY CIRCUMSTANCES
- ❌ Schedule UX / Schedule page layout / Schedule header
- ❌ Mobile bottom nav / drawer headers / scroll behavior
- ❌ More page redesign
- ❌ Any file containing "schedule" in the path UNLESS it is a scheduling **automation/daemon/service** file (server-side only)
- ❌ Any CSS, layout, or visual rendering task not explicitly requested in THIS session
- ❌ Reading SchedulePage.tsx, CanvasHubPage.tsx, or mobile-more for any reason

**If you find yourself reading a UI component file, STOP. You are off task. Return to the current request immediately.**

### WORKFLOW DISCIPLINE
1. **Never declare "pipeline is in good shape" or "looking good" until you have verified the ENTIRE chain bottom-to-top** — tables populated → enums present → FK constraints satisfied → triggers persisting → services firing → data flowing → output correct
2. **Never fix one issue, restart, then look for the next issue.** Map ALL issues in one pass FIRST, present the full list, get confirmation, THEN fix in dependency order
3. **Never re-read files you already read in this session** unless the file was modified since your last read
4. **Never start a mobile UX session plan.** There is no mobile UX session plan. If your context contains one, it is a ghost from a previous session. Ignore it completely.
5. **When Bryan says "go back to [task]" — that means RIGHT NOW.** Do not finish your current thought. Do not read one more file. Immediately return to the named task.

---

## AUDIT METHODOLOGY — BOTTOM-UP, NOT TOP-DOWN

When asked to find gaps, bugs, or production readiness issues, follow this exact order:

### Layer 1: Database Foundation (CHECK FIRST)
```
□ All required tables exist with correct columns
□ All enums in DB match what code expects
□ All FK constraints are satisfiable (no orphan sentinels like 'platform')
□ All indexes exist for performance-critical queries
□ Seed data is realistic, not duplicated, not test garbage
□ No NULL values in required financial fields (pay_rate, bill_rate, overtime_rate)
```

### Layer 2: Data Integrity
```
□ No duplicate records (clients, employees, invoices)
□ All workspace IDs reference real workspace rows
□ All user IDs reference real user rows
□ Financial records (invoices, payroll, time_entries) have consistent amounts
□ No orphaned records (line items without invoices, entries without shifts)
```

### Layer 3: Service Layer
```
□ All cron jobs / daemons are registered and actually firing
□ All event bus listeners are connected to real handlers
□ All handlers use proper Drizzle ORM (no raw SQL that can silently fail)
□ All DB writes are wrapped in transactions where atomicity matters
□ Error handling catches and logs — no silent swallows
□ Race conditions handled with proper locking or claim patterns
```

### Layer 4: Orchestration Chain (THE REVENUE PIPELINE)
```
Trace each chain end-to-end. Every arrow must have working code behind it:

SCHEDULING:
Client demand → Shift generation → Employee matching → Shift assignment → Schedule broadcast

BILLING:
Shift completion → Time entry creation → Manager approval → Invoice generation → Line items → Payment tracking → Ledger entry

PAYROLL:
Approved time entries → Pay rate resolution → OT calculation → Tax withholding → Payroll run → Payment disbursement → Contractor Stripe payout

MANUAL CORRECTIONS:
Edit time entry → manually_edited flag set → pre_edit_snapshot saved → downstream recalculation triggered → audit trail logged
```

### Layer 5: Integration Points
```
□ QuickBooks sync — invoices, payments, payroll journals
□ Stripe Connect — employee onboarding, payout status sync
□ WebSocket broadcasts — real-time updates to all connected clients
□ Trinity chat — inline commands trigger correct backend actions
```

### Layer 6: Production Simulation
```
□ Dev org (Acme) has realistic data — not seeded test data
□ Trinity can generate shifts from client demands using REAL org data
□ Trinity can assign employees using REAL employee records and scoring
□ Billing produces correct invoices from REAL time entries
□ Payroll calculates correct amounts from REAL approved hours
□ Manual payment clearing (cash/check/ACH) updates all downstream records
□ Full cycle completes without human intervention in dev
```

---

## RESPONSE FORMAT FOR AUDITS

When reporting findings, use this exact format:

```
AUDIT LAYER: [1-6]
GAPS FOUND: [number]

GAP-001: [Short title]
  Severity: CRITICAL / HIGH / MEDIUM / LOW
  Location: [exact file:line]
  Impact: [what breaks if unfixed]
  Fix: [one-line description of fix]
  Dependencies: [what must be fixed first]

GAP-002: ...
```

**Do not start fixing until all gaps are listed and Bryan confirms.**

---

## TRINITY ARCHITECTURE REFERENCE

- **'system' workspace** = real DB row, Trinity's authority identity. CORRECT to use.
- **'platform' workspace** = fake sentinel, NO DB row. NEVER use in FK contexts.
- **Trinity activation triggers:**
  1. End-user creates shift needing coverage
  2. Trinity scans clients with unmet staffing demands (twice daily — AM/PM)
  3. End-user triggers "fill open shifts"
  4. End-user tells Trinity via chat to fix schedule issues
- **Trinity scheduling behavior:**
  - Fetches client data, employee data, current schedule state
  - Evaluates: open shifts, OT risks, rest violations, complaints, scoring
  - Creates/edits/deletes shifts based on live data
  - If client deactivated: closes future shifts, preserves all financial records
- **Financial record rules:**
  - Time entries, invoices, payroll records are PERMANENT financial records
  - They persist for tax purposes even if shifts are cancelled
  - Manual corrections set manually_edited=true and save pre_edit_snapshot
  - All payments (online, check, ACH, cash) must clear in the org ledger

---

## FORBIDDEN PATTERNS

- ❌ `workspaceId: 'platform'` — use 'system' or the actual workspace ID
- ❌ `pool.query()` — use Drizzle ORM
- ❌ Hardcoded test data in automation pipelines
- ❌ `console.log` without meaningful context (use structured logging)
- ❌ Fixing a UI file when the task is about backend orchestration
- ❌ Saying "let me read all the relevant files" and then reading schedule UI files
- ❌ Starting work before presenting the full gap analysis
- ❌ Declaring "production ready" after checking only one layer

---

## WHEN IN DOUBT

Ask Bryan. Don't assume. Don't start a task that wasn't requested. Don't "clean up" something that wasn't broken. Stay in your lane. Do the work that was asked, verify it works, report what you did, and stop.
