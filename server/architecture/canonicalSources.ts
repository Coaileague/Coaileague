/**
 * CANONICAL DATA SOURCES — SINGLE SOURCE OF TRUTH REGISTRY
 * ==========================================================
 * Every piece of platform data has exactly ONE authoritative source.
 * All components, hooks, and services MUST consume data from the
 * canonical source listed here. Never create a competing endpoint
 * for data that already has an owner.
 *
 * Violation = a patch that will break again.
 * Enforcement = code review + this file.
 */

export const CANONICAL_SOURCES = {

  // ─── CREDITS & BILLING ────────────────────────────────────────────────────
  credits: {
    balance:       'GET /api/credits/balance',         // creditRoutes.ts — authoritative balance + creditsUsed
    usageBreakdown:'GET /api/credits/usage-breakdown', // creditRoutes.ts — per-feature usage ledger
    transactions:  'GET /api/credits/transactions',    // creditRoutes.ts — full audit trail
    packs:         'GET /api/credits/packs',           // creditRoutes.ts — available purchase packs
    // NOTE: /api/billing/credits* and /api/billing/subscription.credits are
    // derived views for the billing UI only. They MUST NOT be used by widgets,
    // dashboard cards, or any component that displays a credit number to the user.
    service:       'server/services/billing/creditManager.ts',
  },

  // ─── SUBSCRIPTIONS ────────────────────────────────────────────────────────
  subscription: {
    status:        'GET /api/billing/subscription',    // billing-api.ts
    service:       'server/services/billing/orgBillingService.ts',
  },

  // ─── SHIFTS / SCHEDULE ────────────────────────────────────────────────────
  shifts: {
    list:          'GET /api/shifts',                  // shiftRoutes.ts — primary source for all shift data
    single:        'GET /api/shifts/:id',
    create:        'POST /api/shifts',
    duplicateShift:'POST /api/scheduling/shifts/:shiftId/duplicate', // advancedSchedulingRoutes.ts ONLY
    duplicateWeek: 'POST /api/scheduling/duplicate-week',            // advancedSchedulingRoutes.ts ONLY
    // schedulingInlineRoutes.ts no longer registers /duplicate-week or /shifts/:shiftId/duplicate
    service:       'server/routes/advancedSchedulingRoutes.ts',
  },

  // ─── PAYROLL ──────────────────────────────────────────────────────────────
  payroll: {
    runs:          'GET /api/payroll/runs',             // payrollRoutes.ts
    singleRun:     'GET /api/payroll/runs/:id',
    myPaychecks:   'GET /api/payroll/my-paychecks',    // payrollRoutes.ts — employee self-service
    // /api/worker-earnings = real-time current-period widget (NOT finalized payroll)
    // /api/pay-stubs = formal PDF records (NOT raw payroll entries)
    service:       'server/routes/payrollRoutes.ts',
  },

  // ─── EARNINGS WIDGET (current period, not finalized payroll) ──────────────
  earningsWidget: {
    currentPeriod: 'GET /api/worker-earnings',          // dashboardRoutes.ts — live hours × rate
    service:       'server/routes/dashboardRoutes.ts',
  },

  // ─── EMPLOYEES ────────────────────────────────────────────────────────────
  employees: {
    list:          'GET /api/employees',                // employeeRoutes.ts
    single:        'GET /api/employees/:id',
    service:       'server/routes/employeeRoutes.ts',
  },

  // ─── USERS / AUTH ─────────────────────────────────────────────────────────
  auth: {
    me:            'GET /api/auth/me',                  // auth.ts
    session:       'GET /api/auth/session',
    workspaceMembers: 'GET /api/workspace/members',
    service:       'server/auth.ts',
  },

  // ─── WORKSPACES ───────────────────────────────────────────────────────────
  workspaces: {
    current:       'GET /api/workspace',                // workspaceRoutes.ts
    list:          'GET /api/workspaces',
    service:       'server/routes/workspaceRoutes.ts',
  },

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────
  notifications: {
    combined:      'GET /api/notifications/combined',   // notificationRoutes.ts — primary feed
    unreadCount:   'WebSocket notifications_subscribed.unreadCount',
    // NOTE: All notification writes go through server/services/notificationService.ts only
    service:       'server/services/notificationService.ts',
  },

  // ─── INCIDENTS ────────────────────────────────────────────────────────────
  incidents: {
    list:          'GET /api/incident-reports',         // incidentRoutes.ts
    single:        'GET /api/incident-reports/:id',
    service:       'server/routes/incidentRoutes.ts',
  },

  // ─── TIME ENTRIES ─────────────────────────────────────────────────────────
  timeEntries: {
    list:          'GET /api/time-entries',             // timeTrackingRoutes.ts
    active:        'GET /api/time-entries/active',
    service:       'server/routes/timeTrackingRoutes.ts',
  },

  // ─── CLIENTS ──────────────────────────────────────────────────────────────
  clients: {
    list:          'GET /api/clients',                  // clientRoutes.ts
    single:        'GET /api/clients/:id',
    service:       'server/routes/clientRoutes.ts',
  },

  // ─── INVOICES ─────────────────────────────────────────────────────────────
  invoices: {
    list:          'GET /api/invoices',                 // invoiceRoutes.ts
    single:        'GET /api/invoices/:id',
    create:        'POST /api/invoices',
    update:        'PATCH /api/invoices/:id',
    cancel:        'DELETE /api/invoices/:id/cancel',
    markPaid:      'POST /api/invoices/:id/mark-paid',
    partialPay:    'POST /api/invoices/:id/payment',
    // NOTE: All invoice mutations must emit to platformEventBus in addition to broadcastToWorkspace.
    // platformEventBus events: invoice_created, invoice_paid, invoice_voided, invoice_cancelled,
    //   invoice_sent, payment_received_partial, invoice_overdue
    // BILLING AUTOMATION PATH: billingAutomation.ts also emits invoice_created for nightly
    //   batch-generated invoices (generateUsageBasedInvoices, generateInvoiceForClient).
    //   These bypass invoiceRoutes.ts but must still reach Trinity via .publish().
    service:       'server/routes/invoiceRoutes.ts',
    automationService: 'server/services/billingAutomation.ts',
  },

  // ─── FINANCIAL EVENTS (canonical platformEventBus event types) ────────────
  financialEvents: {
    // Every financial mutation emits BOTH:
    //   A. broadcastToWorkspace() — real-time WebSocket to frontend
    //   B. platformEventBus.publish() — Trinity + automation subscriber system
    // DUAL-EMIT LAW: Every financial mutation emits BOTH broadcastToWorkspace (WebSocket) AND
    // platformEventBus.publish() (Trinity + automation subscriber system).
    // NEVER use raw .emit(eventName, data) for financial events — always .publish({type, ...}).
    // NEVER call .emit(object) — EventEmitter treats object as event name → silently dropped.
    eventTypes: [
      // Invoice lifecycle
      'invoice_created', 'invoice_sent', 'invoice_paid', 'invoice_voided',
      'invoice_cancelled', 'invoice_overdue', 'payment_received_partial',
      // Payroll lifecycle
      'payroll_run_created', 'payroll_run_approved', 'payroll_run_processed',
      'payroll_run_paid', 'payroll_run_voided',
      // Stripe / external payment
      'stripe_payment_received',
    ],
    // ─── EMITTERS (all routes + services that publish financial events) ──────
    // invoiceRoutes.ts:
    //   create → invoice_created | auto-generate → invoice_created | send → invoice_sent
    //   mark-paid → invoice_paid | partial-payment → payment_received_partial
    //   delete/cancel → invoice_cancelled | credit-memo → invoice_voided
    //   proposal-approve → invoice_created | proposal-reject → invoice_cancelled
    // billingAutomation.ts (nightly automation path, bypasses routes):
    //   generateUsageBasedInvoices → invoice_created (per client, batch)
    //   generateInvoiceForClient → invoice_created (per client, on-demand)
    //   sendPaymentReminder → invoice_overdue (all milestone reminders)
    // payrollRoutes.ts:
    //   create-run → payroll_run_created | approve → payroll_run_approved
    //   process → payroll_run_processed | mark-paid → payroll_run_paid
    //   void → payroll_run_voided | proposal-approve → payroll_run_approved
    // billing/stripeWebhooks.ts:
    //   invoice.payment_succeeded → stripe_payment_received + invoice_paid
    // billing/invoice.ts:
    //   recordPartialPayment → invoice_paid | payment_received_partial (based on fullyPaid)
    // orchestratedBusinessOps.ts:
    //   approvePayroll → payroll_run_approved (with DB-resolved workspaceId)
    // ─── SUBSCRIBERS ────────────────────────────────────────────────────────
    // trinityEventSubscriptions.ts: TrinityInvoicePaidHandler, TrinityInvoiceOverdueHandler,
    //   TrinityPayrollRunPaidHandler, TrinityStripePaymentHandler, TrinityInvoiceSentQBPush,
    //   TrinityPayrollApprovalWatcher, TrinityPayrollProcessedWatcher,
    //   TrinityPartialPaymentWatcher, TrinityInvoiceCreatedWatcher,
    //   TrinityPayrollRunCreatedWatcher, TrinityPayrollRunVoidedWatcher
    // automationTriggerService.ts: AutomationTrigger-InvoicePaid, AutomationTrigger-PayrollRunPaid,
    //   AutomationTrigger-InvoiceOverdue, AutomationTrigger-GateApproved (payroll/schedule gates)
    service: 'server/services/platformEventBus.ts',
    subscribers: 'server/services/trinityEventSubscriptions.ts',
    triggerService: 'server/services/orchestration/automationTriggerService.ts',
  },

  // ─── SECOND-WAVE EVENT TYPES (added March 16, 2026 — full audit) ──────────
  secondWaveEventTypes: {
    // These event types were added during the second-wave platform audit.
    // All were previously broken (emit({}) object-as-name pattern) — now canonical .publish().
    scheduling: [
      'scheduling_session_complete',  // trinitySchedulingOrchestrator.ts — AI schedule session done
    ],
    automation: [
      'automation_execution_completed',   // automationExecutionTracker.ts
      'automation_execution_failed',      // automationExecutionTracker.ts
      'automation_pending_verification',  // automationExecutionTracker.ts — human review gate
      'automation_execution_verified',    // automationExecutionTracker.ts
      'automation_execution_rejected',    // automationExecutionTracker.ts
    ],
    quickbooks: [
      'quickbooks_operation_completed',   // quickbooksOrchestration.ts
      'quickbooks_operation_failed',      // quickbooksOrchestration.ts
    ],
    documentPipeline: [
      'document_completed',   // documentPipeline.ts step 6 delivery
      'approval_requested',   // documentPipeline.ts requestApproval gate
    ],
    auth: [
      'subscription_payment_blocked',  // authCoreRoutes.ts — login blocked for non-payment
    ],
    employee: [
      'employee_role_changed',  // employeeRoutes.ts — title/position/role update
    ],
    helpAI: [
      'content_moderation_alert',  // contentModerationService.ts — critical flag
    ],
  },

  // ─── SCHEDULING AI (orchestrated / AI-powered) ────────────────────────────
  schedulingAI: {
    proposals:     'GET /api/scheduleos/proposals',     // scheduleosRoutes.ts
    smartGenerate: 'POST /api/scheduleos/smart-generate',
    // /api/orchestrated-schedule = execution layer; /api/scheduleos = AI decision layer
    service:       'server/routes/scheduleosRoutes.ts',
  },

  // ─── WEBSOCKET ────────────────────────────────────────────────────────────
  websocket: {
    connection:    'Single connection via WebSocketProvider (client/src/providers/WebSocketProvider.tsx)',
    // All hooks subscribe via bus.subscribe() — never open a second WebSocket
    // join_notifications: useNotificationWebSocket (guarded with subscribedRef)
    // join_credit_updates: useCreditMonitor
    // trinity_agent_subscribe: useTrinityWebSocket
  },

} as const;

/**
 * ENFORCEMENT RULES
 * -----------------
 * 1. Never add a new /api/billing/credits* endpoint that returns the credit balance
 *    — use /api/credits/balance exclusively.
 * 2. Never add duplicate-week or duplicate-shift logic outside advancedSchedulingRoutes.ts.
 * 3. All notification writes go through notificationService.ts only.
 * 4. Real-time credit updates arrive via WebSocket (credit_balance_update event),
 *    not polling. Components should invalidate ['/api/credits/balance'] on that event.
 * 5. /api/worker-earnings is for the CURRENT period earnings widget only.
 *    Historical pay data comes from /api/payroll/my-paychecks.
 */

/**
 * PERMANENT AUDIT PROTOCOLS — PRODUCTION CERTIFICATION STANDARDS
 * ================================================================
 * These invariants MUST pass after every code change. Enforced by:
 * - Startup: platformActionHub duplicate-WARN log + logDomainHealthSummary (5s delay)
 * - CI equivalent: grep checks documented below
 *
 * LAST FULL AUDIT: March 16, 2026 — 14/15 domains healthy, 685 actions, 0 duplicates
 * Prior audit:      March 12, 2026 — 15/15 domains healthy, 703 actions, 0 duplicates
 */
export const AUDIT_PROTOCOLS = {

  /**
   * PROTOCOL 1 — ACTION HUB DUPLICATE DETECTION
   * ---------------------------------------------
   * registerAction() in platformActionHub.ts already silently ignores
   * duplicates and emits a WARN log. At startup, every distinct actionId
   * must appear EXACTLY once in ACTION_REGISTRY.
   *
   * Runtime enforcement: PlatformActionHub.registerAction() (line ~1950)
   * Post-restart check : grep -r "mkAction\|registerAction" server/services/ai-brain \
   *                       --include="*.ts" | grep -oP "'[a-z_.]+'" | sort | uniq -d
   * Expected result    : (empty — zero duplicates)
   * Baseline           : 736 unique actions across 15 domain modules
   */
  actionHubDuplicates: {
    enforcement: 'platformActionHub.ts → registerAction() emits WARN and returns on duplicate',
    startupLog:  '[Platform Action Hub] WARN: Duplicate action registration attempted',
    baseline:    736,
    domains:     15,
  },

  /**
   * PROTOCOL 2 — DOMAIN HEALTH SCORING
   * ------------------------------------
   * Each of the 15 Trinity domains must score ≥85 AND have 0 missing files.
   * Score formula: (fileOk% × 0.6) + (trinityCount×10 × 0.4), capped at 100.
   * Minimum 7 matching Trinity actions per domain prefix for a healthy score.
   *
   * Runtime enforcement: server/services/trinity/domainHealthValidator.ts
   *                      → logDomainHealthSummary() called 5s after startup in server/index.ts
   * Post-restart check : Look for "[Trinity Domain Health]" in startup logs
   * Healthy threshold  : score ≥ 85 AND filesMissing = 0
   * Baseline           : 15/15 healthy (March 2026)
   */
  domainHealth: {
    enforcement: 'server/services/trinity/domainHealthValidator.ts → logDomainHealthSummary()',
    startupLog:  '[Trinity Domain Health]',
    minScore:    85,
    maxMissingFiles: 0,
    minTrinityActionsPerDomain: 7,
    domains:     15,
    baseline:    '15/15 healthy',
  },

  /**
   * PROTOCOL 3 — DEV SEED AUTO-RUN
   * --------------------------------
   * All 9 seed modules run idempotently on every non-production startup.
   * Order matters — core data must exist before enrichment.
   * Marcus Rivera payroll data (dev-payrun-marcus-feb-2026, dev-payrun-marcus-mar-2026)
   * is seeded in Section 9 of server/services/developmentSeed.ts.
   *
   * Seed pipeline (server/index.ts, lines ~447–522):
   *   1. runDevelopmentSeed()                — core users, orgs, employees, shifts, payroll
   *   2. runDevDataEnrichment()              — comprehensive Trinity training data
   *   3. runCommunicationsSeed()             — messages, threads, Trinity activity
   *   4. runAcmeOperationalSeed()            — guard tours, GPS, DAR, BOLOs, incidents
   *   5. ensureFutureOpenShifts()            — always maintains schedulable open shifts
   *   6. runAnvilCoreSeed()                  — Anvil workspace, users, employees, clients
   *   7. runAnvilOperationalSeed()           — Anvil shifts, payroll runs, pay stubs
   *   8. runComplianceSeed()                 — documents, alerts, post orders (both orgs)
   *   9. runContractsAndIncidentsSeed()      — contracts, incidents (both orgs)
   *  10. runFinancialIntegrationsSeed()      — QuickBooks (Acme) + Stripe-local (Anvil)
   *
   * Note: All seeds use ON CONFLICT DO NOTHING — safe to re-run on every restart.
   */
  devSeedPipeline: {
    enforcement: 'server/index.ts — all 10 seed calls in startup (non-production only)',
    marcusPayroll: {
      runs:    ['dev-payrun-marcus-feb-2026', 'dev-payrun-marcus-mar-2026'],
      entries: ['dev-payentry-marcus-feb-2026', 'dev-payentry-marcus-mar-2026'],
      employee: 'dev-acme-emp-001 (Marcus Rivera, org_owner, $45/hr)',
      seededIn: 'server/services/developmentSeed.ts — Section 9',
    },
  },

  /**
   * PROTOCOL 4 — PAYROLL STATUS ENUM ALIGNMENT
   * --------------------------------------------
   * All payroll status strings used in routes, seeds, and queries
   * MUST match the payrollStatusEnum in shared/schema/enums.ts exactly.
   *
   * Canonical values: ['draft','pending','approved','processed','paid','completed','partial']
   * File: shared/schema/enums.ts → payrollStatusEnum
   *
   * Post-change check: grep -r "status.*=.*['\"]" server/routes/payrollRoutes.ts \
   *                    server/services/developmentSeed*.ts | grep payroll
   */
  payrollStatusEnum: {
    canonical:   'shared/schema/enums.ts → payrollStatusEnum',
    values:      ['draft', 'pending', 'approved', 'processed', 'paid', 'completed', 'partial'],
    anvilSeed:   { processed: 2, pending: 1 },
    acmeSeed:    { processed: 2 },
  },

  /**
   * PROTOCOL 5 — CIRCUIT BREAKER DUAL-PATH
   * ----------------------------------------
   * circuitBreaker.ts exists at BOTH paths below. Each path serves a
   * different import surface. Both files must be present at all times.
   *
   * Path A: server/services/resilience/circuitBreaker.ts
   *         (imported by resilience-layer consumers)
   * Path B: server/services/infrastructure/circuitBreaker.ts
   *         (imported by infrastructure-layer consumers)
   *
   * Post-change check: ls server/services/resilience/circuitBreaker.ts \
   *                       server/services/infrastructure/circuitBreaker.ts
   */
  circuitBreaker: {
    paths: [
      'server/services/resilience/circuitBreaker.ts',
      'server/services/infrastructure/circuitBreaker.ts',
    ],
  },

  /**
   * PROTOCOL 6 — GLOBAL ERROR BOUNDARY COLOR COMPLIANCE
   * -----------------------------------------------------
   * GlobalErrorBoundary.tsx renders OUTSIDE React providers when the app crashes.
   * It MUST use inline hsl(var(--xxx)) CSS custom properties — never hardcoded hex.
   * CSS custom properties from :root remain available even outside providers.
   *
   * File: client/src/components/errors/GlobalErrorBoundary.tsx
   * Banned: #111827, #6b7280, #374151, #9ca3af, #fafafa, #ffffff and any hex color
   * Required: hsl(var(--foreground)), hsl(var(--muted-foreground)), hsl(var(--card)), etc.
   *
   * Post-change check: grep "#[0-9a-fA-F]\{3,6\}" \
   *                    client/src/components/errors/GlobalErrorBoundary.tsx
   * Expected result  : (empty — no hex colors)
   */
  globalErrorBoundary: {
    file:    'client/src/components/errors/GlobalErrorBoundary.tsx',
    rule:    'All colors via hsl(var(--token)) — never hardcoded hex',
    reason:  'Renders outside React providers; CSS custom properties from :root still available',
  },

  /**
   * PROTOCOL 7 — SCHEDULING ACTION REGISTRATION SSOT
   * --------------------------------------------------
   * Scheduling domain actions (scheduling.detect_conflicts, scheduling.publish_shifts,
   * scheduling.auto_fill_gaps, scheduling.get_coverage_report, scheduling.flag_overtime_risk)
   * are registered ONLY in:
   *   server/services/ai-brain/trinitySchedulingPlatformActions.ts
   *
   * They must NOT appear in platformActionHub.ts or any other registration file.
   *
   * Post-change check: grep -rn "scheduling\." \
   *                    server/services/helpai/platformActionHub.ts
   * Expected result  : (empty — no scheduling actions in hub)
   */
  schedulingActionsSSoT: {
    file:    'server/services/ai-brain/trinitySchedulingPlatformActions.ts',
    actions: [
      'scheduling.detect_conflicts',
      'scheduling.publish_shifts',
      'scheduling.auto_fill_gaps',
      'scheduling.get_coverage_report',
      'scheduling.flag_overtime_risk',
    ],
  },

  /**
   * PROTOCOL 9 — EVENT BUS CANONICAL EMIT LAW
   * -------------------------------------------
   * platformEventBus has TWO emit paths:
   *   A. .emit(eventName: string, data: object)  — internal Node EventEmitter signal ONLY.
   *      Fires registered .on(eventName) listeners. Does NOT persist to DB. Does NOT reach
   *      Trinity subscribers. Does NOT go to WebSocket. Use for internal orchestration only.
   *   B. .publish(event: PlatformEvent)          — CANONICAL Trinity protocol.
   *      Persists to DB, routes to all .subscribe() handlers (trinityEventSubscriptions.ts,
   *      automationTriggerService.ts), broadcasts via WebSocket, writes to audit log.
   *
   * NEVER call .emit(object) — EventEmitter treats the object as the event name string
   * ("[object Object]"), which silently drops the event. This was the "second-wave" bug.
   *
   * ALWAYS use .publish() for:
   *   - Any financial event (invoice_*, payroll_*, stripe_payment_*)
   *   - Any field operation (officer_clocked_in, incident_report_filed, etc.)
   *   - Any scheduling event (schedule_published, shift_created, etc.)
   *   - Any automation lifecycle event (automation_execution_*, quickbooks_operation_*)
   *   - Any document pipeline event (document_completed, approval_requested)
   *   - Any auth/subscription event (subscription_payment_blocked)
   *   - Any HR event (employee_role_changed)
   *
   * .emit(string, data) is acceptable ONLY for internal cross-service telemetry that
   * has no Trinity subscriber (e.g., 'bot_delegation', 'ai_brain_action' polling telemetry).
   *
   * Runtime enforcement: grep -rn "platformEventBus\.emit({" server/ — should return empty.
   * Post-change check:   grep -rn "platformEventBus\.emit({" server/ --include="*.ts"
   * Expected result:     (empty — zero object-as-name emit() calls)
   *
   * Audit history:
   *   March 12, 2026 — First wave: fixed all financial + scheduling + field ops emits
   *   March 16, 2026 — Second wave: fixed 20+ remaining broken emit({}) calls across
   *                    automationExecutionTracker, quickbooksOrchestration, documentPipeline,
   *                    authCoreRoutes, employeeRoutes, contentModerationService,
   *                    helpAIOrchestrator, quickbooksSyncPollingService, trinity/eventBus.ts
   */
  eventBusCanonicalLaw: {
    publish:          'platformEventBus.publish(event: PlatformEvent) — Trinity protocol, all external events',
    emitInternal:     'platformEventBus.emit(name: string, data) — internal signals only, no Trinity',
    banned:           'platformEventBus.emit(object) — always silently dropped, never use',
    service:          'server/services/platformEventBus.ts',
    auditCommand:     'grep -rn "platformEventBus\\.emit({" server/ --include="*.ts"',
    auditExpected:    '(empty)',
  },

  /**
   * PROTOCOL 8 — PULL-TO-REFRESH TAILWIND SAFETY
   * -----------------------------------------------
   * pull-to-refresh-indicator.tsx must NOT use ambiguous Tailwind ease-[...]
   * classes with cubic-bezier values. Transition timing must be inline styles.
   *
   * File: client/src/components/pull-to-refresh-indicator.tsx
   * Banned: ease-[cubic-bezier(...)]  (causes Vite/PostCSS warnings)
   * Required: style={{ transition: 'transform Xms cubic-bezier(...)' }}
   */
  pullToRefresh: {
    file:   'client/src/components/pull-to-refresh-indicator.tsx',
    rule:   'Use inline style for cubic-bezier transition — not Tailwind ease-[...]',
  },

} as const;
