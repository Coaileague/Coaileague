/**
 * Calendar Export/Import Service - Phase 2E
 * Handles ICS export, token-based subscriptions, and iCal import
 */

import { db } from '../db';
import { 
  shifts, 
  employees, 
  clients, 
  calendarSubscriptions,
  calendarImports,
  calendarSyncEvents,
  type CalendarSubscription,
  type InsertCalendarSubscription,
  type InsertCalendarImport,
  type Shift
} from '@shared/schema';
import { eq, and, gte, lte, or, sql } from 'drizzle-orm';
import { isFeatureEnabled } from '@shared/platformConfig';
import { format, addHours, parseISO, subDays, addDays } from 'date-fns';
import crypto from 'crypto';
import icalGenerator from 'ical-generator';
import nodeIcal from 'node-ical';

interface CalendarEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  reminder?: number;
  status?: string;
  categories?: string[];
}

interface ImportResult {
  success: boolean;
  totalEvents: number;
  eventsImported: number;
  eventsSkipped: number;
  eventsFailed: number;
  conflictsDetected: number;
  errors: string[];
  importedShiftIds: string[];
}

interface ConflictInfo {
  existingShiftId: string;
  existingShift: {
    title: string;
    startTime: Date;
    endTime: Date;
  };
  importedEvent: {
    title: string;
    startTime: Date;
    endTime: Date;
  };
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function formatICSDate(date: Date, allDay?: boolean): string {
  if (allDay) {
    return format(date, "yyyyMMdd");
  }
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}

export function generateICS(events: CalendarEvent[], calendarName: string = `${process.env.PLATFORM_NAME || 'CoAIleague'} Schedule`): string {
  const calendar = icalGenerator({
    name: calendarName,
    prodId: { company: process.env.PLATFORM_NAME || 'CoAIleague', product: 'Workforce Management' },
    timezone: 'UTC',
  });

  for (const event of events) {
    const icalEvent = calendar.createEvent({
      id: event.uid,
      start: event.start,
      end: event.end,
      summary: event.title,
      description: event.description,
      location: event.location,
      allDay: event.allDay,
    });

    if (event.reminder && event.reminder > 0) {
      icalEvent.createAlarm({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        type: 'display',
        trigger: event.reminder * 60,
      });
    }

    if (event.categories && event.categories.length > 0) {
      icalEvent.categories(event.categories.map(c => ({ name: c })));
    }
  }

  return calendar.toString();
}

export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createCalendarSubscription(
  workspaceId: string,
  userId: string,
  employeeId?: string,
  options?: Partial<InsertCalendarSubscription>
): Promise<CalendarSubscription> {
  const token = generateSecureToken();
  
  const subscription = await db.transaction(async (tx) => {
    const [newSub] = await tx.insert(calendarSubscriptions).values({
      workspaceId,
      userId,
      employeeId: employeeId || null,
      subscriptionToken: token,
      subscriptionType: options?.subscriptionType || 'shifts',
      includeShifts: options?.includeShifts ?? true,
      includeTimesheets: options?.includeTimesheets ?? false,
      includePendingShifts: options?.includePendingShifts ?? true,
      includeCancelledShifts: options?.includeCancelledShifts ?? false,
      daysBack: options?.daysBack ?? 30,
      daysForward: options?.daysForward ?? 90,
      refreshIntervalMinutes: options?.refreshIntervalMinutes ?? 15,
      name: options?.name || 'My Work Schedule',
      isActive: true,
      createdByIp: options?.createdByIp,
    }).returning();
    await tx.insert(calendarSyncEvents).values({
      workspaceId,
      userId,
      eventType: 'subscribe',
      subscriptionId: newSub.id,
      description: `Calendar subscription created: ${newSub.name}`,
      metadata: { subscriptionType: newSub.subscriptionType },
    });
    return newSub;
  });

  return subscription;
}

export async function validateSubscriptionToken(token: string): Promise<CalendarSubscription | null> {
  const subscription = await db.query.calendarSubscriptions.findFirst({
    where: and(
      eq(calendarSubscriptions.subscriptionToken, token),
      eq(calendarSubscriptions.isActive, true)
    ),
  });

  if (!subscription) return null;

  if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
    return null;
  }

  await db.update(calendarSubscriptions)
    .set({
      lastAccessedAt: new Date(),
      accessCount: sql`${calendarSubscriptions.accessCount} + 1`,
    })
    .where(eq(calendarSubscriptions.id, subscription.id));

  return subscription;
}

export async function revokeSubscription(subscriptionId: string, userId: string): Promise<boolean> {
  let subscription: CalendarSubscription | null = null;
  await db.transaction(async (tx) => {
    const [sub] = await tx.update(calendarSubscriptions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(calendarSubscriptions.id, subscriptionId),
        eq(calendarSubscriptions.userId, userId)
      ))
      .returning();
    if (sub) {
      subscription = sub;
      await tx.insert(calendarSyncEvents).values({
        workspaceId: sub.workspaceId,
        userId,
        eventType: 'unsubscribe',
        subscriptionId: sub.id,
        description: `Calendar subscription revoked: ${sub.name}`,
      });
    }
  });

  return !!subscription;
}

export async function getUserSubscriptions(userId: string, workspaceId: string): Promise<CalendarSubscription[]> {
  return db.query.calendarSubscriptions.findMany({
    where: and(
      eq(calendarSubscriptions.userId, userId),
      eq(calendarSubscriptions.workspaceId, workspaceId),
      eq(calendarSubscriptions.isActive, true)
    ),
  });
}

export async function regenerateSubscriptionToken(subscriptionId: string, userId: string): Promise<CalendarSubscription | null> {
  const newToken = generateSecureToken();
  
  const [subscription] = await db.update(calendarSubscriptions)
    .set({ 
      subscriptionToken: newToken, 
      updatedAt: new Date(),
      accessCount: 0,
      lastAccessedAt: null,
    })
    .where(and(
      eq(calendarSubscriptions.id, subscriptionId),
      eq(calendarSubscriptions.userId, userId)
    ))
    .returning();

  return subscription || null;
}

export async function exportScheduleToICS(
  workspaceId: string,
  employeeId?: string,
  startDate?: Date,
  endDate?: Date,
  options?: {
    includePendingShifts?: boolean;
    includeCancelledShifts?: boolean;
  }
): Promise<string> {
  if (!isFeatureEnabled('enableCalendarExport')) {
    throw new Error('Calendar export is not enabled');
  }

  const start = startDate || new Date();
  const end = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const statusFilters = ['published', 'scheduled', 'in_progress', 'completed'];
  if (options?.includePendingShifts !== false) {
    statusFilters.push('draft');
  }

  let query = db
    .select()
    .from(shifts)
    .leftJoin(employees, eq(shifts.employeeId, employees.id))
    .leftJoin(clients, eq(shifts.clientId, clients.id))
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      gte(shifts.startTime, start),
      lte(shifts.startTime, end),
      employeeId ? eq(shifts.employeeId, employeeId) : undefined
    ));

  const scheduleShifts = await query;

  const filteredShifts = scheduleShifts.filter(row => {
    const status = row.shifts.status;
    if (!options?.includeCancelledShifts && status === 'cancelled') return false;
    return statusFilters.includes(status || 'draft');
  });

  // @ts-expect-error — TS migration: fix in refactoring sprint
  const events: CalendarEvent[] = filteredShifts.map(row => {
    const shift = row.shifts;
    const employee = row.employees;
    const client = row.clients;
    
    const startDateTime = new Date(shift.startTime);
    const endDateTime = new Date(shift.endTime);

    const employeeName = employee 
      ? `${employee.firstName} ${employee.lastName}`
      : 'Unassigned';
    
    const clientName = client?.companyName || '';
    
    const descriptionParts = [];
    if (shift.title) descriptionParts.push(`Shift: ${shift.title}`);
    if (shift.description) descriptionParts.push(shift.description);
    if (shift.status) descriptionParts.push(`Status: ${shift.status}`);
    if (client?.address) descriptionParts.push(`Address: ${client.address}`);
    
    return {
      uid: `shift-${shift.id}@coaileague.com`,
      title: employeeId 
        ? `Work Shift${clientName ? ` - ${clientName}` : ''}`
        : `${employeeName}${clientName ? ` @ ${clientName}` : ''}`,
      description: descriptionParts.join('\n'),
      location: clientName || undefined,
      start: startDateTime,
      end: endDateTime,
      reminder: 30,
      status: shift.status,
      categories: shift.category ? [shift.category] : undefined,
    };
  });

  const calendarName = employeeId 
    ? 'My CoAIleague Schedule' 
    : 'CoAIleague Team Schedule';

  return generateICS(events, calendarName);
}

export async function exportTimesheetsToICS(
  workspaceId: string,
  employeeId: string,
  startDate?: Date,
  endDate?: Date
): Promise<string> {
  if (!isFeatureEnabled('enableCalendarExport')) {
    throw new Error('Calendar export is not enabled');
  }

  const { timeEntries } = await import('@shared/schema');
  
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const end = endDate || new Date();

  const entries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.workspaceId, workspaceId),
      eq(timeEntries.employeeId, employeeId),
      gte(timeEntries.clockIn, start),
      lte(timeEntries.clockIn, end)
    ),
  });

  const events: CalendarEvent[] = entries.map(entry => ({
    uid: `timeentry-${entry.id}@coaileague.com`,
    title: 'Work Hours',
    description: entry.notes || undefined,
    start: new Date(entry.clockIn),
    end: entry.clockOut ? new Date(entry.clockOut) : addHours(new Date(entry.clockIn), 1),
  }));

  return generateICS(events, 'CoAIleague Time Entries');
}

export async function exportBySubscriptionToken(token: string, clientIp?: string): Promise<string | null> {
  const subscription = await validateSubscriptionToken(token);
  if (!subscription) return null;

  if (clientIp) {
    await db.update(calendarSubscriptions)
      .set({ lastAccessedFromIp: clientIp })
      .where(eq(calendarSubscriptions.id, subscription.id));
  }

  const startDate = subDays(new Date(), subscription.daysBack || 30);
  const endDate = addDays(new Date(), subscription.daysForward || 90);

  return exportScheduleToICS(
    subscription.workspaceId,
    subscription.employeeId || undefined,
    startDate,
    endDate,
    {
      includePendingShifts: subscription.includePendingShifts || false,
      includeCancelledShifts: subscription.includeCancelledShifts || false,
    }
  );
}

async function detectConflicts(
  workspaceId: string,
  employeeId: string | null,
  startTime: Date,
  endTime: Date
): Promise<Shift[]> {
  if (!employeeId) return [];

  const conflicts = await db.query.shifts.findMany({
    where: and(
      eq(shifts.workspaceId, workspaceId),
      eq(shifts.employeeId, employeeId),
      or(
        and(gte(shifts.startTime, startTime), lte(shifts.startTime, endTime)),
        and(gte(shifts.endTime, startTime), lte(shifts.endTime, endTime)),
        and(lte(shifts.startTime, startTime), gte(shifts.endTime, endTime))
      )
    ),
  });

  return conflicts;
}

export async function importICalFile(
  workspaceId: string,
  userId: string,
  fileContent: string,
  options?: {
    fileName?: string;
    fileSize?: number;
    conflictResolution?: 'skip' | 'overwrite' | 'merge';
    defaultEmployeeId?: string;
  }
): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    totalEvents: 0,
    eventsImported: 0,
    eventsSkipped: 0,
    eventsFailed: 0,
    conflictsDetected: 0,
    errors: [],
    importedShiftIds: [],
  };

  const [importRecord] = await db.insert(calendarImports).values({
    workspaceId,
    userId,
    fileName: options?.fileName,
    fileSize: options?.fileSize,
    sourceType: 'file',
    status: 'processing',
    conflictResolution: options?.conflictResolution || 'skip',
    startedAt: new Date(),
  }).returning();

  try {
    const parsedCal = await nodeIcal.async.parseICS(fileContent);
    
    const events = Object.values(parsedCal).filter(
      (item): item is nodeIcal.VEvent => item.type === 'VEVENT'
    );

    result.totalEvents = events.length;

    for (const event of events) {
      try {
        if (!event.start || !event.end) {
          result.eventsSkipped++;
          result.errors.push(`Event "${event.summary}" skipped: missing start or end time`);
          continue;
        }

        const startTime = new Date(event.start);
        const endTime = new Date(event.end);

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
          result.eventsSkipped++;
          result.errors.push(`Event "${event.summary}" skipped: invalid date format`);
          continue;
        }

        const employeeId = options?.defaultEmployeeId || null;
        const conflicts = await detectConflicts(workspaceId, employeeId, startTime, endTime);

        if (conflicts.length > 0) {
          result.conflictsDetected += conflicts.length;
          
          if (options?.conflictResolution === 'skip') {
            result.eventsSkipped++;
            continue;
          }
          
          if (options?.conflictResolution === 'overwrite') {
            for (const conflict of conflicts) {
              await db.delete(shifts).where(eq(shifts.id, conflict.id));
            }
          }
        }

        const [newShift] = await db.insert(shifts).values({
          workspaceId,
          employeeId,
          title: event.summary || 'Imported Event',
          description: event.description || `Imported from: ${options?.fileName || 'iCal file'}`,
          startTime,
          endTime,
          status: 'draft',
          aiGenerated: false,
        }).returning();

        result.importedShiftIds.push(newShift.id);
        result.eventsImported++;

      } catch (eventError: any) {
        result.eventsFailed++;
        result.errors.push(`Failed to import event "${event.summary}": ${eventError.message}`);
      }
    }

    result.success = result.eventsImported > 0;

    await db.update(calendarImports)
      .set({
        status: result.success ? 'completed' : 'failed',
        totalEvents: result.totalEvents,
        eventsImported: result.eventsImported,
        eventsSkipped: result.eventsSkipped,
        eventsFailed: result.eventsFailed,
        conflictsDetected: result.conflictsDetected,
        completedAt: new Date(),
        importedShiftIds: result.importedShiftIds,
        errorMessage: result.errors.length > 0 ? result.errors[0] : null,
        errorDetails: result.errors.length > 0 ? { errors: result.errors } : null,
      })
      .where(eq(calendarImports.id, importRecord.id));

    await db.insert(calendarSyncEvents).values({
      workspaceId,
      userId,
      eventType: 'import',
      importId: importRecord.id,
      description: `Calendar import ${result.success ? 'completed' : 'failed'}: ${result.eventsImported}/${result.totalEvents} events`,
      metadata: {
        fileName: options?.fileName,
        eventsImported: result.eventsImported,
        eventsSkipped: result.eventsSkipped,
        conflictsDetected: result.conflictsDetected,
      },
    });

  } catch (parseError: any) {
    result.errors.push(`Failed to parse iCal file: ${parseError.message}`);
    
    await db.update(calendarImports)
      .set({
        status: 'failed',
        completedAt: new Date(),
        errorMessage: parseError.message,
      })
      .where(eq(calendarImports.id, importRecord.id));

    await db.insert(calendarSyncEvents).values({
      workspaceId,
      userId,
      eventType: 'sync_error',
      importId: importRecord.id,
      description: `Calendar import failed: ${parseError.message}`,
    });
  }

  return result;
}

export async function getImportHistory(
  workspaceId: string,
  userId?: string,
  limit: number = 10
) {
  return db.query.calendarImports.findMany({
    where: and(
      eq(calendarImports.workspaceId, workspaceId),
      userId ? eq(calendarImports.userId, userId) : undefined
    ),
    orderBy: (imports, { desc }) => [desc(imports.createdAt)],
    limit,
  });
}

export function generateGoogleCalendarLink(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${format(event.start, "yyyyMMdd'T'HHmmss'Z'")}/${format(event.end, "yyyyMMdd'T'HHmmss'Z'")}`,
  });

  if (event.description) {
    params.set('details', event.description);
  }
  if (event.location) {
    params.set('location', event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export interface CalendarSubscriptionInfo {
  icsUrl: string;
  webcalUrl: string;
  googleCalendarSubscribeUrl: string;
  outlookSubscribeUrl: string;
  appleCalendarUrl: string;
  refreshInterval: number;
}

export function generateCalendarSubscriptionUrls(
  baseUrl: string,
  token: string,
  subscriptionName: string = 'CoAIleague Schedule'
): CalendarSubscriptionInfo {
  const icsUrl = `${baseUrl}/api/calendar/subscribe/${token}`;
  const webcalUrl = icsUrl.replace('https://', 'webcal://').replace('http://', 'webcal://');
  const encodedName = encodeURIComponent(subscriptionName);

  return {
    icsUrl,
    webcalUrl,
    googleCalendarSubscribeUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
    outlookSubscribeUrl: `https://outlook.live.com/owa/?path=/calendar/action/compose&rru=addsubscription&url=${encodeURIComponent(icsUrl)}&name=${encodedName}`,
    appleCalendarUrl: webcalUrl,
    refreshInterval: 15,
  };
}

export async function getSyncEvents(
  workspaceId: string,
  limit: number = 50
) {
  return db.query.calendarSyncEvents.findMany({
    where: eq(calendarSyncEvents.workspaceId, workspaceId),
    orderBy: (events, { desc }) => [desc(events.createdAt)],
    limit,
  });
}
