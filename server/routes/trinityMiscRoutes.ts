import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('TrinityMiscRoutes');


const router = Router();

router.get("/editable-registry", requireAuth, requirePlatformStaff, async (_req, res) => {
    try {
      const { getEditableModulesForTrinity, getProtectedModules } = await import("../../shared/config/trinityEditableRegistry");
      res.json({
        success: true,
        editableModules: getEditableModulesForTrinity(),
        protectedModules: getProtectedModules(),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error("[TrinityRegistry] Error:", error);
      res.status(500).json({ success: false, error: "Failed to get registry" });
    }
  });

router.get("/memory-health", requireAuth, requirePlatformStaff, async (_req: AuthenticatedRequest, res) => {
    try {
      const { trinityMemoryOptimizer } = await import('../services/ai-brain/trinityMemoryOptimizer');
      const health = await trinityMemoryOptimizer.getMemoryHealth();
      res.json({ success: true, health });
    } catch (error: unknown) {
      log.error('[Trinity Memory Health] Error:', sanitizeError(error));
      res.status(500).json({ success: false, error: 'Failed to get memory health' });
    }
  });

router.get("/route-health", requireAuth, requirePlatformStaff, async (_req, res) => {
    try {
      const { getRouteHealthSummary, CRITICAL_ROUTES, CRITICAL_API_ENDPOINTS } = await import("../services/routeHealthService");
      const summary = getRouteHealthSummary();
      res.json({
        success: true,
        routes: CRITICAL_ROUTES,
        apiEndpoints: CRITICAL_API_ENDPOINTS,
        summary,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      log.error("[RouteHealth] Error:", error);
      res.status(500).json({ success: false, error: "Failed to get route health" });
    }
  });

// Phase 48 — Trinity onboarding.status action
// Trinity can call this to check an employee's onboarding completion status
router.get("/onboarding-status/:employeeId", async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId } = req.params;
    const workspaceId = req.workspaceId;
    if (!workspaceId) return res.status(403).json({ success: false, error: "Workspace required" });

    const { pool } = await import("../db");

    const { rows: tier1Templates } = await pool.query(
      `SELECT id, title FROM onboarding_task_templates
       WHERE tier = 1 AND is_required = true AND is_active = true
         AND (workspace_id IS NULL OR workspace_id = $1)`,
      [workspaceId]
    );

    const { rows: allTasks } = await pool.query(
      `SELECT t.id, t.tier, t.title, t.is_required,
              c.status, c.completed_at, c.waived_reason
       FROM onboarding_task_templates t
       LEFT JOIN employee_onboarding_completions c
         ON c.task_template_id = t.id AND c.employee_id = $1
       WHERE t.is_active = true
         AND (t.workspace_id IS NULL OR t.workspace_id = $2)
         AND t.category = 'officer'
       ORDER BY t.tier, t.sort_order`,
      [employeeId, workspaceId]
    );

    const totalRequired = allTasks.filter((t: any) => t.is_required).length;
    const completed = allTasks.filter((t: any) => t.is_required && (t.status === 'completed' || t.status === 'waived')).length;
    const pendingTier1 = tier1Templates.filter((t: any) => {
      const match = allTasks.find((a: any) => a.id === t.id);
      return !match || !['completed','waived'].includes(match.status);
    });

    return res.json({
      success: true,
      employeeId,
      tier1Blocked: pendingTier1.length > 0,
      pendingTier1Count: pendingTier1.length,
      progress: {
        total: totalRequired,
        completed,
        pct: totalRequired > 0 ? Math.round((completed / totalRequired) * 100) : 0,
      },
      tasks: allTasks,
    });
  } catch (err) {
    log.error("[Trinity Onboarding Status] Error:", err);
    return res.status(500).json({ success: false, error: "Failed to fetch onboarding status" });
  }
});

export default router;
