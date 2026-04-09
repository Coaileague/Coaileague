import { Router, Request, Response } from 'express';
import { serviceControlManager, OrchestrationServiceName } from '../services/ai-brain/serviceControl';
import { workflowLedger } from '../services/ai-brain/workflowLedger';
import { commitmentManager } from '../services/ai-brain/commitmentManager';
import { supervisoryAgent } from '../services/ai-brain/supervisoryAgent';
import { schedulerCoordinator } from '../services/ai-brain/schedulerCoordinator';
import { aiBrainEvents } from '../services/ai-brain/internalEventEmitter';
import { requirePlatformStaff, requireSysop } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('AiBrainControlRoutes');


const router = Router();

const requirePlatformAdmin = requireSysop;

router.get('/health', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const healthSummary = serviceControlManager.getHealthSummary();
    
    let workflowMetrics = { totalRuns: 0, completedRuns: 0, failedRuns: 0, averageDurationMs: 0, slaComplianceRate: 0 };
    let supervisoryHealth = { activeRuns: 0, pendingApprovals: 0, failedRuns24h: 0, slaBreaches24h: 0, avgDurationMs: 0, isHealthy: true, issues: [] as string[] };
    
    try {
      workflowMetrics = await workflowLedger.getMetrics();
    } catch (e) {
      log.error('[AI Brain Health] WorkflowLedger metrics error:', e);
    }
    
    try {
      supervisoryHealth = await supervisoryAgent.getHealth();
    } catch (e) {
      log.error('[AI Brain Health] SupervisoryAgent health error:', e);
    }

    res.json({
      timestamp: new Date().toISOString(),
      overall: healthSummary.overall,
      services: healthSummary.services,
      summary: {
        runningServices: healthSummary.runningCount,
        pausedServices: healthSummary.pausedCount,
        errorServices: healthSummary.errorCount,
        totalServices: healthSummary.services.length,
      },
      workflows: workflowMetrics,
      supervisory: supervisoryHealth,
    });
  } catch (error) {
    log.error('[AI Brain Health] Error:', error);
    res.status(500).json({ 
      error: 'Failed to get AI Brain health',
      timestamp: new Date().toISOString(),
    });
  }
});

router.get('/services', requirePlatformStaff, (req: Request, res: Response) => {
  const services = serviceControlManager.getAllServicesStatus();
  res.json({ services });
});

router.get('/services/:serviceName', requirePlatformStaff, (req: Request, res: Response) => {
  const { serviceName } = req.params;
  const status = serviceControlManager.getServiceStatus(serviceName as OrchestrationServiceName);
  
  if (!status) {
    return res.status(404).json({ error: `Service ${serviceName} not found` });
  }
  
  res.json({ service: status });
});

router.post('/services/:serviceName/pause', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { serviceName } = req.params;
    const { reason } = req.body;
    const user = req.user;
    
    const result = await serviceControlManager.pauseService(
      serviceName as OrchestrationServiceName,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      user?.id,
      reason
    );
    
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    
    aiBrainEvents.emit('service_control_action', {
      action: 'pause',
      service: serviceName,
      userId: user?.id,
      reason,
      timestamp: new Date().toISOString(),
    });
    
    res.json({ success: true, message: result.message });
  } catch (error) {
    log.error('[aiBrainControl] pause service error:', error);
    res.status(500).json({ error: 'Failed to pause service' });
  }
});

router.post('/services/:serviceName/resume', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { serviceName } = req.params;
    const user = req.user;
    
    const result = await serviceControlManager.resumeService(
      serviceName as OrchestrationServiceName,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      user?.id
    );
    
    if (!result.success) {
      return res.status(400).json({ error: result.message });
    }
    
    aiBrainEvents.emit('service_control_action', {
      action: 'resume',
      service: serviceName,
      userId: user?.id,
      timestamp: new Date().toISOString(),
    });
    
    res.json({ success: true, message: result.message });
  } catch (error) {
    log.error('[aiBrainControl] resume service error:', error);
    res.status(500).json({ error: 'Failed to resume service' });
  }
});

router.get('/workflows', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { status, limit = '50' } = req.query;
    const workflows = await workflowLedger.getRecentRuns({
      status: status as any,
      limit: Math.min(Math.max(1, parseInt(limit as string) || 50), 200),
    });
    res.json({ workflows });
  } catch (error) {
    log.error('[AI Brain Control] Error fetching workflows:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

router.get('/workflows/:runId', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const result = await workflowLedger.getRunWithSteps(runId);
    
    if (!result) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json({ workflow: result.run, steps: result.steps });
  } catch (error) {
    log.error('[AI Brain Control] Error fetching workflow:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

router.post('/workflows/:runId/cancel', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { reason } = req.body;
    const user = req.user;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await workflowLedger.cancelRun(runId, reason || `Cancelled by ${user.email || user.id}`);
    
    aiBrainEvents.emit('workflow_cancelled', {
      runId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      cancelledBy: user.id,
      reason,
      timestamp: new Date().toISOString(),
    });
    
    res.json({ success: true, message: 'Workflow cancelled' });
  } catch (error) {
    log.error('[AI Brain Control] Error cancelling workflow:', error);
    res.status(500).json({ error: 'Failed to cancel workflow' });
  }
});

router.post('/workflows/:runId/retry', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const user = req.user;
    
    const workflow = await workflowLedger.getRun(runId);
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    if (workflow.status !== 'failed' && workflow.status !== 'cancelled') {
      return res.status(400).json({ error: 'Can only retry failed or cancelled workflows' });
    }
    
    const newRun = await workflowLedger.createRun(
      workflow.actionId,
      workflow.category,
      {
        source: 'api',
        workspaceId: workflow.workspaceId || undefined,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        userId: user.id,
        parentRunId: runId,
      },
      workflow.inputParams as Record<string, any> | undefined
    );
    
    aiBrainEvents.emit('workflow_retried', {
      originalRunId: runId,
      newRunId: newRun.id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      retriedBy: user.id,
      timestamp: new Date().toISOString(),
    });
    
    res.json({ success: true, newRunId: newRun.id, message: 'Workflow retry initiated' });
  } catch (error) {
    log.error('[AI Brain Control] Error retrying workflow:', error);
    res.status(500).json({ error: 'Failed to retry workflow' });
  }
});

router.get('/commitments', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.query;
    const commitments = await commitmentManager.getActiveCommitments({
      workspaceId: workspaceId as string | undefined,
    });
    res.json({ commitments });
  } catch (error) {
    log.error('[AI Brain Control] Error fetching commitments:', error);
    res.status(500).json({ error: 'Failed to fetch commitments' });
  }
});

router.post('/commitments/:commitmentId/approve', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { commitmentId } = req.params;
    const user = req.user;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await commitmentManager.approveCommitment(commitmentId, user.id);
    
    if (!result) {
      return res.status(400).json({ error: 'Failed to approve commitment or commitment not found' });
    }
    
    res.json({ success: true, message: 'Commitment approved', commitment: result });
  } catch (error) {
    log.error('[AI Brain Control] Error approving commitment:', error);
    res.status(500).json({ error: 'Failed to approve commitment' });
  }
});

router.post('/commitments/:commitmentId/reject', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { commitmentId } = req.params;
    const { reason } = req.body;
    const user = req.user;
    
    if (!reason) {
      return res.status(400).json({ error: 'Reason is required for rejection' });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await commitmentManager.rejectCommitment(commitmentId, user.id, reason);
    
    if (!result) {
      return res.status(400).json({ error: 'Failed to reject commitment or commitment not found' });
    }
    
    res.json({ success: true, message: 'Commitment rejected', commitment: result });
  } catch (error) {
    log.error('[AI Brain Control] Error rejecting commitment:', error);
    res.status(500).json({ error: 'Failed to reject commitment' });
  }
});

router.post('/test-alert', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { type = 'test', message = 'Test alert from AI Brain Control' } = req.body;
    const user = req.user;
    
    aiBrainEvents.emit('critical_alert', {
      level: 'warning',
      type,
      message,
      actionId: 'test.alert',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      triggeredBy: user.id,
      timestamp: new Date().toISOString(),
    });
    
    res.json({ success: true, message: 'Test alert sent' });
  } catch (error) {
    log.error('[AI Brain Control] Error sending test alert:', error);
    res.status(500).json({ error: 'Failed to send test alert' });
  }
});

router.get('/events/recent', requirePlatformStaff, (req: Request, res: Response) => {
  res.json({
    message: 'Subscribe to WebSocket for real-time events',
    wsPath: '/ws/chat',
    channels: [
      'orchestration:workflow_update',
      'orchestration:service_status',
      'orchestration:commitment_update',
      'orchestration:critical_alert',
    ],
  });
});

export default router;
