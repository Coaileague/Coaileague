/**
 * Business Owner Analytics Routes
 * Executive-level usage analytics endpoints for org owners and admins
 */

import { Router, Response } from 'express';
import { type AuthenticatedRequest } from '../rbac';
import { businessOwnerAnalyticsService } from '../services/businessOwnerAnalyticsService';
import { z } from 'zod';

export const ownerAnalyticsRouter = Router();

const OWNER_ROLES = ['org_owner', 'org_admin'];

function requireOwnerRole(req: AuthenticatedRequest, res: Response, next: Function) {
  const userRole = req.workspaceRole || 'none';
  if (!OWNER_ROLES.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Business owner or admin access required',
      requiredRoles: OWNER_ROLES,
    });
  }
  next();
}

const periodSchema = z.object({
  period: z.enum([
    'today', 
    'this_week', 
    'this_month', 
    'last_month', 
    'this_quarter', 
    'this_year',
    'last_7_days',
    'last_30_days'
  ]).optional().default('last_30_days')
});

ownerAnalyticsRouter.get('/overview', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    
    const overview = await businessOwnerAnalyticsService.getOverview(workspaceId, period);
    
    res.json({
      success: true,
      data: overview
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Overview error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/trends', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const granularity = (req.query.granularity as 'day' | 'week' | 'month') || 'day';
    
    const trends = await businessOwnerAnalyticsService.getUsageTrends(workspaceId, period, granularity);
    
    res.json({
      success: true,
      data: trends
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/features', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    
    const report = await businessOwnerAnalyticsService.getFeatureUsageReport(workspaceId, period);
    
    res.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Features error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/team', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    
    const report = await businessOwnerAnalyticsService.getTeamEngagementReport(workspaceId, period);
    
    res.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Team error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/export', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const format = (req.query.format as 'json' | 'csv') || 'json';
    
    const data = await businessOwnerAnalyticsService.exportUsageData(workspaceId, period, format);
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=usage-analytics-${period}.csv`);
      return res.send(data);
    }
    
    res.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Export error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/comparison', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const currentPeriod = (req.query.current as string) || 'this_month';
    const previousPeriod = (req.query.previous as string) || 'last_month';
    
    const [current, previous] = await Promise.all([
      businessOwnerAnalyticsService.getOverview(workspaceId, currentPeriod),
      businessOwnerAnalyticsService.getOverview(workspaceId, previousPeriod)
    ]);
    
    const comparison = {
      currentPeriod: current,
      previousPeriod: previous,
      changes: {
        activeUsers: current.activeUsers - previous.activeUsers,
        activeUsersPercent: previous.activeUsers > 0 
          ? Math.round(((current.activeUsers - previous.activeUsers) / previous.activeUsers) * 100)
          : 0,
        aiActions: current.aiActionsExecuted - previous.aiActionsExecuted,
        aiActionsPercent: previous.aiActionsExecuted > 0
          ? Math.round(((current.aiActionsExecuted - previous.aiActionsExecuted) / previous.aiActionsExecuted) * 100)
          : 0,
        costs: current.estimatedCosts.total - previous.estimatedCosts.total,
        costsPercent: previous.estimatedCosts.total > 0
          ? Math.round(((current.estimatedCosts.total - previous.estimatedCosts.total) / previous.estimatedCosts.total) * 100)
          : 0
      }
    };
    
    res.json({
      success: true,
      data: comparison
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Comparison error:', error);
    res.status(500).json({ error: error.message });
  }
});
