/**
 * Business Owner Analytics Routes
 * Executive-level usage analytics endpoints for org owners and admins
 * Includes AI credit tracking, ROI metrics, and advanced usage insights
 */

import { Router, Response } from 'express';
import { type AuthenticatedRequest } from '../rbac';
import { businessOwnerAnalyticsService } from '../services/businessOwnerAnalyticsService';
import { advancedUsageAnalyticsService } from '../services/advancedUsageAnalyticsService';
import { z } from 'zod';
import { db } from '../db';
import { timeEntries, clients, invoices, quickbooksApiUsage } from '@shared/schema';
import { eq, and, gte, lte, sum, sql } from 'drizzle-orm';
import { trinityNotificationBridge } from '../services/ai-brain/trinityNotificationBridge';

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

// ========================
// ADVANCED USAGE ANALYTICS
// ========================

ownerAnalyticsRouter.get('/credits', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const summary = await advancedUsageAnalyticsService.getCreditSummary(workspaceId);
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Credits error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/credits/usage', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const usageByCategory = await advancedUsageAnalyticsService.getUsageByCategory(workspaceId, period);
    
    res.json({
      success: true,
      data: usageByCategory
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Credit usage error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/credits/trends', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const trends = await advancedUsageAnalyticsService.getDailyUsageTrends(workspaceId, period);
    
    res.json({
      success: true,
      data: trends
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Credit trends error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/credits/transactions', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const transactions = await advancedUsageAnalyticsService.getRecentTransactions(workspaceId, limit);
    
    res.json({
      success: true,
      data: transactions
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/ai-tasks', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const analytics = await advancedUsageAnalyticsService.getAITaskAnalytics(workspaceId, period);
    
    res.json({
      success: true,
      data: analytics
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] AI tasks error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/roi', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const metrics = await advancedUsageAnalyticsService.getROIMetrics(workspaceId, period);
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] ROI error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/full-report', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    const report = await advancedUsageAnalyticsService.getFullReport(workspaceId, period);
    
    res.json({
      success: true,
      data: report
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Full report error:', error);
    res.status(500).json({ error: error.message });
  }
});

ownerAnalyticsRouter.get('/reconciliation', requireOwnerRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    const { period } = periodSchema.parse(req.query);
    
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date();
    
    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        break;
      case 'this_week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        startDate = weekStart;
        break;
      case 'last_7_days':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        break;
      case 'this_quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'this_year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'last_30_days':
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const workspaceClients = await db.select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId));

    const platformHoursData = await db.select({
      clientId: timeEntries.clientId,
      totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.endTime} - ${timeEntries.startTime})) / 3600), 0)`,
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.startTime, startDate),
        lte(timeEntries.startTime, endDate)
      ))
      .groupBy(timeEntries.clientId);

    const invoiceData = await db.select({
      clientId: invoices.clientId,
      totalHours: sql<number>`COALESCE(SUM(${invoices.totalHours}), 0)`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        gte(invoices.createdAt, startDate),
        lte(invoices.createdAt, endDate)
      ))
      .groupBy(invoices.clientId);

    const platformHoursMap = new Map(platformHoursData.map(d => [d.clientId, Number(d.totalHours) || 0]));
    const invoiceHoursMap = new Map(invoiceData.map(d => [d.clientId, Number(d.totalHours) || 0]));

    const items = workspaceClients.map(client => {
      const platformHours = platformHoursMap.get(client.id) || 0;
      const quickbooksHours = invoiceHoursMap.get(client.id) || 0;
      const discrepancyPercent = platformHours > 0 
        ? ((quickbooksHours - platformHours) / platformHours) * 100 
        : 0;
      
      let status: 'verified' | 'discrepancy' | 'pending' = 'pending';
      if (platformHours > 0 && quickbooksHours > 0) {
        status = Math.abs(discrepancyPercent) <= 5 ? 'verified' : 'discrepancy';
      } else if (platformHours > 0 && quickbooksHours === 0) {
        status = 'pending';
      } else if (platformHours === 0 && quickbooksHours > 0) {
        status = 'discrepancy';
      }
      
      return {
        clientId: client.id,
        clientName: client.name,
        platformHours,
        quickbooksHours,
        discrepancyPercent,
        status,
        lastReconciled: new Date().toISOString(),
      };
    }).filter(item => item.platformHours > 0 || item.quickbooksHours > 0);

    const summary = {
      totalClients: items.length,
      verifiedCount: items.filter(i => i.status === 'verified').length,
      discrepancyCount: items.filter(i => i.status === 'discrepancy').length,
      pendingCount: items.filter(i => i.status === 'pending').length,
      totalPlatformHours: items.reduce((sum, i) => sum + i.platformHours, 0),
      totalQuickbooksHours: items.reduce((sum, i) => sum + i.quickbooksHours, 0),
      overallDiscrepancyPercent: items.length > 0 
        ? items.reduce((sum, i) => sum + i.discrepancyPercent, 0) / items.length 
        : 0,
    };

    await db.insert(quickbooksApiUsage).values({
      workspaceId,
      endpoint: 'reconciliation_check',
      method: 'GET',
      responseStatus: 200,
      requestTimestamp: new Date(),
      metadata: { period, clientCount: items.length, discrepancyCount: summary.discrepancyCount },
    }).catch(() => {});

    if (summary.discrepancyCount > 0) {
      const highDiscrepancies = items.filter(i => Math.abs(i.discrepancyPercent) > 5);
      if (highDiscrepancies.length > 0) {
        await trinityNotificationBridge.pushWhatsNew({
          title: 'Hours Discrepancy Detected',
          description: `${highDiscrepancies.length} client(s) have >5% variance between platform and invoiced hours. Review the Financial Watchdog tab.`,
          category: 'announcement',
          priority: 2,
          visibility: 'admin',
          badge: 'ALERT',
          workspaceId,
        }).catch(err => {
          console.log('[Reconciliation] Duplicate alert suppressed or error:', err.message);
        });
      }
    }

    res.json({
      success: true,
      data: {
        items,
        summary,
        lastSync: new Date().toISOString(),
      }
    });
  } catch (error: any) {
    console.error('[OwnerAnalytics] Reconciliation error:', error);
    res.status(500).json({ error: error.message });
  }
});
