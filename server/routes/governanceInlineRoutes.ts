import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireAuth } from "../auth";
import { requireOwner, requireManager, requirePlatformStaff, attachWorkspaceId, type AuthenticatedRequest } from "../rbac";
import { requireProfessional } from "../tierGuards";
import { storage } from "../storage";
import { db } from "../db";
import {
  timeEntryDiscrepancies,
  autoReports,
  stagedShifts,
  auditLogs,
} from '@shared/schema';
import { sql, eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { shiftChatroomWorkflowService } from "../services/shiftChatroomWorkflowService";
import { typedExec } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('GovernanceInlineRoutes');


const router = Router();

router.get("/audit-trail", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { entityType, entityId, limit = 100 } = req.query;
    
    let query = db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.workspaceId, workspaceId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(parseInt(limit as string));
    
    if (entityType) {
      query = query.where(and(
        eq(auditLogs.workspaceId, workspaceId),
        eq(auditLogs.entityType, entityType as string)
      ));
    }
    
    if (entityId) {
      query = query.where(and(
        eq(auditLogs.workspaceId, workspaceId),
        eq(auditLogs.entityId, entityId as string)
      ));
    }
    
    const logs = await query;
    res.json(logs);
  } catch (error: unknown) {
    log.error("Error fetching audit trail:", error);
    res.status(500).json({ message: "Failed to fetch audit trail" });
  }
});

router.get("/audit-logs", requireAuth, requireProfessional, attachWorkspaceId, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ message: "Workspace ID required" });
    }

    const actorFilter = req.query.actorType as string | undefined;
    const statusFilter = req.query.status as string | undefined;
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 1000) : 100;
    const page = req.query.page ? Math.max(parseInt(req.query.page as string), 1) : 1;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : (page - 1) * limit;

    const conditions = [eq(auditLogs.workspaceId, workspaceId)];
    
    if (actorFilter && actorFilter !== 'all') {
      conditions.push(eq(auditLogs.actorType, actorFilter as any));
    }
    
    if (statusFilter && statusFilter !== 'all') {
      conditions.push(eq(auditLogs.eventStatus, statusFilter as any));
    }

    const events = await db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const logs = events.map(event => ({
      id: event.id,
      timestamp: event.timestamp,
      actorType: event.actorType,
      actorId: event.actorId,
      actorName: event.actorName || 'Unknown',
      action: event.eventType,
      resourceType: event.aggregateType,
      resourceId: event.aggregateId,
      status: event.status === 'completed' ? 'success' : event.status === 'failed' ? 'failure' : 'warning',
      details: typeof event.payload === 'object' && event.payload && 'description' in event.payload
        ? String(event.payload.description)
        : `${event.eventType} on ${event.aggregateType}`,
      ipAddress: event.ipAddress || undefined,
      userAgent: event.userAgent || undefined,
      verificationHash: event.actionHash || undefined,
    }));

    res.json(logs);
  } catch (error) {
    log.error("Error fetching audit logs:", error);
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

router.post("/safety-checks", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) return res.status(400).json({ message: 'Workspace required' });
    
    const { items, notes, location, timestamp } = req.body;
    
    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const period = `safety_${now.getFullYear()}_${String(weekNumber).padStart(2, '0')}`;
    
    const [report] = await db.insert(autoReports).values({
      workspaceId,
      userId,
      reportType: 'safety_check',
      period,
      summary: JSON.stringify({ items, notes, location, timestamp }),
      status: 'submitted',
    }).returning();
    
    res.json({ success: true, id: report.id });
  } catch (error: unknown) {
    log.error('Safety check submit error:', error);
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.post("/security-compliance/records/:recordId/lock-vault", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { recordId } = req.params;
    const workspaceId = req.workspaceId;
    // CATEGORY C — Raw SQL retained: schema mismatch (SQL uses overall_status column not in Drizzle schema) + dynamic SQL conditions | Tables: compliance_states | Verified: 2026-03-23
    const result = await typedExec(
      sql`UPDATE compliance_states SET overall_status = 'vault_locked', updated_at = NOW()
          WHERE id = ${recordId}
          ${workspaceId ? sql`AND workspace_id = ${workspaceId}` : sql``}
          RETURNING *`
    );
    const updated = (result as any).rows?.[0];
    if (!updated) return res.status(404).json({ message: 'Compliance record not found' });
    res.json({ success: true, data: updated });
  } catch (error: unknown) {
    log.error('Error locking vault:', error);
    res.status(500).json({ message: 'Failed to lock vault' });
  }
});

router.get("/safety-checks/recent", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'Workspace required' });
    
    const reports = await db.select().from(autoReports)
      .where(and(
        eq(autoReports.workspaceId, workspaceId),
        eq(autoReports.reportType, 'safety_check')
      ))
      .orderBy(desc(autoReports.createdAt))
      .limit(20);
    
    const formatted = reports.map(r => {
      let data: any = {};
      try {
        data = typeof r.summary === 'string' ? JSON.parse(r.summary) : {};
      } catch { data = {}; }
      const items = data.items || {};
      const passCount = Object.values(items).filter((v: any) => v === 'pass').length;
      const failCount = Object.values(items).filter((v: any) => v === 'fail').length;
      return {
        id: r.id,
        siteName: data.location ? `${data.location.lat}, ${data.location.lng}` : 'Unknown Site',
        completedAt: r.createdAt,
        passCount,
        failCount,
        status: failCount > 0 ? 'issues_found' : 'passed',
      };
    });
    
    res.json(formatted);
  } catch (error: unknown) {
    log.error('Safety checks fetch error:', error);
    res.status(500).json({ message: sanitizeError(error) });
  }
});

router.post("/dar/:darId/verify", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const { notes } = req.body;
    
    const result = await shiftChatroomWorkflowService.verifyDAR(
      req.params.darId,
      userId,
      notes
    );

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({ success: true, message: "DAR verified successfully" });
  } catch (error: unknown) {
    log.error("Error verifying DAR:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to verify DAR" });
  }
});

router.post("/dar/:darId/send", requireAuth, async (req: any, res) => {
  try {
    const result = await shiftChatroomWorkflowService.sendDARToClient(req.params.darId);

    if (!result.success) {
      return res.status(400).json({ success: false, message: result.error });
    }

    res.json({ success: true, message: "DAR sent to client successfully" });
  } catch (error: unknown) {
    log.error("Error sending DAR to client:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to send DAR" });
  }
});

export default router;
