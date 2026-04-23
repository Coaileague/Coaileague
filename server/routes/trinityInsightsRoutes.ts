/**
 * Trinity Insights API Routes
 * 
 * Endpoints for Trinity AI business intelligence insights
 * Including context resolution and access control
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response, NextFunction } from 'express';
import { aiAnalyticsEngine } from '../services/ai-brain/aiAnalyticsEngine';
import { trinityContextService, type TrinityContext } from '../services/trinityContext';
import { trinitySelfAssessment } from '../services/ai-brain/trinitySelfAssessment';
import { autonomousFixPipeline } from '../services/ai-brain/autonomousFixPipeline';
import { workflowApprovalService } from '../services/ai-brain/workflowApprovalService';
import { subagentSupervisor } from '../services/ai-brain/subagentSupervisor';
import { trinityOrchestrationGateway } from '../services/trinity/trinityOrchestrationGateway';
import { trinityOrgIntelligenceService } from '../services/ai-brain/trinityOrgIntelligenceService';
import { canAccessTrinity, getUserPlatformRole, hasPlatformWideAccess, getPlatformRoleLevel, requireManager, type AuthenticatedRequest } from '../rbac';
import { db, pool } from '../db';
import { users, aiWorkflowApprovals, aiGapFindings, subagentTelemetry, trinityUsageAnalytics, trinityRecommendations } from '@shared/schema';
import { eq, desc, and, gte, sql } from 'drizzle-orm';
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('TrinityInsightsRoutes');

// ---------------------------------------------------------------------------
// Local auth helpers — requireManager (applied via router.use below) already
// validates the session and sets req.user / req.workspaceId before any route
// handler runs. These helpers provide a consistent async interface.
// ---------------------------------------------------------------------------
async function getAuthenticatedUser(req: AuthenticatedRequest): Promise<any> {
  return req.user || null;
}

async function resolveSecureWorkspaceId(user: any, _requestedId?: string): Promise<string> {
  // requireManager already resolved the workspace securely and stamped it onto
  // req.user?.workspaceId (see auth.ts). For platform staff it has already been
  // overridden with the admin-specified workspace. We simply reflect that value.
  return user?.workspaceId || '';
}

const router = Router();

router.use(requireManager);

/**
 * GET /api/trinity/insights
 * Get Trinity insights for the current user/workspace
 */
router.get('/insights', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const workspaceId = req.workspaceId;
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
  } catch (error: unknown) {
    log.error('[Trinity Insights API] Error fetching insights:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch insights' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const insightId = req.params.id;
    const success = await aiAnalyticsEngine.markInsightRead(insightId);

    if (success) {
      res.json({ success: true, message: 'Insight marked as read' });
    } else {
      res.status(404).json({ success: false, error: 'Insight not found' });
    }
  } catch (error: unknown) {
    log.error('[Trinity Insights API] Error marking insight as read:', error);
    res.status(500).json({ success: false, error: 'Failed to mark insight as read' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    let workspaceId = await resolveSecureWorkspaceId(user, req.body.workspaceId as string);
    
    if (!workspaceId) {
      workspaceId = PLATFORM_WORKSPACE_ID;
    }

    if (!aiAnalyticsEngine.isAvailable()) {
      return res.json({
        success: false,
        message: 'My analytics engine is not currently available. Please check the AI service configuration.',
        insights: [],
        aiUnavailable: true,
      });
    }

    const insights = await aiAnalyticsEngine.runProactiveScan(workspaceId);

    res.json({
      success: true,
      message: `Proactive scan completed with ${insights.length} insights`,
      insights,
    });
  } catch (error: unknown) {
    log.error('[Trinity Insights API] Error running proactive scan:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to run proactive scan',
      message: sanitizeError(error) || 'An unexpected error occurred'
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
  } catch (error: unknown) {
    log.error('[Trinity Insights API] Error checking status:', error);
    res.status(500).json({ success: false, error: 'Failed to check status' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const requestedWorkspaceId = req.body.workspaceId;
    if (requestedWorkspaceId && requestedWorkspaceId !== user.workspaceId) {
      const platformRole = await getUserPlatformRole(user.id);
      if (!hasPlatformWideAccess(platformRole)) {
        return res.status(403).json({ success: false, error: 'Only platform administrators can clear cache for other workspaces' });
      }
    }
    const workspaceId = requestedWorkspaceId || user.workspaceId;
    aiAnalyticsEngine.clearCache(workspaceId);
    
    res.json({
      success: true,
      message: workspaceId ? `Cache cleared for workspace ${workspaceId}` : 'All caches cleared',
    });
  } catch (error: unknown) {
    log.error('[Trinity Insights API] Error clearing cache:', error);
    res.status(500).json({ success: false, error: 'Failed to clear cache' });
  }
});

/**
 * GET /api/trinity/context
 * Get the full Trinity context for the current user
 * This tells Trinity who it's talking to and how to respond
 * 
 * Set TRINITY_DIALOGUE_ENABLED=false to disable AI thought generation (saves tokens during testing)
 */
const trinityContextCache = new Map<string, { data: any; timestamp: number }>();
const TRINITY_CONTEXT_CACHE_TTL = 15000; // 15 seconds (polled every 20s)

router.get('/context', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const workspaceId = await resolveSecureWorkspaceId(user, req.query.workspaceId as string);
    const cacheKey = `${user.id}:${workspaceId}`;
    const now = Date.now();
    const cached = trinityContextCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < TRINITY_CONTEXT_CACHE_TTL) {
      return res.json(cached.data);
    }

    const context = await trinityContextService.resolve(user.id, workspaceId);
    
    const dialogueEnabled = process.env.TRINITY_DIALOGUE_ENABLED !== 'false';
    
    let contextualThought: string | null = null;
    if (dialogueEnabled) {
      contextualThought = await trinityContextService.generateThought(context);
    }
    
    const responseData = {
      success: true,
      context,
      initialThought: contextualThought,
      dialogueEnabled,
    };
    trinityContextCache.set(cacheKey, { data: responseData, timestamp: now });
    
    res.json(responseData);
  } catch (error: unknown) {
    log.error('[Trinity Context API] Error resolving context:', error);
    res.status(500).json({ success: false, error: 'Failed to resolve Trinity context' });
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
    
    const workspaceId = await resolveSecureWorkspaceId(user, req.query.workspaceId as string);
    const context = await trinityContextService.resolve(user.id, workspaceId);
    
    res.json({
      hasAccess: context.trinityAccessLevel !== 'none',
      accessLevel: context.trinityAccessLevel,
      reason: context.trinityAccessReason,
      hasTrinityPro: context.hasTrinityPro,
      trinityMode: context.trinityMode,
      persona: context.persona,
      isPlatformStaff: context.isPlatformStaff,
      isRootAdmin: context.isRootAdmin,
    });
  } catch (error: unknown) {
    log.error('[Trinity Access API] Error checking access:', error);
    res.status(500).json({ success: false, error: 'Failed to check Trinity access' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
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
    
    const { workspaceId: requestedWsId, trigger } = req.body;
    const workspaceId = await resolveSecureWorkspaceId(user, requestedWsId);
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
  } catch (error: unknown) {
    log.error('[Trinity Thought API] Error generating thought:', error);
    res.status(500).json({ success: false, error: 'Failed to generate thought' });
  }
});

/**
 * GET /api/trinity/self-assessment
 * Ask Trinity what she needs to be complete - returns capability gaps and recommendations
 */
router.get('/self-assessment', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    const workspaceId = user ? await resolveSecureWorkspaceId(user, req.query.workspaceId as string) : undefined;
    
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
  } catch (error: unknown) {
    log.error('[Trinity Self-Assessment API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to perform self-assessment' });
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
  } catch (error: unknown) {
    log.error('[Trinity Ask API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to get Trinity response' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
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
        endUserSummary: (f as any).endUserSummary,
        affectedFiles: (f as any).affectedFiles,
        riskLevel: f.riskLevel,
        status: f.status,
        requiredRole: (f as any).requiredRole,
        createdAt: f.createdAt,
        expiresAt: f.expiresAt,
      })),
      count: fixes.length,
    });
  } catch (error: unknown) {
    log.error('[Trinity Fixes API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch fixes' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const { findingId } = req.body;
    if (!findingId) {
      return res.status(400).json({ success: false, error: 'findingId is required' });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
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
  } catch (error: unknown) {
    log.error('[Trinity Fixes API] Propose error:', error);
    res.status(500).json({ success: false, error: 'Failed to propose fix' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const approval = await workflowApprovalService.getApprovalById(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Fix approval not found' });
    }
    
    res.json({
      success: true,
      preview: {
        id: approval.id,
        title: approval.title,
        description: approval.description,
        endUserSummary: (approval as any).endUserSummary,
        affectedFiles: (approval as any).affectedFiles,
        proposedChanges: (approval as any).proposedChanges,
        rollbackPlan: (approval as any).rollbackPlan,
        riskLevel: approval.riskLevel,
        impactScope: approval.impactScope,
        status: approval.status,
        requiredRole: (approval as any).requiredRole,
        createdAt: approval.createdAt,
        expiresAt: approval.expiresAt,
      },
    });
  } catch (error: unknown) {
    log.error('[Trinity Fixes API] Preview error:', error);
    res.status(500).json({ success: false, error: 'Failed to preview fix' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const allowedRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
    if (!allowedRoles.includes(user.platformRole || '')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to execute fixes' });
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
  } catch (error: unknown) {
    log.error('[Trinity Fixes API] Execute error:', error);
    res.status(500).json({ success: false, error: 'Failed to execute fix' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const allowedRoles = ['root_admin', 'deputy_admin', 'sysop'];
    if (!allowedRoles.includes(user.platformRole || '')) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions to rollback fixes' });
    }
    
    const approval = await workflowApprovalService.getApprovalById(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: 'Fix approval not found' });
    }
    
    if (!(approval as any).commitHash) {
      return res.status(400).json({ success: false, error: 'No commit hash available for rollback' });
    }
    
    // Rollback functionality is not yet implemented in autonomousFixPipeline
    // This is a placeholder for future implementation
    res.status(501).json({
      success: false,
      error: 'Rollback functionality is not yet implemented',
      message: 'Manual rollback required using git revert on commit: ' + (approval as any).commitHash,
    });
  } catch (error: unknown) {
    log.error('[Trinity Fixes API] Rollback error:', error);
    res.status(500).json({ success: false, error: 'Failed to rollback fix' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
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
  } catch (error: unknown) {
    log.error('[Trinity Subagents API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subagent status' });
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
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const { domain } = req.params;
    const subagent = await subagentSupervisor.getSubagent(domain);
    
    if (!subagent) {
      return res.status(404).json({ success: false, error: 'Subagent not found' });
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
        taskType: (t as any).taskType,
        status: t.status,
        durationMs: t.durationMs,
        createdAt: t.createdAt,
        errorMessage: t.errorMessage,
      })),
    });
  } catch (error: unknown) {
    log.error('[Trinity Subagents API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subagent details' });
  }
});


/**
 * POST /api/trinity/validate-license
 * Trinity AI validation for state license numbers
 * Validates format based on state and industry requirements
 */
router.post('/validate-license', async (req: Request, res: Response) => {
  try {
    const { licenseNumber, state, industry } = req.body;
    
    if (!licenseNumber || !state || !industry) {
      return res.status(400).json({ 
        valid: false, 
        message: 'License number, state, and industry are required' 
      });
    }
    
    // State-specific license format patterns
    const statePatterns: Record<string, { pattern: RegExp; description: string }> = {
      TX: { pattern: /^[A-Z]?\d{7,9}$/, description: 'Texas PSB: Letter + 7-9 digits (e.g., C11608501)' },
      CA: { pattern: /^[A-Z]{2,3}\d{5,7}$/, description: 'California BSIS: 2-3 letters + 5-7 digits' },
      FL: { pattern: /^[A-Z]{1,2}\d{7,8}$/, description: 'Florida DACS: 1-2 letters + 7-8 digits' },
      NY: { pattern: /^\d{7,10}$/, description: 'New York DOS: 7-10 digits' },
      AZ: { pattern: /^\d{8,9}$/, description: 'Arizona DPS: 8-9 digits' },
      NV: { pattern: /^[A-Z]?\d{6,8}$/, description: 'Nevada: Optional letter + 6-8 digits' },
      IL: { pattern: /^\d{6,9}$/, description: 'Illinois DFPR: 6-9 digits' },
      PA: { pattern: /^[A-Z]?\d{7,8}$/, description: 'Pennsylvania: Optional letter + 7-8 digits' },
      OH: { pattern: /^\d{6,8}$/, description: 'Ohio DPS: 6-8 digits' },
      GA: { pattern: /^[A-Z]{2}\d{6,8}$/, description: 'Georgia: 2 letters + 6-8 digits' },
    };
    
    const stateConfig = statePatterns[state.toUpperCase()];
    
    if (!stateConfig) {
      // For unknown states, allow any alphanumeric format
      const genericPattern = /^[A-Z0-9]{5,15}$/;
      const isValid = genericPattern.test(licenseNumber.toUpperCase());
      return res.json({
        valid: isValid,
        message: isValid 
          ? 'License format accepted (generic validation)'
          : 'License should be 5-15 alphanumeric characters',
        trinityNote: 'This state does not have a specific validation pattern configured.',
      });
    }
    
    const isValid = stateConfig.pattern.test(licenseNumber.toUpperCase());
    
    res.json({
      valid: isValid,
      message: isValid 
        ? `License format matches ${state.toUpperCase()} requirements`
        : `Expected format: ${stateConfig.description}`,
      state: state.toUpperCase(),
      industry,
      trinityNote: isValid 
        ? 'I\'ve verified the license format. Final verification will be done by the regulatory authority.'
        : 'Please check your license number and try again.',
    });
  } catch (error: unknown) {
    log.error('[Trinity License Validation] Error:', error);
    res.status(500).json({ 
      valid: false, 
      message: 'Validation failed. You can still proceed - license will be verified later.' 
    });
  }
});

// =====================================================
// TRINITY ORCHESTRATION GATEWAY ENDPOINTS
// Intelligent upsell, recommendations, and analytics
// Multi-tenant security: Only access user's own workspace
// =====================================================

/**
 * GET /api/trinity/recommendations
 * Get pending upsell recommendations for the current workspace
 * Security: Only returns recommendations for user's authenticated workspace
 */
router.get('/recommendations', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const workspaceId = user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace membership required' });
    }
    
    const recommendations = await trinityOrchestrationGateway.getRecommendations(workspaceId);
    
    res.json({
      success: true,
      recommendations,
      count: recommendations.length,
      workspaceId,
    });
  } catch (error: unknown) {
    log.error('[Trinity Recommendations API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch recommendations' });
  }
});

/**
 * PATCH /api/trinity/recommendations/:id
 * Update recommendation status (shown, clicked, dismissed, converted)
 * Security: Verifies recommendation belongs to user's workspace before update
 */
router.patch('/recommendations/:id', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const workspaceId = user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace membership required' });
    }
    
    const recommendationId = req.params.id;
    const { status, dismissReason } = req.body;
    
    if (!['shown', 'clicked', 'dismissed', 'converted'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be: shown, clicked, dismissed, or converted' });
    }
    
    const existing = await db.query.trinityRecommendations.findFirst({
      where: eq(trinityRecommendations.id, recommendationId),
    });
    
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Recommendation not found' });
    }
    
    if (existing.workspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: 'Access denied to this recommendation' });
    }
    
    await trinityOrchestrationGateway.updateRecommendationStatus(
      recommendationId,
      status,
      dismissReason
    );
    
    res.json({ success: true, message: `Recommendation marked as ${status}` });
  } catch (error: unknown) {
    log.error('[Trinity Recommendations API] Error updating:', error);
    res.status(500).json({ success: false, error: 'Failed to update recommendation' });
  }
});

/**
 * GET /api/trinity/analytics
 * Get usage analytics for the current workspace
 * Security: Only returns analytics for user's authenticated workspace
 */
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const workspaceId = user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace membership required' });
    }
    
    const periodType = (req.query.period as string) || 'daily';
    const validPeriodTypes = ['hourly', 'daily', 'weekly', 'monthly'];
    if (!validPeriodTypes.includes(periodType)) {
      return res.status(400).json({ success: false, error: 'Invalid period type. Must be: hourly, daily, weekly, or monthly' });
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 90);
    
    const analytics = await db.query.trinityUsageAnalytics.findMany({
      where: and(
        eq(trinityUsageAnalytics.workspaceId, workspaceId),
        eq(trinityUsageAnalytics.periodType, periodType)
      ),
      orderBy: [desc(trinityUsageAnalytics.periodStart)],
      limit,
    });
    
    res.json({
      success: true,
      analytics,
      count: analytics.length,
      workspaceId,
      periodType,
    });
  } catch (error: unknown) {
    log.error('[Trinity Analytics API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
  }
});

/**
 * POST /api/trinity/analytics/aggregate
 * Trigger analytics aggregation for the current workspace
 * Security: Only aggregates for user's authenticated workspace
 */
router.post('/analytics/aggregate', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    const workspaceId = user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: 'Workspace membership required' });
    }
    
    const periodType = (req.body.periodType || 'daily') as 'hourly' | 'daily' | 'weekly' | 'monthly';
    const validPeriodTypes = ['hourly', 'daily', 'weekly', 'monthly'];
    if (!validPeriodTypes.includes(periodType)) {
      return res.status(400).json({ success: false, error: 'Invalid period type. Must be: hourly, daily, weekly, or monthly' });
    }
    
    await trinityOrchestrationGateway.aggregateUsageAnalytics(workspaceId, periodType);
    
    res.json({ 
      success: true, 
      message: `${periodType} analytics aggregation triggered for workspace`,
      workspaceId,
    });
  } catch (error: unknown) {
    log.error('[Trinity Analytics API] Aggregation error:', error);
    res.status(500).json({ success: false, error: 'Failed to aggregate analytics' });
  }
});

/**
 * GET /api/trinity/audit
 * Run the 35-point security pain audit
 * Note: This audit is platform-wide, not workspace-specific
 */
router.get('/audit', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    if (!canAccessTrinity(user as any)) {
      return res.status(403).json({ success: false, error: 'Trinity access required' });
    }
    
    const results = await trinityOrchestrationGateway.runSecurityPainAudit();
    const summary = await trinityOrchestrationGateway.getAuditSummary();
    
    res.json({
      success: true,
      summary,
      painPoints: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Audit API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to run security pain audit' });
  }
});

/**
 * GET /api/trinity/audit/summary
 * Get audit summary without full pain point details
 */
router.get('/audit/summary', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    if (!canAccessTrinity(user as any)) {
      return res.status(403).json({ success: false, error: 'Trinity access required' });
    }
    
    const summary = await trinityOrchestrationGateway.getAuditSummary();
    
    res.json({
      success: true,
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Audit API] Summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to get audit summary' });
  }
});

router.get('/platform-scan', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const platformRole = await getUserPlatformRole(user.id);
    const roleLevel = getPlatformRoleLevel(platformRole);

    if (roleLevel < 4) {
      return res.status(403).json({ success: false, error: 'Platform-wide scan requires support_manager or higher authority' });
    }

    const scanResult = await trinityOrgIntelligenceService.scanAllWorkspaces();

    res.json({
      success: true,
      ...scanResult,
      requestedBy: user.id,
      requestedRole: platformRole,
    });
  } catch (error: unknown) {
    log.error('[Trinity Platform Scan] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to perform platform-wide scan' });
  }
});

router.get('/platform-patterns', async (req: Request, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const platformRole = await getUserPlatformRole(user.id);
    if (!hasPlatformWideAccess(platformRole)) {
      return res.status(403).json({ success: false, error: 'Platform-wide access required' });
    }

    const allPatterns = trinityOrgIntelligenceService.getAllPlatformPatterns();
    const allIssues = trinityOrgIntelligenceService.getAllActiveIssues();
    const allTasks = trinityOrgIntelligenceService.getAllActiveTasks();

    res.json({
      success: true,
      patterns: allPatterns,
      activeIssues: allIssues,
      activeTasks: allTasks,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Trinity Platform Patterns] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to get platform patterns' });
  }
});

// ========================================
// AI USAGE DASHBOARD ENDPOINTS
// ========================================

/**
 * GET /api/trinity/ai-usage/summary
 * Returns AI usage summary for the authenticated workspace (owner/manager only).
 */
router.get('/ai-usage/summary', async (req: any, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // FIX: Never accept workspaceId from the query string — a manager could
    // supply any workspaceId and read AI usage data for a workspace they don't
    // belong to. Always resolve from the session-attached middleware value.
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });

    const days = Math.min(Math.max(1, parseInt(req.query.days as string) || 30), 365);

    // Total calls and tokens in period
    // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: trinity_ai_usage_log | Verified: 2026-03-23
    const totalsResult = await typedPool(`
      SELECT
        COUNT(*) as total_calls,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(credits_deducted), 0) as total_credits,
        COALESCE(SUM(response_time_ms), 0) as total_response_ms,
        COALESCE(AVG(response_time_ms), 0) as avg_response_ms
      FROM trinity_ai_usage_log
      WHERE workspace_id = $1
        AND called_at > NOW() - ($2 || ' days')::INTERVAL
    `, [workspaceId, days]);

    // Breakdown by call type
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: trinity_ai_usage_log | Verified: 2026-03-23
    const byTypeResult = await typedPool(`
      SELECT
        call_type,
        COUNT(*) as calls,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(credits_deducted), 0) as credits,
        COALESCE(AVG(response_time_ms), 0) as avg_ms
      FROM trinity_ai_usage_log
      WHERE workspace_id = $1
        AND called_at > NOW() - ($2 || ' days')::INTERVAL
      GROUP BY call_type
      ORDER BY calls DESC
    `, [workspaceId, days]);

    // Daily usage trend (last N days)
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: trinity_ai_usage_log | Verified: 2026-03-23
    const trendResult = await typedPool(`
      SELECT
        DATE_TRUNC('day', called_at) as day,
        COUNT(*) as calls,
        COALESCE(SUM(total_tokens), 0) as tokens,
        COALESCE(SUM(credits_deducted), 0) as credits
      FROM trinity_ai_usage_log
      WHERE workspace_id = $1
        AND called_at > NOW() - ($2 || ' days')::INTERVAL
      GROUP BY DATE_TRUNC('day', called_at)
      ORDER BY day ASC
    `, [workspaceId, days]);

    // Top users by credit consumption
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: trinity_ai_usage_log | Verified: 2026-03-23
    const topUsersResult = await typedPool(`
      SELECT
        user_id,
        user_role,
        COUNT(*) as calls,
        COALESCE(SUM(credits_deducted), 0) as credits
      FROM trinity_ai_usage_log
      WHERE workspace_id = $1
        AND called_at > NOW() - ($2 || ' days')::INTERVAL
        AND user_id IS NOT NULL
      GROUP BY user_id, user_role
      ORDER BY credits DESC
      LIMIT 10
    `, [workspaceId, days]);

    // Peripheral awareness items surfaced
    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: trinity_peripheral_surfaced | Verified: 2026-03-23
    const peripheralResult = await typedPool(`
      SELECT item_category, COUNT(*) as times_surfaced
      FROM trinity_peripheral_surfaced
      WHERE workspace_id = $1
      GROUP BY item_category
      ORDER BY times_surfaced DESC
    `, [workspaceId]);

    // Hypothesis sessions
    // Converted to Drizzle ORM: CASE WHEN → sql fragment
    const hypothesisResult = await db.select({
      totalSessions: sql<number>`count(*)::int`,
      converged: sql<number>`count(case when ${ (await import('@shared/schema')).trinityHypothesisSessions.status } = 'converged' then 1 end)::int`,
      inconclusive: sql<number>`count(case when ${ (await import('@shared/schema')).trinityHypothesisSessions.status } = 'inconclusive' then 1 end)::int`
    })
    .from((await import('@shared/schema')).trinityHypothesisSessions)
    .where(and(
      eq((await import('@shared/schema')).trinityHypothesisSessions.workspaceId, workspaceId),
      sql`${ (await import('@shared/schema')).trinityHypothesisSessions.createdAt } > NOW() - (${days} || ' days')::INTERVAL`
    ));

    const totals = totalsResult.rows[0];

    res.json({
      success: true,
      period: { days },
      summary: {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        totalCalls: parseInt(totals.total_calls),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        totalTokens: parseInt(totals.total_tokens),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        totalCredits: parseInt(totals.total_credits),
        // @ts-expect-error — TS migration: fix in refactoring sprint
        avgResponseMs: Math.round(parseFloat(totals.avg_response_ms)),
      },
      byCallType: byTypeResult.rows.map((r: any) => ({
        callType: r.call_type,
        calls: parseInt(r.calls),
        tokens: parseInt(r.tokens),
        credits: parseInt(r.credits),
        avgMs: Math.round(parseFloat(r.avg_ms)),
      })),
      dailyTrend: trendResult.rows.map((r: any) => ({
        day: r.day,
        calls: parseInt(r.calls),
        tokens: parseInt(r.tokens),
        credits: parseInt(r.credits),
      })),
      topUsers: topUsersResult.rows.map((r: any) => ({
        userId: r.user_id,
        userRole: r.user_role,
        calls: parseInt(r.calls),
        credits: parseInt(r.credits),
      })),
      peripheralAwareness: peripheralResult.rows.map((r: any) => ({
        category: r.item_category,
        timesSurfaced: parseInt(r.times_surfaced),
      })),
      hypothesisSessions: {
        total: hypothesisResult[0]?.totalSessions || 0,
        converged: hypothesisResult[0]?.converged || 0,
        inconclusive: hypothesisResult[0]?.inconclusive || 0,
      },
    });
  } catch (err: unknown) {
    log.error('[AI Usage Summary] Error:', err);
    res.status(500).json({ success: false, error: 'Failed to load AI usage data' });
  }
});

export default router;
