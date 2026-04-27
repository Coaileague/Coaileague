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
import { tokenManager } from '../services/billing/tokenManager';
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
// ============================================================================
// FAQ GOVERNANCE ENDPOINTS
// ============================================================================

/**
 * GET /api/ai-brain/gaps - Get top FAQ gap events (unanswered questions)
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
      
      // TRINITY.md §S: tenant-facing response must not expose which
      // internal backend (provider/model) served the request. Trinity
      // speaks as one agent. Backend identifiers stay in server logs.
      log.info('[ai-brain] Trinity cost-optimized + verified', {
        provider: result.provider,
        model: result.model,
        agreementScore: result.agreementScore,
      });
      return res.json({
        success: true,
        result: {
          content: result.content,
          confidence: result.confidence,
          agreementScore: result.agreementScore,
          escalated: result.escalated,
          escalationReason: result.escalationReason,
          tokensUsed: result.tokensUsed,
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
    
    // TRINITY.md §S: tenant-facing response must not expose which
    // internal backend (provider/model) served the request. Trinity
    // speaks as one agent. Backend identifiers stay in server logs.
    log.info('[ai-brain] Trinity cost-optimized route', {
      provider: result.provider,
      model: result.model,
    });
    res.json({
      success: true,
      result: {
        content: result.content,
        confidence: result.confidence,
        escalated: result.escalated,
        escalationReason: result.escalationReason,
        tokensUsed: result.tokensUsed,
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
aiBrainRouter.get('/providers/balances', requireAuth, requirePlatformStaff, async (req: Request, res: Response) => {
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
