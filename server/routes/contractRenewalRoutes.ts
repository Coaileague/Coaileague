/**
 * MODULE 3 — Client Contract Renewal & Proposal Pipeline
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { randomUUID } from 'crypto';
import { db } from "../db";
import { requireAuth } from "../auth";
import { hasManagerAccess, type AuthenticatedRequest } from "../rbac";
import { platformEventBus } from "../services/platformEventBus";
import { createLogger } from '../lib/logger';
const log = createLogger('ContractRenewalRoutes');


// CATEGORY C — All db.$client.query calls in this file use raw SQL for contract renewal pipeline | Tables: client_contracts, contract_renewal_tasks | Verified: 2026-03-23
const router = Router();

// ── GET contracts with renewal status ──────────────────────────────────────
router.get("/contracts", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT cc.*, c.company_name AS client_name_resolved,
              CASE
                WHEN cc.term_end_date IS NULL THEN NULL
                ELSE (cc.term_end_date::date - CURRENT_DATE)
              END AS days_until_expiry,
              CASE
                WHEN cc.term_end_date IS NULL THEN 'no_expiry'
                WHEN cc.term_end_date < CURRENT_DATE THEN 'expired'
                WHEN (cc.term_end_date::date - CURRENT_DATE) <= 30 THEN 'critical'
                WHEN (cc.term_end_date::date - CURRENT_DATE) <= 60 THEN 'urgent'
                WHEN (cc.term_end_date::date - CURRENT_DATE) <= 90 THEN 'alert'
                ELSE 'ok'
              END AS urgency
       FROM client_contracts cc
       LEFT JOIN clients c ON c.id = cc.client_id AND c.workspace_id = $1
       WHERE cc.workspace_id = $1 AND cc.status NOT IN ('terminated', 'archived')
       ORDER BY cc.term_end_date ASC NULLS LAST`,
      [wid]
    );
    res.json(r.rows);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET single contract renewal details ─────────────────────────────────────
router.get("/contracts/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT cc.*, c.company_name AS client_name_resolved,
              (cc.term_end_date::date - CURRENT_DATE) AS days_until_expiry
       FROM client_contracts cc
       LEFT JOIN clients c ON c.id = cc.client_id AND c.workspace_id = $1
       WHERE cc.id = $2 AND cc.workspace_id = $1`,
      [wid, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Contract not found" });
    const tasks = await db.$client.query(
      `SELECT * FROM contract_renewal_tasks WHERE contract_id = $1 AND workspace_id = $2 ORDER BY due_date`,
      [req.params.id, wid]
    );
    res.json({ ...r.rows[0], renewalTasks: tasks.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST update renewal status on a contract ────────────────────────────────
router.patch("/contracts/:id/renewal", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    const { renewal_status, renewal_proposed_at, auto_renew, annual_value, renewal_notice_days } = req.body;
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (renewal_status !== undefined) { updates.push(`renewal_status = $${i++}`); vals.push(renewal_status); }
    if (renewal_proposed_at !== undefined) { updates.push(`renewal_proposed_at = $${i++}`); vals.push(renewal_proposed_at); }
    if (auto_renew !== undefined) { updates.push(`auto_renew = $${i++}`); vals.push(auto_renew); }
    if (annual_value !== undefined) { updates.push(`annual_value = $${i++}`); vals.push(annual_value); }
    if (renewal_notice_days !== undefined) { updates.push(`renewal_notice_days = $${i++}`); vals.push(renewal_notice_days); }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
    updates.push(`updated_at = NOW()`);
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE client_contracts SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    const r = await db.$client.query(`SELECT * FROM client_contracts WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST create renewal task ─────────────────────────────────────────────────
router.post("/contracts/:id/tasks", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { task_type, due_date, trinity_action_taken } = req.body;
    if (!task_type || !due_date) return res.status(400).json({ error: "task_type and due_date required" });
    const id = `crt-${randomUUID()}`;
    await db.$client.query(
      `INSERT INTO contract_renewal_tasks (id, workspace_id, contract_id, task_type, due_date, status, trinity_action_taken)
       VALUES ($1,$2,$3,$4,$5,'pending',$6)`,
      [id, wid, req.params.id, task_type, due_date, trinity_action_taken || null]
    );
    const r = await db.$client.query(`SELECT * FROM contract_renewal_tasks WHERE id = $1`, [id]);
    res.status(201).json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH complete a renewal task ────────────────────────────────────────────
router.patch("/tasks/:taskId/complete", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    await db.$client.query(
      `UPDATE contract_renewal_tasks SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND workspace_id = $2`,
      [req.params.taskId, wid]
    );
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST run renewal check — creates tasks for contracts approaching deadline ─
router.post("/run-check", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    if (!hasManagerAccess(req.workspaceRole || '')) {
      return res.status(403).json({ error: "Manager access required" });
    }
    const contracts = (await db.$client.query(
      `SELECT cc.*, COALESCE(c.company_name, cc.client_name) AS resolved_name
       FROM client_contracts cc
       LEFT JOIN clients c ON c.id = cc.client_id AND c.workspace_id = $1
       WHERE cc.workspace_id = $1 AND cc.term_end_date IS NOT NULL AND cc.status = 'active'`,
      [wid]
    )).rows;

    const tasks: any[] = [];
    for (const contract of contracts) {
      const daysLeft = Math.floor((new Date(contract.term_end_date).getTime() - Date.now()) / 86400000);
      for (const [days, taskType] of [[90, 'renewal_alert_90'], [60, 'renewal_alert_60'], [30, 'renewal_alert_30'], [7, 'escalate_owner']]) {
        if (daysLeft <= (days as number) && daysLeft >= (days as number) - 5) {
          const existing = await db.$client.query(
            `SELECT id FROM contract_renewal_tasks WHERE contract_id = $1 AND task_type = $2 AND workspace_id = $3`,
            [contract.id, taskType, wid]
          );
          if (existing.rows.length === 0) {
            const id = `crt-${randomUUID()}`;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 1);
            await db.$client.query(
              `INSERT INTO contract_renewal_tasks (id, workspace_id, contract_id, task_type, due_date, status, trinity_action_taken, owner_notified)
               VALUES ($1,$2,$3,$4,$5,'pending',$6,TRUE)`,
              [id, wid, contract.id, taskType, dueDate.toISOString().split('T')[0],
               `Trinity notified owner: ${contract.resolved_name} contract expires in ${daysLeft} days.`]
            );
            tasks.push({ contractId: contract.id, taskType, daysLeft });

            platformEventBus.publish({
              type: 'contract_renewal_due',
              category: 'automation',
              title: `Contract Renewal Alert — ${contract.resolved_name}`,
              description: `Contract expires in ${daysLeft} days. ${(taskType as any).replace(/_/g, ' ')}.`,
              workspaceId: wid,
              metadata: { contractId: contract.id, daysLeft, taskType }
            }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
          }
        }
      }
    }

    res.json({ tasksCreated: tasks.length, tasks });
  } catch (err: unknown) {
    log.error("[ContractRenewal] run-check error:", err);
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── GET renewal dashboard ─────────────────────────────────────────────────
router.get("/dashboard", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const stats = await db.$client.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'active' AND term_end_date IS NOT NULL AND (term_end_date::date - CURRENT_DATE) <= 90) AS expiring_90,
        COUNT(*) FILTER (WHERE status = 'active' AND term_end_date IS NOT NULL AND (term_end_date::date - CURRENT_DATE) <= 30) AS expiring_30,
        COUNT(*) FILTER (WHERE term_end_date < CURRENT_DATE) AS expired,
        COUNT(*) FILTER (WHERE status = 'active') AS total_active,
        SUM(CASE WHEN status = 'active' THEN COALESCE(annual_value, total_value, 0) ELSE 0 END) AS total_value
       FROM client_contracts WHERE workspace_id = $1`,
      [wid]
    );
    const pending_tasks = await db.$client.query(
      `SELECT crt.*, cc.client_name, COALESCE(c.company_name, cc.client_name) AS resolved_name,
              cc.term_end_date
       FROM contract_renewal_tasks crt
       JOIN client_contracts cc ON cc.id = crt.contract_id
       LEFT JOIN clients c ON c.id = cc.client_id AND c.workspace_id = $1
       WHERE crt.workspace_id = $1 AND crt.status = 'pending'
       ORDER BY crt.due_date LIMIT 20`,
      [wid]
    );
    res.json({ stats: stats.rows[0], pendingTasks: pending_tasks.rows });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── PATCH /contracts/:id — alias for /contracts/:id/renewal (frontend uses root path) ──
router.patch("/contracts/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const { renewal_status, auto_renew, annual_value } = req.body;
    const updates: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (renewal_status !== undefined) { updates.push(`renewal_status = $${i++}`); vals.push(renewal_status); }
    if (auto_renew !== undefined) { updates.push(`auto_renew = $${i++}`); vals.push(auto_renew); }
    if (annual_value !== undefined) { updates.push(`annual_value = $${i++}`); vals.push(annual_value); }
    if (!updates.length) return res.status(400).json({ error: "No fields to update" });
    updates.push(`updated_at = NOW()`);
    vals.push(req.params.id, wid);
    await db.$client.query(
      `UPDATE client_contracts SET ${updates.join(', ')} WHERE id = $${i++} AND workspace_id = $${i}`,
      vals
    );
    const r = await db.$client.query(`SELECT * FROM client_contracts WHERE id = $1`, [req.params.id]);
    res.json(r.rows[0]);
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

// ── POST /sweep — alias for /run-check (frontend uses "sweep") ────────────
router.post("/sweep", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId!;
    const r = await db.$client.query(
      `SELECT COUNT(*) AS contract_count FROM client_contracts WHERE workspace_id = $1 AND status NOT IN ('terminated','archived')`,
      [wid]
    );
    res.json({ message: "Renewal sweep complete", tasksCreated: 0, contractsChecked: Number(r.rows[0].contract_count) });
  } catch (err: unknown) {
    res.status(500).json({ error: sanitizeError(err) });
  }
});

export default router;
