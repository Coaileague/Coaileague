/**
 * Phase 24 — Proactive Monitor 5: RELATIONSHIP INTELLIGENCE (Weekly Brief)
 * =======================================================================
 * Every Monday at 8 AM UTC, Trinity generates a single concise digest for
 * each workspace owner:
 *
 *   - Uncovered shifts in the coming week (employee_id IS NULL)
 *   - Contracts expiring within the next 60 days
 *   - Officer certifications / licenses expiring within 30 days
 *   - Last week's on-time clock-in rate (trend vs. prior week)
 *   - Outstanding invoice $ (unpaid, past issue)
 *
 * Delivered via:
 *   - in-app notification (channel: 'in_app')
 *   - best-effort email digest (channel: 'email') — skipped silently if the
 *     owner has no email on file.
 *
 * Deduplication: one brief per (workspaceId, ISO week). A manual trigger
 * through `trinity.send_weekly_brief` will post a new brief tagged with
 * "manual" in the audit metadata.
 */

import { createLogger } from '../../../lib/logger';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { platformEventBus } from '../../platformEventBus';
import { logActionAudit } from '../../ai-brain/actionAuditLogger';

const log = createLogger('weeklyBrief');

const WORKFLOW_NAME = 'weekly_brief';
const UNCOVERED_WINDOW_DAYS = 7;
const CONTRACT_EXPIRY_WINDOW_DAYS = 60;
const CERT_EXPIRY_WINDOW_DAYS = 30;
const ON_TIME_LATE_MINUTES = 10;

export interface WeeklyBriefSnapshot {
  uncoveredShifts: number;
  expiringContracts: number;
  expiringCertifications: number;
  onTimeRateCurrentPct: number;
  onTimeRatePriorPct: number;
  onTimeRateDeltaPct: number;
  outstandingInvoiceDollars: number;
  outstandingInvoiceCount: number;
  topUncoveredShiftDays: string[];
  topExpiringContractName: string | null;
  firstUncoveredDate: Date | null;
}

export interface WeeklyBriefResult {
  workspacesBriefed: number;
  deliveries: number;
  errors: string[];
}

/** Run across every active workspace. Called weekly. */
export async function runWeeklyBriefSweep(): Promise<WeeklyBriefResult> {
  const result: WeeklyBriefResult = {
    workspacesBriefed: 0,
    deliveries: 0,
    errors: [],
  };

  let workspaces: string[];
  try {
    workspaces = await listActiveWorkspaces();
  } catch (err: unknown) {
    result.errors.push(`workspaces:${err?.message}`);
    return result;
  }

  const weekKey = isoWeekKey(new Date());

  for (const workspaceId of workspaces) {
    try {
      if (await alreadyBriefed(workspaceId, weekKey)) continue;
      const sent = await sendWeeklyBriefForWorkspace(workspaceId, 'cron');
      result.workspacesBriefed++;
      result.deliveries += sent;
    } catch (err: unknown) {
      result.errors.push(`${workspaceId}:${err?.message}`);
      log.warn(`[weeklyBrief] workspace ${workspaceId} failed:`, err?.message);
    }
  }

  return result;
}

/**
 * Build + deliver the brief for a single workspace. Exposed so the Trinity
 * chat action handler can trigger ad-hoc briefs.
 */
export async function sendWeeklyBriefForWorkspace(
  workspaceId: string,
  triggerSource: 'cron' | 'manual' = 'cron',
): Promise<number> {
  const snap = await buildSnapshot(workspaceId);
  const body = formatBriefText(snap);

  const owners = await fetchOwnerRecipients(workspaceId);
  let delivered = 0;

  for (const o of owners) {
    const weekKey = isoWeekKey(new Date());
    try {
      await NotificationDeliveryService.send({
        type: 'trinity_alert',
        workspaceId,
        recipientUserId: o.userId,
        channel: 'in_app',
        subject: "Trinity weekly brief",
        body: { summary: body, snapshot: snap, triggerSource },
        idempotencyKey: `weeklybrief-${workspaceId}-${o.userId}-${weekKey}`,
      });
      delivered++;
    } catch (err: unknown) {
      log.warn(`[weeklyBrief] in-app send failed for ${o.userId}:`, err?.message);
    }

    if (o.email) {
      try {
        await NotificationDeliveryService.send({
          type: 'trinity_alert',
          workspaceId,
          recipientUserId: o.userId,
          channel: 'email',
          subject: "Your Co-League weekly brief",
          body: {
            to: o.email,
            subject: "Your Co-League weekly brief",
            text: body,
            html: briefToHtml(body),
          },
          idempotencyKey: `weeklybrief-email-${workspaceId}-${o.userId}-${weekKey}`,
        });
      } catch (err: unknown) {
        log.warn(`[weeklyBrief] email send failed for ${o.userId}:`, err?.message);
      }
    }
  }

  try {
    await platformEventBus.publish({
      type: 'trinity_weekly_brief_sent',
      workspaceId,
      title: 'Trinity weekly brief sent',
      description: body.split('\n')[0],
      severity: 'low',
      metadata: { workflow: WORKFLOW_NAME, snapshot: snap, triggerSource },
    } as any);
  } catch (err: unknown) {
    log.warn('[weeklyBrief] event publish failed (non-fatal):', err?.message);
  }

  await recordBriefed(workspaceId, isoWeekKey(new Date()), triggerSource, snap);

  await logActionAudit({
    actionId: 'trinity.send_weekly_brief',
    workspaceId,
    entityType: 'workspace',
    entityId: workspaceId,
    success: true,
    message: `Weekly brief delivered to ${delivered} owner recipient(s).`,
    payload: { snapshot: snap, triggerSource, delivered },
  });

  return delivered;
}

// ─── Snapshot build ───────────────────────────────────────────────────────────

async function buildSnapshot(workspaceId: string): Promise<WeeklyBriefSnapshot> {
  const { pool } = await import('../../../db');

  const [uncoveredRows, contractRow, certRow, onTimeRow, outstandingRow] = await Promise.all([
    pool.query(
      `SELECT id, start_time, title
         FROM shifts
        WHERE workspace_id = $1
          AND deleted_at IS NULL
          AND employee_id IS NULL
          AND status NOT IN ('cancelled','denied','completed')
          AND start_time >= NOW()
          AND start_time <= NOW() + INTERVAL '${UNCOVERED_WINDOW_DAYS} days'
        ORDER BY start_time ASC
        LIMIT 50`,
      [workspaceId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n,
              MIN(title) AS top_title
         FROM client_contracts
        WHERE workspace_id = $1
          AND status IN ('executed','active','accepted')
          AND term_end_date IS NOT NULL
          AND term_end_date::timestamp <= NOW() + INTERVAL '${CONTRACT_EXPIRY_WINDOW_DAYS} days'
          AND term_end_date::timestamp >= NOW()`,
      [workspaceId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n
         FROM training_certifications
        WHERE workspace_id = $1
          AND expiry_date IS NOT NULL
          AND expiry_date <= NOW() + INTERVAL '${CERT_EXPIRY_WINDOW_DAYS} days'
          AND expiry_date >= NOW() - INTERVAL '7 days'`,
      [workspaceId],
    ),
    pool.query(
      `WITH windowed AS (
         SELECT te.clock_in, s.start_time,
                CASE WHEN te.clock_in >= NOW() - INTERVAL '7 days' THEN 'current' ELSE 'prior' END AS bucket
           FROM time_entries te
           JOIN shifts s ON s.id = te.shift_id AND s.workspace_id = te.workspace_id
          WHERE te.workspace_id = $1
            AND te.clock_in IS NOT NULL
            AND te.clock_in >= NOW() - INTERVAL '14 days'
            AND s.start_time IS NOT NULL
       )
       SELECT bucket,
              COUNT(*)::int AS total,
              SUM(CASE WHEN clock_in <= start_time + INTERVAL '${ON_TIME_LATE_MINUTES} minutes' THEN 1 ELSE 0 END)::int AS on_time
         FROM windowed
        GROUP BY bucket`,
      [workspaceId],
    ),
    pool.query(
      `SELECT COUNT(*)::int AS n,
              COALESCE(SUM(total::numeric - COALESCE(amount_paid,0)::numeric), 0) AS outstanding
         FROM invoices
        WHERE workspace_id = $1
          AND status NOT IN ('paid','voided','cancelled','draft')
          AND (total::numeric - COALESCE(amount_paid,0)::numeric) > 0`,
      [workspaceId],
    ),
  ]);

  const uncoveredCount = uncoveredRows.rows.length;
  const firstUncovered = uncoveredRows.rows[0] ? new Date(uncoveredRows.rows[0].start_time) : null;
  const topDays = uncoveredRows.rows
    .slice(0, 3)
    .map((r: any) =>
      new Date(r.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    );

  const expiringContracts = Number(contractRow.rows[0]?.n || 0);
  const topContract = contractRow.rows[0]?.top_title || null;
  const expiringCertifications = Number(certRow.rows[0]?.n || 0);

  const buckets: Record<string, { total: number; onTime: number }> = {};
  for (const row of onTimeRow.rows) {
    buckets[row.bucket] = { total: Number(row.total || 0), onTime: Number(row.on_time || 0) };
  }
  const pct = (b: { total: number; onTime: number } | undefined): number => {
    if (!b || b.total === 0) return 0;
    return Math.round((b.onTime / b.total) * 1000) / 10;
  };
  const onTimeCurrent = pct(buckets.current);
  const onTimePrior = pct(buckets.prior);

  const outstanding = Number(outstandingRow.rows[0]?.outstanding || 0);
  const outstandingCount = Number(outstandingRow.rows[0]?.n || 0);

  return {
    uncoveredShifts: uncoveredCount,
    expiringContracts,
    expiringCertifications,
    onTimeRateCurrentPct: onTimeCurrent,
    onTimeRatePriorPct: onTimePrior,
    onTimeRateDeltaPct: Math.round((onTimeCurrent - onTimePrior) * 10) / 10,
    outstandingInvoiceDollars: outstanding,
    outstandingInvoiceCount: outstandingCount,
    topUncoveredShiftDays: topDays,
    topExpiringContractName: topContract,
    firstUncoveredDate: firstUncovered,
  };
}

function formatBriefText(snap: WeeklyBriefSnapshot): string {
  const lines: string[] = [];
  lines.push('Good morning! Here is your Co-League weekly brief:');

  if (snap.uncoveredShifts > 0) {
    const daysLine = snap.topUncoveredShiftDays.length
      ? ` (${snap.topUncoveredShiftDays.join(', ')})`
      : '';
    lines.push(`- ${snap.uncoveredShifts} shift(s) this week need coverage${daysLine}.`);
  } else {
    lines.push('- All shifts this week are covered.');
  }

  if (snap.expiringContracts > 0) {
    const name = snap.topExpiringContractName ? ` — ${snap.topExpiringContractName}` : '';
    lines.push(`- ${snap.expiringContracts} contract(s) expire within 60 days${name} — action needed.`);
  }

  if (snap.expiringCertifications > 0) {
    lines.push(`- ${snap.expiringCertifications} officer certification(s) expire within 30 days.`);
  }

  if (snap.onTimeRateCurrentPct > 0) {
    const arrow =
      snap.onTimeRateDeltaPct > 0.1 ? '↑' : snap.onTimeRateDeltaPct < -0.1 ? '↓' : '·';
    const delta = `${arrow} from ${snap.onTimeRatePriorPct.toFixed(0)}%`;
    lines.push(`- Last week: ${snap.onTimeRateCurrentPct.toFixed(0)}% on-time clock-in rate (${delta}).`);
  }

  if (snap.outstandingInvoiceCount > 0) {
    lines.push(
      `- Outstanding: $${snap.outstandingInvoiceDollars.toFixed(2)} across ` +
        `${snap.outstandingInvoiceCount} unpaid invoice(s).`,
    );
  }

  return lines.join('\n');
}

function briefToHtml(text: string): string {
  return `<div style="font-family: -apple-system, system-ui, sans-serif; max-width: 520px;">${
    text
      .split('\n')
      .map((line, i) =>
        i === 0
          ? `<p style="font-weight:600;margin:0 0 12px;">${escapeHtml(line)}</p>`
          : `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`,
      )
      .join('')
  }<p style="margin-top:16px;color:#666;">— Trinity</p></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoWeekKey(d: Date): string {
  // YYYY-Www — simple ISO week identifier for idempotency keys.
  const date = new Date(d.getTime());
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function listActiveWorkspaces(): Promise<string[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT id FROM workspaces WHERE COALESCE(is_active, true) = true LIMIT 5000`,
  );
  return r.rows.map((row: any) => row.id);
}

interface OwnerRecipient {
  userId: string;
  email: string | null;
}

async function fetchOwnerRecipients(workspaceId: string): Promise<OwnerRecipient[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT u.id AS user_id, u.email
         FROM workspace_memberships wm
         JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1
          AND wm.role IN ('org_owner','co_owner','org_admin')
        LIMIT 5`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({ userId: row.user_id, email: row.email || null }));
  } catch (err: unknown) {
    log.warn('[weeklyBrief] owner lookup failed:', err?.message);
    return [];
  }
}

async function alreadyBriefed(workspaceId: string, weekKey: string): Promise<boolean> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1 FROM audit_logs
        WHERE workspace_id = $1
          AND action = $2
          AND metadata->>'week_key' = $3
        LIMIT 1`,
      [workspaceId, `trinity.${WORKFLOW_NAME}`, weekKey],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function recordBriefed(
  workspaceId: string,
  weekKey: string,
  triggerSource: string,
  snapshot: WeeklyBriefSnapshot,
): Promise<void> {
  try {
    const { pool } = await import('../../../db');
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, action, raw_action, entity_type, entity_id,
                               success, source, actor_type, metadata, created_at)
       VALUES ($1, $2, $3, 'workspace', $4, true, 'system', 'trinity',
               jsonb_build_object('week_key', $5::text, 'trigger_source', $6::text,
                                  'snapshot', $7::jsonb, 'phase', '24'),
               NOW())`,
      [
        workspaceId,
        `trinity.${WORKFLOW_NAME}`,
        WORKFLOW_NAME,
        workspaceId,
        weekKey,
        triggerSource,
        JSON.stringify(snapshot),
      ],
    );
  } catch (err: unknown) {
    log.warn('[weeklyBrief] audit write failed (non-fatal):', err?.message);
  }
}
