import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { employees, shiftAcknowledgments } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { createLogger } from '../lib/logger';
const log = createLogger('ComplianceInlineRoutes');


const router = Router();

router.patch("/api/acknowledgments/:id/acknowledge", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const currentEmployee = await db.query.employees.findFirst({
      where: eq(employees.userId, userId),
    });

    if (!currentEmployee) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const acknowledgment = await db.query.shiftAcknowledgments.findFirst({
      where: and(
        eq(shiftAcknowledgments.id, req.params.id),
        eq(shiftAcknowledgments.workspaceId, workspaceId),
        eq(shiftAcknowledgments.employeeId, currentEmployee.id)
      ),
    });

    if (!acknowledgment) {
      return res.status(404).json({ message: "Acknowledgment not found or not assigned to you" });
    }

    const [updated] = await db
      .update(shiftAcknowledgments)
      .set({
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      })
      .where(and(eq(shiftAcknowledgments.id, req.params.id), eq(shiftAcknowledgments.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error acknowledging:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to acknowledge" });
  }
});

router.patch("/api/acknowledgments/:id/deny", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const currentEmployee = await db.query.employees.findFirst({
      where: eq(employees.userId, userId),
    });

    if (!currentEmployee) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const acknowledgment = await db.query.shiftAcknowledgments.findFirst({
      where: and(
        eq(shiftAcknowledgments.id, req.params.id),
        eq(shiftAcknowledgments.workspaceId, workspaceId),
        eq(shiftAcknowledgments.employeeId, currentEmployee.id)
      ),
    });

    if (!acknowledgment) {
      return res.status(404).json({ message: "Acknowledgment not found or not assigned to you" });
    }

    const { denialReason } = req.body;

    const [updated] = await db
      .update(shiftAcknowledgments)
      .set({
        deniedAt: new Date(),
        denialReason: denialReason || null,
      })
      .where(and(eq(shiftAcknowledgments.id, req.params.id), eq(shiftAcknowledgments.workspaceId, workspaceId)))
      .returning();

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error denying acknowledgment:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to deny acknowledgment" });
  }
});

router.delete("/api/acknowledgments/:id", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;

    const acknowledgment = await db.query.shiftAcknowledgments.findFirst({
      where: and(
        eq(shiftAcknowledgments.id, req.params.id),
        eq(shiftAcknowledgments.workspaceId, workspaceId)
      ),
    });

    if (!acknowledgment) {
      return res.status(404).json({ message: "Acknowledgment not found" });
    }

    const currentWorkspaceId = req.workspaceId || (req.user)?.currentWorkspaceId;
    if (acknowledgment.workspaceId !== currentWorkspaceId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db.delete(shiftAcknowledgments).where(and(eq(shiftAcknowledgments.id, req.params.id), eq(shiftAcknowledgments.workspaceId, workspaceId)));

    res.json({ success: true, message: "Acknowledgment deleted" });
  } catch (error: unknown) {
    log.error("Error deleting acknowledgment:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to delete acknowledgment" });
  }
});

export default router;
