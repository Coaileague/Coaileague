/**
 * PHASE 49 — NOTIFICATION PREFERENCE SERVICE
 *
 * Enforces user notification preferences before any delivery:
 * - Per-channel enable/disable (email, sms, push, in_app)
 * - Quiet hours: defer non-critical notifications until quiet hours end
 * - Critical notifications (duress, enforcement, account suspension) ALWAYS bypass quiet hours
 * - 5-minute TTL cache per user×workspace to avoid per-check DB hits
 *
 * Template resolution:
 * - Workspace templates override platform defaults
 * - Templates use {{variable}} syntax
 * - Prior versions retained; only current (is_active) version served
 */

import { pool } from '../db';

// ─── Critical Notification Types ──────────────────────────────────────────────
// These ALWAYS bypass quiet hours — never deferred
const CRITICAL_TYPES = new Set([
  'duress_alert',
  'enforcement_action',
  'account_suspension',
  'coverage_needed',
  'calloff_received',
  'payroll_approval_required',
  'trinity_alert',
  'system_alert',
  'subscription_suspended',
]);

// ─── Preference Cache ─────────────────────────────────────────────────────────
interface CachedPrefs {
  enableEmail: boolean;
  enableSms: boolean;
  enablePush: boolean;
  enableInApp: boolean;
  quietHoursStart: number | null; // 0-23 or null = disabled
  quietHoursEnd: number | null;
  languagePreference: string;
  expiresAt: number;
}

const prefCache = new Map<string, CachedPrefs>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCacheKey(userId: string, workspaceId: string): string {
  return `${userId}:${workspaceId}`;
}

/**
 * Fetch user preferences from DB (or cache).
 * Fails OPEN — if preferences not found, defaults to all channels enabled, no quiet hours.
 */
export async function getUserPreferences(userId: string, workspaceId: string): Promise<CachedPrefs> {
  const key = getCacheKey(userId, workspaceId);
  const cached = prefCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;

  try {
    const { rows } = await pool.query(
      `SELECT enable_email, enable_sms, enable_push, enabled,
              quiet_hours_start, quiet_hours_end, delivery_method
       FROM user_notification_preferences
       WHERE user_id = $1 AND workspace_id = $2
       LIMIT 1`,
      [userId, workspaceId]
    );

    const row = rows[0];
    // Also check preferred_language from users table
    const { rows: userRows } = await pool.query(
      `SELECT preferred_language FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    const prefs: CachedPrefs = {
      enableEmail: row?.enable_email ?? true,
      enableSms: row?.enable_sms ?? false,
      enablePush: row?.enable_push ?? true,
      enableInApp: row?.enabled ?? true,
      quietHoursStart: row?.quiet_hours_start ?? null,
      quietHoursEnd: row?.quiet_hours_end ?? null,
      languagePreference: userRows[0]?.preferred_language ?? 'en',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };

    prefCache.set(key, prefs);
    return prefs;
  } catch {
    // Fail open: return defaults if DB unavailable
    return {
      enableEmail: true,
      enableSms: false,
      enablePush: true,
      enableInApp: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      languagePreference: 'en',
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
  }
}

/**
 * Invalidate the preference cache for a user.
 * Call this when preferences are updated.
 */
export function invalidatePreferenceCache(userId: string, workspaceId: string): void {
  prefCache.delete(getCacheKey(userId, workspaceId));
}

/**
 * Check if a channel is enabled for a user.
 * Returns false if the user has disabled that channel.
 */
export async function isChannelEnabled(
  userId: string,
  workspaceId: string,
  channel: 'email' | 'sms' | 'websocket' | 'in_app' | 'push'
): Promise<boolean> {
  const prefs = await getUserPreferences(userId, workspaceId);
  switch (channel) {
    case 'email': return prefs.enableEmail;
    case 'sms': return prefs.enableSms;
    case 'push': return prefs.enablePush;
    case 'in_app':
    case 'websocket': return prefs.enableInApp;
    default: return true;
  }
}

/**
 * Check if the current time falls within the user's quiet hours.
 * Returns true if notification should be deferred.
 *
 * Critical notifications bypass this check — always returns false for critical types.
 */
export async function isInQuietHours(
  userId: string,
  workspaceId: string,
  notificationType: string
): Promise<boolean> {
  // Critical types ALWAYS bypass quiet hours
  if (CRITICAL_TYPES.has(notificationType)) return false;

  const prefs = await getUserPreferences(userId, workspaceId);
  if (prefs.quietHoursStart === null || prefs.quietHoursEnd === null) return false;

  const currentHour = new Date().getUTCHours();
  const start = prefs.quietHoursStart;
  const end = prefs.quietHoursEnd;

  // Handle overnight range (e.g. 22:00–07:00)
  if (start > end) {
    return currentHour >= start || currentHour < end;
  }
  // Same-day range (e.g. 01:00–06:00)
  return currentHour >= start && currentHour < end;
}

/**
 * Evaluate whether a notification should be delivered to a given channel.
 * Returns { allow: boolean, reason?: string }
 *
 * Call this before queueing any delivery.
 */
export async function shouldDeliver(params: {
  userId: string;
  workspaceId: string;
  notificationType: string;
  channel: 'email' | 'sms' | 'websocket' | 'in_app' | 'push';
}): Promise<{ allow: boolean; reason?: string }> {
  const { userId, workspaceId, notificationType, channel } = params;

  // Critical safety alerts (panic, duress, incident, security) bypass quiet hours
  // and channel opt-outs. SMS still honors STOP/consent via the sendSMSToUser path.
  const SAFETY_CRITICAL = ['panic_alert', 'duress_alert', 'incident_alert', 'security_threat'];
  if (SAFETY_CRITICAL.includes(notificationType)) {
    return { allow: true, reason: 'critical_safety_bypass' };
  }

  // Check channel enabled for non-critical types
  const channelEnabled = await isChannelEnabled(userId, workspaceId, channel);
  if (!channelEnabled) {
    return { allow: false, reason: `channel_disabled:${channel}` };
  }

  // Check quiet hours (non-critical only)
  const inQuiet = await isInQuietHours(userId, workspaceId, notificationType);
  if (inQuiet) {
    return { allow: false, reason: 'quiet_hours_active' };
  }

  return { allow: true };
}

// ─── Template Management ──────────────────────────────────────────────────────

/**
 * Render a template body by substituting {{variable}} placeholders with data.
 */
export function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return data[key] !== undefined ? String(data[key]) : `{{${key}}}`;
  });
}

/**
 * Validate a template body for {{variable}} syntax correctness.
 * Returns list of variable names found.
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, ''));
}

/**
 * Get the active template for a notification type + channel + language.
 * Workspace templates override platform defaults (workspace_id IS NULL).
 */
export async function getActiveTemplate(params: {
  workspaceId: string;
  notificationType: string;
  channel: string;
  language?: string;
}): Promise<{ subject: string | null; bodyTemplate: string } | null> {
  const { workspaceId, notificationType, channel, language = 'en' } = params;

  // Prefer workspace-specific template, fall back to platform default
  const { rows } = await pool.query(
    `SELECT subject, body_template, workspace_id
     FROM notification_templates
     WHERE notification_type = $1
       AND channel = $2
       AND language = $3
       AND is_active = true
       AND (workspace_id = $4 OR workspace_id IS NULL)
     ORDER BY workspace_id NULLS LAST
     LIMIT 1`,
    [notificationType, channel, language, workspaceId]
  );

  if (!rows[0]) return null;

  return {
    subject: rows[0].subject,
    bodyTemplate: rows[0].body_template,
  };
}

/**
 * Create a new notification template version.
 * Previous versions for the same type+channel+language are deactivated.
 */
export async function createTemplate(params: {
  workspaceId: string | null;
  notificationType: string;
  channel: string;
  language: string;
  subject?: string;
  bodyTemplate: string;
  createdBy: string;
}): Promise<any> {
  // Validate template variables (check for malformed syntax)
  const vars = extractTemplateVariables(params.bodyTemplate);
  if (params.bodyTemplate.includes('{{') && vars.length === 0) {
    throw new Error('Template contains malformed {{variable}} syntax');
  }

  // Deactivate existing active templates for this type+channel+language+workspace
  await pool.query(
    `UPDATE notification_templates SET is_active = false, updated_at = now()
     WHERE notification_type = $1 AND channel = $2 AND language = $3
       AND (workspace_id = $4 OR (workspace_id IS NULL AND $4::varchar IS NULL))
       AND is_active = true`,
    [params.notificationType, params.channel, params.language, params.workspaceId]
  );

  // Get next version number
  const { rows: versionRows } = await pool.query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
     FROM notification_templates
     WHERE notification_type = $1 AND channel = $2 AND language = $3
       AND (workspace_id = $4 OR (workspace_id IS NULL AND $4::varchar IS NULL))`,
    [params.notificationType, params.channel, params.language, params.workspaceId]
  );

  const { rows } = await pool.query(
    `INSERT INTO notification_templates
       (id, workspace_id, notification_type, channel, language, subject, body_template, version, is_active, created_by)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true, $8)
     RETURNING *`,
    [
      params.workspaceId,
      params.notificationType,
      params.channel,
      params.language,
      params.subject || null,
      params.bodyTemplate,
      versionRows[0]?.next_version ?? 1,
      params.createdBy,
    ]
  );

  return rows[0];
}

/**
 * List all templates for a workspace (includes platform defaults).
 */
export async function listTemplates(workspaceId: string): Promise<any[]> {
  const { rows } = await pool.query(
    `SELECT * FROM notification_templates
     WHERE workspace_id = $1 OR workspace_id IS NULL
     ORDER BY notification_type, channel, language, version DESC`,
    [workspaceId]
  );
  return rows;
}

/**
 * Preview a template rendered with sample data.
 */
export function previewTemplate(bodyTemplate: string, sampleData?: Record<string, any>): string {
  const defaults: Record<string, string> = {
    first_name: 'Jane',
    last_name: 'Smith',
    workspace_name: 'Your Security Company',
    shift_date: '2026-04-01',
    shift_time: '08:00',
    position: 'Security Officer',
    officer_name: 'Jane Smith',
    amount: '$1,500.00',
    due_date: '2026-04-15',
    days_remaining: '3',
    plan_name: 'Professional',
  };
  return renderTemplate(bodyTemplate, { ...defaults, ...(sampleData || {}) });
}
