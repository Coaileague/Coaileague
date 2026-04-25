// Domain Billing & Finance — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/billing/*, /api/finance/*, /api/stripe, /api/credits, /api/invoices, /api/trinity/revenue
import { sanitizeError } from '../../middleware/errorHandler';
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { requireManager } from "../../rbac";
import { financialLimiter } from "../../middleware/rateLimiter";
import { billingRouter } from "../billing-api";
import upsellRouter from "../upsellRoutes";
import { quickbooksSyncRouter } from "../quickbooks-sync";
import financeInlineRouter from "../financeInlineRoutes";
import { timesheetInvoiceRouter } from "../timesheetInvoiceRoutes";
import trinityRevenueRouter from "../trinityRevenueRoutes";
import disputeRouter from "../disputeRoutes";
import financeSettingsRouter from "../financeSettingsRoutes";
import invoiceRouter from "../invoiceRoutes";
import { billingSettingsRouter } from "../billingSettingsRoutes";
import qbReportsRouter from "../qbReportsRoutes";
import budgetRouter from "../budgetRoutes";
import quickbooksPhase3Router from "../quickbooksPhase3Routes";
import financialIntelligenceRouter from "../financialIntelligence";
import financeNewRouter, { icalPublicRouter } from "../financeRoutes";
import stripeInlineRouter from "../stripeInlineRoutes";
import usageRouter from "../usageRoutes";
import revenueRecognitionRouter from "../financialReporting/revenueRecognitionRoutes";
import { billingReconciliation } from "../../services/billing/billingReconciliation";
import { orgBillingService } from "../../services/billing/orgBillingService";
import { blockFinancialData } from "../../middleware/auditorGuard";
import { trinityTokenMeteringService } from "../../services/billing/trinityTokenMeteringService";

export function mountBillingRoutes(app: Express): void {
  // Property 3: Block auditor sessions from ALL financial paths automatically.
  // This middleware runs before every billing/finance/stripe/credits/invoices route,
  // so even new routes added in the future are protected without manual tagging.
  const financialPrefixes = [
    "/api/billing",
    "/api/finance",
    "/api/stripe",
    "/api/credits",
    "/api/usage",
    "/api/invoices",
    "/api/trinity/revenue",
    "/api/timesheet-invoices",
    "/api/disputes",
    "/api/billing-settings",
    "/api/qb-reports",
    "/api/budgets",
    "/api/quickbooks",
  ];
  app.use(financialPrefixes, blockFinancialData);
  // G24-05 fix: Financial rate limiter (30/min per workspace+IP) on all financial paths.
  app.use(financialPrefixes, financialLimiter);

  app.use("/api/billing/upsell", requireAuth, upsellRouter);
  app.use("/api/billing", billingRouter);
  app.use(quickbooksSyncRouter);

  // Inline billing usage dashboards (manager only). Duplicate /reconcile and
  // /transactions handlers were removed because /api/billing is mounted above
  // and billingRouter already owns those canonical paths.
  

  

  // GET /api/billing/org-summary — full billing health for the current workspace
  

  // GET /api/billing/usage-breakdown — AI spend by feature category for current period
  

  

  // Stripe MUST be registered before any app.use("/api", requireAuth, ...) calls.
  // Lines below use "/api" as a prefix which applies requireAuth to ALL /api/* paths.
  // If stripeInlineRouter is registered after those, the Stripe webhook at
  // /api/stripe/webhook (which is unauthenticated by design) gets blocked with 401
  // before it ever reaches the router. Registering it first ensures the webhook
  // matches and responds before the generic /api auth guards run.
  app.use("/api/stripe", stripeInlineRouter);
  // Canonical token-usage prefix. /api/credits/* is retained as a thin alias
  // for legacy frontend bundles and returns 410 on /purchase and /packs.
  app.use("/api/usage", usageRouter);
  app.use("/api/credits", usageRouter);

  app.use("/api", requireAuth, ensureWorkspaceAccess, financeInlineRouter);
  app.use("/api/timesheet-invoices", requireAuth, ensureWorkspaceAccess, timesheetInvoiceRouter);
  app.use("/api/trinity/revenue", requireAuth, trinityRevenueRouter);
  app.use("/api/disputes", requireAuth, ensureWorkspaceAccess, disputeRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, financeSettingsRouter);
  app.use("/api/invoices", requireAuth, ensureWorkspaceAccess, invoiceRouter);
  app.use("/api/billing-settings", requireAuth, ensureWorkspaceAccess, billingSettingsRouter);
  app.use("/api/qb-reports", requireAuth, ensureWorkspaceAccess, qbReportsRouter);
  app.use("/api/budgets", requireAuth, ensureWorkspaceAccess, budgetRouter);
  app.use("/api/quickbooks/phase3", requireAuth, ensureWorkspaceAccess, quickbooksPhase3Router);
  app.use("/api/finance", requireAuth, ensureWorkspaceAccess, financialIntelligenceRouter);
  app.use("/api/finance", requireAuth, ensureWorkspaceAccess, financeNewRouter);
  app.use("/api/finance", requireAuth, ensureWorkspaceAccess, revenueRecognitionRouter);
  app.use(icalPublicRouter);

  // ── Phase 16A: Trinity Token Metering ────────────────────────────────────
  // GET /api/billing/trinity/today — daily token usage report
  

  // GET /api/billing/trinity/month/:year/:month — monthly token usage report
  

  // GET /api/billing/trinity/unbilled — unbilled usage ready for invoicing
  
}
