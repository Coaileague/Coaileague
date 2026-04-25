# COAILEAGUE CODEBASE INDEX — JACK'S PLATFORM MAP
*Auto-generated 2026-04-25 | 361 route files | 928 service files | 706 DB tables*

---

## HOW TO USE THIS INDEX (Jack reads this first)

This file is your complete platform map. Before touching any code:
1. Find your target domain in the **Domain Sections** below
2. Check **Known Duplicates** — consolidate before extracting
3. Check **Canonical Services** — wire to existing, don't reimplement
4. Check **Schema Tables** — use existing tables, don't add columns blind
5. Copy the **Import Path** from the service table — exact paths, no guessing

**Speed tip:** Jack's fastest workflow:
1. Read domain section → identify which files overlap
2. In ONE commit: delete dead routes + consolidate overlaps + wire to canonical service
3. Claude pulls, build-verifies, pushes
4. Repeat — each commit should REDUCE total lines, not increase them

---

## NON-NEGOTIABLE RULES

| Rule | Why |
|---|---|
| No new files unless operation genuinely missing | 361 files already, don't add |
| One canonical path per operation | Duplicate routes = confusion = bugs |
| Delete > Extract | Dead code is worse than messy code |
| Wire to canonical services (table below) | Don't reimplement invoiceService, storage, etc. |
| Audit for overlap BEFORE writing | Check Known Duplicates section first |
| Every commit reduces line count | If your commit adds lines, justify it |

---

## KNOWN DUPLICATES — FIX THESE FIRST (biggest wins)

| Priority | Files | Overlap | Action | Lines saved |
|---|---|---|---|---|
| 🔴 HIGH | `time-entry-routes.ts` (2,707L) + `timeEntryRoutes.ts` (924L) | Same domain, ~60% overlap | Audit both, merge into one, delete redundant handlers | ~1,800L |
| 🔴 HIGH | `chat.ts` (1,666L) + `chatInlineRoutes.ts` (1,316L) | Chat split, unclear boundary | Pick one as canonical, merge unique handlers from other | ~1,000L |
| 🔴 HIGH | `miscRoutes.ts` (2,776L) | Catch-all graveyard | Audit each handler: move to domain file or delete | ~1,500L |
| 🔴 HIGH | `devRoutes.ts` (2,458L) | Dev-only, not production | Strip from prod build entirely via env check | ~2,458L |
| 🟠 MED | `billing-api.ts` (1,838L) + `billingSettingsRoutes.ts` (600L) | Both billing, split poorly | Merge: subscription billing in one, settings in one | ~600L |
| 🟠 MED | `ai-brain-routes.ts` (1,645L) + `aiBrainInlineRoutes.ts` (1,171L) | Same AI brain | Boundary is unclear — audit, enforce clear split | ~500L |
| 🟠 MED | `helpai-routes.ts` (1,297L) + `helpAITriageRoutes.ts` (760L) | Same HelpAI feature | Consolidate | ~400L |
| 🟠 MED | `onboardingRoutes.ts` (819L) + `onboardingInlineRoutes.ts` (1,545L) | Same domain | Pick one as canonical | ~400L |
| 🟡 LOW | `aiOrchestraRoutes.ts` (575L) + `aiOrchestratorRoutes.ts` (483L) | Nearly identical names | Audit — likely 80% duplicate | ~300L |
| 🟡 LOW | `complianceRoutes.ts` (1,823L) + `compliance/` subfolder | Same domain, split | Root should delegate to subfolder handlers | ~200L |

---

## CANONICAL SERVICES — COPY THESE IMPORT PATHS EXACTLY

| Operation | Import | From |
|---|---|---|
| **Invoice CRUD** | `import { invoiceService } from '../services/billing/invoice';` | `server/services/billing/invoice.ts` |
| **Payroll run creation** | `import { createPayrollRunForPeriod } from '../services/payroll/payrollRunCreationService';` | payroll/ |
| **Payroll run approval** | `import { approvePayrollRun } from '../services/payroll/payrollRunApprovalService';` | payroll/ |
| **Pay stubs** | `import { paystubService } from '../services/paystubService';` | services/ |
| **Tax forms** | `import { taxFormGeneratorService } from '../services/taxFormGeneratorService';` | services/ |
| **Document vault** | `import { saveToVault } from '../services/documents/businessFormsVaultService';` | documents/ |
| **DB (direct)** | `import { db } from '../db';` | server/db.ts |
| **Storage layer** | `import { storage } from '../storage';` | server/storage.ts |
| **Event bus** | `import { platformEventBus } from '../services/platformEventBus';` | services/ |
| **Websocket** | `import { broadcastToWorkspace } from '../websocket';` | server/websocket.ts |
| **Notifications** | `import { universalNotificationEngine } from '../services/universalNotificationEngine';` | services/ |
| **Audit log** | `storage.createAuditLog({ workspaceId, userId, action, entityType, entityId, ... })` | via storage |
| **Token meter** | `import { tokenManager } from '../services/billing/tokenManager';` | billing/ |
| **Tier enforcement** | `import { getWorkspaceTier, hasTierAccess } from '../tierGuards';` | server/ |
| **Billing registry** | `import { evaluateBillingFeatureGate } from '../services/billing/billingTiersRegistry';` | billing/ |
| **Financial math** | `import { calculateNetPay, applyTax, addFinancialValues } from '../services/financialCalculator';` | services/ |
| **RFP scoring** | `import { scoreRfpComplexity } from '../services/billing/rfpComplexityScorer';` | billing/ |
| **NACHA** | `import { generateNachaFile } from '../services/payroll/payrollNachaService';` | payroll/ |
| **Bank accounts** | `import { addBankAccount, updateBankAccount } from '../services/payroll/payrollBankAccountService';` | payroll/ |
| **Bonus/Commission** | `import { createBonusPayEntry, createCommissionPayEntry } from '../services/payroll/payrollSupplementalPayService';` | payroll/ |
| **Compliance engine** | `import { trinityComplianceEngine } from '../services/compliance/trinityComplianceEngine';` | compliance/ |
| **ACH transfers** | `import { initiatePayrollAchTransfer } from '../services/payroll/achTransferService';` | payroll/ |
| **Shift operations** | (no canonical service yet — create when refactoring shiftRoutes.ts) | — |
| **Employee ops** | (no canonical service yet — create when refactoring employeeRoutes.ts) | — |

---

## MIDDLEWARE REGISTRY — WHAT'S AVAILABLE

| Middleware | Import | Use |
|---|---|---|
| `requireAuth` | passed into route registrar | All authenticated routes |
| `checkManagerRole(req)` | available in routes | Manager-only routes |
| `mutationLimiter` | `import { mutationLimiter } from '../services/infrastructure/rateLimiting';` | POST/PATCH/DELETE |
| `idempotencyMiddleware` | `import { idempotencyMiddleware } from '../middleware/idempotency';` | Financial writes |
| `requireManagerOrOwn(req, ownerId)` | inline function | Employee self-service or manager |
| `attachWorkspaceId` | passed into route registrar | Workspace-scoped routes |

---

## SCHEMA TABLES REGISTRY (706 tables total)

Key tables Jack will touch most often:

**Payroll:** `payroll_runs`, `payroll_entries`, `pay_stubs`, `payroll_proposals`, `payroll_run_locks`, `employee_payroll_info`, `employee_bank_accounts`, `employee_tax_forms`

**Billing:** `billing_audit_log`, `subscription_invoices`, `invoices`, `invoice_line_items`, `workspace_subscriptions`, `billing_events`, `token_usage_log`

**Scheduling:** `shifts`, `shift_assignments`, `shift_offers`, `schedules`, `availability`, `calloffs`

**Time:** `time_entries`, `timesheets`, `time_off_requests`, `break_records`

**HR:** `employees`, `users`, `workspaces`, `workspace_members`, `employee_onboarding_progress`, `disciplinary_records`

**Compliance:** `guard_licenses`, `compliance_records`, `document_vault`, `training_records`, `certifications`

**Clients:** `clients`, `contracts`, `proposals`, `sites`, `post_orders`

**Chat:** `chat_rooms`, `chat_messages`, `direct_messages`, `chat_members`

Full table list: 706 tables in `shared/schema/domains/`

---

## DOMAIN SECTIONS

For each domain: file list (size, route count, key handlers) + refactoring action.

### BILLING DOMAIN
*9,128 lines | 74 handlers | 11 files*

**Priority: HIGH — Must ship by end of month.**
Action plan:
1. Audit `billing-api.ts` + `billingSettingsRoutes.ts` — find overlapping endpoints
2. Wire all billing routes through `billingTiersRegistry` enforcement layer
3. `invoiceRoutes.ts` (3,818L) — use `invoiceService` throughout, no inline DB
4. `stripeInlineRoutes.ts` — keep separate (webhook middleware differs)
5. Target: 2 files max for core billing (billingRoutes.ts + stripeWebhooks.ts)

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `invoiceRoutes.ts` | 3,818 | 40 | `GET /:id/pdf`; `GET /proposals` | ⚠️ YES |
| ⚠️ `billing-api.ts` | 1,838 | 0 | — | ⚠️ YES |
| ⚠️ `stripeInlineRoutes.ts` | 923 | 12 | `GET /config`; `POST /connect-account` | ✅ no |
| ⚠️ `billingSettingsRoutes.ts` | 600 | 2 | `GET /seat-hard-cap`; `PATCH /seat-hard-cap` | ⚠️ YES |
| ⚠️ `timesheetInvoiceRoutes.ts` | 545 | 0 | — | ⚠️ YES |
| 🔸 `plaidRoutes.ts` | 420 | 9 | `GET /status`; `POST /link-token/org` | ✅ no |
| 🔸 `domains/billing.ts` | 217 | 0 | — | ✅ no |
| 🔸 `financeSettingsRoutes.ts` | 203 | 0 | — | ⚠️ YES |
| ✅ `financeInlineRoutes.ts` | 192 | 0 | — | ✅ no |
| ✅ `plaidWebhookRoute.ts` | 189 | 1 | `POST /` | ✅ no |
| ✅ `financeRoutes.ts` | 183 | 10 | `GET /ledger/chart-of-accounts`; `GET /ledger/journal-entries` | ✅ no |

### PAYROLL DOMAIN
*3,019 lines | 47 handlers | 4 files*

**Status: ✅ COMPLETE — 2,068L, 41/41 QB/Gusto features**
Do not touch without good reason. Only remaining work:
- `POST /runs/:id/process` (286L) — ACH orchestration, deferred intentionally
- `payrollTimesheetRoutes.ts` (640L) — needs audit

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `payrollRoutes.ts` | 2,067 | 42 | `GET /export/csv`; `GET /proposals` | ⚠️ YES |
| ⚠️ `payrollTimesheetRoutes.ts` | 640 | 0 | — | ✅ no |
| 🔸 `payStubRoutes.ts` | 285 | 5 | `GET /pay-stubs/:id`; `GET /api/paystubs/current` | ⚠️ YES |
| ✅ `domains/payroll.ts` | 27 | 0 | — | ✅ no |

### SCHEDULING DOMAIN
*9,393 lines | 103 handlers | 11 files*

**Priority: HIGH — Core security company feature.**
`shiftRoutes.ts` at 3,622L is the biggest problem on the platform.
Action plan:
1. Audit for dead routes first (routes never called by frontend)
2. Extract shift mutation service (create/update/delete shift)
3. Consolidate `scheduleosRoutes.ts` (1,325L) + `schedulerRoutes.ts` (886L) — likely overlap
4. `advancedSchedulingRoutes.ts` (1,219L) + `autonomousSchedulingRoutes.ts` (523L) — audit boundary
Target: shiftRoutes.ts under 1,000L

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `shiftRoutes.ts` | 3,622 | 26 | `GET /`; `GET /today` | ⚠️ YES |
| ⚠️ `scheduleosRoutes.ts` | 1,325 | 18 | `POST /ai/toggle`; `POST /ai/trigger-session` | ⚠️ YES |
| ⚠️ `schedulerRoutes.ts` | 886 | 19 | `GET /profiles`; `GET /profiles/:employeeId` | ⚠️ YES |
| ⚠️ `calendarRoutes.ts` | 805 | 0 | — | ✅ no |
| ⚠️ `shiftTradingRoutes.ts` | 629 | 0 | — | ✅ no |
| ⚠️ `orchestratedScheduleRoutes.ts` | 560 | 8 | `GET /status`; `POST /ai/fill-shift` | ✅ no |
| ⚠️ `schedulesRoutes.ts` | 557 | 6 | `GET /week/stats`; `POST /publish` | ⚠️ YES |
| ⚠️ `shiftChatroomRoutes.ts` | 522 | 16 | `GET /active`; `GET /by-shift/:shiftId` | ⚠️ YES |
| 🔸 `availabilityRoutes.ts` | 251 | 9 | `GET /`; `POST /` | ✅ no |
| ✅ `coverageRoutes.ts` | 186 | 0 | — | ✅ no |
| ✅ `shiftBotSimulationRoutes.ts` | 50 | 1 | `POST /simulate` | ✅ no |

### TIME DOMAIN
*4,708 lines | 15 handlers | 4 files*

**Priority: HIGH — Feeds payroll directly.**
CRITICAL DUPLICATE: `time-entry-routes.ts` (2,707L) + `timeEntryRoutes.ts` (924L)
These almost certainly cover the same operations.
Action plan:
1. List all routes in both files
2. Find the overlap (estimate 60%)
3. Pick one as canonical, delete the overlapping handlers from the other
4. Target: one `timeEntryRoutes.ts` under 1,200L

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `time-entry-routes.ts` | 2,707 | 0 | — | ⚠️ YES |
| ⚠️ `timeEntryRoutes.ts` | 924 | 15 | `GET /export/csv`; `GET /` | ⚠️ YES |
| ⚠️ `timeOffRoutes.ts` | 708 | 0 | — | ⚠️ YES |
| 🔸 `timesheetReportRoutes.ts` | 369 | 0 | — | ✅ no |

### HR DOMAIN
*18,963 lines | 247 handlers | 32 files*

**Priority: MEDIUM.**
`employeeRoutes.ts` (2,451L) + `hrInlineRoutes.ts` (1,795L) — large but may have clear boundaries.
Action plan:
1. `employeeRoutes.ts` — extract employee mutation service
2. `hrInlineRoutes.ts` — audit for inline DB, wire to storage layer
3. `onboardingRoutes.ts` (819L) + `onboardingInlineRoutes.ts` (1,545L) — consolidate

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `employeeRoutes.ts` | 2,451 | 26 | `PATCH /:employeeId/role`; `PATCH /:employeeId/position` | ⚠️ YES |
| ⚠️ `hrInlineRoutes.ts` | 1,795 | 0 | — | ⚠️ YES |
| ⚠️ `onboardingInlineRoutes.ts` | 1,545 | 36 | `POST /invite`; `GET /invite/:token` | ⚠️ YES |
| ⚠️ `trainingRoutes.ts` | 1,290 | 23 | `GET /sessions`; `POST /sessions` | ⚠️ YES |
| ⚠️ `publicOnboardingRoutes.ts` | 1,133 | 18 | `GET /invite/:token`; `POST /invite/:token/opened` | ⚠️ YES |
| ⚠️ `ticketSearchRoutes.ts` | 1,047 | 9 | `GET /search`; `GET /search/by-number/:ticketNumber` | ✅ no |
| ⚠️ `enterpriseOnboardingRoutes.ts` | 833 | 28 | `GET /public/offer/:offerId`; `POST /public/offer/:offerId/accept` | ⚠️ YES |
| ⚠️ `onboardingRoutes.ts` | 819 | 0 | — | ⚠️ YES |
| ⚠️ `performanceRoutes.ts` | 754 | 9 | `GET /disciplinary`; `POST /disciplinary` | ✅ no |
| ⚠️ `intelligentOnboardingRoutes.ts` | 729 | 0 | — | ✅ no |
| ⚠️ `authRoutes.ts` | 631 | 22 | `GET /csrf-token`; `POST /csrf-token` | ✅ no |
| ⚠️ `searchRoutes.ts` | 553 | 0 | — | ✅ no |
| ⚠️ `trinityTrainingRoutes.ts` | 549 | 8 | `GET /status`; `POST /seed` | ✅ no |
| ⚠️ `trainingComplianceRoutes.ts` | 510 | 0 | — | ⚠️ YES |
| 🔸 `hiringRoutes.ts` | 416 | 11 | `GET /pipeline`; `GET /applicants/:id` | ⚠️ YES |
| 🔸 `sra/sraAuthRoutes.ts` | 405 | 6 | `POST /apply`; `POST /login` | ⚠️ YES |
| 🔸 `owner-employee.ts` | 373 | 7 | `GET /status`; `POST /ensure` | ⚠️ YES |
| 🔸 `assisted-onboarding.ts` | 349 | 0 | — | ✅ no |
| 🔸 `onboardingTaskRoutes.ts` | 338 | 7 | `GET /templates`; `GET /employee/:employeeId` | ✅ no |
| 🔸 `onboardingFormsRoutes.ts` | 306 | 0 | — | ✅ no |
| 🔸 `trainingCertificationRoutes.ts` | 270 | 0 | — | ✅ no |
| 🔸 `publicHiringRoutes.ts` | 250 | 2 | `GET /:workspaceId`; `POST /:workspaceId/apply` | ⚠️ YES |
| 🔸 `hrisRoutes.ts` | 248 | 8 | `GET /employees`; `GET /providers` | ✅ no |
| 🔸 `employeePacketRoutes.ts` | 238 | 0 | — | ⚠️ YES |
| 🔸 `offboardingRoutes.ts` | 235 | 8 | `GET /api/offboarding/cases`; `POST /api/offboarding/cases` | ⚠️ YES |
| ✅ `onboardingPipelineRoutes.ts` | 190 | 8 | `POST /`; `GET /` | ✅ no |
| ✅ `onboarding-assistant-routes.ts` | 158 | 0 | — | ✅ no |
| ✅ `employeeOnboardingRoutes.ts` | 151 | 0 | — | ✅ no |
| ✅ `hiringSettingsRoutes.ts` | 143 | 2 | `GET /`; `PUT /` | ✅ no |
| ✅ `performanceNoteRoutes.ts` | 128 | 4 | `GET /`; `POST /` | ✅ no |
| ✅ `benefitRoutes.ts` | 113 | 5 | `GET /`; `GET /employee/:employeeId` | ✅ no |
| ✅ `spsOnboardingRoutes.ts` | 13 | 0 | — | ✅ no |

### CLIENT DOMAIN
*7,999 lines | 76 handlers | 19 files*

**Priority: MEDIUM.**
`clientRoutes.ts` (1,604L) — core client management.
`contractPipelineRoutes.ts` (786L) — contract lifecycle.
Both should use canonical services. Currently likely have inline DB queries.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `clientRoutes.ts` | 1,604 | 28 | `GET /`; `GET /lookup` | ⚠️ YES |
| ⚠️ `salesInlineRoutes.ts` | 907 | 10 | `GET /templates`; `GET /leads` | ⚠️ YES |
| ⚠️ `contractPipelineRoutes.ts` | 786 | 25 | `GET /templates`; `POST /templates` | ✅ no |
| ⚠️ `leaderRoutes.ts` | 595 | 0 | — | ✅ no |
| ⚠️ `clientCommsRoutes.ts` | 550 | 7 | `GET /threads`; `POST /threads` | ⚠️ YES |
| 🔸 `salesPipelineRoutes.ts` | 431 | 0 | — | ✅ no |
| 🔸 `leadCrmRoutes.ts` | 408 | 0 | — | ⚠️ YES |
| 🔸 `salesRoutes.ts` | 392 | 0 | — | ⚠️ YES |
| 🔸 `rfpPipelineRoutes.ts` | 309 | 0 | — | ✅ no |
| 🔸 `subcontractorRoutes.ts` | 283 | 0 | — | ⚠️ YES |
| 🔸 `contractRenewalRoutes.ts` | 260 | 0 | — | ⚠️ YES |
| 🔸 `clientSatisfactionRoutes.ts` | 251 | 0 | — | ⚠️ YES |
| 🔸 `proposalRoutes.ts` | 236 | 0 | — | ✅ no |
| 🔸 `rfpEthicsRoutes.ts` | 227 | 0 | — | ✅ no |
| 🔸 `clientPortalInviteRoutes.ts` | 224 | 3 | `GET /portal/setup/:token`; `POST /portal/setup/:token` | ⚠️ YES |
| 🔸 `clientServiceRequestRoutes.ts` | 223 | 3 | `GET /`; `POST /` | ✅ no |
| ✅ `publicLeads.ts` | 197 | 0 | — | ✅ no |
| ✅ `domains/clients.ts` | 81 | 0 | — | ✅ no |
| ✅ `domains/sales.ts` | 35 | 0 | — | ✅ no |

### COMPLIANCE DOMAIN
*7,441 lines | 123 handlers | 14 files*

**Priority: MEDIUM — Regulatory partnership goal.**
`complianceRoutes.ts` (1,823L) in root should delegate to `compliance/` subfolder.
The subfolder has 12 files with clear domain boundaries — use them.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `complianceRoutes.ts` | 1,823 | 51 | `POST /auditor/login`; `POST /auditor/set-password` | ⚠️ YES |
| ⚠️ `compliance/regulatoryPortal.ts` | 1,279 | 26 | `POST /lookup`; `POST /request` | ⚠️ YES |
| ⚠️ `officerCertificationRoutes.ts` | 908 | 13 | `POST /seed-modules`; `GET /modules` | ⚠️ YES |
| 🔸 `policyComplianceRoutes.ts` | 450 | 0 | — | ✅ no |
| 🔸 `safetyRoutes.ts` | 441 | 0 | — | ✅ no |
| 🔸 `complianceScenarioRoutes.ts` | 409 | 8 | `GET /acme-scenarios`; `GET /workspace-scan` | ✅ no |
| 🔸 `stateRegulatoryRoutes.ts` | 407 | 17 | `GET /state-context`; `GET /state-context/tax-summary` | ✅ no |
| 🔸 `license-dashboard.ts` | 392 | 4 | `GET /dashboard`; `GET /export/dps-csv` | ✅ no |
| 🔸 `complianceEvidenceRoutes.ts` | 309 | 0 | — | ✅ no |
| 🔸 `compliance/regulatoryEnrollment.ts` | 277 | 4 | `GET /status`; `GET /workspace` | ⚠️ YES |
| 🔸 `complianceReportsRoutes.ts` | 261 | 0 | — | ✅ no |
| 🔸 `complianceSprintRoutes.ts` | 251 | 0 | — | ✅ no |
| ✅ `complianceInlineRoutes.ts` | 136 | 0 | — | ⚠️ YES |
| ✅ `domains/compliance.ts` | 98 | 0 | — | ✅ no |

### TRINITY DOMAIN
*15,805 lines | 203 handlers | 36 files*

**Priority: MEDIUM — Core autonomy.**
AI brain split across many files with unclear boundaries.
Before touching: map which Trinity actions each file owns.
`ai-brain-routes.ts` (1,645L) + `aiBrainInlineRoutes.ts` (1,171L) — audit overlap.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `ai-brain-routes.ts` | 1,645 | 0 | — | ⚠️ YES |
| ⚠️ `helpai-routes.ts` | 1,297 | 0 | — | ⚠️ YES |
| ⚠️ `trinityInsightsRoutes.ts` | 1,240 | 27 | `GET /insights`; `POST /insights/:id/read` | ✅ no |
| ⚠️ `aiBrainInlineRoutes.ts` | 1,171 | 0 | — | ✅ no |
| ⚠️ `subagentRoutes.ts` | 775 | 27 | `GET /subagents`; `GET /subagents/:id` | ⚠️ YES |
| ⚠️ `helpAITriageRoutes.ts` | 760 | 2 | `POST /triage`; `GET /my-workspace-history` | ✅ no |
| ⚠️ `ai-brain-console.ts` | 693 | 0 | — | ✅ no |
| ⚠️ `trinityMaintenanceRoutes.ts` | 598 | 12 | `GET /health`; `POST /quickbooks/refresh` | ✅ no |
| ⚠️ `trinityStaffingRoutes.ts` | 546 | 12 | `GET /status`; `GET /settings` | ✅ no |
| ⚠️ `agentActivityRoutes.ts` | 512 | 11 | `GET /active`; `GET /completions` | ⚠️ YES |
| 🔸 `trinityAgentDashboardRoutes.ts` | 473 | 7 | `GET /queue`; `GET /queue/:workspaceId` | ✅ no |
| 🔸 `trinityRevenueRoutes.ts` | 470 | 4 | `POST /dev/repair-invoices`; `POST /dev/run-payroll` | ✅ no |
| 🔸 `sra/sraTrinityRoutes.ts` | 429 | 5 | `POST /chat`; `GET /sections` | ⚠️ YES |
| 🔸 `trinityTransparencyRoutes.ts` | 418 | 8 | `GET /overview`; `GET /actions` | ✅ no |
| 🔸 `ai-brain-capabilities.ts` | 369 | 0 | — | ✅ no |
| 🔸 `trinityNotificationRoutes.ts` | 361 | 0 | — | ✅ no |
| 🔸 `trinitySchedulingRoutes.ts` | 359 | 4 | `GET /insights`; `POST /auto-fill` | ⚠️ YES |
| 🔸 `trinityChatRoutes.ts` | 345 | 7 | `POST /chat`; `GET /history` | ✅ no |
| 🔸 `aiBrainControlRoutes.ts` | 322 | 14 | `GET /health`; `GET /services` | ✅ no |
| 🔸 `trinityIntelligenceRoutes.ts` | 271 | 17 | `GET /regulatory/rules`; `GET /regulatory/upcoming-reviews` | ✅ no |
| 🔸 `trinity-alerts.ts` | 258 | 7 | `GET /alerts`; `GET /status` | ✅ no |
| 🔸 `trinitySelfEditRoutes.ts` | 253 | 14 | `GET /rules`; `PATCH /rules` | ✅ no |
| 🔸 `aiBrainMemoryRoutes.ts` | 241 | 0 | — | ✅ no |
| 🔸 `trinityIntakeRoutes.ts` | 237 | 4 | `POST /intake/start`; `POST /intake/:sessionId/respond` | ✅ no |
| 🔸 `domains/trinity.ts` | 233 | 0 | — | ✅ no |
| 🔸 `trinityControlConsoleRoutes.ts` | 207 | 5 | `GET /stream`; `GET /timeline` | ✅ no |
| 🔸 `trinityCrisisRoutes.ts` | 202 | 0 | — | ✅ no |
| ✅ `trinityThoughtStatusRoutes.ts` | 166 | 1 | `GET /` | ✅ no |
| ✅ `trinityLimbicRoutes.ts` | 164 | 4 | `POST /detect`; `POST /officer-burnout/:officerId` | ✅ no |
| ✅ `trinitySwarmRoutes.ts` | 161 | 0 | — | ✅ no |
| ✅ `trinityDecisionRoutes.ts` | 117 | 3 | `GET /decisions`; `GET /decisions/:entityType/:entityId` | ✅ no |
| ✅ `trinityAuditRoutes.ts` | 113 | 2 | `GET /audit-trail`; `GET /audit-trail/failures` | ✅ no |
| ✅ `trinityEscalationRoutes.ts` | 112 | 3 | `GET /pending`; `POST /check` | ✅ no |
| ✅ `trinityMiscRoutes.ts` | 109 | 0 | — | ✅ no |
| ✅ `trinityOrgStateRoutes.ts` | 89 | 3 | `GET /org-state/:workspaceId`; `GET /org-vitals/:workspaceId` | ✅ no |
| ✅ `trinitySessionRoutes.ts` | 89 | 0 | — | ✅ no |

### CHAT DOMAIN
*16,406 lines | 92 handlers | 22 files*

**Priority: LOW for go-live.**
`chat.ts` (1,666L) + `chatInlineRoutes.ts` (1,316L) — consolidate boundary.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `chat-rooms.ts` | 2,828 | 0 | — | ⚠️ YES |
| ⚠️ `chat-management.ts` | 1,923 | 0 | — | ⚠️ YES |
| ⚠️ `internalEmails.ts` | 1,668 | 0 | — | ⚠️ YES |
| ⚠️ `chat.ts` | 1,666 | 21 | `GET /api/chat/conversations`; `POST /api/chat/conversations` | ✅ no |
| ⚠️ `chatInlineRoutes.ts` | 1,316 | 25 | `GET /conversations`; `POST /conversations` | ✅ no |
| ⚠️ `inboundEmailRoutes.ts` | 1,037 | 0 | — | ✅ no |
| ⚠️ `email/emailRoutes.ts` | 786 | 0 | — | ✅ no |
| ⚠️ `chat-uploads.ts` | 631 | 0 | — | ✅ no |
| ⚠️ `emailUnsubscribe.ts` | 620 | 0 | — | ⚠️ YES |
| ⚠️ `broadcasts.ts` | 602 | 15 | `POST /`; `GET /` | ✅ no |
| 🔸 `dockChatRoutes.ts` | 409 | 0 | — | ✅ no |
| 🔸 `externalEmailRoutes.ts` | 404 | 0 | — | ⚠️ YES |
| 🔸 `support-chat.ts` | 401 | 14 | `POST /session`; `POST /session/:sessionId/message` | ✅ no |
| 🔸 `privateMessageRoutes.ts` | 382 | 9 | `GET /conversations`; `GET /:conversationId` | ✅ no |
| 🔸 `messageBridgeRoutes.ts` | 373 | 0 | — | ⚠️ YES |
| 🔸 `emails.ts` | 277 | 0 | — | ✅ no |
| 🔸 `smsRoutes.ts` | 266 | 0 | — | ✅ no |
| 🔸 `interviewChatroomRoutes.ts` | 229 | 8 | `POST /chatrooms`; `POST /chatrooms/:id/start` | ✅ no |
| 🔸 `staffingBroadcastRoutes.ts` | 226 | 0 | — | ✅ no |
| ✅ `chat-export.ts` | 156 | 0 | — | ✅ no |
| ✅ `email-attachments.ts` | 134 | 0 | — | ✅ no |
| ✅ `domains/comms.ts` | 72 | 0 | — | ✅ no |

### AUTH DOMAIN
*14,934 lines | 222 handlers | 17 files*

**Priority: MEDIUM — Auth must be solid.**
`authCoreRoutes.ts` (1,849L) — core, handle carefully.
`workspaceInlineRoutes.ts` (1,937L) — large, audit for inline DB.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `oauthIntegrationRoutes.ts` | 2,765 | 30 | `GET /quickbooks/diagnostic`; `POST /quickbooks/connect` | ⚠️ YES |
| ⚠️ `adminRoutes.ts` | 2,389 | 75 | `POST /dev-execute`; `PATCH /workspace/:workspaceId` | ⚠️ YES |
| ⚠️ `workspaceInlineRoutes.ts` | 1,937 | 28 | `POST /switch/:workspaceId`; `GET /health` | ⚠️ YES |
| ⚠️ `authCoreRoutes.ts` | 1,849 | 0 | — | ⚠️ YES |
| ⚠️ `platformRoutes.ts` | 1,848 | 37 | `GET /stats`; `GET /personal-data` | ⚠️ YES |
| ⚠️ `platformFormsRoutes.ts` | 1,188 | 18 | `GET /`; `GET /invitations` | ✅ no |
| ⚠️ `workspace.ts` | 853 | 11 | `GET /all`; `POST /` | ⚠️ YES |
| 🔸 `platformFeedbackRoutes.ts` | 412 | 6 | `GET /active`; `GET /surveys` | ✅ no |
| 🔸 `platformConfigValuesRoutes.ts` | 321 | 0 | — | ✅ no |
| 🔸 `adminPermissionRoutes.ts` | 293 | 7 | `GET /meta`; `GET /workspaces` | ✅ no |
| 🔸 `financialAdminRoutes.ts` | 275 | 0 | — | ✅ no |
| 🔸 `adminWorkspaceDetailsRoutes.ts` | 209 | 2 | `GET /workspaces/:id/details`; `GET /search` | ✅ no |
| ✅ `roleLabelRoutes.ts` | 146 | 3 | `GET /`; `PUT /:role` | ✅ no |
| ✅ `securityAdminRoutes.ts` | 142 | 0 | — | ✅ no |
| ✅ `permissionMatrixRoutes.ts` | 140 | 4 | `GET /`; `GET /meta` | ✅ no |
| ✅ `adminDevExecuteRoute.ts` | 122 | 1 | `POST /dev-execute` | ✅ no |
| ✅ `domains/auth.ts` | 45 | 0 | — | ✅ no |

### REPORTING DOMAIN
*5,670 lines | 22 handlers | 10 files*

**Priority: LOW for go-live.**
Report routes are read-only. Correctness matters more than refactoring here.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `analyticsRoutes.ts` | 1,661 | 0 | — | ⚠️ YES |
| ⚠️ `qbReportsRoutes.ts` | 822 | 0 | — | ✅ no |
| ⚠️ `reportsRoutes.ts` | 695 | 12 | `POST /generate`; `POST /share` | ⚠️ YES |
| ⚠️ `biAnalyticsRoutes.ts` | 542 | 10 | `GET /calloff-rates`; `GET /license-expiry` | ✅ no |
| 🔸 `ownerAnalytics.ts` | 498 | 0 | — | ⚠️ YES |
| 🔸 `dashboardRoutes.ts` | 429 | 0 | — | ⚠️ YES |
| 🔸 `insightsRoutes.ts` | 405 | 0 | — | ⚠️ YES |
| 🔸 `mobileWorkerRoutes.ts` | 252 | 0 | — | ✅ no |
| 🔸 `bidAnalyticsRoutes.ts` | 241 | 0 | — | ⚠️ YES |
| ✅ `metricsRoutes.ts` | 125 | 0 | — | ✅ no |

### OPS DOMAIN
*4,921 lines | 23 handlers | 9 files*

**Priority: HIGH for security companies.**
`cadRoutes.ts` (589L), `rmsRoutes.ts` (1,728L) — core security ops.
Incidents, dispatch, GPS tracking must be reliable.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `rmsRoutes.ts` | 1,728 | 0 | — | ✅ no |
| ⚠️ `spsFormsRoutes.ts` | 630 | 0 | — | ⚠️ YES |
| ⚠️ `cadRoutes.ts` | 589 | 0 | — | ✅ no |
| ⚠️ `armoryRoutes.ts` | 512 | 11 | `GET /inspections`; `POST /inspections` | ⚠️ YES |
| 🔸 `incidentPipelineRoutes.ts` | 402 | 0 | — | ✅ no |
| 🔸 `dispatch.ts` | 349 | 10 | `POST /gps`; `GET /units` | ✅ no |
| 🔸 `guardTourRoutes.ts` | 311 | 0 | — | ⚠️ YES |
| 🔸 `incidentPatternRoutes.ts` | 311 | 0 | — | ⚠️ YES |
| ✅ `gpsRoutes.ts` | 89 | 2 | `POST /breadcrumb`; `GET /trail/:timeEntryId` | ✅ no |

### SUPPORT DOMAIN
*4,989 lines | 82 handlers | 6 files*

**Priority: LOW for go-live.**
Support tools are internal. Functional but not customer-facing at launch.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `support-command-console.ts` | 1,543 | 0 | — | ⚠️ YES |
| ⚠️ `supportRoutes.ts` | 1,534 | 29 | `POST /escalate`; `POST /create-ticket` | ⚠️ YES |
| ⚠️ `helpdeskRoutes.ts` | 1,219 | 29 | `POST /session/start`; `POST /session/:sessionId/message` | ⚠️ YES |
| 🔸 `supportActionRoutes.ts` | 350 | 14 | `GET /api/support/actions/available`; `POST /api/support/actions/view-user` | ✅ no |
| 🔸 `feedbackRoutes.ts` | 308 | 10 | `POST /`; `GET /` | ✅ no |
| ✅ `domains/support.ts` | 35 | 0 | — | ✅ no |

### BLOAT DOMAIN
*7,591 lines | 83 handlers | 8 files*

**Priority: DELETE FIRST — biggest quick win.**
`miscRoutes.ts` (2,776L) — audit each handler, move or delete.
`devRoutes.ts` (2,458L) — add production guard: `if (process.env.NODE_ENV !== 'production')`.
`sandbox-routes.ts` (949L) — likely all dev-only.
Potential: ~5,000L deleted with zero user impact.

| File | Lines | Handlers | Key Routes | Inline DB? |
|---|---|---|---|---|
| ⚠️ `miscRoutes.ts` | 2,776 | 0 | — | ⚠️ YES |
| ⚠️ `devRoutes.ts` | 2,458 | 25 | `POST /seed-expired-keys`; `POST /trigger-automation/:jobType` | ⚠️ YES |
| ⚠️ `sandbox-routes.ts` | 949 | 30 | `GET /status`; `POST /seed` | ⚠️ YES |
| ⚠️ `quickFixRoutes.ts` | 512 | 11 | `GET /actions`; `GET /suggestions` | ✅ no |
| 🔸 `migration.ts` | 373 | 0 | — | ✅ no |
| 🔸 `bugRemediation.ts` | 224 | 9 | `POST /submit`; `GET /report/:id` | ✅ no |
| ✅ `developerPortalRoutes.ts` | 171 | 5 | `GET /keys`; `POST /keys` | ✅ no |
| ✅ `deviceLoaderRoutes.ts` | 128 | 3 | `GET /settings`; `POST /profile` | ✅ no |

---

## SERVICE FILES — FULL EXPORT REGISTRY

Use these. Don't reimplement. Copy the function name exactly.

### Payroll Services
**`payrollAutomation.ts`** (2369L): `voidPayrollRun(runId: string,
  workspaceId: )`, `amendPayrollEntry(entryId: string,
  workspaceId)`, `executePayrollEntry(entry: any,
  workspaceId: str)`, `executeInternalPayroll(workspaceId: string,
  payroll)`

**`automation/payrollHoursAggregator.ts`** (507L): `aggregatePayrollHours(params: {
  workspaceId: strin)`, `markEntriesAsPayrolled(params: {
  timeEntryIds: stri)`

**`ai-brain/trinityTimesheetPayrollCycleActions.ts`** (482L): `registerTimesheetPayrollCycleActions()`

**`trinity/workflows/payrollAnomalyWorkflow.ts`** (407L): `executePayrollAnomalyWorkflow(params: PayrollAnomalyParams,)`, `runPayrollAnomalyScan()`

**`payrollDeductionService.ts`** (392L): `getDeductionLimit(deductionType: string,
  emplo)`, `getYtdDeductions(employeeId: string,
  deductio)`, `validateDeductionAmount(employeeId: string,
  deductio)`, `calculatePreTaxReduction(grossPay: number,
  preTaxDedu)`, `calculateTotalDeductions(payrollEntryId: string)`, `calculateTotalGarnishments(payrollEntryId: string)`

**`payroll/payrollSupplementalPayService.ts`** (385L): `createBonusPayEntry(workspaceId: string,
  userId:)`, `createCommissionPayEntry(workspaceId: string,
  userId:)`

**`payroll/payrollBankAccountService.ts`** (384L): `maskBankAccount(row: typeof employeeBankAccoun)`, `listBankAccounts(params: Pick<BankAccountServic)`, `addBankAccount(params: AddBankAccountParams)`, `updateBankAccount(params: UpdateBankAccountParam)`, `deactivateBankAccount(params: DeactivateBankAccountP)`, `verifyBankAccount(params: VerifyBankAccountParam)`

**`payroll/payrollRunCreationService.ts`** (369L): `createPayrollRunForPeriod({
  workspaceId,
  userId,
  u)`

**`automation/payrollReadinessScanner.ts`** (335L): `scanPayrollReadiness(workspaceId: string)`, `runPayrollReadinessScanForWorkspace(workspaceId: string)`, `runPayrollReadinessScanAllWorkspaces()`

**`billing/payrollAutoCloseService.ts`** (302L): `runPayrollAutoClose()`, `detectOrphanedPayrollRuns()`

**`payroll/payrollEmployeeSelfServiceService.ts`** (292L): `getMyPaychecks(userId: string)`, `getMyPayStub(userId: string,
  stubId: stri)`, `getMyPayrollInfo(userId: string)`, `updateMyPayrollInfo(params: UpdatePayrollInfoParam)`, `getYtdEarnings(employeeId: string,
  workspac)`

**`payroll/payrollNachaService.ts`** (274L): `generateNachaFile(workspaceId: string,
  runId: )`

**`payrollTransferMonitor.ts`** (252L): `startPayrollTransferMonitor()`, `stopPayrollTransferMonitor()`

**`payroll/payrollTaxCenterService.ts`** (243L): `getTaxCenterData(workspaceId: string, taxYearOv)`, `getPreRunChecklist(workspaceId: string)`

**`payroll/payrollRunProcessStateService.ts`** (231L): `processPayrollRunState({
  workspaceId,
  payrollRunI)`

**`payroll/payrollTaxFilingGuideService.ts`** (228L): `getPayrollTaxFilingDeadlines()`, `getPayrollTaxFilingGuide(formType: string)`, `getPayrollStatePortals()`, `getPayrollTaxCenter()`

**`payroll/payrollLedger.ts`** (221L): `checkPayrollPeriodOverlap(workspaceId: string,
  propose)`, `assertNoPeriodOverlap(workspaceId: string,
  propose)`, `getPayrollLedgerSummary(workspaceId: string)`

**`payroll/payrollRunApprovalService.ts`** (208L): `approvePayrollRun(params: ApprovePayrollRunParam)`

**`payroll/payrollProposalApprovalService.ts`** (207L): `approvePayrollProposal({
  proposalId,
  workspaceId,)`

**`payroll/payrollRunMarkPaidService.ts`** (205L): `markPayrollRunPaid({
  workspaceId,
  payrollRunI)`

**`payroll/payrollRunVoidService.ts`** (204L): `voidPayrollRun({
  workspaceId,
  payrollRunI)`

**`payroll/achTransferService.ts`** (199L): `verifyEmployeeBankAccount(params: {
  workspaceId: strin)`, `initiatePayrollAchTransfer(params: {
  workspaceId: strin)`

**`billing/payrollTaxService.ts`** (186L): `calculatePayrollTaxes(input: PayrollTaxInput)`

**`billing/payrollDeadlineNudgeService.ts`** (175L): `runPayrollDeadlineNudge()`

**`finance/payrollExportService.ts`** (169L): `generateExportPayload(payrollRunId: string,
  worksp)`, `formatForCSV(payload: ExportPayload)`

**`payroll/payrollCsvExportService.ts`** (164L): `buildPayrollCsvExport(params: PayrollCsvExportParams)`

**`payroll/payrollTaxFormService.ts`** (164L): `generate941(params: Form941Params)`, `generate940(params: Form940Params)`, `generateTaxForm(params: TaxFormGenerateParams)`

**`payroll/payrollPdfExportService.ts`** (148L): `generatePayrollRunPdf(workspaceId: string,
  runId: )`

**`payroll/payrollRetryService.ts`** (141L): `retryFailedPayrollTransfers(workspaceId: string,
  runId: )`

**`payroll/payrollEmployeeTaxFormsService.ts`** (127L): `getMyEmployeeTaxForms(params: {
  userId: string;
  )`, `getMyEmployeeTaxForm(params: {
  userId: string;
  )`

**`payroll/payrollSelfServiceFormatter.ts`** (120L): `formatPayrollSelfServicePaycheck(input: PayrollSelfServicePaych)`, `formatPayrollSelfServiceInfo(input: PayrollSelfServiceInfoI)`

**`payroll/payrollRunDeleteService.ts`** (118L): `deletePayrollRun({
  workspaceId,
  payrollRunI)`

**`payroll/payrollProposalRejectionService.ts`** (111L): `rejectPayrollProposal({
  proposalId,
  reason,
  us)`

**`payroll/payrollSettingsService.ts`** (102L): `getPayrollSettings(workspaceId: string)`, `setPayrollSettings(workspaceId: string, patch: Re)`, `ensurePayrollSettingsExist(workspaceId: string)`

**`payroll/payrollRunReadService.ts`** (94L): `listPayrollRuns({
  workspaceId,
  status,
  l)`, `getPayrollRun({
  workspaceId,
  payrollRunI)`

**`payroll/payrollEstimateMath.ts`** (89L): `calculatePayrollEstimate(input: PayrollEstimateInput)`

**`payroll/payrollTimeEntryClaimer.ts`** (84L): `claimPayrollTimeEntries({
  workspaceId,
  timeEntryId)`

**`payroll/payrollProposalReadService.ts`** (70L): `listPayrollProposals({
  workspaceId,
  status,
}: )`, `getPayrollProposal({
  workspaceId,
  proposalId,)`

**`payroll/payrollStatus.ts`** (56L): `isTerminalPayrollStatus(status: string | null | undefi)`, `isDraftPayrollStatus(status: string | null | undefi)`, `resolvePayrollLifecycleStatus(dbStatus?: string | null)`, `resolvePayrollDbStatus(lifecycleStatus: PayrollLifecy)`, `isValidPayrollTransition(currentDbStatus: string, nextL)`

### Billing Services
**`billing/stripeWebhooks.ts`** (2011L): `stripeWebhookService`

**`billing/invoice.ts`** (1962L): `invoiceService`

**`billingAutomation.ts`** (1672L): `generateUsageBasedInvoices`, `generateInvoiceForClient`, `sendInvoiceViaStripe`, `generateWeeklyInvoices`

**`timesheetInvoiceService.ts`** (1331L): `generateInvoiceFromTimesheets`, `getUninvoicedTimeEntries`, `sendInvoice`, `markInvoicePaid`

**`billing/middlewareTransactionFees.ts`** (1223L): `chargePayrollMiddlewareFee`, `chargeInvoiceMiddlewareFee`, `chargePayoutMiddlewareFee`, `chargeAiCreditOverageFee`

**`billing/subscriptionManager.ts`** (1115L): `TIER_PRICING`, `subscriptionManager`

**`partners/billingOrchestrationService.ts`** (1078L): `registerBillingOrchestrationActions`, `identityReconcilerAgent`, `idempotencyGuardAgent`, `policyRulesAgent`

**`billing/weeklyBillingRunService.ts`** (1045L): `initializeWeeklyBillingRunService`, `weeklyBillingRunService`

**`ai-brain/subagents/invoiceSubagent.ts`** (934L): `invoiceSubagent`

**`billing/featureGateService.ts`** (850L): `featureGateService`

**`billing/trialConversionOrchestrator.ts`** (832L): `initializeTrialConversionOrchestrator`, `trialConversionOrchestrator`

**`billing/tokenManager.ts`** (708L): `isUnlimitedTokenUser`, `getWorkspaceTierAllowance`, `TOKEN_FREE_FEATURES`, `SUPPORT_POOL_FEATURES`, `TIER_TOKEN_ALLOCATIONS`

**`invoiceAdjustmentService.ts`** (602L): `creditInvoice`, `discountInvoice`, `refundInvoice`, `correctInvoiceLineItem`

**`billing/stripeEventBridge.ts`** (594L): `initializeStripeEventBridge`, `stripeEventBridge`

**`billing/revenueRecognitionService.ts`** (591L): `generateMonthlySchedule`, `createScheduleForInvoice`, `recognizeCashRevenueOnPayment`, `runMonthlyRecognitionForWorkspace`, `revenueRecognitionService`

### Document & Vault Services
**`documents/templateRegistry.ts`** (1647L): `getTemplate`, `getAllTemplates`, `getTemplatesByCategory`, `getTemplateForLanguage`

**`ai-brain/trinityDocumentActions.ts`** (843L): `registerTrinityDocumentActions`, `scanOverdueI9s`

**`formsPdfService.ts`** (535L): `generateFormSubmissionPdf`, `generateAndStorePdf`, `generateAndGetPdf`, `generateCustomFormPdf`

**`documents/businessDocumentGenerators.ts`** (531L): `generateProofOfEmployment`, `generateDirectDepositConfirmation`, `generatePayrollRunSummary`, `generateW3Transmittal`

**`documents/businessFormsVaultService.ts`** (415L): `saveToVault`, `getVaultRecord`, `listVaultRecords`

**`billing/platformServicesMeter.ts`** (408L): `trackEmailUsage`, `trackSMSUsage`

---

## JACK'S COMMIT CHECKLIST

Before every commit:
- [ ] Did I read the domain section above?
- [ ] Did I check Known Duplicates for this domain?
- [ ] Am I using a canonical service from the table above?
- [ ] Does my commit REDUCE total line count?
- [ ] Did I copy import paths exactly (no guessing at paths)?
- [ ] Did I leave a clear handoff note for Claude in AGENT_HANDOFF.md?

After every commit:
- Claude pulls, runs `node build.mjs`, verifies
- If build fails, Claude fixes the path/import issue and pushes fix
- Ball goes back to Jack

---

## QUICK REFERENCE — COMMON PATTERNS

### Thin route wrapper (the pattern we want everywhere):
```typescript
router.post('/some-route', mutationLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const roleCheck = checkManagerRole(req);
    if (!roleCheck.allowed) return res.status(roleCheck.status || 403).json({ message: roleCheck.error });
    const workspaceId = req.workspaceId!;
    const result = await canonicalService({ workspaceId, ...req.body });
    if (!result.success) return res.status(result.status || 500).json({ message: result.error });
    res.json(result.data);
  } catch (error: unknown) {
    const status = (error as any)?.status || 500;
    log.error('Error description:', error);
    res.status(status).json({ message: error instanceof Error ? sanitizeError(error) : 'Fallback message' });
  }
});
```

### SOC2 audit log call:
```typescript
storage.createAuditLog({
  workspaceId, userId, userEmail: req.user?.email || 'unknown', userRole: req.user?.role || 'user',
  action: 'create' | 'update' | 'delete',
  entityType: 'entity_name', entityId: id,
  actionDescription: 'Human readable description',
  changes: { before: oldState, after: newState },
  isSensitiveData: true, complianceTag: 'soc2',
}).catch(err => log.warn('[Audit] Non-blocking audit fail:', err?.message));
```

### Status-aware error pattern:
```typescript
} catch (error: unknown) {
  const status = (error as any)?.status || (error as any)?.statusCode || 500;
  const extra = (error as any)?.extra || {};
  log.error('[ServiceName] Error:', error);
  res.status(status).json({
    message: error instanceof Error ? sanitizeError(error) : 'Failed to perform operation',
    ...extra,
  });
}
```

### Throw a status-coded error from a service:
```typescript
function statusError(message: string, status: number, extra?: Record<string, unknown>) {
  const err = new Error(message) as any;
  err.status = status;
  if (extra) err.extra = extra;
  return err;
}
// Usage: throw statusError('Not found', 404);
// Usage: throw statusError('Already approved', 409, { currentStatus: run.status });
```

---
*Last updated: 2026-04-25 | Run `python3 scripts/generate-index.py` to refresh*
