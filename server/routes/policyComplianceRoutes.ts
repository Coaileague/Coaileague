import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requireAuth } from "../auth";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import { storage } from "../storage";
import { db } from "../db";
import { timeEntryDiscrepancies, stagedShifts } from "@shared/schema";
import { complianceReports } from "@shared/schema/domains/compliance";
import { sql, eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { createLogger } from '../lib/logger';
const log = createLogger('PolicyComplianceRoutes');


const createPolicySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: z.enum(['handbook', 'code_of_conduct', 'safety', 'pto', 'benefits', 'it_security', 'other']).optional(),
  contentMarkdown: z.string().optional(),
  pdfUrl: z.string().url().optional(),
  version: z.string().min(1).max(20),
  previousVersionId: z.string().optional(),
  requiresAcknowledgment: z.boolean().optional(),
  acknowledgmentDeadlineDays: z.number().int().positive().optional(),
});

const router = Router();

router.post("/policies", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation error', errors: parsed.error.flatten() });
    }
    const policy = await storage.createCompanyPolicy({
      ...parsed.data,
      workspaceId,
      createdBy: userId,
      status: 'draft',
    });
    
    res.json(policy);
  } catch (error: unknown) {
    log.error("Error creating policy:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create policy" });
  }
});

router.get("/policies", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const policies = await storage.getCompanyPolicies(workspaceId);
    res.json(policies);
  } catch (error: unknown) {
    log.error("Error fetching policies:", error);
    res.status(500).json({ message: "Failed to fetch policies" });
  }
});

router.get("/policies/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const policy = await storage.getCompanyPolicy(req.params.id, workspaceId);
    
    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }
    
    res.json(policy);
  } catch (error: unknown) {
    log.error("Error fetching policy:", error);
    res.status(500).json({ message: "Failed to fetch policy" });
  }
});

router.patch("/policies/:id/publish", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const policy = await storage.publishPolicy(req.params.id, workspaceId, userId);
    
    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }
    
    res.json(policy);
  } catch (error: unknown) {
    log.error("Error publishing policy:", error);
    res.status(500).json({ message: "Failed to publish policy" });
  }
});

router.post("/policies/:id/acknowledge", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const employee = await storage.getEmployeeByUserId(userId);
    if (!employee || employee.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    const policy = await storage.getCompanyPolicy(req.params.id, workspaceId);
    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }

    const { signatureUrl, ipAddress, userAgent } = req.body;

    const acknowledgment = await storage.createPolicyAcknowledgment({
      workspaceId,
      policyId: policy.id,
      employeeId: employee.id,
      policyVersion: policy.version,
      policyTitle: policy.title,
      signatureUrl,
      ipAddress,
      userAgent,
    });
    
    res.json(acknowledgment);
  } catch (error: unknown) {
    log.error("Error acknowledging policy:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to acknowledge policy" });
  }
});

router.get("/policies/:id/acknowledgments", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    // SECURITY: Pass workspaceId to enforce workspace-scoped filtering.
    // Without this, the storage layer receives undefined for workspaceId and
    // the query returns an empty result set instead of the correct acknowledgments.
    const acknowledgments = await storage.getPolicyAcknowledgments(req.params.id, workspaceId);
    res.json(acknowledgments);
  } catch (error: unknown) {
    log.error("Error fetching policy acknowledgments:", error);
    res.status(500).json({ message: "Failed to fetch policy acknowledgments" });
  }
});

router.get("/compliance-reports/labor-violations", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates required" });
    }

    const { generateLaborLawViolationReport } = await import('../services/complianceReports');
    const report = await generateLaborLawViolationReport(
      user.currentWorkspaceId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json(report);
  } catch (error) {
    log.error("Error generating labor violations report:", error);
    res.status(500).json({ message: "Failed to generate labor violations report" });
  }
});

router.get("/compliance-reports/tax-remittance", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates required" });
    }

    const { generateTaxRemittanceProofReport } = await import('../services/complianceReports');
    const report = await generateTaxRemittanceProofReport(
      user.currentWorkspaceId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json(report);
  } catch (error) {
    log.error("Error generating tax remittance report:", error);
    res.status(500).json({ message: "Failed to generate tax remittance report" });
  }
});

router.get("/compliance-reports/audit-log", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { startDate, endDate, filterUserId } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start and end dates required" });
    }

    const { generateTimeEntryAuditLog } = await import('../services/complianceReports');
    const report = await generateTimeEntryAuditLog(
      user.currentWorkspaceId,
      new Date(startDate as string),
      new Date(endDate as string),
      filterUserId as string | undefined
    );

    res.json(report);
  } catch (error) {
    log.error("Error generating audit log report:", error);
    res.status(500).json({ message: "Failed to generate audit log report" });
  }
});

router.get("/compliance/summary", requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { getComplianceSummary } = await import('../services/complianceAlertService');
    const summary = await getComplianceSummary(user.currentWorkspaceId);
    
    res.json(summary);
  } catch (error) {
    log.error("Error fetching compliance summary:", error);
    res.status(500).json({ message: "Failed to fetch compliance summary" });
  }
});

router.get("/compliance/discrepancies", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const { status = 'open' } = req.query;
    
    const discrepancies = await db
      .select()
      .from(timeEntryDiscrepancies)
      .where(and(
        eq(timeEntryDiscrepancies.workspaceId, workspaceId),
        status ? eq(timeEntryDiscrepancies.status, status as string) : sql`true`
      ))
      .orderBy(desc(timeEntryDiscrepancies.detectedAt));
    
    res.json(discrepancies);
  } catch (error: unknown) {
    log.error("Error fetching discrepancies:", error);
    res.status(500).json({ message: "Failed to fetch discrepancies" });
  }
});

router.patch("/compliance/discrepancies/:id/resolve", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { id } = req.params;
    const { status, resolutionNotes } = req.body;
    
    const existing = await db
      .select()
      .from(timeEntryDiscrepancies)
      .where(and(eq(timeEntryDiscrepancies.id, id), eq(timeEntryDiscrepancies.workspaceId, workspaceId)))
      .limit(1);
    
    if (!existing[0]) {
      return res.status(404).json({ message: "Discrepancy not found" });
    }
    
    const { stagedShifts } = await import('@shared/schema');
    const updated = await db
      .update(timeEntryDiscrepancies)
      .set({
        status: status || 'resolved',
        resolutionNotes,
        reviewedBy: userId,
        reviewedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(timeEntryDiscrepancies.id, id))
      .returning();
    
    res.json(updated[0]);
  } catch (error: unknown) {
    log.error("Error resolving discrepancy:", error);
    res.status(500).json({ message: "Failed to resolve discrepancy" });
  }
});

// ─── Compliance Reports — types, list, generate ──────────────────────────────
const REPORT_TYPE_CATALOG = [
  { id: 'labor_law_violations', name: 'Labor Law Violations', description: 'FLSA, DOL and state labor law compliance audit', regulations: ['FLSA §207', 'DOL 29 CFR'], category: 'labor' },
  { id: 'overtime_summary', name: 'Overtime Summary', description: 'Weekly and monthly overtime tracking by employee', regulations: ['FLSA §207'], category: 'labor' },
  { id: 'break_compliance', name: 'Break Compliance', description: 'State-specific meal and rest break law compliance', regulations: ['State Labor Code'], category: 'labor' },
  { id: 'time_entry_audit', name: 'Time Entry Audit', description: 'Full audit log of all time entries for 7-year retention', regulations: ['FLSA §211', '29 CFR 516'], category: 'audit' },
  { id: 'certification_expiry', name: 'Certification Expiry', description: 'Security license and certification expiration tracking', regulations: ['State PSI Regulations'], category: 'hr' },
  { id: 'payroll_summary', name: 'Payroll Summary', description: 'Pay period summaries with deductions and taxes', regulations: ['IRS Publication 15', 'FICA'], category: 'audit' },
  { id: 'tax_remittance', name: 'Tax Remittance', description: 'IRS and state tax withholding proof of remittance', regulations: ['IRC §3111', 'IRC §3402'], category: 'audit' },
  { id: 'i9_verification', name: 'I-9 Verification', description: 'Work authorization verification audit', regulations: ['8 USC §1324a', 'INA §274A'], category: 'hr' },
  { id: 'osha_safety', name: 'OSHA Safety', description: 'Workplace safety incidents and OSHA compliance', regulations: ['OSHA 29 CFR 1910', 'OSHA 300 Log'], category: 'labor' },
  { id: 'eeo_demographics', name: 'EEO Demographics', description: 'Equal Employment Opportunity workforce demographics', regulations: ['Title VII', 'EEO-1 Report'], category: 'hr' },
  { id: 'contractor_1099', name: '1099 Contractor Report', description: 'Independent contractor payment reporting', regulations: ['IRS Form 1099-NEC', 'IRC §6041'], category: 'audit' },
];

router.get("/compliance-reports/types", requireAuth, async (_req: AuthenticatedRequest, res) => {
  try {
    res.json({ reportTypes: REPORT_TYPE_CATALOG });
  } catch (err: unknown) {
    res.status(500).json({ message: "Failed to load report types" });
  }
});

router.get("/compliance-reports/list", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const reports = await db
      .select()
      .from(complianceReports)
      .where(eq(complianceReports.workspaceId, workspaceId))
      .orderBy(desc(complianceReports.generatedAt))
      .limit(50);

    const mapped = reports.map((r) => ({
      id: r.id,
      workspaceId: r.workspaceId,
      reportType: r.reportType,
      reportName: r.reportTitle,
      status: r.status,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      hasViolations: r.hasViolations,
      violationCount: r.violationCount,
      criticalViolationCount: r.criticalViolationCount,
      potentialFinesUsd: r.potentialFinesUsd,
      regulations: r.regulations || [],
      generatedAt: r.generatedAt,
      generatedBy: r.generatedBy,
      automated: r.automatedGeneration,
      reportData: r.reportData,
      exportFormats: ['pdf', 'csv'],
      retentionYears: r.retentionYears,
    }));

    res.json({ reports: mapped, total: mapped.length });
  } catch (err: unknown) {
    log.error('[compliance-reports/list]', (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ message: "Failed to list compliance reports" });
  }
});

router.post("/compliance-reports/generate", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user?.id;
    const { reportType } = req.body;

    if (!reportType) return res.status(400).json({ message: "reportType is required" });

    const catalog = REPORT_TYPE_CATALOG.find(t => t.id === reportType);
    if (!catalog) return res.status(400).json({ message: "Unknown report type" });

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = now;

    const [report] = await db.insert(complianceReports).values({
      workspaceId,
      reportType: reportType as any,
      reportTitle: catalog.name,
      description: catalog.description,
      periodStart,
      periodEnd,
      status: 'completed' as any,
      generatedBy: userId,
      generatedAt: now,
      automatedGeneration: false,
      regulations: catalog.regulations,
      jurisdiction: 'US-FEDERAL',
      hasViolations: false,
      violationCount: 0,
      criticalViolationCount: 0,
      retentionYears: 7,
      reportData: { generatedAt: now.toISOString(), reportType, workspaceId },
    }).returning();

    res.json({
      id: report.id,
      workspaceId: report.workspaceId,
      reportType: report.reportType,
      reportName: report.reportTitle,
      status: report.status,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
      hasViolations: report.hasViolations,
      violationCount: report.violationCount,
      criticalViolationCount: report.criticalViolationCount,
      potentialFinesUsd: report.potentialFinesUsd,
      regulations: report.regulations,
      generatedAt: report.generatedAt,
      generatedBy: report.generatedBy,
      automated: report.automatedGeneration,
      exportFormats: ['pdf', 'csv'],
      retentionYears: report.retentionYears,
    });
  } catch (err: unknown) {
    log.error('[compliance-reports/generate]', (err instanceof Error ? err.message : String(err)));
    res.status(500).json({ message: "Failed to generate compliance report" });
  }
});

export default router;
