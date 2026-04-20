/**
 * FINANCIAL INTELLIGENCE API ROUTES
 * ==================================
 * P&L Dashboard and Financial Analytics endpoints
 * 
 * Access Control: Owner and Finance Admin roles only
 * Billing: AI operations charged to workspace via tokenManager
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { profitLossService, type PeriodGranularity } from '../services/finance/profitLossService';
import { requireOwner } from '../rbac';
import { requireAuth } from '../auth';
import { requirePlan } from '../tierGuards';
import { createLogger } from '../lib/logger';
const log = createLogger('FinancialIntelligence');


const router = Router();

// P&L Financial Intelligence is a Professional+ feature (financial_intelligence, predictive_brain)
router.use(requireAuth);
router.use(requirePlan('professional'));

const periodParamsSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  granularity: z.enum(['weekly', 'monthly', 'quarterly', 'annual', 'custom']).optional().default('monthly'),
});

const clientIdSchema = z.object({
  clientId: z.string().optional(),
});

function getDefaultPeriod(granularity: PeriodGranularity = 'monthly'): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  
  switch (granularity) {
    case 'weekly':
      start.setDate(start.getDate() - 7);
      break;
    case 'monthly':
      start.setDate(1);
      break;
    case 'quarterly':
      const quarter = Math.floor(now.getMonth() / 3);
      start.setMonth(quarter * 3);
      start.setDate(1);
      break;
    case 'annual':
      start.setMonth(0);
      start.setDate(1);
      break;
    default:
      start.setDate(1);
  }
  
  return { start, end };
}

/**
 * GET /api/finance/pl/summary
 * Dashboard widget summary with KPIs
 */
router.get('/pl/summary', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const params = periodParamsSchema.parse(req.query);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date parameters' });
    }
    
    log.info('[Financial Intelligence] P&L request:', { workspaceId, start: start.toISOString(), end: end.toISOString(), granularity });
    
    const summary = await profitLossService.getPLSummary(
      workspaceId,
      userId,
      start,
      end,
      granularity
    );
    
    return res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error getting P&L summary:', error);
    next(error);
  }
});

/**
 * GET /api/finance/pl/insights
 * Generate AI-powered insights for P&L data
 * Billed to workspace via tokenManager
 */
router.get('/pl/insights', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const params = periodParamsSchema.parse(req.query);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    const summary = await profitLossService.getPLSummary(
      workspaceId,
      userId,
      start,
      end,
      granularity
    );
    
    const insights = await profitLossService.generateAIInsights(
      workspaceId,
      userId,
      summary
    );
    
    return res.json({
      success: true,
      data: {
        insights,
        creditsUsed: 15,
      },
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error generating insights:', error);
    next(error);
  }
});

router.post('/pl/insights', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const params = periodParamsSchema.parse(req.query);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    const summary = await profitLossService.getPLSummary(
      workspaceId,
      userId,
      start,
      end,
      granularity
    );
    
    const insights = await profitLossService.generateAIInsights(
      workspaceId,
      userId,
      summary
    );
    
    return res.json({
      success: true,
      data: {
        insights,
        creditsUsed: 15,
      },
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error generating insights (POST):', error);
    next(error);
  }
});

/**
 * GET /api/finance/pl/clients
 * Per-client profitability analysis
 */
router.get('/pl/clients', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const params = periodParamsSchema.parse(req.query);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    const clientProfitability = await profitLossService.getClientProfitability(
      workspaceId,
      userId,
      start,
      end
    );
    
    return res.json({
      success: true,
      data: clientProfitability,
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error getting client profitability:', error);
    next(error);
  }
});

/**
 * GET /api/finance/pl/trends
 * Historical trend data for charts
 */
router.get('/pl/trends', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const periodsParam = parseInt(req.query.periods as string) || 6;
    const granularity = (req.query.granularity as PeriodGranularity) || 'monthly';
    
    const trends = await profitLossService.getTrendData(
      workspaceId,
      periodsParam,
      granularity
    );
    
    return res.json({
      success: true,
      data: trends,
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error getting trends:', error);
    next(error);
  }
});

/**
 * GET /api/finance/pl/alerts
 * Active financial alerts
 */
router.get('/pl/alerts', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const alerts = await profitLossService.getActiveAlerts(workspaceId);
    
    return res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error getting alerts:', error);
    next(error);
  }
});

/**
 * POST /api/finance/pl/alerts/:alertId/dismiss
 * Dismiss a financial alert
 */
router.post('/pl/alerts/:alertId/dismiss', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;
    const alertId = req.params.alertId;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    await profitLossService.dismissAlert(alertId, userId);
    
    return res.json({
      success: true,
      message: 'Alert dismissed',
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error dismissing alert:', error);
    next(error);
  }
});

/**
 * POST /api/finance/pl/refresh
 * Manually trigger P&L data refresh
 */
router.post('/pl/refresh', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const params = periodParamsSchema.parse(req.body);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    const summary = await profitLossService.getPLSummary(
      workspaceId,
      userId,
      start,
      end,
      granularity
    );
    
    return res.json({
      success: true,
      data: summary,
      message: 'P&L data refreshed',
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error refreshing P&L:', error);
    next(error);
  }
});

/**
 * GET /api/finance/pl/consolidated
 * Consolidated P&L across parent + all sub-orgs
 * Only available for org owners with sub-orgs
 */
router.get('/pl/consolidated', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { storage } = await import('../storage');
    const currentWs = await storage.getWorkspace(workspaceId);
    if (!currentWs) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const rootId = currentWs.parentWorkspaceId || workspaceId;
    if (currentWs.isSubOrg) {
      const rootWs = await storage.getWorkspace(rootId);
      if (!rootWs || rootWs.ownerId !== userId) {
        return res.status(403).json({ error: 'Only the root org owner can view consolidated P&L' });
      }
    }
    
    const params = periodParamsSchema.parse(req.query);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: 'Invalid date parameters' });
    }
    
    const consolidated = await profitLossService.getConsolidatedPL(
      rootId,
      userId,
      start,
      end,
      granularity
    );
    
    return res.json({
      success: true,
      data: consolidated,
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error getting consolidated P&L:', error);
    next(error);
  }
});

/**
 * GET /api/finance/pl/client/:clientId/recommendation
 * Get AI recommendation for specific client
 * Billed to workspace via tokenManager
 */
router.get('/pl/client/:clientId/recommendation', requireOwner, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    const clientId = req.params.clientId;
    
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const params = periodParamsSchema.parse(req.query);
    const granularity = params.granularity as PeriodGranularity;
    
    let start: Date, end: Date;
    if (params.start && params.end) {
      start = new Date(params.start);
      end = new Date(params.end);
    } else {
      const defaultPeriod = getDefaultPeriod(granularity);
      start = defaultPeriod.start;
      end = defaultPeriod.end;
    }
    
    const clientProfitability = await profitLossService.getClientProfitability(
      workspaceId,
      userId,
      start,
      end
    );
    
    const client = clientProfitability.find(c => c.clientId === clientId);
    
    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }
    
    const recommendation = await profitLossService.generateClientRecommendation(
      workspaceId,
      userId,
      client
    );
    
    return res.json({
      success: true,
      data: {
        clientId,
        clientName: client.clientName,
        recommendation,
        creditsUsed: 10,
      },
    });
  } catch (error) {
    log.error('[Financial Intelligence] Error getting client recommendation:', error);
    next(error);
  }
});

export default router;
