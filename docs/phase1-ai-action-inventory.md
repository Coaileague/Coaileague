# Phase 1: AI Brain Action Inventory
## CONSOLIDATION COMPLETE

**Generated:** January 19, 2026
**Total Actions Registered:** 183 unique actions
**Status:** COMPLETED

## Changes Made

### Naming Clarifications (Low Risk - Completed)
| Old Name | New Name | Reason |
|----------|----------|--------|
| `exceptions.*` | `billing_exception.*` | Clarify billing-specific scope |
| `approval.*` | `resume_approval.*` | Clarify workflow resumption purpose |

### Files Modified
1. `server/services/billing/exceptionQueueProcessor.ts` - 4 actions renamed
2. `server/services/ai-brain/approvalResumeOrchestrator.ts` - 4 actions renamed
3. `server/services/billing/stripeEventBridge.ts` - Reference updated

### New Documentation Created
- `server/services/ai-brain/actionRegistryIndex.ts` - Unified action registry index with 35 domains, helper functions

---

## 1. Complete Action Registry

### Actions by Domain Prefix (Counts)
| Domain | Count | Source |
|--------|-------|--------|
| onboarding.* | 11 | Mixed (actionRegistry + domainSupervisorActions + onboardingStateMachine) |
| gap_intelligence.* | 11 | gapIntelligenceService.ts |
| billing.* | 11 | billingOrchestrationService.ts + weeklyBillingRunService.ts |
| schedule_lifecycle.* | 10 | scheduleLifecycleOrchestrator.ts |
| autofix.* | 9 | autonomousFixPipeline.ts |
| strategic.* | 8 | actionRegistry.ts (strategicOptimizationActions) |
| workflow_approval.* | 7 | workflowApprovalService.ts |
| self.* | 7 | trinitySelfAwarenessService.ts |
| contracts.* | 7 | actionRegistry.ts |
| notification_ack.* | 6 | notificationAcknowledgmentService.ts |
| metacognition.* | 6 | metaCognitionService (imported) |
| exception.* | 6 | crossDomainExceptionService.ts |
| automation_trigger.* | 6 | automationTriggerService.ts |
| approval_gate.* | 6 | approvalGateEnforcement.ts |
| hris.* | 5 | integrationBrainActions.ts |
| governance.* | 5 | trinityOrchestrationGovernance.ts |
| execution_tracker.* | 5 | automationExecutionTracker.ts |
| trial.* | 4 | trialConversionOrchestrator.ts |
| subscription.* | 4 | trialConversionOrchestrator.ts |
| spec.* | 4 | trinitySelfEditGovernance.ts |
| exceptions.* | 4 | exceptionQueueProcessor.ts (billing-specific) |
| approval.* | 4 | approvalResumeOrchestrator.ts |
| services.* | 3 | actionRegistry.ts |
| schema.* | 3 | domainOpsSubagents.ts |
| scheduling.* | 3 | actionRegistry.ts |
| notifications.* | 3 | actionRegistry.ts |
| logs.* | 3 | domainOpsSubagents.ts |
| features.* | 3 | actionRegistry.ts |
| time_tracking.* | 2 | actionRegistry.ts |
| stripe.* | 2 | stripeEventBridge.ts |
| integrations.* | 2 | actionRegistry.ts |
| hooks.* | 2 | domainOpsSubagents.ts |
| handlers.* | 2 | domainOpsSubagents.ts |
| employees.* | 2 | actionRegistry.ts |
| cleanup.* | 2 | cleanupAgentSubagent.ts |
| bulk.* | 2 | actionRegistry.ts |
| platform_roles.* | 1 | actionRegistry.ts |
| payroll.* | 1 | actionRegistry.ts |
| clients.* | 1 | actionRegistry.ts |

---

## 2. OVERLAPPING ACTIONS - Potential Consolidation Candidates

### 2A. APPROVAL SYSTEMS (17 total actions across 3 systems)

| System | Actions | Source File | Purpose |
|--------|---------|-------------|---------|
| `approval.*` | 4 | approvalResumeOrchestrator.ts | Resume-based approval for interrupted workflows |
| `approval_gate.*` | 6 | approvalGateEnforcement.ts | Orchestration-level approval gates |
| `workflow_approval.*` | 7 | workflowApprovalService.ts | AI workflow approval with expiry |

**Overlap Analysis:**
- `approval.request` vs `approval_gate.request` vs `workflow_approval.create` - All create approval requests
- `approval.get_pending` vs `approval_gate.get_pending` vs `workflow_approval.get_pending` - All fetch pending
- `approval.decide` vs `approval_gate.approve/reject` vs `workflow_approval.approve/reject` - All handle decisions

**Recommendation:** These serve DIFFERENT purposes:
- `approval.*` = Resume orchestration (workflow restart)
- `approval_gate.*` = Runtime enforcement gates
- `workflow_approval.*` = AI-driven approvals with timeout

**Verdict:** DO NOT MERGE - Intentional separation. Consider renaming for clarity:
- `approval.*` → `resume_approval.*`
- `approval_gate.*` → Keep as-is (enforcement)
- `workflow_approval.*` → Keep as-is (AI workflow)

---

### 2B. EXCEPTION SYSTEMS (10 total actions)

| System | Actions | Source File | Purpose |
|--------|---------|-------------|---------|
| `exception.*` | 6 | crossDomainExceptionService.ts | Cross-domain exception handling |
| `exceptions.*` | 4 | exceptionQueueProcessor.ts | Billing-specific exception queue |

**Overlap Analysis:**
- `exception.resolve` vs `exceptions.resolve` - Both resolve exceptions
- `exception.get_stats` vs `exceptions.get_stats` - Both get statistics

**Recommendation:** 
- `exceptions.*` is billing-domain specific
- `exception.*` is platform-wide cross-domain

**Verdict:** CONSIDER MERGE - Similar functionality, confusing naming:
- Rename `exceptions.*` → `billing_exception.*` for clarity
- OR merge into unified `exception.*` with domain filtering

---

### 2C. NOTIFICATION SYSTEMS (9 total actions across 3 locations)

| Location | Actions | Purpose |
|----------|---------|---------|
| actionRegistry.ts | notifications.send, notifications.clear_all, notifications.mark_all_read | User notification CRUD |
| platformActionHub.ts | notifications.send_to_user, notifications.create_maintenance_alert, notifications.get_stats, notifications.force_clear_all | Platform/admin notifications |
| aiBrainMasterOrchestrator.ts | notifications.send_platform_update, notifications.broadcast_message | Broadcast notifications |
| notificationAcknowledgmentService.ts | notification_ack.* (6 actions) | Acknowledgment tracking |

**Verdict:** INTENTIONAL SEPARATION:
- `notifications.*` = Send/receive notifications
- `notification_ack.*` = Track acknowledgments (compliance)

**Recommendation:** Keep separate but document clearly.

---

### 2D. ONBOARDING ACTIONS (16 total actions across 3 files)

| Source | Actions |
|--------|---------|
| actionRegistry.ts | onboarding.get_checklist, onboarding.send_invitation, etc. (6 actions) |
| onboardingStateMachine.ts | onboarding.initialize, onboarding.complete_step, etc. (5 actions) |
| domainSupervisorActions.ts | onboarding.connect_integration, onboarding.migrate_data, etc. (5 actions) |

**Overlap Analysis:** No duplicate action names, but related functionality split across files.

**Verdict:** CONSOLIDATION CANDIDATE - Could unify under single onboarding registry.

---

## 3. ARCHITECTURE: Who Calls Who

```
┌─────────────────────────────────────────────────────────────────┐
│                    platformActionHub.ts                          │
│    (Central Action Registry - "helpaiOrchestrator")             │
│    - Registers all actions                                       │
│    - Routes executeAction() calls                                │
│    - Tracks health, metrics                                      │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │ imports & uses
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ actionRegistry.ts │  │ aiBrainMaster    │  │ orchestration/   │
│ (Core actions)   │  │ Orchestrator.ts  │  │ index.ts         │
│ - services.*     │  │ (AI coordinator) │  │ (Workflow orch.) │
│ - scheduling.*   │  │ - broadcasts     │  │ - approval_gate  │
│ - employees.*    │  │ - notifications  │  │ - exception      │
│ - contracts.*    │  │ - imports many   │  │ - schedule_life  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Answer to Your Architecture Question:**

| Service | Purpose | Should Merge? |
|---------|---------|---------------|
| `orchestration/index.ts` | Workflow orchestration (approval gates, exceptions, lifecycle) | NO |
| `aiBrainMasterOrchestrator.ts` | AI action coordination & notification broadcasting | NO |
| `platformActionHub.ts` | Central action registry & routing infrastructure | NO (canonical) |

**These are intentionally separate layers:**
- `platformActionHub` = Infrastructure (action bus)
- `aiBrainMasterOrchestrator` = AI coordination layer
- `orchestration/` = Business workflow layer

**Recommendation:** Keep separate, but ALIGN to single interface (all use `helpaiOrchestrator.registerAction`).

---

## 4. PROPOSED CONSOLIDATION MAPPING

### Priority 1: Naming Consistency (Low Risk)
| Current | Proposed | Reason |
|---------|----------|--------|
| `exceptions.*` | `billing_exception.*` | Clarify it's billing-specific |
| `approval.*` | `resume_approval.*` | Clarify it's for workflow resumption |

### Priority 2: Registration Cleanup (Medium Risk)
| Action | Current Location | Proposed |
|--------|------------------|----------|
| notifications.* (9 actions) | 3 files | Consolidate in single file |
| onboarding.* (16 actions) | 3 files | Consolidate in onboardingActionRegistry.ts |

### Priority 3: Deferred (Requires Deeper Analysis)
- Approval systems (3 separate) - Need to validate they're truly separate concerns
- Strategic actions - May overlap with scheduling actions

---

## 5. WHAT NOT TO TOUCH

| Domain | Reason |
|--------|--------|
| Audit/logging tables | SOX compliance separation |
| `notification_ack.*` | Compliance tracking - intentional |
| Multiple approval systems | Different lifecycle stages |
| Subagent specialization | Multi-model tiers (Gemini levels) |

---

## 6. CALL FREQUENCY DATA

**Note:** Static analysis only - no runtime metrics available in current logs.

Most referenced actions in codebase (by `executeAction` calls):
1. `approval.request` - Called from billing events
2. Generic routing through `helpaiOrchestrator.executeAction`

**Recommendation:** Add action telemetry to track actual usage before consolidation.

---

## NEXT STEPS (Pending Your Approval)

1. **Rename for clarity** - `exceptions.*` → `billing_exception.*`, `approval.*` → `resume_approval.*`
2. **Consolidate notification registrations** - Single source file
3. **Consolidate onboarding registrations** - Single source file
4. **Add action telemetry** - Track usage before deeper consolidation

**AWAITING YOUR REVIEW before any changes.**
