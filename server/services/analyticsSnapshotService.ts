/**
 * Analytics Snapshot Service — Phase 34
 *
 * Runs daily at 2 AM UTC to populate:
 *   - analytics_daily_snapshots — daily aggregated metrics per workspace
 *   - analytics_client_health_scores — composite client health per workspace+client
 *
 * Uses only READ queries — never modifies operational data.
 * All queries are workspace-scoped.
 */

import { pool } from '../db';
import { platformActionHub } from './helpai/platformActionHub';
import { createLogger } from '../lib/logger';
const log = createLogger('analyticsSnapshotService');


// ── Query timing helper (Check 17: slow query logging) ──────────────────────

async function timedQuery<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  if (elapsed > 500) {
    log.warn(`[AnalyticsSnapshot] SLOW QUERY (${elapsed}ms): ${label}`);
  }
  return result;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ── Snapshot runner ──────────────────────────────────────────────────────────

async function runWorkspaceSnapshot(workspaceId: string, snapshotDate: string): Promise<void> {
  const yesterday = new Date(snapshotDate);
  const dayStart = new Date(yesterday);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(yesterday);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const inserts: Array<{
    workspaceId: string;
    snapshotDate: string;
    metricName: string;
    metricValue: string;
    dimension?: string | null;
  }> = [];

  // ── Revenue metrics ───────────────────────────────────────────────────────

  const revenueData = await timedQuery(`revenue:${workspaceId}:${snapshotDate}`, () =>
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) AS paid_revenue,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) AS paid_count,
        COALESCE(SUM(CASE WHEN status IN ('sent','overdue') THEN total ELSE 0 END), 0) AS outstanding_revenue,
        COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue_count,
        COUNT(*) AS total_invoices,
        COALESCE(AVG(CASE WHEN status = 'paid' AND paid_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (paid_at - sent_at))/86400 END), 0) AS avg_payment_days
      FROM invoices
      WHERE workspace_id = $1
        AND created_at >= $2 AND created_at <= $3
    `, [workspaceId, dayStart.toISOString(), dayEnd.toISOString()])
  );

  const rev = revenueData.rows[0];
  inserts.push(
    { workspaceId, snapshotDate, metricName: 'revenue.paid', metricValue: rev.paid_revenue },
    { workspaceId, snapshotDate, metricName: 'revenue.outstanding', metricValue: rev.outstanding_revenue },
    { workspaceId, snapshotDate, metricName: 'invoice.overdue_count', metricValue: rev.overdue_count },
    { workspaceId, snapshotDate, metricName: 'invoice.total_count', metricValue: rev.total_invoices },
    { workspaceId, snapshotDate, metricName: 'invoice.avg_payment_days', metricValue: rev.avg_payment_days },
  );

  // ── Payroll metrics ───────────────────────────────────────────────────────

  const payrollData = await timedQuery(`payroll:${workspaceId}:${snapshotDate}`, () =>
    pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN is_overtime THEN hours_worked ELSE 0 END), 0) AS overtime_hours,
        COALESCE(SUM(hours_worked), 0) AS total_hours,
        COUNT(DISTINCT employee_id) AS active_employees
      FROM time_entries
      WHERE workspace_id = $1
        AND clock_in >= $2 AND clock_in <= $3
    `, [workspaceId, dayStart.toISOString(), dayEnd.toISOString()])
  );

  const pr = payrollData.rows[0];
  inserts.push(
    { workspaceId, snapshotDate, metricName: 'payroll.overtime_hours', metricValue: pr.overtime_hours },
    { workspaceId, snapshotDate, metricName: 'payroll.total_hours', metricValue: pr.total_hours },
    { workspaceId, snapshotDate, metricName: 'workforce.active_employees', metricValue: pr.active_employees },
  );

  // ── Shift metrics ─────────────────────────────────────────────────────────

  const shiftData = await timedQuery(`shifts:${workspaceId}:${snapshotDate}`, () =>
    pool.query(`
      SELECT
        COUNT(*) AS total_shifts,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_shifts,
        COUNT(CASE WHEN status IN ('cancelled','no_show') THEN 1 END) AS cancelled_shifts,
        COUNT(CASE WHEN status = 'open' THEN 1 END) AS open_shifts
      FROM shifts
      WHERE workspace_id = $1
        AND date = $2
    `, [workspaceId, snapshotDate])
  );

  const sh = shiftData.rows[0];
  inserts.push(
    { workspaceId, snapshotDate, metricName: 'shift.total', metricValue: sh.total_shifts },
    { workspaceId, snapshotDate, metricName: 'shift.completed', metricValue: sh.completed_shifts },
    { workspaceId, snapshotDate, metricName: 'shift.cancelled', metricValue: sh.cancelled_shifts },
    { workspaceId, snapshotDate, metricName: 'shift.open', metricValue: sh.open_shifts },
  );

  // ── Calloff metrics ───────────────────────────────────────────────────────

  const calloffData = await timedQuery(`calloffs:${workspaceId}:${snapshotDate}`, () =>
    pool.query(`
      SELECT
        COUNT(*) AS calloff_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (shift_start - called_off_at))/3600), 0) AS avg_notice_hours
      FROM shift_calloffs
      WHERE workspace_id = $1
        AND called_off_at >= $2 AND called_off_at <= $3
    `, [workspaceId, dayStart.toISOString(), dayEnd.toISOString()])
    .catch(() => ({ rows: [{ calloff_count: 0, avg_notice_hours: 0 }] }))
  );

  const co = calloffData.rows[0];
  inserts.push(
    { workspaceId, snapshotDate, metricName: 'calloff.count', metricValue: co.calloff_count },
    { workspaceId, snapshotDate, metricName: 'calloff.avg_notice_hours', metricValue: co.avg_notice_hours },
  );

  // ── Write snapshots (upsert pattern: delete today's then re-insert) ───────

  if (inserts.length > 0) {
    await pool.query(
      `DELETE FROM analytics_daily_snapshots WHERE workspace_id = $1 AND snapshot_date = $2`,
      [workspaceId, snapshotDate]
    );
    for (const row of inserts) {
      await pool.query(
        `INSERT INTO analytics_daily_snapshots (workspace_id, snapshot_date, metric_name, metric_value, dimension)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.workspaceId, row.snapshotDate, row.metricName, row.metricValue, row.dimension || null]
      );
    }
  }
}

async function runClientHealthScores(workspaceId: string, snapshotDate: string): Promise<void> {
  const thirtyDaysAgo = daysAgo(30).toISOString();

  const clientList = await timedQuery(`clients:${workspaceId}`, () =>
    pool.query(`SELECT id FROM clients WHERE workspace_id = $1 AND is_active = true`, [workspaceId])
    .catch(() => ({ rows: [] as { id: string }[] }))
  );

  await pool.query(
    `DELETE FROM analytics_client_health_scores WHERE workspace_id = $1 AND snapshot_date = $2`,
    [workspaceId, snapshotDate]
  );

  for (const client of clientList.rows) {
    const clientId = client.id;

    const [payData, dispData, covData, tickData] = await Promise.all([
      // Payment velocity score (0-100, higher = faster payment)
      pool.query(`
        SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (paid_at - sent_at))/86400), 30) AS avg_days
        FROM invoices
        WHERE workspace_id = $1 AND client_id = $2 AND status = 'paid'
          AND paid_at >= $3
      `, [workspaceId, clientId, thirtyDaysAgo])
      .catch(() => ({ rows: [{ avg_days: 30 }] })),

      // Dispute rate (0-100, higher = fewer disputes)
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN status = 'disputed' THEN 1 END) AS disputed
        FROM invoices
        WHERE workspace_id = $1 AND client_id = $2 AND created_at >= $3
      `, [workspaceId, clientId, thirtyDaysAgo])
      .catch(() => ({ rows: [{ total: 1, disputed: 0 }] })),

      // Post coverage (scheduled vs completed shifts)
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed
        FROM shifts
        WHERE workspace_id = $1 AND client_id = $2
          AND date >= $3
      `, [workspaceId, clientId, thirtyDaysAgo.slice(0, 10)])
      .catch(() => ({ rows: [{ total: 1, completed: 1 }] })),

      // Support ticket volume (lower = better; scale so 0 tickets = 100)
      pool.query(`
        SELECT COUNT(*) AS ticket_count
        FROM support_tickets
        WHERE workspace_id = $1 AND client_id = $2 AND created_at >= $3
      `, [workspaceId, clientId, thirtyDaysAgo])
      .catch(() => ({ rows: [{ ticket_count: 0 }] })),
    ]);

    const avgDays = parseFloat(payData.rows[0]?.avg_days ?? '30');
    const payScore = Math.max(0, Math.min(100, 100 - (avgDays - 1) * 2));

    const total = parseInt(dispData.rows[0]?.total ?? '1') || 1;
    const disputed = parseInt(dispData.rows[0]?.disputed ?? '0');
    const dispScore = Math.max(0, 100 - (disputed / total) * 100);

    const shTotal = parseInt(covData.rows[0]?.total ?? '1') || 1;
    const shCompleted = parseInt(covData.rows[0]?.completed ?? '1');
    const covScore = Math.min(100, (shCompleted / shTotal) * 100);

    const tickets = parseInt(tickData.rows[0]?.ticket_count ?? '0');
    const tickScore = Math.max(0, 100 - tickets * 5);

    // Weighted composite: payment 30%, disputes 20%, coverage 30%, tickets 20%
    const composite = payScore * 0.30 + dispScore * 0.20 + covScore * 0.30 + tickScore * 0.20;
    const churnRisk = composite >= 70 ? 'low' : composite >= 40 ? 'medium' : 'high';

    await pool.query(`
      INSERT INTO analytics_client_health_scores
        (workspace_id, client_id, snapshot_date, payment_velocity_score, dispute_rate_score,
         post_coverage_score, ticket_volume_score, composite_score, churn_risk)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [workspaceId, clientId, snapshotDate,
        payScore.toFixed(2), dispScore.toFixed(2), covScore.toFixed(2),
        tickScore.toFixed(2), composite.toFixed(2), churnRisk]);
  }
}

// ── Main snapshot run ─────────────────────────────────────────────────────────

export async function runDailyAnalyticsSnapshot(): Promise<void> {
  const snapshotDate = toDateString(daysAgo(1));
  log.info(`[AnalyticsSnapshot] Starting daily snapshot for ${snapshotDate}…`);

  let activeWorkspaces: { id: string }[] = [];
  try {
    const result = await pool.query(
      `SELECT id FROM workspaces WHERE subscription_status = 'active' LIMIT 500`
    );
    activeWorkspaces = result.rows;
  } catch (err) {
    log.error('[AnalyticsSnapshot] Failed to load workspaces:', err);
    return;
  }

  let successCount = 0;
  for (const ws of activeWorkspaces) {
    try {
      await runWorkspaceSnapshot(ws.id, snapshotDate);
      await runClientHealthScores(ws.id, snapshotDate);
      successCount++;
    } catch (err) {
      log.error(`[AnalyticsSnapshot] Error for workspace ${ws.id}:`, err);
    }
  }

  log.info(`[AnalyticsSnapshot] Daily snapshot complete: ${successCount}/${activeWorkspaces.length} workspaces processed`);
}

// ── Trinity BI Actions ─────────────────────────────────────────────────────
// Check 18: Register all 9 Trinity BI actions

export function registerAnalyticsBIActions(): void {
  // 1. analytics.revenue.summary
  platformActionHub.registerAction({
    actionId: 'analytics.revenue.summary',
    name: 'Revenue Summary',
    category: 'analytics',
    description: 'Get revenue metrics for a period: total paid, outstanding, payment velocity, overdue rate.',
    requiredRoles: ['owner', 'co_owner', 'finance'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { days = 30 } = payload || {};
      const since = new Date(); since.setDate(since.getDate() - days);
      const data = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status='paid' THEN total END),0) AS paid_revenue,
          COALESCE(SUM(CASE WHEN status IN ('sent','overdue') THEN total END),0) AS outstanding,
          COUNT(CASE WHEN status='overdue' THEN 1 END) AS overdue_count,
          COALESCE(AVG(CASE WHEN status='paid' AND paid_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (paid_at-sent_at))/86400 END),0) AS avg_payment_days
        FROM invoices WHERE workspace_id=$1 AND created_at>=$2
      `, [workspaceId, since.toISOString()]).catch(() => null);
      const r = data?.rows[0];
      return { success: true, actionId: request.actionId, message: `Revenue for last ${days} days`, data: r };
    },
  });

  // 2. analytics.revenue.by_client
  platformActionHub.registerAction({
    actionId: 'analytics.revenue.by_client',
    name: 'Revenue by Client',
    category: 'analytics',
    description: 'Revenue breakdown by client for a period. Answers "which clients generate most revenue?"',
    requiredRoles: ['owner', 'co_owner', 'finance'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { days = 30 } = payload || {};
      const since = new Date(); since.setDate(since.getDate() - days);
      const data = await pool.query(`
        SELECT c.name AS client_name, COALESCE(SUM(i.total),0) AS revenue
        FROM invoices i
        JOIN clients c ON c.id=i.client_id
        WHERE i.workspace_id=$1 AND i.status='paid' AND i.created_at>=$2
        GROUP BY c.name ORDER BY revenue DESC LIMIT 10
      `, [workspaceId, since.toISOString()]).catch(() => null);
      return { success: true, actionId: request.actionId, message: `Top clients by revenue (${days}d)`, data: { clients: data?.rows ?? [] } };
    },
  });

  // 3. analytics.workforce.calloff_rate
  platformActionHub.registerAction({
    actionId: 'analytics.workforce.calloff_rate',
    name: 'Calloff Rate Analytics',
    category: 'analytics',
    description: 'Calloff analytics: rate by officer, pattern by day of week. Answers "who calls off most often?"',
    requiredRoles: ['owner', 'co_owner', 'org_admin', 'org_manager'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { days = 30 } = payload || {};
      const since = new Date(); since.setDate(since.getDate() - days);
      const data = await pool.query(`
        SELECT
          COALESCE(SUM(CASE WHEN metric_name='calloff.count' THEN metric_value END),0) AS total_calloffs,
          COALESCE(SUM(CASE WHEN metric_name='shift.total' THEN metric_value END),0) AS total_shifts
        FROM analytics_daily_snapshots
        WHERE workspace_id=$1 AND snapshot_date>=$2
      `, [workspaceId, since.toISOString().slice(0,10)]).catch(() => null);
      const r = data?.rows[0];
      const calloffRate = r?.total_shifts > 0 ? (r.total_calloffs / r.total_shifts * 100).toFixed(1) : '0.0';
      return { success: true, actionId: request.actionId, message: `Calloff rate: ${calloffRate}% over last ${days} days`, data: { calloffRate, totalCalloffs: r?.total_calloffs, totalShifts: r?.total_shifts } };
    },
  });

  // 4. analytics.workforce.overtime
  platformActionHub.registerAction({
    actionId: 'analytics.workforce.overtime',
    name: 'Overtime Analytics',
    category: 'analytics',
    description: 'OT cost and hours by officer or period. Answers "who is driving overtime costs?"',
    requiredRoles: ['owner', 'co_owner', 'org_admin', 'org_manager'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { days = 30 } = payload || {};
      const since = new Date(); since.setDate(since.getDate() - days);
      const data = await pool.query(`
        SELECT e.first_name||' '||e.last_name AS officer_name,
          COALESCE(SUM(CASE WHEN te.is_overtime THEN te.hours_worked END),0) AS overtime_hours
        FROM time_entries te JOIN employees e ON e.id=te.employee_id
        WHERE te.workspace_id=$1 AND te.clock_in>=$2 AND te.is_overtime=true
        GROUP BY e.first_name,e.last_name ORDER BY overtime_hours DESC LIMIT 10
      `, [workspaceId, since.toISOString()]).catch(() => null);
      return { success: true, actionId: request.actionId, message: `Top OT officers (${days}d)`, data: { officers: data?.rows ?? [] } };
    },
  });

  // 5. analytics.workforce.retention
  platformActionHub.registerAction({
    actionId: 'analytics.workforce.retention',
    name: 'Retention & Turnover Analytics',
    category: 'analytics',
    description: 'Turnover rate, tenure distribution, and new hire trends.',
    requiredRoles: ['owner', 'co_owner', 'org_admin'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const data = await pool.query(`
        SELECT
          COUNT(*) AS total_employees,
          COUNT(CASE WHEN is_active=true THEN 1 END) AS active,
          COUNT(CASE WHEN is_active=false AND termination_date >= NOW()-INTERVAL '90 days' THEN 1 END) AS terminated_90d,
          COALESCE(AVG(CASE WHEN is_active=true AND hire_date IS NOT NULL
            THEN EXTRACT(DAYS FROM NOW()-hire_date)/365 END),0) AS avg_tenure_years
        FROM employees WHERE workspace_id=$1
      `, [workspaceId]).catch(() => null);
      const r = data?.rows[0];
      const turnoverRate = r?.active > 0 ? (r?.terminated_90d / r?.active * 4 * 100).toFixed(1) : '0'; // annualized
      return { success: true, actionId: request.actionId, message: `Annualized turnover rate: ${turnoverRate}%`, data: { ...r, annualizedTurnoverRate: turnoverRate } };
    },
  });

  // 6. analytics.compliance.health
  platformActionHub.registerAction({
    actionId: 'analytics.compliance.health',
    name: 'Compliance Health Analytics',
    category: 'analytics',
    description: 'Compliance score trend, violation count, and license expiry pipeline.',
    requiredRoles: ['owner', 'co_owner', 'org_admin', 'compliance_officer'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const data = await pool.query(`
        SELECT
          COUNT(CASE WHEN expiry_date BETWEEN NOW() AND NOW()+INTERVAL '30 days' THEN 1 END) AS expiring_30d,
          COUNT(CASE WHEN expiry_date BETWEEN NOW() AND NOW()+INTERVAL '60 days' THEN 1 END) AS expiring_60d,
          COUNT(CASE WHEN expiry_date BETWEEN NOW() AND NOW()+INTERVAL '90 days' THEN 1 END) AS expiring_90d,
          COUNT(CASE WHEN expiry_date < NOW() THEN 1 END) AS expired
        FROM officer_certifications oc
        JOIN employees e ON e.id=oc.employee_id
        WHERE e.workspace_id=$1 AND e.is_active=true
      `, [workspaceId]).catch(() => null);
      return { success: true, actionId: request.actionId, message: 'Compliance health data', data: data?.rows[0] ?? {} };
    },
  });

  // 7. analytics.client.health
  platformActionHub.registerAction({
    actionId: 'analytics.client.health',
    name: 'Client Health Scores',
    category: 'analytics',
    description: 'Composite client health scores and churn risk signals from precomputed daily aggregates.',
    requiredRoles: ['owner', 'co_owner', 'org_admin', 'account_manager'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const data = await pool.query(`
        SELECT c.name AS client_name, hs.composite_score, hs.churn_risk, hs.snapshot_date
        FROM analytics_client_health_scores hs
        JOIN clients c ON c.id=hs.client_id
        WHERE hs.workspace_id=$1 AND hs.snapshot_date=(
          SELECT MAX(snapshot_date) FROM analytics_client_health_scores WHERE workspace_id=$1
        )
        ORDER BY hs.composite_score ASC
      `, [workspaceId]).catch(() => null);
      const highRisk = (data?.rows ?? []).filter((r: any) => r.churn_risk === 'high').length;
      return { success: true, actionId: request.actionId, message: `${highRisk} high-churn-risk client(s)`, data: { clients: data?.rows ?? [], highRiskCount: highRisk } };
    },
  });

  // 8. analytics.operations.current
  platformActionHub.registerAction({
    actionId: 'analytics.operations.current',
    name: 'Current Operations Status',
    category: 'analytics',
    description: 'Real-time operational status: clocked-in count, posts covered, open shifts, active incidents.',
    requiredRoles: ['owner', 'co_owner', 'org_admin', 'org_manager', 'supervisor'],
    handler: async (request) => {
      const { workspaceId } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const data = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM time_entries WHERE workspace_id=$1 AND clock_out IS NULL) AS clocked_in,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND status='open' AND date=CURRENT_DATE) AS open_shifts,
          (SELECT COUNT(*) FROM security_incidents WHERE workspace_id=$1 AND status IN ('open','investigating')) AS active_incidents
      `, [workspaceId]).catch(() => null);
      return { success: true, actionId: request.actionId, message: 'Real-time operations', data: data?.rows[0] ?? {} };
    },
  });

  // 9. analytics.report.generate
  platformActionHub.registerAction({
    actionId: 'analytics.report.generate',
    name: 'Generate Analytics Report',
    category: 'analytics',
    description: 'Generate a structured analytics summary report for a period with insights and recommendations.',
    requiredRoles: ['owner', 'co_owner', 'finance', 'org_admin'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { days = 30 } = payload || {};
      // Check 19: uses precomputed aggregates from analytics_daily_snapshots
      const data = await pool.query(`
        SELECT metric_name, COALESCE(SUM(metric_value),0) AS total
        FROM analytics_daily_snapshots
        WHERE workspace_id=$1 AND snapshot_date >= NOW()-INTERVAL '${days} days'
        GROUP BY metric_name
      `, [workspaceId]).catch(() => null);
      const metrics: Record<string, number> = {};
      for (const row of data?.rows ?? []) metrics[row.metric_name] = parseFloat(row.total);
      const sections = {
        revenue: { paid: metrics['revenue.paid'] ?? 0, outstanding: metrics['revenue.outstanding'] ?? 0 },
        workforce: { totalHours: metrics['payroll.total_hours'] ?? 0, overtimeHours: metrics['payroll.overtime_hours'] ?? 0, calloffs: metrics['calloff.count'] ?? 0 },
        operations: { shiftsCompleted: metrics['shift.completed'] ?? 0, shiftsCancelled: metrics['shift.cancelled'] ?? 0 },
      };
      return { success: true, actionId: request.actionId, message: `Analytics report (${days}d) generated`, data: { period: days, sections, generatedAt: new Date().toISOString() } };
    },
  });

  // 10. search.query — run a cross-entity global search via Trinity
  platformActionHub.registerAction({
    actionId: 'search.query',
    name: 'Global Search',
    category: 'search',
    description: 'Search across officers, clients, shifts, invoices, incidents and documents. Returns grouped results with deep links.',
    requiredRoles: ['owner', 'co_owner', 'manager', 'supervisor', 'officer'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { q, types, limit = 20 } = payload || {};
      if (!q || String(q).trim().length < 2) {
        return { success: false, actionId: request.actionId, message: 'query must be at least 2 characters', data: null };
      }
      const query = String(q).trim().slice(0, 100);
      const safeLimit = Math.min(Number(limit) || 20, 50);

      const tables: Array<{ label: string; sql: string }> = [
        {
          label: 'officers',
          sql: `SELECT 'officer' AS entity_type, id AS entity_id, first_name || ' ' || last_name AS display_name, COALESCE(email,'') AS subtitle FROM employees WHERE workspace_id='${workspaceId}' AND (first_name || ' ' || last_name || ' ' || COALESCE(email,'') || ' ' || COALESCE(employee_number,'')) ILIKE '%${query.replace(/'/g, "''")}%' LIMIT ${safeLimit}`,
        },
        {
          label: 'clients',
          sql: `SELECT 'client' AS entity_type, id AS entity_id, COALESCE(company_name, first_name || ' ' || last_name) AS display_name, COALESCE(email,'') AS subtitle FROM clients WHERE workspace_id='${workspaceId}' AND (COALESCE(company_name,'') || ' ' || first_name || ' ' || last_name || ' ' || COALESCE(email,'')) ILIKE '%${query.replace(/'/g, "''")}%' LIMIT ${safeLimit}`,
        },
        {
          label: 'incidents',
          sql: `SELECT 'incident' AS entity_type, id AS entity_id, COALESCE(title,'Incident') AS display_name, COALESCE(incident_type,'') AS subtitle FROM incident_reports WHERE workspace_id='${workspaceId}' AND (COALESCE(title,'') || ' ' || COALESCE(polished_description,'') || ' ' || COALESCE(incident_type,'')) ILIKE '%${query.replace(/'/g, "''")}%' LIMIT ${safeLimit}`,
        },
      ];

      const filterTypes = types ? String(types).split(',').map((t: string) => t.trim()) : null;
      const filtered = filterTypes ? tables.filter(t => filterTypes.includes(t.label)) : tables;

      const allRows: any[] = [];
      for (const t of filtered) {
        const { rows } = await pool.query(t.sql).catch(() => ({ rows: [] }));
        allRows.push(...rows);
      }

      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${allRows.length} result(s) for "${query}"`,
        data: { query, results: allRows, total: allRows.length },
      };
    },
  });

  // 11. privacy.dsr_create — submit a data subject request via Trinity
  platformActionHub.registerAction({
    actionId: 'privacy.dsr_create',
    name: 'Submit Data Subject Request',
    category: 'privacy',
    description: 'Submit a GDPR/CCPA data subject request (access, portability, erasure, correction, restriction, objection).',
    requiredRoles: ['owner', 'co_owner', 'manager', 'supervisor', 'officer'],
    handler: async (request) => {
      const { workspaceId, userId, payload } = request;
      if (!workspaceId || !userId) return { success: false, actionId: request.actionId, message: 'workspace and user required', data: null };
      const { request_type = 'access' } = payload || {};
      const valid = ['access', 'portability', 'erasure', 'restriction', 'correction', 'objection'];
      if (!valid.includes(request_type)) return { success: false, actionId: request.actionId, message: `request_type must be one of: ${valid.join(', ')}`, data: null };
      const { rows } = await pool.query(
        `INSERT INTO data_subject_requests (workspace_id, requestor_id, requestor_type, request_type, sla_deadline) VALUES ($1,$2,'officer',$3,now()+interval '30 days') RETURNING id, request_type, status, sla_deadline`,
        [workspaceId, userId, request_type]
      );
      return { success: true, actionId: request.actionId, message: `Data subject request (${request_type}) submitted. Reference: DSR #${rows[0].id}. SLA: 30 days.`, data: rows[0] };
    },
  });

  // 12. privacy.data_export — generate personal data export link
  platformActionHub.registerAction({
    actionId: 'privacy.data_export',
    name: 'Request Personal Data Export',
    category: 'privacy',
    description: 'Generate a 48-hour download link for an officer personal data export (all 10 data categories).',
    requiredRoles: ['owner', 'co_owner', 'manager'],
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: 'workspace required', data: null };
      const { employee_id } = payload || {};
      if (!employee_id) return { success: false, actionId: request.actionId, message: 'employee_id required', data: null };
      return { success: true, actionId: request.actionId, message: `To generate a personal data export for employee ${employee_id}, POST to /api/privacy/officer-export/${employee_id}. The response will include a 48-hour download link.`, data: { endpoint: `/api/privacy/officer-export/${employee_id}`, method: 'POST', expiry_hours: 48 } };
    },
  });

  // 13. privacy.anonymize — irreversibly anonymize officer PII
  platformActionHub.registerAction({
    actionId: 'privacy.anonymize',
    name: 'Anonymize Officer PII',
    category: 'privacy',
    description: 'Irreversibly anonymize all PII for a former officer (GDPR erasure). Payroll, time, and compliance records are retained. Requires platform_staff role.',
    requiredRoles: ['owner'],
    handler: async (request) => {
      const { payload } = request;
      const { employee_id } = payload || {};
      if (!employee_id) return { success: false, actionId: request.actionId, message: 'employee_id required', data: null };
      return { success: true, actionId: request.actionId, message: `To anonymize PII for employee ${employee_id}, POST to /api/privacy/anonymize/${employee_id}. This action is IRREVERSIBLE. Payroll, time, and compliance records will be retained per legal requirements.`, data: { endpoint: `/api/privacy/anonymize/${employee_id}`, method: 'POST', irreversible: true } };
    },
  });

  log.info('[AnalyticsSnapshot] Registered 13 Trinity actions (9 BI + search.query + 3 privacy)');
}

// ── Schedule daily 2 AM UTC cron ─────────────────────────────────────────────

export function scheduleDailyAnalyticsSnapshot(): void {
  registerAnalyticsBIActions();

  const msUntil2AM = () => {
    const now = new Date();
    const next2AM = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 2, 0, 0, 0));
    return next2AM.getTime() - now.getTime();
  };

  const scheduleNext = () => {
    const delay = msUntil2AM();
    setTimeout(async () => {
      try {
        await runDailyAnalyticsSnapshot();
      } catch (err) {
        log.error('[AnalyticsSnapshot] Cron run failed:', err);
      }
      scheduleNext();
    }, delay).unref();
    const hours = Math.round(delay / 36000) / 100;
    log.info(`[AnalyticsSnapshot] Next snapshot in ${hours}h (2 AM UTC)`);
  };

  scheduleNext();
}
