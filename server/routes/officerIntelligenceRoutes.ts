import { Router } from 'express';
import { sanitizeError } from '../middleware/errorHandler';
import { officerIntelligenceService } from '../services/officers/officerIntelligenceService';
import { createLogger } from '../lib/logger';

const log = createLogger('OfficerIntelligenceRoutes');
const router = Router();

/**
 * GET /api/officers/:officerId/dashboard
 * Returns the AI-driven intelligence dashboard for a single officer.
 */
router.get('/api/officers/:officerId/dashboard', async (req: any, res) => {
  const { officerId } = req.params;
  const workspaceId = req.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace context' });
  }

  try {
    const dashboard = await officerIntelligenceService.buildDashboard(officerId, workspaceId);
    res.json(dashboard);
  } catch (err: any) {
    if (err.message?.includes('Officer not found')) {
      return res.status(404).json({ error: err.message });
    }
    log.error(err, 'Failed to build officer dashboard');
    res.status(500).json({ error: sanitizeError(err) });
  }
});

/**
 * GET /api/officers/dashboards/all
 * Returns dashboards for all active officers in the workspace.
 * NOTE: this route must be registered before /:officerId/dashboard so that
 * 'dashboards' is not captured as an officerId parameter.
 */
router.get('/api/officers/dashboards/all', async (req: any, res) => {
  const workspaceId = req.workspaceId;

  if (!workspaceId) {
    return res.status(400).json({ error: 'Missing workspace context' });
  }

  try {
    const dashboards = await officerIntelligenceService.getWorkspaceDashboards(workspaceId);
    res.json({ dashboards, count: dashboards.length });
  } catch (err: any) {
    log.error(err, 'Failed to fetch officer dashboards');
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
