# CoAIleague — Enterprise Workflow Matrix
# Wave 22 · As-Is Audit + Closed-Loop Pipeline Blueprint

> **Classification:** Internal Architecture Document
> **Audience:** Trinity, SARGE, Claude Code agents, CoAIleague engineering
> **Last Updated:** 2026-05-04
> **Status:** V1.0 — Production Ready

---

## PART 1 — AS-IS AUDIT (What Exists Today)

### 1A. Scheduling / Shifts

**Schema:** `shifts` table — `shared/schema/domains/scheduling/index.ts`

**Status Enum (shiftStatusEnum):**
```
draft → published → scheduled → in_progress → completed
                                                   ↑
draft → calloff ──→ (backfill) → scheduled ────────┘
      → cancelled
      → no_show
      → confirmed | pending | approved | auto_approved
```

**Key fields confirmed present:**
- `status` — full lifecycle enum above
- `aiGenerated` (boolean) — Trinity-created shifts flagged
- `aiConfidenceScore` (decimal 0.00–1.00) — confidence in assignment
- `riskScore` (decimal 0.00–1.00) — higher = more likely to have issues
- `riskFactors` (jsonb string[]) — e.g. ['high_tardiness','location_far']
- `isStaged` (boolean) — shift is in preview/approval state
- `requiresAcknowledgment` (boolean) — officer must confirm
- `autoReplacementAttempts` (integer) — backfill retry counter
- `replacementForShiftId` — links replacement to original calloff shift
- `isManuallyLocked` (boolean) — prevents AI from modifying
- `isArmedPost` (boolean) — gates on armed license validation

**Schedules table:** `schedules` — high-level schedule container (name, start/end date, status: active/draft)

**Autonomous Scheduler:** `server/services/scheduling/trinityAutonomousScheduler.ts` (3,250 lines)
- Generates shifts at `status: 'draft'`
- Scores officers by risk/reliability
- Called from: admin routes, scheduling routes, trinity training routes, `server/index.ts`
- **GAP:** No direct connection to owner approval gate before publishing. Trinity drafts → status stays `draft` — owner must manually publish.

---

### 1B. Call-Off / SARGE Handling

**FULLY WIRED.** The most complete pipeline in the platform.

**Trigger sources:**
```
SMS keyword "CALLOFF"     → trinityVoice/smsAutoResolver.ts → calloffCoverageWorkflow
Voice extension 4→2       → trinityVoice/voiceOrchestrator.ts → calloffCoverageWorkflow
Chat command in SARGE     → helpAIBotService.ts (case 'calloff_shift') → calloffCoverageWorkflow
Manager marks absent      → shift status update → calloffCoverageWorkflow
Trinity action            → workflowOrchestrator.ts → calloffCoverageWorkflow
```

**Pipeline (calloffCoverageWorkflow.ts — 700 lines):**
```
1. TRIGGER   → logWorkflowStart()
2. FETCH     → find shift (explicit shiftId OR officer's next shift ≤6hrs)
3. VALIDATE  → shift exists, belongs to officer, is schedulable
4. PROCESS   → trinityShiftOfferService.sendShiftOffers() — shortlists qualified replacements
5. MUTATE    → shift.status = 'calloff', record to shift_calloffs, fire SMS/in-app offers
6. CONFIRM   → verify mutation, count outstanding offers
7. NOTIFY    → supervisor SMS + in-app, client SMS (if client configured), audit trail
```

**SLA:** 15 minutes to confirmed replacement. `scanStaleCalloffWorkflows()` sweeps every few minutes — escalates supervisor if SLA missed.

**DB state after calloff:**
- Original shift: `status='calloff'`
- New replacement shift created: `status='draft'`, `replacementForShiftId=originalId`
- Offers logged in `shift_offers` table with `status='sent'`
- On offer accepted: replacement shift → `status='scheduled'`

**GAP:** SARGE's `calloff_shift` command in chat calls the workflow but doesn't broadcast the deliberating state to the room before executing. Officer gets no confirmation message in ChatDock. Fix: wire `broadcastToWorkspace('sarge_executing')` before and `sarge_complete` after.

---

### 1C. Onboarding — Post-Stripe Subscription

**PARTIAL.** Employee onboarding pipeline exists. Tenant (org) onboarding has gaps.

**What exists:**
- `employeeOnboardingPipelineService.ts` — handles new employee setup steps
- `onboardingPipelineRoutes.ts` — CRUD for pipeline records
- `assistedOnboarding.ts` — AI-assisted employee onboarding
- `onboardingTaskRoutes.ts` — task management for setup steps

**Stripe webhook:** Lives in `server/index.ts`. Handles:
- `invoice.paid` → `resetMonthlyOverage()` (billing reset only)
- No workspace provisioning logic post-subscription confirmed

**GAP — Tenant onboarding post-Stripe:**
- No mandatory setup checklist enforced after subscription
- No state selection step gate
- No Wave 17 migration import prompt
- No overage limit configuration prompt
- Dashboard unlocks immediately regardless of setup completion
- No `#trinity-command` room auto-created for new workspace

**What Statewide needed manually that new orgs would also need:**
1. `orgCode` set (→ shows "Contact Support" without it)
2. `licenseNumber` set (→ auditor portal breaks)
3. `state` set (→ regulatory knowledge engine picks wrong state)
4. `state_regulatory_config` row for their state
5. SARGE auto-joined to all rooms

---

### 1D. Client Shift Request (Inbound Email)

**EXISTS but not fully closed-loop.**

`workRequestParser.ts` (381 lines) — Gemini-powered email parser:
- Extracts date/time, guard count, position type, location, urgency
- Returns `ParsedWorkRequest` with confidence score
- Called from: `inboundEmailActions.ts`, `trinityInboundEmailProcessor.ts`

**GAP:** No end-to-end wired pipeline from parsed email → draft shift → backfill SMS → assignment confirmation → owner billing flag → client email confirmation. The parser exists. The stitching does not.

---

### 1E. Existing Workflow Orchestrator (Phase 20)

**6 workflows registered:**
```
1. calloff_coverage          ✅ COMPLETE (700 lines, fully wired)
2. missed_clockin            ✅ COMPLETE (sweep + SMS)
3. shift_reminder            ✅ COMPLETE (4hr/1hr cadence)
4. invoice_lifecycle         ✅ COMPLETE (timesheet → invoice → send)
5. compliance_expiry_monitor ✅ COMPLETE (daily cert/license sweep)
6. payroll_anomaly_response  ✅ COMPLETE (flag/block anomalous payroll)
```

All 6 are Trinity-callable via actionRegistry.

---

## PART 2 — CLOSED-LOOP PIPELINE MATRIX (To-Be)

### WORKFLOW 1: Predictive Master Scheduling

**Trigger:** Trinity's autonomous scheduler runs (cron or manual trigger)
**Owner:** Trinity → drafts, Owner → approves, Trinity → publishes + notifies

```
STEP 1  DRAFT
  Trinity calls: trinityAutonomousScheduler.generateMonthlyDraft(workspaceId, month)
  → creates shifts with status='draft', aiGenerated=true, aiConfidenceScore set
  → groups into schedule container (schedules table, status='draft')
  → logs to workflow_audit_log

STEP 2  FLAG OWNER
  → broadcastToWorkspace: 'schedule_ready_for_review' event
  → notification: "Trinity has drafted [N] shifts for [Month]. Review and approve."
  → Dashboard widget shows pending approval count
  → Email to owner (if notificationPreferences allows)

STEP 3  OWNER REVIEWS
  → /schedule page shows draft shifts with AI confidence scores
  → Low confidence shifts (< 0.7) highlighted in amber
  → Risk factors shown per shift ("officer has 3 late calloffs this month")
  → Owner can: Approve All | Modify | Reject specific shifts

STEP 4  APPROVE
  → schedules.status = 'approved'
  → all shifts in schedule: status 'draft' → 'published'
  → Trinity action: scheduling.bulk_publish fires

STEP 5  NOTIFY GUARDS
  → notificationDeliveryService sends push + SMS per officer
  → Message: "Your schedule for [Month] is posted. [N] shifts assigned."
  → shifts.requiresAcknowledgment = true triggers acknowledgment receipts
  → SARGE posts schedule summary to each officer's shift room

CURRENT GAP:
  ❌ No auto-trigger of monthly draft (cron not wired)
  ❌ No owner approval gate — Trinity publishes directly
  ❌ No dashboard widget showing pending schedule approval
  ❌ No acknowledgment tracking in ChatDock

WIRE:
  + server/services/scheduling/schedulingCronService.ts (new)
  + server/routes/scheduling/approvalGate.ts (new) 
  + Dashboard widget: ScheduleApprovalWidget component
```

---

### WORKFLOW 2: Autonomous Call-Off & Backfill

**Status: MOSTLY COMPLETE. Gaps are in ChatDock feedback only.**

```
STEP 1  TRIGGER (any source)
  SMS: "CALLOFF" → smsAutoResolver → calloffCoverageWorkflow  ✅
  Voice: extension 4→2 → voiceOrchestrator → calloffCoverageWorkflow  ✅
  Chat: officer tells SARGE "I can't make my shift" → calloff_shift action  ✅
  Manager: marks absent in UI → calloffCoverageWorkflow  ✅

STEP 2  SHIFT UNASSIGNED
  shift.status → 'calloff'  ✅
  replacement shift created → status='draft'  ✅

STEP 3  SUPERVISOR NOTIFIED
  SMS to supervisor  ✅
  In-app notification  ✅
  SARGE posts to supervisor channel  ❌ (GAP — not wired to ChatDock)

STEP 4  AUTO-SMS TO AVAILABLE GUARDS
  trinityShiftOfferService.sendShiftOffers()  ✅
  Scores by availability, proximity, reliability  ✅
  SMS: "Shift available 1400-2200 North Entrance. Reply YES to accept"  ✅

STEP 5  FILLED
  Guard replies YES → offer accepted → replacement shift status='scheduled'  ✅
  Shift offer record closed  ✅

STEP 6  CONFIRM ALL PARTIES
  Replacement guard: SMS confirmation  ✅
  Supervisor: SMS "Shift filled by [Name]"  ✅
  Client: SMS (if client.smsNotifications = true)  ✅
  SARGE in ChatDock: "Shift covered. [Name] confirmed for [time]."  ❌ (GAP)

STEP 7  SLA ESCALATION
  scanStaleCalloffWorkflows() sweeps every few minutes  ✅
  Escalates supervisor if unfilled at 15min  ✅

CURRENT GAPS:
  ❌ SARGE does not post calloff confirmation to shift room ChatDock
  ❌ No "Executing..." animation in chat when calloff is processing
  ❌ ChatDock action block for 'shift_fill' not wired to calloff result

WIRE:
  + broadcastToWorkspace('sarge_executing') before calloff mutation
  + broadcastToWorkspace('helpai_calloff_filled') after step 5
  + ChatDock 'shift_fill' action block renders result inline
```

---

### WORKFLOW 3: Zero-to-Live Tenant Onboarding

**Status: BROKEN. No mandatory gates exist post-Stripe.**

```
STEP 1  SUBSCRIPTION CONFIRMED (Stripe webhook: customer.subscription.created)
  CURRENT: only resets monthly overage  ❌
  NEEDED:
  → create workspace record with status='provisioning'
  → create owner user account
  → send welcome email with login link
  → trigger onboarding checklist activation

STEP 2  MANDATORY SETUP CHECKLIST (blocks dashboard access)
  Item 1: State selection
    → sets workspace.state
    → upserts state_regulatory_config row
    → seeds regulatory_knowledge_base for that state (runs seedRegulatoryKnowledge)
  
  Item 2: Org code selection
    → owner picks a 3-8 char unique code (STATEWIDE, ACME, etc.)
    → sets workspace.orgCode, validates uniqueness
    → SARGE and Trinity know the org by this code forever
  
  Item 3: Company license number
    → sets workspace.licenseNumber (e.g. C11608501)
    → used by auditor portal, SARGE's license verification cards
  
  Item 4: Overage limits
    → sets workspace.maxOverageLimitCents (default $5000)
    → spend cap configured before any AI usage

  Item 5: Import existing data (optional — Wave 17)
    → unifiedMigrationService.ts offered here
    → import from GetSling, Excel, previous system
    → confidence scoring for ghost employees

STEP 3  WELCOME DASHBOARD UNLOCKS
  CURRENT: dashboard always accessible  ❌
  NEEDED:
  → checklist completion percentage stored in workspace.onboardingStep
  → dashboard blocked by OnboardingGate component until 100%
  → SARGE auto-joins all workspace rooms
  → #trinity-command room auto-created (managers/owners only)
  → Trinity sends welcome message to owner in trinity-command

STEP 4  FIRST WEEK GUIDED ACTIONS
  → SARGE proactively offers: "Ready to add your first officer?"
  → Trinity surfaces: "I've prepared a compliance checklist for [State]"
  → Dashboard shows empty-state widgets with action CTAs (not just blank)

CURRENT GAPS:
  ❌ Stripe webhook does not trigger workspace provisioning
  ❌ No mandatory checklist gate on dashboard
  ❌ No state selection step
  ❌ No orgCode selection step  
  ❌ No #trinity-command room auto-creation
  ❌ Dashboard shows "Contact Support" for missing org code
  ❌ Regulatory knowledge not seeded at onboarding

WIRE:
  + server/routes/stripe-webhook.ts: subscription.created → workspaceProvisioningService
  + server/services/workspaceProvisioningService.ts (new — full checklist engine)
  + client/src/components/OnboardingGate.tsx (new — blocks dashboard until checklist done)
  + client/src/pages/onboarding/SetupChecklist.tsx (new — 5-step mandatory flow)
  + server/scripts/seedStatewideProduction.ts (exists — run this for Statewide now)
```

---

### WORKFLOW 4: Client Shift Request (Inbound Email)

**Status: PARSER EXISTS. End-to-end pipeline does not.**

```
STEP 1  CLIENT EMAILS (any format)
  → Resend inbound webhook (incidents@, docs@, support@, calloffs@)
  → trinityInboundEmailProcessor.ts receives raw email
  → workRequestParser.ts classifies: isWorkRequest? confidence?
  
  If confidence >= 0.7:
    → ParsedWorkRequest extracted (date, time, guards, location, position type, urgency)
  If confidence < 0.7:
    → Trinity emails client: "Can you confirm these details: [extracted]?"
    → Waits for reply (human-in-loop for ambiguous requests)

STEP 2  TRINITY DRAFTS SHIFT
  CURRENT: parser returns ParsedWorkRequest. Nobody acts on it.  ❌
  NEEDED:
  → match client email → workspace.clients record
  → create shift: status='draft', clientId set, aiGenerated=true
  → check officer availability + armed/unarmed requirement
  → shortlist 3 candidates by score

STEP 3  BACKFILL SMS TO OFFICERS
  → trinityShiftOfferService.sendShiftOffers() (same as calloff backfill)
  → SMS: "New shift available [date/time] [location]. Reply YES to accept."
  → SLA: 30 minutes for urgent, 4 hours for normal

STEP 4  SHIFT ASSIGNED
  → First YES reply → shift.status = 'scheduled'
  → Remaining offers auto-cancelled

STEP 5  OWNER FLAGGED FOR BILLING
  CURRENT: no billing flag on inbound client requests  ❌
  NEEDED:
  → notification to owner: "New client shift: [Client] on [Date]. Rate: $[bill_rate]/hr."
  → owner confirms billing rate (or Trinity uses existing client contract rate)
  → invoice_lifecycle workflow triggered post-shift-complete

STEP 6  CLIENT CONFIRMED
  → Email reply to client: "Confirmed: [N] officer(s) for [Date/Time] at [Location]"
  → If named officer: include officer name
  → Client portal: shift appears in their view

CURRENT GAPS:
  ❌ No trigger from parsed email → shift creation
  ❌ No client email → workspace.clients matching logic
  ❌ No owner billing flag notification
  ❌ No client confirmation email after assignment
  ❌ Client portal does not show inbound request status

WIRE:
  + server/services/trinity/workflows/clientShiftRequestWorkflow.ts (new)
  + Wire into trinityInboundEmailProcessor.ts → clientShiftRequestWorkflow
  + client/src/components/client-portal: inbound request status view
  + billingNotificationService.ts: owner flag on new client shift
```

---

## PART 3 — TRINITY CAPABILITY INJECTION STRATEGY

### How WORKFLOW_MAP.md feeds Trinity's brain

Trinity already uses `buildRegulatoryContextPrompt()` to inject domain knowledge before generating responses. The same pattern works for workflow knowledge.

**Architecture: `platform_capabilities_base` system context**

```typescript
// server/services/ai-brain/platformCapabilitiesService.ts (new)
// Called once at startup, cached in memory.
// Trinity reads this before any response that touches workflows.

export const PLATFORM_CAPABILITIES_BASE = `
=== CoAIleague Platform Workflow Capabilities ===

AUTONOMOUS WORKFLOWS (Trinity can trigger these directly via action registry):
  calloff_coverage          — guard calls off → backfill in 15min → supervisor notified
  missed_clockin            — shift started, officer MIA → SMS chain → escalate
  shift_reminder            — 4hr/1hr advance notice to officers
  invoice_lifecycle         — shift complete → timesheet → invoice → send to client
  compliance_expiry_monitor — daily scan for expiring guard cards, certs, licenses
  payroll_anomaly_response  — flag/block anomalous payroll runs

ACTION REGISTRY (Trinity can execute via actionId):
  scheduling.create_shift | scheduling.publish_shift | scheduling.bulk_publish
  compliance.verify_officer_license | compliance.verify_company_license
  payroll.get_runs | employees.list | employees.activate | employees.deactivate
  web.search | web.fetch_url
  [+ 100 more registered in actionRegistry.ts]

SHIFT LIFECYCLE:
  draft → published → scheduled → in_progress → completed
  draft → calloff → (backfill) → scheduled → completed
  [status changes are mutations Trinity executes via scheduling action handlers]

SARGE HANDLES (no Trinity escalation):
  Schedule questions, shift swap, clock-in/out, post orders, patrol,
  equipment, license renewal reminders, PTT acknowledgments

ALWAYS ESCALATE TO TRINITY:
  UoF justification, termination/discipline, payroll disputes,
  legal language, 5+ employee actions, officer in danger

DATABASE AWARENESS:
  workspaceId scoped on all queries — Trinity never cross-contaminates tenants
  All financial writes: db.transaction() — atomic or nothing
  Shift overlap: PostgreSQL btree_gist exclusion constraint enforced
=== END PLATFORM CAPABILITIES ===
`;
```

**Injection point:** `aiBrainService.ts` → `handleMessage()` — append alongside `regulatoryContextBlock` and `webSearchContext`. Already wired to inject domain context. Add `platformCapabilitiesBase` as the third block, always present (not keyword-gated like the others — Trinity should always know what she can do).

**For SARGE:** Same service, subset of capabilities. SARGE gets the workflow awareness but not the admin/financial action registry — he escalates those to Trinity.

---

## PART 4 — GAP PRIORITY MATRIX

| Gap | Severity | Effort | Wave |
|---|---|---|---|
| Tenant onboarding mandatory checklist | CRITICAL | Medium | Wave 23 |
| Stripe webhook → workspace provisioning | CRITICAL | Small | Wave 23 |
| #trinity-command room auto-creation | HIGH | Small | Wave 23 |
| Schedule draft → owner approval gate | HIGH | Medium | Wave 23 |
| ChatDock SARGE calloff feedback | HIGH | Small | Wave 23 |
| Client shift request → shift creation | HIGH | Medium | Wave 23 |
| Monthly scheduling cron trigger | MEDIUM | Small | Wave 23 |
| Client confirmation email after assignment | MEDIUM | Small | Wave 23 |
| Platform capabilities injected into Trinity | HIGH | Small | Wave 23 |
| ChatActionBlock 'shift_fill' result inline | MEDIUM | Small | Wave 23 |

---

## PART 5 — PAGE / BUTTON / LINK AUDIT STATUS

### Routes confirmed wired end-to-end:
- `/chatrooms` → ChatDock → SARGE + Trinity (role-gated) ✅
- `/api/compliance/verify/officer/:id` → license verification deep links ✅
- `/api/compliance/pre-audit` → red team engine ✅
- `/api/guard-tours/tours/:id/print-qr` → QR print sheet ✅
- `/dps-portal/:token` → auditor portal sandbox ✅
- `/api/ai-brain/chat` → Trinity direct chat (managers) ✅
- All PTT routes → CAD bridge → ChatDock ✅
- Patrol scan → CAD → SARGE shift room message ✅

### Routes that exist but have gaps:
- `/billing` → addon management (proration preview works, spend cap UI missing)
- `/guard-tours` → QR print button added, NFC scan CAD bridge wired ✅
- `/schedule` → draft approval gate missing
- `/onboarding/*` → employee onboarding wired, tenant onboarding not gated

### Pages confirmed working:
- Owner Dashboard + IdentityCard widget ✅
- Worker Dashboard + IdentityCard ✅
- DPS Auditor Portal (dynamic, all states) ✅
- Regulatory Knowledge Engine (TX+CA+FL+NY+FEDERAL seeded) ✅
- PDF Engine (pay stubs, DARs, UoF reports, audit packets) ✅

---

*WAVE 22 AUDITED & MATRIX COMPILED.*
