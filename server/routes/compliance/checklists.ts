import { Router, Request, Response } from "express";
import { db } from "../../db";
import { pool } from "../../db";
import { 
  complianceChecklists,
  complianceRequirements,
  complianceDocuments,
  complianceDocumentTypes,
} from '@shared/schema';
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../../auth";
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('Checklists');


const router = Router();

router.get("/record/:recordId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { recordId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    const checklists = await db.select({
      checklist: complianceChecklists,
      requirement: complianceRequirements,
      document: complianceDocuments,
      documentType: complianceDocumentTypes
    })
      .from(complianceChecklists)
      .leftJoin(complianceRequirements, eq(complianceChecklists.requirementId, complianceRequirements.id))
      .leftJoin(complianceDocuments, eq(complianceChecklists.documentId, complianceDocuments.id))
      .leftJoin(complianceDocumentTypes, eq(complianceRequirements.documentTypeId, complianceDocumentTypes.id))
      .where(and(
        eq(complianceChecklists.workspaceId, workspaceId),
        eq(complianceChecklists.complianceRecordId, recordId)
      ))
      .orderBy(complianceRequirements.sortOrder);

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: employee_compliance_records | Verified: 2026-03-23
    const { rows: records } = await typedPool(
      `SELECT * FROM employee_compliance_records WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [recordId, workspaceId]
    );

    const total = checklists.length;
    const completed = checklists.filter(c => c.checklist.isCompleted).length;

    res.json({ 
      success: true, 
      checklists,
      record: records[0] || null,
      summary: {
        total,
        completed,
        pending: total - completed,
        score: total > 0 ? Math.round((completed / total) * 100) : 0
      }
    });
  } catch (error) {
    log.error("[Compliance Checklists] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch checklist" });
  }
});

router.get("/employee/:employeeId", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: employee_compliance_records | Verified: 2026-03-23
    const { rows: records } = await typedPool(
      `SELECT * FROM employee_compliance_records WHERE workspace_id = $1 AND employee_id = $2 ORDER BY created_at DESC`,
      [workspaceId, employeeId]
    );
    
    const result = [];
    
    for (const record of records) {
      const checklists = await db.select({
        checklist: complianceChecklists,
        requirement: complianceRequirements,
        document: complianceDocuments
      })
        .from(complianceChecklists)
        .leftJoin(complianceRequirements, eq(complianceChecklists.requirementId, complianceRequirements.id))
        .leftJoin(complianceDocuments, eq(complianceChecklists.documentId, complianceDocuments.id))
        .where(eq(complianceChecklists.complianceRecordId, record.id));
      
      const total = checklists.length;
      const completed = checklists.filter(c => c.checklist.isCompleted).length;

      result.push({
        record,
        checklists,
        summary: {
          total,
          completed,
          pending: total - completed,
          score: total > 0 ? Math.round((completed / total) * 100) : 0
        }
      });
    }
    
    res.json({ success: true, employeeCompliance: result });
  } catch (error) {
    log.error("[Compliance Checklists] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch employee checklist" });
  }
});

router.post("/:checklistId/override", requireAuth, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { checklistId } = req.params;
    const { overrideReason, overrideExpiresAt } = req.body;
    
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }
    
    if (!overrideReason) {
      return res.status(400).json({ success: false, error: "Override reason is required" });
    }
    
    const [updated] = await db.update(complianceChecklists)
      .set({
        isOverridden: true,
        overriddenBy: req.user?.id,
        overriddenAt: new Date(),
        overrideReason,
        overrideExpiresAt: overrideExpiresAt ? new Date(overrideExpiresAt) : undefined,
        isCompleted: true,
        completedAt: new Date(),
        completedBy: req.user?.id,
        updatedAt: new Date()
      })
      .where(and(
        eq(complianceChecklists.id, checklistId),
        eq(complianceChecklists.workspaceId, workspaceId)
      ))
      .returning();
    
    res.json({ success: true, checklist: updated });
  } catch (error) {
    log.error("[Compliance Checklists] Error overriding:", error);
    res.status(500).json({ success: false, error: "Failed to override checklist item" });
  }
});

export const checklistsRoutes = router;
