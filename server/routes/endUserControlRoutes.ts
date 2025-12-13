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

async function logAdminAction(actorId: string, action: string, details: any) {
  try {
    await db.insert(systemAuditLogs).values({
      actorId,
      actorType: 'platform_support',
      action,
      resourceType: 'workspace',
      resourceId: details.workspaceId || 'unknown',
      details,
      severity: action.includes('suspend') ? 'high' : 'medium',
    });
  } catch (error) {
    console.error('[EndUserControl] Failed to log action:', error);
  }
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
  } catch (error: any) {
    console.error('[EndUserControl] Search error:', error);
    res.status(500).json({ error: error.message });
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
  } catch (error: any) {
    console.error('[EndUserControl] Get workspace error:', error);
    res.status(500).json({ error: error.message });
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

    await db.update(workspaces)
      .set({
        isSuspended: true,
        suspendedReason: reason,
        suspendedAt: new Date(),
        suspendedBy: req.user?.id,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    await logAdminAction(req.user?.id || 'system', 'workspace_suspended', {
      workspaceId,
      reason,
    });

    res.json({ success: true, message: 'Workspace suspended' });
  } catch (error: any) {
    console.error('[EndUserControl] Suspend error:', error);
    res.status(500).json({ error: error.message });
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

    await db.update(workspaces)
      .set({
        isSuspended: false,
        suspendedReason: null,
        suspendedAt: null,
        suspendedBy: null,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    await logAdminAction(req.user?.id || 'system', 'workspace_unsuspended', {
      workspaceId,
    });

    res.json({ success: true, message: 'Workspace unsuspended' });
  } catch (error: any) {
    console.error('[EndUserControl] Unsuspend error:', error);
    res.status(500).json({ error: error.message });
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

    await db.update(workspaces)
      .set({
        aiBrainSuspended: !enabled,
        aiBrainSuspendedReason: enabled ? null : reason,
        aiBrainSuspendedAt: enabled ? null : new Date(),
        aiBrainSuspendedBy: enabled ? null : req.user?.id,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspaceId));

    await logAdminAction(req.user?.id || 'system', enabled ? 'ai_brain_enabled' : 'ai_brain_suspended', {
      workspaceId,
      reason: reason || null,
    });

    res.json({ success: true, message: enabled ? 'AI Brain enabled' : 'AI Brain suspended' });
  } catch (error: any) {
    console.error('[EndUserControl] Toggle AI Brain error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/admin/end-users/access-config
 * Update user access configuration
 */
endUserControlRouter.patch('/access-config', requireSupportRole, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { workspaceId, userId, config } = req.body;

    if (!workspaceId || !userId) {
      return res.status(400).json({ error: 'Workspace ID and User ID are required' });
    }

    await logAdminAction(req.user?.id || 'system', 'access_config_updated', {
      workspaceId,
      userId,
      config,
    });

    res.json({ success: true, message: 'Access configuration updated' });
  } catch (error: any) {
    console.error('[EndUserControl] Update access config error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default endUserControlRouter;
