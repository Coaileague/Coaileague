import { Router, Response } from "express";
import { pool } from "../../db";
import { requireAuth } from "../../auth";
import { requireManager, type AuthenticatedRequest } from "../../rbac";
import { typedPool } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('AuditTrail');


const router = Router();

const q = (text: string, params?: any[]) => typedPool(text, params);
const MAX_EXPORT_ROWS = 10_000;

// Actions that are system automation noise — not human compliance records.
// Filtering these from compliance routes reduces table scan cost dramatically
// because the idx_audit_user_created index can be used instead of full scans.
const SYSTEM_ACTION_PREFIX_FILTER = `
  AND action NOT LIKE 'orchestration%'
  AND action NOT LIKE 'platform_event%'
  AND action NOT LIKE 'automation.%'
`;

router.get("/", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { entityType, entityId, employeeId, action, startDate, endDate, limit, includeSystem } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    let conditions = ["workspace_id = $1"];
    const params: any[] = [workspaceId];
    let idx = 2;

    if (entityType) { conditions.push(`entity_type = $${idx++}`); params.push(entityType); }
    if (entityId) { conditions.push(`entity_id = $${idx++}`); params.push(entityId); }
    if (employeeId) { conditions.push(`user_id = $${idx++}`); params.push(employeeId); }
    if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
    if (startDate) { conditions.push(`created_at >= $${idx++}`); params.push(new Date(String(startDate))); }
    if (endDate) { conditions.push(`created_at < $${idx++}`); params.push(new Date(String(endDate))); }

    // Unless the caller explicitly requests system events, filter out automation noise.
    // This prevents the 1.4M-row orchestration flood from dominating compliance queries.
    const systemFilter = includeSystem === 'true' ? '' : SYSTEM_ACTION_PREFIX_FILTER;

    const auditLogs = await q(
      `SELECT id, workspace_id, user_id, user_email, user_role, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE ${conditions.join(" AND ")}
       ${systemFilter}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, Math.min(Math.max(1, Number(limit) || 100), 500)]
    );

    res.json({ success: true, auditLogs, count: (auditLogs as any).length });
  } catch (error) {
    log.error("[Compliance Audit Trail] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch audit trail" });
  }
});

router.get("/export", requireAuth, requireManager, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { start, end, format = 'csv', limit } = req.query;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const params: any[] = [workspaceId];
    let idx = 2;
    const conditions = [`workspace_id = $1`];
    if (start) { conditions.push(`created_at >= $${idx++}`); params.push(new Date(String(start))); }
    if (end) { conditions.push(`created_at <= $${idx++}`); params.push(new Date(String(end))); }

    const maxRows = Math.min(Math.max(1, Number(limit) || MAX_EXPORT_ROWS), MAX_EXPORT_ROWS);
    const logs = await q(
      `SELECT id, created_at, action, user_id, user_email, entity_type, entity_id, metadata
       FROM audit_logs
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC
       LIMIT $${idx}`,
      [...params, maxRows]
    );

    const logRows = logs as unknown as any[];

    if (String(format).toLowerCase() === 'json') {
      return res.json({ success: true, count: logRows.length, logs: logRows });
    }

    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const header = 'timestamp,action,actorId,actorEmail,entityType,entityId,details\n';
    const rows = logRows.map((l) => [
      escapeCsv(l.created_at),
      escapeCsv(l.action),
      escapeCsv(l.user_id),
      escapeCsv(l.user_email),
      escapeCsv(l.entity_type),
      escapeCsv(l.entity_id),
      escapeCsv(JSON.stringify(l.metadata ?? {})),
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit-trail-${Date.now()}.csv"`);
    return res.send(header + rows);
  } catch (error) {
    log.error("[Compliance Audit Trail] Export error:", error);
    return res.status(500).json({ success: false, error: "Failed to export audit trail" });
  }
});

router.get("/document/:documentId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { documentId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const auditLogs = await q(
      `SELECT id, workspace_id, user_id, user_email, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE workspace_id = $1 AND entity_id = $2 AND entity_type IN ('document','compliance_document')
       ${SYSTEM_ACTION_PREFIX_FILTER}
       ORDER BY created_at DESC`,
      [workspaceId, documentId]
    );

    res.json({ success: true, auditLogs });
  } catch (error) {
    log.error("[Compliance Audit Trail] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch document audit trail" });
  }
});

router.get("/employee/:employeeId", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;
    const { employeeId } = req.params;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const auditLogs = await q(
      `SELECT id, workspace_id, user_id, user_email, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE workspace_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 100`,
      [workspaceId, employeeId]
    );

    res.json({ success: true, auditLogs });
  } catch (error) {
    log.error("[Compliance Audit Trail] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch employee audit trail" });
  }
});

router.get("/critical", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res.status(400).json({ success: false, error: "Workspace required" });
    }

    const auditLogs = await q(
      `SELECT id, workspace_id, user_id, user_email, action, entity_type, entity_id, metadata, created_at
       FROM audit_logs
       WHERE workspace_id = $1
       ${SYSTEM_ACTION_PREFIX_FILTER}
       ORDER BY created_at DESC
       LIMIT 50`,
      [workspaceId]
    );

    res.json({ success: true, auditLogs });
  } catch (error) {
    log.error("[Compliance Audit Trail] Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch critical audit logs" });
  }
});

export const auditTrailRoutes = router;
