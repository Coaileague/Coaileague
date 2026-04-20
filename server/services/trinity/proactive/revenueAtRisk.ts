/**
 * Phase 24 — Proactive Monitor 2: REVENUE AT RISK
 * ================================================
 * Daily 7 AM scan per workspace that summarizes revenue threats so the owner
 * gets a single actionable brief instead of having to hunt through dashboards.
 *
 *   - OVERDUE INVOICES: invoices whose due_date is > 30 days past, still not
 *     paid/voided/cancelled. Per-invoice SMS to the owner with dollar amount.
 *   - EXPIRING CONTRACTS: client_contracts with term_end_date in the next 60
 *     days. In-app notification to the account manager (org_manager/manager).
 *   - CHURN RISK: clients whose most recent shift, invoice, or incident is
 *     older than 45 days. In-app flag for manager outreach.
 *   - UNFILLED SHIFTS: shifts with employee_id IS NULL that have existed for
 *     24+ hours. In-app notification to staffing manager.
 *
 * Invocation:
 *   - Cron: daily at 7:00 UTC via `proactiveOrchestrator`.
 *   - Chat/Voice: trinity.run_revenue_scan action.
 *
 * Idempotency:
 *   Per-invoice / per-contract / per-client / per-shift flags are deduped
 *   through audit_logs with action = 'trinity.revenue_at_risk' + entity_id.
 *   Re-running the scan in the same 24-hour window is a no-op.
 */

import { createLogger } from '../../../lib/logger';
import { NotificationDeliveryService } from '../../notificationDeliveryService';
import { sendSMSToEmployee } from '../../smsService';
import { platformEventBus } from '../../platformEventBus';
import { logActionAudit } from '../../ai-brain/actionAuditLogger';

const log = createLogger('revenueAtRisk');

const WORKFLOW_NAME = 'revenue_at_risk';
const OVERDUE_DAYS_MIN = 30;
const CONTRACT_EXPIRY_WINDOW_DAYS = 60;
const CHURN_INACTIVITY_DAYS = 45;
const UNFILLED_SHIFT_MIN_AGE_HOURS = 24;
const DEDUP_WINDOW_HOURS = 20;

export interface RevenueAtRiskResult {
  workspacesScanned: number;
  overdueInvoicesFlagged: number;
  expiringContractsFlagged: number;
  churnClientsFlagged: number;
  unfilledShiftsFlagged: number;
  totalAtRiskDollars: number;
  errors: string[];
}

/** Run across every active workspace. Used by the cron path. */
export async function runRevenueAtRiskSweep(): Promise<RevenueAtRiskResult> {
  const result: RevenueAtRiskResult = {
    workspacesScanned: 0,
    overdueInvoicesFlagged: 0,
    expiringContractsFlagged: 0,
    churnClientsFlagged: 0,
    unfilledShiftsFlagged: 0,
    totalAtRiskDollars: 0,
    errors: [],
  };

  let workspaces: string[];
  try {
    workspaces = await listActiveWorkspaces();
  } catch (err: any) {
    result.errors.push(`workspaces:${err?.message}`);
    return result;
  }

  const { isWorkspaceServiceable } = await import('../../billing/billingConstants');

  for (const workspaceId of workspaces) {
    result.workspacesScanned++;
    try {
      // Phase 26: subscription gate — skip cancelled/suspended workspaces.
      if (!(await isWorkspaceServiceable(workspaceId))) {
        continue;
      }
      const per = await runRevenueAtRiskForWorkspace(workspaceId);
      result.overdueInvoicesFlagged += per.overdueInvoicesFlagged;
      result.expiringContractsFlagged += per.expiringContractsFlagged;
      result.churnClientsFlagged += per.churnClientsFlagged;
      result.unfilledShiftsFlagged += per.unfilledShiftsFlagged;
      result.totalAtRiskDollars += per.totalAtRiskDollars;
    } catch (err: any) {
      result.errors.push(`${workspaceId}:${err?.message}`);
      log.warn(`[revenueAtRisk] workspace ${workspaceId} failed:`, err?.message);
    }
  }

  return result;
}

/** Single-workspace entry point — reusable from the Trinity action handler. */
export async function runRevenueAtRiskForWorkspace(workspaceId: string): Promise<{
  overdueInvoicesFlagged: number;
  expiringContractsFlagged: number;
  churnClientsFlagged: number;
  unfilledShiftsFlagged: number;
  totalAtRiskDollars: number;
}> {
  const tally = {
    overdueInvoicesFlagged: 0,
    expiringContractsFlagged: 0,
    churnClientsFlagged: 0,
    unfilledShiftsFlagged: 0,
    totalAtRiskDollars: 0,
  };

  const [overdue, expiring, churn, unfilled] = await Promise.all([
    findOverdueInvoices(workspaceId),
    findExpiringContracts(workspaceId),
    findChurnRiskClients(workspaceId),
    findUnfilledShifts(workspaceId),
  ]);

  const ownerIds = await fetchOwners(workspaceId);
  const managerIds = await fetchManagers(workspaceId);
  const ownerContacts = await fetchOwnerContacts(workspaceId);

  // Overdue invoices — per-invoice SMS to owner + in-app to managers.
  for (const inv of overdue) {
    if (await alreadyFlagged(workspaceId, `invoice:${inv.id}`)) continue;
    tally.totalAtRiskDollars += inv.balance;
    tally.overdueInvoicesFlagged++;
    const who = inv.clientName || 'a client';
    const summary =
      `Invoice ${inv.invoiceNumber} to ${who} is ${inv.daysOverdue} days overdue. ` +
      `$${inv.balance.toFixed(2)} at risk.`;

    await fanoutInApp([...ownerIds, ...managerIds], workspaceId, {
      code: 'overdue_invoice',
      subject: 'Overdue invoice',
      summary,
      entityType: 'invoice',
      entityId: inv.id,
      severity: inv.daysOverdue > 60 ? 'high' : 'medium',
      details: { invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, balance: inv.balance, daysOverdue: inv.daysOverdue },
    });

    await Promise.allSettled(
      ownerContacts.slice(0, 2).map((c) =>
        sendSMSToEmployee(
          c.employeeId,
          `Trinity: ${summary} Reply if you want me to send a reminder.`,
          'revenue_overdue_invoice',
          workspaceId,
        ),
      ),
    );

    await recordFlag(workspaceId, `invoice:${inv.id}`, 'overdue_invoice', 'invoice', inv.id);
  }

  // Expiring contracts — in-app to managers.
  for (const c of expiring) {
    if (await alreadyFlagged(workspaceId, `contract:${c.id}`)) continue;
    tally.expiringContractsFlagged++;
    const summary =
      `Contract "${c.title}" with ${c.clientName || 'client'} ends in ${c.daysUntilExpiry} days. ` +
      `Renewal action needed.`;
    await fanoutInApp(managerIds, workspaceId, {
      code: 'contract_expiring',
      subject: 'Contract expiring soon',
      summary,
      entityType: 'contract',
      entityId: c.id,
      severity: c.daysUntilExpiry <= 14 ? 'high' : 'medium',
      details: { contractId: c.id, title: c.title, daysUntilExpiry: c.daysUntilExpiry },
    });
    await recordFlag(workspaceId, `contract:${c.id}`, 'contract_expiring', 'contract', c.id);
  }

  // Churn risk — in-app to managers.
  for (const cli of churn) {
    if (await alreadyFlagged(workspaceId, `churn:${cli.id}`)) continue;
    tally.churnClientsFlagged++;
    const summary =
      `${cli.name || 'Client'} has had no activity in ${cli.daysInactive} days. Consider reaching out.`;
    await fanoutInApp(managerIds, workspaceId, {
      code: 'churn_risk',
      subject: 'Churn risk: client inactive',
      summary,
      entityType: 'client',
      entityId: cli.id,
      severity: 'low',
      details: { clientId: cli.id, daysInactive: cli.daysInactive },
    });
    await recordFlag(workspaceId, `churn:${cli.id}`, 'churn_risk', 'client', cli.id);
  }

  // Unfilled shifts — in-app to managers.
  for (const sh of unfilled) {
    if (await alreadyFlagged(workspaceId, `unfilled:${sh.id}`)) continue;
    tally.unfilledShiftsFlagged++;
    const when = sh.startTime.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const summary = `Open shift "${sh.title || 'unassigned'}" on ${when} has been unfilled for ${sh.ageHours}h.`;
    await fanoutInApp(managerIds, workspaceId, {
      code: 'unfilled_shift',
      subject: 'Unfilled shift',
      summary,
      entityType: 'shift',
      entityId: sh.id,
      severity: sh.ageHours > 48 ? 'high' : 'medium',
      details: { shiftId: sh.id, ageHours: sh.ageHours, startTime: sh.startTime.toISOString() },
    });
    await recordFlag(workspaceId, `unfilled:${sh.id}`, 'unfilled_shift', 'shift', sh.id);
  }

  try {
    await platformEventBus.publish({
      type: 'trinity_revenue_at_risk_scan_complete',
      workspaceId,
      title: 'Revenue at risk scan complete',
      description:
        `Overdue ${tally.overdueInvoicesFlagged}, contracts expiring ${tally.expiringContractsFlagged}, ` +
        `churn ${tally.churnClientsFlagged}, unfilled shifts ${tally.unfilledShiftsFlagged}, ` +
        `$${tally.totalAtRiskDollars.toFixed(2)} at risk.`,
      severity: tally.totalAtRiskDollars > 10000 ? 'high' : 'medium',
      metadata: { workflow: WORKFLOW_NAME, ...tally },
    } as any);
  } catch (err: any) {
    log.warn('[revenueAtRisk] event publish failed (non-fatal):', err?.message);
  }

  await logActionAudit({
    actionId: 'trinity.run_revenue_scan',
    workspaceId,
    entityType: 'workspace',
    entityId: workspaceId,
    success: true,
    message: `Revenue at risk scan: $${tally.totalAtRiskDollars.toFixed(2)} across ${tally.overdueInvoicesFlagged} invoices`,
    payload: tally,
  });

  return tally;
}

// ─── DB lookups ───────────────────────────────────────────────────────────────

interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  balance: number;
  daysOverdue: number;
  clientName: string | null;
}

async function findOverdueInvoices(workspaceId: string): Promise<OverdueInvoice[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT i.id,
            i.invoice_number,
            i.total::numeric - COALESCE(i.amount_paid, 0)::numeric AS balance,
            EXTRACT(DAY FROM (NOW() - i.due_date))::int AS days_overdue,
            COALESCE(NULLIF(TRIM(c.company_name), ''),
                     TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS client_name
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id AND c.workspace_id = i.workspace_id
      WHERE i.workspace_id = $1
        AND i.status NOT IN ('paid', 'voided', 'cancelled', 'draft')
        AND i.due_date IS NOT NULL
        AND i.due_date < NOW() - INTERVAL '${OVERDUE_DAYS_MIN} days'
        AND (i.total::numeric - COALESCE(i.amount_paid, 0)::numeric) > 0
      ORDER BY days_overdue DESC
      LIMIT 50`,
    [workspaceId],
  );
  return r.rows.map((row: any) => ({
    id: row.id,
    invoiceNumber: row.invoice_number || row.id.slice(0, 8),
    balance: Number(row.balance || 0),
    daysOverdue: Number(row.days_overdue || 0),
    clientName: row.client_name,
  }));
}

interface ExpiringContract {
  id: string;
  title: string;
  daysUntilExpiry: number;
  clientName: string | null;
}

async function findExpiringContracts(workspaceId: string): Promise<ExpiringContract[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT cc.id,
              COALESCE(cc.title, 'Contract') AS title,
              EXTRACT(DAY FROM (cc.term_end_date::timestamp - NOW()))::int AS days_until_expiry,
              COALESCE(cc.client_name,
                       NULLIF(TRIM(c.company_name), ''),
                       TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS client_name
         FROM client_contracts cc
         LEFT JOIN clients c ON c.id = cc.client_id AND c.workspace_id = cc.workspace_id
        WHERE cc.workspace_id = $1
          AND cc.status IN ('executed', 'active', 'accepted')
          AND cc.term_end_date IS NOT NULL
          AND cc.term_end_date::timestamp <= NOW() + INTERVAL '${CONTRACT_EXPIRY_WINDOW_DAYS} days'
          AND cc.term_end_date::timestamp >= NOW()
        ORDER BY cc.term_end_date ASC
        LIMIT 30`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      daysUntilExpiry: Number(row.days_until_expiry || 0),
      clientName: row.client_name,
    }));
  } catch (err: any) {
    log.warn('[revenueAtRisk] contract lookup failed:', err?.message);
    return [];
  }
}

interface ChurnClient {
  id: string;
  name: string | null;
  daysInactive: number;
}

async function findChurnRiskClients(workspaceId: string): Promise<ChurnClient[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `WITH last_activity AS (
         SELECT c.id,
                GREATEST(
                  COALESCE((SELECT MAX(start_time) FROM shifts WHERE client_id = c.id AND workspace_id = c.workspace_id), TIMESTAMP 'epoch'),
                  COALESCE((SELECT MAX(issue_date) FROM invoices WHERE client_id = c.id AND workspace_id = c.workspace_id), TIMESTAMP 'epoch'),
                  COALESCE((SELECT MAX(reported_at) FROM security_incidents WHERE client_id = c.id AND workspace_id = c.workspace_id), TIMESTAMP 'epoch')
                ) AS most_recent
           FROM clients c
          WHERE c.workspace_id = $1
       )
       SELECT c.id,
              COALESCE(NULLIF(TRIM(c.company_name), ''),
                       TRIM(CONCAT(c.first_name, ' ', c.last_name))) AS name,
              EXTRACT(DAY FROM (NOW() - la.most_recent))::int AS days_inactive
         FROM last_activity la
         JOIN clients c ON c.id = la.id
        WHERE la.most_recent > TIMESTAMP 'epoch'
          AND la.most_recent < NOW() - INTERVAL '${CHURN_INACTIVITY_DAYS} days'
        ORDER BY la.most_recent ASC
        LIMIT 30`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      daysInactive: Number(row.days_inactive || 0),
    }));
  } catch (err: any) {
    log.warn('[revenueAtRisk] churn lookup failed:', err?.message);
    return [];
  }
}

interface UnfilledShift {
  id: string;
  title: string | null;
  startTime: Date;
  ageHours: number;
}

async function findUnfilledShifts(workspaceId: string): Promise<UnfilledShift[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT id, title, start_time,
              EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 AS age_hours
         FROM shifts
        WHERE workspace_id = $1
          AND deleted_at IS NULL
          AND employee_id IS NULL
          AND status NOT IN ('cancelled', 'denied')
          AND start_time >= NOW()
          AND created_at <= NOW() - INTERVAL '${UNFILLED_SHIFT_MIN_AGE_HOURS} hours'
        ORDER BY start_time ASC
        LIMIT 30`,
      [workspaceId],
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      startTime: new Date(row.start_time),
      ageHours: Math.floor(Number(row.age_hours || 0)),
    }));
  } catch (err: any) {
    log.warn('[revenueAtRisk] unfilled shift lookup failed:', err?.message);
    return [];
  }
}

async function listActiveWorkspaces(): Promise<string[]> {
  const { pool } = await import('../../../db');
  const r = await pool.query(
    `SELECT id FROM workspaces WHERE COALESCE(is_active, true) = true LIMIT 5000`,
  );
  return r.rows.map((row: any) => row.id);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function fetchOwners(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin')
        LIMIT 10`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchManagers(workspaceId: string): Promise<string[]> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT DISTINCT user_id
         FROM workspace_memberships
        WHERE workspace_id = $1
          AND role IN ('org_owner','co_owner','org_admin','org_manager','manager',
                       'department_manager','supervisor')
        LIMIT 20`,
      [workspaceId],
    );
    return r.rows.map((row: any) => row.user_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchOwnerContacts(workspaceId: string): Promise<Array<{ employeeId: string; phone: string }>> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT e.id, e.phone
         FROM workspace_memberships wm
         JOIN employees e ON e.user_id = wm.user_id AND e.workspace_id = wm.workspace_id
        WHERE wm.workspace_id = $1
          AND wm.role IN ('org_owner','co_owner','org_admin')
          AND e.phone IS NOT NULL
        LIMIT 3`,
      [workspaceId],
    );
    return r.rows
      .map((row: any) => ({ employeeId: row.id as string, phone: row.phone as string }))
      .filter((row: any) => row.employeeId && row.phone);
  } catch {
    return [];
  }
}

interface FanoutPayload {
  code: string;
  subject: string;
  summary: string;
  entityType: string;
  entityId: string;
  severity: 'low' | 'medium' | 'high';
  details: Record<string, any>;
}

async function fanoutInApp(
  recipients: string[],
  workspaceId: string,
  payload: FanoutPayload,
): Promise<void> {
  await Promise.allSettled(
    recipients.map((recipientUserId) =>
      NotificationDeliveryService.send({
        type: 'trinity_alert',
        workspaceId,
        recipientUserId,
        channel: 'in_app',
        subject: payload.subject,
        body: {
          summary: payload.summary,
          code: payload.code,
          severity: payload.severity,
          entityType: payload.entityType,
          entityId: payload.entityId,
          details: payload.details,
        },
        idempotencyKey: `revrisk-${payload.entityType}-${payload.entityId}-${payload.code}-${recipientUserId}`,
      }),
    ),
  );
}

async function alreadyFlagged(workspaceId: string, dedupKey: string): Promise<boolean> {
  try {
    const { pool } = await import('../../../db');
    const r = await pool.query(
      `SELECT 1 FROM audit_logs
        WHERE workspace_id = $1
          AND action = $2
          AND metadata->>'dedup_key' = $3
          AND created_at > NOW() - INTERVAL '${DEDUP_WINDOW_HOURS} hours'
        LIMIT 1`,
      [workspaceId, `trinity.${WORKFLOW_NAME}`, dedupKey],
    );
    return r.rows.length > 0;
  } catch {
    return false;
  }
}

async function recordFlag(
  workspaceId: string,
  dedupKey: string,
  code: string,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    const { pool } = await import('../../../db');
    await pool.query(
      `INSERT INTO audit_logs (workspace_id, action, raw_action, entity_type, entity_id,
                               success, source, actor_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, true, 'system', 'trinity',
               jsonb_build_object('code', $6::text, 'dedup_key', $7::text, 'phase', '24'),
               NOW())`,
      [
        workspaceId,
        `trinity.${WORKFLOW_NAME}`,
        WORKFLOW_NAME,
        entityType,
        entityId,
        code,
        dedupKey,
      ],
    );
  } catch (err: any) {
    log.warn('[revenueAtRisk] audit write failed (non-fatal):', err?.message);
  }
}
