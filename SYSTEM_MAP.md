# CoAIleague + Trinity — System Map v4.0
**Last Updated:** 2026-05-02 | **Build:** CLEAN ✅ | **Tests:** 270/270 ✅ | **esbuild:** 0 errors ✅

---

## Platform Statistics

| Metric | Count |
|---|---|
| Total DB tables | 752 |
| API routes | ~2,883 route handlers |
| Client pages | 302 |
| Service directories | 59 |
| Tests passing | 270 / 270 |
| Test suites active | 23 |

---

## 28 Domains — Complete Map

### ⚡ Foundation (Wave 1 Complete ✅)

**D28 Infrastructure** `server/services/infrastructure/` `server/routes/infrastructureRoutes.ts`
- Health, circuit breaker, durable job queue, rate limiting, webhook idempotency
- Canonical job queue import: `server/lib/jobQueue.ts`
- Unified rate limiting: `server/middleware/rateLimiting/index.ts`
- 78 routes — 4 sections documented (physical split deferred)
- circuitBreaker canonical: `server/services/infrastructure/circuitBreaker.ts` (resilience/ stub deleted)
- ⚠️ WAVE 2 AUDIT: 76 cron jobs in autonomousSchedulingDaemon.ts — 5 duplicate function areas

**D1 Auth** `server/auth.ts` `server/routes/authRoutes.ts` (2,674 lines — merged)
- Login, register, MFA, CSRF, session, dev bypass
- Trinity decoupled: `server/lib/authEvents.ts` EventEmitter pattern
- PLATFORM_WORKSPACE_ID canonical: `server/config/platformConfig.ts`
- SESSION_STORE_TIMEOUT_MS: externalized to platformConfig
- authCoreRoutes.ts = re-export stub (merged into authRoutes.ts)
- Schema: 19 tables (expressSessions dead alias removed)

**D2 RBAC** `server/rbac.ts` (26 exports)
- Permission enforcement only — no state mutations
- Lifecycle: `server/services/workspaceLifecycleService.ts`
- Payment gates: `server/services/billing/billingGateService.ts`

**D4 Orgs** `server/routes/workspace.ts` `server/routes/workspaceInlineRoutes.ts`
- Schema: 42 tables
- Includes: sessionCheckpoints, sessionRecoveryRequests (moved from Auth domain)
- Canonical onboarding: onboardingFlow, onboardingStep
- Dropped dead tables: onboardingTemplates, onboardingTasks, workspaceOnboardingStates

**D27 Notifications** `server/services/notificationDeliveryService.ts`
- Dedup window: `NOTIFICATION_DEDUP_WINDOW_MS = 6h` (shared/config/notificationConfig.ts)
- Push icons: absoluteIconUrl() only
- Renamed: notificationBootstrap.ts (was notificationInit), notificationFactory.ts (was root notifications.ts)
- Schema: 1 table (notificationDeliveries)

---

### 👤 Identity (Wave 2 In Progress)

**D3 Onboarding** `server/routes/onboarding*.ts` (7 files, 76 routes)
- Canonical model: onboardingFlow + onboardingStep (Orgs schema)
- Active tables: onboardingInvites, onboardingApplications, orgOnboardingTasks
- Note: assisted-onboarding.ts + onboardingRoutes.ts are 0-route files with importers (keep)

**D7 Workforce** `server/routes/employeeRoutes.ts` `server/routes/hrInlineRoutes.ts`
- Schema: 67 tables
- Cross-domain re-exports: trainingCourses/Enrollments/Scenarios/Runs, complianceEnrollments
- Workspace isolation: ✅ all writes scoped

**D13 Compliance** `server/routes/compliance/*.ts` (15 files, ~95 routes)
- Schema: 58 tables
- ⚠️ Wave 2: 3 unguarded write locations (approvals.ts, documents.ts, regulatoryPortal.ts)
- ⚠️ Wave 2: packets.ts imports Training schema directly (43 refs) — decouple in Wave 3

**D14 Training** `server/routes/trainingCertificationRoutes.ts`
- Schema: 13 tables (4 moved FROM Workforce in Wave 2)
- trainingDifficultyEnum imported from shared/schema/enums.ts

**D26 Documents** `server/routes/document*.ts` (17 files, ~64 routes)
- PII encryption central: `server/lib/fieldEncryption.ts` (FIELD_ENCRYPTION_KEY)
- SPS schema: 19 tables (field-encrypted)
- Storage schema: 2 tables
- ⚠️ Wave 2: payrollRoutes.ts uses raw AES — move to fieldEncryption.ts in Wave 3

---

### ⚙️ Operations (Wave 3 Target)

**D8 Scheduling** `server/services/scheduling/` — 42 tables
**D9 Time Tracking** `server/routes/timeEntryRoutes.ts`
**D11 Ops** `server/routes/opsRoutes.ts` — 57 tables
**D12 Field Operations** `server/services/fieldOperations/`
**D6 Auditor** `server/routes/auditorRoutes.ts` — third-party audit portal

---

### 💰 Finance (Wave 4 Target)

**D5 Billing** `server/services/billing/` — 75 tables (largest non-AI)
**D10 Payroll** `server/routes/payrollRoutes.ts` — 21 tables
**D15 Finance** `server/services/finance/`
**D17 Clients** `server/routes/clientRoutes.ts` — 34 tables
**D16 Sales** `server/routes/salesRoutes.ts`

---

### 💬 Communications (Wave 5 Target)

**D18 Comms/ChatDock** `server/services/chat/` — 60 tables (Redis pub/sub)
**D19 Email** `server/services/email/` (Resend, Trinity email processor)
**D20 Voice/SMS** `server/services/trinityVoice/` (Twilio)

---

### 🤖 Trinity AI (Wave 5-6 Target)

**D21 Trinity Core** `server/services/ai-brain/` — 103 tables
**D22 Trinity Actions** actionRegistry.ts — 106 registered actions (< 300 limit ✅)
**D23 Trinity Autonomous** autonomousSchedulingDaemon.ts — ⚠️ 76 cron jobs, 5 duplicate areas
**D24 HelpAI** `server/services/helpai/`
**D25 Bots** MeetingBot, ReportBot, ClockBot, SysOpBot

---

### 📊 Scoring (New — from Claude Code session)

`server/services/scoring/` + `server/routes/scoringRoutes.ts`
- scoreEngineService, tenantScoreService, honorRollService, officerLinkageService
- closingScoreService, moveUpRecommender, ssnFingerprint, scoringScheduler
- 4 well-structured cron jobs (the pattern all other jobs should follow)
- 3 test files, all passing

---

## Permanent Architectural Rules

```
AUTH:
  auth.ts → authEvents.emit() only (no Trinity imports)
  PLATFORM_WORKSPACE_ID → server/config/platformConfig.ts (canonical)
  Session store timeout → SESSION_STORE_TIMEOUT_MS in platformConfig

RBAC:
  Permission enforcement only
  Lifecycle mutations → workspaceLifecycleService.ts
  Payment gates → billingGateService.ts

NOTIFICATIONS:
  Dedup window → NOTIFICATION_DEDUP_WINDOW_MS (shared/config/notificationConfig.ts)
  Push icons → absoluteIconUrl() always

API KEYS:
  Use unified apiKeys table + apiKeyScope enum
  scope: 'integration' | 'workspace' | 'managed' | 'platform'

DOMAIN BOUNDARIES:
  Training tables → shared/schema/domains/training/index.ts
  Compliance tables → shared/schema/domains/compliance/index.ts
  Onboarding canonical → onboardingFlow + onboardingStep (Orgs domain)
  Session checkpoints → Orgs domain (NOT Auth)

PII ENCRYPTION:
  ALL field encryption through server/lib/fieldEncryption.ts
  NO raw createCipheriv in route handlers

TRINITY:
  Purple = Trinity UI elements only
  No mode toggles (single unified identity)
  Action registry < 300 actions
  publicSafetyGuard.ts mandatory on all legal-adjacent outputs

BACKGROUND JOBS:
  scoringScheduler.ts = the canonical pattern
  No cron jobs in server/index.ts
  Duplicate scan areas to fix: license_expiry, training_deadline,
    shift_reminder, token_cleanup, notification_cleanup
```

---

## Wave Progress

| Wave | Domains | Status |
|---|---|---|
| Wave 1: Foundation | D28, D1, D2, D4, D27 | ✅ COMPLETE |
| Wave 2: Workforce | D3, D7, D13, D14, D26 | ✅ Schema done, 4 Wave 3 pre-conditions |
| Wave 3: Operations | D8, D9, D11, D12, D6 | ⏳ NEXT — fix pre-conditions first |
| Wave 4: Finance | D5, D10, D15, D17, D16 | ⏳ |
| Wave 5: Comms | D18, D19, D20, D21, D25 | ⏳ |
| Wave 6: Trinity Agency | D22, D23, D24 | ⏳ |

---

## Wave 3 Pre-Conditions (Must Fix First)

1. **Cron deduplication** — `autonomousSchedulingDaemon.ts`: remove license_expiry, training_deadline, shift_reminder, token_cleanup, notification_cleanup duplicates (all have 2-4 owners)
2. **autonomousFixPipeline.ts** — double-registered cron at `45 * * * *` (same schedule twice)
3. **Compliance write isolation** — approvals.ts, documents.ts, regulatoryPortal.ts unguarded DB inserts
4. **payrollRoutes.ts** — move raw AES crypto to `server/lib/fieldEncryption.ts`
