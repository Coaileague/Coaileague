/**
 * Trinity SLA Escalation Routes — Phase 10-5
 *
 * Endpoints for checking and executing SLA escalations on support tickets.
 * All endpoints are workspace-scoped and require manager-level access.
 *
 * Mounted at /api/trinity/escalation
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response } from 'express';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { slaEscalationService } from '../services/support/slaEscalationService';
import { trinityEscalationExecutor } from '../services/trinity/trinityEscalationExecutor';
import { createLogger } from '../lib/logger';

const log = createLogger('TrinityEscalationRoutes');

const router = Router();

router.use(requireManager);

/**
 * GET /api/trinity/escalation/pending
 * List tickets at SLA risk that need escalation in the current workspace.
 */
router.get('/pending', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const escalations = await slaEscalationService.getPendingEscalations(workspaceId);

    res.json({
      success: true,
      escalations,
      count: escalations.length,
    });
  } catch (error: unknown) {
    log.error('Failed to fetch pending escalations', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity/escalation/check
 * Check and execute all pending SLA escalations for the current workspace.
 * Returns the count of checked and executed escalations.
 */
router.post('/check', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const results = await trinityEscalationExecutor.runWorkspaceEscalations(workspaceId);

    res.json({
      success: true,
      checked: results.length,
      executed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    });
  } catch (error: unknown) {
    log.error('Escalation check failed', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * POST /api/trinity/escalation/check-ticket
 * Check SLA escalation status for a single ticket (does not execute).
 *
 * Body: { ticketId, priority, status, createdAt, firstResponseAt? }
 */
router.post('/check-ticket', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { ticketId, priority, status, createdAt, firstResponseAt } = req.body;

    if (!ticketId || !createdAt) {
      return res.status(400).json({
        success: false,
        error: 'ticketId and createdAt are required',
      });
    }

    const check = slaEscalationService.checkEscalation({
      id: ticketId,
      workspaceId,
      priority: priority ?? 'normal',
      status: status ?? 'open',
      createdAt: new Date(createdAt),
      firstResponseAt: firstResponseAt ? new Date(firstResponseAt) : null,
    });

    res.json({ success: true, escalation: check });
  } catch (error: unknown) {
    log.error('Single ticket escalation check failed', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
