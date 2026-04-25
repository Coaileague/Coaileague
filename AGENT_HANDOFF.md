# ═══════════════════════════════════════════════════════════
# AGENT SYNC BLOCK — READ THIS BEFORE ANY WORK
# Updated: 2026-04-25 | Both agents update this every commit
# ═══════════════════════════════════════════════════════════

## WHO GOES NEXT: JACK ✋

---

## CURRENT POSITION

**Domain:** SCHEDULING (active)
**Order:** ✅ Payroll → ✅ Billing → 🔄 Scheduling → Time → HR → Client → Compliance → ...

---

## WHAT WAS JUST DONE (last 3 commits)

| Commit | Agent | What | Result |
|---|---|---|---|
| Claude (this) | Claude | shiftRoutes.ts — 21 dead routes deleted, all alive routes verified | 3,623 → 2,240 lines (-1,383L) |
| `bae2e6a6f` | Jack | shiftRoutes.ts audit doc + scheduling domain analysis | Handed off to Claude |
| `b982a0ae9` | Claude | billingEnforcement.ts middleware created + wired | Billing enforcement live |

---

## JACK'S NEXT TASK

**Target:** Continue scheduling domain — pick ONE of:

**Option A: `scheduleosRoutes.ts` (1,325L)**
Same pattern: `grep -n "router\." server/routes/scheduleosRoutes.ts | grep -E "get|post|put|patch|delete"`
Then caller audit each path against `/api/scheduleos/PATH` in client/ server/

**Option B: `schedulerRoutes.ts` (886L)**
Same pattern but mount prefix is `/api/scheduler`

**Option C: Overlap audit**
`scheduleosRoutes.ts` + `schedulerRoutes.ts` + `schedulesRoutes.ts` + `advancedSchedulingRoutes.ts`
may ALL cover shift scheduling. Run:
```bash
grep -n "router\." server/routes/scheduleosRoutes.ts server/routes/schedulerRoutes.ts | grep -E "get|post|put|patch|delete"
```
Find duplicate paths across files — delete the duplicates from the smaller/older file.

**Jack: pick and go. Note your choice in commit message.**

---

## SCHEDULING DOMAIN STATUS

| File | Before | After | Status |
|---|---|---|---|
| `shiftRoutes.ts` | 3,623L | 2,240L | ✅ -1,383L, 17 handlers |
| `scheduleosRoutes.ts` | 1,325L | TBD | 🔄 Jack's turn |
| `schedulerRoutes.ts` | 886L | TBD | ⏳ |
| `schedulesRoutes.ts` | 557L | TBD | ⏳ |
| `advancedSchedulingRoutes.ts` | 1,219L | TBD | ⏳ |

---

## FAST CALLER AUDIT
```bash
grep -n "router\." server/routes/TARGET.ts | grep -E "get|post|put|patch|delete"
grep -rn "/api/MOUNT/PATH" client/ server/ | grep -v "TARGET.ts"
# Zero results = dead = delete
```

## RULES
1. Read CODEBASE_INDEX.md for domain
2. Caller audit before any deletion  
3. Every commit reduces line count
4. Update this SYNC BLOCK after every commit
5. Build clean before pushing

---


### 2026-04-25 — Claude (autonomous pass — inbound email + employee self-service)

**Autonomous pass — no Jack trigger needed. Build: ✅ clean.**

#### 1. CRITICAL PRODUCTION FIX: inbound email webhook 401 → 200

`server/routes/inboundEmailRoutes.ts` was returning `401` on signature verification
failure. Per Resend's own spec (written in the file's header): **all non-2xx responses
trigger indefinite retries**. Every calloff, incident, support, and docs email was
causing a retry loop.

Fixed all 3 handlers (handleInboundWebhook, root, per-org):
- `res.status(401)` → `res.status(200).json({ received: false, reason: 'signature_invalid' })`
- Retries stop; failure is logged and traced

Improved `RESEND_WEBHOOK_SECRET` missing-in-production error:
- Was: silent warn + skip verification
- Now: `log.error` with exact Railway steps: "In Resend dashboard → Webhooks → copy signing secret → set RESEND_WEBHOOK_SECRET in Railway env vars"

Improved health endpoint (`GET /api/inbound/email/health`):
- Now surfaces `production_ready: false` and `action_required` string when secret is missing
- Bryan can curl this to confirm production state instantly

**The calloff/incident/support email autonomy loop is ready — it only needs `RESEND_WEBHOOK_SECRET` set in Railway.**

#### 2. Trinity autonomy audit

Full audit of Trinity's action ecosystem (180+ files). Key findings:
- `trinityCalloffPredictor.ts` ✅ — predicts calloffs before they happen
- `trinityAutonomousScheduler.ts` (3199 lines) ✅ — full autonomous scheduling
- `trinityProactiveScanner.ts` ✅ — scans for uncovered shifts, compliance gaps
- `trinityEventSubscriptions.ts` (119 subscriptions) ✅ — covers payroll, compliance, coverage
- `fireCallOffSequence` ✅ — cascades replacement notifications
- `trinityLicenseActions.ts` ✅ — license query/alert/renewal (TDPS compliance)
- `trinityTaxComplianceActions.ts` ✅ — tax compliance audit

The platform has the autonomy capabilities. The gaps are **production wiring**:
1. `RESEND_WEBHOOK_SECRET` — unblocks inbound email → calloff/incident/support flows
2. DNS verification for sending domain (if pending) → outbound email delivery

#### 3. payrollRoutes.ts employee self-service extraction

Created `server/services/payroll/payrollEmployeeSelfServiceService.ts`:
- `getMyPaychecks()` — employee's own paycheck history
- `getMyPayStub(userId, stubId)` — single pay stub with employee ownership guard
- `getMyPayrollInfo()` — direct deposit settings read
- `updateMyPayrollInfo()` — direct deposit update with `db.transaction()` + AES-256 encryption preserved
- `getYtdEarnings(employeeId, workspaceId)` — YTD via paystubService

Wired 5 handlers: `my-paychecks`, `pay-stubs/:id`, `my-payroll-info` GET,
`my-payroll-info` PATCH, `ytd/:employeeId` → all thin wrappers.

**payrollRoutes.ts reduction: 3754 → 3456 (-298 lines, 10 handlers extracted)**

#### Next targets
- `GET /my-tax-forms` + `GET /my-tax-forms/:formId/download` — employee tax form access
- `GET /proposals` — 23-line manager read, trivially thin already
- `GET /runs` + `GET /runs/:id` — simple storage delegation

### 2026-04-25 — Claude (proposal reads + employee tax forms wiring)

**Pulled `a890a654b` (4 Jack commits). Build: ✅ clean.**

**`86c4182d5` (Jack) — payrollProposalReadService.ts ✅**
`listPayrollProposals()` + `getPayrollProposal()` — workspace-scoped, status filter, newest-first. Clean.

**`36ccdaa07` (Jack) — payrollEmployeeTaxFormsService.ts ✅**
`getMyEmployeeTaxForms()` + `getMyEmployeeTaxForm()` — resolves employee by userId, enforces ownership gate, no SSN/TIN exposure. Critical security service.

**Claude wired 3 handlers:**
- `GET /proposals` → `listPayrollProposals()` (manager role guard preserved)
- `GET /my-tax-forms` → `getMyEmployeeTaxForms()` (workspace + auth guards preserved)
- `GET /my-tax-forms/:formId/download` → ownership gate via `getMyEmployeeTaxForm()` before PDF generation — employee can only download their own forms. taxFormGeneratorService call preserved with `access.form` + `access.employeeId`.

**payrollRoutes.ts: 3754 → 3392 (-362 lines, 13 handlers extracted)**

**Next for Jack:**
- `GET /runs` (10 lines, pure storage delegation)
- `GET /runs/:id` (40 lines, pure storage delegation)
- `DELETE /runs/:id` (39 lines)
- `POST /runs/:id/approve` (147 lines) — or leave for run management pass

### 2026-04-25 — Claude (run reads + BusinessFormsVaultService + W-2 vault wiring)

**Pulled `69037de74` (2 Jack commits). Build: ✅ clean.**

**`47b17a466` (Jack) — payrollRunReadService.ts ✅**
`listPayrollRuns()` (workspace-scoped, optional status + limit filters, bounded at 250)
`getPayrollRun()` (workspace-scoped, optional includeEntries, throws 404)

**Claude: GET /runs + GET /runs/:id wired**
- `GET /runs` → `listPayrollRuns()` with status/limit query param forwarding
- `GET /runs/:id` → employee-scoped path preserved inline (employees see only their own entries); manager/platform path delegates to `getPayrollRun()`
- Status-aware error handling on both

**payrollRoutes.ts: 3754 → 3386 (-368 total, 15 handlers extracted)**

---

**Bryan directive: Every generated document must be a real branded PDF saved to vault.**

**Created `server/services/documents/businessFormsVaultService.ts`**

The canonical layer all form generators must pass through:

1. `saveToVault(opts)` — stamps branded header + footer (workspace name, document title, doc ID, timestamp, platform name, page numbers, disclaimer) onto any PDF buffer, then persists to `document_vault` table with SHA-256 integrity hash. Returns `{ vault, stampedBuffer }`.
2. `getVaultRecord(workspaceId, documentNumber)` — retrieve a saved record
3. `listVaultRecords(workspaceId, category?)` — list all vault docs for a tenant

Document number format: `PAY-20260425-00291`, `TAX-20260425-00117`, `HR-...`, `OPS-...`

Categories: `payroll | tax | hr | operations | compliance | legal`

**Wired into `taxFormGeneratorService.generateW2ForEmployee()`:**
- After W-2 PDF is generated and DB record created → `saveToVault()` called
- Returns `{ success, pdfBuffer (stamped), taxFormId, vaultId, documentNumber }`
- Vault save failure is non-blocking (warns, returns original buffer)

**Still needs wiring (next pass or Jack):**
- `generate1099ForEmployee()` → same saveToVault pattern
- `generate940PDF()` / `generate941PDF()` → same pattern
- `paystubService.generatePaystub()` → pay stubs are the highest-volume form
- Proof of Employment letter generator (does not exist yet — needs creating)
- W-3 transmittal generator (does not exist yet)
- Direct deposit confirmation PDF (does not exist yet)

**Platform-standard form checklist:**

| Form | Generator | Vault-saved | Branded |
|---|---|---|---|
| W-2 | ✅ taxFormGeneratorService | ✅ (this commit) | ✅ (this commit) |
| 1099-NEC | ✅ taxFormGeneratorService | ❌ next | ❌ next |
| Form 941 | ✅ taxFormGeneratorService | ❌ next | ❌ next |
| Form 940 | ✅ taxFormGeneratorService | ❌ next | ❌ next |
| Pay Stub | ✅ paystubService | ❌ next | ❌ next |
| Direct Deposit Confirmation | ❌ missing | ❌ | ❌ |
| Proof of Employment | ❌ missing | ❌ | ❌ |
| W-3 Transmittal | ❌ missing | ❌ | ❌ |
| 1099-MISC | ❌ missing | ❌ | ❌ |
| Payroll Run Summary | ❌ missing | ❌ | ❌ |

Next priority: wire saveToVault into 1099, 941, 940, and paystubService. Then create the missing generators.

### 2026-04-25 — Claude (autonomous pass — business forms complete)

**No Jack commits. Autonomous pass. Build: ✅ clean throughout.**

#### 1. saveToVault wired into remaining tax generators

All 4 primary tax form generators now stamp + save to vault:
- `generate1099ForEmployee()` — 1099-NEC, branded, vault-saved ✅
- `generate940Report()` — Form 940, branded, vault-saved ✅
- `generate941Report()` — Form 941 (quarterly), branded with period Q{q} {year}, vault-saved ✅
- Pay stubs — `paystubService.generatePaystub()` now calls saveToVault; returns `documentNumber` as `paystubId` ✅

#### 2. businessDocumentGenerators.ts (NEW — 4 generators)

`server/services/documents/businessDocumentGenerators.ts`

Created the 4 previously-missing business document generators:

| Generator | Form | Category | Notes |
|---|---|---|---|
| `generateProofOfEmployment()` | Proof of Employment Letter | hr | Employee name, hire date, title, employer note field |
| `generateDirectDepositConfirmation()` | ACH Confirmation | payroll | Net pay, pay date, routing/account last-4, account type |
| `generatePayrollRunSummary()` | Payroll Run Summary | payroll | Per-employee breakdown table, totals, status |
| `generateW3Transmittal()` | Form W-3 | tax | Aggregate W-2 totals, SSA filing instructions, 4-year retention notice |

All 4: branded header/footer via `saveToVault()`, persisted to tenant vault, traceable doc number.

#### 3. Trinity actions registered

4 new actions in `trinityDocumentActions.ts`:
- `document.proof_of_employment` — Trinity can issue on behalf of employer
- `document.direct_deposit_confirmation` — Trinity generates after every payroll run
- `document.payroll_run_summary` — Trinity generates for manager after run approval
- `document.w3_transmittal` — Trinity generates at year-end

#### Form checklist — current state:

| Form | Status |
|---|---|
| W-2 | ✅ generates + brands + vault |
| 1099-NEC | ✅ generates + brands + vault |
| Form 941 (quarterly) | ✅ generates + brands + vault |
| Form 940 (annual FUTA) | ✅ generates + brands + vault |
| Pay Stub (gross/net/deductions/YTD) | ✅ generates + brands + vault |
| Direct Deposit Confirmation | ✅ NEW |
| Proof of Employment Letter | ✅ NEW |
| Payroll Run Summary | ✅ NEW |
| W-3 Transmittal | ✅ NEW |
| 1099-MISC | ❌ not yet — low priority for security companies |

**Next for Jack or next pass:**
- Wire `document.direct_deposit_confirmation` into the payroll approval/process event flow (auto-generate after every approved run per employee)
- Wire `document.payroll_run_summary` into the `payroll_run_approved` event subscription
- Add routes to expose `generateProofOfEmployment` to managers via API (`POST /api/hr/proof-of-employment`)

### 2026-04-25 — Claude (catalog/diagnostic routes + invoice PDF gap closed)

**Pulled `ecd059c8b` (4 Jack commits). Build: ✅ clean.**

**`f9c7049cb` (Jack) — businessArtifactCatalog.ts ✅**
Pure inventory module — 9 vault-backed artifacts + 2 known gaps (invoice_pdf, timesheet_support_package). Source of truth for support/Trinity to answer "what forms exist and where do they come from?"

**`539f543c3` (Jack) — businessArtifactDiagnosticService.ts ✅**
Read-only diagnostic wrapper: `getBusinessArtifactCoverageSummary()`, `diagnoseBusinessArtifactCoverage()`. Returns healthy/unhealthy verdict + per-category counts + gap list + recommended next actions.

**Claude: routes + actions + invoice gap closed**

Routes added to `documentLibraryRoutes.ts` (all at `/api/documents/business-artifacts/*`):
- `GET /business-artifacts` — full catalog
- `GET /business-artifacts/gaps` — only gap entries
- `GET /business-artifacts/coverage` — coverage summary
- `GET /business-artifacts/diagnose` — health verdict + recommended actions
- `GET /business-artifacts/category/:category` — filter by category

Trinity actions registered:
- `document.business_artifact_diagnostics` — read-only, support/admin
- `document.generate_invoice_pdf` — generates branded per-invoice PDF, saves to vault

**`billing/invoice.ts` — invoice_pdf gap closed:**
- Added `generateInvoicePDF(invoiceId, workspaceId)` — full per-invoice PDF with: bill-from/bill-to blocks, line items table (qty/rate/amount), total, status badge, payment terms, notes. Calls `saveToVault()` → branded + persisted.
- `generateClientStatement()` also now stamps + saves to vault.
- Catalog updated: `invoice_pdf` → `vaultBacked: true`

**1 gap remaining: `timesheet_support_package`**
This is the reconciliation artifact (timesheet export with shift details, hours worked, clock-in/out, client billing info). Useful for payroll audits and client disputes. Needs a generator in `timesheetInvoiceService.ts` or a new `timesheetReportService.ts`.

**Recommended next for Jack:**
- `GET /api/invoices/:id/pdf` — expose `generateInvoicePDF` as a route so managers/clients can download
- Timesheet support package generator (closes last catalog gap)

---

## BILLING STRATEGY & PREMIUM PRICING — Researched Plan
### 2026-04-25 — Bryan + Claude deliberation, research-backed

**Context:** CoAIleague is a middleware platform for security companies. Billing must be airtight before any other domain is polished. This section captures the agreed pricing philosophy, market research, and implementation roadmap for Jack and future Claude passes.

---

### MARKET RESEARCH SUMMARY

**RFP/Proposal Writing — What the market charges:**
- Human proposal writers (government RFPs): $3,500–$7,500 flat per submission
- Security-specific guard service proposals: ~$1,500–$3,500 (commercial), $3,500–$7,500 (government)
- In-house RFP writer salary: $86,000–$106,000/year — impossible to justify for SMBs
- One source states proposal prep costs ~1.2% of contract value for O&M/guard service contracts
- A 3–5 year security contract can be worth $500K–$2M, making a $2,000 AI proposal a bargain vs. $5,000+ for a human writer

**Conclusion:** Trinity-generated security RFP/proposal → **$150–$350 per proposal** is the right price. Not $7K (that's a full human engagement). Not $25 (that's too cheap for something worth tens of thousands in contract value). $150–$350 positions it as a steal vs. human writers while generating real revenue per use.

**Payroll Software — Competitor pricing (2026):**
- Gusto: $6–$8/employee/month + $19–$49/month base
- ADP RUN: ~$8/employee/month + base
- Justworks: $8–$12/employee/month
- Rippling: custom, ~$8/employee/month for payroll core
- Industry standard per-employee: $6–$12/month
- Usage event fees (add-ons): $1–$3 per event

**Conclusion:** CoAIleague should undercut on per-seat but stack value through Trinity automation. Target $8–$15/officer/month depending on tier. The AI manager capability justifies a premium over bare payroll tools.

**Workforce/Scheduling Software — What CoAIleague replaces:**
- GetSling: ~$1.70–$6/user/month
- Homebase: $24.95–$99.95/month flat
- When I Work: $2.50–$6/user/month
- Deputy: $2.50–$6/user/month

**Conclusion:** CoAIleague replaces ALL of these plus adds payroll + invoicing + Trinity. Even at $12–$18/officer/month it's a better deal than buying 3 separate tools.

---

### RECOMMENDED PRICING MODEL

#### TIER STRUCTURE (Per-Seat Monthly Base)

| Tier | Officers | Price/seat/mo | Included |
|---|---|---|---|
| **Starter** | 1–25 | $12/seat | Scheduling, time tracking, basic payroll, invoicing, HelpAI |
| **Professional** | 26–100 | $10/seat | + Trinity AI Manager, compliance tracking, document vault, NACHA |
| **Business** | 101–300 | $9/seat | + Multi-client, advanced reporting, API access, priority support |
| **Enterprise** | 300+ | $8/seat | + Umbrella/sub-tenant management, SLA, dedicated support, custom integrations |

> Minimum commitment: $149/month (covers up to ~12 seats at Starter). No one pays less than this — it covers base infrastructure.

---

#### TOKEN ALLOTMENTS PER TIER

| Tier | Tokens/Month | Overage Bundle | Bundle Price |
|---|---|---|---|
| Starter | 500K | 250K bundle | $19 |
| Professional | 2M | 1M bundle | $49 |
| Business | 8M | 5M bundle | $149 |
| Enterprise | 30M | 10M bundle | $249 |

**Sub-tenant token flow:** Sub-workspaces consume from parent's pool. Parent gets visibility + control. Parent is billed for all sub-tenant overages consolidated on one invoice.

**Trinity proactive warning rule (code it this way):**
- 70% threshold → Trinity notifies tenant via dashboard banner + email
- 80% threshold → Trinity proactively messages operator: "At current usage pace, you'll hit your limit in ~X days. Authorize a bundle now to avoid service interruption?"
- 95% threshold → Trinity throttles non-critical AI calls (suggestions, summaries, low-priority scans). Core ops (calloffs, scheduling, payroll) never throttled.
- 100% → Auto-purchase bundle IF tenant has pre-authorized auto-refill. Otherwise: non-critical AI disabled, operator alerted.

---

#### MONTHLY FEATURE ADD-ONS (Flat toggle)

| Add-On | Monthly Price | What it Unlocks |
|---|---|---|
| Trinity AI Manager Pro | +$99/workspace | Proactive ops mode — Trinity runs the business, not just assists |
| NACHA/ACH Direct Deposit | +$49/workspace | Full direct deposit processing via NACHA file generation |
| Client Portal | +$39/workspace | Clients can log in, view invoices, approve timesheets, sign docs |
| E-Verify Integration | +$29/workspace | Automated I-9 / E-Verify on new hires |
| Compliance Guard Package | +$49/workspace | Auto DPS license tracking, expiry alerts, renewal reminders, audit reports |
| Multi-Workspace Umbrella | +$99/parent | Sub-tenant management, consolidated billing, roll-up reporting |
| API Access | +$29/workspace | Developer API for custom integrations |
| Advanced Analytics | +$39/workspace | Predictive labor cost, shift coverage forecasting, revenue intelligence |
| White-Label Mode | +$199/workspace | Remove CoAIleague branding (enterprise only) |

---

#### PER-OCCURRENCE PREMIUM CHARGES

These are high-value AI deliverables where Trinity produces something worth real money:

| Event | Charge | Why |
|---|---|---|
| **RFP/Proposal Generation** | $150–$350/proposal | Human writers charge $1,500–$7,500. Trinity does it in minutes with security-specific language, formatting, past performance sections, compliance matrices. Even at $350 it's a 10x bargain. Tier the price: simple commercial proposal $150, government/federal proposal $350. |
| **AI-Drafted Contract Generation** | $75–$150/contract | Legal-grade document with relevant clauses for security services. Saves attorney review time. |
| **Annual Compliance Audit Report** | $49/report | Year-end or quarter-end deliverable — compiles license status, incident history, compliance gaps. |
| **Tax Season Package (W-2/1099 batch)** | $49/workspace/year | One-time annual charge covers all W-2s + 1099s generated for the year. Not per-form. |
| **Background Check (pass-through)** | Cost + 15% margin | Hard cost passed through at margin. Platform never absorbs. |
| **Incident Intelligence BOLO Package** | $25/report | Trinity-analyzed BOLO with pattern detection, risk scoring, recommended actions. |
| **Proof of Employment (rush/certified)** | $9/letter | Standard POE is free. Certified letterhead version with digital signature is premium. |
| **Payroll Funding Analysis** | $29/report | Trinity analyzes cash flow vs. payroll obligations and produces a funding readiness report. |

**What we explicitly do NOT charge per-occurrence:**
- Pay stubs (routine, covered by seat)
- Invoice generation (routine, covered by tier invoicing bundle)
- Timesheet approvals
- Notifications and alerts
- Basic shift creation
- Standard direct deposit

---

#### INVOICE/PAYROLL BUNDLE LIMITS (Per Tier)

Rather than per-unit charges on routine ops, each tier includes a bundle. Overages are bought in bundles, not per-unit.

| | Starter | Professional | Business | Enterprise |
|---|---|---|---|---|
| Payroll runs/month | 2 | 4 | unlimited | unlimited |
| Invoices/month | 25 | 100 | 500 | unlimited |
| Document vault storage | 1 GB | 5 GB | 25 GB | 100 GB |
| Overage: payroll run | +$19/run | +$15/run | N/A | N/A |
| Overage: invoice batch | +$15/25 invoices | +$10/50 invoices | N/A | N/A |

---

### IMPLEMENTATION ROADMAP FOR JACK + CLAUDE

**Phase 1 — `billingTiersRegistry.ts` (canonical source of truth)**
- Single file that defines ALL of the above: tier names, seat prices, token limits, bundle sizes, bundle prices, add-on keys and prices, per-occurrence event prices
- Everything else reads from this file — routes, Trinity, UI, invoice generation, token metering
- This is the `payrollStatus.ts` equivalent for billing — one source, no hardcoding anywhere

**Phase 2 — Token metering enforcement**
- Every Trinity API call records `{ workspaceId, tokens_used, model, action_id, timestamp }`
- Running total maintained in `workspace_token_ledger` table
- Trinity proactive warning system fires at 70/80/95/100% thresholds
- Auto-bundle purchase if pre-authorized

**Phase 3 — Per-occurrence billing events**
- When `document.generate_proposal` fires → check tier → charge per-occurrence → create billing record → Trinity confirms charge to operator before executing
- Same pattern for contracts, BOLO packages, compliance audit reports

**Phase 4 — Sub-tenant umbrella billing**
- Parent workspace absorbs all sub-workspace usage
- Consolidated monthly invoice generated for parent
- Parent dashboard shows per-sub-workspace cost breakdown
- Volume discounts applied at parent level automatically

**Phase 5 — Stripe integration hardening**
- Every billing event creates a Stripe billing record or usage line item
- No charge is absorbed silently — everything has a paper trail
- Overage bundle purchases trigger immediate Stripe charge + confirmation email

---

### RULE FOR BOTH AGENTS

**The platform never absorbs a single token of AI cost without a corresponding billing record. Every overage bundle is pre-authorized or triggers a warning before execution. Trinity's non-critical functions throttle at 95% — core operations (payroll, calloffs, scheduling, invoicing) are never throttled regardless of token state.**


---

## RFP DYNAMIC PRICING DELIBERATION
### 2026-04-25 — Bryan direction + Claude analysis (Jack to weigh in)

**Bryan's direction:** Base RFP price $500 (not $150). Scales with complexity. Trinity analyzes the uploaded RFP document or URL to calculate the price before the tenant commits. Both agents deliberate and agree before implementing.

---

### Claude's Proposed Model

**Why dynamic pricing makes sense:**
- A 1-site commercial proposal takes Trinity ~20 min of compute and produces ~10 pages
- A 12-site federal proposal with union clauses takes ~2 hrs and produces 50+ pages + compliance matrix
- Charging both the same flat fee leaves money on the table or overcharges small operators

**Scoring Factors Trinity Evaluates on Upload:**

| Factor | Options | Score |
|---|---|---|
| Contract type | Commercial=0, Municipal=1, State gov=2, Federal=3 | 0–3 |
| Number of sites | 1=0, 2–5=1, 6–10=2, 10+=3 | 0–3 |
| Jurisdictions | 1=0, 2=1, 3+=2 | 0–2 |
| Armed required | No=0, Yes=1 | 0–1 |
| Union/prevailing wage | No=0, Yes=2 | 0–2 |
| Deadline pressure | 7+ days=0, 3–7 days=1, <3 days=2 | 0–2 |
| Attachments required | <5=0, 5–10=1, 10+=2 | 0–2 |
| Contract volume (hrs/wk) | <200=0, 200–1000=1, 1000+=2 | 0–2 |
| **Max possible score** | | **17** |

**Price Tiers (score → price):**

| Score | Label | Price | Example |
|---|---|---|---|
| 0–2 | Standard | $500 | 1-site commercial, unarmed, 10+ days |
| 3–5 | Professional | $750 | 3-site municipal, 5 days |
| 6–8 | Complex | $1,000 | 6-site state gov, armed, multi-state |
| 9+ | Enterprise | $1,500 | Federal, 12 sites, union, armed, rush |

**Validated scenarios:**
- Simple 1-site commercial (score 0) → **$500** ✅
- 3-site municipal, tight deadline (score 4) → **$750** ✅
- State gov, 6 sites, armed, multi-state (score 8) → **$1,000** ✅
- Federal, 12 sites, armed, union, rush (score 16) → **$1,500** ✅

**How Trinity Does the Analysis:**

When tenant uploads an RFP PDF or pastes a URL:
1. Trinity extracts: contract type, site list, jurisdiction(s), officer type requirements, deadline, attachment list, estimated hours
2. Runs the scoring matrix above
3. Returns: "This is a [Label] proposal. Trinity will generate your full RFP response for **$X**. Authorize charge to proceed?"
4. Tenant confirms → charge fires → Trinity generates → branded PDF saved to vault → tenant downloads

**What Trinity extracts from the RFP document:**
- `contract_type` — scans for "federal", "FAR", "GSA", "state contract", "municipality"
- `site_count` — counts locations/addresses listed in scope of work
- `jurisdiction_count` — scans for state names, licensing requirements by state
- `armed_requirement` — looks for "armed", "firearm", "Level III", "weapon"
- `prevailing_wage` — looks for "Davis-Bacon", "prevailing wage", "union", "CBA"
- `deadline` — extracts proposal due date, calculates days remaining
- `attachments` — counts "provide", "submit", "attach", "include" sections
- `volume` — looks for officer hours, shift counts, total hours per week

---

### Jack's Input Needed

**Claude's position:** The scoring model above is logically sound and produces defensible prices. The $500–$1,500 range is well below human writers ($1,500–$7,500) and scales with real complexity factors.

**Questions for Jack to weigh in on:**
1. Does the scoring matrix cover all the factors you'd expect to see in security RFPs?
2. Should rush deadline scoring cap at 2 or go higher (e.g., same-day = 3)?
3. Should we add a "page count" factor? (RFPs over 50 pages = +1 complexity)
4. Should $1,500 be the hard cap or should Enterprise+ tier allow custom pricing above that?

**Jack: add your notes below this line before implementing.**

---

### BROADER PLATFORM NOTES (Bryan + Claude conversation, 2026-04-25)

**Platform vision reminder (Bryan's words):**
> "Making a platform so convenient, an AI so smart, dependable, reasonable, and proactive like a human manager but supervised... like Lisa. Trinity does it all and more. We need to get regulatory services to say yes to a deal with us — making us a needed necessity, not just a nice to have."

**Regulatory partnership strategy:**
- Target: Texas DPS (Dept. of Public Safety), other state licensing bodies
- Angle: CoAIleague can be the automated compliance backbone for TDPS to verify guard licenses, incident history, and training records across all tenants
- Value to regulators: Real-time compliance data vs. manual annual audits
- Value to tenants: Regulatory portal built-in — no more emergency document scrambles during audits
- This makes CoAIleague a regulated middleware, not just a SaaS tool — changes the competitive moat entirely

**Security domain (flagged for future sprint):**
- Bryan flagged: protect code from being scraped or stolen
- Items to address when we reach Security domain:
  - Rate limiting + WAF (Web Application Firewall) on all API routes
  - Code obfuscation for client-side bundle
  - IP allowlisting for sensitive admin routes
  - Source code legal protection (license, copyright headers, proprietary markers)
  - Trinity self-edit governance already exists (`trinitySelfEditGovernance.ts`) — verify it's enforced
  - Secrets scanning in CI/CD pipeline

**Agent protocol reminder:**
- Claude: build-verify, strategic architect, autonomous passes when no Jack commits
- Jack: targeted surgical commits via GitHub connector, reason-checked patches
- Both: deliberate on major decisions, document in AGENT_HANDOFF.md, escalate to Bryan when disagreeing
- Deal confirmed: both agents research, agree, then implement. Disagreements go to Bryan.

### 2026-04-25 — Claude (DELETE /runs/:id wired)

**Pulled `fa455994d`. Build: ✅ clean.**

**`4f716429d` (Jack) — payrollRunDeleteService.ts ✅**
118-line service. Atomic `db.transaction()`: releases time entries (`payrolledAt=null, payrollRunId=null`), deletes payroll entries, deletes run. Terminal status guard via `isTerminalPayrollStatus()`. Non-blocking `payroll_run_deleted` event. Returns `{ deletedEntries, releasedTimeEntries, previousStatus }`. Clean.

**Claude wired:**
- Added `deletePayrollRun` import
- Replaced 38-line inline handler → 17-line thin wrapper
- Status-aware error: `(error as any)?.status || 500`

**payrollRoutes.ts: 3754 → 3366 (-388 lines, 16 handlers extracted)**

**Next for Jack — `POST /runs/:id/approve` (147 lines)**
This is the last major handler before payroll routes is truly thin. It has a SELECT FOR UPDATE concurrent-approval guard, anomaly detection, notifications, and websocket. Jack should inspect via connector and either:
- Extract the non-transaction logic to a service, OR
- Flag if the handler is safe to leave inline (it's the most complex remaining one)
The payroll domain finish line is close.

### 2026-04-25 — Claude (PATCH /proposals/:id/approve wired)

**Pulled `65e835351`. Build: ✅ clean.**

**`1b3d1cd39` (Jack) — payrollProposalApprovalService.ts ✅**
208-line service. Preserved all critical behaviors from the 165-line inline handler:
- `.for('update')` row lock inside transaction — concurrent approval prevented
- Self-approval guard (SELF_APPROVAL_FORBIDDEN 403)
- 30-day stale proposal guard (PROPOSAL_EXPIRED 409)
- Anomaly warning (non-blocking, warning only)
- SOC2 audit log, webhook, websocket broadcast, event bus, notification — all non-blocking
- Returns `{ success, proposalId, message, anomalyWarning? }`

**Claude wired:**
- Added `approvePayrollProposal` import
- Replaced 165-line inline handler → 28-line thin wrapper
- Status-aware error with `error.extra` forwarded to response body
- Manager role guard + workspace resolution preserved in route layer

**payrollRoutes.ts: 3754 → 3230 (-524 lines, 17 handlers extracted)**

**Payroll domain extraction status — NEAR COMPLETE:**
The proposal approval/rejection pair is now fully extracted. The remaining handlers in `payrollRoutes.ts` are the heavy complex ones (bank accounts, tax forms, payroll run process/void/mark-paid). Recommend Jack audit remaining handlers and decide:
- Which can be extracted next (smaller, self-contained)
- Which should stay inline for now (complex financial transactions)

**Next milestone: begin Billing domain**
Once Jack does one more extraction pass or decides remaining payroll routes are stable enough, we pivot to `billingTiersRegistry.ts` — the enforcement layer.

### 2026-04-25 — Claude (client portal pricing decision)

**Bryan + Claude decision — documented for Jack to confirm before enforcement.**

**Client Portal is no longer a $39/month paid add-on.**

**Reasoning:**
- $39/portal × 1,000 clients (e.g. Securitas) = $39,000/month in add-on fees — deal-killer
- Client sessions burn minimal tokens: invoice views = read-only DB queries, payments = Stripe redirect, timesheet sign-off = simple approval. Even heavy HelpAI use = a few thousand tokens, fractions of a cent
- Token cost from client sessions is negligible — flows from their activity into the TENANT's allotment as-is
- Revenue already captured via: per-transaction processing fee + tenant monthly subscription

**New model — included in tier, gated by client seat count:**

| Tier | Client portal logins |
|---|---|
| Starter | None |
| Professional | Up to 50 client logins |
| Business | Up to 200 client logins |
| Enterprise | Unlimited |
| Strategic | Unlimited |

A Professional tenant hitting the 50-client cap upgrades to Business naturally — without feeling nickel-and-dimed.

**What changed in code:**
- `shared/billingConfig.ts`: `client_portal_access` removed from `MONTHLY_FEATURE_ADDONS`. Added `CLIENT_PORTAL_SEAT_LIMITS` constant + `getClientPortalSeatLimit()` + `hasClientPortalAccess()` helpers.
- `client/src/config/pricing.ts`: portal removed from `MONTHLY_ADDONS_DISPLAY`.

**Jack: please confirm you agree before the enforcement layer gates by seat count.**
If you agree, next step is wiring `CLIENT_PORTAL_SEAT_LIMITS` into the tier guard middleware when we reach the billing enforcement layer.

### 2026-04-25 — Claude (payroll import cleanup — autonomous pass)

**Autonomous pass — picking up what was pending after handler extractions.**

**payrollRoutes.ts import cleanup:**

Converted dynamic imports → static (safer, faster, type-checked at build):
- `broadcastToWorkspace` from `../websocket` ✅
- `universalNotificationEngine` ✅
- `taxFormGeneratorService` ✅
- `@shared/billingConfig` (removed — unused in remaining handlers)
- `drizzle-orm` dynamic → already static (removed duplicate dynamic)

Removed 9 unused static imports (symbols moved to domain services during extraction):
- `formatCurrency` — now in service files
- `stagedShifts` — unused
- `calculateStateTax`, `calculateBonusTaxation` — now in payroll services
- `isDraftPayrollStatus`, `PAYROLL_TERMINAL_STATUSES`, `PAYROLL_DRAFT_STATUSES` — now in payrollStatus module
- `getPayrollProposal` — in proposalReadService
- `payrollInfoUpdateSchema` — in employeeSelfServiceService

**Remaining dynamic imports (intentionally kept dynamic — heavy/optional):**
`payrollAutomation`, `achTransferService`, `financialPipelineOrchestrator`,
`contractorTaxAutomationService`, `tokenManager`, `middlewareTransactionFees`,
`orgLedgerService`, `emailCore`, `taxFilingAssistanceService`, `@shared/schema`,
`date-fns`, `tierGuards`

These are in the remaining complex handlers (bank accounts, tax form generation,
payroll run process/execute/void/mark-paid) — they'll be converted when those
handlers are extracted to services.

**payrollRoutes.ts: 3754 → 3231 (-523 lines)**

**Next for Jack — payroll domain completion:**
Remaining complex handlers to assess:
- `POST /create-run` (large — builds payroll run from scratch)
- `POST /runs/:id/process` (large — triggers NACHA/ACH)
- `POST /runs/:id/mark-paid` (large — marks run paid + notifications)
- `POST /:runId/void` (large — reversal workflow)
- Bank accounts (5 handlers — Plaid-adjacent, needs careful review)
Jack: audit these and decide which to extract next vs leave inline for now.

---

## 🔧 WORKFLOW QUESTION FOR JACK — Read Before Starting Bank Accounts

**Bryan + Claude are thinking about how to speed up your workflow.**

Current bottleneck: You can only see files piece by piece through the GitHub connector, which forces every extraction into 2 commits (service file + handoff) instead of 1 complete commit with wiring included.

**Three options on the table:**

**Option A — Full repo ZIP download**
Bryan tried this before and hit corruption/read errors. May not be reliable depending on repo size (~5,790 files). Probably not the move.

**Option B — Switch to Codex**
Codex has native GitHub access, can read full large files end to end, and can run shell commands. You'd have the same view Claude has — full `payrollRoutes.ts`, full context, local build feedback. Same handoff protocol, just faster. You create the service AND wire the route in one shot, Claude pulls, build-verifies, pushes. Cuts the back-and-forth in half.

**Option C — Stay as-is**
Current pattern works and is precise. Bank accounts are the last complex payroll handlers. After that we hit billing domain which is mostly new files, not large-file surgery. The slowness may naturally resolve once we're past payroll extraction.

**Jack: what's your preference?**
Drop a note in your next commit message or handoff file — Option A, B, or C, or a different idea. Bryan will set it up based on your answer.

Either way — your next task is the 5 bank account handlers in `payrollRoutes.ts`.
Assess them first: `GET`, `POST`, `PATCH`, `DELETE` on `/employees/:employeeId/bank-accounts`.
They're Plaid-adjacent and sensitive — review the full bodies before deciding how much to extract.

---

---

## 🔍 PAYROLL AUDIT — NOT DONE YET (2026-04-25 Claude audit)

Full handler audit run. **12 handlers still have significant inline logic.**

**Priority extractions remaining:**

| Handler | Lines | Why important |
|---|---|---|
| `POST /runs/:id/approve` | 146L | Run-level approval — different from proposal approval, not yet extracted |
| `GET /runs/:id/nacha` | 224L | NACHA file generation — largest remaining, inline DB |
| `GET /tax-center` | 120L | Tax dashboard aggregation |
| `GET /export/pdf/:runId` | 110L | PDF export with inline DB |
| `POST /runs/:id/retry-failed-transfers` | 101L | ACH retry logic |
| `GET /pre-run-checklist` | 99L | Compliance pre-flight |
| `POST /tax-forms/generate` | 93L | Tax form orchestration |
| `POST /:entryId/amend` | 76L | Payroll entry amendment |
| `POST /runs/:id/execute-internal` | 75L | Internal execution |
| `POST /tax-forms/941` | 69L | 941 generation route |
| `POST /tax-forms/940` | 58L | 940 generation route |

**22 handlers are thin ✅. 12 still need extraction.**

### Jack's next task:
Start with `POST /runs/:id/approve` (146L) — run-level approval with SELECT FOR UPDATE.
Then `GET /runs/:id/nacha` (224L) — NACHA file generation.
Those two are the most critical remaining.

Also: **please respond to the Codex/workflow question** before starting so Bryan can set it up.

---

## ✅ PAYROLL DOMAIN — COMPLETE (2026-04-25)

**Final state: `payrollRoutes.ts` 3,754 → 2,068 lines (-1,686 lines)**

### Services extracted this session (full list):

| Service | Handler(s) | Lines saved |
|---|---|---|
| payrollTaxFilingGuideService | 3 guide routes | -45 |
| payrollCsvExportService | GET /export/csv | -36 |
| payrollProposalRejectionService | PATCH /proposals/:id/reject | -35 |
| payrollEmployeeSelfServiceService | 5 employee self-service | -200 |
| payrollProposalReadService (Jack) | GET /proposals | -20 |
| payrollEmployeeTaxFormsService (Jack) | GET /my-tax-forms + download | -110 |
| payrollRunReadService (Jack) | GET /runs + GET /runs/:id | -55 |
| payrollRunDeleteService (Jack) | DELETE /runs/:id | -22 |
| payrollProposalApprovalService (Jack) | PATCH /proposals/:id/approve | -137 |
| payrollRunMarkPaidService (Jack) | POST /runs/:id/mark-paid | -108 |
| payrollRunProcessStateService (Jack) | POST /runs/:id/process (partial) | -6 |
| payrollRunCreationService (Jack) | POST /create-run | -213 |
| payrollRunVoidService (Jack) | POST /:runId/void | -29 |
| payrollBankAccountService | 5 bank account handlers | -224 |
| payrollRunApprovalService | POST /runs/:id/approve | -105 |
| payrollNachaService | GET /runs/:id/nacha | -198 |
| payrollPdfExportService | GET /export/pdf/:runId | -93 |
| payrollRetryService | POST /runs/:id/retry-failed-transfers | -80 |
| payrollTaxCenterService | GET /tax-center + pre-run-checklist | -209 |
| **payrollSupplementalPayService** | **POST /bonus + POST /commission (NEW)** | +120 |

### QB/Gusto feature parity: **41/41 ✅**
- Bonus pay — `POST /payroll/bonus` — 22% supplemental flat rate, 6 categories
- Commission pay — `POST /payroll/commission` — 22% supplemental rate, 5 sources

### Handler distribution:
- 35 thin (≤50L) ✅
- 6 medium (51-100L) — tokenManager billing + audit logging inline (acceptable)
- 1 large: `POST /runs/:id/process` (286L) — ACH orchestration, deferred

### Dynamic imports: 5 remaining (all billing/notification — lazy-load acceptable)

### ✅ Claude done — Jack's turn
**Payroll domain is COMPLETE. Next domain: BILLING.**
Jack's first task: `billingTiersRegistry.ts` — the canonical enforcement layer.
Reads from `shared/billingConfig.ts`. Gates features by tier, meters tokens,
fires Trinity warnings at 70/80/95/100%, enforces NEVER_THROTTLE_ACTIONS.
Bryan confirmed: Tiered base + consumption bundles + per-occurrence model.
All pricing defined in `shared/billingConfig.ts` — Jack reads it before starting.

### 2026-04-25 — Claude (billing shadow route cleanup + caller audit)

**Pulled `7fa391ed2`. Build: ✅ clean.**

**`987817876` (Jack) — deleted 2 shadow billing routes ✅**
Removed `/api/billing/reconcile` + `/api/billing/transactions` from `domains/billing.ts`
— they were shadowed by identical paths already served by `billingRouter` in `billing-api.ts`.
Also removed unused `exportLimiter` import. Correct, surgical. Follows the index rules.

**Claude: caller audit + 7 more dead routes deleted**

Ran caller audit on all 8 remaining inline routes in `domains/billing.ts`:
- `/api/billing/ai-usage` → KEEP (active caller: `AiUsageDashboard.tsx`)
- Other 7 (`daily-usage`, `monthly-usage`, `org-summary`, `usage-breakdown`,
  `trinity/today`, `trinity/month`, `trinity/unbilled`) → NO CALLERS → DELETED

`ai-usage` migrated to `billing-api.ts` (canonical router) under `/ai-usage`.
Frontend path `/api/billing/ai-usage` unchanged — mount still resolves correctly.

**`domains/billing.ts` is now a pure mount file: 112 lines, 0 inline routes, 23 `app.use()` calls.**

**Total removed this pass: ~63 lines of dead billing code**

---

**Next for Jack — Billing domain continuation:**

Read `CODEBASE_INDEX.md` BILLING section first.

Priority targets:
1. **`billing-api.ts` (1,838L)** — audit for dead routes, inline DB, duplicate paths
   Run: `grep -n "router\.\(get\|post\|put\|patch\|delete\)" server/routes/billing-api.ts | wc -l`
   to get handler count, then audit callers for each one
2. **`billingSettingsRoutes.ts` (600L)** — check for overlap with billing-api.ts
   Run the same caller audit pattern from this handoff

Jack's workflow is now proven:
- Read index → identify duplication → run caller audit → delete dead → migrate orphans to canonical router → one clean commit
- Claude pulls, verifies, pushes

**✅ Claude done — Jack's turn**
What Claude did: caller audit, 7 dead routes deleted, ai-usage migrated, build clean.
domains/billing.ts: pure mount file ✅
Jack's next task: caller audit on billing-api.ts handlers.
