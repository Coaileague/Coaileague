import { sanitizeError } from '../middleware/errorHandler';
import { validateAdminHourlyRate, businessRuleResponse } from '../lib/businessRules';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { workspaces } from "@shared/schema";
import { requireAuth } from "../auth";
import { readLimiter } from "../middleware/rateLimiter";
import { requireManager, requirePlatformStaff, attachWorkspaceId, type AuthenticatedRequest } from "../rbac";
import { aiSchedulingTriggerService } from "../services/aiSchedulingTriggerService";
import { createLogger } from '../lib/logger';
const log = createLogger('AutomationInlineRoutes');


const router = Router();

router.get('/job-history', requirePlatformStaff, async (_req, res) => {
  try {
    const { getJobExecutionHistory } = await import('../services/autonomousScheduler');
    const history = getJobExecutionHistory();
    const last100 = history.slice(-100);
    res.json({ entries: last100, total: history.length });
  } catch (error: unknown) {
    res.status(500).json({ message: 'Failed to retrieve job history', error: sanitizeError(error) });
  }
});

router.get('/job-summary', requirePlatformStaff, async (_req, res) => {
  try {
    const { getScheduledJobsSummary } = await import('../services/autonomousScheduler');
    const summary = getScheduledJobsSummary();
    res.json({ jobs: summary, totalJobs: summary.length });
  } catch (error: unknown) {
    res.status(500).json({ message: 'Failed to retrieve job summary', error: sanitizeError(error) });
  }
});

router.get("/triggers", requireAuth, attachWorkspaceId, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });

    const workspace = await storage.getWorkspace(workspaceId);

    res.json({
      success: true,
      triggers: [
        { id: 'shift_reminder', automationType: 'Shift Reminders', enabled: true, type: 'schedule' },
        { id: 'timesheet_review', automationType: 'Timesheet Auto-Review', enabled: true, type: 'payroll' },
        { id: 'compliance_check', automationType: 'Compliance Check', enabled: true, type: 'compliance' },
        { id: 'onboarding_flow', automationType: 'Onboarding Automation', enabled: true, type: 'onboarding' },
        { id: 'overtime_alert', automationType: 'Overtime Alerts', enabled: true, type: 'schedule' },
      ],
      workspaceId,
    });
  } catch (error: unknown) {
    log.error('Automation triggers error:', error);
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.post("/trigger-ai-schedule", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const result = await aiSchedulingTriggerService.triggerAIScheduleGeneration(workspaceId);

    res.json({ 
      success: result.success,
      data: result,
    });
  } catch (error: unknown) {
    log.error('Error triggering AI schedule:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/ai-schedule-status", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const status = await aiSchedulingTriggerService.getAISchedulingStatus(workspaceId);

    res.json({ 
      success: true,
      data: status,
    });
  } catch (error: unknown) {
    log.error('Error fetching AI schedule status:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.post("/admin-hourly-rate", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { hourlyRate } = req.body;

    if (!hourlyRate || typeof hourlyRate !== 'number') {
      return res.status(400).json({ error: "Invalid hourly rate - must be a number" });
    }

    if (businessRuleResponse(res, [validateAdminHourlyRate(hourlyRate, 'hourlyRate')])) return;

    const { setWorkspaceAdminHourlyRate } = await import("../services/automationMetrics");
    await setWorkspaceAdminHourlyRate(workspaceId, hourlyRate);

    res.json({
      success: true,
      message: `Admin hourly rate set to $${hourlyRate}/hour`,
      hourlyRate,
    });
  } catch (error: unknown) {
    log.error('Error setting admin hourly rate:', error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to set hourly rate" });
  }
});

router.get("/admin-hourly-rate", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    const config = (workspace as any)?.config as any;
    const hourlyRate = config?.adminHourlyRate || 35;

    res.json({
      success: true,
      hourlyRate,
    });
  } catch (error: unknown) {
    log.error('Error fetching admin hourly rate:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
