/**
 * END-USER CONTROL ROUTES
 * Platform support staff management of end-user organizations
 * - Workspace search and detail view
 * - Suspend/unsuspend organizations
 * - AI Brain access control
 * - User access management
 */

import { Router, Response, NextFunction } from 'express';
import { eq, or, ilike, and, sql, desc } from 'drizzle-orm';
import { db } from '../db';
import { workspaces, users, employees, clients, systemAuditLogs } from '@shared/schema';
import { type AuthenticatedRequest } from '../rbac';
import { createLogger } from '../lib/logger';
import { z } from 'zod';
const log = createLogger('EndUserControlRoutes');


export const endUserControlRouter = Router();

const SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];

function requireSupportRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userRole = req.platformRole || 'none';
  if (!SUPPORT_ROLES.includes(userRole)) {
    return res.status(403).json({ 
      error: 'Support staff access required',
      requiredRoles: SUPPORT_ROLES,
    });
  }
  next();
}

async function logAdminAction(actorId: string, action: string, details: any, tx?: any) {
  const client = tx ?? db;
  await client.insert(systemAuditLogs).values({
    userId: actorId,
    action,
    entityType: 'workspace',
    entityId: details.workspaceId || 'unknown',
    workspaceId: details.workspaceId || undefined,
    metadata: details,
  });
}

/**
 * GET /api/admin/end-users/workspaces
 * Search for workspaces by name, company name, or owner email
 */
endUserControlRouter.get('/workspaces', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = (req.query.q as string || '').trim();
    
    if (query.length < 2) {
      return res.json([]);
    }

    const searchPattern = `%${query}%`;

    // Find workspace IDs that have a user with matching email
    const workspaceIdsWithMatchingUser = db
      .select({ workspaceId: users.currentWorkspaceId })
      .from(users)
      .where(ilike(users.email, searchPattern));

    const results = await db.selectDistinct({
      id: workspaces.id,
      name: workspaces.name,
      companyName: workspaces.companyName,
      subscriptionTier: workspaces.subscriptionTier,
      subscriptionStatus: workspaces.subscriptionStatus,
      isSuspended: workspaces.isSuspended,
      suspendedReason: workspaces.suspendedReason,
      isFrozen: workspaces.isFrozen,
      frozenReason: workspaces.frozenReason,
      isLocked: workspaces.isLocked,
      lockedReason: workspaces.lockedReason,
      aiBrainSuspended: workspaces.aiBrainSuspended,
      aiBrainSuspendedReason: workspaces.aiBrainSuspendedReason,
    })
    .from(workspaces)
    .where(
      or(
        ilike(workspaces.name, searchPattern),
        ilike(workspaces.companyName, searchPattern),
        ilike(workspaces.organizationId, searchPattern),
        sql`${workspaces.id} IN (${workspaceIdsWithMatchingUser})`
      )
    )
    .limit(20);

    const enrichedResults = await Promise.all(
      results.map(async (ws) => {
        const [userCount] = await db.select({ count: sql<number>`count(*)::int` })
          .from(users)
          .where(eq(users.currentWorkspaceId, ws.id));
        
        return {
          ...ws,
          userCount: userCount?.count || 0,
        };
      })
    );

    res.json(enrichedResults);
  } catch (error: unknown) {
    log.error('[EndUserControl] Search error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

/**
 * GET /api/admin/end-users/workspace/:id
 * Get detailed workspace information including users
 */
endUserControlRouter.get('/workspace/:id', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);

    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const workspaceUsers = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.currentWorkspaceId, id))
    .orderBy(desc(users.lastLoginAt));

    const [employeeCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(eq(employees.workspaceId, id));

    const [clientCount] = await db.select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(eq(clients.workspaceId, id));

    res.json({
      workspace: {
        ...workspace,
        userCount: workspaceUsers.length,
        employeeCount: employeeCount?.count || 0,
        clientCount: clientCount?.count || 0,
      },
      users: workspaceUsers,
      accessConfig: [],
    });
  } catch (error: unknown) {
    log.error('[EndUserControl] Get workspace error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

/**
 * POST /api/admin/end-users/suspend
 * Suspend a workspace
 */
endUserControlRouter.post('/suspend', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, reason } = req.body;

    if (!workspaceId || !reason) {
      return res.status(400).json({ error: 'Workspace ID and reason are required' });
    }

    await db.transaction(async (tx) => {
      await tx.update(workspaces)
        .set({
          isSuspended: true,
          suspendedReason: reason,
          suspendedAt: new Date(),
          suspendedBy: req.user?.id,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
      await logAdminAction(req.user?.id || 'system', 'workspace_suspended', { workspaceId, reason }, tx);
    });

    res.json({ success: true, message: 'Workspace suspended' });
  } catch (error: unknown) {
    log.error('[EndUserControl] Suspend error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

/**
 * POST /api/admin/end-users/unsuspend
 * Unsuspend a workspace
 */
endUserControlRouter.post('/unsuspend', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    await db.transaction(async (tx) => {
      await tx.update(workspaces)
        .set({
          isSuspended: false,
          suspendedReason: null,
          suspendedAt: null,
          suspendedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
      await logAdminAction(req.user?.id || 'system', 'workspace_unsuspended', { workspaceId }, tx);
    });

    res.json({ success: true, message: 'Workspace unsuspended' });
  } catch (error: unknown) {
    log.error('[EndUserControl] Unsuspend error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

/**
 * POST /api/admin/end-users/toggle-ai-brain
 * Enable or disable AI Brain for a workspace
 */
endUserControlRouter.post('/toggle-ai-brain', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, enabled, reason } = req.body;

    if (!workspaceId) {
      return res.status(400).json({ error: 'Workspace ID is required' });
    }

    if (!enabled && !reason) {
      return res.status(400).json({ error: 'Reason is required when disabling AI Brain' });
    }

    await db.transaction(async (tx) => {
      await tx.update(workspaces)
        .set({
          aiBrainSuspended: !enabled,
          aiBrainSuspendedReason: enabled ? null : reason,
          aiBrainSuspendedAt: enabled ? null : new Date(),
          aiBrainSuspendedBy: enabled ? null : req.user?.id,
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, workspaceId));
      await logAdminAction(req.user?.id || 'system', enabled ? 'ai_brain_enabled' : 'ai_brain_suspended', { workspaceId, reason: reason || null }, tx);
    });

    res.json({ success: true, message: enabled ? 'AI Brain enabled' : 'AI Brain suspended' });
  } catch (error: unknown) {
    log.error('[EndUserControl] Toggle AI Brain error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

/**
 * PATCH /api/admin/end-users/access-config
 * Update user access configuration (role, permissions)
 */
endUserControlRouter.patch('/access-config', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, userId, config } = req.body;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace ID and User ID are required' });
    }

    if (!config || typeof config !== 'object') {
      return res.status(400).json({ error: 'Config object is required' });
    }

    const allowedFields: Record<string, boolean> = { role: true, isActive: true, loginAttempts: true, lockedUntil: true };
    const updateData: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      if (allowedFields[key]) {
        updateData[key] = value;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid config fields provided. Allowed: role, isActive, loginAttempts, lockedUntil' });
    }

    const [targetUser] = await db.select({ id: users.id, email: users.email, currentWorkspaceId: users.currentWorkspaceId })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.currentWorkspaceId, workspaceId)))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found in specified workspace' });
    }

    await db.transaction(async (tx) => {
      await tx.update(users).set(updateData).where(eq(users.id, userId));
      await logAdminAction(req.user?.id || 'system', 'access_config_updated', {
        workspaceId,
        userId,
        targetEmail: targetUser.email,
        updatedFields: Object.keys(updateData),
        config: updateData,
      }, tx);
    });

    // G24-04: Session invalidation is non-DB — runs after tx commits
    if (updateData.passwordHash || updateData.lockedUntil) {
      const { authService } = await import('../services/authService');
      await authService.logoutAllSessions(userId);
      log.info(`[EndUserControl] Sessions invalidated for user ${userId} due to security update`);
    }

    res.json({ success: true, message: 'Access configuration updated', updatedFields: Object.keys(updateData) });
  } catch (error: unknown) {
    log.error('[EndUserControl] Update access config error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

// ============================================================================
// Individual end-user freeze/suspend/lock capability
// These operate at the employee level (not workspace level) so support staff
// can target individual problematic end-users without affecting the whole org.
// ============================================================================

const PROTECTIVE_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
const RESTORATIVE_ROLES = [...PROTECTIVE_ROLES, 'support_agent'];

function requireProtectiveRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const userRole = req.platformRole || 'none';
  if (!PROTECTIVE_ROLES.includes(userRole)) {
    return res.status(403).json({ error: 'Protective actions require support_manager or higher' });
  }
  next();
}

endUserControlRouter.post('/freeze-user', requireSupportRole, requireProtectiveRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, userId, reason } = req.body;
    if (!workspaceId || !userId || !reason) {
      return res.status(400).json({ error: 'Workspace ID, User ID, and reason are required' });
    }

    const [targetUser] = await db.select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.currentWorkspaceId, workspaceId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found in specified workspace' });
    }

    await db.transaction(async (tx) => {
      await tx.update(users).set({ lockedUntil: new Date('2099-12-31'), loginAttempts: 999 }).where(eq(users.id, userId));
      await logAdminAction(req.user?.id || 'system', 'user_frozen', {
        workspaceId,
        userId,
        targetEmail: targetUser.email,
        reason,
        frozenBy: req.user?.id,
        actionType: 'individual_user_freeze',
      }, tx);
    });

    // G24-04: Session invalidation is non-DB — runs after tx commits
    const { authService } = await import('../services/authService');
    await authService.logoutAllSessions(userId);

    res.json({ success: true, message: 'User account frozen', userId, reason });
  } catch (error: unknown) {
    log.error('[EndUserControl] Freeze user error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

endUserControlRouter.post('/unfreeze-user', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, userId } = req.body;
    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace ID and User ID are required' });
    }

    const [targetUser] = await db.select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.currentWorkspaceId, workspaceId)))
      .limit(1);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found in specified workspace' });
    }

    await db.transaction(async (tx) => {
      await tx.update(users).set({ lockedUntil: null, loginAttempts: 0 }).where(eq(users.id, userId));
      await logAdminAction(req.user?.id || 'system', 'user_unfrozen', {
        workspaceId,
        userId,
        targetEmail: targetUser.email,
        unfrozenBy: req.user?.id,
        actionType: 'individual_user_unfreeze',
      }, tx);
    });

    res.json({ success: true, message: 'User account unfrozen', userId });
  } catch (error: unknown) {
    log.error('[EndUserControl] Unfreeze user error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

endUserControlRouter.post('/suspend-employee', requireSupportRole, requireProtectiveRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, employeeId, reason } = req.body;
    if (!workspaceId || !employeeId || !reason) {
      return res.status(400).json({ error: 'Workspace ID, Employee ID, and reason are required' });
    }

    const employee = await db.select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (!employee.length) {
      return res.status(404).json({ error: 'Employee not found in specified workspace' });
    }

    // Fetch userId before transaction for session invalidation after commit
    const [empUser] = await db.select({ userId: employees.userId }).from(employees).where(eq(employees.id, employeeId)).limit(1);

    await db.transaction(async (tx) => {
      await tx.update(employees).set({ isActive: false }).where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));
      await logAdminAction(req.user?.id || 'system', 'employee_suspended_by_support', {
        workspaceId,
        employeeId,
        employeeName: `${employee[0].firstName} ${employee[0].lastName}`,
        reason,
        suspendedBy: req.user?.id,
        actionType: 'individual_employee_suspend',
      }, tx);
    });

    // G24-04: Session invalidation is non-DB — runs after tx commits
    if (empUser?.userId) {
      const { authService } = await import('../services/authService');
      await authService.logoutAllSessions(empUser.userId);
    }

    res.json({ success: true, message: 'Employee suspended', employeeId, reason });
  } catch (error: unknown) {
    log.error('[EndUserControl] Suspend employee error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

endUserControlRouter.post('/reactivate-employee', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, employeeId } = req.body;
    if (!workspaceId || !employeeId) {
      return res.status(400).json({ error: 'Workspace ID and Employee ID are required' });
    }

    const employee = await db.select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    if (!employee.length) {
      return res.status(404).json({ error: 'Employee not found in specified workspace' });
    }

    await db.transaction(async (tx) => {
      await tx.update(employees).set({ isActive: true }).where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)));
      await logAdminAction(req.user?.id || 'system', 'employee_reactivated_by_support', {
        workspaceId,
        employeeId,
        employeeName: `${employee[0].firstName} ${employee[0].lastName}`,
        reactivatedBy: req.user?.id,
        actionType: 'individual_employee_reactivate',
      }, tx);
    });

    res.json({ success: true, message: 'Employee reactivated', employeeId });
  } catch (error: unknown) {
    log.error('[EndUserControl] Reactivate employee error:', error);
    res.status(500).json({ error: 'An internal error occurred' });
  }
});

export default endUserControlRouter;
