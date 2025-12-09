/**
 * Trinity Notification Routes - Fortune 500-Grade Notification API
 * 
 * Endpoints for:
 * - Live patch delivery
 * - What's New push
 * - Support escalation
 * - Trinity AI insights
 * - Maintenance alerts
 * - Delivery metrics
 */

import { Router, Response, NextFunction } from 'express';
import { type AuthenticatedRequest } from '../rbac';
import { trinityNotificationBridge } from '../services/ai-brain/trinityNotificationBridge';

export const trinityNotificationRouter = Router();

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'];
const ADMIN_ROLES = ['root_admin', 'deputy_admin', 'sysop'];

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

function requireAdminRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userRole = req.platformRole || 'none';
  if (!ADMIN_ROLES.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Admin access required',
      requiredRoles: ADMIN_ROLES,
    });
  }
  next();
}

/**
 * POST /api/trinity/notifications/live-patch
 * Deploy a live patch notification to all clients
 */
trinityNotificationRouter.post('/live-patch', requireAdminRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      version, 
      title, 
      description, 
      severity, 
      affectedSystems, 
      requiresRefresh,
      rolloutPercentage 
    } = req.body;
    
    if (!version || !title || !description) {
      return res.status(400).json({ 
        error: 'version, title, and description are required' 
      });
    }

    const result = await trinityNotificationBridge.deliverLivePatch({
      patchId: `patch-${Date.now()}`,
      version,
      title,
      description,
      severity: severity || 'normal',
      affectedSystems: affectedSystems || ['frontend'],
      deployedAt: new Date().toISOString(),
      deployedBy: req.user?.id,
      requiresRefresh: requiresRefresh ?? true,
      rolloutPercentage,
    });

    res.json({
      success: result.success,
      message: `Live patch ${version} deployed`,
      recipientCount: result.recipientCount,
      deliveryTime: result.deliveryTime,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Live patch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trinity/notifications/whats-new
 * Push a What's New announcement
 */
trinityNotificationRouter.post('/whats-new', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      title, 
      description, 
      category, 
      priority,
      visibility,
      badge,
      version,
      learnMoreUrl,
      workspaceId 
    } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ 
        error: 'title and description are required' 
      });
    }

    const result = await trinityNotificationBridge.pushWhatsNew({
      title,
      description,
      category: category || 'announcement',
      priority,
      visibility,
      badge,
      version,
      learnMoreUrl,
      workspaceId,
      pushedBy: req.user?.id,
    });

    res.json({
      success: true,
      message: `What's New update pushed`,
      updateId: result.updateId,
      recipientCount: result.recipientCount,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] What\'s New error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trinity/notifications/support-escalation
 * Send escalation notification to support staff
 */
trinityNotificationRouter.post('/support-escalation', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      title, 
      message, 
      severity, 
      targetRoles,
      actionUrl 
    } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ 
        error: 'title and message are required' 
      });
    }

    const result = await trinityNotificationBridge.supportEscalation({
      title,
      message,
      severity: severity || 'info',
      targetRoles,
      actionUrl,
      pushedBy: req.user?.id || 'system',
    });

    res.json({
      success: result.success,
      message: `Escalation sent to support staff`,
      recipientCount: result.recipientCount,
      deliveryTime: result.deliveryTime,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Support escalation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trinity/notifications/insight
 * Send Trinity AI insight notification to user
 * RBAC: Requires support role or higher - only AI Brain and support staff can push insights
 */
trinityNotificationRouter.post('/insight', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      workspaceId, 
      userId, 
      insightType, 
      title, 
      message,
      actionUrl,
      mode 
    } = req.body;
    
    if (!workspaceId || !userId || !title || !message) {
      return res.status(400).json({ 
        error: 'workspaceId, userId, title, and message are required' 
      });
    }

    const result = await trinityNotificationBridge.trinityInsight({
      workspaceId,
      userId,
      insightType: insightType || 'recommendation',
      title,
      message,
      actionUrl,
      mode: mode || 'business_pro',
    });

    console.log(`[TrinityNotificationRoutes] Insight pushed by ${req.user?.id} to user ${userId} in workspace ${workspaceId}`);

    res.json({
      success: result.success,
      message: `Trinity insight delivered`,
      deliveryTime: result.deliveryTime,
      initiatedBy: req.user?.id,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Trinity insight error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trinity/notifications/maintenance-alert
 * Create maintenance alert
 */
trinityNotificationRouter.post('/maintenance-alert', requireAdminRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { 
      title, 
      message, 
      scheduledStart, 
      scheduledEnd,
      affectedServices,
      workspaceId 
    } = req.body;
    
    if (!title || !message || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({ 
        error: 'title, message, scheduledStart, and scheduledEnd are required' 
      });
    }

    const result = await trinityNotificationBridge.maintenanceAlert({
      title,
      message,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd: new Date(scheduledEnd),
      affectedServices: affectedServices || ['all'],
      workspaceId,
      createdBy: req.user?.id || 'system',
    });

    res.json({
      success: true,
      message: `Maintenance alert created`,
      alertId: result.alertId,
      recipientCount: result.recipientCount,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Maintenance alert error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trinity/notifications/metrics
 * Get notification delivery metrics
 */
trinityNotificationRouter.get('/metrics', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const metrics = trinityNotificationBridge.getMetrics();

    res.json({
      success: true,
      metrics,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Metrics error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/trinity/notifications/watchdog-status
 * Get watchdog monitoring status for Trinity/AI Brain awareness
 */
trinityNotificationRouter.get('/watchdog-status', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const watchdogStatus = trinityNotificationBridge.getWatchdogStatus();
    const metrics = trinityNotificationBridge.getMetrics();

    res.json({
      success: true,
      watchdog: watchdogStatus,
      metrics: {
        health: metrics.health,
        totalSent: metrics.totalSent,
        totalFailed: metrics.totalFailed,
        queueDepth: metrics.queueDepth,
        averageDeliveryTime: metrics.averageDeliveryTime,
      },
      message: watchdogStatus.systemHealth === 'healthy' 
        ? 'Notification system operating normally' 
        : `Notification system ${watchdogStatus.systemHealth} - Trinity monitoring active`,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Watchdog status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/trinity/notifications/batch-send
 * Send multiple notifications in batch (queued for intelligent delivery)
 */
trinityNotificationRouter.post('/batch-send', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { notifications: notificationList } = req.body;
    
    if (!notificationList || !Array.isArray(notificationList)) {
      return res.status(400).json({ 
        error: 'notifications array is required' 
      });
    }

    const results = [];
    for (const notification of notificationList) {
      const result = await trinityNotificationBridge.sendNotification({
        source: 'support',
        priority: 'batch',
        channels: ['websocket', 'in_app'],
        title: notification.title,
        message: notification.message,
        category: notification.category || 'announcement',
        targetAudience: notification.targetAudience,
        metadata: notification.metadata,
      });
      results.push(result);
    }

    res.json({
      success: true,
      message: `${notificationList.length} notifications queued for batch delivery`,
      results,
    });
  } catch (error: any) {
    console.error('[TrinityNotificationRoutes] Batch send error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default trinityNotificationRouter;
