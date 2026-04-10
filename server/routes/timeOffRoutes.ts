import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { storage } from "../storage";
import {
  employees,
  shifts,
  timeOffRequests,
  insertTimeOffRequestSchema,
  shiftActions,
  insertShiftActionSchema,
  timesheetEditRequests,
  insertTimesheetEditRequestSchema,
  managerAssignments,
  employeeBenefits,
} from "@shared/schema";
import { eq, and, desc, sql, gte, lte } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { universalNotificationEngine } from "../services/universalNotificationEngine";
import { createLogger } from '../lib/logger';
const log = createLogger('TimeOffRoutes');


async function notifyDirectManager(employeeId: string, workspaceId: string, title: string, message: string) {
  try {
    const [assignment] = await db
      .select()
      .from(managerAssignments)
      .where(and(eq(managerAssignments.employeeId, employeeId), eq(managerAssignments.workspaceId, workspaceId)))
      .limit(1);
    if (!assignment?.managerId) return;
    const manager = await db.query.employees.findFirst({ where: eq(employees.id, assignment.managerId) });
    if (!manager?.userId) return;
    await universalNotificationEngine.sendNotification({
      workspaceId,
      userId: manager.userId,
      type: 'approval_needed',
      title,
      message,
      severity: 'info',
      metadata: { source: 'direct_manager_routing', employeeId, managerId: manager.id },
    });
  } catch (err) {
    log.warn('[TimeOffRoutes] notifyDirectManager failed silently:', err);
  }
}

const router = Router();

router.get("/api/pto", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const status = req.query.status as string | undefined;
    const requests = await storage.getPtoRequestsByWorkspace(workspaceId, { status });
    res.json(requests);
  } catch (error) {
    log.error("Error fetching PTO requests:", error);
    res.status(500).json({ message: "Failed to fetch PTO requests" });
  }
});

router.post("/api/pto", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { insertPtoRequestSchema } = await import("@shared/schema");
    const validated = insertPtoRequestSchema.parse({
      ...req.body,
      workspaceId: workspaceId,
    });

    // PTO balance check — only enforce when a PTO benefit record exists
    const ptoTypes = ['pto', 'vacation', 'sick'];
    if (validated.employeeId && validated.totalHours && ptoTypes.includes(validated.ptoType as string)) {
      const [benefit] = await db
        .select()
        .from(employeeBenefits)
        .where(and(
          eq(employeeBenefits.employeeId, validated.employeeId),
          eq(employeeBenefits.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(employeeBenefits.benefitType, 'pto'),
          eq(employeeBenefits.status, 'active'),
        ))
        .limit(1);

      if (benefit) {
        const accrued = parseFloat(benefit.ptoHoursAccrued as unknown as string ?? '0');
        const used = parseFloat(benefit.ptoHoursUsed as unknown as string ?? '0');
        const available = accrued - used;
        const requested = parseFloat(validated.totalHours as unknown as string);
        if (requested > available) {
          return res.status(422).json({
            message: `Insufficient PTO balance. Available: ${available.toFixed(2)}h, Requested: ${requested.toFixed(2)}h`,
            available,
            requested,
          });
        }
      }
    }

    const request = await storage.createPtoRequest(validated);
    res.status(201).json(request);
  } catch (error: unknown) {
    log.error("Error creating PTO request:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create PTO request" });
  }
});

router.patch("/api/pto/:id/approve", requireAuth, requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { id } = req.params;
    const ptoCheck = await storage.getPtoRequest(id, workspaceId);
    if (ptoCheck) {
      const myEmployee = await storage.getEmployeeByUserId(userId!, workspaceId);
      if (myEmployee && ptoCheck.employeeId === myEmployee.id) {
        return res.status(403).json({ message: "You cannot approve your own time-off request" });
      }
    }

    const approverId = req.body?.approverId || userId;
    const approved = await storage.approvePtoRequest(id, workspaceId, approverId);

    if (!approved) {
      return res.status(404).json({ message: "PTO request not found" });
    }

    // Cascade: cancel overlapping shifts for the approved PTO window
    const pto = approved as any;
    if (pto.employeeId && pto.startDate && pto.endDate) {
      await db.update(shifts)
        .set({ status: 'cancelled' } as any)
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          eq(shifts.employeeId, pto.employeeId),
          gte(shifts.startTime, new Date(pto.startDate)),
          lte(shifts.startTime, new Date(pto.endDate))
        ))
        .catch((err: Error) =>
          log.warn('[TimeOffRoutes] PTO approve: shift cascade cancel failed:', err.message)
        );
    }

    // Notify the employee their PTO was approved
    (async () => {
      try {
        const employee = await storage.getEmployee(pto.employeeId, workspaceId);
        if (employee?.userId) {
          await universalNotificationEngine.sendNotification({
            workspaceId: workspaceId,
            userId: employee.userId,
            type: 'request_approved',
            title: 'Time-Off Request Approved',
            message: 'Your time-off request has been approved.',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: 'success',
            metadata: { ptoRequestId: id, source: 'pto_approved' },
          });
        }
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'pto_updated', action: 'approved', requestId: id });
      } catch (_notifErr) { log.warn('[TimeOffRoutes] Notification/broadcast failed on PTO approve:', _notifErr instanceof Error ? _notifErr.message : String(_notifErr)); }
    })();

    res.json(approved);
  } catch (error: unknown) {
    log.error("Error approving PTO request:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to approve PTO request" });
  }
});

router.patch("/api/pto/:id/deny", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const { id } = req.params;
    const approverId = req.body?.approverId || userId;
    const { denialReason } = req.body;
    const denied = await storage.denyPtoRequest(id, workspaceId, approverId, denialReason);

    if (!denied) {
      return res.status(404).json({ message: "PTO request not found" });
    }

    // Notify the employee their PTO was denied
    (async () => {
      try {
        const employee = await storage.getEmployee((denied as any).employeeId, workspaceId);
        if (employee?.userId) {
          await universalNotificationEngine.sendNotification({
            workspaceId: workspaceId,
            userId: employee.userId,
            type: 'request_denied',
            title: 'Time-Off Request Denied',
            message: denialReason
              ? `Your time-off request was denied. Reason: ${denialReason}`
              : 'Your time-off request has been denied. Contact your manager for details.',
            severity: 'warning',
            metadata: { ptoRequestId: id, denialReason, source: 'pto_denied' },
          });
        }
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId, { type: 'pto_updated', action: 'denied', requestId: id });
      } catch (_notifErr) { log.warn('[TimeOffRoutes] Notification/broadcast failed on PTO deny:', _notifErr instanceof Error ? _notifErr.message : String(_notifErr)); }
    })();

    res.json(denied);
  } catch (error: unknown) {
    log.error("Error denying PTO request:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to deny PTO request" });
  }
});

router.get("/api/time-off-requests/my", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;

    if (!userId || !workspaceId) {
      return res.json([]);
    }

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
    });

    if (!employee) {
      return res.json([]);
    }

    const requests = await db
      .select()
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.employeeId, employee.id), eq(timeOffRequests.workspaceId, workspaceId)))
      .orderBy(desc(timeOffRequests.createdAt));

    res.json(requests);
  } catch (error) {
    log.error("Error fetching time-off requests:", error);
    res.status(500).json({ message: "Failed to fetch time-off requests" });
  }
});

router.get("/api/time-off/pending-count", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.json({ count: 0 });
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.workspaceId, workspaceId), eq(timeOffRequests.status, "pending")));

    res.json({ count: Number(result?.count) || 0 });
  } catch (error) {
    log.error("Error fetching pending time-off count:", error);
    res.json({ count: 0 });
  }
});

router.get("/api/timesheets/pending-count", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.json({ count: 0 });
    }

    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(timesheetEditRequests)
      .where(and(eq(timesheetEditRequests.workspaceId, workspaceId), eq(timesheetEditRequests.status, "pending")));

    res.json({ count: Number(result?.count) || 0 });
  } catch (error) {
    log.error("Error fetching pending timesheet count:", error);
    res.json({ count: 0 });
  }
});

router.get("/api/time-off-requests/pending", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.json([]);
    }

    const requests = await db
      .select()
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.workspaceId, workspaceId), eq(timeOffRequests.status, "pending")))
      .orderBy(desc(timeOffRequests.createdAt));

    const enriched = await Promise.all(
      requests.map(async (request) => {
        const employee = await storage.getEmployee(request.employeeId, workspaceId);
        return {
          ...request,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Unknown",
          employeeEmail: employee?.email || "",
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    log.error("Error fetching pending time-off requests:", error);
    res.status(500).json({ message: "Failed to fetch pending requests" });
  }
});

router.post("/api/time-off-requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const validated = insertTimeOffRequestSchema.parse({
      ...req.body,
      workspaceId,
      employeeId: employee.id,
      status: "pending",
    });

    const [request] = await db.insert(timeOffRequests).values(validated).returning();

    const empName = `${employee.firstName} ${employee.lastName}`;
    const dateRange = validated.startDate && validated.endDate
      ? `${new Date(validated.startDate).toLocaleDateString()} – ${new Date(validated.endDate).toLocaleDateString()}`
      : 'requested dates';
    notifyDirectManager(
      employee.id,
      workspaceId,
      `Time-Off Request — ${empName}`,
      `${empName} has submitted a time-off request for ${dateRange}. Please review and approve or deny.`
    );

    res.status(201).json(request);
  } catch (error: unknown) {
    log.error("Error creating time-off request:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create request" });
  }
});

router.put("/api/time-off-requests/:id/status", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { status, managerNotes } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'denied'" });
    }

    const [request] = await db
      .select()
      .from(timeOffRequests)
      .where(and(eq(timeOffRequests.id, id), eq(timeOffRequests.workspaceId, workspaceId)))
      .limit(1);

    if (!request) {
      return res.status(404).json({ message: "Time-off request not found" });
    }

    const [updated] = await db
      .update(timeOffRequests)
      .set({
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: managerNotes || null,
      })
      .where(eq(timeOffRequests.id, id))
      .returning();

    // Notify the employee of approval or denial outcome
    (async () => {
      try {
        const employee = await storage.getEmployee(request.employeeId, workspaceId!);
        if (employee?.userId) {
          const isApproved = status === 'approved';
          await universalNotificationEngine.sendNotification({
            workspaceId: workspaceId!,
            userId: employee.userId,
            type: isApproved ? 'request_approved' : 'request_denied',
            title: isApproved ? 'Time-Off Request Approved' : 'Time-Off Request Denied',
            message: isApproved
              ? 'Your time-off request has been approved.'
              : managerNotes
                ? `Your time-off request was denied. Reason: ${managerNotes}`
                : 'Your time-off request has been denied. Contact your manager for details.',
            // @ts-expect-error — TS migration: fix in refactoring sprint
            severity: isApproved ? 'success' : 'warning',
            metadata: { timeOffRequestId: id, status, source: 'time_off_status_update' },
          });
        }
        const { broadcastToWorkspace } = await import('../websocket');
        broadcastToWorkspace(workspaceId!, { type: 'pto_updated', action: status, requestId: id });
      } catch (_notifErr) { log.warn('[TimeOffRoutes] Notification/broadcast failed on time-off status update:', _notifErr instanceof Error ? _notifErr.message : String(_notifErr)); }
    })();

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating time-off request:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to update request" });
  }
});

router.get("/api/shift-actions/pending", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.json([]);
    }

    const pendingActions = await db
      .select()
      .from(shiftActions)
      .where(and(eq(shiftActions.workspaceId, workspaceId), eq(shiftActions.status, "pending")))
      .orderBy(desc(shiftActions.createdAt));

    const enriched = await Promise.all(
      pendingActions.map(async (action) => {
        const employee = await storage.getEmployee((action as any).employeeId, workspaceId);
        const shift = action.shiftId
          ? await db
              .select()
              .from(shifts)
              .where(eq(shifts.id, action.shiftId))
              .limit(1)
              .then((r) => r[0])
          : null;
        return {
          ...action,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Unknown",
          shiftDetails: shift
            ? {
                startTime: shift.startTime,
                endTime: shift.endTime,
                clientId: shift.clientId,
              }
            : null,
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    log.error("Error fetching pending shift actions:", error);
    res.status(500).json({ message: "Failed to fetch pending shift actions" });
  }
});

router.put("/api/shift-actions/:id/approve", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { approved, managerNotes } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const [action] = await db
      .select()
      .from(shiftActions)
      .where(and(eq(shiftActions.id, id), eq(shiftActions.workspaceId, workspaceId)))
      .limit(1);

    if (!action) {
      return res.status(404).json({ message: "Shift action not found" });
    }

    const newStatus = approved ? "approved" : "rejected";

    const [updated] = await db
      .update(shiftActions)
      .set({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        status: newStatus,
        approvedBy: userId,
        approvedAt: new Date(),
      })
      .where(eq(shiftActions.id, id))
      .returning();

    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (approved && action.actionType === "swap" && action.shiftId && (action as any).targetShiftId) {
      try {
        const [shift1] = await db.select().from(shifts).where(eq(shifts.id, action.shiftId));
        const [shift2] = await db.select().from(shifts).where(eq(shifts.id, (action as any).targetShiftId));

        if (shift1 && shift2) {
          await db
            .update(shifts)
            .set({ employeeId: shift2.employeeId })
            .where(eq(shifts.id, action.shiftId));
          await db
            .update(shifts)
            .set({ employeeId: shift1.employeeId })
            .where(eq(shifts.id, (action as any).targetShiftId));
        }
      } catch (swapError) {
        log.error("Error executing shift swap:", swapError);
      }
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error processing shift action:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to process shift action" });
  }
});

router.post("/api/timesheet-edit-requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
    });

    if (!employee) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const validated = insertTimesheetEditRequestSchema.parse({
      ...req.body,
      workspaceId,
      employeeId: employee.id,
      status: "pending",
    });

    const [request] = await db.insert(timesheetEditRequests).values(validated).returning();

    res.status(201).json(request);
  } catch (error: unknown) {
    log.error("Error creating timesheet edit request:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create request" });
  }
});

router.get("/api/timesheet-edit-requests/pending", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.json([]);
    }

    const requests = await db
      .select()
      .from(timesheetEditRequests)
      .where(and(eq(timesheetEditRequests.workspaceId, workspaceId), eq(timesheetEditRequests.status, "pending")))
      .orderBy(desc(timesheetEditRequests.createdAt));

    const enriched = await Promise.all(
      requests.map(async (request) => {
        const employee = await storage.getEmployee((request as any).employeeId, workspaceId);
        return {
          ...request,
          employeeName: employee ? `${employee.firstName} ${employee.lastName}` : "Unknown",
        };
      })
    );

    res.json(enriched);
  } catch (error) {
    log.error("Error fetching pending timesheet edit requests:", error);
    res.status(500).json({ message: "Failed to fetch pending requests" });
  }
});

router.get("/api/timesheet-edit-requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.id;
    const workspaceId = req.workspaceId;
    if (!userId || !workspaceId) {
      return res.json([]);
    }

    const employee = await db.query.employees.findFirst({
      where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
    });

    if (!employee) {
      return res.json([]);
    }

    const requests = await db
      .select()
      .from(timesheetEditRequests)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .where(and(eq(timesheetEditRequests.employeeId, employee.id), eq(timesheetEditRequests.workspaceId, workspaceId)))
      .orderBy(desc(timesheetEditRequests.createdAt));

    res.json(requests);
  } catch (error) {
    log.error("Error fetching timesheet edit requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

router.put("/api/timesheet-edit-requests/:id/review", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    const { id } = req.params;
    const { status, reviewerNotes } = req.body;

    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!workspaceId) {
      return res.status(403).json({ message: "Workspace context required" });
    }

    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'approved' or 'denied'" });
    }

    const [request] = await db
      .select()
      .from(timesheetEditRequests)
      .where(and(eq(timesheetEditRequests.id, id), eq(timesheetEditRequests.workspaceId, workspaceId)))
      .limit(1);

    if (!request) {
      return res.status(404).json({ message: "Timesheet edit request not found" });
    }

    const [updated] = await db
      .update(timesheetEditRequests)
      .set({
        status,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewNotes: reviewerNotes || null,
      })
      .where(eq(timesheetEditRequests.id, id))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error reviewing timesheet edit request:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to review request" });
  }
});

export default router;
