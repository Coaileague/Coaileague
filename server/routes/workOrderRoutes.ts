/**
 * Phase 35D — Work Order Management
 * Routes: /api/work-orders/*
 */
import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { pool } from "../db";
import { platformActionHub } from "../services/helpai/platformActionHub";
import { requireAuth, requireManager, type AuthenticatedRequest } from "../rbac";

const router = Router();

const VALID_STATUSES = ["draft","pending_assignment","active","completed","cancelled","billed"];
const VALID_TYPES = ["special_assignment","escort","investigation","event_security","emergency_deployment","other"];

// ── LIST ────────────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { status, client_id, type, limit = 50, offset = 0 } = req.query as any;

    const conditions = ["workspace_id = $1"];
    const params: any[] = [wid];
    let p = 2;
    if (status) { conditions.push(`status = $${p++}`); params.push(status); }
    if (client_id) { conditions.push(`client_id = $${p++}`); params.push(client_id); }
    if (type) { conditions.push(`work_order_type = $${p++}`); params.push(type); }

    const where = conditions.join(" AND ");
    const { rows } = await pool.query(
      `SELECT * FROM work_orders WHERE ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p+1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    const countRes = await pool.query(`SELECT COUNT(*) FROM work_orders WHERE ${where}`, params);
    res.json({ workOrders: rows, total: parseInt(countRes.rows[0].count) });
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── GET ONE ─────────────────────────────────────────────────────────────────

router.get("/:id", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `SELECT * FROM work_orders WHERE id=$1 AND workspace_id=$2`,
      [req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Work order not found" });

    // Include evidence
    const { rows: evidence } = await pool.query(
      `SELECT * FROM work_order_evidence WHERE work_order_id=$1 ORDER BY captured_at DESC`,
      [req.params.id]
    );
    res.json({ ...rows[0], evidence });
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── CREATE ──────────────────────────────────────────────────────────────────

router.post("/", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const {
      title, clientId, workOrderType, description, location,
      requiredCertifications, estimatedHours, billingRate,
      assignedOfficerIds, scheduledStart, scheduledEnd
    } = req.body;
    if (!title) return res.status(400).json({ error: "title required" });
    if (workOrderType && !VALID_TYPES.includes(workOrderType))
      return res.status(400).json({ error: `Invalid work_order_type. Valid: ${VALID_TYPES.join(", ")}` });

    const { rows } = await pool.query(
      `INSERT INTO work_orders (workspace_id, client_id, title, work_order_type, status, description, location,
        required_certifications, estimated_hours, billing_rate, assigned_officer_ids,
        scheduled_start, scheduled_end, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [wid, clientId || null, title, workOrderType || "special_assignment", description || null,
       location || null, requiredCertifications || [], estimatedHours || null, billingRate || null,
       assignedOfficerIds || [], scheduledStart || null, scheduledEnd || null, req.user?.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── UPDATE ──────────────────────────────────────────────────────────────────

router.patch("/:id", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { id } = req.params;

    const existing = await pool.query(`SELECT * FROM work_orders WHERE id=$1 AND workspace_id=$2`, [id, wid]);
    if (!existing.rows[0]) return res.status(404).json({ error: "Work order not found" });

    const colMap: Record<string,string> = {
      title:"title", clientId:"client_id", workOrderType:"work_order_type", status:"status",
      description:"description", location:"location", requiredCertifications:"required_certifications",
      estimatedHours:"estimated_hours", actualHours:"actual_hours", billingRate:"billing_rate",
      billingAmount:"billing_amount", assignedOfficerIds:"assigned_officer_ids",
      scheduledStart:"scheduled_start", scheduledEnd:"scheduled_end",
      actualStart:"actual_start", actualEnd:"actual_end",
      clientSignedAt:"client_signed_at", clientSignedBy:"client_signed_by", invoiceId:"invoice_id",
    };

    const setClauses: string[] = [];
    const params: any[] = [];
    let p = 1;
    for (const [jsKey, col] of Object.entries(colMap)) {
      if (req.body[jsKey] !== undefined) {
        if (jsKey === "status" && !VALID_STATUSES.includes(req.body[jsKey]))
          return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(", ")}` });
        if (jsKey === "workOrderType" && !VALID_TYPES.includes(req.body[jsKey]))
          return res.status(400).json({ error: `Invalid work_order_type` });
        setClauses.push(`${col} = $${p++}`);
        params.push(req.body[jsKey]);
      }
    }
    if (setClauses.length === 0) return res.status(400).json({ error: "No fields to update" });

    // Auto-timestamp: merge actual_start/actual_end into the same UPDATE to keep it atomic
    if (req.body.status === "active" && !existing.rows[0].actual_start && req.body.actualStart === undefined) {
      setClauses.push(`actual_start = NOW()`);
    }
    if (req.body.status === "completed" && !existing.rows[0].actual_end && req.body.actualEnd === undefined) {
      setClauses.push(`actual_end = NOW()`);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id, wid);

    const { rows } = await pool.query(
      `UPDATE work_orders SET ${setClauses.join(",")} WHERE id=$${p} AND workspace_id=$${p+1} RETURNING *`,
      params
    );

    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── STATUS TRANSITIONS ──────────────────────────────────────────────────────

router.post("/:id/activate", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `UPDATE work_orders SET status='active', actual_start=NOW(), updated_at=NOW()
       WHERE id=$1 AND workspace_id=$2 AND status IN ('draft','pending_assignment') RETURNING *`,
      [req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Work order not found or not activatable" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/:id/complete", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { actualHours, clientSignedBy } = req.body;
    const { rows } = await pool.query(
      `UPDATE work_orders SET status='completed', actual_end=NOW(), updated_at=NOW(),
        actual_hours=COALESCE($3, actual_hours),
        client_signed_at=CASE WHEN $4 IS NOT NULL THEN NOW() ELSE client_signed_at END,
        client_signed_by=COALESCE($4, client_signed_by)
       WHERE id=$1 AND workspace_id=$2 AND status='active' RETURNING *`,
      [req.params.id, wid, actualHours || null, clientSignedBy || null]
    );
    if (!rows[0]) return res.status(404).json({ error: "Work order not found or not active" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── EVIDENCE ────────────────────────────────────────────────────────────────

router.get("/:id/evidence", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `SELECT * FROM work_order_evidence WHERE work_order_id=$1 AND workspace_id=$2 ORDER BY captured_at DESC`,
      [req.params.id, wid]
    );
    res.json(rows);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

router.post("/:id/evidence", requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { evidenceType, fileUrl, notes } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO work_order_evidence (work_order_id, workspace_id, evidence_type, file_url, notes, captured_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, wid, evidenceType || "note", fileUrl || null, notes || null, req.user?.id]
    );
    res.status(201).json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── ASSIGN OFFICERS ─────────────────────────────────────────────────────────

router.post("/:id/assign", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { officerIds } = req.body;
    if (!Array.isArray(officerIds)) return res.status(400).json({ error: "officerIds array required" });

    const { rows } = await pool.query(
      `UPDATE work_orders SET assigned_officer_ids=$1, status='pending_assignment', updated_at=NOW()
       WHERE id=$2 AND workspace_id=$3 RETURNING *`,
      [officerIds, req.params.id, wid]
    );
    if (!rows[0]) return res.status(404).json({ error: "Work order not found" });
    res.json(rows[0]);
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── ANALYTICS ───────────────────────────────────────────────────────────────

router.get("/analytics/summary", requireManager, async (req: AuthenticatedRequest, res) => {
  try {
    const wid = req.workspaceId;
    if (!wid) return res.status(400).json({ error: "Workspace required" });
    const { rows } = await pool.query(
      `SELECT
        status,
        work_order_type,
        COUNT(*) AS count,
        COALESCE(SUM(billing_amount),0) AS total_billed,
        COALESCE(AVG(actual_hours),0) AS avg_hours
       FROM work_orders WHERE workspace_id=$1 GROUP BY status, work_order_type`,
      [wid]
    );
    const totalRes = await pool.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status='completed') AS completed,
              COALESCE(SUM(billing_amount) FILTER (WHERE status='billed'),0) AS revenue
       FROM work_orders WHERE workspace_id=$1`, [wid]
    );
    res.json({ breakdown: rows, ...totalRes.rows[0] });
  } catch (err: any) { res.status(500).json({ error: sanitizeError(err) }); }
});

// ── TRINITY ACTIONS ─────────────────────────────────────────────────────────

export function registerWorkOrderActions(): void {
  platformActionHub.registerAction({
    actionId: "work_order.create",
    name: "Create Work Order",
    category: "operations",
    description: "Create a new work order from a service request.",
    requiredRoles: ["owner", "co_owner", "org_admin", "manager"],
    inputSchema: { type: 'object', required: ['title'], properties: { title: { type: 'string', description: 'Work order title' }, workOrderType: { type: 'string', description: 'Type: special_assignment, patrol, inspection, event_security, other' }, description: { type: 'string' }, scheduledStart: { type: 'string', format: 'date-time' }, scheduledEnd: { type: 'string', format: 'date-time' }, estimatedHours: { type: 'number' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { title, workOrderType, description, scheduledStart, scheduledEnd, estimatedHours } = payload || {};
      if (!title) return { success: false, actionId: request.actionId, message: "title required", data: null };
      const { rows } = await pool.query(
        `INSERT INTO work_orders (workspace_id,title,work_order_type,status,description,scheduled_start,scheduled_end,estimated_hours,created_by)
         VALUES ($1,$2,$3,'draft',$4,$5,$6,$7,'trinity') RETURNING *`,
        [workspaceId, title, workOrderType || "special_assignment", description || null, scheduledStart || null, scheduledEnd || null, estimatedHours || null]
      );
      return { success: true, actionId: request.actionId, message: `Work order "${title}" created`, data: rows[0] };
    },
  });

  platformActionHub.registerAction({
    actionId: "work_order.assign_officers",
    name: "Assign Officers to Work Order",
    category: "operations",
    description: "Assign available officers to a pending work order.",
    requiredRoles: ["owner", "co_owner", "org_admin", "manager"],
    inputSchema: { type: 'object', required: ['workOrderId', 'officerIds'], properties: { workOrderId: { type: 'string', description: 'Work order ID' }, officerIds: { type: 'array', items: { type: 'string' }, description: 'Array of officer IDs to assign' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { workOrderId, officerIds } = payload || {};
      if (!workOrderId || !officerIds) return { success: false, actionId: request.actionId, message: "workOrderId and officerIds required", data: null };
      const { rows } = await pool.query(
        `UPDATE work_orders SET assigned_officer_ids=$1, status='pending_assignment', updated_at=NOW()
         WHERE id=$2 AND workspace_id=$3 RETURNING *`,
        [officerIds, workOrderId, workspaceId]
      );
      if (!rows[0]) return { success: false, actionId: request.actionId, message: "Work order not found", data: null };
      return { success: true, actionId: request.actionId, message: `${officerIds.length} officer(s) assigned`, data: rows[0] };
    },
  });

  platformActionHub.registerAction({
    actionId: "work_order.status_summary",
    name: "Work Order Status Summary",
    category: "operations",
    description: "Summarize all open work orders by status.",
    requiredRoles: ["owner", "co_owner", "org_admin", "manager"],
    inputSchema: { type: 'object', properties: {} },
    handler: async (request) => {
      const { workspaceId } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { rows } = await pool.query(
        `SELECT status, COUNT(*) FROM work_orders WHERE workspace_id=$1 GROUP BY status`, [workspaceId]
      );
      return { success: true, actionId: request.actionId, message: "Work order summary", data: { breakdown: rows } };
    },
  });

  platformActionHub.registerAction({
    actionId: "work_order.complete",
    name: "Complete Work Order",
    category: "operations",
    description: "Mark a work order as completed with actual hours.",
    requiredRoles: ["owner", "co_owner", "org_admin", "manager"],
    inputSchema: { type: 'object', required: ['workOrderId'], properties: { workOrderId: { type: 'string', description: 'Work order ID to mark complete' }, actualHours: { type: 'number', description: 'Actual hours worked' } } },
    handler: async (request) => {
      const { workspaceId, payload } = request;
      if (!workspaceId) return { success: false, actionId: request.actionId, message: "workspace required", data: null };
      const { workOrderId, actualHours } = payload || {};
      if (!workOrderId) return { success: false, actionId: request.actionId, message: "workOrderId required", data: null };
      const { rows } = await pool.query(
        `UPDATE work_orders SET status='completed', actual_end=NOW(), actual_hours=$1, updated_at=NOW()
         WHERE id=$2 AND workspace_id=$3 AND status='active' RETURNING *`,
        [actualHours || null, workOrderId, workspaceId]
      );
      if (!rows[0]) return { success: false, actionId: request.actionId, message: "Work order not found or not active", data: null };
      return { success: true, actionId: request.actionId, message: "Work order completed", data: rows[0] };
    },
  });
}

export default router;
