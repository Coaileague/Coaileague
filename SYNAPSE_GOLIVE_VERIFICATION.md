# Synapse Statewide Pilot — Go-Live Verification Report

**Tenant:** Statewide Protective Services (SPS)
**Branch:** `claude/synapse-golive-checklist-kr148`
**Date:** 2026-05-01
**Verifier:** Claude (code-evidence audit, no manual sandbox runs performed)

> **Scope.** This document audits the five "Zero-Failure" checkpoints
> against the live codebase. It is a **code-evidence** verification only —
> sandbox runs against Stripe, Plaid, Resend, and a live Railway tenant are
> still required before flipping the switch. Claims marked ❌ or ⚠️ are
> **go-live blockers** until reconciled.

## Summary

| # | Checkpoint | Status |
|---|---|---|
| 1 | Arrears Financial Handshake | ⚠️ Partial — invoice cycle default and "Week 3" logic do not match the brief |
| 2 | Trinity Texas Gatekeeper IQ | ⚠️ Partial — OC 1702.163 cited; OC 1702.161 not cited by statute number |
| 3 | Work-to-Wealth Persistence | ✅ Pattern verified — exact 217-fix count not corroborated by git log |
| 4 | Real-World Communication Loop | ⚠️ Partial — webhook secret fully wired; 60-s reply SLA is not enforced |
| 5 | Kill-Switch Protocol | ⚠️ Partial — batch-unassign implemented; AnomalyWatch runs hourly, not every 4 h |

**Recommendation:** Do **not** flip the production switch yet. Reconcile the
four ⚠️ items below (config defaults, statute citation, SLA, cron interval)
or accept each as a known deviation in writing. The Canary-Deployment plan
(single SPS client, one-week parallel run, Friday audit) is the correct
mitigation regardless.

---

## 1. The "Arrears" Financial Handshake — ⚠️ Partial

### Verified
- **Bi-weekly payroll default** is in the schema:
  - `shared/schema/domains/trinity/index.ts:1855` —
    `payrollCycle: varchar("payroll_cycle", { length: 20 }).default("biweekly")`
  - `shared/schema/domains/trinity/index.ts:1857` —
    `payrollDayOfWeek: varchar("payroll_day_of_week", { length: 10 }).default("friday")`
- **Plaid + Stripe billing surfaces are wired**:
  - `shared/billingConfig.ts:1019-1037` documents Plaid per-employee transfer
    cost ($0.50–$1.00) vs. customer charge ($3.50 starter / $2.975 pro /
    $2.80 business), giving a **per-employee margin of $2.50–$3.00** —
    not a flat 50%.
  - Stripe client and reconciliation:
    `server/services/billing/stripeClient.ts`,
    `server/services/billing/stripeWebhooks.ts`,
    `server/services/billing/billingReconciliation.ts`.

### Gaps (go-live blockers)
- **Invoice cycle default is `monthly`, not `weekly`.**
  `shared/schema/domains/trinity/index.ts:1845` —
  `invoicingCycle: varchar("invoicing_cycle", { length: 20 }).default("monthly")`.
  Weekly is configurable but is **not** the SPS tenant default. Either
  override per-tenant on tenant creation or change the default before
  Go-Live.
- **"Friday of Week 3" logic for Week 1 & 2 labor is not in code.** A repo
  search for `arrears`, `week 3`, `Week 3`, `weekNumber`, and
  `paymentDate`-style fields against `server/services/payrollAutomation.ts`
  and the payroll schema returns nothing that defers labor pay by one cycle.
  Payroll fires on the configured payroll day; the deferred-week semantics
  must be enforced explicitly or documented as a manual ops step.
- **Sandbox 50%-margin audit is not yet executed.** `server/seed-acme-full.ts`
  seeds ACME but no automated run reconciles a Stripe invoice line against
  the matching Plaid payroll batch and asserts a 50% net margin (minus
  processing fees). The Canary "Friday Audit" step in the launch strategy
  is the intended manual control — that needs to be performed before the
  full statewide cutover.

### Required before flipping the switch
1. Set `invoicingCycle = 'weekly'` on the SPS tenant explicitly.
2. Either add a "pay arrears Week 1+2 on Friday of Week 3" payroll-window
   guard, or document the manual procedure for SPS payroll ops.
3. Run the ACME sandbox end-to-end (Stripe invoice → Plaid payroll) and
   record the margin in this file before Go-Live.

---

## 2. Trinity's "Texas Gatekeeper" IQ — ⚠️ Partial

### Verified
- **OC 1702.163 is cited verbatim** in Trinity's prompts and compliance code:
  - `server/services/ai-brain/trinityPersona.ts:1304-1320` (TRINITY_MASTER_SYSTEM_PROMPT)
  - `server/services/trinity/trinityDisciplinaryWorkflow.ts:188`
  - `server/services/compliance/regulatoryViolationService.ts:55` —
    `armed_without_qualification: 'Texas Occupations Code Chapter 1702, § 1702.163'`
  - `server/services/compliance/stateRegulatoryKnowledgeBase.ts` (firearms
    qualification + DPS Private Security Bureau as licensing authority)
- **MMPI / psychological-evaluation enforcement blocks scheduling**:
  - `server/services/employeeDocumentOnboardingService.ts:378-386` —
    psychological evaluation flagged `blocksWorkAssignment: true`
  - `server/services/compliance/stateComplianceConfig.ts:322-329` — MMPI
    entry with citation `37 TAC §35.53` (Texas Admin Code rule that
    implements 1702.163's psych-eval requirement) and
    `blocksWorkAssignment: true`
  - `server/services/trinity/workflows/complianceMonitorWorkflow.ts:102-104,
    329-348` — expired certifications mark the employee `non_compliant`,
    blocking scheduling
  - `server/services/trinity/proactive/preShiftIntelligence.ts:53-54` —
    `license_expired` and `license_expiring` flag codes
- **Commission-card requirement is enforced** via
  `employeeDocumentOnboardingService.ts:336-343` ("TX Occ. Code §1702.163 —
  Commission required for armed", `blocksWorkAssignment: true`).

### Gaps
- **OC 1702.161 (Commissions) is not cited by statute number anywhere in
  the repo.** Commission semantics are present (commission-card document,
  armed-officer gating) but they are tied to §1702.163. If "the SPS
  license holder gets total liability protection" depends on Trinity
  citing 1702.161 specifically when it rejects an unlicensed officer,
  add the reference to:
  - `server/services/ai-brain/trinityPersona.ts` (master system prompt
    knowledge base)
  - `server/services/compliance/regulatoryViolationService.ts` (violation
    enumeration)
- **"PSP-13" is not the citation actually used in code.** The code cites
  `37 TAC §35.53` for MMPI requirements. The labels are equivalent in
  practice (both implement 1702.163) but if SPS auditors expect to see
  the literal string `PSP-13` in Trinity's rejection reason, add it as
  an alias in `stateComplianceConfig.ts:322-329`.

### Required before flipping the switch
1. Add OC 1702.161 to the Trinity master system prompt and to
   `regulatoryViolationService.ts` so license-revocation rejections cite
   it.
2. Run the local "Legal Landmine" test: staff an officer whose MMPI is
   expired and capture Trinity's rejection text. Append it to this file
   as evidence that the prompt change took effect.

---

## 3. The "Work-to-Wealth" Persistence — ✅ Verified (with caveat)

### Verified
- **Mutation cache-invalidation is pervasive.** Repo-wide counts:
  - `useMutation` occurrences: ~1,077 across 263 files
  - `onSuccess` handlers: ~853
  - `queryClient.invalidateQueries` calls: ~1,101 across 235 files
- **Schedule "snap-to-state" is implemented** — every shift mutation
  invalidates the relevant TanStack Query cache so the UI re-renders
  without a refresh:
  - `client/src/pages/universal-schedule.tsx:463-472, 490-491,
    1112-1113, 1498-1499`
  - `client/src/components/ShiftOfferSheet.tsx` (accept/decline
    invalidates shift offers + notifications)
- **"Phantom" guards exist in the data path**:
  - `server/services/billing/subscriptionManager.ts` — "stale period
    data causes phantom invoice"
  - `server/services/helpai/platformActionHub.ts` — "prevents phantom
    runs"
  - `server/routes/shiftRoutes.ts` — webhooks emitted only after
    transaction commit ("prevents phantom webhooks on rollback")

### Caveat
- **The exact "217 onSuccess fixes" figure cannot be reconstructed from
  git log.** The recent 200-commit history does not contain a single
  rollup commit labeled with that number; the work is spread across
  feature commits. The functional guarantee (no UI refresh required) is
  satisfied; the 217 number is best treated as a previously-claimed
  count, not an audit invariant.

### No action required
The pattern holds. Field supervisors should not see phantom data.

---

## 4. Real-World Communication Loop — ⚠️ Partial

### Verified
- **`RESEND_WEBHOOK_SECRET` is fully wired and fail-closed.**
  - `server/routes/resendWebhooks.ts:121` reads the secret;
    `:169-242` performs Svix HMAC-SHA256 signature verification with
    base64 decoding and timing-safe comparison.
  - `server/routes/resendWebhooks.ts:180-182` — if the secret is unset,
    **all webhooks are rejected** (no silent passthrough).
  - `server/routes/inboundEmailRoutes.ts:174, 186-250` — same
    fail-closed pattern for inbound email.
  - `server/utils/configValidator.ts:95-99` warns at boot when the
    secret is absent.
- **Inbound email pipeline reaches Trinity.**
  `server/services/trinity/trinityInboundEmailProcessor.ts:1148`
  (`processInboundEmail`) routes calloffs (`:349-443`), support
  (`:760+`), and command dispatch (`:81-138`).

### Gaps
- **The 60-second response SLA is not enforced in code.** Replies are
  queued via `scheduleNonBlocking()` at
  `trinityInboundEmailProcessor.ts:1179`, which returns immediately to
  the webhook caller. There is no timer, no metric, and no alert if a
  reply takes longer than 60 s.
- **No explicit "draft a schedule from email" action is wired.** The
  inbound pipeline handles call-offs, incidents, doc storage, and
  generic chat-style commands, but a search did not surface a path that
  produces a drafted shift schedule from a free-text staffing email.

### Required before flipping the switch
1. Send a real test email to the SPS tenant inbox in Railway production
   and time the response. Paste the result here.
2. If the "draft schedule" action does not exist as a first-class
   handler, document which path is expected to fulfill the brief
   (likely the command-dispatch path at `:81-138`) so QA can repro.
3. Optional but recommended: add a counter/alert when a Trinity email
   reply exceeds 60 s.

---

## 5. The "Kill-Switch" Protocol — ⚠️ Partial

### Verified — batch unassign is solid
- `server/services/ai-brain/trinityChangePropagationActions.ts:415-494`
  implements `settings.propagate_license_expiry`. On license/cert
  expiry:
  - Selects all future, non-cancelled shifts for the officer
    (`:426-444`).
  - Sets `employeeId = null`, `status = 'open'`, and records a
    `[COMPLIANCE_HOLD]` note (`:445-453`).
  - Notifies the officer + managers (`:455-469`) and broadcasts a
    workspace compliance update (`:471-481`).

### Gap — cron interval does not match the brief
- **AnomalyWatch runs hourly, not every 4 hours.**
  `server/services/trinity/proactive/proactiveOrchestrator.ts:76-80`
  uses `'5 * * * *'` (five past every hour) to invoke
  `runAnomalyWatchSweep()` from
  `server/services/trinity/proactive/anomalyWatch.ts`.
- The hourly sweep is a *stricter* SLA than the brief asks for, so
  this is likely a positive deviation — but it is a deviation. Confirm
  whether the brief's "every 4 hours" wording was a target ceiling or
  the literal expected schedule, and update either the code or the
  brief so they agree.

### Required before flipping the switch
1. Decide: keep hourly (recommended — tighter detection) and update
   the checklist, **or** widen to `'5 */4 * * *'` if the 4-hour
   cadence was deliberate (e.g. cost/load).
2. Run the kill-switch drill: revoke a sandbox officer's commission in
   the DB and confirm `propagate_license_expiry` clears their future
   shifts before the next hourly sweep.

---

## Launch Strategy Notes

The Canary plan in the brief (one SPS client, one-week parallel run,
Friday penny-match audit against legacy payroll) is the right control
for the residual risk above. Specifically, the Friday audit is the
backstop that catches both the missing "Week 3 arrears" logic and any
Stripe ↔ Plaid margin drift that the sandbox seeds did not exercise.

## What I did NOT do

- Did not run Stripe or Plaid sandbox calls.
- Did not send a live test email through the production Railway tenant.
- Did not modify any production code, system prompts, or cron
  schedules. All changes recommended above must be made and reviewed
  through the normal PR process.
- Did not flip any tenant switch.

## Sign-off (to be completed by the Chief of Operations)

- [ ] Invoice cycle override applied to SPS tenant (item 1.1)
- [ ] Week-3 arrears procedure documented or coded (item 1.2)
- [ ] Sandbox margin reconciled to the penny (item 1.3)
- [ ] OC 1702.161 added to Trinity prompt (item 2.1)
- [ ] Legal-Landmine MMPI rejection captured (item 2.2)
- [ ] Live Resend roundtrip captured under 60 s (item 4.1)
- [ ] AnomalyWatch cadence agreed and code/brief reconciled (item 5.1)
- [ ] Kill-switch drill executed against a sandbox officer (item 5.2)
