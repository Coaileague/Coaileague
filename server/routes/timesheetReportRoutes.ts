/**
 * Timesheet Report API Routes
 */

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
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

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

timesheetReportRouter.get('/report', requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
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
  } catch (error: any) {
    console.error('[TimesheetReport] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate report' });
  }
});

timesheetReportRouter.get('/my-report', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('[TimesheetReport] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

timesheetReportRouter.get('/export/csv', requireAuth, requireManager, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
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
  } catch (error: any) {
    console.error('[TimesheetReport] CSV export error:', error);
    res.status(500).json({ error: error.message });
  }
});

timesheetReportRouter.get('/weekly', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    const report = await getWeeklyReport(workspaceId, date, employeeId || undefined);

    res.json({
      success: true,
      ...report,
    });
  } catch (error: any) {
    console.error('[TimesheetReport] Weekly error:', error);
    res.status(500).json({ error: error.message });
  }
});

timesheetReportRouter.get('/monthly', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const date = req.query.date ? new Date(req.query.date as string) : new Date();

    const report = await getMonthlyReport(workspaceId, date, employeeId || undefined);

    res.json({
      success: true,
      ...report,
    });
  } catch (error: any) {
    console.error('[TimesheetReport] Monthly error:', error);
    res.status(500).json({ error: error.message });
  }
});

timesheetReportRouter.get('/compliance', requireAuth, requireWorkspaceRole(['org_owner', 'org_admin']), async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    
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
  } catch (error: any) {
    console.error('[TimesheetReport] Compliance error:', error);
    res.status(500).json({ error: error.message });
  }
});
