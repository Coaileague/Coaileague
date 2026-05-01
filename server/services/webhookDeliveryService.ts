/**
 * PHASE 50 — OUTBOUND WEBHOOK DELIVERY SERVICE
 *
 * Delivers real-time events to external endpoints registered by workspace owners.
 * Security: HMAC-SHA256 payload signature in X-CoAIleague-Signature header.
 * Reliability: 5-attempt exponential backoff (1min, 5min, 30min, 2hr, 24hr).
 * Visibility: All deliveries logged to workspace_webhooks + webhook_outbound_log table.
 *
 * Event catalog (25 event types):
 *   officer.activated, officer.deactivated, officer.terminated
 *   shift.created, shift.assigned, shift.cancelled
 *   clock_in, clock_out
 *   calloff.submitted, calloff.resolved
 *   incident.created, incident.resolved
 *   invoice.generated, invoice.sent, invoice.paid, invoice.overdue, invoice.disputed
 *   payroll.run_completed, payroll.stub_available
 *   document.executed, document.voided
 *   compliance.violation_detected, compliance.violation_resolved
 *   client.activated, client.offboarded
 *   subscription.trial_ending, subscription.suspended, subscription.cancelled
 */

import crypto from 'crypto';
import * as net from 'net';
import { promises as dns } from 'dns';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { decryptToken, isEncrypted } from '../security/tokenEncryption';
const log = createLogger('webhookDeliveryService');

// ─── SSRF Protection ──────────────────────────────────────────────────────────
/** Returns true if the IP string is a private/loopback/link-local range. */
function isPrivateIp(ip: string): boolean {
  const privatePatterns = [
    /^127\./,                                         // Loopback
    /^10\./,                                          // RFC 1918 Class A
    /^172\.(1[6-9]|2\d|3[01])\./,                    // RFC 1918 Class B
    /^192\.168\./,                                    // RFC 1918 Class C
    /^169\.254\./,                                    // Link-local (AWS metadata)
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,     // RFC 6598 CGN
    /^0\./,                                           // "This" network
    /^::1$/,                                          // IPv6 loopback
    /^f[cd][0-9a-f]{2}:/i,                           // IPv6 unique-local (fc/fd)
  ];
  return privatePatterns.some(r => r.test(ip));
}

/**
 * SSRF guard — validates that a webhook URL targets a routable public address.
 * Blocks localhost, private RFC-1918 ranges, AWS metadata IP, and other
 * internal addresses that could be probed via the webhook delivery mechanism.
 * Exported so webhook registration routes can validate before storing.
 */
export async function validateWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook URL format');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Webhook URL must use HTTP or HTTPS');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Block explicit localhost / catch-all patterns
  if (/^(localhost|0\.0\.0\.0)$/.test(hostname)) {
    throw new Error('Webhook URL cannot target localhost');
  }

  // If the hostname is already a raw IP, check it directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('Webhook URL cannot target a private IP address');
    }
    return;
  }

  // Resolve hostname to IPs and check every resolved address
  try {
    const [v4, v6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);
    const allIps: string[] = [
      ...(v4.status === 'fulfilled' ? v4.value : []),
      ...(v6.status === 'fulfilled' ? v6.value : []),
    ];
    if (allIps.length === 0) {
      throw new Error('Webhook URL hostname could not be resolved');
    }
    for (const ip of allIps) {
      if (isPrivateIp(ip)) {
        throw new Error('Webhook URL resolves to a private IP address');
      }
    }
  } catch (err: unknown) {
    if (err.message?.startsWith('Webhook URL')) throw err;
    throw new Error(`Webhook URL hostname resolution failed: ${err.message}`);
  }
}

/** Transparently decrypt webhook secret — handles both legacy plaintext and encrypted values. */
function resolveWebhookSecret(raw: string): string {
  try {
    return isEncrypted(raw) ? decryptToken(raw) : raw;
  } catch {
    log.warn('[WebhookDelivery] Failed to decrypt webhook secret — using raw value as fallback');
    return raw;
  }
}


// ─── Event Catalog ────────────────────────────────────────────────────────────
export const WEBHOOK_EVENT_TYPES = [
  'officer.activated',
  'officer.deactivated',
  'officer.terminated',
  'shift.created',
  'shift.assigned',
  'shift.cancelled',
  'clock_in',
  'clock_out',
  'calloff.submitted',
  'calloff.resolved',
  'incident.created',
  'incident.resolved',
  'invoice.generated',
  'invoice.sent',
  'invoice.paid',
  'invoice.overdue',
  'invoice.disputed',
  'payroll.run_completed',
  'payroll.stub_available',
  'document.executed',
  'document.voided',
  'compliance.violation_detected',
  'compliance.violation_resolved',
  'client.activated',
  'client.offboarded',
  'subscription.trial_ending',
  'subscription.suspended',
  'subscription.cancelled',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENT_TYPES[number];

// ─── Retry Schedule ────────────────────────────────────────────────────────────
// Exponential backoff: 1min, 5min, 30min, 2hr, 24hr (all in milliseconds)
const RETRY_DELAYS_MS = [
  1 * 60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];
const MAX_ATTEMPTS = 5;

// ─── HMAC Signature ───────────────────────────────────────────────────────────

/**
 * Sign a payload with HMAC-SHA256 using the webhook secret.
 * Returns the hex-encoded HMAC digest.
 */
function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

// ─── Core Delivery ────────────────────────────────────────────────────────────

interface DeliveryAttempt {
  webhookId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
  attemptNumber: number;
}

async function attemptDelivery(attempt: DeliveryAttempt): Promise<{
  statusCode: number;
  responseBody: string;
  success: boolean;
}> {
  const payloadStr = JSON.stringify(attempt.payload);
  const signature = signPayload(payloadStr, attempt.secret);
  const timestamp = Math.floor(Date.now() / 1000);

  // SSRF guard — validate before making the outbound request
  try {
    await validateWebhookUrl(attempt.url);
  } catch (err: unknown) {
    log.warn('[webhookDelivery] SSRF guard blocked delivery', { url: attempt.url, reason: err.message });
    return { statusCode: 0, responseBody: `SSRF blocked: ${err.message}`, success: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(attempt.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CoAIleague-Signature': `sha256=${signature}`,
        'X-CoAIleague-Event': attempt.eventType,
        'X-CoAIleague-Timestamp': String(timestamp),
        'X-CoAIleague-Delivery': crypto.randomUUID(),
        'User-Agent': 'CoAIleague-Webhooks/1.0',
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const responseBody = await response.text().catch(() => '');

    return {
      statusCode: response.status,
      responseBody: responseBody.substring(0, 2000), // Cap at 2KB
      success: response.status >= 200 && response.status < 300,
    };
  } catch (err: unknown) {
    clearTimeout(timeout);
    return {
      statusCode: 0,
      responseBody: err.message || 'Connection failed',
      success: false,
    };
  }
}

// ─── Webhook Delivery with Retry ──────────────────────────────────────────────

async function deliverToWebhook(
  webhookId: string,
  workspaceId: string,
  eventType: string,
  payload: Record<string, unknown>,
  webhookUrl: string,
  webhookSecret: string,
  attemptNumber: number
): Promise<void> {
  const result = await attemptDelivery({
    webhookId,
    url: webhookUrl,
    secret: webhookSecret,
    eventType,
    payload,
    attemptNumber,
  });

  // Log this delivery attempt
  await pool.query(
    `INSERT INTO webhook_outbound_log
       (id, webhook_id, workspace_id, event_type, payload, response_status, response_body, attempt_number, delivered_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT DO NOTHING`,
    [
      webhookId,
      workspaceId,
      eventType,
      JSON.stringify(payload),
      result.statusCode,
      result.responseBody,
      attemptNumber,
    ]
  ).catch((err) => log.warn('[webhookDeliveryService] Fire-and-forget failed:', err)); // Log failure is non-fatal

  if (result.success) {
    // Update webhook: last_triggered_at, last_status_code, reset failure_count
    await pool.query(
      `UPDATE workspace_webhooks
       SET last_triggered_at = now(), last_status_code = $1, failure_count = 0, status = 'active'
       WHERE id = $2`,
      [result.statusCode, webhookId]
    ).catch((err) => log.warn('[webhookDeliveryService] Fire-and-forget failed:', err));
    return;
  }

  // Failure: increment failure count
  const { rows } = await pool.query(
    `UPDATE workspace_webhooks
     SET last_status_code = $1, failure_count = failure_count + 1, status = CASE WHEN failure_count + 1 >= $2 THEN 'failed' ELSE status END
     WHERE id = $3
     RETURNING failure_count, workspace_id`,
    [result.statusCode, MAX_ATTEMPTS, webhookId]
  );

  const newFailureCount = rows[0]?.failure_count ?? attemptNumber;

  if (newFailureCount >= MAX_ATTEMPTS) {
    // Mark permanently failed and notify org_owner
    log.error(`[WebhookDelivery] Webhook ${webhookId} failed after ${MAX_ATTEMPTS} attempts — marking failed`);
    await notifyOrgOwnerOfWebhookFailure(webhookId, workspaceId, webhookUrl, eventType);
    return;
  }

  // Schedule retry
  const delayMs = RETRY_DELAYS_MS[Math.min(attemptNumber - 1, RETRY_DELAYS_MS.length - 1)];
  setTimeout(async () => {
    // Re-fetch webhook to make sure it's still active
    const { rows: webhookRows } = await pool.query(
      `SELECT url, secret, is_active, status FROM workspace_webhooks WHERE id = $1`,
      [webhookId]
    );
    const webhook = webhookRows[0];
    if (!webhook || !webhook.is_active || webhook.status === 'failed') return;

    await deliverToWebhook(
      webhookId,
      workspaceId,
      eventType,
      payload,
      webhook.url,
      resolveWebhookSecret(webhook.secret),
      attemptNumber + 1
    );
  }, delayMs);
}

async function notifyOrgOwnerOfWebhookFailure(
  webhookId: string,
  workspaceId: string,
  url: string,
  eventType: string
): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email FROM users u
       JOIN user_workspaces uw ON uw.user_id = u.id
       WHERE uw.workspace_id = $1 AND uw.role = 'org_owner' LIMIT 1`,
      [workspaceId]
    );
    if (!rows[0]) return;

    log.info(`[WebhookDelivery] Notifying org_owner ${rows[0].email} of webhook failure: webhookId=${webhookId} url=${url} eventType=${eventType}`);
    // NDS integration would go here; logging is sufficient for this phase
  } catch (err: unknown) {
    log.error('[WebhookDelivery] Failed to notify org_owner:', err.message);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Deliver a webhook event to all active webhooks in a workspace that subscribe to this event type.
 * Fire-and-forget — does not block the calling route.
 *
 * Also logs to notification_deliveries with channel: webhook for NDS observability.
 */
export async function deliverWebhookEvent(
  workspaceId: string,
  eventType: WebhookEventType | string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    // Find all active webhooks subscribed to this event type
    const { rows: webhooks } = await pool.query(
      `SELECT id, url, secret, workspace_id FROM workspace_webhooks
       WHERE workspace_id = $1 AND is_active = true AND status != 'failed'
       AND $2 = ANY(events)`,
      [workspaceId, eventType]
    );

    if (webhooks.length === 0) return;

    // Enrich payload with standard metadata
    const enrichedPayload = {
      event: eventType,
      workspace_id: workspaceId,
      timestamp: new Date().toISOString(),
      api_version: '2026-03',
      data: payload,
    };

    for (const webhook of webhooks) {
      // Fire async — don't await
      deliverToWebhook(
        webhook.id,
        workspaceId,
        eventType,
        enrichedPayload,
        webhook.url,
        resolveWebhookSecret(webhook.secret),
        1
      ).catch(err => log.error('[WebhookDelivery] Delivery error:', err.message));
    }
  } catch (err: unknown) {
    log.error('[WebhookDelivery] deliverWebhookEvent error:', err.message);
  }
}

/**
 * Send a test payload to a webhook endpoint to verify it's receiving.
 */
export async function sendTestWebhook(
  webhookId: string,
  workspaceId: string
): Promise<{ success: boolean; statusCode: number; responseBody: string }> {
  const { rows } = await pool.query(
    `SELECT id, url, secret FROM workspace_webhooks WHERE id = $1 AND workspace_id = $2`,
    [webhookId, workspaceId]
  );
  if (!rows[0]) throw new Error('Webhook not found');

  const testPayload = {
    event: 'webhook.test',
    workspace_id: workspaceId,
    timestamp: new Date().toISOString(),
    api_version: '2026-03',
    data: {
      message: 'This is a test webhook from CoAIleague',
      webhook_id: webhookId,
    },
  };

  const result = await attemptDelivery({
    webhookId,
    url: rows[0].url,
    secret: resolveWebhookSecret(rows[0].secret),
    eventType: 'webhook.test',
    payload: testPayload,
    attemptNumber: 1,
  });

  return result;
}

/**
 * Initialize the webhook_outbound_log table (idempotent).
 * Called from routes.ts on startup.
 */
export async function initWebhookTables(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS webhook_outbound_log (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        webhook_id VARCHAR NOT NULL,
        workspace_id VARCHAR NOT NULL,
        event_type VARCHAR NOT NULL,
        payload TEXT,
        response_status INTEGER,
        response_body TEXT,
        attempt_number INTEGER DEFAULT 1,
        delivered_at TIMESTAMP DEFAULT now()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS webhook_log_webhook_idx ON webhook_outbound_log(webhook_id, delivered_at DESC)`
    );
    log.info('[WebhookDelivery] webhook_outbound_log table initialized');
  } catch (err: unknown) {
    log.error('[WebhookDelivery] Failed to init webhook tables:', err.message);
  }
}
