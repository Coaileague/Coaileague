/**
 * PHASE 50 — OUTBOUND WEBHOOK MANAGEMENT ROUTES
 *
 * Business tier and above feature.
 *
 * Routes:
 *   GET    /api/webhooks              — list all webhooks for workspace
 *   POST   /api/webhooks              — create a webhook
 *   PUT    /api/webhooks/:id          — update a webhook
 *   DELETE /api/webhooks/:id          — delete a webhook
 *   POST   /api/webhooks/:id/test     — send test payload
 *   GET    /api/webhooks/:id/deliveries — last 50 delivery logs
 *   POST   /api/webhooks/:id/retry    — retry the last failed delivery
 *   GET    /api/webhooks/events       — list available event types
 */

import { Router } from 'express';
import { requireAuth } from '../auth';
import { pool } from '../db';
import { z } from 'zod';
import {
  WEBHOOK_EVENT_TYPES,
  sendTestWebhook,
  deliverWebhookEvent,
} from '../services/webhookDeliveryService';
import crypto from 'crypto';
import { createLogger } from '../lib/logger';
import { encryptToken } from '../security/tokenEncryption';
const log = createLogger('WebhookRoutes');


const router = Router();

// ─── GET /api/webhooks/events ─────────────────────────────────────────────────
router.get('/events', requireAuth, (req, res) => {
  return res.json({ eventTypes: WEBHOOK_EVENT_TYPES });
});

// ─── GET /api/webhooks ────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;

    const { rows } = await pool.query(
      `SELECT id, name, url, events, is_active, status, created_at, last_triggered_at, last_status_code, failure_count
       FROM workspace_webhooks WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );

    return res.json({ webhooks: rows });
  } catch (err: any) {
    log.error('[WebhookRoutes] GET error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch webhooks' });
  }
});

// ─── POST /api/webhooks ───────────────────────────────────────────────────────
const createWebhookSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url(),
  secret: z.string().min(8).max(256).optional(),
  events: z.array(z.string()).min(1),
});

router.post('/', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId, id: userId } = req.user;

    if (!['org_owner', 'co_owner', 'platform_staff', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions to manage webhooks' });
    }

    // Tier check: Business tier and above
    const { rows: tierRows } = await pool.query(
      `SELECT tier FROM feature_flags WHERE workspace_id = $1 LIMIT 1`,
      [workspaceId]
    );
    const tier = tierRows[0]?.tier || 'basic';
    const allowedTiers = ['professional', 'premium', 'enterprise', 'business'];
    if (!allowedTiers.includes(tier)) {
      return res.status(403).json({ error: 'Webhook management requires Business tier or above' });
    }

    const parsed = createWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Validate event types
    const invalidEvents = parsed.data.events.filter(
      e => !WEBHOOK_EVENT_TYPES.includes(e as any)
    );
    if (invalidEvents.length > 0) {
      return res.status(400).json({ error: `Invalid event types: ${invalidEvents.join(', ')}` });
    }

    // Auto-generate secret if not provided
    const plaintextSecret = parsed.data.secret || crypto.randomBytes(32).toString('hex');
    // Encrypt secret at rest — AES-256-GCM (same pattern as OAuth tokens/SSN)
    const encryptedSecret = encryptToken(plaintextSecret);

    const { rows } = await pool.query(
      `INSERT INTO workspace_webhooks (id, workspace_id, name, url, secret, events, is_active, created_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, $6)
       RETURNING id, name, url, events, is_active, created_at`,
      [workspaceId, parsed.data.name, parsed.data.url, encryptedSecret, parsed.data.events, userId]
    );

    // Return plaintext secret only on creation (never stored in plaintext)
    return res.status(201).json({ webhook: { ...rows[0], secret: plaintextSecret } });
  } catch (err: any) {
    log.error('[WebhookRoutes] POST error:', err.message);
    return res.status(500).json({ error: 'Failed to create webhook' });
  }
});

// ─── PUT /api/webhooks/:id ────────────────────────────────────────────────────
const updateWebhookSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  url: z.string().url().optional(),
  events: z.array(z.string()).min(1).optional(),
  isActive: z.boolean().optional(),
});

router.put('/:id', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId } = req.user;

    if (!['org_owner', 'co_owner', 'platform_staff', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const parsed = updateWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { name, url, events, isActive } = parsed.data;
    const fields: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (name !== undefined) { fields.push(`name = $${paramIdx++}`); values.push(name); }
    if (url !== undefined) { fields.push(`url = $${paramIdx++}`); values.push(url); }
    if (events !== undefined) { fields.push(`events = $${paramIdx++}`); values.push(events); }
    if (isActive !== undefined) {
      fields.push(`is_active = $${paramIdx++}`);
      values.push(isActive);
      if (isActive) { fields.push(`status = 'active'`); values.push('active'); }
    }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.params.id, workspaceId);
    const { rows } = await pool.query(
      `UPDATE workspace_webhooks SET ${fields.join(', ')}
       WHERE id = $${paramIdx} AND workspace_id = $${paramIdx + 1}
       RETURNING id, name, url, events, is_active, status`,
      values
    );

    if (!rows[0]) return res.status(404).json({ error: 'Webhook not found' });
    return res.json({ webhook: rows[0] });
  } catch (err: any) {
    log.error('[WebhookRoutes] PUT error:', err.message);
    return res.status(500).json({ error: 'Failed to update webhook' });
  }
});

// ─── DELETE /api/webhooks/:id ─────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId } = req.user;

    if (!['org_owner', 'co_owner', 'platform_staff'].includes(role)) {
      return res.status(403).json({ error: 'Only org owners can delete webhooks' });
    }

    const { rowCount } = await pool.query(
      `DELETE FROM workspace_webhooks WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );

    if (!rowCount) return res.status(404).json({ error: 'Webhook not found' });
    return res.json({ success: true });
  } catch (err: any) {
    log.error('[WebhookRoutes] DELETE error:', err.message);
    return res.status(500).json({ error: 'Failed to delete webhook' });
  }
});

// ─── POST /api/webhooks/:id/test ──────────────────────────────────────────────
router.post('/:id/test', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const result = await sendTestWebhook(req.params.id, workspaceId);
    return res.json(result);
  } catch (err: any) {
    log.error('[WebhookRoutes] test error:', err.message);
    return res.status(500).json({ error: 'Failed to send test webhook. Please try again.' });
  }
});

// ─── GET /api/webhooks/:id/deliveries ─────────────────────────────────────────
router.get('/:id/deliveries', requireAuth, async (req: any, res) => {
  try {
    const { workspaceId } = req.user;

    // Verify webhook belongs to workspace
    const { rows: webhookRows } = await pool.query(
      `SELECT id FROM workspace_webhooks WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, workspaceId]
    );
    if (!webhookRows[0]) return res.status(404).json({ error: 'Webhook not found' });

    const { rows } = await pool.query(
      `SELECT id, event_type, response_status, response_body, attempt_number, delivered_at
       FROM webhook_outbound_log
       WHERE webhook_id = $1
       ORDER BY delivered_at DESC
       LIMIT 50`,
      [req.params.id]
    );

    return res.json({ deliveries: rows });
  } catch (err: any) {
    log.error('[WebhookRoutes] deliveries error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

// ─── POST /api/webhooks/:id/retry ─────────────────────────────────────────────
router.post('/:id/retry', requireAuth, async (req: any, res) => {
  try {
    const { role, workspaceId } = req.user;

    if (!['org_owner', 'co_owner', 'platform_staff', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Reset failure count and re-activate
    const { rows } = await pool.query(
      `UPDATE workspace_webhooks SET failure_count = 0, status = 'active', is_active = true
       WHERE id = $1 AND workspace_id = $2
       RETURNING id, url, events`,
      [req.params.id, workspaceId]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Webhook not found' });

    return res.json({ success: true, message: 'Webhook re-activated — will deliver on next event' });
  } catch (err: any) {
    log.error('[WebhookRoutes] retry error:', err.message);
    return res.status(500).json({ error: 'Failed to retry webhook' });
  }
});

export default router;
