/**
 * HRIS Integration Routes
 * ========================
 * Active API endpoints for HRIS provider discovery and connected provider status.
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { hrisIntegrationService } from '../services/hris/hrisIntegrationService';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('HrisRoutes');

const router = Router();

router.get('/providers', requireAuth, async (_req: Request, res: Response) => {
  try {
    const providers = hrisIntegrationService.getAvailableProviders();
    res.json({ success: true, providers });
  } catch (error: unknown) {
    log.error('[HRISRoutes] Providers error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/connections', requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.session?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace ID required' });
    }

    const connections = await hrisIntegrationService.getConnectedProviders(workspaceId);
    res.json({ success: true, connections });
  } catch (error: unknown) {
    log.error('[HRISRoutes] Connections error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
