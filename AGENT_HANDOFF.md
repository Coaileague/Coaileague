# COAILEAGUE REFACTOR — MASTER HANDOFF
# ONE FILE ONLY. Update in place. Never create new handoff files.
# Last updated: 2026-04-27 — Jack/GPT Phase B audit complete

---

## HOW THIS HANDOFF WORKS

**This is a back-and-forth relay between Jack (GPT/Copilot) and Claude.**

- Jack audits on `refactor/service-layer` — flags issues, documents findings, commits AGENT_HANDOFF.md
- Claude pulls Jack's findings, executes fixes on `development`, then syncs back to `refactor/service-layer`
- Neither agent moves to the next phase until the current one is reviewed by both
- **"Go" from Bryan = one turn for whichever agent is up**

**Current turn: CLAUDE ← execute Phase B fixes**

---

## ACTIVE BRANCH
```text
refactor/service-layer  →  synced with development as of f7177cc05
```
Both agents work here. Never push directly to development without a passing boot test.

## DEVELOPMENT (Railway)
```text
origin/development  →  5c7aef271  (STABLE ✅ GREEN)
```

---

## PHASE STATUS

| Phase | Domain | Status | Agent |
|---|---|---|---|
| 1 | Server routes dead code | ✅ Complete ~24,335L | Claude |
| 2 | Server services dead code | ✅ Complete ~22,931L | Claude |
| 3 | Client components dead code | ✅ Complete ~43,663L | Claude |
| 4 | Client contexts/hooks/config | ✅ Complete ~3,352L | Claude |
| 5 | Client pages | ✅ Complete ~1,211L | Claude |
| 6 | Shared/ dead code | ✅ Complete ~1,842L | Claude |
| **Total removed** | | **~97,334L** | |
| A | Auth & Session audit | ✅ Reviewed by Jack | Claude |
| B | Financial flows audit | 🔄 Jack audit complete → Claude executes | Jack → Claude |

---

## PHASE A — JACK REVIEW RESULT

Claude asked Jack to verify:

1. Are there any auth patterns Claude missed in the route files?
2. Is the session destroy on logout correctly clearing all session fields?
3. Any workspace_id scoping issues at the service layer?

### Jack findings

```text
Phase A looks good from connector evidence.
```

Details:

```text
1. Direct req.user.id/email/firstName/lastName patterns:
   GitHub connector search did not surface remaining direct-dot patterns in server/routes.
   Claude's 11 null-deref fixes look complete from connector evidence.

2. Logout/session destroy:
   server/routes/authRoutes.ts has /logout-all that calls authService.logoutAllSessions(userId), clears auth_token, then waits for req.session.destroy() before responding.
   That auxiliary route looks correct.
   Note: canonical /logout is documented as living in server/authRoutes.ts, not this file. Claude should confirm canonical logout has the same destroy/clear-cookie behavior if not already verified.

3. Workspace scoping:
   Route-level mount architecture is confirmed: do not flag unguarded route files before checking server/routes/domains/*.ts and server/routes.ts mount guards.
   Jack did not identify a new Phase A blocker from connector review.
```

Phase A can be treated as reviewed/closed after Claude confirms canonical `/logout` behavior.

---

## PHASE B — JACK AUDIT RESULT

### Scope inspected

```text
server/routes/payrollTimesheetRoutes.ts
server/routes/payStubRoutes.ts
server/routes/financeRoutes.ts
server/routes/financeInlineRoutes.ts
server/routes/payrollRoutes.ts  # comparison/good pattern
server/services/paystubService.ts
server/services/financialLedgerService.ts
server/services/invoiceAdjustmentService.ts
```

### High-level correction to initial scan

The original scan said the four flagged route files were missing `FinancialCalculator`. That is only partly true.

```text
Some routes correctly delegate financial math to services that already use Decimal-backed financialCalculator helpers.
The remaining issue is not always "import FinancialCalculator into the route".
The actual fixes belong where math happens: sometimes route, sometimes service.
```

---

# File-by-file Phase B findings

## 1. server/routes/payrollTimesheetRoutes.ts

### Does it do math?

Yes.

```text
PUT /:id/entries calculates totalHours with raw JS:
entries.reduce((sum, e) => sum + Number(e.hours), 0)
String(Number(e.hours).toFixed(2))
String(totalHours.toFixed(2))
```

### FinancialCalculator status

```text
Missing. This route directly handles hour accumulation and decimal formatting.
```

This is not currency, but payroll hours are still numeric financial-adjacent data that feed payroll. Use Decimal-backed helper or a small hours decimal helper to avoid floating drift.

### Zod validation status

```text
Missing. The route manually validates req.body for create/edit/reject.
```

Replace manual validation with schemas for:

```text
create timesheet: employeeId, periodStart, periodEnd, notes
replace entries: entries[] with date, hours, notes
reject: reason
```

### Transaction status

```text
PUT /:id/entries is GOOD: delete old entries + insert new entries + update totalHours are inside db.transaction().
Create/submit/approve/reject each do one main table update plus audit/notification side effects. Transaction is less critical there, but audit may remain best-effort.
```

### Recommended Claude fix

```text
Add Zod schemas.
Use Decimal-backed hour summing/formatting for entries and totalHours.
Keep existing transaction around replace entries.
```

---

## 2. server/routes/payStubRoutes.ts

### Does it do math?

Route file: minimal math only.

```text
successCount/failCount/results.length for response summary only.
Date range construction for current month.
```

Actual pay calculations are delegated to:

```text
server/services/paystubService.ts
```

### FinancialCalculator status

```text
Route-level FinancialCalculator is not required for core pay math.
paystubService already imports and uses calculateGrossPay, calculateOvertimePay, calculateNetPay, sumFinancialValues, subtractFinancialValues, multiplyFinancialValues, toFinancialString, formatCurrency from ./financialCalculator.
```

Important service finding:

```text
paystubService still has PDF-display-only raw arithmetic:
(data.regularHours * data.regularRate).toFixed(2)
(data.overtimeHours * data.overtimeRate).toFixed(2)
data.deductions.reduce((sum, d) => sum + d.amount, 0)
data.regularHours + data.overtimeHours
```

Core stored pay calculations are Decimal-backed, but PDF/display totals should also use financial helpers for consistency.

### Zod validation status

```text
Missing at route API boundaries.
```

Need schemas for:

```text
GET /api/paystubs/:employeeId/:startDate/:endDate params
GET /api/paystubs/:employeeId/:startDate/:endDate/pdf params
POST /api/paystubs/batch body: startDate, endDate, employeeIds?, sendNotifications?
GET /pay-stubs/:id params
```

Existing `isValidDateString()` is partial/manual and should be replaced or wrapped by Zod.

### Transaction status

```text
Route does not write DB directly except reads/delegation. Batch generation loops through paystubService.generatePaystub().
No immediate route-level transaction fix required unless paystubService persists multiple DB records per paystub in a way that must be atomic.
```

### Recommended Claude fix

```text
Add Zod params/body validation in payStubRoutes.
Replace PDF/display raw arithmetic in paystubService with financialCalculator helpers.
No route-level FinancialCalculator import needed for core logic.
```

---

## 3. server/routes/financeRoutes.ts

### Does it do math?

Route file itself delegates most math to:

```text
financialLedgerService
icalService
```

It parses dates/year/quarter from query directly.

### FinancialCalculator status

```text
Route-level FinancialCalculator is not the main issue.
financialLedgerService is the real math surface.
```

Service finding in `server/services/financialLedgerService.ts`:

```text
Still uses raw JS arithmetic for financial report calculations:
regularHrs * avgRate
overtimeHrs * avgRate * 1.5
regularLabor + overtimeLabor
totalRevenue - totalCOGS
grossProfit - totalExpenses
(grossProfit / totalRevenue) * 100
revenue / hours
totalLaborCost / totalRevenue
parseFloat(l.totalHours) * parseFloat(l.avgRate)
revenue - laborCost
(profit / revenue) * 100
summary.totalOutstanding += outstanding
ficaTotal + futaLiability + sutaLiability
federalIncomeTaxWithheld + employeeSS + employeeMedicare + employerSS + employerMedicare
employeeCount * wageBase, totalGross * rate, totalEmployerObligation / 4
recordPayrollJournalEntries accumulates totals with +=
```

Some AR outstanding subtraction already uses financialCalculator; the rest should be upgraded.

### Zod validation status

```text
financeRoutes imports z but does not use it.
Query/body validation is missing/partial.
```

Need schemas for:

```text
start/end query params used by ledger/report/dashboard endpoints
asOf query param
year/quarter query params
POST /ical/subscribe body: employeeId?, name?
ical token param validation
```

### Transaction status

```text
financeRoutes mainly reads/delegates. No direct multi-table DB writes observed in route except createICalSubscription delegation.
Transaction need depends on createICalSubscription internals, not this route.
```

### Recommended Claude fix

```text
Use Zod query/body/params schemas in financeRoutes.
Move financialLedgerService arithmetic to financialCalculator helpers.
Do not simply import FinancialCalculator into financeRoutes unless doing actual arithmetic there.
```

---

## 4. server/routes/financeInlineRoutes.ts

### Does it do math?

Yes, route does both mutation orchestration and report arithmetic.

Route-level raw arithmetic:

```text
const netProfit = totalRevenue - totalExpenses;
const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : "0.0";
parseFloat(margin)
```

Also passes raw body financial values directly to invoice adjustment services:

```text
amount
discountPercent
refundAmount
newQuantity
newUnitPrice
creditPerInvoice
```

### FinancialCalculator status

```text
Route-level calculator/helper needed for consolidated P&L response, or move that calculation into a service that uses financialCalculator.
```

Invoice adjustment services already use financialCalculator internally for stored adjustment math.

### Zod validation status

```text
Missing. This is the highest-priority validation gap.
```

Need schemas for:

```text
credit: invoiceId, amount, description?
discount: invoiceId, discountPercent, reason
refund: invoiceId, refundAmount, reason
correct-line-item: invoiceId, lineItemIndex, newQuantity?, newUnitPrice?, reason?
bulk-credit: invoiceIds[], creditPerInvoice, reason?
pl/consolidated query: period enum
history params: invoiceId
```

### Transaction status

Route file itself calls services. But service internals reveal transaction gaps:

```text
invoiceAdjustmentService.creditInvoice:
  update invoice
  insert invoiceAdjustments
  writeLedgerEntry best-effort
  platformEventBus publish best-effort
  NOT wrapped in db.transaction

invoiceAdjustmentService.discountInvoice:
  update invoice
  insert invoiceAdjustments
  writeLedgerEntry best-effort
  platformEventBus publish best-effort
  NOT wrapped in db.transaction

invoiceAdjustmentService.refundInvoice:
  Stripe refund first when paymentIntentId exists
  update invoice
  insert invoiceAdjustments
  optional ledger/event side effects
  NOT wrapped in db.transaction for DB writes

invoiceAdjustmentService.correctInvoiceLineItem:
  update invoiceLineItem
  update invoice total
  insert invoiceAdjustments
  NOT wrapped in db.transaction
```

At minimum, the DB mutation pairs/triples should be atomic:

```text
invoice update + adjustment insert
line item update + invoice total update + adjustment insert
```

External Stripe and platform events should remain carefully ordered/outbox/best-effort, but DB state should not become half-written.

### Workspace scoping status

Good route-level IDOR fix is present:

```text
assertInvoiceBelongsToWorkspace(invoiceId, workspaceId)
```

However bulk credit relies on service call with workspaceId + invoiceIds; Claude should verify `bulkCreditInvoices` or caller validates every invoice belongs to workspace before applying credit. Current route does not explicitly loop `assertInvoiceBelongsToWorkspace` for each invoice ID.

### Recommended Claude fix

```text
Add Zod schemas to every mutating route and period query.
Use financialCalculator helpers for consolidated P&L math or delegate to service.
Wrap invoiceAdjustmentService DB mutations in transactions.
For bulk-credit, assert every invoiceId belongs to workspace before processing or enforce inside service.
```

---

# Phase B priority order for Claude

Recommended execution order:

```text
1. financeInlineRoutes + invoiceAdjustmentService
   Highest risk: live invoice money mutation + missing Zod + DB transaction gaps.

2. financeRoutes + financialLedgerService
   Report math uses raw arithmetic in service and route query validation is thin.

3. payrollTimesheetRoutes
   Add Zod + Decimal-backed hour summing. Transaction for entry replacement already good.

4. payStubRoutes + paystubService display arithmetic
   Add Zod route validation. Core math already Decimal-backed in service; clean remaining display/PDF arithmetic.
```

---

## MANDATORY CHECKS FOR PHASE B FIXES

Since Phase B touches financial behavior, run:

```bash
node build.mjs
```

Boot test before pushing to development:

```bash
export DATABASE_URL="postgresql://postgres:MmUbhSxdkRGFLhBGGXGaWQeBceaqNmlj@metro.proxy.rlwy.net:40051/railway"
export SESSION_SECRET="coaileague-dev-test-session-secret-32chars"
node build.mjs && node dist/index.js > /tmp/boot.txt 2>&1 &
sleep 18 && curl -s http://localhost:5000/api/workspace/health
# expected: {"message":"Unauthorized"}
grep -cE "ReferenceError|is not defined|CRITICAL.*Failed" /tmp/boot.txt
# expected: 0
kill %1
```

If Claude changes financial calculations, add/adjust focused tests if any existing test harness exists for:

```text
financialCalculator
financialLedgerService
invoiceAdjustmentService
paystubService
```

---

## NEXT TURN

```text
Claude executes Phase B fixes on development.
Claude syncs development → refactor/service-layer.
Claude updates this file with exact fixes and marks Jack as reviewer for Phase B.
```

---

## THE 6 DELETION FAILURE PATTERNS (permanent)

1. **STATIC IMPORT** — `from './DeletedFile'` still in source
2. **DYNAMIC IMPORT** — `import('./DeletedFile')` in lazy/Suspense
3. **BARREL EXPORT** — `index.ts` still exports a deleted file
4. **BARREL NAMED EXPORT** — file imports `{ X }` from barrel but X was deleted
5. **ORPHANED JSX BODY** — import removed, `<Component />` left in render
6. **ORPHANED JSX PROPS** — opening tag removed, props block left as raw text

---

## BRANCH RULES (permanent)

- Jack audits on `refactor/service-layer`, Claude executes on `development`
- Sync direction: `development` → `refactor/service-layer` after every Claude turn
- Never merge `refactor/service-layer` into `development` (wrong direction)
- Claude runs verify script before every delete commit
- **Neither agent skips to next phase without the other reviewing current phase**

---

## PROCESS RULES

- Read this file at start of every turn
- Update it at end of every turn — current phase status, what was done, what's next
- Never create separate handoff files — one file, updated in place
- After Claude executes: sync development → refactor/service-layer and push
- After Jack audits: push refactor/service-layer with findings in this file
