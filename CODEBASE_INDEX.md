# COAILEAGUE CODEBASE INDEX
## Platform Map for Jack & Claude — Updated 2026-04-25

**Purpose:** Jack reads this file to understand the full platform before touching any code.
Both agents check this before creating new files — if the operation already exists, wire to it.

**Stats:** 361 route files | 200,508 route lines | 928 service files | 490,132 service lines

---

## RULES (read before any work)
1. **No new files unless the operation genuinely doesn't exist anywhere**
2. **One canonical path per operation** — duplicate routes get deleted, not wrapped
3. **Delete > Extract** — find dead code first, kill it, then simplify
4. **Use domain services** — `invoiceService`, `storage`, `platformEventBus`, `db` are singletons
5. **Audit for overlap BEFORE touching a file** — check the Known Duplicates section below

---

## KNOWN DUPLICATES & OVERLAPS (fix these first)

| Files | Problem | Action |
|---|---|---|
| `time-entry-routes.ts` (2,707L) + `timeEntryRoutes.ts` (924L) | Same domain, likely 60%+ overlap | Consolidate to one file |
| `billing-api.ts` (1,838L) + `billingSettingsRoutes.ts` (600L) + `stripeInlineRoutes.ts` (923L) | All billing, scattered | Merge to billingRoutes.ts + stripeWebhooks.ts |
| `chat.ts` (1,666L) + `chatInlineRoutes.ts` (1,316L) | Chat split across 2 large files | Consolidate or enforce clear boundary |
| `complianceRoutes.ts` (1,823L) + `compliance/` folder | Compliance in root + subfolder | Root file should delegate to subfolder |
| `onboardingRoutes.ts` (819L) + `onboardingInlineRoutes.ts` (1,545L) | Same domain | Pick one, merge other |
| `aiOrchestraRoutes.ts` (575L) + `aiOrchestratorRoutes.ts` (483L) | Near-identical names | Almost certainly duplicate — audit |
| `ai-brain-routes.ts` (1,645L) + `aiBrainInlineRoutes.ts` (1,171L) | AI brain in two large files | Boundary unclear — audit |
| `miscRoutes.ts` (2,776L) | Catch-all — probably 50%+ dead code | Audit, delete dead, move survivors |
| `devRoutes.ts` (2,458L) | Dev-only — should not exist in production | Strip from prod build entirely |
| `helpai-routes.ts` (1,297L) + `helpAITriageRoutes.ts` (760L) | HelpAI in two files | Consolidate |

---

## CANONICAL SERVICES (use these — don't reimplement)

| Operation | Canonical Service | File |
|---|---|---|
| Invoice CRUD | `invoiceService` | `server/services/billing/invoice.ts` |
| Payroll runs | `createPayrollRunForPeriod`, etc. | `server/services/payroll/payrollRunCreationService.ts` |
| Pay stubs | `paystubService` | `server/services/paystubService.ts` |
| Tax forms | `taxFormGeneratorService` | `server/services/taxFormGeneratorService.ts` |
| Document vault | `saveToVault` | `server/services/documents/businessFormsVaultService.ts` |
| Storage (DB abstraction) | `storage` | `server/storage.ts` |
| Event bus | `platformEventBus` | `server/services/platformEventBus.ts` |
| Websocket broadcast | `broadcastToWorkspace` | `server/websocket.ts` |
| Notifications | `universalNotificationEngine` | `server/services/universalNotificationEngine.ts` |
| Audit logging | `storage.createAuditLog()` | `server/storage.ts` |
| Token metering | `tokenManager` | `server/services/billing/tokenManager.ts` |
| Tier enforcement | `billingTiersRegistry` | `server/services/billing/billingTiersRegistry.ts` |
| Shift operations | (extract target) | `server/routes/shiftRoutes.ts` — needs service |
| Employee ops | (extract target) | `server/routes/employeeRoutes.ts` — needs service |
| RFP scoring | `scoreRfpComplexity` | `server/services/billing/rfpComplexityScorer.ts` |
| NACHA generation | `generateNachaFile` | `server/services/payroll/payrollNachaService.ts` |
| Bank accounts | `addBankAccount`, etc. | `server/services/payroll/payrollBankAccountService.ts` |
| Bonus/Commission | `createBonusPayEntry`, etc. | `server/services/payroll/payrollSupplementalPayService.ts` |
| Compliance engine | (existing) | `server/services/compliance/trinityComplianceEngine.ts` |
| ACH transfers | `initiatePayrollAchTransfer` | `server/services/payroll/achTransferService.ts` |
| Financial math | named functions | `server/services/financialCalculator.ts` |

---

## DOMAIN: BILLING
**Total:** 13,487 lines across 21 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `invoiceRoutes.ts` | 3818 | 43 | GET /:id/pdf; GET /proposals; PATCH /proposals/:id/approve |
| ⚠️ `billing-api.ts` | 1838 | 0 | — |
| ⚠️ `stripeInlineRoutes.ts` | 923 | 12 | GET /config; POST /connect-account; POST /onboarding-link |
| ⚠️ `qbReportsRoutes.ts` | 822 | 12 | — |
| ⚠️ `quickbooks-sync.ts` | 607 | 11 | GET /health; POST /api/admin/quickbooks/sync-staffing-clients; GET /api/quickbooks/sync/retry-queue |
| ⚠️ `billingSettingsRoutes.ts` | 600 | 14 | GET /seat-hard-cap; PATCH /seat-hard-cap |
| ⚠️ `financialReporting/revenueRecognitionRoutes.ts` | 592 | 9 | GET /recognition/summary; GET /recognition/schedules; POST /recognition/schedules |
| ⚠️ `timesheetInvoiceRoutes.ts` | 545 | 0 | — |
| ⚠️ `financialIntelligence.ts` | 510 | 10 | GET /pl/summary; GET /pl/insights; POST /pl/insights |
| 🔸 `budgetRoutes.ts` | 422 | 11 | GET /; GET /:id; POST / |
| 🔸 `plaidRoutes.ts` | 420 | 9 | GET /status; POST /link-token/org; POST /exchange/org |
| 🔸 `expenseRoutes.ts` | 361 | 10 | GET /categories; POST /; GET / |
| 🔸 `payStubRoutes.ts` | 285 | 5 | GET /pay-stubs/:id; GET /api/paystubs/current; GET /api/paystubs/:employeeId/:startDate/:endDate |
| 🔸 `usageRoutes.ts` | 282 | 5 | GET /packs; POST /purchase |
| 🔸 `financialAdminRoutes.ts` | 275 | 7 | — |
| 🔸 `domains/billing.ts` | 217 | 0 | — |
| 🔸 `financeSettingsRoutes.ts` | 203 | 6 | — |
| 🔸 `mileageRoutes.ts` | 203 | 8 | — |
| ✅ `financeInlineRoutes.ts` | 192 | 7 | — |
| ✅ `plaidWebhookRoute.ts` | 189 | 1 | POST / |
| ✅ `financeRoutes.ts` | 183 | 10 | GET /ledger/chart-of-accounts; GET /ledger/journal-entries; GET /ledger/pl-report |

## DOMAIN: PAYROLL
**Total:** 2,707 lines across 2 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `payrollRoutes.ts` | 2067 | 52 | GET /export/csv; GET /proposals; PATCH /proposals/:id/approve |
| ⚠️ `payrollTimesheetRoutes.ts` | 640 | 7 | — |

## DOMAIN: SCHEDULING
**Total:** 12,970 lines across 18 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `shiftRoutes.ts` | 3622 | 36 | GET /; GET /today; GET /upcoming |
| ⚠️ `scheduleosRoutes.ts` | 1325 | 18 | POST /ai/toggle; POST /ai/trigger-session; GET /ai/status |
| ⚠️ `advancedSchedulingRoutes.ts` | 1219 | 0 | — |
| ⚠️ `schedulerRoutes.ts` | 886 | 19 | GET /profiles; GET /profiles/:employeeId; POST /profiles/:employeeId/pool |
| ⚠️ `calendarRoutes.ts` | 805 | 0 | — |
| ⚠️ `shiftTradingRoutes.ts` | 629 | 11 | — |
| ⚠️ `orchestratedScheduleRoutes.ts` | 560 | 8 | GET /status; POST /ai/fill-shift; POST /ai/trigger-session |
| ⚠️ `schedulesRoutes.ts` | 557 | 6 | GET /week/stats; POST /publish; POST /unpublish |
| ⚠️ `flexStaffingRoutes.ts` | 547 | 14 | — |
| ⚠️ `shiftChatroomRoutes.ts` | 522 | 16 | GET /active; GET /by-shift/:shiftId; GET /:chatroomId/premium-status |
| 🔸 `autonomousSchedulingRoutes.ts` | 423 | 0 | — |
| 🔸 `gateDutyRoutes.ts` | 389 | 13 | GET /stats; GET /vehicles/current; GET /personnel/current |
| 🔸 `trinitySchedulingRoutes.ts` | 359 | 4 | GET /insights; POST /auto-fill; POST /ask |
| 🔸 `breakRoutes.ts` | 317 | 14 | GET /jurisdiction |
| 🔸 `aiSchedulingRoutes.ts` | 274 | 3 | — |
| 🔸 `availabilityRoutes.ts` | 251 | 9 | GET /; POST /; PUT /:id |
| ✅ `coverageRoutes.ts` | 186 | 0 | — |
| ✅ `seasonalRoutes.ts` | 99 | 5 | — |

## DOMAIN: TIME
**Total:** 4,708 lines across 4 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `time-entry-routes.ts` | 2707 | 0 | — |
| ⚠️ `timeEntryRoutes.ts` | 924 | 16 | GET /export/csv; GET /; POST / |
| ⚠️ `timeOffRoutes.ts` | 708 | 16 | — |
| 🔸 `timesheetReportRoutes.ts` | 369 | 0 | — |

## DOMAIN: HR
**Total:** 13,958 lines across 22 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `employeeRoutes.ts` | 2451 | 28 | PATCH /:employeeId/role; PATCH /:employeeId/position; PATCH /:employeeId/access |
| ⚠️ `hrInlineRoutes.ts` | 1795 | 32 | — |
| ⚠️ `onboardingInlineRoutes.ts` | 1545 | 36 | POST /invite; GET /invite/:token; GET /invites |
| ⚠️ `trainingRoutes.ts` | 1290 | 26 | GET /sessions; POST /sessions; GET /sessions/:id |
| ⚠️ `hireosRoutes.ts` | 871 | 17 | GET /documents/me; POST /documents; GET /documents/:employeeId |
| ⚠️ `onboardingRoutes.ts` | 819 | 0 | — |
| ⚠️ `performanceRoutes.ts` | 754 | 9 | GET /disciplinary; POST /disciplinary; PATCH /disciplinary/:id/acknowledge |
| ⚠️ `terminationRoutes.ts` | 572 | 4 | — |
| ⚠️ `trainingComplianceRoutes.ts` | 510 | 13 | — |
| 🔸 `hr/documentRequestRoutes.ts` | 490 | 5 | GET /types; GET /gaps; GET / |
| 🔸 `hiringRoutes.ts` | 416 | 11 | GET /pipeline; GET /applicants/:id; PATCH /applicants/:id/stage |
| 🔸 `disciplinaryRecordRoutes.ts` | 379 | 6 | GET /; POST /; PATCH /:id |
| 🔸 `owner-employee.ts` | 373 | 7 | GET /status; POST /ensure; POST /sync-role-holders |
| 🔸 `trainingCertificationRoutes.ts` | 270 | 8 | — |
| 🔸 `hrisRoutes.ts` | 248 | 8 | GET /employees; GET /providers; GET /connections |
| 🔸 `employeePacketRoutes.ts` | 238 | 0 | — |
| 🔸 `offboardingRoutes.ts` | 235 | 8 | GET /api/offboarding/cases; POST /api/offboarding/cases; PATCH /api/offboarding/cases/:id |
| ✅ `holidayRoutes.ts` | 167 | 6 | GET /; POST /validate-timezone; GET /check-date |
| ✅ `employeeOnboardingRoutes.ts` | 151 | 0 | — |
| ✅ `hiringSettingsRoutes.ts` | 143 | 2 | GET /; PUT / |
| ✅ `performanceNoteRoutes.ts` | 128 | 4 | GET /; POST /; PATCH /:id |
| ✅ `benefitRoutes.ts` | 113 | 5 | GET /; GET /employee/:employeeId; POST / |

## DOMAIN: CLIENT/CONTRACT
**Total:** 6,924 lines across 16 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `clientRoutes.ts` | 1604 | 28 | GET /; GET /lookup; POST / |
| ⚠️ `salesInlineRoutes.ts` | 907 | 22 | GET /templates; GET /leads; POST /leads |
| ⚠️ `contractPipelineRoutes.ts` | 786 | 25 | GET /templates; POST /templates; GET /templates/:id |
| ⚠️ `clientCommsRoutes.ts` | 550 | 7 | GET /threads; POST /threads; GET /threads/:id/messages |
| 🔸 `salesPipelineRoutes.ts` | 431 | 10 | — |
| 🔸 `leadCrmRoutes.ts` | 408 | 10 | — |
| 🔸 `salesRoutes.ts` | 392 | 0 | — |
| 🔸 `rfpPipelineRoutes.ts` | 309 | 6 | — |
| 🔸 `contractRenewalRoutes.ts` | 260 | 9 | — |
| 🔸 `clientSatisfactionRoutes.ts` | 251 | 7 | — |
| 🔸 `proposalRoutes.ts` | 236 | 9 | — |
| 🔸 `rfpEthicsRoutes.ts` | 227 | 0 | — |
| 🔸 `clientPortalInviteRoutes.ts` | 224 | 3 | GET /portal/setup/:token; POST /portal/setup/:token; POST /:id/invite |
| 🔸 `clientServiceRequestRoutes.ts` | 223 | 3 | GET /; POST /; PATCH /:id |
| ✅ `domains/clients.ts` | 81 | 0 | — |
| ✅ `domains/sales.ts` | 35 | 0 | — |

## DOMAIN: COMPLIANCE
**Total:** 11,750 lines across 23 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `complianceRoutes.ts` | 1823 | 51 | POST /auditor/login; POST /auditor/set-password; GET /auditor/me |
| ⚠️ `compliance/regulatoryPortal.ts` | 1279 | 27 | POST /lookup; POST /request; GET /request/:id/status |
| ⚠️ `officerCertificationRoutes.ts` | 908 | 13 | POST /seed-modules; GET /modules; GET /modules/:id |
| ⚠️ `compliance/enforcement.ts` | 820 | 22 | — |
| ⚠️ `compliance/documents.ts` | 722 | 9 | — |
| ⚠️ `spsDocumentRoutes.ts` | 701 | 0 | — |
| ⚠️ `spsFormsRoutes.ts` | 630 | 0 | — |
| ⚠️ `armoryRoutes.ts` | 512 | 11 | GET /inspections; POST /inspections; GET /qualifications |
| ⚠️ `trainingComplianceRoutes.ts` | 510 | 13 | — |
| 🔸 `compliance/regulator.ts` | 456 | 5 | — |
| 🔸 `policyComplianceRoutes.ts` | 450 | 15 | — |
| 🔸 `stateRegulatoryRoutes.ts` | 407 | 17 | GET /state-context; GET /state-context/tax-summary; GET /penal-guidance/:stateCode |
| 🔸 `compliance/packets.ts` | 401 | 4 | — |
| 🔸 `compliance/approvals.ts` | 353 | 4 | — |
| 🔸 `complianceEvidenceRoutes.ts` | 309 | 6 | — |
| 🔸 `compliance/regulatoryEnrollment.ts` | 277 | 4 | GET /status; GET /workspace; POST /submit |
| 🔸 `complianceReportsRoutes.ts` | 261 | 5 | — |
| 🔸 `compliance/matrix.ts` | 245 | 2 | — |
| 🔸 `compliance/records.ts` | 204 | 5 | — |
| ✅ `compliance/auditTrail.ts` | 192 | 5 | — |
| ✅ `compliance/checklists.ts` | 160 | 3 | — |
| ✅ `domains/compliance.ts` | 98 | 0 | — |
| ✅ `compliance/index.ts` | 32 | 0 | — |

## DOMAIN: TRINITY/AI
**Total:** 15,771 lines across 30 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `ai-brain-routes.ts` | 1645 | 0 | — |
| ⚠️ `helpai-routes.ts` | 1297 | 0 | — |
| ⚠️ `trinityInsightsRoutes.ts` | 1240 | 27 | GET /insights; POST /insights/:id/read; POST /scan |
| ⚠️ `aiBrainInlineRoutes.ts` | 1171 | 43 | — |
| ⚠️ `subagentRoutes.ts` | 775 | 27 | GET /subagents; GET /subagents/:id; GET /subagents/domain/:domain |
| ⚠️ `helpAITriageRoutes.ts` | 760 | 2 | POST /triage; GET /my-workspace-history |
| ⚠️ `ai-brain-console.ts` | 693 | 0 | — |
| ⚠️ `trinityMaintenanceRoutes.ts` | 598 | 12 | GET /health; POST /quickbooks/refresh; GET /insight |
| ⚠️ `aiOrchestraRoutes.ts` | 575 | 20 | POST /execute; GET /models; GET /task-types |
| ⚠️ `trinityTrainingRoutes.ts` | 549 | 8 | GET /status; POST /seed; POST /seed-org |
| ⚠️ `trinityStaffingRoutes.ts` | 546 | 12 | GET /status; GET /settings; PUT /settings |
| ⚠️ `agentActivityRoutes.ts` | 512 | 11 | GET /active; GET /completions; GET /tasks/:taskId |
| 🔸 `aiOrchestratorRoutes.ts` | 483 | 9 | — |
| 🔸 `trinityAgentDashboardRoutes.ts` | 473 | 7 | GET /queue; GET /queue/:workspaceId; GET /reasoning/:actionId |
| 🔸 `trinityRevenueRoutes.ts` | 470 | 4 | POST /dev/repair-invoices; POST /dev/run-payroll; POST /dev/simulate-week |
| 🔸 `trinityTransparencyRoutes.ts` | 418 | 8 | GET /overview; GET /actions; GET /decisions |
| 🔸 `aiRoutes.ts` | 370 | 8 | POST /responses/:id/feedback; GET /responses; GET /suggestions |
| 🔸 `ai-brain-capabilities.ts` | 369 | 0 | — |
| 🔸 `trinityNotificationRoutes.ts` | 361 | 0 | — |
| 🔸 `trinitySchedulingRoutes.ts` | 359 | 4 | GET /insights; POST /auto-fill; POST /ask |
| 🔸 `trinityChatRoutes.ts` | 345 | 7 | POST /chat; GET /history; GET /session/:sessionId/messages |
| 🔸 `aiBrainControlRoutes.ts` | 322 | 14 | GET /health; GET /services; GET /services/:serviceName |
| 🔸 `trinitySelfEditRoutes.ts` | 253 | 14 | GET /rules; PATCH /rules; GET /circuit-breaker |
| 🔸 `aiBrainMemoryRoutes.ts` | 241 | 0 | — |
| 🔸 `domains/trinity.ts` | 233 | 0 | — |
| 🔸 `trinityControlConsoleRoutes.ts` | 207 | 5 | GET /stream; GET /timeline; GET /thoughts |
| ✅ `trinityLimbicRoutes.ts` | 164 | 4 | POST /detect; POST /officer-burnout/:officerId; GET /history/:entityId/:entityType |
| ✅ `trinityDecisionRoutes.ts` | 117 | 3 | GET /decisions; GET /decisions/:entityType/:entityId; POST /decisions/:decisionId/override |
| ✅ `trinityAuditRoutes.ts` | 113 | 2 | GET /audit-trail; GET /audit-trail/failures |
| ✅ `trinityEscalationRoutes.ts` | 112 | 3 | GET /pending; POST /check; POST /check-ticket |

## DOMAIN: CHAT/COMMS
**Total:** 15,895 lines across 19 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `chat-rooms.ts` | 2828 | 21 | — |
| ⚠️ `chat-management.ts` | 1923 | 28 | — |
| ⚠️ `internalEmails.ts` | 1668 | 21 | — |
| ⚠️ `chat.ts` | 1666 | 33 | GET /api/chat/conversations; POST /api/chat/conversations; GET /api/chat/conversations/:id/messages |
| ⚠️ `chatInlineRoutes.ts` | 1316 | 25 | GET /conversations; POST /conversations; GET /conversations/:id/messages |
| ⚠️ `inboundEmailRoutes.ts` | 1037 | 0 | — |
| ⚠️ `email/emailRoutes.ts` | 786 | 0 | — |
| ⚠️ `chat-uploads.ts` | 631 | 3 | — |
| ⚠️ `emailUnsubscribe.ts` | 620 | 5 | — |
| ⚠️ `broadcasts.ts` | 602 | 15 | POST /; GET /; GET /my |
| 🔸 `commOsRoutes.ts` | 465 | 9 | GET /rooms; GET /rooms/live; POST /rooms/:id/join |
| 🔸 `commInlineRoutes.ts` | 418 | 21 | — |
| 🔸 `dockChatRoutes.ts` | 409 | 7 | — |
| 🔸 `privateMessageRoutes.ts` | 382 | 9 | GET /conversations; GET /:conversationId; POST /upload |
| 🔸 `messageBridgeRoutes.ts` | 373 | 7 | — |
| 🔸 `emails.ts` | 277 | 9 | — |
| 🔸 `smsRoutes.ts` | 266 | 0 | — |
| ✅ `chat-export.ts` | 156 | 0 | — |
| ✅ `domains/comms.ts` | 72 | 0 | — |

## DOMAIN: AUTH/WORKSPACE
**Total:** 10,462 lines across 12 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `adminRoutes.ts` | 2389 | 75 | POST /dev-execute; PATCH /workspace/:workspaceId; GET /support/search |
| ⚠️ `workspaceInlineRoutes.ts` | 1937 | 29 | POST /switch/:workspaceId; GET /health; GET /status |
| ⚠️ `authCoreRoutes.ts` | 1849 | 29 | — |
| ⚠️ `platformRoutes.ts` | 1848 | 37 | GET /stats; GET /personal-data; GET /workspaces/search |
| ⚠️ `workspace.ts` | 853 | 11 | GET /all; POST /; GET /suggest-org-code |
| ⚠️ `authRoutes.ts` | 631 | 22 | GET /csrf-token; POST /csrf-token; POST /logout-all |
| 🔸 `adminPermissionRoutes.ts` | 293 | 7 | GET /meta; GET /workspaces; GET /workspaces/:wsId/matrix |
| 🔸 `inviteRoutes.ts` | 263 | 0 | — |
| ✅ `roleLabelRoutes.ts` | 146 | 3 | GET /; PUT /:role; DELETE /:role |
| ✅ `permissionMatrixRoutes.ts` | 140 | 4 | GET /; GET /meta; PATCH / |
| ✅ `domains/orgs.ts` | 68 | 0 | — |
| ✅ `domains/auth.ts` | 45 | 0 | — |

## DOMAIN: REPORTING/ANALYTICS
**Total:** 5,039 lines across 10 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `analyticsRoutes.ts` | 1661 | 17 | — |
| ⚠️ `reportsRoutes.ts` | 695 | 12 | POST /generate; POST /share; GET /billable-hours |
| ⚠️ `biAnalyticsRoutes.ts` | 542 | 10 | GET /calloff-rates; GET /license-expiry; GET /client-health |
| 🔸 `ownerAnalytics.ts` | 498 | 0 | — |
| 🔸 `dashboardRoutes.ts` | 429 | 6 | — |
| 🔸 `insightsRoutes.ts` | 405 | 10 | — |
| 🔸 `exportRoutes.ts` | 354 | 13 | — |
| 🔸 `bidAnalyticsRoutes.ts` | 241 | 7 | — |
| ✅ `metricsRoutes.ts` | 125 | 6 | — |
| ✅ `kpiAlertRoutes.ts` | 89 | 4 | GET /; POST /; PATCH /:id |

## DOMAIN: OPS/SECURITY
**Total:** 8,292 lines across 20 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `rmsRoutes.ts` | 1728 | 0 | — |
| ⚠️ `equipmentRoutes.ts` | 859 | 22 | — |
| ⚠️ `visitorManagementRoutes.ts` | 672 | 0 | — |
| ⚠️ `cadRoutes.ts` | 589 | 0 | — |
| 🔸 `safetyRoutes.ts` | 441 | 0 | — |
| 🔸 `identityPinRoutes.ts` | 432 | 0 | — |
| 🔸 `incidentPipelineRoutes.ts` | 402 | 0 | — |
| 🔸 `postOrderVersionRoutes.ts` | 387 | 11 | — |
| 🔸 `dispatch.ts` | 349 | 10 | POST /gps; GET /units; GET /units/:employeeId/trail |
| 🔸 `vehicleRoutes.ts` | 344 | 11 | — |
| 🔸 `postOrderRoutes.ts` | 320 | 11 | — |
| 🔸 `officerScoreRoutes.ts` | 312 | 7 | GET /api/score/me; GET /api/score/employee/:employeeId; POST /api/score/grievance |
| 🔸 `guardTourRoutes.ts` | 311 | 11 | — |
| 🔸 `incidentPatternRoutes.ts` | 311 | 8 | — |
| 🔸 `clockinPinRoutes.ts` | 304 | 0 | — |
| ✅ `situationRoutes.ts` | 160 | 0 | — |
| ✅ `siteBriefingRoutes.ts` | 150 | 6 | — |
| ✅ `gpsRoutes.ts` | 89 | 2 | POST /breadcrumb; GET /trail/:timeEntryId |
| ✅ `domains/ops.ts` | 77 | 0 | — |
| ✅ `officerIntelligenceRoutes.ts` | 55 | 2 | GET /api/officers/:officerId/dashboard; GET /api/officers/dashboards/all |

## DOMAIN: SUPPORT/HELPDESK
**Total:** 6,418 lines across 8 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `support-command-console.ts` | 1543 | 0 | — |
| ⚠️ `supportRoutes.ts` | 1534 | 29 | POST /escalate; POST /create-ticket; POST /helpos-chat |
| ⚠️ `helpdeskRoutes.ts` | 1219 | 31 | POST /session/start; POST /session/:sessionId/message; POST /session/:sessionId/escalate |
| ⚠️ `ticketSearchRoutes.ts` | 1047 | 9 | GET /search; GET /search/by-number/:ticketNumber; GET /search/by-status/:status |
| 🔸 `reviewRoutes.ts` | 382 | 15 | — |
| 🔸 `supportActionRoutes.ts` | 350 | 14 | GET /api/support/actions/available; POST /api/support/actions/view-user; POST /api/support/actions/reset-password |
| 🔸 `feedbackRoutes.ts` | 308 | 10 | POST /; GET /; GET /:id |
| ✅ `domains/support.ts` | 35 | 0 | — |

## DOMAIN: BLOAT/DELETE CANDIDATES
**Total:** 8,376 lines across 9 files

| File | Lines | Routes | Key Routes |
|---|---|---|---|
| ⚠️ `miscRoutes.ts` | 2776 | 69 | — |
| ⚠️ `devRoutes.ts` | 2458 | 36 | POST /seed-expired-keys; POST /trigger-automation/:jobType; GET /automation-audit-logs |
| ⚠️ `sandbox-routes.ts` | 949 | 30 | GET /status; POST /seed; POST /clear |
| ⚠️ `command-documentation.ts` | 543 | 0 | — |
| ⚠️ `quickFixRoutes.ts` | 512 | 11 | GET /actions; GET /suggestions; POST /requests |
| 🔸 `migration.ts` | 373 | 0 | — |
| 🔸 `resilience-api.ts` | 322 | 16 | GET /circuit-breaker/status; POST /circuit-breaker/:service/reset; GET /rate-limit/status |
| 🔸 `bugRemediation.ts` | 224 | 9 | POST /submit; GET /report/:id; GET /analysis/:id |
| 🔸 `database-parity.ts` | 219 | 4 | GET /scan; POST /auto-fix; POST /quick-fix |

---

## TOP SERVICE FILES BY SIZE

| File | Lines | Exports |
|---|---|---|
| ⚠️ `ai-brain/aiBrainMasterOrchestrator.ts` | 6474 | aiBrainMasterOrchestrator |
| ⚠️ `autonomousScheduler.ts` | 4922 | getJobExecutionHistory, getScheduledJobsSummary, startAutonomousScheduler, manualTriggers |
| ⚠️ `ai-brain/actionRegistry.ts` | 4635 | registerAutonomousSchedulingBrainActions, registerUniversalIdActions, aiBrainActionRegistry |
| ⚠️ `ai-brain/subagentSupervisor.ts` | 4562 | getMailingInstruction, validateEmailData, GRADUATION_THRESHOLD, MINIMUM_EXECUTIONS_FOR_GRADUATION, subagentSupervisor |
| ⚠️ `trinityEventSubscriptions.ts` | 3909 | initializeTrinityEventSubscriptions, emitTrinityEvent, trinityEventSubscriptions |
| ⚠️ `ai-brain/trinityChatService.ts` | 3484 | trinityChatService |
| ⚠️ `ai-brain/providers/geminiClient.ts` | 3481 | getModelForTier, getAntiYapConfig, buildGenerationConfig, createConfiguredModel, GEMINI_MODELS |
| ⚠️ `scheduling/trinityAutonomousScheduler.ts` | 3199 | trinityAutonomousScheduler, schedulingComplianceService, clientPreferenceService, trinitySchedulingAI, schedulerEscalationChainService |
| ⚠️ `helpai/platformActionHub.ts` | 3181 | platformActionHub, helpaiOrchestrator |
| ⚠️ `emailService.ts` | 3119 | sendAssistedOnboardingHandoff, sendAutomationEmail, emailService |
| ⚠️ `bots/shiftRoomBotOrchestrator.ts` | 2816 | shiftRoomBotOrchestrator |
| ⚠️ `compliance/stateComplianceConfig.ts` | 2722 | getStateComplianceConfig, getStateRequiredDocuments, compareDocumentsToStateRequirements, getGenericStateConfig, getWorkersCompRequirement |
| ⚠️ `ai-brain/trinityIntelligenceLayers.ts` | 2628 | registerSchedulingCognitionActions, registerPayrollMathEngineActions, registerComplianceBrainActions, registerClientBillingIntelligenceActions, registerPredictiveAnalyticsBrainActions |
| ⚠️ `partners/quickbooksSyncService.ts` | 2527 | quickbooksSyncService |
| ⚠️ `ChatServerHub.ts` | 2497 | ChatServerHub, emitChatEvent, subscribeToChatEvents, initializeChatServerHub, shutdownChatServerHub |
| ⚠️ `ai-brain/aiBrainService.ts` | 2392 | aiBrainService |
| ⚠️ `payrollAutomation.ts` | 2369 | voidPayrollRun, amendPayrollEntry, executePayrollEntry, executeInternalPayroll, detectPayPeriod |
| ⚠️ `ai-brain/trinityPersona.ts` | 2265 | getRandomCognitivePause, getRandomAcknowledgment, getConversationalTransition, getUncertaintyPhrase, applyHumanizedTone |
| ⚠️ `emailCore.ts` | 2263 | generateUnsubscribeToken, isEmailUnsubscribed, isHardBounced, sendCanSpamCompliantEmail, getUncachableResendClient |
| ⚠️ `inboundOpportunityAgent.ts` | 2127 | inboundOpportunityAgent |
| ⚠️ `helpai/helpAIBotService.ts` | 2098 | assertIdentityForAction, shouldBotRespond, getAiResponse, IDENTITY_REQUIRED_ACTIONS, FAQ_ALLOWED_WITHOUT_IDENTITY |
| ⚠️ `billing/stripeWebhooks.ts` | 2011 | stripeWebhookService |
| ⚠️ `ai-brain/trinityOrgIntelligenceService.ts` | 1988 | trinityOrgIntelligenceService |
| ⚠️ `billing/invoice.ts` | 1962 | invoiceService |
| ⚠️ `ai-brain/trinityProactiveScanner.ts` | 1732 | trinityProactiveScanner |
| ⚠️ `contracts/contractPipelineService.ts` | 1718 | sendContractSigningReminders, contractPipelineService |
| ⚠️ `ai-brain/trinityExecutionFabric.ts` | 1703 | trinityExecutionFabric |
| ⚠️ `billingAutomation.ts` | 1672 | generateUsageBasedInvoices, generateInvoiceForClient, sendInvoiceViaStripe, generateWeeklyInvoices, processDelinquentInvoices |
| ⚠️ `helpai/helpAIOrchestrator.ts` | 1658 | helpAIHandleEscalatedPayload, helpAIOrchestrator |
| ⚠️ `documents/templateRegistry.ts` | 1647 | getTemplate, getAllTemplates, getTemplatesByCategory, getTemplateForLanguage, getTemplatesForLanguage |
| ⚠️ `ai-brain/trinityMemoryService.ts` | 1623 | connectTrinityMemoryToEventBus, trinityMemoryService |
| ⚠️ `ai-brain/subagents/onboardingOrchestrator.ts` | 1612 | onboardingOrchestrator |
| ⚠️ `shiftChatroomWorkflowService.ts` | 1591 | shiftChatroomWorkflowService |
| ⚠️ `training/trainingModuleSeeder.ts` | 1581 | seedPlatformTrainingModules |
| ⚠️ `ai-brain/trinitySelfEditGovernance.ts` | 1563 | trinitySelfEditGovernance |
| ⚠️ `ai-brain/tools/trinitySelfEditGovernance.ts` | 1563 | trinitySelfEditGovernance |
| ⚠️ `automation/trinityAutomationToggle.ts` | 1557 | trinityAutomationToggle |
| ⚠️ `criticalConstraintsBootstrap.ts` | 1549 | ensureCriticalConstraints |
| ⚠️ `ai-brain/trinityWorkOrderSystem.ts` | 1536 | trinityWorkOrderOrchestrator, trinityWorkOrderIntake, taskDecompositionEngine, solutionDiscoveryLoop, confidentCommitProtocol |
| ⚠️ `platformEventBus.ts` | 1514 | publishPlatformUpdate, announceNewFeature, announceBugfix, announceSecurityPatch, announceAutomationComplete |
| ⚠️ `trinity/trinityInboundEmailProcessor.ts` | 1478 | detectCategoryFromRecipient, processInboundEmail, reprocessInboundEmail |
| ⚠️ `orchestration/automationTriggerService.ts` | 1461 | automationTriggerService |
| ⚠️ `darPdfService.ts` | 1416 | generateDarPdf, generateShiftTransparencyPdf |
| ⚠️ `ai-brain/fastModeService.ts` | 1400 | registerFastModeBroadcaster, FAST_MODE_TIERS, FAST_MODE_CONFIG, fastModeService |
| ⚠️ `supportActionsService.ts` | 1352 | supportActionsService |
| ⚠️ `ai-brain/autonomousFixPipeline.ts` | 1351 | initializeAutonomousFixPipeline, autonomousFixPipeline |
| ⚠️ `ai-brain/tools/autonomousFixPipeline.ts` | 1351 | initializeAutonomousFixPipeline, autonomousFixPipeline |
| ⚠️ `ai-brain/subagents/schedulingSubagent.ts` | 1348 | schedulingSubagent |
| ⚠️ `timesheetInvoiceService.ts` | 1331 | generateInvoiceFromTimesheets, getUninvoicedTimeEntries, sendInvoice, markInvoicePaid, generateInvoicePdfBuffer |
| ⚠️ `ai-brain/platformChangeMonitor.ts` | 1326 | platformChangeMonitor |
| ⚠️ `aiNotificationService.ts` | 1291 | generatePlatformUpdate, pushAIInsight, getRecentUpdatesForUser, markUpdateViewed, getUnviewedUpdateCount |
| ⚠️ `universalNotificationEngine.ts` | 1260 | universalNotificationEngine, notificationEngine |
| ⚠️ `ai-brain/subagents/dataMigrationAgent.ts` | 1248 | dataMigrationAgent |
| ⚠️ `orchestration/universalStepLogger.ts` | 1247 | executeFullOrchestration, registerStepLoggerActions, universalStepLogger |
| ⚠️ `developmentSeed.ts` | 1237 | runDevelopmentSeed, ensurePhase0Seed, ensurePhase0ExtendedSeed |
| ⚠️ `ai-brain/trinityAutonomousOps.ts` | 1234 | initializeTrinityAutonomousOps, trinityAutonomousOps |
| ⚠️ `billing/middlewareTransactionFees.ts` | 1223 | chargePayrollMiddlewareFee, chargeInvoiceMiddlewareFee, chargePayoutMiddlewareFee, chargeAiCreditOverageFee, chargeEmploymentVerificationFee |
| ⚠️ `ai-brain/workboardService.ts` | 1211 | postDatabaseEventToAIBrain, workboardService |
| ⚠️ `employeeDocumentOnboardingService.ts` | 1202 | employeeDocumentOnboardingService |
| ⚠️ `productionSeed.ts` | 1174 | runDataCorrections, runStatewideWorkspaceBootstrap, runProductionDataCleanup, runPasswordMigrations, runWorkspaceHealthCorrections |

---

## GO-LIVE CHECKLIST (end of month target)

### Must ship:
- [ ] **Billing enforcement** — `billingTiersRegistry.ts` enforcement in routes
- [ ] **Shift scheduling** — `shiftRoutes.ts` canonical path, no duplicates  
- [ ] **Time entry** — consolidate `time-entry-routes.ts` + `timeEntryRoutes.ts`
- [ ] **Invoicing** — `invoiceRoutes.ts` using `invoiceService` throughout
- [ ] **Trinity autonomy** — proactive calloff, compliance alerts, shift fill
- [ ] **RESEND_WEBHOOK_SECRET** — set in Railway env vars

### Before touching any domain:
1. Read this index for the domain's files
2. Check the Known Duplicates table
3. Audit for dead routes (routes that always return 404 or have no UI caller)
4. Propose consolidation plan in `AGENT_HANDOFF.md` BEFORE writing code
5. Jack writes service/consolidation, Claude build-verifies, pushes

---

*This index is auto-generated. Run `python3 scripts/generate-index.py` to refresh.*
