/**
 * Middleware Quality Scanner API Routes
 * 
 * Provides endpoints for scanning and reporting on middleware quality.
 * Uses 7-Step Orchestration Pattern for comprehensive analysis.
 * 
 * TRIGGER → FETCH → VALIDATE → PROCESS → MUTATE → CONFIRM → NOTIFY
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requirePlatformRole } from '../rbac';
import { createLogger } from '../lib/logger';
const log = createLogger('MiddlewareQuality');

import { 
  runMiddlewareQualityScan, 
  getMiddlewareHealthSummary,
} from '../services/middlewareQualityScanner';

const router = Router();

/**
 * GET /api/admin/middleware-quality/scan
 * Run full middleware quality scan with 7-step orchestration
 * Requires: root_admin or super_admin platform role
 */
router.get('/scan', 
  requireAuth, 
  requirePlatformRole(['root_admin', 'deputy_admin', 'sysop']),
  async (req: Request, res: Response) => {
    try {
      log.info('[MiddlewareQuality] Scan requested by user:', req.user?.id);
      
      const result = await runMiddlewareQualityScan();
      
      res.json({
        success: true,
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestedBy: req.user?.id,
        },
      });
    } catch (error: unknown) {
      log.error('[MiddlewareQuality] Scan error:', error);
      res.status(500).json({
        success: false,
        error: sanitizeError(error),
      });
    }
  }
);

/**
 * GET /api/admin/middleware-quality/health
 * Get quick health summary of middleware status
 * Requires: root_admin, super_admin, or sysop platform role
 */
router.get('/health',
  requireAuth,
  requirePlatformRole(['root_admin', 'deputy_admin', 'sysop']),
  async (req: Request, res: Response) => {
    try {
      const summary = getMiddlewareHealthSummary();
      
      res.json({
        success: true,
        data: summary,
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      log.error('[MiddlewareQuality] Health check error:', error);
      res.status(500).json({
        success: false,
        error: sanitizeError(error),
      });
    }
  }
);

export default router;
