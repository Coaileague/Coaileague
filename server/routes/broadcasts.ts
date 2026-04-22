/**
 * Broadcast API Routes
 * Endpoints for creating, managing, and interacting with broadcasts
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { broadcastService } from '../services/broadcastService';
import { requireAuth } from '../auth';
import { broadcastToWorkspace } from '../websocket';
import type { CreateBroadcastRequest, SubmitFeedbackRequest } from '@shared/types/broadcasts';
import { platformEventBus } from '../services/platformEventBus';
import { db, pool } from '../db';
import { employees, platformRoles, broadcasts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { createLogger } from '../lib/logger';
const log = createLogger('Broadcasts');


// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    currentWorkspaceId?: string;
    workspaceId?: string;
    employeeId?: string;
    role?: string;
    claims?: {
      sub?: string;
    };
  };
  session?: Request['session'] & {
    userId?: string;
    passport?: {
      user?: {
        id: string;
        workspaceId?: string;
        employeeId?: string;
        role?: string;
      };
    };
  };
}

async function getUserInfo(req: AuthenticatedRequest) {
  const userId = req.user?.id || req.session?.userId || req.session?.passport?.user?.id;
  let workspaceId = req.workspaceId || req.user?.currentWorkspaceId || req.user?.workspaceId || req.session?.passport?.user?.workspaceId;
  let employeeId = req.employeeId || req.user?.employeeId || req.session?.passport?.user?.employeeId;
  // @ts-expect-error — TS migration: fix in refactoring sprint
  let role = req.workspaceRole || req.user?.role || (req.user)?.workspaceRole || (req.user)?.platformRole || req.session?.passport?.user?.role;

  const ambiguousRoles = ['org_admin', 'org_owner', 'support_agent'];
  if (userId && (!workspaceId || !employeeId || !role || ambiguousRoles.includes(role))) {
    try {
      const emp = await db.query.employees.findFirst({
        where: eq(employees.userId, userId),
      });
      if (emp) {
        if (!workspaceId) workspaceId = emp.workspaceId;
        if (!employeeId) employeeId = emp.id;
        if (emp.workspaceRole && (!role || ambiguousRoles.includes(role))) {
          role = emp.workspaceRole;
        }
      }
      const platRole = await db.query.platformRoles.findFirst({
        where: eq(platformRoles.userId, userId),
      });
      if (platRole && ['root_admin', 'sysop', 'support_manager'].includes(platRole.role)) {
        role = platRole.role;
      }
    } catch (e) {
      log.warn('[Broadcasts] Failed to lookup platform role:', e);
    }
  }

  return { userId, workspaceId, employeeId, role };
}

function requireRole(allowedRoles: string[]) {
  return async (req: AuthenticatedRequest, res: Response, next: Function) => {
    const { role } = await getUserInfo(req);
    const platformRolesWithAccess = ['root_admin', 'sysop'];
    if (role && platformRolesWithAccess.includes(role)) {
      return next();
    }
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

const router = Router();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const createBroadcastSchema = z.object({
  type: z.enum(['announcement', 'alert', 'system_notice', 'feature_release', 'feedback_request', 'pass_down', 'policy_update', 'celebration']),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional(),
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  richContent: z.object({
    html: z.string().optional(),
    markdown: z.string().optional(),
    attachments: z.array(z.object({
      type: z.enum(['image', 'file', 'link']),
      url: z.string(),
      name: z.string().optional(),
    })).optional(),
  }).optional(),
  targetType: z.enum(['all_org', 'all_platform', 'individuals', 'team', 'department', 'role', 'site', 'site_shift']),
  targetConfig: z.record(z.any()),
  actionType: z.enum(['none', 'link', 'acknowledge', 'feedback_form', 'survey']).optional(),
  actionConfig: z.record(z.any()).optional(),
  passDownData: z.object({
    incidents: z.array(z.object({
      time: z.string().optional(),
      description: z.string(),
      severity: z.enum(['low', 'medium', 'high']).optional(),
      resolved: z.boolean().optional(),
    })).optional(),
    clientNotes: z.array(z.object({
      note: z.string(),
      important: z.boolean().optional(),
    })).optional(),
    equipmentIssues: z.array(z.object({
      equipment: z.string(),
      issue: z.string(),
      reported: z.boolean().optional(),
    })).optional(),
    specialInstructions: z.array(z.string()).optional(),
    weatherAlert: z.object({
      condition: z.string(),
      advisory: z.string(),
    }).optional(),
    keyContacts: z.array(z.object({
      name: z.string(),
      role: z.string(),
      phone: z.string().optional(),
    })).optional(),
  }).optional(),
  scheduledFor: z.string().optional(),
  expiresAt: z.string().optional(),
  isDraft: z.boolean().optional(),
});

const submitFeedbackSchema = z.object({
  feedbackType: z.enum(['idea', 'bug', 'complaint', 'praise', 'general']),
  subject: z.string().optional(),
  content: z.string().min(1),
  category: z.string().optional(),
  allowFollowup: z.boolean().optional(),
  contactMethod: z.enum(['email', 'in_app', 'phone']).optional(),
});

// ============================================
// ORG-LEVEL BROADCASTS (Org Owners/Admins)
// ============================================

/**
 * Create org-level broadcast
 * POST /api/broadcasts
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/', requireAuth, requireRole(['org_owner', 'co_owner', 'manager', 'department_manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const validated = createBroadcastSchema.parse(req.body);
    const { userId, workspaceId } = await getUserInfo(req);
    
    // Ensure target is org-level (not all_platform)
    if (validated.targetType === 'all_platform') {
      return res.status(403).json({ 
        error: 'Platform-wide broadcasts require platform admin role' 
      });
    }

    const broadcast = await broadcastService.createBroadcast(
      validated as CreateBroadcastRequest,
      userId!,
      'user',
      workspaceId
    );

    if (workspaceId && !validated.isDraft) {
      try {
        broadcastToWorkspace(workspaceId, {
          type: 'broadcast_message',
          title: validated.title,
          message: validated.message?.substring(0, 200),
          broadcastId: broadcast.id,
        });
      } catch (e) {
        log.error('[BroadcastRoutes] WebSocket broadcast failed:', e);
      }

      // ── SMS channel: queue via smsQueueService for rate-limited delivery ──
      // Opt-in via `smsChannel: true` in the body. For workspace-wide broadcasts
      // or larger targeting (>10 recipients), Twilio rate limits mandate queuing.
      try {
        const smsChannel = (req.body as any)?.smsChannel === true;
        const smsBody = ((req.body as any)?.smsBody || validated.message || '').toString().slice(0, 320);
        if (smsChannel && smsBody && !validated.isDraft) {
          const { rows: recipients } = await pool.query(
            `SELECT id, phone FROM employees
              WHERE workspace_id = $1 AND is_active = TRUE AND phone IS NOT NULL AND phone <> ''`,
            [workspaceId],
          );
          if (recipients.length > 10) {
            const { queueSMS } = await import('../services/sms/smsQueueService');
            const messages = recipients.map((r: any) => ({
              workspaceId,
              to: r.phone,
              body: smsBody,
              type: 'broadcast',
              employeeId: r.id,
              priority: validated.priority === 'critical' ? 1 : validated.priority === 'high' ? 3 : 5,
            }));
            const result = await queueSMS(messages);
            log.info(`[Broadcast] Queued ${result.queued} SMS messages via outbox`);
          }
        }
      } catch (smsErr: any) {
        log.warn('[BroadcastRoutes] SMS dispatch failed (non-fatal):', smsErr?.message);
      }
    }

    platformEventBus.emit('broadcast.created', {
      broadcastId: broadcast.id,
      workspaceId,
      createdBy: userId,
      title: validated.title,
      isDraft: validated.isDraft || false,
    });

    res.status(201).json(broadcast);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Create error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: sanitizeError(error) || 'Failed to create broadcast' });
  }
});

/**
 * List broadcasts for org
 * GET /api/broadcasts
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = await getUserInfo(req);
    const broadcasts = await broadcastService.getBroadcasts({
      workspaceId,
      type: req.query.type as any,
      priority: req.query.priority as any,
      isActive: req.query.isActive === 'true',
      includeDrafts: req.query.includeDrafts === 'true',
      includeExpired: req.query.includeExpired === 'true',
      limit: Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500),
      offset: parseInt(req.query.offset as string) || 0,
    });

    res.json(broadcasts);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] List error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch broadcasts' });
  }
});

/**
 * Get broadcasts for current employee
 * GET /api/broadcasts/my
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/my', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = await getUserInfo(req);
    const broadcasts = await broadcastService.getBroadcastsForEmployee(
      employeeId!,
      {
        unreadOnly: req.query.unreadOnly === 'true',
        limit: Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 500),
      }
    );

    res.json(broadcasts);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] My broadcasts error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch broadcasts' });
  }
});

/**
 * Get Org Operations Briefing Channel posts
 * GET /api/broadcasts/briefing
 * Access: org_owner, co_owner, manager, department_manager only
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/briefing', requireAuth, requireRole(['org_owner', 'co_owner', 'manager', 'department_manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = await getUserInfo(req);
    const broadcasts = await broadcastService.getBroadcasts({
      workspaceId,
      type: 'briefing' as any,
      isActive: true,
      includeDrafts: false,
      includeExpired: false,
      limit: Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500),
      offset: parseInt(req.query.offset as string) || 0,
    });
    res.json(broadcasts);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Briefing channel error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch briefing posts' });
  }
});

/**
 * List all platform broadcasts (for admin dashboard)
 * GET /api/broadcasts/platform
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/platform', requireAuth, requireRole(['sysop', 'root_admin', 'deputy_admin', 'support_agent', 'support_manager']), async (req, res) => {
  try {
    const broadcasts = await broadcastService.getBroadcasts({
      workspaceId: undefined,
      type: req.query.type as any,
      isActive: req.query.isActive === 'true',
      includeDrafts: true,
      includeExpired: true,
      limit: Math.min(Math.max(1, parseInt(req.query.limit as string) || 100), 500),
    });

    const platformBroadcasts = broadcasts.filter(b => !b.workspaceId);

    res.json(platformBroadcasts);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Platform list error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch broadcasts' });
  }
});

/**
 * Get broadcast by ID with stats and recipient info for current user
 * GET /api/broadcasts/:id
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userInfo = await getUserInfo(req);
    const broadcast = await broadcastService.getBroadcastById(req.params.id);
    
    if (!broadcast) {
      return res.status(404).json({ success: false, error: 'Broadcast not found' });
    }

    // Get recipient info for the current user
    let recipient = null;
    if (userInfo.userId) {
      recipient = await broadcastService.getRecipientStatus(req.params.id, userInfo.userId);
    }

    res.json({ success: true, broadcast, recipient });
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Get error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) || 'Failed to fetch broadcast' });
  }
});

/**
 * Get broadcast stats
 * GET /api/broadcasts/:id/stats
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/:id/stats', requireAuth, requireRole(['org_owner', 'co_owner', 'manager']), async (req, res) => {
  try {
    const stats = await broadcastService.getBroadcastStats(req.params.id);
    res.json(stats);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Stats error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch stats' });
  }
});

/**
 * Update broadcast
 * PATCH /api/broadcasts/:id
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.patch('/:id', requireAuth, requireRole(['org_owner', 'co_owner', 'manager']), async (req, res) => {
  try {
    const broadcast = await broadcastService.updateBroadcast(req.params.id, req.body);

    platformEventBus.emit('broadcast.updated', {
      broadcastId: req.params.id,
      updatedFields: Object.keys(req.body),
    });

    res.json(broadcast);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Update error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to update broadcast' });
  }
});

/**
 * Deactivate/delete broadcast
 * DELETE /api/broadcasts/:id
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.delete('/:id', requireAuth, requireRole(['org_owner', 'co_owner', 'manager']), async (req, res) => {
  try {
    await broadcastService.deactivateBroadcast(req.params.id);

    platformEventBus.emit('broadcast.deleted', {
      broadcastId: req.params.id,
    });

    res.json({ success: true });
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Delete error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to delete broadcast' });
  }
});

// ============================================
// EMPLOYEE ENDPOINTS
// ============================================

/**
 * Mark broadcast as read
 * POST /api/broadcasts/:id/read
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = await getUserInfo(req);
    await broadcastService.markAsRead(req.params.id, employeeId!);
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Mark read error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to mark as read' });
  }
});

/**
 * Acknowledge broadcast
 * POST /api/broadcasts/:id/acknowledge
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = await getUserInfo(req);
    await broadcastService.acknowledgeBroadcast(
      req.params.id,
      employeeId!,
      req.body.note
    );
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Acknowledge error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to acknowledge' });
  }
});

/**
 * Dismiss broadcast
 * POST /api/broadcasts/:id/dismiss
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/:id/dismiss', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = await getUserInfo(req);
    await broadcastService.dismissBroadcast(req.params.id, employeeId!);
    res.json({ success: true });
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Dismiss error:', error);
    if (sanitizeError(error)?.includes('Critical')) {
      return res.status(400).json({ error: sanitizeError(error) });
    }
    res.status(500).json({ error: sanitizeError(error) || 'Failed to dismiss' });
  }
});

/**
 * Submit feedback for a broadcast
 * POST /api/broadcasts/:id/feedback
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/:id/feedback', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const validated = submitFeedbackSchema.parse(req.body);
    const { employeeId, workspaceId } = await getUserInfo(req);
    
    const feedback = await broadcastService.submitFeedback(
      {
        broadcastId: req.params.id,
        ...validated,
      } as SubmitFeedbackRequest,
      employeeId!,
      workspaceId
    );

    res.status(201).json(feedback);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Feedback error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: sanitizeError(error) || 'Failed to submit feedback' });
  }
});

// ============================================
// PLATFORM-LEVEL BROADCASTS (Support/Admin/Bots)
// ============================================

/**
 * Create platform-wide broadcast
 * POST /api/broadcasts/platform
 * Requires platform admin or support role
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/platform', requireAuth, requireRole(['root_admin', 'sysop', 'support_manager']), async (req: AuthenticatedRequest, res) => {
  try {
    const validated = createBroadcastSchema.parse(req.body);
    const { userId, role } = await getUserInfo(req);

    const broadcast = await broadcastService.createBroadcast(
      validated as CreateBroadcastRequest,
      userId!,
      role === 'support' || role === 'support_admin' ? 'support' : 'user',
      undefined // undefined workspaceId = platform-wide
    );

    if (!validated.isDraft) {
      try {
        const { broadcastToAllClients } = await import('../websocket');
        broadcastToAllClients({
          type: 'broadcast_message',
          title: validated.title,
          message: validated.message?.substring(0, 200),
          broadcastId: broadcast.id,
          isPlatform: true,
        });
      } catch (e) {
        log.error('[BroadcastRoutes] Platform WebSocket broadcast failed:', e);
      }
    }

    res.status(201).json(broadcast);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] Platform broadcast error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    res.status(500).json({ error: sanitizeError(error) || 'Failed to create broadcast' });
  }
});

// ============================================
// FEEDBACK MANAGEMENT (Admin)
// ============================================

/**
 * List feedback responses for a broadcast
 * GET /api/broadcasts/:id/feedback
 */
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/:id/feedback', requireAuth, requireRole(['org_owner', 'co_owner', 'org_admin', 'sysop', 'root_admin']), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (workspaceId) {
      const broadcast = await db.query.broadcasts.findFirst({
        where: eq(broadcasts.id, id),
        columns: { id: true, workspaceId: true },
      });
      if (!broadcast) {
        return res.status(404).json({ error: 'Broadcast not found' });
      }
      if (broadcast.workspaceId && broadcast.workspaceId !== workspaceId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const result = await broadcastService.getFeedbackForBroadcast(id, { limit, offset });
    res.json(result);
  } catch (error: unknown) {
    log.error('[BroadcastRoutes] List feedback error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch feedback' });
  }
});

export default router;
