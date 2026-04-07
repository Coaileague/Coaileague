import { Router, Response } from "express";
import { z } from "zod";
import { db, pool } from "../../db";
import { 
  complianceDocuments,
  employees
} from '@shared/schema';
import { eq } from "drizzle-orm";
import { requireAuth } from "../../auth";
import type { AuthenticatedRequest } from "../../rbac";
import crypto from "crypto";
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('Records');


const createRecordSchema = z.object({
  employeeId: z.string().min(1),
  requirementType: z.string().min(1),
  requirementId: z.string().optional(),
  notes: z.string().optional(),
});

const q = (text: string, params?: any[]) => typedPool(text, params);

const router = Router();

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const records = await q(
      `SELECT ecr.*, e.first_name, e.last_name, e.email as employee_email
       FROM employee_compliance_records ecr
       LEFT JOIN employees e ON ecr.employee_id = e.id
       WHERE ecr.workspace_id = $1
       ORDER BY ecr.created_at DESC`,
      [workspaceId]
    );

    res.json({ success: true, records });
  } catch (error) {
    log.error("[Compliance Records] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch compliance records" });
  }
});

router.get("/employee/:employeeId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const records = await q(
      `SELECT * FROM employee_compliance_records
       WHERE workspace_id = $1 AND employee_id = $2
       ORDER BY created_at DESC
       LIMIT 500`,
      [workspaceId, employeeId]
    );

    res.json({ success: true, records });
  } catch (error) {
    log.error("[Compliance Records] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch employee compliance records" });
  }
});

router.post("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const parsed = createRecordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    }
    const { employeeId, requirementType, requirementId, notes } = parsed.data;
    const id = crypto.randomUUID();

    const rows = await q(
      `INSERT INTO employee_compliance_records (id, workspace_id, employee_id, requirement_id, requirement_type, status, notes)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6)
       RETURNING *`,
      [id, workspaceId, employeeId, requirementId || null, requirementType, notes || null]
    );

    res.json({ success: true, record: rows[0] });
  } catch (error) {
    log.error("[Compliance Records] Error creating record:", error);
    res.status(500).json({ success: false, error: "Failed to create compliance record" });
  }
});

router.get("/expiring", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { days = '30' } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const daysNum = parseInt(days as string, 10);
    const now = new Date();
    const futureDate = new Date(now.getTime() + daysNum * 24 * 60 * 60 * 1000);

    const documents = await db.select({
      document: complianceDocuments,
      employee: employees
    })
      .from(complianceDocuments)
      .leftJoin(employees, eq(complianceDocuments.employeeId, employees.id))
      .where(eq(complianceDocuments.workspaceId, workspaceId));

    const expiringDocs = documents.filter(d => {
      if (!d.document.expirationDate) return false;
      const expDate = new Date(d.document.expirationDate);
      return expDate <= futureDate && expDate > now;
    }).map(d => ({
      ...d,
      daysUntilExpiry: Math.ceil((new Date(d.document.expirationDate!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      isUrgent: Math.ceil((new Date(d.document.expirationDate!).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) <= 7
    })).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

    const expiredDocs = documents.filter(d => {
      if (!d.document.expirationDate) return false;
      return new Date(d.document.expirationDate) <= now;
    }).map(d => ({
      ...d,
      daysOverdue: Math.ceil((now.getTime() - new Date(d.document.expirationDate!).getTime()) / (24 * 60 * 60 * 1000))
    }));

    res.json({
      success: true,
      expiring: expiringDocs,
      expired: expiredDocs,
      summary: {
        expiringCount: expiringDocs.length,
        expiredCount: expiredDocs.length,
        urgentCount: expiringDocs.filter(d => d.isUrgent).length
      }
    });
  } catch (error) {
    log.error("[Compliance Records] Error fetching expiring documents:", error);
    res.status(500).json({ success: false, error: "Failed to fetch expiring documents" });
  }
});

router.get("/stats", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const [records, documents] = await Promise.all([
      q(`SELECT status FROM employee_compliance_records WHERE workspace_id = $1`, [workspaceId]),
      db.select().from(complianceDocuments).where(eq(complianceDocuments.workspaceId, workspaceId))
    ]);

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const expiringWithin30Days = documents.filter(d =>
      d.expirationDate && new Date(d.expirationDate) <= thirtyDaysFromNow && new Date(d.expirationDate) > now
    ).length;

    const expiringWithin90Days = documents.filter(d =>
      d.expirationDate && new Date(d.expirationDate) <= ninetyDaysFromNow && new Date(d.expirationDate) > now
    ).length;

    const stats = {
      totalEmployees: records.length,
      compliantEmployees: records.filter((r: any) => r.status === 'verified').length,
      pendingReview: records.filter((r: any) => r.status === 'pending').length,
      expiringWithin30Days,
      expiringWithin90Days,
      documentsUploaded: documents.length,
      documentsLocked: documents.filter(d => d.isLocked).length,
      documentsApproved: documents.filter(d => d.status === 'approved').length,
      documentsPending: documents.filter(d => d.status === 'pending').length
    };

    res.json({ success: true, stats });
  } catch (error) {
    log.error("[Compliance Records] Error fetching stats:", error);
    res.status(500).json({ success: false, error: "Failed to fetch stats" });
  }
});

export const recordsRoutes = router;
