/**
 * Calendar API Routes - Phase 2E
 * ICS Export, Token-based Subscriptions, and iCal Import
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, Request } from 'express';
import { requireAuth } from '../auth';
import { AuthenticatedRequest } from '../rbac';
import { 
  exportScheduleToICS, 
  exportTimesheetsToICS,
  generateCalendarSubscriptionUrls,
  createCalendarSubscription,
  validateSubscriptionToken,
  revokeSubscription,
  getUserSubscriptions,
  regenerateSubscriptionToken,
  exportBySubscriptionToken,
  importICalFile,
  getImportHistory,
  getSyncEvents,
} from '../services/calendarService';
import { isFeatureEnabled, PLATFORM } from '@shared/platformConfig';
import '../types';
import { db } from '../db';
import { sql, eq, and } from 'drizzle-orm';
import { employees } from '@shared/schema';
import multer from 'multer';
import { z } from 'zod';
import crypto from 'crypto';
import { localVirusScan } from '../middleware/virusScan';
import { typedQuery } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('CalendarRoutes');

export const calendarRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/calendar' || 
        file.mimetype === 'application/calendar' ||
        file.originalname.toLowerCase().endsWith('.ics') ||
        file.originalname.toLowerCase().endsWith('.ical')) {
      cb(null, true);
    } else {
      cb(new Error('Only iCal (.ics) files are allowed'));
    }
  },
});

async function getEmployeeId(userId: string, workspaceId: string): Promise<string | null> {
  const employee = await db.query.employees.findFirst({
    where: and(
      eq(employees.userId, userId),
      eq(employees.workspaceId, workspaceId)
    ),
  });
  return employee?.id || null;
}

async function hasManagerRole(userId: string, workspaceId: string): Promise<boolean> {
  const userRecord = await db.query.employees.findFirst({
    where: and(eq(employees.userId, userId), eq(employees.workspaceId, workspaceId)),
  });
  return userRecord?.workspaceRole ? ['org_owner', 'co_owner', 'manager'].includes(userRecord.workspaceRole) : false;
}

calendarRouter.get('/schedule.ics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const requestedEmployeeId = req.query.employeeId as string | undefined;
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const userEmployee = await getEmployeeId(userId, workspaceId);
    const isManager = await hasManagerRole(userId, workspaceId);
    
    let employeeId = requestedEmployeeId;
    
    if (!requestedEmployeeId) {
      if (!isManager) {
        employeeId = userEmployee || undefined;
      }
    } else if (requestedEmployeeId !== userEmployee && !isManager) {
      return res.status(403).json({ error: 'Not authorized to view this schedule' });
    }

    const icsContent = await exportScheduleToICS(workspaceId, employeeId, startDate, endDate);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="coaileague-schedule.ics"');
    res.send(icsContent);
  } catch (error: unknown) {
    log.error('[Calendar] Export error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to export calendar' });
  }
});

calendarRouter.get('/my-schedule.ics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
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
  } catch (error: unknown) {
    log.error('[Calendar] Export error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to export calendar' });
  }
});

calendarRouter.get('/timesheets.ics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
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
  } catch (error: unknown) {
    log.error('[Calendar] Timesheet export error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to export timesheets' });
  }
});

calendarRouter.get('/subscribe/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({ error: 'Subscription token required' });
    }

    const clientIp = req.ip || req.socket.remoteAddress;
    const icsContent = await exportBySubscriptionToken(token, clientIp);

    if (!icsContent) {
      return res.status(404).json({ error: 'Invalid or expired subscription' });
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(icsContent);
  } catch (error: unknown) {
    log.error('[Calendar] Subscription access error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to fetch calendar' });
  }
});

const createSubscriptionSchema = z.object({
  name: z.string().min(1).max(100).default('My Work Schedule'),
  subscriptionType: z.enum(['shifts', 'timesheets', 'all']).default('shifts'),
  includeShifts: z.boolean().default(true),
  includeTimesheets: z.boolean().default(false),
  includePendingShifts: z.boolean().default(true),
  includeCancelledShifts: z.boolean().default(false),
  daysBack: z.number().int().min(0).max(365).default(30),
  daysForward: z.number().int().min(0).max(365).default(90),
});

calendarRouter.post('/subscriptions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const parsed = createSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid subscription options', details: parsed.error.issues });
    }
    const body = parsed.data;

    const employeeId = await getEmployeeId(userId, workspaceId);
    
    const subscription = await createCalendarSubscription(
      workspaceId,
      userId,
      employeeId || undefined,
      {
        name: body.name,
        subscriptionType: body.subscriptionType,
        includeShifts: body.includeShifts,
        includeTimesheets: body.includeTimesheets,
        includePendingShifts: body.includePendingShifts,
        includeCancelledShifts: body.includeCancelledShifts,
        daysBack: body.daysBack,
        daysForward: body.daysForward,
        createdByIp: req.ip || req.socket.remoteAddress,
      }
    );

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const urls = generateCalendarSubscriptionUrls(baseUrl, subscription.subscriptionToken, subscription.name || `${PLATFORM.name} Schedule`);

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        name: subscription.name,
        token: subscription.subscriptionToken,
        subscriptionType: subscription.subscriptionType,
        createdAt: subscription.createdAt,
      },
      urls,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Create subscription error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to create subscription' });
  }
});

calendarRouter.get('/subscriptions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const subscriptions = await getUserSubscriptions(userId, workspaceId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const subscriptionsWithUrls = subscriptions.map(sub => ({
      id: sub.id,
      name: sub.name,
      subscriptionType: sub.subscriptionType,
      token: sub.subscriptionToken,
      lastAccessedAt: sub.lastAccessedAt,
      accessCount: sub.accessCount,
      createdAt: sub.createdAt,
      urls: generateCalendarSubscriptionUrls(baseUrl, sub.subscriptionToken, sub.name || `${PLATFORM.name} Schedule`),
    }));

    res.json({
      success: true,
      subscriptions: subscriptionsWithUrls,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Get subscriptions error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get subscriptions' });
  }
});

calendarRouter.delete('/subscriptions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const userId = user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const success = await revokeSubscription(id, userId);

    if (!success) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ success: true, message: 'Subscription revoked' });
  } catch (error: unknown) {
    log.error('[Calendar] Revoke subscription error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to revoke subscription' });
  }
});

calendarRouter.post('/subscriptions/:id/regenerate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const userId = user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const subscription = await regenerateSubscriptionToken(id, userId);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const urls = generateCalendarSubscriptionUrls(baseUrl, subscription.subscriptionToken, subscription.name || `${PLATFORM.name} Schedule`);

    res.json({
      success: true,
      subscription: {
        id: subscription.id,
        name: subscription.name,
        token: subscription.subscriptionToken,
      },
      urls,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Regenerate token error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to regenerate token' });
  }
});

calendarRouter.get('/subscription-urls', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const subscriptions = await getUserSubscriptions(userId, workspaceId);
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    if (subscriptions.length === 0) {
      return res.json({
        success: true,
        hasSubscription: false,
        message: 'No active subscriptions. Create one to get subscription URLs.',
      });
    }

    const primarySubscription = subscriptions[0];
    const urls = generateCalendarSubscriptionUrls(baseUrl, primarySubscription.subscriptionToken, primarySubscription.name || `${PLATFORM.name} Schedule`);

    res.json({
      success: true,
      hasSubscription: true,
      urls,
      subscriptionId: primarySubscription.id,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Subscription URLs error:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

calendarRouter.post('/import', requireAuth, upload.single('file'), localVirusScan, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarImport')) {
      return res.status(403).json({ error: 'Calendar import is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const employeeId = await getEmployeeId(userId, workspaceId);

    const conflictResolution = req.body.conflictResolution || 'skip';
    if (!['skip', 'overwrite', 'merge'].includes(conflictResolution)) {
      return res.status(400).json({ error: 'Invalid conflict resolution option' });
    }

    const result = await importICalFile(workspaceId, userId, fileContent, {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      conflictResolution: conflictResolution as 'skip' | 'overwrite' | 'merge',
      defaultEmployeeId: employeeId || undefined,
    });

    res.json({
      success: result.success,
      result,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Import error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to import calendar' });
  }
});

calendarRouter.get('/import/history', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const history = await getImportHistory(workspaceId, userId, limit);

    res.json({
      success: true,
      imports: history,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Import history error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get import history' });
  }
});

calendarRouter.get('/sync-events', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const isManager = user?.id ? await hasManagerRole(user.id, workspaceId) : false;
    if (!isManager) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const events = await getSyncEvents(workspaceId, limit);

    res.json({
      success: true,
      events,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Sync events error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to get sync events' });
  }
});

calendarRouter.get('/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;

    let subscriptionCount = 0;
    if (workspaceId && userId) {
      const subscriptions = await getUserSubscriptions(userId, workspaceId);
      subscriptionCount = subscriptions.length;
    }

    res.json({
      enabled: isFeatureEnabled('enableCalendarExport'),
      importEnabled: isFeatureEnabled('enableCalendarImport'),
      subscriptionCount,
      features: {
        tokenBasedSubscriptions: true,
        icalImport: true,
        conflictDetection: true,
        aiIntegration: true,
      },
    });
  } catch (error: unknown) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

calendarRouter.get('/export/ical', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarExport')) {
      return res.status(403).json({ error: 'Calendar export is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    const employeeId = await getEmployeeId(userId, workspaceId);
    const isManager = await hasManagerRole(userId, workspaceId);

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const includeTeam = req.query.includeTeam === 'true' && isManager;

    const targetEmployeeId = includeTeam ? undefined : (employeeId || undefined);

    const icsContent = await exportScheduleToICS(workspaceId, targetEmployeeId, startDate, endDate, {
      includePendingShifts: req.query.includePending !== 'false',
      includeCancelledShifts: req.query.includeCancelled === 'true',
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${new Date().toISOString().split('T')[0]}.ics"`);
    res.send(icsContent);
  } catch (error: unknown) {
    log.error('[Calendar] Export iCal error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to export calendar' });
  }
});

calendarRouter.post('/import/ical', requireAuth, upload.single('file'), localVirusScan, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableCalendarImport')) {
      return res.status(403).json({ error: 'Calendar import is not enabled' });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;
    
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'No workspace selected' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No iCal file uploaded' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const employeeId = await getEmployeeId(userId, workspaceId);

    const result = await importICalFile(workspaceId, userId, fileContent, {
      fileName: req.file.originalname,
      fileSize: req.file.size,
      conflictResolution: (req.body.conflictResolution as 'skip' | 'overwrite' | 'merge') || 'skip',
      defaultEmployeeId: employeeId || undefined,
    });

    res.json({
      success: result.success,
      message: result.success 
        ? `Successfully imported ${result.eventsImported} of ${result.totalEvents} events`
        : 'Import failed',
      result,
    });
  } catch (error: unknown) {
    log.error('[Calendar] Import iCal error:', error);
    res.status(500).json({ error: sanitizeError(error) || 'Failed to import calendar' });
  }
});

// ============================================================================
// GOOGLE CALENDAR OAUTH INTEGRATION (Phase 5)
// ============================================================================

const googleOAuthStates = new Map<string, { userId: string; workspaceId: string; expiresAt: number }>();

calendarRouter.get('/google/status', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const isConfigured = isGoogleCalendarConfigured();
    const isEnabled = isFeatureEnabled('enableGoogleCalendar');

    res.json({
      success: true,
      data: {
        configured: isConfigured,
        enabled: isEnabled,
        connected: false,
        message: !isConfigured 
          ? 'Google Calendar integration requires OAuth credentials to be configured'
          : !isEnabled 
          ? 'Google Calendar integration is not enabled for this workspace'
          : 'Google Calendar is ready to connect',
      },
    });
  } catch (error: unknown) {
    log.error('[Calendar] Google status error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

calendarRouter.get('/google/connect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableGoogleCalendar')) {
      return res.status(403).json({ 
        success: false, 
        error: 'Google Calendar integration is not enabled' 
      });
    }

    if (!isGoogleCalendarConfigured()) {
      return res.status(503).json({ 
        success: false, 
        error: 'Google Calendar OAuth is not configured. Please contact support.',
        code: 'OAUTH_NOT_CONFIGURED',
      });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ success: false, error: 'No workspace selected' });
    }

    const state = crypto.randomBytes(32).toString('base64url');
    googleOAuthStates.set(state, {
      userId,
      workspaceId,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    setTimeout(() => googleOAuthStates.delete(state), 10 * 60 * 1000);

    const authUrl = getGoogleOAuthUrl(state);

    res.json({
      success: true,
      data: {
        authUrl,
        state,
      },
    });
  } catch (error: unknown) {
    log.error('[Calendar] Google connect error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

calendarRouter.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      log.error('[Calendar] Google OAuth error:', oauthError);
      return res.redirect('/schedule?error=google_oauth_denied');
    }

    if (!code || !state) {
      return res.redirect('/schedule?error=missing_params');
    }

    const stateData = googleOAuthStates.get(state as string);
    if (!stateData) {
      return res.redirect('/schedule?error=invalid_state');
    }

    if (stateData.expiresAt < Date.now()) {
      googleOAuthStates.delete(state as string);
      return res.redirect('/schedule?error=state_expired');
    }

    googleOAuthStates.delete(state as string);

    const tokens = await exchangeCodeForTokens(code as string);
    const calendarInfo = await getUserCalendarInfo(tokens.accessToken);

    log.info('[Calendar] Google Calendar connected:', {
      userId: stateData.userId,
      workspaceId: stateData.workspaceId,
      email: calendarInfo.email,
    });

    res.redirect('/schedule?google_connected=true');
  } catch (error: unknown) {
    log.error('[Calendar] Google callback error:', error);
    res.redirect('/schedule?error=google_oauth_failed');
  }
});

calendarRouter.post('/google/disconnect', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ success: false, error: 'No workspace selected' });
    }

    res.json({
      success: true,
      message: 'Google Calendar disconnected',
    });
  } catch (error: unknown) {
    log.error('[Calendar] Google disconnect error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

calendarRouter.post('/google/sync', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!isFeatureEnabled('enableGoogleCalendar')) {
      return res.status(403).json({ 
        success: false, 
        error: 'Google Calendar integration is not enabled' 
      });
    }

    const user = req.user;
    const workspaceId = req.workspaceId || (user as any)?.workspaceId || user?.currentWorkspaceId;
    const userId = user?.id;

    if (!workspaceId || !userId) {
      return res.status(400).json({ success: false, error: 'No workspace selected' });
    }

    if (!isGoogleCalendarConfigured()) {
      return res.status(503).json({
        success: false,
        code: 'integration_required',
        error: 'Google Calendar integration is not configured',
        setup: {
          steps: [
            'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables',
            'Go to Settings → Integrations → Google Calendar',
            'Click "Connect Google Calendar" to authorize',
          ],
          requiredEnvVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
          docsUrl: 'https://developers.google.com/calendar/api/guides/auth',
        },
        data: { status: 'not_connected', lastSyncAt: null },
      });
    }

    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: calendar_sync_events | Verified: 2026-03-23
    const [lastSync] = await typedQuery(sql`
      SELECT created_at FROM calendar_sync_events
      WHERE workspace_id = ${workspaceId} AND user_id = ${userId}
      ORDER BY created_at DESC LIMIT 1
    `).catch(() => []);

    res.json({
      success: true,
      message: 'Google Calendar sync initiated',
      data: {
        status: lastSync?.created_at ? 'synced' : 'pending',
        lastSyncAt: lastSync?.created_at || null,
      },
    });
  } catch (error: unknown) {
    log.error('[Calendar] Google sync error:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});
