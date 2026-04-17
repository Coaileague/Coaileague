/**
 * Trinity Agent Dashboard Routes — Phase 16
 * ==========================================
 * Support-agent-facing API for managing Trinity operations:
 *   - Pending approval queue
 *   - Action reasoning viewer
 *   - Override gateway (with mandatory reason + audit log)
 *   - Escalation triage
 *
 * Authority matrix:
 *   support_agent      — can override CLASS 1 & 2 actions; cannot override CLASS 3+
 *   support_manager    — can override CLASS 1, 2, 3; CLASS 4 requires root_admin
 *   sysop/deputy/root  — full override authority
 *
 * All mutations are logged to support_actions + system_audit_logs.
 *
 * Mounted at /api/trinity/agent-dashboard
 */

import { Router, Response } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { sanitizeError } from '../middleware/errorHandler';
import { pool } from '../db';
import { createLogger } from '../lib/logger';
import crypto from 'crypto';

const log = createLogger('TrinityAgentDashboard');
const router = Router();

// ── Authority matrix ─────────────────────────────────────────────────────────

const AGENT_ROLES = new Set([
  'support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin',
]);

const MANAGER_OVERRIDE_ROLES = new Set([
  'support_manager', 'sysop', 'deputy_admin', 'root_admin',
]);

function getActorRole(req: AuthenticatedRequest): string {
  // Platform role only — workspace roles never grant cross-tenant support
  // access. Falling back to workspaceRole would let a tenant user whose
  // role string coincidentally matched 'support_agent' read any
  // workspace's reasoning data.
  return (req as any).platformRole || 'none';
}

function requireSupportAccess(req: AuthenticatedRequest, res: Response): boolean {
  const role = getActorRole(req);
  if (!AGENT_ROLES.has(role)) {
    res.status(403).json({
      success: false,
      error: 'Support agent or higher platform role required',
      requiredRoles: Array.from(AGENT_ROLES),
    });
    return false;
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/agent-dashboard/queue
// Pending governance approvals that require agent action
// ────────────────────────────────────────────────────────────────────────────

router.get('/queue', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  try {
    const { rows } = await pool.query(
      `SELECT
         ga.id,
         ga.workspace_id,
         ga.action_type,
         ga.action_name,
         ga.status,
         ga.parameters,
         ga.reason,
         ga.confidence_score,
         ga.risk_factors,
         ga.created_at,
         ga.expires_at,
         w.name AS workspace_name
       FROM governance_approvals ga
       LEFT JOIN workspaces w ON w.id = ga.workspace_id
       WHERE ga.status = 'pending'
       ORDER BY ga.created_at ASC
       LIMIT 100`,
    );

    res.json({
      success: true,
      queue: rows,
      count: rows.length,
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Queue fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/agent-dashboard/queue/:workspaceId
// Queue scoped to a specific workspace (for agents managing one tenant)
// ────────────────────────────────────────────────────────────────────────────

router.get('/queue/:workspaceId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  try {
    const { workspaceId } = req.params;

    const { rows } = await pool.query(
      `SELECT
         ga.id,
         ga.workspace_id,
         ga.action_type,
         ga.action_name,
         ga.status,
         ga.parameters,
         ga.reason,
         ga.confidence_score,
         ga.risk_factors,
         ga.created_at,
         ga.expires_at
       FROM governance_approvals ga
       WHERE ga.workspace_id = $1 AND ga.status = 'pending'
       ORDER BY ga.created_at ASC
       LIMIT 100`,
      [workspaceId],
    );

    res.json({
      success: true,
      queue: rows,
      count: rows.length,
      workspaceId,
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Workspace queue fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/agent-dashboard/reasoning/:actionId
// Full reasoning chain for a Trinity action (decision + context + alternatives)
// ────────────────────────────────────────────────────────────────────────────

router.get('/reasoning/:actionId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  try {
    const { actionId } = req.params;

    // Check governance_approvals first (pending actions)
    const { rows: approvalRows } = await pool.query(
      `SELECT
         ga.id,
         ga.action_type,
         ga.action_name,
         ga.parameters,
         ga.reason,
         ga.confidence_score,
         ga.risk_factors,
         ga.workspace_id,
         ga.created_at,
         w.name AS workspace_name
       FROM governance_approvals ga
       LEFT JOIN workspaces w ON w.id = ga.workspace_id
       WHERE ga.id = $1
       LIMIT 1`,
      [actionId],
    );

    // Check trinity_decisions for richer reasoning
    const { rows: decisionRows } = await pool.query(
      `SELECT *
       FROM trinity_decisions
       WHERE action_id = $1 OR id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [actionId],
    );

    // Check action logs for execution context
    const { rows: logRows } = await pool.query(
      `SELECT
         id,
         action_type,
         action_name,
         status,
         result,
         duration_ms,
         error_message,
         metadata,
         created_at
       FROM trinity_action_logs
       WHERE id = $1
       LIMIT 1`,
      [actionId],
    );

    if (!approvalRows.length && !decisionRows.length && !logRows.length) {
      return res.status(404).json({ success: false, error: 'Action not found' });
    }

    res.json({
      success: true,
      reasoning: {
        approval: approvalRows[0] ?? null,
        decision: decisionRows[0] ?? null,
        executionLog: logRows[0] ?? null,
      },
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Reasoning fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/trinity/agent-dashboard/approve
// Approve a pending Trinity action
// Body: { actionId, reason }
// ────────────────────────────────────────────────────────────────────────────

router.post('/approve', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  const { actionId, reason } = req.body as { actionId?: string; reason?: string };

  if (!actionId || !reason?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'actionId and reason are required',
    });
  }

  try {
    const actorId = (req as any).user?.id || 'unknown';
    const actorRole = getActorRole(req);

    // Update governance_approvals
    const { rowCount } = await pool.query(
      `UPDATE governance_approvals
       SET status = 'approved',
           approved_by = $1,
           approved_at = NOW(),
           approval_reason = $2
       WHERE id = $3 AND status = 'pending'`,
      [actorId, reason.trim(), actionId],
    );

    if (!rowCount) {
      return res.status(404).json({
        success: false,
        error: 'Pending approval not found or already processed',
      });
    }

    // Audit log
    await pool.query(
      `INSERT INTO system_audit_logs
         (id, actor_id, actor_role, action_type, target_entity_type, target_entity_id,
          description, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        crypto.randomUUID(),
        actorId,
        actorRole,
        'trinity.approval.approved',
        'governance_approval',
        actionId,
        `Support agent approved Trinity action: ${reason.trim()}`,
        JSON.stringify({ actionId, reason: reason.trim(), actorRole }),
      ],
    );

    log.info(`[AgentDashboard] Action ${actionId} approved by ${actorId} (${actorRole})`);

    res.json({
      success: true,
      message: 'Action approved',
      actionId,
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Approve failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// POST /api/trinity/agent-dashboard/override
// Override (reject/deny) a pending Trinity action with mandatory reason
// Body: { actionId, reason, workspaceId? }
// ────────────────────────────────────────────────────────────────────────────

router.post('/override', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  const { actionId, reason } = req.body as {
    actionId?: string;
    reason?: string;
  };

  if (!actionId || !reason?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'actionId and reason are required',
    });
  }

  const actorRole = getActorRole(req);

  // CLASS 3+ overrides require manager-level role
  try {
    const { rows: [approval] } = await pool.query(
      `SELECT id, action_type, confidence_score, risk_factors, workspace_id, status
       FROM governance_approvals
       WHERE id = $1 LIMIT 1`,
      [actionId],
    );

    if (!approval) {
      return res.status(404).json({ success: false, error: 'Pending approval not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Action is already ${approval.status}`,
      });
    }

    // If confidence score is low (high-risk) require manager role
    const confidenceScore = parseFloat(approval.confidence_score ?? '1');
    if (confidenceScore < 0.41 && !MANAGER_OVERRIDE_ROLES.has(actorRole)) {
      return res.status(403).json({
        success: false,
        error: 'Manager or higher role required to override low-confidence (CLASS 3+) actions',
      });
    }

    const actorId = (req as any).user?.id || 'unknown';

    // Mark as denied
    await pool.query(
      `UPDATE governance_approvals
       SET status = 'denied',
           denied_by = $1,
           denied_at = NOW(),
           denial_reason = $2
       WHERE id = $3`,
      [actorId, reason.trim(), actionId],
    );

    // Audit log
    await pool.query(
      `INSERT INTO system_audit_logs
         (id, actor_id, actor_role, action_type, target_entity_type, target_entity_id,
          description, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
      [
        crypto.randomUUID(),
        actorId,
        actorRole,
        'trinity.approval.override',
        'governance_approval',
        actionId,
        `Support agent overrode Trinity action: ${reason.trim()}`,
        JSON.stringify({ actionId, reason: reason.trim(), actorRole, workspaceId: approval.workspace_id }),
      ],
    );

    log.info(`[AgentDashboard] Action ${actionId} overridden by ${actorId} (${actorRole}): ${reason}`);

    res.json({
      success: true,
      message: 'Trinity action overridden',
      actionId,
      overriddenBy: actorId,
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Override failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/agent-dashboard/escalations
// Escalations awaiting agent triage across all workspaces
// ────────────────────────────────────────────────────────────────────────────

router.get('/escalations', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;

    const { rows } = await pool.query(
      `SELECT
         st.id AS ticket_id,
         st.workspace_id,
         st.subject,
         st.status,
         st.priority,
         st.sla_deadline,
         st.created_at,
         st.updated_at,
         w.name AS workspace_name,
         (st.sla_deadline < NOW()) AS sla_breached
       FROM support_tickets st
       LEFT JOIN workspaces w ON w.id = st.workspace_id
       WHERE st.status IN ('escalated', 'trinity_escalated', 'open')
         AND (st.sla_deadline IS NULL OR st.sla_deadline < NOW() + INTERVAL '2 hours')
       ORDER BY st.sla_deadline ASC NULLS LAST, st.created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );

    res.json({
      success: true,
      escalations: rows,
      count: rows.length,
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Escalations fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/agent-dashboard/activity-feed
// Recent Trinity decisions + actions across all workspaces for the feed
// ────────────────────────────────────────────────────────────────────────────

router.get('/activity-feed', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!requireSupportAccess(req, res)) return;

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 30, 100);

    const { rows } = await pool.query(
      `SELECT
         tal.id,
         tal.workspace_id,
         tal.action_type,
         tal.action_name,
         tal.status,
         tal.duration_ms,
         tal.created_at,
         w.name AS workspace_name
       FROM trinity_action_logs tal
       LEFT JOIN workspaces w ON w.id = tal.workspace_id
       ORDER BY tal.created_at DESC
       LIMIT $1`,
      [limit],
    );

    res.json({
      success: true,
      feed: rows,
    });
  } catch (error: unknown) {
    log.error('[AgentDashboard] Activity feed failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
