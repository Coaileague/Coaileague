import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { db } from '../db';
import { eq, and, isNull } from 'drizzle-orm';
import { storage } from '../storage';
import { aiNotificationService } from '../services/aiNotificationService';
import {
  chatMessages,
  editChatMessageSchema,
  internalEmailRecipients,
  internalMailboxes,
  updateNotificationPreferencesSchema
} from '@shared/schema';
import { broadcastToWorkspace } from '../websocket';
import { gapIntelligenceService } from '../services/ai-brain/gapIntelligenceService';
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
const log = createLogger('Notifications');


// Helper function to broadcast notification updates via WebSocket
function broadcastNotification(
  workspaceId: string,
  userId: string,
  updateType: string,
  notification?: any,
  unreadCount?: number
) {
  try {
    broadcastToWorkspace(workspaceId, {
      type: updateType,
      userId,
      notification,
      unreadCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.warn('[Notifications] Failed to broadcast notification update:', err);
  }
}

// Middleware - will be applied when mounting
// @ts-expect-error — TS migration: fix in refactoring sprint
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    workspaceId?: string;
    currentWorkspaceId?: string;
    [key: string]: any;
  };
  userId?: string;
  workspaceId?: string;
  session?: any;
  query?: any;
}

const router = Router();

// Zod schemas for phone number validation
const phoneNumberSchema = z.object({
  phoneNumber: z
    .string()
    .min(1, 'Phone number is required')
    .regex(
      /^\+\d{10,15}$/,
      'Phone number must be in E.164 format (e.g., +12025551234): starts with + followed by 10-15 digits'
    ),
});

type PhoneNumberRequest = z.infer<typeof phoneNumberSchema>;

// Helper functions
async function getUserPlatformRole(userId: string): Promise<string | null> {
  const { getUserPlatformRole: getPlatformRole } = await import('../rbac');
  return getPlatformRole(userId);
}

function hasPlatformWideAccess(role: string | null): boolean {
  if (!role) return false;
  return ['root_admin', 'co_admin', 'sysops', 'support_agent', 'bot_user'].includes(role);
}

router.get('/api/notifications/combined', requireAuth, async (req, res) => {
    // Prevent caching to ensure fresh data after mutations
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    try {
      const authReq = req as AuthenticatedRequest;
      // SECURITY: Only use authenticated user ID from requireAuth middleware
      const userId = authReq.user?.id;
      
      // SECURITY: requireAuth ensures we always have userId
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      // Get user's workspace and platform role in parallel
      const [workspace, member, platformRole] = await Promise.all([
        storage.getWorkspaceByOwnerId(userId),
        storage.getWorkspaceMemberByUserId(userId),
        getUserPlatformRole(userId),
      ]);
      let workspaceId = workspace?.id || member?.workspaceId;
      
      // Platform-wide users (support agents, bots, etc.) get access to system notifications
      // even without a workspace - use the platform workspace
      if (!workspaceId && hasPlatformWideAccess(platformRole)) {
        workspaceId = PLATFORM_WORKSPACE_ID;
      }

       
      if (!workspaceId) {
        return res.json({
          platformUpdates: [],
          maintenanceAlerts: [],
          notifications: [],
          unreadPlatformUpdates: 0,
          unreadNotifications: 0,
          unreadAlerts: 0,
          totalUnread: 0,
        });
      }
      
      
      // Fetch all notification data in parallel for performance
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;

      const [
        platformUpdatesDataRaw,
        trueUnreadPlatformUpdates,
        allNotifications,
        maintenanceAlerts,
      ] = await Promise.all([
        storage.getPlatformUpdatesWithReadState(userId, workspaceId, 50),
        storage.getUnreadPlatformUpdatesCount(userId, workspaceId),
        storage.getAllNotificationsForUser(userId, workspaceId, 500),
        aiNotificationService.getActiveMaintenanceAlerts(workspaceId, userId),
      ]);
      
      // Filter out cleared notifications AND platform_update type notifications.
      // platform_update notifications duplicate the platform_updates entries already
      // returned separately - showing both causes users to see the same update twice.
      const notifications = allNotifications.filter((n: any) => !n.clearedAt && n.type !== 'platform_update');
      const trueUnreadNotifications = notifications.filter((n: any) => !n.isRead).length;
      
      // Filter out viewed/cleared platform updates - once user clicks "Clear All",
      // platform updates marked as viewed should not reappear
      const platformUpdatesData = platformUpdatesDataRaw.filter((u: any) => !u.isViewed);
      
      // Filter out acknowledged maintenance alerts
      const unreadAlerts = maintenanceAlerts.filter((a: any) => !a.isAcknowledged).length;
      const activeMaintenanceAlerts = maintenanceAlerts.filter((a: any) => !a.isAcknowledged);
      
      // Get gap intelligence findings for PLATFORM SUPPORT ROLES ONLY
      // SECURITY: Explicitly deny gap findings to workspace/org roles
      let gapFindings: any[] = [];
      
      // Check if user has a workspace role - if so, they are NOT platform support
      const userHasWorkspaceRole = !!(workspace || member);
      
      // Only show gap findings if:
      // 1. User has a valid platform-wide access role
      // 2. User does NOT have a workspace role (org_owner, co_owner, etc.)
      // This prevents role leakage where workspace owners incorrectly see platform diagnostics
      const isPlatformSupportOnly = hasPlatformWideAccess(platformRole) && !userHasWorkspaceRole;
      
      if (isPlatformSupportOnly) {
        try {
          gapFindings = await gapIntelligenceService.getGapFindingsForUNS(15);
          log.info(`[Notifications] Gap findings provided to platform role: ${platformRole}`);
        } catch (err) {
          log.error('[Notifications] Failed to fetch gap findings:', err);
        }
      } else if (hasPlatformWideAccess(platformRole) && userHasWorkspaceRole) {
        // Log when platform support is also in a workspace - they don't see gap findings in that context
        log.info(`[Notifications] Platform role ${platformRole} in workspace context - gap findings hidden`);
      }
      
      const totalNotifications = notifications.length;
      const paginatedNotifications = notifications.slice(offset, offset + limit);
      const totalPages = Math.ceil(totalNotifications / limit);

      res.set('X-Total-Count', String(totalNotifications));
      res.json({
        platformUpdates: platformUpdatesData,
        maintenanceAlerts: activeMaintenanceAlerts,
        notifications: paginatedNotifications,
        gapFindings,
        unreadPlatformUpdates: platformUpdatesData.length,
        unreadNotifications: trueUnreadNotifications,
        unreadAlerts,
        unreadGapFindings: 0,
        totalUnread: platformUpdatesData.length + trueUnreadNotifications + unreadAlerts,
        pagination: { page, limit, total: totalNotifications, totalPages },
      });
    } catch (error) {
      log.error('[Notifications] Combined endpoint error:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/mark-all-read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      
      // User must be authenticated
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      // Get user's workspace
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      if (!workspaceId) {
        return res.json({ 
          success: true, 
          markedRead: { platformUpdates: 0, notifications: 0, alerts: 0 } 
        });
      }
      
      // Mark all notifications as read - still visible, just no longer "new"
      const notificationsMarked = await storage.markAllNotificationsAsRead(userId, workspaceId);
      
      // WebSocket broadcast - only notification counts change, platform updates/alerts untouched
      broadcastNotification(workspaceId, userId, 'all_notifications_read', { 
        markedRead: { notifications: notificationsMarked },
      }, 0);

      log.info("[Mark All Read] User " + userId + " marked " + notificationsMarked + " notifications as read");
      
      res.json({ 
        success: true, 
        notificationsMarked,
      });
    } catch (error) {
      log.error('Error marking all notifications as read:', error);
      res.status(500).json({ message: 'Failed to mark notifications as read' });
    }
  });

  // Batch mark-read endpoint for mobile notification hub
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/mark-read-batch', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userId = req.user.id;
      const { ids } = req.body as { ids: string[] };
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: 'Missing or invalid notification IDs' });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      if (!workspaceId) {
        return res.json({ success: true, markedRead: 0 });
      }
      
      let markedCount = 0;
      for (const id of ids) {
        try {
          await storage.markNotificationAsRead(id, userId);
          markedCount++;
        } catch (err) {
          log.error(`[Notifications] Failed to mark notification ${id} as read:`, err);
        }
      }
      
      // Recalculate unread counts after batch operation
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const unreadNotifications = await storage.getUnreadNotificationCount(workspaceId);
      
      broadcastNotification(workspaceId, userId, 'notification_count_updated', {
        type: 'batch_mark_read',
        count: markedCount,
        unreadCount: unreadNotifications,
      }, unreadNotifications);
      
      res.json({ success: true, markedRead: markedCount, unreadCount: unreadNotifications });
    } catch (error) {
      log.error('[Notifications] Batch mark-read error:', error);
      res.status(500).json({ message: 'Failed to mark notifications as read' });
    }
  });

  // Alias route for acknowledge-all (frontend uses this endpoint)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/acknowledge-all', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userId = req.user.id;
      
      // Get user's workspace
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      if (!workspaceId) {
        return res.json({ 
          success: true, 
          acknowledged: 0,
          platformUpdatesMarked: 0,
          alertsAcknowledged: 0
        });
      }
      
      // Mark all notifications as read - still visible, just no longer "new"
      const notificationsMarked = await storage.markAllNotificationsAsRead(userId, workspaceId);
      
      // WebSocket broadcast - only notification counts change
      broadcastNotification(workspaceId, userId, 'all_notifications_read', { 
        markedRead: { notifications: notificationsMarked },
      }, 0);

      log.info("[Acknowledge All] User " + userId + " marked " + notificationsMarked + " notifications as read");
      
      res.json({ 
        success: true, 
        notificationsMarked,
      });
    } catch (error) {
      log.error('Error in acknowledge-all:', error);
      res.status(500).json({ message: 'Failed to acknowledge notifications' });
    }
  });


  // Clear all / Delete all - actually removes notifications from user's history
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post("/api/notifications/clear-all", requireAuth, async (req: AuthenticatedRequest, res) => {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    // Resolve workspaceId the same way mark-all-read does — req.workspaceId is never populated
    const workspace = await storage.getWorkspaceByOwnerId(userId);
    const member = await storage.getWorkspaceMemberByUserId(userId);
    const workspaceId = workspace?.id || member?.workspaceId;

    // Each operation runs independently — one failure cannot block the others
    let deletedNotifications = 0;
    let platformUpdatesMarked = 0;
    let alertsAcknowledged = 0;

    try {
      deletedNotifications = await storage.deleteAllNotificationsForUser(userId, workspaceId || undefined);
    } catch (err) {
      log.error("[Clear All] deleteAllNotificationsForUser failed:", err);
    }

    try {
      platformUpdatesMarked = await storage.markAllPlatformUpdatesAsViewed(userId, workspaceId || undefined);
    } catch (err) {
      log.error("[Clear All] markAllPlatformUpdatesAsViewed failed:", err);
    }

    try {
      alertsAcknowledged = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId);
    } catch (err) {
      log.error("[Clear All] acknowledgeAllMaintenanceAlerts failed:", err);
    }

    // Mark all chat messages as read (clears ChatDock unread counts)
    try {
      await storage.markAllChatMessagesRead(userId);
    } catch (err) {
      log.error("[Clear All] markAllChatMessagesRead failed:", err);
    }

    // Mark all internal emails as read (clears Mail badge)
    try {
      const userMailboxes = await db
        .select({ id: internalMailboxes.id })
        .from(internalMailboxes)
        .where(eq(internalMailboxes.userId, userId));
      if (userMailboxes.length > 0) {
        const mailboxIds = userMailboxes.map(m => m.id);
        for (const mailboxId of mailboxIds) {
          await db
            .update(internalEmailRecipients)
            .set({ isRead: true, readAt: new Date() } as any)
            .where(and(
              eq(internalEmailRecipients.mailboxId, mailboxId),
              eq(internalEmailRecipients.isRead, false)
            ));
        }
      }
    } catch (err) {
      log.error("[Clear All] markAllEmailsRead failed:", err);
    }

    // WebSocket broadcast for real-time sync
    if (workspaceId) {
      try {
        broadcastNotification(workspaceId, userId, 'all_notifications_cleared', {}, 0);
        broadcastNotification(workspaceId, userId, 'notification_count_updated', {
          type: 'notification_count_updated',
          counts: { notifications: 0, platformUpdates: 0, alerts: 0, total: 0, lastUpdated: new Date().toISOString() },
          source: 'clear_all'
        }, 0);
      } catch (err) {
        log.warn("[Clear All] WebSocket broadcast failed (non-fatal):", err);
      }
    }

    log.info(`[Clear All] User ${userId} cleared: ${deletedNotifications} notifications, ${platformUpdatesMarked} platform updates, ${alertsAcknowledged} alerts`);
    res.json({
      success: true,
      cleared: { notifications: deletedNotifications, platformUpdates: platformUpdatesMarked, alerts: alertsAcknowledged },
      counts: { notifications: 0, platformUpdates: 0, alerts: 0, total: 0 },
    });
  });


  // Onboarding digest endpoint - Trinity welcome + last 3 What's New + system updates for new users
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get("/api/notifications/onboarding-digest", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { getOnboardingDigest, autoCleanupSystemNotifications } = await import('../services/notificationService');
      
      // Get the onboarding digest with Trinity welcome
      const digest = await getOnboardingDigest(userId);
      
      // Auto-cleanup old notifications (limit to 3 visible)
      await autoCleanupSystemNotifications(userId, 3);
      
      res.json({
        success: true,
        ...digest,
      });
    } catch (error) {
      log.error("Error fetching onboarding digest:", error);
      res.status(500).json({ message: "Failed to fetch onboarding digest" });
    }
  });

  // Send Trinity welcome notification to a user
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post("/api/notifications/trinity-welcome", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id || req.user?.claims?.sub;
      const workspaceId = req.workspaceId || req.user?.defaultWorkspaceId;
      const { userName } = req.body;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { sendTrinityWelcomeNotification } = await import('../services/notificationService');
      
      const notification = await sendTrinityWelcomeNotification(
        workspaceId || PLATFORM_WORKSPACE_ID,
        userId,
        userName
      );

      // Broadcast via WebSocket
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'trinity_welcome', notification);
      }

      res.json({
        success: true,
        notification,
      });
    } catch (error) {
      log.error("Error sending Trinity welcome:", error);
      res.status(500).json({ message: "Failed to send Trinity welcome" });
    }
  });
  // Tab-specific clear endpoint - clears notifications for a specific tab only
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post("/api/notifications/clear-tab/:tab", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const { tab } = req.params;

      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const requestedWs = (req.query?.workspaceId || req.body?.workspaceId) as string | undefined;
      let workspaceId = requestedWs;
      if (!workspaceId) {
        const workspace = await storage.getWorkspaceByOwnerId(userId);
        const member = await storage.getWorkspaceMemberByUserId(userId);
        workspaceId = workspace?.id || member?.workspaceId;
      }

      const validTabs = ['updates', 'notifications', 'maintenance', 'system'];
      if (!validTabs.includes(tab)) {
        return res.status(400).json({ message: "Invalid tab. Must be: updates, notifications, maintenance, or system" });
      }

      let cleared = { platformUpdates: 0, notifications: 0, alerts: 0 };

      if (tab === 'updates') {
        cleared.platformUpdates = await storage.markAllPlatformUpdatesAsViewed(userId);
      } else if (tab === 'notifications') {
        cleared.notifications = await storage.markAllNotificationsAsRead(userId, workspaceId || undefined);
      } else if (tab === 'maintenance' || tab === 'system') {
        // Acknowledge all maintenance alerts (System tab)
        const { aiNotificationService } = await import("../services/aiNotificationService");
        cleared.alerts = await aiNotificationService.acknowledgeAllMaintenanceAlerts(userId);
        
        // Also clear system-category platform updates (diagnostics, errors, security, etc.)
        const { getCategoriesForTab } = await import("@shared/config/notificationConfig");
        const systemCategories = getCategoriesForTab('system');
        cleared.platformUpdates = await storage.deletePlatformUpdatesByCategories(userId, systemCategories, workspaceId);
      }

      // WebSocket broadcast for real-time sync
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'tab_cleared', { 
          tab,
          cleared,
        }, 0);
      }

      log.info(`[Clear Tab] User ${userId} cleared tab '${tab}': ${JSON.stringify(cleared)}`);
      res.json({
        success: true,
        tab,
        cleared,
      });
    } catch (error) {
      log.error("Error in clear-tab:", error);
      res.status(500).json({ message: "Failed to clear tab notifications" });
    }
  });

  // Notification system diagnostics (AI Brain Trinity orchestrated)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get("/api/notifications/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const workspaceId = authReq.workspaceId || authReq.user?.defaultWorkspaceId;

      const { notificationDiagnostics } = await import("../services/ai-brain/notificationDiagnostics");
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const result = await notificationDiagnostics.handleRequest(userId, workspaceId);

      log.info(`[NotificationDiagnostics] Diagnostic run for user ${userId}:`, result.diagnostic.overallHealth);
      res.json(result);
    } catch (error: unknown) {
      log.error("Error running notification diagnostics:", error);
      res.status(500).json({ 
        success: false, 
        error: sanitizeError(error) || "Failed to run diagnostics" 
      });
    }
  });

  // Universal Platform Diagnostics API (AI Brain Trinity orchestrated with Gemini 3)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get("/api/platform/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const platformRole = (authReq.user)?.platformRole || "";
      const domain = req.query.domain as string | undefined;

      // RBAC check - only platform support and above can access
      const allowedRoles = ["support_agent", "sysop", "root_admin"];
      if (!allowedRoles.includes(platformRole)) {
        return res.status(403).json({ success: false, message: "Insufficient permissions for platform diagnostics" });
      }

      const { universalDiagnosticOrchestrator } = await import("../services/ai-brain/universalDiagnosticOrchestrator");
      
      if (domain) {
        const issues = await universalDiagnosticOrchestrator.runDomainDiagnostic(domain as any);
        return res.json({ success: true, domain, issues });
      } else {
        const report = await universalDiagnosticOrchestrator.runFullDiagnostic(userId || "system", platformRole);
        return res.json({ success: true, report });
      }
    } catch (error: unknown) {
      log.error("Error running platform diagnostics:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // Hotpatch execution API with RBAC
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post("/api/platform/hotpatch", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const platformRole = (authReq.user)?.platformRole || "";
      const { hotpatch, approvalCode, secondApprovalCode } = req.body;

      if (!hotpatch) {
        return res.status(400).json({ success: false, message: "Hotpatch object required" });
      }

      const { universalDiagnosticOrchestrator } = await import("../services/ai-brain/universalDiagnosticOrchestrator");
      const execution = await universalDiagnosticOrchestrator.executeHotpatch(
        hotpatch,
        userId || "system",
        platformRole,
        approvalCode,
        secondApprovalCode
      );

      res.json({ success: execution.status === "success", execution });
    } catch (error: unknown) {
      log.error("Error executing hotpatch:", error);
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // Get diagnostic subagents list
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get("/api/platform/diagnostics/subagents", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { DOMAIN_SUBAGENTS } = await import("../services/ai-brain/universalDiagnosticOrchestrator");
      const subagents = DOMAIN_SUBAGENTS.map(s => ({
        domain: s.domain,
        name: s.name,
        description: s.description,
        commonPatterns: s.commonPatterns
      }));
      res.json({ success: true, subagents });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  });

  // Acknowledge a single notification
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post("/api/notifications/acknowledge/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      const notificationId = req.params.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      if (!notificationId) {
        return res.status(400).json({ message: 'Notification ID is required' });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      // Acknowledge the notification
      const notification = await storage.acknowledgeNotification(notificationId, userId);
      
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      
      // Get updated counts
      const counts = await storage.getUnreadAndUnclearedCount(userId, workspaceId);
      const totalCount = counts.unread + counts.uncleared;
      
      // WebSocket broadcast for real-time sync
      if (workspaceId) {
        broadcastNotification(workspaceId, userId, 'notification_acknowledged', { 
          notificationId,
          counts: { notifications: counts.unread, platformUpdates: 0, total: totalCount, lastUpdated: new Date().toISOString() },
          unreadCount: totalCount,
          unclearedCount: counts.uncleared
        }, counts.unread);
        broadcastNotification(workspaceId, userId, 'notification_count_updated', { 
          type: 'notification_count_updated', 
          counts: { notifications: counts.unread, platformUpdates: 0, total: totalCount, lastUpdated: new Date().toISOString() }, 
          source: 'acknowledge_single' 
        }, counts.unread);
      }
      
      log.info("[Acknowledge] User " + userId + " acknowledged notification " + notificationId);
      
      res.json({ 
        success: true, 
        notification,
        counts: { unread: counts.unread, uncleared: counts.uncleared }
      });
    } catch (error) {
      log.error('Error acknowledging notification:', error);
      res.status(500).json({ message: 'Failed to acknowledge notification' });
    }
  });

  // Acknowledge maintenance alert
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/maintenance-alerts/:id/acknowledge', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id: alertId } = req.params;
      
      const success = await aiNotificationService.acknowledgeMaintenanceAlert(alertId, userId);
      
      if (success) {
        res.json({ success: true });
      } else {
        res.status(500).json({ message: 'Failed to acknowledge alert' });
      }
    } catch (error) {
      log.error('Error acknowledging maintenance alert:', error);
      res.status(500).json({ message: 'Failed to acknowledge alert' });
    }
  });


  // ============================================================================
  // UNIFIED NOTIFICATION STATE MANAGEMENT ROUTES
  // ============================================================================

  // Get unified unread counts (notifications + platform updates)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications/unread-counts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          message: 'Unauthorized',
          notifications: 0, 
          platformUpdates: 0, 
          total: 0,
          lastUpdated: new Date().toISOString()
        });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      const notificationCount = workspaceId ? await storage.getUnreadNotificationCount(userId, workspaceId) : 0;
      const platformUpdatesCount = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId || undefined);
      
      res.json({
        notifications: notificationCount,
        platformUpdates: platformUpdatesCount,
        total: notificationCount + platformUpdatesCount,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      log.error('Error getting unread counts:', error);
      res.status(500).json({ message: 'Failed to get unread counts' });
    }
  });

// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications/unread-count', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ 
          count: 0,
          lastUpdated: new Date().toISOString()
        });
      }
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      // Get notification count using storage
      const notificationCount = workspaceId ? await storage.getUnreadNotificationCount(userId, workspaceId) : 0;
      // Get platform updates count using correct storage method
      let platformUpdatesCount = 0;
      if (workspaceId) {
        const platformUpdates = await storage.getPlatformUpdatesWithReadState(userId, workspaceId, 100);
        platformUpdatesCount = platformUpdates?.filter(u => !u.isViewed)?.length || 0;
      }
      const total = notificationCount + platformUpdatesCount;
      
      res.json({ 
        count: total,
        notifications: notificationCount,
        platformUpdates: platformUpdatesCount,
        lastUpdated: new Date().toISOString()
      });
    } catch (error) {
      log.error('Error getting unread count:', error);
      res.status(500).json({ count: 0, message: 'Failed to get unread count' });
    }
  });

  // Mark individual notification as read
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/:id/mark-read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userId = req.user.id;
      const { id: notificationId } = req.params;
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      // Use storage to mark notification as read
      const notification = await storage.markNotificationAsRead(notificationId, userId);
      
      if (notification) {
        // Get updated counts
        const notificationCount = workspaceId ? await storage.getUnreadNotificationCount(userId, workspaceId) : 0;
        const platformUpdatesCount = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId || undefined);
        
        res.json({ 
          success: true, 
          counts: {
            notifications: notificationCount,
            platformUpdates: platformUpdatesCount,
            total: notificationCount + platformUpdatesCount
          }
        });
      } else {
        res.status(500).json({ message: 'Failed to mark notification as read' });
      }
    } catch (error) {
      log.error('Error marking notification as read:', error);
      res.status(500).json({ message: 'Failed to mark notification as read' });
    }
  });

  // Mark platform update as viewed
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/platform-updates/:id/mark-viewed', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userId = req.user.id;
      const { id: updateId } = req.params;
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      
      await storage.markPlatformUpdateAsViewed(userId, updateId);
      
      const notificationCount = workspaceId ? await storage.getUnreadNotificationCount(userId, workspaceId) : 0;
      const platformUpdatesCount = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId || undefined);
      
      res.json({ 
        success: true, 
        counts: {
          notifications: notificationCount,
          platformUpdates: platformUpdatesCount,
          total: notificationCount + platformUpdatesCount
        }
      });
    } catch (error) {
      log.error('Error marking platform update as viewed:', error);
      res.status(500).json({ message: 'Failed to mark update as viewed' });
    }
  });

  // Sync notification counts (force refresh from database)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/sync-counts', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      const userId = req.user.id;
      
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = await storage.getWorkspaceMemberByUserId(userId);
      const workspaceId = workspace?.id || member?.workspaceId;
      const workspaceRole = req.workspaceRole || 'staff';
      
      const notificationCount = workspaceId ? await storage.getUnreadNotificationCount(userId, workspaceId) : 0;
      const platformUpdatesCount = await storage.getUnreadPlatformUpdatesCount(userId, workspaceId || undefined);
      
      res.json({ 
        success: true, 
        counts: {
          notifications: notificationCount,
          platformUpdates: platformUpdatesCount,
          total: notificationCount + platformUpdatesCount
        }
      });
    } catch (error) {
      log.error('Error syncing notification counts:', error);
      res.status(500).json({ message: 'Failed to sync counts' });
    }
  });

  // Get user notifications
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
      const offset = (page - 1) * limit;
      const hasPagination = req.query.page !== undefined || req.query.limit !== undefined;
      
      let workspaceId: string;
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      if (!workspace) {
        const member = await storage.getWorkspaceMemberByUserId(userId);
        if (!member) {
          return res.status(404).json({ message: 'Workspace not found' });
        }
        workspaceId = member.workspaceId;
      } else {
        workspaceId = workspace.id;
      }

      const allNotifications = await storage.getNotificationsByUser(userId, workspaceId);

      const total = allNotifications.length;
      res.set('X-Total-Count', String(total));

      if (!hasPagination) {
        return res.json(allNotifications);
      }

      res.json({
        data: allNotifications.slice(offset, offset + limit),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (error) {
      log.error('Error fetching notifications:', error);
      res.status(500).json({ message: 'Failed to fetch notifications' });
    }
  });

  // Toggle notification read status (mark as read/unread)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.patch('/api/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      
      // Toggle notification read status
      const notification = await storage.toggleNotificationReadStatus(id, userId);
      
      if (!notification) {
        return res.status(404).json({ message: 'Notification not found' });
      }
      
      // Broadcast updated unread count
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      if (workspace) {
        const unreadCount = await storage.getUnreadNotificationCount(userId, workspace.id);
        broadcastNotification(workspace.id, userId, 'notification_count_updated', undefined, unreadCount);
      } else {
        const member = await storage.getWorkspaceMemberByUserId(userId);
        if (member) {
          const unreadCount = await storage.getUnreadNotificationCount(userId, member.workspaceId);
          broadcastNotification(member.workspaceId, userId, 'notification_count_updated', undefined, unreadCount);
        }
      }
      res.json({ success: true, notification });
    } catch (error) {
      log.error('Error toggling notification read status:', error);
      res.status(500).json({ message: 'Failed to toggle notification read status' });
    }
  });

  // Delete notification
// @ts-expect-error — TS migration: fix in refactoring sprint
router.delete('/api/notifications/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      
      // Try to delete from notifications table first
      let deleted = await storage.deleteNotification(id, userId);
      
      // If not found in notifications, try platformUpdates table
      if (!deleted) {
        deleted = await storage.deletePlatformUpdate(id);
      }
      
      if (!deleted) {
        return res.status(404).json({ message: 'Notification not found or unauthorized' });
      }
      
      // Broadcast updated unread count
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      if (workspace) {
        const unreadCount = await storage.getUnreadNotificationCount(userId, workspace.id);
        broadcastNotification(workspace.id, userId, 'notification_count_updated', undefined, unreadCount);
      } else {
        const member = await storage.getWorkspaceMemberByUserId(userId);
        if (member) {
          const unreadCount = await storage.getUnreadNotificationCount(userId, member.workspaceId);
          broadcastNotification(member.workspaceId, userId, 'notification_count_updated', undefined, unreadCount);
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      log.error('Error deleting notification:', error);
      res.status(500).json({ message: 'Failed to delete notification' });
    }
  });

  // ============================================================================

  // Notification action endpoint - handle workflow approvals, shift invites, etc.
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/:id/action', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      
      const { id } = req.params;
      const { action, data } = req.body;
      
      if (!action) {
        return res.status(400).json({ message: 'Action is required' });
      }
      
      let actionResult: any = { success: true };
      
      switch (action) {
        case 'approve':
        case 'accept_shift':
        case 'accept_shift_invite':
        case 'accept_swap':
        case 'accept':
          // Mark the notification as read and acknowledged
          await storage.markNotificationAsRead(id, userId);
          await storage.acknowledgeNotification(id, userId);
          actionResult = { success: true, message: 'Approved successfully' };
          break;
          
        case 'deny':
        case 'decline':
        case 'decline_shift':
        case 'decline_swap':
        case 'reject':
          // Mark as read and clear
          await storage.markNotificationAsRead(id, userId);
          await storage.clearNotification(id, userId);
          actionResult = { success: true, message: 'Request denied' };
          break;
          
        case 'dismiss':
        case 'acknowledge':
          // Just mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: 'Notification dismissed' };
          break;
          
        case 'run_hotpatch':
        case 'trinity_fix':
        case 'apply_fix':
          await storage.markNotificationAsRead(id, userId);
          await storage.acknowledgeNotification(id, userId);
          actionResult = { success: true, message: 'Fix applied' };
          break;

        case 'view_details':
        case 'view':
          // Mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true };
          break;
        
        case 'sign':
        case 'sign_document':
          // Document signing - mark notification as acknowledged and provide redirect
          await storage.markNotificationAsRead(id, userId);
          await storage.acknowledgeNotification(id, userId);
          actionResult = { success: true, message: 'Document signing initiated', redirect: data?.documentUrl };
          break;
        
        case 'upload':
        case 'upload_document':
          // Document upload request - mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: 'Upload ready' };
          break;
        
        case 'continue':
        case 'continue_workflow':
        case 'resume':
          // Workflow continuation - mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: 'Workflow continued' };
          break;
        
        case 'start':
        case 'start_onboarding':
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: 'Onboarding started' };
          break;
        
        case 'pay':
        case 'make_payment':
          await storage.markNotificationAsRead(id, userId);
          await storage.acknowledgeNotification(id, userId);
          actionResult = { success: true, message: 'Payment processed' };
          break;
          
        default:
          // Generic action - just mark as read
          await storage.markNotificationAsRead(id, userId);
          actionResult = { success: true, message: `Action '${action}' processed` };
      }
      
      // Broadcast updated count
      const workspace = await storage.getWorkspaceByOwnerId(userId);
      const member = !workspace ? await storage.getWorkspaceMemberByUserId(userId) : null;
      const workspaceId = workspace?.id || member?.workspaceId;
      if (workspaceId) {
        const unreadCount = await storage.getUnreadNotificationCount(userId, workspaceId);
        broadcastNotification(workspaceId, userId, 'notification_count_updated', undefined, unreadCount);
      }
      
      res.json(actionResult);
    } catch (error) {
      log.error('Error processing notification action:', error);
      res.status(500).json({ message: 'Failed to process action' });
    }
  });
  // CHAT MESSAGE MANAGEMENT ENDPOINTS
  // ============================================================================

  // Edit chat message
// @ts-expect-error — TS migration: fix in refactoring sprint
router.patch('/api/chat/message/:id/edit', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      const { conversationId, message } = req.body;

      // Validate request body
      const validation = editChatMessageSchema.safeParse({ message });
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid message content', errors: validation.error.errors });
      }

      // Get the message to verify ownership
      const [chatMessage] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);

      if (!chatMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Verify user is the sender
      if (chatMessage.senderId !== userId) {
        return res.status(403).json({ message: 'Not authorized to edit this message' });
      }

      // Verify conversation ID matches
      if (chatMessage.conversationId !== conversationId) {
        return res.status(400).json({ message: 'Invalid conversation ID' });
      }

      // Update the message
      const updatedMessage = await storage.updateChatMessage(id, conversationId, { message: validation.data.message });

      if (!updatedMessage) {
        return res.status(404).json({ message: 'Failed to update message' });
      }

      res.json(updatedMessage);
    } catch (error) {
      log.error('Error editing chat message:', error);
      res.status(500).json({ message: 'Failed to edit message' });
    }
  });

  // Delete chat message
// @ts-expect-error — TS migration: fix in refactoring sprint
router.delete('/api/chat/message/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const { id } = req.params;
      const { conversationId } = req.body;

      if (!conversationId) {
        return res.status(400).json({ message: 'Conversation ID is required' });
      }

      // Get the message to verify ownership
      const [chatMessage] = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.id, id))
        .limit(1);

      if (!chatMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }

      // Verify user is the sender
      if (chatMessage.senderId !== userId) {
        return res.status(403).json({ message: 'Not authorized to delete this message' });
      }

      // Verify conversation ID matches
      if (chatMessage.conversationId !== conversationId) {
        return res.status(400).json({ message: 'Invalid conversation ID' });
      }

      // Delete the message
      const deleted = await storage.deleteChatMessage(id, conversationId);

      if (!deleted) {
        return res.status(404).json({ message: 'Failed to delete message' });
      }
      res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
      log.error('Error deleting chat message:', error);
      res.status(500).json({ message: 'Failed to delete message' });
    }
  });

  // ============================================================================
  // NOTIFICATION PREFERENCES ENDPOINTS
  // ============================================================================

  // Get notification preferences
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      const preferences = await storage.getNotificationPreferences(userId, workspaceId);

      res.json(preferences || { userId, workspaceId, digestFrequency: 'realtime' });
    } catch (error) {
      log.error('Error fetching notification preferences:', error);
      res.status(500).json({ message: 'Failed to fetch notification preferences' });
    }
  });

  // Update notification preferences
// @ts-expect-error — TS migration: fix in refactoring sprint
router.patch('/api/notifications/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      // Validate request body
      const validation = updateNotificationPreferencesSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ message: 'Invalid preference data', errors: validation.error.errors });
      }

      // Validate quiet hours logic
      if (validation.data.quietHoursStart !== undefined && validation.data.quietHoursEnd !== undefined) {
        if (validation.data.quietHoursStart !== null && validation.data.quietHoursEnd !== null && 
            validation.data.quietHoursStart >= validation.data.quietHoursEnd) {
          return res.status(400).json({ message: 'Quiet hours end must be after start' });
        }
      }

      // Update preferences
      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, validation.data);

      res.json(preferences);
    } catch (error) {
      log.error('Error updating notification preferences:', error);
      res.status(500).json({ message: 'Failed to update notification preferences' });
    }
  });

  // Subscribe to notification type
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/subscribe', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      const {  notificationType  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!notificationType || typeof notificationType !== 'string') {
        return res.status(400).json({ message: 'Notification type is required' });
      }

      // Get current preferences
      const currentPrefs = await storage.getNotificationPreferences(userId, workspaceId);
      const enabledTypes = currentPrefs?.enabledTypes || [];

      // Add notification type if not already present
      if (!enabledTypes.includes(notificationType)) {
        enabledTypes.push(notificationType);
      }

      // Update preferences
      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, {
        enabledTypes,
      });
      res.json({ success: true, preferences });
    } catch (error) {
      log.error('Error subscribing to notification type:', error);
      res.status(500).json({ message: 'Failed to subscribe to notification type' });
    }
  });

  // Unsubscribe from notification type
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/unsubscribe', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      const {  notificationType  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!notificationType || typeof notificationType !== 'string') {
        return res.status(400).json({ message: 'Notification type is required' });
      }

      // Get current preferences
      const currentPrefs = await storage.getNotificationPreferences(userId, workspaceId);
      const enabledTypes = currentPrefs?.enabledTypes || [];

      // Remove notification type
      const updatedTypes = enabledTypes.filter((type: string) => type !== notificationType);

      // Update preferences
      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, {
        enabledTypes: updatedTypes,
      });
      res.json({ success: true, preferences });
    } catch (error) {
      log.error('Error unsubscribing from notification type:', error);
      res.status(500).json({ message: 'Failed to unsubscribe from notification type' });
    }
  });

  // ============================================================================

  // ============================================================================
  // SMS & SHIFT REMINDER CONFIGURATION - Phase 2D
  // ============================================================================

  // Get SMS configuration status
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications/sms-status', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { isSMSConfigured } = await import('../services/smsService');
      
      res.json({
        configured: isSMSConfigured(),
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ? '***configured***' : null,
        twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER ? process.env.TWILIO_PHONE_NUMBER : null,
      });
    } catch (error) {
      log.error('Error checking SMS status:', error);
      res.status(500).json({ message: 'Failed to check SMS status' });
    }
  });

  // Get shift reminder timing options
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications/reminder-options', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { getReminderTimingOptions } = await import('../services/shiftRemindersService');
      
      res.json({
        timingOptions: getReminderTimingOptions(),
        channels: [
          { value: 'push', label: 'In-App Notifications' },
          { value: 'email', label: 'Email' },
          { value: 'sms', label: 'SMS Text Message' },
        ],
      });
    } catch (error) {
      log.error('Error getting reminder options:', error);
      res.status(500).json({ message: 'Failed to get reminder options' });
    }
  });

  // Send test SMS to user
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/test-sms', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      // Validate request body using Zod schema
      const validationResult = phoneNumberSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Validation error',
          errors: validationResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const { phoneNumber } = validationResult.data;

      const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
      const { isSMSConfigured } = await import('../services/smsService');
      
      if (!isSMSConfigured()) {
        return res.status(400).json({ message: 'SMS is not configured. Please add Twilio credentials.' });
      }

      const id = await NotificationDeliveryService.send({
        idempotencyKey: `notif-${Date.now()}`,
            type: 'system_alert',
        workspaceId,
        recipientUserId: userId || 'system',
        channel: 'sms',
        body: {
          phone: phoneNumber,
          body: `${PLATFORM.name}: This is a test message to verify your SMS settings are working correctly.`,
        }
      });

      if (!id.startsWith('skipped')) {
        res.json({ success: true, messageId: id, message: 'Test SMS sent successfully via NDS' });
      } else {
        res.status(400).json({ success: false, error: id });
      }
    } catch (error) {
      log.error('Error sending test SMS:', error);
      res.status(500).json({ message: 'Failed to send test SMS' });
    }
  });

  // Verify SMS phone number
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/verify-phone', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const authReq = req as AuthenticatedRequest;
      const userId = authReq.user?.id;
      
      // For unauthenticated users, return success (frontend handles localStorage)
      if (!userId) {
        return res.status(401).json({ message: 'Unauthorized' });
      }
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      // Validate request body using Zod schema
      const validationResult = phoneNumberSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          message: 'Validation error',
          errors: validationResult.error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const { phoneNumber } = validationResult.data;

      const preferences = await storage.createOrUpdateNotificationPreferences(userId, workspaceId, {
        smsPhoneNumber: phoneNumber,
        smsVerified: true,
      });
      res.json({ success: true, preferences });
    } catch (error) {
      log.error('Error verifying phone:', error);
      res.status(500).json({ message: 'Failed to verify phone number' });
    }
  });

  // Trigger manual shift reminder (for testing)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/send-shift-reminder', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
      const {  shiftId  } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ message: 'No active workspace' });
      }

      if (!shiftId || typeof shiftId !== 'string') {
        return res.status(400).json({ message: 'Shift ID is required' });
      }

      const { sendShiftReminder } = await import('../services/shiftRemindersService');
      const result = await sendShiftReminder(shiftId, workspaceId);

      if (result) {
        res.json({ success: true, result });
      } else {
        res.status(404).json({ message: 'Shift not found or no employee assigned' });
      }
    } catch (error) {
      log.error('Error sending shift reminder:', error);
      res.status(500).json({ message: 'Failed to send shift reminder' });
    }
  });

// ============================================================================
// PHASE 8 — NOTIFICATION DELIVERY LOG + ACK ENDPOINTS
// ============================================================================

// GET /api/notifications/log — delivery log for current workspace
// @ts-expect-error — TS migration: fix in refactoring sprint
router.get('/api/notifications/log', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'No active workspace' });

    const { notificationDeliveries } = await import('@shared/schema');
    const { eq, desc, and } = await import('drizzle-orm');
    const { db } = await import('../db');

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;

    const conditions = [eq(notificationDeliveries.workspaceId, workspaceId)];
    if (req.query.status) {
      conditions.push(eq(notificationDeliveries.status, String(req.query.status)));
    }
    if (req.query.channel) {
      conditions.push(eq(notificationDeliveries.channel, String(req.query.channel)));
    }
    if (req.query.type) {
      conditions.push(eq(notificationDeliveries.notificationType, String(req.query.type)));
    }

    const rows = await db
      .select()
      .from(notificationDeliveries)
      .where(and(...conditions))
      .orderBy(desc(notificationDeliveries.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ data: rows, page, limit });
  } catch (error) {
    log.error('Error fetching notification delivery log:', error);
    res.status(500).json({ message: 'Failed to fetch notification delivery log' });
  }
});

// POST /api/notifications/ack/:id — mark WebSocket notification as delivered
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/ack/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    await NotificationDeliveryService.acknowledge(req.params.id);
    res.json({ success: true });
  } catch (error) {
    log.error('Error acknowledging notification:', error);
    res.status(500).json({ message: 'Failed to acknowledge notification' });
  }
});

// POST /api/notifications/send (Phase 8 test/manual send endpoint)
// @ts-expect-error — TS migration: fix in refactoring sprint
router.post('/api/notifications/send', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'No active workspace' });

    const { type, recipientUserId, channel, subject, body, idempotencyKey } = req.body;
    if (!type || !recipientUserId || !channel || !body) {
      return res.status(400).json({ message: 'type, recipientUserId, channel, and body are required' });
    }

    const { NotificationDeliveryService } = await import('../services/notificationDeliveryService');
    const id = await NotificationDeliveryService.send({
      type, workspaceId, recipientUserId, channel, subject, body,
      idempotencyKey,
    });

    res.json({ success: true, notificationId: id });
  } catch (error) {
    log.error('Error sending notification:', error);
    res.status(500).json({ message: 'Failed to send notification' });
  }
});

export default router;
