/**
 * Phase 35F — Shift Trading Marketplace & Officer Availability
 * Routes: /api/shift-trading/*
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { pool } from "../db";
import { platformActionHub } from "../services/helpai/platformActionHub";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";
import { createNotification } from "../services/notificationService";

const router = Router();

const MIN_REST_HOURS = 8;

// ── OFFICER AVAILABILITY ────────────────────────────────────────────────────

router.get("/availability", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { officerId } = req.query as any;
    const uid = req.user?.id;

    // Officers can see own availability; managers see all
    const { rows: emp } = await pool.query(
      `SELECT id FROM employees WHERE workspace_id=$1 AND user_id=$2`, [wid, uid]
    );
    const isManagerOrAbove = req.user?.role && ["owner","co_owner","org_admin","manager"].includes(req.user.role);

    const targetOfficerId = officerId || (emp[0]?.id ?? null);

    let q = `SELECT * FROM officer_availability WHERE workspace_id=$1`;
    const params: any[] = [wid];
    let p = 2;
    if (!isManagerOrAbove && emp[0]) {
      q += ` AND officer_id=$${p++}`; params.push(emp[0].id);
    } else if (officerId) {
      q += ` AND officer_id=$${p++}`; params.push(officerId);
    }
    q += ` ORDER BY officer_id, day_of_week, start_time`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/availability", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { officerId, dayOfWeek, startTime, endTime, isAvailable, effectiveFrom, effectiveUntil } = req.body;

    if (dayOfWeek === undefined || !startTime || !endTime)
      return res.status(400).json({ error: "dayOfWeek, startTime, endTime required" });

    // Resolve officer id — use param if manager, else own
    const isManagerOrAbove = req.user?.role && ["owner","co_owner","org_admin","manager"].includes(req.user.role);
    let targetOfficerId = officerId;
    if (!isManagerOrAbove || !officerId) {
      const { rows: emp } = await pool.query(
        `SELECT id FROM employees WHERE workspace_id=$1 AND user_id=$2`, [wid, uid]
      );
      if (!emp[0]) return res.status(403).json({ error: "No employee record found" });
      targetOfficerId = emp[0].id;
    }

    const { rows } = await pool.query(
      `INSERT INTO officer_availability (workspace_id, officer_id, day_of_week, start_time, end_time,
        is_available, effective_from, effective_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [wid, targetOfficerId, dayOfWeek, startTime, endTime, isAvailable !== false,
       effectiveFrom || null, effectiveUntil || null]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.put("/availability/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { dayOfWeek, startTime, endTime, isAvailable, effectiveFrom, effectiveUntil } = req.body;

    const setClauses: string[] = [];
    const params: any[] = [];
    let p = 1;
    if (dayOfWeek !== undefined) { setClauses.push(`day_of_week=$${p++}`); params.push(dayOfWeek); }
    if (startTime) { setClauses.push(`start_time=$${p++}`); params.push(startTime); }
    if (endTime) { setClauses.push(`end_time=$${p++}`); params.push(endTime); }
    if (isAvailable !== undefined) { setClauses.push(`is_available=$${p++}`); params.push(isAvailable); }
    if (effectiveFrom !== undefined) { setClauses.push(`effective_from=$${p++}`); params.push(effectiveFrom); }
    if (effectiveUntil !== undefined) { setClauses.push(`effective_until=$${p++}`); params.push(effectiveUntil); }
    if (setClauses.length === 0) return res.status(400).json({ error: "No fields to update" });
    setClauses.push(`updated_at=NOW()`);
    params.push(req.params.id, wid);

    const { rows } = await pool.query(
      `UPDATE officer_availability SET ${setClauses.join(",")} WHERE id=$${p} AND workspace_id=$${p+1} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: "Availability record not found" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.delete("/availability/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rowCount } = await pool.query(
      `DELETE FROM officer_availability WHERE id=$1 AND workspace_id=$2`, [req.params.id, wid]
    );
    if (!rowCount) return res.status(404).json({ error: "Availability record not found" });
    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── SHIFT TRADE REQUESTS ────────────────────────────────────────────────────

router.get("/trades", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { status, mine } = req.query as any;
    const isManagerOrAbove = req.user?.role && ["owner","co_owner","org_admin","manager"].includes(req.user.role);

    let q = `SELECT t.*,
      req_emp.first_name AS requester_first_name, req_emp.last_name AS requester_last_name,
      tgt_emp.first_name AS target_first_name, tgt_emp.last_name AS target_last_name
     FROM shift_trade_requests t
     LEFT JOIN employees req_emp ON req_emp.id = t.requesting_officer_id
     LEFT JOIN employees tgt_emp ON tgt_emp.id = t.target_officer_id
     WHERE t.workspace_id=$1`;
    const params: any[] = [wid];
    let p = 2;
    if (status) { q += ` AND t.status=$${p++}`; params.push(status); }
    if (mine === "true" || !isManagerOrAbove) {
      const { rows: emp } = await pool.query(`SELECT id FROM employees WHERE workspace_id=$1 AND user_id=$2`, [wid, uid]);
      if (emp[0]) { q += ` AND (t.requesting_officer_id=$${p} OR t.target_officer_id=$${p})`; params.push(emp[0].id); p++; }
    }
    q += ` ORDER BY t.created_at DESC LIMIT 100`;
    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/trades", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { requestedShiftId, offeredShiftId, targetOfficerId, reason, expiresAt } = req.body;
    if (!requestedShiftId) return res.status(400).json({ error: "requestedShiftId required" });

    // Get officer id
    const { rows: emp } = await pool.query(`SELECT id, first_name FROM employees WHERE workspace_id=$1 AND user_id=$2`, [wid, uid]);
    if (!emp[0]) return res.status(403).json({ error: "No employee record found" });
    const officerId = emp[0].id;

    // Verify shift belongs to workspace
    const shiftCheck = await pool.query(`SELECT * FROM shifts WHERE id=$1 AND workspace_id=$2`, [requestedShiftId, wid]);
    if (!shiftCheck.rows[0]) return res.status(404).json({ error: "Shift not found" });

    const { rows } = await pool.query(
      `INSERT INTO shift_trade_requests (workspace_id, requesting_officer_id, requested_shift_id,
        offered_shift_id, target_officer_id, reason, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [wid, officerId, requestedShiftId, offeredShiftId || null, targetOfficerId || null,
       reason || null, expiresAt || null]
    );

    // Notify target officer if specified, otherwise notify managers
    if (targetOfficerId) {
      const targetUser = await pool.query(`SELECT user_id FROM employees WHERE id=$1`, [targetOfficerId]);
      if (targetUser.rows[0]?.user_id) {
        await createNotification({
          userId: targetUser.rows[0].user_id,
          workspaceId: wid,
          title: "Shift Trade Request",
          message: `${emp[0].first_name || "A colleague"} wants to trade a shift with you.`,
          type: "shift_trade",
          actionUrl: `/shift-trading?tab=received`,
        }).catch(() => null);
      }
    } else {
      // Open marketplace — notify managers
      const managers = await pool.query(
        `SELECT u.id FROM users u WHERE u.workspace_id=$1 AND u.role IN ('owner','co_owner','org_admin','manager') LIMIT 10`,
        [wid]
      );
      for (const m of managers.rows) {
        await createNotification({
          userId: m.id, workspaceId: wid,
          title: "Open Shift Trade",
          message: `An officer posted a shift for trading on the marketplace.`,
          type: "shift_trade", actionUrl: `/shift-trading`,
        }).catch(() => null);
      }
    }
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/trades/:id/accept", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });

    const { rows: emp } = await pool.query(`SELECT id FROM employees WHERE workspace_id=$1 AND user_id=$2`, [wid, uid]);
    if (!emp[0]) return res.status(403).json({ error: "No employee record found" });

    const { rows } = await pool.query(
      `UPDATE shift_trade_requests SET status='accepted', target_officer_id=$1, updated_at=NOW()
       WHERE id=$2 AND workspace_id=$3 AND status='pending'
         AND (target_officer_id IS NULL OR target_officer_id=$1) RETURNING *`,
      [emp[0].id, req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Trade request not found or not pending" });

    // Notify requester
    const requester = await pool.query(`SELECT user_id FROM employees WHERE id=$1`, [rows[0].requesting_officer_id]);
    if (requester.rows[0]?.user_id) {
      await createNotification({
        userId: requester.rows[0].user_id, workspaceId: wid,
        title: "Shift Trade Accepted",
        message: "Your shift trade request has been accepted. Awaiting manager approval.",
        type: "shift_trade", actionUrl: `/shift-trading`,
      }).catch(() => null);
    }
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/trades/:id/reject", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `UPDATE shift_trade_requests SET status='rejected', updated_at=NOW()
       WHERE id=$1 AND workspace_id=$2 AND status='pending' RETURNING *`,
      [req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Trade request not found" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/trades/:id/manager-approve", requireManager, async (req: AuthenticatedRequest, res) => {
  const client = await pool.connect();
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { note } = req.body;

    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE shift_trade_requests SET status='manager_approved', manager_id=$1,
        manager_note=$2, updated_at=NOW()
       WHERE id=$3 AND workspace_id=$4 AND status='accepted' RETURNING *`,
      [uid, note || null, req.params.id, wid]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Trade request not found or not accepted yet" });
    }

    const trade = rows[0];

    // ── Rest Period Enforcement (minimum 8 hours between consecutive shifts) ──
    // Check that swapping won't violate rest periods for either officer
    const shiftIds = [trade.requested_shift_id, trade.offered_shift_id].filter(Boolean);
    for (const shiftId of shiftIds) {
      const shiftRes = await client.query(
        `SELECT start_time, end_time, employee_id FROM shifts WHERE id=$1`, [shiftId]
      );
      if (!shiftRes.rows[0]) continue;
      const { start_time, end_time, employee_id } = shiftRes.rows[0];
      if (!start_time || !end_time) continue;

      // The new officer for this shift (after the swap)
      const newOfficerEmpId = shiftId === trade.requested_shift_id
        ? trade.target_officer_id
        : trade.requesting_officer_id;

      if (!newOfficerEmpId) continue;

      // Check if new officer has an adjacent shift within MIN_REST_HOURS
      const conflictRes = await client.query(
        `SELECT id, start_time, end_time FROM shifts
         WHERE workspace_id=$1 AND employee_id=$2
           AND id != $3
           AND (
             (start_time >= $4 - INTERVAL '${MIN_REST_HOURS} hours' AND start_time <= $5)
             OR (end_time >= $4 AND end_time <= $5 + INTERVAL '${MIN_REST_HOURS} hours')
           )
         LIMIT 1`,
        [wid, newOfficerEmpId, shiftId, start_time, end_time]
      );

      if (conflictRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: `Rest period violation: officer would have less than ${MIN_REST_HOURS} hours between shifts. Trade cannot be approved.`,
          conflictingShiftId: conflictRes.rows[0].id,
        });
      }
    }

    // Swap shifts between officers
    if (trade.offered_shift_id) {
      await client.query(
        `UPDATE shifts SET employee_id=$1 WHERE id=$2 AND workspace_id=$3`,
        [trade.target_officer_id, trade.requested_shift_id, wid]
      );
      await client.query(
        `UPDATE shifts SET employee_id=$1 WHERE id=$2 AND workspace_id=$3`,
        [trade.requesting_officer_id, trade.offered_shift_id, wid]
      );
    } else {
      // One-way: just reassign the requested shift
      await client.query(
        `UPDATE shifts SET employee_id=$1 WHERE id=$2 AND workspace_id=$3`,
        [trade.target_officer_id, trade.requested_shift_id, wid]
      );
    }

    await client.query('COMMIT');

    // Webhook Emission AFTER COMMIT
    try {
      const { deliverWebhookEvent } = await import('../services/webhookDeliveryService');
      if (trade.offered_shift_id) {
        deliverWebhookEvent(wid, 'shift.assigned', {
          shiftId: trade.requested_shift_id,
          officerId: trade.target_officer_id,
          tradeId: trade.id,
          reason: 'trade_approval'
        });
        deliverWebhookEvent(wid, 'shift.assigned', {
          shiftId: trade.offered_shift_id,
          officerId: trade.requesting_officer_id,
          tradeId: trade.id,
          reason: 'trade_approval'
        });
      } else {
        deliverWebhookEvent(wid, 'shift.assigned', {
          shiftId: trade.requested_shift_id,
          officerId: trade.target_officer_id,
          tradeId: trade.id,
          reason: 'trade_approval'
        });
      }
    } catch (webhookErr: any) {
      log.warn('[ShiftTrading] Failed to log webhook error to audit log', { error: webhookErr.message });
    }

    // Notify both parties
    for (const empId of [trade.requesting_officer_id, trade.target_officer_id].filter(Boolean)) {
      const userRes = await client.query(`SELECT user_id FROM employees WHERE id=$1`, [empId]);
      if (userRes.rows[0]?.user_id) {
        await createNotification({
          userId: userRes.rows[0].user_id, workspaceId: wid,
          title: "Shift Trade Approved",
          message: "Your shift trade has been approved. Check your updated schedule.",
          type: "shift_trade", actionUrl: `/schedule`,
        }).catch(() => null);
      }
    }
    res.json(rows[0]);
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: sanitizeError(err) });
  } finally {
    client.release();
  }
});

router.post("/trades/:id/manager-reject", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    const uid = req.user?.id;
    if (!wid || !uid) return res.status(400).json({ error: "Auth required" });
    const { note } = req.body;
    const { rows } = await pool.query(
      `UPDATE shift_trade_requests SET status='manager_rejected', manager_id=$1,
        manager_note=$2, updated_at=NOW()
       WHERE id=$3 AND workspace_id=$4 AND status IN ('pending','accepted') RETURNING *`,
      [uid, note || null, req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Trade request not found" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── MARKETPLACE ─────────────────────────────────────────────────────────────

router.get("/marketplace", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    // Open trades (no target officer specified) still pending
    const { rows } = await pool.query(
      `SELECT t.*,
        e.first_name AS requester_first_name, e.last_name AS requester_last_name,
        s.start_time, s.end_time, s.title AS site_name
       FROM shift_trade_requests t
       LEFT JOIN employees e ON e.id = t.requesting_officer_id
       LEFT JOIN shifts s ON s.id = t.requested_shift_id
       WHERE t.workspace_id=$1 AND t.status='pending' AND t.target_officer_id IS NULL
         AND (t.expires_at IS NULL OR t.expires_at > NOW())
       ORDER BY t.created_at DESC`,
      [wid]
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── TRINITY ACTIONS ─────────────────────────────────────────────────────────

export function registerShiftTradingActions(): void {
  platformActionHub.registerAction({
    actionId: "schedule.check_availability",
    name: "Check Officer Availability",
    category: "scheduling",
    description: "Check officer availability for a given day or time range.",
    requiredRoles: ["owner","co_owner","org_admin","manager"],
    inputSchema: { type: 'object', properties: { dayOfWeek: { type: 'integer', description: 'Day of week 0=Sunday 6=Saturday; omit for all days' }, officerId: { type: 'string', description: 'Optional officer ID to check a specific officer' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { dayOfWeek } = payload || {};
      const q = dayOfWeek !== undefined
        ? `SELECT officer_id, day_of_week, start_time, end_time FROM officer_availability WHERE workspace_id=$1 AND day_of_week=$2 AND is_available=true ORDER BY start_time`
        : `SELECT officer_id, day_of_week, start_time, end_time FROM officer_availability WHERE workspace_id=$1 AND is_available=true ORDER BY day_of_week, start_time`;
      const params = dayOfWeek !== undefined ? [workspaceId, dayOfWeek] : [workspaceId];
      const { rows } = await pool.query(q, params);
      return { success: true, actionId: request.actionId, message: `${rows.length} availability records found`, data: { availability: rows } };
    },
  });

  platformActionHub.registerAction({
    actionId: "schedule.trade_marketplace",
    name: "View Shift Trade Marketplace",
    category: "scheduling",
    description: "List open shift trade requests on the marketplace.",
    requiredRoles: ["owner","co_owner","org_admin","manager","supervisor"],
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'Max trades to return', default: 20 } } },
    handler: async (request) => {
      const { workspaceId } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT t.id, t.requested_shift_id, t.reason, t.created_at,
          e.first_name, e.last_name, s.start_time, s.end_time, s.title AS site_name
         FROM shift_trade_requests t
         LEFT JOIN employees e ON e.id=t.requesting_officer_id
         LEFT JOIN shifts s ON s.id=t.requested_shift_id
         WHERE t.workspace_id=$1 AND t.status='pending' AND t.target_officer_id IS NULL
           AND (t.expires_at IS NULL OR t.expires_at > NOW())
         ORDER BY t.created_at DESC LIMIT 20`,
        [workspaceId]
      );
      return { success: true, actionId: request.actionId, message: `${rows.length} open trades`, data: { trades: rows } };
    },
  });

  platformActionHub.registerAction({
    actionId: "schedule.pending_trades",
    name: "Pending Trade Approvals",
    category: "scheduling",
    description: "Show manager all pending trade approvals.",
    requiredRoles: ["owner","co_owner","org_admin","manager"],
    inputSchema: { type: 'object', properties: {} },
    handler: async (request) => {
      const { workspaceId } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT t.id, t.status, t.created_at,
          req.first_name AS req_first, req.last_name AS req_last,
          tgt.first_name AS tgt_first, tgt.last_name AS tgt_last
         FROM shift_trade_requests t
         LEFT JOIN employees req ON req.id=t.requesting_officer_id
         LEFT JOIN employees tgt ON tgt.id=t.target_officer_id
         WHERE t.workspace_id=$1 AND t.status IN ('pending','accepted')
         ORDER BY t.created_at DESC LIMIT 20`,
        [workspaceId]
      );
      return { success: true, actionId: request.actionId, message: `${rows.length} trades need attention`, data: { trades: rows } };
    },
  });
}

export default router;
