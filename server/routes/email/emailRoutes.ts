/**
 * EMAIL ROUTES
 * Platform managed business email via Resend
 *
 * Mounted at: /api/email
 *
 * Step 5 — Outbound Email API
 * Step 6 — Email Management API for Org Owners
 */

import { Router } from 'express';
import { pool } from '../../db';
import { requireAuth } from '../../rbac';
import { getUncachableResendClient } from '../../services/emailCore';
import { emailProvisioningService } from '../../services/email/emailProvisioningService';
import { EMAIL_PRICING } from '@shared/billingConfig';
import { createLogger } from '../../lib/logger';

const log = createLogger('EmailRoutes');
export const emailRouter = Router();

// ─── Auth guard on all routes ─────────────────────────────────────────────────
emailRouter.use(requireAuth);

// ─── Root domain protection guard ────────────────────────────────────────────
// Tenants (non platform_staff) cannot create, activate, or send from
// addresses on the coaileague.com root domain (e.g. trinity@, support@, info@).
// All tenant addresses must be on {slug}.coaileague.com subdomains.
emailRouter.use((req: any, res, next) => {
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isWrite) return next();

  const user = req.user;
  const isPlatformStaff = user?.role === 'platform_staff' || user?.role === 'platform_admin';

  // Check if any payload fields reference the root domain
  const body = req.body || {};
  const rootDomainPattern = /^[^@]+@coaileague\.com$/i;
  const suspects = [body.from, body.address, body.email].filter(Boolean);
  const hasRootDomainAddr = suspects.some((v: string) => rootDomainPattern.test(v));

  if (hasRootDomainAddr && !isPlatformStaff) {
    log.warn(`[EmailRoutes] Root domain address blocked for workspace user ${user?.id}`);
    return res.status(403).json({
      error: 'Address on root domain coaileague.com is reserved for platform staff only',
      code: 'ROOT_DOMAIN_PROTECTED',
    });
  }

  next();
});

type AuthReq = Express.Request & { user: { id: string; workspaceId: string; role: string } };

// ─── GET /api/email/inbox ─────────────────────────────────────────────────────
emailRouter.get('/inbox', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;
    const folder = (req.query.folder as string) || 'inbox';
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 50);
    const offset = (page - 1) * limit;

    const result = await pool.query(`
      SELECT
        id, direction, from_address, from_name, to_addresses,
        subject, snippet, folder, is_read, is_starred,
        trinity_processed, trinity_summary, trinity_priority, trinity_category,
        received_at, sent_at, created_at
      FROM platform_emails
      WHERE workspace_id = $1
        AND (owner_user_id = $2 OR owner_user_id IS NULL)
        AND folder = $3
        AND is_deleted = false
      ORDER BY COALESCE(received_at, sent_at, created_at) DESC
      LIMIT $4 OFFSET $5
    `, [workspaceId, userId, folder, limit, offset]);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM platform_emails
      WHERE workspace_id = $1
        AND (owner_user_id = $2 OR owner_user_id IS NULL)
        AND folder = $3 AND is_deleted = false
    `, [workspaceId, userId, folder]);

    return res.json({
      emails: result.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });
  } catch (err: any) {
    log.error('[EmailRoutes] inbox error:', err);
    return res.status(500).json({ error: 'Failed to fetch inbox' });
  }
});

// ─── GET /api/email/:emailId ──────────────────────────────────────────────────
emailRouter.get('/:emailId', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;
    const { emailId } = req.params;

    const result = await pool.query(`
      SELECT e.*,
        json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) as attachments
      FROM platform_emails e
      LEFT JOIN email_attachments a ON a.email_id = e.id
      WHERE e.id = $1 AND e.workspace_id = $2
      GROUP BY e.id
    `, [emailId, workspaceId]);

    if (!result.rows[0]) return res.status(404).json({ error: 'Email not found' });

    // Mark as read
    await pool.query(
      `UPDATE platform_emails SET is_read = true WHERE id = $1`,
      [emailId]
    );

    return res.json(result.rows[0]);
  } catch (err: any) {
    log.error('[EmailRoutes] get email error:', err);
    return res.status(500).json({ error: 'Failed to fetch email' });
  }
});

// ─── GET /api/email/thread/:messageId ────────────────────────────────────────
emailRouter.get('/thread/:messageId', async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const { messageId } = req.params;

    const result = await pool.query(`
      SELECT * FROM platform_emails
      WHERE workspace_id = $1
        AND (message_id = $2 OR in_reply_to = $2
             OR references_header ILIKE $3)
        AND is_deleted = false
      ORDER BY COALESCE(received_at, sent_at, created_at) ASC
    `, [workspaceId, messageId, `%${messageId}%`]);

    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// ─── POST /api/email/send ─────────────────────────────────────────────────────
emailRouter.post('/send', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;
    const { from, to, cc, subject, bodyHtml, bodyText, replyToEmailId } = req.body;

    if (!from || !to?.length || !subject) {
      return res.status(400).json({ error: 'from, to, and subject are required' });
    }

    // Validate from address belongs to this workspace and is active
    const addrResult = await pool.query(`
      SELECT * FROM platform_email_addresses
      WHERE address = $1 AND workspace_id = $2
        AND is_active = true AND is_outbound_only = false
    `, [from, workspaceId]);

    if (!addrResult.rows[0]) {
      return res.status(403).json({ error: 'From address is not authorized or inactive' });
    }

    const addr = addrResult.rows[0];

    // Check fair use limit
    if (addr.emails_sent_this_period >= addr.fair_use_monthly_limit) {
      return res.status(429).json({
        error: 'Monthly email limit reached',
        limit: addr.fair_use_monthly_limit,
        sent: addr.emails_sent_this_period,
      });
    }

    // Get in_reply_to headers for threading
    let inReplyTo: string | null = null;
    if (replyToEmailId) {
      const parent = await pool.query(
        `SELECT message_id FROM platform_emails WHERE id = $1`,
        [replyToEmailId]
      );
      inReplyTo = parent.rows[0]?.message_id || null;
    }

    // Send via Resend
    const { client, fromEmail } = await getUncachableResendClient();
    const sentFrom = addr.display_name ? `${addr.display_name} <${from}>` : from;

    let resendResult: any;
    try {
      resendResult = await client.emails.send({
        from: sentFrom,
        to: Array.isArray(to) ? to : [to],
        cc: cc || [],
        subject,
        html: bodyHtml,
        text: bodyText,
        ...(inReplyTo && { replyTo: inReplyTo }),
      });
    } catch (sendErr: any) {
      log.error('[EmailRoutes] Resend send error:', sendErr);
      // Store as draft/failed even if Resend fails — don't lose user's email
    }

    const messageId = `<${Date.now()}.${userId}@coaileague.com>`;

    // Store in platform_emails
    const emailResult = await pool.query(`
      INSERT INTO platform_emails (
        workspace_id, resend_email_id, message_id, in_reply_to,
        direction, from_address, to_addresses, cc_addresses,
        subject, body_html, body_text, snippet,
        owner_user_id, folder, sent_at
      ) VALUES ($1,$2,$3,$4,'outbound',$5,$6,$7,$8,$9,$10,$11,$12,'sent',NOW())
      RETURNING id
    `, [
      workspaceId,
      resendResult?.data?.id || null,
      messageId,
      inReplyTo,
      from,
      Array.isArray(to) ? to : [to],
      Array.isArray(cc) ? cc : [],
      subject,
      bodyHtml,
      bodyText,
      (bodyText || '').slice(0, 200),
      userId,
    ]);

    // Increment sent counter
    await pool.query(`
      UPDATE platform_email_addresses
      SET emails_sent_this_period = emails_sent_this_period + 1
      WHERE id = $1
    `, [addr.id]);

    return res.json({ success: true, emailId: emailResult.rows[0].id });
  } catch (err: any) {
    log.error('[EmailRoutes] send error:', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }
});

// ─── POST /api/email/:emailId/reply ──────────────────────────────────────────
emailRouter.post('/:emailId/reply', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;
    const { emailId } = req.params;

    const parent = await pool.query(
      `SELECT * FROM platform_emails WHERE id = $1 AND workspace_id = $2`,
      [emailId, workspaceId]
    );
    if (!parent.rows[0]) return res.status(404).json({ error: 'Email not found' });

    const p = parent.rows[0];
    return res.json({
      replyToEmailId: emailId,
      to: [p.from_address],
      subject: p.subject?.startsWith('Re:') ? p.subject : `Re: ${p.subject}`,
      inReplyTo: p.message_id,
      trinityDraftReply: p.trinity_draft_reply || '',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to prepare reply' });
  }
});

// ─── PATCH /api/email/:emailId ────────────────────────────────────────────────
emailRouter.patch('/:emailId', async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const { emailId } = req.params;
    const { is_read, is_starred, is_archived, folder } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (is_read !== undefined)     { updates.push(`is_read = $${idx++}`);     values.push(is_read); }
    if (is_starred !== undefined)  { updates.push(`is_starred = $${idx++}`);  values.push(is_starred); }
    if (is_archived !== undefined) { updates.push(`is_archived = $${idx++}`); values.push(is_archived); }
    if (folder !== undefined)      { updates.push(`folder = $${idx++}`);      values.push(folder); }

    if (!updates.length) return res.status(400).json({ error: 'No updates provided' });

    values.push(emailId, workspaceId);
    await pool.query(
      `UPDATE platform_emails SET ${updates.join(', ')} WHERE id = $${idx} AND workspace_id = $${idx + 1}`,
      values
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to update email' });
  }
});

// ─── DELETE /api/email/:emailId (soft delete) ─────────────────────────────────
emailRouter.delete('/:emailId', async (req: any, res) => {
  try {
    const { workspaceId } = req.user;
    const { emailId } = req.params;

    await pool.query(
      `UPDATE platform_emails SET folder = 'trash', is_deleted = true WHERE id = $1 AND workspace_id = $2`,
      [emailId, workspaceId]
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANAGEMENT ROUTES (org owner)
// ═══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/email/management ────────────────────────────────────────────────
emailRouter.get('/management', async (req: any, res) => {
  try {
    const { workspaceId } = req.user;

    const addresses = await pool.query(`
      SELECT
        pea.*,
        u.first_name, u.last_name, u.email as user_email,
        c.company_name as client_name
      FROM platform_email_addresses pea
      LEFT JOIN users u ON u.id = pea.user_id
      LEFT JOIN clients c ON c.id = pea.client_id
      WHERE pea.workspace_id = $1
      ORDER BY pea.address_type, pea.address
    `, [workspaceId]);

    const activeCount  = addresses.rows.filter(a => a.is_active && a.billing_seat_id).length;
    const monthlyCost  = activeCount * EMAIL_PRICING.perSeatMonthlyCents;

    return res.json({
      addresses: addresses.rows,
      summary: {
        totalAddresses: addresses.rows.length,
        activeSeats: activeCount,
        monthlyCostCents: monthlyCost,
        perSeatMonthlyCents: EMAIL_PRICING.perSeatMonthlyCents,
        fairUseEmailsPerSeat: EMAIL_PRICING.fairUseEmailsPerSeatMonthly,
      },
    });
  } catch (err: any) {
    log.error('[EmailRoutes] management error:', err);
    return res.status(500).json({ error: 'Failed to fetch email management data' });
  }
});

// ─── GET /api/email/management/stats ─────────────────────────────────────────
emailRouter.get('/management/stats', async (req: any, res) => {
  try {
    const { workspaceId } = req.user;

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_addresses,
        COUNT(*) FILTER (WHERE is_active = true) as active_addresses,
        COUNT(*) FILTER (WHERE is_active = false) as inactive_addresses,
        SUM(emails_sent_this_period) as total_sent,
        SUM(emails_received_this_period) as total_received,
        COUNT(*) FILTER (WHERE billing_seat_id IS NOT NULL AND is_active = true) as billed_seats,
        COUNT(*) FILTER (WHERE emails_sent_this_period >= fair_use_monthly_limit * 0.8) as approaching_limit
      FROM platform_email_addresses
      WHERE workspace_id = $1
    `, [workspaceId]);

    const s = stats.rows[0];
    const billedSeats = parseInt(s.billed_seats) || 0;

    return res.json({
      totalAddresses: parseInt(s.total_addresses),
      activeAddresses: parseInt(s.active_addresses),
      inactiveAddresses: parseInt(s.inactive_addresses),
      emailsSent: parseInt(s.total_sent) || 0,
      emailsReceived: parseInt(s.total_received) || 0,
      billedSeats,
      monthlyCostCents: billedSeats * EMAIL_PRICING.perSeatMonthlyCents,
      approachingLimit: parseInt(s.approaching_limit) || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── POST /api/email/addresses/:id/activate ───────────────────────────────────
emailRouter.post('/addresses/:id/activate', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;
    const { id: emailAddressId } = req.params;

    // Verify address belongs to this workspace
    const check = await pool.query(
      `SELECT id, address FROM platform_email_addresses WHERE id = $1 AND workspace_id = $2`,
      [emailAddressId, workspaceId]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Address not found' });

    // NOTE: Stripe subscription item created via emailProvisioningService on activation.
    // Billing seat ID generated here as idempotency key for the provisioning call.
    const stripeItemId = `email_seat_${emailAddressId}_${Date.now()}`;

    await emailProvisioningService.activateEmailAddress(emailAddressId, userId, stripeItemId);

    return res.json({ success: true, address: check.rows[0].address });
  } catch (err: any) {
    log.error('[EmailRoutes] activate error:', err);
    return res.status(500).json({ error: 'Failed to activate email address' });
  }
});

// ─── POST /api/email/addresses/:id/deactivate ─────────────────────────────────
emailRouter.post('/addresses/:id/deactivate', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;
    const { id: emailAddressId } = req.params;

    const check = await pool.query(
      `SELECT id, address, address_type FROM platform_email_addresses WHERE id = $1 AND workspace_id = $2`,
      [emailAddressId, workspaceId]
    );
    if (!check.rows[0]) return res.status(404).json({ error: 'Address not found' });
    if (check.rows[0].address_type === 'workspace_system') {
      return res.status(403).json({ error: 'System addresses cannot be deactivated' });
    }

    await emailProvisioningService.deactivateEmailAddress(emailAddressId, userId);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to deactivate email address' });
  }
});

// ─── POST /api/email/activate-all ────────────────────────────────────────────
emailRouter.post('/activate-all', async (req: any, res) => {
  try {
    const { workspaceId, id: userId } = req.user;

    const inactive = await pool.query(`
      SELECT id FROM platform_email_addresses
      WHERE workspace_id = $1 AND is_active = false
        AND address_type IN ('user_personal', 'user_client')
    `, [workspaceId]);

    let activated = 0;
    for (const row of inactive.rows) {
      try {
        const stripeItemId = `email_seat_${row.id}_${Date.now()}`;
        await emailProvisioningService.activateEmailAddress(row.id, userId, stripeItemId);
        activated++;
      } catch (e) {
        log.warn(`[EmailRoutes] activate-all: failed for ${row.id}`, e);
      }
    }

    return res.json({ success: true, activated });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to bulk activate' });
  }
});
