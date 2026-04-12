import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../lib/logger';
import { pool } from '../db';
import { GRANDFATHERED_TENANT_ID, PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';

const log = createLogger('grandfatheredTenantGuard');

/**
 * Route path prefixes that are ALWAYS allowed to mutate even for protected
 * workspaces.  These are internal automation / workflow / pipeline / scheduling
 * operations that must continue running regardless of the tenant-protection
 * flag (e.g. Trinity auto-fill, autonomous scheduler, onboarding pipelines).
 *
 * Covers:
 *  - automation engine (Trinity OS, governance, events)
 *  - all schedule-adjacent paths (shifts, scheduleOS, scheduling, approvals,
 *    shift-trading, coverage, time-entries, AI scheduling, Trinity scheduling)
 *  - workflow and pipeline systems
 *  - notifications
 */
const AUTOMATION_EXEMPT_PREFIXES = [
  // ── Automation engine ────────────────────────────────────────────────────
  '/api/automation',
  '/api/automation-events',
  '/api/automation-governance',

  // ── Scheduling & shift management ────────────────────────────────────────
  '/api/shifts',            // shift CRUD (create, edit, delete, assign, ai-fill)
  '/api/scheduleos',        // Trinity schedule OS toggle / proposals
  '/api/scheduler',         // autonomous scheduler service
  '/api/orchestrated-schedule', // orchestrated schedule sessions
  '/api/schedules',         // publish/unpublish schedule
  '/api/scheduling',        // duplicate-week, recurring, swap-request, etc.
  '/api/approvals',         // shift approval workflows
  '/api/shift-trading',     // shift trade requests / availability
  '/api/coverage',          // coverage marketplace / open shift coverage
  '/api/ai/scheduling',     // AI-driven scheduling
  '/api/trinity/scheduling',// Trinity scheduling integration
  '/api/trinity-staffing',  // Trinity staffing recommendations

  // ── Time tracking ────────────────────────────────────────────────────────
  '/api/time-entries',      // clock in/out, time entry approvals, breaks

  // ── Workflow & pipeline systems ───────────────────────────────────────────
  '/api/workflows',
  '/api/workflow-configs',
  '/api/onboarding-pipeline',
  '/api/incident-reports',
  '/api/incident-patterns',

  // ── Notifications ─────────────────────────────────────────────────────────
  '/api/notifications',
];

function isAutomationRoute(path: string): boolean {
  return AUTOMATION_EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Set of workspace IDs that should be write-protected.
 *  • GRANDFATHERED_TENANT_ID  — the founding "free forever" tenant (Statewide).
 *  • PLATFORM_WORKSPACE_ID    — the internal CoAIleague support / platform org.
 *
 * Both tenants still need automations, workflows, and pipelines to function,
 * so those route prefixes are exempt from the block (see AUTOMATION_EXEMPT_PREFIXES).
 */
function buildProtectedWorkspaceIds(): Set<string> {
  const ids = new Set<string>();
  if (GRANDFATHERED_TENANT_ID) ids.add(GRANDFATHERED_TENANT_ID);
  if (PLATFORM_WORKSPACE_ID)   ids.add(PLATFORM_WORKSPACE_ID);
  return ids;
}

export function statewideWriteGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const protectedIds = buildProtectedWorkspaceIds();
  if (protectedIds.size === 0) {
    next();
    return;
  }

  const workspaceId =
    (req as any).user?.workspaceId ||
    (req as any).body?.workspaceId ||
    req.params?.workspaceId ||
    (req.query?.workspaceId as string | undefined);

  if (!workspaceId || !protectedIds.has(workspaceId)) {
    next();
    return;
  }

  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  if (!isMutation) {
    next();
    return;
  }

  const isAuthRoute       = req.path.startsWith('/api/auth');
  const isHealthRoute     = req.path === '/health' || req.path === '/api/platform/readiness';
  const isWebhookRoute    = req.path.startsWith('/api/webhook') || req.path.startsWith('/api/stripe');
  const isAutomation      = isAutomationRoute(req.path);

  if (isAuthRoute || isHealthRoute || isWebhookRoute || isAutomation) {
    next();
    return;
  }

  log.error('PRODUCTION TENANT WRITE BLOCKED', {
    path: req.path,
    method: req.method,
    workspaceId,
    userId: (req as any).user?.userId,
    body: JSON.stringify((req as any).body || {}).slice(0, 200),
    ip: req.ip,
  });

  pool.query(
    `INSERT INTO admin_audit_log (action, actor_id, metadata, created_at)
     VALUES ('grandfathered_tenant_write_blocked', $1, $2, NOW())`,
    [
      (req as any).user?.userId || 'anonymous',
      JSON.stringify({
        path: req.path,
        method: req.method,
        workspaceId,
        ip: req.ip,
      }),
    ]
  ).catch((err) => {
    log.warn('grandfatheredTenantGuard audit log write failed', { err: err?.message });
  });

  res.status(403).json({
    error: 'Write operations are blocked on this workspace.',
    code: 'TENANT_PROTECTED',
  });
}
