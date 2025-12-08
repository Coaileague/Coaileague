import { Router } from "express";
import { z } from "zod";
import { approvalRequestService } from "../services/ai-brain/approvalRequestService";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const workspaceId = req.headers["x-workspace-id"] as string || user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace ID required" });
    }

    const { decision, limit, offset, scope } = req.query;
    const isAdmin = user.platformRole === 'root_admin' || user.platformRole === 'superadmin';
    const isManager = user.workspaceRole === 'org_owner' || user.workspaceRole === 'admin' || user.workspaceRole === 'manager';
    
    const scopeValue = isAdmin ? 'admin' : (isManager && scope === 'manager') ? 'manager' : (scope as string || 'employee');
    
    const decisionFilter = decision ? (decision as string).split(',') as any : undefined;
    
    const approvals = await approvalRequestService.getApprovalRequests(user.id, workspaceId, {
      decision: decisionFilter,
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
      scope: scopeValue as 'admin' | 'manager' | 'employee',
    });

    res.json({
      success: true,
      approvals: approvals.map(a => ({
        ...a,
        createdAt: a.createdAt?.toISOString(),
        decisionAt: a.decisionAt?.toISOString(),
        expiresAt: a.expiresAt?.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[ApprovalRoutes] List error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch approvals" });
  }
});

router.get("/pending-count", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const workspaceId = req.headers["x-workspace-id"] as string || user.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace ID required" });
    }

    const isAdmin = user.platformRole === 'root_admin' || user.platformRole === 'superadmin';
    const isManager = user.workspaceRole === 'org_owner' || user.workspaceRole === 'admin' || user.workspaceRole === 'manager';
    const scope = isAdmin ? 'admin' : isManager ? 'manager' : 'employee';

    const count = await approvalRequestService.getPendingCount(user.id, workspaceId, scope);

    res.json({ success: true, count });
  } catch (error) {
    console.error("[ApprovalRoutes] Pending count error:", error);
    res.status(500).json({ success: false, error: "Failed to get pending count" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const approval = await approvalRequestService.getApprovalById(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: "Approval not found" });
    }

    res.json({
      success: true,
      approval: {
        ...approval,
        createdAt: approval.createdAt?.toISOString(),
        decisionAt: approval.decisionAt?.toISOString(),
        expiresAt: approval.expiresAt?.toISOString(),
      },
    });
  } catch (error) {
    console.error("[ApprovalRoutes] Get error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch approval" });
  }
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().optional(),
});

router.post("/:id/decision", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Invalid decision data", details: parsed.error.flatten() });
    }

    const { decision, note } = parsed.data;

    const success = await approvalRequestService.resolveApproval(
      req.params.id,
      decision,
      user.id,
      note
    );

    if (!success) {
      return res.status(400).json({ success: false, error: "Cannot resolve this approval - may already be decided" });
    }

    res.json({ success: true, message: `Approval ${decision}` });
  } catch (error) {
    console.error("[ApprovalRoutes] Decision error:", error);
    res.status(500).json({ success: false, error: "Failed to process decision" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const user = (req as any).user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { reason } = req.body;

    const success = await approvalRequestService.cancelApproval(req.params.id, user.id, reason);

    if (!success) {
      return res.status(400).json({ success: false, error: "Cannot cancel this approval" });
    }

    res.json({ success: true, message: "Approval cancelled" });
  } catch (error) {
    console.error("[ApprovalRoutes] Cancel error:", error);
    res.status(500).json({ success: false, error: "Failed to cancel approval" });
  }
});

export default router;
