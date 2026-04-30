import { z } from 'zod';
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('CommInlineRoutes');


const router = Router();

router.get("/alerts/config", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { alertService } = await import("../services/alertService");
    
    let configs = await alertService.getAlertConfigurations(workspaceId);
    
    if (configs.length === 0) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      configs = await alertService.initializeDefaultConfigs(workspaceId, req.user!);
    }
    res.json({ success: true, data: configs });
  } catch (error: unknown) {
    log.error("Error fetching alert configs:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to fetch alert configurations" });
  }
});

router.get("/alerts/config/:alertType", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { alertType } = req.params;
    const { alertService } = await import("../services/alertService");
    
    const config = await alertService.getAlertConfiguration(workspaceId, alertType);
    
    if (!config) {
      return res.status(404).json({ error: "Alert configuration not found" });
    }
    res.json({ success: true, data: config });
  } catch (error: unknown) {
    log.error("Error fetching alert config:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to fetch alert configuration" });
  }
});

router.put("/alerts/config/:alertType", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to update alert configuration" });
    }
    const workspaceId = req.workspaceId!;
    const { alertType } = req.params;
    const { alertService } = await import("../services/alertService");
    
    const validAlertTypes = ['overtime', 'low_coverage', 'compliance_violation', 'payment_overdue', 
                             'shift_unfilled', 'clock_anomaly', 'budget_exceeded', 'approval_pending'];
    
    if (!validAlertTypes.includes(alertType)) {
      return res.status(400).json({ error: "Invalid alert type" });
    }
    
    const config = await alertService.upsertAlertConfiguration(
      workspaceId,
      // Tier-2 Zod guard: passthrough strip avoids prototype pollution
      { ...req.body, alertType },
      // @ts-expect-error — TS migration: fix in refactoring sprint
      req.user!
    );
    res.json({ success: true, data: config });
  } catch (error: unknown) {
    log.error("Error updating alert config:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to update alert configuration" });
  }
});

router.patch("/alerts/config/:alertType/toggle", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required to toggle alert configuration" });
    }
    const workspaceId = req.workspaceId!;
    const { alertType } = req.params;
    const { isEnabled } = req.body;
    const { alertService } = await import("../services/alertService");
    
    if (typeof isEnabled !== 'boolean') {
      return res.status(400).json({ error: "isEnabled must be a boolean" });
    }
    
    const config = await alertService.upsertAlertConfiguration(
      workspaceId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      { alertType, isEnabled },
      req.user!
    );
    res.json({ success: true, data: config });
  } catch (error: unknown) {
    log.error("Error toggling alert:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to toggle alert" });
  }
});

router.get("/alerts/history", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { alertType, severity, acknowledged, resolved, limit = '50', offset = '0' } = req.query;
    const { alertService } = await import("../services/alertService");
    
    const alerts = await alertService.getAlertHistory(workspaceId, {
      alertType: alertType as string | undefined,
      severity: severity as string | undefined,
      acknowledged: acknowledged === 'true' ? true : acknowledged === 'false' ? false : undefined,
      resolved: resolved === 'true' ? true : resolved === 'false' ? false : undefined,
      limit: Math.min(parseInt(limit as string) || 50, 100),
      offset: parseInt(offset as string) || 0,
    });
    res.json({ success: true, data: alerts });
  } catch (error: unknown) {
    log.error("Error fetching alert history:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to fetch alert history" });
  }
});

router.get("/alerts/history/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { alertService } = await import("../services/alertService");
    
    const alert = await alertService.getAlert(id);
    
    if (!alert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    
    if (alert.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: "Access denied" });
    }
    res.json({ success: true, data: alert });
  } catch (error: unknown) {
    log.error("Error fetching alert:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to fetch alert" });
  }
});

router.post("/alerts/:id/acknowledge", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { alertService } = await import("../services/alertService");
    
    const existingAlert = await alertService.getAlert(id);
    if (!existingAlert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    if (existingAlert.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const alert = await alertService.acknowledgeAlert(id, req.user!, notes);
    res.json({ success: true, data: alert });
  } catch (error: unknown) {
    log.error("Error acknowledging alert:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to acknowledge alert" });
  }
});

router.post("/alerts/:id/resolve", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const { alertService } = await import("../services/alertService");
    
    const existingAlert = await alertService.getAlert(id);
    if (!existingAlert) {
      return res.status(404).json({ error: "Alert not found" });
    }
    if (existingAlert.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const alert = await alertService.resolveAlert(id, req.user!, notes);
    res.json({ success: true, data: alert });
  } catch (error: unknown) {
    log.error("Error resolving alert:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to resolve alert" });
  }
});

router.get("/alerts/unacknowledged-count", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { alertService } = await import("../services/alertService");
    
    const count = await alertService.getUnacknowledgedCount(workspaceId);
    res.json({ success: true, data: { count } });
  } catch (error: unknown) {
    log.error("Error fetching unacknowledged count:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to fetch count" });
  }
});

router.post("/alerts/test", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { alertType } = req.body;
    const { alertService } = await import("../services/alertService");
    
    const validAlertTypes = ['overtime', 'low_coverage', 'compliance_violation', 'payment_overdue', 
                             'shift_unfilled', 'clock_anomaly', 'budget_exceeded', 'approval_pending'];
    
    if (!alertType || !validAlertTypes.includes(alertType)) {
      return res.status(400).json({ error: "Invalid or missing alert type" });
    }
    
    const alert = await alertService.triggerAlert({
      workspaceId,
      alertType,
      title: `Test Alert: ${alertType.replace(/_/g, ' ').toUpperCase()}`,
      message: `This is a test alert for the ${alertType.replace(/_/g, ' ')} alert type.`,
      severity: 'low',
      triggerData: { isTest: true, triggeredBy: req.user },
      deduplicationKey: `test:${alertType}:${Date.now()}`,
    });
    
    if (!alert) {
      return res.status(400).json({ error: "Alert was not triggered - check if this alert type is enabled" });
    }
    res.json({ success: true, data: alert, message: "Test alert triggered successfully" });
  } catch (error: unknown) {
    log.error("Error triggering test alert:", error);
    res.status(500).json({ error: sanitizeError(error) || "Failed to trigger test alert" });
  }
});

router.get("/push/vapid-public-key", async (_req, res) => {
  try {
    const { pushNotificationService } = await import("../services/pushNotificationService");
    const publicKey = await pushNotificationService.getVapidPublicKey();
    res.json({ success: true, publicKey });
  } catch (error: unknown) {
    log.error("Error getting VAPID key:", error);
    res.status(500).json({ success: false, error: "Failed to get VAPID key" });
  }
});

router.post("/push/subscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { subscription, deviceInfo } = req.body;
    
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return res.status(400).json({ success: false, error: "Invalid subscription data" });
    }
    
    const { pushNotificationService } = await import("../services/pushNotificationService");
    const result = await pushNotificationService.registerPushSubscription(
      req.user!.id,
      subscription,
      deviceInfo
    );
    
    if (result.success) {
      res.json({ success: true, subscriptionId: result.subscriptionId });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: unknown) {
    log.error("Error subscribing to push:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to subscribe" });
  }
});

router.delete("/push/unsubscribe", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { endpoint } = req.body;
    
    const { pushNotificationService } = await import("../services/pushNotificationService");
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await pushNotificationService.unregisterPushSubscription(req.user!, endpoint);
    
    res.json({ success: true, unsubscribed: result.unsubscribed });
  } catch (error: unknown) {
    log.error("Error unsubscribing from push:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to unsubscribe" });
  }
});

router.get("/push/subscriptions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { pushNotificationService } = await import("../services/pushNotificationService");
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const subscriptions = await pushNotificationService.getUserSubscriptions(req.user!);
    res.json({ success: true, subscriptions });
  } catch (error: unknown) {
    log.error("Error getting subscriptions:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to get subscriptions" });
  }
});

router.post("/push/test", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { pushNotificationService } = await import("../services/pushNotificationService");
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await pushNotificationService.sendPushToUser(req.user!, {
      title: "Test Notification",
      body: "Push notifications are working correctly!",
      tag: "test-notification",
      data: { type: "test" }
    });
    
    res.json({ 
      success: result.sent > 0, 
      sent: result.sent, 
      failed: result.failed,
      message: result.sent > 0 ? "Test notification sent" : "No active subscriptions found"
    });
  } catch (error: unknown) {
    log.error("Error sending test push:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to send test notification" });
  }
});

router.get("/chatserver/presence", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { getChatServerLivePresence } = await import("../services/ai-brain/chatServerSubagent");
    const presence = await getChatServerLivePresence();
    res.json({ success: true, presence });
  } catch (error: unknown) {
    log.error("[ChatServerSubagent] Presence error:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/chatserver/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { runChatServerDiagnostics } = await import("../services/ai-brain/chatServerSubagent");
    const report = await runChatServerDiagnostics();
    res.json({ success: true, report });
  } catch (error: unknown) {
    log.error("[ChatServerSubagent] Diagnostics error:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/chatserver/self-awareness", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { getChatServerSelfAwareness } = await import("../services/ai-brain/chatServerSubagent");
    const awareness = getChatServerSelfAwareness();
    res.json({ success: true, awareness });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/chatserver/ux-suggestions", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { generateChatServerUXSuggestions } = await import("../services/ai-brain/chatServerSubagent");
    const suggestions = await generateChatServerUXSuggestions();
    res.json({ success: true, suggestions });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.post("/chatserver/self-heal", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { runChatServerDiagnostics } = await import("../services/ai-brain/chatServerSubagent");
    const report = await runChatServerDiagnostics();
    
    res.json({ 
      success: true, 
      status: report.status,
      issuesFound: report.issues.length,
      healingActions: report.selfHealingActions.length,
      message: report.status === 'healthy' 
        ? 'Chat server is healthy, no healing needed' 
        : `Self-healing triggered for ${report.issues.length} issues`
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

router.get("/chatserver/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { getChatServerLivePresence, runChatServerDiagnostics, getChatServerSelfAwareness } = 
      await import("../services/ai-brain/chatServerSubagent");
    
    const [presence, health, awareness] = await Promise.all([
      getChatServerLivePresence(),
      runChatServerDiagnostics(),
      Promise.resolve(getChatServerSelfAwareness())
    ]);

    res.json({
      success: true,
      status: {
        health: health.status,
        totalOnline: presence.totalParticipants,
        usersOnline: presence.totalUsersOnline,
        botsOnline: presence.totalBotsOnline,
        activeRooms: health.metrics.activeRooms,
        issueCount: health.issues.length,
        selfAwareness: {
          state: awareness.currentState,
          confidence: awareness.confidenceScore,
          lastDiagnostic: awareness.lastDiagnostic
        }
      }
    });
  } catch (error: unknown) {
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
