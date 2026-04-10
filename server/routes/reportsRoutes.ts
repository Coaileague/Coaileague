import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  employees,
  clients,
  shifts,
  invoices,
  timeEntries as timeEntriesTable,
  payrollRuns,
  autoReports,
  auditLogs,
  trainingCertifications,
  sites
} from '@shared/schema';
import { eq, and, gte, lte, lt, desc, count, sql } from "drizzle-orm";
import { z } from "zod";
import { format } from "date-fns";
import { requireAuth } from "../auth";
import { sumFinancialValues, toFinancialString, formatCurrency } from '../services/financialCalculator';
import { requireManager, requireSupervisor, requireAdmin, type AuthenticatedRequest } from "../rbac";
import { requireStarter, requireProfessional } from "../tierGuards";
import { emailService } from "../services/emailService";
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { getMeteredOpenAICompletion } from "../services/billing/universalAIBillingInterceptor";
import { createLogger } from '../lib/logger';
const log = createLogger('ReportsRoutes');


const router = Router();

router.post('/generate', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { reportType, startDate, endDate } = req.body;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspace = await storage.getWorkspaceByOwnerId(userId) || await storage.getWorkspaceByMembership(userId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const workspaceId = workspace.id;

    let reportData: any = {};

    switch (reportType) {
      case 'payroll-summary':
        const payrollRunsData = await db
          .select()
          .from(payrollRuns)
          .where(
            and(
              eq(payrollRuns.workspaceId, workspaceId),
              gte(payrollRuns.periodStart, new Date(startDate)),
              lte(payrollRuns.periodEnd, new Date(endDate))
            )
          );
        
        const totalPayrollStr = sumFinancialValues(payrollRunsData.map(r => toFinancialString(r.totalNetPay || '0')));
        reportData = {
          totalPayroll: totalPayrollStr,
          payrollCount: payrollRunsData.length,
          details: payrollRunsData.map(r => ({
            name: `Payroll Run ${format(new Date(r.periodStart), 'MMM d')} - ${format(new Date(r.periodEnd), 'MMM d')}`,
            value: formatCurrency(r.totalNetPay || '0'),
            details: `${r.status} - Processed ${r.processedAt ? format(new Date(r.processedAt), 'MMM d, yyyy') : 'N/A'}`,
            badge: r.status,
          })),
        };
        break;

      case 'time-tracking':
        const timeEntries = await db
          .select()
          .from(timeEntriesTable)
          .where(
            and(
              eq(timeEntriesTable.workspaceId, workspaceId),
              gte(timeEntriesTable.clockIn, new Date(startDate)),
              lte(timeEntriesTable.clockIn, new Date(endDate))
            )
          );
        
        reportData = {
          totalHours: timeEntries.reduce((sum, e) => sum + parseFloat(e.totalHours?.toString() || '0'), 0),
          activeEmployees: new Set(timeEntries.map(e => e.employeeId)).size,
          details: Object.entries(
            timeEntries.reduce((acc: any, e) => {
              if (!acc[e.employeeId]) acc[e.employeeId] = { hours: 0, count: 0 };
              acc[e.employeeId].hours += parseFloat(e.totalHours?.toString() || '0');
              acc[e.employeeId].count++;
              return acc;
            }, {})
          ).map(([empId, data]: [string, any]) => ({
            name: `Employee ${empId}`,
            value: `${data.hours.toFixed(2)} hrs`,
            details: `${data.count} time entries`,
          })),
        };
        break;

      case 'invoicing':
        const invoiceData = await db
          .select()
          .from(invoices)
          .where(
            and(
              eq(invoices.workspaceId, workspaceId),
              gte(invoices.createdAt, new Date(startDate)),
              lte(invoices.createdAt, new Date(endDate))
            )
          );
        
        reportData = {
          totalRevenue: invoiceData.reduce((sum, i) => sum + parseFloat(i.total?.toString() || '0'), 0),
          invoiceCount: invoiceData.length,
          details: invoiceData.map(i => ({
            name: i.invoiceNumber,
            value: `$${parseFloat(i.total?.toString() || '0').toFixed(2)}`,
            details: `Due ${i.dueDate ? format(new Date(i.dueDate), 'MMM d, yyyy') : 'N/A'}`,
            badge: i.status,
          })),
        };
        break;

      default:
        return res.status(400).json({ message: "Invalid report type" });
    }

    res.json(reportData);
  } catch (error: unknown) {
    log.error("Error generating report:", error);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

router.post('/share', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const { reportType, startDate, endDate, recipients, notes } = req.body;
    const workspaceId = req.workspaceId!;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    for (const email of recipients) {
      const reportId = `${reportType}-${new Date().getTime()}`;
      await storage.createAuditLog({
        workspaceId,
        userId,
        action: 'report_shared',
        entityType: 'company_report',
        entityId: reportId,
        metadata: {
          reportType,
          startDate,
          endDate,
          recipient: email,
          notes,
        },
      });

      const _reportEmail = emailService.buildReportDelivery(email, {
        reportNumber: reportId,
        reportTitle: reportType.replace(/_/g, ' ').toUpperCase(),
        clientName: email.split('@')[0],
      });
      NotificationDeliveryService.send({ type: 'report_delivery', workspaceId: workspaceId || 'system', recipientUserId: email, channel: 'email', body: _reportEmail })
        .catch(err => log.error(`[REPORT WORKFLOW] Failed to queue report email to ${email}:`, (err instanceof Error ? err.message : String(err))));
      
    }

    res.json({
      success: true,
      message: `Report shared with ${recipients.length} recipient(s)`,
    });
  } catch (error: unknown) {
    log.error("Error sharing report:", error);
    res.status(500).json({ message: "Failed to share report" });
  }
});

router.get('/billable-hours', requireSupervisor, requireStarter, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspace = await storage.getWorkspaceByOwnerId(req.user.id) || await storage.getWorkspaceByMembership(req.user.id);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const workspaceId = workspace.id;
    
    const filters = {
      workspaceId,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      clientId: req.query.clientId as string | undefined,
      employeeId: req.query.employeeId as string | undefined,
      limit: Math.min(Math.max(1, req.query.limit ? parseInt(req.query.limit as string) : 1000), 1000),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    
    const { getBillableHoursReport } = await import('../services/reportService');
    const report = await getBillableHoursReport(filters);
    
    res.json(report);
  } catch (error) {
    log.error('[Reports] Error generating billable hours report:', error);
    res.status(500).json({ message: 'Failed to generate billable hours report' });
  }
});

router.get('/payroll', requireManager, requireProfessional, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspace = await storage.getWorkspaceByOwnerId(req.user.id) || await storage.getWorkspaceByMembership(req.user.id);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const workspaceId = workspace.id;
    
    const filters = {
      workspaceId,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      employeeId: req.query.employeeId as string | undefined,
      limit: Math.min(Math.max(1, req.query.limit ? parseInt(req.query.limit as string) : 1000), 1000),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    
    const { getPayrollReport } = await import('../services/reportService');
    const report = await getPayrollReport(filters);
    
    res.json(report);
  } catch (error) {
    log.error('[Reports] Error generating payroll report:', error);
    res.status(500).json({ message: 'Failed to generate payroll report' });
  }
});

router.get('/client-summary', requireManager, requireStarter, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspace = await storage.getWorkspaceByOwnerId(req.user.id) || await storage.getWorkspaceByMembership(req.user.id);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const workspaceId = workspace.id;
    
    const filters = {
      workspaceId,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      clientId: req.query.clientId as string | undefined,
      limit: Math.min(Math.max(1, req.query.limit ? parseInt(req.query.limit as string) : 100), 1000),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    
    const { getClientSummaryReport } = await import('../services/reportService');
    const report = await getClientSummaryReport(filters);
    
    res.json(report);
  } catch (error) {
    log.error('[Reports] Error generating client summary report:', error);
    res.status(500).json({ message: 'Failed to generate client summary report' });
  }
});

router.get('/employee-activity', requireSupervisor, requireStarter, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspace = await storage.getWorkspaceByOwnerId(req.user.id) || await storage.getWorkspaceByMembership(req.user.id);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const workspaceId = workspace.id;
    
    const filters = {
      workspaceId,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      employeeId: req.query.employeeId as string | undefined,
      limit: Math.min(Math.max(1, req.query.limit ? parseInt(req.query.limit as string) : 1000), 1000),
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };
    
    const { getEmployeeActivityReport } = await import('../services/reportService');
    const report = await getEmployeeActivityReport(filters);
    
    res.json(report);
  } catch (error) {
    log.error('[Reports] Error generating employee activity report:', error);
    res.status(500).json({ message: 'Failed to generate employee activity report' });
  }
});

router.get('/audit-logs', requireManager, requireProfessional, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspace = await storage.getWorkspaceByOwnerId(req.user.id) || await storage.getWorkspaceByMembership(req.user.id);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }
    const workspaceId = workspace.id;
    
    const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 1000) : 100;
    const page = req.query.page ? Math.max(parseInt(req.query.page as string), 1) : 1;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : (page - 1) * limit;

    const filters = {
      workspaceId,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      action: req.query.action as string | undefined,
      limit,
      offset,
    };
    
    const { getAuditLogsReport } = await import('../services/reportService');
    const report = await getAuditLogsReport(filters);
    
    res.json(report);
  } catch (error) {
    log.error('[Reports] Error generating audit logs report:', error);
    res.status(500).json({ message: 'Failed to generate audit logs report' });
  }
});

router.post('/:id/generate-summary', requireAuth, async (req: any, res) => {
  try {
    const userId = req.user?.id || req.user?.claims?.sub;
    const user = await storage.getUser(userId);
    if (!user?.currentWorkspaceId) {
      return res.status(403).json({ message: "No workspace selected" });
    }

    const { id } = req.params;
    const { reportData, reportType } = req.body;

    const wsId = user.currentWorkspaceId;

    const prompt = `You are an executive summary generator for workforce management reports.

Report Type: ${reportType}
Report Data: ${JSON.stringify(reportData, null, 2)}

Generate a concise 3-paragraph executive summary in plain language:
1. Key Finding - What is the most important insight?
2. Primary Cause - What is driving this result?
3. Recommended Action - What should management do?

Keep it professional, actionable, and under 250 words.`;

    if (!wsId) {
      return res.status(400).json({ error: 'Workspace context required for report summary' });
    }
    const result = await getMeteredOpenAICompletion({
      workspaceId: wsId,
      userId: user.id,
      featureKey: 'report_summary',
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4o-mini',
      maxTokens: 500,
      temperature: 0.7,
    });

    if (result.blocked) {
      return res.status(402).json({ message: result.error || 'Insufficient credits' });
    }
    if (!result.success) {
      return res.status(500).json({ message: result.error || 'AI service error' });
    }

    const summary = result.content || 'Unable to generate summary';

    res.json({ summary });
  } catch (error) {
    log.error("Error generating AI summary:", error);
    res.status(500).json({ message: "Failed to generate AI summary" });
  }
});

router.get('/export', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { reportType, startDate, endDate, format: exportFormat } = req.query;
    if (!reportType) return res.status(400).json({ message: 'reportType is required' });

    let data: any[] = [];
    const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate as string) : new Date();

    if (reportType === 'employees' && workspaceId) {
      data = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
    } else if (reportType === 'shifts' && workspaceId) {
      data = await db.select().from(shifts).where(and(
        eq(shifts.workspaceId, workspaceId),
        gte(shifts.date, start.toISOString().split('T')[0]),
        lte(shifts.date, end.toISOString().split('T')[0])
      ));
    } else if (reportType === 'invoices' && workspaceId) {
      data = await db.select().from(invoices).where(eq(invoices.workspaceId, workspaceId));
    } else if (reportType === 'time_entries' && workspaceId) {
      data = await db.select().from(timeEntriesTable).where(eq(timeEntriesTable.workspaceId, workspaceId));
    } else if (reportType === 'audit_logs' && workspaceId) {
      data = await db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)).orderBy(desc(auditLogs.createdAt)).limit(1000);
    }

    if (exportFormat === 'csv') {
      if (data.length === 0) {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report.csv"`);
        return res.send('');
      }
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map(row => Object.values(row).map(v => {
        if (v instanceof Date) return `"${v.toISOString()}"`;
        return `"${String(v ?? '').replace(/"/g, '""')}"`;
      }).join(','));
      const csv = [headers, ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${reportType}_report.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, reportType, recordCount: data.length, data, generatedAt: new Date().toISOString() });
  } catch (error: unknown) {
    log.error('Error exporting report:', error);
    res.status(500).json({ message: 'Failed to export report' });
  }
});

router.post('/auto-generate', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId!;
    
    const schema = z.object({
      reportType: z.enum(['weekly_status', 'timesheet_summary', 'accomplishments']),
      period: z.string().optional(),
    });
    
    const validationResult = schema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        message: "Invalid request",
        errors: validationResult.error.errors
      });
    }

    const { reportType, period } = validationResult.data;

    const now = new Date();
    const weekNumber = Math.ceil((now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000));
    const currentPeriod = period || `week_${now.getFullYear()}_${String(weekNumber).padStart(2, '0')}`;

    let hoursWorked = 0;
    let tasksCompleted = 0;
    let meetingsAttended = 0;
    try {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const timeResults = await db.select({ totalMinutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntriesTable.clockOut} - ${timeEntriesTable.clockIn})) / 60), 0)` })
        .from(timeEntriesTable)
        .where(and(
          eq(timeEntriesTable.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(timeEntriesTable.userId, userId),
          gte(timeEntriesTable.clockIn, weekStart),
          lt(timeEntriesTable.clockIn, weekEnd)
        ));
      hoursWorked = Math.round((Number(timeResults[0]?.totalMinutes) || 0) / 60 * 10) / 10;

      const employee = await storage.getEmployeeByUserId(userId);
      if (employee) {
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const weekEndStr = weekEnd.toISOString().split('T')[0];
        const shiftResults = await db.select({ count: sql<number>`count(*)` })
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            eq(shifts.employeeId, employee.id),
            gte(shifts.date, weekStartStr),
            lt(shifts.date, weekEndStr),
            eq(shifts.status, 'completed')
          ));
        tasksCompleted = Number(shiftResults[0]?.count) || 0;
      }
    } catch (dataErr) {
      log.error("Error gathering report data, using defaults:", dataErr);
    }

    let summary = `This week summary for ${currentPeriod}`;
    const accomplishments: string[] = [];
    const blockers: string[] = [];
    const nextSteps: string[] = [];

    try {
      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace context required for report generation' });
      }
      const reportAiResult = await getMeteredOpenAICompletion({
        workspaceId,
        userId,
        featureKey: 'report_auto_gen',
        messages: [
          {
            role: 'system',
            content: `You are a professional status report generator. Create concise, professional weekly status reports.`
          },
          {
            role: 'user',
            content: `Generate a professional weekly status summary for an employee who worked ${hoursWorked} hours, completed ${tasksCompleted} tasks, and attended ${meetingsAttended} meetings. Keep it to 2-3 sentences.`
          }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 200,
      });

      if (reportAiResult.blocked) {
        return res.status(402).json({ message: reportAiResult.error || 'Insufficient credits' });
      }
      if (reportAiResult.success && reportAiResult.content) {
        summary = reportAiResult.content;
      }
    } catch (aiError) {
      log.error("AI generation failed, using fallback:", aiError);
    }

    const [report] = await db
      .insert(autoReports)
      .values({
        workspaceId,
        userId,
        reportType,
        period: currentPeriod,
        summary,
        accomplishments,
        blockers,
        nextSteps,
        hoursWorked: hoursWorked.toString(),
        tasksCompleted,
        meetingsAttended,
        status: 'draft',
      })
      .returning();

    res.json(report);
  } catch (error: unknown) {
    log.error("Error generating auto report:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/auto', requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.id;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const workspaceId = req.workspaceId!;

    const reports = await db
      .select()
      .from(autoReports)
      .where(
        and(
          eq(autoReports.workspaceId, workspaceId),
          eq(autoReports.userId, userId)
        )
      )
      .orderBy(desc(autoReports.createdAt))
      .limit(20);

    res.json(reports);
  } catch (error: unknown) {
    log.error("Error fetching auto reports:", error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

router.get('/company-data', requireAdmin, async (req: AuthenticatedRequest, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || (req.user)?.currentWorkspaceId;
    const { report, startDate, endDate } = req.query;
    const reportType = (report as string) || 'general';

    if (!workspaceId) {
      return res.json({ report: reportType, data: [], period: { startDate, endDate }, generated: new Date().toISOString() });
    }

    let data: any = {};

    if (reportType === 'general') {
      const [employeeCount] = await db
        .select({ value: count() })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));
      const [clientCount] = await db
        .select({ value: count() })
        .from(clients)
        .where(eq(clients.workspaceId, workspaceId));
      const [shiftCount] = await db
        .select({ value: count() })
        .from(shifts)
        .where(eq(shifts.workspaceId, workspaceId));
      const [timeEntryCount] = await db
        .select({ value: count() })
        .from(timeEntriesTable)
        .where(eq(timeEntriesTable.workspaceId, workspaceId));
      const [siteCount] = await db
        .select({ value: count() })
        .from(sites)
        .where(eq(sites.workspaceId, workspaceId));

      data = {
        employees: employeeCount?.value ?? 0,
        clients: clientCount?.value ?? 0,
        shifts: shiftCount?.value ?? 0,
        timeEntries: timeEntryCount?.value ?? 0,
        sites: siteCount?.value ?? 0,
      };
    } else if (reportType === 'financial') {
      const invoiceData = await db
        .select({
          totalAmount: sql<string>`COALESCE(SUM(CAST(${invoices.total} AS NUMERIC)), 0)`,
          paidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN CAST(${invoices.total} AS NUMERIC) ELSE 0 END), 0)`,
          pendingAmount: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'sent' OR ${invoices.status} = 'overdue' THEN CAST(${invoices.total} AS NUMERIC) ELSE 0 END), 0)`,
          invoiceCount: count(),
        })
        .from(invoices)
        .where(eq(invoices.workspaceId, workspaceId));

      data = {
        totalRevenue: invoiceData[0]?.totalAmount ?? '0',
        paidRevenue: invoiceData[0]?.paidAmount ?? '0',
        pendingRevenue: invoiceData[0]?.pendingAmount ?? '0',
        invoiceCount: invoiceData[0]?.invoiceCount ?? 0,
      };
    } else if (reportType === 'compliance') {
      const [certCount] = await db
        .select({ value: count() })
        .from(trainingCertifications)
        .where(eq(trainingCertifications.workspaceId, workspaceId));

      const [expiredCerts] = await db
        .select({ value: count() })
        .from(trainingCertifications)
        .where(
          and(
            eq(trainingCertifications.workspaceId, workspaceId),
            lt(trainingCertifications.expiryDate, new Date())
          )
        );

      data = {
        totalCertifications: certCount?.value ?? 0,
        expiredCertifications: expiredCerts?.value ?? 0,
        complianceRate: certCount?.value
          ? Math.round(((Number(certCount.value) - Number(expiredCerts?.value ?? 0)) / Number(certCount.value)) * 100)
          : 100,
      };
    }

    res.json({
      report: reportType,
      data,
      period: { startDate, endDate },
      generated: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
