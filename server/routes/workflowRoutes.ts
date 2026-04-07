import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../rbac";
import { readLimiter } from "../middleware/rateLimiter";
import { createLogger } from '../lib/logger';
const log = createLogger('WorkflowRoutes');


const router = Router();

router.get("/active", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { workflowStatusService } = await import("../services/workflowStatusService");

    const workflows = await workflowStatusService.getActiveWorkflows(workspaceId);

    res.json({
      success: true,
      data: workflows,
      count: workflows.length,
    });
  } catch (error: unknown) {
    log.error("Error fetching active workflows:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/summary", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { workflowStatusService } = await import("../services/workflowStatusService");

    const summary = await workflowStatusService.getWorkflowStatusSummary(workspaceId);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error: unknown) {
    log.error("Error fetching workflow summary:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get("/:workflowId", requireAuth, readLimiter, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { workflowId } = req.params;
    const { workflowStatusService } = await import("../services/workflowStatusService");

    const workflow = await workflowStatusService.getWorkflowDetails(workspaceId, workflowId);

    if (!workflow) {
      return res.status(404).json({ error: "Workflow not found" });
    }

    res.json({
      success: true,
      data: workflow,
    });
  } catch (error: unknown) {
    log.error("Error fetching workflow details:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
