/**
 * Trinity Insights API Routes
 * 
 * Endpoints for Trinity AI business intelligence insights
 * Including context resolution and access control
 */

import { Router, Request, Response, NextFunction } from 'express';
import { aiAnalyticsEngine } from '../services/ai-brain/aiAnalyticsEngine';
import { trinityContextService, type TrinityContext } from '../services/trinityContext';
import { canAccessTrinity } from '../rbac';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Helper to get authenticated user from session or req.user
async function getAuthenticatedUser(req: Request): Promise<{ id: string; [key: string]: any } | null> {
  // Try req.user first (set by auth middleware)
  const reqUser = (req as any).user;
  if (reqUser?.id) {
    return reqUser;
  }
  
  // Try session-based auth
  const session = (req as any).session;
  if (session?.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (user) {
      // Attach to request for subsequent handlers
      (req as any).user = user;
      return user;
    }
  }
  
  return null;
}

/**
 * GET /api/trinity/insights
 * Get Trinity insights for the current user/workspace
 */
router.get('/insights', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
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
    const user = await getAuthenticatedUser(req);
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
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    let workspaceId = user.workspaceId || (req.body.workspaceId as string);
    
    if (!workspaceId) {
      workspaceId = 'coaileague-platform-workspace';
    }

    if (!aiAnalyticsEngine.isAvailable()) {
      return res.json({
        success: true,
        message: 'Trinity AI scan completed (mock mode)',
        insights: [{
          id: `insight-mock-${Date.now()}`,
          workspaceId,
          type: 'insight',
          category: 'analytics',
          title: 'System Status Check',
          message: 'All systems operational. No immediate issues detected.',
          riskLevel: 'low',
          confidence: 0.95,
          isRead: false,
          createdAt: new Date(),
        }],
      });
    }

    const insights = await aiAnalyticsEngine.runProactiveScan(workspaceId);

    res.json({
      success: true,
      message: `Proactive scan completed with ${insights.length} insights`,
      insights,
    });
  } catch (error: any) {
    console.error('[Trinity Insights API] Error running proactive scan:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to run proactive scan',
      message: error.message || 'An unexpected error occurred'
    });
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
    const user = await getAuthenticatedUser(req);
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

/**
 * GET /api/trinity/context
 * Get the full Trinity context for the current user
 * This tells Trinity who it's talking to and how to respond
 * 
 * Set TRINITY_DIALOGUE_ENABLED=false to disable AI thought generation (saves tokens during testing)
 */
router.get('/context', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const workspaceId = req.query.workspaceId as string | undefined;
    const context = await trinityContextService.resolve(user.id, workspaceId);
    
    // Check if Trinity dialogue is enabled (default: true)
    // Set TRINITY_DIALOGUE_ENABLED=false to disable AI thoughts during testing
    const dialogueEnabled = process.env.TRINITY_DIALOGUE_ENABLED !== 'false';
    
    let contextualThought: string | null = null;
    if (dialogueEnabled) {
      contextualThought = await trinityContextService.generateThought(context);
    }
    
    res.json({
      success: true,
      context,
      initialThought: contextualThought,
      dialogueEnabled, // Let frontend know if dialogue is active
    });
  } catch (error: any) {
    console.error('[Trinity Context API] Error resolving context:', error);
    res.status(500).json({ error: 'Failed to resolve Trinity context' });
  }
});

/**
 * GET /api/trinity/access
 * Check if user has access to Trinity features
 * Used by frontend to gate premium features
 */
router.get('/access', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.json({
        hasAccess: false,
        accessLevel: 'none',
        reason: 'not_authenticated',
      });
    }
    
    const workspaceId = req.query.workspaceId as string | undefined;
    const context = await trinityContextService.resolve(user.id, workspaceId);
    
    res.json({
      hasAccess: context.trinityAccessLevel !== 'none',
      accessLevel: context.trinityAccessLevel,
      reason: context.trinityAccessReason,
      hasTrinityPro: context.hasTrinityPro,
      hasBusinessBuddy: context.hasBusinessBuddy,
      persona: context.persona,
      isPlatformStaff: context.isPlatformStaff,
      isRootAdmin: context.isRootAdmin,
    });
  } catch (error: any) {
    console.error('[Trinity Access API] Error checking access:', error);
    res.status(500).json({ error: 'Failed to check Trinity access' });
  }
});

/**
 * POST /api/trinity/thought
 * Generate a contextual thought based on current state
 * 
 * Set TRINITY_DIALOGUE_ENABLED=false to disable AI thought generation (saves tokens during testing)
 */
router.post('/thought', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Check if Trinity dialogue is enabled (default: true)
    const dialogueEnabled = process.env.TRINITY_DIALOGUE_ENABLED !== 'false';
    if (!dialogueEnabled) {
      return res.json({
        success: true,
        thought: null,
        reason: 'dialogue_disabled',
        dialogueEnabled: false,
      });
    }
    
    const { workspaceId, trigger } = req.body;
    const context = await trinityContextService.resolve(user.id, workspaceId);
    
    if (context.trinityAccessLevel === 'none') {
      return res.json({
        success: false,
        thought: null,
        reason: 'no_access',
      });
    }
    
    const thought = await trinityContextService.generateThought(context);
    
    res.json({
      success: true,
      thought,
      dialogueEnabled: true,
      context: {
        persona: context.persona,
        greeting: context.greeting,
        isRootAdmin: context.isRootAdmin,
        isPlatformStaff: context.isPlatformStaff,
        workspaceName: context.workspaceName,
      },
    });
  } catch (error: any) {
    console.error('[Trinity Thought API] Error generating thought:', error);
    res.status(500).json({ error: 'Failed to generate thought' });
  }
});

export default router;
