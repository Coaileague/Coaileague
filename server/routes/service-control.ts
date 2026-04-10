import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { db } from '../db';
import { workspaces, employees, notifications } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requirePlatformAdmin, requirePlatformStaff, type AuthenticatedRequest, getPlatformRoleLevel } from '../rbac';
import { broadcastToWorkspace } from '../websocket';
import { universalNotificationEngine } from '../services/universalNotificationEngine';
import { aiBrainAuthorizationService } from '../services/ai-brain/aiBrainAuthorizationService';
import { storage } from '../storage';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('ServiceControl');


const router = Router();

const SuspendServiceSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters'),
});

const ValidServiceSchema = z.enum(['trinity', 'chat', 'automations', 'aiBrain']);

const SERVICE_LABELS: Record<string, string> = {
  trinity: 'Trinity AI Mascot',
  chat: 'Chat & Messaging',
  automations: 'Automated Jobs',
  aiBrain: 'AI Brain Services',
};

async function broadcastServiceNotification(
  workspaceId: string,
  serviceName: string,
  action: 'suspended' | 'restored',
  reason?: string
): Promise<number> {
  try {
    const serviceLabel = SERVICE_LABELS[serviceName] || serviceName;
    const title = action === 'suspended' 
      ? `Service Suspended: ${serviceLabel}` 
      : `Service Restored: ${serviceLabel}`;
    const message = action === 'suspended'
      ? `${serviceLabel} has been suspended for this workspace. Reason: ${reason || 'Investigation pending'}`
      : `${serviceLabel} has been restored and is now available.`;
    
    // Route through UNE for AI enrichment and unified handling
    const result = await universalNotificationEngine.sendNotification({
      workspaceId,
      type: 'system',
      title,
      message,
      severity: action === 'suspended' ? 'warning' : 'info',
      actionUrl: '/settings',
      metadata: {
        service: serviceName,
        serviceLabel,
        action,
        reason,
        skipFeatureCheck: true, // System-level notifications bypass feature validation
      },
    });
    
    // Also broadcast real-time WebSocket event for immediate UI update
    broadcastToWorkspace(workspaceId, {
      type: 'service_control',
      action,
      service: serviceName,
      serviceLabel,
      message,
      reason,
      timestamp: new Date().toISOString(),
    });
    
    log.info(`[ServiceControl] UNE notified ${result.recipientCount} users about ${serviceName} ${action}`);
    return result.recipientCount;
  } catch (error) {
    log.error('[ServiceControl] Failed to broadcast notification:', error);
    return 0;
  }
}

// Get workspace service status — accessible to all platform staff (support_agent+)
router.get('/workspaces/:workspaceId/service-status', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    
    const [workspace] = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      trinitySuspended: workspaces.trinitySuspended,
      trinitySuspendedReason: workspaces.trinitySuspendedReason,
      trinitySuspendedAt: workspaces.trinitySuspendedAt,
      trinitySuspendedBy: workspaces.trinitySuspendedBy,
      chatSuspended: workspaces.chatSuspended,
      chatSuspendedReason: workspaces.chatSuspendedReason,
      chatSuspendedAt: workspaces.chatSuspendedAt,
      chatSuspendedBy: workspaces.chatSuspendedBy,
      automationsSuspended: workspaces.automationsSuspended,
      automationsSuspendedReason: workspaces.automationsSuspendedReason,
      automationsSuspendedAt: workspaces.automationsSuspendedAt,
      automationsSuspendedBy: workspaces.automationsSuspendedBy,
      aiBrainSuspended: workspaces.aiBrainSuspended,
      aiBrainSuspendedReason: workspaces.aiBrainSuspendedReason,
      aiBrainSuspendedAt: workspaces.aiBrainSuspendedAt,
      aiBrainSuspendedBy: workspaces.aiBrainSuspendedBy,
    }).from(workspaces).where(eq(workspaces.id, workspaceId));
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    res.json({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      services: {
        trinity: {
          suspended: workspace.trinitySuspended,
          reason: workspace.trinitySuspendedReason,
          suspendedAt: workspace.trinitySuspendedAt,
          suspendedBy: workspace.trinitySuspendedBy,
        },
        chat: {
          suspended: workspace.chatSuspended,
          reason: workspace.chatSuspendedReason,
          suspendedAt: workspace.chatSuspendedAt,
          suspendedBy: workspace.chatSuspendedBy,
        },
        automations: {
          suspended: workspace.automationsSuspended,
          reason: workspace.automationsSuspendedReason,
          suspendedAt: workspace.automationsSuspendedAt,
          suspendedBy: workspace.automationsSuspendedBy,
        },
        aiBrain: {
          suspended: workspace.aiBrainSuspended,
          reason: workspace.aiBrainSuspendedReason,
          suspendedAt: workspace.aiBrainSuspendedAt,
          suspendedBy: workspace.aiBrainSuspendedBy,
        },
      },
    });
  } catch (error: unknown) {
    log.error('Error fetching workspace service status:', error);
    res.status(500).json({ error: 'Failed to fetch service status' });
  }
});

// Suspend a service for a workspace — requires support_manager+ (level 4)
// Destructive action: routed through approval system, audit-logged
router.post('/workspaces/:workspaceId/services/:service/suspend', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId, service } = req.params;
    const adminId = authReq.user!.id;
    const adminRole = authReq.platformRole || 'none';
    const roleLevel = getPlatformRoleLevel(adminRole);

    if (roleLevel < 4) {
      return res.status(403).json({ error: 'Service suspension requires support_manager or higher authority' });
    }
    
    const serviceValidation = ValidServiceSchema.safeParse(service);
    if (!serviceValidation.success) {
      return res.status(400).json({ error: 'Invalid service. Valid services: trinity, chat, automations, aiBrain' });
    }
    
    const bodyValidation = SuspendServiceSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({ error: bodyValidation.error.errors[0]?.message || 'Invalid request body' });
    }
    
    const { reason } = bodyValidation.data;

    await storage.createAuditLog({
      userId: adminId,
      workspaceId,
      action: 'service_suspend_initiated',
      entityType: 'service',
      entityId: `${workspaceId}/${service}`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: { service, reason, executorRole: adminRole, executorLevel: roleLevel },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    
    const approvalResult = await aiBrainAuthorizationService.requestApprovalForDestructiveAction({
      actionType: 'suspend_workspace',
      requesterId: adminId,
      requesterRole: adminRole,
      targetEntity: `${workspaceId}/${service}`,
      parameters: { workspaceId, service, reason },
      reason,
    });
    
    if (!approvalResult.approved) {
      return res.status(202).json({
        success: false,
        requiresApproval: true,
        approvalId: approvalResult.approvalId,
        message: approvalResult.reason,
      });
    }
    
    const updateData: Record<string, any> = {};
    const now = new Date();
    
    switch (service) {
      case 'trinity':
        updateData.trinitySuspended = true;
        updateData.trinitySuspendedReason = reason;
        updateData.trinitySuspendedAt = now;
        updateData.trinitySuspendedBy = adminId;
        break;
      case 'chat':
        updateData.chatSuspended = true;
        updateData.chatSuspendedReason = reason;
        updateData.chatSuspendedAt = now;
        updateData.chatSuspendedBy = adminId;
        break;
      case 'automations':
        updateData.automationsSuspended = true;
        updateData.automationsSuspendedReason = reason;
        updateData.automationsSuspendedAt = now;
        updateData.automationsSuspendedBy = adminId;
        break;
      case 'aiBrain':
        updateData.aiBrainSuspended = true;
        updateData.aiBrainSuspendedReason = reason;
        updateData.aiBrainSuspendedAt = now;
        updateData.aiBrainSuspendedBy = adminId;
        break;
    }
    
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, workspaceId))
      .returning({ id: workspaces.id, name: workspaces.name });
    
    if (!updatedWorkspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    log.info(`[ServiceControl] ${service} suspended for workspace ${workspaceId} by ${adminId}. Reason: ${reason}`);
    
    const notifiedCount = await broadcastServiceNotification(workspaceId, service, 'suspended', reason);
    
    res.json({
      success: true,
      message: `${service} service suspended for workspace`,
      workspace: updatedWorkspace,
      service,
      reason,
      suspendedAt: now,
      notifiedUsers: notifiedCount,
    });
  } catch (error: unknown) {
    log.error('Error suspending service:', error);
    res.status(500).json({ error: 'Failed to suspend service' });
  }
});

// Restore a service — restorative action, support_agent+ (level 3) can restore
router.post('/workspaces/:workspaceId/services/:service/restore', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId, service } = req.params;
    const adminId = authReq.user!.id;
    const adminRole = authReq.platformRole || 'none';

    await storage.createAuditLog({
      userId: adminId,
      workspaceId,
      action: 'service_restore_executed',
      entityType: 'service',
      entityId: `${workspaceId}/${service}`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: { service, executorRole: adminRole },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    
    const serviceValidation = ValidServiceSchema.safeParse(service);
    if (!serviceValidation.success) {
      return res.status(400).json({ error: 'Invalid service. Valid services: trinity, chat, automations, aiBrain' });
    }
    
    const updateData: Record<string, any> = {};
    
    switch (service) {
      case 'trinity':
        updateData.trinitySuspended = false;
        updateData.trinitySuspendedReason = null;
        updateData.trinitySuspendedAt = null;
        updateData.trinitySuspendedBy = null;
        break;
      case 'chat':
        updateData.chatSuspended = false;
        updateData.chatSuspendedReason = null;
        updateData.chatSuspendedAt = null;
        updateData.chatSuspendedBy = null;
        break;
      case 'automations':
        updateData.automationsSuspended = false;
        updateData.automationsSuspendedReason = null;
        updateData.automationsSuspendedAt = null;
        updateData.automationsSuspendedBy = null;
        break;
      case 'aiBrain':
        updateData.aiBrainSuspended = false;
        updateData.aiBrainSuspendedReason = null;
        updateData.aiBrainSuspendedAt = null;
        updateData.aiBrainSuspendedBy = null;
        break;
    }
    
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set(updateData)
      .where(eq(workspaces.id, workspaceId))
      .returning({ id: workspaces.id, name: workspaces.name });
    
    if (!updatedWorkspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    log.info(`[ServiceControl] ${service} restored for workspace ${workspaceId} by ${adminId}`);
    
    const notifiedCount = await broadcastServiceNotification(workspaceId, service, 'restored');
    
    res.json({
      success: true,
      message: `${service} service restored for workspace`,
      workspace: updatedWorkspace,
      service,
      notifiedUsers: notifiedCount,
    });
  } catch (error: unknown) {
    log.error('Error restoring service:', error);
    res.status(500).json({ error: 'Failed to restore service' });
  }
});

// Bulk suspend all services for a workspace (emergency lockdown)
router.post('/workspaces/:workspaceId/services/suspend-all', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId } = req.params;
    const { reason } = req.body;
    const adminId = authReq.user!.id;
    
    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: 'Suspension reason required (minimum 10 characters)' });
    }
    
    const now = new Date();
    
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set({
        trinitySuspended: true,
        trinitySuspendedReason: reason,
        trinitySuspendedAt: now,
        trinitySuspendedBy: adminId,
        chatSuspended: true,
        chatSuspendedReason: reason,
        chatSuspendedAt: now,
        chatSuspendedBy: adminId,
        automationsSuspended: true,
        automationsSuspendedReason: reason,
        automationsSuspendedAt: now,
        automationsSuspendedBy: adminId,
        aiBrainSuspended: true,
        aiBrainSuspendedReason: reason,
        aiBrainSuspendedAt: now,
        aiBrainSuspendedBy: adminId,
      })
      .where(eq(workspaces.id, workspaceId))
      .returning({ id: workspaces.id, name: workspaces.name });
    
    if (!updatedWorkspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    log.info(`[ServiceControl] ALL SERVICES suspended for workspace ${workspaceId} by ${adminId}. Reason: ${reason}`);
    
    const services = ['trinity', 'chat', 'automations', 'aiBrain'];
    let totalNotified = 0;
    for (const svc of services) {
      totalNotified += await broadcastServiceNotification(workspaceId, svc, 'suspended', reason);
    }
    
    res.json({
      success: true,
      message: 'All services suspended for workspace (emergency lockdown)',
      workspace: updatedWorkspace,
      services,
      reason,
      suspendedAt: now,
      notifiedUsers: totalNotified / services.length, // Average per service
    });
  } catch (error: unknown) {
    log.error('Error suspending all services:', error);
    res.status(500).json({ error: 'Failed to suspend all services' });
  }
});

// Bulk restore all services — restorative, support_manager+ (level 4) for bulk
router.post('/workspaces/:workspaceId/services/restore-all', requirePlatformStaff, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId } = req.params;
    const adminId = authReq.user!.id;
    
    const [updatedWorkspace] = await db
      .update(workspaces)
      .set({
        trinitySuspended: false,
        trinitySuspendedReason: null,
        trinitySuspendedAt: null,
        trinitySuspendedBy: null,
        chatSuspended: false,
        chatSuspendedReason: null,
        chatSuspendedAt: null,
        chatSuspendedBy: null,
        automationsSuspended: false,
        automationsSuspendedReason: null,
        automationsSuspendedAt: null,
        automationsSuspendedBy: null,
        aiBrainSuspended: false,
        aiBrainSuspendedReason: null,
        aiBrainSuspendedAt: null,
        aiBrainSuspendedBy: null,
      })
      .where(eq(workspaces.id, workspaceId))
      .returning({ id: workspaces.id, name: workspaces.name });
    
    if (!updatedWorkspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    log.info(`[ServiceControl] ALL SERVICES restored for workspace ${workspaceId} by ${adminId}`);
    
    const services = ['trinity', 'chat', 'automations', 'aiBrain'];
    let totalNotified = 0;
    for (const svc of services) {
      totalNotified += await broadcastServiceNotification(workspaceId, svc, 'restored');
    }
    
    res.json({
      success: true,
      message: 'All services restored for workspace',
      workspace: updatedWorkspace,
      services,
      notifiedUsers: totalNotified / services.length,
    });
  } catch (error: unknown) {
    log.error('Error restoring all services:', error);
    res.status(500).json({ error: 'Failed to restore all services' });
  }
});

// ── Per-workspace Trinity authorization pause/resume ──────────────────────────
// These operate on the in-memory workspacePauseMap inside aiBrainAuthorizationService.
// They complement the DB-level trinitySuspended field: the DB field sends notifications
// and persists across restarts; the pause map provides a faster zero-DB hot kill.
// Requires: platform_admin (same level as kill switch activation).

router.post(
  '/workspaces/:workspaceId/trinity/pause',
  requirePlatformAdmin,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { workspaceId } = req.params;
      const adminId = authReq.user!.id;
      const { reason } = req.body;
      if (!reason) return res.status(400).json({ error: 'reason is required' });

      const result = aiBrainAuthorizationService.pauseWorkspaceTrinity(workspaceId, adminId, reason);
      log.info(`[ServiceControl] Trinity PAUSED in workspace ${workspaceId} by ${adminId}`);
      res.json({ ...result, workspaceId, pausedBy: adminId });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  }
);

router.post(
  '/workspaces/:workspaceId/trinity/resume',
  requirePlatformAdmin,
  async (req: Request, res: Response) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const { workspaceId } = req.params;
      const adminId = authReq.user!.id;

      const result = aiBrainAuthorizationService.resumeWorkspaceTrinity(workspaceId, adminId);
      log.info(`[ServiceControl] Trinity RESUMED in workspace ${workspaceId} by ${adminId}`);
      res.json({ ...result, workspaceId, resumedBy: adminId });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  }
);

router.get(
  '/trinity/paused-workspaces',
  requirePlatformAdmin,
  async (_req: Request, res: Response) => {
    try {
      const paused = aiBrainAuthorizationService.listPausedWorkspaces();
      res.json({ success: true, count: paused.length, pausedWorkspaces: paused });
    } catch (error: unknown) {
      res.status(500).json({ error: sanitizeError(error) });
    }
  }
);

export default router;
