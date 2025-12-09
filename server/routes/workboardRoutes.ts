/**
 * AI Brain Workboard Routes
 * 
 * Central job queue and orchestration endpoints for AI task management.
 */

import { Router } from 'express';
import { workboardService } from '../services/ai-brain/workboardService';
import { fastModeService, FAST_MODE_CONFIG } from '../services/ai-brain/fastModeService';

export function registerWorkboardRoutes(app: Router, requireAuth: (req: any, res: any, next: any) => void) {
  /**
   * Submit a new task to the AI Brain Workboard
   * Central entry point for all AI orchestration requests
   */
  app.post('/api/workboard/submit', requireAuth, async (req: any, res: any) => {
    try {
      const { requestContent, requestType, priority, notifyVia, metadata, executionMode } = req.body;
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      if (!requestContent || typeof requestContent !== 'string') {
        return res.status(400).json({ error: 'Request content is required' });
      }

      const task = await workboardService.submitTask({
        workspaceId,
        userId,
        requestType: requestType || 'direct_api',
        requestContent: requestContent.trim(),
        requestMetadata: metadata || {},
        priority: priority || 'normal',
        notifyVia: notifyVia || ['trinity', 'websocket'],
        executionMode: executionMode || 'normal',
      });

      res.json({
        success: true,
        task: {
          id: task.id,
          status: task.status,
          priority: task.priority,
          createdAt: task.createdAt
        }
      });
    } catch (error: any) {
      console.error('[Workboard] Submit error:', error);
      res.status(500).json({ error: 'Failed to submit task', message: error.message });
    }
  });

  /**
   * List tasks with RBAC scope filtering
   * - admin/support: all workspace tasks
   * - manager: team tasks (same workspace)
   * - employee: own tasks only
   */
  app.get('/api/workboard/tasks', requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      const platformRole = req.user?.platformRole || 'none';
      const { status, priority, limit, offset, scope } = req.query;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const isAdmin = ['root_admin', 'super_admin', 'support_admin'].includes(platformRole);
      const isSupport = ['support_manager', 'support_agent', 'support_lead'].includes(platformRole);
      
      const statusFilter = status ? (status as string).split(',') as any : undefined;
      const priorityFilter = priority as string | undefined;
      
      const scopeValue = (isAdmin || isSupport) ? 'admin' : (scope === 'manager' ? 'manager' : 'employee');
      const tasks = await workboardService.getUserTasks(userId, workspaceId, {
        status: statusFilter,
        priority: priorityFilter,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0,
        scope: scopeValue as 'admin' | 'manager' | 'employee',
      });

      res.json({
        success: true,
        tasks: tasks.map(t => ({
          id: t.id,
          workspaceId: t.workspaceId,
          userId: t.userId,
          requestType: t.requestType,
          requestContent: t.requestContent,
          status: t.status,
          priority: t.priority,
          intent: t.intent,
          category: t.category,
          confidence: t.confidence,
          assignedAgentId: t.assignedAgentId,
          assignedAgentName: t.assignedAgentName,
          estimatedTokens: t.estimatedTokens,
          actualTokens: t.actualTokens,
          creditsDeducted: t.creditsDeducted,
          resultSummary: t.resultSummary,
          errorMessage: t.errorMessage,
          retryCount: t.retryCount,
          maxRetries: t.maxRetries,
          notifyVia: t.notifyVia,
          executionMode: t.executionMode,
          createdAt: t.createdAt,
          startedAt: t.startedAt,
          completedAt: t.completedAt,
        })),
        pagination: {
          total: tasks.length,
          limit: limit ? parseInt(limit as string) : 50,
          offset: offset ? parseInt(offset as string) : 0,
          hasMore: tasks.length >= (limit ? parseInt(limit as string) : 50),
        }
      });
    } catch (error: any) {
      console.error('[Workboard] List error:', error);
      res.status(500).json({ error: 'Failed to fetch tasks', message: error.message });
    }
  });

  /**
   * Get a single task by ID
   */
  app.get('/api/workboard/tasks/:taskId', requireAuth, async (req: any, res: any) => {
    try {
      const { taskId } = req.params;
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      const task = await workboardService.getTask(taskId);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      if (task.userId !== userId && task.workspaceId !== workspaceId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      res.json({
        success: true,
        task: {
          id: task.id,
          requestType: task.requestType,
          requestContent: task.requestContent,
          status: task.status,
          priority: task.priority,
          intent: task.intent,
          category: task.category,
          confidence: task.confidence,
          assignedAgent: task.assignedAgentName,
          estimatedTokens: task.estimatedTokens,
          actualTokens: task.actualTokens,
          result: task.result,
          resultSummary: task.resultSummary,
          errorMessage: task.errorMessage,
          statusHistory: task.statusHistory,
          createdAt: task.createdAt,
          startedAt: task.startedAt,
          completedAt: task.completedAt
        }
      });
    } catch (error: any) {
      console.error('[Workboard] Get task error:', error);
      res.status(500).json({ error: 'Failed to fetch task', message: error.message });
    }
  });

  /**
   * Cancel a pending task
   */
  app.post('/api/workboard/tasks/:taskId/cancel', requireAuth, async (req: any, res: any) => {
    try {
      const { taskId } = req.params;
      const userId = req.userId!;

      const cancelled = await workboardService.cancelTask(taskId, userId);

      if (!cancelled) {
        return res.status(400).json({ error: 'Cannot cancel task - may already be in progress or completed' });
      }

      res.json({ success: true, message: 'Task cancelled' });
    } catch (error: any) {
      console.error('[Workboard] Cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel task', message: error.message });
    }
  });

  /**
   * Retry a failed task
   */
  app.post('/api/workboard/tasks/:taskId/retry', requireAuth, async (req: any, res: any) => {
    try {
      const { taskId } = req.params;

      const retried = await workboardService.retryTask(taskId);

      if (!retried) {
        return res.status(400).json({ error: 'Cannot retry task - max retries exceeded or task not retryable' });
      }

      res.json({ success: true, message: 'Task queued for retry' });
    } catch (error: any) {
      console.error('[Workboard] Retry error:', error);
      res.status(500).json({ error: 'Failed to retry task', message: error.message });
    }
  });

  /**
   * Get workboard statistics for the workspace
   */
  app.get('/api/workboard/stats', requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const stats = await workboardService.getWorkspaceStats(workspaceId);

      res.json({ success: true, stats });
    } catch (error: any) {
      console.error('[Workboard] Stats error:', error);
      res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
    }
  });

  // ============================================
  // FAST MODE ROUTES
  // ============================================

  /**
   * Check if workspace can use Fast Mode
   */
  app.get('/api/ai-brain/fast-mode/status', requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const canUse = await fastModeService.canUseFastMode(workspaceId, 10);
      
      res.json({
        canUse: canUse.canUse,
        reason: canUse.reason,
        creditBalance: canUse.creditBalance,
        activeTasks: canUse.activeTasks,
        maxConcurrent: canUse.maxConcurrent,
        config: {
          creditMultiplier: FAST_MODE_CONFIG.creditMultiplier,
          maxParallelAgents: FAST_MODE_CONFIG.maxParallelAgents,
          slaGuarantees: FAST_MODE_CONFIG.slaGuarantees
        }
      });
    } catch (error: any) {
      console.error('[FastMode] Status error:', error);
      res.status(500).json({ error: 'Failed to check fast mode status', message: error.message });
    }
  });

  /**
   * Get active Fast Mode tasks for workspace
   */
  app.get('/api/ai-brain/fast-mode/active', requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const activeTasks = fastModeService.getActiveTasksForWorkspace(workspaceId);
      
      res.json({
        tasks: activeTasks,
        count: activeTasks.length
      });
    } catch (error: any) {
      console.error('[FastMode] Active tasks error:', error);
      res.status(500).json({ error: 'Failed to fetch active tasks', message: error.message });
    }
  });

  /**
   * Get Fast Mode execution status for a specific task
   */
  app.get('/api/ai-brain/fast-mode/task/:taskId', requireAuth, async (req: any, res: any) => {
    try {
      const { taskId } = req.params;
      
      const status = fastModeService.getExecutionStatus(taskId);
      
      if (!status) {
        return res.status(404).json({ error: 'Task not found or not in fast mode' });
      }
      
      res.json({ status });
    } catch (error: any) {
      console.error('[FastMode] Task status error:', error);
      res.status(500).json({ error: 'Failed to fetch task status', message: error.message });
    }
  });

  /**
   * Get Fast Mode value comparison for display
   */
  app.get('/api/ai-brain/fast-mode/value', requireAuth, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const comparison = await fastModeService.getValueComparison(workspaceId);
      
      res.json(comparison);
    } catch (error: any) {
      console.error('[FastMode] Value comparison error:', error);
      res.status(500).json({ error: 'Failed to fetch value comparison', message: error.message });
    }
  });

  /**
   * Execute task with Velocity Engine (Map-Reduce architecture)
   * Enhanced parallel orchestration with decomposition, parallel execution, and consolidation
   */
  app.post('/api/ai-brain/fast-mode/velocity', requireAuth, async (req: any, res: any) => {
    try {
      const { content, availableAgents } = req.body;
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'Content is required' });
      }

      const taskId = `velocity-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      
      const result = await fastModeService.executeVelocity({
        taskId,
        workspaceId,
        userId,
        content: content.trim(),
        availableAgents
      });

      res.json({
        success: result.success,
        taskId,
        status: result.result.status,
        totalTimeMs: result.result.totalTimeMs,
        parallelConcurrency: result.result.parallelConcurrency,
        finalSynthesis: result.result.finalSynthesis,
        agentDetails: result.result.agentDetails.map(a => ({
          agent: a.agent,
          status: a.status,
          confidence: a.confidence,
          timeMs: a.timeMs,
          cached: a.cached
        })),
        failedAgents: result.result.failedAgents,
        needsReviewAgents: result.result.needsReviewAgents,
        creditsUsed: result.creditsUsed
      });
    } catch (error: any) {
      console.error('[FastMode] Velocity execution error:', error);
      res.status(500).json({ error: 'Velocity execution failed', message: error.message });
    }
  });

  /**
   * Get Velocity Engine stats (cache, config)
   */
  app.get('/api/ai-brain/fast-mode/velocity/stats', requireAuth, async (req: any, res: any) => {
    try {
      const stats = fastModeService.getVelocityStats();
      res.json(stats);
    } catch (error: any) {
      console.error('[FastMode] Velocity stats error:', error);
      res.status(500).json({ error: 'Failed to fetch velocity stats', message: error.message });
    }
  });

  console.log('[WorkboardRoutes] AI Brain Workboard routes registered');
  console.log('[WorkboardRoutes] Fast Mode routes registered');
  console.log('[WorkboardRoutes] Velocity Engine routes registered');
}
