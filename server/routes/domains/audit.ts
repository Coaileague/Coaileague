// Domain Audit & Platform Ops — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api-docs, /api/audit/*, /api/dashboard, /api/analytics,
//   /api/analytics/owner, /api/insights, /api/metrics, /api/export, /api/reports,
//   /api/resilience, /api/infrastructure, /api/kpi-alerts, /api/commands,
//   /api/admin, /api/platform, /api/sandbox, /api/deletion-protection
// NOTE: /api/alerts/* is owned by the COMMS domain (commInlineRoutes.ts)
import { sanitizeError } from '../../middleware/errorHandler';
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { requireManager, requirePlatformStaff } from "../../rbac";
import { exportLimiter } from "../../middleware/rateLimiter";
import { registerHealthRoutes } from "../health";
import { registerSearchRoutes } from "../searchRoutes";
import { registerPrivacyRoutes } from "../privacyRoutes";
import { scheduleRetentionSweep } from "../../services/retentionEnforcementService";
import { universalAudit } from "../../services/universalAuditService";
import apiDocsRouter from "../apiDocsRoutes";
import { commandDocRouter } from "../command-documentation";
import dashboardRoutes from "../dashboardRoutes";
import infrastructureRoutes from "../infrastructureRoutes";
import sandboxRoutes from "../sandbox-routes";
import adminRouter from "../adminRoutes";
import adminAiCostsRouter from "../admin/aiCosts";
import databaseParityRouter from "../database-parity";
import middlewareQualityRouter from "../middleware-quality";
import platformRouter, { publicPlatformRouter } from "../platformRoutes";
import auditRouter from "../auditRoutes";
import analyticsInlineRouter from "../analyticsRoutes";
import { ownerAnalyticsRouter } from "../ownerAnalytics";
import biAnalyticsRouter from "../biAnalyticsRoutes";
import exportRouter from "../exportRoutes";
import metricsRouter from "../metricsRoutes";
import kpiAlertRouter from "../kpiAlertRoutes";
import insightsRouter from "../insightsRoutes";
import miscRouter from "../miscRoutes";
import sraRouter from "../sra/index";
import reportsRouter from "../reportsRoutes";
import resilienceRouter from "../resilience-api";
import deletionProtectionRouter from "../deletionProtectionRoutes";
import adminPermissionRouter from "../adminPermissionRoutes";
import alertConfigRouter from "../alertConfigRoutes";
import adminDevExecuteRouter from "../adminDevExecuteRoute";

export function mountAuditRoutes(app: Express): void {
  registerHealthRoutes(app, requireAuth);
  registerSearchRoutes(app, requireAuth);
  registerPrivacyRoutes(app, requireAuth);
  scheduleRetentionSweep();

  app.use("/api/alerts/config", requireAuth, ensureWorkspaceAccess, alertConfigRouter);
  app.use("/api-docs", apiDocsRouter);

  // Inline audit trail handlers (universalAudit service)
  app.get("/api/audit/trail", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const { entityType, entityId, actorType, actionPrefix, startDate, endDate, limit, offset } = req.query;
      const result = await universalAudit.getWorkspaceHistory(workspaceId, {
        entityType: entityType as string | undefined,
        entityId: entityId as string | undefined,
        actorType: actorType as string | undefined,
        actionPrefix: actionPrefix as string | undefined,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: Math.min(Math.max(1, limit ? parseInt(limit as string) : 100), 500),
        offset: offset ? parseInt(offset as string) : 0,
      });
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/audit/entity/:type/:id", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      const { type, id } = req.params;
      const clampedLimit = Math.min(Math.max(req.query.limit ? parseInt(req.query.limit as string) : 50, 1), 500);
      const result = await universalAudit.getEntityHistory(type, id, workspaceId, clampedLimit);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/audit/user/:userId", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      const { userId } = req.params;
      const clampedLimit = Math.min(Math.max(req.query.limit ? parseInt(req.query.limit as string) : 50, 1), 500);
      const result = await universalAudit.getUserHistory(userId, workspaceId, clampedLimit);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/audit/bot/:botName", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const { botName } = req.params;
      const clampedLimit = Math.min(Math.max(req.query.limit ? parseInt(req.query.limit as string) : 50, 1), 500);
      const result = await universalAudit.getBotHistory(botName, workspaceId, clampedLimit);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.get("/api/audit/workspace/summary", requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const result = await universalAudit.getWorkspaceSummary(workspaceId);
      res.json(result);
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

  app.use("/api/dashboard", requireAuth, ensureWorkspaceAccess, dashboardRoutes);
  app.use("/api/infrastructure", requireAuth, infrastructureRoutes);
  app.use("/api/sandbox", sandboxRoutes);
  app.use("/api/admin/ai-costs", requirePlatformStaff, adminAiCostsRouter);
  app.use("/api/admin/database-parity", requireAuth, requirePlatformStaff, databaseParityRouter);
  app.use("/api/admin/middleware-quality", requireAuth, requirePlatformStaff, middlewareQualityRouter);
  // dev-execute must be mounted before adminRouter (which gates everything with requirePlatformStaff)
  app.use("/api/admin", adminDevExecuteRouter);
  app.use("/api/admin", adminRouter);
  // publicPlatformRouter must be mounted BEFORE platformRouter so routes like /announcements
  // (requireAuth only) are reachable by all users without the requirePlatformStaff guard.
  app.use("/api/platform", publicPlatformRouter);
  app.use("/api/platform", platformRouter);
  app.use("/api", requireAuth, ensureWorkspaceAccess, auditRouter);
  // MOUNT ORDER: specific sub-paths MUST come before the general /analytics catch-all
  app.use("/api/analytics/owner", requireAuth, ensureWorkspaceAccess, ownerAnalyticsRouter);
  // Phase 34 — BI Analytics routes (precomputed aggregates, 4-tab dashboard data)
  app.use("/api/analytics/bi", ensureWorkspaceAccess, biAnalyticsRouter);
  app.use("/api/analytics", requireAuth, ensureWorkspaceAccess, analyticsInlineRouter);
  app.use("/api/deletion-protection", requireAuth, ensureWorkspaceAccess, deletionProtectionRouter);
  // Phase 33 — State Regulatory Auditor portal (uses its own requireSRAAuth, not the main requireAuth)
  app.use("/api/sra", sraRouter);

  app.use("/api/resilience", resilienceRouter);
  // G24-05 fix: exportLimiter (10 per 10 min per workspace) on bulk data export endpoints.
  app.use("/api/reports", exportLimiter, requireAuth, ensureWorkspaceAccess, reportsRouter);
  app.use("/api/export", exportLimiter, exportRouter);
  app.use("/api/metrics", metricsRouter);
  app.use("/api/commands", commandDocRouter);
  app.use("/api/kpi-alerts", kpiAlertRouter);
  app.use("/api/insights", requireAuth, ensureWorkspaceAccess, insightsRouter);
  // Predict & patterns routes have full /api/predict/*, /api/patterns/* paths inside insightsRouter
  app.use((req: any, res: any, next: any) => {
    if (req.path.startsWith("/api/predict") || req.path.startsWith("/api/patterns")) {
      return insightsRouter(req, res, next);
    }
    next();
  });
  app.use(miscRouter);
  app.use("/api/admin/permissions", requireAuth, adminPermissionRouter);
}
