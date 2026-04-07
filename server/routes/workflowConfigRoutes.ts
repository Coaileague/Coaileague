import { Router } from "express";
import { requireAuth } from "../auth";
import { requireOwner } from "../rbac";
import { storage } from "../storage";
import { insertReportWorkflowConfigSchema } from "@shared/schema";
import { sanitizeError } from "../middleware/errorHandler";
import { createLogger } from '../lib/logger';
const log = createLogger('WorkflowConfigRoutes');


const router = Router();

router.get('/', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const configs = await storage.getWorkflowConfigs(user.currentWorkspaceId);
    res.json(configs);
  } catch (error) {
    log.error("Error fetching workflow configs:", error);
    res.status(500).json({ message: "Failed to fetch workflow configs" });
  }
});

router.post('/', requireOwner, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const parsed = insertReportWorkflowConfigSchema.safeParse({
      ...req.body,
      workspaceId: user.currentWorkspaceId,
    });

    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const config = await storage.createWorkflowConfig(parsed.data);

    res.json(config);
  } catch (error) {
    log.error("Error creating workflow config:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to create workflow config" });
  }
});

router.patch('/:id', requireOwner, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const allowedFields = insertReportWorkflowConfigSchema
      .omit({ workspaceId: true })
      .partial();
    const parsed = allowedFields.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
    }

    const { id } = req.params;
    const config = await storage.updateWorkflowConfig(id, user.currentWorkspaceId, parsed.data);
    res.json(config);
  } catch (error) {
    log.error("Error updating workflow config:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to update workflow config" });
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
    const deleted = await storage.deleteWorkflowConfig(id, user.currentWorkspaceId);
    if (!deleted) {
      return res.status(404).json({ message: "Workflow config not found" });
    }

    res.json({ success: true });
  } catch (error) {
    log.error("Error deleting workflow config:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to delete workflow config" });
  }
});

export default router;
