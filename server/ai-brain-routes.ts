/**
 * AI BRAIN API ROUTES - Enhanced with Business Insights & Self-Selling
 * Universal API for the unified AI Brain system
 */

import express, { Router, Request, Response } from 'express';
import { requireAuth } from './auth';
import { db } from './db';
import { aiBrainService } from './services/ai-brain/aiBrainService';
import { subagentConfidenceMonitor } from './services/ai-brain/subagentConfidenceMonitor';
import { getAISystemStatus } from './services/ai-brain/providers/resilientAIGateway';
import { trinityScanOrchestrator } from './services/ai-brain/trinityScanOrchestrator';
import { 
  aiBrainJobs, 
  aiGlobalPatterns, 
  aiCheckpoints, 
  workspaceCredits,
  helposFaqs 
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

// Type for authenticated request
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
    const workspaceId = authReq.user?.currentWorkspaceId;
    const metrics = await aiBrainService.getHealthMetrics(workspaceId);
    
    res.json(metrics);
  } catch (error: any) {
    console.error('Error getting AI Brain health:', error);
    res.status(500).json({ error: 'Failed to get health metrics' });
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
  } catch (error: any) {
    console.error('Error getting AI system status:', error);
    res.status(500).json({ error: 'Failed to get AI system status' });
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
      message: `Trinity learned ${result.patternsLearned.length} patterns and generated ${result.insightsGenerated.length} insights`,
    });
  } catch (error: any) {
    console.error('Error performing Trinity scan:', error);
    res.status(500).json({ error: 'Failed to perform platform scan' });
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
        ? `Trinity has ${state.totalPatternsLearned} learned patterns and ${state.readinessScore}% readiness`
        : 'No knowledge data available - run a scan first',
    });
  } catch (error: any) {
    console.error('Error getting Trinity knowledge:', error);
    res.status(500).json({ error: 'Failed to get knowledge state' });
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
  } catch (error: any) {
    console.error('Error testing persistence:', error);
    res.status(500).json({ error: 'Failed to test knowledge persistence' });
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
        scheduleos_generation: 'AI-powered schedule generation and optimization',
        intelligenceos_prediction: 'Predictive analytics and forecasting',
        business_insight: 'Business insights for sales, finance, operations, automation, growth',
        platform_recommendation: 'Platform feature recommendations based on user needs',
        faq_update: 'Create or update FAQ entries',
        platform_awareness: 'Answer questions about any platform feature with contextual help',
        issue_diagnosis: 'AI diagnoses user issues based on symptoms and description'
      }
    });
  } catch (error: any) {
    console.error('Error getting skills:', error);
    res.status(500).json({ error: 'Failed to get skills' });
  }
});

/**
 * GET /api/ai-brain/approvals - Get pending approvals
 */
aiBrainRouter.get('/approvals', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    const approvals = await aiBrainService.getPendingApprovals(workspaceId);
    
    res.json(approvals);
  } catch (error: any) {
    console.error('Error getting approvals:', error);
    res.status(500).json({ error: 'Failed to get approvals' });
  }
});

/**
 * GET /api/ai-brain/patterns - Get global patterns
 */
aiBrainRouter.get('/patterns', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Error getting patterns:', error);
    res.status(500).json({ error: 'Failed to get patterns' });
  }
});

/**
 * GET /api/ai-brain/jobs/recent - Get recent jobs
 */
aiBrainRouter.get('/jobs/recent', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Error getting recent jobs:', error);
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
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill,
      input,
      priority
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error enqueueing job:', error);
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
  } catch (error: any) {
    console.error('Error approving job:', error);
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
  } catch (error: any) {
    console.error('Error rejecting job:', error);
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
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      ...req.body
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error submitting feedback:', error);
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
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'business_insight',
      input: { insightType, timeframe, focusArea },
      priority: 'normal'
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error generating business insight:', error);
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
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'platform_recommendation',
      input: { userNeed, currentPlan, currentUsage },
      priority: 'normal'
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error getting platform recommendation:', error);
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
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'helpos_support',
      input: { message, conversationHistory, shouldLearn },
      priority: 'high', // Chat is high priority
      // Pass conversation context for proper room routing
      conversationId,
      sessionId,
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error in AI chat:', error);
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
  } catch (error: any) {
    console.error('Error getting FAQs:', error);
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
      priority: 'normal'
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error creating FAQ:', error);
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
  } catch (error: any) {
    console.error('Error marking FAQ helpful:', error);
    res.status(500).json({ error: 'Failed to update FAQ' });
  }
});

/**
 * GET /api/ai-brain/checkpoints - Get all paused automation checkpoints
 */
aiBrainRouter.get('/checkpoints', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const checkpoints = await db
      .select()
      .from(aiCheckpoints)
      .where(eq(aiCheckpoints.workspaceId, workspaceId))
      .orderBy(desc(aiCheckpoints.createdAt));
    
    res.json(checkpoints);
  } catch (error: any) {
    console.error('Error fetching checkpoints:', error);
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
    const workspaceId = authReq.user?.currentWorkspaceId;

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

    // Check if workspace has enough credits
    const [credits] = await db
      .select()
      .from(workspaceCredits)
      .where(eq(workspaceCredits.workspaceId, workspaceId))
      .limit(1);

    const creditsNeeded = (checkpoint as any).creditsRequired || 0;
    const currentBalance = credits?.currentBalance || 0;

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
  } catch (error: any) {
    console.error('Error resuming checkpoint:', error);
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
      .from(aiGlobalPatterns)
      .orderBy(desc(aiGlobalPatterns.occurrences))
      .limit(20);
    
    res.json(patterns);
  } catch (error: any) {
    console.error('Error getting global patterns:', error);
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
    const limit = parseInt(req.query.limit as string) || 20;
    const gaps = await aiBrainService.getTopGaps(limit);
    
    res.json({
      gaps,
      total: gaps.length,
      message: 'These are questions that users asked but we couldn\'t answer well'
    });
  } catch (error: any) {
    console.error('Error getting FAQ gaps:', error);
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
      .from(require('@shared/schema').faqGapEvents)
      .where(eq(require('@shared/schema').faqGapEvents.id, id))
      .limit(1);
    
    if (!gap) {
      return res.status(404).json({ error: 'Gap event not found' });
    }
    
    // Create FAQ from gap
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
    await db.update(require('@shared/schema').faqGapEvents)
      .set({
        status: 'faq_created',
        resolvedFaqId: newFaq.id,
        resolvedAt: new Date(),
        resolvedBy: userId || null,
        resolutionNotes: `FAQ ${newFaq.id} created`,
        updatedAt: new Date()
      })
      .where(eq(require('@shared/schema').faqGapEvents.id, id));
    
    res.json({ 
      success: true, 
      faq: newFaq, 
      message: `FAQ created from gap that occurred ${gap.occurrenceCount} times`
    });
  } catch (error: any) {
    console.error('Error resolving gap:', error);
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
  } catch (error: any) {
    console.error('Error getting stale FAQs:', error);
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
  } catch (error: any) {
    console.error('Error verifying FAQ:', error);
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
      .from(require('@shared/schema').faqVersions)
      .where(eq(require('@shared/schema').faqVersions.faqId, id))
      .orderBy(desc(require('@shared/schema').faqVersions.version));
    
    res.json({ versions });
  } catch (error: any) {
    console.error('Error getting FAQ versions:', error);
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
    await db.insert(require('@shared/schema').faqVersions).values({
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
  } catch (error: any) {
    console.error('Error updating FAQ:', error);
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
  } catch (error: any) {
    console.error('Error learning from ticket:', error);
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
  } catch (error: any) {
    console.error('Error recording gap:', error);
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
      openGaps: sql<number>`COUNT(*) FILTER (WHERE ${require('@shared/schema').faqGapEvents.status} = 'open')`,
      resolvedGaps: sql<number>`COUNT(*) FILTER (WHERE ${require('@shared/schema').faqGapEvents.status} != 'open')`,
      totalOccurrences: sql<number>`SUM(${require('@shared/schema').faqGapEvents.occurrenceCount})`
    }).from(require('@shared/schema').faqGapEvents);
    
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
  } catch (error: any) {
    console.error('Error getting learning stats:', error);
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
  } catch (error: any) {
    console.error('Error getting platform info:', error);
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
      workspaceId: authReq.user?.currentWorkspaceId,
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
  } catch (error: any) {
    console.error('Error diagnosing issue:', error);
    res.status(500).json({ error: 'Failed to diagnose issue' });
  }
});

/**
 * GET /api/ai-brain/feature-status - Check if features are enabled for workspace
 */
aiBrainRouter.get('/feature-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
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
  } catch (error: any) {
    console.error('Error getting feature status:', error);
    res.status(500).json({ error: 'Failed to get feature status' });
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
      workspaceId: authReq.user?.currentWorkspaceId,
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
  } catch (error: any) {
    console.error('Error in platform awareness:', error);
    res.status(500).json({ error: 'Failed to process platform awareness query' });
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
    
    const workspaceId = authReq.user?.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Error recording feature event:', error);
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
  } catch (error: any) {
    console.error('Error getting feature details:', error);
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
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const confidence = await subagentConfidenceMonitor.getSubagentConfidence(subagentId, workspaceId);
    
    if (!confidence) {
      return res.status(404).json({ error: 'Subagent not found' });
    }
    
    res.json(confidence);
  } catch (error: any) {
    console.error('Error getting subagent confidence:', error);
    res.status(500).json({ error: 'Failed to get subagent confidence' });
  }
});

/**
 * GET /api/ai-brain/confidence/org - Get org-level automation readiness
 */
aiBrainRouter.get('/confidence/org', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const readiness = await subagentConfidenceMonitor.getOrgAutomationReadiness(workspaceId);
    
    if (!readiness) {
      return res.status(500).json({ error: 'Failed to calculate org readiness' });
    }
    
    res.json(readiness);
  } catch (error: any) {
    console.error('Error getting org automation readiness:', error);
    res.status(500).json({ error: 'Failed to get org readiness' });
  }
});

/**
 * GET /api/ai-brain/confidence/graduation - Check graduation eligibility
 */
aiBrainRouter.get('/confidence/graduation', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const eligibility = await subagentConfidenceMonitor.checkOrgGraduationEligibility(workspaceId);
    res.json(eligibility);
  } catch (error: any) {
    console.error('Error checking graduation eligibility:', error);
    res.status(500).json({ error: 'Failed to check graduation eligibility' });
  }
});

/**
 * POST /api/ai-brain/confidence/graduate - Graduate org to higher automation level
 */
aiBrainRouter.post('/confidence/graduate', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    const userId = authReq.user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace and user required' });
    }
    
    const result = await subagentConfidenceMonitor.graduateOrg(workspaceId, userId);
    res.json(result);
  } catch (error: any) {
    console.error('Error graduating org:', error);
    res.status(500).json({ error: 'Failed to graduate org' });
  }
});

/**
 * GET /api/ai-brain/confidence/suggestions - Get AI optimization suggestions
 */
aiBrainRouter.get('/confidence/suggestions', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const suggestions = await subagentConfidenceMonitor.getOrgOptimizationSuggestions(workspaceId);
    res.json({ suggestions });
  } catch (error: any) {
    console.error('Error getting optimization suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * GET /api/ai-brain/confidence/trinity-summary - Get Trinity monitoring summary
 */
aiBrainRouter.get('/confidence/trinity-summary', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace required' });
    }
    
    const summary = await subagentConfidenceMonitor.getTrinityMonitoringSummary(workspaceId);
    res.json(summary);
  } catch (error: any) {
    console.error('Error getting Trinity monitoring summary:', error);
    res.status(500).json({ error: 'Failed to get Trinity summary' });
  }
});
