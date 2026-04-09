/**
 * UNIVERSAL ACCESS CONTROL PANEL (UACP) API ROUTES
 * =================================================
 * Fortune 500-grade access control management API.
 * Provides endpoints for:
 * - User/Agent identity management
 * - ABAC policy management
 * - Real-time access decisions
 * - Audit trail and event history
 */

import { Router } from 'express';
import { db } from '../db';
import { 
  agentIdentities, 
  entityAttributes, 
  accessPolicies, 
  accessControlEvents,
  users,
  InsertAccessPolicy,
  InsertEntityAttribute
} from '@shared/schema';
import { eq, and, or, desc, inArray, gte, lte, isNull, sql } from 'drizzle-orm';
import { policyDecisionPoint, EntityType } from '../services/uacp/policyDecisionPoint';
import { agentIdentityService } from '../services/uacp/agentIdentityService';
import { requireAuth } from '../auth';
import { createLogger } from '../lib/logger';
const log = createLogger('UacpRoutes');


const router = Router();

// Middleware to check admin access
const requireAdminAccess = (req: any, res: any, next: any) => {
  const user = req.user;
  const allowedRoles = ['org_owner', 'co_owner', 'org_admin', 'root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
  
  if (!allowedRoles.includes(user?.role) && !allowedRoles.includes(user?.platformRole)) {
    return res.status(403).json({ error: 'Insufficient permissions for UACP access' });
  }
  next();
};

// ============================================================================
// DASHBOARD & OVERVIEW
// ============================================================================

/**
 * GET /api/uacp/dashboard
 * Get UACP dashboard overview
 */
router.get('/dashboard', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user.workspaceId || user.currentWorkspaceId;

    // Count agents by status
    const agentStats = await db.select({
      status: agentIdentities.status,
      count: sql<number>`count(*)::int`
    })
    .from(agentIdentities)
    .where(or(
      eq(agentIdentities.isGlobal, true),
      ...(workspaceId ? [eq(agentIdentities.workspaceId, workspaceId)] : [])
    ))
    .groupBy(agentIdentities.status);

    // Count active policies
    const [policyCount] = await db.select({
      count: sql<number>`count(*)::int`
    })
    .from(accessPolicies)
    .where(and(
      eq(accessPolicies.isActive, true),
      or(
        eq(accessPolicies.isGlobal, true),
        ...(workspaceId ? [eq(accessPolicies.workspaceId, workspaceId)] : [])
      )
    ));

    // Recent access events
    const recentEvents = await db.select()
      .from(accessControlEvents)
      .where(or(
        isNull(accessControlEvents.workspaceId),
        ...(workspaceId ? [eq(accessControlEvents.workspaceId, workspaceId)] : [])
      ))
      .orderBy(desc(accessControlEvents.createdAt))
      .limit(10);

    res.json({
      agents: {
        byStatus: agentStats.reduce((acc, s) => ({ ...acc, [s.status]: s.count }), {}),
        total: agentStats.reduce((sum, s) => sum + s.count, 0),
      },
      policies: {
        active: policyCount?.count || 0,
      },
      recentEvents,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    log.error('[UACP] Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ============================================================================
// AUTHORIZATION DECISIONS (PDP)
// ============================================================================

/**
 * POST /api/uacp/authorize
 * Request an access decision from the PDP
 */
router.post('/authorize', requireAuth, async (req, res) => {
  try {
    const { subject, resource, context } = req.body;

    if (!subject?.entityType || !subject?.entityId || !resource?.resourceType || !resource?.resourceId) {
      return res.status(400).json({ error: 'Missing required fields: subject, resource' });
    }

    const decision = await policyDecisionPoint.authorize(subject, resource, context || {});
    res.json(decision);

  } catch (error) {
    log.error('[UACP] Authorization error:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
});

/**
 * GET /api/uacp/access-summary/:entityType/:entityId
 * Get access summary for an entity
 */
router.get('/access-summary/:entityType/:entityId', requireAdminAccess, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const user = req.user;

    const summary = await policyDecisionPoint.getAccessSummary(
      entityType as EntityType,
      entityId,
      user.currentWorkspaceId
    );

    res.json(summary);

  } catch (error) {
    log.error('[UACP] Access summary error:', error);
    res.status(500).json({ error: 'Failed to get access summary' });
  }
});

// ============================================================================
// AGENT IDENTITY MANAGEMENT
// ============================================================================

/**
 * GET /api/uacp/agents
 * List all agent identities
 */
router.get('/agents', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const agents = await agentIdentityService.listAgents(user.currentWorkspaceId);
    res.json({ agents });

  } catch (error) {
    log.error('[UACP] List agents error:', error);
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/uacp/agents/:agentId
 * Get a specific agent
 */
router.get('/agents/:agentId', requireAdminAccess, async (req, res) => {
  try {
    const agent = await agentIdentityService.getAgent(req.params.agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent });

  } catch (error) {
    log.error('[UACP] Get agent error:', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

/**
 * POST /api/uacp/agents
 * Register a new agent
 */
router.post('/agents', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { 
      agentId, name, description, entityType, 
      role, permissions, allowedTools, allowedDomains,
      missionObjective, riskProfile, maxAutonomyLevel,
      isGlobal
    } = req.body;

    if (!agentId || !name || !entityType) {
      return res.status(400).json({ error: 'Missing required fields: agentId, name, entityType' });
    }

    const result = await agentIdentityService.registerAgent({
      agentId,
      name,
      description,
      entityType,
      workspaceId: isGlobal ? undefined : user.currentWorkspaceId,
      isGlobal: isGlobal || false,
      role,
      permissions,
      allowedTools,
      allowedDomains,
      missionObjective,
      riskProfile,
      maxAutonomyLevel,
      createdBy: user.id,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.status(201).json({ agent: result.agent });

  } catch (error) {
    log.error('[UACP] Register agent error:', error);
    res.status(500).json({ error: 'Failed to register agent' });
  }
});

/**
 * PATCH /api/uacp/agents/:agentId
 * Update an agent's access settings
 */
router.patch('/agents/:agentId', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { agentId } = req.params;
    const updates = req.body;

    const result = await agentIdentityService.updateAgentAccess(agentId, updates, user.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const agent = await agentIdentityService.getAgent(agentId);
    res.json({ agent });

  } catch (error) {
    log.error('[UACP] Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

/**
 * POST /api/uacp/agents/:agentId/suspend
 * Suspend an agent's access
 */
router.post('/agents/:agentId/suspend', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { agentId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Suspension reason required' });
    }

    const result = await agentIdentityService.suspendAgent(agentId, user.id, reason);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: `Agent ${agentId} suspended`, suspended: true });

  } catch (error) {
    log.error('[UACP] Suspend agent error:', error);
    res.status(500).json({ error: 'Failed to suspend agent' });
  }
});

/**
 * POST /api/uacp/agents/:agentId/reactivate
 * Reactivate a suspended agent
 */
router.post('/agents/:agentId/reactivate', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { agentId } = req.params;

    const result = await agentIdentityService.reactivateAgent(agentId, user.id);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ message: `Agent ${agentId} reactivated`, active: true });

  } catch (error) {
    log.error('[UACP] Reactivate agent error:', error);
    res.status(500).json({ error: 'Failed to reactivate agent' });
  }
});

/**
 * POST /api/uacp/agents/:agentId/token
 * Issue a short-lived token for an agent
 */
router.post('/agents/:agentId/token', requireAdminAccess, async (req, res) => {
  try {
    const { agentId } = req.params;

    const result = await agentIdentityService.issueToken(agentId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ token: result.token });

  } catch (error) {
    log.error('[UACP] Issue token error:', error);
    res.status(500).json({ error: 'Failed to issue token' });
  }
});

// ============================================================================
// ENTITY ATTRIBUTES (ABAC)
// ============================================================================

/**
 * GET /api/uacp/attributes/:entityType/:entityId
 * Get attributes for an entity
 */
router.get('/attributes/:entityType/:entityId', requireAdminAccess, async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const user = req.user;

    const attributes = await db.select()
      .from(entityAttributes)
      .where(and(
        eq(entityAttributes.entityId, entityId),
        eq(entityAttributes.isActive, true),
        or(
          isNull(entityAttributes.workspaceId),
          eq(entityAttributes.workspaceId, req.workspaceId || user.workspaceId || user.currentWorkspaceId || 'no-workspace')
        )
      ))
      .orderBy(entityAttributes.attributeName);

    res.json({ attributes });

  } catch (error) {
    log.error('[UACP] Get attributes error:', error);
    res.status(500).json({ error: 'Failed to get attributes' });
  }
});

/**
 * POST /api/uacp/attributes
 * Create a new attribute for an entity
 */
router.post('/attributes', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { entityType, entityId, attributeName, attributeValue, attributeType, expiresAt } = req.body;

    if (!entityType || !entityId || !attributeName || attributeValue === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [attribute] = await db.insert(entityAttributes).values({
      entityType,
      entityId,
      workspaceId: user.currentWorkspaceId,
      attributeName,
      attributeValue: String(attributeValue),
      attributeType: attributeType || 'string',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: user.id,
    }).returning();

    // Invalidate PDP cache
    policyDecisionPoint.invalidateCache(user.currentWorkspaceId);

    res.status(201).json({ attribute });

  } catch (error: unknown) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Attribute already exists for this entity' });
    }
    log.error('[UACP] Create attribute error:', error);
    res.status(500).json({ error: 'Failed to create attribute' });
  }
});

/**
 * DELETE /api/uacp/attributes/:id
 * Delete an attribute
 */
router.delete('/attributes/:id', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user.workspaceId || user.currentWorkspaceId;

    await db.update(entityAttributes)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(entityAttributes.id, req.params.id), eq(entityAttributes.workspaceId, workspaceId)));

    policyDecisionPoint.invalidateCache(user.currentWorkspaceId);

    res.json({ deleted: true });

  } catch (error) {
    log.error('[UACP] Delete attribute error:', error);
    res.status(500).json({ error: 'Failed to delete attribute' });
  }
});

// ============================================================================
// ACCESS POLICIES
// ============================================================================

/**
 * GET /api/uacp/policies
 * List all access policies
 */
router.get('/policies', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;

    const policies = await db.select()
      .from(accessPolicies)
      .where(or(
        eq(accessPolicies.isGlobal, true),
        eq(accessPolicies.workspaceId, req.workspaceId || user.workspaceId || user.currentWorkspaceId || 'no-workspace')
      ))
      .orderBy(accessPolicies.priority);

    res.json({ policies });

  } catch (error) {
    log.error('[UACP] List policies error:', error);
    res.status(500).json({ error: 'Failed to list policies' });
  }
});

/**
 * POST /api/uacp/policies
 * Create a new access policy
 */
router.post('/policies', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { 
      name, description, effect, priority,
      subjectConditions, resourceType, resourcePattern,
      contextConditions, actions, maxTransactionAmount,
      isGlobal, validFrom, validUntil
    } = req.body;

    if (!name || !resourceType || !resourcePattern) {
      return res.status(400).json({ error: 'Missing required fields: name, resourceType, resourcePattern' });
    }

    // Only root/platform admins can create global policies
    if (isGlobal) {
      const adminRoles = ['root', 'platform_admin', 'root_admin'];
      if (!adminRoles.includes(user.role) && !adminRoles.includes(user.platformRole)) {
        return res.status(403).json({ error: 'Only platform admins can create global policies' });
      }
    }

    const [policy] = await db.insert(accessPolicies).values({
      name,
      description,
      workspaceId: isGlobal ? null : user.currentWorkspaceId,
      isGlobal: isGlobal || false,
      effect: effect || 'deny',
      priority: priority || 100,
      subjectConditions: subjectConditions || {},
      resourceType,
      resourcePattern,
      contextConditions: contextConditions || {},
      actions,
      maxTransactionAmount: maxTransactionAmount ? String(maxTransactionAmount) : null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      createdBy: user.id,
    }).returning();

    policyDecisionPoint.invalidateCache();

    res.status(201).json({ policy });

  } catch (error) {
    log.error('[UACP] Create policy error:', error);
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

/**
 * PATCH /api/uacp/policies/:id
 * Update a policy
 */
router.patch('/policies/:id', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const updates = req.body;
    const workspaceId = req.workspaceId || user.workspaceId || user.currentWorkspaceId;

    await db.update(accessPolicies)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(accessPolicies.id, req.params.id), eq(accessPolicies.workspaceId, workspaceId)));

    policyDecisionPoint.invalidateCache();

    const [policy] = await db.select()
      .from(accessPolicies)
      .where(eq(accessPolicies.id, req.params.id))
      .limit(1);

    res.json({ policy });

  } catch (error) {
    log.error('[UACP] Update policy error:', error);
    res.status(500).json({ error: 'Failed to update policy' });
  }
});

/**
 * DELETE /api/uacp/policies/:id
 * Deactivate a policy
 */
router.delete('/policies/:id', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const workspaceId = req.workspaceId || user.workspaceId || user.currentWorkspaceId;
    await db.update(accessPolicies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(accessPolicies.id, req.params.id), eq(accessPolicies.workspaceId, workspaceId)));

    policyDecisionPoint.invalidateCache();

    res.json({ deleted: true });

  } catch (error) {
    log.error('[UACP] Delete policy error:', error);
    res.status(500).json({ error: 'Failed to delete policy' });
  }
});

// ============================================================================
// ACCESS CONTROL EVENTS (AUDIT)
// ============================================================================

/**
 * GET /api/uacp/events
 * Get access control event history
 */
router.get('/events', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    const { limit = 50, eventType, targetId } = req.query;

    let query = db.select()
      .from(accessControlEvents)
      .where(or(
        isNull(accessControlEvents.workspaceId),
        eq(accessControlEvents.workspaceId, req.workspaceId || user.workspaceId || user.currentWorkspaceId || 'no-workspace')
      ))
      .orderBy(desc(accessControlEvents.createdAt))
      .limit(Math.min(Number(limit) || 50, 500));

    const events = await query;

    res.json({ events });

  } catch (error) {
    log.error('[UACP] Get events error:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// ============================================================================
// USER ACCESS MANAGEMENT
// ============================================================================

/**
 * GET /api/uacp/users
 * List users with their access levels
 */
router.get('/users', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;

    const userList = await db.select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      role: users.role,
      currentWorkspaceId: users.currentWorkspaceId,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.currentWorkspaceId, req.workspaceId || user.workspaceId || user.currentWorkspaceId || 'no-workspace'))
    .orderBy(users.email);

    res.json({ users: userList });

  } catch (error) {
    log.error('[UACP] List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * PATCH /api/uacp/users/:userId/role
 * Change a user's role
 */
router.patch('/users/:userId/role', requireAdminAccess, async (req, res) => {
  try {
    const actor = req.user;
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Allowlist: only valid workspace roles may be assigned via this endpoint.
    // org_owner is excluded — ownership transfer requires a dedicated flow.
    const ASSIGNABLE_WORKSPACE_ROLES = [
      'co_owner', 'org_admin', 'org_manager', 'manager',
      'department_manager', 'supervisor', 'staff', 'employee',
      'auditor', 'contractor',
    ];
    if (!ASSIGNABLE_WORKSPACE_ROLES.includes(role)) {
      return res.status(400).json({
        error: `Invalid role. Assignable workspace roles: ${ASSIGNABLE_WORKSPACE_ROLES.join(', ')}`,
      });
    }

    // Anti-escalation: actor cannot assign a role at or above their own level.
    const { WORKSPACE_ROLE_HIERARCHY } = await import('../rbac');
    const actorLevel = WORKSPACE_ROLE_HIERARCHY[actor.role] ?? 0;
    const targetRoleLevel = WORKSPACE_ROLE_HIERARCHY[role] ?? 0;
    if (targetRoleLevel >= actorLevel) {
      return res.status(403).json({ error: 'You cannot assign a role at or above your own level' });
    }

    // Get previous state
    const [targetUser] = await db.select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Workspace scope: actor can only manage users in their own workspace.
    // Prevents cross-tenant role manipulation.
    if (targetUser.currentWorkspaceId !== actor.currentWorkspaceId) {
      return res.status(403).json({ error: 'You can only manage users within your own workspace' });
    }

    // Anti-escalation: actor cannot demote/change someone at or above their own level.
    const currentTargetLevel = WORKSPACE_ROLE_HIERARCHY[targetUser.role ?? ''] ?? 0;
    if (currentTargetLevel >= actorLevel) {
      return res.status(403).json({ error: 'You cannot change the role of someone at or above your own level' });
    }

    const previousRole = targetUser.role;

    // Update role
    await db.update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Log event
    await db.insert(accessControlEvents).values({
      eventType: 'role_changed',
      priority: 'high',
      actorType: 'human',
      actorId: actor.id,
      actorRole: actor.role,
      targetType: 'human',
      targetId: userId,
      workspaceId: actor.currentWorkspaceId,
      changeDetails: {
        action: 'change_role',
        previousRole,
        newRole: role,
      },
      previousState: { role: previousRole },
      newState: { role },
    });

    policyDecisionPoint.invalidateCache(actor.currentWorkspaceId);

    res.json({ 
      message: `Role updated from ${previousRole} to ${role}`,
      userId,
      previousRole,
      newRole: role 
    });

  } catch (error) {
    log.error('[UACP] Change role error:', error);
    res.status(500).json({ error: 'Failed to change role' });
  }
});

/**
 * POST /api/uacp/seed-agents
 * Seed default platform agents (admin only)
 */
router.post('/seed-agents', requireAdminAccess, async (req, res) => {
  try {
    const user = req.user;
    
    // Only root/platform admins can seed agents
    const adminRoles = ['root', 'platform_admin', 'root_admin'];
    if (!adminRoles.includes(user.role) && !adminRoles.includes(user.platformRole)) {
      return res.status(403).json({ error: 'Only platform admins can seed agents' });
    }

    await agentIdentityService.seedPlatformAgents(user.id);

    res.json({ message: 'Platform agents seeded successfully' });

  } catch (error) {
    log.error('[UACP] Seed agents error:', error);
    res.status(500).json({ error: 'Failed to seed agents' });
  }
});

export default router;
