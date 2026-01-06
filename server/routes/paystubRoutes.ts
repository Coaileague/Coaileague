/**
 * Paystub API Routes
 * ==================
 * Endpoints for generating and retrieving paystubs with PDF export.
 * Mobile-optimized with JSON data for app rendering and PDF for downloads.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { attachWorkspaceId, requireEmployee, requireManager, type AuthenticatedRequest } from '../rbac';
import { paystubService } from '../services/paystubService';
import { db } from '../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

/**
 * Get paystub data for mobile/web display (JSON)
 * Employee can view their own, manager can view team
 */
router.get('/api/paystubs/current', requireAuth, attachWorkspaceId, requireEmployee, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    const userId = authReq.user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    const employee = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, userId),
        eq(employees.workspaceId, workspaceId)
      ),
    });

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const paystub = await paystubService.getMobilePaystub(
      employee.id,
      workspaceId,
      startOfMonth,
      endOfMonth
    );

    if (!paystub) {
      return res.json({ message: 'No pay data for current period', data: null });
    }

    res.json({ data: paystub });
  } catch (error) {
    console.error('[Paystubs] Error fetching current paystub:', error);
    res.status(500).json({ message: 'Failed to fetch paystub' });
  }
});

/**
 * Validate date string format (YYYY-MM-DD)
 */
function isValidDateString(dateStr: string): boolean {
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

/**
 * Get paystub for specific pay period
 * Authorization: Employee can view own, managers can view team
 */
router.get('/api/paystubs/:employeeId/:startDate/:endDate', requireAuth, attachWorkspaceId, requireEmployee, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    const userId = authReq.user?.id;
    const { employeeId, startDate, endDate } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const requestingEmployee = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, userId || ''),
        eq(employees.workspaceId, workspaceId)
      ),
    });

    if (!requestingEmployee) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const isSelf = requestingEmployee.id === employeeId;
    const isManager = ['org_owner', 'org_admin', 'department_manager'].includes(requestingEmployee.workspaceRole || '');

    if (!isSelf && !isManager) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const paystub = await paystubService.getMobilePaystub(
      employeeId,
      workspaceId,
      new Date(startDate),
      new Date(endDate)
    );

    if (!paystub) {
      return res.json({ message: 'No pay data for this period', data: null });
    }

    res.json({ data: paystub });
  } catch (error) {
    console.error('[Paystubs] Error fetching paystub:', error);
    res.status(500).json({ message: 'Failed to fetch paystub' });
  }
});

/**
 * Generate and download PDF paystub
 */
router.get('/api/paystubs/:employeeId/:startDate/:endDate/pdf', requireAuth, attachWorkspaceId, requireEmployee, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    const userId = authReq.user?.id;
    const { employeeId, startDate, endDate } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    if (!isValidDateString(startDate) || !isValidDateString(endDate)) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD' });
    }

    const requestingEmployee = await db.query.employees.findFirst({
      where: and(
        eq(employees.userId, userId || ''),
        eq(employees.workspaceId, workspaceId)
      ),
    });

    if (!requestingEmployee) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const isSelf = requestingEmployee.id === employeeId;
    const isManager = ['org_owner', 'org_admin', 'department_manager'].includes(requestingEmployee.workspaceRole || '');

    if (!isSelf && !isManager) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const result = await paystubService.generatePaystub(
      employeeId,
      workspaceId,
      new Date(startDate),
      new Date(endDate),
      false
    );

    if (!result.success || !result.pdfBuffer) {
      return res.status(400).json({ message: result.error || 'Failed to generate paystub' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="paystub-${startDate}-${endDate}.pdf"`);
    res.send(result.pdfBuffer);
  } catch (error) {
    console.error('[Paystubs] Error generating PDF:', error);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

/**
 * Manager: Generate paystubs for team (batch)
 */
router.post('/api/paystubs/batch', requireAuth, attachWorkspaceId, requireManager, async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const workspaceId = authReq.workspaceId;
    const { startDate, endDate, employeeIds, sendNotifications } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ message: 'Workspace context required' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Pay period dates required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const results: { employeeId: string; success: boolean; error?: string }[] = [];

    const targetEmployees = employeeIds?.length > 0
      ? await db.query.employees.findMany({
          where: and(
            eq(employees.workspaceId, workspaceId),
          ),
        }).then(emps => emps.filter(e => employeeIds.includes(e.id)))
      : await db.query.employees.findMany({
          where: eq(employees.workspaceId, workspaceId),
        });

    for (const emp of targetEmployees) {
      const result = await paystubService.generatePaystub(
        emp.id,
        workspaceId,
        start,
        end,
        sendNotifications
      );
      results.push({
        employeeId: emp.id,
        success: result.success,
        error: result.error,
      });
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    res.json({
      message: `Generated ${successCount} paystubs${failCount > 0 ? `, ${failCount} failed` : ''}`,
      results,
      summary: { success: successCount, failed: failCount, total: results.length },
    });
  } catch (error) {
    console.error('[Paystubs] Batch generation error:', error);
    res.status(500).json({ message: 'Batch generation failed' });
  }
});

export default router;
