import { Router, Request, Response } from 'express';
import { db } from '../db';
import { workspaces, employees, notifications } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requirePlatformAdmin, type AuthenticatedRequest } from '../rbac';
import { broadcastToWorkspace } from '../websocket';
import { aiBrainAuthorizationService } from '../services/ai-brain/aiBrainAuthorizationService';
import { z } from 'zod';

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
    
    const workspaceEmployees = await db.query.employees.findMany({
      where: and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true)
      ),
      columns: { userId: true },
    });
    
    let recipientCount = 0;
    
    for (const emp of workspaceEmployees) {
      if (emp.userId) {
        await db.insert(notifications).values({
          workspaceId,
          userId: emp.userId,
          type: 'system',
          title,
          message,
          metadata: {
            service: serviceName,
            action,
            reason,
            severity: action === 'suspended' ? 'warning' : 'info',
          },
          isRead: false,
        });
        recipientCount++;
      }
    }
    
    broadcastToWorkspace(workspaceId, {
      type: 'service_control',
      action,
      service: serviceName,
      serviceLabel,
      message,
      reason,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[ServiceControl] Notified ${recipientCount} users about ${serviceName} ${action}`);
    return recipientCount;
  } catch (error) {
    console.error('[ServiceControl] Failed to broadcast notification:', error);
    return 0;
  }
}

// Get workspace service status
router.get('/workspaces/:workspaceId/service-status', requirePlatformAdmin, async (req: Request, res: Response) => {
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
  } catch (error: any) {
    console.error('Error fetching workspace service status:', error);
    res.status(500).json({ error: 'Failed to fetch service status' });
  }
});

// Suspend a service for a workspace (Trinity, chat, automations, or AI Brain)
router.post('/workspaces/:workspaceId/services/:service/suspend', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId, service } = req.params;
    const adminId = authReq.user!.id;
    const adminRole = authReq.user!.platformRole || 'none';
    
    const serviceValidation = ValidServiceSchema.safeParse(service);
    if (!serviceValidation.success) {
      return res.status(400).json({ error: 'Invalid service. Valid services: trinity, chat, automations, aiBrain' });
    }
    
    const bodyValidation = SuspendServiceSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({ error: bodyValidation.error.errors[0]?.message || 'Invalid request body' });
    }
    
    const { reason } = bodyValidation.data;
    
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
    
    console.log(`[ServiceControl] ${service} suspended for workspace ${workspaceId} by ${adminId}. Reason: ${reason}`);
    
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
  } catch (error: any) {
    console.error('Error suspending service:', error);
    res.status(500).json({ error: 'Failed to suspend service' });
  }
});

// Restore a service for a workspace
router.post('/workspaces/:workspaceId/services/:service/restore', requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { workspaceId, service } = req.params;
    const adminId = authReq.user!.id;
    
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
    
    console.log(`[ServiceControl] ${service} restored for workspace ${workspaceId} by ${adminId}`);
    
    const notifiedCount = await broadcastServiceNotification(workspaceId, service, 'restored');
    
    res.json({
      success: true,
      message: `${service} service restored for workspace`,
      workspace: updatedWorkspace,
      service,
      notifiedUsers: notifiedCount,
    });
  } catch (error: any) {
    console.error('Error restoring service:', error);
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
    
    console.log(`[ServiceControl] ALL SERVICES suspended for workspace ${workspaceId} by ${adminId}. Reason: ${reason}`);
    
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
  } catch (error: any) {
    console.error('Error suspending all services:', error);
    res.status(500).json({ error: 'Failed to suspend all services' });
  }
});

// Bulk restore all services for a workspace
router.post('/workspaces/:workspaceId/services/restore-all', requirePlatformAdmin, async (req: Request, res: Response) => {
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
    
    console.log(`[ServiceControl] ALL SERVICES restored for workspace ${workspaceId} by ${adminId}`);
    
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
  } catch (error: any) {
    console.error('Error restoring all services:', error);
    res.status(500).json({ error: 'Failed to restore all services' });
  }
});

export default router;
