/**
 * Payroll Timesheet Routes
 *
 * Manual weekly timesheet lifecycle:
 *   draft → submitted → approved | rejected
 *
 * Endpoints:
 *   GET    /                  List timesheets (managers: all; employees: own)
 *   POST   /                  Create timesheet
 *   GET    /:id               Get timesheet + daily entries
 *   PUT    /:id/entries       Replace daily hour entries for a draft timesheet
 *   POST   /:id/submit        Submit draft for approval
 *   POST   /:id/approve       Approve submitted timesheet (managers only)
 *   POST   /:id/reject        Reject submitted timesheet (managers only)
 *
 * Validation rules:
 *   - Max 16 h per day
 *   - Max 60 h total per week
 *   - Only draft timesheets can be edited or submitted
 *   - Only submitted timesheets can be approved/rejected
 */

import { Router } from "express";
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";
import {
  payrollTimesheets,
  payrollTimesheetEntries,
  employees,
  auditLogs,
} from "@shared/schema";
import { storage } from "../storage";
import { requireAuth } from "../auth";
import type { AuthenticatedRequest } from "../rbac";
import { hasManagerAccess, hasPlatformWideAccess } from "../rbac";
import { universalNotificationEngine } from "../services/universalNotificationEngine";
import { createLogger } from "../lib/logger";
import { registerLegacyBootstrap } from "../services/legacyBootstrapRegistry";

const log = createLogger("payrollTimesheets");

// ─── DB Bootstrap ──────────────────────────────────────────────────────────

registerLegacyBootstrap("payroll_timesheets", async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_timesheets (
      id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id     VARCHAR NOT NULL,
      employee_id      VARCHAR NOT NULL,
      period_start     DATE NOT NULL,
      period_end       DATE NOT NULL,
      total_hours      NUMERIC(6,2) NOT NULL DEFAULT 0,
      status           VARCHAR(20) NOT NULL DEFAULT 'draft',
      created_by       VARCHAR NOT NULL,
      approved_by      VARCHAR,
      approved_at      TIMESTAMPTZ,
      rejected_by      VARCHAR,
      rejected_at      TIMESTAMPTZ,
      rejection_reason TEXT,
      notes            TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS payroll_timesheets_workspace_idx ON payroll_timesheets(workspace_id);
    CREATE INDEX IF NOT EXISTS payroll_timesheets_employee_idx  ON payroll_timesheets(employee_id);
    CREATE INDEX IF NOT EXISTS payroll_timesheets_status_idx    ON payroll_timesheets(status);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_timesheet_entries (
      id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      timesheet_id  VARCHAR NOT NULL REFERENCES payroll_timesheets(id) ON DELETE CASCADE,
      workspace_id  VARCHAR NOT NULL,
      employee_id   VARCHAR NOT NULL,
      entry_date    DATE NOT NULL,
      hours_worked  NUMERIC(5,2) NOT NULL DEFAULT 0,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT payroll_timesheet_entries_unique UNIQUE(timesheet_id, entry_date)
    );
    CREATE INDEX IF NOT EXISTS payroll_timesheet_entries_timesheet_idx  ON payroll_timesheet_entries(timesheet_id);
    CREATE INDEX IF NOT EXISTS payroll_timesheet_entries_workspace_idx  ON payroll_timesheet_entries(workspace_id);
  `);
});

// ─── Helpers ───────────────────────────────────────────────────────────────

const MAX_HOURS_PER_DAY = 16;
const MAX_HOURS_PER_WEEK = 60;

function isManager(req: AuthenticatedRequest): boolean {
  if (req.platformRole && hasPlatformWideAccess(req.platformRole)) return true;
  return !!req.workspaceRole && hasManagerAccess(req.workspaceRole);
}

async function writeAudit(
  workspaceId: string,
  userId: string,
  action: string,
  entityId: string,
  description: string,
  req: AuthenticatedRequest,
) {
  try {
    await db.insert(auditLogs).values({
      workspaceId,
      userId,
      userEmail: req.user?.email ?? "unknown",
      userRole: req.user?.role ?? "user",
      action,
      entityType: "payroll_timesheet",
      entityId,
      actionDescription: description,
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
  } catch (err: any) {
    log.warn("[audit] payroll timesheet audit write failed", { error: err?.message });
  }
}

// ─── Router ────────────────────────────────────────────────────────────────

const router = Router();

// All routes require auth (applied at mount point too, belt + suspenders)
router.use(requireAuth);

// ─── GET / — list timesheets ────────────────────────────────────────────────

router.get("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    let conditions;
    if (isManager(req)) {
      // Managers see all timesheets in the workspace
      conditions = eq(payrollTimesheets.workspaceId, workspaceId);
    } else {
      // Employees see only their own timesheets
      const employee = await storage.getEmployeeByUserId(userId, workspaceId);
      if (!employee) return res.status(404).json({ message: "Employee record not found" });
      conditions = and(
        eq(payrollTimesheets.workspaceId, workspaceId),
        eq(payrollTimesheets.employeeId, employee.id),
      );
    }

    const timesheets = await db
      .select({
        id: payrollTimesheets.id,
        workspaceId: payrollTimesheets.workspaceId,
        employeeId: payrollTimesheets.employeeId,
        periodStart: payrollTimesheets.periodStart,
        periodEnd: payrollTimesheets.periodEnd,
        totalHours: payrollTimesheets.totalHours,
        status: payrollTimesheets.status,
        createdBy: payrollTimesheets.createdBy,
        approvedBy: payrollTimesheets.approvedBy,
        approvedAt: payrollTimesheets.approvedAt,
        rejectedBy: payrollTimesheets.rejectedBy,
        rejectedAt: payrollTimesheets.rejectedAt,
        rejectionReason: payrollTimesheets.rejectionReason,
        notes: payrollTimesheets.notes,
        createdAt: payrollTimesheets.createdAt,
        updatedAt: payrollTimesheets.updatedAt,
        // Employee name denormalized via join
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
      })
      .from(payrollTimesheets)
      .leftJoin(employees, and(eq(payrollTimesheets.employeeId, employees.id), eq(employees.workspaceId, workspaceId)))
      .where(conditions)
      .orderBy(desc(payrollTimesheets.createdAt));

    return res.json(timesheets);
  } catch (err: any) {
    log.error("Error listing timesheets", { error: err?.message });
    return res.status(500).json({ message: "Failed to list timesheets" });
  }
});

// ─── POST / — create timesheet ──────────────────────────────────────────────

router.post("/", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    const { employeeId, periodStart, periodEnd, notes } = req.body;

    if (!employeeId || !periodStart || !periodEnd) {
      return res.status(400).json({ message: "employeeId, periodStart and periodEnd are required" });
    }

    // Validate period
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: "Invalid date format for periodStart or periodEnd" });
    }
    if (end < start) {
      return res.status(400).json({ message: "periodEnd must be on or after periodStart" });
    }
    const durationDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (durationDays > 7) {
      return res.status(400).json({ message: "Timesheet period cannot exceed 7 days" });
    }

    // Verify the target employee belongs to this workspace
    const targetEmployee = await storage.getEmployeeById(employeeId, workspaceId);
    if (!targetEmployee) {
      return res.status(404).json({ message: "Employee not found in this workspace" });
    }

    // Non-managers can only create timesheets for themselves
    if (!isManager(req)) {
      const self = await storage.getEmployeeByUserId(userId, workspaceId);
      if (!self || self.id !== employeeId) {
        return res.status(403).json({ message: "You can only create timesheets for yourself" });
      }
    }

    const [timesheet] = await db
      .insert(payrollTimesheets)
      .values({
        workspaceId,
        employeeId,
        periodStart,
        periodEnd,
        totalHours: "0",
        status: "draft",
        createdBy: userId,
        notes: notes ?? null,
      })
      .returning();

    await writeAudit(workspaceId, userId, "create_timesheet", timesheet.id,
      `Created timesheet for employee ${employeeId} period ${periodStart}–${periodEnd}`, req);

    return res.status(201).json(timesheet);
  } catch (err: any) {
    log.error("Error creating timesheet", { error: err?.message });
    return res.status(500).json({ message: "Failed to create timesheet" });
  }
});

// ─── GET /:id — get timesheet detail ───────────────────────────────────────

router.get("/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    const { id } = req.params;

    const [timesheet] = await db
      .select()
      .from(payrollTimesheets)
      .where(and(eq(payrollTimesheets.id, id), eq(payrollTimesheets.workspaceId, workspaceId)));

    if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });

    // Non-managers can only view their own
    if (!isManager(req)) {
      const self = await storage.getEmployeeByUserId(userId, workspaceId);
      if (!self || self.id !== timesheet.employeeId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const entries = await db
      .select()
      .from(payrollTimesheetEntries)
      .where(and(eq(payrollTimesheetEntries.timesheetId, id), eq(payrollTimesheetEntries.workspaceId, workspaceId)))
      .orderBy(payrollTimesheetEntries.entryDate);

    // Denormalize employee name
    const employee = await storage.getEmployeeById(timesheet.employeeId, workspaceId);

    return res.json({
      ...timesheet,
      employeeFirstName: employee?.firstName ?? null,
      employeeLastName: employee?.lastName ?? null,
      entries,
    });
  } catch (err: any) {
    log.error("Error fetching timesheet", { error: err?.message });
    return res.status(500).json({ message: "Failed to fetch timesheet" });
  }
});

// ─── PUT /:id/entries — replace daily hour entries ─────────────────────────

router.put("/:id/entries", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    const { id } = req.params;
    const { entries } = req.body as { entries: Array<{ date: string; hours: number; notes?: string }> };

    if (!Array.isArray(entries)) {
      return res.status(400).json({ message: "entries must be an array" });
    }

    const [timesheet] = await db
      .select()
      .from(payrollTimesheets)
      .where(and(eq(payrollTimesheets.id, id), eq(payrollTimesheets.workspaceId, workspaceId)));

    if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });

    if (timesheet.status !== "draft") {
      return res.status(409).json({ message: "Only draft timesheets can be edited" });
    }

    // Ownership check for non-managers
    if (!isManager(req)) {
      const self = await storage.getEmployeeByUserId(userId, workspaceId);
      if (!self || self.id !== timesheet.employeeId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    // Validate each entry
    for (const entry of entries) {
      const h = Number(entry.hours);
      if (isNaN(h) || h < 0) {
        return res.status(400).json({ message: `Invalid hours value: ${entry.hours}` });
      }
      if (h > MAX_HOURS_PER_DAY) {
        return res.status(400).json({
          message: `Hours per day cannot exceed ${MAX_HOURS_PER_DAY} (got ${h} for ${entry.date})`,
        });
      }
      // Validate date within period
      const d = new Date(entry.date);
      const pStart = new Date(timesheet.periodStart);
      const pEnd = new Date(timesheet.periodEnd);
      if (d < pStart || d > pEnd) {
        return res.status(400).json({
          message: `Entry date ${entry.date} is outside the timesheet period (${timesheet.periodStart}–${timesheet.periodEnd})`,
        });
      }
    }

    const totalHours = entries.reduce((sum, e) => sum + Number(e.hours), 0);
    if (totalHours > MAX_HOURS_PER_WEEK) {
      return res.status(400).json({
        message: `Total hours cannot exceed ${MAX_HOURS_PER_WEEK} per week (got ${totalHours})`,
      });
    }

    // Replace entries in a transaction
    await db.transaction(async (tx) => {
      // Delete existing entries
      await tx
        .delete(payrollTimesheetEntries)
        .where(eq(payrollTimesheetEntries.timesheetId, id));

      // Insert new entries
      if (entries.length > 0) {
        await tx.insert(payrollTimesheetEntries).values(
          entries.map((e) => ({
            timesheetId: id,
            workspaceId,
            employeeId: timesheet.employeeId,
            entryDate: e.date,
            hoursWorked: String(Number(e.hours).toFixed(2)),
            notes: e.notes ?? null,
          })),
        );
      }

      // Update total hours on the timesheet
      await tx
        .update(payrollTimesheets)
        .set({ totalHours: String(totalHours.toFixed(2)), updatedAt: new Date() })
        .where(eq(payrollTimesheets.id, id));
    });

    await writeAudit(workspaceId, userId, "update_timesheet_hours", id,
      `Updated hours for timesheet ${id}: total ${totalHours}h across ${entries.length} entries`, req);

    const updatedEntries = await db
      .select()
      .from(payrollTimesheetEntries)
      .where(and(eq(payrollTimesheetEntries.timesheetId, id), eq(payrollTimesheetEntries.workspaceId, workspaceId)))
      .orderBy(payrollTimesheetEntries.entryDate);

    const [updated] = await db
      .select()
      .from(payrollTimesheets)
      .where(and(eq(payrollTimesheets.id, id), eq(payrollTimesheets.workspaceId, workspaceId)));

    return res.json({ timesheet: updated, entries: updatedEntries });
  } catch (err: any) {
    log.error("Error updating timesheet entries", { error: err?.message });
    return res.status(500).json({ message: "Failed to update timesheet entries" });
  }
});

// ─── POST /:id/submit — submit for approval ────────────────────────────────

router.post("/:id/submit", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    const { id } = req.params;

    const [timesheet] = await db
      .select()
      .from(payrollTimesheets)
      .where(and(eq(payrollTimesheets.id, id), eq(payrollTimesheets.workspaceId, workspaceId)));

    if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });

    if (timesheet.status !== "draft") {
      return res.status(409).json({ message: `Timesheet is already ${timesheet.status}` });
    }

    // Ownership check for non-managers
    if (!isManager(req)) {
      const self = await storage.getEmployeeByUserId(userId, workspaceId);
      if (!self || self.id !== timesheet.employeeId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    const [updated] = await db
      .update(payrollTimesheets)
      .set({ status: "submitted", updatedAt: new Date() })
      .where(eq(payrollTimesheets.id, id))
      .returning();

    await writeAudit(workspaceId, userId, "submit_timesheet", id,
      `Submitted timesheet ${id} for approval`, req);

    // Notify managers in the workspace — filter by role in a single query
    try {
      const managersWithRoles = await db
        .select({ userId: employees.userId, workspaceRole: employees.workspaceRole })
        .from(employees)
        .where(and(eq(employees.workspaceId, workspaceId)));

      const submitter = await storage.getEmployeeById(timesheet.employeeId, workspaceId);
      const submitterName = submitter
        ? `${submitter.firstName} ${submitter.lastName}`
        : "An employee";

      for (const mgr of managersWithRoles) {
        if (!mgr.userId || mgr.userId === userId) continue;
        if (!hasManagerAccess(mgr.workspaceRole as string)) continue;

        await universalNotificationEngine.sendNotification({
          workspaceId,
          userId: mgr.userId,
          type: "approval_required",
          title: `Timesheet Submitted — ${submitterName}`,
          message: `${submitterName} has submitted a timesheet for ${timesheet.periodStart} – ${timesheet.periodEnd} (${timesheet.totalHours} hours). Review and approve.`,
          severity: "info",
          metadata: {
            alertType: "timesheet_submitted",
            timesheetId: id,
            employeeId: timesheet.employeeId,
            totalHours: timesheet.totalHours,
          },
        });
      }
    } catch (notifErr: any) {
      log.warn("[payrollTimesheets] Submit notification failed (non-fatal):", notifErr?.message);
    }

    return res.json(updated);
  } catch (err: any) {
    log.error("Error submitting timesheet", { error: err?.message });
    return res.status(500).json({ message: "Failed to submit timesheet" });
  }
});

// ─── POST /:id/approve — approve submitted timesheet ───────────────────────

router.post("/:id/approve", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    if (!isManager(req)) {
      return res.status(403).json({ message: "Manager role required to approve timesheets" });
    }

    const { id } = req.params;

    const [timesheet] = await db
      .select()
      .from(payrollTimesheets)
      .where(and(eq(payrollTimesheets.id, id), eq(payrollTimesheets.workspaceId, workspaceId)));

    if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });

    if (timesheet.status !== "submitted") {
      return res.status(409).json({ message: `Cannot approve a timesheet with status '${timesheet.status}'` });
    }

    const [updated] = await db
      .update(payrollTimesheets)
      .set({ status: "approved", approvedBy: userId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(payrollTimesheets.id, id))
      .returning();

    await writeAudit(workspaceId, userId, "approve_timesheet", id,
      `Approved timesheet ${id} (${timesheet.totalHours}h, period ${timesheet.periodStart}–${timesheet.periodEnd})`, req);

    // Notify the employee
    try {
      const employee = await storage.getEmployeeById(timesheet.employeeId, workspaceId);
      if (employee?.userId) {
        await universalNotificationEngine.sendNotification({
          workspaceId,
          userId: employee.userId,
          type: "timesheet_approved",
          title: "Timesheet Approved",
          message: `Your timesheet for ${timesheet.periodStart} – ${timesheet.periodEnd} (${timesheet.totalHours} hours) has been approved.`,
          severity: "info",
          metadata: {
            alertType: "timesheet_approved",
            timesheetId: id,
            totalHours: timesheet.totalHours,
          },
        });
      }
    } catch (notifErr: any) {
      log.warn("[payrollTimesheets] Approval notification failed (non-fatal):", notifErr?.message);
    }

    return res.json(updated);
  } catch (err: any) {
    log.error("Error approving timesheet", { error: err?.message });
    return res.status(500).json({ message: "Failed to approve timesheet" });
  }
});

// ─── POST /:id/reject — reject submitted timesheet ─────────────────────────

router.post("/:id/reject", async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(401).json({ message: "Workspace not found" });

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "User not found" });

    if (!isManager(req)) {
      return res.status(403).json({ message: "Manager role required to reject timesheets" });
    }

    const { id } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason?.trim()) {
      return res.status(400).json({ message: "A reason is required when rejecting a timesheet" });
    }

    const [timesheet] = await db
      .select()
      .from(payrollTimesheets)
      .where(and(eq(payrollTimesheets.id, id), eq(payrollTimesheets.workspaceId, workspaceId)));

    if (!timesheet) return res.status(404).json({ message: "Timesheet not found" });

    if (timesheet.status !== "submitted") {
      return res.status(409).json({ message: `Cannot reject a timesheet with status '${timesheet.status}'` });
    }

    const [updated] = await db
      .update(payrollTimesheets)
      .set({
        status: "rejected",
        rejectedBy: userId,
        rejectedAt: new Date(),
        rejectionReason: reason.trim(),
        updatedAt: new Date(),
      })
      .where(eq(payrollTimesheets.id, id))
      .returning();

    await writeAudit(workspaceId, userId, "reject_timesheet", id,
      `Rejected timesheet ${id}: ${reason.trim()}`, req);

    // Notify the employee
    try {
      const employee = await storage.getEmployeeById(timesheet.employeeId, workspaceId);
      if (employee?.userId) {
        await universalNotificationEngine.sendNotification({
          workspaceId,
          userId: employee.userId,
          type: "timesheet_rejected",
          title: "Timesheet Rejected",
          message: `Your timesheet for ${timesheet.periodStart} – ${timesheet.periodEnd} was rejected. Reason: ${reason.trim()}`,
          severity: "warning",
          metadata: {
            alertType: "timesheet_rejected",
            timesheetId: id,
            reason: reason.trim(),
          },
        });
      }
    } catch (notifErr: any) {
      log.warn("[payrollTimesheets] Rejection notification failed (non-fatal):", notifErr?.message);
    }

    return res.json(updated);
  } catch (err: any) {
    log.error("Error rejecting timesheet", { error: err?.message });
    return res.status(500).json({ message: "Failed to reject timesheet" });
  }
});

export default router;
