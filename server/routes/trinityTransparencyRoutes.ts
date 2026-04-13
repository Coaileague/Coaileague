/**
 * Trinity Transparency Routes — Phase 16
 * ========================================
 * Tenant-owner-facing dashboard API that surfaces everything Trinity has done:
 * autonomous actions, API costs, decision reasoning, and escalation status.
 *
 * All endpoints are workspace-scoped and require org_owner / co_owner or
 * higher (manager-level minimum enforced by requireManager).
 *
 * Mounted at /api/trinity/transparency
 */

import { Router, Response } from 'express';
import { requireManager, type AuthenticatedRequest } from '../rbac';
import { trinityDecisionLogger } from '../services/trinityDecisionLogger';
import { trinityAuditService } from '../services/trinity/trinityAuditService';
import { trinityCostService } from '../services/trinity/trinityCostService';
import { TRINITY_SERVICE_REGISTRY, getPlatformIntegrationSummary, getServiceCountByDomain } from '../services/trinity/trinityServiceRegistry';
import { sanitizeError } from '../middleware/errorHandler';
import { pool } from '../db';
import { createLogger } from '../lib/logger';

const log = createLogger('TrinityTransparencyRoutes');
const router = Router();

router.use(requireManager);

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/overview
// Combined summary: actions today, costs today, pending escalations, decisions
// ────────────────────────────────────────────────────────────────────────────

router.get('/overview', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context required' });
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Parallel fetch of all overview data
    const [actionsResult, decisionsResult, escalationsResult, costsResult] = await Promise.allSettled([
      // Recent Trinity action logs (today)
      pool.query<{
        total: string;
        succeeded: string;
        failed: string;
      }>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed' OR status = 'success') AS succeeded,
           COUNT(*) FILTER (WHERE status = 'failed' OR status = 'error') AS failed
         FROM trinity_action_logs
         WHERE workspace_id = $1
           AND created_at >= $2
           AND created_at < $3`,
        [workspaceId, today.toISOString(), tomorrow.toISOString()],
      ),

      // Decisions today
      trinityDecisionLogger.getDecisionsForWorkspace(workspaceId, {
        limit: 5,
        offset: 0,
      }),

      // Pending escalations
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count
         FROM governance_approvals
         WHERE workspace_id = $1 AND status = 'pending'`,
        [workspaceId],
      ),

      // Today's cost summary (current month)
      trinityCostService.getMonthlySummary(
        workspaceId,
        new Date().getFullYear(),
        new Date().getMonth() + 1,
      ),
    ]);

    const actionStats = actionsResult.status === 'fulfilled'
      ? actionsResult.value.rows[0]
      : { total: '0', succeeded: '0', failed: '0' };

    const recentDecisions = decisionsResult.status === 'fulfilled'
      ? decisionsResult.value.decisions.slice(0, 5)
      : [];

    const pendingEscalations = escalationsResult.status === 'fulfilled'
      ? parseInt(escalationsResult.value.rows[0]?.count ?? '0', 10)
      : 0;

    const monthlyCost = costsResult.status === 'fulfilled' ? costsResult.value : null;

    res.json({
      success: true,
      overview: {
        actionsToday: {
          total: parseInt(actionStats.total, 10),
          succeeded: parseInt(actionStats.succeeded, 10),
          failed: parseInt(actionStats.failed, 10),
          successRate: actionStats.total === '0'
            ? 100
            : Math.round((parseInt(actionStats.succeeded, 10) / parseInt(actionStats.total, 10)) * 100),
        },
        pendingEscalations,
        recentDecisions,
        costThisMonth: {
          totalUsd: monthlyCost?.totalCostUsd ?? 0,
          totalExecutions: monthlyCost?.totalExecutions ?? 0,
          topSkillsBySpend: (monthlyCost?.bySkill ?? []).slice(0, 5),
        },
      },
    });
  } catch (error: unknown) {
    log.error('[Transparency] Overview fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/actions
// Paginated list of all autonomous Trinity actions with status + reasoning
// ────────────────────────────────────────────────────────────────────────────

router.get('/actions', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context required' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const statusFilter = req.query.status as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    const params: (string | number)[] = [workspaceId];
    let where = 'WHERE workspace_id = $1';
    let idx = 2;

    if (statusFilter) {
      where += ` AND status = $${idx++}`;
      params.push(statusFilter);
    }
    if (startDate) {
      where += ` AND created_at >= $${idx++}`;
      params.push(startDate);
    }
    if (endDate) {
      where += ` AND created_at < $${idx++}`;
      params.push(endDate);
    }

    params.push(limit, offset);

    const { rows: actions } = await pool.query(
      `SELECT
         id,
         action_type,
         action_name,
         status,
         result,
         duration_ms,
         error_message,
         created_at,
         metadata
       FROM trinity_action_logs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx}`,
      params,
    );

    // Count uses same WHERE params (without the trailing limit/offset pair)
    const filterParams = params.slice(0, -2);
    const { rows: [{ total }] } = await pool.query(
      `SELECT COUNT(*) AS total FROM trinity_action_logs ${where}`,
      filterParams,
    );

    res.set('X-Total-Count', total);
    res.json({
      success: true,
      actions,
      total: parseInt(total, 10),
      limit,
      offset,
    });
  } catch (error: unknown) {
    log.error('[Transparency] Actions fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/decisions
// All Trinity decisions with full reasoning, model, verifier verdict
// ────────────────────────────────────────────────────────────────────────────

router.get('/decisions', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context required' });
  }

  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const domain = req.query.domain as string | undefined;

    const result = await trinityDecisionLogger.getDecisionsForWorkspace(workspaceId, {
      domain,
      limit,
      offset,
    });

    res.set('X-Total-Count', String(result.total));
    res.json({
      success: true,
      decisions: result.decisions,
      total: result.total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    log.error('[Transparency] Decisions fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/decision/:id
// Full decision detail with reasoning, alternatives, verifier commentary
// ────────────────────────────────────────────────────────────────────────────

router.get('/decision/:id', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context required' });
  }

  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM trinity_decisions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [id, workspaceId],
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    res.json({ success: true, decision: rows[0] });
  } catch (error: unknown) {
    log.error('[Transparency] Decision detail fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/cost-breakdown
// Per-skill and per-model cost breakdown for a given month
// ────────────────────────────────────────────────────────────────────────────

router.get('/cost-breakdown', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context required' });
  }

  try {
    // Default to current month; accept ?month=YYYY-MM
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7);

    const [year, mon] = month.split('-').map(Number);
    const summary = await trinityCostService.getMonthlySummary(workspaceId, year, mon);

    res.json({
      success: true,
      month,
      costBreakdown: summary ?? {
        workspaceId,
        month,
        totalExecutions: 0,
        totalCostUsd: 0,
        bySkill: [],
        byModel: [],
      },
    });
  } catch (error: unknown) {
    log.error('[Transparency] Cost breakdown fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/audit-trail
// Skill-level audit trail (proxies trinityAuditService)
// ────────────────────────────────────────────────────────────────────────────

router.get('/audit-trail', async (req: AuthenticatedRequest, res: Response) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    return res.status(400).json({ success: false, error: 'Workspace context required' });
  }

  try {
    const { startDate, endDate, skillName } = req.query;

    let trail;
    if (skillName && typeof skillName === 'string') {
      trail = await trinityAuditService.getSkillAuditTrail(workspaceId, skillName);
    } else {
      const start = new Date((startDate as string) || new Date(Date.now() - 7 * 86400_000).toISOString());
      const end   = new Date((endDate as string) || new Date().toISOString());
      trail = await trinityAuditService.getAuditTrail(workspaceId, start, end);
    }

    res.json({ success: true, trail });
  } catch (error: unknown) {
    log.error('[Transparency] Audit trail fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /api/trinity/transparency/service-registry
// Returns the canonical Trinity service inventory (Phase 16 registry)
// ────────────────────────────────────────────────────────────────────────────

router.get('/service-registry', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const integrationSummary = getPlatformIntegrationSummary();
    const domainCounts = getServiceCountByDomain();

    res.json({
      success: true,
      totalServices: TRINITY_SERVICE_REGISTRY.length,
      services: TRINITY_SERVICE_REGISTRY,
      integrationSummaryByPhase: integrationSummary,
      serviceCountByDomain: domainCounts,
    });
  } catch (error: unknown) {
    log.error('[Transparency] Service registry fetch failed:', error);
    res.status(500).json({ success: false, error: sanitizeError(error) });
  }
});

export default router;
