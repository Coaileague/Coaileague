/**
 * ADMIN WORKSPACE DETAILS + PLATFORM SEARCH — Phase 63
 *
 * GET /api/admin/workspaces/:id/details — Full workspace context for support agents
 * GET /api/admin/search?q= — Platform-wide search across all workspaces
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { pool } from '../db';
import { requirePlatformRole , requirePlatformStaff } from '../rbac';
import { createLogger } from '../lib/logger';

const log = createLogger('AdminWorkspaceDetails');
const router = Router();

const requirePlatformStaff = requirePlatformRole(['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'platform_staff', 'compliance_officer']);

// ============================================================================
// GET /api/admin/workspaces/:id/details
// ============================================================================
router.get('/workspaces/:id/details', requirePlatformStaff, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [
      wsRow,
      subscription,
      officerRows,
      activeShifts,
      openInvoices,
      recentIncidents,
      complianceAlerts,
      pendingOnboarding,
      recentTickets,
      notifHealth,
      trinityActivity
    ] = await Promise.all([
      pool.query(`SELECT id, name, status, created_at FROM workspaces WHERE id = $1`, [id]),

      pool.query(`
        SELECT plan_type, status, seats_used, seats_purchased, billing_cycle
        FROM workspace_subscriptions
        WHERE workspace_id = $1
        ORDER BY created_at DESC LIMIT 1
      `, [id]).catch(() => ({ rows: [] })),

      pool.query(`
        SELECT e.id, e.first_name, e.last_name, e.role, e.status,
          u.email, u.locked_until, u.login_attempts
        FROM employees e
        LEFT JOIN users u ON u.id = e.user_id
        WHERE e.workspace_id = $1
        ORDER BY e.role DESC, e.last_name ASC
        LIMIT 50
      `, [id]),

      pool.query(`
        SELECT id, start_time, end_time, status, assigned_officer_id
        FROM shifts
        WHERE workspace_id = $1
        AND start_time > NOW() - INTERVAL '24 hours'
        AND start_time < NOW() + INTERVAL '7 days'
        ORDER BY start_time ASC LIMIT 20
      `, [id]).catch(() => ({ rows: [] })),

      pool.query(`
        SELECT id, invoice_number, status, total, due_date, created_at
        FROM invoices
        WHERE workspace_id = $1 AND status IN ('pending','overdue','sent')
        ORDER BY due_date ASC LIMIT 10
      `, [id]).catch(() => ({ rows: [] })),

      pool.query(`
        SELECT id, incident_type, severity, status, created_at
        FROM incidents
        WHERE workspace_id = $1
        ORDER BY created_at DESC LIMIT 10
      `, [id]).catch(() => ({ rows: [] })),

      pool.query(`
        SELECT COUNT(*) as alert_count FROM compliance_records
        WHERE workspace_id = $1 AND status = 'alert'
      `, [id]).catch(() => ({ rows: [{ alert_count: 0 }] })),

      pool.query(`
        SELECT e.id, e.first_name, e.last_name, p.status, p.overall_progress_pct
        FROM employee_onboarding_progress p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.workspace_id = $1 AND p.status IN ('pending','in_progress')
        ORDER BY p.created_at DESC LIMIT 10
      `, [id]).catch(() => ({ rows: [] })),

      pool.query(`
        SELECT id, ticket_number, subject, category, status, priority, created_at, resolved_at
        FROM support_tickets
        WHERE workspace_id = $1
        ORDER BY created_at DESC LIMIT 10
      `, [id]),

      pool.query(`
        SELECT channel, status, COUNT(*) as count
        FROM notification_deliveries
        WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '7 days'
        GROUP BY channel, status
      `, [id]).catch(() => ({ rows: [] })),

      pool.query(`
        SELECT action_type, action_description, actor_type, executed_at
        FROM support_actions
        WHERE workspace_id = $1
        ORDER BY executed_at DESC LIMIT 10
      `, [id]).catch(() => ({ rows: [] }))
    ]);

    if (wsRow.rows.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    res.json({
      workspace: wsRow.rows[0],
      subscription: subscription.rows[0] || null,
      officers: officerRows.rows,
      activeShifts: activeShifts.rows,
      openInvoices: openInvoices.rows,
      recentIncidents: recentIncidents.rows,
      complianceAlerts: {
        count: parseInt(complianceAlerts.rows[0]?.alert_count || '0')
      },
      pendingOnboarding: pendingOnboarding.rows,
      recentSupportTickets: recentTickets.rows,
      notificationHealth: notifHealth.rows,
      trinityActivity: trinityActivity.rows
    });

  } catch (err) {
    log.error('workspace details failed', { id, err });
    res.status(500).json({ error: 'Failed to load workspace details' });
  }
});

// ============================================================================
// GET /api/admin/search?q=
// ============================================================================
router.get('/search', requirePlatformStaff, async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q || q.length < 2) return res.json([]);

  const search = `%${q}%`;

  try {
    const [employees, workspaces, tickets, users] = await Promise.all([
      pool.query(`
        SELECT
          e.id, 'employee' as entity_type,
          e.first_name || ' ' || e.last_name as display_name,
          e.role, e.status,
          e.workspace_id,
          w.name as workspace_name,
          u.email
        FROM employees e
        LEFT JOIN workspaces w ON w.id = e.workspace_id
        LEFT JOIN users u ON u.id = e.user_id
        WHERE (e.first_name ILIKE $1 OR e.last_name ILIKE $1 OR u.email ILIKE $1)
        LIMIT 10
      `, [search]),

      pool.query(`
        SELECT id, 'workspace' as entity_type, name as display_name, status, id as workspace_id, name as workspace_name
        FROM workspaces
        WHERE name ILIKE $1
        LIMIT 5
      `, [search]),

      pool.query(`
        SELECT
          st.id, 'support_ticket' as entity_type,
          st.subject as display_name, st.status, st.ticket_number,
          st.workspace_id, w.name as workspace_name
        FROM support_tickets st
        LEFT JOIN workspaces w ON w.id = st.workspace_id
        WHERE st.subject ILIKE $1 OR st.ticket_number ILIKE $1
        LIMIT 5
      `, [search]),

      pool.query(`
        SELECT id, 'user' as entity_type, email as display_name, role, id as workspace_id, NULL as workspace_name
        FROM users
        WHERE email ILIKE $1 AND role NOT IN ('system','bot')
        LIMIT 5
      `, [search])
    ]);

    const results = [
      ...employees.rows.map(r => ({ ...r, deepLink: `/admin/support-console/workspace/${r.workspace_id}` })),
      ...workspaces.rows.map(r => ({ ...r, deepLink: `/admin/support-console/workspace/${r.id}` })),
      ...tickets.rows.map(r => ({ ...r, deepLink: `/admin/support-console/tickets/${r.id}` })),
      ...users.rows.map(r => ({ ...r, deepLink: `/admin/users/${r.id}` }))
    ];

    res.json(results);
  } catch (err) {
    log.error('platform search failed', { err });
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
