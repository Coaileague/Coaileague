import { Router } from "express";
import { db } from "../db";
import { kpiAlerts } from "../../shared/schema";
import { alertHistory } from "../../shared/schema/domains/audit";
import { eq, and, desc, sql } from "drizzle-orm";
import { hasManagerAccess } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('AlertConfigRoutes');


const router = Router();

router.get('/config', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const configs = await db
      .select()
      .from(kpiAlerts)
      .where(eq(kpiAlerts.workspaceId, workspaceId))
      .orderBy(kpiAlerts.alertType);

    res.json(configs);
  } catch (err) {
    log.error("[alerts] GET /config error:", err);
    res.status(500).json({ message: "Failed to fetch alert configs" });
  }
});

router.patch('/config/:type/toggle', async (req: any, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ message: "Manager access required to toggle alert config" });
    }
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const { type } = req.params;
    const { isEnabled } = req.body;

    const updated = await db
      .update(kpiAlerts)
      .set({ isActive: isEnabled, updatedAt: new Date() })
      .where(and(eq(kpiAlerts.alertType, type), eq(kpiAlerts.workspaceId, workspaceId)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ message: "Alert config not found" });
    }
    res.json(updated[0]);
  } catch (err) {
    log.error("[alerts] PATCH /config/:type/toggle error:", err);
    res.status(500).json({ message: "Failed to toggle alert" });
  }
});

router.put('/config/:type', async (req: any, res) => {
  try {
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ message: "Manager access required to update alert config" });
    }
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const { type } = req.params;

    const ALLOWED_ALERT_FIELDS = [
      'alertName', 'description', 'metricSource', 'thresholdValue', 'thresholdUnit',
      'comparisonOperator', 'notifyRoles', 'notifyUsers', 'notificationMethod', 'isActive',
    ] as const;
    const safeBody: Record<string, unknown> = {};
    for (const field of ALLOWED_ALERT_FIELDS) {
      if (req.body[field] !== undefined) safeBody[field] = req.body[field];
    }

    const existing = await db
      .select()
      .from(kpiAlerts)
      .where(and(eq(kpiAlerts.alertType, type), eq(kpiAlerts.workspaceId, workspaceId)))
      .limit(1);

    if (existing.length) {
      const updated = await db
        .update(kpiAlerts)
        .set({ ...safeBody, alertType: type, workspaceId, updatedAt: new Date() })
        .where(and(eq(kpiAlerts.alertType, type), eq(kpiAlerts.workspaceId, workspaceId)))
        .returning();
      return res.json(updated[0]);
    }

    const userId = req.user?.id || req.user?.claims?.sub;
    const created = await db
      .insert(kpiAlerts)
      .values({ ...safeBody, alertType: type, workspaceId, createdBy: userId } as any)
      .returning();
    res.json(created[0]);
  } catch (err) {
    log.error("[alerts] PUT /config/:type error:", err);
    res.status(500).json({ message: "Failed to update alert config" });
  }
});

router.get('/history', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const { filter } = req.query;

    let query = db
      .select()
      .from(alertHistory)
      .where(eq(alertHistory.workspaceId, workspaceId))
      .orderBy(desc(alertHistory.createdAt))
      .limit(100);

    if (filter === 'unacknowledged') {
      query = db
        .select()
        .from(alertHistory)
        .where(and(eq(alertHistory.workspaceId, workspaceId), eq(alertHistory.isAcknowledged, false)))
        .orderBy(desc(alertHistory.createdAt))
        .limit(100) as any;
    }

    const rows = await query;
    res.json(rows);
  } catch (err) {
    log.error("[alerts] GET /history error:", err);
    res.status(500).json({ message: "Failed to fetch alert history" });
  }
});

router.get('/unacknowledged-count', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(alertHistory)
      .where(and(eq(alertHistory.workspaceId, workspaceId), eq(alertHistory.isAcknowledged, false)));

    res.json({ count: result[0]?.count ?? 0 });
  } catch (err) {
    log.error("[alerts] GET /unacknowledged-count error:", err);
    res.status(500).json({ message: "Failed to count alerts" });
  }
});

router.post('/test', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const { alertType } = req.body;

    const inserted = await db
      .insert(alertHistory)
      .values({
        workspaceId,
        alertType: alertType || 'compliance_violation',
        severity: 'medium',
        title: `Test Alert: ${alertType || 'compliance_violation'}`,
        message: `This is a test alert triggered manually to verify notification delivery.`,
        triggerData: { test: true },
      })
      .returning();

    res.json({ success: true, alert: inserted[0] });
  } catch (err) {
    log.error("[alerts] POST /test error:", err);
    res.status(500).json({ message: "Failed to create test alert" });
  }
});

router.post('/:id/acknowledge', async (req: any, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ message: "No workspace" });

    const userId = req.user?.id || req.user?.claims?.sub;
    const { id } = req.params;
    const { notes } = req.body || {};

    const updated = await db
      .update(alertHistory)
      .set({
        isAcknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
        acknowledgmentNotes: notes || null,
        updatedAt: new Date(),
      })
      .where(and(eq(alertHistory.id, id), eq(alertHistory.workspaceId, workspaceId)))
      .returning();

    if (!updated.length) {
      return res.status(404).json({ message: "Alert not found" });
    }
    res.json(updated[0]);
  } catch (err) {
    log.error("[alerts] POST /:id/acknowledge error:", err);
    res.status(500).json({ message: "Failed to acknowledge alert" });
  }
});

export default router;
