import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireOwner, requireManager, requireAdmin, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import { oversightEvents } from "@shared/schema";
import { sql, eq, and, desc } from "drizzle-orm";
import { createLogger } from '../lib/logger';
const log = createLogger('AuditRoutes');


const router = Router();

router.get("/oversight", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)!.workspaceId || (req.user)!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const events = await db
      .select()
      .from(oversightEvents)
      .where(
        and(
          eq(oversightEvents.workspaceId, workspaceId),
          eq(oversightEvents.status, 'pending')
        )
      )
      .orderBy(desc(oversightEvents.detectedAt));

    res.json(events);
  } catch (error: unknown) {
    log.error("Error fetching oversight events:", error);
    res.status(500).json({ message: "Failed to fetch oversight events" });
  }
});

router.get("/oversight/stats", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)!.workspaceId || (req.user)!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const [pending, approved, rejected] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(oversightEvents)
        .where(and(
          eq(oversightEvents.workspaceId, workspaceId),
          eq(oversightEvents.status, 'pending')
        )),
      db.select({ count: sql<number>`count(*)` })
        .from(oversightEvents)
        .where(and(
          eq(oversightEvents.workspaceId, workspaceId),
          eq(oversightEvents.status, 'approved')
        )),
      db.select({ count: sql<number>`count(*)` })
        .from(oversightEvents)
        .where(and(
          eq(oversightEvents.workspaceId, workspaceId),
          eq(oversightEvents.status, 'rejected')
        )),
    ]);

    res.json({
      pending: pending[0]?.count || 0,
      approved: approved[0]?.count || 0,
      rejected: rejected[0]?.count || 0,
    });
  } catch (error: unknown) {
    log.error("Error fetching oversight stats:", error);
    res.status(500).json({ message: "Failed to fetch oversight stats" });
  }
});

router.patch("/oversight/:id/approve", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)!.workspaceId || (req.user)!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const eventId = req.params.id;
    const { resolutionNotes } = req.body;
    const [event] = await db
      .select()
      .from(oversightEvents)
      .where(
        and(
          eq(oversightEvents.id, eventId),
          eq(oversightEvents.workspaceId, workspaceId)
        )
      );

    if (!event) {
      return res.status(404).json({ message: "Oversight event not found" });
    }

    if (event.status !== 'pending') {
      return res.status(400).json({ message: "Event already resolved" });
    }
    const [updated] = await db
      .update(oversightEvents)
      .set({
        status: 'approved',
        resolvedBy: req.user!.id,
        resolvedAt: new Date(),
        resolutionNotes: resolutionNotes || null,
        updatedAt: new Date(),
      })
      .where(eq(oversightEvents.id, eventId))
      .returning();

    await storage.createAuditLog({
      workspaceId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userRole: req.user!.role || 'unknown',
      action: 'approve_oversight',
      actionDescription: `Approved ${event.entityType} oversight event`,
      targetType: 'oversight_event',
      targetId: eventId,
      metadata: {
        entityType: event.entityType,
        entityId: event.entityId,
        flagReason: event.flagReason,
        resolutionNotes,
      },
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error approving oversight event:", error);
    res.status(500).json({ message: "Failed to approve oversight event" });
  }
});

router.patch("/oversight/:id/reject", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)!.workspaceId || (req.user)!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace selected" });
    }

    const eventId = req.params.id;
    const { resolutionNotes } = req.body;
    if (!resolutionNotes?.trim()) {
      return res.status(400).json({ message: "Rejection reason required" });
    }

    const [event] = await db
      .select()
      .from(oversightEvents)
      .where(
        and(
          eq(oversightEvents.id, eventId),
          eq(oversightEvents.workspaceId, workspaceId)
        )
      );

    if (!event) {
      return res.status(404).json({ message: "Oversight event not found" });
    }

    if (event.status !== 'pending') {
      return res.status(400).json({ message: "Event already resolved" });
    }

    const { stagedShifts } = await import('@shared/schema');
    const [updated] = await db
      .update(oversightEvents)
      .set({
        status: 'rejected',
        resolvedBy: req.user!.id,
        resolvedAt: new Date(),
        resolutionNotes,
        updatedAt: new Date(),
      })
      .where(eq(oversightEvents.id, eventId))
      .returning();

    await storage.createAuditLog({
      workspaceId,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userRole: req.user!.role || 'unknown',
      action: 'reject_oversight',
      actionDescription: `Rejected ${event.entityType} oversight event`,
      targetType: 'oversight_event',
      targetId: eventId,
      metadata: {
        entityType: event.entityType,
        entityId: event.entityId,
        flagReason: event.flagReason,
        resolutionNotes,
      },
      ipAddress: req.ip,
    });

    res.json(updated);
  } catch (error: unknown) {
    log.error("Error rejecting oversight event:", error);
    res.status(500).json({ message: "Failed to reject oversight event" });
  }
});

router.post("/dm-audit/request", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId;
    const { conversationId, investigationReason, caseNumber } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    if (!conversationId || !investigationReason) {
      return res.status(400).json({ message: "Conversation ID and investigation reason are required" });
    }

    const request = await storage.createDmAuditRequest({
      workspaceId,
      conversationId,
      investigationReason,
      caseNumber,
      requestedBy: userId,
      requestedByName: `${req.user!.firstName} ${req.user!.lastName}`.trim(),
      requestedByEmail: req.user!.email,
    });

    res.json(request);
  } catch (error: unknown) {
    log.error("Error creating audit request:", error);
    res.status(500).json({ message: "Failed to create audit request" });
  }
});

router.get("/dm-audit/requests", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "No workspace found" });
    }

    const requests = await storage.getDmAuditRequests(workspaceId);
    res.json(requests);
  } catch (error: unknown) {
    log.error("Error fetching audit requests:", error);
    res.status(500).json({ message: "Failed to fetch audit requests" });
  }
});

router.post("/dm-audit/requests/:id/approve", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const requestId = req.params.id;
    const { expiresInHours } = req.body;

    let expiresAt: Date | undefined;
    if (expiresInHours && expiresInHours > 0) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + expiresInHours);
    }

    const approved = await storage.approveDmAuditRequest({
      requestId,
      approvedBy: userId,
      approvedByName: `${req.user!.firstName} ${req.user!.lastName}`.trim(),
      expiresAt,
    });

    res.json(approved);
  } catch (error: unknown) {
    log.error("Error approving audit request:", error);
    res.status(500).json({ message: "Failed to approve audit request" });
  }
});

router.post("/dm-audit/requests/:id/deny", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const requestId = req.params.id;
    const { deniedReason } = req.body;

    if (!deniedReason) {
      return res.status(400).json({ message: "Denial reason is required" });
    }

    const denied = await storage.denyDmAuditRequest(requestId, deniedReason);
    res.json(denied);
  } catch (error: unknown) {
    log.error("Error denying audit request:", error);
    res.status(500).json({ message: "Failed to deny audit request" });
  }
});

router.get("/dm-audit/messages/:conversationId", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const conversationId = req.params.conversationId;
    const auditRequestId = req.query.auditRequestId as string;

    if (!auditRequestId) {
      return res.status(400).json({ message: "Audit request ID is required" });
    }

    const messages = await storage.getPrivateMessagesWithAuditAccess({
      conversationId,
      auditRequestId,
      accessedBy: userId,
      accessedByName: `${req.user!.firstName} ${req.user!.lastName}`.trim(),
      accessedByEmail: req.user!.email,
      accessedByRole: req.user!.role || 'unknown',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json(messages);
  } catch (error: unknown) {
    log.error("Error accessing DM messages:", error);
    res.status(403).json({ message: sanitizeError(error) || "Audit access denied" });
  }
});

router.get("/dm-audit/access-logs/:conversationId", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const conversationId = req.params.conversationId;

    const logs = await storage.getDmAccessLogs(conversationId);
    res.json(logs);
  } catch (error: unknown) {
    log.error("Error fetching access logs:", error);
    res.status(500).json({ message: "Failed to fetch access logs" });
  }
});

router.get("/platform-audit/latest", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { weeklyPlatformAudit } = await import('../services/trinity/weeklyPlatformAudit');
    const report = weeklyPlatformAudit.getLastReport();
    
    if (!report) {
      return res.json({
        success: true,
        hasReport: false,
        message: 'No audit reports available yet. Weekly audits run every Sunday at 2 AM.',
      });
    }
    
    res.json({
      success: true,
      hasReport: true,
      report,
    });
  } catch (error: unknown) {
    log.error("[PlatformAudit] Error fetching latest report:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch audit report" });
  }
});

router.get("/platform-audit/history", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { weeklyPlatformAudit } = await import('../services/trinity/weeklyPlatformAudit');
    const history = weeklyPlatformAudit.getReportHistory();
    
    res.json({
      success: true,
      reports: history.map(r => ({
        reportId: r.reportId,
        generatedAt: r.generatedAt,
        healthScore: r.summary.overallHealthScore,
        totalFindings: r.summary.totalFindings,
        criticalCount: r.summary.criticalCount,
        highCount: r.summary.highCount,
      })),
      totalReports: history.length,
    });
  } catch (error: unknown) {
    log.error("[PlatformAudit] Error fetching history:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch audit history" });
  }
});

router.post("/platform-audit/trigger", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { weeklyPlatformAudit } = await import('../services/trinity/weeklyPlatformAudit');
    
    if (weeklyPlatformAudit.isAuditRunning()) {
      return res.status(409).json({
        success: false,
        message: 'An audit is already in progress. Please wait for it to complete.',
      });
    }

    weeklyPlatformAudit.runFullAudit().then(report => {
    }).catch(err => {
      log.error('[PlatformAudit] Manual audit failed:', err);
    });

    res.json({
      success: true,
      message: 'Platform audit started. Results will be available in the audit reports.',
    });
  } catch (error: unknown) {
    log.error("[PlatformAudit] Error triggering audit:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to trigger audit" });
  }
});

router.get("/platform-audit/status", requireAuth, async (_req, res) => {
  try {
    const { weeklyPlatformAudit } = await import('../services/trinity/weeklyPlatformAudit');
    
    res.json({
      success: true,
      isRunning: weeklyPlatformAudit.isAuditRunning(),
      lastReport: weeklyPlatformAudit.getLastReport()?.generatedAt || null,
      nextScheduled: (() => {
        const next = new Date();
        next.setDate(next.getDate() + (7 - next.getDay()) % 7);
        next.setHours(2, 0, 0, 0);
        if (next <= new Date()) next.setDate(next.getDate() + 7);
        return next;
      })(),
    });
  } catch (error: unknown) {
    log.error("[PlatformAudit] Error fetching status:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to fetch audit status" });
  }
});

export default router;
