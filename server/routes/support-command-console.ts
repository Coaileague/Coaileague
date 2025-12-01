/**
 * Support Command Console - Force-Push Updates to All Connected Clients
 * Allows support staff to force immediate sync of What's New, notifications,
 * and other platform updates via WebSocket broadcasts.
 * 
 * All actions are logged via AI Brain orchestrator.
 */

import { Router, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { type AuthenticatedRequest } from '../rbac';
import { platformEventBus, publishPlatformUpdate } from '../services/platformEventBus';
import { addUpdate } from '../services/whatsNewService';
import { db } from '../db';
import { notifications, systemAuditLogs, users } from '@shared/schema';
import { broadcastToAllClients } from '../websocket';
import { animationControlService, type AnimationCommand } from '../services/animationControlService';

export const supportCommandRouter = Router();

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

function requireSupportRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userRole = req.platformRole || 'none';
  if (!SUPPORT_ROLES.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Support staff access required',
      requiredRoles: SUPPORT_ROLES,
    });
  }
  next();
}

function broadcastForceRefresh(type: string, payload: any) {
  const message = {
    type: 'force_refresh',
    refreshType: type,
    payload,
    timestamp: new Date().toISOString(),
  };
  const count = broadcastToAllClients(message);
  console.log(`[SupportConsole] Force broadcast sent: ${type} to ${count} clients`);
  return count;
}

/**
 * POST /api/support/command/force-whats-new
 * Force push a new What's New update to all clients
 */
supportCommandRouter.post('/force-whats-new', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, description, category, priority, visibility, badge, version, learnMoreUrl } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description are required' });
    }

    // Add the update to the database
    const update = await addUpdate({
      title,
      description,
      date: new Date().toISOString().split('T')[0],
      category: category || 'announcement',
      priority: priority || 1,
      visibility: visibility || 'all',
      badge: badge || 'NEW',
      version,
      learnMoreUrl,
      isNew: true,
    });

    // Publish to the event bus (triggers WebSocket broadcast, notifications, audit log)
    await publishPlatformUpdate({
      type: 'announcement',
      category: category || 'announcement',
      title,
      description,
      version,
      priority: priority || 1,
      userId: req.user?.id,
      learnMoreUrl,
      visibility: visibility || 'all',
    });

    // Force immediate refresh on all clients
    broadcastForceRefresh('whats_new', {
      action: 'new_update',
      updateId: update.id,
      title,
      badge,
    });

    // Log the action
    await logSupportAction(req.user?.id || 'unknown', 'force_whats_new', {
      title,
      category,
      visibility,
    });

    res.json({
      success: true,
      message: 'What\'s New update pushed to all clients',
      update,
    });
  } catch (error: any) {
    console.error('[SupportConsole] Force What\'s New error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/force-notification
 * Force push a notification to all users or specific targets
 * Supports: platform-wide, workspace-targeted, or user-specific notifications
 */
supportCommandRouter.post('/force-notification', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title, message, type, targetUserIds, targetWorkspaceId, actionUrl, priority } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    const notificationsCreated: string[] = [];
    let notificationScope = 'platform-wide';

    // Determine targeting scope
    if (targetUserIds && Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      // Specific users
      notificationScope = `${targetUserIds.length} specific users`;
      for (const userId of targetUserIds) {
        const notification = await db.insert(notifications).values({
          workspaceId: targetWorkspaceId || 'coaileague-platform-workspace',
          userId,
          type: type || 'system',
          title,
          message,
          actionUrl: actionUrl || '/notifications',
          priority: priority || 'normal',
          isRead: false,
          metadata: { forcePushed: true, pushedBy: req.user?.id },
        }).returning();
        notificationsCreated.push(notification[0]?.id);
      }
    } else if (targetWorkspaceId) {
      // All users in a specific workspace
      const workspaceUsers = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.currentWorkspace, targetWorkspaceId));
      
      notificationScope = `${workspaceUsers.length} users in workspace`;
      for (const user of workspaceUsers) {
        const notification = await db.insert(notifications).values({
          workspaceId: targetWorkspaceId,
          userId: user.id,
          type: type || 'system',
          title,
          message,
          actionUrl: actionUrl || '/notifications',
          priority: priority || 'normal',
          isRead: false,
          metadata: { forcePushed: true, pushedBy: req.user?.id },
        }).returning();
        notificationsCreated.push(notification[0]?.id);
      }
    } else {
      // Platform-wide - notify all users using their current workspace
      const allUsers = await db.select({ 
        id: users.id, 
        currentWorkspace: users.currentWorkspace 
      }).from(users);
      notificationScope = `${allUsers.length} users platform-wide`;
      
      for (const user of allUsers) {
        const notification = await db.insert(notifications).values({
          workspaceId: user.currentWorkspace || 'coaileague-platform-workspace',
          userId: user.id,
          type: type || 'system',
          title,
          message,
          actionUrl: actionUrl || '/notifications',
          priority: priority || 'normal',
          isRead: false,
          metadata: { forcePushed: true, pushedBy: req.user?.id },
        }).returning();
        notificationsCreated.push(notification[0]?.id);
      }
    }

    // Broadcast force refresh to trigger notification count update
    broadcastForceRefresh('notifications', {
      action: 'new_notification',
      title,
      scope: notificationScope,
      count: notificationsCreated.length,
    });

    await logSupportAction(req.user?.id || 'unknown', 'force_notification', {
      title,
      type,
      scope: notificationScope,
      targetCount: notificationsCreated.length,
    });

    res.json({
      success: true,
      message: `Notification pushed to ${notificationsCreated.length} users (${notificationScope})`,
      notificationIds: notificationsCreated,
      scope: notificationScope,
    });
  } catch (error: any) {
    console.error('[SupportConsole] Force notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/force-sync
 * Force all clients to immediately refresh their cached data
 */
supportCommandRouter.post('/force-sync', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { syncTypes, reason } = req.body;
    
    // Default to syncing everything
    const types = syncTypes || ['whats_new', 'notifications', 'health'];

    // Broadcast force refresh for each type
    for (const type of types) {
      broadcastForceRefresh(type, {
        action: 'force_sync',
        reason: reason || 'Support staff initiated sync',
        timestamp: new Date().toISOString(),
      });
    }

    await logSupportAction(req.user?.id || 'unknown', 'force_sync', {
      syncTypes: types,
      reason,
    });

    res.json({
      success: true,
      message: `Force sync broadcast for: ${types.join(', ')}`,
      syncTypes: types,
    });
  } catch (error: any) {
    console.error('[SupportConsole] Force sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/broadcast-message
 * Send a system-wide message to all connected clients
 */
supportCommandRouter.post('/broadcast-message', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, severity, duration, dismissible } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    broadcastForceRefresh('system_message', {
      action: 'broadcast',
      message,
      severity: severity || 'info', // info, warning, error, success
      duration: duration || 10000, // ms to show
      dismissible: dismissible !== false,
      timestamp: new Date().toISOString(),
      sender: req.user?.id,
    });

    await logSupportAction(req.user?.id || 'unknown', 'broadcast_message', {
      message: message.substring(0, 100),
      severity,
    });

    res.json({
      success: true,
      message: 'System message broadcast to all clients',
    });
  } catch (error: any) {
    console.error('[SupportConsole] Broadcast message error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/maintenance-mode
 * Enable/disable maintenance mode with client notification
 */
supportCommandRouter.post('/maintenance-mode', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { enabled, message, estimatedDuration } = req.body;
    
    broadcastForceRefresh('maintenance', {
      action: enabled ? 'start' : 'end',
      enabled,
      message: message || (enabled ? 'System maintenance in progress' : 'Maintenance complete'),
      estimatedDuration,
      timestamp: new Date().toISOString(),
    });

    await logSupportAction(req.user?.id || 'unknown', 'maintenance_mode', {
      enabled,
      estimatedDuration,
    });

    res.json({
      success: true,
      message: enabled ? 'Maintenance mode enabled' : 'Maintenance mode disabled',
    });
  } catch (error: any) {
    console.error('[SupportConsole] Maintenance mode error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/invalidate-cache
 * Force clients to invalidate specific cache keys
 */
supportCommandRouter.post('/invalidate-cache', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cacheKeys, reason } = req.body;
    
    if (!cacheKeys || !Array.isArray(cacheKeys)) {
      return res.status(400).json({ error: 'cacheKeys array is required' });
    }

    broadcastForceRefresh('cache_invalidation', {
      action: 'invalidate',
      cacheKeys,
      reason: reason || 'Support staff cache clear',
      timestamp: new Date().toISOString(),
    });

    await logSupportAction(req.user?.id || 'unknown', 'invalidate_cache', {
      cacheKeys,
      reason,
    });

    res.json({
      success: true,
      message: `Cache invalidation broadcast for: ${cacheKeys.join(', ')}`,
      cacheKeys,
    });
  } catch (error: any) {
    console.error('[SupportConsole] Cache invalidation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/animation
 * Control universal workspace animations (show, hide, update, theme, force)
 */
supportCommandRouter.post('/animation', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const command: AnimationCommand = {
      action: req.body.action || 'show',
      mode: req.body.mode,
      mainText: req.body.mainText,
      subText: req.body.subText,
      duration: req.body.duration,
      progress: req.body.progress,
      seasonalTheme: req.body.seasonalTheme,
      source: 'support'
    };

    const result = await animationControlService.executeCommand(
      command,
      req.user?.id || 'support-console'
    );

    await logSupportAction(req.user?.id || 'unknown', 'animation_control', {
      action: command.action,
      mode: command.mode,
      mainText: command.mainText
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Animation control error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/support/command/animation/state
 * Get current animation state
 */
supportCommandRouter.get('/animation/state', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      state: animationControlService.getState(),
      currentTheme: animationControlService.getCurrentTheme(),
      availableThemes: animationControlService.getAvailableThemes(),
      availableModes: animationControlService.getAvailableModes()
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/animation/seasonal
 * Set seasonal theme for animations
 */
supportCommandRouter.post('/animation/seasonal', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { theme } = req.body;
    
    if (!theme) {
      return res.status(400).json({ error: 'Theme is required' });
    }

    const result = await animationControlService.executeCommand(
      { action: 'theme', seasonalTheme: theme, source: 'support' },
      req.user?.id || 'support-console'
    );

    await logSupportAction(req.user?.id || 'unknown', 'animation_theme_change', { theme });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Seasonal theme error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// CODE EDITOR COMMANDS - AI Brain Code Editing via Command Console
// ============================================================================

/**
 * POST /api/support/command/code/stage
 * Stage a code change for user approval
 */
supportCommandRouter.post('/code/stage', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { filePath, changeType, proposedContent, title, description, requestReason, conversationId, priority, category, affectedModule } = req.body;
    
    if (!filePath || !changeType || !title || !description) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['filePath', 'changeType', 'title', 'description']
      });
    }

    const result = await aiBrainCodeEditor.stageCodeChange({
      filePath,
      changeType,
      proposedContent,
      title,
      description,
      requestReason: requestReason || `Staged via Support Console by ${req.user?.id}`,
      conversationId,
      priority,
      category,
      affectedModule
    }, req.user?.id || 'support-console');

    await logSupportAction(req.user?.id || 'unknown', 'code_stage', {
      filePath,
      changeType,
      title,
      changeId: result.changeId
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Code stage error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/code/stage-batch
 * Stage multiple code changes as a batch
 */
supportCommandRouter.post('/code/stage-batch', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { title, description, changes, conversationId, whatsNewTitle, whatsNewDescription } = req.body;
    
    if (!title || !description || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['title', 'description', 'changes[]']
      });
    }

    const result = await aiBrainCodeEditor.stageBatchChanges({
      title,
      description,
      changes,
      conversationId,
      whatsNewTitle,
      whatsNewDescription
    }, req.user?.id || 'support-console');

    await logSupportAction(req.user?.id || 'unknown', 'code_stage_batch', {
      title,
      batchId: result.batchId,
      changesCount: changes.length
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Code stage batch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/support/command/code/pending
 * Get all pending code changes awaiting approval
 */
supportCommandRouter.get('/code/pending', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const pendingChanges = await aiBrainCodeEditor.getPendingChanges();

    res.json({
      success: true,
      count: pendingChanges.length,
      changes: pendingChanges
    });
  } catch (error: any) {
    console.error('[SupportConsole] Get pending changes error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/code/approve
 * Approve a staged code change
 */
supportCommandRouter.post('/code/approve', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, notes } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    const result = await aiBrainCodeEditor.approveChange(changeId, req.user?.id || 'support-console', notes);

    await logSupportAction(req.user?.id || 'unknown', 'code_approve', {
      changeId,
      notes
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Code approve error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/code/reject
 * Reject a staged code change
 */
supportCommandRouter.post('/code/reject', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, reason } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    const result = await aiBrainCodeEditor.rejectChange(changeId, req.user?.id || 'support-console', reason);

    await logSupportAction(req.user?.id || 'unknown', 'code_reject', {
      changeId,
      reason
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Code reject error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/code/apply
 * Apply an approved code change to the codebase
 */
supportCommandRouter.post('/code/apply', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, sendWhatsNew } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    // Verify the change is in a valid state for application before proceeding
    const change = await aiBrainCodeEditor.getChangeById(changeId);
    if (!change) {
      return res.status(404).json({ error: 'Code change not found' });
    }
    if (change.status !== 'approved') {
      return res.status(400).json({ 
        error: 'Can only apply approved changes',
        currentStatus: change.status
      });
    }

    const result = await aiBrainCodeEditor.applyChange(changeId, req.user?.id || 'support-console', sendWhatsNew !== false);

    await logSupportAction(req.user?.id || 'unknown', 'code_apply', {
      changeId,
      sendWhatsNew: sendWhatsNew !== false
    });

    // Broadcast code change applied notification
    broadcastForceRefresh('code_change', {
      action: 'applied',
      changeId,
      appliedAt: result.appliedAt
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Code apply error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/support/command/code/rollback
 * Rollback a previously applied code change
 */
supportCommandRouter.post('/code/rollback', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const { changeId, reason } = req.body;
    
    if (!changeId) {
      return res.status(400).json({ error: 'changeId is required' });
    }

    // Verify the change is in a valid state for rollback before proceeding
    const change = await aiBrainCodeEditor.getChangeById(changeId);
    if (!change) {
      return res.status(404).json({ error: 'Code change not found' });
    }
    if (change.status !== 'applied') {
      return res.status(400).json({ 
        error: 'Can only rollback applied changes',
        currentStatus: change.status
      });
    }

    const result = await aiBrainCodeEditor.rollbackChange(changeId);

    await logSupportAction(req.user?.id || 'unknown', 'code_rollback', {
      changeId,
      reason
    });

    // Broadcast rollback notification
    broadcastForceRefresh('code_change', {
      action: 'rolled_back',
      changeId,
      reason
    });

    res.json(result);
  } catch (error: any) {
    console.error('[SupportConsole] Code rollback error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/support/command/code/change/:id
 * Get details of a specific code change
 */
supportCommandRouter.get('/code/change/:id', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { aiBrainCodeEditor } = await import('../services/ai-brain/aiBrainCodeEditor');
    
    const change = await aiBrainCodeEditor.getChangeById(req.params.id);
    
    if (!change) {
      return res.status(404).json({ error: 'Code change not found' });
    }

    res.json({
      success: true,
      change
    });
  } catch (error: any) {
    console.error('[SupportConsole] Get change error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/support/command/status
 * Get current status of the command console and broadcast capabilities
 */
supportCommandRouter.get('/status', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      success: true,
      status: 'operational',
      wsBroadcasterConnected: true,
      supportedCommands: [
        'force-whats-new',
        'force-notification', 
        'force-sync',
        'broadcast-message',
        'maintenance-mode',
        'invalidate-cache',
        'animation',
        'animation/state',
        'animation/seasonal',
        'code/stage',
        'code/stage-batch',
        'code/pending',
        'code/approve',
        'code/reject',
        'code/apply',
        'code/rollback',
        'code/change/:id',
      ],
      userRole: req.platformRole,
      animationState: animationControlService.getState(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Log support staff actions for audit trail
 */
async function logSupportAction(userId: string, action: string, details: Record<string, any>) {
  try {
    await db.insert(systemAuditLogs).values({
      userId,
      action: `support_console_${action}`,
      entityType: 'support_command',
      entityId: action,
      changes: details,
      metadata: { 
        console: 'support_command_console',
        timestamp: new Date().toISOString(),
      },
      ipAddress: '127.0.0.1',
    });
  } catch (error) {
    console.error('[SupportConsole] Audit log failed:', error);
  }
}
