/**
 * AI BRAIN API ROUTES - Enhanced with Business Insights & Self-Selling
 * Universal API for the unified AI Brain system
 */

import express, { Router, Request, Response } from 'express';
import { isAuthenticated } from './replitAuth';
import { db } from './db';
import { aiBrainService } from './services/ai-brain/aiBrainService';
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
 */
aiBrainRouter.get('/health', isAuthenticated, async (req: Request, res: Response) => {
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
 * GET /api/ai-brain/skills - Get available AI Brain skills
 */
aiBrainRouter.get('/skills', isAuthenticated, async (req: Request, res: Response) => {
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
        faq_update: 'Create or update FAQ entries'
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
aiBrainRouter.get('/approvals', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.get('/patterns', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.get('/jobs/recent', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/jobs', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/jobs/:id/approve', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/jobs/:id/reject', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/feedback', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/business-insight', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/recommend', isAuthenticated, async (req: Request, res: Response) => {
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
 * POST /api/ai-brain/chat - AI Chat support (HelpOS)
 */
aiBrainRouter.post('/chat', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { message, conversationHistory, shouldLearn } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }
    
    const result = await aiBrainService.enqueueJob({
      workspaceId: authReq.user?.currentWorkspaceId,
      userId: authReq.user?.id,
      skill: 'helpos_support',
      input: { message, conversationHistory, shouldLearn },
      priority: 'high' // Chat is high priority
    });
    
    res.json(result);
  } catch (error: any) {
    console.error('Error in AI chat:', error);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

/**
 * GET /api/ai-brain/faqs - Get FAQs for workspace
 */
aiBrainRouter.get('/faqs', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.user?.currentWorkspaceId;
    
    const conditions = [eq(helposFaqs.isActive, true)];
    if (workspaceId) {
      conditions.push(eq(helposFaqs.workspaceId, workspaceId));
    }
    
    const faqs = await db
      .select()
      .from(helposFaqs)
      .where(and(...conditions))
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
aiBrainRouter.post('/faqs', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/faqs/:id/helpful', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.get('/checkpoints', isAuthenticated, async (req: Request, res: Response) => {
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
aiBrainRouter.post('/checkpoints/:id/resume', isAuthenticated, async (req: Request, res: Response) => {
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
    const currentBalance = credits?.currentCredits || 0;

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
aiBrainRouter.get('/global-patterns', isAuthenticated, async (req: Request, res: Response) => {
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
