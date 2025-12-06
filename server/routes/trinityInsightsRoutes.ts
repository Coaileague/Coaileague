/**
 * Trinity Insights API Routes
 * 
 * Endpoints for Trinity AI business intelligence insights
 */

import { Router, Request, Response, NextFunction } from 'express';
import { aiAnalyticsEngine } from '../services/ai-brain/aiAnalyticsEngine';

const router = Router();

/**
 * GET /api/trinity/insights
 * Get Trinity insights for the current user/workspace
 */
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const userId = user.id;
    const workspaceId = user.workspaceId || (req.query.workspaceId as string);
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    let insights;
    if (workspaceId) {
      insights = await aiAnalyticsEngine.getInsights(workspaceId, limit);
    } else {
      insights = await aiAnalyticsEngine.getAllInsightsForUser(userId, limit);
    }

    res.json({
      success: true,
      insights,
      count: insights.length,
    });
  } catch (error: any) {
    console.error('[Trinity Insights API] Error fetching insights:', error);
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

/**
 * POST /api/trinity/insights/:id/read
 * Mark an insight as read
 */
router.post('/insights/:id/read', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const insightId = req.params.id;
    const success = await aiAnalyticsEngine.markInsightRead(insightId);

    if (success) {
      res.json({ success: true, message: 'Insight marked as read' });
    } else {
      res.status(404).json({ error: 'Insight not found' });
    }
  } catch (error: any) {
    console.error('[Trinity Insights API] Error marking insight as read:', error);
    res.status(500).json({ error: 'Failed to mark insight as read' });
  }
});

/**
 * POST /api/trinity/scan
 * Trigger a proactive scan for the workspace
 */
router.post('/scan', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const workspaceId = user.workspaceId || (req.body.workspaceId as string);
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID required' });
    }

    if (!aiAnalyticsEngine.isAvailable()) {
      return res.status(503).json({ error: 'Trinity AI is not available' });
    }

    const insights = await aiAnalyticsEngine.runProactiveScan(workspaceId);

    res.json({
      success: true,
      message: `Proactive scan completed with ${insights.length} insights`,
      insights,
    });
  } catch (error: any) {
    console.error('[Trinity Insights API] Error running proactive scan:', error);
    res.status(500).json({ error: 'Failed to run proactive scan' });
  }
});

/**
 * GET /api/trinity/status
 * Get Trinity AI status
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const isAvailable = aiAnalyticsEngine.isAvailable();
    
    res.json({
      success: true,
      available: isAvailable,
      features: {
        preActionReasoning: isAvailable,
        postActionAnalysis: isAvailable,
        proactiveScanning: isAvailable,
        insightPersistence: true,
      },
    });
  } catch (error: any) {
    console.error('[Trinity Insights API] Error checking status:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

/**
 * POST /api/trinity/cache/clear
 * Clear the context cache (admin only)
 */
router.post('/cache/clear', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const workspaceId = req.body.workspaceId;
    aiAnalyticsEngine.clearCache(workspaceId);
    
    res.json({
      success: true,
      message: workspaceId ? `Cache cleared for workspace ${workspaceId}` : 'All caches cleared',
    });
  } catch (error: any) {
    console.error('[Trinity Insights API] Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
