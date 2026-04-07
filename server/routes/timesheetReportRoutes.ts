/**
 * Timesheet Report API Routes
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { requireWorkspaceRole, requireManager } from '../rbac';
import { 
  generateTimesheetReport, 
  generateCSV, 
  getWeeklyReport, 
  getMonthlyReport,
  getComplianceReport 
} from '../services/timesheetReportService';
import '../types';
import { db } from '../db';
import { employees, workspaces } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { format } from 'date-fns';
import { createLogger } from '../lib/logger';
const log = createLogger('TimesheetReportRoutes');


export const timesheetReportRouter = Router();

async function getEmployeeId(userId: string, workspaceId: string): Promise<string | null> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });
  return employee?.id || null;
}

timesheetReportRouter.get('/report', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const employeeId = req.query.employeeId as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;

    const report = await generateTimesheetReport({
      workspaceId,
      startDate,
      endDate,
      employeeId,
      clientId,
      status,
    });

    res.json({
      success: true,
      ...report,
    });
  } catch (error: unknown) {
    log.error('[TimesheetReport] Error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate report' });
  }
});

timesheetReportRouter.get('/my-report', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee profile linked' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const report = await generateTimesheetReport({
      workspaceId,
      startDate,
      endDate,
      employeeId,
    });

    res.json({
      success: true,
      ...report,
    });
  } catch (error: unknown) {
    log.error('[TimesheetReport] Error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

timesheetReportRouter.get('/export/csv', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const employeeId = req.query.employeeId as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;

    const report = await generateTimesheetReport({
      workspaceId,
      startDate,
      endDate,
      employeeId,
      clientId,
      status,
    });

    const csv = generateCSV(report.entries, report.summary);

    const filename = `timesheet-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error: unknown) {
    log.error('[TimesheetReport] CSV export error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

timesheetReportRouter.get('/weekly', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    // PRIVACY: Non-managers only see their own data
    // If no employee ID (not an employee), or viewing own data is fine
    // But if trying to view all data (employeeId undefined), must be manager
    const requestedEmployeeId = req.query.employeeId as string | undefined;

    // If specific employee requested and it's not self, require manager role
    if (requestedEmployeeId && requestedEmployeeId !== employeeId) {
      return res.status(403).json({ error: 'Cannot view other employees\' timesheets. Manager role required.' });
    }

    // Regular employees only see their own data
    const report = await getWeeklyReport(workspaceId, date, employeeId || undefined);

    res.json({
      success: true,
      ...report,
    });
  } catch (error: unknown) {
    log.error('[TimesheetReport] Weekly error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

timesheetReportRouter.get('/monthly', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    // PRIVACY: Non-managers only see their own data
    const requestedEmployeeId = req.query.employeeId as string | undefined;

    // If specific employee requested and it's not self, require manager role
    if (requestedEmployeeId && requestedEmployeeId !== employeeId) {
      return res.status(403).json({ error: 'Cannot view other employees\' timesheets. Manager role required.' });
    }

    // Regular employees only see their own data
    const report = await getMonthlyReport(workspaceId, date, employeeId || undefined);

    res.json({
      success: true,
      ...report,
    });
  } catch (error: unknown) {
    log.error('[TimesheetReport] Monthly error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

timesheetReportRouter.get('/compliance', requireWorkspaceRole(['org_owner', 'co_owner']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();

    const complianceReport = await getComplianceReport(workspaceId, startDate, endDate);

    res.json({
      success: true,
      ...complianceReport,
    });
  } catch (error: unknown) {
    log.error('[TimesheetReport] Compliance error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

timesheetReportRouter.get('/export/pdf', requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const employeeId = req.query.employeeId as string | undefined;
    const clientId = req.query.clientId as string | undefined;
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;

    const report = await generateTimesheetReport({
      workspaceId,
      startDate,
      endDate,
      employeeId,
      clientId,
      status,
    });

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    const doc = new PDFDocument({ margin: 50 });
    const filename = `timesheet-report-${format(startDate, 'yyyy-MM-dd')}-to-${format(endDate, 'yyyy-MM-dd')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    doc.pipe(res);

    doc.fontSize(20).text('Timesheet Report', { align: 'center' });
    doc.moveDown();
    
    doc.fontSize(12).text(`Organization: ${workspace?.name || 'Unknown'}`, { align: 'center' });
    doc.fontSize(10).text(`Period: ${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`, { align: 'center' });
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy h:mm a')}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(14).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Total Entries: ${report.summary.totalEntries}`);
    doc.text(`Total Hours: ${report.summary.totalHours.toFixed(2)}`);
    doc.text(`Regular Hours: ${report.summary.regularHours.toFixed(2)}`);
    doc.text(`Overtime Hours: ${report.summary.overtimeHours.toFixed(2)}`);
    if (report.summary.breakDeductions) {
      doc.text(`Break Deductions: ${report.summary.breakDeductions.toFixed(2)} hours`);
    }
    doc.text(`Status: Approved (${report.summary.statusBreakdown?.approved || 0}) | Pending (${report.summary.statusBreakdown?.pending || 0}) | Rejected (${report.summary.statusBreakdown?.rejected || 0})`);
    doc.moveDown(2);

    doc.fontSize(14).text('Time Entries', { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const tableLeft = 50;
    const colWidths = [120, 100, 80, 60, 60, 70];
    const headers = ['Employee', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Status'];

    doc.fontSize(9).font('Helvetica-Bold');
    let xPos = tableLeft;
    headers.forEach((header, i) => {
      doc.text(header, xPos, tableTop, { width: colWidths[i], align: 'left' });
      xPos += colWidths[i];
    });
    
    doc.moveTo(tableLeft, tableTop + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), tableTop + 15).stroke();
    doc.moveDown();

    doc.font('Helvetica').fontSize(8);
    let yPos = tableTop + 20;
    const maxRowsPerPage = 35;
    let rowCount = 0;

    for (const entry of report.entries.slice(0, 100)) {
      if (rowCount >= maxRowsPerPage || yPos > 700) {
        doc.addPage();
        yPos = 50;
        rowCount = 0;
        
        doc.fontSize(9).font('Helvetica-Bold');
        let hdrX = tableLeft;
        headers.forEach((header, i) => {
          doc.text(header, hdrX, yPos, { width: colWidths[i], align: 'left' });
          hdrX += colWidths[i];
        });
        doc.moveTo(tableLeft, yPos + 15).lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0), yPos + 15).stroke();
        yPos += 20;
        doc.font('Helvetica').fontSize(8);
      }

      const clockIn = entry.clockIn ? new Date(entry.clockIn) : null;
      const clockOut = entry.clockOut ? new Date(entry.clockOut) : null;

      const rowData = [
        entry.employeeName || 'Unknown',
        clockIn ? format(clockIn, 'MMM d, yyyy') : '-',
        clockIn ? format(clockIn, 'h:mm a') : '-',
        clockOut ? format(clockOut, 'h:mm a') : 'Active',
        entry.totalHours ? parseFloat(entry.totalHours.toString()).toFixed(2) : '-',
        entry.status || 'pending',
      ];

      xPos = tableLeft;
      rowData.forEach((data, i) => {
        doc.text(data, xPos, yPos, { width: colWidths[i], align: 'left' });
        xPos += colWidths[i];
      });

      yPos += 15;
      rowCount++;
    }

    if (report.entries.length > 100) {
      doc.moveDown();
      doc.fontSize(9).text(`... and ${report.entries.length - 100} more entries`, { align: 'center', oblique: true });
    }

    doc.end();
  } catch (error: unknown) {
    log.error('[TimesheetReport] PDF export error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to generate PDF' });
  }
});
