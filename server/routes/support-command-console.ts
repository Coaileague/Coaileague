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
