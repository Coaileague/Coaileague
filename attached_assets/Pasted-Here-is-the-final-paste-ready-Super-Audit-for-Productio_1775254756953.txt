Here is the final paste-ready Super Audit for Production Readiness.

GROUND TRUTH INSTRUCTION — READ BEFORE ANYTHING ELSE:
This directive is built on verified platform intelligence. Treat every
service name, table name, event name, architectural law, and flow
description as ground truth. Do not infer, assume, or substitute from
prior context or training data. If this directive contradicts something
you believe about this codebase, this directive wins.

OPERATING CONTEXT LOCK:
- ACME Security is the exclusive simulated development tenant.
- ACME contains seeded realistic test data and is fully disposable.
- ACME exists only for development, chaos testing, end-to-end battle
  simulation, and sandbox validation.
- Statewide Protective Services is the real security company, the first
  live production tenant, and the platform owner.
- Statewide is permanently grandfathered into the highest tier with zero
  subscription charge, zero payment requirement, and zero billing
  enforcement against that tenant ever.
- Statewide must never be mutated by tests, seeded with dev data,
  contacted by automated test flows, or contaminated by ACME artifacts.
- Use Statewide only for read-only isolation checks and cross-tenant
  leak testing where explicitly required.
- If any pathway allows ACME data, simulated billing artifacts, mock
  payroll, or synthetic communications to touch Statewide or any real
  tenant boundary, that is a Class A failure.

EXECUTION INSTRUCTION:
Write this entire directive into OMEGA_DIRECTIVE.md then execute it
exactly as written.
Maintain OMEGA_STATE_CHECKPOINT.md throughout execution.
Update OMEGA_STATE_CHECKPOINT.md after every completed layer with:
  - layer name and number
  - pass/fail status
  - code paths inspected
  - files changed
  - defects found (severity: Critical/High/Medium/Low)
  - defects fixed
  - verification evidence (records, events, notifications, audit trail)
  - regression checks on dependent systems
  - deferred items with reason
  - Bryan-required items flagged
Read OMEGA_STATE_CHECKPOINT.md at the start of every new session.
Do not rely on conversational memory alone.

======================================================================
COAILEAGUE OMEGA NUCLEAR PRODUCTION READINESS DIRECTIVE
FINAL SUPER AUDIT | PLATFORM-ALIGNED MASTER READINESS COMMAND
======================================================================

PRIME OBJECTIVE:
By end of this weekend, a real paying tenant must be able to:
- sign up and onboard
- subscribe and provision
- schedule and communicate
- invoice and collect payment
- process payroll via ACH direct deposit
- operate Trinity autonomously across email, voice, and actions
- survive failures with zero data loss
with zero human intervention during normal operation.

You are executing a full scan → fix → verify → certify loop.

DO NOT STOP BETWEEN LAYERS.
DO NOT ASK FOR PERMISSION TO CONTINUE.
DO NOT DELIVER A PARTIAL REPORT.
DO NOT MARK ANY ITEM DONE WITHOUT RUNTIME VERIFICATION.

Only items requiring Bryan's physical action may remain open.
Everything else must be fixed now.

======================================================================
I. COMMAND AUTHORITY
======================================================================

ACME Security = exclusive writable sandbox. All testing runs here.
Statewide Protective Services = first production tenant and platform
owner. Strictly protected. Zero mutations. Zero test data. Zero contact.

Flag as [BRYAN ACTION REQUIRED]:
- Live Stripe keys (sk_live_) and live webhook secret
- Plaid production keys and PLAID_WEBHOOK_SECRET
- Twilio toll-free number verification
- DNS: DMARC p=quarantine or p=reject, DKIM 2048-bit, MX records
- Resend domain verification: coaileague.com and *.coaileague.com
- Production session signing secret (must differ from dev secret)
- NODE_ENV=production confirmation before republishing

======================================================================
II. DEFINITION OF DONE
======================================================================

Production-ready only if ALL of the following are true:

1.  All critical user journeys succeed end-to-end
2.  All tenant data isolated — zero cross-tenant leakage
3.  All financial writes atomic, auditable, immutable where required,
    never partially recorded
4.  All scheduling mutations audited before mutation completes
5.  All notifications route through NDS except the 4 approved
    auth-email bypasses
6.  Trinity functions API-only with zero filesystem access
7.  Session auth and workspace scoping cannot be bypassed
8.  All major async jobs have retries, queues, DLQ, and alerting
9.  All feature tiers enforced at service layer, not only UI
10. All storage quotas enforced before object write
11. All failures visible, logged, correlated, and recoverable
12. Fault injection and chaos tests pass
13. Full ACME 32-step battle simulation passes without error
14. App boots clean with zero startup blockers
15. All 25 prior-session fixes confirmed intact (regression layer)
16. Statewide production readiness confirmed (read-only verification)
17. Zero unresolved Class A failures

======================================================================
III. ABSOLUTE ARCHITECTURAL LAWS
======================================================================

These laws are absolute. Any violation is a production blocker.

LAW 1 — NDS SUPREMACY
NDS is the sole notification sender. No direct SMTP. No direct provider
API calls outside NDS. Only four approved bypass exceptions exist:
- sendVerificationEmail
- sendMagicLinkEmail
- sendPasswordResetEmail
- sendEmailChangeVerification
Everything else routes through NDS without exception.

LAW 2 — TENANT ISOLATION
Every tenant query scoped by workspace_id. No global scans across
tenant business data. workspace_id from server-side session is
authoritative. Client-supplied workspace_id is ignored for
authorization. No query may load tenant data before scope validation.

LAW 3 — AUTH MODEL TRUTH
System uses session-based auth — NOT JWT.
Session tokens are SHA-256 hashed.
Session cookies: httpOnly, secure, sameSite=strict.
session.regenerate() fires on login.
session.regenerate() fires on workspace switch.
Password reset invalidates ALL active sessions for that user.
Admin-forced reset invalidates target user's active sessions.

LAW 4 — SINGLE SOURCES OF TRUTH
- roleDefinitions.ts: sole source for all roles
- featureRegistry.ts: sole source for all feature access gates
- billingConfig.ts: sole source for quotas, fees, and plan limits
- emailProvisioningService.ts: provisions exactly 6 base addresses per tenant

LAW 5 — TRINITY TRIAD
- Gemini = primary operator
- OpenAI = fallback/workhorse
- Claude = validator/judge
Fallback: Gemini fails → OpenAI → Claude validates
All fail → Safe Mode: read-only, no mutations, NDS alert to manager
Non-trivial mutations require triad consensus or approved deterministic
local validation. Conflicts go to TRINITY_CONFLICT_QUEUE with full
context. TRINITY_CONFLICT_QUEUE must have a resolution path — not a
black hole. Queue depth is observable. Items surface to manager via NDS.

LAW 6 — ZERO-TRUST TRINITY
Trinity is API-only. Any attempt to access /etc, /root, source files,
local secrets, or arbitrary filesystem paths triggers:
- immediate process kill
- security incident log written
- NDS alert to platform admin

LAW 7 — FINANCIAL IMMUTABILITY
Audit logs, paid invoices, payroll confirmations are append-only.
App DB user must not have UPDATE or DELETE on append-only tables.
Locked financial records hard-block mutation from API routes,
background workers, internal services, Trinity actions, and admin
tooling without exception.

LAW 8 — FINANCIAL ATOMICITY BY PATH TYPE

Path A — External charge paths (Stripe involved):
All required layers must commit atomically:
  1. Stripe charge or payment event
  2. financial_processing_fees DB ledger record
  3. platform_revenue table record
All required layers succeed or none do.

Path B — Internal metered fee paths (no Stripe charge):
All required internal records must commit atomically:
  1. financial_processing_fees DB ledger record
  2. platform_revenue table record
  3. audit record
No partial internal recording allowed.

Events covered by Path A:
- Payroll run processed
- Invoice paid via Stripe (pay-invoice route)
- Invoice marked paid manually (card/ACH only, not cash/check)
- Weekly billing seat overage charge
- AI credit overage charge
- Stripe Connect payout

Events covered by Path B:
- QuickBooks sync fee (credit-only, no Stripe charge)

Partial recording in either path = Class A failure.

LAW 9 — SCHEDULING AUDIT LAW
All scheduling mutations write scheduling_audit_log BEFORE mutation
completes. Blocked mutations do not create audit records.

LAW 10 — EMAIL ADDRESS LAW
Each workspace gets exactly 6 base addresses, subdomain format only:
  staffing@{slug}.coaileague.com
  calloffs@{slug}.coaileague.com
  incidents@{slug}.coaileague.com
  support@{slug}.coaileague.com
  docs@{slug}.coaileague.com
  billing@{slug}.coaileague.com
No dash-alias format. No plus-addressing. Zero exceptions.
Personal officer addresses (john.smith@{slug}) are provisioned
on-demand separately — they are not part of the base 6.

LAW 11 — BRANDING LAW
No hardcoded company names in runtime or customer-facing output.
Use PLATFORM.name from platformConfig for all runtime branding.
Statewide is never test data. ACME is the exclusive sandbox.

Allowed exceptions (do not modify):
- platformConfig source-of-truth definition file itself
- Database migration history files
- Test fixtures explicitly marked non-production
- Archived documentation

Prohibited locations for hardcoded brand strings:
- Server responses and API outputs
- Email templates and bodies
- SMS message bodies
- PDF headers and footers
- AI prompts sent to any model
- Public pages and marketing routes
- Notification content
- Calendar and invite outputs
- Auth issuer labels shown to users

LAW 12 — GRANDFATHERED TENANT PROTECTION
Statewide Protective Services is a permanent highest-tier tenant with
zero payment requirement. No automated billing, downgrade, lockout,
trial expiry, failed-payment restriction, or subscription enforcement
may suspend, degrade, invoice, or charge Statewide. This exemption
must be explicit in the codebase, auditable, and scoped only to
Statewide's workspace identity. It must not spill over to any other tenant.

LAW 13 — TENANT CONTAMINATION VERIFICATION
ACME simulation artifacts, mock invoices, mock payroll records, fake
communications, AI test traces, and sandbox-generated documents must
not appear in Statewide or any other real tenant workspace through:
- shared database queries
- shared job queues
- shared WebSocket rooms
- shared caches
- shared search indices
- shared storage path prefixes
- mis-scoped background jobs
Verify via records, storage paths, queue filters, and query scope.

======================================================================
IV. CLASS A PRODUCTION BLOCKERS
======================================================================

Any one of the following = immediate NOT GO until fixed and re-verified:

1.  Cross-tenant data leakage of any kind
2.  Mutation executed without audit trail where audit is required
3.  Paid invoice or closed payroll period can be modified
4.  Financial append-only protections absent or bypassable
5.  Financial recording fires only partially on any chargeable event
6.  Trinity can access filesystem paths or secrets
7.  Direct NDS bypass outside the 4 approved auth methods
8.  WebSocket cross-tenant broadcast leak
9.  Unscoped DB query touching tenant data
10. Duplicate financial writes from Stripe, payroll, or sync replays
11. Silent failure that drops customer-impacting work without log,
    retry, queue, or DLQ capture
12. Auth or authorization bypass on any sensitive endpoint
13. Payment portal links are forgeable or tamperable
14. TRINITY_CONFLICT_QUEUE has no resolution path — items accumulate silently
15. officer_activated event does not publish on officer reactivation
16. Any pathway allows ACME or synthetic artifacts to contaminate
    Statewide or any real tenant workspace

======================================================================
V. SEVERITY RUBRIC
======================================================================

Critical: NOT GO — security breach, financial corruption, tenant leak,
          unsafe mutation, integrity violation
High: breaks core production journey — billing, payroll, scheduling,
      Trinity automation, or resilience
Medium: weakens observability, compliance visibility, operational trust
Low: hygiene, consistency, cleanup, non-blocking refactor

======================================================================
VI. LAYER 0 — REGRESSION VERIFICATION OF ALL PRIOR SESSION FIXES
======================================================================

The following fixes were applied in prior sessions. Every one must be
re-verified before anything else runs. If any have regressed, fix
immediately before proceeding to Layer 1.

SECURITY FIXES:
1.  requireAuth middleware: silent catch replaced with structured logging
2.  dashboardRoutes.ts /summary: workspace_id from query param honored
    only for isPlatformAdmin — session workspace used for all others
3.  workspaceInlineRoutes.ts /switch: session.regenerate() called
    before re-writing user identity after workspace switch
4.  auth.ts resetPassword(): authSessions.isValid = false for all
    active sessions for that user after password reset
5.  adminRoutes.ts /reset-password: target user's active sessions
    invalidated after admin-forced reset
6.  recordFailedLogin(): structured warn log fires on lockout with
    userId, attempt count, and lockedUntil timestamp

FINANCIAL FIXES:
7.  payrollRoutes.ts: recordPayrollFee AND recordMiddlewareFeeCharge
    both fire after successful Stripe payroll fee charge
8.  stripeInlineRoutes.ts pay-invoice: chargeInvoiceMiddlewareFee
    fires after platform revenue record is written
9.  invoiceRoutes.ts mark-paid: chargeInvoiceMiddlewareFee fires for
    card/ACH paths only (not cash or check manual payment)
10. weeklyBillingRunService.ts: recordMiddlewareFeeCharge fires on
    seat overage and AI credit overage charges
11. stripeConnectPayoutService.ts: recordMiddlewareFeeCharge fires
    after successful payout fee charge
12. quickbooks-sync.ts: recordQbSyncFee fires after every CDC poll
    and after initial sync

STRIPE:
13. create-subscription: active subscription guard active — returns
    existing subscription (same tier) or 409 (different tier) on
    duplicate attempt; no silent second subscription created
14. stripeWebhooks.ts verifySignature: tries both test and live
    webhook secrets in sequence — not test-only

TIER GATES (all 7 must be enforced at service layer):
15. contractPipelineRoutes.ts → requirePlan('professional')
16. documentVaultRoutes.ts → requirePlan('professional')
17. rfpPipelineRoutes.ts → requireAuth + requirePlan('professional')
18. financialIntelligence.ts → requirePlan('professional')
19. biAnalyticsRoutes.ts → requirePlan('professional')
20. multiCompanyRoutes.ts → requireAuth + requirePlan('business')
21. enterpriseFeatures.ts → requirePlan('enterprise')

TRINITY ACTIONS (all 20 must appear in boot logs):
22. trinityMissingDomainActions.ts: insurance.status, insurance.expiry,
    insurance.state_compliance, gate.current_occupancy,
    gate.flagged_vehicles, recognition.suggest, recognition.summary
    (7 new additions + 13 original = 20 total confirmed)

SCHEMA:
23. voice_support_cases and voice_support_agents: Drizzle schema
    definitions exist and are exported from the schema barrel

EVENTS:
24. officer_activated event: published in employeeRoutes.ts on
    reactivation with employeeId, employeeName, activatedBy, workspaceId

ADMIN:
25. adminRoutes.ts: duplicate requirePlatformStaff removed from
    /platform/activities and /admin/metrics — router-level covers both

REPORT: All 25 must return PASS.
Fix and re-verify any that have regressed before continuing.

======================================================================
VII. LAYER 1 — PLATFORM BOOT, CONFIG, PRE-FLIGHT
======================================================================

1.  App boots clean with zero startup errors
2.  All migrations run cleanly and sequentially — no partial state
3.  Environment variables validated at boot — missing secrets fail fast
    with actionable error messages
4.  roleDefinitions.ts is authoritative and unshadowed elsewhere
5.  featureRegistry.ts is authoritative and unshadowed elsewhere
6.  billingConfig.ts is authoritative and contains all tiers:
    Trial, Starter, Professional, Business, Enterprise, Strategic
7.  Standard logger configured — no console.log in production paths
8.  Request-ID generated for all inbound requests
9.  No secret values appear in any log output
10. Production responses never leak stack traces or raw DB error text
11. Health checks exist and respond for:
    API, DB, queues, NDS, WebSocket layer
12. Queue workers boot cleanly and register all job handlers
13. Cron jobs register cleanly and are observable in logs
14. Validation middleware runs before DB writes on all mutating routes
15. Security middleware loads before application routes
16. Session middleware and workspace scope enforcement ordered correctly
17. Rate limits enforced:
    - Public routes: 20 req/min per IP
    - Auth endpoints: 5 req/min per IP
    - Authenticated routes: 200 req/min per session
18. Webhook routes: IP allowlist only (Resend, Stripe, Twilio, Plaid)
19. CORS: explicit allowed origins only — no wildcard in production
20. OWASP baseline present: SQLi defense, XSS sanitization, IDOR
    defense, over-posting defense, replay defense on critical endpoints
21. PLATFORM.name drives all runtime and customer-facing branding.
    Scan and fix runtime/customer-facing branding violations only.
    Report count found and fixed.

======================================================================
VIII. LAYER 2 — TENANT SIGNUP, PROVISIONING, ONBOARDING
======================================================================

1.  /trial page accessible without authentication
2.  Signup creates workspace with:
    - tier = trial
    - trial_expires_at = now + 14 days
    - Professional features unlocked during trial period
    - stripe_customer_id present and valid
3.  Workspace slug: unique, permanent, 3–12 chars, alphanumeric,
    starts with letter, reserved words blocked
4.  Org owner account created and pinned to workspace
5.  Org owner role = ORG_OWNER sourced from roleDefinitions.ts
6.  Signup rate-limited: max 3 attempts per IP per hour
7.  emailProvisioningService provisions exactly 6 base addresses:
    staffing@, calloffs@, incidents@, support@, docs@, billing@
    ALL at {slug}.coaileague.com — subdomain format only
    DB verification: SELECT COUNT(*) FROM email_addresses
    WHERE workspace_id = [new_workspace_id] → must return exactly 6
    Zero dash-alias addresses. Zero additional base addresses.
8.  EmailHubCanvas initializes exactly 8 folders with retention policies:
    Staffing, Call-Offs, Incidents, Support, Billing, Documents,
    Unread, Archive
9.  workspace.created event fires on the event bus
10. All downstream provisioning subscribers execute without error
11. Welcome email sends FROM trinity@coaileague.com through NDS only
12. Org owner lands in onboarding wizard after signup
13. Onboarding wizard RBAC-gated to ORG_OWNER role only
    (Manager attempting wizard steps must be rejected)
14. Provisioning failure is logged and recoverable — not silent
15. No orphan workspace or partial provisioning state remains on failure
16. Trial records are fully workspace-scoped

======================================================================
IX. LAYER 3 — SUBSCRIPTIONS, BILLING, FEES, CREDITS, COMMERCIAL CONTROL
======================================================================

A. SUBSCRIPTION FLOW
1.  Duplicate active subscription guard active and verified
2.  Stripe subscription creation occurs exactly once per workspace
3.  All webhooks signature-verified before processing
4.  All webhooks idempotent via event_id dedup table
5.  Duplicate webhook replay returns 200 without re-processing
6.  Feature gates update immediately on billing state change

B. REQUIRED STRIPE WEBHOOK HANDLERS
Verify handler exists AND executes correctly for every event:
- customer.subscription.created
- customer.subscription.updated
- customer.subscription.deleted
- invoice.payment_succeeded
- invoice.payment_failed
- payment_intent.succeeded
- payment_intent.payment_failed
- customer.updated

C. PAYMENT FAILURE POLICY
1.  invoice.payment_failed triggers immediate NDS alert to org owner
2.  Grace period exists before any workspace restriction activates
3.  First failure does not immediately suspend the workspace
4.  Soft-lock (read-only mode) begins after grace threshold
5.  Hard-lock occurs only after full grace period completes
6.  Retry policy is observable and auditable in logs

D. OVERAGE AND CREDIT CONTROL
1.  Weekly seat audit compares active users vs tier.max_seats
2.  Seat overages generate DRAFT billing only — never auto-charged
3.  AI credit usage tracked per workspace accurately
4.  At <10% AI credits: NDS Low Credits alert to org owner
5.  At 0% credits: Trinity enters Degraded Mode
    - Standard actions allowed
    - Brain/cognitive tasks disabled
    - No silent continuation past zero credits
6.  Burst usage does not double-burn credits under concurrency

E. FINANCIAL RACE DEFENSE
Simulate two simultaneous payment completion callbacks for one invoice.
Expected results:
- Exactly one PAID transition completes
- Exactly one financial_processing_fees record created
- Exactly one platform_revenue record created
- Duplicate callback returns success without re-processing anything
Fix if any of the above are violated.

F. TRIAL EXPIRY AND CANCELLATION
1.  Daily job checks trial expiry accurately
2.  NDS warning fires 3 days before expiry — once only
3.  NDS critical alert fires on expiry day — once only
4.  Workspace restrictions activate on expiry
5.  Restrictions reversible only through valid billing state changes
6.  Cancellation: 30-day data retention enforced, reactivation clean

G. GRANDFATHERED TENANT EXEMPTION
1.  Statewide Protective Services is explicitly exempt from:
    billing automation, downgrade logic, trial expiry enforcement,
    failed-payment suspension, and subscription enforcement
2.  Exemption is explicit in code — not merely absent from billing runs
3.  Exemption is scoped to Statewide workspace identity only
4.  Exemption does not spill to any other tenant

======================================================================
X. LAYER 4 — OFFICER, CLIENT, COMPLIANCE, CRM, FIELD READINESS
======================================================================

A. OFFICER READINESS
1.  license_number required on creation
2.  expiry_date required on creation
3.  Compliance records initialized on officer creation
4.  officer_activated event fires on creation AND reactivation
    Verify the event is PUBLISHED in employeeRoutes.ts
    not merely subscribed to in other code
5.  Trinity compliance checks run on activation via event subscription
6.  Expiry NDS alert scheduled 30 days before license expiry
7.  Expired license hard-blocks shift assignment with clear error
8.  License expiring within policy window triggers visible warning
    (not a hard block — officer can still be assigned)
9.  Officer availability windows respected:
    If officer has declared availability restrictions (days/hours),
    scheduling outside those windows must be blocked or flagged
10. All officer data strictly workspace-scoped

B. CLIENT READINESS
1.  Client creation initializes CRM pipeline record
2.  Client portal invite routes through NDS, expires in 48 hours
3.  Accepting invite issues a new session (not session mutation)
4.  Client portal scoped to that client's records only
5.  Cross-client data leakage test: create two client accounts in ACME,
    confirm each sees only their own invoices, sites, shift history,
    and payment records — no bleed between clients within same workspace
6.  Contract required before site can be added to scheduling
7.  Document Vault gating follows tier rules
8.  Vault uses soft-delete only — deleted_at, no hard deletes

C. STAFFING INTAKE
1.  Inbound to staffing@{slug} creates CRM lead record
2.  NDS alerts org owner with lead details immediately
3.  Email threading accurate via SR reference
4.  Duplicate intake handled safely — no double leads for same email

D. GEO-FENCING
1.  Shift start requires GPS coordinates submitted
2.  Distance from client_site computed server-side only
3.  Distance >200m creates Out-of-Bounds entry in scheduling_audit_log
4.  Manager receives NDS alert on any Out-of-Bounds event
5.  GPS noise tolerance applied — minor variance does not block
    legitimate shift starts

======================================================================
XI. LAYER 5 — SCHEDULING, CALL-OFFS, COVERAGE, REAL-TIME
======================================================================

A. SHIFT STATE MACHINE — STRICT ENFORCEMENT
Valid transitions only: OPEN → ASSIGNED → STARTED → COMPLETED
Invalid transitions blocked with clear error and logged.
No state may be set directly — must traverse valid path.

B. ASSIGNMENT SAFETY
Conflict check before every assignment:
- Overlapping shift for same officer
- Leave conflicts for the officer
- License expired at shift start date
- Role or qualification mismatch for the site
scheduling_audit_log written BEFORE mutation completes.
Blocked attempt does NOT create an audit record.

C. CONCURRENT ASSIGNMENT RACE TEST
Simulate two simultaneous assignments to the same OPEN shift.
Expected:
- Exactly one succeeds
- Exactly one fails with conflict error
- Exactly one audit record exists
- No orphaned assignment state in DB

D. SCHEDULE PUBLISHING
1.  Publish triggers NDS notifications to all affected officers
    (correct date, time, site, position included)
2.  Publish triggers WebSocket broadcast to workspace room only
3.  Cross-tenant WebSocket broadcast is impossible
4.  Cross-tenant broadcast attempt triggers kill-switch:
    connection terminated + security event logged + NDS alert
5.  scheduling_audit_log records publish action with publisher identity

E. CALL-OFF COVERAGE ENGINE
1.  Email to calloffs@{slug} classified as CALL_OFF even with
    degraded input ("cant mak it tmrw" must still classify correctly)
2.  officer_id resolved from email — never stored as null string
3.  shift_id resolved to correct shift — never null if resolvable
4.  If officer cannot be resolved: Trinity sends clarification reply,
    does NOT create a record with null officer_id
5.  call_off record fields: officer_id, shift_id, source, reason,
    workspace_id — all populated correctly
6.  Shift status transitions to OPEN after call-off logged
7.  Coverage search: qualified officer, not in conflict, not on leave
8.  Trinity Voice contacted first; NDS SMS fallback if voice unavailable
9.  First valid confirmation wins the reassignment
10. Manager notified via NDS throughout with full context
11. Manager manual override creates a logged audit record
12. Officer who called off receives confirmation reply from
    calloffs@{slug}.coaileague.com

F. SR-XXXXXXXX EMAIL THREAD CONTINUITY
1.  Every outbound Trinity email embeds unique SR reference in body
2.  Inbound reply: extraction checks both email body and subject line
3.  Reply with valid SR → routes to same trinityLiaison thread
4.  Reply without SR → new thread created, never appended randomly
5.  SR extraction returning null: log the event, create new thread,
    never silently drop or misroute the reply

======================================================================
XII. LAYER 6 — INVOICING, PAYMENT PORTAL, FEES, REVENUE, QUICKBOOKS
======================================================================

A. INVOICE LIFECYCLE
DRAFT → APPROVED → SENT → PAID → VOID
Each state transition is explicit, logged, and enforced.

B. GENERATION
1.  Only COMPLETED shifts generate billable line items
2.  rate × hours math verified explicitly — not just that a number exists
3.  No duplicate line items for the same shift
4.  Same shift cannot appear on two separate invoices (dedup guard)
5.  Manual line-item adjustments logged with adjustment reason
6.  Invoice always starts in DRAFT — never auto-sent

C. APPROVAL AND SEND
1.  NDS draft review notification with amount, client name, due date
2.  Org owner must explicitly approve: DRAFT → APPROVED
    Approver identity and timestamp logged
3.  After SENT: invoice is content-write-protected at API and service
    layer. Allowed post-SENT actions are limited to:
    - Payment completion path
    - Void/credit memo path
    - Audit-safe billing sync handlers
    No line items, rates, or client binding may be edited after SENT.
4.  Client receives signed tamper-proof payment portal link via email

D. PAYMENT PORTAL SECURITY
1.  Link token contains invoice_id, workspace_id, expiration — signed
2.  Tamper test: modify invoice_id in token → must return error,
    not expose the modified invoice or any other invoice
3.  Expired token rejected cleanly with clear message
4.  Portal never exposes data from another invoice or workspace

E. FINANCIAL RECORDING — ATOMIC
On every invoice payment all required layers commit in one transaction:
- invoice.status = PAID + paid_at timestamp
- financial_processing_fees record (2.9% + $0.25)
- platform_revenue record
- audit record for the PAID transition
Chaos test: kill DB connection mid-transaction → confirm full rollback,
no partial state, no orphaned audit gap.

F. IMMUTABILITY
1.  PAID invoices: write-protected at API and service layer both
2.  VOID: credit memo record created, original invoice never deleted
3.  Webhook replay: does NOT double-mark invoice as PAID

G. QUICKBOOKS
1.  OAuth token refresh proactive — not reactive on 401
2.  Refresh failure: integration flagged disconnected, owner notified
3.  Sync fires on invoice APPROVED, PAID, and VOID
4.  recordQbSyncFee fires after every CDC poll and initial sync
5.  QB API failure never blocks internal platform state changes
6.  Sync conflict resolution strategy is deterministic

======================================================================
XIII. LAYER 7 — PAYROLL, PLAID, PERIOD LOCKS, TIMEZONE INTEGRITY
======================================================================

A. PAYROLL LIFECYCLE
period_open → hours_submitted → rate_applied → period_closed →
payment_initiated → payment_confirmed / payment_failed
Every event logged: actor_id, workspace_id, timestamp, before/after.

B. HOURS AND OVERTIME
1.  COMPLETED shifts only — no drafts, no open shifts
2.  Overtime threshold is configurable per workspace — not hardcoded
3.  Overtime multiplier applied correctly
4.  Midnight-crossing shifts computed correctly in workspace timezone
5.  UTC storage with timezone-aware boundary logic throughout

C. PERIOD LOCK
1.  24-hour deadline nudge fires exactly once per period — idempotent
2.  Nudge routes to org owner's REGISTERED email, not tenant system alias
3.  period_closed status = immutable at SERVICE layer (not just route)
4.  Internal service or background worker bypass attempt → rejected
5.  No backdating of hours, rates, or shifts after period approval

D. PLAID SAFETY
1.  Bank account verification mandatory before first ACH transfer
2.  Unverified bank account = PAYMENT_HELD status (not failed, not dropped)
3.  PLAID_WEBHOOK_SECRET signature verified on every inbound webhook
    [BRYAN ACTION REQUIRED] Flag if PLAID_WEBHOOK_SECRET missing
4.  ACH transfer issued per employee — not a single opaque batch
5.  Each employee transfer result logged individually

E. FAILURE CLASSIFICATION
1.  Transient ACH failures (R01-type): retry after policy delay
2.  Permanent failures (R02, R03): flagged for manual resolution
3.  Org owner NDS alert on any transfer failure immediately
4.  Employee NDS notification when payment is held or delayed
5.  Successful deposit: employee receives NDS confirmation

======================================================================
XIV. LAYER 8 — TRINITY BRAIN, ACTION HUB, EMAIL, VOICE, HELPAI
======================================================================

A. ACTION REGISTRY INTEGRITY
1.  Total registered actions: below 300
2.  Every action has all required fields:
    name, description, required_role, input_schema, output_schema
3.  No malformed or incomplete registrations
4.  No deprecated actions still registered
5.  All 20 confirmed actions present in boot logs

B. 7-STEP PIPELINE INTEGRITY — ENFORCED ON EVERY ACTION
Trigger → Fetch → Validate → Process → Mutate → Confirm → Notify
1.  RBAC gate fires BEFORE Fetch — data never loaded before auth check
2.  MUTATE never runs if VALIDATE fails
3.  CONFIRM writes audit record before NOTIFY fires
4.  NOTIFY always routes through NDS
5.  AI credit availability checked BEFORE execution — not after fetch
6.  Transient failures retry: max 3 attempts, exponential backoff
7.  Permanent failures do not retry — logged and surfaced to manager
8.  Rollback exists for MUTATE failures — DB writes are atomic

C. TRINITY ACTION FUNCTIONAL VERIFICATION
Boot log presence is not sufficient. Actually invoke each action
against ACME data and verify correct execution:

INSURANCE DOMAIN:
- insurance.status → returns active policies with status and days remaining
- insurance.expiry → returns policies expiring within 60 days
- insurance.state_compliance → returns gap analysis vs required policy types

GATE DUTY DOMAIN:
- gate.current_occupancy → returns today's vehicle and personnel counts
- gate.flagged_vehicles → returns flagged vehicles with reason and timestamps

RECOGNITION DOMAIN:
- recognition.suggest → returns upcoming anniversaries and pending nominations
- recognition.summary → returns recent awards and pending nomination count

For each action PASS = executes without error, returns structured data,
RBAC fires before fetch, workspace_id scoped in all queries, AI credit
deducted correctly. Fix any action that fails.

D. GEMINI FILESYSTEM ACCESS — ZERO TOLERANCE
Scan every Trinity action for Gemini invocations with file path arguments.
Any such call: process kill + security log + NDS alert to platform admin.
Confirm zero such calls exist in the codebase.

E. TRINITY TRIAD FAILOVER
1.  Gemini timeout → OpenAI handles, Claude validates, request completes
2.  OpenAI also fails → Claude handles with safety constraints
3.  All three fail → Safe Mode activates:
    - Read-only operations only
    - No mutations executed under any circumstances
    - Workspace manager notified via NDS
    - No silent drop of the original request
4.  Fallback rate is logged and observable in metrics

F. TRINITY CONFLICT QUEUE
1.  TRINITY_CONFLICT_QUEUE exists and accepts failed consensus items
2.  Queue items include: workspace_id, action_type, context, failed_at,
    conflict_reason
3.  Resolution path exists: items surface to workspace manager via NDS
4.  Queue depth is observable — platform admin alert if depth grows
5.  Platform admin can inspect, retry, and resolve queue items

G. TRINITY EMAIL CLASSIFICATION — ALL 6 ADDRESSES
Test each inbound address type with realistic email input:
- billing@ → billing_inquiry → routes to Billing folder
- calloffs@ → call_off → routes to Call-Offs folder
- staffing@ → staffing_request → routes to Staffing folder
- incidents@ → incident_report → routes to Incidents folder
- support@ → support_inquiry → routes to Support folder
- docs@ → document intake → routes to Documents folder
All 6 must classify correctly and route to the correct folder.

H. TRINITY MARKETING REPLY PROCESSOR
1.  trinityMarketingReplyProcessor.ts is wired for trinity@coaileague.com
2.  Inbound to trinity@ NEVER invokes tenant TrinityEmailProcessor
3.  REGULATORY lane: .gov domain or keywords including audit, compliance,
    regulatory, PSB, inspection, licensing board, enforcement, DPS
    → response links to coaileague.com/regulatory
4.  PROSPECT lane: company domain, keywords including pricing, trial,
    interested, demo, sign up, how much, features
    → response links to coaileague.com/trial
5.  FALLBACK: one clarifying question sent — not a loop
6.  Regulatory contact replies route to platform owner, not Trinity

I. TRINITY VOICE
1.  Universal toll-free number active and routing to Trinity Voice
2.  Phone number lookup workspace-scoped against employees and clients
3.  Matched caller: greeted by name, workspace context loaded
4.  Unmatched caller: verbal verification flow triggered
5.  Verification fails after N attempts: handoff or clean disconnect
6.  No caller can override workspace context by naming a company
7.  workspace_id resolved from verified caller identity only
8.  Every call creates audit record: caller_id, workspace_id, call_sid,
    duration, intent_classified, actions_taken, timestamp
9.  Human handoff triggers: 3 failed understanding attempts, explicit
    human request, or issue classified as requiring human judgment
10. No silent drop when handoff is unavailable — message or callback

J. HELPAI
1.  Platform-layer HelpAI: zero access to any tenant data
2.  Workspace-layer HelpAI: reads only current workspace's data
3.  Escalation triggers: 2 failed resolution attempts, explicit human
    request, billing dispute, account deletion, or legal matter
4.  On escalation: support ticket created AND user acknowledgment sent

K. VELOCITY AND TOKEN DDOS GUARD
1.  Workspace-level rate limiting on all AI triggers
2.  Burst loads queue instead of stampeding model APIs
3.  AI credit ledger remains accurate under concurrent burst load
4.  No double-burn of credits under concurrency

L. CLASSIFICATION ACCURACY
Test 100 representative inputs across email and support categories.
Target: greater than 98% correct classification.
Find and fix any misclassification path.

======================================================================
XV. LAYER 9 — NDS, EMAILHUBCANVAS, COMMUNICATION INFRASTRUCTURE
======================================================================

A. NDS ENFORCEMENT
1.  Sole notification sender except 4 approved auth bypasses
2.  Unique notification_id dedup check before every send
3.  Opt-out status checked before every send
4.  Hard bounce: suppress address, no further sends ever
5.  Soft bounce: retry max 3 times, then treat as hard bounce
6.  Spam complaint: immediate unsubscribe + logged
7.  CAN-SPAM enforced on all marketing paths:
    - List-Unsubscribe header present
    - Unsubscribe link in email body
    - Physical mailing address in footer
    - Sender identity clearly stated
8.  Transactional emails bypass opt-out as legally appropriate

B. CHANNEL ROUTING
1.  Preferred channel routing works per notification type
2.  Fallback channel activates automatically on primary failure
3.  Failure queues correctly in DLQ without losing the notification

C. EMAILHUBCANVAS
1.  Folder routing correct for all 6 inbound address types
2.  Threading: SR reference number first, then Message-ID/In-Reply-To
3.  Reply with valid SR → appended to same thread
4.  Reply without SR → new thread created, never randomly appended
5.  Read state persists to DB and syncs in real-time across sessions
6.  Bulk archive: sets archived_at, excludes from default view
7.  Delete: soft-delete only (deleted_at), never hard delete
8.  Move: action logged with user_id and timestamp

D. AUTOMATED EMAIL SENDER IDENTITY
1.  All automated replies send FROM noreply@coaileague.com
2.  Tenant address (e.g. billing@acme.coaileague.com) used as
    display sender and Reply-To header
3.  trinity@coaileague.com reserved for outbound marketing only
4.  trinity@ is NEVER used as a tenant notification sender address

======================================================================
XVI. LAYER 10 — DOCUMENTS, VAULT, SIGNING, FORMS, REGULATORY EXPORT
======================================================================

A. DOCUMENT VAULT
1.  File type validation enforced server-side
2.  25MB per-file maximum enforced server-side (not just client-side)
3.  Storage path includes workspace_id for isolation
4.  Signed documents are write-protected after signing completes
5.  Soft delete only — deleted_at timestamp, no hard deletes

B. E-SIGNATURE ENGINE
1.  Request creates: document_id, signer_email, workspace_id, token,
    expires_at
2.  Signing link expires after 7 days
3.  Completion: status = SIGNED, new version stored, owner notified
4.  Completion handler is idempotent (replay-safe)
5.  New document versions cannot be created after signing

C. I9 AND COMPLIANCE
1.  Required document types are recognized correctly
2.  Incomplete I9 triggers compliance NDS alert to org owner
3.  Compliance state is auditable per officer

D. REGULATORY EXPORT
1.  Restricted to Org Owner and Admin roles only
2.  Date range, entity type, and actor filters function correctly
3.  Export action is logged in the audit trail
4.  Export output is structured (CSV or JSON — not raw DB dump)

E. ONLINE FORMS ENGINE
1.  Field schema stored correctly as JSON
2.  UPDATE operation creates new version — never overwrites active form
3.  Server-side validation runs before any save
4.  Submissions are atomic — partial saves impossible
5.  Public form URL resolves workspace from slug server-side only

F. DOCS@ EMAIL INTAKE
1.  Email to docs@{slug} routes to the document intake handler
2.  Attachments extracted and stored as document records
3.  Trinity sends a confirmation reply to the sender
4.  Unrecognized sender: document stored with status NEEDS_REVIEW,
    not silently discarded

======================================================================
XVII. LAYER 11 — DATA INTEGRITY, STORAGE, DB CONSTRAINTS, AUDIT
======================================================================

A. FILE STORAGE
1.  All files stored in Google Cloud Storage — not Replit local disk
2.  Storage path includes workspace_id for tenant isolation
3.  Quota checked BEFORE any write — 507 returned on breach
4.  audit_reserve category is always allowed regardless of other limits
5.  recordStorageUsage() called after every successful upload
6.  Email category full: email record saved without attachment,
    attachment_rejected flag set, rejection logged clearly

B. STORAGE QUOTAS IN billingConfig.ts
Trial:        email 300MB  docs 800MB  media 800MB  audit_reserve 100MB
Starter:      email 3GB    docs 5GB    media 6GB    audit_reserve 1GB
Professional: email 12GB   docs 20GB   media 25GB   audit_reserve 3GB
Business:     email 35GB   docs 70GB   media 80GB   audit_reserve 15GB
Enterprise:   email 120GB  docs 220GB  media 230GB  audit_reserve 30GB
Strategic:    match Enterprise or custom — verify billingConfig defines it

C. STORAGE ALERTING — IDEMPOTENT
1.  NDS warning at 80% usage per category — fires once per threshold
2.  NDS critical alert at 95% — fires once per threshold
3.  Alerts do not repeat until usage drops below and re-crosses
4.  Storage usage per category visible in org settings dashboard

D. DATABASE INTEGRITY
1.  workspace_id present in WHERE clause on all tenant table queries
2.  Required FK constraints enforced on all major relationships
3.  Indexes on: workspace_id (all major tenant tables), employee_id
    (shifts), client_id (invoices), status (shifts, invoices),
    created_at (audit_logs)
4.  Soft delete everywhere — deleted_at on all entities supporting delete
5.  All SELECT queries filter WHERE deleted_at IS NULL by default where appropriate
6.  All migrations sequential, no gaps, no partial state

E. AUDIT TABLE INTEGRITY
1.  Append-only — no UPDATE endpoint anywhere for audit records
2.  No DELETE endpoint for audit records
3.  DB user does NOT have UPDATE or DELETE privilege on audit_log table
4.  API attempt to modify audit record returns 405

F. CROSS-TENANT LEAK TEST
1.  Use workspace_A session to query workspace_B data via REST API
2.  Result: 403 or 404 — never actual workspace_B data
3.  No metadata leak — response must not reveal whether workspace_B exists
4.  Repeat test via WebSocket subscription and via client portal
5.  Statewide workspace data unreachable from any test or sandbox session

G. COMPLIANCE WIPE AND LEGAL HOLD
1.  ORG_OWNER-only lawful PII purge path where required by law
2.  Financial ledger preserved even on purge — anonymization used
3.  Legal hold blocks all purge and destructive mutation attempts
4.  All purge attempts and hold activations logged in audit trail

H. TENANT CONTAMINATION VERIFICATION
ACME artifacts cannot reach Statewide or any real tenant through:
- Shared database queries (verify workspace_id scoping)
- Shared job queues (verify workspace_id on all queued jobs)
- Shared WebSocket rooms (verify room isolation)
- Shared caches (verify cache key includes workspace_id)
- Shared search indices (verify index scoping)
- Shared storage path prefixes (verify path includes workspace_id)
- Mis-scoped background jobs (verify every scheduled job is scoped)

======================================================================
XVIII. LAYER 12 — FEATURE TIER GATES
======================================================================

STARTER ($299):
Core scheduling, basic invoicing, call-off management, NDS notifications,
basic reporting, client portal, Trinity email

PROFESSIONAL ($999):
All Starter + ACH payroll, advanced scheduling, QuickBooks sync,
document vault, contract pipeline, RFP pipeline, financial intelligence,
BI analytics, Trinity Voice

BUSINESS ($2,999):
All Professional + multi-workspace management, advanced analytics,
regulatory export, bulk operations

ENTERPRISE ($7,999):
All Business + white-label branding, custom AI model routing,
enterprise automation rules

STRATEGIC (Custom):
All Enterprise plus custom limits — not subject to automated billing
enforcement. Must not accidentally inherit Enterprise plan caps.

Required verification for each tier boundary:
1.  Lower-tier workspace accessing higher-tier feature → 403 with
    descriptive upgrade message
2.  Gate enforced at API and service layer — not UI only
3.  Tier change from Stripe reflects immediately — zero cache delay
4.  Specific endpoint tests:
    - Starter → ACH endpoint: 403
    - Starter → Trinity Voice endpoint: 403
    - Starter → BI Analytics: 403
    - Professional → multi-workspace: 403
    - Professional → white-label: 403
    - Enterprise → white-label: 200
    - Strategic → all Enterprise features: 200

REPORT: Count of gates tested. Count that failed and were fixed.

======================================================================
XIX. LAYER 13 — SECURITY, SESSION HARDENING, PUBLIC ROUTES
======================================================================

A. SESSION SECURITY
1.  Session tokens SHA-256 hashed
2.  Cookies: httpOnly, secure, sameSite=strict on all auth cookies
3.  session.regenerate() fires on login
4.  session.regenerate() fires on workspace switch
5.  Password reset invalidates all active sessions for that user
6.  Admin-forced reset invalidates target user's active sessions

B. LOGIN DEFENSE
1.  5 failed attempts → 15-minute time-based lockout
2.  Lockout: structured warn log with userId, count, lockedUntil
3.  Release is time-based only (not credential-based — no bypass)
4.  Password reset also clears lockedUntil and loginAttempts counter

C. INPUT AND INJECTION DEFENSE
1.  SQLi defense on all user-supplied inputs
2.  XSS sanitization on all text inputs stored or rendered
3.  IDOR defense: all record access validated against session workspace
4.  Over-posting defense: schema validation rejects unknown fields
5.  Replay defense on critical mutation endpoints
6.  Webhook IP allowlist enforced for all provider webhooks

D. PUBLIC ROUTES
1.  /trial: accessible without auth, form submits correctly,
    workspace created, welcome email sent from trinity@coaileague.com
2.  /regulatory: accessible without auth, form submits correctly,
    regulatory_partnership lead created, platform owner notified via NDS,
    lead record persists even if the NDS notification itself fails
3.  Neither route exposes any tenant data or internal state in response
4.  SEO meta tags correct and derived from PLATFORM.name at runtime:
    /regulatory title resolves to: "Compliance Partnership | {PLATFORM.name}"
    /trial title resolves to: "Start Free Trial | {PLATFORM.name}"

======================================================================
XX. LAYER 14 — PERSONAL ADDRESS PROVISIONING AND STRATEGIC TIER
======================================================================

A. PERSONAL OFFICER EMAIL ADDRESSES
Officers can be provisioned a professional email address:
john.smith@{slug}.coaileague.com (on-demand, not part of base 6)

1.  Activation by Org Owner triggers:
    a. Resend address provisioned in email system
    b. Stripe $25/seat billing event created and attached
    c. Activation logged with timestamp and activating user identity
2.  Deactivation triggers:
    a. Resend address deprovisioned
    b. Stripe seat billing canceled
    c. Deactivation logged
3.  Personal address cannot receive email until explicitly activated
4.  Test in ACME: activate one personal address, confirm Stripe seat
    created, confirm email routing active. Deactivate, confirm seat
    released and address inactive.

B. STRATEGIC TIER VERIFICATION
1.  Strategic tier exists in billingConfig.ts with defined limits
2.  Strategic workspaces access all Enterprise features at minimum
3.  Strategic tier gate does not accidentally enforce Enterprise caps
4.  No automated billing, overage, downgrade, or trial enforcement
    runs against Strategic workspaces (custom-billed externally)

======================================================================
XXI. LAYER 15 — WRITE PATH AND BREAK-GLASS ENFORCEMENT
======================================================================

WRITE PATH ENFORCEMENT
All locked or final-state entities must reject mutation from every path:
- API routes
- Background workers and queue jobs
- Internal service-to-service calls
- Trinity action executions
- Admin tooling

Locked entities:
- Paid invoices (content and status)
- Closed payroll periods (hours, rates, linked shifts)
- Signed documents (content and signers)
- Audit log records (all fields)

BREAK-GLASS POLICY
Emergency override of a locked record requires:
- Authorized actor: platform admin only
- Written reason for the override
- request_id and actor_id captured
- Timestamp of the override
- Before/after audit record created
- One-time or explicitly time-boxed validity

Undocumented overrides must fail with a logged security alert.
No undocumented break-glass path may exist.

======================================================================
XXII. LAYER 16 — OBSERVABILITY, METRICS, ALERTS
======================================================================

A. REQUEST TELEMETRY — EVERY REQUEST
Emit: request_id, workspace_id (where applicable), actor_id (where
applicable), route/action, duration_ms, status, error context if any

B. METRICS TRACKED
- Error rate per service
- Queue backlog per worker
- DLQ count and age of oldest item
- Webhook processing latency
- NDS delivery latency and failure rate
- Trinity triad fallback rate
- AI model failure rate per model
- Cross-tenant violation attempts (should always be zero)
- Payment failure counts
- Storage threshold breaches per workspace

C. ALERT THRESHOLDS
- Error rate > 2%: alert
- DLQ > 10 jobs: alert
- DLQ item older than 4 hours: alert to support
- Trinity fallback rate > 30%: alert
- Webhook latency > 2s: alert
- Repeated auth failures from same IP: alert
- Any Class A failure: immediate alert

D. HEALTH SURFACE
Queryable health proof for:
API, DB, queue workers, NDS, billing system, payroll system,
Trinity (model availability, fallback rate), WebSocket layer

======================================================================
XXIII. LAYER 17 — SILENT FAILURES, RETRY, DLQ, RESILIENCE
======================================================================

A. EMPTY CATCH SWEEP — FULL CODEBASE
Search for all of:
catch (e) {}
catch (err) {}
catch (error) { return null }
catch (error) { return false }
catch (error) { return undefined }
.catch(() => {})
Replace every instance with structured error logging at minimum:
logger.error({ error, context: '[filename:functionName]', workspace_id })
REPORT: Count found. Count fixed. Confirm zero remain.

B. EXTERNAL API RETRY POLICY
For every call to Stripe, Plaid, Twilio, Gemini, OpenAI, Claude,
Resend, and QuickBooks:
1.  Wrapped in try/catch or .catch() — never empty
2.  Retry on transient failures (5xx, timeout, network error):
    max 3 attempts with exponential backoff
3.  No retry on 4xx except 429 (rate limit)
4.  Timeout configured on every external call

C. EXTERNAL SERVICE DEGRADED MODE
- Resend down: emails queued in DLQ, replayed on recovery, never lost
- Stripe down: webhook events queued, no duplicate writes on retry
- Plaid down: transfer marked PAYMENT_HELD, not silently dropped
- Twilio down: NDS SMS fallback fires, voice failure logged and manager
  alerted via NDS
- All AI providers down: Safe Mode — read-only, no mutations, NDS alert
- DB disconnect mid-transaction: full rollback, no partial write, no
  orphaned audit gap
- Cache outage: does not break tenant isolation or auth correctness

D. DEAD-LETTER QUEUE
1.  DLQ exists for all async workers
2.  Jobs failing after max retries land in DLQ — never silently dropped
3.  DLQ items include: job_type, payload, error, workspace_id, failed_at
4.  DLQ depth monitored — alert fires at >10 items
5.  DLQ items are inspectable and retryable by platform admin

E. REACT ERROR BOUNDARIES
1.  Top-level app boundary wraps everything
2.  Boundaries on each major section: dashboard, scheduling canvas,
    email hub canvas, Trinity chat interface
3.  Each boundary renders a recovery UI — never a blank screen
4.  Boundary-caught errors are logged to the server error log

F. API ERROR STANDARDIZATION
All errors return: { error: { code: string, message: string } }
Stack traces: never in production responses
DB error messages: never passed to the client
500 errors: logged server-side with full detail, generic to client

======================================================================
XXIV. LAYER 18 — STATEWIDE PRODUCTION READINESS VERIFICATION
======================================================================

READ-ONLY LAYER — ZERO MUTATIONS TO STATEWIDE UNDER ANY CIRCUMSTANCES.

Statewide Protective Services is going live as the first real tenant.
Verify the following using read-only queries only:

1.  Workspace record exists with the correct production slug
2.  Tier = highest available (grandfathered), no expiration date, no
    billing enforcement flag
3.  Grandfathered exemption is explicit and auditable in code — not
    merely absent from billing job lists
4.  Billing automation, trial expiry logic, failed-payment lockout,
    and downgrade enforcement all contain explicit Statewide exemption
    logic in code — verified directly, not inferred from behavior
5.  Exactly 6 base email addresses provisioned at Statewide slug
6.  All 8 EmailHubCanvas folders initialized
7.  Org owner account exists with role = ORG_OWNER and MFA-ready state
8.  Zero ACME artifacts in any Statewide table:
    employees, shifts, invoices, clients, incidents, call_offs,
    email_threads, payroll_records, documents
9.  Storage quota set to appropriate tier level for the workspace
10. Webhook slug resolves correctly to Statewide workspace

Report each as CONFIRMED or ISSUE with detail.
Fix any code issue found. No write operations to Statewide ever.

======================================================================
XXV. LAYER 19 — CHAOS ENGINE AND FAILURE INJECTION
======================================================================

Inject and verify all of the following:

1.  Gemini timeout → OpenAI handles, Claude validates, request completes
2.  OpenAI timeout after Gemini failure → Claude handles with safety
3.  All AI providers unavailable → Safe Mode activates, no unsafe
    mutations, manager notified via NDS, no silent drop
4.  Stripe 5xx on webhook → queue event, retry with backoff, no
    duplicate financial writes, no lost billing state
5.  NDS outage → messages queued in DLQ, replayed on recovery, no loss
6.  DB disconnect mid-transaction → full rollback, no partial write,
    no orphaned audit gap
7.  WebSocket cross-tenant injection attempt → connection terminated,
    security event logged, NDS alert sent, no foreign data delivered
8.  Duplicate Stripe webhook replay → 200 OK, no duplicate processing
9.  Provider 429 rate limit → retry policy honored, no busy-loop,
    no silent loss
10. Large file upload over 25MB → rejected cleanly, clear error,
    no worker stall, no token overflow
11. QuickBooks API failure → internal state unchanged, failure logged,
    org owner notified via NDS
12. Plaid transient failure → status = PAYMENT_HELD, retry scheduled
13. Plaid permanent failure (R02/R03) → surfaced for manual resolution,
    org owner and employee notified via NDS

======================================================================
XXVI. FINAL BATTLE SIMULATION — ACME SECURITY (32 STEPS)
======================================================================

SANDBOX RESET PROTOCOL:
If any simulation step fails and requires a code fix, you MUST:
1. Fix the code
2. Completely wipe the ACME workspace and all associated records:
   simulated data, queued jobs, notifications, mock financial artifacts,
   temporary documents, and test-linked records
3. Restart the simulation from Step 1 on clean state
Never continue a simulation against dirty, partially mutated, or
replayed state.

Execute every step. Any failure = NOT GO.
Report each step as PASS or FAIL with exact error detail.

1.  SIGNUP
    Create ACME workspace via /trial flow

2.  PROVISION
    Verify: correct slug, exactly 6 base email addresses at {slug} subdomain,
    exactly 8 Canvas folders initialized

3.  ONBOARD
    Complete wizard as Org Owner
    Verify RBAC blocks Manager role from completing wizard steps

4.  CLIENT PORTAL ISOLATION
    Create two client accounts in ACME
    Verify each sees only their own invoices, sites, shift history,
    and payment records — zero bleed between clients in same workspace

5.  SUBSCRIBE
    Activate Professional plan
    Verify workspace.tier = professional immediately
    Verify Professional feature gates unlock (hit endpoints, confirm 200)

6.  FEATURE CHECK
    QuickBooks sync and Trinity Voice endpoints return 200
    Starter-gated endpoint returns 403 from this Professional workspace

7.  OFFICER CREATION WITH LICENSE STATES
    Create John Doe with license expiring yesterday
    Attempt shift assignment → must block with clear expired license error
    Update license to valid date 8 months from today
    Assignment succeeds
    Verify expiry NDS alert scheduled 30 days before new expiry date
    Verify officer_activated event published to event bus

8.  AVAILABILITY WINDOW TEST
    Set John Doe availability: Monday–Friday only
    Attempt to assign John to a Saturday shift
    Must block with clear availability conflict error
    Remove the availability restriction before continuing

9.  CLIENT AND SITE SETUP
    Create client: San Antonio Hub
    Add site linked to San Antonio Hub

10. NO-CONTRACT SCHEDULING BLOCK
    Attempt to create a shift for the site without a contract
    Must block with clear no-active-contract error

11. CONTRACT AND SIGNATURE
    Upload and sign a contract for San Antonio Hub via e-signature engine
    Verify contract status = SIGNED, site is now schedulable

12. STAFFING EMAIL INTAKE
    Send email to staffing@acme.coaileague.com
    Verify CRM lead record created
    Verify org owner receives NDS alert with lead details

13. SHIFT CREATION
    Create shift: San Antonio Hub, next Monday 0800–1600

14. SHIFT ASSIGNMENT
    Assign John Doe to the shift
    Verify scheduling_audit_log entry written with before/after state

15. DOUBLE-BOOKING BLOCK
    Attempt to assign John to a second overlapping shift (same Monday)
    Must block with clear conflict error
    Verify NO audit record created for the blocked attempt
    Verify original shift remains ASSIGNED

16. CONCURRENT ASSIGNMENT RACE
    Simulate two simultaneous assignment attempts for the same OPEN shift
    Verify exactly one succeeds, exactly one fails
    Verify exactly one audit record exists for the successful assignment

17. SCHEDULE PUBLISH AND BROADCAST
    Publish the schedule
    Verify NDS fires to John with correct date, time, site, position
    Verify WebSocket broadcast is workspace-scoped only
    Verify Statewide session receives zero ACME broadcast events

18. SHIFT START WITH GEO-FENCE VIOLATION
    Start shift with GPS coordinates 5 miles outside San Antonio Hub
    Verify shift starts successfully (not blocked)
    Verify Out-of-Bounds entry written to scheduling_audit_log
    Verify manager NDS alert fires immediately

19. CALL-OFF WITH DEGRADED INPUT
    Send email to calloffs@acme.coaileague.com: "cant mak it tmrw"
    Verify classified as CALL_OFF (not support or staffing)
    Verify officer_id resolved to John Doe
    Verify shift_id resolved to Monday's shift
    Verify call_off record created with source = email
    Verify coverage engine triggers automatically
    Verify manager NDS alert fires with full context
    Verify John receives confirmation reply from calloffs@{slug}

20. COVERAGE RESOLUTION
    Verify alternate qualified officer found
    Verify outreach sent (Trinity Voice first, SMS NDS fallback)
    Verify first confirmation wins reassignment
    Verify manager receives NDS update on coverage resolution

21. SHIFT COMPLETION
    Mark covered shift as COMPLETED
    Verify scheduling_audit_log entry written

22. INVOICE GENERATION
    Generate invoice from the COMPLETED shift
    Verify rate × hours math is correct (state the explicit calculation)
    Verify no duplicate line items
    Verify same shift cannot appear on a second invoice (attempt it)
    Verify org owner receives NDS notification with amount, client, due date

23. INVOICE APPROVAL
    Approve the invoice as Org Owner
    Verify status = APPROVED, approver identity and timestamp logged

24. INVOICE SEND AND TAMPER TEST
    Send the invoice to client
    Verify client receives email with signed payment portal link
    Tamper test: modify invoice_id in the token
    Verify portal returns error — not the invoice and not a foreign invoice
    Attempt to edit invoice line items after SENT via API
    Verify 403 or 409 returned — content write-protected

25. CLIENT PAYMENT AND ATOMIC FINANCIAL RECORDING
    Client pays via payment portal
    Verify invoice status = PAID
    Verify all three financial layers committed in ONE transaction:
      - invoice.status = PAID + paid_at
      - financial_processing_fees record (2.9% + $0.25)
      - platform_revenue record
      - audit record for PAID transition
    Verify QB sync fires

26. WEBHOOK REPLAY IDEMPOTENCY
    Replay the exact payment webhook event
    Verify 200 OK returned
    Verify no double PAID status, no duplicate fee records

27. PAYROLL PERIOD AND LOCK
    Open payroll period for the week
    Import John Doe's hours from the COMPLETED shift
    Verify math explicitly (hours × rate = gross)
    Close the payroll period
    Verify write-protection activates at service layer
    Attempt to modify a closed period via internal service call
    Verify rejection
    Verify ACH queued per employee
    Verify PAYMENT_HELD if bank account unverified

28. STORAGE QUOTA ENFORCEMENT
    Upload a 10MB file — verify storage_usage record updated correctly
    Set email category to 99% manually in storage_usage
    Attempt another upload to email category
    Verify 507 returned cleanly
    Verify audit_reserve category still accepts upload at 99%

29. TIER GATE ENFORCEMENT
    Attempt to access Enterprise white-label feature from Professional
    Verify 403 with descriptive upgrade message

30. CROSS-TENANT LEAK TEST
    Use ACME session to request Statewide data via REST
    Verify 403 or 404 — zero metadata leak
    Verify response does not confirm Statewide's existence

31. TRINITY FAILOVER
    Simulate Gemini timeout during an action
    Verify OpenAI handles the request
    Verify Claude validates the output
    Verify action completes or degrades safely — no silent failure

32. AUDIT COMPLETENESS CHECK
    Verify every financial and scheduling state change in steps 1–31
    has a corresponding audit record
    No orphaned mutations
    No unlogged state transitions
    No missing financial layer records

======================================================================
XXVII. FINAL REPORT
======================================================================

Deliver one final report only when all layers and the simulation are
complete. Do not deliver a partial report.

1. REGRESSION STATUS
   All 25 prior session fixes — PASS or fixed and re-verified

2. LAYER RESULTS
   Issues found and fixed per layer with severity classification

3. SIMULATION RESULTS
   All 32 battle steps — PASS or FAIL with exact detail on each

4. SWEEP RESULTS
   Silent catches:               N found, N fixed, 0 remaining
   Unhandled external promises:  N found, N fixed, 0 remaining
   Unscoped DB queries:          N found, N fixed, N reviewed exceptions
   Trinity registry integrity:   N found, N fixed, 0 remaining
   Mutating route RBAC/tier:     N found, N fixed, 0 remaining
   NDS sole-sender violations:   N found, N fixed, N approved exceptions
   Financial atomicity:          N found, N fixed, 0 remaining
   White-label violations:       N found, N fixed, N remaining (list locations)

5. CLASS A FAILURES
   Any found, how resolved, or exact reason still open

6. CHAOS RESULTS
   What was injected, what recovered automatically, what needed code fixes

7. STATEWIDE READINESS
   All 10 read-only checks — CONFIRMED or ISSUE with detail

8. [BRYAN ACTION REQUIRED] — Complete physical prerequisites:
   - Stripe live keys (sk_live_) and live webhook secret
   - Plaid production keys and PLAID_WEBHOOK_SECRET
   - Twilio toll-free number verification
   - DNS: DMARC p=quarantine or reject, DKIM 2048-bit, MX records
   - Resend domain verification: coaileague.com and *.coaileague.com
   - Production session signing secret differs from dev
   - NODE_ENV=production set before republishing

9. CLEAN BOOT CONFIRMATION
   App boots clean — zero errors
   All queue workers boot and register handlers
   All migrations clean — no partial state

10. OMEGA_STATE_CHECKPOINT.md
    Final checkpoint state recorded

11. CANARY CLEANUP
    Upon earning a GO verdict, provide the exact steps required to:
    - Soft-delete or archive the ACME simulated tenant safely
    - Void any ACME test subscription artifacts in Stripe
    - Cancel any queued or pending ACME payroll artifacts in Plaid
    - Remove ACME test email addresses from Resend
    - Clear any ACME-related queue jobs still pending
    - Confirm the production DB ledger is in pristine state
    - Confirm Statewide is untouched throughout this process
    Include exact SQL statements, admin-route steps, and provider
    cleanup actions. Do not execute — provide for Bryan to review first.

12. PRODUCTION VERDICT
    GO only if all of the following are true:
    - Zero unresolved Critical severity issues
    - Zero Class A failures
    - All 32 battle simulation steps PASS
    - All chaos injection tests pass
    - All financial atomicity and idempotency checks pass
    - All cross-tenant isolation checks pass
    - All 25 prior session fixes confirmed intact
    - Statewide read-only verification shows all CONFIRMED

    Otherwise: NOT GO
    If NOT GO: list the exact blocking items only. Nothing else.

WORK UNTIL THE PLATFORM EARNS GO.

If you want a shorter “agent-optimized” version after this, I can condense it into a tighter execution prompt while preserving the same guardrails.