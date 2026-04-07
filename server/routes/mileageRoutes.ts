import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { mileageLogs, insertMileageLogSchema } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { z } from "zod";
import { sumFinancialValues, toFinancialString, formatCurrency } from '../services/financialCalculator';
import { createLogger } from '../lib/logger';
const log = createLogger('MileageRoutes');


const router = Router();

// GET /api/mileage — list logs for workspace (managers see all, employees see own)
router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const user = req.user;
    const { employeeId, status, startDate, endDate } = req.query;

    const role = (user as any).workspaceRole || (user as any).role || "";
    const isManager = ["manager", "department_manager", "org_manager", "co_owner", "org_owner", "supervisor"].includes(role)
      || ["root_admin", "deputy_admin", "sysop", "support_manager"].includes((user as any).platformRole || "");

    let filterEmployeeId: string | undefined;
    if (!isManager) {
      const employee = await storage.getEmployeeByUserId(user.id);
      if (!employee || employee.workspaceId !== workspaceId) {
        return res.json({ logs: [], summary: { totalMiles: 0, totalReimbursement: 0, pendingCount: 0 } });
      }
      filterEmployeeId = employee.id;
    } else if (employeeId) {
      filterEmployeeId = employeeId as string;
    }

    const logs = await storage.getMileageLogsByWorkspace(workspaceId, {
      employeeId: filterEmployeeId,
      status: status as string | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    });

    const totalMiles = logs.reduce((s, l) => s + parseFloat(String(l.miles || 0)), 0);
    const totalReimbursementStr = sumFinancialValues(logs.map(l => toFinancialString(l.reimbursementAmount || '0')));
    const pendingCount = logs.filter(l => l.status === "submitted").length;

    return res.json({ logs, summary: { totalMiles: totalMiles.toFixed(2), totalReimbursement: totalReimbursementStr, pendingCount } });
  } catch (err) {
    log.error("[mileage GET /]", err);
    return res.status(500).json({ message: "Failed to fetch mileage logs" });
  }
});

// POST /api/mileage — create a new log
router.post("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const user = req.user;

    const employee = await storage.getEmployeeByUserId(user.id);
    if (!employee || employee.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const validated = insertMileageLogSchema.parse({
      ...req.body,
      workspaceId,
      employeeId: employee.id,
      status: "draft",
    });

    const log = await storage.createMileageLog(validated);
    return res.status(201).json(log);
  } catch (err: unknown) {
    if (err?.name === "ZodError") return res.status(400).json({ message: "Validation failed", errors: err.errors });
    log.error("[mileage POST /]", err);
    return res.status(500).json({ message: "Failed to create mileage log" });
  }
});

// GET /api/mileage/:id
router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const log = await storage.getMileageLog(req.params.id, req.workspaceId!);
    if (!log) return res.status(404).json({ message: "Mileage log not found" });
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch mileage log" });
  }
});

// PATCH /api/mileage/:id — update (employee can update draft/rejected, manager can update any)
router.patch("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const user = req.user;

    const existing = await storage.getMileageLog(req.params.id, workspaceId);
    if (!existing) return res.status(404).json({ message: "Mileage log not found" });

    const role = (user as any).workspaceRole || (user as any).role || "";
    const isManager = ["manager", "department_manager", "org_manager", "co_owner", "org_owner", "supervisor"].includes(role)
      || ["root_admin", "deputy_admin", "sysop", "support_manager"].includes((user as any).platformRole || "");

    if (!isManager) {
      if (!["draft", "rejected"].includes(existing.status || "")) {
        return res.status(403).json({ message: "Cannot edit a submitted or approved log" });
      }
    }

    const allowed = ["tripDate", "startLocation", "endLocation", "purpose", "tripType", "miles", "ratePerMile", "notes"];
    const data: Record<string, any> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }

    const updated = await storage.updateMileageLog(req.params.id, workspaceId, data);
    return res.json(updated);
  } catch (err) {
    log.error("[mileage PATCH /:id]", err);
    return res.status(500).json({ message: "Failed to update mileage log" });
  }
});

// POST /api/mileage/:id/submit — employee submits for approval
router.post("/:id/submit", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const existing = await storage.getMileageLog(req.params.id, workspaceId);
    if (!existing) return res.status(404).json({ message: "Not found" });
    if (!["draft", "rejected"].includes(existing.status || "")) {
      return res.status(400).json({ message: "Log is not in a submittable state" });
    }
    await db
      .update(mileageLogs)
      .set({ status: "submitted", submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(mileageLogs.id, req.params.id));
    const final = await storage.getMileageLog(req.params.id, workspaceId);
    return res.json(final);
  } catch (err) {
    return res.status(500).json({ message: "Failed to submit mileage log" });
  }
});

// POST /api/mileage/:id/approve — manager approves
router.post("/:id/approve", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const user = req.user;
    const log = await storage.approveMileageLog(req.params.id, workspaceId, user.id);
    if (!log) return res.status(404).json({ message: "Not found" });
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ message: "Failed to approve mileage log" });
  }
});

// POST /api/mileage/:id/reject — manager rejects
router.post("/:id/reject", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const user = req.user;
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ message: "Rejection reason required" });
    const log = await storage.rejectMileageLog(req.params.id, workspaceId, user.id, reason);
    if (!log) return res.status(404).json({ message: "Not found" });
    return res.json(log);
  } catch (err) {
    return res.status(500).json({ message: "Failed to reject mileage log" });
  }
});

// DELETE /api/mileage/:id — employee can delete draft, manager can delete any
router.delete("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const existing = await storage.getMileageLog(req.params.id, workspaceId);
    if (!existing) return res.status(404).json({ message: "Not found" });

    const role = (req.user as any).workspaceRole || "";
    const isManager = ["manager", "department_manager", "org_manager", "co_owner", "org_owner"].includes(role)
      || ["root_admin", "deputy_admin", "sysop"].includes((req.user as any).platformRole || "");

    if (!isManager && existing.status !== "draft") {
      return res.status(403).json({ message: "Can only delete draft logs" });
    }

    await storage.deleteMileageLog(req.params.id, workspaceId);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ message: "Failed to delete mileage log" });
  }
});

export default router;
