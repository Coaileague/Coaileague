import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../../db";
import {
  complianceApprovals,
  complianceDocuments,
  complianceChecklists,
  employees,
  complianceAuditTrail,
  employeeComplianceRecords,
} from '@shared/schema';
import { eq, and, sql } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { platformEventBus } from "../../services/platformEventBus";
import { createLogger } from '../../lib/logger';
const log = createLogger('Approvals');


const createApprovalSchema = z.object({
  employeeId: z.string().min(1),
  complianceRecordId: z.string().min(1),
  approvalType: z.string().min(1).max(100),
  documentId: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  requestNotes: z.string().max(5000).optional(),
  dueDate: z.string().optional(),
});

const decisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'needs_revision']),
  decisionNotes: z.string().max(5000).optional(),
});

const router = Router();

router.get("/", requireAuth, async (req: Request, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const { status } = req.query;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    let query = db.select({
      approval: complianceApprovals,
      document: complianceDocuments,
      employee: employees
    })
      .from(complianceApprovals)
      .leftJoin(complianceDocuments, eq(complianceApprovals.documentId, complianceDocuments.id))
      .leftJoin(employees, eq(complianceApprovals.employeeId, employees.id))
      .where(eq(complianceApprovals.workspaceId, workspaceId));
    
    const approvals = await query;
    
    res.json({ success: true, approvals });
  } catch (error) {
    log.error("[Compliance Approvals] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch approvals" });
  }
});

router.get("/pending", requireAuth, async (req: Request, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const approvals = await db.select({
      approval: complianceApprovals,
      document: complianceDocuments,
      employee: employees
    })
      .from(complianceApprovals)
      .leftJoin(complianceDocuments, eq(complianceApprovals.documentId, complianceDocuments.id))
      .leftJoin(employees, eq(complianceApprovals.employeeId, employees.id))
      .where(and(
        eq(complianceApprovals.workspaceId, workspaceId),
        eq(complianceApprovals.status, 'pending')
      ));
    
    res.json({ success: true, approvals, count: approvals.length });
  } catch (error) {
    log.error("[Compliance Approvals] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch pending approvals" });
  }
});

router.post("/", requireAuth, async (req: Request, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const apParsed = createApprovalSchema.safeParse(req.body);
    if (!apParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: apParsed.error.flatten().fieldErrors });
    }
    const {
      employeeId,
      complianceRecordId,
      approvalType,
      documentId,
      priority,
      requestNotes,
      dueDate
    } = apParsed.data;
    
    const [approval] = await db.insert(complianceApprovals).values({
      workspaceId,
      employeeId,
      complianceRecordId,
      approvalType,
      documentId,
      status: 'pending',
      priority: priority || 'normal',
      requestedBy: req.user?.id,
      requestNotes,
      dueDate: dueDate ? new Date(dueDate) : undefined
    }).returning();
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(complianceAuditTrail).values({
      workspaceId,
      entityType: 'approval',
      entityId: approval.id,
      employeeId,
      documentId,
      action: 'request',
      actionCategory: 'create',
      performedBy: req.user?.id,
      ipAddress: req.ip,
      newValue: { approvalType, priority },
      severity: 'info'
    });
    
    res.json({ success: true, approval });
  } catch (error) {
    log.error("[Compliance Approvals] Error creating approval:", error);
    res.status(500).json({ success: false, error: "Failed to create approval request" });
  }
});

router.post("/:approvalId/decide", requireAuth, async (req: Request, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const { approvalId } = req.params;
    const decParsed = decisionSchema.safeParse(req.body);
    if (!decParsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: decParsed.error.flatten().fieldErrors });
    }
    const { decision, decisionNotes } = decParsed.data;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const existing = await db.select().from(complianceApprovals)
      .where(and(
        eq(complianceApprovals.id, approvalId),
        eq(complianceApprovals.workspaceId, workspaceId)
      ))
      .limit(1);
    
    if (!existing.length) {
      return res.status(404).json({ success: false, error: "Approval not found" });
    }
    
    const previousStatus = existing[0].status;
    
    const [updated] = await db.update(complianceApprovals)
      .set({
        status: decision === 'approved' ? 'approved' : decision === 'rejected' ? 'rejected' : 'pending',
        decidedBy: req.user?.id,
        decidedAt: new Date(),
        decision,
        decisionNotes,
        updatedAt: new Date()
      })
      .where(eq(complianceApprovals.id, approvalId))
      .returning();
    
    if (decision === 'approved' && updated.documentId) {
      await db.update(complianceDocuments)
        .set({
          status: 'approved',
          verifiedBy: req.user?.id,
          verifiedAt: new Date(),
          verificationNotes: decisionNotes,
          updatedAt: new Date()
        })
        .where(eq(complianceDocuments.id, updated.documentId));
      
      if (existing[0].complianceRecordId) {
        await db.update(complianceChecklists)
          .set({
            isCompleted: true,
            completedAt: new Date(),
            completedBy: req.user?.id,
            verifiedBy: req.user?.id,
            verifiedAt: new Date(),
            updatedAt: new Date()
          })
          .where(and(
            eq(complianceChecklists.complianceRecordId, existing[0].complianceRecordId),
            eq(complianceChecklists.documentId, updated.documentId)
          ));
        
        await updateComplianceRecordCounts(existing[0].complianceRecordId);
      }

      if (updated.employeeId) {
        const approvedPayload = {
          employeeId: updated.employeeId,
          workspaceId,
          documentType: updated.approvalType || 'compliance_document',
          documentName: decisionNotes || 'Compliance Document',
        };
        platformEventBus.emit('compliance_document_approved', approvedPayload); // keeps complianceScoringBridge listener
        platformEventBus.publish({ type: 'compliance_document_approved', category: 'automation', title: 'Compliance Document Approved', description: `Document '${decisionNotes || 'Compliance Document'}' approved for employee ${updated.employeeId}`, workspaceId, metadata: approvedPayload }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

        // Non-blocking: notify the employee directly via in-app + email (if they have a user account)
        (async () => {
          try {
            const [emp] = await db.select({ userId: employees.userId, firstName: employees.firstName, lastName: employees.lastName })
              .from(employees).where(eq(employees.id, updated.employeeId!)).limit(1);
            if (!emp?.userId) return; // no user account yet — skip
            const { universalNotificationEngine } = await import('../../services/universalNotificationEngine');
            await universalNotificationEngine.sendNotification({
              workspaceId,
              userId: emp.userId,
              type: 'compliance_approved',
              title: 'Compliance Document Approved',
              message: `Your ${updated.approvalType || 'compliance document'} has been reviewed and approved. No further action is required.`,
              priority: 'medium',
              severity: 'info',
            });
          } catch (emailErr: unknown) {
            log.warn('[ComplianceApprovals] Employee approval notification failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
          }
        })();
      }
    } else if (decision === 'rejected' && updated.documentId) {
      await db.update(complianceDocuments)
        .set({
          status: 'rejected',
          rejectedBy: req.user?.id,
          rejectedAt: new Date(),
          rejectionReason: decisionNotes,
          updatedAt: new Date()
        })
        .where(eq(complianceDocuments.id, updated.documentId));

      if (updated.employeeId) {
        const rejectedPayload = {
          employeeId: updated.employeeId,
          workspaceId,
          documentType: updated.approvalType || 'compliance_document',
          documentName: decisionNotes || 'Compliance Document',
          reason: decisionNotes,
        };
        platformEventBus.emit('compliance_document_rejected', rejectedPayload); // keeps complianceScoringBridge listener
        platformEventBus.publish({ type: 'compliance_document_rejected', category: 'automation', title: 'Compliance Document Rejected', description: `Document '${decisionNotes || 'Compliance Document'}' rejected for employee ${updated.employeeId}. Reason: ${decisionNotes || 'N/A'}`, workspaceId, metadata: rejectedPayload }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));

        // Non-blocking: notify the employee directly via email + in-app
        (async () => {
          try {
            const [emp] = await db.select({ userId: employees.userId })
              .from(employees).where(eq(employees.id, updated.employeeId!)).limit(1);
            if (!emp?.userId) return; // no user account yet — skip
            const { universalNotificationEngine } = await import('../../services/universalNotificationEngine');
            await universalNotificationEngine.sendNotification({
              workspaceId,
              userId: emp.userId,
              type: 'compliance_rejected',
              title: 'Compliance Document Requires Attention',
              message: decisionNotes
                ? `Your ${updated.approvalType || 'compliance document'} was not approved. Reason: ${decisionNotes}. Please resubmit the correct documentation.`
                : `Your ${updated.approvalType || 'compliance document'} was not approved. Please resubmit the correct documentation.`,
              priority: 'high',
              severity: 'warning',
            });
          } catch (emailErr: unknown) {
            log.warn('[ComplianceApprovals] Employee rejection notification failed (non-blocking):', (emailErr instanceof Error ? emailErr.message : String(emailErr)));
          }
        })();
      }
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await db.insert(complianceAuditTrail).values({
      workspaceId,
      entityType: 'approval',
      entityId: approvalId,
      employeeId: updated.employeeId,
      documentId: updated.documentId,
      action: 'decide',
      actionCategory: 'update',
      performedBy: req.user?.id,
      ipAddress: req.ip,
      previousValue: { status: previousStatus },
      newValue: { status: updated.status, decision },
      severity: decision === 'rejected' ? 'warning' : 'info'
    });
    
    res.json({ success: true, approval: updated });
  } catch (error) {
    log.error("[Compliance Approvals] Error deciding approval:", error);
    res.status(500).json({ success: false, error: "Failed to process approval decision" });
  }
});

async function updateComplianceRecordCounts(recordId: string) {
  const checklists = await db.select().from(complianceChecklists)
    .where(eq(complianceChecklists.complianceRecordId, recordId));
  
  const total = checklists.length;
  const completed = checklists.filter(c => c.isCompleted).length;
  const pending = total - completed;
  const score = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  await db.update(employeeComplianceRecords)
    .set({
      totalRequirements: total,
      completedRequirements: completed,
      pendingRequirements: pending,
      complianceScore: score,
      overallStatus: completed === total ? 'complete' : 'incomplete',
      updatedAt: new Date()
    })
    .where(eq(employeeComplianceRecords.id, recordId));
}

export const approvalsRoutes = router;
