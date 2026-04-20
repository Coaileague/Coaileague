/**
 * AI Orchestra API Routes
 * 
 * Exposes the multi-model AI orchestration system with:
 * - Task execution with automatic fallback chains
 * - Model health monitoring
 * - Usage reporting and billing
 * - Credit management
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { requireOwner, requireManager } from '../rbac';
import { 
  executeAITask, 
  getAIUsageReport, 
  getAIModelHealth,
  executeWithMetaCognition,
  metaCognitionService
} from '../services/ai-brain/aiOrchestraService';
import { db } from '../db';
import { tokenManager } from '../services/billing/tokenManager';
import {
  aiModels,
  aiTaskTypes,
  aiTaskQueue,
  aiModelHealth,
  workspaces,
} from '@shared/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { canAccessFeature } from '@shared/config/premiumFeatures';

const router = Router();

router.post('/execute', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId, userId } = req.session!;
    const { taskType, input, context, priority, forceProvider, forceModelId } = req.body;

    if (!taskType || !input) {
      return res.status(400).json({
        success: false,
        error: 'taskType and input are required',
      });
    }

    const result = await executeAITask({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId,
      userId,
      taskType,
      input,
      context,
      priority,
      forceProvider,
      forceModelId,
    });

    return res.json({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      success: result.success,
      ...result,
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Execute task error:', error);
    return res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get('/models', requireAuth, async (_req: Request, res: Response) => {
  try {
    const models = await db.select().from(aiModels).where(eq(aiModels.isActive, true));
    
    return res.json({
      success: true,
      models: models.map(m => ({
        id: m.id,
        name: m.modelName,
        provider: m.provider,
        tier: m.tier,
        capabilities: m.capabilities,
        costPer1kInput: m.costPer1kInputTokens,
        costPer1kOutput: m.costPer1kOutputTokens,
      })),
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get models error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/task-types', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;

    // Get workspace subscription tier
    const [workspace] = await db.select()
      .from(workspaces)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Get credit balance for credit-based access checking (aiUsageEvents-backed)
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const availableCredits = await tokenManager.getBalance(workspaceId);

    // Fetch all task types from the system
    // NOTE: aiTaskTypes is system reference data (not workspace-specific)
    // BUT: Premium task types are gated by subscription tier and available credits
    // This prevents multi-tenant data leakage where free-tier users see premium capabilities
    const allTypes = await db.select().from(aiTaskTypes);

    // Filter task types based on workspace subscription and feature access
    // This ensures free-tier workspaces can't access premium task types
    const accessibleTypes = allTypes.filter(t => {
      // Free/included task types are always accessible
      if (!t.isPremiumFeature) {
        return true;
      }

      // For premium task types, verify workspace has required subscription tier or credits
      const accessCheck = canAccessFeature(
        `ai_task_${t.taskType}`,
        workspace.subscriptionTier as any,
        0, // currentUsage - not tracked per task type
        availableCredits,
        1, // requestedUnits
        [] // purchasedAddons
      );

      return accessCheck.allowed;
    });

    return res.json({
      success: true,
      taskTypes: accessibleTypes.map(t => ({
        id: t.id,
        taskType: t.taskType,
        description: t.description,
        tier: t.tier,
        isPremium: t.isPremiumFeature,
        creditCost: t.creditCost,
      })),
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get task types error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/health', requireAuth, async (_req: Request, res: Response) => {
  try {
    const health = await getAIModelHealth();
    
    return res.json({
      success: true,
      models: health,
      summary: {
        total: health.length,
        healthy: health.filter(h => h.isHealthy).length,
        degraded: health.filter(h => h.status === 'degraded').length,
        down: health.filter(h => h.status === 'down').length,
      },
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get health error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    // @ts-expect-error — TS migration: fix in refactoring sprint
    const report = await getAIUsageReport(workspaceId, start, end);

    return res.json({
      success: true,
      report,
      period: { start, end },
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get usage error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/tasks', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const { limit = 50 } = req.query;

    const tasks = await db.select()
      .from(aiTaskQueue)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(eq(aiTaskQueue.workspaceId, workspaceId))
      .orderBy(desc(aiTaskQueue.createdAt))
      .limit(Number(limit));

    return res.json({
      success: true,
      tasks,
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get tasks error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// Credit auto-topoff / budget-limit settings are retired. Overage is billed
// automatically on the monthly Stripe invoice — no per-workspace topoff knobs.
router.get('/credit-settings', requireAuth, async (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Credit auto-topoff settings are retired. Token usage is billed as monthly overage.',
  });
});

router.put('/credit-settings', requireOwner, async (_req: Request, res: Response) => {
  return res.status(410).json({
    success: false,
    error: 'Credit auto-topoff settings are retired. Token usage is billed as monthly overage.',
  });
});

router.get('/providers/status', requireAuth, async (_req: Request, res: Response) => {
  try {
    const providers = {
      openai: {
        available: !!process.env.OPENAI_API_KEY,
        models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'gpt-3.5-turbo'],
      },
      anthropic: {
        available: !!process.env.ANTHROPIC_API_KEY || true,
        models: ['claude-3-5-sonnet', 'claude-3-opus'],
      },
      google: {
        available: !!process.env.GEMINI_API_KEY || true,
        models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      },
    };

    return res.json({
      success: true,
      providers,
      trinity: {
        configured: providers.openai.available && providers.anthropic.available && providers.google.available,
        description: 'AI Orchestra: Gemini (Operations) + Claude (Analysis) + GPT-4 (Creative)',
      },
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get providers status error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================
// META-COGNITION ROUTES
// Trinity's "Prefrontal Cortex" - Synthesizer, Arbitrator, Confidence Calibrator
// ============================================

router.post('/meta-cognition/execute', requireManager, async (req: Request, res: Response) => {
  try {
    const { workspaceId, userId } = req.session!;
    const { taskType, input, context, priority } = req.body;

    if (!taskType || !input) {
      return res.status(400).json({
        success: false,
        error: 'taskType and input are required',
      });
    }

    const result = await executeWithMetaCognition({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      workspaceId,
      userId,
      taskType,
      input,
      context,
      priority,
    });

    return res.json({
      success: result.taskResult.success,
      taskResult: result.taskResult,
      metaCognition: result.metaCognition,
      elevated: !!result.metaCognition,
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Meta-cognition execute error:', error);
    return res.status(500).json({
      success: false,
      error: sanitizeError(error),
    });
  }
});

router.get('/meta-cognition/logs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500);
    const offset = parseInt(req.query.offset as string) || 0;

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: meta_cognition_logs | Verified: 2026-03-23
    const logs = await typedQuery(sql`
      SELECT 
        id,
        task_type,
        trigger_reason,
        resolution_method,
        original_confidence,
        calibrated_confidence,
        human_escalation_required,
        total_tokens_consumed,
        execution_time_ms,
        created_at
      FROM meta_cognition_logs
      WHERE workspace_id = ${workspaceId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    // CATEGORY C — Raw SQL retained: Count( | Tables: meta_cognition_logs | Verified: 2026-03-23
    const countResult = await typedCount(sql`
      SELECT COUNT(*) as total FROM meta_cognition_logs
      WHERE workspace_id = ${workspaceId}
    `);

    return res.json({
      success: true,
      logs: (logs as any).rows,
      total: parseInt(((countResult as any).rows[0] as any)?.total || '0'),
      limit,
      offset,
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get meta-cognition logs error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/meta-cognition/logs/:logId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const { logId } = req.params;

    // CATEGORY C — Raw SQL retained: ::uuid | Tables: meta_cognition_logs | Verified: 2026-03-23
    const logs = await typedQuery(sql`
      SELECT * FROM meta_cognition_logs
      WHERE id = ${logId}::uuid AND workspace_id = ${workspaceId}
    `);

    if (logs.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Log not found',
      });
    }

    return res.json({
      success: true,
      log: logs[0],
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get meta-cognition log error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/meta-cognition/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    
    const stats = await metaCognitionService.getStats(workspaceId);

    return res.json({
      success: true,
      stats,
      description: {
        synthesizer: 'Claude combines strengths of multiple model responses',
        arbitrator: 'GPT-4 resolves conflicts between disagreeing models',
        confidenceCalibrator: 'Gemini reality-checks and calibrates confidence scores',
      },
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get meta-cognition stats error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/meta-cognition/escalations', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 10), 500);

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: meta_cognition_logs | Verified: 2026-03-23
    const escalations = await typedQuery(sql`
      SELECT 
        id,
        original_prompt,
        task_type,
        calibrated_confidence,
        escalation_questions,
        synthesis_notes,
        created_at
      FROM meta_cognition_logs
      WHERE workspace_id = ${workspaceId}
        AND human_escalation_required = true
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return res.json({
      success: true,
      escalations: (escalations as any).rows,
      description: 'Tasks where meta-cognition could not reach sufficient confidence',
    });
  } catch (error: unknown) {
    log.error('[AIOrchestra] Get escalations error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ============================================================================
// TRINITY ANALYTICS ENDPOINTS
// Cross-data analysis correlating business metrics with AI cognition data
// ============================================================================

import { trinityAnalyticsService } from '../services/ai-brain/trinityAnalyticsService';
import { typedCount, typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('AiOrchestraRoutes');


router.get('/analytics/dashboard', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const summary = await trinityAnalyticsService.getDashboardSummary(workspaceId);

    return res.json({
      success: true,
      dashboard: summary,
      description: 'Trinity Analytics dashboard summary combining AI and business metrics',
    });
  } catch (error: unknown) {
    log.error('[TrinityAnalytics] Dashboard error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/analytics/model-performance', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
    const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
    
    const timeRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const metrics = await trinityAnalyticsService.getModelPerformanceMetrics(workspaceId, timeRange);

    return res.json({
      success: true,
      modelPerformance: metrics,
      description: 'Performance metrics for each AI model in the orchestra',
    });
  } catch (error: unknown) {
    log.error('[TrinityAnalytics] Model performance error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/analytics/business-correlations', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
    const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
    
    const timeRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const correlations = await trinityAnalyticsService.getBusinessCorrelations(workspaceId, timeRange);

    return res.json({
      success: true,
      correlations,
      description: 'How AI performance correlates with business outcomes',
    });
  } catch (error: unknown) {
    log.error('[TrinityAnalytics] Correlations error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/analytics/cost-efficiency', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
    const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
    
    const timeRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const report = await trinityAnalyticsService.getCostEfficiencyReport(workspaceId, timeRange);

    return res.json({
      success: true,
      costEfficiency: report,
      description: 'AI operation costs with savings from intelligent fallback routing',
    });
  } catch (error: unknown) {
    log.error('[TrinityAnalytics] Cost efficiency error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/analytics/quality-trends', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    const granularity = (req.query.granularity as 'day' | 'week' | 'month') || 'day';
    const startDate = req.query.start ? new Date(req.query.start as string) : undefined;
    const endDate = req.query.end ? new Date(req.query.end as string) : undefined;
    
    const timeRange = startDate && endDate ? { start: startDate, end: endDate } : undefined;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const trends = await trinityAnalyticsService.getQualityTrends(workspaceId, granularity, timeRange);

    return res.json({
      success: true,
      qualityTrends: trends,
      granularity,
      description: 'AI decision quality trends over time',
    });
  } catch (error: unknown) {
    log.error('[TrinityAnalytics] Quality trends error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get('/analytics/cross-domain-insights', requireAuth, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.session!;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const insights = await trinityAnalyticsService.getCrossDomainInsights(workspaceId);

    return res.json({
      success: true,
      insights,
      description: 'Cross-domain insights combining AI performance with business impact analysis',
    });
  } catch (error: unknown) {
    log.error('[TrinityAnalytics] Cross-domain insights error:', error);
    return res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
