/**
 * Deactivate / Reactivate Routes
 * =================================
 * POST /api/employees/:id/deactivate
 * POST /api/employees/:id/reactivate
 * POST /api/clients/:id/deactivate
 * POST /api/clients/:id/reactivate
 * POST /api/workspaces/:id/deactivate   (support staff only)
 * POST /api/workspaces/:id/reactivate   (support staff only)
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  deactivateEmployee, reactivateEmployee,
  deactivateWorkspace, reactivateWorkspace,
} from '../services/deactivateService';
import { hasManagerAccess } from '../rbac';
import { usageTracker } from '../services/billing/usageTracker';
import { platformEventBus } from '../services/platformEventBus';
import { SEAT_WARNING_THRESHOLD_PERCENT } from '../lib/tiers/tierDefinitions';
import { createLogger } from '../lib/logger';
const log = createLogger('DeactivateRoutes');


const router = Router();

const reasonSchema = z.object({ reason: z.string().optional() });

// ============================================================================
// EMPLOYEE DEACTIVATE / REACTIVATE
// ============================================================================

router.post('/employees/:id/deactivate', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const workspaceId = req.workspaceId || (user as any).workspaceId || user.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'No workspace context' });

    const workspaceRole = (user as any).workspaceRole || 'employee';
    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ message: 'Manager access required' });
    }

    const { reason } = reasonSchema.parse(req.body);

    // Prevent self-deactivation
    const userWorkspaceId = user.currentWorkspaceId;
    if (!userWorkspaceId) return res.status(400).json({ message: 'No active workspace' });
    const [emp] = await db.select().from(employees).where(and(eq(employees.id, req.params.id), eq(employees.workspaceId, userWorkspaceId)));
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    if (emp.userId === user.id) {
      return res.status(400).json({ message: 'You cannot deactivate yourself' });
    }

    const result = await deactivateEmployee(req.params.id, user.id, reason);
    res.json({ success: true, employee: result, message: `${result.firstName} ${result.lastName} has been deactivated` });
  } catch (err: unknown) {
    log.error('[Deactivate] Employee deactivate error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to deactivate employee' });
  }
});

router.post('/employees/:id/reactivate', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const workspaceRole = (user as any).workspaceRole || 'employee';
    if (!hasManagerAccess(workspaceRole)) {
      return res.status(403).json({ message: 'Manager access required' });
    }

    const workspaceId = (req as any).workspaceId || (user as any).workspaceId || user.currentWorkspaceId;
    if (!workspaceId) return res.status(400).json({ message: 'No workspace context' });

    // ── Phase 30: Seat limit enforcement ──────────────────────────────────────
    // Check seat availability before reactivating an employee.
    const seatCheck = await usageTracker.canAddEmployee(workspaceId);
    if (!seatCheck.allowed) {
      return res.status(403).json({
        error: 'SEAT_LIMIT_REACHED',
        message: seatCheck.message || `Your plan allows a maximum of ${seatCheck.max} active employees. Please upgrade to reactivate more team members.`,
        currentCount: seatCheck.current,
        maxAllowed: seatCheck.max,
        upgradeUrl: '/billing/upgrade',
      });
    }

    const result = await reactivateEmployee(req.params.id, user.id);

    // ── Phase 30: 80% seat capacity NDS notification ───────────────────────────
    // Fire a non-blocking warning if workspace is at 80%+ capacity after reactivation.
    const usedAfter = seatCheck.current + 1;
    const usagePct = seatCheck.max > 0 ? usedAfter / seatCheck.max : 0;
    if (usagePct >= SEAT_WARNING_THRESHOLD_PERCENT) {
      platformEventBus.publish({
        type: 'seat_capacity_warning',
        category: 'billing',
        title: 'Seat Capacity Warning',
        description: `Your workspace has used ${usedAfter} of ${seatCheck.max} seats (${Math.round(usagePct * 100)}%). Consider upgrading your plan to avoid hitting the seat limit.`,
        workspaceId,
        metadata: { seatUsed: usedAfter, seatMax: seatCheck.max, usagePct: Math.round(usagePct * 100) },
        visibility: 'org_leadership',
      }).catch((err: any) => log.warn('[EventBus] Publish failed (non-blocking):', err?.message));
    }

    res.json({ success: true, employee: result, message: `${result.firstName} ${result.lastName} has been reactivated` });
  } catch (err: unknown) {
    log.error('[Deactivate] Employee reactivate error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to reactivate employee' });
  }
});

// NOTE: Client deactivate/reactivate is handled by clientRoutes.ts (POST /api/clients/:id/deactivate|reactivate)
// which has the full implementation including Trinity events, collections pipeline, and audit logging.
// Do not add client routes here to avoid duplicate registration.

// ============================================================================
// WORKSPACE DEACTIVATE / REACTIVATE (Support Staff Only)
// ============================================================================

function hasPlatformSupportAccess(platformRole: string): boolean {
  return ['support_agent', 'support_manager', 'sysop', 'deputy_admin', 'root_admin'].includes(platformRole);
}

router.post('/workspaces/:id/deactivate', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const platformRole = (user as any).platformRole || 'user';
    if (!hasPlatformSupportAccess(platformRole)) {
      return res.status(403).json({ message: 'Support staff access required' });
    }

    const { reason } = reasonSchema.parse(req.body);
    const result = await deactivateWorkspace(req.params.id, user.id, reason);
    res.json({ success: true, workspace: result, message: `Workspace ${result.name} has been deactivated` });
  } catch (err: unknown) {
    log.error('[Deactivate] Workspace deactivate error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to deactivate workspace' });
  }
});

router.post('/workspaces/:id/reactivate', async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    const platformRole = (user as any).platformRole || 'user';
    if (!hasPlatformSupportAccess(platformRole)) {
      return res.status(403).json({ message: 'Support staff access required' });
    }

    const result = await reactivateWorkspace(req.params.id, user.id);
    res.json({ success: true, workspace: result, message: `Workspace ${result.name} has been reactivated` });
  } catch (err: unknown) {
    log.error('[Deactivate] Workspace reactivate error:', err);
    res.status(500).json({ message: sanitizeError(err) || 'Failed to reactivate workspace' });
  }
});

export default router;
