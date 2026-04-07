/**
 * Phase 34 BI Analytics Routes
 * GET /api/analytics/bi/calloff-rates      — calloff analytics by officer + day pattern
 * GET /api/analytics/bi/license-expiry     — license expiry pipeline (30/60/90 days)
 * GET /api/analytics/bi/client-health      — composite client health scores
 * GET /api/analytics/bi/retention          — turnover, tenure, retention metrics
 * GET /api/analytics/bi/realtime           — real-time operational view
 * GET /api/analytics/bi/snapshots          — precomputed daily aggregate data
 * GET /api/analytics/bi/financial-summary  — revenue + payroll from precomputed aggregates
 * GET /api/analytics/bi/export             — CSV export (role-gated, audit-logged)
 * GET /api/analytics/bi/scheduled-report   — get scheduled report config for workspace
 * POST /api/analytics/bi/scheduled-report  — save/update scheduled report config
 *
 * ALL queries are READ-ONLY (no INSERT/UPDATE/DELETE on operational tables).
 * ALL queries are workspace-scoped.
 * Slow queries (>500ms) are logged.
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { db } from '../db';
import { universalAudit } from '../services/universalAuditService';
import { analyticsScheduledReports } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { requirePlan } from '../tierGuards';
import { createLogger } from '../lib/logger';
const log = createLogger('BiAnalyticsRoutes');


const router = Router();

// BI analytics (calloff, retention, financial-summary, scheduled reports) is a Professional+ feature.
// The /export and /scheduled-report endpoints specifically align with advanced_analytics (professional)
// and custom_reporting (business), but the suite as a whole gates at professional.
router.use(requireAuth);
router.use(requirePlan('professional'));

// ── Query timer (Check 17: slow query logging) ────────────────────────────────

async function tq<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const elapsed = Date.now() - start;
  if (elapsed > 500) log.warn(`[BIAnalytics] SLOW QUERY ${elapsed}ms: ${label}`);
  return result;
}

// ── Role guard helper ─────────────────────────────────────────────────────────

const FINANCIAL_ROLES = ['org_owner', 'co_owner', 'finance'];
const WORKFORCE_ROLES = ['org_owner', 'co_owner', 'org_admin', 'org_manager'];
const CLIENT_ROLES = ['org_owner', 'co_owner', 'org_admin', 'account_manager'];
const OPS_ROLES = ['org_owner', 'co_owner', 'org_admin', 'org_manager', 'supervisor'];

function hasRole(req: any, allowedRoles: string[]): boolean {
  const role = req.user?.role || req.user?.workspaceRole;
  if (!role) return false;
  if (req.user?.platformRole === 'admin' || req.user?.platformRole === 'support') return true;
  return allowedRoles.some(r => role.includes(r) || role === r);
}

// ── GET /api/analytics/bi/calloff-rates ──────────────────────────────────────
// Check 4: Calloff analytics by officer + pattern by day of week

router.get('/calloff-rates', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, WORKFORCE_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const since = new Date(); since.setDate(since.getDate() - days);

  try {
    const [byOfficer, byDayOfWeek] = await Promise.all([
      tq('calloff-rates:by-officer', () =>
        pool.query(`
          SELECT
            e.first_name || ' ' || e.last_name AS officer_name,
            e.id AS employee_id,
            COUNT(sc.id) AS calloff_count,
            COUNT(s.id) AS total_shifts,
            ROUND(COUNT(sc.id)::numeric / NULLIF(COUNT(s.id),0) * 100, 1) AS calloff_rate
          FROM employees e
          LEFT JOIN shifts s ON s.employee_id=e.id AND s.workspace_id=$1
            AND s.date >= $2
          LEFT JOIN shift_calloffs sc ON sc.employee_id=e.id AND sc.workspace_id=$1
            AND sc.called_off_at >= $3
          WHERE e.workspace_id=$1 AND e.is_active=true
          GROUP BY e.id, e.first_name, e.last_name
          HAVING COUNT(s.id) > 0
          ORDER BY calloff_rate DESC NULLS LAST
          LIMIT 20
        `, [workspaceId, since.toISOString().slice(0, 10), since.toISOString()])
        .catch((err) => {
          log.error('calloff-rates:by-officer query failed:', err);
          return { rows: [] };
        })
      ),
      tq('calloff-rates:by-day', () =>
        pool.query(`
          SELECT
            TO_CHAR(called_off_at, 'Dy') AS day_name,
            EXTRACT(DOW FROM called_off_at) AS day_number,
            COUNT(*) AS calloff_count
          FROM shift_calloffs
          WHERE workspace_id=$1 AND called_off_at >= $2
          GROUP BY day_name, day_number
          ORDER BY day_number
        `, [workspaceId, since.toISOString()])
        .catch((err) => {
          log.error('calloff-rates:by-day query failed:', err);
          return { rows: [] };
        })
      ),
    ]);

    return res.json({ success: true, data: { byOfficer: byOfficer.rows, byDayOfWeek: byDayOfWeek.rows, periodDays: days } });
  } catch (err) {
    log.error('[BIAnalytics] calloff-rates error:', err);
    return res.status(500).json({ error: 'Failed to load calloff analytics.' });
  }
});

// ── GET /api/analytics/bi/license-expiry ─────────────────────────────────────
// Check 6: License expiry pipeline — 30/60/90 days

router.get('/license-expiry', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, WORKFORCE_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  try {
    const [expiring, expired] = await Promise.all([
      tq('license-expiry:expiring', () =>
        pool.query(`
          SELECT
            e.first_name || ' ' || e.last_name AS officer_name,
            e.id AS employee_id,
            oc.license_type,
            oc.license_number,
            oc.expiry_date,
            CASE
              WHEN oc.expiry_date <= NOW() + INTERVAL '30 days' THEN '30d'
              WHEN oc.expiry_date <= NOW() + INTERVAL '60 days' THEN '60d'
              ELSE '90d'
            END AS bucket
          FROM officer_certifications oc
          JOIN employees e ON e.id = oc.employee_id
          WHERE e.workspace_id=$1 AND e.is_active=true
            AND oc.expiry_date BETWEEN NOW() AND NOW() + INTERVAL '90 days'
          ORDER BY oc.expiry_date ASC
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
      tq('license-expiry:expired', () =>
        pool.query(`
          SELECT
            e.first_name || ' ' || e.last_name AS officer_name,
            oc.license_type, oc.expiry_date
          FROM officer_certifications oc
          JOIN employees e ON e.id=oc.employee_id
          WHERE e.workspace_id=$1 AND e.is_active=true AND oc.expiry_date < NOW()
          ORDER BY oc.expiry_date ASC LIMIT 20
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
    ]);

    const bucket30 = expiring.rows.filter((r: any) => r.bucket === '30d');
    const bucket60 = expiring.rows.filter((r: any) => r.bucket === '60d');
    const bucket90 = expiring.rows.filter((r: any) => r.bucket === '90d');

    return res.json({
      success: true,
      data: {
        expiring30d: bucket30,
        expiring60d: bucket60,
        expiring90d: bucket90,
        expired: expired.rows,
        counts: { days30: bucket30.length, days60: bucket60.length, days90: bucket90.length, expired: expired.rows.length },
      },
    });
  } catch (err) {
    log.error('[BIAnalytics] license-expiry error:', err);
    return res.status(500).json({ error: 'Failed to load license expiry data.' });
  }
});

// ── GET /api/analytics/bi/client-health ──────────────────────────────────────
// Check 7: Client health scores from precomputed aggregate table (Check 19)

router.get('/client-health', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, CLIENT_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  try {
    const data = await tq('client-health', () =>
      pool.query(`
        SELECT
          c.name AS client_name,
          c.id AS client_id,
          hs.composite_score,
          hs.payment_velocity_score,
          hs.dispute_rate_score,
          hs.post_coverage_score,
          hs.ticket_volume_score,
          hs.churn_risk,
          hs.snapshot_date
        FROM analytics_client_health_scores hs
        JOIN clients c ON c.id=hs.client_id
        WHERE hs.workspace_id=$1 AND hs.snapshot_date=(
          SELECT MAX(snapshot_date) FROM analytics_client_health_scores WHERE workspace_id=$1
        )
        ORDER BY hs.composite_score ASC
      `, [workspaceId])
      .catch(() => ({ rows: [] }))
    );

    const highRisk = data.rows.filter((r: any) => r.churn_risk === 'high');
    const mediumRisk = data.rows.filter((r: any) => r.churn_risk === 'medium');

    return res.json({
      success: true,
      data: {
        clients: data.rows,
        summary: { total: data.rows.length, highRisk: highRisk.length, mediumRisk: mediumRisk.length },
        lastUpdated: data.rows[0]?.snapshot_date ?? null,
      },
    });
  } catch (err) {
    log.error('[BIAnalytics] client-health error:', err);
    return res.status(500).json({ error: 'Failed to load client health scores.' });
  }
});

// ── GET /api/analytics/bi/retention ──────────────────────────────────────────
// Check 5: Turnover, tenure, rehire rate

router.get('/retention', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, WORKFORCE_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  try {
    const [summary, tenure, monthly] = await Promise.all([
      tq('retention:summary', () =>
        pool.query(`
          SELECT
            COUNT(*) AS total_employees,
            COUNT(CASE WHEN is_active=true THEN 1 END) AS active,
            COUNT(CASE WHEN is_active=false AND termination_date >= NOW()-INTERVAL '90 days' THEN 1 END) AS terminated_90d,
            COUNT(CASE WHEN hire_date >= NOW()-INTERVAL '30 days' THEN 1 END) AS new_hires_30d,
            COALESCE(ROUND(AVG(CASE WHEN is_active=true AND hire_date IS NOT NULL
              THEN EXTRACT(DAYS FROM NOW()-hire_date)/365 END)::numeric, 1), 0) AS avg_tenure_years
          FROM employees WHERE workspace_id=$1
        `, [workspaceId])
        .catch(() => ({ rows: [{ total_employees: 0, active: 0, terminated_90d: 0, new_hires_30d: 0, avg_tenure_years: 0 }] }))
      ),
      tq('retention:tenure-dist', () =>
        pool.query(`
          SELECT
            CASE
              WHEN EXTRACT(DAYS FROM NOW()-hire_date) < 90 THEN '0-3mo'
              WHEN EXTRACT(DAYS FROM NOW()-hire_date) < 180 THEN '3-6mo'
              WHEN EXTRACT(DAYS FROM NOW()-hire_date) < 365 THEN '6-12mo'
              WHEN EXTRACT(DAYS FROM NOW()-hire_date) < 730 THEN '1-2yr'
              ELSE '2yr+'
            END AS tenure_bucket,
            COUNT(*) AS count
          FROM employees
          WHERE workspace_id=$1 AND is_active=true AND hire_date IS NOT NULL
          GROUP BY tenure_bucket ORDER BY MIN(hire_date)
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
      tq('retention:monthly-trend', () =>
        pool.query(`
          SELECT
            TO_CHAR(hire_date, 'YYYY-MM') AS month,
            COUNT(*) AS new_hires
          FROM employees
          WHERE workspace_id=$1 AND hire_date >= NOW()-INTERVAL '12 months'
          GROUP BY month ORDER BY month
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
    ]);

    const r = summary.rows[0];
    const annualizedTurnover = r.active > 0 ? Math.round(r.terminated_90d / r.active * 4 * 100) : 0;

    return res.json({
      success: true,
      data: {
        summary: { ...r, annualizedTurnoverRate: annualizedTurnover },
        tenureDistribution: tenure.rows,
        monthlyHires: monthly.rows,
      },
    });
  } catch (err) {
    log.error('[BIAnalytics] retention error:', err);
    return res.status(500).json({ error: 'Failed to load retention data.' });
  }
});

// ── GET /api/analytics/bi/realtime ───────────────────────────────────────────
// Check 8: Real-time operations view

router.get('/realtime', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, OPS_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  try {
    const data = await tq('realtime-ops', () =>
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM time_entries WHERE workspace_id=$1 AND clock_out IS NULL) AS clocked_in,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND status='open' AND date=CURRENT_DATE) AS open_shifts,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND status='completed' AND date=CURRENT_DATE) AS completed_today,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND date=CURRENT_DATE) AS total_today,
          (SELECT COUNT(*) FROM security_incidents WHERE workspace_id=$1 AND status IN ('open','investigating')) AS active_incidents,
          (SELECT COUNT(*) FROM shifts WHERE workspace_id=$1 AND status='open'
            AND date=CURRENT_DATE AND start_time < NOW()::time) AS late_to_start
      `, [workspaceId])
      .catch(() => ({ rows: [{ clocked_in: 0, open_shifts: 0, completed_today: 0, total_today: 0, active_incidents: 0, late_to_start: 0 }] }))
    );

    return res.json({ success: true, data: data.rows[0], refreshedAt: new Date().toISOString() });
  } catch (err) {
    log.error('[BIAnalytics] realtime error:', err);
    return res.status(500).json({ error: 'Failed to load real-time operations.' });
  }
});

// ── GET /api/analytics/bi/snapshots ──────────────────────────────────────────
// Check 12/13/19: Return precomputed aggregate data for trend charts

router.get('/snapshots', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 90);
  const metrics = (req.query.metrics as string || '').split(',').filter(Boolean);

  try {
    let queryText = `
      SELECT snapshot_date, metric_name, COALESCE(SUM(metric_value),0) AS value
      FROM analytics_daily_snapshots
      WHERE workspace_id=$1 AND snapshot_date >= NOW()-INTERVAL '${days} days'
    `;
    const params: unknown[] = [workspaceId];
    if (metrics.length > 0) {
      queryText += ` AND metric_name = ANY($2::text[])`;
      params.push(metrics);
    }
    queryText += ' GROUP BY snapshot_date, metric_name ORDER BY snapshot_date';

    const data = await tq('snapshots', () => pool.query(queryText, params).catch(() => ({ rows: [] })));

    return res.json({ success: true, data: data.rows, periodDays: days });
  } catch (err) {
    log.error('[BIAnalytics] snapshots error:', err);
    return res.status(500).json({ error: 'Failed to load snapshot data.' });
  }
});

// ── GET /api/analytics/bi/financial-summary ──────────────────────────────────
// Check 2/3: Financial summary from precomputed aggregates (Check 19)

router.get('/financial-summary', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, FINANCIAL_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  const days = Math.min(parseInt(req.query.days as string) || 30, 365);

  try {
    const [snapData, revenueByClient, overdueAging] = await Promise.all([
      tq('financial:snapshots', () =>
        pool.query(`
          SELECT metric_name, COALESCE(SUM(metric_value),0) AS total
          FROM analytics_daily_snapshots
          WHERE workspace_id=$1 AND snapshot_date >= NOW()-INTERVAL '${days} days'
            AND (metric_name LIKE 'revenue.%' OR metric_name LIKE 'invoice.%' OR metric_name LIKE 'payroll.%')
          GROUP BY metric_name
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
      tq('financial:revenue-by-client', () =>
        pool.query(`
          SELECT c.name AS client_name, COALESCE(SUM(i.total_amount),0) AS revenue
          FROM invoices i JOIN clients c ON c.id=i.client_id
          WHERE i.workspace_id=$1 AND i.status='paid' AND i.created_at >= NOW()-INTERVAL '${days} days'
          GROUP BY c.name ORDER BY revenue DESC LIMIT 10
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
      tq('financial:overdue-aging', () =>
        pool.query(`
          SELECT
            CASE
              WHEN NOW()-due_date <= INTERVAL '30 days' THEN '0-30d'
              WHEN NOW()-due_date <= INTERVAL '60 days' THEN '31-60d'
              WHEN NOW()-due_date <= INTERVAL '90 days' THEN '61-90d'
              ELSE '90d+'
            END AS age_bucket,
            COUNT(*) AS invoice_count,
            COALESCE(SUM(total_amount),0) AS outstanding_amount
          FROM invoices
          WHERE workspace_id=$1 AND status IN ('sent','overdue') AND due_date < NOW()
          GROUP BY age_bucket ORDER BY MIN(NOW()-due_date)
        `, [workspaceId])
        .catch(() => ({ rows: [] }))
      ),
    ]);

    const metrics: Record<string, number> = {};
    for (const row of snapData.rows) metrics[row.metric_name] = parseFloat(row.total);

    return res.json({
      success: true,
      data: {
        summary: metrics,
        revenueByClient: revenueByClient.rows,
        overdueAging: overdueAging.rows,
        periodDays: days,
      },
    });
  } catch (err) {
    log.error('[BIAnalytics] financial-summary error:', err);
    return res.status(500).json({ error: 'Failed to load financial summary.' });
  }
});

// ── GET /api/analytics/bi/export ─────────────────────────────────────────────
// Check 21/22/23: CSV export with audit record

router.get('/export', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  const userId = req.user?.id;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, [...FINANCIAL_ROLES, ...WORKFORCE_ROLES, ...CLIENT_ROLES])) {
    return res.status(403).json({ error: 'Insufficient role for export.' });
  }

  const reportType = (req.query.report as string) || 'snapshots';
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);

  try {
    // Check 23: Write audit record before generating export
    await universalAudit.log({
      workspaceId,
      actorId: userId,
      actorType: 'user',
      action: 'analytics_export',
      entityType: 'analytics',
      entityId: reportType,
      changeType: 'read',
      metadata: { reportType, days, exportedAt: new Date().toISOString() },
    });

    const data = await pool.query(`
      SELECT snapshot_date, metric_name, metric_value
      FROM analytics_daily_snapshots
      WHERE workspace_id=$1 AND snapshot_date >= NOW()-INTERVAL '${days} days'
      ORDER BY snapshot_date, metric_name
    `, [workspaceId]).catch(() => ({ rows: [] }));

    if (req.query.format === 'csv') {
      const headers = 'date,metric,value\n';
      const rows = data.rows.map((r: any) => `${r.snapshot_date},${r.metric_name},${r.metric_value}`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${reportType}-${new Date().toISOString().slice(0,10)}.csv"`);
      return res.send(headers + rows);
    }

    return res.json({ success: true, data: data.rows, reportType, periodDays: days });
  } catch (err) {
    log.error('[BIAnalytics] export error:', err);
    return res.status(500).json({ error: 'Failed to generate export.' });
  }
});

// ── GET /api/analytics/bi/scheduled-report ───────────────────────────────────
// Check 24: Get scheduled report configuration

router.get('/scheduled-report', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, FINANCIAL_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  try {
    const [config] = await db.select().from(analyticsScheduledReports)
      .where(eq(analyticsScheduledReports.workspaceId, workspaceId)).limit(1);

    return res.json({
      success: true,
      data: config || { workspaceId, enabled: false, frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, recipientUserIds: [], reportSections: ['revenue', 'workforce', 'clients', 'compliance'] },
    });
  } catch (err) {
    log.error('[BIAnalytics] scheduled-report GET error:', err);
    return res.status(500).json({ error: 'Failed to load scheduled report config.' });
  }
});

// ── POST /api/analytics/bi/scheduled-report ──────────────────────────────────
// Check 24: Save/update scheduled report configuration

router.post('/scheduled-report', async (req: any, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(403).json({ error: 'Workspace context required.' });
  if (!hasRole(req, FINANCIAL_ROLES)) return res.status(403).json({ error: 'Insufficient role.' });

  const { enabled, frequency, dayOfWeek, dayOfMonth, recipientUserIds, reportSections } = req.body;

  try {
    await pool.query(`
      INSERT INTO analytics_scheduled_reports
        (workspace_id, enabled, frequency, day_of_week, day_of_month, recipient_user_ids, report_sections, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, NOW())
      ON CONFLICT (workspace_id) DO UPDATE SET
        enabled = EXCLUDED.enabled,
        frequency = EXCLUDED.frequency,
        day_of_week = EXCLUDED.day_of_week,
        day_of_month = EXCLUDED.day_of_month,
        recipient_user_ids = EXCLUDED.recipient_user_ids,
        report_sections = EXCLUDED.report_sections,
        updated_at = NOW()
    `, [workspaceId, enabled ?? false, frequency ?? 'weekly', dayOfWeek ?? 1, dayOfMonth ?? 1,
        JSON.stringify(recipientUserIds ?? []), JSON.stringify(reportSections ?? ['revenue', 'workforce', 'clients', 'compliance'])]);

    return res.json({ success: true, message: 'Scheduled report configuration saved.' });
  } catch (err) {
    log.error('[BIAnalytics] scheduled-report POST error:', err);
    return res.status(500).json({ error: 'Failed to save scheduled report config.' });
  }
});

export default router;
