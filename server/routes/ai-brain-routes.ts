/**
 * AI BRAIN API ROUTES - Enhanced with Business Insights & Self-Selling
 * Universal API for the unified AI Brain system
 */

import { sanitizeError } from '../middleware/errorHandler';
import express, { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requirePlatformStaff } from '../rbac';
import { db } from '../db';
import { aiBrainService } from '../services/ai-brain/aiBrainService';
import { subagentConfidenceMonitor } from '../services/ai-brain/subagentConfidenceMonitor';
import { getAISystemStatus } from '../services/ai-brain/providers/resilientAIGateway';
import { getModelRouterStatus, getChainForRole, routeByRole, type ModelRole } from '../services/ai-brain/providers/modelRouter';
import { trinityScanOrchestrator } from '../services/ai-brain/trinityScanOrchestrator';
import { costOptimizedRouter, classifyTask, getCostRoutingAnalytics } from '../services/ai-brain/costOptimizedRouter';
import { aiProviderBalanceService } from '../services/ai-brain/aiProviderBalances';
import { creditManager } from '../services/billing/creditManager';
import { 
  aiBrainJobs, 
  aiCheckpoints, 
  helposFaqs,
  faqGapEvents,
  faqVersions,
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('AiBrainRoutes');


// Type for authenticated request
// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    currentWorkspaceId?: string;
    role?: string;
  };
}

export const aiBrainRouter: Router = express.Router();

/**
 * GET /api/ai-brain/health - Get AI Brain health metrics
 * Uses requireAuth to support both session-based and Replit OAuth auth
 */
aiBrainRouter.get('/health', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const metrics = await aiBrainService.getHealthMetrics(workspaceId);
    
    res.json(metrics);
  } catch (error: unknown) {
    log.error('Error getting AI Brain health:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get health metrics' });
  }
});

/**
 * GET /api/ai-brain/logs - Recent AI-brain activity log entries
 * Used by TrinityInsightBar on the dashboard to surface proactive insights.
 * Returns the 20 most-recent jobs for the workspace, most-recent first.
 */
aiBrainRouter.get('/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const rows = await db
      .select({
        id: aiBrainJobs.id,
        skill: aiBrainJobs.skill,
        status: aiBrainJobs.status,
        priority: aiBrainJobs.priority,
        createdAt: aiBrainJobs.createdAt,
        completedAt: aiBrainJobs.completedAt,
        executionTimeMs: aiBrainJobs.executionTimeMs,
        error: aiBrainJobs.error,
      })
      .from(aiBrainJobs)
      .where(eq(aiBrainJobs.workspaceId, workspaceId))
      .orderBy(desc(aiBrainJobs.createdAt))
      .limit(limit);

    // Map skill → action for TrinityInsightBar transformer compatibility
    const logs = rows.map((r) => ({
      id: r.id,
      action: r.skill,
      actionType: r.skill,
      status: r.status,
      priority: r.priority,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      executionTimeMs: r.executionTimeMs,
      error: r.error,
    }));

    res.json(logs);
  } catch (error: unknown) {
    log.error('Error getting AI Brain logs:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get logs' });
  }
});

/**
 * GET /api/ai-brain/system-status - Get AI provider gateway status
 * Returns information about provider health, fallback status, and system mode
 * Uses requireAuth to support both session-based and Replit OAuth auth
 */
aiBrainRouter.get('/system-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const status = getAISystemStatus();
    
    res.json({
      success: true,
      status: {
        primaryProvider: status.primaryProvider,
        activeProvider: status.activeProvider,
        mode: status.mode,
        lastHealthCheck: status.lastHealthCheck,
        isHealthy: status.mode !== 'emergency',
        isDegraded: status.mode === 'degraded',
        isEmergency: status.mode === 'emergency',
        providers: Object.entries(status.providerHealth).map(([provider, health]) => ({
          provider,
          isHealthy: health.isHealthy,
          circuitOpen: health.circuitOpen,
          consecutiveFailures: health.consecutiveFailures,
          avgLatencyMs: health.avgLatencyMs,
          lastCheck: health.lastCheck,
          lastError: health.lastError,
        })),
      },
      message: status.mode === 'normal' 
        ? 'All AI systems operational' 
        : status.mode === 'degraded' 
          ? 'AI running on backup provider' 
          : 'AI running in emergency rule-based mode',
    });
  } catch (error: unknown) {
    log.error('Error getting AI system status:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get AI system status' });
  }
});

/**
 * GET /api/ai-brain/model-router/status - Per-model cooldown + availability status
 * Shows which specific models (gemini_pro, claude_sonnet, gpt4o_mini, etc.) are available
 */
aiBrainRouter.get('/model-router/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const modelStatus = getModelRouterStatus();
    const roles: ModelRole[] = ['orchestrator', 'executor', 'judge', 'writer', 'analyzer'];
    const chains: Record<string, string[]> = {};
    for (const role of roles) {
      chains[role] = getChainForRole(role);
    }
    const allAvailable = Object.values(modelStatus).every(m => m.isAvailable);

    res.json({
      success: true,
      allModelsAvailable: allAvailable,
      models: modelStatus,
      roleChains: chains,
      summary: allAvailable
        ? 'All 6 models available — Trinity is fully resilient'
        : `Some models in cooldown — failover active`,
    });
  } catch (error: unknown) {
    res.status(500).json({ error: 'Failed to get model router status' });
  }
});

/**
 * POST /api/ai-brain/model-router/route - Route a prompt through role-based failover
 * Body: { role, systemPrompt, userPrompt, featureKey? }
 */
aiBrainRouter.post('/model-router/route', requireAuth, requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace context' });

    const { role, systemPrompt, userPrompt, featureKey } = req.body;
    const validRoles: ModelRole[] = ['orchestrator', 'executor', 'judge', 'writer', 'analyzer'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    }
    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({ error: 'systemPrompt and userPrompt are required' });
    }

    const result = await routeByRole({
      role,
      systemPrompt,
      userPrompt,
      workspaceId,
      userId: authReq.user?.id,
      featureKey,
    });

    res.json({ success: true, result });
  } catch (error: unknown) {
    res.status(503).json({ error: sanitizeError(error) });
  }
});

/**
 * POST /api/ai-brain/trinity-scan - Trigger Trinity's platform scan to build knowledge
 */
aiBrainRouter.post('/trinity-scan', requireAuth, async (req: Request, res: Response) => {
  try {
    if (trinityScanOrchestrator.isCurrentlyScanning()) {
      return res.status(409).json({ error: 'Scan already in progress' });
    }

    const result = await trinityScanOrchestrator.performInitialScan();
    
    res.json({
      success: true,
      scan: result,
      message: `I learned ${result.patternsLearned.length} patterns and generated ${result.insightsGenerated.length} insights`,
    });
  } catch (error: unknown) {
    log.error('Error performing Trinity scan:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to perform platform scan' });
  }
});

/**
 * GET /api/ai-brain/trinity-knowledge - Get Trinity's current knowledge state
 */
aiBrainRouter.get('/trinity-knowledge', requireAuth, async (req: Request, res: Response) => {
  try {
    const state = await trinityScanOrchestrator.getKnowledgeState();
    
    res.json({
      success: true,
      knowledge: state,
      message: state.knowledgePersisted 
        ? `I have ${state.totalPatternsLearned} learned patterns and ${state.readinessScore}% readiness`
        : 'No knowledge data available - run a scan first',
    });
  } catch (error: unknown) {
    log.error('Error getting Trinity knowledge:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get knowledge state' });
  }
});

/**
 * GET /api/ai-brain/trinity-persistence-test - Test if Trinity's knowledge persists
 */
aiBrainRouter.get('/trinity-persistence-test', requireAuth, async (req: Request, res: Response) => {
  try {
    const result = await trinityScanOrchestrator.testKnowledgePersistence();
    
    res.json({
      success: true,
      passed: result.passed,
      checks: result.checks,
      message: result.passed 
        ? 'Knowledge persistence verified - data survives restarts'
        : 'Knowledge persistence issues detected',
    });
  } catch (error: unknown) {
    log.error('Error testing persistence:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to test knowledge persistence' });
  }
});

/**
 * GET /api/ai-brain/skills - Get available AI Brain skills
 */
aiBrainRouter.get('/skills', requireAuth, async (req: Request, res: Response) => {
  try {
    const skills = aiBrainService.getAvailableSkills();
    res.json({ 
      skills,
      descriptions: {
        helpos_support: 'AI-powered customer support with FAQ learning',
        scheduleos_generation: 'CoAIleague Smart Scheduling — AI schedule generation',
        intelligenceos_prediction: 'Predictive analytics and forecasting',
        business_insight: 'Business insights for sales, finance, operations, automation, growth',
        platform_recommendation: 'Platform feature recommendations based on user needs',
        faq_update: 'Create or update FAQ entries',
        platform_awareness: 'Answer questions about any platform feature with contextual help',
        issue_diagnosis: 'AI diagnoses user issues based on symptoms and description'
      }
    });
  } catch (error: unknown) {
    log.error('Error getting skills:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get skills' });
  }
});

/**
 * GET /api/ai-brain/approvals - Get pending approvals
 */
aiBrainRouter.get('/approvals', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
        if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });
    const approvals = await aiBrainService.getPendingApprovals(workspaceId);
    
    res.json(approvals);
  } catch (error: unknown) {
    log.error('Error getting approvals:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get approvals' });
  }
});

/**
 * GET /api/ai-brain/patterns - Get global patterns
 */
aiBrainRouter.get('/patterns', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    // Query AI Brain jobs to identify patterns
    const recentJobs = await db
      .select()
      .from(aiBrainJobs)
      .where(eq(aiBrainJobs.workspaceId, workspaceId))
      .orderBy(desc(aiBrainJobs.createdAt))
      .limit(100);

    // Extract patterns: skill type, success rate, frequency
    const patterns = recentJobs
      .reduce((acc: any[], job: any) => {
        const existing = acc.find(p => p.skill === job.skill);
        if (existing) {
          existing.count++;
          if (job.status === 'completed') existing.successCount++;
          existing.successRate = Math.round((existing.successCount / existing.count) * 100);
        } else {
          acc.push({
            skill: job.skill,
            name: `${job.skill} automation`,
            count: 1,
            successCount: job.status === 'completed' ? 1 : 0,
            successRate: job.status === 'completed' ? 100 : 0,
            lastExecuted: job.createdAt,
          });
        }
        return acc;
      }, [])
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 10);

    res.json(patterns);
  } catch (error: unknown) {
    log.error('Error getting patterns:', error);
    res.status(500).json({ error: 'Failed to get patterns' });
  }
});

/**
 * GET /api/ai-brain/jobs/recent - Get recent jobs
 */
aiBrainRouter.get('/jobs/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const limitVal = Math.min(parseInt(req.query.limit as string) || 10, 50);

    const recentJobs = await db
      .select()
      .from(aiBrainJobs)
      .where(eq(aiBrainJobs.workspaceId, workspaceId))
      .orderBy(desc(aiBrainJobs.createdAt))
      .limit(limitVal);

    const formatted = recentJobs.map((job: any) => ({
      id: job.id,
      skill: job.skill,
      status: job.status || 'pending',
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      executionTimeMs: job.executionTimeMs,
      confidenceScore: job.confidenceScore,
      tokensUsed: job.tokensUsed,
    }));

    res.json(formatted);
  } catch (error: unknown) {
    log.error('Error getting recent jobs:', error);
    res.status(500).json({ error: 'Failed to get recent jobs' });
  }
});

/**
 * POST /api/ai-brain/jobs - Enqueue new AI job
 */
aiBrainRouter.post('/jobs', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { skill, input, priority } = req.body;
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill,
      input,
      priority
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error enqueueing job:', error);
    res.status(500).json({ error: 'Failed to enqueue job' });
  }
});

/**
 * POST /api/ai-brain/jobs/:id/approve - Approve a job
 */
aiBrainRouter.post('/jobs/:id/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    await aiBrainService.approveJob(id, authReq.user!.id);
    
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error approving job:', error);
    res.status(500).json({ error: 'Failed to approve job' });
  }
});

/**
 * POST /api/ai-brain/jobs/:id/reject - Reject a job
 */
aiBrainRouter.post('/jobs/:id/reject', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { reason } = req.body;
    
    await aiBrainService.rejectJob(id, authReq.user!.id, reason);
    
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error rejecting job:', error);
    res.status(500).json({ error: 'Failed to reject job' });
  }
});

/**
 * POST /api/ai-brain/feedback - Submit feedback
 */
aiBrainRouter.post('/feedback', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    await aiBrainService.submitFeedback({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      ...req.body
    });
    
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error submitting feedback:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

/**
 * POST /api/ai-brain/business-insight - Generate business insights
 */
aiBrainRouter.post('/business-insight', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { insightType, timeframe, focusArea } = req.body;
    
    if (!['sales', 'finance', 'operations', 'automation', 'growth'].includes(insightType)) {
      return res.status(400).json({ error: 'Invalid insight type. Must be: sales, finance, operations, automation, or growth' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'business_insight',
      input: { insightType, timeframe, focusArea },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      priority: 'medium'
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error generating business insight:', error);
    res.status(500).json({ error: 'Failed to generate business insight' });
  }
});

/**
 * POST /api/ai-brain/recommend - Get platform recommendations
 */
aiBrainRouter.post('/recommend', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { userNeed, currentPlan, currentUsage } = req.body;
    
    if (!userNeed) {
      return res.status(400).json({ error: 'userNeed is required' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'platform_recommendation',
      input: { userNeed, currentPlan, currentUsage },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      priority: 'medium'
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error getting platform recommendation:', error);
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

/**
 * POST /api/ai-brain/chat - AI Chat support (HelpAI)
 * Accepts conversationId for proper chatroom routing
 */
aiBrainRouter.post('/chat', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { message, conversationHistory, shouldLearn, conversationId, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'helpos_support',
      input: { message, conversationHistory, shouldLearn },
      priority: 'high', // Chat is high priority
      // Pass conversation context for proper room routing
      conversationId,
      sessionId,
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error in AI chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

/**
 * GET /api/ai-brain/faqs - Get FAQs (global knowledge base)
 */
aiBrainRouter.get('/faqs', requireAuth, async (req: Request, res: Response) => {
  try {
    // FAQs are global (not workspace-scoped)
    const faqs = await db
      .select()
      .from(helposFaqs)
      .where(eq(helposFaqs.isPublished, true))
      .orderBy(desc(helposFaqs.helpfulCount))
      .limit(50);
    
    res.json(faqs);
  } catch (error: unknown) {
    log.error('Error getting FAQs:', error);
    res.status(500).json({ error: 'Failed to get FAQs' });
  }
});

/**
 * POST /api/ai-brain/faqs - Create new FAQ
 */
aiBrainRouter.post('/faqs', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { question, answer, category, tags } = req.body;
    
    if (!question || !answer) {
      return res.status(400).json({ error: 'question and answer are required' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'faq_update',
      input: { question, answer, category, tags },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      priority: 'medium'
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error creating FAQ:', error);
    res.status(500).json({ error: 'Failed to create FAQ' });
  }
});

/**
 * POST /api/ai-brain/faqs/:id/helpful - Mark FAQ as helpful
 */
aiBrainRouter.post('/faqs/:id/helpful', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await db
      .update(helposFaqs)
      .set({
        helpfulCount: sql`COALESCE(${helposFaqs.helpfulCount}, 0) + 1`
      })
      .where(eq(helposFaqs.id, id));
    
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('Error marking FAQ helpful:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

/**
 * GET /api/ai-brain/checkpoints - Get all paused automation checkpoints
 */
aiBrainRouter.get('/checkpoints', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const checkpoints = await db
      .select()
      .from(aiCheckpoints)
      .where(eq(aiCheckpoints.workspaceId, workspaceId))
      .orderBy(desc(aiCheckpoints.createdAt));
    
    res.json(checkpoints);
  } catch (error: unknown) {
    log.error('Error fetching checkpoints:', error);
    res.status(500).json({ error: 'Failed to fetch checkpoints' });
  }
});

/**
 * POST /api/ai-brain/checkpoints/:id/resume - Resume automation from checkpoint
 */
aiBrainRouter.post('/checkpoints/:id/resume', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const userId = authReq.user!.id;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;

    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    // Fetch the checkpoint
    const [checkpoint] = await db
      .select()
      .from(aiCheckpoints)
      .where(
        and(
          eq(aiCheckpoints.id, id),
          eq(aiCheckpoints.workspaceId, workspaceId),
          eq(aiCheckpoints.status, 'paused')
        )
      )
      .limit(1);

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found or already resumed' });
    }

    // Check if workspace has enough credits (aiUsageEvents-backed)
    const creditsNeeded = (checkpoint as any).creditsRequired || 0;
    const currentBalance = await creditManager.getBalance(workspaceId);

    if (currentBalance < creditsNeeded) {
      return res.status(400).json({ 
        error: 'Insufficient credits',
        needed: creditsNeeded,
        available: currentBalance
      });
    }

    // Mark checkpoint as resumed
    await db
      .update(aiCheckpoints)
      .set({ 
        status: 'resumed',
        resumedAt: new Date()
      })
      .where(eq(aiCheckpoints.id, id));

    // Re-enqueue the automation job with resume parameters
    const resumeParams = (checkpoint as any).resumeParameters || {};
    const featureKey = checkpoint.featureKey || 'helpos_support';
    
    const result = await aiBrainService.enqueueJob({
      workspaceId,
      userId,
      skill: featureKey,
      input: resumeParams,
      priority: 'high',
    });

    res.json({ 
      success: true,
      checkpoint,
      job: result
    });
  } catch (error: unknown) {
    log.error('Error resuming checkpoint:', error);
    res.status(500).json({ error: 'Failed to resume automation' });
  }
});

/**
 * GET /api/ai-brain/global-patterns - Get cross-org learning patterns
 */
aiBrainRouter.get('/global-patterns', requireAuth, async (req: Request, res: Response) => {
  try {
    const patterns = await db
      .select()
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(aiGlobalPatterns)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .orderBy(desc(aiGlobalPatterns.occurrences))
      .limit(20);
    
    res.json(patterns);
  } catch (error: unknown) {
    log.error('Error getting global patterns:', error);
    res.status(500).json({ error: 'Failed to get global patterns' });
  }
});

// ============================================================================
// FAQ GOVERNANCE ENDPOINTS
// ============================================================================

/**
 * GET /api/ai-brain/gaps - Get top FAQ gap events (unanswered questions)
 */
aiBrainRouter.get('/gaps', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500);
    const gaps = await aiBrainService.getTopGaps(limit);
    
    res.json({
      gaps,
      total: gaps.length,
      message: 'These are questions that users asked but we couldn\'t answer well'
    });
  } catch (error: unknown) {
    log.error('Error getting FAQ gaps:', error);
    res.status(500).json({ error: 'Failed to get FAQ gaps' });
  }
});

/**
 * POST /api/ai-brain/gaps/:id/resolve - Resolve a gap by creating/updating FAQ
 */
aiBrainRouter.post('/gaps/:id/resolve', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const { id } = req.params;
    const { answer, category } = req.body;
    
    if (!answer) {
      return res.status(400).json({ error: 'Answer is required' });
    }
    
    // Get the gap event
    const [gap] = await db
      .select()
      .from(faqGapEvents)
      .where(eq(faqGapEvents.id, id))
      .limit(1);
    
    if (!gap) {
      return res.status(404).json({ error: 'Gap event not found' });
    }
    
    // Create FAQ from gap
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [newFaq] = await db.insert(helposFaqs).values({
      question: gap.question,
      answer: answer.substring(0, 2000),
      category: category || gap.suggestedCategory || 'general',
      sourceType: 'gap_detection',
      sourceId: id,
      sourceContext: { 
        gapEventId: id, 
        occurrenceCount: gap.occurrenceCount,
        resolvedBy: userId 
      },
      status: 'published',
      isPublished: true,
      confidenceScore: 100,
      version: 1
    }).returning();
    
    // Mark gap as resolved
    await db.update(faqGapEvents)
      .set({
        status: 'faq_created',
        resolvedFaqId: newFaq.id,
        resolvedAt: new Date(),
        resolvedBy: userId || null,
        resolutionNotes: `FAQ ${newFaq.id} created`,
        updatedAt: new Date()
      })
      .where(eq(faqGapEvents.id, id));
    
    res.json({ 
      success: true, 
      faq: newFaq, 
      message: `FAQ created from gap that occurred ${gap.occurrenceCount} times`
    });
  } catch (error: unknown) {
    log.error('Error resolving gap:', error);
    res.status(500).json({ error: 'Failed to resolve gap' });
  }
});

/**
 * GET /api/ai-brain/faqs/stale - Get stale FAQs that need review
 */
aiBrainRouter.get('/faqs/stale', requireAuth, async (req: Request, res: Response) => {
  try {
    const staleFaqs = await aiBrainService.detectStaleFaqs();
    
    res.json({
      faqs: staleFaqs,
      total: staleFaqs.length,
      message: 'These FAQs may be outdated and need review'
    });
  } catch (error: unknown) {
    log.error('Error getting stale FAQs:', error);
    res.status(500).json({ error: 'Failed to get stale FAQs' });
  }
});

/**
 * POST /api/ai-brain/faqs/:id/verify - Mark an FAQ as verified/reviewed
 */
aiBrainRouter.post('/faqs/:id/verify', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const { id } = req.params;
    const { notes, status } = req.body;
    
    await db.update(helposFaqs)
      .set({
        lastVerifiedAt: new Date(),
        lastVerifiedBy: userId || null,
        verificationNotes: notes || null,
        status: status || 'published',
        updatedAt: new Date()
      })
      .where(eq(helposFaqs.id, id));
    
    res.json({ 
      success: true, 
      message: 'FAQ verified successfully' 
    });
  } catch (error: unknown) {
    log.error('Error verifying FAQ:', error);
    res.status(500).json({ error: 'Failed to verify FAQ' });
  }
});

/**
 * GET /api/ai-brain/faqs/:id/versions - Get version history for an FAQ
 */
aiBrainRouter.get('/faqs/:id/versions', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const versions = await db
      .select()
      .from(faqVersions)
      .where(eq(faqVersions.faqId, id))
      .orderBy(desc(faqVersions.version));
    
    res.json({ versions });
  } catch (error: unknown) {
    log.error('Error getting FAQ versions:', error);
    res.status(500).json({ error: 'Failed to get FAQ versions' });
  }
});

/**
 * POST /api/ai-brain/faqs/:id/update - Update an FAQ with version control
 */
aiBrainRouter.post('/faqs/:id/update', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    const { id } = req.params;
    const { answer, question, category, changeReason } = req.body;
    
    // Get current FAQ
    const [currentFaq] = await db
      .select()
      .from(helposFaqs)
      .where(eq(helposFaqs.id, id))
      .limit(1);
    
    if (!currentFaq) {
      return res.status(404).json({ error: 'FAQ not found' });
    }
    
    // Save version history
    await db.insert(faqVersions).values({
      faqId: id,
      version: currentFaq.version || 1,
      question: currentFaq.question,
      answer: currentFaq.answer,
      category: currentFaq.category,
      tags: currentFaq.tags || [],
      changedBy: userId || null,
      changedByAi: false,
      changeType: 'updated',
      changeReason: changeReason || 'Manual update',
      sourceType: currentFaq.sourceType as any,
      sourceId: currentFaq.sourceId
    });
    
    // Update FAQ
    const [updatedFaq] = await db.update(helposFaqs)
      .set({
        question: question || currentFaq.question,
        answer: answer || currentFaq.answer,
        category: category || currentFaq.category,
        version: sql`COALESCE(${helposFaqs.version}, 1) + 1`,
        changeReason: changeReason || null,
        updatedAt: new Date(),
        updatedBy: userId || null,
        status: 'published',
        lastVerifiedAt: new Date(),
        lastVerifiedBy: userId || null
      })
      .where(eq(helposFaqs.id, id))
      .returning();
    
    res.json({ 
      success: true, 
      faq: updatedFaq,
      message: `FAQ updated to version ${updatedFaq.version}`
    });
  } catch (error: unknown) {
    log.error('Error updating FAQ:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

/**
 * POST /api/ai-brain/tickets/:id/learn - Learn from a resolved ticket
 */
aiBrainRouter.post('/tickets/:id/learn', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    await aiBrainService.learnFromTicket(id);
    
    res.json({ 
      success: true, 
      message: 'Successfully learned from ticket resolution' 
    });
  } catch (error: unknown) {
    log.error('Error learning from ticket:', error);
    res.status(500).json({ error: 'Failed to learn from ticket' });
  }
});

/**
 * POST /api/ai-brain/gaps/record - Record a gap event (for low-confidence AI responses)
 */
aiBrainRouter.post('/gaps/record', requireAuth, async (req: Request, res: Response) => {
  try {
    const { question, sourceType, sourceId, suggestedAnswer, confidence, context } = req.body;
    
    if (!question || !sourceType) {
      return res.status(400).json({ error: 'question and sourceType are required' });
    }
    
    const gapId = await aiBrainService.recordGapEvent(question, {
      sourceType,
      sourceId,
      suggestedAnswer,
      confidence,
      context
    });
    
    res.json({ 
      success: true, 
      gapId,
      message: 'Gap event recorded for future FAQ creation' 
    });
  } catch (error: unknown) {
    log.error('Error recording gap:', error);
    res.status(500).json({ error: 'Failed to record gap event' });
  }
});

/**
 * GET /api/ai-brain/learning/stats - Get FAQ learning statistics
 */
aiBrainRouter.get('/learning/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    // Get FAQ stats
    const faqStats = await db.select({
      total: sql<number>`COUNT(*)`,
      published: sql<number>`COUNT(*) FILTER (WHERE ${helposFaqs.isPublished} = true)`,
      aiLearned: sql<number>`COUNT(*) FILTER (WHERE ${helposFaqs.sourceType} = 'ai_learned')`,
      ticketResolution: sql<number>`COUNT(*) FILTER (WHERE ${helposFaqs.sourceType} = 'ticket_resolution')`,
      needsReview: sql<number>`COUNT(*) FILTER (WHERE ${helposFaqs.status} = 'needs_review')`,
      avgConfidence: sql<number>`AVG(${helposFaqs.confidenceScore})`,
      totalMatches: sql<number>`SUM(${helposFaqs.matchCount})`,
      totalResolutions: sql<number>`SUM(${helposFaqs.resolvedCount})`
    }).from(helposFaqs);
    
    // Get gap stats
    const gapStats = await db.select({
      openGaps: sql<number>`COUNT(*) FILTER (WHERE ${faqGapEvents.status} = 'open')`,
      resolvedGaps: sql<number>`COUNT(*) FILTER (WHERE ${faqGapEvents.status} != 'open')`,
      totalOccurrences: sql<number>`SUM(${faqGapEvents.occurrenceCount})`
    }).from(faqGapEvents);
    
    res.json({
      faqs: faqStats[0] || {},
      gaps: gapStats[0] || {},
      health: {
        coverageScore: faqStats[0]?.totalMatches > 0 
          ? Math.min(100, (faqStats[0].totalResolutions / faqStats[0].totalMatches) * 100) 
          : 0,
        learningActive: true
      }
    });
  } catch (error: unknown) {
    log.error('Error getting learning stats:', error);
    res.status(500).json({ error: 'Failed to get learning stats' });
  }
});

// ============================================================================
// SUPPORT AGENT TOOLS - Platform Awareness Endpoints
// ============================================================================

/**
 * GET /api/ai-brain/platform-info - Get platform feature documentation for support agents
 */
aiBrainRouter.get('/platform-info', requireAuth, async (req: Request, res: Response) => {
  try {
    const { category, search } = req.query;
    const platformInfo = aiBrainService.getPlatformInfo();
    
    let features = platformInfo.features;
    
    if (category && typeof category === 'string') {
      features = features.filter(f => f.category === category);
    }
    
    if (search && typeof search === 'string') {
      features = aiBrainService.searchPlatformFeatures(search);
    }
    
    res.json({
      features,
      categories: platformInfo.categories,
      totalFeatures: platformInfo.features.length,
      filteredCount: features.length
    });
  } catch (error: unknown) {
    log.error('Error getting platform info:', error);
    res.status(500).json({ error: 'Failed to get platform info' });
  }
});

/**
 * POST /api/ai-brain/diagnose - AI diagnoses user issue based on description
 */
aiBrainRouter.post('/diagnose', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { description, symptoms, affectedFeature, context } = req.body;
    
    if (!description) {
      return res.status(400).json({ error: 'description is required' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'issue_diagnosis',
      input: {
        description,
        symptoms: symptoms || [],
        affectedFeature,
        context
      },
      priority: 'high'
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error diagnosing issue:', error);
    res.status(500).json({ error: 'Failed to diagnose issue' });
  }
});

/**
 * GET /api/ai-brain/feature-status - Check if features are enabled for workspace
 */
aiBrainRouter.get('/feature-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const featureStatus = await aiBrainService.getFeatureStatus(workspaceId);
    
    const enabledFeatures = featureStatus.filter(f => f.enabled);
    const disabledFeatures = featureStatus.filter(f => !f.enabled);
    
    res.json({
      workspaceId,
      features: featureStatus.map(({ feature, enabled }) => ({
        id: feature.id,
        name: feature.name,
        category: feature.category,
        enabled,
        requiredTier: feature.requiredTier
      })),
      summary: {
        total: featureStatus.length,
        enabled: enabledFeatures.length,
        disabled: disabledFeatures.length
      }
    });
  } catch (error: unknown) {
    log.error('Error getting feature status:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get feature status' });
  }
});

/**
 * POST /api/ai-brain/platform-awareness - Ask AI about platform features
 */
aiBrainRouter.post('/platform-awareness', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { query, queryType, context } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'query is required' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'platform_awareness',
      input: {
        query,
        queryType: queryType || 'help',
        context: {
          ...context,
          userRole: authReq.user?.role
        }
      },
      priority: 'high'
    });
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Error in platform awareness:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to process platform awareness query' });
  }
});

/**
 * POST /api/ai-brain/feature-event - Record feature usage for learning
 */
aiBrainRouter.post('/feature-event', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { featureId, eventType, metadata } = req.body;
    
    if (!featureId || !eventType) {
      return res.status(400).json({ error: 'featureId and eventType are required' });
    }
    
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    await aiBrainService.recordFeatureEvent({
      workspaceId,
      userId: authReq.user?.id,
      featureId,
      eventType,
      metadata
    });
    
    res.json({ 
      success: true,
      message: 'Feature event recorded' 
    });
  } catch (error: unknown) {
    log.error('Error recording feature event:', error);
    res.status(500).json({ error: 'Failed to record feature event' });
  }
});

/**
 * GET /api/ai-brain/feature/:featureId - Get detailed info about a specific feature
 */
aiBrainRouter.get('/feature/:featureId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { featureId } = req.params;
    const platformInfo = aiBrainService.getPlatformInfo();
    
    const feature = platformInfo.features.find(f => f.id === featureId);
    
    if (!feature) {
      return res.status(404).json({ error: 'Feature not found' });
    }
    
    res.json({
      feature,
      relatedFeatures: platformInfo.features
        .filter(f => f.id !== featureId && f.category === feature.category)
        .slice(0, 3)
        .map(f => ({ id: f.id, name: f.name, description: f.description }))
    });
  } catch (error: unknown) {
    log.error('Error getting feature details:', error);
    res.status(500).json({ error: 'Failed to get feature details' });
  }
});

// ============================================================================
// SUBAGENT CONFIDENCE MONITORING ROUTES
// ============================================================================

/**
 * GET /api/ai-brain/confidence/subagent/:subagentId - Get confidence score for a specific subagent
 */
aiBrainRouter.get('/confidence/subagent/:subagentId', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { subagentId } = req.params;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const confidence = await subagentConfidenceMonitor.getSubagentConfidence(subagentId, workspaceId);
    
    if (!confidence) {
      return res.status(404).json({ error: 'Subagent not found' });
    }
    
    res.json(confidence);
  } catch (error: unknown) {
    log.error('Error getting subagent confidence:', error);
    res.status(500).json({ error: 'Failed to get subagent confidence' });
  }
});

/**
 * GET /api/ai-brain/confidence/org - Get org-level automation readiness
 */
aiBrainRouter.get('/confidence/org', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const readiness = await subagentConfidenceMonitor.getOrgAutomationReadiness(workspaceId);
    
    if (!readiness) {
      return res.status(500).json({ error: 'Failed to calculate org readiness' });
    }
    
    res.json(readiness);
  } catch (error: unknown) {
    log.error('Error getting org automation readiness:', error);
    res.status(500).json({ error: 'Failed to get org readiness' });
  }
});

/**
 * GET /api/ai-brain/confidence/graduation - Check graduation eligibility
 */
aiBrainRouter.get('/confidence/graduation', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const eligibility = await subagentConfidenceMonitor.checkOrgGraduationEligibility(workspaceId);
    res.json(eligibility);
  } catch (error: unknown) {
    log.error('Error checking graduation eligibility:', error);
    res.status(500).json({ error: 'Failed to check graduation eligibility' });
  }
});

/**
 * POST /api/ai-brain/confidence/graduate - Graduate org to higher automation level
 */
aiBrainRouter.post('/confidence/graduate', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace and user required' });
    }
    
    const result = await subagentConfidenceMonitor.graduateOrg(workspaceId, userId);
    res.json(result);
  } catch (error: unknown) {
    log.error('Error graduating org:', error);
    res.status(500).json({ error: 'Failed to graduate org' });
  }
});

/**
 * GET /api/ai-brain/confidence/suggestions - Get AI optimization suggestions
 */
aiBrainRouter.get('/confidence/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const suggestions = await subagentConfidenceMonitor.getOrgOptimizationSuggestions(workspaceId);
    res.json({ suggestions });
  } catch (error: unknown) {
    log.error('Error getting optimization suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * GET /api/ai-brain/confidence/trinity-summary - Get Trinity monitoring summary
 */
aiBrainRouter.get('/confidence/trinity-summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const summary = await subagentConfidenceMonitor.getTrinityMonitoringSummary(workspaceId);
    res.json(summary);
  } catch (error: unknown) {
    log.error('Error getting Trinity monitoring summary:', error);
    res.status(500).json({ error: 'Failed to get Trinity summary' });
  }
});

// ============================================================================
// COST-OPTIMIZED AI ROUTING ENDPOINTS
// ============================================================================

/**
 * GET /api/ai-brain/routing/analytics - Get AI routing analytics
 * Shows how requests are distributed across GPT, Gemini, and Claude
 */
aiBrainRouter.get('/routing/analytics', requireAuth, async (req: Request, res: Response) => {
  try {
    const analytics = getCostRoutingAnalytics();
    res.json({
      success: true,
      analytics,
      costTiers: {
        gpt: { 
          model: 'gpt-4o-mini', 
          creditsPerRequest: 1, 
          description: 'Grunt work - formatting, classification, extraction',
          version: 'Latest GPT-4o-mini'
        },
        gemini_flash: { 
          model: 'gemini-2.5-flash', 
          creditsPerRequest: 5, 
          description: 'Standard business operations',
          version: 'Gemini 2.5 Flash'
        },
        gemini_3: { 
          model: 'gemini-exp-1206', 
          creditsPerRequest: 20, 
          description: 'Complex reasoning, scheduling, vision/PDFs',
          version: 'Gemini 3 Experimental'
        },
        claude: { 
          model: 'claude-sonnet-4-6', 
          creditsPerRequest: 25, 
          description: 'Deep thinking - analysis, client emails, RFPs, compliance',
          version: 'Claude Sonnet 4.6'
        },
      },
    });
  } catch (error: unknown) {
    log.error('Error getting routing analytics:', error);
    res.status(500).json({ error: 'Failed to get routing analytics' });
  }
});

/**
 * POST /api/ai-brain/routing/classify - Classify a task to see optimal routing
 */
aiBrainRouter.post('/routing/classify', requireAuth, async (req: Request, res: Response) => {
  try {
    const { task, context } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }
    
    const classification = classifyTask(task, context);
    const routing = costOptimizedRouter.classifyTask(task, context);
    
    res.json({
      success: true,
      task: task.substring(0, 100),
      classification,
      suggestedProvider: classification.complexity === 'simple' ? 'gpt' : 
                         classification.complexity === 'standard' ? 'gemini_flash' :
                         classification.isClientFacing ? 'claude' : 'gemini_pro',
      estimatedCredits: classification.complexity === 'simple' ? 1 :
                        classification.complexity === 'standard' ? 5 :
                        classification.complexity === 'complex' ? 15 : 25,
    });
  } catch (error: unknown) {
    log.error('Error classifying task:', error);
    res.status(500).json({ error: 'Failed to classify task' });
  }
});

/**
 * POST /api/ai-brain/routing/execute - Execute a task with cost-optimized routing
 */
aiBrainRouter.post('/routing/execute', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId || (authReq as any).user?.workspaceId || authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const { task, context, forceProvider, verify } = req.body;
    
    if (!task) {
      return res.status(400).json({ error: 'Task is required' });
    }
    
    // Use verification mode for high-stakes tasks
    if (verify) {
      const result = await costOptimizedRouter.executeWithVerification({
        task,
        context,
        workspaceId,
        userId,
        featureKey: 'cost_optimized_routing',
      });
      
      return res.json({
        success: true,
        result: {
          content: result.content,
          provider: result.provider,
          model: result.model,
          confidence: result.confidence,
          agreementScore: result.agreementScore,
          escalated: result.escalated,
          escalationReason: result.escalationReason,
          tokensUsed: result.tokensUsed,
          creditsCharged: result.creditsCharged,
          latencyMs: result.latencyMs,
        },
      });
    }
    
    // Normal cost-optimized routing
    const result = await costOptimizedRouter.execute({
      task,
      context,
      workspaceId,
      userId,
      featureKey: 'cost_optimized_routing',
      forceProvider,
    });
    
    res.json({
      success: true,
      result: {
        content: result.content,
        provider: result.provider,
        model: result.model,
        confidence: result.confidence,
        escalated: result.escalated,
        escalationReason: result.escalationReason,
        tokensUsed: result.tokensUsed,
        creditsCharged: result.creditsCharged,
        latencyMs: result.latencyMs,
      },
    });
  } catch (error: unknown) {
    log.error('Error executing with cost-optimized routing:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to execute task' });
  }
});

// ============================================================================
// AI PROVIDER BALANCE TRACKING (Support Dashboard)
// ============================================================================

/**
 * GET /api/ai-brain/providers/balances - Get all AI provider balances
 * For Support Dashboard to monitor and top-off API credits
 */
aiBrainRouter.get('/providers/balances', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const forceRefresh = req.query.refresh === 'true';
    
    const balances = await aiProviderBalanceService.getBalances(forceRefresh);
    
    res.json({
      success: true,
      summary: {
        totalProviders: balances.providers.length,
        activeProviders: balances.totalActive,
        providersWithWarnings: balances.totalWithWarnings,
        lastUpdated: balances.lastUpdated,
      },
      providers: balances.providers.map(p => ({
        provider: p.provider,
        displayName: p.displayName,
        models: p.models,
        status: p.status,
        balance: p.balance,
        dashboardUrl: p.dashboardUrl,
        error: p.error,
        lastChecked: p.lastChecked,
      })),
      modelTiers: {
        gpt: {
          provider: 'OpenAI',
          models: ['gpt-4o-mini (1 credit)', 'gpt-4o (3 credits)', 'o4-mini (8 credits)'],
          role: 'Grunt work - simple tasks, formatting, classification',
          costRange: '1-8 credits per request',
        },
        gemini: {
          provider: 'Google',
          models: ['gemini-2.5-flash (5 credits)', 'gemini-exp-1206 / Gemini 3 (20 credits)'],
          role: 'Standard ops & complex reasoning, scheduling, vision/PDFs',
          costRange: '5-20 credits per request',
        },
        claude: {
          provider: 'Anthropic',
          models: ['claude-sonnet-4-20250514 / Claude 4.5 (25 credits)'],
          role: 'Deep thinking - analysis, client emails, RFPs, compliance',
          costRange: '25 credits per request',
        },
      },
      billingNote: 'All token usage is tracked and billed to org subscribers via workspace credits. Platform passes through API costs + margin.',
    });
  } catch (error: unknown) {
    log.error('Error getting provider balances:', error);
    res.status(500).json({ error: 'Failed to get provider balances' });
  }
});

/**
 * GET /api/ai-brain/providers/usage - Redirect to unified billing usage
 * Token usage is tracked via UNIFIED usageMeteringService - single source of truth
 */
aiBrainRouter.get('/providers/usage', requireAuth, async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'AI usage is tracked via unified billing system',
    endpoints: {
      detailedUsage: '/api/billing/usage',
      workspaceCredits: '/api/billing/credits',
      usageSummary: '/api/billing/usage/summary',
    },
    architecture: {
      singleSourceOfTruth: 'usageMeteringService → aiUsageEvents table',
      billingFlow: 'All AI calls → metered clients → usageMeteringService → workspace credit deduction',
      providers: ['OpenAI (GPT)', 'Google (Gemini)', 'Anthropic (Claude)'],
    },
    note: 'All token usage billed to org subscribers via workspace credits - no platform cost leakage',
  });
});
