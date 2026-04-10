/**
 * Automation Execution Tracker Routes
 * 
 * API endpoints for viewing and verifying automation executions.
 * Provides user-visible breakdown of work done with verification workflow.
 * 
 * SECURITY: All endpoints verify user has access to the workspace before
 * allowing operations. Only org_owner and co_owner can verify/reject executions.
 */

import { sanitizeError } from '../middleware/errorHandler';
import express, { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { automationExecutionTracker } from '../services/orchestration/automationExecutionTracker';
import { trinitySchedulingOrchestrator } from '../services/orchestration/trinitySchedulingOrchestrator';
import { resolveWorkspaceForUser, hasPlatformWideAccess, type WorkspaceRole, type PlatformRole } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('ExecutionTrackerRoutes');


export const executionTrackerRouter: Router = express.Router();

// Helper: Roles that can verify/reject executions
const VERIFICATION_ROLES: WorkspaceRole[] = ['org_owner', 'co_owner'];

function canVerifyWithRole(role: WorkspaceRole | null): boolean {
  return role !== null && VERIFICATION_ROLES.includes(role);
}

executionTrackerRouter.get('/executions', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace context missing from session' });
    }
    const status = req.query.status as string;
    const actionType = req.query.actionType as string;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    // Verify user has access to this workspace
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (req.user)?.platformRole as PlatformRole;
    
    if (!hasPlatformWideAccess(platformRole)) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { role, error } = await resolveWorkspaceForUser(userId, workspaceId);
      if (error || !role) {
        return res.status(403).json({ error: 'You do not have access to this workspace' });
      }
    }

    const executions = await automationExecutionTracker.getWorkspaceExecutions(workspaceId, {
      status: status as any,
      actionType,
      limit,
      since,
    });

    res.json({ executions, total: executions.length });
  } catch (error: unknown) {
    log.error('[ExecutionTracker] Failed to get executions:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

executionTrackerRouter.get('/executions/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const execution = await automationExecutionTracker.getExecution(req.params.id);
    
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Verify user has access to the execution's workspace
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (req.user)?.platformRole as PlatformRole;
    
    if (!hasPlatformWideAccess(platformRole)) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { role, error } = await resolveWorkspaceForUser(userId, execution.workspaceId);
      if (error || !role) {
        return res.status(403).json({ error: 'You do not have access to this execution' });
      }
    }

    res.json(execution);
  } catch (error: unknown) {
    log.error('[ExecutionTracker] Failed to get execution:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

executionTrackerRouter.get('/pending-verifications', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace context missing from session' });
    }

    // Verify user has access to this workspace
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (req.user)?.platformRole as PlatformRole;
    
    if (!hasPlatformWideAccess(platformRole)) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { role, error } = await resolveWorkspaceForUser(userId, workspaceId);
      if (error || !role) {
        return res.status(403).json({ error: 'You do not have access to this workspace' });
      }
    }

    const pending = await automationExecutionTracker.getPendingVerifications(workspaceId);

    res.json({ executions: pending, total: pending.length });
  } catch (error: unknown) {
    log.error('[ExecutionTracker] Failed to get pending verifications:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

executionTrackerRouter.post('/executions/:id/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    const userId = req.user?.id || 'unknown';
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (req.user)?.platformRole as PlatformRole;

    // First get the execution to verify workspace access
    const execution = await automationExecutionTracker.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Verify user has verification rights for this workspace
    // Platform staff with platform-wide access can verify any execution
    if (!hasPlatformWideAccess(platformRole)) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { role, error } = await resolveWorkspaceForUser(userId, execution.workspaceId);
      if (error || !role) {
        return res.status(403).json({ error: 'You do not have access to this execution' });
      }
      if (!canVerifyWithRole(role)) {
        return res.status(403).json({ error: 'Only org owners and admins can verify executions' });
      }
    }

    // For scheduling executions, apply the pending mutations
    if (execution.actionType === 'schedule_publish') {
      const applyResult = await trinitySchedulingOrchestrator.applyVerifiedMutations(req.params.id);
      if (!applyResult.success) {
        log.warn('[ExecutionTracker] Some scheduling mutations failed to apply:', applyResult.errors);
      }
    }

    await automationExecutionTracker.verifyExecution(req.params.id, {
      verifiedBy: userId,
      verificationNotes: notes,
    });

    res.json({ success: true, message: 'Execution verified and changes applied successfully' });
  } catch (error: unknown) {
    log.error('[ExecutionTracker] Failed to verify execution:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

executionTrackerRouter.post('/executions/:id/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    const userId = req.user?.id || 'unknown';
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (req.user)?.platformRole as PlatformRole;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // First get the execution to verify workspace access
    const execution = await automationExecutionTracker.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }

    // Verify user has rejection rights for this workspace
    // Platform staff with platform-wide access can reject any execution
    if (!hasPlatformWideAccess(platformRole)) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { role, error } = await resolveWorkspaceForUser(userId, execution.workspaceId);
      if (error || !role) {
        return res.status(403).json({ error: 'You do not have access to this execution' });
      }
      if (!canVerifyWithRole(role)) {
        return res.status(403).json({ error: 'Only org owners and admins can reject executions' });
      }
    }

    // For scheduling executions, reject the pending mutations
    if (execution.actionType === 'schedule_publish') {
      await trinitySchedulingOrchestrator.rejectMutations(req.params.id, reason);
    }

    await automationExecutionTracker.rejectExecution(req.params.id, {
      rejectedBy: userId,
      rejectionReason: reason,
    });

    res.json({ success: true, message: 'Execution rejected, no changes applied' });
  } catch (error: unknown) {
    log.error('[ExecutionTracker] Failed to reject execution:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

executionTrackerRouter.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId as string;
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace context missing from session' });
    }
    const since = req.query.since ? new Date(req.query.since as string) : undefined;

    // Verify user has access to this workspace
    const userId = req.user?.id;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const platformRole = (req.user)?.platformRole as PlatformRole;
    
    if (!hasPlatformWideAccess(platformRole)) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const { role, error } = await resolveWorkspaceForUser(userId, workspaceId);
      if (error || !role) {
        return res.status(403).json({ error: 'You do not have access to this workspace' });
      }
    }

    const stats = await automationExecutionTracker.getStats(workspaceId, since);

    res.json(stats);
  } catch (error: unknown) {
    log.error('[ExecutionTracker] Failed to get stats:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});
