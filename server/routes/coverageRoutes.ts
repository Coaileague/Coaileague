/**
 * COVERAGE PIPELINE ROUTES
 * ========================
 * API endpoints for Trinity's autonomous shift coverage system.
 * Handles accept/decline workflow for coverage offers and manual triggers.
 */

import { Router, Response } from 'express';
import { db } from '../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { coveragePipeline } from '../services/automation/coveragePipeline';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('CoverageRoutes');


interface AuthenticatedRequest {
  userId?: string;
  workspaceId?: string;
  params: any;
  body: any;
}

const coverageRouter = Router();

coverageRouter.post('/accept/:offerId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { offerId } = req.params;
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const workspaceId = req.workspaceId;
    const employee = await db.query.employees.findFirst({
      where: workspaceId
        ? and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))
        : eq(employees.userId, userId),
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for this user' });
    }
    
    const result = await coveragePipeline.acceptOffer(offerId, employee.id);
    
    if (result.success) {
      try {
        const wsWorkspaceId = req.workspaceId;
        if (wsWorkspaceId) {
          const { broadcastToWorkspace } = await import('../websocket');
          broadcastToWorkspace(wsWorkspaceId, { type: 'schedules_updated' });
        }
      // @ts-expect-error — TS migration: fix in refactoring sprint
      } catch (e: unknown) { log.warn('[Coverage] Broadcast failed:', e.message); }

      res.json({ 
        success: true, 
        message: result.message,
        shiftId: result.shiftId,
      });
    } else {
      res.status(400).json({ error: result.message });
    }
  } catch (error: unknown) {
    log.error('[Coverage] Error accepting offer:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

coverageRouter.post('/decline/:offerId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { offerId } = req.params;
    const { reason } = req.body;
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const workspaceId = req.workspaceId;
    const employee = await db.query.employees.findFirst({
      where: workspaceId
        ? and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId))
        : eq(employees.userId, userId),
    });
    
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found for this user' });
    }
    
    const result = await coveragePipeline.declineOffer(offerId, employee.id, reason);
    
    if (result.success) {
      try {
        const wsWorkspaceId = req.workspaceId;
        if (wsWorkspaceId) {
          const { broadcastToWorkspace } = await import('../websocket');
          broadcastToWorkspace(wsWorkspaceId, { type: 'schedules_updated' });
        }
      } catch (e) {
        log.warn('[CoverageRoutes] Failed to broadcast schedule update:', e);
      }
    }

    res.json({ 
      success: result.success, 
      message: result.message,
    });
  } catch (error: unknown) {
    log.error('[Coverage] Error declining offer:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

coverageRouter.get('/request/:requestId', requireAuth as any, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId } = req.params;
    
    const request = await coveragePipeline.getRequestStatus(requestId);
    if (!request) {
      return res.status(404).json({ error: 'Coverage request not found' });
    }
    
    const offers = await coveragePipeline.getRequestOffers(requestId);
    
    res.json({ 
      success: true,
      data: {
        request,
        offers,
      }
    });
  } catch (error: unknown) {
    log.error('[Coverage] Error fetching request:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

coverageRouter.post('/trigger', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { shiftId, reason, reasonDetails } = req.body;
    
    if (!workspaceId) {
      return res.status(403).json({ error: 'Workspace context required' });
    }
    
    if (!shiftId) {
      return res.status(400).json({ error: 'shiftId is required' });
    }
    
    const result = await coveragePipeline.triggerCoverage({
      shiftId,
      workspaceId,
      reason: reason || 'manual',
      reasonDetails,
    });
    
    res.json({ 
      success: result.success,
      data: result,
    });
  } catch (error: unknown) {
    log.error('[Coverage] Error triggering coverage:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

coverageRouter.get('/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      service: 'coverage_pipeline',
      status: 'active',
      description: 'Trinity autonomous shift coverage system',
    });
  } catch (error: unknown) {
    log.error('[Coverage] Operation error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

export { coverageRouter };
