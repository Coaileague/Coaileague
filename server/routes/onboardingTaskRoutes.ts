/**
 * Phase 48 — Onboarding Task Management API Routes
 * ==================================================
 * GET  /api/onboarding-tasks/templates             — list all templates
 * GET  /api/onboarding-tasks/employee/:employeeId  — employee task completion status
 * POST /api/onboarding-tasks/employee/:employeeId/complete/:taskId — mark complete
 * POST /api/onboarding-tasks/employee/:employeeId/waive/:taskId   — waive with reason
 * GET  /api/onboarding-tasks/manager               — manager view: overdue officers
 * POST /api/onboarding-tasks/provision/:employeeId — provision tasks for new employee
 * GET  /api/onboarding-tasks/tier1-blocked         — check if employee is Tier1 blocked
 */

import { Router } from 'express';
import { pool } from '../db';
import { requireAuth, type AuthenticatedRequest } from '../rbac';
import { z } from 'zod';
import { createLogger } from '../lib/logger';
const log = createLogger('OnboardingTaskRoutes');


const router = Router();

// ─── GET /templates ───────────────────────────────────────────────────────────
router.get('/templates', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { category } = req.query;

    let query = `
      SELECT * FROM onboarding_task_templates
      WHERE is_active = true
        AND (workspace_id IS NULL OR workspace_id = $1)
    `;
    const params: any[] = [workspaceId || null];

    if (category && (category === 'officer' || category === 'client')) {
      query += ` AND category = $2`;
      params.push(category);
    }

    query += ` ORDER BY category, tier, sort_order`;

    const { rows } = await pool.query(query, params);
    return res.json({ templates: rows });
  } catch (err) {
    log.error('[OnboardingTasks] GET /templates error:', err);
    return res.status(500).json({ message: 'Failed to load templates' });
  }
});

// ─── GET /employee/:employeeId — task completion status for one employee ──────
router.get('/employee/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;

    // Get all templates applicable to this workspace
    const { rows: templates } = await pool.query(
      `SELECT * FROM onboarding_task_templates
       WHERE is_active = true AND category = 'officer'
         AND (workspace_id IS NULL OR workspace_id = $1)
       ORDER BY tier, sort_order`,
      [workspaceId]
    );

    // Get all completions for this employee
    const { rows: completions } = await pool.query(
      `SELECT * FROM employee_onboarding_completions
       WHERE employee_id = $1 AND workspace_id = $2`,
      [employeeId, workspaceId]
    );

    const completionMap = new Map(completions.map((c: any) => [c.task_template_id, c]));

    const tasks = templates.map((t: any) => ({
      ...t,
      completion: completionMap.get(t.id) || null,
      status: completionMap.get(t.id)?.status || 'pending',
    }));

    const tier1Tasks = tasks.filter((t: any) => t.tier === 1 && t.is_required);
    const tier1Complete = tier1Tasks.every((t: any) =>
      t.status === 'completed' || t.status === 'waived'
    );

    const byTier = {
      tier1: tasks.filter((t: any) => t.tier === 1),
      tier2: tasks.filter((t: any) => t.tier === 2),
      tier3: tasks.filter((t: any) => t.tier === 3),
    };

    const totalRequired = tasks.filter((t: any) => t.is_required).length;
    const totalCompleted = tasks.filter((t: any) =>
      t.is_required && (t.status === 'completed' || t.status === 'waived')
    ).length;

    return res.json({
      employeeId,
      tier1Blocked: !tier1Complete,
      progress: { total: totalRequired, completed: totalCompleted, pct: totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0 },
      byTier,
      tasks,
    });
  } catch (err) {
    log.error('[OnboardingTasks] GET /employee/:employeeId error:', err);
    return res.status(500).json({ message: 'Failed to load employee tasks' });
  }
});

// ─── POST /employee/:employeeId/complete/:taskId ───────────────────────────────
router.post('/employee/:employeeId/complete/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId, taskId } = req.params;
    const { notes } = req.body;

    await pool.query(
      `INSERT INTO employee_onboarding_completions
         (employee_id, workspace_id, task_template_id, status, completed_at, notes, updated_at)
       VALUES ($1, $2, $3, 'completed', now(), $4, now())
       ON CONFLICT (employee_id, task_template_id)
         DO UPDATE SET status = 'completed', completed_at = now(), notes = $4, updated_at = now()`,
      [employeeId, workspaceId, taskId, notes || null]
    );

    return res.json({ success: true, message: 'Task marked as complete' });
  } catch (err: any) {
    // Handle missing unique constraint gracefully
    if (err?.code === '42P10' || err?.message?.includes('ON CONFLICT')) {
      // No unique constraint — use upsert via select+insert/update
      try {
        const workspaceId = req.workspaceId;
        const { employeeId, taskId } = req.params;
        const { notes } = req.body;
        const { rows } = await pool.query(
          `SELECT id FROM employee_onboarding_completions WHERE employee_id=$1 AND task_template_id=$2`,
          [employeeId, taskId]
        );
        if (rows.length > 0) {
          await pool.query(
            `UPDATE employee_onboarding_completions SET status='completed', completed_at=now(), notes=$3, updated_at=now() WHERE id=$1`,
            [rows[0].id, taskId, notes || null]
          );
        } else {
          await pool.query(
            `INSERT INTO employee_onboarding_completions (employee_id, workspace_id, task_template_id, status, completed_at, notes) VALUES ($1,$2,$3,'completed',now(),$4)`,
            [employeeId, workspaceId, taskId, notes || null]
          );
        }
        return res.json({ success: true });
      } catch (e2) {
        return res.status(500).json({ message: 'Failed to complete task' });
      }
    }
    log.error('[OnboardingTasks] POST /complete error:', err);
    return res.status(500).json({ message: 'Failed to complete task' });
  }
});

// ─── POST /employee/:employeeId/waive/:taskId ──────────────────────────────────
const waiveSchema = z.object({ reason: z.string().min(1) });

router.post('/employee/:employeeId/waive/:taskId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId, taskId } = req.params;
    const parsed = waiveSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Reason is required for waiving a task' });

    const { reason } = parsed.data;
    const waivedBy = req.user?.id;

    const { rows } = await pool.query(
      `SELECT id FROM employee_onboarding_completions WHERE employee_id=$1 AND task_template_id=$2`,
      [employeeId, taskId]
    );
    if (rows.length > 0) {
      await pool.query(
        `UPDATE employee_onboarding_completions SET status='waived', waived_by=$1, waived_reason=$2, updated_at=now() WHERE id=$3`,
        [waivedBy, reason, rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO employee_onboarding_completions (employee_id, workspace_id, task_template_id, status, waived_by, waived_reason) VALUES ($1,$2,$3,'waived',$4,$5)`,
        [employeeId, workspaceId, taskId, waivedBy, reason]
      );
    }

    return res.json({ success: true, message: 'Task waived' });
  } catch (err) {
    log.error('[OnboardingTasks] POST /waive error:', err);
    return res.status(500).json({ message: 'Failed to waive task' });
  }
});

// ─── GET /manager — overdue officers sorted by days blocked ───────────────────
router.get('/manager', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ message: 'Workspace required' });

    const { rows } = await pool.query(
      `WITH tier1_templates AS (
         SELECT id, title
         FROM onboarding_task_templates
         WHERE tier = 1 AND is_required = true AND is_active = true
           AND (workspace_id IS NULL OR workspace_id = $1)
       ),
       emp_tier1 AS (
         SELECT
           e.id AS employee_id,
           e.first_name,
           e.last_name,
           e.hire_date,
           e.status AS employee_status,
           COUNT(tt.id) AS total_tier1,
           COUNT(c.id) FILTER (WHERE c.status IN ('completed','waived')) AS completed_tier1
         FROM employees e
         CROSS JOIN tier1_templates tt
         LEFT JOIN employee_onboarding_completions c
           ON c.employee_id = e.id AND c.task_template_id = tt.id
         WHERE e.workspace_id = $1
           AND e.status NOT IN ('terminated','inactive')
         GROUP BY e.id, e.first_name, e.last_name, e.hire_date, e.status
       )
       SELECT
         employee_id,
         first_name,
         last_name,
         hire_date,
         employee_status,
         total_tier1,
         completed_tier1,
         total_tier1 - completed_tier1 AS pending_tier1,
         EXTRACT(EPOCH FROM (now() - hire_date)) / 86400 AS days_since_hire
       FROM emp_tier1
       WHERE completed_tier1 < total_tier1
       ORDER BY hire_date ASC
       LIMIT 100`,
      [workspaceId]
    );

    return res.json({ overdueOfficers: rows });
  } catch (err) {
    log.error('[OnboardingTasks] GET /manager error:', err);
    return res.status(500).json({ message: 'Failed to load manager view' });
  }
});

// ─── POST /provision/:employeeId — create pending tasks for a new employee ────
router.post('/provision/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;
    const { category = 'officer' } = req.body;

    // Get templates
    const { rows: templates } = await pool.query(
      `SELECT * FROM onboarding_task_templates
       WHERE is_active = true AND category = $1
         AND (workspace_id IS NULL OR workspace_id = $2)`,
      [category, workspaceId]
    );

    // Get employee hire date (workspace_id enforced for tenant isolation per TRINITY.md §1)
    const { rows: empRows } = await pool.query(
      `SELECT hire_date FROM employees WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [employeeId, workspaceId]
    );
    const hireDate = empRows[0]?.hire_date ? new Date(empRows[0].hire_date) : new Date();

    let provisioned = 0;
    for (const t of templates) {
      const { rows: existing } = await pool.query(
        `SELECT id FROM employee_onboarding_completions WHERE employee_id=$1 AND task_template_id=$2`,
        [employeeId, t.id]
      );
      if (existing.length === 0) {
        const dueDate = new Date(hireDate);
        dueDate.setDate(dueDate.getDate() + (t.due_by_days || 1));
        await pool.query(
          `INSERT INTO employee_onboarding_completions
             (employee_id, workspace_id, task_template_id, status, due_date)
           VALUES ($1, $2, $3, 'pending', $4)`,
          [employeeId, workspaceId, t.id, dueDate]
        );
        provisioned++;
      }
    }

    return res.json({ success: true, provisioned, total: templates.length });
  } catch (err) {
    log.error('[OnboardingTasks] POST /provision error:', err);
    return res.status(500).json({ message: 'Failed to provision tasks' });
  }
});

// ─── GET /tier1-blocked/:employeeId — quick check for clock-in gate ───────────
router.get('/tier1-blocked/:employeeId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;

    const { rows: tier1Templates } = await pool.query(
      `SELECT id FROM onboarding_task_templates
       WHERE tier = 1 AND is_required = true AND is_active = true
         AND (workspace_id IS NULL OR workspace_id = $1)`,
      [workspaceId]
    );

    if (tier1Templates.length === 0) {
      return res.json({ blocked: false, reason: null });
    }

    const templateIds = tier1Templates.map((t: any) => t.id);
    const { rows: completions } = await pool.query(
      `SELECT task_template_id FROM employee_onboarding_completions
       WHERE employee_id = $1 AND status IN ('completed','waived')
         AND task_template_id = ANY($2)`,
      [employeeId, templateIds]
    );

    const completedIds = new Set(completions.map((c: any) => c.task_template_id));
    const blocked = tier1Templates.some((t: any) => !completedIds.has(t.id));

    return res.json({
      blocked,
      reason: blocked ? 'Tier 1 onboarding tasks must be completed before clocking in' : null,
      pendingCount: tier1Templates.filter((t: any) => !completedIds.has(t.id)).length,
    });
  } catch (err) {
    log.error('[OnboardingTasks] GET /tier1-blocked error:', err);
    // Non-fatal — don't block clock-in if check fails
    return res.json({ blocked: false, reason: null });
  }
});

export default router;
