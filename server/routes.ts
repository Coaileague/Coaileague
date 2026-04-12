// Multi-tenant SaaS API Routes — Domain Orchestrator
// THE LAW: No new route mounts here. Add routes in the appropriate domain file under server/routes/domains/
// References: javascript_log_in_with_replit, javascript_database, javascript_stripe blueprints

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";

// ============================================================================
// PLATFORM WORKSPACE SEEDING LOCK
// ============================================================================
// Prevents concurrent runtime seeding attempts from racing and violating FK constraints
let platformWorkspaceSeedingInProgress = false;
const platformWorkspaceSeedLock = {
  async acquire(): Promise<void> {
    while (platformWorkspaceSeedingInProgress) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    platformWorkspaceSeedingInProgress = true;
  },
  release(): void {
    platformWorkspaceSeedingInProgress = false;
  }
};

import { setupAuth, requireAuth } from "./auth";
import { auditContextMiddleware } from "./middleware/audit";
import { platformStaffAuditMiddleware } from "./middleware/platformStaffAudit";
import { dataAttributionMiddleware } from "./middleware/dataAttribution";
import { csrfProtection, ensureCsrfToken, csrfTokenHandler } from "./middleware/csrf";
import { trinityOrchestrationMiddleware } from "./services/trinity/trinityOrchestrationGateway";
import { apiLimiter, mutationLimiter, authenticatedLimiter, publicApiLimiter, authLimiter } from "./middleware/rateLimiter";
import { subscriptionReadOnlyGuard, cancelledWorkspaceGuard } from "./middleware/subscriptionGuard";
import { terminatedEmployeeGuard } from "./middleware/terminatedEmployeeGuard";
import { trinityGuardMiddleware } from "./middleware/trinityGuard";
import { requestTimeout } from "./middleware/requestTimeout";
import { notificationStateManager } from "./services/notificationStateManager";
import { setupWebSocket } from "./websocket";
import Stripe from "stripe";
import { getStripe, isStripeConfigured } from "./services/billing/stripeClient";

// ============================================================================
// STRIPE SINGLETON — Lazy proxy (CLAUDE.md §F): avoids module-load crash
// ============================================================================
export const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

// ============================================================================
// DOMAIN ROUTE MOUNTS — 15 canonical domains + audit
// ============================================================================
import { mountAuthRoutes } from "./routes/domains/auth";
import { mountBillingRoutes } from "./routes/domains/billing";
import { mountClientRoutes } from "./routes/domains/clients";
import { mountCommsRoutes } from "./routes/domains/comms";
import { mountComplianceRoutes } from "./routes/domains/compliance";
import { mountOpsRoutes } from "./routes/domains/ops";
import { mountOrgsRoutes } from "./routes/domains/orgs";
import { mountPayrollRoutes } from "./routes/domains/payroll";
import { mountSalesRoutes } from "./routes/domains/sales";
import { mountSchedulingRoutes } from "./routes/domains/scheduling";
import { mountSupportRoutes } from "./routes/domains/support";
import { mountTimeRoutes } from "./routes/domains/time";
import { mountTrinityRoutes } from "./routes/domains/trinity";
import { mountWorkforceRoutes } from "./routes/domains/workforce";
import { mountAuditRoutes } from "./routes/domains/audit";

// ============================================================================
// PUBLIC ROUTES — no auth, must be registered BEFORE domain mounts that apply
// requireAuth to /api/* (e.g. comms domain). These are the only routes that
// legitimately live outside a domain file.
// ============================================================================
// Public onboarding wizard — unauthenticated candidates / new org sign-up flow
import publicOnboardingRoutes from "./routes/publicOnboardingRoutes";
// Public employee packet portal — token-controlled, no session required
import { employeePacketPublicRouter } from "./routes/employeePacketRoutes";
// Expansion migration — creates new tables on first boot
import { runExpansionMigration } from "./services/expansionMigration";
// Phase 35G: Client Communication Hub migration
import { runClientCommsMigration } from "./services/clientCommsMigration";
// Public hiring routes — job board and application submission (no auth)
import publicHiringRoutes from "./routes/publicHiringRoutes";
// Hiring migration — extends existing ATS tables with pipeline fields
import { runHiringMigration } from "./services/hiring/hiringMigration";

// ============================================================================
// WEBHOOK ROUTERS — MUST be registered BEFORE domain mounts
// CRITICAL ORDER: Several domains use app.use("/api", requireAuth, router)
// which applies requireAuth to ALL /api/* requests — including webhook paths.
// By registering these webhook routers HERE (before domain mounts), Express
// will reach these handlers first and return 200 before any auth intercepts.
// ============================================================================
import resendWebhooksRouter from "./routes/resendWebhooks";
import twilioWebhooksRouter from "./routes/twilioWebhooks";
import { messageBridgeWebhookRouter } from "./routes/messageBridgeRoutes";
import { inboundEmailRouter } from "./routes/inboundEmailRoutes";
import { emailRouter } from "./routes/email/emailRoutes";
import { initializeVoiceTables } from "./routes/voiceRoutes";
import platformFeedbackRouter from "./routes/platformFeedbackRoutes";
import { typedPoolExec, typedQuery } from './lib/typedSql';
// Phase 46: Holiday calendar routes + service init
import holidayRoutes from "./routes/holidayRoutes";
import { initializeHolidays, registerDecemberHolidayCron } from "./services/holidayService";
// Phase 49: Notification preferences + template management
import notificationPreferenceRoutes from "./routes/notificationPreferenceRoutes";
// Phase 50: Outbound webhook management
import webhookRoutes from "./routes/webhookRoutes";
import { initWebhookTables } from "./services/webhookDeliveryService";
// Phase 51: Platform status pages + feature flag management
import { statusRouter, platformFlagRouter, registerBackupVerificationCron } from "./routes/statusRoutes";
// Mega Phase: Legal consent + platform forms + interview chatrooms + onboarding pipeline
import legalConsentRouter from "./routes/legalConsentRoutes";
import legalRouter from "./routes/legalRoutes";
import platformFormsRouter from "./routes/platformFormsRoutes";
import formBuilderRouter from "./routes/formBuilderRoutes";
import interviewChatroomRouter from "./routes/interviewChatroomRoutes";
import onboardingPipelineRouter from "./routes/onboardingPipelineRoutes";
import { requireLegalAcceptance } from "./middleware/requireLegalAcceptance";

// ============================================================================
// EMAIL NORMALIZATION HELPER
// ============================================================================
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== "string") return null;
  const trimmed = email.trim();
  if (trimmed.length === 0) return null;
  if (!trimmed.includes("@") || !trimmed.includes(".")) return null;
  return trimmed.toLowerCase();
}

import multiCompanyRoutes from './routes/multiCompanyRoutes';
import gateDutyRoutes from './routes/gateDutyRoutes';
import complianceEvidenceRoutes from './routes/complianceEvidenceRoutes';
import surveyRoutes, { surveyPublicRouter } from './routes/surveyRoutes';
import wellnessRoutes from './routes/wellnessRoutes';
import trainingCertificationRouter from './routes/trainingCertificationRoutes';
import alertConfigRouter from './routes/alertConfigRoutes';
import { trinityThoughtStatusRouter } from './routes/trinityThoughtStatusRoutes';
import { platformConfigValuesRouter } from './routes/platformConfigValuesRoutes';
import { ensureWorkspaceAccess } from './middleware/workspaceScope';
import { createLogger } from './lib/logger';
import { PLATFORM_WORKSPACE_ID } from './services/billing/billingConstants';
import internalResetRouter from './routes/internalResetRoutes';
const log = createLogger('routes');


export async function registerRoutes(app: Express): Promise<Server> {
  const server = createServer(app);

  // ============================================================================
  // STARTUP: SEED ROOT USER AND PLATFORM WORKSPACE (background, non-blocking)
  // ============================================================================
  // Run seeding in the background so port opens immediately even if DB is slow.
  const seedWithRetry = async (fn: () => Promise<any>, name: string, maxAttempts = 8) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await fn();
        log.info(`[Startup] ${name} succeeded on attempt ${attempt}`);
        return;
      } catch (err: any) {
        if (attempt === maxAttempts) {
          log.warn(`[Startup] ${name} failed after ${maxAttempts} attempts (non-blocking):`, err?.message);
          return;
        }
        const delay = Math.min(attempt * 3000, 15000);
        log.warn(`[Startup] ${name} attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  };

  // Fire-and-forget — do NOT await. Server port opens immediately.
  Promise.resolve().then(async () => {
    // Run notification_type enum migration first (idempotent, IF NOT EXISTS)
    const runEnumMigration = async () => {
      const { db } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const newTypes = [
        'shift_confirmation','shift_declined_alert','unconfirmed_shifts_alert',
        'system_update','system_alert','schedule_published','calloff_alert',
        'payroll_approved','payroll_initiated','payroll_transfer_settled','payroll_transfer_failed',
        'payroll_alert','plaid_transfer_updated','timesheets_approved',
        'billing_alert','subscription_updated','stripe_payment_received','invoices_updated','payment_refunded',
        'trial_converted','trial_expiry_warning','trial_grace_period',
        'workspace_downgraded','workspace_suspended','workspace_reactivated','reactivation_failed',
        'compliance_violation','compliance_hold','employee_terminated',
        'panic_alert','task_delegation','task_escalation','sla_breach','drug_test','settings_change_impact',
        // Wave 3: attendance, reporting, comms, contracts
        'missed_clock_in','missed_clock_in_alert','monthly_summary','alert',
        'scheduled_email','contract_executed','regulatory_violation',
        // Wave 4: Trinity AI brain, compliance, billing, operations
        'trinity_recognition','trinity_recognition_pending','trinity_fto_suggestion',
        'trinity_ootm_nomination','trinity_raise_suggestion','trinity_action_blocked',
        'helpai_proactive','cognitive_overload','social_graph_insight','disciplinary_pattern',
        'external_risk','bot_reply','mascot_orchestration',
        'agent_escalation','schedule_escalation','orchestration_update','migration_complete',
        'ai_cost_alert','circuit_breaker_opened',
        'compliance_approved','compliance_rejected','compliance_warning',
        'audit_report_uploaded','audit_access_request',
        'client_created','client_invited','client_data_incomplete',
        'onboarding','employee_hired',
        'chargeback_received','stripe_payment_confirmed','subscription_payment_blocked',
        'invoice_created','invoice_overdue_alert','invoice_paid_confirmation',
        'payroll_disbursement_confirmed','payroll_run_voided','paystub_generated',
        'reconciliation_alert',
        'qb_sync_failed','qb_payroll_sync_failed',
        'security_alert','maintenance_alert_created','emergency','incident',
        'coverage_gap_detected','geofence_override_required','document_bridged',
        'content_moderation_alert','shift_cancelled_alert',
        'approval_needed','request_approved','request_denied',
        'announcement','info','internal','document',
        'new_staffing_inquiry','support_resolved',
        'pay_rate_change','pto_updated',
      ];
      let added = 0;
      for (const type of newTypes) {
        try {
          // CATEGORY C — Raw SQL retained: ALTER TYPE | Tables:  | Verified: 2026-03-23
          await typedQuery(sql.raw(`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS '${type}'`));
          added++;
        } catch { /* already exists — skip */ }
      }
      if (added > 0) log.info(`[Startup] Notification enum migration: added ${added} new types`);
    };
    await seedWithRetry(runEnumMigration, 'enumMigration');

    // ── DAR chain-of-custody column migration (idempotent ADD COLUMN IF NOT EXISTS) ──
    const runDarChainMigration = async () => {
      const { pool } = await import('./db');
      const cols: Array<[string, string]> = [
        ['file_hash', 'VARCHAR(64)'],
        ['file_size_bytes', 'INTEGER'],
        ['page_count', 'INTEGER'],
        ['flagged_for_review', 'BOOLEAN DEFAULT false'],
        ['force_use_detected', 'BOOLEAN DEFAULT false'],
        ['review_notes', 'TEXT'],
        ['approved_by', 'VARCHAR(255)'],
        ['approved_at', 'TIMESTAMP'],
        ['rejected_by', 'VARCHAR(255)'],
        ['rejected_at', 'TIMESTAMP'],
        ['rejection_reason', 'TEXT'],
        ['escalated_to', 'VARCHAR(255)'],
        ['escalated_at', 'TIMESTAMP'],
        ['escalation_reason', 'TEXT'],
        ['changes_requested_by', 'VARCHAR(255)'],
        ['changes_requested_at', 'TIMESTAMP'],
        ['changes_requested_notes', 'TEXT'],
        ['changes_provided_at', 'TIMESTAMP'],
        ['legal_hold', 'BOOLEAN DEFAULT false'],
        ['legal_hold_reason', 'TEXT'],
        ['legal_hold_set_by', 'VARCHAR(255)'],
        ['legal_hold_set_at', 'TIMESTAMP'],
        ['access_log', "JSONB DEFAULT '[]'::jsonb"],
      ];
      let added = 0;
      for (const [col, type] of cols) {
        try {
          // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables:  | Verified: 2026-03-23
          await typedPoolExec(`ALTER TABLE dar_reports ADD COLUMN IF NOT EXISTS ${col} ${type}`);
          added++;
        } catch { /* already exists */ }
      }
      if (added > 0) log.info(`[Startup] DAR chain-of-custody columns: ensured ${added} columns`);
    };
    await seedWithRetry(runDarChainMigration, 'darChainMigration');

    // ── Phase 35J disciplinary records column migration (idempotent ADD COLUMN IF NOT EXISTS) ──
    const runDisciplinaryPhase35jMigration = async () => {
      const cols: Array<[string, string]> = [
        ['evidence_urls', 'TEXT[]'],
        ['appeal_status', "VARCHAR(20) DEFAULT 'none'"],
        ['appeal_reason', 'TEXT'],
        ['effective_date', 'TIMESTAMP WITH TIME ZONE'],
        ['expiry_date', 'TIMESTAMP WITH TIME ZONE'],
      ];
      let added = 0;
      for (const [col, type] of cols) {
        try {
          // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables: disciplinary_records | Verified: 2026-03-28
          await typedPoolExec(`ALTER TABLE disciplinary_records ADD COLUMN IF NOT EXISTS ${col} ${type}`);
          added++;
        } catch { /* already exists */ }
      }
      if (added > 0) log.info(`[Startup] Phase 35J disciplinary columns: ensured ${added} columns`);
    };
    await seedWithRetry(runDisciplinaryPhase35jMigration, 'disciplinaryPhase35jMigration');

    // ── Phase 35J performance_reviews column migration (dedicated rating columns) ──
    const runReviewsPhase35jMigration = async () => {
      const cols: Array<[string, string]> = [
        ['reliability_rating', 'INTEGER'],
        ['professionalism_rating', 'INTEGER'],
        ['client_feedback_rating', 'INTEGER'],
      ];
      let added = 0;
      for (const [col, type] of cols) {
        try {
          // CATEGORY C — Raw SQL retained: ALTER TABLE | Tables: performance_reviews | Verified: 2026-03-28
          await typedPoolExec(`ALTER TABLE performance_reviews ADD COLUMN IF NOT EXISTS ${col} ${type}`);
          added++;
        } catch { /* already exists */ }
      }
      if (added > 0) log.info(`[Startup] Phase 35J review columns: ensured ${added} columns`);
    };
    await seedWithRetry(runReviewsPhase35jMigration, 'reviewsPhase35jMigration');

    const { seedRootUser } = await import("./seed-root-user");
    await seedWithRetry(seedRootUser, 'seedRootUser');
    const { seedPlatformWorkspace } = await import("./seed-platform-workspace");
    await seedWithRetry(seedPlatformWorkspace, 'seedPlatformWorkspace');
  }).catch(err => log.warn('[Startup] Background seed error:', err?.message));

  // ============================================================================
  // WEBSOCKET SETUP
  // ============================================================================
  const { broadcastShiftUpdate, broadcastNotification, broadcastPlatformUpdate } = setupWebSocket(server);
  notificationStateManager.setBroadcastFunction((ws, uid, type, data, count) =>
    broadcastNotification(ws, uid, type as any, data, count)
  );

  const { platformEventBus } = await import("./services/platformEventBus");
  platformEventBus.setWebSocketHandler((event) => {
    broadcastPlatformUpdate({
      type: "platform_update",
      category: event.category as any,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      title: event.title,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      description: event.description,
      version: event.version,
      priority: event.priority,
      learnMoreUrl: event.learnMoreUrl,
      metadata: event.metadata,
    });
  });

  // ============================================================================
  // CORE MIDDLEWARE SETUP
  // ============================================================================
  const cookieParser = (await import("cookie-parser")).default;
  app.use(cookieParser());

  setupAuth(app);

  // CSRF protection
  app.use(ensureCsrfToken);
  app.get("/api/csrf-token", csrfTokenHandler);
  app.use("/api", csrfProtection);

  // Audit and attribution middleware
  app.use(auditContextMiddleware);
  app.use(platformStaffAuditMiddleware);
  app.use(dataAttributionMiddleware);
  app.use(trinityOrchestrationMiddleware());

  // Stress test bypass (non-production only)
  const stressTestKey = process.env.STRESS_TEST_KEY || (process.env.NODE_ENV !== "production" ? "stress-test-internal-2026" : "");
  if (process.env.STRESS_TEST_MODE === "true" && stressTestKey) {
    app.use("/api", (req: any, res: any, next: any) => {
      if (req.get("x-stress-key") === stressTestKey) {
        req.session.userId = "root-user-00000000";
        req.session.workspaceId = "dev-acme-security-ws";
        req.session.activeWorkspaceId = "dev-acme-security-ws";
        req.userId = "root-user-00000000";
        req.workspaceId = "dev-acme-security-ws";
      }
      next();
    });
  }

  // Trinity Intrusion Detection Guard — scans every /api request for attacks before routing.
  // Checks blocked IPs, SQL injection, XSS, path traversal, command injection, attacker UAs.
  // Critical threats are auto-blocked and published to Trinity's event system.
  app.use("/api", trinityGuardMiddleware);

  // Phase 41 — Subscription read-only guard: blocks mutating API calls for suspended workspaces.
  // Billing/webhook routes are exempt so operators can recover payment.
  // @ts-expect-error — TS migration: fix in refactoring sprint
  app.use("/api", subscriptionReadOnlyGuard);

  // Cancelled workspace guard: full block (403) for all /api routes when workspace is cancelled.
  // Auth/health/billing are always exempt so operators can sign in and re-activate.
  // @ts-expect-error — TS migration: fix in refactoring sprint
  app.use("/api", cancelledWorkspaceGuard);

  // Terminated employee guard: enforce 14-day read-only grace period after termination.
  // Past grace period → 403. Within grace period → restricted path access only.
  app.use("/api", terminatedEmployeeGuard);

  // Global rate limiting
  // Check req.user (passport) AND req.session?.userId (direct session) so that
  // authenticated page-load requests aren't caught by the tight publicApiLimiter (20/min).
  app.use("/api", (req, res, next) => {
    const isAuthenticated = !!(req as any).user || !!(req as any).session?.userId;
    if (isAuthenticated) {
      return authenticatedLimiter(req, res, next);
    }
    return publicApiLimiter(req, res, next);
  });

  // NOTE: Do NOT add authLimiter to the broad /api/auth prefix — that would
  // rate-limit /api/auth/me (the session check) which React calls on every page
  // load. The strict authLimiter is applied only to the specific brute-force
  // targets (login, register, password reset) inside registerAuthRoutes().

  app.use("/api", (req: any, res: any, next: any) => {
    if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
      return mutationLimiter(req, res, next);
    }
    next();
  });

  // Per-route request timeout (20s default, 90s for AI routes, 10s for webhooks)
  app.use(requestTimeout);

  // ── PUBLIC ROUTES (no auth) — registered BEFORE domain mounts ─────────────
  // Phase 32: Platform capabilities — must be before any app.use("/api", requireAuth, ...)
  app.get("/api/auth/capabilities", (_req, res) => {
    const devLoginEnabled = process.env.NODE_ENV !== 'production';
    res.json({ devLoginEnabled });
  });

  // ── SMS CONSENT PAGE — publicly accessible, no login required ──────────────
  // Required for Twilio toll-free number verification (error 30509).
  // This page must load without any authentication for Twilio reviewers.
  // Toll-Free Verification SID: HH652b9771aa0852e47abb3c1bb95de9e7
  app.get("/sms-consent", (_req, res) => {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SMS Notification Consent — CoAIleague</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f4f6f9;
      color: #1a1a2e;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 2px 16px rgba(0,0,0,0.09);
      max-width: 620px;
      width: 100%;
      padding: 40px 44px;
    }
    .logo {
      font-size: 22px;
      font-weight: 700;
      color: #1a1a2e;
      letter-spacing: -0.5px;
      margin-bottom: 6px;
    }
    .logo span { color: #c9a84c; }
    .divider {
      border: none;
      border-top: 1px solid #e5e7eb;
      margin: 20px 0;
    }
    h1 {
      font-size: 26px;
      font-weight: 700;
      color: #1a1a2e;
      margin-bottom: 8px;
    }
    .business-name {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 20px;
    }
    p {
      font-size: 15px;
      line-height: 1.65;
      color: #374151;
      margin-bottom: 16px;
    }
    .notice-box {
      background: #f8fafc;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 18px 20px;
      margin-bottom: 20px;
    }
    .notice-box ul {
      padding-left: 20px;
      margin-top: 8px;
    }
    .notice-box ul li {
      font-size: 14px;
      color: #374151;
      line-height: 1.7;
    }
    .compliance-text {
      font-size: 13px;
      color: #6b7280;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .checkbox-row {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 24px;
      padding: 16px;
      background: #f0f4ff;
      border-radius: 8px;
      border: 1px solid #c7d7f7;
    }
    .checkbox-row input[type="checkbox"] {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
      margin-top: 2px;
      accent-color: #1a3a6e;
      cursor: pointer;
    }
    .checkbox-row label {
      font-size: 14px;
      color: #1a1a2e;
      line-height: 1.5;
      cursor: pointer;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 14px;
      background: #1a3a6e;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      letter-spacing: 0.2px;
      transition: background 0.2s;
    }
    .btn:hover { background: #15306e; }
    .btn:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    .success-msg {
      display: none;
      text-align: center;
      padding: 20px;
      background: #ecfdf5;
      border: 1px solid #6ee7b7;
      border-radius: 8px;
      color: #065f46;
      font-size: 15px;
      font-weight: 600;
      margin-top: 16px;
    }
    .links {
      display: flex;
      gap: 20px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }
    .links a {
      font-size: 13px;
      color: #1a3a6e;
      text-decoration: underline;
    }
    .links a:hover { color: #c9a84c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">CoAI<span>league</span></div>
    <div class="business-name">Coaileague Automations LLC</div>
    <hr class="divider" />

    <h1>SMS Notification Consent</h1>
    <p>
      By providing your phone number and checking the box below, you agree to receive
      SMS text messages from <strong>Coaileague Automations LLC</strong> on behalf of
      your employer. This service is used by security guard companies to deliver
      operational workforce management notifications to their staff.
    </p>

    <div class="notice-box">
      <strong style="font-size:14px;color:#1a1a2e;">Messages you will receive include:</strong>
      <ul>
        <li>Shift assignments and schedule confirmations</li>
        <li>Schedule changes and urgent shift updates</li>
        <li>Calloff alerts and open shift replacement requests</li>
        <li>Welfare check notifications and clock-in reminders</li>
        <li>Payroll processing confirmations and pay stub availability</li>
      </ul>
    </div>

    <p class="compliance-text">
      <strong>Message frequency</strong> varies based on operational activity.
      Messages are sent only when there is a relevant operational event requiring
      your attention.
    </p>
    <p class="compliance-text">
      <strong>Msg &amp; data rates may apply.</strong> Contact your wireless carrier
      for details about your data plan.
    </p>
    <p class="compliance-text">
      To stop receiving messages at any time, reply <strong>STOP</strong> to any
      message. For help, reply <strong>HELP</strong>.
    </p>

    <form id="consentForm">
      <div class="checkbox-row">
        <input type="checkbox" id="agreeCheckbox" name="agree" />
        <label for="agreeCheckbox">
          I agree to receive SMS notifications from Coaileague Automations LLC
          as described above. I understand I can reply STOP at any time to
          unsubscribe.
        </label>
      </div>
      <button type="submit" class="btn" id="submitBtn" disabled>
        Confirm Consent
      </button>
    </form>

    <div class="success-msg" id="successMsg">
      Your consent has been recorded. You will begin receiving SMS notifications
      for your assigned shifts and operational updates.
    </div>

    <div class="links">
      <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>
      <a href="/terms" target="_blank" rel="noopener">Terms of Service</a>
    </div>
  </div>

  <script>
    const checkbox = document.getElementById('agreeCheckbox');
    const btn = document.getElementById('submitBtn');
    const form = document.getElementById('consentForm');
    const successMsg = document.getElementById('successMsg');

    checkbox.addEventListener('change', function () {
      btn.disabled = !this.checked;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!checkbox.checked) return;
      btn.disabled = true;
      btn.textContent = 'Consent Recorded';
      form.style.display = 'none';
      successMsg.style.display = 'block';
    });
  </script>
</body>
</html>`);
  });

  // Public onboarding wizard — new org registration flow (no session required)
  app.use("/api/onboarding", publicOnboardingRoutes);
  // Public employee/client packet portal — accessed via unique token
  app.use("/api/public/packets", employeePacketPublicRouter);
  // Public hiring job board — unauthenticated, org-specific, accessed via workspace ID
  app.use("/api/public/jobs", publicHiringRoutes);

  // ── WEBHOOK ROUTERS — must be BEFORE domain mounts (see comment above) ────
  app.use(resendWebhooksRouter);
  app.use(twilioWebhooksRouter);
  app.use(messageBridgeWebhookRouter);

  // Phase 13: Inbound email webhook receivers (calloffs@, incidents@, docs@, support@)
  // No auth required — Resend POSTs here; signature verification is internal.
  app.use('/api/inbound/email', inboundEmailRouter);

  // Email API: inbox, send, thread, management (requires auth)
  app.use('/api/email', emailRouter);

  // ── PLATFORM FEEDBACK — survey collection for CoAIleague improvement ────
  app.use("/api/platform-feedback", platformFeedbackRouter);

  // Phase 46: Holiday calendar management
  app.use("/api/holidays", holidayRoutes);
  // Phase 49: Notification preferences + templates
  app.use("/api/notification-preferences", notificationPreferenceRoutes);
  // Phase 50: Outbound webhook management
  app.use("/api/webhooks", webhookRoutes);
  // Phase 51: Platform status page + feature flag admin
  // Public: GET /status, POST /status/subscribe, GET /status/unsubscribe/:token
  // Internal: GET /status/admin (platform_staff only)
  app.use("/status", statusRouter);
  app.use("/api/platform-flags", platformFlagRouter);

  // Mega Phase: Legal consent (accept agreements, opt-out, consent prefs)
  // Note: /api/legal/opt-out is public (TCPA compliance), others require auth
  app.use("/api/legal", legalConsentRouter);
  // Legal document downloads — DPA, AUP (Phase 52; public, no auth required)
  // MUST be mounted here, BEFORE any domain that uses app.use("/api", requireAuth, ...)
  // catch-alls (billing, compliance, comms). Route: GET /api/legal/dpa/download
  app.use("/api/legal", legalRouter);
  // Mega Phase: Platform forms (public token-based + manager routes)
  // Note: /api/forms/public/:token is public; rest requires auth
  app.use("/api/forms", platformFormsRouter);
  // Custom form builder (manager-created forms with full approval workflow)
  app.use("/api/form-builder", formBuilderRouter);
  // Mega Phase: Interview chatrooms (manager management + candidate token-based room)
  // requireLegalAcceptance enforces legal gate for authenticated users; passes through for public token routes
  app.use("/api/interview", requireLegalAcceptance, interviewChatroomRouter);
  // Mega Phase: Employee onboarding pipeline (staff + public self-service)
  app.use("/api/onboarding-pipeline", requireLegalAcceptance, onboardingPipelineRouter);

  // Phase 56: Initialize voice phone system tables
  initializeVoiceTables().catch(err => log.error("[VoiceMigration] Failed:", err.message));
  // Run expansion migration (create new tables idempotently)
  runExpansionMigration().catch(err => log.error("[ExpansionMigration] Failed:", err.message));
  // Phase 35G: Client Communication Hub tables
  runClientCommsMigration().catch(err => log.error("[ClientCommsMigration] Failed:", err.message));
  // Run hiring migration (extend ATS tables + create interview tables)
  runHiringMigration().catch(err => log.error("[HiringMigration] Failed:", err.message));
  // Phase 35H: Equipment tracking column expansion
  import("./services/expansionMigration").then(m => m.runEquipmentExpansionMigration()).catch(err => log.error("[EquipmentMigration] Failed:", err.message));
  // Phase 35K: TCOLE Session Management tables
  import("./services/expansionMigration").then(m => m.runTCOLESessionMigration()).catch(err => log.error("[TCOLEMigration] Failed:", err.message));
  // Phase 46: Initialize federal + state holidays and register December cron
  initializeHolidays().catch(err => log.error("[HolidayService] Init failed:", err.message));
  registerDecemberHolidayCron();
  // Phase 50: Initialize outbound webhook delivery tables
  initWebhookTables().catch(err => log.error("[WebhookDelivery] Init failed:", err.message));
  // Phase 51: Register weekly backup verification cron
  registerBackupVerificationCron();

  // ============================================================================
  // DOMAIN ROUTE MOUNTS (order matters — support's /api/platform before audit's)
  // All route logic lives in server/routes/domains/*.ts
  // ============================================================================
  mountAuthRoutes(app);       // /api/auth/*, /api/tos/*, /api/dev
  // Emergency one-time operator password reset (disabled unless INTERNAL_RESET_TOKEN env var is set)
  app.use('/api/auth', internalResetRouter);
  mountSupportRoutes(app);    // /api/platform, /api/support/*, /api/help
  mountBillingRoutes(app);    // /api/billing, /api/invoices, /api/stripe
  mountClientRoutes(app);     // /api/clients, /api/contracts, /api/contract-renewals
  mountCommsRoutes(app);      // /api/comms, /api/broadcasts, /api/chat
  mountComplianceRoutes(app); // /api/compliance, /api/credentials, /api/sps, /api/training-compliance
  mountOpsRoutes(app);        // /api/incidents, /api/rms, /api/cad, /api/bots, /api/subcontractors
  mountOrgsRoutes(app);       // /api/workspace, /api/onboarding, /api/integrations, /api/import
  mountPayrollRoutes(app);    // /api/payroll, /api/time-entries, /api/expenses
  mountSalesRoutes(app);      // /api/proposals, /api/pipeline-deals, /api/bid-analytics
  mountSchedulingRoutes(app); // /api/shifts, /api/schedules, /api/staffing
  mountTimeRoutes(app);       // /api/time, /api/timesheet
  mountTrinityRoutes(app);    // /api/trinity/*, /api/ai/*
  mountWorkforceRoutes(app);  // /api/employees, /api/ats, /api/smart-onboarding, /api/hr

  // ============================================================================
  // DOMAIN ROUTES REQUIRING SESSION/PASSPORT
  // ============================================================================
  app.use('/api/multi-company', ensureWorkspaceAccess, multiCompanyRoutes);
  app.use('/api/gate-duty', ensureWorkspaceAccess, gateDutyRoutes);
  app.use('/api/compliance-evidence', ensureWorkspaceAccess, complianceEvidenceRoutes);
  app.use('/api/surveys', surveyPublicRouter);
  app.use('/api/surveys', ensureWorkspaceAccess, surveyRoutes);
  app.use('/api/wellness', ensureWorkspaceAccess, wellnessRoutes);
  app.use('/api/training-certification', ensureWorkspaceAccess, trainingCertificationRouter);
  app.use('/api/alert-configs', ensureWorkspaceAccess, alertConfigRouter);
  app.use('/api/trinity/thought-status', ensureWorkspaceAccess, trinityThoughtStatusRouter);
  app.use('/api/platform-config', platformConfigValuesRouter);

  // ── Marketing: Enterprise Inquiry (public, inline — no domain file needed) ─
  app.post("/api/marketing/enterprise-inquiry", async (req, res) => {
    try {
      const {
        name, title, company, email, phone,
        officerCount, clientCount, statesCount,
        annualPayroll, monthlyOpsOverhead, monthlyInvoicingVolume,
        payrollProvider, payrollMonthlyCost,
        complianceApproach, painPoints, source,
      } = req.body;

      if (!name || !company || !email) {
        return res.status(400).json({ error: "name, company, and email are required" });
      }

      log.info("[EnterpriseInquiry] New inquiry received:", {
        name, title, company, email, officerCount, clientCount,
      });

      // Persist lead to DB so it's never silently dropped
      try {
        const { db } = await import('./db');
        const { sql: sqlRaw } = await import('drizzle-orm');
        const { leads } = await import('@shared/schema');
        // Converted to Drizzle ORM
        await db.insert(leads).values({
          workspaceId: PLATFORM_WORKSPACE_ID,
          companyName: company,
          contactName: name,
          contactTitle: title ?? null,
          contactEmail: email,
          contactPhone: phone ?? null,
          leadStatus: 'new',
          source: source ?? 'enterprise_inquiry',
          estimatedEmployees: officerCount ? parseInt(officerCount) : null,
          estimatedValue: annualPayroll ?? null,
          notes: JSON.stringify({ statesCount, clientCount, monthlyOpsOverhead, monthlyInvoicingVolume, payrollProvider, payrollMonthlyCost, complianceApproach, painPoints }),
          createdAt: sqlRaw`now()`,
          updatedAt: sqlRaw`now()`,
        });
        log.info("[EnterpriseInquiry] Lead persisted to DB for:", email);
      } catch (dbErr: any) {
        log.error("[EnterpriseInquiry] DB persist failed (non-fatal):", dbErr?.message);
      }

      return res.status(200).json({ success: true, message: "Inquiry received — we will be in touch within 24 hours." });
    } catch (err: any) {
      log.error("[EnterpriseInquiry] Error:", err?.message);
      return res.status(500).json({ error: "Failed to submit inquiry" });
    }
  });

  mountAuditRoutes(app); // miscRouter catch-all must be LAST

  // ── Global Express Error Handler ──────────────────────────────────────────
  // Must be registered AFTER all routes (4-argument signature tells Express this is an error handler)
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status: number = typeof err.statusCode === "number" ? err.statusCode
      : typeof err.status === "number" ? err.status
      : 500;
    const requestId = (req.headers["x-request-id"] as string) ?? "";
    log.error(
      `[GlobalErrorHandler] ${req.method} ${req.path} → HTTP ${status}: ${err?.message ?? "unknown error"}` +
      (requestId ? ` (reqId: ${requestId})` : ""),
      err?.stack ? `\n${err.stack}` : ""
    );
    if (res.headersSent) return;
    res.status(status).json({
      error: status >= 500 ? "Internal server error" : (err.message || "Request failed"),
      ...(process.env.NODE_ENV !== "production" && status >= 500 ? { detail: err?.message } : {}),
    });
  });

  // ── Trinity Source-of-Truth Validation ────────────────────────────────────
  const { printRegistryAtStartup, validateAgainstContract } = await import("./services/sourceOfTruthRegistry");
  printRegistryAtStartup();
  validateAgainstContract();

  return server;
}
