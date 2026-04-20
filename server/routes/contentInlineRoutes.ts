import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireOwner, requireManager, requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import {
  customRules,
  ruleExecutionLogs,
  reportAttachments, auditLogs,
  insertCustomRuleSchema,
  insertReportSubmissionSchema,
  documentSignatures,
} from '@shared/schema';
import { sql, eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { UPLOADS } from '../config/platformConfig';
import { sendReportDeliveryEmail } from "../services/emailCore";
import { ObjectStorageService, objectStorageClient } from "../objectStorage";
import { randomUUID } from "crypto";
import { createLogger } from '../lib/logger';
import { contractDocuments } from '@shared/schema';
const log = createLogger('ContentInlineRoutes');


const router = Router();

router.get("/customer-reports/:token", async (req, res) => {
  try {
    const { token } = req.params;
    
    const access = await storage.getCustomerReportAccessByToken(token);
    if (!access) {
      return res.status(404).json({ message: "Report not found or access expired" });
    }

    if (access.isRevoked || new Date() > new Date(access.expiresAt)) {
      return res.status(403).json({ message: "Access expired or revoked" });
    }

    await storage.trackCustomerReportAccess(access.id);

    const report = await storage.getReportSubmissionById(access.submissionId);
    res.json(report);
  } catch (error) {
    log.error("Error fetching customer report:", error);
    res.status(500).json({ message: "Failed to fetch report" });
  }
});

router.get("/client-reports", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const clients = await storage.getClientsByWorkspace(workspaceId);
    const matchingClient = clients.find(c => c.userId === userId);

    if (!matchingClient) {
      return res.json({
        reports: [],
        guardTours: [],
        dars: [],
        incidents: [],
        transparencyPdfs: [],
      });
    }

    const clientId = matchingClient.id;

    // 1. Existing report submissions (approved/delivered only)
    const allReports = await storage.getReportSubmissions(workspaceId);
    const reportsForClient = allReports.filter(r =>
      r.clientId === clientId &&
      (r.status === 'approved' || r.status === 'delivered')
    );
    const reports = await Promise.all(reportsForClient.map(async (report) => {
      let employeeName = 'Employee';
      if (report.employeeId) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const employee = await storage.getEmployee(report.employeeId);
        if (employee) {
          employeeName = `${employee.firstName} ${employee.lastName}`.trim() || 'Employee';
        }
      }
      return { ...report, employeeName };
    }));

    // Resolve site IDs for this client — every downstream query is filtered
    // by workspace_id + siteId set so other tenants' data is never surfaced.
    const siteRows = await db.execute(sql`
      SELECT id FROM sites
       WHERE workspace_id = ${workspaceId}
         AND client_id = ${clientId}
    `);
    const clientSiteIds: string[] = ((siteRows as any).rows || []).map((r: any) => r.id);

    // Helper: produce a SQL array literal for inArray-style filters without
    // dropping down to the dynamic drizzle `inArray` builder.
    const hasSites = clientSiteIds.length > 0;
    const sitesLiteral = sql.raw(
      `ARRAY[${clientSiteIds.map((id) => `'${String(id).replace(/'/g, "''")}'`).join(',') || "''"}]::text[]`
    );

    // 2. Completed guard tours for this client's sites (via shift→site linkage,
    //    since guard_tours doesn't carry site_id directly in current schema).
    const guardTours = hasSites
      ? ((await db.execute(sql`
          SELECT pt.id,
                 gt.name AS tour_name,
                 sh.site_id AS site_id,
                 pt.status,
                 pt.completed_at,
                 pt.completion_percentage,
                 emp.first_name || ' ' || COALESCE(emp.last_name, '') AS officer_name
            FROM patrol_tours pt
            LEFT JOIN guard_tours gt ON gt.id = pt.patrol_route_id
            LEFT JOIN shifts sh ON sh.id = pt.shift_id
            LEFT JOIN employees emp ON emp.id = pt.officer_id
           WHERE pt.workspace_id = ${workspaceId}
             AND pt.status = 'completed'
             AND sh.site_id = ANY(${sitesLiteral})
           ORDER BY pt.completed_at DESC NULLS LAST
           LIMIT 50
        `)) as any).rows
      : [];

    // 3. Approved DARs for this client's sites — includes pdf_url.
    const dars = hasSites
      ? ((await db.execute(sql`
          SELECT dar.id,
                 dar.id AS report_number,
                 s.name AS site_name,
                 dar.shift_start_time AS shift_date,
                 dar.employee_name,
                 dar.status,
                 dar.pdf_url,
                 dar.verified_at AS approved_at,
                 dar.photo_count,
                 dar.created_at
            FROM dar_reports dar
            LEFT JOIN shifts sh ON sh.id = dar.shift_id
            LEFT JOIN sites s ON s.id = sh.site_id
           WHERE dar.workspace_id = ${workspaceId}
             AND dar.status IN ('verified', 'sent')
             AND sh.site_id = ANY(${sitesLiteral})
           ORDER BY dar.created_at DESC
           LIMIT 100
        `)) as any).rows
      : [];

    // 4. Incidents — client-safe subset only (no internal investigation notes).
    const incidents = hasSites
      ? ((await db.execute(sql`
          SELECT ir.id,
                 ir.title,
                 ir.incident_type,
                 ir.severity,
                 ir.occurred_at,
                 ir.location_address AS location,
                 ir.status,
                 ir.site_id,
                 emp.first_name || ' ' || COALESCE(emp.last_name, '') AS officer_name
            FROM incident_reports ir
            LEFT JOIN employees emp ON emp.id::text = ir.reported_by
           WHERE ir.workspace_id = ${workspaceId}
             AND ir.status IN ('submitted', 'under_review', 'closed')
             AND ir.site_id::text = ANY(${sitesLiteral})
           ORDER BY ir.occurred_at DESC NULLS LAST
           LIMIT 50
        `)) as any).rows
      : [];

    // 5. Shift transparency PDFs — the client's primary proof-of-service.
    const transparencyPdfs = hasSites
      ? ((await db.execute(sql`
          SELECT dar.id,
                 dar.id AS report_number,
                 s.name AS site_name,
                 dar.shift_start_time AS shift_date,
                 dar.employee_name,
                 dar.pdf_url,
                 dar.photo_count,
                 dar.status
            FROM dar_reports dar
            LEFT JOIN shifts sh ON sh.id = dar.shift_id
            LEFT JOIN sites s ON s.id = sh.site_id
           WHERE dar.workspace_id = ${workspaceId}
             AND dar.pdf_url IS NOT NULL
             AND sh.site_id = ANY(${sitesLiteral})
           ORDER BY dar.created_at DESC
           LIMIT 30
        `)) as any).rows
      : [];

    res.json({ reports, guardTours, dars, incidents, transparencyPdfs });
  } catch (error) {
    log.error("Error fetching client reports:", error);
    res.status(500).json({ message: "Failed to fetch client reports" });
  }
});

router.get("/locked-reports", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { employeeId, clientId, startDate, endDate } = req.query;
    
    const filters: any = {};
    if (employeeId) filters.employeeId = employeeId;
    if (clientId) filters.clientId = clientId;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const lockedReports = await storage.getLockedReportRecords(workspaceId, filters);
    res.json(lockedReports);
  } catch (error) {
    log.error("Error fetching locked reports:", error);
    res.status(500).json({ message: "Failed to fetch locked reports" });
  }
});

router.get("/locked-reports/:id", requireAuth, async (req: any, res) => {
  try {
    const { id } = req.params;
    
    const lockedReport = await storage.getLockedReportBySubmission(id);
    if (!lockedReport) {
      return res.status(404).json({ message: "Locked report not found" });
    }

    res.json(lockedReport);
  } catch (error) {
    log.error("Error fetching locked report:", error);
    res.status(500).json({ message: "Failed to fetch locked report" });
  }
});

router.get("/report-analytics", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { employeeId, clientId, startDate, endDate, templateId } = req.query;
    
    const filters: any = {};
    if (employeeId) filters.employeeId = employeeId;
    if (clientId) filters.clientId = clientId;
    if (templateId) filters.templateId = templateId;
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    const { getReportAnalytics } = await import('../services/reportWorkflowEngine');
    const analytics = await getReportAnalytics(workspaceId, filters);

    res.json(analytics);
  } catch (error) {
    log.error("Error generating report analytics:", error);
    res.status(500).json({ message: "Failed to generate report analytics" });
  }
});

router.post("/contract-documents", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { insertContractDocumentSchema } = await import("@shared/schema");
    
    const validated = insertContractDocumentSchema.parse({
      ...req.body,
      workspaceId,
    });
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const { employeeId, documentType, signedAt, fileUrl, metadata } = validated;

    if (!['i9', 'w9', 'w4'].includes(documentType)) {
      return res.status(400).json({ message: 'Invalid document type. Must be i9, w9, or w4.' });
    }

    const { stagedShifts } = await import('@shared/schema');
    const [contract] = await db
      .insert(contractDocuments)
      .values({
        workspaceId,
        employeeId,
        documentType,
        signedAt: signedAt ? new Date(signedAt) : new Date(),
        status: 'pending',
        fileUrl,
        metadata,
      })
      .returning();

    res.json(contract);
  } catch (error: unknown) {
    log.error('Error creating contract document:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to create contract document' });
  }
});

router.put("/contract-documents/:id/status", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    const { status, reviewNotes } = req.body;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const userId = req.user?.id || (req.user)?.claims?.sub;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be approved or rejected.' });
    }

    const { stagedShifts } = await import('@shared/schema');
    const [updated] = await db
      .update(contractDocuments)
      .set({
        signedBy: userId,
        signedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contractDocuments.id, id),
          eq(contractDocuments.workspaceId, workspaceId)
        )
      )
      .returning();

    if (!updated) {
      return res.status(404).json({ message: 'Contract document not found' });
    }

    res.json(updated);
  } catch (error: unknown) {
    log.error('Error updating contract status:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to update contract status' });
  }
});

router.post("/custom-rules", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const validated = insertCustomRuleSchema.parse({
      ...req.body,
      workspaceId,
      createdBy: userId,
    });
    
    const rule = await db.insert(customRules).values(validated).returning();
    res.json(rule[0]);
  } catch (error: unknown) {
    log.error("Error creating custom rule:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create rule" });
  }
});

router.get("/custom-rules", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    
    const rules = await db
      .select()
      .from(customRules)
      .where(eq(customRules.workspaceId, workspaceId))
      .orderBy(desc(customRules.priority));
    
    res.json(rules);
  } catch (error: unknown) {
    log.error("Error fetching custom rules:", error);
    res.status(500).json({ message: "Failed to fetch rules" });
  }
});

router.patch("/custom-rules/:id", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id } = req.params;
    
    const existing = await db
      .select()
      .from(customRules)
      .where(and(eq(customRules.id, id), eq(customRules.workspaceId, workspaceId)))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Rule not found" });
    }
    
    if (existing[0].isLocked) {
      return res.status(403).json({ message: "Cannot edit locked rule" });
    }
    
    const { name, description, category, severity, conditions, actions, isActive, priority } = req.body;
    const safeRuleUpdates: Record<string, any> = { updatedBy: userId, updatedAt: new Date() };
    if (name !== undefined) safeRuleUpdates.name = name;
    if (description !== undefined) safeRuleUpdates.description = description;
    if (category !== undefined) safeRuleUpdates.category = category;
    if (severity !== undefined) safeRuleUpdates.severity = severity;
    if (conditions !== undefined) safeRuleUpdates.conditions = conditions;
    if (actions !== undefined) safeRuleUpdates.actions = actions;
    if (isActive !== undefined) safeRuleUpdates.isActive = isActive;
    if (priority !== undefined) safeRuleUpdates.priority = priority;
    const updated = await db
      .update(customRules)
      .set(safeRuleUpdates)
      .where(eq(customRules.id, id))
      .returning();
    
    res.json(updated[0]);
  } catch (error: unknown) {
    log.error("Error updating custom rule:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update rule" });
  }
});

router.delete("/custom-rules/:id", requireOwner, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const existing = await db
      .select()
      .from(customRules)
      .where(and(eq(customRules.id, id), eq(customRules.workspaceId, workspaceId)))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Rule not found" });
    }
    
    if (existing[0].isLocked) {
      return res.status(403).json({ message: "Cannot delete locked rule" });
    }
    
    await db.delete(customRules).where(and(eq(customRules.id, id), eq(customRules.workspaceId, workspaceId)));
    res.json({ success: true });
  } catch (error: unknown) {
    log.error("Error deleting custom rule:", error);
    res.status(500).json({ message: "Failed to delete rule" });
  }
});

router.get("/custom-rules/:id/executions", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { id } = req.params;
    
    const executions = await db
      .select()
      .from(ruleExecutionLogs)
      .where(and(
        eq(ruleExecutionLogs.ruleId, id),
        eq(ruleExecutionLogs.workspaceId, workspaceId)
      ))
      .orderBy(desc(ruleExecutionLogs.createdAt))
      .limit(100);
    
    res.json(executions);
  } catch (error: unknown) {
    log.error("Error fetching rule executions:", error);
    res.status(500).json({ message: "Failed to fetch executions" });
  }
});

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return {
    bucketName: pathParts[1],
    objectName: pathParts.slice(2).join("/"),
  };
}

router.post("/signatures", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspace = await storage.getWorkspaceByMembership(userId);
    
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const { signatureData, documentType, employeeId } = req.body;
    
    if (!signatureData || !documentType) {
      return res.status(400).json({ message: "Signature data and document type are required" });
    }

    if (!signatureData.startsWith('data:image/png;base64,')) {
      return res.status(400).json({ message: "Invalid signature format. Must be PNG image." });
    }

    const base64Data = signatureData.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const MAX_SIGNATURE_SIZE = UPLOADS.maxSignatureSizeBytes;
    if (buffer.length > MAX_SIGNATURE_SIZE) {
      return res.status(400).json({ message: `Signature too large. Maximum size is ${MAX_SIGNATURE_SIZE / 1024 / 1024}MB` });
    }

    const isPNG = buffer.length >= 8 && 
                  buffer[0] === 0x89 && 
                  buffer[1] === 0x50 && 
                  buffer[2] === 0x4E && 
                  buffer[3] === 0x47;
    if (!isPNG) {
      return res.status(400).json({ message: "Invalid PNG signature. Data appears corrupted or forged." });
    }

    const privateDir = process.env.PRIVATE_OBJECT_DIR;
    if (!privateDir) {
      log.error('PRIVATE_OBJECT_DIR environment variable not set');
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const user = await storage.getUser(userId);
    const fullName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'Unknown';

    const signatureId = randomUUID();
    const objectPath = `${privateDir}/signatures/${workspace.id}/${signatureId}.png`;
    const { bucketName, objectName } = parseObjectPath(objectPath);
    
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    
    await file.save(buffer, {
      metadata: {
        contentType: 'image/png',
        metadata: {
          workspaceId: workspace.id,
          userId: userId,
          documentType: documentType,
          signedByName: fullName,
          timestamp: new Date().toISOString(),
          immutable: 'true',
        },
      },
    });

    const cryptoModule = await import('crypto');
    const hash = cryptoModule.createHash('sha256').update(buffer).digest('hex');

    const signatureUrl = `/objects/signatures/${workspace.id}/${signatureId}.png`;

    const signatureRecord = await db.insert(documentSignatures).values({
      workspaceId: workspace.id,
      employeeId: employeeId || userId,
      documentType: documentType,
      documentTitle: `${documentType.replace(/_/g, ' ').toUpperCase()} - E-Signature`,
      status: 'signed',
      signatureData: hash,
      documentUrl: signatureUrl,
      signedByName: fullName,
      signedAt: new Date(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    }).returning();

    await db.insert(auditLogs).values({
      workspaceId: workspace.id,
      userId: userId,
      userName: fullName || 'system',
      userRole: req.user?.role || 'employee',
      rawAction: 'signature_captured',
      entityType: 'document_signature',
      entityId: signatureRecord[0].id,
      changesAfter: {
        documentType,
        signedByName: fullName,
        signatureUrl,
        hash,
        timestamp: new Date().toISOString(),
      },
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    res.json(signatureRecord[0]);
  } catch (error: unknown) {
    log.error("Error saving signature:", error);
    res.status(500).json({ message: sanitizeError(error) || "Failed to save signature" });
  }
});

export default router;
