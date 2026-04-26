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

export default router;
