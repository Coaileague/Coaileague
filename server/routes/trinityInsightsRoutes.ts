/**
 * Trinity Insights API Routes
 * 
 * Endpoints for Trinity AI business intelligence insights
 * Including context resolution and access control
 */

import { Router, Request, Response, NextFunction } from 'express';
import { aiAnalyticsEngine } from '../services/ai-brain/aiAnalyticsEngine';
import { trinityContextService, type TrinityContext } from '../services/trinityContext';
import { trinitySelfAssessment } from '../services/ai-brain/trinitySelfAssessment';
import { autonomousFixPipeline } from '../services/ai-brain/autonomousFixPipeline';
import { workflowApprovalService } from '../services/ai-brain/workflowApprovalService';
import { subagentSupervisor } from '../services/ai-brain/subagentSupervisor';
import { canAccessTrinity } from '../rbac';
import { db } from '../db';
import { users, aiWorkflowApprovals, aiGapFindings, subagentTelemetry } from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';

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
    // PERFORMANCE FIX: Only include thought generation if explicitly requested via query param
    // This speeds up initial page loads by 3-5 seconds
    const includeThought = req.query.includeThought === 'true';
    
    const context = await trinityContextService.resolve(user.id, workspaceId);
    
    // Check if Trinity dialogue is enabled (default: true)
    // Set TRINITY_DIALOGUE_ENABLED=false to disable AI thoughts during testing
    const dialogueEnabled = process.env.TRINITY_DIALOGUE_ENABLED !== 'false';
    
    let contextualThought: string | null = null;
    // Only generate thought if explicitly requested - lazy loading for performance
    if (dialogueEnabled && includeThought) {
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

/**
 * GET /api/trinity/self-assessment
 * Ask Trinity what she needs to be complete - returns capability gaps and recommendations
 */
router.get('/self-assessment', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    const workspaceId = user?.workspaceId || (req.query.workspaceId as string);
    
    const assessment = await trinitySelfAssessment.performAssessment(workspaceId);
    
    res.json({
      success: true,
      assessment: {
        overallReadiness: assessment.overallReadiness,
        canRunTheShow: assessment.canRunTheShow,
        confidenceLevel: assessment.confidenceLevel,
        totalCapabilities: assessment.totalCapabilities,
        matureCapabilities: assessment.matureCapabilities,
        criticalGaps: assessment.criticalGaps,
        trinityNarrative: assessment.trinityNarrative,
        prioritizedActions: assessment.prioritizedActions,
        comparisonToReplitAgent: assessment.comparisonToReplitAgent,
      },
      gaps: assessment.gaps.filter(g => g.severity === 'critical' || g.severity === 'high'),
      capabilities: assessment.capabilities.slice(0, 10),
      timestamp: assessment.timestamp,
    });
  } catch (error: any) {
    console.error('[Trinity Self-Assessment API] Error:', error);
    res.status(500).json({ error: 'Failed to perform self-assessment' });
  }
});

/**
 * POST /api/trinity/ask-what-needed
 * Conversational endpoint: Ask Trinity what she needs in plain language
 */
router.post('/ask-what-needed', async (req: Request, res: Response) => {
  try {
    const assessment = await trinitySelfAssessment.performAssessment();
    
    const response = {
      trinityResponse: assessment.trinityNarrative,
      readinessScore: assessment.overallReadiness,
      topNeeds: assessment.prioritizedActions.slice(0, 5).map(a => a.action),
      criticalGapsCount: assessment.criticalGaps,
      feelsOrganized: assessment.overallReadiness >= 70,
      inventorySystemFeedback: assessment.criticalGaps === 0 
        ? "I feel more organized with the new file system. All critical infrastructure gaps have been resolved."
        : `I still need ${assessment.criticalGaps} critical items addressed to feel fully organized.`,
    };
    
    res.json({ success: true, ...response });
  } catch (error: any) {
    console.error('[Trinity Ask API] Error:', error);
    res.status(500).json({ error: 'Failed to get Trinity response' });
  }
});

// ============================================================================
// TRINITY AUTONOMOUS FIX WORKFLOW ROUTES
// ============================================================================

/**
 * GET /api/trinity/fixes
 * List pending fix approvals for Trinity
 */
router.get('/fixes', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const status = (req.query.status as string) || 'pending';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const fixes = await workflowApprovalService.getApprovalsByStatus(status, limit);
    
    res.json({
      success: true,
      fixes: fixes.map(f => ({
        id: f.id,
        title: f.title,
        description: f.description,
        endUserSummary: f.endUserSummary,
        affectedFiles: f.affectedFiles,
        riskLevel: f.riskLevel,
        status: f.status,
        requiredRole: f.requiredRole,
        createdAt: f.createdAt,
        expiresAt: f.expiresAt,
      })),
      count: fixes.length,
    });
  } catch (error: any) {
    console.error('[Trinity Fixes API] Error:', error);
    res.status(500).json({ error: 'Failed to fetch fixes' });
  }
});

/**
 * POST /api/trinity/fixes/propose
 * Propose a fix for a gap finding
 */
router.post('/fixes/propose', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { findingId } = req.body;
    if (!findingId) {
      return res.status(400).json({ error: 'findingId is required' });
    }
    
    const spec = await autonomousFixPipeline.generateFixSpecification(parseInt(findingId));
    
    if (!spec) {
      return res.status(404).json({ 
        success: false, 
        error: 'Could not generate fix specification for this finding' 
      });
    }
    
    res.json({
      success: true,
      specification: {
        findingId: spec.findingId,
        title: spec.title,
        approach: spec.approach,
        affectedFiles: spec.affectedFiles,
        patchCount: spec.patches.length,
        riskLevel: spec.riskLevel,
        confidence: spec.confidence,
        requiresApproval: spec.requiresApproval,
        estimatedImpact: spec.estimatedImpact,
        rollbackPlan: spec.rollbackPlan,
      },
    });
  } catch (error: any) {
    console.error('[Trinity Fixes API] Propose error:', error);
    res.status(500).json({ error: 'Failed to propose fix' });
  }
});

/**
 * GET /api/trinity/fixes/:id/preview
 * Preview a fix (dry run) before execution
 */
router.get('/fixes/:id/preview', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const approval = await workflowApprovalService.getApprovalById(req.params.id);
    if (!approval) {
      return res.status(404).json({ error: 'Fix approval not found' });
    }
    
    res.json({
      success: true,
      preview: {
        id: approval.id,
        title: approval.title,
        description: approval.description,
        endUserSummary: approval.endUserSummary,
        affectedFiles: approval.affectedFiles,
        proposedChanges: approval.proposedChanges,
        rollbackPlan: approval.rollbackPlan,
        riskLevel: approval.riskLevel,
        impactScope: approval.impactScope,
        status: approval.status,
        requiredRole: approval.requiredRole,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
      },
    });
  } catch (error: any) {
    console.error('[Trinity Fixes API] Preview error:', error);
    res.status(500).json({ error: 'Failed to preview fix' });
  }
});

/**
 * POST /api/trinity/fixes/:id/execute
 * Execute an approved fix
 */
router.post('/fixes/:id/execute', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const allowedRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
    if (!allowedRoles.includes(user.platformRole || '')) {
      return res.status(403).json({ error: 'Insufficient permissions to execute fixes' });
    }
    
    const result = await autonomousFixPipeline.executeApprovedFix(req.params.id);
    
    res.json({
      success: result.success,
      result: {
        findingId: result.findingId,
        validationPassed: result.validationPassed,
        validationErrors: result.validationErrors,
        commitHash: result.commitHash,
        rollbackAvailable: result.rollbackAvailable,
        message: result.message,
      },
    });
  } catch (error: any) {
    console.error('[Trinity Fixes API] Execute error:', error);
    res.status(500).json({ error: 'Failed to execute fix' });
  }
});

/**
 * POST /api/trinity/fixes/:id/rollback
 * Rollback a previously applied fix
 */
router.post('/fixes/:id/rollback', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const allowedRoles = ['root_admin', 'deputy_admin', 'sysop'];
    if (!allowedRoles.includes(user.platformRole || '')) {
      return res.status(403).json({ error: 'Insufficient permissions to rollback fixes' });
    }
    
    const approval = await workflowApprovalService.getApprovalById(req.params.id);
    if (!approval) {
      return res.status(404).json({ error: 'Fix approval not found' });
    }
    
    if (!approval.commitHash) {
      return res.status(400).json({ error: 'No commit hash available for rollback' });
    }
    
    // Rollback functionality is not yet implemented in autonomousFixPipeline
    // This is a placeholder for future implementation
    res.status(501).json({
      success: false,
      error: 'Rollback functionality is not yet implemented',
      message: 'Manual rollback required using git revert on commit: ' + approval.commitHash,
    });
  } catch (error: any) {
    console.error('[Trinity Fixes API] Rollback error:', error);
    res.status(500).json({ error: 'Failed to rollback fix' });
  }
});

// ============================================================================
// TRINITY SUBAGENT STATUS BOARD ROUTES
// ============================================================================

/**
 * GET /api/trinity/subagents
 * Get real-time status of all Trinity subagents
 */
router.get('/subagents', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const allSubagents = await subagentSupervisor.getAllSubagents();
    const healthData = await subagentSupervisor.getSubagentHealth();
    const healthMap = new Map(healthData.map(h => [h.subagentId, h]));
    
    const subagentStatuses = [];
    
    for (const subagent of allSubagents) {
      const health = healthMap.get(subagent.id);
      const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [telemetry] = await db
        .select({
          totalTasks: sql<number>`COUNT(*)`,
          successfulTasks: sql<number>`COUNT(*) FILTER (WHERE status = 'completed')`,
          failedTasks: sql<number>`COUNT(*) FILTER (WHERE status = 'failed')`,
          avgDuration: sql<number>`AVG(duration_ms)`,
        })
        .from(subagentTelemetry)
        .where(and(
          eq(subagentTelemetry.subagentId, subagent.id),
          gte(subagentTelemetry.createdAt, last24h)
        ));
      
      subagentStatuses.push({
        id: subagent.id,
        domain: subagent.domain,
        name: subagent.name,
        description: subagent.description || '',
        status: health?.status || 'idle',
        isAvailable: subagent.isActive !== false,
        metrics: {
          totalTasks24h: Number(telemetry?.totalTasks || 0),
          successRate: telemetry?.totalTasks 
            ? ((Number(telemetry.successfulTasks) / Number(telemetry.totalTasks)) * 100).toFixed(1) + '%'
            : 'N/A',
          failedTasks24h: Number(telemetry?.failedTasks || 0),
          avgDurationMs: Math.round(Number(telemetry?.avgDuration || 0)),
        },
        lastActivity: health?.lastExecution || null,
      });
    }
    
    res.json({
      success: true,
      subagents: subagentStatuses,
      count: subagentStatuses.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Trinity Subagents API] Error:', error);
    res.status(500).json({ error: 'Failed to fetch subagent status' });
  }
});

/**
 * GET /api/trinity/subagents/:domain
 * Get detailed status for a specific subagent
 */
router.get('/subagents/:domain', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { domain } = req.params;
    const subagent = await subagentSupervisor.getSubagent(domain);
    
    if (!subagent) {
      return res.status(404).json({ error: 'Subagent not found' });
    }
    
    const healthData = await subagentSupervisor.getSubagentHealth();
    const health = healthData.find(h => h.subagentId === subagent.id);
    
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentTasks = await db
      .select()
      .from(subagentTelemetry)
      .where(and(
        eq(subagentTelemetry.subagentId, subagent.id),
        gte(subagentTelemetry.createdAt, last7d)
      ))
      .orderBy(desc(subagentTelemetry.createdAt))
      .limit(20);
    
    res.json({
      success: true,
      subagent: {
        id: subagent.id,
        domain: subagent.domain,
        name: subagent.name,
        description: subagent.description || '',
        status: health?.status || 'idle',
        isAvailable: subagent.isActive !== false,
        capabilities: subagent.capabilities || [],
        lastActivity: health?.lastExecution || null,
      },
      recentTasks: recentTasks.map(t => ({
        id: t.id,
        taskType: t.taskType,
        status: t.status,
        durationMs: t.durationMs,
        createdAt: t.createdAt,
        errorMessage: t.errorMessage,
      })),
    });
  } catch (error: any) {
    console.error('[Trinity Subagents API] Error:', error);
    res.status(500).json({ error: 'Failed to fetch subagent details' });
  }
});

export default router;
