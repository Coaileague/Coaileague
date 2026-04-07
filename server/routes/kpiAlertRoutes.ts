import { Router } from "express";
import { requireAuth } from "../auth";
import { requireOwner } from "../rbac";
import { storage } from "../storage";
import { createLogger } from '../lib/logger';
const log = createLogger('KpiAlertRoutes');


const router = Router();

router.get('/', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const alerts = await storage.getKpiAlerts(user.currentWorkspaceId);
    res.json(alerts);
  } catch (error) {
    log.error("Error fetching KPI alerts:", error);
    res.status(500).json({ message: "Failed to fetch KPI alerts" });
  }
});

router.post('/', requireOwner, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const alert = await storage.createKpiAlert({
      ...req.body,
      workspaceId: user.currentWorkspaceId,
      createdBy: userId,
    });

    res.json(alert);
  } catch (error) {
    log.error("Error creating KPI alert:", error);
    res.status(500).json({ message: "Failed to create KPI alert" });
  }
});

router.patch('/:id', requireOwner, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    // Strip immutable/privileged fields before update to prevent mass assignment.
    // Attackers could otherwise move alerts to other workspaces by supplying workspaceId in body.
    const { id: _id, workspaceId: _ws, createdBy: _cb, createdAt: _ca, ...safeData } = req.body;
    const alert = await storage.updateKpiAlert(id, user.currentWorkspaceId, safeData);
    res.json(alert);
  } catch (error) {
    log.error("Error updating KPI alert:", error);
    res.status(500).json({ message: "Failed to update KPI alert" });
  }
});

router.delete('/:id', requireOwner, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const deleted = await storage.deleteKpiAlert(id, user.currentWorkspaceId);
    if (!deleted) {
      return res.status(404).json({ message: "KPI alert not found" });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Error deleting KPI alert:", error);
    res.status(500).json({ message: "Failed to delete KPI alert" });
  }
});

export default router;
