/**
 * EMPLOYMENT VERIFY ROUTES — Phase 27
 * ===================================
 * Management-facing approve/deny endpoints for employment verification
 * requests received via verify@{slug}.coaileague.com.
 *
 *   GET /api/employment-verify/approve/:refNum
 *   GET /api/employment-verify/deny/:refNum
 *
 * FCRA boundary — approve sends ONLY: name, employee ID, title, status,
 * start date, compensation band (no exact figure), and the officer
 * readiness score + link. Never: exact salary, disciplinary details,
 * termination reason, performance reviews, medical/personal info.
 *
 * Authorization: requireAuth + manager-level role. A manager must have
 * received a signed employee authorization form before approving.
 */

import { Router, type Response } from 'express';
import { requireAuth, requireManager, requireOwner, type AuthenticatedRequest } from '../rbac';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
import { sendCanSpamCompliantEmail } from '../services/emailCore';
import { logActionAudit } from '../services/ai-brain/actionAuditLogger';
import { scheduleNonBlocking } from '../lib/scheduleNonBlocking';

const log = createLogger('EmploymentVerifyRoutes');

export const employmentVerifyRouter = Router();

const APP_BASE_URL = (process.env.APP_BASE_URL || 'https://www.coaileague.com').replace(/\/$/, '');

function sanitize(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface TicketPayload {
  requester?: {
    requester_name?: string;
    requester_organization?: string;
    requester_email?: string;
    employee_name?: string;
    purpose?: string;
  };
  employeeFound?: boolean;
  employeeId?: string | null;
  employeeName?: string | null;
  employeeNumber?: string | null;
  hasAuthorization?: boolean;
  authorizationConfidence?: number;
  originalEmail?: string;
  fromEmail?: string;
  fromName?: string | null;
  subject?: string;
  slug?: string;
  refNum?: string;
}

function parseTicketDescription(description: string | null | undefined): TicketPayload {
  if (!description) return {};
  try {
    const parsed = JSON.parse(description);
    return typeof parsed === 'object' && parsed !== null ? (parsed as TicketPayload) : {};
  } catch {
    return {};
  }
}

function formatDate(value: unknown): string {
  if (!value) return 'N/A';
  try {
    const d = new Date(value as string);
    if (Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('en-US');
  } catch {
    return 'N/A';
  }
}

function toPayBand(hourlyRate: number | null): string {
  if (hourlyRate === null || Number.isNaN(hourlyRate)) {
    return 'Market rate — contact HR for specifics';
  }
  // FCRA: share a band, not the exact figure.
  if (hourlyRate < 15) return 'Under $15/hr';
  if (hourlyRate < 20) return '$15–$20/hr';
  if (hourlyRate < 25) return '$20–$25/hr';
  if (hourlyRate < 30) return '$25–$30/hr';
  if (hourlyRate < 40) return '$30–$40/hr';
  if (hourlyRate < 50) return '$40–$50/hr';
  return '$50/hr or higher';
}

async function loadTicket(refNum: string, workspaceId: string) {
  const { rows } = await pool.query(
    `SELECT id, workspace_id, ticket_number, subject, description, status
       FROM support_tickets
      WHERE ticket_number = $1
        AND workspace_id = $2
        AND type = 'employment_verification'
      LIMIT 1`,
    [refNum, workspaceId]
  );
  return rows[0] || null;
}

async function loadEmployee(workspaceId: string, employeeId: string) {
  const { rows } = await pool.query(
    `SELECT id,
            first_name,
            last_name,
            employee_number,
            role,
            position,
            organizational_title,
            hire_date,
            termination_date,
            status,
            is_active,
            hourly_rate,
            scheduling_score
       FROM employees
      WHERE id = $1
        AND workspace_id = $2
      LIMIT 1`,
    [employeeId, workspaceId]
  );
  return rows[0] || null;
}

employmentVerifyRouter.get(
  '/approve/:refNum',
  requireAuth,
  requireManager,
  async (req: AuthenticatedRequest, res: Response) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
    const refNum = (req.params.refNum || '').toUpperCase();
    if (!/^VER-[A-Z0-9]{4,10}$/.test(refNum)) {
      return res.status(400).json({ error: 'INVALID_REFERENCE' });
    }

    try {
      const ticket = await loadTicket(refNum, workspaceId);
      if (!ticket) return res.status(404).json({ error: 'NOT_FOUND' });
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        return res.status(409).json({ error: 'ALREADY_PROCESSED', status: ticket.status });
      }

      const payload = parseTicketDescription(ticket.description);
      const requesterEmail = payload.requester?.requester_email || payload.fromEmail;
      if (!requesterEmail || !/@/.test(requesterEmail)) {
        return res.status(400).json({ error: 'NO_REQUESTER_EMAIL' });
      }
      if (!payload.employeeId) {
        return res.status(404).json({ error: 'EMPLOYEE_NOT_FOUND_IN_SYSTEM' });
      }

      const emp = await loadEmployee(workspaceId, payload.employeeId);
      if (!emp) {
        return res.status(404).json({ error: 'EMPLOYEE_NOT_FOUND' });
      }

      const scoreUrl = `${APP_BASE_URL}/officer-score-explanation`;
      const isActive = emp.is_active === true || emp.status === 'active';
      const hourly = emp.hourly_rate !== null && emp.hourly_rate !== undefined
        ? Number(emp.hourly_rate)
        : null;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 640px; color: #111;">
          <h2 style="margin-bottom:8px;">Employment Verification Response</h2>
          <p><strong>Reference:</strong> ${sanitize(refNum)}</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
          <table cellpadding="6" cellspacing="0" style="border-collapse:collapse;">
            <tr><td><strong>Full Name:</strong></td><td>${sanitize(emp.first_name)} ${sanitize(emp.last_name)}</td></tr>
            <tr><td><strong>Employee ID:</strong></td><td>${sanitize(emp.employee_number || 'N/A')}</td></tr>
            <tr><td><strong>Job Title:</strong></td><td>${sanitize(emp.role || emp.position || emp.organizational_title || 'Security Officer')}</td></tr>
            <tr><td><strong>Employment Status:</strong></td><td>${isActive ? 'Currently Employed' : 'Former Employee'}</td></tr>
            <tr><td><strong>Start Date:</strong></td><td>${sanitize(formatDate(emp.hire_date))}</td></tr>
            ${!isActive ? `<tr><td><strong>End Date:</strong></td><td>[Contact HR directly for end date details]</td></tr>` : ''}
            <tr><td><strong>Compensation Band:</strong></td><td>${sanitize(toPayBand(hourly))}</td></tr>
            <tr><td><strong>Officer Readiness Score:</strong></td><td>${emp.scheduling_score ?? 'N/A'} / 100 &mdash; <a href="${scoreUrl}">What does this score mean?</a></td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />
          <p style="color:#666;font-size:11px;">
            This verification is provided pursuant to a signed employee authorization form on file.
            The information above is confidential and is provided solely for the purpose stated in the authorization.
            Unauthorized disclosure may violate the Fair Credit Reporting Act (FCRA) and applicable state law.
            No salary, disciplinary, or performance information is disclosed by this channel.
          </p>
        </div>`;

      await sendCanSpamCompliantEmail({
        to: requesterEmail,
        subject: `Employment Verification — ${emp.first_name} ${emp.last_name} — Ref ${refNum}`,
        html,
        emailType: 'employment_verification_response',
        workspaceId,
        skipUnsubscribeCheck: true,
      });

      const actorUserId = (req as any).user?.id ?? null;
      const actorRole = (req as any).workspaceRole ?? null;
      const actorPlatformRole = (req as any).platformRole ?? null;
      await pool.query(
        `UPDATE support_tickets
            SET status = 'resolved',
                resolved_at = NOW(),
                resolved_by = $1,
                resolution = 'Verification approved and FCRA-compliant response emailed to requester.',
                updated_at = NOW()
          WHERE ticket_number = $2
            AND workspace_id = $3`,
        [actorUserId, refNum, workspaceId]
      );

      // FCRA audit — who approved, when, which employee, which requester.
      // Never logs salary, disciplinary notes, or other FCRA-restricted data.
      await logActionAudit({
        actionId: 'employment_verification.approve',
        workspaceId,
        userId: actorUserId,
        userRole: actorRole,
        platformRole: actorPlatformRole,
        entityType: 'employment_verification',
        entityId: refNum,
        success: true,
        message: 'Verification approved and FCRA-compliant response emailed.',
        changesAfter: {
          refNum,
          ticketId: ticket.id,
          employeeId: emp.id,
          employeeNumber: emp.employee_number,
          requesterEmail,
          fieldsDisclosed: ['name', 'employee_id', 'title', 'status', 'start_date', 'pay_band', 'officer_score'],
        },
      });

      // ── Bill verification fee to workspace (non-blocking) ─────────────────
      // Billing failure must never prevent the verification response from
      // being sent to the requester.
      scheduleNonBlocking('employment-verify.bill', async () => {
        try {
          const settingRows = await pool.query(
            `SELECT verification_fee_cents, verification_enabled
               FROM workspace_verification_settings
              WHERE workspace_id = $1 LIMIT 1`,
            [workspaceId],
          );
          const row = settingRows.rows[0] as any;
          const feeCents: number = row?.verification_fee_cents ?? 100;
          const enabled: boolean = row?.verification_enabled ?? true;

          if (!enabled) {
            log.info(`[EmploymentVerify] Billing skipped — disabled for ${workspaceId}`);
            return;
          }

          await pool.query(
            `
            INSERT INTO platform_service_charges
              (id, workspace_id, charge_type, description,
               amount_cents, reference_id, charged_at)
            VALUES
              (gen_random_uuid(), $1, 'employment_verification',
               'Employment verification — Ref ' || $2,
               $3, $4, NOW())
            ON CONFLICT DO NOTHING
          `,
            [workspaceId, refNum, feeCents, ticket.id],
          );

          await pool.query(
            `
            INSERT INTO workspace_verification_settings
              (workspace_id, verification_count_this_month, verification_revenue_this_month)
            VALUES ($1, 1, $2)
            ON CONFLICT (workspace_id) DO UPDATE
              SET verification_count_this_month   = workspace_verification_settings.verification_count_this_month + 1,
                  verification_revenue_this_month = workspace_verification_settings.verification_revenue_this_month + EXCLUDED.verification_revenue_this_month,
                  updated_at = NOW()
          `,
            [workspaceId, feeCents],
          );

          log.info(`[EmploymentVerify] Billed ${feeCents} cents to ${workspaceId} for ${refNum}`);
        } catch (billingErr: any) {
          log.warn('[EmploymentVerify] Billing failed (non-blocking):', billingErr?.message);
        }
      });

      log.info(`[EmploymentVerify] ${refNum} approved; verification sent to ${requesterEmail}`);

      // Middleware billing — non-blocking so the manager UX isn't delayed by Stripe.
      // Default $1.00; workspaces can override via workspace_verification_settings
      // (if present) within $0.50–$5.00 per billingConfig.
      scheduleNonBlocking('employment-verify.middleware-fee', async () => {
        const { chargeEmploymentVerificationFee } = await import(
          '../services/billing/middlewareTransactionFees'
        );
        let feeCents = 100;
        try {
          const settingRows = await pool.query(
            `SELECT verification_fee_cents
               FROM workspace_verification_settings
              WHERE workspace_id = $1
              LIMIT 1`,
            [workspaceId]
          );
          const override = settingRows.rows[0]?.verification_fee_cents;
          if (typeof override === 'number' && override >= 50 && override <= 500) {
            feeCents = override;
          }
        } catch {
          // Table may not exist yet — fall back to default fee.
        }
        await chargeEmploymentVerificationFee({ workspaceId, referenceId: refNum, feeCents });
      });

      return res.json({
        success: true,
        message: 'Verification sent to requester.',
        refNum,
        employeeNumber: emp.employee_number,
      });
    } catch (err: any) {
      log.error(`[EmploymentVerify] approve error: ${err?.message}`);
      await logActionAudit({
        actionId: 'employment_verification.approve',
        workspaceId,
        userId: (req as any).user?.id ?? null,
        entityType: 'employment_verification',
        entityId: refNum,
        success: false,
        errorMessage: err?.message,
      });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

employmentVerifyRouter.get(
  '/deny/:refNum',
  requireAuth,
  requireManager,
  async (req: AuthenticatedRequest, res: Response) => {
    const workspaceId = req.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
    const refNum = (req.params.refNum || '').toUpperCase();
    if (!/^VER-[A-Z0-9]{4,10}$/.test(refNum)) {
      return res.status(400).json({ error: 'INVALID_REFERENCE' });
    }

    try {
      const ticket = await loadTicket(refNum, workspaceId);
      if (!ticket) return res.status(404).json({ error: 'NOT_FOUND' });
      if (ticket.status === 'resolved' || ticket.status === 'closed') {
        return res.status(409).json({ error: 'ALREADY_PROCESSED', status: ticket.status });
      }

      const payload = parseTicketDescription(ticket.description);
      const requesterEmail = payload.requester?.requester_email || payload.fromEmail;

      if (requesterEmail && /@/.test(requesterEmail)) {
        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 640px; color: #111;">
            <p>We are unable to process your employment verification request (Ref: <strong>${sanitize(refNum)}</strong>) at this time.</p>
            <p>This may be because we have not received a signed employee authorization form, or because the requested employee is not in our system.</p>
            <p>Please contact the employer directly for further assistance.</p>
          </div>`;
        await sendCanSpamCompliantEmail({
          to: requesterEmail,
          subject: `Employment Verification — Unable to Process — Ref ${refNum}`,
          html,
          emailType: 'employment_verification_denied',
          workspaceId,
          skipUnsubscribeCheck: true,
        });
      }

      const actorUserId = (req as any).user?.id ?? null;
      const actorRole = (req as any).workspaceRole ?? null;
      const actorPlatformRole = (req as any).platformRole ?? null;
      await pool.query(
        `UPDATE support_tickets
            SET status = 'closed',
                closed_at = NOW(),
                closed_by = $1,
                closed_reason = 'Verification denied by management.',
                updated_at = NOW()
          WHERE ticket_number = $2
            AND workspace_id = $3`,
        [actorUserId, refNum, workspaceId]
      );

      // FCRA audit — who denied, when, which requester was notified.
      await logActionAudit({
        actionId: 'employment_verification.deny',
        workspaceId,
        userId: actorUserId,
        userRole: actorRole,
        platformRole: actorPlatformRole,
        entityType: 'employment_verification',
        entityId: refNum,
        success: true,
        message: 'Verification denied; requester notified.',
        changesAfter: {
          refNum,
          ticketId: ticket.id,
          requesterEmail: requesterEmail || null,
          notified: !!requesterEmail,
        },
      });

      log.info(`[EmploymentVerify] ${refNum} denied; requester notified=${!!requesterEmail}`);
      return res.json({
        success: true,
        message: 'Request denied; requester notified.',
        refNum,
      });
    } catch (err: any) {
      log.error(`[EmploymentVerify] deny error: ${err?.message}`);
      await logActionAudit({
        actionId: 'employment_verification.deny',
        workspaceId,
        userId: (req as any).user?.id ?? null,
        entityType: 'employment_verification',
        entityId: refNum,
        success: false,
        errorMessage: err?.message,
      });
      return res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  }
);

// ── Verification revenue/usage stats (owner + support staff) ─────────────────
// GET /api/employment-verify/stats
employmentVerifyRouter.get(
  '/stats',
  requireAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const callerRole = (req as any).workspaceRole || '';
    const callerPlatformRole = (req as any).platformRole || '';
    const isOwner = ['org_owner', 'co_owner'].includes(callerRole);
    const isPlatform = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(callerPlatformRole);
    if (!isOwner && !isPlatform) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'Workspace required' });

    const { rows } = await pool.query(
      `SELECT verification_count_this_month AS "countThisMonth",
              verification_revenue_this_month AS "revenueThisMonth",
              verification_fee_cents AS "feePerVerification",
              verification_enabled AS "enabled"
         FROM workspace_verification_settings
        WHERE workspace_id = $1`,
      [workspaceId],
    );
    res.json(
      rows[0] || {
        countThisMonth: 0,
        revenueThisMonth: 0,
        feePerVerification: 100,
        enabled: true,
      },
    );
  },
);

// ── Configure verification fee (owner only) ──────────────────────────────────
// PATCH /api/employment-verify/settings
employmentVerifyRouter.patch(
  '/settings',
  requireAuth,
  requireOwner,
  async (req: AuthenticatedRequest, res: Response) => {
    const { feeCents, enabled } = (req.body || {}) as { feeCents?: number; enabled?: boolean };

    if (feeCents !== undefined && (feeCents < 50 || feeCents > 500)) {
      return res.status(400).json({ error: 'Fee must be between $0.50 and $5.00' });
    }

    await pool.query(
      `
      INSERT INTO workspace_verification_settings
        (workspace_id, verification_fee_cents, verification_enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (workspace_id) DO UPDATE
        SET verification_fee_cents = COALESCE($2, workspace_verification_settings.verification_fee_cents),
            verification_enabled = COALESCE($3, workspace_verification_settings.verification_enabled),
            updated_at = NOW()
    `,
      [req.workspaceId, feeCents ?? null, enabled ?? null],
    );

    res.json({ success: true });
  },
);
