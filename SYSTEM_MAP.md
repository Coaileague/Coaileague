# COAILEAGUE SYSTEM MAP v5.0
# Last updated: 2026-05-03
# Purpose: Canonical map of what exists, where it lives, and how it connects.
# Read this before adding ANYTHING to avoid duplication and conflicts.

---

## WAVE COMPLETION STATUS

| Wave | Domains | Status | Key Deliverables |
|---|---|---|---|
| 1 | Infrastructure, Auth, RBAC, Orgs, Notifications | ✅ | Auth pipeline, WS, rate limiting, dedup |
| 2 | Onboarding, Workforce, Compliance, Training, Documents | ✅ | HR forms, DPS license compliance, PDF generation |
| 3 | Scheduling, Time, Ops, FieldOps, Auditor | ✅ | Anti-spoofing, storage typing, panic chain, contracts |
| 4 | Billing, Payroll, Finance, Clients, Sales | 🔲 NEXT | Revenue domain audit |

---

## THE LIFECYCLE PIPELINE (master flow — DO NOT BREAK)

```
Client signs contract (POST /api/client-portal/:clientId/sign-contract)
  clientLifecycleStatus = 'active'  ←── financial gate cleared
  client_contract_signed event ──→ AutomationTriggerService ──→ Trinity notifies manager

Manager publishes schedule (POST /api/schedules/publish)
  Financial gate: clientLifecycleStatus must be 'active' or 403 PUBLISH_BLOCKED
  Shifts updated to 'scheduled'
  WebSocket: type='schedule_published' ──→ ForceRefreshProvider invalidates queries
  AutomationTriggerService: generateWeeklyInvoices()

Stripe invoice paid ──→ /api/webhooks/stripe
  invoice_paid event ──→ owner notification
  AR close-out

Timesheet approved ──→ time_entries_approved event
  executePayrollProcessing() ──→ requestApproval()
  Manager approves ──→ executeApprovedPayroll()
  W-2: calculatePayrollTaxes() (federal + FICA + state)
  1099: isContractor=true → skip withholding
  initiatePayrollAchTransfer() (Plaid) ──→ payroll_run_paid ──→ employee notified

Lone worker misses check-in (*/5 cron)
  nextCheckInDue > 15min ago → panicAlertService.triggerAlert()
  SMS blast to full supervisor chain
  loneWorkerSessions.status = 'escalated'
```

---

## DOMAIN OWNERSHIP MAP

| Domain | Schema file | Route mount | Key service |
|---|---|---|---|
| Auth | `shared/schema/domains/auth/` | `/api/auth` via `domains/auth.ts` | `server/auth.ts` |
| Orgs | `shared/schema/domains/orgs/` | `/api/orgs` via `domains/orgs.ts` | `workspaceLifecycleService.ts` |
| Scheduling | `shared/schema/domains/scheduling/` | `/api/shifts`, `/api/schedules` | `schedulesRoutes.ts`, `shiftRoutes.ts` |
| Time | `shared/schema/domains/time/` | `/api/time-entries`, `/api/breaks` | `time-entry-routes.ts` |
| Ops | `shared/schema/domains/ops/` | `/api/incident-pipeline`, `/api/safety` | `panicAlertService.ts` |
| FieldOps | `shared/schema/domains/ops/` | `/api/safety/*geofences*` | `safetyRoutes.ts` |
| Auditor | `shared/schema/domains/compliance/` | `/api/regulatory-portal` | `regulatoryPortal.ts` |
| Billing | `shared/schema/domains/billing/` | `/api/billing`, `/api/invoices` | `billingAutomation.ts` |
| Payroll | `shared/schema/domains/payroll/` | `/api/payroll` | `payrollAutomation.ts`, `achTransferService.ts` |
| Clients | `shared/schema/domains/clients/` | `/api/clients`, `/api/client-portal` | `clientPortalSignContractRoutes.ts` |
| Finance | `shared/schema/domains/billing/` | `/api/financial-reports`, `/api/trinity-cfo` | `financialReportsService.ts`, `cfoTools.ts` |
| Workforce | `shared/schema/domains/workforce/` | `/api/employees` | `employeeRoutes.ts` |
| Compliance | `shared/schema/domains/compliance/` | `/api/compliance/*` | `regulatoryPortal.ts` |
| Training | `shared/schema/domains/training/` | `/api/training` | `trainingCertificationRoutes.ts` |
| Documents | `shared/schema/domains/sps/` | `/api/documents` | `documentRoutes.ts` |
| Trinity | `shared/schema/domains/trinity/` | `/api/trinity-chat`, `/api/trinity-cfo` | `trinityChatService.ts`, `cfoTools.ts` |

---

## STORAGE ARCHITECTURE (enforce this strictly)

### The Law: All uploads go through buildStoragePath()
```typescript
import { uploadFileToObjectStorage, buildStoragePath, StorageDirectory } from '../objectStorage';

// CORRECT — compiler enforces workspaceId namespace
const path = buildStoragePath(workspaceId, StorageDirectory.INCIDENTS, incidentId, filename);
await uploadFileToObjectStorage({ objectPath: path, buffer, workspaceId, storageCategory: 'media' });

// WRONG — bypass detected in Wave 3 audit
const path = `incidents/${filename}`; // ❌ no workspaceId namespace
```

### StorageDirectory enum values (all valid paths):
```
INCIDENTS       → workspaces/{wsId}/incidents/{entityId}/{filename}
CONTRACTS       → workspaces/{wsId}/contracts/{entityId}/{filename}  
CHAT            → workspaces/{wsId}/chat/{entityId}/{filename}
DPS_LICENSES    → workspaces/{wsId}/dps-licenses/{entityId}/{filename}
TIME_PHOTOS     → workspaces/{wsId}/time-photos/{entityId}/{filename}
DAR_ATTACHMENTS → workspaces/{wsId}/dar-attachments/{entityId}/{filename}
PAYROLL         → workspaces/{wsId}/payroll/{entityId}/{filename}
TAX_FORMS       → workspaces/{wsId}/tax-forms/{entityId}/{filename}
COMPLIANCE_DOCS → workspaces/{wsId}/compliance-docs/{entityId}/{filename}
AUDIT_EXPORTS   → workspaces/{wsId}/audit-exports/{entityId}/{filename}
CLIENT_DOCS     → workspaces/{wsId}/client-docs/{entityId}/{filename}
```

### Photo URL Validation (Wave 3 hardening):
Clock-in photos MUST come from our GCS bucket. `validateStoragePhotoUrl()` in `time-entry-routes.ts` enforces this. External URLs return 400 EXTERNAL_PHOTO_URL_REJECTED.

---

## TRINITY ARCHITECTURE (immutable rules)

### Identity
- Trinity is ONE unified individual — not modes, not toggles, not personalities
- Purple = Trinity elements exclusively
- Gold = HelpAI exclusively
- Trinity NEVER provides legal advice
- Trinity NEVER assumes duty of care

### Autonomy Ladder (per-workspace, stored in trinity_workspace_autonomy)
```
off                  → Read-only, no actions
advisory             → Recommends, waits for explicit confirm
order_execution      → DEFAULT. Executes operator orders within risk limits
supervised_autonomous → Proactively queues high-confidence low-risk fixes
```
Hard ceilings (non-bypassable regardless of autonomy mode):
- Dollar threshold table in `financialApprovalThresholds.ts`
- Public safety boundary (CLAUDE.md / TRINITY.md)
- `trinityConscience.ts` veto rules

### Trinity CFO Tools (read-only, safe to call in any context)
```typescript
import { monthlyPnL, arAgingSummary, cashRunway, expenseTrend,
         clientProfitability, companyHealth } from '../services/trinity/cfoTools';
```

### Action Budget
- Hard ceiling: 300 total registered Trinity actions
- Current estimate: ~280 (check `platformActionHub.ts` before registering more)

---

## NOTIFICATION SYSTEM

### Dedup Window: 6 hours (NOTIFICATION_DEDUP_WINDOW_MS in shared/config/notificationConfig.ts)
Exception: Panic alerts use unique idempotency key `panic_sms_{alertId}_{recipientId}` — always fires regardless of dedup.

### Panic Alert chain (never touch this without legal approval):
1. `panicAlertService.triggerAlert()` → DB insert → `notifyEmergencyContacts()` → SMS to all managers/owners
2. `broadcastToWorkspace({ type: 'safety:panic_alert', priority: 'critical', requiresAcknowledgment: true })`
3. `platformEventBus.publish({ type: 'panic_alert_triggered', metadata: { priority: 'CRITICAL' } })`
4. `autoCreateCadCall()` → CAD-SOS-{alertNumber}

Tier: `panic_alerts: 'free'` — NEVER blocked by billing. Check `tierDefinitions.ts`.

---

## WEBSOCKET EVENT NAMES (frontend must subscribe to exact strings)

Events the server emits via `broadcastToWorkspace()`:
```
shift_created           → shift added
shift_updated           → shift modified
shift_deleted           → shift removed
schedule_published      → week published (ForceRefreshProvider subscribed ✅)
shifts_bulk_created     → recurring pattern generated (ForceRefreshProvider subscribed ✅)
schedules_updated       → legacy alias (keep for backward compat)
safety:panic_alert      → panic triggered (priority: critical)
safety:panic_acknowledged
safety:panic_resolved
client_contract_signed  → contract signed, financial gate cleared
payroll_run_paid        → ACH initiated
```

**Critical:** The frontend bus dispatches by `data.type` string. If you add a new server event, you MUST add the matching `bus.subscribe('your_event', ...)` in `client/src/contexts/ForceRefreshProvider.tsx`.

---

## CRON JOB INVENTORY (autonomousScheduler.ts unless noted)

| Schedule | Job | File |
|---|---|---|
| `*/5 * * * *` | Shift reminders | autonomousScheduler.ts |
| `*/5 * * * *` | Lone worker SLA escalation → panic | autonomousScheduler.ts ← Wave 3 |
| `*/5 * * * *` | ReportBot check-in | autonomousScheduler.ts |
| `0 2 * * *` | Notification cleanup | notificationCleanupService.ts |
| `30 2 * * *` | Trinity social graph recalc | autonomousScheduler.ts |
| `30 2 * * *` | Officer score recompute | scoringScheduler.ts |
| `0 3 * * *` | AI usage daily rollup | autonomousScheduler.ts |
| `0 3 * * *` | Trinity incubation cycle | autonomousScheduler.ts |
| `0 3 * * *` | Token cleanup | tokenCleanupService.ts |

**Note:** Multiple jobs at the same time = NORMAL. They do different things. Only true duplicates (same job, multiple registrations) are removed.

---

## SCHEMA CONVENTIONS

### Enum placement
- New enums → `shared/schema/enums.ts` FIRST
- Then import into domain schema file
- NEVER define enums inline in domain files (breaks barrel exports)

### Workspace scoping
- Every query that returns tenant data MUST include `eq(table.workspaceId, workspaceId)`
- FK columns to shifts MUST be included in the shift DELETE cascade (app-layer in `shiftRoutes.ts`)

### Tax records
- `employeeTaxForms` table stores W-2 and 1099 with `formType: 'w2' | '1099'`
- Tax forms generated on-demand at year-end via `taxFormGeneratorService.ts`
- NOT generated per payroll run (correct behavior — IRS year-end aggregates)

---

## DEV LOGIN

```
GET /api/auth/dev-login       → Marcus Rivera (owner@acme-security.test)
GET /api/auth/dev-login-root  → Root admin
Password: admin123
```

---

## BUILD COMMANDS

```bash
node build.mjs                    # Production build
npx vitest run                    # Run all tests (270 expected to pass)
node build.mjs && npx vitest run  # Full gate check
```

Server TSC (memory-limited):
```bash
node --max-old-space-size=2048 node_modules/typescript/bin/tsc --project tsconfig.server.json --noEmit
```

---

## REPOSITORY

- **Repo:** Coaileague/Coaileague
- **Token:** `GH_TOKEN_REDACTED`
- **Deployment branch:** `main` → Railway (auto-deploy on push)
- **Work branch:** `development` → merge to main when green

---

## WAVE 4 — FINANCIAL & COMMERCIAL LOGIC (COMPLETE ✅)

### Client State Machine — Canonical ENUM
**File:** `shared/schema/enums.ts` → `clientLifecycleStatusEnum`
**Values:** `pending_onboarding | pending_approval | active | past_due | terminated`
- `pending_onboarding`: client record created, no contract
- `pending_approval`: client signed (Gate 1), awaiting SPS countersignature
- `active`: dual-signature complete — shifts CAN publish
- `past_due`: payment failure — shifts HARD-BLOCKED
- `terminated`: permanent — access revoked, sessions invalidated

### Service Agreement Double-Gate
**Route file:** `server/routes/clientPortalSignContractRoutes.ts`
- Gate 1: `POST /:clientId/sign-contract` → `pending_approval` (client sig only)
- Gate 2: `POST /:clientId/countersign` → `active` (SPS operator sig — MANAGER+ required)
- Publish gate in `schedulesRoutes.ts` checks `clientLifecycleStatus === 'active'` ONLY
- Schema columns on `clientContracts`: `clientSignatureData/At/By/Ip` + `counterSignatureData/At/By/Ip/Name`

### RBAC Guillotine
**File:** `server/middleware/requireActiveClientAgreement.ts`
- Blocks `terminated` → 403 + calls `revokeClientPortalSessions(clientId)`
- Blocks `past_due` → 403 with payment recovery URL
- Applied at: `server/routes/domains/clients.ts` → `/api/client-portal/*`
- Exempt: `/billing`, `/support`, `/coi`, `/health`

### Government ID Vault
**Table:** `clientIdentifications` (`shared/schema/domains/clients/index.ts`)
- Columns: idType, idNumber (last-4 only), frontImagePath, backImagePath, verificationStatus
- Status lifecycle: `pending → verified → rejected → expired`

### 10% Auto-Pay Discount
**File:** `server/services/billingAutomation.ts` inside `db.transaction()`
- Checks Stripe customer for active default payment method
- Injects `-10% Auto-Pay Discount` row into `invoiceLineItems` with snapshotted absolute dollar amount
- Adjusts invoice total in same transaction — atomic, no race conditions

### Stripe Connect — Multi-Party Routing
**File:** `server/services/billing/stripeConnectService.ts`
- `createDestinationCharge()`: client pays → funds route to tenant's Stripe Connect account via Destination Charges
- Platform takes `PLATFORM_FEE_PERCENT` (2.5%) as application_fee_amount
- Tenant `stripeConnectAccountId` stored in `orgFinanceSettings.stripeConnectAccountId`
- `onboardTenantConnectAccount()`: creates Stripe Express account + returns onboarding URL

### Plaid ACH Payroll Routing (Confirmed Isolation)
**File:** `server/services/payroll/achTransferService.ts`
- ORIGIN (funding source): `orgFinanceSettings.plaidAccountId` — TENANT bank
- DESTINATION: `employeeBankAccounts.plaidAccountId` — EMPLOYEE bank
- CoAIleague corporate accounts: NEVER TOUCHED

### Dunning State Locks
**Webhook:** `server/services/billing/stripeWebhooks.ts` → `handleInvoicePaymentFailed()`
- Sets `workspaces.subscriptionStatus = 'past_due'` (existing)
- NEW: Sets `clients.clientLifecycleStatus = 'past_due'` when `invoice.metadata.clientId` is present
- Publish gate (`schedulesRoutes.ts`): blocks all publishing when `workspace.subscriptionStatus === 'past_due'`
- Payroll gate (`payrollRoutes.ts`): blocks payroll run when `subscriptionStatus === 'past_due'`

### Trinity Financial Conscience — Approval Gate
**Service:** `server/services/trinity/trinityFinancialConscience.ts`
**Table:** `trinityFinancialDrafts` (`shared/schema/domains/trinity/index.ts`)
**Routes:** `server/routes/trinityFinancialDraftRoutes.ts` → `/api/trinity/financial-drafts`

Actions (registered in `actionRegistry.ts`):
- `finance.stage_invoice_generation` → drafts invoice math, notifies owner, waits for APPROVE
- `finance.stage_payroll_run` → drafts payroll math, notifies owner, waits for APPROVE
- `finance.execute_approved_draft` → triggered by APPROVE click; runs real Stripe/Plaid calls

**RULE:** Trinity NEVER calls Stripe or Plaid directly on financial actions.
Only `executeApprovedDraft()` after human APPROVE click moves money.

### Do Not Duplicate / Conflict Rules
- Do NOT add another sign-contract route — the double-gate in `clientPortalSignContractRoutes.ts` is the canonical path
- Do NOT call `generateWeeklyInvoices()` from Trinity directly — use `finance.stage_invoice_generation` + APPROVE gate
- Do NOT set `clientLifecycleStatus = 'active'` anywhere except Gate 2 (`/countersign` route)
- The Plaid ACH service already uses tenant bank as origin — do NOT add another Plaid service

---

