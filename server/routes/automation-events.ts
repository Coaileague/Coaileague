/**
 * Automation Events API Routes
 * 
 * Provides end-user visibility into automation job status:
 * - GET /api/automation/events - List recent automation events
 * - GET /api/automation/stats - Get automation statistics
 * - POST /api/automation/retry/:jobId - Retry a failed job
 */

import { Router } from 'express';
import { automationEventsService, type AutomationJobType, type JobStatus } from '../services/automationEventsService';
import { requirePlatformStaff, requireManagerOrPlatformStaff , requireManager } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('AutomationEvents');


const router = Router();

/**
 * GET /api/automation/events
 * Returns recent automation job events
 */
router.get('/events', requireManagerOrPlatformStaff, async (req, res) => {
  try {
    const { type, status, workspaceId, limit } = req.query;
    
    const events = automationEventsService.getRecentEvents({
      type: type as AutomationJobType | undefined,
      status: status as JobStatus | undefined,
      workspaceId: workspaceId as string | undefined,
      limit: Math.min(Math.max(1, limit ? parseInt(limit as string, 10) : 50), 200),
    });

    res.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    log.error('[AutomationEvents API] Error fetching events:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch automation events' 
    });
  }
});

/**
 * GET /api/automation/stats
 * Returns automation job statistics
 */
router.get('/stats', requireManagerOrPlatformStaff, async (req, res) => {
  try {
    const { type } = req.query;
    
    const stats = await automationEventsService.getStats(
      type as AutomationJobType | undefined
    );

    const summary = {
      totalJobsToday: 0,
      successfulToday: 0,
      failedToday: 0,
      overallSuccessRate: 0,
    };

    let totalJobs = 0;
    let successfulJobs = 0;
    
    for (const stat of Object.values(stats)) {
      totalJobs += stat.totalJobs;
      successfulJobs += stat.successfulJobs;
      summary.failedToday += stat.failedJobs;
    }

    summary.totalJobsToday = totalJobs;
    summary.successfulToday = successfulJobs;
    summary.overallSuccessRate = totalJobs > 0 
      ? Math.round((successfulJobs / totalJobs) * 100) 
      : 100;

    res.json({
      success: true,
      stats,
      summary,
    });
  } catch (error) {
    log.error('[AutomationEvents API] Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch automation stats' 
    });
  }
});

/**
 * POST /api/automation/retry/:jobId
 * Request retry for a failed automation job
 */
router.post('/retry/:jobId', requirePlatformStaff, async (req, res) => {
  try {
    const { jobId } = req.params;
    
    const result = await automationEventsService.requestRetry(jobId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        newJobId: result.newJobId,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.message,
      });
    }
  } catch (error) {
    log.error('[AutomationEvents API] Error retrying job:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to retry job' 
    });
  }
});

/**
 * GET /api/automation/jobs
 * Returns list of configured automation jobs with their schedules
 */
router.get('/jobs', requireManagerOrPlatformStaff, async (req, res) => {
  try {
    const jobSchedules: Record<AutomationJobType, string> = {
      invoicing: 'Daily at 2 AM',
      payroll: 'Biweekly',
      scheduling: 'Weekly on Sunday',
      compliance: 'Daily at 8 AM',
      cleanup: 'Daily at 3 AM',
      credit_reset: 'Monthly on 1st',
      email_automation: 'Twice daily (9 AM, 3 PM)',
      shift_reminders: 'Every 5 minutes',
      ai_billing: 'Weekly on Sunday',
      platform_monitor: 'Every 15 minutes',
      ws_cleanup: 'Every 30 minutes',
      room_auto_close: 'Every hour',
      trial_expiry: 'Daily at 6 AM',
    };

    const jobLabels: Record<AutomationJobType, string> = {
      invoicing: 'Invoice Generation',
      payroll: 'Payroll Processing',
      scheduling: 'Schedule Generation',
      compliance: 'Compliance Check',
      cleanup: 'Data Cleanup',
      credit_reset: 'Credit Reset',
      email_automation: 'Email Automation',
      shift_reminders: 'Shift Reminders',
      ai_billing: 'AI Overage Billing',
      platform_monitor: 'Platform Monitor',
      ws_cleanup: 'WebSocket Cleanup',
      room_auto_close: 'Room Auto-Close',
      trial_expiry: 'Trial Expiry Check',
    };

    const stats = await automationEventsService.getStats();
    const allTypes: AutomationJobType[] = [
      'invoicing', 'payroll', 'scheduling', 'compliance', 'cleanup',
      'credit_reset', 'email_automation', 'shift_reminders', 'ai_billing',
      'platform_monitor', 'ws_cleanup', 'room_auto_close', 'trial_expiry',
    ];

    const jobs = allTypes.map(type => ({
      type,
      label: jobLabels[type],
      schedule: jobSchedules[type],
      enabled: true,
      lastRun: stats[type]?.lastRun || null,
      totalJobs: stats[type]?.totalJobs || 0,
      successRate: stats[type]?.successRate ?? 100,
      averageDuration: stats[type]?.averageDuration || 0,
    }));

    res.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    log.error('[AutomationEvents API] Error fetching jobs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch automation jobs' 
    });
  }
});

export default router;
