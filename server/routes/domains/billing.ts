// Domain Billing & Finance — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/billing/*, /api/finance/*, /api/stripe, /api/credits, /api/invoices, /api/trinity/revenue
import { sanitizeError } from '../../middleware/errorHandler';
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { requireManager } from "../../rbac";
import { financialLimiter, exportLimiter } from "../../middleware/rateLimiter";
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

  // Inline billing usage and reconciliation (manager only)
  app.get("/api/billing/daily-usage", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const date = req.query.date ? new Date(req.query.date as string) : undefined;
      const result = await billingReconciliation.getDailyUsageSummary(workspaceId, date);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/billing/monthly-usage", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const month = req.query.month ? parseInt(req.query.month as string) : undefined;
      const result = await billingReconciliation.getMonthlyUsageSummary(workspaceId, year, month);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/billing/reconcile", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const result = await billingReconciliation.reconcileCredits(workspaceId);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/billing/transactions", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 200) : 50;
      const result = await billingReconciliation.getRecentTransactions(workspaceId, limit);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  // GET /api/billing/org-summary — full billing health for the current workspace
  app.get("/api/billing/org-summary", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });
      const summary = await orgBillingService.getOrgBillingSummary(workspaceId);
      res.json(summary);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  // GET /api/billing/usage-breakdown — AI spend by feature category for current period
  app.get("/api/billing/usage-breakdown", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace context required" });
      const periodStart = req.query.periodStart ? new Date(req.query.periodStart as string) : undefined;
      const periodEnd = req.query.periodEnd ? new Date(req.query.periodEnd as string) : undefined;
      const breakdown = await orgBillingService.getUsageBreakdown(workspaceId, periodStart, periodEnd);
      res.json(breakdown);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/billing/ai-usage", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const { aiMeteringService } = await import('../../services/billing/aiMeteringService');
      const usage = await aiMeteringService.getCurrentPeriodUsage(workspaceId);
      if (!usage) return res.json({ empty: true });

      const { rows: recentCalls } = await (await import('../../db')).pool.query(`
        SELECT model_name, call_type, total_tokens, cost_microcents, created_at
        FROM ai_call_log
        WHERE workspace_id=$1
        ORDER BY created_at DESC
        LIMIT 20
      `, [workspaceId]);

      const { rows: daily } = await (await import('../../db')).pool.query(`
        SELECT summary_date, total_tokens_k, total_cost_microcents, call_count
        FROM ai_usage_daily_summary
        WHERE workspace_id=$1
        ORDER BY summary_date DESC
        LIMIT 30
      `, [workspaceId]);

      res.json({ ...usage, recentCalls, dailyHistory: daily });
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

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
  app.use("/api/invoices", invoiceRouter);
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
  app.get("/api/billing/trinity/today", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId as string;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const report = await trinityTokenMeteringService.getDailyReport(workspaceId, new Date());
      res.json(report);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  // GET /api/billing/trinity/month/:year/:month — monthly token usage report
  app.get("/api/billing/trinity/month/:year/:month", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId as string;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const year = parseInt(req.params.year as string, 10);
      const month = parseInt(req.params.month as string, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        return res.status(400).json({ error: "Invalid year or month" });
      }
      const report = await trinityTokenMeteringService.getMonthlyReport(workspaceId, year, month);
      res.json(report);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  // GET /api/billing/trinity/unbilled — unbilled usage ready for invoicing
  app.get("/api/billing/trinity/unbilled", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId as string;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const unbilled = await trinityTokenMeteringService.getUnbilledUsage(workspaceId);
      res.json({
        workspaceId,
        ...unbilled,
        readyToInvoice: unbilled.totalCostUsd > 0,
      });
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });
}
