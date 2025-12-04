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
import { requirePlatformStaff, requireManagerOrPlatformStaff } from '../rbac';

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
      limit: limit ? parseInt(limit as string, 10) : 50,
    });

    res.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    console.error('[AutomationEvents API] Error fetching events:', error);
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
    console.error('[AutomationEvents API] Error fetching stats:', error);
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
    console.error('[AutomationEvents API] Error retrying job:', error);
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
    const jobs = [
      { type: 'invoicing', label: 'Invoice Generation', schedule: 'Daily at 2 AM', enabled: true },
      { type: 'payroll', label: 'Payroll Processing', schedule: 'Biweekly', enabled: true },
      { type: 'scheduling', label: 'Schedule Generation', schedule: 'Weekly on Sunday', enabled: true },
      { type: 'compliance', label: 'Compliance Check', schedule: 'Daily at 8 AM', enabled: true },
      { type: 'cleanup', label: 'Data Cleanup', schedule: 'Daily at 3 AM', enabled: true },
      { type: 'credit_reset', label: 'Credit Reset', schedule: 'Monthly on 1st', enabled: true },
      { type: 'email_automation', label: 'Email Automation', schedule: 'Twice daily (9 AM, 3 PM)', enabled: true },
      { type: 'shift_reminders', label: 'Shift Reminders', schedule: 'Every 5 minutes', enabled: true },
      { type: 'ai_billing', label: 'AI Overage Billing', schedule: 'Weekly on Sunday', enabled: true },
      { type: 'platform_monitor', label: 'Platform Monitor', schedule: 'Every 15 minutes', enabled: true },
      { type: 'ws_cleanup', label: 'WebSocket Cleanup', schedule: 'Every 30 minutes', enabled: true },
      { type: 'room_auto_close', label: 'Room Auto-Close', schedule: 'Every hour', enabled: true },
      { type: 'trial_expiry', label: 'Trial Expiry Check', schedule: 'Daily at 6 AM', enabled: true },
    ];

    res.json({
      success: true,
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    console.error('[AutomationEvents API] Error fetching jobs:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch automation jobs' 
    });
  }
});

export default router;
