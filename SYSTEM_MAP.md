# COAILEAGUE SYSTEM MAP v5.0
# Last updated: 2026-05-03
# Purpose: Canonical map of what exists, where it lives, and how it connects.
# Read this before adding ANYTHING to avoid duplication and conflicts.

---

## VOICE INFINITE REDIRECT LOOP — Post-Mortem

**Symptom:** Application error on first 3 calls. Worked on 4th-5th ring.
**Root cause:** Infinite redirect loop + Railway rolling deploy overlap.

### Why it appeared intermittent

Railway rolling deploy keeps the old container alive for ~2 minutes while
spinning up the new one. First 3 calls hit old container (pre-fix) → error.
Calls 4-5 hit new container → works. Appeared to "fix itself."

### The actual code bug (would persist after deploy)

Every voice route called `resolveWorkspaceFromPhoneNumber(To)`. For the
master Twilio number (not in `workspaces.twilio_phone_number`), it returns null.

Routes handled null like this:
```
if (!workspace) {
  return redirect(`/api/voice/caller-identify?lang=${lang}`)  ← self-redirect
}
```

`caller-identify` → redirects to `caller-identify` → Twilio follows 5-10
redirects → "application error". Every route had this same loop.

**Also:** `workspace.phoneRecord.extensionConfig` accessed on routes where
`phoneRecord` doesn't exist on the new return type → TypeError on any
non-null workspace match (future tenant with twilio_phone_number set).

### Fixes Applied

1. All 6 infinite self-redirects changed to `/guest-identify` (Wave 16 guest flow)
2. All `workspace.phoneRecord.extensionConfig` replaced with `{}: Record<string, boolean>`
   (extension config defaults to all-enabled for the master line)

### Pre-Commit Rule Added

```bash
# Check for self-redirect patterns
grep -n "redirect.*caller-identify" server/routes/voiceRoutes.ts | head -10
# None should be inside an "if (!workspace)" block

# Check for phoneRecord access
grep -rn "workspace\.phoneRecord" server/
# Must return: nothing
```

---

---

## VOICE SYSTEM CRASH POST-MORTEM — May 2026

**Symptom:** "Application error" on all calls + SMS down simultaneously.
**Root cause:** Module-level startup crash taking down the entire Express server.

### Three-Part Root Cause

**1. `workspacePhoneNumbers` imported but not defined correctly**
File: `server/routes/voiceRoutes.ts` and `server/services/trinityVoice/voiceOrchestrator.ts`
After Directive 2 eliminated the table, the import remained. esbuild hoisted it above
`const` declarations — creating a syntax error on load. Server never started.

**2. `workspaces.isGrandfathered` queried — column does not exist**
File: `server/services/trinityVoice/voiceOrchestrator.ts` (new resolveWorkspaceFromPhoneNumber)
The rewritten function selected `isGrandfathered` from the workspaces table.
That column is not in the schema. Drizzle ORM type error at module evaluation.

**3. `acmeSeed.ts` still imported `workspacePhoneNumbers`**
A dev seed file retained the old import. Even seed files in the import graph crash the server.

### Permanent Fixes Applied

| File | Fix |
|------|-----|
| `voiceOrchestrator.ts` | Removed `workspacePhoneNumbers` import; replaced `isGrandfathered` with `founderExemption` (exists in schema) |
| `voiceRoutes.ts` | Removed `workspacePhoneNumbers` import; stubbed management routes; removed INSERT in initializeVoiceTables |
| `acmeSeed.ts` | Completely stubbed — no-op with comment explaining Directive 2 |

### Pre-Commit Rule (Added to Railway Mirror Protocol)

```bash
# Check for dead schema references before every commit
grep -rn 'workspacePhoneNumbers' server/ | grep -v '//'
# Must return: nothing

# Verify every import reference maps to an existing schema export
node build.mjs
# Must return: ✅ Server build complete
```

### Voice System State After Fix

- `resolveWorkspaceFromPhoneNumber`: queries `workspaces.twilio_phone_number` (single column, existing table)
- When no tenant match (master number): routes to guest IVR — never returns "not configured"
- TwiML Safety Net: catch block returns `<Dial>` to `VOICE_FALLBACK_PHONE` — no dead lines
- All `<Gather language="">`: single value `en-US` only — Twilio rejects comma-separated values
- `workspacePhoneNumbers`: 0 references anywhere in server code

---

---

## RAILWAY MIRROR PROTOCOL (MANDATORY — NEVER SKIP)

**Established after Wave 16 deployment failures. Permanent law.**

### Root Cause of Past Failures
1. Node.js OOM during TSC — 1.1M lines of TS exceeds default 1.5GB heap
2. Python string injection wrote `\`` (escaped backtick) into JSX files
3. Mixed import paths passed local TSC but crashed esbuild on Railway
4. `language="en-US,es-US"` invalid TwiML attribute caused Twilio errors

### The Protocol — Before Every Commit

```bash
# Step 1: Full Vite build (catches duplicate keys, bad imports, esbuild errors)
node build.mjs

# Step 2: Tests
npx vitest run

# Step 3: Grep for escaped backticks in client files (Python injection artifact)
grep -r '\\`' client/src/ --include='*.tsx' --include='*.ts'
# Must return: nothing

# Step 4: Grep for comma-separated Twilio language values (invalid TwiML)
grep -r 'language="[a-z][a-z]-[A-Z][A-Z],[a-z]' server/
# Must return: nothing
```

### Hard Rules
- `NODE_OPTIONS='--max-old-space-size=4096'` is set in `nixpacks.toml [variables]` — covers ALL Railway build phases
- All fetch URLs in JSX use string concatenation, not template literals, when injected via Python scripts
- smsService import from `extensions/`: always `../../smsService` 
- Twilio `<Gather language="">` always ONE language code — never comma-separated
- TwiML Safety Net: `/api/voice/inbound` catch block dials owner — never returns "application error"

---

## Wave 14 — Smart RMS (Complete)

**Files:** `server/services/rms/smartRmsService.ts`, `server/routes/rms/`
**Schema:** `site_pass_down_log`, `banned_entities`, `incident_report_client_copies`
**DAR extensions:** `auto_aggregated`, `event_timeline`, `nfc_tap_count`, `is_client_approved`

Key services:
- Auto-DAR aggregation (shift events → chronological timeline, guard reviews then submits)
- Trinity Narrative Translator (raw guard text → formal third-person, approval gate)
- Pass-down log (BOLO + site notes, 24h TTL, mandatory clock-in acknowledgment)
- Banned entities registry (unified BOLO + trespass, queried at every clock-in)
- Client copy pipeline (sanitize → supervisor approve → client portal sync)

5 Trinity/HelpAI RMS actions registered in `trinityComplianceIncidentActions.ts`

---

## Wave 14.5 — RMS Frontend Bridge (Complete)

**Files:** `client/src/pages/worker-dashboard.tsx`, `client/src/pages/rms-hub.tsx`, `client/src/pages/worker-incidents.tsx`

Key components:
- **Shift Brief intercept modal** — fires at clock-in, shows BOLOs + pass-downs. Mandatory acknowledge if `hasCritical=true`. Lives INSIDE `WorkerDashboardInner` (not outside ErrorBoundary).
- **Auto-DAR timeline UI** — rms-hub Incidents tab. Enter Shift ID → Auto-generate → Review timeline → Submit
- **Trinity Narrative Translator UI** — "Draft with Trinity" button → approval block with manager gate
- **"Approve for Client"** button on incident rows → sanitized copy → client portal sync

⚠️ Known injection artifact: Python scripts must use string concatenation for fetch URLs in JSX, not template literals. Escaped backtick `\`` breaks TSC and esbuild.

---

## Wave 17 — Zero-Friction Migration Engine (Complete)

**Goal:** One unified AI importer for any messy competitor export. Zero overlapping services.

**Files:**
- `server/services/migration/unifiedMigrationService.ts` — all logic (452 lines)
- `server/routes/importRoutes.ts` — thin router, 8 endpoints (232 lines, rewritten)
- `server/routes/migration.ts` — STUBBED (redirects to /api/import)
- `tests/unit/wave17-migration.test.ts` — 18 tests, all passing

**Eliminated:** Old `importRoutes.ts` (706 lines, CSV-only, string input) + old `migration.ts` (487 lines, in-memory CSV jobs, unregistered AI mapper)

**New package:** `xlsx` — Excel/XLSX parsing in production

**API (mounted at `/api/import` — already in orgs.ts):**
```
POST   /api/import/parse              → upload CSV/XLSX/PDF → Gemini → jobId + preview
GET    /api/import/jobs/:jobId        → job status + all rows
PUT    /api/import/jobs/:jobId/rows   → edit individual rows before commit
POST   /api/import/jobs/:jobId/commit → approve and write to DB
DELETE /api/import/jobs/:jobId        → cancel job
POST   /api/import/rollback/:batchId  → undo a committed batch
GET    /api/import/history            → audit trail
```

**Pipeline (Parse → Review → Commit):**
1. Tenant uploads file (CSV, XLSX, PDF)
2. Server extracts raw text via `extractRawText()` (XLSX → sheet_to_csv → Gemini)
3. `parseWithGemini()` sends to Gemini Flash — returns confidence-scored rows
4. `createJob()` builds in-memory job (2h TTL) with summary counts
5. Frontend shows confidence table: auto≥90 (pre-checked), review 50-89 (yellow), fix<50 (red)
6. Tenant edits red/yellow rows inline → `PUT /jobs/:id/rows`
7. Tenant clicks Approve → `POST /jobs/:id/commit` → transaction → import_history

**Confidence scoring:**
- `auto` (≥90): pre-checked, no action needed
- `review` (50-89): tenant should verify before committing
- `fix` (<50 or blocking error): tenant must fix before commit
- `ghost`: name present, both email AND phone missing → creates employee with `status:'incomplete'` + `completion_token` UUID → SMS/email sent to self-complete

**Ghost Employee Bridge:**
When a guard is missing both email and phone (common in competitor exports):
- Record created with `onboarding_status: 'pending'` and a `completion_token`
- If phone exists: SMS sent → `https://coaileague.com/complete/{token}`
- Employee fills in their own info → profile completed
- Import never fails due to missing contact info

**Rollback:**
Every committed batch has a `batchId`. `POST /api/import/rollback/:batchId` deletes all records in employees/clients/shifts with that batchId and marks import_history as rolled_back. One click to undo a 500-guard import.

**DB schema additions (idempotent, run at startup):**
- `import_history` table (workspace_id, batch_id, entity_type, counts, status)
- `employees.import_batch_id` column
- `employees.completion_token` column
- `clients.import_batch_id` column
- `shifts.import_batch_id` column

**Supported source formats:** GetSling, TrackTik, ADP, Gusto, Deputy, When I Work, QuickBooks, plain spreadsheets, hand-typed rosters — Gemini Flash normalizes all of them.

**Test coverage (18 tests):**
- CSV/XLSX/PDF extraction
- Job creation, retrieval, workspace isolation
- Row editing + error recalculation
- Ghost detection (name present, no contact info)
- Confidence scoring rules
- Client and shift entity types
- Bulk import: 500 guards created and retrieved in <100ms

---

---

## Wave 16 — Trinity 360 Omni-Channel SOC Telephony (Complete)

**Architecture:** One master Twilio number. Trinity answers all calls. Tenants identified by `workspaces.state_license_number` or `workspaces.twilio_phone_number`. Guest flow handles prospects, law enforcement, complainants.

**Key Files:**
- `server/services/trinityVoice/voiceOrchestrator.ts` — handleInbound, resolveWorkspaceFromPhoneNumber
- `server/services/trinityVoice/tenantLookupService.ts` — lookupByLicenseNumber, lookupByCompanyName, resolveOnDutyContact
- `server/services/trinityVoice/extensions/guestExtension.ts` — guest IVR, tenant lookup, smart transfer
- `server/services/trinityVoice/extensions/tenantPortalExtension.ts` — full 9-option portal per tenant
- `server/routes/voiceRoutes.ts` — all webhook endpoints

**Database:** NO workspace_phone_numbers table (eliminated as bloat).
`workspaces.twilio_phone_number` column handles dedicated per-tenant numbers.
`workspaces.state_license_number` is the public lookup key for guest callers.

**Priority Waterfall:** Supervisor on shift → Manager on shift → Co-Owner → Owner → Voicemail+SMS

**Tenant Portal Menu (auto-provisioned at registration):**
1. Guards/Officers → schedule, clock in/out, calloff, pay
2. Clients/Site Contacts → coverage check, concerns, billing
3. Urgent → blast SMS all contacts + immediate Dial
4. Complaint → collect name+purpose → on-duty manager
5. Hiring → texts application link instantly
6. Employment Verification → platform query
7. Pay/Timesheet → platform query
8. Speak with Manager → collect + Dial waterfall
0. Trinity AI → Gemini Live free-talk

**TwiML Safety Net (Directive 3):**
`/api/voice/inbound` catch block returns valid TwiML with `<Dial>` to owner.
Env var: `VOICE_FALLBACK_PHONE` (defaults to `OWNER_PHONE`, then `8302134562`).
Caller NEVER gets a dead line.

**911 Liability Rule — Enforced:**
Zero "911" in any TTS string. Trinity says "urgent" not "emergency dispatch."
No duty to public safety created for CoAIleague, tenants, or Trinity.

**Env Vars (all already in Railway):**
- `TWILIO_PHONE_NUMBER` — master number
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` — Twilio auth
- `GEMINI_API_KEY` — Gemini Live
- `VOICE_FALLBACK_PHONE` — safety net fallback (optional, defaults to owner phone)

**Statewide (C11608501) — First Tenant:**
- Bryan's phone from `users.phone` (owner record) is the transfer target
- All transfers waterfall to Bryan until supervisors/managers are added
- No manual config needed — shift schedule drives routing automatically

---

---

## WAVE COMPLETION STATUS

| Wave | Domains | Status | Key Deliverables |
|---|---|---|---|
| 1 | Infrastructure, Auth, RBAC, Orgs, Notifications | ✅ | Auth pipeline, WS, rate limiting, dedup |
| 2 | Onboarding, Workforce, Compliance, Training, Documents | ✅ | HR forms, DPS license compliance, PDF generation |
| 3 | Scheduling, Time, Ops, FieldOps, Auditor | ✅ | Anti-spoofing, storage typing, panic chain, contracts |
| 4 | Billing, Payroll, Finance, Clients, Sales | ✅ | Revenue domain, ACH dispatch, FinancialCalculator |
| 5 | Comms, ChatDock, Gemini Live, Redis buffer, Omni-Inbox | ✅ | ChatDock, seqNum, Resend inbound, token metering |
| 6 | Trinity Agency, ATS, Episodic Memory | ✅ | AI interview rubric, vision verification, memory loop |
| 6.5 | Schema Consolidation | ✅ | 30 dead tables dropped, 4 composite indexes, pgView |
| 6.7 | Zombie Code Purge | ✅ | 23 dead services deleted, 6.5MB assets purged |
| 7 | Frontend Bridge | ✅ | Action Blocks, seqNum replay, ChatDockErrorBoundary |
| 8 Part 1 | Zero-Defect Sweep | ✅ | Stuck buttons, mutex locks, 11 error boundaries |
| 8 Part 2 | Re-Auth Safety Net | ✅ | ReAuthModal — managers never lose in-progress work |
| 8.1 | SPS Production Migration | ✅ | Diagnostic route, PLAID_WEBHOOK_SECRET warnOnly |
| 8.2 | Financial Integrity & Billing Audit | ✅ | Token pipe unified, Stripe IDs to env vars |
| 9 | Native Financial Polish | 🔲 | 941/940 PDF rendering, YTD wage accumulator |
| 10 | Client Value & Analytics Engine | 🔲 | Trinity financial simulator (Action Blocks) |
| 11 | DPS Auditor Portal & Compliance Sandbox | 🔲 | Wave 11 stubs preserved |

---



---

## NATIVE FINANCIAL STACK (built in-house — no third-party payroll API)

**Tax Engine:** `server/services/tax/taxRulesRegistry.ts` (v2025.1)
- IRS Pub 15-T federal brackets for all 4 filing statuses (2025 rates)
- All 50 states + DC income tax (flat and progressive)
- FICA: SS 6.2% (wage base $176,100), Medicare 1.45% + 0.9% additional
- FUTA 6.0% gross / 0.6% net, SUTA new-employer rates all 50 states

**Calculation Engine:** `server/services/payrollAutomation.ts` (2,378 lines)
- Gross → net: pre-tax deductions → FICA → federal/state brackets → post-tax → garnishments
- YTD SS wage base tracking (stops at $176,100)
- 1099 contractors: zero withholding, straight gross pay
- Decimal-safe via FinancialCalculator (decimal.js — no float drift)
- Full calculation audit trail stored in payroll_entries.calculationInputs

**Form Generation:** `server/services/taxFormGeneratorService.ts` (1,068 lines)
- W-2: Real PDFKit layout with IRS box coordinates (Box a–12)
- 1099-NEC: Full form with payer EIN, recipient TIN, Box 1
- Form 941 (quarterly): All IRS line items calculated (PDF layout pending Wave 9)
- Form 940 (annual FUTA): Data complete (PDF layout pending Wave 9)
- Saves to tenant document vault + writes employee_tax_forms record

**ACH Dispatch:** netPay (not grossPay) flows to `achTransferService.initiatePayrollAchTransfer()`
- Plaid ACH: tenant bank → employee bank (platform never touched)
- Stripe Connect: alternative payout method when Plaid unavailable

**Middleware Fees (passive income):**
- Payroll: $3.50/employee/run (tier discounts: Pro -10%, Enterprise -20%)
- Invoice: 2.9% + $0.25 flat per payment processed
- Stripe Connect payouts: 0.75% (our cost 0.25%)
- W-2: $5.00/form | 1099-NEC: $3.00/form | 941/940: included

**NOT built (intentional):**
- IRS e-filing: requires IRS authorization — tenants file manually with the generated PDF

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


---

# ══════════════════════════════════════════════════════════════════
# RAILWAY MIRROR PROTOCOL — MANDATORY PRE-COMMIT GATE (v2.0)
# Effective after Wave 16 deployment failures. NEVER SKIP THIS.
# ══════════════════════════════════════════════════════════════════

## THE FOUR FAILURE MODES THAT HAVE BURNED PRODUCTION

| Failure | Symptom | Missed by | Caught by |
|---|---|---|---|
| `await` in non-async callback | `esbuild: await can only be used inside async` | TSC (OOM) | `vite build` |
| Duplicate object key | `esbuild: Duplicate key "enabled"` | TSC (OOM) | `vite build` |
| JSX outside component return | `esbuild: Expected ) but found {` | TSC (OOM) | `vite build` |
| Escaped template literal `\${var}` | `esbuild: Syntax error backtick` | TSC (OOM) | `vite build` |
| Duplicate schema column | Drizzle OOM on boot → Railway crash | build.mjs | manual grep |

## THE MANDATORY COMMAND SEQUENCE (run in this exact order)

```bash
# STEP 1 — Client build (catches all esbuild/JSX/syntax errors exactly as Railway does)
npx vite build

# STEP 2 — Server build (catches import errors, missing exports)
node build.mjs

# STEP 3 — Tests
npx vitest run

# STEP 4 — Schema duplicate check (run after any schema edit)
grep -rn "^\s\+\(\w\+\):" shared/schema/domains/orgs/index.ts | sort | uniq -d

# ALL FOUR MUST BE GREEN BEFORE git commit. NO EXCEPTIONS.
```

## WHY TSC --noEmit IS NOT SUFFICIENT

The full codebase (1.1M+ lines) causes Node.js heap exhaustion during TSC's
type-checking phase. TSC crashes with OOM and exits 0 (no error reported) —
giving a FALSE POSITIVE. The build appears green. It is not.

**Resolution:** `vite build` uses esbuild which is written in Go — no heap
limit, no OOM. It is the exact tool Railway uses. TSC is useful for type
checking individual modules during development but MUST NOT be the sole
gate before a production commit.

## PYTHON INJECTION RULES (after multiple escaped-literal failures)

When injecting TypeScript/TSX via Python heredocs or string manipulation:
- Template literals: `${var}` NOT `\${var}` — Python escaping bleeds through
- Backticks in strings: use raw strings `r"""..."""` to prevent escaping
- JSX placement: always confirm modal/overlay JSX is INSIDE the component
  return statement, not after the closing tag
- After ANY Python injection: run `npx vite build` immediately, not just build.mjs
- Check injected file with: `grep -n '\\$\|\\`' client/src/pages/[modified-file].tsx`

## SCHEMA DUPLICATE PREVENTION

Before adding any column to an existing table:
```bash
grep -n "columnName" shared/schema/domains/*/index.ts
```
Zero results required before proceeding. One duplicate = Drizzle OOM at boot = Railway crash.

---

# ══════════════════════════════════════════════════════════════════
# WAVE COMPLETION STATUS — UPDATED (Waves 9–16)
# ══════════════════════════════════════════════════════════════════

| Wave | Name | Status | Key Files |
|---|---|---|---|
| 9 | Armor Plate — Financial & Legal Compliance | ✅ | `evidenceBundleService.ts`, `taxFormGeneratorService.ts` |
| 10 | Migration Concierge & ChatDock Action Middleware | ✅ | `migration.ts` (487L), `importRoutes.ts` (706L), `chatActionBlockRoutes.ts` |
| 11 | CFO Brain & Margin Protection | ✅ | `tokenVelocitySentinel.ts`, `safeToSpendService.ts`, `ghostExpenseAuditor.ts` |
| 12 | NFC Physical Integrity & Office/Asset Verification | ✅ | `nfcIntegrityService.ts`, `officeAuditService.ts`, `patrolWatcherService.ts` |
| 13 | Revenue & Stability | ✅ | `liveIntegrityFeed.ts`, `morningBriefService.ts`, `rfpLibraryService.ts`, `sb140ComplianceGate.ts` |
| 14 | Smart RMS | ✅ | `smartRmsService.ts`, `sitePassDownLog`, `bannedEntities`, `incidentReportClientCopies` |
| 14.5 | RMS Frontend Bridge | ✅ | `worker-dashboard.tsx` (shift brief modal), `rms-hub.tsx`, `worker-incidents.tsx` |
| 15 | Strategic Pricing Restructure | ✅ | `billingConfig.ts`, `pricing.tsx` |
| 16 | Trinity 360 Omni-Channel SOC Telephony | ✅ | `tenantLookupService.ts`, `guestExtension.ts` (603L), `tenantPortalExtension.ts` (695L), `voiceRoutes.ts` (5300L+) |

---

# ══════════════════════════════════════════════════════════════════
# WAVE 14 — SMART RMS (COMPLETE ✅)
# ══════════════════════════════════════════════════════════════════

## Schema Additions (ops domain)
- `sitePassDownLog` — priority/category/24h TTL/acknowledged_by
- `bannedEntities` — unified BOLO + trespass, queried at clock-in
- `incidentReportClientCopies` — sanitized pipeline: strips PII, supervisor approves, client portal sync
- `dailyActivityReports` extended: autoAggregated, eventTimeline, nfcTapCount, clientApprovedNarrative

## Service: server/services/rms/smartRmsService.ts
- `generateAutoDar()` — shift events → chronological timeline
- `translateNarrative()` — raw guard notes → formal third-person (Trinity drafts, guard approves)
- `approveNarrativeDraft()` — guard approval step before DAR submission
- `generateShiftBrief()` — BOLOs + pass-downs injected at clock-in
- `createClientCopy()` — PII-stripped incident report → client portal

## Routes
- `GET /api/rms/dars/auto-generate?shiftId=X`
- `POST /api/rms/dars/auto-submit`
- `POST /api/rms/narrative/translate`
- `POST /api/rms/narrative/approve`
- `GET /api/rms/shift-brief?siteId=X`
- `POST /api/rms/incidents/:id/client-copy`

## Trinity Actions (trinityComplianceIncidentActions.ts)
- `rms.translate_narrative`, `rms.approve_narrative`, `rms.generate_dar`,
  `rms.shift_brief`, `rms.create_client_copy`

---

# ══════════════════════════════════════════════════════════════════
# WAVE 14.5 — RMS FRONTEND BRIDGE (COMPLETE ✅)
# ══════════════════════════════════════════════════════════════════

## Modified Files
- `client/src/pages/worker-dashboard.tsx`
  - Shift Brief intercept modal (hasCritical → mandatory acknowledge)
  - `handleClockAction` MUST be `async` — it contains `await fetch()`
  - Modal JSX MUST be INSIDE `WorkerDashboardInner` return, INSIDE `CanvasHubPage`
  - NEVER place modal after `</CanvasHubPage>` or outside the component function

- `client/src/pages/rms-hub.tsx`
  - Auto-DAR panel in Create DAR modal
  - "Approve for Client" button with clientCopySynced Set state

- `client/src/pages/worker-incidents.tsx`
  - "Draft with Trinity" button + trinityDraft state
  - Approval block before final submission

## Hard Rules for worker-dashboard.tsx
```typescript
// ✅ CORRECT
const handleClockAction = useCallback(async () => {
  const briefRes = await fetch(`/api/rms/shift-brief?siteId=${siteId}`...);
});

// ❌ BROKEN — await in non-async = vite build failure
const handleClockAction = useCallback(() => {
  const briefRes = await fetch(...);  // esbuild rejects this
});
```

---

# ══════════════════════════════════════════════════════════════════
# WAVE 16 — TRINITY 360 OMNI-CHANNEL SOC TELEPHONY (COMPLETE ✅)
# ══════════════════════════════════════════════════════════════════

## Architecture Decision: ONE master Twilio number
- All calls → single TWILIO_PHONE_NUMBER env var
- Trinity identifies tenant from spoken license # or company name
- No per-tenant Twilio numbers needed
- Twilio webhook: POST https://www.coaileague.com/api/voice/inbound ← ALREADY CONFIGURED

## Key Files
| File | Lines | Purpose |
|---|---|---|
| `server/routes/voiceRoutes.ts` | 5300+ | All IVR routes, duress, missed call SMS, ChatDock sync |
| `server/services/trinityVoice/voiceOrchestrator.ts` | 482 | handleInbound, buildMainIVR, resolveWorkspaceFromPhoneNumber |
| `server/services/trinityVoice/tenantLookupService.ts` | 187 | lookupByLicenseNumber, lookupByCompanyName, resolveOnDutyContact |
| `server/services/trinityVoice/extensions/guestExtension.ts` | 603 | handleGuestIdentify, handleTenantLookup, handleSmartTransfer, handleAnnounceCaller |
| `server/services/trinityVoice/extensions/tenantPortalExtension.ts` | 695 | Full 9-option tenant phone portal |
| `server/services/trinityVoice/geminiLiveBridge.ts` | 264 | Twilio Media Streams → Gemini Live bidirectional audio |

## Priority Waterfall (resolveOnDutyContact)
```
1st → Supervisor on active shift (workspace_role = supervisor / shift_leader)
2nd → Manager / Dept Manager on active shift
3rd → Co-Owner (if phone on file)
4th → Owner (always has phone — fallback of last resort)
5th → Voicemail → SMS notification to owner
```
Statewide Protective Services (C11608501): Steps 1-3 return empty → Bryan 830-213-4562 gets all calls.
When supervisors/managers are added: they get calls first automatically. Zero config change needed.

## Tenant Portal Menu (all tenants — identical structure, isolated data)
```
1 → Guards/Officers (schedule, clock in/out, calloff, pay, supervisor)
2 → Clients/Site Contacts (coverage check, concerns, billing, coverage request)
3 → Urgent Situation (blast SMS all contacts + immediate Dial)
4 → Complaint (collect name + purpose → Dial on-duty manager)
5 → Hiring/Employment (text application link from workspace.voice_hiring_link)
6 → Employment Verification (platform query → response)
7 → Pay/Timesheet (platform query → weekly hours + OT)
8 → Speak with Manager (collect name + purpose → Dial waterfall)
0 → Trinity AI free-talk (Gemini Live + tenant context)
```

## SOC Features
- **Duress bypass**: POST /api/voice/duress-check — first 3 seconds every call
  Phrases: "code red", "officer needs assistance", "mayday" + Spanish equivalents
  → blast SMS ALL contacts simultaneously + immediate Dial (no whisper, no menu)
- **Missed call SMS**: POST /api/voice/missed-call-sms — fires when caller hangs up during hold
- **ChatDock live card**: POST /api/voice/call-chatdock-sync — call_start + call_end events
- **Caller identity**: lookupCallerByPhone(From, workspaceId) → personalized greeting

## Auto-Provisioning (workspace.ts createWorkspace)
Every new tenant registration automatically gets:
- voice_hiring_link = https://coaileague.com/apply/{orgCode}
- voice_portal_enabled = true
No manual setup. License number in workspaces.state_license_number is the public routing key.

## 911 Hard Rule (NON-NEGOTIABLE — ZERO EXCEPTIONS)
Trinity NEVER says "call 911" or implies she dispatches public safety resources.
No "911" in ANY voice TTS string. Duress → "Connecting your supervisor immediately."
Emergency → "I am notifying management now."
Violations create legal duty and liability for CoAIleague and all tenants.
Enforced in: publicSafetyGuard.ts, trinityConscience.ts, trinityActionDispatcher.ts,
panicAlertService.ts, AND all tenantPortalExtension.ts voice strings.

## Schema Additions (workspaces table — orgs domain)
```typescript
voiceHiringLink: varchar("voice_hiring_link")
voiceCustomGreeting: text("voice_custom_greeting")
voiceCustomGreetingEs: text("voice_custom_greeting_es")
voicePortalEnabled: boolean("voice_portal_enabled").default(true)
// stateLicenseState already existed at L835 — DO NOT ADD AGAIN
```

## Do Not Duplicate / Conflict Rules
- DO NOT add a second stateLicenseState to orgs schema — already at line 835
- DO NOT add per-tenant Twilio numbers — one master number is the architecture
- DO NOT add 911 to any voice TTS string — hard liability rule
- DO NOT call resolveOnDutyContact without a workspaceId — will query wrong tenant

---

# ══════════════════════════════════════════════════════════════════
# REACT / FRONTEND HARD RULES (permanent — from Wave 8)
# ══════════════════════════════════════════════════════════════════

```typescript
// ✅ CORRECT — use TanStack Query's isPending
<button disabled={mutation.isPending}>Submit</button>

// ❌ FORBIDDEN — local loading state with mutation
const [isSubmitting, setIsSubmitting] = useState(false); // never do this

// ✅ CORRECT — async callback when using await inside
const handleAction = useCallback(async () => {
  const res = await fetch('/api/...');
}, [dep]);

// ❌ BROKEN — vite build fails
const handleAction = useCallback(() => {
  const res = await fetch('/api/...'); // ERROR: await in non-async
}, [dep]);

// ✅ CORRECT — single key per object in useQuery
useQuery({ queryKey: [...], enabled: someCondition });

// ❌ BROKEN — duplicate key, vite build fails
useQuery({ queryKey: [...], enabled: false, enabled: someCondition });

// ✅ CORRECT — JSX modal/overlay inside the component's return
function MyComponent() {
  return (
    <CanvasHubPage>
      {/* all content */}
      {modalOpen && <Modal />}  {/* ← INSIDE CanvasHubPage */}
    </CanvasHubPage>
  );
}

// ❌ BROKEN — JSX outside return scope
function MyComponent() {
  return (<CanvasHubPage>{/* content */}</CanvasHubPage>);
}
{modalOpen && <Modal />}  {/* ← OUTSIDE — esbuild parse failure */}
```

---

# ══════════════════════════════════════════════════════════════════
# ENV VAR REGISTRY (production Railway — complete list)
# ══════════════════════════════════════════════════════════════════

| Var | Purpose | Required |
|---|---|---|
| DATABASE_URL | Neon PostgreSQL connection string | ✅ |
| TWILIO_ACCOUNT_SID | Twilio auth | ✅ |
| TWILIO_AUTH_TOKEN | Twilio auth | ✅ |
| TWILIO_PHONE_NUMBER | Master voice number | ✅ |
| GEMINI_API_KEY | Gemini Flash + Gemini Live | ✅ |
| OPENAI_API_KEY | GPT fallback + Whisper | ✅ |
| ANTHROPIC_API_KEY | Claude (Trinity triad) | ✅ |
| RESEND_API_KEY | Transactional email | ✅ |
| RESEND_WEBHOOK_SECRET | Inbound email verification | ✅ |
| STRIPE_SECRET_KEY | Billing | ✅ |
| STRIPE_WEBHOOK_SECRET | Stripe events | ✅ |
| PLAID_CLIENT_ID | ACH payroll | ✅ |
| PLAID_SECRET | ACH payroll | ✅ |
| SESSION_SECRET | Express sessions | ✅ |
| ENCRYPTION_KEY | PII field encryption | ✅ |
| QUICKBOOKS_CLIENT_ID | QB integration | optional |
| QUICKBOOKS_CLIENT_SECRET | QB integration | optional |
| ENABLE_PATROL_WATCHER | Wave 12 crons | optional |
| ENABLE_MORNING_BRIEF | Wave 13 6AM cron | optional |

No new env vars needed for Wave 16. All voice routing is code-driven from the database.

---

## RAILWAY MIRROR PROTOCOL — PERMANENT BUILD RULE
*Instituted after Wave 16 deployment failures. Must be followed before every commit.*

### The Three Deployment Killers (learned the hard way)
1. **Node OOM during TSC** — 1.1M lines of TS needs 4GB heap. `nixpacks.toml` [variables]
   sets `NODE_OPTIONS=--max-old-space-size=4096` for ALL build phases. Never remove this.
2. **Escaped backticks in JSX** — Python string injection writes `\`` instead of real template
   literals. Always use string concatenation in JSX event handlers: `"/api/" + id + "/path"`
3. **Invalid TwiML attributes** — Twilio `<Gather>` accepts exactly ONE language value.
   Never use comma-separated values like `language="en-US,es-US"`. Use `language="en-US"`.

### Pre-Commit Checklist (mandatory)
```
1. node build.mjs          ← esbuild catches syntax errors TSC misses at scale
2. npx vitest run           ← 270 tests must pass
3. grep -r "\\`" client/src/ ← zero escaped backticks allowed
4. grep -r "en-US,es" server/ ← zero invalid TwiML language combos
```
TSC (`npx tsc --noEmit`) is run on Railway with full 4GB heap. Local runs may OOM on
constrained containers — that is expected. The build.mjs + vitest gates are sufficient
for local validation.

---

## WAVE 14 — Smart RMS (Records Management System)
*Files: server/services/rms/smartRmsService.ts, trinityComplianceIncidentActions.ts*

| Feature | Details |
|---|---|
| Auto-DAR | Aggregates shift events → chronological timeline. Guard reviews + submits. |
| Narrative Translator | Raw guard text → formal third-person report. Guard approval required. |
| Pass-Down Log | Priority/category/24h TTL, mandatory guard acknowledge at clock-in |
| Banned Entities | BOLO + trespass unified. Queried at every clock-in. |
| Client Copy Pipeline | Strips SSNs/IDs, supervisor approves, client portal sync. |
| Shift Brief | BOLOs + pass-downs injected as intercept modal at clock-in |

**Schema additions (ops domain):** `site_pass_down_log`, `banned_entities`,
`incident_report_client_copies`, DAR column extensions (10 new columns).

**HelpAI actions added:** `rms.auto_generate_dar`, `rms.translate_narrative`,
`rms.approve_narrative`, `rms.get_shift_brief`, `rms.sync_client_copy`

---

## WAVE 14.5 — RMS Frontend Bridge
*Files: client/src/pages/rms-hub.tsx, worker-dashboard.tsx, worker-incidents.tsx*

| Component | Details |
|---|---|
| Shift Brief Modal | Intercepts clock-in in worker-dashboard. Mandatory ack if hasCritical. |
| Auto-DAR Timeline | rms-hub.tsx — Shift ID → auto-generate → review → submit flow |
| Narrative Translator UI | "Draft with Trinity" button → approval block before submission |
| Client Copy Approve | Incident row button → sanitized copy → client portal sync |

**Known footgun:** JSX fetch URLs must use string concatenation, never template literals
written via Python injection. Always write: `"/api/rms/" + id + "/endpoint"`.

---

## WAVE 16 — Trinity 360 Omni-Channel SOC Telephony
*Files: server/routes/voiceRoutes.ts (5,600+ lines), tenantPortalExtension.ts,
guestExtension.ts, tenantLookupService.ts, voiceOrchestrator.ts*

### Architecture Decision (permanent)
**ONE master Twilio number.** No per-tenant numbers. No `workspace_phone_numbers` table.
`workspaces.twilio_phone_number` column holds the dedicated number if a tenant has one.
Master number falls through to the CoAIleague guest IVR automatically.

### Workspace Phone Resolution
```typescript
// resolveWorkspaceFromPhoneNumber queries workspaces.twilio_phone_number
// Returns null for master number → guest IVR handles it
// NEVER returns 'Configuration error' — always falls to guest flow
```

### Priority Waterfall (all transfers)
```
1st: Supervisor on active shift (workspace_members role=supervisor/shift_leader)
2nd: Manager/Dept Manager on active shift
3rd: Co-Owner (if phone on file)
4th: Owner (always last — always has phone)
5th: Voicemail → SMS to owner
```
*Statewide today: Steps 1-3 empty → Bryan at 830-213-4562 (from users.phone, not hardcoded)*

### Full 9-Option Tenant Portal Menu
| Option | Action |
|---|---|
| 1 — Guards/Officers | Schedule query, clock in/out (writes time_entries), calloff, pay, supervisor |
| 2 — Clients | Coverage count, concerns, billing, request coverage, manager |
| 3 — Urgent | Blast SMS all contacts + immediate <Dial> (no 911 language, no duty created) |
| 4 — Complaint | Collect name + purpose → <Dial> on-duty manager |
| 5 — Hiring | Texts workspace.voice_hiring_link instantly via SMS |
| 6 — Employment Verification | Platform DB query → response |
| 7 — Pay/Timesheet | time_entries query → hours this week |
| 8 — Speak with Manager | Collect name + purpose → <Dial> waterfall |
| 0 — Trinity AI | Gemini Live bidirectional audio session |

### TwiML Safety Net (Directive 3)
```
POST /api/voice/inbound
  try:
    → normal call handling
  catch (ANY error):
    → returns hardcoded valid XML
    → <Say>Transferring you to our team...</Say>
    → <Dial>VOICE_FALLBACK_PHONE || OWNER_PHONE || 8302134562</Dial>
    → caller NEVER gets a dead line
```

### SOC Features
- **Duress bypass:** "Code Red" / "Código Rojo" → blast SMS all contacts + immediate Dial
- **Missed call SMS:** hang-up during hold → Trinity texts caller within seconds
- **ChatDock sync:** live call card on call_start, summary + recording on call_end
- **Caller recognition:** `lookupCallerByPhone(From, workspaceId)` → personalized greeting

### 911 Hard Rule (permanent, non-negotiable)
Trinity NEVER says "911", "call the police", or "contact emergency services" in any TTS.
No duty created. No liability for CoAIleague, tenants, or Trinity.
Enforced by: `publicSafetyGuard.ts`, `trinityConscience.ts`, `panicAlertService.ts`,
`trinityActionDispatcher.ts`, and manual audit of all voice TTS strings.

### Auto-Provisioning (workspace registration)
Every new tenant gets on workspace creation (non-blocking):
- `voice_hiring_link = https://coaileague.com/apply/{orgCode}`
- `voice_portal_enabled = true`

### Environment Variables (complete — no new vars needed)
| Var | Purpose | Status |
|---|---|---|
| TWILIO_PHONE_NUMBER | Master voice number | Required, in Railway |
| TWILIO_ACCOUNT_SID | Auth | Required, in Railway |
| TWILIO_AUTH_TOKEN | Auth | Required, in Railway |
| GEMINI_API_KEY | Gemini Live free-talk | Required, in Railway |
| VOICE_FALLBACK_PHONE | Safety net fallback | Optional (defaults to OWNER_PHONE) |
| OWNER_PHONE | Absolute last resort Dial | Optional |

**Twilio webhook:** `POST https://www.coaileague.com/api/voice/inbound`
**Status callback:** `POST https://www.coaileague.com/api/webhooks/twilio/status`

---

# NEXT: WAVE 18 — CAD Infrastructure & NFC Patrol Engine
