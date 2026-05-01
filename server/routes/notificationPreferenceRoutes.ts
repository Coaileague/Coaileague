/**
 * PHASE 49 — NOTIFICATION PREFERENCE + TEMPLATE MANAGEMENT ROUTES
 *
 * Preference routes (user self-service):
 *   GET    /api/notification-preferences           — get my preferences
 *   PUT    /api/notification-preferences           — update my preferences
 *
 * Template management routes (org_owner + platform_staff):
 *   GET    /api/notification-templates             — list templates for workspace
 *   POST   /api/notification-templates             — create/version a template
 *   POST   /api/notification-templates/preview     — preview template with sample data
 *   GET    /api/notification-templates/:id/versions — list all versions of a template
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import { pool } from '../db';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('NotificationPreferenceRoutes');

import {
  invalidatePreferenceCache,
  createTemplate,
  listTemplates,
  previewTemplate,
  extractTemplateVariables,
} from '../services/notificationPreferenceService';

const router = Router();

// ─── GET /api/notification-preferences ────────────────────────────────────────
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const { id: userId, workspaceId } = req.user;

    const { rows } = await pool.query(
      `SELECT * FROM user_notification_preferences WHERE user_id = $1 AND workspace_id = $2 LIMIT 1`,
      [userId, workspaceId]
    );

    const prefs = rows[0] || {
      enableEmail: true,
      enableSms: false,
      enablePush: true,
      quietHoursStart: null,
      quietHoursEnd: null,
      languagePreference: 'en',
    };

    // Also get language preference from users table
    const { rows: userRows } = await pool.query(
      `SELECT preferred_language FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );

    return res.json({
      preferences: {
        ...prefs,
        languagePreference: userRows[0]?.preferred_language || 'en',
      },
    });
  } catch (err: unknown) {
    log.error('[NotifPrefRoutes] GET preferences error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ─── PUT /api/notification-preferences ────────────────────────────────────────
const updatePrefsSchema = z.object({
  enableEmail: z.boolean().optional(),
  enableSms: z.boolean().optional(),
  enablePush: z.boolean().optional(),
  quietHoursStart: z.number().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().min(0).max(23).nullable().optional(),
  languagePreference: z.enum(['en', 'es']).optional(),
  digestFrequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']).optional(),
});

router.put('/', requireAuth, async (req: any, res) => {
  try {
    const { id: userId, workspaceId } = req.user;

    const parsed = updatePrefsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { languagePreference, ...prefFields } = parsed.data;

    // Upsert notification preferences
    const fields = Object.entries(prefFields).filter(([, v]) => v !== undefined);
    if (fields.length > 0) {
      const setClauses = fields.map(([k, _], i) => {
        const col = k.replace(/([A-Z])/g, '_$1').toLowerCase();
        return `${col} = $${i + 3}`;
      });
      const values = fields.map(([, v]) => v);

      await pool.query(
        `INSERT INTO user_notification_preferences (id, user_id, workspace_id, ${fields.map(([k]) => k.replace(/([A-Z])/g, '_$1').toLowerCase()).join(', ')})
         VALUES (gen_random_uuid(), $1, $2, ${values.map((_, i) => `$${i + 3}`).join(', ')})
         ON CONFLICT (user_id) DO UPDATE SET ${setClauses.join(', ')}, updated_at = now()`,
        [userId, workspaceId, ...values]
      );
    }

    // Sync language preference to users table (Phase 32 preferred_language)
    if (languagePreference) {
      await pool.query(
        `UPDATE users SET preferred_language = $1 WHERE id = $2`,
        [languagePreference, userId]
      );
    }

    // Invalidate preference cache
    invalidatePreferenceCache(userId, workspaceId);

    return res.json({ success: true });
  } catch (err: unknown) {
    log.error('[NotifPrefRoutes] PUT preferences error:', err.message);
    return res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// ─── GET /api/notification-templates ──────────────────────────────────────────
router.get('/templates', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const templates = await listTemplates(workspaceId);
    return res.json({ templates });
  } catch (err: unknown) {
    log.error('[NotifPrefRoutes] GET templates error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch templates' });
  }
});

// ─── POST /api/notification-templates/preview ──────────────────────────────────
router.post('/templates/preview', requireAuth, async (req: any, res) => {
  try {
    const { bodyTemplate, sampleData } = req.body;
    if (!bodyTemplate) return res.status(400).json({ error: 'bodyTemplate is required' });

    const variables = extractTemplateVariables(bodyTemplate);
    const rendered = previewTemplate(bodyTemplate, sampleData);

    return res.json({ rendered, variables });
  } catch (err: unknown) {
    log.error('[NotifPrefRoutes] preview error:', err.message);
    return res.status(500).json({ error: 'Failed to preview template' });
  }
});

// ─── POST /api/notification-templates ────────────────────────────────────────
const createTemplateSchema = z.object({
  notificationType: z.string().min(1),
  channel: z.enum(['email', 'sms', 'push', 'in_app', 'websocket']),
  language: z.enum(['en', 'es']).default('en'),
  subject: z.string().optional(),
  bodyTemplate: z.string().min(1),
  isGlobal: z.boolean().optional().default(false),
});

router.post('/templates', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId, id: userId } = req.user;

    if (!['org_owner', 'co_owner', 'platform_staff'].includes(role)) {
      return res.status(403).json({ error: 'Only org owners and platform staff can manage templates' });
    }

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Platform staff can create global templates (workspace_id = null)
    const targetWorkspaceId =
      parsed.data.isGlobal && role === 'platform_staff' ? null : workspaceId;

    const template = await createTemplate({
      workspaceId: targetWorkspaceId,
      notificationType: parsed.data.notificationType,
      channel: parsed.data.channel,
      language: parsed.data.language,
      subject: parsed.data.subject,
      bodyTemplate: parsed.data.bodyTemplate,
      createdBy: userId,
    });

    return res.status(201).json({ template });
  } catch (err: unknown) {
    log.error('[NotifPrefRoutes] POST template error:', err.message);
    return res.status(500).json({ error: 'Failed to create notification template. Please try again.' });
  }
});

// ─── GET /api/notification-templates/:id/versions ─────────────────────────────
router.get('/templates/:notifType/versions', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const { notifType } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM notification_templates
       WHERE notification_type = $1 AND (workspace_id = $2 OR workspace_id IS NULL)
       ORDER BY version DESC`,
      [notifType, workspaceId]
    );

    return res.json({ versions: rows });
  } catch (err: unknown) {
    log.error('[NotifPrefRoutes] GET versions error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch template versions' });
  }
});

export default router;
