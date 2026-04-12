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
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';
import { pool } from '../db';
import { NotificationDeliveryService } from '../services/notificationDeliveryService';
import { isProduction } from '../lib/isProduction';
import { sendCanSpamCompliantEmail } from '../services/emailCore';
import { registerLegacyBootstrap } from '../services/legacyBootstrapRegistry';
const log = createLogger('InboundEmailRoutes');

import {
  processInboundEmail,
  detectCategoryFromRecipient,
  type ParsedInboundEmail,
} from '../services/trinity/trinityInboundEmailProcessor';
import { trinityEmailProcessor, type InboundEmailData } from '../services/trinityEmailProcessor';

// ─── Email Tables Bootstrap ──────────────────────────────────────────────────
// These tables were specified but never wired into the bootstrap pipeline.
// They must exist before any inbound email processing can work.
registerLegacyBootstrap('email-tables', async (p) => {
  await p.query(`
    CREATE TABLE IF NOT EXISTS platform_email_addresses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR,
      user_id VARCHAR,
      client_id VARCHAR,
      address VARCHAR(320) NOT NULL UNIQUE,
      local_part VARCHAR(255) NOT NULL,
      subdomain VARCHAR(100),
      display_name VARCHAR(255),
      address_type VARCHAR(50) NOT NULL,
      is_active BOOLEAN DEFAULT false,
      is_protected BOOLEAN DEFAULT false,
      is_outbound_only BOOLEAN DEFAULT false,
      activated_at TIMESTAMPTZ,
      activated_by VARCHAR,
      deactivated_at TIMESTAMPTZ,
      billing_seat_id VARCHAR(255),
      fair_use_monthly_limit INTEGER DEFAULT 500,
      emails_sent_this_period INTEGER DEFAULT 0,
      emails_received_this_period INTEGER DEFAULT 0,
      auto_trinity_process BOOLEAN DEFAULT false,
      trinity_calltype VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_email_addresses_address
      ON platform_email_addresses(address);
    CREATE INDEX IF NOT EXISTS idx_email_addresses_workspace
      ON platform_email_addresses(workspace_id);

    CREATE TABLE IF NOT EXISTS email_routing (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      address VARCHAR(320) NOT NULL UNIQUE,
      email_address_id UUID,
      route_type VARCHAR(50) NOT NULL,
      target_workspace_id VARCHAR,
      target_user_id VARCHAR,
      target_inbox_type VARCHAR(100),
      auto_process BOOLEAN DEFAULT false,
      process_as VARCHAR(100),
      forward_to VARCHAR(320),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_email_routing_address
      ON email_routing(address);

    CREATE TABLE IF NOT EXISTS platform_emails (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id VARCHAR,
      resend_email_id VARCHAR(255) UNIQUE,
      message_id VARCHAR(500),
      in_reply_to VARCHAR(500),
      references_header TEXT,
      direction VARCHAR(20) NOT NULL,
      from_address VARCHAR(320) NOT NULL,
      from_name VARCHAR(255),
      to_addresses TEXT[] NOT NULL,
      cc_addresses TEXT[] DEFAULT '{}',
      bcc_addresses TEXT[] DEFAULT '{}',
      reply_to VARCHAR(320),
      subject TEXT,
      body_html TEXT,
      body_text TEXT,
      snippet TEXT,
      owner_user_id VARCHAR,
      owner_client_id VARCHAR,
      folder VARCHAR(50) DEFAULT 'inbox',
      is_read BOOLEAN DEFAULT false,
      is_starred BOOLEAN DEFAULT false,
      is_archived BOOLEAN DEFAULT false,
      is_deleted BOOLEAN DEFAULT false,
      trinity_processed BOOLEAN DEFAULT false,
      trinity_processed_at TIMESTAMPTZ,
      trinity_category VARCHAR(100),
      trinity_summary TEXT,
      trinity_action_taken VARCHAR(100),
      trinity_action_record_id UUID,
      trinity_draft_reply TEXT,
      trinity_priority VARCHAR(20) DEFAULT 'normal',
      received_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_platform_emails_workspace
      ON platform_emails(workspace_id, folder, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_platform_emails_owner
      ON platform_emails(owner_user_id, folder, is_read);
    CREATE INDEX IF NOT EXISTS idx_platform_emails_thread
      ON platform_emails(message_id, in_reply_to);

    CREATE TABLE IF NOT EXISTS email_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email_id UUID NOT NULL REFERENCES platform_emails(id) ON DELETE CASCADE,
      filename VARCHAR(500) NOT NULL,
      content_type VARCHAR(200),
      size_bytes INTEGER,
      storage_url TEXT,
      sha256_hash VARCHAR(64),
      is_inline BOOLEAN DEFAULT false,
      content_id VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_email_attachments_email
      ON email_attachments(email_id);
  `);
});

// ─── Platform Root Address Forwarding ────────────────────────────────────────
// root@coaileague.com forwards to the platform owner's personal email.
const ROOT_EMAIL_FORWARD_TO = process.env.ROOT_EMAIL_FORWARD_TO || 'saraybebo@gmail.com';

export const inboundEmailRouter = Router();

// ─── Signature Verification ───────────────────────────────────────────────────

const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || '';

/**
 * Verify Resend inbound webhook signature per Svix specification.
 *
 * Svix signed-content format (required):
 *   "{svix-id}.{svix-timestamp}.{rawBody}"
 *
 * The webhook signing secret is stored as a base64-encoded string (with an
 * optional "whsec_" prefix that must be stripped before decoding).
 * The header is svix-signature: v1,<base64-sig> (space-separated for multiple).
 */
function verifyResendSignature(rawBody: Buffer | string, headers: Record<string, string | string[] | undefined>): boolean {
  if (!WEBHOOK_SECRET) {
    log.warn('[InboundEmail] RESEND_WEBHOOK_SECRET not set — skipping signature verification in dev');
    return !isProduction();
  }

  // Svix delivers: svix-id, svix-timestamp, svix-signature
  const sigHeader = headers['svix-signature'] || headers['x-resend-signature'] || '';
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : String(sigHeader);
  const tsHeader = headers['svix-timestamp'] || '';
  const timestamp = Array.isArray(tsHeader) ? tsHeader[0] : String(tsHeader);
  const idHeader = headers['svix-id'] || '';
  const msgId = Array.isArray(idHeader) ? idHeader[0] : String(idHeader);

  if (!signature || !timestamp || !msgId) {
    log.warn('[InboundEmail] Missing svix-signature, svix-timestamp, or svix-id header');
    return !isProduction();
  }

  // Replay protection: reject webhooks older than 5 minutes
  const timestampMs = parseInt(timestamp, 10) * 1000;
  if (isNaN(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    log.warn('[InboundEmail] Svix timestamp too old or invalid — possible replay attack');
    return false;
  }

  try {
    // Svix signed content: "{svix-id}.{svix-timestamp}.{rawBody}"
    const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const signedContent = `${msgId}.${timestamp}.${bodyStr}`;

    // Strip optional "whsec_" prefix; Svix stores the secret as base64-encoded bytes
    const secretKey = WEBHOOK_SECRET.startsWith('whsec_')
      ? WEBHOOK_SECRET.slice(6)
      : WEBHOOK_SECRET;
    // Base64-decode the secret to get raw HMAC key bytes
    const secretBuffer = Buffer.from(secretKey, 'base64');

    const expectedSig = createHmac('sha256', secretBuffer)
      .update(signedContent)
      .digest('base64');

    // svix-signature may contain space-separated "v1,<base64sig>" tokens
    const candidates = signature.split(' ');
    for (const candidate of candidates) {
      const [version, sigValue] = candidate.split(',');
      if (version !== 'v1' || !sigValue) continue;
      try {
        const a = Buffer.from(sigValue);
        const b = Buffer.from(expectedSig);
        if (a.length === b.length && timingSafeEqual(a, b)) {
          return true;
        }
      } catch {
        // length mismatch — try next candidate
      }
    }

    log.warn('[InboundEmail] No matching svix signature found');
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

  let rawParsed: any;
  try {
    rawParsed = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString());
  } catch (parseErr: any) {
    // Check 10: Malformed payload — log and return 200 (never 5xx)
    log.error(`[InboundEmail] Malformed payload for ${targetAddress}:`, parseErr.message);
    res.status(200).json({ received: true, warning: 'Malformed payload — flagged for admin review' });
    return;
  }

  // Unwrap Resend event envelope if present
  const payload: ResendInboundPayload = rawParsed.data && rawParsed.type === 'email.received'
    ? rawParsed.data
    : rawParsed;

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
  scheduleNonBlocking(`inbound-email.${category}`, async () => {
    const result = await processInboundEmail(parsed);
    log.info(`[InboundEmail] ${category} processed:`, result.status, result.message);
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

  let rawPayload: any;
  try {
    rawPayload = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString());
  } catch {
    log.warn('[InboundEmail/root] Malformed payload — accepted silently');
    res.status(200).json({ received: true });
    return;
  }

  // Step 2: Unwrap Resend event envelope — Resend sends email.received events
  // as { type: "email.received", created_at: "...", data: { from, to, ... } }.
  // The actual email fields are inside `data`, not at the top level.
  const payload: ResendInboundPayload = rawPayload.data && rawPayload.type === 'email.received'
    ? rawPayload.data
    : rawPayload;

  // Step 3: Parse fields
  const resendEmailId = (payload as any).email_id || (rawPayload as any).id || undefined;
  const toRaw = Array.isArray(payload.to) ? payload.to[0] : (payload.to || '');
  const toMatch = toRaw.match(/<?([^>]+)>?$/);
  const toEmail = (toMatch?.[1]?.trim() || toRaw).toLowerCase();

  const fromRaw = (payload as any).from || '';
  const fromMatch = fromRaw.match(/^(?:"?([^"<]+)"?\s+)?<?([^>]+)>?$/);
  const fromEmail = fromMatch?.[2]?.trim() || fromRaw.trim();
  const fromName  = fromMatch?.[1]?.trim() || undefined;

  const messageId   = (payload as any).message_id || payload.headers?.['message-id'] || payload.headers?.['Message-ID'] || undefined;
  const inReplyTo   = payload.headers?.['in-reply-to'] || undefined;
  const references  = payload.headers?.['references'] || undefined;
  const subject     = payload.subject || '(no subject)';
  const bodyHtml    = payload.html || undefined;
  const bodyText    = payload.text || undefined;
  const snippet     = (bodyText || '').replace(/\s+/g, ' ').slice(0, 200) || undefined;
  const attachments = payload.attachments || [];

  try {
    // Step 3a: Platform root address forwarding — root@coaileague.com
    // Forward to configured personal email before DB lookup (tables may not route it)
    if (toEmail === 'root@coaileague.com' || toEmail === 'noreply@coaileague.com') {
      if (toEmail === 'noreply@coaileague.com') {
        log.info(`[InboundEmail/root] Discarding email to noreply@`);
        res.status(200).json({ received: true, routed: false, reason: 'noreply_discard' });
        return;
      }
      // root@ — accept and forward
      log.info(`[InboundEmail/root] root@ email from ${fromEmail} — forwarding to ${ROOT_EMAIL_FORWARD_TO}`);
      res.status(200).json({ received: true, routed: true, routeType: 'root_forward' });

      scheduleNonBlocking('inbound-email.root-forward', async () => {
        try {
          const fwdSubject = `Fwd: ${subject}`;
          const originalDate = new Date().toUTCString();
          const fwdHtml = `
<div style="font-family:Arial,sans-serif;max-width:700px;color:#222;">
  <p style="color:#555;font-size:13px;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:16px;">
    -------- Forwarded from root@coaileague.com --------<br>
    <strong>From:</strong> ${fromName ? `${fromName} &lt;${fromEmail}&gt;` : fromEmail}<br>
    <strong>To:</strong> ${toEmail}<br>
    <strong>Date:</strong> ${originalDate}<br>
    <strong>Subject:</strong> ${subject}
  </p>
  ${bodyHtml || `<pre style="white-space:pre-wrap;font-size:13px;">${(bodyText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`}
</div>`;

          await sendCanSpamCompliantEmail({
            to: ROOT_EMAIL_FORWARD_TO,
            subject: fwdSubject,
            html: fwdHtml,
            emailType: 'inbound_forward',
            skipUnsubscribeCheck: true,
          });
          log.info(`[InboundEmail/root] Forwarded root@ email to ${ROOT_EMAIL_FORWARD_TO}`);
        } catch (fwdErr: any) {
          log.warn(`[InboundEmail/root] root@ forward failed: ${fwdErr?.message}`);
        }
      });
      return;
    }

    // Step 4: Deduplication — if resend_email_id seen already, ack and exit
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

    // Step 8: Trinity auto-process (deferred via scheduleNonBlocking)
    if (route.auto_process && route.process_as && workspaceId) {
      scheduleNonBlocking('inbound-email.trinity-auto-process', async () => {
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
      });
    }

    // Step 9: user_inbox — NDS new_email_received
    if (route.route_type === 'user_inbox' && targetUserId && workspaceId) {
      scheduleNonBlocking('inbound-email.user-inbox-nds', async () => {
        await NotificationDeliveryService.send({
          type: 'new_email_received',
          workspaceId,
          recipientUserId: targetUserId,
          channel: 'in_app',
          body: { from: fromEmail, subject, emailId },
          idempotencyKey: emailId ? `new_email_received-${emailId}` : undefined,
        });
      });
    }

    // Step 10: Inbound email forwarding — if workspace has inbound_email_forward_to set,
    // forward a copy of this email to that external address (tenant owner's personal inbox).
    if (workspaceId) {
      scheduleNonBlocking('inbound-email.forward', async () => {
        try {
          const wsResult = await pool.query(
            `SELECT inbound_email_forward_to FROM workspaces WHERE id = $1 LIMIT 1`,
            [workspaceId]
          );
          const forwardTo: string | null = wsResult.rows[0]?.inbound_email_forward_to || null;
          if (!forwardTo) return;

          const fwdSubject = `Fwd: ${subject}`;
          const originalDate = new Date().toUTCString();
          const fwdHtml = `
<div style="font-family:Arial,sans-serif;max-width:700px;color:#222;">
  <p style="color:#555;font-size:13px;border-bottom:1px solid #ddd;padding-bottom:8px;margin-bottom:16px;">
    -------- Forwarded Message --------<br>
    <strong>From:</strong> ${fromName ? `${fromName} &lt;${fromEmail}&gt;` : fromEmail}<br>
    <strong>To:</strong> ${toEmail}<br>
    <strong>Date:</strong> ${originalDate}<br>
    <strong>Subject:</strong> ${subject}
  </p>
  ${bodyHtml || `<pre style="white-space:pre-wrap;font-size:13px;">${(bodyText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`}
</div>`;

          await sendCanSpamCompliantEmail({
            to: forwardTo,
            subject: fwdSubject,
            html: fwdHtml,
            emailType: 'inbound_forward',
            workspaceId,
            skipUnsubscribeCheck: true,
          });
          log.info(`[InboundEmail/forward] Forwarded email to ${forwardTo} for workspace ${workspaceId}`);
        } catch (fwdErr: any) {
          log.warn(`[InboundEmail/forward] Forward failed for workspace ${workspaceId}: ${fwdErr?.message}`);
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

  let rawPerOrg: any;
  try {
    rawPerOrg = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString());
  } catch {
    res.status(200).json({ received: true, warning: 'Malformed payload' });
    return;
  }

  // Unwrap Resend event envelope if present
  const payload: ResendInboundPayload = rawPerOrg.data && rawPerOrg.type === 'email.received'
    ? rawPerOrg.data
    : rawPerOrg;

  // Resolve `to` address — Resend sends it as a string or string[]
  const toRaw = Array.isArray(payload.to) ? payload.to[0] : (payload.to || '');
  const toMatch = toRaw.match(/<?([^>]+)>?$/);
  const toEmail = toMatch?.[1]?.trim().toLowerCase() || toRaw.toLowerCase();

  // Acknowledge immediately — never block Resend acknowledgment
  res.status(200).json({ received: true, routing: 'per-org' });

  scheduleNonBlocking('inbound-email.per-org-process', async () => {
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
