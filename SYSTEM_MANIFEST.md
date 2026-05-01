# SYSTEM_MANIFEST.md — CoAIleague Platform
## Full-Stack Canonical Map: UI → Hook → Route → Logic → DB

> **Generated:** 2026-05-01  |  **Pages:** 338  |  **Endpoints:** 2793  |  **DB Tables:** 748  |  **OC 1702 Files:** 22

```
ARCHITECTURE
  Browser (React)  ←→  API Layer (Express)  ←→  Services  ←→  Neon/PostgreSQL
       │                      │                     │               │
  Pages/Components    Route Files (363)      Service Layer    753 tables
  Hooks/Queries        Middleware (RBAC)      Trinity AI       22 domains
  Zod validation       Zod schemas            OC 1702 gate     PDF vault
```

---
## CONTENTS
| # | Domain | Pages | Endpoints | Tables |
|---|--------|-------|-----------|--------|
| D1 | [AUTH & ONBOARDING](#d1) | — | — | — |
| D2 | [SCHEDULING](#d2) | — | — | — |
| D3 | [FINANCE & BILLING](#d3) | — | — | — |
| D4 | [COMPLIANCE & LICENSING](#d4) | — | — | — |
| D5 | [WORKFORCE & HR](#d5) | — | — | — |
| D6 | [MESSAGING & CHATDOCK](#d6) | — | — | — |
| D7 | [CLIENT PORTAL](#d7) | — | — | — |
| D8 | [TRINITY AI](#d8) | — | — | — |
| D9 | [PLATFORM ADMIN](#d9) | — | — | — |

---

## D1: AUTH & ONBOARDING
> Identity, session, workspace provisioning, MFA, PIN auth

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `accept-invite.tsx` | 378 | `/api/onboarding/invite/` | `/api/onboarding/workspace-invite/` | ✅ |
| `auditor-login.tsx` | 155 | `/api/enforcement/auditor/login` | ✅ |
| `co-auditor-login.tsx` | 69 | `/api/auditor/login` | ✅ |
| `custom-login.tsx` | 644 | `/api/dev/quick-login` | `/api/auth/capabilities` | ✅ |
| `custom-register.tsx` | 305 | read-only | ✅ |
| `employee-onboarding-wizard.tsx` | 1238 | `/api/onboarding/certifications.` | `/api/onboarding/application/` | ✅ |
| `onboarding-start.tsx` | 280 | `/api/auth/me` | `/api/user` | ✅ |
| `reset-password.tsx` | 338 | `/api/auth/reset-password-confirm` | ✅ |
| `sps-onboarding-wizard.tsx` | 443 | `/api/auth/me` | `/api/sps/forms` | ✅ |
| `verify-email.tsx` | 84 | `/api/auth/verify-email` | `/api/auth/resend-verification` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `POST` | `/api/auth/register` | `requireAuth` | ✅ |
| `POST` | `/api/auth/verify-email` | `requireAuth` | ✅ |
| `GET` | `/api/auth/verify-email/:token` | `requireAuth` | ✅ |
| `POST` | `/api/auth/resend-verification` | `requireAuth` | ✅ |
| `POST` | `/api/auth/login` | `requireAuth` | ✅ |
| `GET` | `/csrf-token` | `PUBLIC` | 👻 no UI |
| `POST` | `/csrf-token` | `PUBLIC` | 👻 no UI |
| `POST` | `/logout-all` | `PUBLIC` | 👻 no UI |
| `POST` | `/forgot-password` | `PUBLIC` | 👻 no UI |
| `POST` | `/reset-password` | `PUBLIC` | ✅ |
| `GET` | `/portal/setup/:token` | `requireManager` | ✅ |
| `POST` | `/portal/setup/:token` | `requireManager` | ✅ |
| `POST` | `/:id/invite` | `requireManager` | ✅ |
| `DELETE` | `/portal/invite/:inviteId/revoke` | `requireManager` | ✅ |
| `GET` | `/portal/invite/status` | `requireManager` | ✅ |

### 🧠  Logic & Compliance
**OC 1702 enforcement:**
- `server/services/employeeDocumentOnboardingService.ts` → `§1702.230, §1702.163`

### 💾  DB Tables
**auth** (23 tables): `apiKeys`→`api_keys`, `platformRoles`→`platform_roles`, `roleTemplates`→`role_templates`, `integrationApiKeys`→`integration_api_keys`, `idempotencyKeys`→`idempotency_keys`, `oauthStates`→`oauth_states`, `externalIdentifiers`→`external_identifiers`, `idSequences`→`id_sequences`, `idRegistry`→`id_registry`, `userDeviceProfiles`→`user_device_profiles`
  *+13 more tables*
**orgs** (39 tables): `celebrationTemplates`→`celebration_templates`, `milestoneTracker`→`milestone_tracker`, `orgCreationProgress`→`org_creation_progress`, `tenantOnboardingProgress`→`tenant_onboarding_progress`, `tenantOnboardingSteps`→`tenant_onboarding_steps`, `workspaceCostSummary`→`workspace_cost_summary`, `workspaceCreditBalance`→`workspace_credit_balance`, `userOnboarding`→`user_onboarding`, `workspaceMembers`→`workspace_members`, `onboardingInvites`→`onboarding_invites`
  *+29 more tables*
**onboarding-tasks** (2 tables): `onboardingTaskTemplates`→`onboarding_task_templates`, `employeeOnboardingCompletions`→`employee_onboarding_completions`

---

## D2: SCHEDULING
> Shift creation/publication, staffing, swaps, Trinity auto-scheduling, TX OC 1702 gate

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `schedule-mobile-first.tsx` | 1453 | `/api/shifts/:id/mark-calloff` | `/api/shifts/` | ✅ |
| `shift-marketplace.tsx` | 928 | `/api/scheduling/swap-requests/` | `/api/coverage` | ✅ |
| `team-schedule.tsx` | 5 | read-only | ✅ |
| `universal-schedule.tsx` | 3254 | `/api/schedules/publish` | `/api/orchestrated-schedule/ai/trigger-se` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/contractors` | `requireAuth` | ✅ |
| `POST` | `/contractors` | `requireAuth` | ✅ |
| `PATCH` | `/contractors/:id` | `requireAuth` | ✅ |
| `GET` | `/availability/:contractorId` | `requireAuth` | ✅ |
| `POST` | `/availability` | `requireAuth` | ✅ |
| `GET` | `/status` | `requireAuth` | ✅ |
| `POST` | `/ai/fill-shift` | `requireAuth` | ✅ |
| `POST` | `/ai/trigger-session` | `requireAuth` | ✅ |
| `GET` | `/executions` | `requireAuth` | 👻 no UI |
| `GET` | `/executions/:executionId` | `requireAuth` | ✅ |
| `POST` | `/ai/toggle` | `requireManager` | ✅ |
| `GET` | `/ai/status` | `requireManager` | ✅ |
| `POST` | `/smart-generate` | `requireManager` | 👻 no UI |
| `GET` | `/proposals` | `requireManager` | ✅ |
| `GET` | `/proposals/:id` | `requireManager` | ✅ |
| `GET` | `/status` | `requireAuth` | ✅ |
| `GET` | `/templates` | `requireAuth` | ✅ |
| `GET` | `/coverage-gaps` | `requireAuth` | 👻 no UI |
| `GET` | `/offers` | `requireAuth` | ✅ |
| `GET` | `/week/stats` | `requireManager` | ✅ |
| `POST` | `/publish` | `requireManager` | ✅ |
| `POST` | `/unpublish` | `requireManager` | 👻 no UI |
| `POST` | `/apply-insight` | `requireManager` | 👻 no UI |
| `GET` | `/ai-insights` | `requireManager` | ✅ |

### 🧠  Logic & Compliance
**OC 1702 enforcement:**
- `server/services/autonomousScheduler.ts` → `OC §1702.201`
- `server/services/scheduling/trinityAutonomousScheduler.ts` → `§1702.323, texasGatekeeper, §1702.163, §1702.161, §1702.201`

### 💾  DB Tables
**scheduling** (42 tables): `schedules`→`schedules`, `shiftRequests`→`shift_requests`, `shiftOffers`→`shift_offers`, `shifts`→`shifts`, `customSchedulerIntervals`→`custom_scheduler_intervals`, `recurringShiftPatterns`→`recurring_shift_patterns`, `shiftSwapRequests`→`shift_swap_requests`, `scheduleTemplates`→`schedule_templates`, `shiftAcknowledgments`→`shift_acknowledgments`, `serviceCoverageRequests`→`service_coverage_requests`
  *+32 more tables*
**time** (12 tables): `ptoRequests`→`pto_requests`, `timeEntries`→`time_entries`, `timeEntryAuditEvents`→`time_entry_audit_events`, `gpsLocations`→`gps_locations`, `scheduledBreaks`→`scheduled_breaks`, `evvVisitRecords`→`evv_visit_records`, `manualClockinOverrides`→`manual_clockin_overrides`, `timeEntryBreaks`→`time_entry_breaks`, `timeEntryDiscrepancies`→`time_entry_discrepancies`, `timeOffRequests`→`time_off_requests`
  *+2 more tables*

---

## D3: FINANCE & BILLING
> Invoice gen, payroll runs, ACH/Stripe, QuickBooks sync, pay stubs

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `billing.tsx` | 2025 | `/api/billing/subscription/change` | `/api/billing-settings/payment-methods/se` | ✅ |
| `budgeting.tsx` | 628 | `/api/analytics/forecast` | `/api/budgets` | ✅ |
| `cash-flow-dashboard.tsx` | 305 | `/api/invoices/cash-flow-summary` | ✅ |
| `financial/pl-dashboard.tsx` | 726 | `/api/finance/pl/history` | `/api/finance/forecast` | ✅ |
| `invoices.tsx` | 1904 | `/api/time-entries/entries` | `/api/invoices/auto-generate` | ✅ |
| `payroll-dashboard.tsx` | 987 | `/api/workspace/health` | `/api/payroll/create-run` | ✅ |
| `quickbooks-import.tsx` | 1996 | `/api/integrations/quickbooks/reset-migra` | `/api/integrations/quickbooks/connect` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/workspace` | `requireManager` | ✅ |
| `POST` | `/workspace` | `requireManager` | ✅ |
| `PATCH` | `/workspace` | `requireManager` | ✅ |
| `GET` | `/clients` | `requireManager` | ✅ |
| `GET` | `/clients/:clientId` | `requireManager` | ✅ |
| `POST` | `/upload` | `requireAuth` | ✅ |
| `GET` | `/:id/pdf` | `requireManager` | ✅ |
| `GET` | `/proposals` | `requireManager` | ✅ |
| `POST` | `/auto-generate` | `requireManager` | ✅ |
| `POST` | `/:id/send-email` | `requireManager` | ✅ |
| `POST` | `/:id/send` | `requireManager` | ✅ |

### 🧠  Logic & Compliance
*No OC 1702 references in this domain*

### 💾  DB Tables
**billing** (75 tables): `revenueRecognitionSchedule`→`revenue_recognition_schedule`, `deferredRevenue`→`deferred_revenue`, `processedRevenueEvents`→`processed_revenue_events`, `contractRevenueMapping`→`contract_revenue_mapping`, `externalCostLog`→`external_cost_log`, `laborCostForecast`→`labor_cost_forecast`, `platformAiProviderBudgets`→`platform_ai_provider_budgets`, `platformCostRates`→`platform_cost_rates`, `seatCostBreakdown`→`seat_cost_breakdown`, `voiceUsage`→`voice_usage`
  *+65 more tables*
**payroll** (21 tables): `employeeBenefits`→`employee_benefits`, `payrollSettings`→`payroll_settings`, `payrollProposals`→`payroll_proposals`, `offCyclePayrollRuns`→`off_cycle_payroll_runs`, `payrollRuns`→`payroll_runs`, `payrollEntries`→`payroll_entries`, `employeePayrollInfo`→`employee_payroll_info`, `employeeRateHistory`→`employee_rate_history`, `laborLawRules`→`labor_law_rules`, `workerTaxClassificationHistory`→`worker_tax_classification_history`
  *+11 more tables*
**sales** (16 tables): `bidAnalytics`→`bid_analytics`, `contractHealthScores`→`contract_health_scores`, `contractRenewalTasks`→`contract_renewal_tasks`, `leads`→`leads`, `deals`→`deals`, `rfps`→`rfps`, `proposals`→`proposals`, `dealTasks`→`deal_tasks`, `testimonials`→`testimonials`, `clientProspects`→`client_prospects`
  *+6 more tables*

---

## D4: COMPLIANCE & LICENSING
> TX OC §1702 enforcement, guard card tracking, psych eval, auditor/SRA portals

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `auditor-portal.tsx` | 569 | `/api/employees` | `/api/time-entries` | ✅ |
| `compliance/approvals.tsx` | 453 | `/api/security-compliance/records/stats` | `/api/security-compliance/approvals/pendi` | ✅ |
| `compliance/audit-readiness.tsx` | 436 | `/api/compliance/regulatory-portal/upload` | `/api/compliance/regulatory-portal/audit-` | ✅ |
| `compliance/auditor-portal.tsx` | 472 | `/api/security-compliance/enforcement/sta` | `/api/helpai/auditor/brief` | ✅ |
| `compliance/employee-detail.tsx` | 771 | `/api/security-compliance/states` | `/api/security-compliance/records` | ✅ |
| `compliance/employee-onboarding-packet.tsx` | 490 | `/api/security-compliance/enforcement/onb` | ✅ |
| `compliance/enforcement-status.tsx` | 301 | `/api/enforcement/appeal` | `/api/enforcement/my-status` | ✅ |
| `compliance/expiration-alerts.tsx` | 309 | `/api/security-compliance/records/expirin` | ✅ |
| `compliance/index.tsx` | 476 | `/api/security-compliance/states` | `/api/security-compliance/approvals/pendi` | ✅ |
| `compliance/regulator-access.tsx` | 573 | `/api/security-compliance/states` | `/api/security-compliance/regulator/` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/oversight` | `requireManager` | ✅ |
| `GET` | `/oversight/stats` | `requireManager` | ✅ |
| `PATCH` | `/oversight/:id/approve` | `requireManager` | ✅ |
| `PATCH` | `/oversight/:id/reject` | `requireManager` | ✅ |
| `POST` | `/dm-audit/request` | `requireManager` | ✅ |
| `GET` | `/` | `requireAuth` | ✅ |
| `GET` | `/pending` | `requireAuth` | ✅ |
| `POST` | `/` | `requireAuth` | ✅ |
| `POST` | `/:approvalId/decide` | `requireAuth` | 👻 no UI |
| `GET` | `/` | `requireManager` | ✅ |
| `GET` | `/export` | `requireManager` | ✅ |
| `GET` | `/document/:documentId` | `requireManager` | ✅ |
| `GET` | `/employee/:employeeId` | `requireManager` | ✅ |
| `GET` | `/critical` | `requireManager` | 👻 no UI |
| `GET` | `/record/:recordId` | `requireAuth` | ✅ |
| `GET` | `/employee/:employeeId` | `requireAuth` | ✅ |
| `POST` | `/:checklistId/override` | `requireAuth` | ✅ |

### 🧠  Logic & Compliance
**OC 1702 enforcement:**
- `scripts/omega/audit-trinity-citations.ts` → `§1702.221, §1702.323, §1702.163, §1702.161, §1702.201`
- `server/services/compliance/certificationTypes.ts` → `§1702.230, §1702.163`
- `server/services/compliance/complianceScoringBridge.ts` → `§1702.163`
- `server/services/compliance/regulatoryViolationService.ts` → `1702.163, 1702.161, 1702.323`
- `server/services/compliance/stateComplianceConfig.ts` → `§1702.230, §1702.219, §1702.163`
- `server/services/compliance/stateRegulatoryKnowledgeBase.ts` → `1702.163`

### 💾  DB Tables
**compliance** (57 tables): `regulatoryRules`→`regulatory_rules`, `regulatoryUpdates`→`regulatory_updates`, `employeeI9Records`→`employee_i9_records`, `securityIncidents`→`security_incidents`, `documentSignatures`→`document_signatures`, `companyPolicies`→`company_policies`, `policyAcknowledgments`→`policy_acknowledgments`, `documentAccessLogs`→`document_access_logs`, `governanceApprovals`→`governance_approvals`, `customForms`→`custom_forms`
  *+47 more tables*
**audit** (58 tables): `automationTriggers`→`automation_triggers`, `leaderActions`→`leader_actions`, `auditLogs`→`audit_logs`, `reportTemplates`→`report_templates`, `reportSubmissions`→`report_submissions`, `reportWorkflowConfigs`→`report_workflow_configs`, `reportApprovalSteps`→`report_approval_steps`, `lockedReportRecords`→`locked_report_records`, `reportAttachments`→`report_attachments`, `customerReportAccess`→`customer_report_access`
  *+48 more tables*

---

## D5: WORKFORCE & HR
> Employee lifecycle, HRIS, documents, training, performance, positions

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `assisted-onboarding.tsx` | 367 | `/api/support/assisted-onboarding/` | `/api/support/assisted-onboarding/create` | ✅ |
| `communications-onboarding.tsx` | 384 | `/api/comm-os/onboarding-status` | `/api/comm-os/complete-onboarding` | ✅ |
| `employee-profile.tsx` | 1159 | `/api/hr/manager-assignments/employee` | `/api/hireos/documents/me` | ✅ |
| `employees.tsx` | 1622 | `/api/workspace/health` | `/api/analytics/stats` | ✅ |
| `onboarding.tsx` | 501 | `/api/onboarding/rewards/reward/apply` | `/api/onboarding/progress` | ✅ |
| `performance.tsx` | 1345 | `/api/performance/reviews` | `/api/performance/disciplinary/` | ✅ |
| `training.tsx` | 1155 | `/api/training/providers` | `/api/training-compliance/tcole-complianc` | ✅ |
| `workspace-onboarding.tsx` | 495 | `/api/quickbooks/flow/` | `/api/automation/triggers` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/csrf-token` | `PUBLIC` | 👻 no UI |
| `POST` | `/csrf-token` | `PUBLIC` | 👻 no UI |
| `POST` | `/logout-all` | `PUBLIC` | 👻 no UI |
| `POST` | `/forgot-password` | `PUBLIC` | 👻 no UI |
| `POST` | `/reset-password` | `PUBLIC` | ✅ |
| `GET` | `/search` | `requireAuth` | ✅ |
| `GET` | `/` | `requireAuth` | ✅ |
| `GET` | `/:typeCode` | `requireAuth` | ✅ |
| `GET` | `/employee/:employeeId` | `requireAuth` | ✅ |
| `GET` | `/record/:recordId` | `requireAuth` | ✅ |
| `GET` | `/:documentId` | `requireAuth` | ✅ |
| `POST` | `/` | `requireAuth` | ✅ |
| `POST` | `/:documentId/lock` | `requireAuth` | ✅ |
| `GET` | `/` | `requireAuth` | ✅ |
| `POST` | `/` | `requireAuth` | ✅ |
| `PATCH` | `/:id` | `requireAuth` | ✅ |
| `POST` | `/trinity-intake` | `requireAuth` | ✅ |
| `POST` | `/finalize` | `requireAuth` | ✅ |

### 🧠  Logic & Compliance
**OC 1702 enforcement:**
- `client/src/pages/employee-packet-portal.tsx` → `§1702.324`
- `server/services/employeeDocumentOnboardingService.ts` → `§1702.230, §1702.163`
- `server/services/trinity/trinityDisciplinaryWorkflow.ts` → `OC §1702.163, OC §1702.3615`
- `shared/schema/domains/workforce/index.ts` → `OC §1702.230`

### 💾  DB Tables
**workforce** (67 tables): `applicantInterviews`→`applicant_interviews`, `applicants`→`applicants`, `employeeOnboardingProgress`→`employee_onboarding_progress`, `employeeOnboardingSteps`→`employee_onboarding_steps`, `employeeTrainingRecords`→`employee_training_records`, `interviewQuestionSets`→`interview_question_sets`, `interviewSessions`→`interview_sessions`, `jobPostings`→`job_postings`, `offerLetters`→`offer_letters`, `officerPerformanceScores`→`officer_performance_scores`
  *+57 more tables*
**training** (9 tables): `trainingModules`→`training_modules`, `trainingSections`→`training_sections`, `trainingQuestions`→`training_questions`, `officerTrainingAttempts`→`training_attempts`, `officerTrainingCertificates`→`training_certificates`, `trainingInterventions`→`training_interventions`, `trainingProviders`→`training_providers`, `trainingSessions`→`training_sessions`, `trainingAttendance`→`training_attendance`
**recruitment** (4 tables): `interviewCandidates`→`interview_candidates`, `candidateInterviewSessions`→`candidate_interview_sessions`, `interviewQuestionsBank`→`interview_questions_bank`, `interviewScorecards`→`interview_scorecards`

---

## D6: MESSAGING & CHATDOCK
> ChatDock rooms, broadcasts, HelpAI, Trinity voice, SMS, WebSocket

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `briefing-channel.tsx` | 385 | `/api/broadcasts/briefing` | `/api/voice/tts` | ✅ |
| `broadcasts.tsx` | 195 | read-only | ✅ |
| `incident-pipeline.tsx` | 587 | `/api/incident-reports/` | `/api/incident-reports` | ✅ |
| `worker-incidents.tsx` | 419 | `/api/incidents` | `/api/incidents/my-reports` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `POST` | `/` | `requireAuth` | ✅ |
| `GET` | `/` | `requireAuth` | ✅ |
| `GET` | `/my` | `requireAuth` | ✅ |
| `GET` | `/briefing` | `requireAuth` | ✅ |
| `GET` | `/platform` | `requireAuth` | ✅ |
| `GET` | `/api/chat/conversations` | `requireManager` | ✅ |
| `POST` | `/api/chat/conversations` | `requireManager` | ✅ |
| `GET` | `/api/chat/conversations/:id/messages` | `requireManager` | ✅ |
| `PATCH` | `/api/chat/conversations/:id` | `requireManager` | ✅ |
| `POST` | `/api/chat/conversations/:id/close` | `requireManager` | ✅ |

### 🧠  Logic & Compliance
*No OC 1702 references in this domain*

### 💾  DB Tables
**comms** (60 tables): `userMascotPreferences`→`user_mascot_preferences`, `chatConversations`→`chat_conversations`, `chatMessages`→`chat_messages`, `messageReactions`→`message_reactions`, `messageReadReceipts`→`message_read_receipts`, `chatMacros`→`chat_macros`, `typingIndicators`→`typing_indicators`, `chatUploads`→`chat_uploads`, `roomEvents`→`room_events`, `dmAuditRequests`→`dm_audit_requests`
  *+50 more tables*
**notifications-delivery** (1 tables): `notificationDeliveries`→`notification_deliveries`

---

## D7: CLIENT PORTAL
> Client-facing portal, work orders, site mgmt, contracts, proposals

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `client-portal.tsx` | 2289 | `/api/portal/` | `/api/auth/profile` | ✅ |
| `work-orders.tsx` | 336 | `/api/work-orders/` | `/api/work-orders` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/threads` | `requireManager` | ✅ |
| `POST` | `/threads` | `requireManager` | ✅ |
| `GET` | `/threads/:id/messages` | `requireManager` | ✅ |
| `POST` | `/threads/:id/messages` | `requireManager` | ✅ |
| `POST` | `/threads/:id/resolve` | `requireManager` | ✅ |
| `GET` | `/portal/setup/:token` | `requireManager` | ✅ |
| `POST` | `/portal/setup/:token` | `requireManager` | ✅ |
| `POST` | `/:id/invite` | `requireManager` | ✅ |
| `DELETE` | `/portal/invite/:inviteId/revoke` | `requireManager` | ✅ |
| `GET` | `/portal/invite/status` | `requireManager` | ✅ |
| `GET` | `/` | `requireManager` | ✅ |
| `GET` | `/lookup` | `requireManager` | ✅ |
| `POST` | `/` | `requireManager` | ✅ |
| `PATCH` | `/:id` | `requireManager` | ✅ |
| `GET` | `/deactivated` | `requireManager` | ✅ |
| `GET` | `/records` | `requireAuth` | ✅ |
| `GET` | `/clients/:clientId/trend` | `requireAuth` | ✅ |
| `POST` | `/records` | `requireAuth` | ✅ |
| `POST` | `/concerns` | `requireAuth` | 👻 no UI |
| `GET` | `/concerns` | `requireAuth` | 👻 no UI |
| `GET` | `/` | `requireAuth` | ✅ |
| `POST` | `/` | `requireAuth` | ✅ |
| `PATCH` | `/:id` | `requireAuth` | ✅ |
| `POST` | `/lookup` | `requireAuth` | ✅ |
| `POST` | `/request` | `requireAuth` | ✅ |
| `GET` | `/request/:id/status` | `requireAuth` | ✅ |
| `POST` | `/request/:id/dispute` | `requireAuth` | ✅ |
| `POST` | `/request/:id/grant` | `requireAuth` | 👻 no UI |

### 🧠  Logic & Compliance
**OC 1702 enforcement:**
- `client/src/pages/employee-packet-portal.tsx` → `§1702.324`
- `client/src/pages/trinity-features.tsx` → `§1702.323`

### 💾  DB Tables
**clients** (34 tables): `clientConcerns`→`client_concerns`, `clientSatisfactionRecords`→`client_satisfaction_records`, `postOrderVersionAcknowledgments`→`post_order_version_acknowledgments`, `postOrderVersions`→`post_order_versions`, `siteMarginScores`→`site_margin_scores`, `subcontractorCompanies`→`subcontractor_companies`, `clientMessageThreads`→`client_message_threads`, `clientMessages`→`client_messages`, `contractDocuments`→`contract_documents`, `clientPortalInviteTokens`→`client_portal_invite_tokens`
  *+24 more tables*
**sales** (16 tables): `bidAnalytics`→`bid_analytics`, `contractHealthScores`→`contract_health_scores`, `contractRenewalTasks`→`contract_renewal_tasks`, `leads`→`leads`, `deals`→`deals`, `rfps`→`rfps`, `proposals`→`proposals`, `dealTasks`→`deal_tasks`, `testimonials`→`testimonials`, `clientProspects`→`client_prospects`
  *+6 more tables*

---

## D8: TRINITY AI
> Trinity AI brain, autonomous scheduler, OC 1702 gatekeeper, decision log

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `trinity-agent-dashboard.tsx` | 860 | `/api/trinity/agent-dashboard/activity-fe` | `/api/trinity/agent-dashboard/reasoning` | ✅ |
| `trinity-chat.tsx` | 369 | `/api/trinity/chat/session/` | `/api/trinity/chat/settings` | ✅ |
| `trinity-features.tsx` | 988 | read-only | ✅ |
| `trinity-insights.tsx` | 343 | `/api/trinity/insights` | `/api/trinity/status` | ✅ |
| `trinity-transparency-dashboard.tsx` | 915 | `/api/trinity/transparency/decisions` | `/api/trinity/transparency/cost-breakdown` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/health` | `requireAuth` | ✅ |
| `GET` | `/by-operation` | `requireAuth` | 👻 no UI |
| `GET` | `/unprofitable-companies` | `requireAuth` | 👻 no UI |
| `GET` | `/recommendations` | `requireAuth` | 👻 no UI |
| `GET` | `/alerts` | `requireAuth` | ✅ |
| `GET` | `/workspaces/:id/details` | `requirePlatformStaff` | 👻 no UI |
| `GET` | `/search` | `requirePlatformStaff` | ✅ |
| `GET` | `/active` | `requireAuth` | ✅ |
| `GET` | `/completions` | `requireAuth` | ✅ |
| `GET` | `/tasks/:taskId` | `requireAuth` | ✅ |
| `GET` | `/escalations` | `requireAuth` | ✅ |
| `GET` | `/escalations/count` | `requireAuth` | ✅ |

### 🧠  Logic & Compliance
**OC 1702 enforcement:**
- `client/src/pages/trinity-features.tsx` → `§1702.323`
- `scripts/omega/audit-trinity-citations.ts` → `§1702.221, §1702.323, §1702.163, §1702.161, §1702.201`
- `server/services/autonomousScheduler.ts` → `OC §1702.201`
- `server/services/ai-brain/trinityLegalResearch.ts` → `§1702.301`
- `server/services/ai-brain/trinityPersona.ts` → `OC §1702.102, §1702.323, 1702.201, §1702.163, OC §1702.201, §1702.161, OC §1702.163, OC §1702.323, §1702.201, OC §1702.161`
- `server/services/compliance/texasGatekeeper.ts` → `§1702.323, §1702.163, OC §1702.201, §1702.161, OC §1702.163, OC §1702.323, §1702.201, OC §1702.161`

### 💾  DB Tables
**trinity** (103 tables): `agentRegistry`→`agent_registry`, `agentTaskLogs`→`agent_task_logs`, `agentTasks`→`agent_tasks`, `aiCostConfig`→`ai_cost_config`, `aiUsageLog`→`ai_usage_log`, `counterfactualSimulations`→`counterfactual_simulations`, `curiosityQueue`→`curiosity_queue`, `incubationQueue`→`incubation_queue`, `socialEntities`→`social_entities`, `socialRelationships`→`social_relationships`
  *+93 more tables*
**ops** (57 tables): `incidentPatterns`→`incident_patterns`, `assets`→`assets`, `assetSchedules`→`asset_schedules`, `assetUsageLogs`→`asset_usage_logs`, `maintenanceAlerts`→`maintenance_alerts`, `maintenanceAcknowledgments`→`maintenance_acknowledgments`, `dispatchIncidents`→`dispatch_incidents`, `dispatchAssignments`→`dispatch_assignments`, `unitStatuses`→`unit_statuses`, `dispatchLogs`→`dispatch_logs`
  *+47 more tables*

---

## D9: PLATFORM ADMIN
> Root admin, tenant mgmt, support agents, platform health, subscriptions

### 🖥️  UI Layer
| Page | Lines | Key API Calls | Status |
|------|-------|---------------|--------|
| `admin-usage.tsx` | 439 | `/api/usage/tokens` | `/api/usage/token-log` | ✅ |
| `admin/support-console-tickets.tsx` | 314 | `/api/support/escalated` | `/api/support/priority-queue` | ✅ |
| `admin/support-console-workspace.tsx` | 533 | `/api/support/actions/registry` | `/api/trinity/org-state` | ✅ |
| `admin/support-console.tsx` | 635 | `/api/support/actions/registry` | `/api/support/escalated` | ✅ |
| `updates.tsx` | 163 | `/api/whats-new` | ✅ |

### 🔌  API Routes
| Method | Endpoint | Guard | Status |
|--------|----------|-------|--------|
| `GET` | `/health` | `requireAuth` | ✅ |
| `GET` | `/by-operation` | `requireAuth` | 👻 no UI |
| `GET` | `/unprofitable-companies` | `requireAuth` | 👻 no UI |
| `GET` | `/recommendations` | `requireAuth` | 👻 no UI |
| `GET` | `/alerts` | `requireAuth` | ✅ |
| `POST` | `/dev-execute` | `PUBLIC` | 👻 no UI |
| `GET` | `/meta` | `requirePlatformStaff` | ✅ |
| `GET` | `/workspaces` | `requirePlatformStaff` | ✅ |
| `GET` | `/workspaces/:wsId/matrix` | `requirePlatformStaff` | ✅ |
| `PATCH` | `/workspaces/:wsId/matrix` | `requirePlatformStaff` | ✅ |
| `DELETE` | `/workspaces/:wsId/matrix` | `requirePlatformStaff` | ✅ |
| `POST` | `/dev-execute` | `requirePlatformStaff` | 👻 no UI |
| `PATCH` | `/workspace/:workspaceId` | `requirePlatformStaff` | ✅ |
| `GET` | `/support/search` | `requirePlatformStaff` | ✅ |
| `GET` | `/support/workspace/:id` | `requirePlatformStaff` | ✅ |
| `GET` | `/support/stats` | `requirePlatformStaff` | ✅ |
| `GET` | `/workspaces/:id/details` | `requirePlatformStaff` | 👻 no UI |
| `GET` | `/search` | `requirePlatformStaff` | ✅ |

### 🧠  Logic & Compliance
*No OC 1702 references in this domain*

### 💾  DB Tables
**support** (41 tables): `faqEntries`→`faq_entries`, `faqNotifications`→`faq_notifications`, `faqVersionHistory`→`faq_version_history`, `escalationTickets`→`escalation_tickets`, `supportSessions`→`support_sessions`, `supportTickets`→`support_tickets`, `helposFaqs`→`helpos_faqs`, `faqVersions`→`faq_versions`, `faqGapEvents`→`faq_gap_events`, `faqSearchHistory`→`faq_search_history`
  *+31 more tables*
**sps** (19 tables): `spsDocuments`→`sps_documents`, `spsNegotiationThreads`→`sps_negotiation_threads`, `spsNegotiationMessages`→`sps_negotiation_messages`, `spsDocumentSafe`→`sps_document_safe`, `spsStateRequirements`→`sps_state_requirements`, `spsOnboarding`→`sps_onboarding`, `spsForm1Checklist`→`sps_form_1_checklist`, `spsForm2OfferLetter`→`sps_form_2_offer_letter`, `spsForm3W4`→`sps_form_3_w4`, `spsForm4I9`→`sps_form_4_i9`
  *+9 more tables*

---

## ⚡ DEAD ENDS — UI Calls With No Backend Route
*0 dead ends detected*

✅ *No dead ends found — all UI calls have backend routes*

## 👻 GHOST ROUTES — Backend With No UI Caller (sample)
*28 ghost routes detected — many are internal/webhook/admin expected*

| Domain | Endpoint | Route File |
|--------|----------|------------|
| AUTH & ONBOARDING | `GET /csrf-token` | `authRoutes.ts` |
| AUTH & ONBOARDING | `POST /csrf-token` | `authRoutes.ts` |
| AUTH & ONBOARDING | `POST /logout-all` | `authRoutes.ts` |
| AUTH & ONBOARDING | `POST /forgot-password` | `authRoutes.ts` |
| SCHEDULING | `GET /executions` | `orchestratedScheduleRoutes.ts` |
| SCHEDULING | `POST /smart-generate` | `scheduleosRoutes.ts` |
| SCHEDULING | `GET /coverage-gaps` | `schedulerRoutes.ts` |
| SCHEDULING | `POST /unpublish` | `schedulesRoutes.ts` |
| SCHEDULING | `POST /apply-insight` | `schedulesRoutes.ts` |
| COMPLIANCE & LICENSING | `POST /:approvalId/decide` | `compliance/approvals.ts` |
| COMPLIANCE & LICENSING | `GET /critical` | `compliance/auditTrail.ts` |
| WORKFORCE & HR | `GET /csrf-token` | `authRoutes.ts` |
| WORKFORCE & HR | `POST /csrf-token` | `authRoutes.ts` |
| WORKFORCE & HR | `POST /logout-all` | `authRoutes.ts` |
| WORKFORCE & HR | `POST /forgot-password` | `authRoutes.ts` |
| CLIENT PORTAL | `POST /concerns` | `clientSatisfactionRoutes.ts` |
| CLIENT PORTAL | `GET /concerns` | `clientSatisfactionRoutes.ts` |
| CLIENT PORTAL | `POST /request/:id/grant` | `compliance/regulatoryPortal.ts` |
| TRINITY AI | `GET /by-operation` | `admin/aiCosts.ts` |
| TRINITY AI | `GET /unprofitable-companies` | `admin/aiCosts.ts` |


## 🔧 TYPESCRIPT HARDENING — PHASE 2 FINDINGS

### Domain 1: AUTH & ONBOARDING
| File | Issue | Severity | Fix |
|------|-------|----------|-----|
| `server/auth.ts` | 13 `any` type usages in session/request handling | Medium | Type each session field explicitly |
| `server/routes/authCoreRoutes.ts` | 18 `any` usages, mostly `req.user as any` | Medium | Use `AuthenticatedRequest` type |
| `server/routes/auditorRoutes.ts` | 31 `any` usages | High | Migrate to typed request |
| `client/src/hooks/useAuth.ts` | 1 `any` usage in data shape | Low | Type the API response |

**Auth wiring verified:**
- ✅ `/api/auth/login` → `authCoreRoutes.ts` → `req.session.userId`
- ✅ `/api/auth/me` → returns user + workspace context
- ✅ `/api/auditor/login` → `auditorRoutes.ts` → separate session
- ✅ `/api/sra/auth/login` → `sraAuthRoutes.ts` → SRA session
- ✅ `useAuth()` hook subscribes to `/api/auth/me` queryKey

**Dead ends: 0** (all auth UI calls have backend routes)

**Ghost routes (admin-expected, not bugs):**
- `GET /workspaces/:wsId/matrix` — permission matrix (admin panel)
- `GET /platform/activities` — activity log (admin dashboard)
- `GET /admin/metrics` — platform metrics (sysop dashboard)

## 🔧 TYPESCRIPT HARDENING STATUS
| Domain | Status | Notes |
|--------|--------|-------|
| AUTH & ONBOARDING | 🔲 Pending | Phase 2 |
| SCHEDULING | 🔲 Pending | Phase 2 |
| FINANCE & BILLING | 🔲 Pending | Phase 2 |
| COMPLIANCE & LICENSING | 🔲 Pending | Phase 2 |
| WORKFORCE & HR | 🔲 Pending | Phase 2 |
| MESSAGING & CHATDOCK | 🔲 Pending | Phase 2 |
| CLIENT PORTAL | 🔲 Pending | Phase 2 |
| TRINITY AI | 🔲 Pending | Phase 2 |
| PLATFORM ADMIN | 🔲 Pending | Phase 2 |

---
*SYSTEM_MANIFEST.md — Living document. Updated each hardening phase.*