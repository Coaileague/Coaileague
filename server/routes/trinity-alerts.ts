/**
 * TRINITY ALERTS API ROUTES
 * 
 * Endpoints for support staff to:
 * - View pending Trinity alerts
 * - Acknowledge alerts
 * - Trigger manual hotpatches
 * - View hotpatch history
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requirePlatformStaff, AuthenticatedRequest } from '../rbac';
import { trinityAutonomousNotifier, notifySupportStaff } from '../services/ai-brain/trinityAutonomousNotifier';
import rateLimit from 'express-rate-limit';
import { typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('TrinityAlerts');


const router = Router();

// Rate limiter for test alert endpoint (5 per minute per user)
const testAlertLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: { success: false, error: 'Too many test alerts. Please wait before trying again.' },
  // @ts-expect-error — TS migration: fix in refactoring sprint
  keyGenerator: (req: Request) => {
    const authReq = req as AuthenticatedRequest;
    return authReq.user || 'anonymous';
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

// In-memory audit log for test alerts (in production, use proper audit table)
const testAlertAuditLog: Array<{
  userId: string;
  timestamp: Date;
  alertId: string;
  ip: string;
}> = [];

/**
 * GET /api/trinity/alerts
 * Get all pending Trinity alerts (support staff only)
 */
router.get('/alerts', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const alerts = trinityAutonomousNotifier.getPendingAlerts();
    const status = trinityAutonomousNotifier.getStatus();
    
    res.json({
      success: true,
      alerts,
      status,
    });
  } catch (error: unknown) {
    log.error('[TrinityAlerts] Failed to get alerts:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity/status
 * Get Trinity autonomous notifier status
 */
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const status = trinityAutonomousNotifier.getStatus();
    
    res.json({
      success: true,
      status: {
        ...status,
        trinityVersion: '2.0',
        autonomousMode: 'active',
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity/hotpatches
 * Get applied hotpatch history (support staff only)
 */
router.get('/hotpatches', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const hotpatches = trinityAutonomousNotifier.getAppliedHotpatches();
    
    res.json({
      success: true,
      hotpatches,
    });
  } catch (error: unknown) {
    log.error('[TrinityAlerts] Failed to get hotpatches:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity/hotpatch/:patchId/rollback
 * Rollback a specific hotpatch (support staff only)
 */
router.post('/hotpatch/:patchId/rollback', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { patchId } = req.params;
    const success = await trinityAutonomousNotifier.rollbackHotpatch(patchId);
    
    res.json({
      success,
      message: success ? 'Hotpatch rolled back successfully' : 'Failed to rollback hotpatch',
    });
  } catch (error: unknown) {
    log.error('[TrinityAlerts] Failed to rollback hotpatch:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity/test-alert
 * Create a test alert (for testing notification system - support staff only)
 * Rate limited: 5 per minute per user
 */
router.post('/test-alert', requirePlatformStaff, testAlertLimiter, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    
    const alert = await notifySupportStaff({
      severity: 'info',
      category: 'platform',
      title: 'Trinity Self-Test Alert',
      description: `Test alert triggered by ${authReq.user} to verify notification system is working.`,
      suggestedAction: 'No action required - this is a test.',
      autoFixAvailable: false,
      autoFixRisk: 'low',
      workspaceId: authReq.workspaceId,
    });
    
    // Audit trail entry
    testAlertAuditLog.push({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: authReq.user,
      timestamp: new Date(),
      alertId: alert.id,
      ip: req.ip || 'unknown',
    });
    
    // Keep only last 100 entries
    if (testAlertAuditLog.length > 100) {
      testAlertAuditLog.shift();
    }
    
    log.info(`[AUDIT] Test alert created by ${authReq.user} - AlertID: ${alert.id}`);
    
    res.json({
      success: true,
      message: 'Test alert created and broadcast to support staff',
      alertId: alert.id,
    });
  } catch (error: unknown) {
    log.error('[TrinityAlerts] Failed to create test alert:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity/detect
 * Trigger manual issue detection scan (support staff only)
 */
router.post('/detect', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    // Run some basic health checks and create alerts if issues found
    const checks = [
      {
        name: 'Database Connectivity',
        category: 'platform' as const,
        checkFn: async () => {
          try {
            const { db } = await import('../db');
            const { sql } = await import('drizzle-orm');
            // Converted to Drizzle ORM: health check ping
            await db.execute(sql`SELECT 1`);
            return { healthy: true };
          } catch (error: unknown) {
            return { healthy: false, message: sanitizeError(error), suggestedFix: 'Check database connection settings' };
          }
        },
        autoFixRisk: 'high' as const,
      },
      {
        name: 'AI Brain Services',
        category: 'integration' as const,
        checkFn: async () => {
          const hasGemini = !!process.env.GEMINI_API_KEY;
          return {
            healthy: hasGemini,
            message: hasGemini ? undefined : 'Gemini API key not configured',
            suggestedFix: hasGemini ? undefined : 'Add GEMINI_API_KEY to environment variables',
          };
        },
        autoFixRisk: 'medium' as const,
      },
    ];
    
    const alerts = [];
    for (const check of checks) {
      const alert = await trinityAutonomousNotifier.detectAndAlert(check);
      if (alert) {
        alerts.push(alert);
      }
    }
    
    res.json({
      success: true,
      message: `Detection complete. ${alerts.length} issues found.`,
      alertsCreated: alerts.length,
      alerts: alerts.map(a => ({ id: a.id, title: a.title, severity: a.severity })),
    });
  } catch (error: unknown) {
    log.error('[TrinityAlerts] Detection failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity/config
 * Update Trinity autonomous configuration (support staff only)
 */
router.post('/config', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { hotpatchEnabled, autoTicketEnabled } = req.body;
    
    if (typeof hotpatchEnabled === 'boolean') {
      trinityAutonomousNotifier.enableHotpatch(hotpatchEnabled);
    }
    
    if (typeof autoTicketEnabled === 'boolean') {
      trinityAutonomousNotifier.enableAutoTickets(autoTicketEnabled);
    }
    
    res.json({
      success: true,
      message: 'Configuration updated',
      status: trinityAutonomousNotifier.getStatus(),
    });
  } catch (error: unknown) {
    log.error('[TrinityAlerts] Config update failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
