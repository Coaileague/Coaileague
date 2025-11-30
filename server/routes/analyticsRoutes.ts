import type { Express } from 'express';
import { Router, Request, Response } from 'express';
import { roomAnalyticsService } from '../services/roomAnalyticsService';
import '../types';

export function registerAnalyticsRoutes(app: Express, requireAuth: any, readLimiter: any) {
  const analyticsRouter = Router();

  analyticsRouter.get("/summary", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { analyticsDataService } = await import("../services/analyticsDataService");
      const summary = await analyticsDataService.getAnalyticsSummary(workspaceId);
      res.json({ success: true, data: summary });
    } catch (error: any) {
      console.error('Error fetching analytics summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  analyticsRouter.get("/dashboard", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days', startDate, endDate } = req.query;
      const { advancedAnalyticsService } = await import("../services/advancedAnalyticsService");
      const dashboard = await advancedAnalyticsService.getDashboardMetrics(
        workspaceId,
        period as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json({ success: true, data: dashboard });
    } catch (error: any) {
      console.error('Error fetching dashboard metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  analyticsRouter.get("/time-usage", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days', startDate, endDate } = req.query;
      const { advancedAnalyticsService } = await import("../services/advancedAnalyticsService");
      const timeUsage = await advancedAnalyticsService.getTimeUsageMetrics(
        workspaceId,
        period as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json({ success: true, data: timeUsage });
    } catch (error: any) {
      console.error('Error fetching time usage metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  analyticsRouter.get("/scheduling", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days', startDate, endDate } = req.query;
      const { advancedAnalyticsService } = await import("../services/advancedAnalyticsService");
      const scheduling = await advancedAnalyticsService.getSchedulingMetrics(
        workspaceId,
        period as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json({ success: true, data: scheduling });
    } catch (error: any) {
      console.error('Error fetching scheduling metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  analyticsRouter.get("/revenue", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days', startDate, endDate } = req.query;
      const { advancedAnalyticsService } = await import("../services/advancedAnalyticsService");
      const revenue = await advancedAnalyticsService.getRevenueMetrics(
        workspaceId,
        period as string,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      res.json({ success: true, data: revenue });
    } catch (error: any) {
      console.error('Error fetching revenue metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  analyticsRouter.get("/heatmap", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days', clientId } = req.query;
      const { heatmapService } = await import("../services/heatmapService");
      const data = await heatmapService.getHeatmapData({
        workspaceId,
        clientId: clientId as string | undefined
      }, period as string);
      res.json({
        success: true,
        data,
        metadata: {
          period,
          clientId: clientId || 'all',
          generatedAt: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      console.error("Error fetching heatmap data:", error);
      res.status(500).json({ error: error.message || "Failed to fetch heatmap data" });
    }
  });

  analyticsRouter.get("/heatmap/by-client", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days' } = req.query;
      const { heatmapService } = await import("../services/heatmapService");
      const data = await heatmapService.getHeatmapByClient(workspaceId, period as string);
      const clientData: Record<string, any> = {};
      for (const [clientId, heatmap] of data) {
        clientData[clientId] = heatmap;
      }
      res.json({
        success: true,
        data: clientData,
        clientCount: Object.keys(clientData).length,
        metadata: {
          period,
          generatedAt: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      console.error("Error fetching heatmap by client:", error);
      res.status(500).json({ error: error.message || "Failed to fetch heatmap data" });
    }
  });

  analyticsRouter.get("/heatmap/by-location", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days' } = req.query;
      const { heatmapService } = await import("../services/heatmapService");
      const data = await heatmapService.getHeatmapByLocation(workspaceId, period as string);
      res.json({
        success: true,
        data,
        locationCount: Object.keys(data).length,
        metadata: {
          period,
          generatedAt: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      console.error("Error fetching heatmap by location:", error);
      res.status(500).json({ error: error.message || "Failed to fetch heatmap data" });
    }
  });

  analyticsRouter.get("/heatmap/ai-analysis", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { period = 'last_30_days' } = req.query;
      const { heatmapService } = await import("../services/heatmapService");
      const analysis = await heatmapService.getAIStaffingAnalysis(workspaceId, period as string);
      res.json({
        success: true,
        data: analysis,
        metadata: {
          period,
          generatedAt: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      console.error("Error fetching AI staffing analysis:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI analysis" });
    }
  });

  analyticsRouter.get("/rooms", requireAuth, readLimiter, async (req: Request, res: Response) => {
    try {
      const workspaceId = (req.user as any)?.currentWorkspaceId;
      if (!workspaceId) return res.status(400).json({ error: 'No workspace selected' });
      const { roomType, timeframe = 'daily', days = '7' } = req.query;
      const validRoomTypes = ['support', 'work', 'meeting', 'org'];
      const validTimeframes = ['hourly', 'daily'];

      if (roomType && !validRoomTypes.includes(roomType as string)) {
        return res.status(400).json({ error: 'Invalid roomType parameter' });
      }
      if (!validTimeframes.includes(timeframe as string)) {
        return res.status(400).json({ error: 'Invalid timeframe parameter' });
      }

      const daysNum = Math.min(Math.max(1, parseInt(days as string) || 7), 90);
      const analytics = await roomAnalyticsService.getAnalyticsData(
        workspaceId,
        (roomType as any) || undefined,
        (timeframe as any) || 'daily',
        daysNum
      );

      res.json({
        success: true,
        data: analytics,
        metadata: {
          workspaceId,
          timeframe,
          days: daysNum,
          roomType: roomType || 'all',
          generatedAt: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      console.error("Error fetching room analytics:", error);
      res.status(500).json({ error: error.message || "Failed to fetch analytics" });
    }
  });

  app.use('/api/analytics', analyticsRouter);
}
