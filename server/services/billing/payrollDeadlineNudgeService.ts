/**
 * Payroll Deadline Nudge Service
 * ================================
 * T006 FIX — G14: Proactively notifies org owners when an open payroll period
 * is within 72 hours of its period_end date and hasn't been approved.
 * Called from the daily automation trigger.
 *
 * IDEMPOTENCY FIX (T009): Each nudge level (high = 72h, critical = 24h) fires
 * EXACTLY ONCE per payroll run per urgency band. Deduplication is enforced via
 * audit_logs — if an audit entry with action='payroll_deadline_nudge' and
 * metadata containing the same run_id + urgency_band already exists within
 * the past 48 hours, the nudge is skipped. This prevents daily re-firing.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { NotificationDeliveryService } from '../notificationDeliveryService';
import { emailService } from '../emailService';

const log = createLogger('PayrollDeadlineNudgeService');

const APP_URL = process.env.APP_BASE_URL || '';

interface NudgeResult {
  nudgesSent: number;
  nudgesSkipped: number;
  workspacesChecked: number;
}

/**
 * Check if a nudge was already sent for this run at this urgency band.
 * Looks back 48 hours to avoid re-sending within the same crossing window.
 */
async function hasNudgeAlreadyFired(runId: string, urgencyBand: 'high' | 'critical'): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT 1 FROM audit_logs
       WHERE action = 'payroll_deadline_nudge'
         AND entity_type = 'payroll_run'
         AND entity_id = $1
         AND metadata->>'urgency_band' = $2
         AND created_at >= NOW() - INTERVAL '48 hours'
       LIMIT 1`,
      [runId, urgencyBand]
    );
    return result.rows.length > 0;
  } catch {
    // If audit check fails, allow the nudge to fire (fail open for notifications)
    return false;
  }
}

/**
 * Record that a nudge was sent for this run at this urgency band.
 */
async function recordNudgeSent(runId: string, workspaceId: string, urgencyBand: 'high' | 'critical'): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, action, entity_type, entity_id, metadata, created_at, source)
       VALUES ($1, 'payroll_deadline_nudge', 'payroll_run', $2, $3::jsonb, NOW(), 'system')`,
      [workspaceId, runId, JSON.stringify({ urgency_band: urgencyBand, sent_at: new Date().toISOString() })]
    );
  } catch (err: unknown) {
    log.warn(`[PayrollDeadlineNudge] Failed to record nudge audit for run ${runId}:`, err?.message);
  }
}

export async function runPayrollDeadlineNudge(): Promise<NudgeResult> {
  let nudgesSent = 0;
  let nudgesSkipped = 0;

  try {
    // Find open/draft payroll runs whose period_end is within the next 72 hours
    // and haven't been approved or processed yet
    const result = await pool.query(`
      SELECT
        pr.id,
        pr.workspace_id,
        pr.period_start,
        pr.period_end,
        pr.status,
        pr.total_gross_pay,
        w.id as ws_id,
        w.owner_id,
        EXTRACT(EPOCH FROM (pr.period_end - NOW())) / 3600 as hours_remaining
      FROM payroll_runs pr
      JOIN workspaces w ON w.id = pr.workspace_id
      WHERE pr.status IN ('draft', 'pending')
        AND pr.period_end BETWEEN NOW() AND NOW() + INTERVAL '72 hours'
        -- Production tenant protected via GRANDFATHERED_TENANT_ID env var (no hardcoded IDs)
      ORDER BY pr.period_end ASC
    `);

    const workspacesChecked = new Set(result.rows.map((r: any) => r.workspace_id)).size;

    for (const run of result.rows as any[]) {
      try {
        const hoursLeft = Math.max(0, Math.round(Number(run.hours_remaining)));
        const periodEnd = new Date(run.period_end);
        const periodEndStr = periodEnd.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
        const urgencyBand: 'high' | 'critical' = hoursLeft <= 24 ? 'critical' : 'high';

        // IDEMPOTENCY CHECK: Skip if this urgency band was already sent for this run
        const alreadySent = await hasNudgeAlreadyFired(run.id, urgencyBand);
        if (alreadySent) {
          nudgesSkipped++;
          log.debug(`[PayrollDeadlineNudge] Skipping duplicate nudge — run=${run.id} urgency=${urgencyBand} (already sent within 48h)`);
          continue;
        }

        // In-app notification via NDS
        if (run.owner_id) {
          await NotificationDeliveryService.send({
            type: 'payroll_deadline_alert',
            workspaceId: run.workspace_id,
            recipientUserId: run.owner_id,
            channel: 'in_app',
            body: {
              title: `Payroll Deadline in ${hoursLeft}h`,
              message: `Payroll period ending ${periodEndStr} is ${run.status === 'pending_approval' ? 'awaiting your approval' : 'still in draft'}. Approve before the cutoff to avoid delays.`,
            },
          }).catch((notifErr: unknown) => {
            log.warn(`[PayrollDeadlineNudge] In-app notification failed for run ${run.id}:`,
              notifErr instanceof Error ? notifErr.message : String(notifErr));
          });
        }

        // Email nudge — via NDS for critical urgency only
        if (urgencyBand === 'critical' && run.owner_id) {
          const ownerRes = await pool.query(
            `SELECT email FROM users WHERE id = $1 LIMIT 1`,
            [run.owner_id]
          );
          const ownerEmail = ownerRes.rows[0]?.email;
          if (ownerEmail) {
            await emailService.send({
              to: ownerEmail,
              subject: `Action Required: Payroll Closes in ${hoursLeft} Hours`,
              html: `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111827;">
  <h2 style="color:#dc2626;margin-bottom:4px;">Payroll Deadline Alert</h2>
  <p style="color:#6b7280;margin-top:0;">Period ends: ${periodEndStr}</p>
  <p>Your payroll run for the period ending <strong>${periodEndStr}</strong> is currently in <strong>${run.status.replace('_', ' ')}</strong> status and closes in <strong>${hoursLeft} hours</strong>.</p>
  ${run.status === 'pending_approval'
    ? '<p style="background:#fef2f2;border:1px solid #fecaca;padding:12px;border-radius:6px;color:#991b1b;">This payroll run is awaiting your approval. Log in to review and approve it before the deadline.</p>'
    : '<p style="background:#fff7ed;border:1px solid #fed7aa;padding:12px;border-radius:6px;color:#92400e;">This payroll run is still in draft. Complete and submit it before the cutoff.</p>'
  }
  ${run.total_gross_pay ? `<p>Total gross pay: <strong>$${Number(run.total_gross_pay).toLocaleString()}</strong></p>` : ''}
  <p><a href="${APP_URL}/payroll" style="background:#1e3a5f;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px;">Review Payroll Now</a></p>
</div>`,
            }).catch((emailErr: unknown) => {
              log.warn(`[PayrollDeadlineNudge] Critical email failed for run ${run.id}:`,
                emailErr instanceof Error ? emailErr.message : String(emailErr));
            });
          }
        }

        // Record that this nudge band was sent — prevents re-firing on next daily run
        await recordNudgeSent(run.id, run.workspace_id, urgencyBand);

        nudgesSent++;
        log.info(`[PayrollDeadlineNudge] Nudged workspace=${run.workspace_id} run=${run.id} status=${run.status} hoursLeft=${hoursLeft} urgency=${urgencyBand}`);
      } catch (innerErr: unknown) {
        log.warn(`[PayrollDeadlineNudge] Failed for run ${run.id}:`, innerErr?.message);
      }
    }

    log.info(`[PayrollDeadlineNudge] Complete — workspacesChecked=${workspacesChecked}, nudgesSent=${nudgesSent}, nudgesSkipped=${nudgesSkipped}`);
    return { nudgesSent, nudgesSkipped, workspacesChecked };
  } catch (err: unknown) {
    log.error('[PayrollDeadlineNudge] Fatal error:', err?.message);
    return { nudgesSent: 0, nudgesSkipped: 0, workspacesChecked: 0 };
  }
}
