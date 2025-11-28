/**
 * Calendar Export/Import Service
 * Handles ICS export and Google Calendar integration
 */

import { db } from '../db';
import { shifts, employees, clients } from '@shared/schema';
import { eq, and, gte, lte } from 'drizzle-orm';
import { isFeatureEnabled } from '@shared/platformConfig';
import { format, addHours, parseISO } from 'date-fns';

interface CalendarEvent {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  reminder?: number;
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

export function generateICS(events: CalendarEvent[], calendarName: string = 'CoAIleague Schedule'): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CoAIleague//Workforce Management//EN',
    `X-WR-CALNAME:${escapeICSText(calendarName)}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${formatICSDate(new Date())}`);
    
    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatICSDate(event.start, true)}`);
      lines.push(`DTEND;VALUE=DATE:${formatICSDate(event.end, true)}`);
    } else {
      lines.push(`DTSTART:${formatICSDate(event.start)}`);
      lines.push(`DTEND:${formatICSDate(event.end)}`);
    }
    
    lines.push(`SUMMARY:${escapeICSText(event.title)}`);
    
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
    }
    
    if (event.location) {
      lines.push(`LOCATION:${escapeICSText(event.location)}`);
    }
    
    if (event.reminder && event.reminder > 0) {
      lines.push('BEGIN:VALARM');
      lines.push('ACTION:DISPLAY');
      lines.push(`DESCRIPTION:Reminder: ${escapeICSText(event.title)}`);
      lines.push(`TRIGGER:-PT${event.reminder}M`);
      lines.push('END:VALARM');
    }
    
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function exportScheduleToICS(
  workspaceId: string,
  employeeId?: string,
  startDate?: Date,
  endDate?: Date
): Promise<string> {
  if (!isFeatureEnabled('enableCalendarExport')) {
    throw new Error('Calendar export is not enabled');
  }

  const start = startDate || new Date();
  const end = endDate || new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const filters = [
    eq(shifts.workspaceId, workspaceId),
    gte(shifts.startTime, start),
    lte(shifts.startTime, end),
  ];

  if (employeeId) {
    filters.push(eq(shifts.employeeId, employeeId));
  }

  const scheduleShifts = await db.query.shifts.findMany({
    where: and(...filters),
    with: {
      employee: true,
      client: true,
    },
  });

  const events: CalendarEvent[] = scheduleShifts.map(shift => {
    const startDateTime = new Date(shift.startTime);
    const endDateTime = new Date(shift.endTime);

    const employeeName = shift.employee 
      ? `${shift.employee.firstName} ${shift.employee.lastName}`
      : 'Unassigned';
    
    const clientName = shift.client?.companyName || '';
    
    return {
      uid: `shift-${shift.id}@coaileague.com`,
      title: employeeId 
        ? `Work Shift${clientName ? ` - ${clientName}` : ''}`
        : `${employeeName}${clientName ? ` @ ${clientName}` : ''}`,
      description: [
        shift.title ? `Shift: ${shift.title}` : '',
        shift.description || '',
      ].filter(Boolean).join('\\n'),
      location: clientName || undefined,
      start: startDateTime,
      end: endDateTime,
      reminder: 30,
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
  googleCalendarSubscribeUrl: string;
  outlookSubscribeUrl: string;
}

export function generateCalendarSubscriptionUrls(
  baseUrl: string,
  workspaceId: string,
  employeeId?: string,
  token?: string
): CalendarSubscriptionInfo {
  const icsPath = employeeId 
    ? `/api/calendar/employee/${employeeId}/schedule.ics`
    : `/api/calendar/workspace/${workspaceId}/schedule.ics`;
  
  const icsUrl = token 
    ? `${baseUrl}${icsPath}?token=${token}`
    : `${baseUrl}${icsPath}`;

  const webcalUrl = icsUrl.replace('https://', 'webcal://').replace('http://', 'webcal://');

  return {
    icsUrl,
    googleCalendarSubscribeUrl: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
    outlookSubscribeUrl: `https://outlook.live.com/owa/?path=/calendar/action/compose&rru=addsubscription&url=${encodeURIComponent(icsUrl)}&name=CoAIleague%20Schedule`,
  };
}
