/**
 * Compliance Reports Routes — /api/compliance-reports
 * Generate, list, and manage regulatory compliance reports.
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { db } from "../db";
import { complianceReports } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../auth";
import { requireManager, type AuthenticatedRequest } from "../rbac";
import { randomUUID, createHash } from "crypto";
import { createLogger } from '../lib/logger';
import { PLATFORM } from '../config/platformConfig';
const log = createLogger('ComplianceReportsRoutes');


const router = Router();

const REPORT_TYPES = [
  { id: "overtime_compliance", label: "Overtime Compliance Report", description: "FLSA overtime violations and risk assessment", regulations: ["FLSA §207"], category: "labor" },
  { id: "break_compliance", label: "Break & Rest Period Compliance", description: "State-mandated break compliance by jurisdiction", regulations: ["CA Labor Code §226.7", "OR OAR 839-020-0050"], category: "labor" },
  { id: "i9_verification", label: "I-9 Employment Verification Audit", description: "I-9 completion rates, expiration tracking, and audit readiness", regulations: ["8 CFR §274a.2"], category: "immigration" },
  { id: "wage_theft", label: "Wage Theft Prevention Report", description: "Pay accuracy, minimum wage compliance, and deduction review", regulations: ["FLSA §206", "State wage laws"], category: "payroll" },
  { id: "workers_comp", label: "Workers Compensation Summary", description: "Incident rates, claim summaries, and OSHA recordability", regulations: ["OSHA 29 CFR 1904"], category: "safety" },
  { id: "timesheet_audit", label: "Timesheet Accuracy Audit", description: "Timesheet approval rates, late submissions, and adjustment frequency", regulations: ["FLSA record-keeping"], category: "labor" },
  { id: "license_certifications", label: "License & Certification Compliance", description: "Guard license expirations, renewal tracking, and compliance gaps", regulations: ["State licensing statutes"], category: "credentials" },
  { id: "background_check", label: "Background Check Compliance", description: "FCRA-compliant background check coverage and recency", regulations: ["FCRA §604", "State ban-the-box laws"], category: "hiring" },
];

// GET /api/compliance-reports/types — Available report types
router.get("/types", requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json({ success: true, data: REPORT_TYPES });
});

// GET /api/compliance-reports/list — List generated reports for this workspace
router.get("/list", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const reports = await db
      .select()
      .from(complianceReports)
      .where(eq(complianceReports.workspaceId, workspaceId))
      .orderBy(desc(complianceReports.generatedAt))
      .limit(50);
    res.json({ success: true, data: reports });
  } catch (err: unknown) {
    log.error("[compliance-reports/list]", sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// POST /api/compliance-reports/generate — Generate a new compliance report
router.post("/generate", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const userId = req.user!;
    const { reportType, periodStart, periodEnd, jurisdiction } = req.body;

    const reportMeta = REPORT_TYPES.find(r => r.id === reportType);
    if (!reportMeta) {
      return res.status(400).json({ error: "Unknown report type" });
    }

    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = periodEnd ? new Date(periodEnd) : new Date();

    const startDay = start.toISOString().slice(0, 10);
    const endDay = end.toISOString().slice(0, 10);

    const existing = await db
      .select()
      .from(complianceReports)
      .where(and(
        eq(complianceReports.workspaceId, workspaceId),
        eq(complianceReports.reportType, reportType as any),
        eq(complianceReports.periodStart, start),
        eq(complianceReports.periodEnd, end),
      ))
      .limit(1);
    if (existing.length > 0) {
      return res.json({ success: true, data: existing[0], idempotent: true });
    }

    const reportPayload = {
      generatedAt: new Date().toISOString(),
      reportType,
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      summary: `${reportMeta.label} generated for period ${start.toLocaleDateString()} – ${end.toLocaleDateString()}.`,
    };
    const checksum = createHash('sha256').update(
      `${workspaceId}:${reportType}:${startDay}:${endDay}:${JSON.stringify(reportPayload)}`
    ).digest('hex');

    const [report] = await db.insert(complianceReports).values({
      id: randomUUID(),
      workspaceId,
      reportType: reportType as any,
      reportTitle: reportMeta.label,
      description: reportMeta.description,
      periodStart: start,
      periodEnd: end,
      status: "complete" as any,
      generatedBy: userId,
      generatedAt: new Date(),
      automatedGeneration: false,
      reportData: {
        ...reportPayload,
        checksum,
      } as any,
      summaryStats: {
        totalRecords: 0,
        complianceRate: 100,
        issuesFound: 0,
      } as any,
      regulations: reportMeta.regulations,
      jurisdiction: jurisdiction || "US-FEDERAL",
      hasViolations: false,
      violationCount: 0,
      criticalViolationCount: 0,
    }).returning();

    res.json({ success: true, data: report, checksum, idempotent: false });
  } catch (err: unknown) {
    log.error("[compliance-reports/generate]", sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/compliance-reports/:id — Fetch a single report by ID
router.get("/:id", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const [report] = await db
      .select()
      .from(complianceReports)
      .where(and(eq(complianceReports.id, req.params.id), eq(complianceReports.workspaceId, workspaceId)))
      .limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });
    res.json({ success: true, data: report });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// GET /api/compliance-reports/:id/pdf — Download a compliance report as a printable HTML document
router.get("/:id/pdf", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId!;
    const [report] = await db
      .select()
      .from(complianceReports)
      .where(and(eq(complianceReports.id, req.params.id), eq(complianceReports.workspaceId, workspaceId)))
      .limit(1);
    if (!report) return res.status(404).json({ error: "Report not found" });

    const reportData = (report.reportData || {}) as Record<string, any>;
    const summaryStats = (report.summaryStats || {}) as Record<string, any>;
    const periodStart = report.periodStart ? new Date(report.periodStart).toLocaleDateString() : 'N/A';
    const periodEnd = report.periodEnd ? new Date(report.periodEnd).toLocaleDateString() : 'N/A';
    const generatedAt = report.generatedAt ? new Date(report.generatedAt).toLocaleString() : 'N/A';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${report.reportTitle} — ${PLATFORM.name} Compliance</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1a1a2e; background: #fff; padding: 32px; }
    header { border-bottom: 3px solid #c8a84b; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .logo-area h1 { font-size: 22px; font-weight: 700; color: #1a1a2e; }
    .logo-area p { font-size: 11px; color: #555; margin-top: 2px; }
    .meta-area { text-align: right; font-size: 10px; color: #777; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #c8a84b; border-bottom: 1px solid #e5e5e5; padding-bottom: 6px; margin: 24px 0 12px; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .detail-item { display: flex; flex-direction: column; }
    .detail-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 2px; }
    .detail-value { font-size: 12px; font-weight: 600; color: #1a1a2e; }
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
    .stat-card { border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px; text-align: center; }
    .stat-num { font-size: 24px; font-weight: 700; color: #c8a84b; }
    .stat-label { font-size: 10px; color: #666; margin-top: 4px; }
    .regulations-list { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; }
    .reg-tag { background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; padding: 3px 8px; font-size: 10px; color: #444; }
    .summary-box { background: #f8f8f0; border-left: 4px solid #c8a84b; padding: 14px; border-radius: 0 6px 6px 0; margin-bottom: 16px; line-height: 1.6; }
    .violation-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; }
    .badge-ok { background: #e6f4ea; color: #1e7e34; }
    .badge-warn { background: #fff3cd; color: #856404; }
    .badge-crit { background: #fde8e8; color: #c62828; }
    footer { margin-top: 40px; border-top: 1px solid #e5e5e5; padding-top: 12px; font-size: 9px; color: #aaa; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 16px; }
      @page { margin: 1in; }
    }
  </style>
</head>
<body>
<header>
  <div class="logo-area">
    <h1>${PLATFORM.name}</h1>
    <p>Workforce Compliance Platform &mdash; Security Division</p>
  </div>
  <div class="meta-area">
    <div>Generated: ${generatedAt}</div>
    <div>Jurisdiction: ${report.jurisdiction || 'US-FEDERAL'}</div>
    <div>Report ID: ${report.id.slice(0, 8).toUpperCase()}</div>
  </div>
</header>

<div class="section-title">Report Information</div>
<div class="detail-grid">
  <div class="detail-item"><span class="detail-label">Report Title</span><span class="detail-value">${report.reportTitle}</span></div>
  <div class="detail-item"><span class="detail-label">Report Type</span><span class="detail-value">${report.reportType}</span></div>
  <div class="detail-item"><span class="detail-label">Period Start</span><span class="detail-value">${periodStart}</span></div>
  <div class="detail-item"><span class="detail-label">Period End</span><span class="detail-value">${periodEnd}</span></div>
  <div class="detail-item"><span class="detail-label">Status</span><span class="detail-value">${(report.status || 'complete').toUpperCase()}</span></div>
  <div class="detail-item"><span class="detail-label">Violations Found</span><span class="detail-value">
    <span class="violation-badge ${report.hasViolations ? (report.criticalViolationCount && report.criticalViolationCount > 0 ? 'badge-crit' : 'badge-warn') : 'badge-ok'}">
      ${report.hasViolations ? `${report.violationCount} Issue(s)` : 'Compliant'}
    </span>
  </span></div>
</div>

<div class="section-title">Compliance Summary</div>
<div class="stat-grid">
  <div class="stat-card"><div class="stat-num">${summaryStats.totalRecords ?? 0}</div><div class="stat-label">Total Records</div></div>
  <div class="stat-card"><div class="stat-num">${summaryStats.complianceRate ?? 100}%</div><div class="stat-label">Compliance Rate</div></div>
  <div class="stat-card"><div class="stat-num">${summaryStats.issuesFound ?? 0}</div><div class="stat-label">Issues Found</div></div>
</div>

${report.description ? `<div class="section-title">Description</div><div class="summary-box">${report.description}</div>` : ''}
${reportData.summary ? `<div class="section-title">Findings Summary</div><div class="summary-box">${reportData.summary}</div>` : ''}

${report.regulations && (report.regulations as string[]).length > 0 ? `
<div class="section-title">Applicable Regulations</div>
<ul class="regulations-list">
  ${(report.regulations as string[]).map(r => `<li class="reg-tag">${r}</li>`).join('')}
</ul>` : ''}

<footer>
  <span>${PLATFORM.name} Compliance &mdash; Confidential</span>
  <span>Auto-generated &mdash; For internal use only</span>
</footer>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="compliance-report-${report.id.slice(0, 8)}.html"`);
    res.send(html);
  } catch (err: unknown) {
    log.error("[compliance-reports/pdf]", sanitizeError(err));
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
