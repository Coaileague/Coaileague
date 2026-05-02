# CoAIleague — Complete System Map
**Last updated:** 2026-05-02 · **Author:** Architect Claude · **HEAD:** claude/verify-workflow-billing-FGdaj

> **PURPOSE:** Single source of truth for all routes, mounts, middleware, services, and client pages.
> Before adding ANY new code — route, component, service, or hook — check this map first.
> Update this file in the same PR as your change.

---

## Platform Dimensions

| Layer | Count |
|---|---|
| Server route files | 280 |
| Total API endpoints | 2,952 |
| Server service files | 930 |
| Client pages (.tsx) | 344 |
| Client components | 322 |
| Domain orchestrators | 15 |
| Shared schema tables | 661 |

---

## Startup Chain

```
server/index.ts
  ├─ PORT env (default 5000)
  ├─ PORT_LOCK_FILE guard (prevents dual-start)
  ├─ app = express()
  ├─ server = await registerRoutes(app)    ← server/routes.ts
  ├─ Phase 1: DB connection (Neon PostgreSQL via Drizzle)
  ├─ Phase 2: Session (PostgreSQL session store, 24h TTL)
  ├─ Phase 3: Passport (local strategy + session serialization)
  ├─ Phase 4: registerRoutes() completes → all domains mounted
  ├─ Phase 5: Autonomous scheduler (node-cron jobs)
  ├─ Phase 6: WebSocket server (ws, bound to HTTP server)
  └─ server.listen({ port, host:'0.0.0.0' }) → Railway port
```

---

## server/routes.ts — Full Mount Order

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
| availabilityRoutes.ts | /api/availability | Availability management |

---

### 11. SUPPORT — server/routes/domains/support.ts
**Prefix:** `/api/platform, /api/support/*, /api/help`
**Auth:** requireAuth + platform staff guards
| Route File | Mounts At | Purpose |
|---|---|---|
| supportActionRoutes.ts | /api | Support actions |
| support-command-console.ts | /api/support/command | Command console |
| support-chat.ts | /api/support/chat | Support chat |
| ticketSearchRoutes.ts | /api/tickets | Ticket search |
| supportRoutes.ts (29 ep) | /api/support | Support CRUD |
| helpdeskRoutes.ts (31 ep) | /api/helpdesk | Helpdesk mgmt |
| service-control.ts | /api/platform/services | Platform services |
| financialAdminRoutes.ts | /api/financial-admin | Financial admin |
| helpAITriageRoutes.ts | /api/helpai-triage | HelpAI triage |
| adminWorkspaceDetailsRoutes.ts | /api/admin/workspace-details | Admin tools |
| trinityOrgStateRoutes.ts | /api/trinity/org-state | Org state |

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

```
npm run build = vite build && node build.mjs
npm run start = node dist/index.js

build.mjs external[] — these MUST stay externalized (CJS/ESM incompatible):
  date-fns, openai, twilio, typescript,
  @capacitor/haptics, @capacitor/core, @capacitor/app, @capacitor/push-notifications

vite.config.ts rollupOptions.external: [@capacitor/haptics]

nixpacks.toml: NODE_OPTIONS=--max-old-space-size=4096 (prevents OOM in Railway)
railway.toml:  buildCommand=npm run build · startCommand=npm run start

Client bundle entry: client/src/main.tsx
Server entry:        server/index.ts → dist/index.js (38MB)
```

---

## Open Items (Env Vars / Wiring — Not Code Issues)

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

## Architecture Rules (Permanent)

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
```

---

## TypeScript Debt Status

| Category | Baseline | Current | Status |
|---|---|---|---|
| Total combined any | 8,566 | 2,199 | 74.3% eliminated |
| catch(e:any) | 246 | 0 | ✅ |
| res:any handlers | 95 | 0 | ✅ |
| .values(as any) | 9 | 0 | ✅ |
| middleware as any | 183 | 0 | ✅ |
| @ts-expect-error | 142 | 0 | ✅ |
| esbuild errors | — | 0 | ✅ |

**Top remaining debt files (production):**
- settings.tsx: 62 (complex settings form with dynamic shapes)
- notifications-popover.tsx: 31 (platform update/maintenance alert types)
- universal-schedule.tsx: 31 (schedule grid with polymorphic shift types)
- productionSeed.ts: 26 (seed data with intentional any for DB inserts)
- client-portal.tsx: 22
- trinity-agent-dashboard.tsx: 18
- platformActionHub.ts: 18
