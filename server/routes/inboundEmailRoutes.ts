/**
 * INBOUND EMAIL WEBHOOK ROUTES
 * Phase 13 — Inbound Email Routing and Trinity Auto-Processing
 *
 * Single entry point for all four inbound Resend webhook handlers.
 * Mounted at: /api/inbound/email
 *
 * Webhook signature verification: HMAC-SHA256 against RESEND_WEBHOOK_SECRET.
 * Every handler MUST return 200 to Resend — never 5xx — or Resend retries indefinitely.
 * Idempotency is enforced by the unique constraint on inbound_email_log.message_id.
 */

import { Router, type Request, type Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { createLogger } from '../lib/logger';
import { pool } from '../db';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
const log = createLogger('InboundEmailRoutes');

import {
  processInboundEmail,
  detectCategoryFromRecipient,
  type ParsedInboundEmail,
} from '../services/trinity/trinityInboundEmailProcessor';
import { trinityEmailProcessor, type InboundEmailData } from '../services/trinityEmailProcessor';

export const inboundEmailRouter = Router();

// ─── Signature Verification ───────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

/**
 * Verify Resend inbound webhook signature.
 * Resend signs payloads using HMAC-SHA256 with the webhook secret.
 * Header: X-Resend-Signature or svix-signature
 */
function verifyResendSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean {
  if (!WEBHOOK_SECRET) {
    log.warn('[InboundEmail] RESEND_WEBHOOK_SECRET not set — skipping signature verification in dev');
    return process.env.NODE_ENV !== 'production';
  }

  // Support both Resend-native and svix-style headers
  const sigHeader = (
    headers['x-resend-signature'] ||
    headers['svix-signature'] ||
    ''
  );
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;

  if (!signature) {
    log.warn('[InboundEmail] No signature header found');
    return process.env.NODE_ENV !== 'production';
  }

  try {
    const hmac = createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(rawBody);
    const expected = 'sha256=' + hmac.digest('hex');

    // Normalize: svix sends "v1,<sig>" format
    const candidates = signature.split(' ');
    for (const candidate of candidates) {
      const normalized = candidate.startsWith('v1,')
        ? 'sha256=' + candidate.slice(3)
        : candidate;
      try {
        const a = Buffer.from(expected);
        const b = Buffer.from(normalized);
        if (a.length === b.length && timingSafeEqual(a, b)) return true;
      } catch (err: any) {
        log.warn('[InboundEmail] Error processing message (non-blocking)', { error: err.message });
      }
    }
    return false;
  } catch (err: any) {
    log.error('[InboundEmail] Signature verification error:', err.message);
    return false;
  }
}

// ─── Resend Payload Parser ────────────────────────────────────────────────────

interface ResendInboundPayload {
  from?: string;
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{
    filename?: string;
    content_type?: string;
    size?: number;
    url?: string;
    content?: string;
  }>;
  spam_score?: number;
  // message-id is typically in headers
}

function parseResendPayload(raw: ResendInboundPayload, targetAddress: string): ParsedInboundEmail {
  const fromRaw = raw.from || '';
  const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s+)?<?([^>]+)>?$/);
  const fromEmail = fromMatch?.[2]?.trim() || fromRaw.trim();
  const fromName = fromMatch?.[1]?.trim() || undefined;

  const toEmail = targetAddress;

  const messageId = raw.headers?.['message-id']
    || raw.headers?.['Message-ID']
    || undefined;

  const attachments = (raw.attachments || []).map(a => ({
    filename: a.filename || 'attachment',
    contentType: a.content_type || 'application/octet-stream',
    size: a.size,
    url: a.url,
    content: a.content,
  }));

  return {
    messageId,
    fromEmail,
    fromName,
    toEmail,
    subject: raw.subject,
    bodyText: raw.text,
    bodyHtml: raw.html,
    attachments,
    receivedAt: new Date(),
    rawPayload: raw as Record<string, unknown>,
  };
}

// ─── Raw Body Access ───────────────────────────────────────────────────────────
// req.rawBody is captured by express.json() verify function in server/index.ts
// (see webhookPathsNeedingRawBody — /api/inbound/email is included).
// All handlers fall back to Buffer.from(JSON.stringify(req.body)) if not present.
inboundEmailRouter.use((_req, _res, next) => next());

// ─── Generic Inbound Handler ──────────────────────────────────────────────────

async function handleInboundWebhook(
  req: Request,
  res: Response,
  targetAddress: string,
): Promise<void> {
  const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

  // Check 1: Signature verification
  const signatureValid = verifyResendSignature(rawBody, req.headers as any);
  if (!signatureValid) {
    log.warn(`[InboundEmail] Invalid signature for ${targetAddress} — returning 401`);
    // Per spec: still return a safe response; 401 is acceptable for signature failure
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  let payload: ResendInboundPayload;
  try {
    payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString());
  } catch (parseErr: any) {
    // Check 10: Malformed payload — log and return 200 (never 5xx)
    log.error(`[InboundEmail] Malformed payload for ${targetAddress}:`, parseErr.message);
    res.status(200).json({ received: true, warning: 'Malformed payload — flagged for admin review' });
    return;
  }

  // Parse into our normalized format
  const parsed = parseResendPayload(payload, targetAddress);
  const category = detectCategoryFromRecipient(targetAddress);

  log.info(`[InboundEmail] Received ${category} email from ${parsed.fromEmail} → ${targetAddress}`);

  // Check 8: Idempotency handled by unique constraint on message_id in DB.
  // We process async so we can return 200 immediately to Resend.
  // Duplicate detection: if message_id insert fails due to unique constraint,
  // processor catches it and marks as 'duplicate'.
  res.status(200).json({ received: true, category });

  // Process async — never block the Resend acknowledgment
  setImmediate(async () => {
    try {
      const result = await processInboundEmail(parsed);
      log.info(`[InboundEmail] ${category} processed:`, result.status, result.message);
    } catch (err: any) {
      // Check 10: Failure must not propagate — email is already logged in processor
      log.error(`[InboundEmail] Unhandled processor error for ${targetAddress}:`, err.message);
    }
  });
}

// ─── Root Handler: Full Platform Routing ─────────────────────────────────────
// POST /api/inbound/email
// Spec-compliant single entry point. Verifies signature, deduplicates,
// resolves email_routing, persists to platform_emails + email_attachments,
// triggers Trinity fire-and-forget, sends NDS if user_inbox.
// Returns 200 to Resend regardless — never 4xx/5xx after signature check.

inboundEmailRouter.post('/', async (req: Request, res: Response) => {
  const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

  // Step 1: Signature verification
  if (!verifyResendSignature(rawBody, req.headers as any)) {
    log.warn('[InboundEmail/root] Invalid signature');
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  let payload: ResendInboundPayload;
  try {
    payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString());
  } catch {
    log.warn('[InboundEmail/root] Malformed payload — accepted silently');
    res.status(200).json({ received: true });
    return;
  }

  // Step 2: Parse fields
  const resendEmailId = (payload as any).id as string | undefined;
  const toRaw = Array.isArray(payload.to) ? payload.to[0] : (payload.to || '');
  const toMatch = toRaw.match(/<?([^>]+)>?$/);
  const toEmail = (toMatch?.[1]?.trim() || toRaw).toLowerCase();

  const fromRaw = (payload as any).from || '';
  const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s+)?<?([^>]+)>?$/);
  const fromEmail = fromMatch?.[2]?.trim() || fromRaw.trim();
  const fromName  = fromMatch?.[1]?.trim() || undefined;

  const messageId   = payload.headers?.['message-id'] || payload.headers?.['Message-ID'] || undefined;
  const inReplyTo   = payload.headers?.['in-reply-to'] || undefined;
  const references  = payload.headers?.['references'] || undefined;
  const subject     = payload.subject || '(no subject)';
  const bodyHtml    = payload.html || undefined;
  const bodyText    = payload.text || undefined;
  const snippet     = (bodyText || '').replace(/\s+/g, ' ').slice(0, 200) || undefined;
  const attachments = payload.attachments || [];

  try {
    // Step 3: Deduplication — if resend_email_id seen already, ack and exit
    if (resendEmailId) {
      const dup = await pool.query(
        `SELECT id FROM platform_emails WHERE resend_email_id = $1 LIMIT 1`,
        [resendEmailId]
      );
      if (dup.rows.length > 0) {
        log.info(`[InboundEmail/root] Duplicate resend_email_id=${resendEmailId}, skipping`);
        res.status(200).json({ received: true, duplicate: true });
        return;
      }
    }

    // Step 4: Route lookup — first match wins
    const routeResult = await pool.query(
      `SELECT er.*, pea.workspace_id AS pea_workspace_id, pea.user_id AS pea_user_id
       FROM email_routing er
       LEFT JOIN platform_email_addresses pea ON er.email_address_id = pea.id
       WHERE er.address = $1 AND er.is_active = true LIMIT 1`,
      [toEmail]
    );

    // Step 5: No route — accept silently
    if (routeResult.rows.length === 0) {
      log.info(`[InboundEmail/root] No route found for ${toEmail} — accepted silently`);
      res.status(200).json({ received: true, routed: false });
      return;
    }

    const route = routeResult.rows[0];
    const workspaceId = route.target_workspace_id || route.pea_workspace_id;
    const targetUserId = route.target_user_id || route.pea_user_id;

    // Step 6: INSERT into platform_emails — return 200 immediately after
    const insertResult = await pool.query(`
      INSERT INTO platform_emails (
        workspace_id, resend_email_id, message_id, in_reply_to, references_header,
        direction, from_address, from_name, to_addresses,
        subject, body_html, body_text, snippet,
        owner_user_id, folder, received_at
      ) VALUES ($1,$2,$3,$4,$5,'inbound',$6,$7,$8,$9,$10,$11,$12,$13,'inbox',NOW())
      RETURNING id
    `, [
      workspaceId,
      resendEmailId || null,
      messageId || null,
      inReplyTo || null,
      references || null,
      fromEmail,
      fromName || null,
      [toEmail],
      subject,
      bodyHtml || null,
      bodyText || null,
      snippet || null,
      targetUserId || null,
    ]);

    const emailId = insertResult.rows[0]?.id;

    // Step 7: INSERT attachments
    if (emailId && attachments.length > 0) {
      for (const att of attachments) {
        await pool.query(`
          INSERT INTO email_attachments (email_id, filename, content_type, size_bytes, storage_url)
          VALUES ($1,$2,$3,$4,$5)
        `, [
          emailId,
          att.filename || 'attachment',
          att.content_type || 'application/octet-stream',
          att.size || null,
          att.url || null,
        ]);
      }
    }

    // Return 200 immediately — before any async processing
    res.status(200).json({ received: true, routed: true, routeType: route.route_type });

    // Step 8: Trinity auto-process (fire-and-forget)
    if (route.auto_process && route.process_as && workspaceId) {
      setImmediate(async () => {
        try {
          const { trinityEmailProcessor } = await import('../services/trinityEmailProcessor');
          await trinityEmailProcessor.processInbound({
            to: toEmail,
            from: fromEmail,
            subject,
            body: bodyText || '',
            htmlBody: bodyHtml,
            messageId: messageId || `inbound-${emailId}`,
          });
          // Mark as processed
          if (emailId) {
            await pool.query(
              `UPDATE platform_emails SET trinity_processed=true, trinity_processed_at=NOW(), trinity_action_taken=$1 WHERE id=$2`,
              [route.process_as, emailId]
            );
          }
          // NDS: trinity processed
          if (workspaceId && targetUserId) {
            await NotificationDeliveryService.send({
              type: 'trinity_email_processed',
              workspaceId,
              recipientUserId: targetUserId,
              channel: 'in_app',
              body: { processAs: route.process_as, summary: subject, emailId },
            });
          }
        } catch (err: any) {
          log.error('[InboundEmail/root] Trinity processing error:', err.message);
        }
      });
    }

    // Step 9: user_inbox — NDS new_email_received
    if (route.route_type === 'user_inbox' && targetUserId && workspaceId) {
      setImmediate(async () => {
        try {
          await NotificationDeliveryService.send({
            type: 'new_email_received',
            workspaceId,
            recipientUserId: targetUserId,
            channel: 'in_app',
            body: { from: fromEmail, subject, emailId },
            idempotencyKey: emailId ? `new_email_received-${emailId}` : undefined,
          });
        } catch (err: any) {
          log.error('[InboundEmail/root] NDS error:', err.message);
        }
      });
    }

  } catch (err: any) {
    log.error('[InboundEmail/root] Unhandled error:', err.message);
    // Still return 200 — never 5xx to Resend
    if (!res.headersSent) {
      res.status(200).json({ received: true, error: 'internal_processing_error' });
    }
  }
});

// ─── Per-Address Route Handlers ───────────────────────────────────────────────

// POST /api/inbound/email/calloffs
inboundEmailRouter.post('/calloffs', async (req: Request, res: Response) => {
  const domain = process.env.INBOUND_EMAIL_DOMAIN || process.env.VITE_APP_DOMAIN || 'coaileague.com';
  await handleInboundWebhook(req, res, `calloffs@${domain}`);
});

// POST /api/inbound/email/incidents
inboundEmailRouter.post('/incidents', async (req: Request, res: Response) => {
  const domain = process.env.INBOUND_EMAIL_DOMAIN || process.env.VITE_APP_DOMAIN || 'coaileague.com';
  await handleInboundWebhook(req, res, `incidents@${domain}`);
});

// POST /api/inbound/email/docs
inboundEmailRouter.post('/docs', async (req: Request, res: Response) => {
  const domain = process.env.INBOUND_EMAIL_DOMAIN || process.env.VITE_APP_DOMAIN || 'coaileague.com';
  await handleInboundWebhook(req, res, `docs@${domain}`);
});

// POST /api/inbound/email/support
inboundEmailRouter.post('/support', async (req: Request, res: Response) => {
  const domain = process.env.INBOUND_EMAIL_DOMAIN || process.env.VITE_APP_DOMAIN || 'coaileague.com';
  await handleInboundWebhook(req, res, `support@${domain}`);
});

// POST /api/inbound/email/per-org
// ─── Per-Org Catch-All ────────────────────────────────────────────────────────
// Resend routes all *.slug@coaileague.com addresses here.
// We resolve the workspace from the `to` address and let TrinityEmailProcessor
// handle type-specific routing (careers, calloffs, verify, support, trinity).
inboundEmailRouter.post('/per-org', async (req: Request, res: Response) => {
  const rawBody: Buffer = (req as any).rawBody || Buffer.from(JSON.stringify(req.body));

  const signatureValid = verifyResendSignature(rawBody, req.headers as any);
  if (!signatureValid) {
    log.warn('[InboundEmail/per-org] Invalid signature');
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  let payload: ResendInboundPayload;
  try {
    payload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString());
  } catch {
    res.status(200).json({ received: true, warning: 'Malformed payload' });
    return;
  }

  // Resolve `to` address — Resend sends it as a string or string[]
  const toRaw = Array.isArray(payload.to) ? payload.to[0] : (payload.to || '');
  const toMatch = toRaw.match(/<?([^>]+)>?$/);
  const toEmail = toMatch?.[1]?.trim().toLowerCase() || toRaw.toLowerCase();

  // Acknowledge immediately — never block Resend acknowledgment
  res.status(200).json({ received: true, routing: 'per-org' });

  setImmediate(async () => {
    try {
      const workspace = await trinityEmailProcessor.resolveWorkspaceFromEmail(toEmail);
      if (!workspace) {
        log.warn(`[InboundEmail/per-org] No workspace matched for ${toEmail}`);
        return;
      }

      const fromRaw = payload.from || '';
      const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s+)?<?([^>]+)>?$/);
      const fromEmail = fromMatch?.[2]?.trim() || fromRaw.trim();

      const messageId = payload.headers?.['message-id']
        || payload.headers?.['Message-ID']
        || `per-org-${Date.now()}`;

      const emailData: InboundEmailData = {
        to: toEmail,
        from: fromEmail,
        subject: payload.subject || '(no subject)',
        body: payload.text || '',
        htmlBody: payload.html || undefined,
        messageId,
        attachments: payload.attachments,
      };

      await trinityEmailProcessor.processInbound(emailData);
      log.info(`[InboundEmail/per-org] Processed email for workspace ${workspace.id} type=${trinityEmailProcessor.getAddressType(toEmail, workspace)}`);
    } catch (err: any) {
      log.error(`[InboundEmail/per-org] Error processing per-org email to ${toEmail}:`, err.message);
    }
  });
});

// Health probe
inboundEmailRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    endpoints: ['calloffs', 'incidents', 'docs', 'support', 'per-org'],
    perOrgRouting: 'enabled',
    signatureVerification: !!WEBHOOK_SECRET ? 'enabled' : 'disabled (no secret set)',
  });
});
