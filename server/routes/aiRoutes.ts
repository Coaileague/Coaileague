import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('AiRoutes');


const router = Router();

const AALV_SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

router.post('/responses/:id/feedback', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { rating, feedback } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (rating === undefined || rating === null) {
      return res.status(400).json({ message: 'Rating is required (1-5)' });
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: 'No workspace selected' });
    }

    const aiResponse = await storage.getAiResponse(id);
    if (!aiResponse) {
      return res.status(404).json({ message: 'AI response not found' });
    }

    if (aiResponse.workspaceId !== workspaceId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const ratedResponse = await storage.rateAiResponse(id, ratingNum, feedback);
    if (!ratedResponse) {
      return res.status(500).json({ message: 'Failed to save feedback' });
    }

    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      response: ratedResponse,
    });
  } catch (error) {
    log.error('Error submitting AI response feedback:', error);
    res.status(500).json({ message: 'Failed to submit feedback' });
  }
});

router.get('/responses', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: 'No workspace selected' });
    }

    const { sourceType, feature, limit = 50, offset = 0 } = req.query;

    const filters = {
      sourceType: sourceType ? String(sourceType) : undefined,
      feature: feature ? String(feature) : undefined,
      limit: Math.min(parseInt(String(limit), 10) || 50, 100),
      offset: Math.max(parseInt(String(offset), 10) || 0, 0),
    };

    const responses = await storage.getAiResponsesByWorkspace(workspaceId, filters);

    res.json({
      success: true,
      data: responses,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
      },
    });
  } catch (error) {
    log.error('Error fetching AI responses:', error);
    res.status(500).json({ message: 'Failed to fetch AI responses' });
  }
});

router.get('/suggestions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: 'No workspace selected' });
    }

    const { status, priority, type, limit = 50, offset = 0, activeOnly } = req.query;

    let suggestions;

    if (activeOnly === 'true') {
      suggestions = await storage.getActiveSuggestions(workspaceId);
      suggestions = suggestions.slice(
        Math.max(parseInt(String(offset), 10) || 0, 0),
        Math.max(parseInt(String(offset), 10) || 0, 0) + Math.min(parseInt(String(limit), 10) || 50, 100)
      );
    } else {
      const filters = {
        status: status ? String(status) : undefined,
        priority: priority ? String(priority) : undefined,
        type: type ? String(type) : undefined,
        limit: Math.min(parseInt(String(limit), 10) || 50, 100),
        offset: Math.max(parseInt(String(offset), 10) || 0, 0),
      };

      suggestions = await storage.getAiSuggestionsByWorkspace(workspaceId, filters);
    }

    res.json({
      success: true,
      data: suggestions,
      pagination: {
        limit: Math.min(parseInt(String(limit), 10) || 50, 100),
        offset: Math.max(parseInt(String(offset), 10) || 0, 0),
      },
    });
  } catch (error) {
    log.error('Error fetching AI suggestions:', error);
    res.status(500).json({ message: 'Failed to fetch AI suggestions' });
  }
});

router.get('/audit-logs', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (!user?.platformRole || !AALV_SUPPORT_ROLES.includes(user.platformRole)) {
      return res.status(403).json({ 
        message: 'Access denied. AALV requires support role access.',
        requiredRoles: AALV_SUPPORT_ROLES
      });
    }

    const { 
      actionType,
      workspaceId,
      startDate,
      endDate,
      limit = '100', 
      offset = '0' 
    } = req.query;

    const filters = {
      actionType: actionType ? String(actionType) : undefined,
      workspaceId: workspaceId ? String(workspaceId) : undefined,
      startDate: startDate ? new Date(String(startDate)) : undefined,
      endDate: endDate ? new Date(String(endDate)) : undefined,
      limit: Math.min(parseInt(String(limit), 10) || 100, 500),
      offset: Math.max(parseInt(String(offset), 10) || 0, 0),
    };

    const logs = await storage.getAiBrainActionLogs(filters);

    res.json({
      success: true,
      data: logs,
      pagination: {
        limit: filters.limit,
        offset: filters.offset,
        count: logs.length,
      },
    });
  } catch (error) {
    log.error('Error fetching AI Brain action logs:', error);
    res.status(500).json({ message: 'Failed to fetch AI audit logs' });
  }
});

const triggerFillSchema = z.object({
  shiftIds: z.array(z.string()).optional(),
  aiLevel: z.enum(['standard', 'advanced', 'expert']).optional().default('standard'),
  mode: z.enum(['optimize', 'fill_gaps', 'full_generate']).optional().default('fill_gaps'),
  weekStart: z.string().optional(),
});

router.post('/trigger-fill', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: 'No workspace selected' });
    }

    const parseResult = triggerFillSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        message: 'Invalid request body',
        errors: parseResult.error.flatten().fieldErrors
      });
    }

    const { shiftIds, aiLevel, mode, weekStart } = parseResult.data;

    const employee = await storage.getEmployeeByUserId(userId, workspaceId);
    if (!employee || !['org_owner', 'co_owner', 'org_manager', 'manager', 'department_manager', 'supervisor'].includes(employee.workspaceRole || '')) {
      return res.status(403).json({ message: 'Manager access required to trigger AI fill' });
    }

    const { trinitySchedulingOrchestrator } = await import('../services/orchestration/trinitySchedulingOrchestrator');
    
    const effectiveMode = mode || (aiLevel === 'expert' ? 'optimize' : aiLevel === 'advanced' ? 'optimize' : 'fill_gaps');

    const result = await trinitySchedulingOrchestrator.startSchedulingSession({
      workspaceId: workspaceId,
      triggeredBy: userId,
      mode: effectiveMode as 'optimize' | 'fill_gaps' | 'full_generate',
      weekStart: weekStart ? new Date(weekStart) : undefined,
      dryRun: false,
    });

    res.json({
      success: true,
      message: 'AI fill triggered successfully',
      executionId: result.executionId,
      sessionId: result.sessionId,
      summary: result.summary,
      shiftsToFill: shiftIds?.length || result.summary?.openShiftsFilled || 0,
      mutations: result.mutations?.length || 0,
      requiresVerification: result.requiresVerification,
      aiLevel,
      mode: effectiveMode,
    });
  } catch (error: unknown) {
    log.error('Error triggering AI fill:', error);
    
    if (sanitizeError(error)?.includes('insufficient') || sanitizeError(error)?.includes('credits')) {
      return res.status(402).json({
        message: 'Insufficient credits for AI operation',
        error: sanitizeError(error)
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to trigger AI fill', 
      error: sanitizeError(error) 
    });
  }
});

router.get('/audit-logs/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (!user?.platformRole || !AALV_SUPPORT_ROLES.includes(user.platformRole)) {
      return res.status(403).json({ message: 'Access denied. AALV requires support role access.' });
    }

    const recentLogs = await storage.getAiBrainActionLogs({ limit: 1000 });
    
    const actionTypeCounts: Record<string, number> = {};
    const resultCounts: Record<string, number> = {};

    for (const log of recentLogs) {
      const actionPrefix = log.actorType?.split('.')[0] || 'unknown';
      actionTypeCounts[actionPrefix] = (actionTypeCounts[actionPrefix] || 0) + 1;
      const resultKey = log.result || 'unknown';
      resultCounts[resultKey] = (resultCounts[resultKey] || 0) + 1;
    }

    res.json({
      success: true,
      stats: {
        totalLogs: recentLogs.length,
        actionTypeBreakdown: actionTypeCounts,
        resultBreakdown: resultCounts,
      },
    });
  } catch (error) {
    log.error('Error fetching audit log stats:', error);
    res.status(500).json({ message: 'Failed to fetch audit log stats' });
  }
});

router.get('/audit-logs/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (!user?.platformRole || !AALV_SUPPORT_ROLES.includes(user.platformRole)) {
      return res.status(403).json({ message: 'Access denied. AALV requires support role access.' });
    }

    const log = await storage.getAiBrainActionLog(req.params.id);
    if (!log) {
      return res.status(404).json({ message: 'AI Brain action log not found' });
    }

    res.json({ success: true, data: log });
  } catch (error) {
    log.error('Error fetching AI Brain action log:', error);
    res.status(500).json({ message: 'Failed to fetch AI audit log' });
  }
});

router.post('/audit-logs/:id/review', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await storage.getUser(userId);
    if (!user?.platformRole || !AALV_SUPPORT_ROLES.includes(user.platformRole)) {
      return res.status(403).json({ message: 'Access denied. AALV requires support role access.' });
    }

    const { notes } = req.body;
    const updated = await storage.markAiBrainActionReviewed(req.params.id, userId, notes);
    
    if (!updated) {
      return res.status(404).json({ message: 'AI Brain action log not found' });
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    log.error('Error marking action as reviewed:', error);
    res.status(500).json({ message: 'Failed to mark action as reviewed' });
  }
});

export default router;
