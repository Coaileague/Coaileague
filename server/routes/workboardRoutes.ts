/**
 * AI Brain Workboard Routes
 * 
 * Central job queue and orchestration endpoints for AI task management.
 */

import { Router } from 'express';
import { workboardService } from '../services/ai-brain/workboardService';

export function registerWorkboardRoutes(app: Router, requireAuth: (req: any, res: any, next: any) => void) {
  /**
   * Submit a new task to the AI Brain Workboard
   * Central entry point for all AI orchestration requests
   */
  app.post('/api/workboard/submit', requireAuth, async (req: any, res: any) => {
    try {
      const { requestContent, requestType, priority, notifyVia, metadata } = req.body;
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
        notifyVia: notifyVia || ['trinity', 'websocket']
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
   * List tasks for the current user
   */
  app.get('/api/workboard/tasks', requireAuth, async (req: any, res: any) => {
    try {
      const userId = req.userId!;
      const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
      const { status, limit, offset } = req.query;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required' });
      }

      const statusFilter = status ? (status as string).split(',') as any : undefined;
      const tasks = await workboardService.getUserTasks(userId, workspaceId, {
        status: statusFilter,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0
      });

      res.json({
        success: true,
        tasks: tasks.map(t => ({
          id: t.id,
          requestType: t.requestType,
          status: t.status,
          priority: t.priority,
          assignedAgent: t.assignedAgentName,
          resultSummary: t.resultSummary,
          createdAt: t.createdAt,
          completedAt: t.completedAt
        })),
        total: tasks.length
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

  console.log('[WorkboardRoutes] AI Brain Workboard routes registered');
}
