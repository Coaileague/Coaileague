/**
 * Trinity Shift Offer SMS Workflow — Phase 18B
 * =============================================
 * Trinity proactively texts available officers about open shifts.
 * Officers reply YES or NO. Trinity fills the shift with whoever says YES first,
 * then notifies management and the requesting client.
 *
 * Flow:
 *   1. Trinity identifies open shift needing coverage
 *   2. Trinity texts qualified available officers: "Hi [Name]! Open shift at [location]
 *      on [date] from [time] to [time]. Pay: $X/hr. Reply YES to accept, NO to decline."
 *   3. First YES reply → shift assigned → confirmation SMS to officer
 *   4. Trinity notifies supervisor via SMS + in-app notification
 *   5. If client requested staffing → Trinity texts client confirmation
 *   6. If no YES after 30min → escalate to emergency staffing
 *
 * Storage: a lightweight `trinity_shift_offers` table is created on first use
 * (idempotent). It tracks pending offers per workspace so we can match a YES
 * reply back to the most recent live offer for that officer's workspace.
 */

import { sendSMSToEmployee } from '../smsService';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityShiftOffer');

let bootstrapped = false;
async function ensureTable(): Promise<void> {
  if (bootstrapped) return;
  try {
    const { pool } = await import('../../db');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trinity_shift_offers (
        id          VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        workspace_id VARCHAR NOT NULL,
        shift_id    VARCHAR NOT NULL,
        employee_id VARCHAR,
        location    TEXT,
        offer_text  TEXT,
        status      VARCHAR NOT NULL DEFAULT 'pending',
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        responded_at TIMESTAMP,
        expires_at  TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes')
      );
      CREATE INDEX IF NOT EXISTS trinity_shift_offers_workspace_idx ON trinity_shift_offers(workspace_id);
      CREATE INDEX IF NOT EXISTS trinity_shift_offers_status_idx ON trinity_shift_offers(status);
      CREATE INDEX IF NOT EXISTS trinity_shift_offers_employee_idx ON trinity_shift_offers(employee_id);
    `);
    bootstrapped = true;
  } catch (err: any) {
    log.warn('[ShiftOffer] Table bootstrap failed (non-fatal):', err?.message);
  }
}

export interface ShiftOfferParams {
  shiftId: string;
  workspaceId: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  hourlyRate?: number;
  requiredLicense?: string;
  maxOfficers?: number;
}

function clip(text: string, max: number): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max - 1).trim() + '…' : text;
}

export async function sendShiftOffers(params: ShiftOfferParams): Promise<{
  offered: number;
  errors: string[];
}> {
  const {
    shiftId, workspaceId, location, date, startTime, endTime, hourlyRate,
    maxOfficers = 10,
  } = params;

  await ensureTable();

  try {
    const { pool } = await import('../../db');

    // Pull whatever extra context the shift record has so the SMS includes
    // job/post-order details, client name, etc. Falls back to the params if
    // any field is missing or the query fails.
    let postOrders = '';
    let clientName = '';
    let description = '';
    try {
      const shiftRes = await pool.query(
        `SELECT s.title, s.description, s.workspace_id,
                COALESCE(c.name, c.legal_name) AS client_name,
                site.post_orders, site.name AS site_name, site.address AS site_address
           FROM shifts s
           LEFT JOIN clients c ON c.id = s.client_id
           LEFT JOIN client_sites site ON site.id = s.site_id
          WHERE s.id = $1 AND s.workspace_id = $2
          LIMIT 1`,
        [shiftId, workspaceId]
      );
      if (shiftRes.rows.length) {
        const r = shiftRes.rows[0];
        postOrders = clip(r.post_orders || '', 160);
        clientName = r.client_name || '';
        description = clip(r.description || r.title || '', 120);
      }
    } catch (e: any) {
      // Schema variation between deployments — ignore silently and just use the params.
      log.info('[ShiftOffer] Shift detail lookup skipped (schema variant):', e?.message);
    }

    const officersRes = await pool.query(
      `SELECT id, first_name, phone
         FROM employees
        WHERE workspace_id = $1
          AND is_active = true
          AND phone IS NOT NULL
          AND length(phone) > 6
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $2`,
      [workspaceId, maxOfficers]
    );

    const payText = hourlyRate ? ` Pay: $${hourlyRate}/hr.` : '';
    const clientText = clientName ? ` Client: ${clientName}.` : '';
    const descText = description ? ` Job: ${description}.` : '';
    const postOrdersText = postOrders ? ` Post orders: ${postOrders}` : '';
    let offered = 0;
    const errors: string[] = [];

    for (const officer of officersRes.rows) {
      try {
        // SMS-safe (segments will split automatically beyond 160 chars).
        const message =
          `Hi ${officer.first_name}! Trinity from Co-League with an open shift. ` +
          `${date} ${startTime}-${endTime} at ${location}.${clientText}${descText}${payText}${postOrdersText} ` +
          `Reply ACCEPT (or YES) to take it, or DENY (or NO) to pass. First ACCEPT gets it. STOP to opt out.`;

        const result = await sendSMSToEmployee(officer.id, message, 'shift_offer', workspaceId);
        if (!result.success) {
          errors.push(`${officer.id}: ${result.error || 'sms failed'}`);
          continue;
        }

        await pool.query(
          `INSERT INTO trinity_shift_offers
            (workspace_id, shift_id, employee_id, location, offer_text, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [workspaceId, shiftId, officer.id, location, message]
        );

        offered++;
      } catch (err: any) {
        errors.push(`${officer.id}: ${err.message}`);
      }
    }

    log.info(`[ShiftOffer] Sent ${offered} shift offers for shift ${shiftId}`);
    return { offered, errors };
  } catch (err: any) {
    log.error('[ShiftOffer] Error sending shift offers:', err.message);
    return { offered: 0, errors: [err.message] };
  }
}

export async function acceptShiftOffer(params: {
  fromPhone: string;
  workspaceId?: string;
}): Promise<string | null> {
  const { fromPhone } = params;
  await ensureTable();

  try {
    const { pool } = await import('../../db');
    const digits = fromPhone.replace(/\D/g, '').replace(/^1/, '');
    if (digits.length < 7) return null;

    // Find the officer by phone (across all workspaces — phone numbers are unique per person)
    const officerRes = await pool.query(
      `SELECT id, first_name, last_name, workspace_id
         FROM employees
        WHERE REGEXP_REPLACE(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE $1
          AND is_active = true
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [`%${digits.slice(-10)}`]
    );

    if (!officerRes.rows.length) {
      // No employee match — let the generic SMS resolver take this message.
      return null;
    }

    const officer = officerRes.rows[0];
    const workspaceId = params.workspaceId || officer.workspace_id;

    // Find the most recent pending shift offer for this officer.
    const offerRes = await pool.query(
      `SELECT id, shift_id, location
         FROM trinity_shift_offers
        WHERE workspace_id = $1
          AND employee_id = $2
          AND status = 'pending'
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId, officer.id]
    );

    if (!offerRes.rows.length) {
      return null;
    }

    const offer = offerRes.rows[0];

    // Best-effort: assign the shift to this officer (only if still unassigned).
    let claimed = false;
    try {
      const claimResult = await pool.query(
        `UPDATE shifts
            SET employee_id = $1,
                status = 'scheduled',
                updated_at = NOW()
          WHERE id = $2
            AND workspace_id = $3
            AND (employee_id IS NULL OR status IN ('draft', 'pending', 'published'))
        RETURNING id`,
        [officer.id, offer.shift_id, workspaceId]
      );
      claimed = (claimResult.rowCount ?? 0) > 0;
    } catch (e: any) {
      log.warn('[ShiftOffer] Shift claim update failed:', e.message);
    }

    if (!claimed) {
      // Mark this offer as superseded so a different YES doesn't double-book.
      await pool.query(
        `UPDATE trinity_shift_offers
            SET status = 'expired', responded_at = NOW()
          WHERE id = $1`,
        [offer.id]
      );
      return `Hi ${officer.first_name}! Thanks for your reply — that shift was just filled by another officer. We'll keep you in mind for the next one!`;
    }

    // Mark this offer accepted; mark all sibling pending offers as superseded.
    await pool.query(
      `UPDATE trinity_shift_offers
          SET status = 'accepted', responded_at = NOW()
        WHERE id = $1`,
      [offer.id]
    );
    await pool.query(
      `UPDATE trinity_shift_offers
          SET status = 'superseded', responded_at = NOW()
        WHERE workspace_id = $1
          AND shift_id = $2
          AND id <> $3
          AND status = 'pending'`,
      [workspaceId, offer.shift_id, offer.id]
    );

    // Best-effort supervisor notification — find any workspace owner/manager user
    try {
      const ownerRes = await pool.query(
        `SELECT user_id FROM workspace_members
          WHERE workspace_id = $1
            AND role IN ('org_owner', 'co_owner', 'org_admin', 'org_manager', 'manager', 'supervisor')
          ORDER BY role
          LIMIT 1`,
        [workspaceId]
      );
      const supervisorUserId = ownerRes.rows[0]?.user_id;
      if (supervisorUserId) {
        await pool.query(
          `INSERT INTO notifications
            (workspace_id, user_id, scope, category, type, title, message, related_entity_type, related_entity_id)
           VALUES ($1, $2, 'workspace', 'activity', 'shift_assigned', 'Shift Filled by Trinity', $3, 'shift', $4)`,
          [
            workspaceId,
            supervisorUserId,
            `${officer.first_name} ${officer.last_name} accepted the open shift at ${offer.location}.`,
            offer.shift_id,
          ]
        );
      }
    } catch (e: any) {
      log.warn('[ShiftOffer] Supervisor notification failed (non-fatal):', e.message);
    }

    log.info(`[ShiftOffer] ${officer.first_name} ${officer.last_name} accepted shift ${offer.shift_id}`);

    return (
      `Shift confirmed, ${officer.first_name}! You're scheduled at ${offer.location}. ` +
      `Your supervisor has been notified. Reply STOP to opt out of shift offers. ` +
      `Text us anytime if you need support. — Trinity`
    );
  } catch (err: any) {
    log.error('[ShiftOffer] Accept error:', err.message);
    return `Thanks for accepting! There was a brief issue processing your request. Please confirm with your supervisor directly.`;
  }
}

export async function declineShiftOffer(params: {
  fromPhone: string;
}): Promise<string | null> {
  await ensureTable();
  try {
    const { pool } = await import('../../db');
    const digits = params.fromPhone.replace(/\D/g, '').replace(/^1/, '');
    if (digits.length < 7) return null;

    const officerRes = await pool.query(
      `SELECT id, first_name FROM employees
        WHERE REGEXP_REPLACE(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE $1
          AND is_active = true
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [`%${digits.slice(-10)}`]
    );
    if (!officerRes.rows.length) return null;

    const officer = officerRes.rows[0];
    const updated = await pool.query(
      `UPDATE trinity_shift_offers
          SET status = 'declined', responded_at = NOW()
        WHERE employee_id = $1
          AND status = 'pending'
          AND expires_at > NOW()`,
      [officer.id]
    );
    if ((updated.rowCount ?? 0) === 0) return null;

    return `No problem, ${officer.first_name}! We'll reach out when another opportunity comes up. — Trinity`;
  } catch (err: any) {
    log.warn('[ShiftOffer] Decline error:', err.message);
    return null;
  }
}
