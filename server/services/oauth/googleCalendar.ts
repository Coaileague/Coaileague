/**
 * Google Calendar OAuth Integration - Phase 5 Stub
 * Placeholder for Google Calendar OAuth flow and sync functionality
 */

import { db } from '../../db';
import { sql } from 'drizzle-orm';

export interface GoogleCalendarCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
}

export interface GoogleCalendarConnection {
  id: string;
  userId: string;
  workspaceId: string;
  email: string;
  calendarId: string;
  syncEnabled: boolean;
  lastSyncAt: Date | null;
  credentials: GoogleCalendarCredentials;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleCalendarSyncOptions {
  syncDirection: 'push' | 'pull' | 'bidirectional';
  includeShifts: boolean;
  includeTimeEntries: boolean;
  createReminders: boolean;
  reminderMinutes: number;
}

const GOOGLE_OAUTH_CONFIG = {
  clientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI,
  scopes: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
  ],
};

export function isGoogleCalendarConfigured(): boolean {
  return !!(
    GOOGLE_OAUTH_CONFIG.clientId &&
    GOOGLE_OAUTH_CONFIG.clientSecret &&
    GOOGLE_OAUTH_CONFIG.redirectUri
  );
}

export function getGoogleOAuthUrl(state: string): string {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: GOOGLE_OAUTH_CONFIG.clientId!,
    redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri!,
    response_type: 'code',
    scope: GOOGLE_OAUTH_CONFIG.scopes.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleCalendarCredentials> {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar OAuth is not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId!,
      client_secret: GOOGLE_OAUTH_CONFIG.clientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_OAUTH_CONFIG.redirectUri!,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to exchange code for tokens: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope.split(' '),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<Partial<GoogleCalendarCredentials>> {
  if (!isGoogleCalendarConfigured()) {
    throw new Error('Google Calendar OAuth is not configured');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_OAUTH_CONFIG.clientId!,
      client_secret: GOOGLE_OAUTH_CONFIG.clientSecret!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh token: ${error}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope?.split(' '),
  };
}

export async function getUserCalendarInfo(accessToken: string): Promise<{
  email: string;
  calendarId: string;
  timeZone: string;
}> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch calendar info');
  }

  const data = await response.json();

  return {
    email: data.id,
    calendarId: data.id,
    timeZone: data.timeZone,
  };
}

export interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{ method: string; minutes: number }>;
  };
  colorId?: string;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: CalendarEvent
): Promise<CalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create event: ${error}`);
  }

  return response.json();
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<CalendarEvent>
): Promise<CalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update event: ${error}`);
  }

  return response.json();
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete event: ${error}`);
  }
}

export async function listCalendarEvents(
  accessToken: string,
  calendarId: string,
  options?: {
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
    syncToken?: string;
  }
): Promise<{
  events: CalendarEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}> {
  const params = new URLSearchParams();
  if (options?.timeMin) params.set('timeMin', options.timeMin);
  if (options?.timeMax) params.set('timeMax', options.timeMax);
  if (options?.maxResults) params.set('maxResults', options.maxResults.toString());
  if (options?.syncToken) params.set('syncToken', options.syncToken);

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list events: ${error}`);
  }

  const data = await response.json();

  return {
    events: data.items || [],
    nextSyncToken: data.nextSyncToken,
    nextPageToken: data.nextPageToken,
  };
}

export function shiftToGoogleEvent(
  shift: any,
  employee?: { firstName: string; lastName: string },
  client?: { companyName: string; address?: string }
): CalendarEvent {
  const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : 'Unassigned';
  const clientName = client?.companyName || '';

  return {
    summary: `${employeeName}${clientName ? ` @ ${clientName}` : ''} - Shift`,
    description: [
      shift.title ? `Shift: ${shift.title}` : '',
      shift.description || '',
      `Status: ${shift.status || 'scheduled'}`,
      shift.notes || '',
    ]
      .filter(Boolean)
      .join('\n'),
    location: client?.address || shift.location || undefined,
    start: {
      dateTime: new Date(shift.startTime).toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: new Date(shift.endTime).toISOString(),
      timeZone: 'UTC',
    },
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 30 }],
    },
    extendedProperties: {
      private: {
        coaileagueShiftId: shift.id,
        coaileagueWorkspaceId: shift.workspaceId,
      },
    },
  };
}

export async function syncShiftsToGoogleCalendar(
  accessToken: string,
  calendarId: string,
  shifts: any[],
  employees: Map<string, any>,
  clients: Map<string, any>
): Promise<{
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}> {
  const result = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const shift of shifts) {
    try {
      const employee = shift.employeeId ? employees.get(shift.employeeId) : undefined;
      const client = shift.clientId ? clients.get(shift.clientId) : undefined;
      const event = shiftToGoogleEvent(shift, employee, client);

      if (shift.googleEventId) {
        await updateCalendarEvent(accessToken, calendarId, shift.googleEventId, event);
        result.updated++;
      } else {
        const created = await createCalendarEvent(accessToken, calendarId, event);
        result.created++;
      }
    } catch (error: any) {
      result.failed++;
      result.errors.push(`Shift ${shift.id}: ${error.message}`);
    }
  }

  return result;
}

export const googleCalendarService = {
  isConfigured: isGoogleCalendarConfigured,
  getOAuthUrl: getGoogleOAuthUrl,
  exchangeCode: exchangeCodeForTokens,
  refreshToken: refreshAccessToken,
  getUserInfo: getUserCalendarInfo,
  createEvent: createCalendarEvent,
  updateEvent: updateCalendarEvent,
  deleteEvent: deleteCalendarEvent,
  listEvents: listCalendarEvents,
  shiftToEvent: shiftToGoogleEvent,
  syncShifts: syncShiftsToGoogleCalendar,
};

export default googleCalendarService;
