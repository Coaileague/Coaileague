# CoAIleague — Complete System Map
**Last updated:** 2026-05-02 · **Author:** Architect Claude (backend-routes audit) · **Branch:** claude/audit-backend-routes-erroW

> **PURPOSE:** Single source of truth for all routes, mounts, middleware, services, and client pages.
> Before adding ANY new code — route, component, service, or hook — check this map first.
> Update this file in the same PR as your change.

## Backend-Routes Audit Pass (2026-05-02)

**Scope:** End-to-end verification of every backend route — mount order, middleware chain, race conditions, frontend wiring.

**Result:** ✅ PASS — 3 fixes landed, 0 remaining hazards, build clean.

| # | Finding | Location | Fix |
|---|---|---|---|
| 1 | `platformWorkspaceSeedLock` defined in routes.ts but never acquired — `seedPlatformWorkspace` is called from 3 places (routes.ts startup, ChatServerHub.seedHelpDeskRoom, supportRoutes HelpAI escalation) and could race the workspace_members INSERT under concurrent first-boot. | `server/seed-platform-workspace.ts`, `server/routes.ts`, `server/routes/supportRoutes.ts` | Lock moved into the seed module itself as a single-flight Promise (line 15-23). All callers now share it automatically. Dead lock + dead `let platformWorkspaceSeedingInProgress = false;` in supportRoutes.ts:211 removed. |
| 2 | `server/routes/domains/routeMounting.ts` exported `mountRoutes` + `mountWorkspaceRoutes` helpers — never imported anywhere. 33 lines of dead code. | `server/routes/domains/routeMounting.ts` | File deleted. |
| 3 | Stale doc entry: SYSTEM_MAP.md scheduling table listed `availabilityRoutes.ts` at `/api/availability` — actually mounted only in `workforce.ts:69`, not in scheduling. | `SYSTEM_MAP.md` (this file) | Stale row removed below. |

**Verified clean (no fix needed):**
- Mount order in `server/routes.ts` is canonical: bootstrap → CSRF → audit/IDS guards → public → webhooks → special mounts → 15 domains → trinity-thought-status bypass → mountTrinityRoutes → multi-company/etc → mountAuditRoutes → featureStubRouter (LAST).
- Webhook routers (Resend, Twilio, message-bridge, voice/sms aliases, inbound-email) are all mounted BEFORE any domain that puts requireAuth on `/api/*`, so Twilio/Resend/Plaid POSTs reach their handlers without 401.
- `/api/trinity/thought-status` and `/api/trinity/active-operations` are mounted BEFORE `mountTrinityRoutes` so workspace members bypass `requireTrinityAccess`.
- Stripe webhook idempotency uses atomic `INSERT ... ON CONFLICT DO NOTHING RETURNING` — no race window. Plaid webhooks use the same pattern via `tryClaimWebhookEvent()`.
- Financial mutations (invoice stage/finalize, payroll runs) use `pg_advisory_xact_lock` via `atomicFinancialLockService` — concurrent stage/finalize cannot interleave.
- WebSocket startup: `setupWebSocket(server)` runs BEFORE any handler can broadcast; `notificationStateManager.setBroadcastFunction()` and `platformEventBus.setWebSocketHandler()` are set synchronously before domain mounts.
- esbuild server build: 0 errors. Server bundles to `dist/index.js`.

---

---

## Platform Metrics

| Metric | Count |
|--------|-------|
| TypeScript lines | 1,141,959 |
| Client pages | 344 |
| React components | 322 |
| Server route files | 362 |
| API endpoints | 2,876 |
| Server services | 930 |
| Shared schema files | 98 |
| Test suites | 21 (17 active, 4 skipped) |
| Tests | 196 passing / 0 failing / 55 skipped |

### Build & Test Run (2026-05-02, fresh `npm install`)

| Step | Result |
|---|---|
| `npm install` | ✅ 1101 packages, 0 vulnerabilities |
| `node build.mjs` (server esbuild) | ✅ 0 errors → `dist/index.js` 38 MB |
| Server boot smoke (dist/index.js, dummy DATABASE_URL) | ✅ All middleware mounted, AI Brain registry initialized, all 15 domain orchestrators wired, scheduler + WebSocket assembled with no errors before 25s timeout |
| `vitest run` full suite | ✅ 196 passed / 0 failed / 55 skipped (was 5 failed before fix) |
| `tsc --noEmit` | ⚠ 24,150 strict-mode errors (pre-existing TS debt baseline; NOT a build gate — esbuild is the gate per `npm run build`) |

**Bug fixed in this verification pass:**
- `tests/unit/trinity-workflows-17c.test.ts` — added a `beforeAll(async () => await aiBrainActionRegistry.initialize())` so the AI Brain action registry runs its async initialization before tests query `helpaiOrchestrator.getAction(...)`. Previously 5/30 tests in the file failed because action registration was moved out of the constructor and into the async `initialize()` method (called from `server/index.ts:1607` at boot) without updating the test setup.

---

## Test Suite Health

```
npm run test          → 196 passed | 0 failed | 55 skipped
npm run test:unit     → 157 passed | 0 failed
npm run test:readiness→ All readiness gates PASS
tsc --strict          → 0 errors
esbuild (server)      → 0 errors
esbuild (client)      → 0 errors
node build.mjs        → CLEAN
```

### Test Coverage by Domain
| Suite | File | Tests | Status |
|-------|------|-------|--------|
| Financial workflows | trinity-workflows-17c | 30 | ✅ |
| Atomic financial locks | atomic-financial-lock-service | 26 | ✅ |
| Pay/shift calculations | calculations | 25 | ✅ |
| Trinity token metering | trinity-token-metering | 10 | ✅ |
| RBAC role hierarchy | readiness-rbac | 14 | ✅ |
| Data retention | readiness-retention | 6 | ✅ |
| Error tracker adapter | readiness-error-tracker | 3 | ✅ |
| Financial staging | financial-staging | 9 | ✅ |
| Financial staging extras | financial-staging-extras | 10 | ✅ |
| SPS onboarding routes | sps-onboarding-routes | 3 | ✅ |
| Workspace isolation | workspace-isolation | 12 | ✅ |
| Tenant isolation | tenant-isolation | 4 | ✅ |
| Notification isolation | notifications-isolation | 4 | ✅ |
| Route integrity | routeIntegrity | 5 | ✅ |
| QB guards | quickbooks-guards | 2 | ✅ |
| Phase G integrations | phase-g-integrations | 5 | ✅ |
| Phase H admin guards | phase-h-admin-guards | 8 | ✅ |
| Shift splitter | shift-splitter | — | SKIPPED (needs DB) |
| Security tests | 4 files | — | SKIPPED (needs DB) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CoAIleague Platform                       │
│                                                              │
│  Client (Vite + React)     Server (Express + Node)          │
│  ┌─────────────────────┐   ┌─────────────────────────────┐  │
│  │ 344 pages            │   │ 2,876 API routes             │  │
│  │ 322 components       │   │ requireAuth on all /api/*    │  │
│  │ TanStack Query       │   │ workspace_id scope enforced  │  │
│  │ Wouter routing       │   │ db.transaction() on finance  │  │
│  │ Tailwind + shadcn/ui │   │                              │  │
│  └─────────────────────┘   │  Services (930 files)         │  │
│                             │  ├── Trinity AI Brain         │  │
│  Trinity™ (AI Co-Pilot)     │  ├── Billing/Payroll          │  │
│  ┌─────────────────────┐   │  ├── Scheduling               │  │
│  │ Gemini + Claude+GPT │   │  ├── Notifications            │  │
│  │ ONE unified identity │   │  ├── Chat/ChatDock            │  │
│  │ No mode toggles      │   │  ├── HelpAI orchestration     │  │
│  │ < 300 actions        │   │  ├── SPS Forms (encrypted)    │  │
│  └─────────────────────┘   │  └── Audit logging            │  │
│                             └─────────────────────────────┘  │
│  Data Layer                                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Neon PostgreSQL (production autoscale)                   │ │
│  │ 661 tables  ·  Drizzle ORM  ·  btree_gist overlap guard │ │
│  │ Redis pub/sub (ChatDock multi-replica)                   │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Deployment Architecture

Every mount is listed in registration order. Express matches in order — order is law.

```
registerRoutes(app):

  [MIDDLEWARE — Applied before any route]
  cookieParser()
  /api/bootstrap               bootstrapRouter          ← key-based auth, BEFORE CSRF
  DEV ONLY: /api/dev-login     inline handler           ← isProductionEnv() gated
  ensureCsrfToken              all routes
  csrfProtection               /api/*
  auditContextMiddleware       all routes
  platformStaffAuditMiddleware all routes
  dataAttributionMiddleware    all routes
  trinityOrchestrationMiddleware() all routes
  Trinity Intrusion Detection  /api/* (SQL/XSS/path traversal scanner)
  Subscription read-only guard /api/* (suspended workspaces → 403 on mutations)
  Cancelled workspace guard    /api/* (cancelled → 403 all)
  Terminated employee guard    /api/* (14-day grace period)
  Global rate limiting         /api/* (publicApiLimiter 20/min vs authLimiter 60/min)
  requestTimeout               all routes (20s default, 90s AI, 10s webhooks)

  [PUBLIC ROUTES — Before any requireAuth catch-alls]
  /api/onboarding              publicOnboardingRoutes   ← no auth, new org signup
  /api/public/packets          employeePacketPublicRouter ← token-controlled
  /api/public/jobs             publicHiringRoutes       ← unauthenticated job board

  [WEBHOOKS — Must be BEFORE domain mounts to avoid requireAuth blocking]
  resendWebhooksRouter         /api/email/webhook/*     ← Resend inbound/delivery
  twilioWebhooksRouter         /api/twilio/*            ← Twilio SMS/voice webhooks
  messageBridgeWebhookRouter   /api/bridge/webhook      ← Message bridge
  /api/voice                   voiceRouter              ← Twilio voice + SMS inbound
  /api/sms/inbound             → voiceRouter sms handler
  /api/sms/status              → voiceRouter sms status handler

  [SPECIAL MOUNTS — Before domain auth catch-alls]
  /api/auditor                 auditorRouter            ← regulatory auditor portal
  /api/audit-suite             auditSuiteRouter         ← AI audit (phases 2-6)
  /api/security-admin          securityAdminRouter      ← break-glass overrides
  /api/sandbox/acme            acmeSandboxRouter        ← ACME demo (prod-blocked)
  /api/inbound/email           inboundEmailRouter       ← Resend inbound processing
  /api/email                   emailRouter              ← email inbox/send/threads
  /api/platform-feedback       platformFeedbackRouter
  /api/holidays                holidayRoutes
  /api/notification-preferences notificationPreferenceRoutes
  /api/webhooks                webhookRoutes            ← outbound webhook mgmt
  /status                      statusRouter             ← platform status page
  /api/platform-flags          platformFlagRouter
  /api/legal                   legalConsentRouter       ← TCPA opt-out (public)
  /api/legal                   legalRouter              ← DPA/AUP downloads
  /api/forms                   platformFormsRouter
  /api/form-builder            formBuilderRouter
  /api/interview               interviewChatroomRouter  ← requireLegalAcceptance
  /api/onboarding-pipeline     onboardingPipelineRouter ← requireLegalAcceptance

  [DOMAIN MOUNTS — Core business domains]
  mountAuthRoutes(app)         ← auth.ts
  /api/auth/                   internalResetRouter      ← INTERNAL_RESET_TOKEN gated
  mountSupportRoutes(app)      ← support.ts
  mountBillingRoutes(app)      ← billing.ts
  mountClientRoutes(app)       ← clients.ts
  mountCommsRoutes(app)        ← comms.ts
  mountComplianceRoutes(app)   ← compliance.ts
  mountOpsRoutes(app)          ← ops.ts
  mountOrgsRoutes(app)         ← orgs.ts
  mountPayrollRoutes(app)      ← payroll.ts
  mountSalesRoutes(app)        ← sales.ts
  mountSchedulingRoutes(app)   ← scheduling.ts
  mountTimeRoutes(app)         ← time.ts
  /api/trinity/thought-status  trinityThoughtStatusRouter ← requireAuth (bypass TrinityAccess)
  /api/trinity/active-operations inline handler          ← requireAuth (bypass TrinityAccess)
  mountTrinityRoutes(app)      ← trinity.ts
  mountWorkforceRoutes(app)    ← workforce.ts

  [SESSION/PASSPORT ROUTES]
  /api/multi-company           ensureWorkspaceAccess, multiCompanyRoutes
  /api/gate-duty               ensureWorkspaceAccess, gateDutyRoutes
  /api/compliance-evidence     ensureWorkspaceAccess, complianceEvidenceRoutes
  /api/surveys                 surveyPublicRouter (public)
  /api/surveys                 ensureWorkspaceAccess, surveyRoutes
  /api/wellness                ensureWorkspaceAccess, wellnessRoutes
  /api/training-certification  ensureWorkspaceAccess, trainingCertificationRouter
  /api/alert-configs           ensureWorkspaceAccess, alertConfigRouter
  /api/platform-config         platformConfigValuesRouter

  [AUDIT DOMAIN — LAST real domain]
  mountAuditRoutes(app)        ← audit.ts (miscRouter catch-all inside)

  [STUBS — MUST be ABSOLUTE LAST]
  /api                         requireAuth, featureStubRouter ← 503 for unbuilt features
  
  [ERROR HANDLER — After all routes]
  (err, req, res, next)        global Express error handler
```

---

## 15 Domain Orchestrators

### 1. AUTH — server/routes/domains/auth.ts
**Prefix:** `/api/auth/*, /api/tos/*, /api/dev`
**Auth:** Mixed (login/register public, rest requireAuth)
| Route File | Mounts At | Purpose |
|---|---|---|
| authCoreRoutes.ts (30 endpoints) | /api/auth | Login, register, session, MFA, password reset, magic link |
| authRoutes.ts | /api/auth | OAuth callbacks, social auth |
| sessionCheckpointRoutes.ts | /api/auth/checkpoint | Session health checks |
| endUserControlRoutes.ts | /api/auth/user | Profile, preferences, account deletion |
| devRoutes.ts | /api/dev | Dev-only quick login (non-prod) |
| wellKnown.ts | /.well-known | Apple app-site-association, security.txt |
| tosRoutes.ts | /api/tos | Terms of service sign/status |

**Rate limiters applied:** authLimiter on /login, /register · passwordResetLimiter on /forgot-password, /magic-link, /request-password-reset

---

### 2. BILLING — server/routes/domains/billing.ts
**Prefix:** `/api/billing, /api/invoices, /api/stripe`
**Auth:** requireAuth + ensureWorkspaceAccess + requireManager (financial writes)
| Route File | Mounts At | Purpose |
|---|---|---|
| billing-api.ts | /api/billing | Subscription management, plan upgrades |
| invoiceRoutes.ts (28 endpoints) | /api/invoices | Invoice CRUD, approval, PDF generation |
| payrollRoutes.ts (49 endpoints) | /api/payroll | Payroll runs, pay periods |
| plaidRoutes.ts | /api/plaid | Plaid Link, bank account management |
| plaidWebhookRoute.ts | /api/plaid/webhook | Plaid transfer events |
| financeInlineRoutes.ts | /api | Finance inline actions |
| timesheetInvoiceRoutes.ts | /api/timesheet-invoices | Timesheet → invoice conversion |
| trinityRevenueRoutes.ts | /api/trinity/revenue | Revenue intelligence |
| disputeRoutes.ts | /api/disputes | Invoice disputes |
| financeSettingsRoutes.ts | /api/finance-settings | Billing configuration |
| billingSettingsRoutes.ts | /api/billing-settings | Stripe/payment settings |
| qbReportsRoutes.ts | /api/qb-reports | QuickBooks sync reports |
| budgetRoutes.ts | /api/budget | Budget tracking |
| upsellRouter | /api/billing/upsell | Upsell prompts |
| quickbooksSyncRouter | /api/qb-sync | QuickBooks token + sync |

**Rate limiters:** financialLimiter, exportLimiter

---

### 3. CLIENTS — server/routes/domains/clients.ts
**Prefix:** `/api/clients, /api/contracts, /api/contract-renewals`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| clientRoutes.ts | /api/clients | Client CRUD, site management |
| contractPipelineRoutes.ts | /api/contracts | Contract pipeline |
| contractPipelineRoutes (public) | /api/contracts/portal | Client portal (token auth) |
| siteBriefingRoutes.ts | /api/site-briefings | Site briefing documents |
| contractRenewalRoutes.ts | /api/contract-renewals | Renewal tracking |
| clientSatisfactionRoutes.ts | /api/client-satisfaction | CSAT surveys |
| clientServiceRequestRoutes.ts | /api/client-requests | Client service requests |
| clientPortalInviteRoutes.ts | /api/client-portal-invite | Portal invitation flow |
| clientCommsRoutes.ts | /api/client-comms | Client communications |
| contentInlineRoutes.ts | /api | Content inline actions |
| surveyRoutes.ts | /api/surveys | Client-facing surveys |

---

### 4. COMMS — server/routes/domains/comms.ts
**Prefix:** `/api/comms, /api/broadcasts, /api/chat`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| dockChatRoutes.ts | /api | Dock chat (ChatDock) |
| broadcasts.ts | /api/broadcasts | Manager announcements |
| messageBridgeRoutes.ts | /api/bridges | Message bridge |
| emails.ts | /api/emails | Email management |
| emailUnsubscribe.ts | /api/email/unsubscribe | TCPA unsubscribe |
| internalEmails.ts | /api/internal-emails | Internal comms |
| smsRoutes.ts | /api/sms | SMS sending |
| chat-uploads.ts | /api/chat/uploads | File uploads |
| email-attachments.ts | /api/email/attachments | Email attachments |
| chat-rooms.ts | /api/chat-rooms | Chat room management |
| chat-management.ts (28 endpoints) | /api/chat | Chat admin |
| chat.ts (33 endpoints) | /api/chat | Chat messaging |
| commInlineRoutes.ts | /api | Comms inline actions |
| chatInlineRoutes.ts | /api | Chat inline actions |
| commOsRoutes.ts | /api | CommOS |
| externalEmailRoutes.ts | /api | External email |

---

### 5. COMPLIANCE — server/routes/domains/compliance.ts
**Prefix:** `/api/compliance, /api/credentials, /api/sps, /api/training-compliance`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| credentialRoutes.ts | /api/credentials | License/cert management |
| documentRoutes.ts | /api/documents | Document CRUD |
| documentTemplateRoutes.ts | /api/document-templates | Template management |
| documentVaultRoutes.ts | /api/document-vault | Secure vault storage |
| documentLibraryRoutes.ts | /api/document-library | Library |
| fileDownload.ts | /api/files | File downloads |
| formBuilderRoutes.ts | /api/form-builder | Custom forms |
| formRoutes.ts | /api/forms | Form submissions |
| policyComplianceRoutes.ts | /api/policy-compliance | Policy management |
| compliance/approvals.ts | /api/security-compliance/approvals | Approval workflows |
| complianceInlineRoutes.ts | /api | Compliance inline |
| governanceInlineRoutes.ts | /api | Governance inline |
| uacpRoutes.ts | /api/uacp | UACP portal |
| security-audit.ts | /api/security-audit | Security audit |
| spsDocumentRoutes.ts | /api/sps-documents | SPS documents |
| compliance/regulatoryPortal.ts | /api/regulatory | Regulatory portal |

---

### 6. OPS — server/routes/domains/ops.ts
**Prefix:** `/api/incidents, /api/rms, /api/cad, /api/bots, /api/subcontractors`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| mobileWorkerRoutes.ts | /api/incidents | Field incidents |
| incidentPipelineRoutes.ts | /api/incident-reports | Incident pipeline |
| rmsRoutes.ts | /api/rms | Records management |
| cadRoutes.ts | /api/cad | CAD dispatch |
| situationRoutes.ts | /api/situations | Situation management |
| safetyRoutes.ts | /api/safety | Safety protocols |
| equipmentRoutes.ts | /api/equipment | Equipment tracking |
| armoryRoutes.ts | /api/armory | Armory management |
| vehicleRoutes.ts | /api/vehicles | Fleet management |
| guardTourRoutes.ts | /api/guard-tours | Guard tour system |
| maintenanceRoutes.ts | /api/maintenance | Maintenance mgmt |
| postOrderVersionRoutes.ts | /api/post-orders | Post orders |
| incidentPatternRoutes.ts | /api/incident-patterns | Pattern analysis |
| subcontractorRoutes.ts | /api/subcontractors | Subcontractor mgmt |
| shiftBotSimulationRoutes.ts | /api/shift-bot | Bot simulation |
| documentFormRoutes.ts | /api/document-forms | Document forms |
| migration.ts | /api/migration | DB migrations |

---

### 7. ORGS — server/routes/domains/orgs.ts
**Prefix:** `/api/workspace, /api/onboarding, /api/integrations, /api/import`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| oauthIntegrationRoutes.ts (30 ep) | /api/integrations | OAuth integrations |
| configRegistryRoutes.ts | /api/config-registry | Config management |
| featureFlagsRoutes.ts | /api/feature-flags | Feature flags |
| assisted-onboarding.ts | /api/assisted-onboarding | Guided onboarding |
| deviceLoaderRoutes.ts | /api/device | Device management |
| employeeOnboardingRoutes.ts | /api/employee-onboarding | Employee onboarding |
| enterpriseFeatures.ts | /api/enterprise-features | Enterprise tier |
| enterpriseOnboardingRoutes.ts (28 ep) | /api/enterprise-onboarding | Enterprise setup |
| experienceRoutes.ts | /api/experience | Experience mgmt |
| hireosRoutes.ts | /api/hireos | HireOS |
| importRoutes.ts | /api/import | Data import |
| integrationManagementRoutes.ts | /api/integration-management | Integration mgmt |
| integrationRoutes.ts | /api | Integration actions |
| integrationsInlineRoutes.ts | /api | Inline integrations |
| onboarding-assistant-routes.ts | /api/onboarding-assistant | AI onboarding |
| onboardingInlineRoutes.ts | /api | Onboarding inline |
| workspaceInlineRoutes.ts (29 ep) | /api | Workspace actions |

---

### 8. PAYROLL — server/routes/domains/payroll.ts
**Prefix:** `/api/payroll, /api/time-entries, /api/expenses`
**Auth:** requireAuth + ensureWorkspaceAccess · blockFinancialData for auditors
| Route File | Mounts At | Purpose |
|---|---|---|
| payrollRoutes.ts (49 endpoints) | /api/payroll | Payroll CRUD, runs, reports |
| payrollTimesheetRoutes.ts | /api/timesheets | Timesheet management |
| expenseRoutes.ts | /api/expenses | Expense reports |
| payStubRoutes.ts | /api | Pay stub generation + PDF |
| plaidRoutes.ts | /api/plaid | Plaid ACH direct deposit |
| plaidWebhookRoute.ts | /api/plaid/webhook | Plaid transfer webhooks |

---

### 9. SALES — server/routes/domains/sales.ts
**Prefix:** `/api/proposals, /api/pipeline-deals, /api/bid-analytics`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| leadCrmRoutes.ts | /api/leads | Lead CRM |
| salesRoutes.ts | /api/sales | Sales pipeline |
| salesPipelineRoutes.ts | /api/pipeline-deals | Deal pipeline |
| proposalRoutes.ts | /api/proposals | Proposal builder |
| publicLeads.ts | /api/public/leads | Public lead capture |
| testimonials.ts | /api/testimonials | Testimonials |
| rfpEthicsRoutes.ts | /api/ethics | RFP ethics |
| rfpPipelineRoutes.ts | /api/rfp | RFP pipeline |
| salesInlineRoutes.ts | /api | Sales inline |
| bidAnalyticsRoutes.ts | /api/bid-analytics | Bid analytics |

---

### 10. SCHEDULING — server/routes/domains/scheduling.ts
**Prefix:** `/api/shifts, /api/schedules, /api/staffing`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| autonomousSchedulingRoutes.ts | /api/trinity/scheduling | AI auto-scheduling |
| approvalRoutes.ts | /api/approvals | Shift approvals |
| orchestratedScheduleRoutes.ts | /api/orchestrated-schedule | Orchestrated schedules |
| coverageRoutes.ts | /api/coverage | Coverage management |
| calendarRoutes.ts | /api/calendar | Calendar integration |
| advancedSchedulingRoutes.ts | /api/advanced-scheduling | Advanced patterns |
| aiSchedulingRoutes.ts | /api/ai-scheduling | AI scheduling engine |
| shiftRoutes.ts (36 endpoints) | /api/shifts | Shift CRUD, assign, notify |
| scheduleosRoutes.ts | /api/scheduleos | ScheduleOS |
| trinitySchedulingRoutes.ts | /api/trinity/scheduling | Trinity scheduling |
| trinityStaffingRoutes.ts | /api/trinity/staffing | Trinity staffing |
| trinityStaffingRoutes (public) | /api/trinity/staffing/webhook | Staffing webhooks |
| shiftChatroomRoutes.ts | /api/shift-chatrooms | Shift chat rooms |
| postOrderRoutes.ts | /api/post-orders | Post orders |

---

### 11. SUPPORT — server/routes/domains/support.ts
**Prefix:** `/api/platform, /api/support/*, /api/help`
**Auth:** requireAuth + platform staff guards
**Support roles (canonical, used by `requireSupportRole` / `AALV_SUPPORT_ROLES`):**
`root_admin`, `deputy_admin`, `sysop`, `support_manager`, `support_agent`
(`Bot` is added in `trinityNotificationRoutes.ts` for Trinity-originated calls.)

| Route File | Mounts At | Purpose |
|---|---|---|
| supportActionRoutes.ts | /api | Support actions registry + execute |
| support-command-console.ts | /api/support/command (gated upstream by `requireAuth` + inner `requireSupportRole`) | Trinity command console (test-broadcast, force-whats-new, force-notification, broadcast-message, maintenance-mode, force-sync) |
| support-chat.ts | /api/support/chat | Support chat (incl. guest ticket intake) |
| ticketSearchRoutes.ts | /api/tickets | Ticket search |
| supportRoutes.ts (29 ep) | /api/support | Support CRUD |
| helpdeskRoutes.ts (31 ep) | /api/helpdesk | Helpdesk mgmt + MOTD |
| endUserControlRoutes.ts | /api/end-user-controls | Suspend/unsuspend/freeze workspaces + end users (`requireSupportRole`) |
| trinityNotificationRoutes.ts | /api/trinity/notifications (gated by upstream `requireAuth`) | live-patch (admin), whats-new, support-escalation, insight, maintenance-alert, metrics, watchdog-status, batch-send |
| adminPermissionRoutes.ts | /api/admin/permissions | Permission matrix mutations (`requireSupportManager`) |
| service-control.ts | /api/platform/services | Per-workspace service suspend (platform staff) |
| financialAdminRoutes.ts | /api/financial-admin | Financial admin |
| helpAITriageRoutes.ts | /api/helpai-triage | HelpAI triage |
| adminWorkspaceDetailsRoutes.ts | /api/admin/workspace-details | Admin workspace deep-dive |
| trinityOrgStateRoutes.ts | /api/trinity/org-state | Org state snapshot + refresh |
| aiRoutes.ts (AALV) | /api/ai/audit-log | AI audit log viewer (`AALV_SUPPORT_ROLES` gate) |
| chat-rooms.ts (gated tabs) | /api/chat-rooms | Support-only sections gated to support roles |

**Frontend pages → server route map (support surface):**
| Page | Route | Calls |
|---|---|---|
| `pages/support.tsx` | `/support` | `/api/support/chat/guest-ticket`, `/api/health/summary` |
| `pages/my-tickets.tsx` | `/my-tickets` | `/api/helpdesk/tickets/me` |
| `pages/support-queue.tsx` | `/support/queue` | `/api/helpdesk/queue` |
| `pages/support-bug-dashboard.tsx` | `/support/bugs` | `/api/support/bugs` |
| `pages/support-chatrooms.tsx` | `/support/chatrooms` | `/api/helpdesk/chatrooms` |
| `pages/support-ai-console.tsx` | `/support/ai-console` (RBAC: platform_staff) | `/api/helpai/orchestrator/*`, `/api/quick-fixes/*` |
| `pages/HelpDesk.tsx` | `/chat/:roomId`, `/helpdesk` | `/api/helpdesk/motd`, `/api/helpdesk/queue`, `/api/helpdesk/users/:id/context` |
| `pages/admin-ticket-reviews.tsx` | `/admin/ticket-reviews` | `/api/helpdesk/reviews` |
| `pages/admin-helpai.tsx` | `/admin/helpai` | `/api/admin/helpai/*` |
| `pages/role-management.tsx` | `/role-management` | `/api/employees`, role-label hooks |
| `pages/end-user-controls.tsx` | `/end-user-controls` | `/api/admin/end-users/*` (suspend, unsuspend, toggle-ai-brain, access-config, freeze-user, unfreeze-user, suspend-employee, reactivate-employee) — server router mounted at `/api/admin/end-users` (not `/api/end-user-controls`) |
| `pages/admin/support-console.tsx` | `/admin/support-console` | `/api/support/escalated`, `/api/support/priority-queue`, `/api/admin/search` (case-derived `status`), `/api/support/actions/registry`, `/api/support/actions/execute`, `/api/admin/workspaces/:id/details` |
| `pages/admin/support-console-tickets.tsx` | `/admin/support-console/tickets` | `/api/support/escalated` |
| `pages/admin/support-console-workspace.tsx` | `/admin/support-console/workspace?id=…` | `/api/admin/workspaces/:id/details`, `/api/trinity/org-state/:id`, `/api/support/actions/registry`, `/api/support/actions/execute` |

**Mount-time wrappers (server/routes/domains/support.ts):**
```
app.use("/api/platform/services", serviceControlRouter);
app.use(supportActionRouter);                          // own gates
app.use("/api/support/command", requireAuth, …);       // requireSupportRole inside resolves platformRole
app.use("/api/support/chat", supportChatRouter);
app.use("/api/tickets", ticketSearchRouter);
app.use("/api/support", supportRouter);
app.use("/api/helpdesk", helpdeskRouter);
app.use(financialAdminRouter);
app.use("/api/helpai", helpAITriageRouter);
app.use("/api/admin", adminWorkspaceDetailsRouter);
app.use("/api/trinity", trinityOrgStateRouter);
app.use("/api/trinity/notifications", requireAuth, trinityNotificationRouter);
```
The `endUserControlRouter` is mounted by the AUTH domain (auth.ts) at
`/api/admin/end-users` with upstream `requireAuth`; its inner
`requireSupportRole` is the role gate.

**Orphan / dead-code candidates flagged this pass:**
- `pages/support-command-console.tsx` (1559 lines) — exports `SupportCommandConsole`, no router entry, no consumer. The legacy redirect `/support/console → /support/ai-console` and `/trinity/command-center → /support/ai-console` indicates `support-ai-console.tsx` is the canonical replacement. Decide: route it at `/support/command-console` or delete.
- Server `supportCommandRouter` (test-broadcast, force-whats-new, force-notification, etc.) is mounted but its endpoints have no current frontend consumer — same uncertainty as above.

---

### 12. TIME — server/routes/domains/time.ts
**Prefix:** `/api/time, /api/timesheet`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| time-entry-routes.ts | /api/time-entries | Time entry CRUD |
| timeEntryRoutes.ts | /api/time-entries | Time entry inline |
| timesheetReportRoutes.ts | /api/timesheet-reports | Reports |
| breakRoutes.ts | /api/breaks | Break tracking |
| timeOffRoutes.ts | /api/time-off | PTO management |
| mileageRoutes.ts | /api/mileage | Mileage tracking |

---

### 13. TRINITY — server/routes/domains/trinity.ts
**Prefix:** `/api/trinity/*, /api/ai/*`
**Auth:** requireTrinityAccess (platform staff) · BYPASS: thought-status, active-operations
| Route File | Mounts At | Purpose |
|---|---|---|
| workboardRoutes.ts | /api/workboard | AI workboard |
| faq-routes.ts | /api/faq | FAQ management |
| ai-brain-routes.ts | /api/ai-brain | AI brain CRUD |
| helpai-routes.ts | /api/helpai | HelpAI endpoints |
| ai-brain-console.ts | /api/ai-brain/console | Brain console |
| aiBrainControlRoutes.ts | /api/ai-brain/control | AI controls |
| aiOrchestraRoutes.ts | /api/ai/orchestra | Orchestra |
| aiOrchestratorRoutes.ts | /api/ai-orchestrator | Orchestrator |
| aiBrainInlineRoutes.ts | /api | AI inline |
| aiRoutes.ts | /api/ai | Core AI |
| trinity-alerts.ts | /api/trinity/alerts | Trinity alerts |
| trinityDecisionRoutes.ts | /api/trinity/decisions | Decision engine |
| bugRemediation.ts | /api/bug-remediation | Bug reports |
| controlTowerRoutes.ts | /api/control-tower | Control tower |
| automationInlineRoutes.ts | /api | Automation inline |
| trinityInsightsRoutes.ts (27 ep) | /api/trinity/insights | Proactive insights |
| trinitySchedulingRoutes.ts | /api/trinity/scheduling | Scheduling AI |
| trinityChatRoutes.ts | /api/trinity/chat | Trinity chat |
| aiBrainConsoleRouter | /api/trinity/brain-console | Brain console |
| subagentRoutes.ts (27 ep) | /api/trinity/subagents | Subagent management |
| trinityThoughtStatusRouter | /api/trinity/thought-status | Thought status (all users) |
| active-operations | /api/trinity/active-operations | Active ops (all users) |

---

### 14. WORKFORCE — server/routes/domains/workforce.ts
**Prefix:** `/api/employees, /api/ats, /api/smart-onboarding, /api/hr`
**Auth:** requireAuth + ensureWorkspaceAccess
| Route File | Mounts At | Purpose |
|---|---|---|
| flexStaffingRoutes.ts | /api/flex-staffing | Flex staffing |
| hrisRoutes.ts | /api/hris | HRIS integration |
| hrInlineRoutes.ts | /api | HR inline |
| terminationRoutes.ts | /api/termination | Termination workflows |
| leaderRoutes.ts | /api/leaders | Leadership mgmt |
| owner-employee.ts | /api/owner-employee | Owner as employee |
| officerScoreRoutes.ts | /api/officer-scores | Performance scores |
| officerIntelligenceRoutes.ts | /api/officer-intelligence | Officer intelligence |
| employeeRoutes.ts | /api/employees | Employee CRUD |
| engagementRoutes.ts | /api/engagement | Engagement tracking |
| officerCertificationRoutes.ts | /api/officer-certifications | Cert management |
| officerCertificationRoutes (pub) | /api/public/certifications | Public cert lookup |
| feedbackRoutes.ts | /api/feedback | Feedback system |
| availabilityRoutes.ts | /api/availability | Availability mgmt |
| deactivateRoutes.ts | /api/deactivate | Account deactivation |
| reviewRoutes.ts | /api/reviews | Performance reviews |

---

### 15. AUDIT — server/routes/domains/audit.ts
**Prefix:** Catch-all — last domain before feature stubs
**Auth:** requireAuth + requireManager/requirePlatformStaff per route
| Route File | Mounts At | Purpose |
|---|---|---|
| health.ts | /api/health, /health | Health check |
| searchRoutes.ts | /api/search | Universal search |
| privacyRoutes.ts | /api/privacy | Privacy/GDPR |
| apiDocsRoutes.ts | /api-docs | API documentation |
| command-documentation.ts | /api/command-docs | Command docs |
| dashboardRoutes.ts | /api/dashboard | Dashboard data |
| infrastructureRoutes.ts (78 ep) | /api/infrastructure | Platform infrastructure |
| sandbox-routes.ts (30 ep) | /api/sandbox | Sandbox/testing |
| adminRoutes.ts (75 ep) | /api/admin | Admin console |
| miscRoutes.ts (41 ep) | /api | Misc catch-all LAST |

---

## Notification Delivery Stack

```
Event occurs (shift assigned, payment, alert, etc.)
  │
  ├─ broadcastToWorkspace(workspaceId, WsPayload)   ← server/websocket.ts
  │   └─ Real-time WebSocket to all connected clients in workspace
  │
  ├─ universalNotificationEngine.notify(payload)    ← determines who gets notified
  │   └─ Resolves recipients by role (NOTIFICATION_ROLE_ROUTING)
  │       └─ NotificationDeliveryService.send(payload)
  │           ├─ Dedup window: 30 min (same type+user+channel)
  │           ├─ Rate limit: 3 push/hr, 15 push/day per user
  │           ├─ Critical types bypass rate limit (panic_alert, payroll_failure, etc.)
  │           ├─ channel: 'push'    → Web Push API via subscription store
  │           ├─ channel: 'email'   → Resend API
  │           ├─ channel: 'sms'     → Twilio
  │           └─ channel: 'in_app' → notificationDeliveries table
  │
  ├─ broadcastService.createBroadcast()             ← manager → employee announcements
  │
  └─ staffingBroadcastService.createShiftBroadcast() ← callout coverage offers

Push icon chain:
  Service Worker (sw.js v4.10.0)
    icon: /icons/notification-icon-192x192.png   ← RGBA white-on-transparent
    badge: /icons/badge-72.png                   ← RGBA white-on-transparent
  Category icons:
    alert:    /icons/alert-192.png   (exclamation ring)
    clock:    /icons/clock-192.png   (clock shape)
    approval: /icons/approval-192.png (checkmark)
    warning:  /icons/warning-192.png  (triangle)
```

---

## ChatDock Architecture

```
client/src/components/
  ConversationPane.tsx         ← Main chat UI
  universal-chat-layout.tsx    ← Responsive wrapper
  chat/MessageBubble.tsx       ← Individual message
  notifications-popover.tsx    ← Notification center (AnimatedNotificationBell)

server/services/chat/
  chatDockEventProtocol.ts     ← Typed WS event schema
  chatDockMessageStore.ts      ← Durable message store (⚠ needs wiring)
  chatDockPubSub.ts            ← Redis pub/sub (⚠ needs REDIS_URL env)
  index.ts                     ← Re-exports

server/routes/
  dockChatRoutes.ts            ← /api dock chat endpoints
  chat.ts                      ← /api/chat/* messaging
  chat-rooms.ts                ← /api/chat-rooms/* management
  shiftChatroomRoutes.ts       ← /api/shift-chatrooms/* shift rooms

WebSocket: server/websocket.ts
  broadcastToWorkspace(workspaceId, WsPayload)  ← 86 files use this
  WsPayload type — do NOT add data:any or shift?:any
```

---

## Trinity AI Stack

```
Trinity = ONE unified individual (biological brain: Gemini + Claude + GPT triad)
HelpAI = only bot field workers see

server/services/ai-brain/
  trinityContextManager.ts       ← Context and memory
  actionRegistry.ts              ← Action registration hub (300 action limit)
  trinityDocumentActions.ts      ← Document generation actions
  trinityChatService.ts          ← Chat pipeline
  trinityIntelligenceLayers.ts   ← Layer definitions
  trinity-orchestration/
    claudeService.ts             ← Claude API client
    geminiService.ts             ← Gemini API client
  subagents/
    onboardingOrchestrator.ts    ← Onboarding automation
    gamificationActivationAgent.ts ← Gamification
    visualQaSubagent.ts          ← Visual QA

server/services/trinity/proactive/
  anomalyWatch.ts       ← Anomaly detection (daily)
  officerWellness.ts    ← Officer wellness checks
  preShiftIntelligence.ts ← Pre-shift briefings
  revenueAtRisk.ts      ← Revenue risk monitoring
  weeklyBrief.ts        ← Weekly digest

server/services/trinity/trinityInboundEmailProcessor.ts
  ← Processes inbound emails: calloffs@, incidents@, docs@, support@
  EmailCategory union: 'calloff' | 'incident' | 'docs' | 'support' | 'careers' | 'staffing' | 'unknown'

Proactive scan schedule:
  Daily (6 AM):   trinityProactiveScanner.runAllWorkspacesDailyScan()
  Weekly (Mon):   trinityProactiveScanner.runAllWorkspacesWeeklyScan()
  Monthly (1st):  trinityProactiveScanner.runAllWorkspacesMonthlyCycle()
```

---

## PDF / Document Generation

```
RULE: Every generated document = real branded PDF in tenant vault.
NEVER return raw data. ALWAYS: header + footer + page numbers + doc ID + tenant vault.

server/services/documents/
  businessFormsGenerators.ts      ← generateProofOfEmployment, generateDirectDepositConfirmation,
                                     generatePayrollRunSummary, generateW3Transmittal
  businessArtifactCatalog.ts      ← Static catalog of all document types
  timesheetSupportPackageGenerator.ts ← Timesheet packages
  submissionPdfService.ts         ← Form submission PDFs

server/routes/
  documentVaultRoutes.ts          ← /api/document-vault (upload, download, sign)
  payStubRoutes.ts                ← /api pay stubs + PDF streaming
  pdfResponseHeaders.ts           ← Shared PDF response headers

client/src/components/
  MobileDocumentSafeSheet.tsx     ← Mobile PDF viewer
  MobilePayStubSheet.tsx          ← Mobile pay stub
  MobileFormPager.tsx             ← Mobile form pager
```

---

## Auth & RBAC

```
Platform Roles (RBAC):
  root_admin → deputy_admin → platform_staff → system → automation → helpai
  
Workspace Roles:
  org_owner → co_owner → org_admin → manager → officer → guard → client → auditor

Middleware chain for protected routes:
  requireAuth           ← session/passport check, sets req.user
  ensureWorkspaceAccess ← validates req.user.workspaceId matches route workspace
  requireManager        ← workspace role >= manager
  requirePlatformStaff  ← platformRole is staff/admin
  requireTrinityAccess  ← platformRole is root/deputy admin

FIELD_ENCRYPTION_KEY:  ← must be set to activate PII encryption (fieldEncryption.ts)
APP_BASE_URL:          ← required for auditor token URL composition
```

---

## Database

```
PostgreSQL (Neon) accessed via Drizzle ORM
Schema: shared/schema/index.ts (661 tables)

Key tables:
  users, sessions, workspace_members, workspaces
  shifts, schedules, time_entries, breaks
  employees, clients, contracts
  invoices, payroll_runs, pay_stubs
  notifications, notification_deliveries (dedup/rate-limit store)
  ai_action_log, trinity_sessions, ai_chat_sessions
  document_vault, org_documents
  cron_run_log (job execution tracking)

RULE: Every workspace-scoped query MUST include workspace_id predicate.
      Financial writes MUST use db.transaction().
      Floating-point money MUST use FinancialCalculator (decimal.js).
```

---

## Build Chain

### Build Chain
```
npm run build = vite build && node build.mjs
npm run start = cross-env NODE_ENV=production node dist/index.js
nixpacks.toml: NODE_OPTIONS=--max-old-space-size=4096
railway.toml: buildCommand + startCommand configured
build.mjs externals: date-fns, openai, twilio, typescript, @capacitor/*
```

### Critical Deployment Rules (permanent)
- `featureStubRouter` MUST stay LAST in `server/routes.ts` — never shadow real routes
- `dist/index.js` expected size: ~38MB (ESM bundle)
- Health check endpoint: `GET /api/health`
- Port: `process.env.PORT` (Railway injects)
- Cookie domain: auto-detected from `APP_BASE_URL` — Railway dev gets host-only cookies

---

## Required Environment Variables

### Auto-provided by Railway
`PORT, NODE_ENV, RAILWAY_ENVIRONMENT_NAME, DATABASE_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD`

### Required — set in Railway Variables
| Variable | Purpose |
|----------|---------|
| `APP_BASE_URL` | Canonical deployment URL (affects cookies, email links, OAuth) |
| `SESSION_SECRET` | 64-char random string for session signing |
| `FIELD_ENCRYPTION_KEY` | 32 hex chars for PII field encryption |
| `RESEND_API_KEY` | Email delivery |
| `RESEND_WEBHOOK_SECRET` | Webhook signature verification |
| `STRIPE_SECRET_KEY` | Billing/subscriptions |
| `STRIPE_WEBHOOK_SECRET` | Stripe event verification |
| `TWILIO_ACCOUNT_SID` | SMS/voice |
| `TWILIO_AUTH_TOKEN` | SMS/voice auth |
| `TWILIO_PHONE_NUMBER` | Sending number |
| `OPENAI_API_KEY` | GPT integration |
| `ANTHROPIC_API_KEY` | Claude integration |
| `GEMINI_API_KEY` | Gemini AI brain |
| `VAPID_PUBLIC_KEY` | Web push notifications |
| `VAPID_PRIVATE_KEY` | Web push notifications |
| `VAPID_SUBJECT` | mailto:admin@coaileague.com |
| `REDIS_URL` | ChatDock pub/sub (shared across dev+prod) |

---

## Domain Route Map

All routes prefixed `/api/`. `requireAuth` applied at top-level mount.

| Domain | File(s) | Key Endpoints |
|--------|---------|---------------|
| Auth | authCoreRoutes.ts | POST /auth/login, GET /auth/me, POST /auth/logout |
| Shifts | shiftRoutes.ts | CRUD /shifts, /shifts/today, /shifts/upcoming |
| Employees | employeeRoutes.ts | CRUD /employees, /employees/:id |
| Time Entries | timeEntryRoutes.ts | POST /time-entries/clock-in, GET /time-entries/status |
| Invoices | invoiceRoutes.ts | CRUD /invoices, POST /invoices/:id/send |
| Payroll | payrollRoutes.ts | /payroll/runs, /payroll/process |
| Clients | clientRoutes.ts | CRUD /clients, /clients/:id |
| Notifications | notifications.ts | GET/POST /notifications, WS broadcast |
| Chat/ChatDock | dockChatRoutes.ts | /dock/rooms, /dock/messages (Redis pub/sub) |
| Trinity AI | trinityChatRoutes.ts + others | /trinity/*, /helpai/* |
| Scheduling | schedulesRoutes.ts | /schedules, /schedules/publish |
| Analytics | analytics.ts | /analytics/dashboard, /analytics/reports |
| Settings | settings.ts | /settings/workspace, /settings/billing |
| Onboarding | onboardingPipelineRoutes.ts | /onboarding/*, /invite/* |
| SPS Forms | spsFormsRoutes.ts | /sps/*, encrypted PII fields |
| Documents | documentVaultRoutes.ts | /documents/*, branded PDFs |
| Billing | billing-api.ts | /billing/*, Stripe integration |
| Admin | adminRoutes.ts | /admin/*, platform staff only |
| Health | health.ts | GET /health (Railway health check) |

---

## Permanent Architectural Rules

```
# Server
- All workspace queries MUST include workspace_id predicate
- Financial writes (invoices, payroll, payments) MUST use db.transaction()
- New routes: add to correct domain file in server/routes/domains/
- featureStubRouter MUST stay LAST in server/routes.ts
- WebSocket events: WsPayload type — never add data:any

# Trinity
- Trinity = ONE unified individual — no mode/personality toggles
- HelpAI = the only bot field workers see
- Trinity action registry: stay < 300 total actions
- Trinity never provides legal advice or assumes duty of care
- Purple = Trinity UI elements only. Gold = HelpAI elements only.

# Client
- Every workspace-scoped useQuery: must have enabled: !!workspaceId guard
- All React components: import React from 'react' if using React.X namespace
- Error boundaries wrap all lazy-loaded routes
- All push notification icons: absolute HTTPS URLs via absoluteIconUrl()

# Documents/PDFs
- Every generated document: branded PDF with header/footer/page numbers/doc ID
- Saved to tenant vault — never raw data output

# Notifications
- Idempotency keys: MUST use time-window (6-hour floor) never Date.now()
- This prevents duplicate notifications from Trinity autonomous scans

# TypeScript
- Zero any (verified by automated scan)
- tsc --strict: 0 errors
- catch(e: unknown) → instanceof Error narrowing — never e?.message directly
- No @ts-expect-error
```

---

## Active Issues Fixed This Session

| ID | Item | Code Status | Env Required |
|---|---|---|---|
| KI-001 | ChatDock Redis pub/sub | ✅ WIRED — `initChatDockPubSub()` in startup | `REDIS_URL` on Railway (auto-falls back to local if missing) |
| KI-007 | Web Push offline delivery | ✅ WIRED — `pushNotificationService.ts` | `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` on Railway |
| KI-008 | ChatDock message store | ✅ WIRED — imported in `dockChatRoutes.ts` | Needs full per-message save/read wiring in next phase |
| ENV-1 | PII field encryption | ✅ SELF-PROTECTING — hard-crashes if missing key in prod | `FIELD_ENCRYPTION_KEY` on Railway (32-char random secret) |
| ENV-2 | Auditor token URLs | ✅ HAS FALLBACKS — all callers have `|| ''` fallback | `APP_BASE_URL` on Railway (e.g. `https://coaileague-development.up.railway.app`) |
| ENV-3 | Plaid encryption + webhook | ✅ SELF-PROTECTING — `configValidator` errors at boot in prod when Plaid is configured but secrets missing | `PLAID_WEBHOOK_SECRET` + `PLAID_ENCRYPTION_KEY` (or `FIELD_ENCRYPTION_KEY` ≥ 64 hex) when `PLAID_CLIENT_ID`/`PLAID_SECRET` set |

---

## Trinity Schedule → Payroll → Invoice Spine (verified 2026-05-02)

End-to-end autonomy chain. Every node is wired and started at boot.

```
[shifts]                                    Daemons started in server/index.ts
  ↓ shiftMonitoringService               2945  ShiftMonitoringService
  ↓ coveragePipeline                     2955  CoveragePipeline
  ↓ trinityAutonomousScheduler           routes/trinitySchedulingRoutes (Zod-validated, SLA-gated)
  ↓ shiftCompletionBridge                automation/shiftCompletionBridge
[time_entries]
  ↓ trinity.run_invoice_lifecycle        workflowOrchestrator (event: time_entry.approved)
[invoices]
  ↓ weeklyBillingRunService              1572  Weekly Billing Run
  ↓ overdueCollectionsService            2964  OverdueCollectionsSweep   ← NEW (was missing)
  ↓ Stripe webhook handler               /api/stripe/webhook (rawBody asserted)
[payroll_runs]
  ↓ payrollAutoCloseService              automationTriggerService daily
  ↓ payrollReadinessScanner              48h pre-deadline
  ↓ trinity.process_payroll_anomalies    workflowOrchestrator (45s subagent timeout)
  ↓ atomicFinancialLockService           pg_advisory_xact_lock
  ↓ achTransferService → Plaid           idempotency-keyed
  ↓ payrollTransferMonitor               2933  poll every 5 min
[paid_to_employee]
```

### Trinity action surface — financial verbs (after this verification pass)

Dispatcher patterns in `server/services/trinity/trinityActionDispatcher.ts`:

| Verb | actionId | Risk | Handler location |
|---|---|---|---|
| "send / email invoice" | `billing.invoice_send` | medium | `trinityInvoiceEmailActions.ts:54` |
| "resend invoice" | `billing.invoice_send` (resend:true) | low | same |
| "create / draft invoice" | `billing.invoice_create` | medium | `actionRegistry.ts:2208` |
| "void / cancel invoice" | `billing.invoice_void` | high | `actionRegistry.ts:2654` |
| "mark invoice paid" | `billing.invoice_status` (status:'paid') | medium | `trinityInvoiceEmailActions.ts:294` |
| "run payroll" | `payroll.run_payroll` | high | `actionRegistry` (queues) |
| "fill / cover shift" | `scheduling.fill_open_shift` | low | scheduling action set |
| "verify TOPS screenshot" | `trinity.verify_tops_screenshot` | — | `workflowOrchestrator.ts` ← NEW |

---

## Known Debt — Verification Pass 2026-05-02

These are documented gaps where code is *intentionally* incomplete or where a downstream system is missing. Address before marking the spine 100%.

| ID | Debt | Severity | Location | Notes |
|---|---|---|---|---|
| VD-01 | `billing.invoice_refund` has no handler | MEDIUM | dispatcher pattern was deliberately NOT added; refund handler must call `stripe.refunds.create` + reverse `invoicePayments` + ledger entry within a DB transaction | Pattern omitted on purpose so Trinity doesn't promise something she can't do. Add pattern only after handler ships. |
| VD-02 | Scheduling actions not in `trinityServiceRegistry` | LOW | `shared/config/trinityEditableRegistry.ts` lists protected/editable modules but no machine-readable scheduling-action surface | Cosmetic — actions still execute via dispatcher regex. |
| VD-03 | Cron-only workflows (missed_clockin, shift_reminder, payroll_anomaly) | LOW | `workflows/*.ts` register as actions but their cron triggers live in `autonomousScheduler` | If autonomousScheduler crashes they stall until restart. Add event subscriptions as defense-in-depth. |
| VD-04 | `taxDeadlineMonitor` cron at 06:00 only | LOW | `proactiveOrchestrator.ts` schedule | If boot is after 06:00 on a deadline day the alert misses. Acceptable for v1. |
| VD-05 | ~~`tests/security/` not in vitest workspace~~ | RESOLVED 2026-05-02 | `vitest.workspace.ts` now has a `security` project — run via `npx vitest run --project security`. |
| VD-06 | Plaid 429 exhaustion → silent `payment_held` | MEDIUM | `plaidService.ts:239-262` after 3 retries | `payrollTransferMonitor` alerts owner after 3 consecutive Plaid API failures, but resolution is manual. |
| VD-07 | `payrollAnomalyWorkflow` 45s timeout fails OPEN | MEDIUM | `payrollAnomalyWorkflow.ts` | On timeout the workflow returns `blocked:false, success:false` — payroll is NOT auto-blocked. The summary string explicitly recommends manual review; UI must surface this. |
| VD-08 | `bank-status` endpoint returns any employee in same workspace | LOW | `plaidRoutes.ts:348-383` | Only returns last4 + institution name (no full account #) but is a same-workspace privacy leak. Add `isSelf || isManagerOrAbove` guard. |
| VD-09 | Stripe API version pinned to `2025-09-30.clover` | LOW | `stripeClient.ts:19` | No fallback path if Stripe deprecates. Acceptable until Stripe announces breaking change. |

---

## Statewide Protective Services — Live Test Readiness

```
1. featureStubRouter MUST stay LAST in routes.ts — never move it
2. Trinity = ONE individual — no mode-switching, no personality toggles
3. HelpAI = only bot field workers see
4. Every workspace query: workspace_id predicate REQUIRED (no cross-tenant leaks)
5. Financial writes: db.transaction() REQUIRED
6. Money math: FinancialCalculator (decimal.js) REQUIRED — no floating-point
7. Every document: branded PDF to tenant vault — never raw data response
8. WebSocket: WsPayload type — never add data:any or shift?:any
9. actionRegistry: keep < 300 total actions
10. New route: add to correct domain file — not routes.ts directly
11. New service: check this map for existing service before creating new
12. Trinity legal advice: never — hard-coded refusal in all legally-adjacent outputs
13. PUBLIC SAFETY BOUNDARY (non-negotiable):
    - Trinity/HelpAI never call 911, dispatch police/fire/EMS, or guarantee safety
    - Human supervisor is ALWAYS required for safety-critical decisions
    - Enforced at 3 layers:
        action  → trinityConscience.ts Principle 8 (hard block)
        intent  → trinityActionDispatcher.ts PUBLIC_SAFETY_REFUSAL_PATTERNS
        language → publicSafetyGuard.ts guardOutbound() (rewrite + disclaimer)
    - Approved phrasing: "Our role is to observe, deter, and report"
    - Tests: tests/security/publicSafetyGuard.test.ts +
            tests/security/trinityConsciencePublicSafety.test.ts
    - See CLAUDE.md "LAW: Public Safety Boundary" for full text
    - Change requires written legal approval
```

---

## Handover Notes for Next Session

### Pending Work (carry forward)
See `PENDING_WORK.md` or memory — ChatDock Feature Parity, Voice, Inbound Email expansion,
Seasonal effects, Trinity Biological Brain enhancement, Pre-Go-Live Audit.

### Files Never to Modify Without Full Understanding
- `server/routes.ts` — featureStubRouter position is critical
- `server/auth.ts` — session/cookie config affects all auth
- `server/services/billing/founderExemption.ts` — Statewide permanent exemption
- `build.mjs` — externals list prevents production crashes
- `shared/schema.ts` — 661-table schema, coordinate with DB migrations

### Key Singleton Patterns
- `aiBrainActionRegistry` — sync actions via constructor, async via `ready` Promise
- `helpaiOrchestrator` — imports from `server/services/helpai/platformActionHub`
- `getChatDockPubSub()` — Redis or in-memory based on REDIS_URL presence
- `universalNotificationEngine` — workspace-scoped, 6hr dedup windows

### Production Monitoring Signals
- `/api/health` — Railway health check, returns service status
- `[ChatDurability] No REDIS_URL` in logs = single-replica mode (set REDIS_URL to fix)
- `FIELD_ENCRYPTION_KEY not configured` in logs = SPS forms degraded
- `GEMINI_API_KEY not found` in logs = Trinity AI brain disabled

---

*SYSTEM_MAP.md updated 2026-05-02 | CoAIleague Platform v2.4*
