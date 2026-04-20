/**
 * Maintenance Mode API Routes
 * ============================
 * Public and admin endpoints for maintenance mode management.
 * 
 * Auth tiers:
 *  - PUBLIC: /status, /window (frontend needs these to show maintenance banners)
 *  - requireAuth + requirePlatformAdmin: all human-triggered admin actions
 *  - Trinity internal header (DIAG_BYPASS_SECRET) + fallback to platform admin: orchestrator routes
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { z } from 'zod';
import { maintenanceModeService } from '../services/maintenanceModeService';
import { trinityMaintenanceOrchestrator, DiagnosticsReport } from '../services/trinityMaintenanceOrchestrator';
import { requireAuth } from '../auth';
import { requirePlatformAdmin, requirePlatformStaff } from '../rbac';
import { createLogger } from '../lib/logger';
import { db } from '../db';
import { cronRunLog } from '@shared/schema';
import { desc } from 'drizzle-orm';
const log = createLogger('MaintenanceRoutes');


const router = Router();

const activateSchema = z.object({
  reason: z.string().min(1),
  estimatedDurationMinutes: z.number().min(1).max(480).default(30),
  statusMessage: z.string().optional(),
  triadReportId: z.string().optional()
});

const updateProgressSchema = z.object({
  progressPercent: z.number().min(0).max(100),
  statusMessage: z.string().optional()
});

const diagnosticsReportSchema = z.object({
  runId: z.string(),
  criticalIssues: z.number().min(0),
  highIssues: z.number().min(0),
  mediumIssues: z.number().min(0),
  lowIssues: z.number().min(0),
  totalIssues: z.number().min(0),
  estimatedFixTimeMinutes: z.number().min(0),
  requiresDowntime: z.boolean(),
  affectedSystems: z.array(z.string())
});

/**
 * Middleware: accept either a valid DIAG_BYPASS_SECRET header (Trinity internal calls)
 * or a fully authenticated platform admin user. Rejects if neither condition is met.
 */
function requireTrinityOrAdmin(req: any, res: any, next: any) {
  const diagSecret = process.env.DIAG_BYPASS_SECRET;
  const suppliedSecret = req.headers['x-diagnostics-runner'];
  const trinityActor = req.headers['x-trinity-actor'];

  // Accept Trinity internal calls only when DIAG_BYPASS_SECRET is set AND matches
  if (diagSecret && diagSecret.length >= 16 && suppliedSecret === diagSecret) {
    return next();
  }

  // Accept Trinity actor header ONLY when combined with a valid DIAG_BYPASS_SECRET match
  // (prevents spoofing with just x-trinity-actor: trinity)
  if (trinityActor === 'trinity' && diagSecret && diagSecret.length >= 16 && suppliedSecret === diagSecret) {
    return next();
  }

  // Fallback: allow platform admins via session auth
  requireAuth(req, res, () => {
    requirePlatformAdmin(req, res, next);
  });
}

// ============================================================================
// PUBLIC ENDPOINTS (intentionally no auth — needed by the maintenance page)
// ============================================================================

router.get('/api/maintenance/status', async (req, res) => {
  try {
    const status = await maintenanceModeService.getPublicStatus();
    res.json({ success: true, ...status });
  } catch (error: unknown) {
    log.error('[Maintenance] Status error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/maintenance/window', async (req, res) => {
  try {
    const window = await maintenanceModeService.getMaintenanceWindow();
    res.json({ success: true, window });
  } catch (error: unknown) {
    log.error('[Maintenance] Window error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// PLATFORM ADMIN ENDPOINTS
// ============================================================================

router.post('/api/maintenance/activate', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = req.user;
    const data = activateSchema.parse(req.body);

    const result = await maintenanceModeService.activateMaintenance({
      reason: data.reason,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
      activatedBy: {
        type: 'admin',
        // @ts-expect-error — TS migration: fix in refactoring sprint
        id: user.id,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        name: user.email || (user as any).username
      },
      statusMessage: data.statusMessage,
      triadReportId: data.triadReportId
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[Maintenance] Activate error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/maintenance/activate-trinity', requireTrinityOrAdmin, async (req, res) => {
  try {
    const data = activateSchema.parse(req.body);

    const result = await maintenanceModeService.activateMaintenance({
      reason: data.reason,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
      activatedBy: {
        type: 'trinity',
        id: 'trinity-brain',
        name: 'Trinity AI'
      },
      statusMessage: data.statusMessage,
      triadReportId: data.triadReportId
    });

    res.json(result);
  } catch (error: unknown) {
    log.error('[Maintenance] Trinity activate error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/maintenance/deactivate', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const user = req.user;
    const trinityHeader = req.headers['x-trinity-actor'];

    let deactivatedBy: { type: 'admin' | 'trinity' | 'system'; id?: string; name?: string };

    if (trinityHeader === 'trinity') {
      deactivatedBy = { type: 'trinity', id: 'trinity-brain', name: 'Trinity AI' };
    } else {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      deactivatedBy = { type: 'admin', id: user.id, name: user.email };
    }

    const result = await maintenanceModeService.deactivateMaintenance(deactivatedBy);
    res.json(result);
  } catch (error: unknown) {
    log.error('[Maintenance] Deactivate error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/maintenance/progress', requireAuth, requirePlatformAdmin, async (req, res) => {
  try {
    const data = updateProgressSchema.parse(req.body);
    await maintenanceModeService.updateProgress(data.progressPercent, data.statusMessage);
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('[Maintenance] Progress error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/maintenance/can-auto-activate', requirePlatformStaff, async (req, res) => {
  try {
    const canActivate = await maintenanceModeService.shouldAutoActivate();
    const window = await maintenanceModeService.getMaintenanceWindow();

    res.json({
      success: true,
      canAutoActivate: canActivate,
      currentlyActive: window.isActive,
      lowTrafficWindow: canActivate
    });
  } catch (error: unknown) {
    log.error('[Maintenance] Auto-activate check error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// ORCHESTRATOR ENDPOINTS (Trinity internal + platform admin fallback)
// ============================================================================

router.post('/api/maintenance/orchestrator/trigger', requireTrinityOrAdmin, async (req, res) => {
  try {
    const report = diagnosticsReportSchema.parse(req.body.report);
    const immediate = req.body.immediate === true;

    const result = await trinityMaintenanceOrchestrator.triggerMaintenance({
      report,
      immediate
    });

    // @ts-expect-error — TS migration: fix in refactoring sprint
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    log.error('[Maintenance] Orchestrator trigger error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post('/api/maintenance/orchestrator/complete', requireTrinityOrAdmin, async (req, res) => {
  try {
    const result = await trinityMaintenanceOrchestrator.completeMaintenance();
    // @ts-expect-error — TS migration: fix in refactoring sprint
    res.json({ success: true, ...result });
  } catch (error: unknown) {
    log.error('[Maintenance] Orchestrator complete error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/maintenance/orchestrator/status', requirePlatformStaff, async (req, res) => {
  try {
    const status = await trinityMaintenanceOrchestrator.getStatus();
    res.json({ success: true, ...status });
  } catch (error: unknown) {
    log.error('[Maintenance] Orchestrator status error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/api/maintenance/orchestrator/next-window', requirePlatformStaff, async (req, res) => {
  try {
    const nextWindow = trinityMaintenanceOrchestrator.getNextMaintenanceWindow();
    const isWithinWindow = trinityMaintenanceOrchestrator.isWithinMaintenanceWindow();

    res.json({
      success: true,
      nextWindow: nextWindow.toISOString(),
      isWithinWindow,
      formattedTime: nextWindow.toLocaleString()
    });
  } catch (error: unknown) {
    log.error('[Maintenance] Next window error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// Scheduler health: last 10 executions per job, grouped by jobName, pulled
// from `cron_run_log`. Consumed by the Platform Ops "Scheduler" tab.
router.get('/api/maintenance/scheduler/jobs', requirePlatformStaff, async (req, res) => {
  try {
    const jobs = await db.select()
      .from(cronRunLog)
      .orderBy(desc(cronRunLog.startedAt))
      .limit(300);

    const grouped: Record<string, typeof jobs> = {};
    for (const job of jobs) {
      if (!grouped[job.jobName]) grouped[job.jobName] = [];
      if (grouped[job.jobName].length < 10) grouped[job.jobName].push(job);
    }

    res.json({ jobs: grouped, totalJobs: Object.keys(grouped).length });
  } catch (error: unknown) {
    log.error('[Maintenance] Scheduler jobs fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
