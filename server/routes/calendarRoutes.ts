/**
 * Calendar API Routes - ICS Export and Calendar Integration
 */

import { Router, Response } from 'express';
import { requireAuth } from '../auth';
import { AuthenticatedRequest } from '../rbac';
import { 
  exportScheduleToICS, 
  exportTimesheetsToICS,
  generateCalendarSubscriptionUrls 
} from '../services/calendarService';
import { isFeatureEnabled } from '@shared/platformConfig';
import '../types';
import { db } from '../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export const calendarRouter = Router();

async function getEmployeeId(userId: string, workspaceId: string): Promise<string | null> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });
  return employee?.id || null;
}

calendarRouter.get('/schedule.ics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = req.query.employeeId as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const icsContent = await exportScheduleToICS(workspaceId, employeeId, startDate, endDate);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="coaileague-schedule.ics"');
    res.send(icsContent);
  } catch (error: any) {
    console.error('[Calendar] Export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export calendar' });
  }
});

calendarRouter.get('/my-schedule.ics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

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

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const icsContent = await exportScheduleToICS(workspaceId, employeeId, startDate, endDate);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="my-schedule.ics"');
    res.send(icsContent);
  } catch (error: any) {
    console.error('[Calendar] Export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export calendar' });
  }
});

calendarRouter.get('/timesheets.ics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace and user required' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    if (!employeeId) {
      return res.status(400).json({ error: 'No employee profile linked' });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const icsContent = await exportTimesheetsToICS(workspaceId, employeeId, startDate, endDate);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="timesheets.ics"');
    res.send(icsContent);
  } catch (error: any) {
    console.error('[Calendar] Timesheet export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export timesheets' });
  }
});

calendarRouter.get('/subscription-urls', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = userId ? await getEmployeeId(userId, workspaceId) : null;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const urls = generateCalendarSubscriptionUrls(baseUrl, workspaceId, employeeId || undefined);

    res.json({
      success: true,
      urls,
    });
  } catch (error: any) {
    console.error('[Calendar] Subscription URLs error:', error);
    res.status(500).json({ error: error.message });
  }
});

calendarRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({
      enabled: isFeatureEnabled('enableCalendarExport'),
      googleCalendarEnabled: isFeatureEnabled('enableGoogleCalendar'),
      importEnabled: isFeatureEnabled('enableCalendarImport'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
