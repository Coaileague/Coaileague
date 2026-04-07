// Domain Scheduling — Route Mounts
// THE LAW: No new routes without Bryan's approval.
// Canonical prefixes: /api/scheduler, /api/schedules, /api/scheduling, /api/shifts,
//   /api/calendar, /api/coverage, /api/post-orders, /api/shift-chatrooms,
//   /api/trinity/scheduling, /api/trinity-staffing, /api/public/trinity-staffing,
//   /api/staffing (staffing broadcast — public accept + per-route auth)
import crypto from 'crypto';
import { sanitizeError } from '../../middleware/errorHandler';
import type { Express } from "express";
import { requireAuth } from "../../auth";
import { ensureWorkspaceAccess } from "../../middleware/workspaceScope";
import { registerAutonomousSchedulingRoutes } from "../autonomousSchedulingRoutes";
import approvalRoutes from "../approvalRoutes";
import schedulerRouter from "../schedulerRoutes";
import orchestratedScheduleRouter from "../orchestratedScheduleRoutes";
import { coverageRouter } from "../coverageRoutes";
import { calendarRouter } from "../calendarRoutes";
import { advancedSchedulingRouter } from "../advancedSchedulingRoutes";
import aiSchedulingRoutes from "../aiSchedulingRoutes";
import shiftInlineRouter from "../shiftRoutes";
import scheduleosRouter from "../scheduleosRoutes";
import trinitySchedulingRouter from "../trinitySchedulingRoutes";
import trinityStaffingRouter, { publicWebhookRouter as trinityStaffingPublicRouter } from "../trinityStaffingRoutes";
import shiftChatroomRouter from "../shiftChatroomRoutes";
import postOrderRouter from "../postOrderRoutes";
import schedulingInlineRouter from "../schedulingInlineRoutes";
import schedulesRouter from "../schedulesRoutes";
import { staffingBroadcastRouter } from "../staffingBroadcastRoutes";
import shiftTradingRouter, { registerShiftTradingActions } from "../shiftTradingRoutes";
import { createLogger } from '../../lib/logger';
const log = createLogger('SchedulingDomain');


export function mountSchedulingRoutes(app: Express): void {
  // Internal-only auto-fill endpoint (localhost IP + service key required)
  app.post("/api/trinity/scheduling/auto-fill-internal", async (req: any, res: any) => {
    const ip = req.ip || req.connection?.remoteAddress || "";
    const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
    if (!isLocal) return res.status(403).json({ message: "Internal only" });
    const internalKey = req.headers["x-internal-service-key"];
    const expectedKey = process.env.INTERNAL_SERVICE_KEY;
    if (!expectedKey) {
      log.error(`[Security] INTERNAL_SERVICE_KEY env var is not set — auto-fill-internal endpoint is disabled`);
      return res.status(503).json({ message: "Internal scheduling endpoint unavailable: service key not configured" });
    }
    const internalKeyBuf = Buffer.from(String(internalKey ?? ''));
    const expectedKeyBuf = Buffer.from(expectedKey);
    const keysMatch = internalKeyBuf.length === expectedKeyBuf.length &&
      crypto.timingSafeEqual(internalKeyBuf, expectedKeyBuf);
    if (!keysMatch) {
      log.warn(`[Security] auto-fill-internal rejected: missing/invalid service key from ${ip}`);
      return res.status(403).json({ message: "Internal service key required" });
    }
    try {
      const { workspaceId: bodyWorkspaceId, mode = "full_month", prioritizeBy = "chronological", useContractorFallback = true } = req.body;
      const workspaceId = bodyWorkspaceId;
      if (!workspaceId) return res.status(400).json({ message: "workspaceId required" });
      log.info(`[auto-fill-internal] Scheduling request for workspace: ${workspaceId}`);
      const { trinityAutonomousScheduler } = await import("../../services/scheduling/trinityAutonomousScheduler");
      const result = await trinityAutonomousScheduler.executeAutonomousScheduling({
        workspaceId,
        userId: "system-stress-test",
        mode,
        prioritizeBy,
        useContractorFallback,
        maxShiftsPerEmployee: 0,
        respectAvailability: true,
      });
      res.json({
        success: result.success,
        totalProcessed: result.summary?.totalProcessed || 0,
        totalAssigned: result.summary?.totalAssigned || 0,
        totalFailed: result.summary?.totalFailed || 0,
        daysProcessed: result.summary?.daysProcessed || 0,
        avgConfidence: result.summary?.avgConfidence || 0,
      });
    } catch (error: unknown) {
      res.status(500).json({ message: sanitizeError(error) });
    }
  });

  app.use("/api/approvals", requireAuth, ensureWorkspaceAccess, approvalRoutes);
  registerAutonomousSchedulingRoutes(app);
  app.use("/api/scheduler", requireAuth, ensureWorkspaceAccess, schedulerRouter);
  app.use("/api/orchestrated-schedule", requireAuth, ensureWorkspaceAccess, orchestratedScheduleRouter);
  app.use("/api/coverage", requireAuth, ensureWorkspaceAccess, coverageRouter);
  app.use("/api/calendar", requireAuth, ensureWorkspaceAccess, calendarRouter);
  app.use("/api/scheduling", requireAuth, ensureWorkspaceAccess, advancedSchedulingRouter);
  app.use("/api/ai/scheduling", requireAuth, ensureWorkspaceAccess, aiSchedulingRoutes);
  app.use("/api/shifts", requireAuth, ensureWorkspaceAccess, shiftInlineRouter);
  app.use("/api/scheduleos", requireAuth, ensureWorkspaceAccess, scheduleosRouter);
  app.use("/api/trinity-staffing", requireAuth, ensureWorkspaceAccess, trinityStaffingRouter);
  app.use("/api/public/trinity-staffing", trinityStaffingPublicRouter);
  app.use("/api/trinity/scheduling", requireAuth, ensureWorkspaceAccess, trinitySchedulingRouter);
  app.use("/api/shift-chatrooms", requireAuth, ensureWorkspaceAccess, shiftChatroomRouter);
  app.use("/api/post-orders", requireAuth, ensureWorkspaceAccess, postOrderRouter);
  app.use("/api/scheduling", requireAuth, ensureWorkspaceAccess, schedulingInlineRouter);
  app.use("/api/schedules", requireAuth, ensureWorkspaceAccess, schedulesRouter);
  // Staffing broadcast — public accept link (no auth) + authenticated management routes (per-route auth)
  app.use("/api/staffing", staffingBroadcastRouter);
  // Phase 35F — Shift Trading Marketplace + Officer Availability
  app.use("/api/shift-trading", requireAuth, ensureWorkspaceAccess, shiftTradingRouter);
  registerShiftTradingActions();
}
