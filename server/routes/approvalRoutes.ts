import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { z } from "zod";
import { approvalRequestService } from "../services/ai-brain/approvalRequestService";
import { requireAuth } from '../auth';
import { getUserPlatformRole } from '../rbac';
import { db } from "../db";
import { sql, eq, and } from "drizzle-orm";
import { shifts, expenses } from "@shared/schema";
import { timeOffRequests, timesheetEditRequests } from "@shared/schema";
import { createLogger } from '../lib/logger';
const log = createLogger('ApprovalRoutes');


const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const workspaceId = req.workspaceId || (user as any).workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace ID required" });
    }

    const { decision, limit, offset, scope } = req.query;
    const callerPlatRole = await getUserPlatformRole(user.id);
    const isAdmin = callerPlatRole === 'root_admin' || callerPlatRole === 'sysop';
    const isManager = req.workspaceRole === 'org_owner' || req.workspaceRole === 'co_owner' || req.workspaceRole === 'org_admin' || req.workspaceRole === 'manager';
    
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
    log.error("[ApprovalRoutes] List error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch approvals" });
  }
});

router.get("/pending-count", async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const workspaceId = req.workspaceId || (user as any).workspaceId;
    
    // Platform admins without a workspace context get 0 count (they view all workspaces)
    const callerPlatRole2 = await getUserPlatformRole(user.id);
    const isPlatformAdmin = callerPlatRole2 === 'root_admin' || callerPlatRole2 === 'sysop';
    if (!workspaceId) {
      if (isPlatformAdmin) {
        // Platform admins without workspace context: return 0 (no workspace-specific approvals)
        return res.json({ success: true, count: 0 });
      }
      return res.status(400).json({ success: false, error: "Workspace ID required" });
    }

    const isManager = req.workspaceRole === 'org_owner' || req.workspaceRole === 'co_owner' || req.workspaceRole === 'org_admin' || req.workspaceRole === 'manager';
    const scope = isPlatformAdmin ? 'admin' : isManager ? 'manager' : 'employee';

    const count = await approvalRequestService.getPendingCount(user.id, workspaceId, scope);

    res.json({ success: true, count });
  } catch (error) {
    log.error("[ApprovalRoutes] Pending count error:", error);
    res.status(500).json({ success: false, error: "Failed to get pending count" });
  }
});

router.get("/pending", async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const workspaceId = req.workspaceId || (user as any).workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace ID required" });
    }

    const callerPlatRole = await getUserPlatformRole(user.id);
    const isAdmin = callerPlatRole === 'root_admin' || callerPlatRole === 'sysop';
    const isManager = req.workspaceRole === 'org_owner' || req.workspaceRole === 'co_owner' || req.workspaceRole === 'org_admin' || req.workspaceRole === 'manager';
    const scope = isAdmin ? 'admin' : isManager ? 'manager' : 'employee';

    const approvals = await approvalRequestService.getApprovalRequests(user.id, workspaceId, {
      decision: ['pending'] as any,
      limit: 100,
      offset: 0,
      scope,
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
    log.error("[ApprovalRoutes] Pending list error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pending approvals" });
  }
});

router.get("/all-pending-counts", async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }
    const workspaceId = req.workspaceId || (user as any).workspaceId;
    if (!workspaceId) {
      return res.json({ success: true, data: { shifts: 0, timesheets: 0, timeoff: 0, expenses: 0, total: 0 } });
    }

    const [shiftResult, timesheetResult, timeoffResult, expenseResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(shifts)
        .where(and(eq(shifts.workspaceId, workspaceId), eq(shifts.status, "draft"))),
      db.select({ count: sql<number>`count(*)` }).from(timesheetEditRequests)
        .where(and(eq(timesheetEditRequests.workspaceId, workspaceId), eq(timesheetEditRequests.status, "pending"))),
      db.select({ count: sql<number>`count(*)` }).from(timeOffRequests)
        .where(and(eq(timeOffRequests.workspaceId, workspaceId), eq(timeOffRequests.status, "pending"))),
      db.select({ count: sql<number>`count(*)` }).from(expenses)
        .where(and(eq(expenses.workspaceId, workspaceId), eq(expenses.status, "submitted"))),
    ]);

    const shiftsCount = Number(shiftResult[0]?.count) || 0;
    const timesheetsCount = Number(timesheetResult[0]?.count) || 0;
    const timeoffCount = Number(timeoffResult[0]?.count) || 0;
    const expensesCount = Number(expenseResult[0]?.count) || 0;

    res.json({
      success: true,
      data: {
        shifts: shiftsCount,
        timesheets: timesheetsCount,
        timeoff: timeoffCount,
        expenses: expensesCount,
        total: shiftsCount + timesheetsCount + timeoffCount + expensesCount,
      },
    });
  } catch (error) {
    log.error("[ApprovalRoutes] All pending counts error:", error);
    res.status(500).json({ success: false, error: "Failed to get pending counts" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const approval = await approvalRequestService.getApprovalById(req.params.id);
    if (!approval) {
      return res.status(404).json({ success: false, error: "Approval not found" });
    }

    const workspaceId = req.workspaceId || (user as any).workspaceId;
    if (workspaceId && approval.workspaceId && approval.workspaceId !== workspaceId) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    res.json({
      success: true,
      approval: {
        ...approval,
        createdAt: approval.createdAt?.toISOString(),
        decisionAt: (approval as any).decisionAt?.toISOString(),
        expiresAt: approval.expiresAt?.toISOString(),
      },
    });
  } catch (error) {
    log.error("[ApprovalRoutes] Get error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch approval" });
  }
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  note: z.string().optional(),
});

router.post("/:id/decision", async (req, res) => {
  try {
    const user = req.user;
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
    log.error("[ApprovalRoutes] Decision error:", error);
    res.status(500).json({ success: false, error: "Failed to process decision" });
  }
});

router.post("/:id/process", async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: "Not authenticated" });
    }

    const { id: stepId } = req.params;
    const { action, notes, rejectionReason } = req.body;

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, error: "Invalid action. Must be 'approve' or 'reject'" });
    }

    const { processApproval } = await import("../services/reportWorkflowEngine");
    const result = await processApproval(req.body.submissionId || "", stepId, user.id, action, notes, rejectionReason);

    res.json(result);
  } catch (error: unknown) {
    log.error("[ApprovalRoutes] Process error:", error);
    res.status(500).json({ success: false, error: sanitizeError(error) || "Failed to process approval" });
  }
});

router.post("/:id/cancel", async (req, res) => {
  try {
    const user = req.user;
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
    log.error("[ApprovalRoutes] Cancel error:", error);
    res.status(500).json({ success: false, error: "Failed to cancel approval" });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// Timesheet Edit Requests — manager review of officer-submitted edit requests
// ─────────────────────────────────────────────────────────────────────────────
router.get('/pending', requireAuth, async (req: any, res) => {  // mounted at /api/timesheet-edit-requests/pending
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ error: 'Workspace required' });
    const pending = await db.select().from(timesheetEditRequests)
      .where(and(eq(timesheetEditRequests.workspaceId, workspaceId), eq(timesheetEditRequests.status, 'pending')))
      .orderBy(desc(timesheetEditRequests.createdAt))
      .limit(50);
    res.json(pending);
  } catch (err: unknown) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/review', requireAuth, async (req: any, res) => {  // mounted at /api/timesheet-edit-requests/:id/review
  try {
    const { id } = req.params;
    const { approved, reviewNotes } = req.body;
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) return res.status(401).json({ error: 'Workspace required' });
    const [updated] = await db.update(timesheetEditRequests)
      .set({
        status: approved ? 'approved' : 'rejected',
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: reviewNotes || null,
      } as any)
      .where(and(eq(timesheetEditRequests.id, id), eq(timesheetEditRequests.workspaceId, workspaceId)))
      .returning();
    if (!updated) return res.status(404).json({ error: 'Edit request not found' });
    res.json({ success: true, request: updated });
  } catch (err: unknown) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
