/**
 * Google Calendar OAuth Integration
 * Handles OAuth flow for syncing shifts to Google Calendar
 */
import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
const log = createLogger('GoogleCalendarOAuth');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const REDIRECT_URI = `${process.env.APP_URL ?? 'https://coaileague-development.up.railway.app'}/api/auth/google-calendar/callback`;

export const googleCalendar = {
  getAuthUrl(userId: string, workspaceId: string): string {
    const state = Buffer.from(JSON.stringify({ userId, workspaceId })).toString('base64');
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(code: string): Promise<{ access_token: string; refresh_token: string; expires_in: number } | null> {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      log.warn('[GoogleCalendar] GOOGLE_CLIENT_ID/SECRET not configured');
      return null;
    }
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
    });
    if (!resp.ok) return null;
    return resp.json();
  },

  async saveTokens(userId: string, workspaceId: string, tokens: { access_token: string; refresh_token: string; expires_in: number }) {
    await pool.query(`
      INSERT INTO oauth_states (id, user_id, workspace_id, provider, access_token, refresh_token, expires_at, created_at)
      VALUES (gen_random_uuid(), $1, $2, 'google_calendar', $3, $4, NOW() + ($5 || ' seconds')::interval, NOW())
      ON CONFLICT (user_id, provider) DO UPDATE
        SET access_token=$3, refresh_token=$4, expires_at=NOW() + ($5 || ' seconds')::interval
    `, [userId, workspaceId, tokens.access_token, tokens.refresh_token, tokens.expires_in]);
    log.info(`[GoogleCalendar] Tokens saved for user ${userId}`);
  },

  async createEvent(userId: string, shiftData: { title: string; start: Date; end: Date; location?: string }): Promise<string | null> {
    try {
      const { rows } = await pool.query(`SELECT access_token FROM oauth_states WHERE user_id=$1 AND provider='google_calendar'`, [userId]);
      if (!rows[0]) return null;
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: { Authorization: `Bearer ${rows[0].access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: shiftData.title,
          location: shiftData.location,
          start: { dateTime: shiftData.start.toISOString() },
          end: { dateTime: shiftData.end.toISOString() },
        }),
      });
      const data: any = await resp.json();
      return data.id ?? null;
    } catch (err: unknown) { log.warn(`[GoogleCalendar] Create event failed: ${err?.message}`); return null; }
  },
};
