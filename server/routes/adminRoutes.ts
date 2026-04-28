import { sanitizeError } from '../middleware/errorHandler';
import { Router } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  users,
  employees,
  workspaces,
  platformRoles,
  insertWorkspaceSchema,
  insertClientSchema,
  auditLogs,
} from '@shared/schema';
import { eq, and, desc, isNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { requirePlatformStaff, type AuthenticatedRequest } from "../rbac";
import { typedPool } from '../lib/typedSql';
import { cacheManager } from '../services/platform/cacheManager';
import { createLogger } from '../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../services/billing/billingConstants';
import { employeeInvitations } from '@shared/schema';
const log = createLogger('AdminRoutes');


function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

const router = Router();

// =========================================================================
// DEV SCRIPT EXECUTION ENDPOINT
// =========================================================================
// Security: Only available when ADMIN_SCRIPT_TOKEN is configured.
// Authentication: x-admin-token header (constant-time comparison).
// Whitelist-only: only pre-approved commands can run — no arbitrary execution.
// Usage: POST /api/admin/dev-execute
//        Headers: x-admin-token: <ADMIN_SCRIPT_TOKEN>
//        Body: { "command": "npx tsx create-dev-accounts.ts" }
// NOTE: Registered before requirePlatformStaff so the token auth is the sole guard.
// =========================================================================

const DEV_EXECUTE_ALLOWED_COMMANDS: Record<string, () => Promise<string>> = {
  'npx tsx create-dev-accounts.ts': async () => {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      const line = args.map((a) => String(a)).join(' ');
      lines.push(line);
      process.stdout.write(line + '\n');
    };
    const { createDevAccounts } = await import('../../create-dev-accounts');
    await createDevAccounts(capture);
    return lines.join('\n');
  },
};

router.post('/dev-execute', async (req: AuthenticatedRequest, res) => {
  if (process.env.NODE_ENV === 'production') {
    log.error('[DevExecute] Attempted dev-execute in production - blocked');
    return res.status(403).json({ error: 'dev-execute is not available in production environments' });
  }

  const expectedToken = process.env.ADMIN_SCRIPT_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({ error: 'ADMIN_SCRIPT_TOKEN is not configured on this server.' });
  }
  const provided = req.headers['x-admin-token'];
  if (!provided || typeof provided !== 'string') {
    log.warn('[DevExecute] Rejected — missing x-admin-token');
    return res.status(401).json({ error: 'Invalid or missing x-admin-token header.' });
  }
  try {
    const providedBuf = Buffer.from(provided);
    const expectedBuf = Buffer.from(expectedToken);
    if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      log.warn('[DevExecute] Rejected — invalid x-admin-token');
      return res.status(401).json({ error: 'Invalid or missing x-admin-token header.' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid or missing x-admin-token header.' });
  }

  const { command } = req.body ?? {};
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Request body must include a "command" string.' });
  }
  const handler = DEV_EXECUTE_ALLOWED_COMMANDS[command.trim()];
  if (!handler) {
    log.warn(`[DevExecute] Rejected disallowed command: ${command}`);
    return res.status(400).json({ error: `Command not allowed: "${command}". Check the server whitelist.` });
  }
  try {
    log.info(`[DevExecute] Running: ${command}`);
    const output = await handler();
    log.info('[DevExecute] Completed successfully');
    return res.json({ success: true, command, output });
  } catch (error: unknown) {
    log.error('[DevExecute] Command failed:', error);
    return res.status(500).json({ success: false, command, error: sanitizeError(error) });
  }
});

router.use(requirePlatformStaff);

router.patch('/workspace/:workspaceId', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = req.params;
    
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const { ownerId, ...updateData } = req.body;
    const validated = insertWorkspaceSchema.partial().parse(updateData);

    const updated = await storage.updateWorkspace(workspaceId, validated);
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    log.info(`[AUDIT] Platform staff ${req.user.id} (${req.platformRole}) updated workspace ${workspaceId}`);
    
    res.json(updated);
  } catch (error: unknown) {
    log.error("Error updating workspace (admin):", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to update workspace" });
  }
});

router.get('/support/search', async (req: AuthenticatedRequest, res) => {
  try {
    const { q } = req.query;
    
    if (!q || typeof q !== 'string') {
      return res.status(400).json({ message: "Search query required" });
    }

    const adminSupport = await import('../adminSupport');
    const results = await adminSupport.searchCustomers(q);
    res.json(results);
  } catch (error) {
    log.error("Error searching customers:", error);
    res.status(500).json({ message: "Failed to search customers" });
  }
});

router.get('/support/workspace/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const adminSupport = await import('../adminSupport');
    const detail = await adminSupport.getWorkspaceDetail(id);
    
    if (!detail) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    res.json(detail);
  } catch (error) {
    log.error("Error fetching workspace detail:", error);
    res.status(500).json({ message: "Failed to fetch workspace detail" });
  }
});

router.get('/support/stats', async (req: AuthenticatedRequest, res) => {
  try {
    const adminSupport = await import('../adminSupport');
    const stats = await adminSupport.getPlatformStats();
    res.json(stats);
  } catch (error) {
    log.error("Error fetching platform stats:", error);
    res.status(500).json({ message: "Failed to fetch platform statistics" });
  }
});

// ─── Universal Identity — Phase 22 ───────────────────────────────────────────
// Platform-staff-only endpoints that let support agents resolve any caller
// by their universal identity code (org_id, employee_number, client_number)
// and — for support-manager+ — rewrite one when two entities have collided.

router.get('/identity/resolve', async (req: AuthenticatedRequest, res) => {
  try {
    const raw = typeof req.query.code === 'string' ? req.query.code : '';
    const code = raw.trim();
    if (!code) {
      return res.status(400).json({ error: 'MISSING_CODE', message: 'Query param ?code is required' });
    }

    const { supportLookup } = await import('../services/identityService');
    const matches = await supportLookup(code);

    if (!matches.length) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        query: code,
        matches: [],
      });
    }

    // Enrich each match with workspace context + PIN-set status so the agent
    // dashboard can show the tenant + whether PIN protection is configured.
    const enriched = [];
    for (const m of matches) {
      let workspace: Record<string, unknown> | null = null;
      if (m.orgId) {
        try {
          const { rows } = await typedPool<Record<string, unknown>>(
            `SELECT id, name, company_name, org_id, subscription_tier, subscription_status,
                    (owner_pin_hash IS NOT NULL) AS owner_pin_set
               FROM workspaces WHERE id = $1 LIMIT 1`,
            [m.orgId],
          );
          workspace = rows[0] || null;
        } catch (e: any) {
          log.warn(`[identity/resolve] workspace enrich failed for ${m.orgId}: ${e?.message}`);
        }
      }

      let pinSet: boolean | null = null;
      try {
        if (m.entityType === 'org' && m.orgId) {
          const { rows } = await typedPool<{ owner_pin_hash: string | null }>(
            `SELECT owner_pin_hash FROM workspaces WHERE id = $1`,
            [m.orgId],
          );
          pinSet = !!rows[0]?.owner_pin_hash;
        } else if (m.entityType === 'employee') {
          const { rows } = await typedPool<{ clockin_pin_hash: string | null }>(
            `SELECT clockin_pin_hash FROM employees WHERE id = $1`,
            [m.entityId],
          );
          pinSet = !!rows[0]?.clockin_pin_hash;
        } else if (m.entityType === 'client') {
          const { rows } = await typedPool<{ client_pin_hash: string | null }>(
            `SELECT client_pin_hash FROM clients WHERE id = $1`,
            [m.entityId],
          );
          pinSet = !!rows[0]?.client_pin_hash;
        }
      } catch (e: any) {
        log.warn(`[identity/resolve] pin-status lookup failed for ${m.entityType} ${m.entityId}: ${e?.message}`);
      }

      enriched.push({ ...m, workspace, pinSet });
    }

    log.info(
      `[AUDIT] Platform staff ${req.user?.id} (${req.platformRole}) resolved identity ${code} (${enriched.length} matches)`,
    );

    res.json({ query: code, matches: enriched });
  } catch (error) {
    log.error('Error resolving identity code:', error);
    res.status(500).json({ message: 'Failed to resolve identity' });
  }
});

router.post('/identity/rewrite', async (req: AuthenticatedRequest, res) => {
  try {
    const { entity, entityId, newCode, reason } = req.body || {};

    if (!entity || !['workspace', 'employee', 'client'].includes(entity)) {
      return res.status(400).json({
        error: 'INVALID_ENTITY',
        message: 'entity must be one of: workspace | employee | client',
      });
    }
    if (!entityId || typeof entityId !== 'string') {
      return res.status(400).json({ error: 'MISSING_ENTITY_ID', message: 'entityId is required' });
    }
    if (!newCode || typeof newCode !== 'string') {
      return res.status(400).json({ error: 'MISSING_NEW_CODE', message: 'newCode is required' });
    }
    if (!reason || typeof reason !== 'string' || reason.trim().length < 8) {
      return res.status(400).json({
        error: 'MISSING_REASON',
        message: 'reason must be at least 8 characters so the override is replayable',
      });
    }

    const actorUserId = req.user?.id;
    const actorPlatformRole = req.platformRole;

    if (!actorUserId) {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }

    const { rewriteUniversalId } = await import('../services/identityOverrideService');
    const result = await rewriteUniversalId({
      entity,
      entityId,
      newCode: newCode.trim(),
      reason: reason.trim(),
      actorUserId,
      actorPlatformRole: actorPlatformRole || 'none',
    });

    res.json(result);
  } catch (error: any) {
    const msg = error?.message || 'Failed to rewrite identity';
    log.error('Error rewriting identity code:', msg);
    if (msg.startsWith('IDENTITY_OVERRIDE_FORBIDDEN')) {
      return res.status(403).json({ error: 'FORBIDDEN', message: msg });
    }
    if (msg.startsWith('IDENTITY_OVERRIDE_INVALID')) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: msg });
    }
    if (msg.startsWith('IDENTITY_OVERRIDE_NOT_FOUND')) {
      return res.status(404).json({ error: 'NOT_FOUND', message: msg });
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: msg });
  }
});

function mapEventTypeToActivityType(eventType: string) {
  if (eventType.includes('LOGIN') || eventType.includes('SESSION')) return 'login';
  if (eventType.includes('SHIFT') || eventType.includes('SCHEDULE')) return 'shift_created';
  if (eventType.includes('INVOICE') || eventType.includes('PAYMENT')) return 'invoice_generated';
  if (eventType.includes('EMPLOYEE') || eventType.includes('USER_CREATED')) return 'employee_added';
  if (eventType.includes('ERROR') || eventType.includes('FAIL')) return 'error';
  return 'login';
}

router.get('/platform/activities', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const activities = await storage.getAuditEvents({ limit });
    const liveActivities = activities.map((event) => ({
      id: event.id,
      timestamp: event.createdAt?.toISOString() || new Date().toISOString(),
      user: (event as any).actorName || (event as any).actorId || 'System',
      action: (event as any).payload?.description || `${(event as any).eventType}: ${(event as any).aggregateType}`,
      workspace: event.workspaceId || 'Platform',
      // @ts-expect-error — TS migration: fix in refactoring sprint
      type: mapEventTypeToActivityType(event.eventType),
    }));
    res.json(liveActivities);
  } catch (error) {
    log.error("Error fetching platform activities:", error);
    res.status(500).json({ message: "Failed to fetch platform activities" });
  }
});

router.get('/platform/roles', async (req: AuthenticatedRequest, res) => {
  try {
    const roleAssignments = await db
      .select({
        id: platformRoles.id,
        userId: platformRoles.userId,
        role: platformRoles.role,
        grantedAt: platformRoles.createdAt,
        grantedBy: platformRoles.grantedBy,
        grantedReason: platformRoles.grantedReason,
        userEmail: users.email,
        userFirstName: users.firstName,
        userLastName: users.lastName,
      })
      .from(platformRoles)
      .leftJoin(users, eq(platformRoles.userId, users.id))
      .where(isNull(platformRoles.revokedAt))
      .orderBy(desc(platformRoles.createdAt));

    res.json(roleAssignments);
  } catch (error) {
    log.error('Error fetching platform roles:', error);
    res.status(500).json({ message: 'Failed to fetch platform roles' });
  }
});

router.post('/platform/roles', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, role, reason } = req.body;

    if (!userId || !role) {
      return res.status(400).json({ message: 'User ID and role are required' });
    }

    const validRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'compliance_officer', 'Bot', 'none'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be one of: ' + validRoles.join(', ') });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (role !== 'none') {
      const { getPlatformRoleLevel } = await import('../rbac');
      const requesterLevel = getPlatformRoleLevel(req.platformRole as string);
      const targetRoleLevel = getPlatformRoleLevel(role);
      if (targetRoleLevel >= requesterLevel) {
        return res.status(403).json({ message: 'You cannot assign a role at or above your own platform level' });
      }
    }

    await db
      .update(platformRoles)
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .set({ revokedAt: new Date(), revokedBy: req.user.id, revokedReason: reason || 'Role changed by platform admin' })
      .where(and(eq(platformRoles.userId, userId), isNull(platformRoles.revokedAt)));

    if (role === 'none') {
      await storage.createAuditLog({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        userId: req.user.id,
        workspaceId: null,
        action: 'platform_role_removed',
        entityType: 'platform_role',
        entityId: userId,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        details: {
          targetUserId: userId,
          targetEmail: user.email,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          removedBy: req.user.email,
          reason: reason || 'Role removed by platform admin',
        },
        ipAddress: req.ip || req.socket.remoteAddress,
      });

      return res.json({ success: true, message: 'Platform role removed successfully' });
    }

    const [newRole] = await db
      .insert(platformRoles)
      .values({
        // @ts-expect-error — TS migration: fix in refactoring sprint
        workspaceId: PLATFORM_WORKSPACE_ID,
        userId,
        role,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        grantedBy: req.user.id,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        grantedReason: reason || `Role assigned by ${req.user.email || 'platform admin'}`,
      })
      .returning();

    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user.id,
      workspaceId: null,
      action: 'platform_role_assigned',
      entityType: 'platform_role',
      entityId: newRole.id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      details: {
        targetUserId: userId,
        targetEmail: user.email,
        role,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        assignedBy: req.user.email,
        reason: reason || 'Role assigned by platform admin',
      },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    const { broadcastPlatformUpdateGlobal } = await import('../websocket');
    broadcastPlatformUpdateGlobal({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      type: 'platform_role_changed',
      title: 'Platform Role Updated',
      message: `${user.email} has been assigned the ${role} role`,
      timestamp: new Date().toISOString(),
    });

    res.json({ 
      success: true, 
      message: `Platform role ${role} assigned successfully`,
      role: newRole 
    });
  } catch (error) {
    log.error('Error assigning platform role:', error);
    res.status(500).json({ message: 'Failed to assign platform role' });
  }
});

router.get('/platform/onboarding', async (req: AuthenticatedRequest, res) => {
  try {
    const allWorkspaces = await db.select({
      id: workspaces.id,
      name: workspaces.name,
      tier: workspaces.subscriptionTier,
      subscriptionStatus: workspaces.subscriptionStatus,
      isActive: sql<boolean>`${workspaces.subscriptionStatus} = 'active'`,
      createdAt: workspaces.createdAt,
    }).from(workspaces);

    const employeeCounts = await db.select({
      workspaceId: employees.workspaceId,
      count: sql<number>`count(*)::int`,
      activeCount: sql<number>`count(*) filter (where ${employees.isActive} = true)::int`,
      onboardingCount: sql<number>`count(*) filter (where ${employees.isActive} = false)::int`,
    })
    .from(employees)
    .groupBy(employees.workspaceId);

    const invitationCounts = await db.select({
      workspaceId: employeeInvitations.workspaceId,
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${employeeInvitations.inviteStatus} = 'pending')::int`,
      accepted: sql<number>`count(*) filter (where ${employeeInvitations.inviteStatus} = 'accepted')::int`,
      expired: sql<number>`count(*) filter (where ${employeeInvitations.inviteStatus} = 'expired')::int`,
      revoked: sql<number>`count(*) filter (where ${employeeInvitations.inviteStatus} = 'revoked')::int`,
    })
    .from(employeeInvitations)
    .groupBy(employeeInvitations.workspaceId);

    const empCountMap = new Map(employeeCounts.map(e => [e.workspaceId, e]));
    const invCountMap = new Map(invitationCounts.map(i => [i.workspaceId, i]));

    const enrichedWorkspaces = allWorkspaces.map(ws => {
      const empStats = empCountMap.get(ws.id) || { count: 0, activeCount: 0, onboardingCount: 0 };
      const invStats = invCountMap.get(ws.id) || { total: 0, pending: 0, accepted: 0, expired: 0, revoked: 0 };
      
      let onboardingStatus = 'complete';
      if (empStats.count === 0 && invStats.pending === 0) {
        onboardingStatus = 'not_started';
      } else if (empStats.onboardingCount > 0 || invStats.pending > 0) {
        onboardingStatus = 'in_progress';
      }

      return {
        ...ws,
        employeeCount: empStats.count,
        activeEmployees: empStats.activeCount,
        onboardingEmployees: empStats.onboardingCount,
        invitations: {
          total: invStats.total,
          pending: invStats.pending,
          accepted: invStats.accepted,
          expired: invStats.expired,
          revoked: invStats.revoked,
        },
        onboardingStatus,
      };
    });

    const platformStats = {
      totalWorkspaces: allWorkspaces.length,
      activeWorkspaces: allWorkspaces.filter(w => w.isActive).length,
      totalEmployees: employeeCounts.reduce((sum, e) => sum + e.count, 0),
      totalOnboarding: employeeCounts.reduce((sum, e) => sum + e.onboardingCount, 0),
      totalPendingInvitations: invitationCounts.reduce((sum, i) => sum + i.pending, 0),
      totalAcceptedInvitations: invitationCounts.reduce((sum, i) => sum + i.accepted, 0),
      totalExpiredInvitations: invitationCounts.reduce((sum, i) => sum + i.expired, 0),
    };

    res.json({
      workspaces: enrichedWorkspaces,
      stats: platformStats,
    });
  } catch (error) {
    log.error('Error fetching platform onboarding data:', error);
    res.status(500).json({ message: 'Failed to fetch platform onboarding data' });
  }
});

router.get('/admin/metrics', async (req: AuthenticatedRequest, res) => {
  try {
    const { wsCounter } = await import('../services/websocketCounter');
    const wsStats = wsCounter.getStatistics();

    // Get active workspaces
    const [activeWorkspacesResult] = await db.select({
      count: sql<number>`count(*)::int`
    }).from(workspaces).where(eq(workspaces.subscriptionStatus, 'active'));

    // Get total employees
    const [totalEmployeesResult] = await db.select({
      count: sql<number>`count(*)::int`
    }).from(employees);

    // Requests last minute (from monitoring service)
    const { monitoringService } = await import('../monitoring');
    const systemMetrics = monitoringService.getSystemMetrics();

    res.json({
      activeConnections: wsStats.totalConnections,
      activeWorkspaces: activeWorkspacesResult.count,
      totalEmployees: totalEmployeesResult.count,
      requestsLastMinute: 0, // Fallback as monitoring doesn't expose 1m rolling count currently
      system: systemMetrics
    });
  } catch (error) {
    log.error("Error fetching admin metrics:", error);
    res.status(500).json({ message: "Failed to fetch admin metrics" });
  }
});

router.get('/platform/invitations', async (req: AuthenticatedRequest, res) => {
  try {
    const status = req.query.status as string || 'pending';
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    let statusCondition = eq(employeeInvitations.inviteStatus, status as any);
    if (status === 'all') {
      statusCondition = sql`1=1` as any;
    }

    const invitations = await db.select({
      id: employeeInvitations.id,
      email: employeeInvitations.email,
      firstName: employeeInvitations.firstName,
      lastName: employeeInvitations.lastName,
      workspaceId: employeeInvitations.workspaceId,
      inviteStatus: employeeInvitations.inviteStatus,
      invitedAt: employeeInvitations.invitedAt,
      expiresAt: employeeInvitations.expiresAt,
      openedAt: employeeInvitations.openedAt,
      acceptedAt: employeeInvitations.acceptedAt,
      workspaceName: workspaces.name,
    })
    .from(employeeInvitations)
    .leftJoin(workspaces, eq(employeeInvitations.workspaceId, workspaces.id))
    .where(statusCondition)
    .orderBy(desc(employeeInvitations.invitedAt))
    .limit(limit)
    .offset(offset);

    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
      .from(employeeInvitations)
      .where(statusCondition);

    res.json({
      invitations,
      total: count,
      limit,
      offset,
    });
  } catch (error) {
    log.error('Error fetching platform invitations:', error);
    res.status(500).json({ message: 'Failed to fetch invitations' });
  }
});

router.get('/support/lookup', async (req: AuthenticatedRequest, res) => {
  try {
    const query = String(req.query.q || '').trim();
    
    if (!query) {
      return res.status(400).json({ message: "Query parameter 'q' is required" });
    }

    const { supportLookup } = await import('../services/identityService');
    const results = await supportLookup(query);
    
    res.json({ results });
  } catch (error) {
    log.error("Error performing support lookup:", error);
    res.status(500).json({ message: "Failed to perform lookup" });
  }
});

router.post('/support/change-role', async (req: AuthenticatedRequest, res) => {
  try {
    const { employeeId, newRole } = req.body;
    const adminUserId = req.user?.id;

    const adminSupport = await import('../adminSupport');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await adminSupport.changeUserRole(employeeId, newRole, adminUserId);
    res.json(result);
  } catch (error) {
    log.error("Error changing user role:", error);
    res.status(500).json({ message: "Failed to change user role" });
  }
});

router.get('/support/sessions', async (req: AuthenticatedRequest, res) => {
  try {
    const sessions = await (storage as any).getAllSupportSessions();
    
    const enrichedSessions = await Promise.all(sessions.map(async (session: any) => {
      const workspace = await storage.getWorkspace(session.targetOrgId);
      const staffUser = await storage.getUser(session.staffUserId);
      const auditLogsList = await storage.getSupportAuditLogs({ sessionId: session.id });
      
      return {
        ...session,
        targetOrgName: workspace?.name || 'Unknown',
        staffEmail: staffUser?.email,
        staffName: staffUser ? `${staffUser.firstName || ''} ${staffUser.lastName || ''}`.trim() : null,
        actionsCount: auditLogsList.length,
      };
    }));
    
    res.json(enrichedSessions);
  } catch (error) {
    log.error('[Support Sessions] List error:', error);
    res.status(500).json({ message: 'Failed to list support sessions' });
  }
});

router.post('/support/sessions/start', async (req: AuthenticatedRequest, res) => {
  try {
    const adminUserId = req.user?.id;
    const { workspaceId, scope = 'read_only', reason } = req.body;

    if (!adminUserId || !workspaceId) {
      return res.status(400).json({ message: "Missing adminUserId or workspaceId" });
    }

    const existingSession = await storage.getActiveSupportSessionByAdmin(adminUserId);
    if (existingSession) {
      return res.status(409).json({ 
        message: "You already have an active support session",
        activeSession: {
          id: existingSession.id,
          workspaceId: existingSession.workspaceId,
          startedAt: existingSession.startedAt
        }
      });
    }

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const session = await storage.createSupportSession({
      adminUserId,
      workspaceId,
      scope,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      reason: reason || 'Support access',
      isOrgFrozen: false,
    });

    await storage.createSupportAuditLog({
      sessionId: session.id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      adminUserId,
      workspaceId,
      action: 'session_started',
      severity: 'read',
      metadata: { scope, reason },
    });

    log.info(`[SupportSession] Session started: ${session.id} by ${adminUserId} for ${workspaceId} (${scope})`);

    res.json({ 
      success: true, 
      session: {
        id: session.id,
        workspaceId: session.workspaceId,
        scope: session.scope,
        startedAt: session.startedAt,
      },
      workspace: {
        id: workspace.id,
        name: workspace.companyName,
      }
    });
  } catch (error) {
    log.error("Error starting support session:", error);
    res.status(500).json({ message: "Failed to start support session" });
  }
});

router.post('/support/sessions/end', async (req: AuthenticatedRequest, res) => {
  try {
    const adminUserId = req.user?.id;
    if (!adminUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const activeSession = await storage.getActiveSupportSessionByAdmin(adminUserId);
    if (!activeSession) {
      return res.status(404).json({ message: "No active support session found" });
    }

    const auditLogsList = await storage.getSupportAuditLogs({
      sessionId: activeSession.id,
      limit: 100,
    });

    const actionsSummary = auditLogsList.map(log => ({
      action: log.action,
      severity: log.severity,
      timestamp: (log as any).timestamp,
    }));

    const endedSession = await storage.endSupportSession(activeSession.id, actionsSummary);

    await storage.createSupportAuditLog({
      sessionId: activeSession.id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      adminUserId,
      workspaceId: activeSession.workspaceId,
      action: 'session_ended',
      severity: 'read',
      metadata: { 
        duration: endedSession?.endedAt 
          // @ts-expect-error — TS migration: fix in refactoring sprint
          ? new Date(endedSession.endedAt).getTime() - new Date(activeSession.startedAt).getTime()
          : 0,
        actionCount: actionsSummary.length,
      },
    });

    log.info(`[SupportSession] Session ended: ${activeSession.id}`);

    res.json({ 
      success: true, 
      session: endedSession,
      summary: {
        duration: endedSession?.endedAt 
          // @ts-expect-error — TS migration: fix in refactoring sprint
          ? Math.round((new Date(endedSession.endedAt).getTime() - new Date(activeSession.startedAt).getTime()) / 1000 / 60) 
          : 0,
        actionCount: actionsSummary.length,
      }
    });
  } catch (error) {
    log.error("Error ending support session:", error);
    res.status(500).json({ message: "Failed to end support session" });
  }
});

router.get('/support/sessions/current', async (req: AuthenticatedRequest, res) => {
  try {
    const adminUserId = req.user?.id;
    if (!adminUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const activeSession = await storage.getActiveSupportSessionByAdmin(adminUserId);
    if (!activeSession) {
      return res.json({ hasActiveSession: false });
    }

    const workspace = await storage.getWorkspace(activeSession.workspaceId);

    res.json({ 
      hasActiveSession: true,
      session: {
        id: activeSession.id,
        workspaceId: activeSession.workspaceId,
        workspaceName: workspace?.companyName,
        scope: activeSession.scope,
        startedAt: activeSession.startedAt,
        isOrgFrozen: activeSession.isOrgFrozen,
        freezeReason: activeSession.freezeReason,
      }
    });
  } catch (error) {
    log.error("Error getting current session:", error);
    res.status(500).json({ message: "Failed to get current session" });
  }
});

router.post('/support/sessions/freeze', async (req: AuthenticatedRequest, res) => {
  try {
    const adminUserId = req.user?.id;
    const { freeze = true, reason } = req.body;

    if (!adminUserId) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const activeSession = await storage.getActiveSupportSessionByAdmin(adminUserId);
    if (!activeSession) {
      return res.status(403).json({ 
        message: "Active support session required to freeze/unfreeze organization" 
      });
    }

    const success = await storage.setOrgFrozen(activeSession.workspaceId, freeze, reason);
    if (!success) {
      return res.status(500).json({ message: "Failed to update freeze status" });
    }

    await storage.createSupportAuditLog({
      sessionId: activeSession.id,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      adminUserId,
      workspaceId: activeSession.workspaceId,
      action: freeze ? 'org_frozen' : 'org_unfrozen',
      severity: 'write',
      metadata: { reason },
    });

    log.info(`[SupportSession] Org ${freeze ? 'frozen' : 'unfrozen'}: ${activeSession.workspaceId} (session: ${activeSession.id})`);

    res.json({ 
      success: true, 
      frozen: freeze,
      workspaceId: activeSession.workspaceId
    });
  } catch (error) {
    log.error("Error freezing/unfreezing org:", error);
    res.status(500).json({ message: "Failed to freeze/unfreeze organization" });
  }
});

router.get('/support/audit-logs', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, sessionId, severity, limit = 100, offset = 0 } = req.query;
    // M13: Clamp limit to prevent unbounded audit log queries
    const clampedLimit = Math.min(Math.max(Number(limit), 1), 500);
    const clampedOffset = Math.max(Number(offset), 0);

    const logs = await storage.getSupportAuditLogs({
      workspaceId: workspaceId as string,
      sessionId: sessionId as string,
      severity: severity as string,
      limit: clampedLimit,
      offset: clampedOffset,
    });

    res.json({ logs, count: logs.length });
  } catch (error) {
    log.error("Error fetching audit logs:", error);
    res.status(500).json({ message: "Failed to fetch audit logs" });
  }
});

router.post('/support/suspend-account', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, reason } = req.body;
    const adminUserId = req.user?.id;
    
    await storage.updateWorkspace(workspaceId, {
      isSuspended: true,
      suspendedReason: reason,
      suspendedAt: new Date(),
      suspendedBy: adminUserId,
      subscriptionStatus: 'suspended',
    });
    cacheManager.invalidateWorkspace(workspaceId); // Phase 26: refresh Trinity gate
    res.json({ success: true, message: "Account suspended successfully" });
  } catch (error) {
    log.error("Error suspending account:", error);
    res.status(500).json({ message: "Failed to suspend account" });
  }
});

router.post('/support/unsuspend-account', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = req.body;
    
    await storage.updateWorkspace(workspaceId, {
      isSuspended: false,
      suspendedReason: null,
      suspendedAt: null,
      suspendedBy: null,
      subscriptionStatus: 'active',
    });
    cacheManager.invalidateWorkspace(workspaceId); // Phase 26: refresh Trinity gate
    res.json({ success: true, message: "Account unsuspended successfully" });
  } catch (error) {
    log.error("Error unsuspending account:", error);
    res.status(500).json({ message: "Failed to unsuspend account" });
  }
});

router.post('/support/freeze-account', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, reason } = req.body;
    const adminUserId = req.user?.id;
    
    await storage.updateWorkspace(workspaceId, {
      isFrozen: true,
      frozenReason: reason || "Account frozen for non-payment",
      frozenAt: new Date(),
      frozenBy: adminUserId,
    });
    res.json({ success: true, message: "Account frozen successfully" });
  } catch (error) {
    log.error("Error freezing account:", error);
    res.status(500).json({ message: "Failed to freeze account" });
  }
});

router.post('/support/unfreeze-account', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = req.body;
    
    await storage.updateWorkspace(workspaceId, {
      isFrozen: false,
      frozenReason: null,
      frozenAt: null,
      frozenBy: null,
    });
    res.json({ success: true, message: "Account unfrozen successfully" });
  } catch (error) {
    log.error("Error unfreezing account:", error);
    res.status(500).json({ message: "Failed to unfreeze account" });
  }
});

router.post('/support/lock-account', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, reason } = req.body;
    const adminUserId = req.user?.id;
    
    await storage.updateWorkspace(workspaceId, {
      isLocked: true,
      lockedReason: reason || "Account locked for security reasons",
      lockedAt: new Date(),
      lockedBy: adminUserId,
    });
    res.json({ success: true, message: "Account locked successfully" });
  } catch (error) {
    log.error("Error locking account:", error);
    res.status(500).json({ message: "Failed to lock account" });
  }
});

router.post('/support/unlock-account', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = req.body;
    
    await storage.updateWorkspace(workspaceId, {
      isLocked: false,
      lockedReason: null,
      lockedAt: null,
      lockedBy: null,
    });
    res.json({ success: true, message: "Account unlocked successfully" });
  } catch (error) {
    log.error("Error unlocking account:", error);
    res.status(500).json({ message: "Failed to unlock account" });
  }
});

router.post('/support/delete-user', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, workspaceId, reason } = req.body;
    const adminUserId = req.user?.id;
    
    const employee = await (storage as any).getEmployee(userId);
    if (!employee || employee.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Employee not found in specified workspace" });
    }
    
    const { getPlatformRoleLevel } = await import('../rbac');
    const adminPlatformLevel = getPlatformRoleLevel(req.platformRole as string);
    if (adminPlatformLevel < getPlatformRoleLevel('deputy_admin')) {
      const { getWorkspaceRoleLevel } = await import('../rbac');
      const targetWsLevel = getWorkspaceRoleLevel(employee.workspaceRole as string);
      if (targetWsLevel >= 5) {
        return res.status(403).json({ message: "Only deputy admins and above can delete organization owners or admins" });
      }
    }
    
    await (storage as any).deleteEmployee(userId);
    
    res.json({ 
      success: true, 
      message: "User deleted successfully",
      deletedBy: adminUserId,
      reason 
    });
  } catch (error) {
    log.error("Error deleting user:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

router.post('/support/change-user-role', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId, newRole, workspaceId } = req.body;
    const adminUserId = req.user?.id;
    
    const employee = await (storage as any).getEmployee(userId);
    if (!employee || employee.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Employee not found in specified workspace" });
    }
    
    const { getPlatformRoleLevel, getWorkspaceRoleLevel } = await import('../rbac');
    const adminPlatformLevel = getPlatformRoleLevel(req.platformRole as string);
    const targetCurrentLevel = getWorkspaceRoleLevel(employee.workspaceRole as string);
    if (adminPlatformLevel < getPlatformRoleLevel('deputy_admin') && targetCurrentLevel >= 5) {
      return res.status(403).json({ message: "Only deputy admins and above can change roles of organization owners or admins" });
    }
    
    await (storage as any).updateEmployee(userId, { role: newRole });
    
    res.json({ 
      success: true, 
      message: `User role changed to ${newRole}`,
      actionBy: adminUserId 
    });
  } catch (error) {
    log.error("Error changing user role:", error);
    res.status(500).json({ message: "Failed to change user role" });
  }
});

router.post('/support/create-client', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, clientData } = req.body;
    const adminUserId = req.user?.id;
    
    const validated = insertClientSchema.parse({
      ...clientData,
      workspaceId,
    });
    
    let userId: string | null = null;
    const normalizedEmailVal = normalizeEmail(validated.email);
    if (normalizedEmailVal) {
      try {
        const [matchingUser] = await db.select()
          .from(users)
          .where(sql`lower(${users.email}) = ${normalizedEmailVal}`)
          .limit(1);
        
        if (matchingUser) {
          userId = matchingUser.id;
        }
      } catch (error) {
        log.error('[Admin Client Creation] Error looking up user by email:', error);
      }
    }
    
    const client = await storage.createClient({
      ...validated,
      userId: userId || validated.userId || null,
    });
    
    res.json({ 
      success: true, 
      client,
      createdBy: adminUserId 
    });
  } catch (error: unknown) {
    log.error("Error creating client:", error);
    res.status(400).json({ message: sanitizeError(error) || "Failed to create client" });
  }
});

router.post('/support/delete-client', async (req: AuthenticatedRequest, res) => {
  try {
    const { clientId, workspaceId, reason } = req.body;
    const adminUserId = req.user;
    
    const client = await storage.getClient(clientId, workspaceId);
    if (!client || client.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Client not found in specified workspace" });
    }
    
    await storage.deleteClient(clientId, workspaceId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: adminUserId!,
      workspaceId: workspaceId || null,
      action: 'support_delete_client',
      entityType: 'client',
      entityId: clientId,
      details: { reason: reason || 'No reason provided', deletedBy: req.user?.email },
      ipAddress: req.ip || req.socket.remoteAddress,
    });
    
    res.json({ 
      success: true, 
      message: "Client deleted successfully",
      deletedBy: adminUserId,
      reason 
    });
  } catch (error) {
    log.error("Error deleting client:", error);
    res.status(500).json({ message: "Failed to delete client" });
  }
});

router.post('/support/process-payment', async (req: AuthenticatedRequest, res) => {
  try {
    const { invoiceId, workspaceId, amount, method, note } = req.body;
    const adminUserId = req.user;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Invoice not found in specified workspace" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await storage.updateInvoice(invoiceId, {
      status: 'paid',
      paidDate: new Date().toISOString(),
    });
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: adminUserId!,
      workspaceId: workspaceId || null,
      action: 'support_process_payment',
      entityType: 'invoice',
      entityId: invoiceId,
      details: { amount, method, note: note || '', processedBy: req.user?.email },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({ 
      success: true, 
      message: "Payment processed and invoice cleared",
      processedBy: adminUserId,
      method,
      amount,
      note 
    });
  } catch (error) {
    log.error("Error processing payment:", error);
    res.status(500).json({ message: "Failed to process payment" });
  }
});

router.post('/support/force-clear-invoice', async (req: AuthenticatedRequest, res) => {
  try {
    const { invoiceId, workspaceId, reason } = req.body;
    const adminUserId = req.user;
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const invoice = await storage.getInvoice(invoiceId);
    if (!invoice || invoice.workspaceId !== workspaceId) {
      return res.status(404).json({ message: "Invoice not found in specified workspace" });
    }
    
    // @ts-expect-error — TS migration: fix in refactoring sprint
    await storage.updateInvoice(invoiceId, {
      status: 'paid',
      paidDate: new Date().toISOString(),
    });
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: adminUserId!,
      workspaceId: workspaceId || null,
      action: 'support_force_clear_invoice',
      entityType: 'invoice',
      entityId: invoiceId,
      details: { reason: reason || 'No reason provided', clearedBy: req.user?.email },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({ 
      success: true, 
      message: "Invoice force cleared",
      clearedBy: adminUserId,
      reason 
    });
  } catch (error) {
    log.error("Error clearing invoice:", error);
    res.status(500).json({ message: "Failed to clear invoice" });
  }
});

router.post('/support/reset-chat', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, reason } = req.body;
    const adminUserId = req.user;
    
    const conversations = await storage.getChatConversationsByWorkspace(workspaceId);
    
    for (const conv of conversations) {
      // @ts-expect-error — TS migration: fix in refactoring sprint
      await storage.updateChatConversation(conv.id, {
        status: 'closed',
      });
    }
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: adminUserId!,
      workspaceId: workspaceId || null,
      action: 'support_reset_chat',
      entityType: 'workspace',
      entityId: workspaceId,
      details: { conversationsClosed: conversations.length, reason: reason || 'No reason provided', resetBy: req.user?.email },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({ 
      success: true, 
      message: `Chat reset - ${conversations.length} conversations closed`,
      resetBy: adminUserId,
      reason 
    });
  } catch (error) {
    log.error("Error resetting chat:", error);
    res.status(500).json({ message: "Failed to reset chat" });
  }
});

router.post('/support/force-close-service', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, service, reason } = req.body;
    const adminUserId = req.user;
    
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: adminUserId!,
      workspaceId: workspaceId || null,
      action: 'support_force_close_service',
      entityType: 'service',
      entityId: service || 'unknown',
      details: { service, reason: reason || 'No reason provided', closedBy: req.user?.email },
      ipAddress: req.ip || req.socket.remoteAddress,
    });

    res.json({ 
      success: true, 
      message: `Service ${service} force closed`,
      closedBy: adminUserId,
      reason 
    });
  } catch (error) {
    log.error("Error force closing service:", error);
    res.status(500).json({ message: "Failed to force close service" });
  }
});

router.post('/support/update-subscription', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId, newTier } = req.body;
    const adminUserId = req.user;

    const adminSupport = await import('../adminSupport');
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await adminSupport.updateSubscriptionTier(workspaceId, newTier, adminUserId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: adminUserId!,
      workspaceId: workspaceId || null,
      action: 'support_update_subscription',
      entityType: 'workspace',
      entityId: workspaceId,
      details: { newTier, updatedBy: req.user?.email },
      ipAddress: req.ip || req.socket.remoteAddress,
    });
    res.json(result);
  } catch (error) {
    log.error("Error updating subscription:", error);
    res.status(500).json({ message: "Failed to update subscription" });
  }
});

router.get('/support/stripe-status/:workspaceId', async (req: AuthenticatedRequest, res) => {
  try {
    const { workspaceId } = req.params;

    const adminSupport = await import('../adminSupport');
    const status = await adminSupport.getStripeStatus(workspaceId);
    res.json(status);
  } catch (error) {
    log.error("Error fetching Stripe status:", error);
    res.status(500).json({ message: "Failed to fetch Stripe status" });
  }
});

router.post('/bot/execute-command', async (req: AuthenticatedRequest, res) => {
  try {
    const { botCommandExecutor } = await import('../bots');
    const { botId, action, reason, targetEntityType, targetEntityId, targetWorkspaceId, data } = req.body;

    if (!botId || !action || !reason || !targetEntityType || !targetEntityId) {
      return res.status(400).json({ message: 'botId, action, reason, targetEntityType, and targetEntityId are required' });
    }

    const result = await botCommandExecutor.executeCommand({
      botId,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      commandedBy: req.user!,
      action,
      reason,
      targetEntityType,
      targetEntityId,
      targetWorkspaceId,
      data,
    });

    if (!result.success) {
      return res.status(403).json(result);
    }

    res.json(result);
  } catch (error: unknown) {
    log.error('[BotCommand] Error executing command:', error);
    res.status(500).json({ message: sanitizeError(error) || 'Failed to execute bot command' });
  }
});

router.get('/bot/command-history', async (req: AuthenticatedRequest, res) => {
  try {
    const { botCommandExecutor } = await import('../bots');
    const { botId, userId: targetUserId } = req.query;
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);

    let history;
    if (botId) {
      history = await botCommandExecutor.getCommandHistory(botId as string, limit);
    } else if (targetUserId) {
      history = await botCommandExecutor.getCommandsByUser(targetUserId as string, limit);
    } else {
      history = await botCommandExecutor.getCommandHistory('*', limit);
    }

    res.json({ success: true, commands: history, total: history.length });
  } catch (error: unknown) {
    log.error('[BotCommand] Error fetching command history:', error);
    res.status(500).json({ message: 'Failed to fetch command history' });
  }
});

router.post('/support/create-ticket', async (req: AuthenticatedRequest, res) => {
  try {
    const adminUserId = req.user?.id;
    
    const adminSupport = await import('../adminSupport');
    const result = await adminSupport.createSupportTicket({
      ...req.body,
      createdByAdmin: adminUserId,
    });
    
    res.json(result);
  } catch (error) {
    log.error("Error creating support ticket:", error);
    res.status(500).json({ message: "Failed to create support ticket" });
  }
});

router.post('/support/update-ticket', async (req: AuthenticatedRequest, res) => {
  try {
    const { ticketId, status, resolution } = req.body;
    const adminUserId = req.user?.id;

    const adminSupport = await import('../adminSupport');
    const result = await adminSupport.updateTicketStatus(ticketId, status, resolution, adminUserId);
    res.json(result);
  } catch (error) {
    log.error("Error updating ticket:", error);
    res.status(500).json({ message: "Failed to update ticket" });
  }
});

router.get('/support/org/:orgId/employees', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const employeesList = await storage.getEmployeesByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_employees',
      entityType: 'employee',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: employeesList.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(employeesList);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching employees:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization employees' });
  }
});

router.get('/support/org/:orgId/shifts', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { startDate, endDate } = req.query;
    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;
    const shiftsList = await storage.getShiftsByWorkspace(orgId, start, end);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_shifts',
      entityType: 'shift',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: shiftsList.length, startDate, endDate },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(shiftsList);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching shifts:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization shifts' });
  }
});

router.get('/support/org/:orgId/time-entries', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const timeEntries = await storage.getTimeEntriesByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_time_entries',
      entityType: 'time_entry',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: timeEntries.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(timeEntries);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching time entries:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization time entries' });
  }
});

router.get('/support/org/:orgId/invoices', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const invoices = await storage.getInvoicesByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_invoices',
      entityType: 'invoice',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: invoices.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(invoices);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching invoices:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization invoices' });
  }
});

router.get('/support/org/:orgId/clients', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const clientsList = await storage.getClientsByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_clients',
      entityType: 'client',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: clientsList.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(clientsList);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching clients:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization clients' });
  }
});

router.get('/support/org/:orgId/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const orgTickets = await storage.getSupportTickets(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_tickets',
      entityType: 'support_ticket',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: orgTickets.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(orgTickets);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching tickets:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization tickets' });
  }
});

router.get('/support/tickets', async (req: AuthenticatedRequest, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: 'No workspace context' });
    }
    const tickets = await storage.getSupportTickets(workspaceId);
    res.json({ tickets, total: tickets.length });
  } catch (error: unknown) {
    log.error('[Support] Error fetching tickets:', sanitizeError(error));
    res.status(500).json({ error: 'Failed to fetch support tickets' });
  }
});

router.get('/support/org/:orgId/overview', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const [employeesList, shiftsList, timeEntries, invoices, clientsList] = await Promise.all([
      storage.getEmployeesByWorkspace(orgId),
      storage.getShiftsByWorkspace(orgId),
      storage.getTimeEntriesByWorkspace(orgId),
      storage.getInvoicesByWorkspace(orgId),
      storage.getClientsByWorkspace(orgId),
    ]);
    const workspace = await storage.getWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_overview',
      entityType: 'workspace',
      entityId: orgId,
      details: { accessType: 'cross_org_support' },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({
      workspace: workspace ? { id: workspace.id, name: workspace.name, status: (workspace as any).status, plan: workspace.subscriptionTier } : null,
      counts: {
        employees: employeesList.length,
        activeEmployees: employeesList.filter((e: any) => e.isActive).length,
        shifts: shiftsList.length,
        timeEntries: timeEntries.length,
        invoices: invoices.length,
        unpaidInvoices: invoices.filter((i: any) => i.status !== 'paid').length,
        clients: clientsList.length,
      },
    });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching org overview:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization overview' });
  }
});

router.patch('/support/org/:orgId/employees/:employeeId', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId, employeeId } = req.params;
    const updates = req.body;
    const employee = await storage.getEmployee(employeeId, orgId);
    if (!employee || employee.workspaceId !== orgId) {
      return res.status(404).json({ message: 'Employee not found in specified organization' });
    }
    const updated = await storage.updateEmployee(employeeId, orgId, updates);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_update_employee',
      entityType: 'employee',
      entityId: employeeId,
      details: { accessType: 'cross_org_support', updates: Object.keys(updates) },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json(updated);
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error updating employee:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to update employee' });
  }
});

router.get('/support/platform-search', async (req: AuthenticatedRequest, res) => {
  try {
    const { q, type } = req.query;
    const query = (q as string || '').toLowerCase().trim();
    if (!query || query.length < 2) {
      return res.json({ results: [], message: 'Query must be at least 2 characters' });
    }
    const results: any[] = [];
    if (!type || type === 'users') {
      const allUsers = await db.select().from(users);
      const matchedUsers = allUsers.filter((u: any) =>
        (u.email && u.email.toLowerCase().includes(query)) ||
        (u.firstName && u.firstName.toLowerCase().includes(query)) ||
        (u.lastName && u.lastName.toLowerCase().includes(query)) ||
        (u.username && u.username.toLowerCase().includes(query))
      ).slice(0, 20);
      results.push(...matchedUsers.map((u: any) => ({ type: 'user', id: u.id, name: `${u.firstName || ''} ${u.lastName || ''}`.trim(), email: u.email, username: u.username })));
    }
    if (!type || type === 'workspaces') {
      const allWorkspaces = await db.select().from(workspaces);
      const matchedWs = allWorkspaces.filter((w: any) =>
        (w.name && w.name.toLowerCase().includes(query)) ||
        (w.id && w.id.toLowerCase().includes(query))
      ).slice(0, 20);
      results.push(...matchedWs.map((w: any) => ({ type: 'workspace', id: w.id, name: w.name, status: w.status, plan: w.subscriptionTier })));
    }
    if (!type || type === 'employees') {
      const allWorkspaces = await db.select().from(workspaces);
      for (const ws of allWorkspaces.slice(0, 50)) {
        const employeesList = await storage.getEmployeesByWorkspace(ws.id);
        const matched = employeesList.filter((e: any) =>
          (e.firstName && e.firstName.toLowerCase().includes(query)) ||
          (e.lastName && e.lastName.toLowerCase().includes(query)) ||
          (e.email && e.email.toLowerCase().includes(query)) ||
          (e.employeeNumber && e.employeeNumber.toLowerCase().includes(query))
        );
        results.push(...matched.map((e: any) => ({ type: 'employee', id: e.id, name: `${e.firstName || ''} ${e.lastName || ''}`.trim(), email: e.email, workspaceId: ws.id, workspaceName: ws.name, employeeNumber: e.employeeNumber })));
      }
    }
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: PLATFORM_WORKSPACE_ID,
      action: 'support_platform_search',
      entityType: 'search',
      entityId: 'platform-search',
      details: { query, type, resultCount: results.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ results, total: results.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error performing platform search:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to perform platform search' });
  }
});

// ============================================================================
// GAP FIX: Cross-org data access routes for support staff
// These wire existing storage methods to support endpoints so support agents
// can view any org's documents, payroll, expenses, PTO, disputes, chat history,
// performance reviews, benefits, and audit logs when assisting end-users.
// ============================================================================

router.get('/support/org/:orgId/documents', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { employeeId } = req.query;
    const employeesList = await storage.getEmployeesByWorkspace(orgId);
    let allDocs: any[] = [];
    if (employeeId) {
      allDocs = await storage.getEmployeeDocuments(orgId, employeeId as string);
    } else {
      const docPromises = employeesList.slice(0, 100).map(emp =>
        storage.getEmployeeDocuments(orgId, emp.id).catch(() => [])
      );
      const results = await Promise.all(docPromises);
      allDocs = results.flat();
    }
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_documents',
      entityType: 'document',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: allDocs.length, employeeId: employeeId || 'all' },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ documents: allDocs, total: allDocs.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching documents:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization documents' });
  }
});

router.get('/support/org/:orgId/payroll', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const payrollRuns = await storage.getPayrollRunsByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_payroll',
      entityType: 'payroll',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: payrollRuns.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ payrollRuns, total: payrollRuns.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching payroll:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization payroll' });
  }
});

router.get('/support/org/:orgId/expenses', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { status, employeeId } = req.query;
    const filters: any = {};
    if (status) filters.status = status as string;
    if (employeeId) filters.employeeId = employeeId as string;
    const expenses = await storage.getExpensesByWorkspace(orgId, Object.keys(filters).length > 0 ? filters : undefined);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_expenses',
      entityType: 'expense',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: expenses.length, filters },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ expenses, total: expenses.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching expenses:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization expenses' });
  }
});

router.get('/support/org/:orgId/pto', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { status } = req.query;
    const filters: any = {};
    if (status) filters.status = status as string;
    const ptoRequests = await storage.getPtoRequestsByWorkspace(orgId, Object.keys(filters).length > 0 ? filters : undefined);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_pto',
      entityType: 'pto_request',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: ptoRequests.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ ptoRequests, total: ptoRequests.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching PTO requests:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization PTO requests' });
  }
});

router.get('/support/org/:orgId/disputes', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { status, disputeType } = req.query;
    const filters: any = {};
    if (status) filters.status = status as string;
    if (disputeType) filters.disputeType = disputeType as string;
    const disputes = await storage.getDisputesByWorkspace(orgId, Object.keys(filters).length > 0 ? filters : undefined);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_disputes',
      entityType: 'dispute',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: disputes.length, filters },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ disputes, total: disputes.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching disputes:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization disputes' });
  }
});

router.get('/support/org/:orgId/chat-history', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { status } = req.query;
    const filters: any = {};
    if (status) filters.status = status as string;
    const conversations = await storage.getChatConversationsByWorkspace(orgId, Object.keys(filters).length > 0 ? filters : undefined);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_chat_history',
      entityType: 'chat_conversation',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: conversations.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ conversations, total: conversations.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching chat history:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization chat history' });
  }
});

router.get('/support/org/:orgId/performance-reviews', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const reviews = await storage.getPerformanceReviewsByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_performance_reviews',
      entityType: 'performance_review',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: reviews.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ reviews, total: reviews.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching performance reviews:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization performance reviews' });
  }
});

router.get('/support/org/:orgId/benefits', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const benefits = await storage.getEmployeeBenefitsByWorkspace(orgId);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_benefits',
      entityType: 'employee_benefit',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: benefits.length },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ benefits, total: benefits.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching benefits:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization benefits' });
  }
});

router.get('/support/org/:orgId/audit-logs', async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const logs = await db.select().from(auditLogs)
      .where(eq(auditLogs.workspaceId, orgId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
    await storage.createAuditLog({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      userId: req.user!,
      userEmail: req.userEmail || 'support-staff',
      userRole: req.platformRole || 'support',
      workspaceId: orgId,
      action: 'support_view_org_audit_logs',
      entityType: 'audit_log',
      entityId: orgId,
      details: { accessType: 'cross_org_support', count: logs.length, limit, offset },
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    res.json({ logs, total: logs.length });
  } catch (error: unknown) {
    log.error('[Support Cross-Org] Error fetching org audit logs:', sanitizeError(error));
    res.status(500).json({ message: 'Failed to fetch organization audit logs' });
  }
});

router.get('/platform/workspaces', async (req: AuthenticatedRequest, res) => {
  try {
    const allWs = await db.select().from(workspaces).limit(100);
    res.json(allWs);
  } catch (error: unknown) {
    log.error('Error fetching platform workspaces:', error);
    res.status(500).json({ message: 'Failed to fetch workspaces' });
  }
});

router.get('/user-diagnostics', async (req: AuthenticatedRequest, res) => {
  try {
    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
    const [employeeCount] = await db.select({ count: sql<number>`count(*)::int` }).from(employees);
    const [workspaceCount] = await db.select({ count: sql<number>`count(*)::int` }).from(workspaces);
    res.json({
      totalUsers: userCount?.count || 0,
      totalEmployees: employeeCount?.count || 0,
      totalWorkspaces: workspaceCount?.count || 0,
      activeSessions: 0,
      serverUptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('Error fetching user diagnostics:', error);
    res.status(500).json({ message: 'Failed to fetch diagnostics' });
  }
});

router.get('/audit-logs', async (req: AuthenticatedRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 200);
    const offset = (page - 1) * limit;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs);
    
    const total = countResult?.count || 0;
    const logs = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
    
    res.json({
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error: unknown) {
    log.error('Error fetching audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

router.post('/unlock-user', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    const [updated] = await db.update(users)
      .set({ loginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user: { id: updated.id, email: updated.email } });
  } catch (error: unknown) {
    log.error('Error unlocking user:', error);
    res.status(500).json({ message: 'Failed to unlock user' });
  }
});

router.post('/reset-password', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ message: 'userId is required' });
    const tempPassword = crypto.randomBytes(8).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);
    const [updated] = await db.update(users)
      .set({ passwordHash: hashedPassword, loginAttempts: 0, lockedUntil: null })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) return res.status(404).json({ message: 'User not found' });

    // SECURITY: Invalidate all active sessions after an admin-forced password reset.
    // The target user must re-authenticate with the new temporary credential.
    try {
      const { authSessions: authSessionsTable } = await import('@shared/schema');
      await db.update(authSessionsTable)
        .set({ isValid: false })
        .where(eq(authSessionsTable.userId, userId));
    } catch (sessionErr: unknown) {
      log.error('[AdminRoutes] Failed to invalidate sessions after password reset:', sessionErr);
    }

    res.json({ success: true, tempPassword, userId: updated.id, email: updated.email });
  } catch (error: unknown) {
    log.error('Error resetting password:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// GET /api/admin/users/:userId/sessions — active sessions for a specific user
router.get('/users/:userId/sessions', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { db: dbInstance } = await import('../db');
    const { authSessions } = await import('@shared/schema');
    const { eq, desc } = await import('drizzle-orm');
    const sessions = await dbInstance
      .select()
      .from(authSessions)
      .where(eq(authSessions.userId, userId))
      .orderBy(desc(authSessions.lastActivityAt))
      .limit(50);
    res.json({ sessions });
  } catch (error: unknown) {
    log.error('Error fetching user sessions:', error);
    res.status(500).json({ message: 'Failed to fetch user sessions' });
  }
});

// GET /api/admin/users/:userId/audit-logs — audit log entries for a specific user
router.get('/users/:userId/audit-logs', async (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    const { pool } = await import('../db');
    // CATEGORY C — Raw SQL retained: LIKE | Tables: audit_logs | Verified: 2026-03-23
    const rows = await typedPool(
      `SELECT id, workspace_id, action, entity_type, entity_id, action_description,
              ip_address, user_agent, created_at, success, error_message, compliance_tag
       FROM audit_logs
       WHERE user_id = $1
         AND action IS NOT NULL AND action != ''
         AND action NOT LIKE 'platform_event_%'
         AND action NOT LIKE 'scheduler_job_%'
         AND action != 'service_unhealthy'
         AND action != 'test_audit_schema_insert'
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, parseInt(limit as string), parseInt(offset as string)]
    );
    // CATEGORY C — Raw SQL retained: COUNT( | Tables: audit_logs | Verified: 2026-03-23
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const [countRow] = await typedPool(
      `SELECT COUNT(*) FROM audit_logs
       WHERE user_id = $1 AND action IS NOT NULL AND action != ''
         AND action NOT LIKE 'platform_event_%'
         AND action NOT LIKE 'scheduler_job_%'
         AND action != 'service_unhealthy'
         AND action != 'test_audit_schema_insert'`,
      [userId]
    );
    res.json({ logs: rows, total: parseInt(countRow?.count || '0') });
  } catch (error: unknown) {
    log.error('Error fetching user audit logs:', error);
    res.status(500).json({ message: 'Failed to fetch audit logs' });
  }
});

// ===========================================================================
// INVOICE RESEND — Preview and execute bulk resend for undelivered invoices
// (invoices that were sent before the email barrel fix, March 2026)
// All workspaces including Statewide Protective Services are treated equally.
// ===========================================================================

router.get('/invoices/undelivered', async (req: AuthenticatedRequest, res) => {
  try {
    const { getUndeliveredInvoices } = await import('../services/billing/invoiceResendService');
    const summary = await getUndeliveredInvoices();
    res.json({
      count: summary.count,
      totalDollars: summary.totalDollars,
      invoices: summary.invoices,
    });
  } catch (err: unknown) {
    log.error('[Admin] Invoice undelivered list error:', err);
    res.status(500).json({ message: sanitizeError(err) });
  }
});

router.post('/invoices/bulk-resend', async (req: AuthenticatedRequest, res) => {
  try {
    const { bulkResendUndeliveredInvoices } = await import('../services/billing/invoiceResendService');
    const { dryRun = true } = req.body;
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const result = await bulkResendUndeliveredInvoices(!!dryRun, req.user.id);
    res.json({ dryRun: !!dryRun, result });
  } catch (err: unknown) {
    log.error('[Admin] Bulk resend error:', err);
    res.status(500).json({ message: sanitizeError(err) });
  }
});

// ===========================================================================
// COMPLIANCE PENDING NOTIFICATIONS
// Notify org_owners in all workspaces that have pending compliance documents
// ===========================================================================

router.post('/compliance/notify-pending', async (req: AuthenticatedRequest, res) => {
  try {
    const { complianceDocuments, workspaceMembers, users } = await import('@shared/schema');
    const { createNotification } = await import('../services/notificationService');
    const { eq, and, inArray } = await import('drizzle-orm');

    const pendingDocs = await db
      .select({
        id: complianceDocuments.id,
        workspaceId: complianceDocuments.workspaceId,
        documentName: complianceDocuments.documentName,
        employeeId: complianceDocuments.employeeId,
      })
      .from(complianceDocuments)
      .where(eq(complianceDocuments.isLocked, false));

    if (pendingDocs.length === 0) {
      return res.json({ notified: 0, message: 'No pending compliance documents found' });
    }

    const wsIds = [...new Set(pendingDocs.map(d => d.workspaceId))];
    const ownerRows = await db
      .select({ userId: workspaceMembers.userId, workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(and(
        inArray(workspaceMembers.workspaceId, wsIds),
        eq(workspaceMembers.role, 'org_owner')
      ));

    const docCountByWs = pendingDocs.reduce<Record<string, number>>((acc, d) => {
      acc[d.workspaceId] = (acc[d.workspaceId] || 0) + 1;
      return acc;
    }, {});

    let notified = 0;
    for (const owner of ownerRows) {
      const count = docCountByWs[owner.workspaceId] || 0;
      if (!count) continue;
      await createNotification({
        workspaceId: owner.workspaceId,
        userId: owner.userId,
        type: 'system' as any,
        title: `${count} Compliance Document${count > 1 ? 's' : ''} Awaiting Review`,
        message: `You have ${count} compliance document${count > 1 ? 's' : ''} pending approval. Note: These notifications may not have been sent previously due to an email delivery issue that has since been fixed.`,
        actionUrl: '/compliance-scenarios',
        relatedEntityType: 'compliance',
        metadata: { pendingCount: count, reason: 'post_email_fix_notification', notifiedAt: new Date().toISOString() },
        // @ts-expect-error — TS migration: fix in refactoring sprint
        createdBy: req.user.id,
        idempotencyKey: `system-${Date.now()}-${owner.userId}`
      });
      notified++;
    }

    log.info(`[Admin] Compliance pending notifications sent to ${notified} org_owner(s) across ${wsIds.length} workspace(s)`);
    res.json({ notified, workspaces: wsIds.length, pendingDocuments: pendingDocs.length });
  } catch (err: unknown) {
    log.error('[Admin] Compliance notify-pending error:', err);
    res.status(500).json({ message: sanitizeError(err) });
  }
});

// ===========================================================================
// OVERDUE COLLECTIONS — Manual trigger for the collections escalation sweep
// ===========================================================================

router.post('/billing/collections-sweep', async (req: AuthenticatedRequest, res) => {
  try {
    const { runOverdueCollectionsSweep } = await import('../services/billing/overdueCollectionsService');
    const result = await runOverdueCollectionsSweep();
    res.json({ success: true, result });
  } catch (err: unknown) {
    log.error('[Admin] Collections sweep error:', err);
    res.status(500).json({ message: sanitizeError(err) });
  }
});

// ===========================================================================
// TRINITY ACTION INVOCATIONS — telemetry read endpoint
// ===========================================================================

router.get('/action-invocations', async (req: AuthenticatedRequest, res) => {
  try {
    const { pool } = await import('../db');
    const workspaceId = req.query.workspaceId as string | undefined;
    const days = Math.min(parseInt((req.query.days as string) || '30', 10), 90);

    const workspaceFilter = workspaceId
      ? 'AND workspace_id = $2'
      : '';

    const params: any[] = [days];
    if (workspaceId) params.push(workspaceId);

    // CATEGORY C — Raw SQL retained: GROUP BY | Tables: trinity_action_invocations | Verified: 2026-03-23
    const result = await typedPool(
      `SELECT
         action_id,
         COUNT(*)::int                                          AS count,
         ROUND(AVG(CASE WHEN success THEN 1.0 ELSE 0.0 END) * 100, 1)::float AS success_rate,
         ROUND(AVG(duration_ms))::int                          AS avg_duration_ms
       FROM trinity_action_invocations
       WHERE created_at > NOW() - ($1 || ' days')::interval
       ${workspaceFilter}
       GROUP BY action_id
       ORDER BY count DESC
       LIMIT 200`,
      params
    );

    res.json({
      days,
      workspaceId: workspaceId || null,
      total: (result as any).length,
      actions: result,
    });
  } catch (err: unknown) {
    log.error('[Admin] Action invocations query error:', err);
    res.status(500).json({ message: sanitizeError(err) });
  }
});

// ─── Breach Response SOP ─────────────────────────────────────────────────────

router.get('/breach-response/sop', async (_req: AuthenticatedRequest, res) => {
  try {
    const {
      BREACH_RESPONSE_SOP,
      SEVERITY_GUIDE,
      SOP_PHASES,
    } = await import('../services/breachResponseSOP');
    res.json({ sop: BREACH_RESPONSE_SOP, severityGuide: SEVERITY_GUIDE, phases: SOP_PHASES });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) });
  }
});

router.post('/breach-response/incidents', async (req: AuthenticatedRequest, res) => {
  try {
    const { generateIncidentId, logBreachIncident } = await import('../services/breachResponseSOP');
    const { severity, description, affectedWorkspaceIds, affectedDataTypes } = req.body;
    if (!severity || !description) {
      return res.status(400).json({ message: 'severity and description are required' });
    }
    const incidentId = generateIncidentId();
    const incident = {
      incidentId,
      severity,
      description,
      affectedWorkspaceIds: affectedWorkspaceIds || [],
      affectedDataTypes: affectedDataTypes || [],
      reportedBy: req.user?.id ? String(req.user.id) : 'admin',
      status: 'open' as const,
      phase: 'detection' as const,
      discoveredAt: new Date().toISOString(),
    };
    await logBreachIncident(incident);
    log.warn(`[BreachSOP] Incident opened by ${incident.reportedBy} — ${incidentId} (${severity}): ${description}`);
    res.status(201).json({ incident });
  } catch (err: unknown) {
    res.status(500).json({ message: sanitizeError(err) });
  }
});

// ============================================================================
// SCHEDULER HEALTH — last 10 runs per registered cron job
// ============================================================================
// Surfaces cron_run_log rows + in-memory registered-jobs summary so platform
// staff can spot silently failing or long-unrun jobs. No tenant data leaks:
// scheduler logs are platform-scoped.
router.get('/scheduler/jobs', async (req: AuthenticatedRequest, res) => {
  try {
    const { getScheduledJobsSummary } = await import('../services/autonomousScheduler');
    const jobs = getScheduledJobsSummary();

    const runs = await typedPool<{
      job_name: string;
      status: string;
      started_at: Date;
      completed_at: Date | null;
      duration_ms: number | null;
      error_message: string | null;
    }>(
      `SELECT job_name, status, started_at, completed_at, duration_ms, error_message
         FROM cron_run_log
        WHERE started_at > NOW() - INTERVAL '7 days'
        ORDER BY started_at DESC
        LIMIT 2000`
    );

    const byJob = new Map<string, any[]>();
    for (const row of runs.rows) {
      const arr = byJob.get(row.job_name) ?? [];
      if (arr.length < 10) {
        arr.push({
          status: row.status,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          durationMs: row.duration_ms,
          errorMessage: row.error_message,
        });
      }
      byJob.set(row.job_name, arr);
    }

    const out = jobs.map((j) => {
      const history = byJob.get(j.jobName) ?? [];
      const last = history[0] ?? null;
      const lastCompleted = history.find((h: any) => h.status === 'completed') ?? null;
      const recentFailures = history.filter((h: any) => h.status === 'failed').length;
      return {
        jobName: j.jobName,
        description: j.description,
        schedule: j.schedule,
        enabled: j.enabled,
        lastRunAt: last?.startedAt ?? j.lastRunAt ?? null,
        lastStatus: last?.status ?? j.lastStatus ?? null,
        lastDurationMs: last?.durationMs ?? null,
        lastError: last?.errorMessage ?? null,
        lastCompletedAt: lastCompleted?.completedAt ?? null,
        recentFailures,
        history,
      };
    });

    res.json({ jobs: out, generatedAt: new Date().toISOString() });
  } catch (err: unknown) {
    log.error('[SchedulerHealth] query failed:', err);
    res.status(500).json({ message: sanitizeError(err) });
  }
});

export default router;
