/**
 * Trinity Audit Trail Routes
 *
 * Endpoints for querying the append-only Trinity skill execution audit trail.
 * All endpoints are workspace-scoped and require manager-level access.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response } from 'express';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { trinityAuditService } from '../services/trinity/trinityAuditService';
import { createLogger } from '../lib/logger';

const log = createLogger('TrinityAuditRoutes');

const router = Router();

router.use(requireManager);

/**
 * GET /api/trinity/audit-trail
 * Query audit trail for the current workspace.
 *
 * Query params:
 *   startDate  — ISO 8601 start (required unless skillName provided)
 *   endDate    — ISO 8601 end   (required unless skillName provided)
 *   skillName  — filter by skill name (optional; if provided alone, returns all entries for that skill)
 */
router.get('/audit-trail', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { startDate, endDate, skillName } = req.query;

    let trail;

    if (skillName && typeof skillName === 'string') {
      trail = await trinityAuditService.getSkillAuditTrail(workspaceId, skillName);
    } else {
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'startDate and endDate query parameters are required',
        });
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid date format. Use ISO 8601.',
        });
      }

      trail = await trinityAuditService.getAuditTrail(workspaceId, start, end);
    }

    res.json({ success: true, trail, count: trail.length });
  } catch (error: unknown) {
    log.error('Failed to fetch audit trail', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

/**
 * GET /api/trinity/audit-trail/failures
 * Query failed skill executions for the current workspace.
 *
 * Query params:
 *   startDate — ISO 8601 start (required)
 *   endDate   — ISO 8601 end   (required)
 */
router.get('/audit-trail/failures', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace context required' });
    }

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate query parameters are required',
      });
    }

    const start = new Date(startDate as string);
    const end = new Date(endDate as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use ISO 8601.',
      });
    }

    const failures = await trinityAuditService.getFailedExecutions(workspaceId, start, end);

    res.json({ success: true, failures, count: failures.length });
  } catch (error: unknown) {
    log.error('Failed to fetch failed executions', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
