/**
 * Permission Management Actions — Phase 9B
 * ==========================================
 * Trinity AI Brain + HelpAI orchestrator actions for permission management.
 * Support agents and system bots can query/modify workspace permissions via
 * natural language delegation.
 *
 * Action ID namespace: permissions.*
 * Read access: support_agent and above
 * Write access: support_manager and above
 */

import { helpaiOrchestrator } from '../helpai/platformActionHub';
import { db } from '../../db';
import { workspacePermissions, workspaces, employees } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { resolveEffectivePermissions } from '../../middleware/workspacePermissions';
import { FEATURE_REGISTRY, MATRIX_ROLES, hasDefaultAccess } from '../../lib/rbac/featureRegistry';
import { upsertPermission, deletePermission } from '../../lib/rbac/permissionActions';
import { broadcastToWorkspace } from '../../websocket';
import { createLogger } from '../../lib/logger';
const log = createLogger('permissionManagementActions');


const READ_ROLES = ['support_agent', 'support_manager', 'sysop', 'compliance_officer', 'deputy_admin', 'root_admin'];
const WRITE_ROLES = ['support_manager', 'sysop', 'deputy_admin', 'root_admin'];

export function registerPermissionManagementActions(): void {

  // ── READ: Get effective permission matrix for a workspace ─────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'permissions.get_workspace_matrix',
    name: 'Get Workspace Permission Matrix',
    category: 'admin',
    description: 'Retrieve the full effective permission matrix for a specific workspace ID',
    requiredRoles: READ_ROLES,
    handler: async (request) => {
      const start = Date.now();
      const { workspaceId } = request.payload ?? {};
      if (!workspaceId) throw new Error('workspaceId is required');

      const matrix = await resolveEffectivePermissions(workspaceId);
      return {
        success: true,
        actionId: request.actionId,
        executionTimeMs: Date.now() - start,
        message: `Loaded matrix for workspace ${workspaceId}: ${matrix.length} entries`,
        data: { workspaceId, matrix, featureRegistry: FEATURE_REGISTRY, matrixRoles: MATRIX_ROLES },
      };
    },
  });

  // ── READ: Check a specific permission ────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'permissions.check_permission',
    name: 'Check Single Workspace Permission',
    category: 'admin',
    description: 'Check if a specific role has access to a specific feature in a workspace (with override info)',
    requiredRoles: READ_ROLES,
    handler: async (request) => {
      const start = Date.now();
      const { workspaceId, role, featureKey } = request.payload ?? {};
      if (!workspaceId || !role || !featureKey) {
        throw new Error('workspaceId, role, and featureKey are all required');
      }

      const [override] = await db
        .select()
        .from(workspacePermissions)
        .where(
          and(
            eq(workspacePermissions.workspaceId, workspaceId),
            eq(workspacePermissions.role, role),
            eq(workspacePermissions.featureKey, featureKey),
          ),
        )
        .limit(1);

      const defaultAccess = hasDefaultAccess(featureKey, role);
      const enabled = override ? override.enabled : defaultAccess;
      const isOverride = !!override;

      return {
        success: true,
        actionId: request.actionId,
        executionTimeMs: Date.now() - start,
        message: `Role "${role}" ${enabled ? 'HAS' : 'DOES NOT HAVE'} access to "${featureKey}" in workspace ${workspaceId}${isOverride ? ' (override active)' : ' (registry default)'}`,
        data: { workspaceId, role, featureKey, enabled, isOverride, defaultAccess, override: override ?? null },
      };
    },
  });

  // ── WRITE: Toggle a role+feature permission ───────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'permissions.toggle_feature',
    name: 'Toggle Workspace Feature Permission',
    category: 'admin',
    description: 'Enable or disable a specific feature for a role in a workspace',
    requiredRoles: WRITE_ROLES,
    handler: async (request) => {
      const start = Date.now();
      const { workspaceId, role, featureKey, enabled, reason } = request.payload ?? {};
      if (!workspaceId || !role || !featureKey || typeof enabled !== 'boolean') {
        throw new Error('workspaceId, role, featureKey, and enabled (boolean) are all required');
      }

      if (!MATRIX_ROLES.includes(role)) {
        throw new Error(`Role "${role}" is not editable. Owner roles are always granted full access.`);
      }
      if (!FEATURE_REGISTRY.find((f) => f.key === featureKey)) {
        throw new Error(`Unknown featureKey: "${featureKey}"`);
      }

      await upsertPermission(workspaceId, role, featureKey, enabled, request.userId ?? null);
      broadcastToWorkspace(workspaceId, {
        type: 'permission_update',
        role,
        featureKey,
        enabled,
        updatedBy: request.userId,
        source: 'trinity_ai',
        reason,
      });

      return {
        success: true,
        actionId: request.actionId,
        executionTimeMs: Date.now() - start,
        message: `Workspace ${workspaceId}: "${featureKey}" for role "${role}" set to ${enabled ? 'ENABLED' : 'DISABLED'}`,
        data: { workspaceId, role, featureKey, enabled },
      };
    },
  });

  // ── WRITE: Reset a permission override ────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'permissions.reset_feature',
    name: 'Reset Workspace Feature Permission to Default',
    category: 'admin',
    description: 'Remove a custom permission override, restoring the registry default',
    requiredRoles: WRITE_ROLES,
    handler: async (request) => {
      const start = Date.now();
      const { workspaceId, role, featureKey } = request.payload ?? {};
      if (!workspaceId || !role || !featureKey) {
        throw new Error('workspaceId, role, and featureKey are all required');
      }

      await deletePermission(workspaceId, role, featureKey);
      broadcastToWorkspace(workspaceId, { type: 'permission_update', role, featureKey, reset: true, source: 'trinity_ai' });

      const defaultAccess = hasDefaultAccess(featureKey, role);
      return {
        success: true,
        actionId: request.actionId,
        executionTimeMs: Date.now() - start,
        message: `Reset "${featureKey}" for role "${role}" in workspace ${workspaceId} to registry default (${defaultAccess ? 'enabled' : 'disabled'})`,
        data: { workspaceId, role, featureKey, resetTo: defaultAccess },
      };
    },
  });

  // ── READ: Get users in a workspace ────────────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'permissions.list_workspace_users',
    name: 'List Users in Workspace',
    category: 'admin',
    description: 'Search employees/users in a workspace and see their current workspace roles',
    requiredRoles: READ_ROLES,
    handler: async (request) => {
      const start = Date.now();
      const { workspaceId, limit = 50 } = request.payload ?? {};
      if (!workspaceId) throw new Error('workspaceId is required');

      const results = await db
        .select({
          id: employees.id,
          firstName: employees.firstName,
          lastName: employees.lastName,
          email: employees.email,
          workspaceRole: employees.workspaceRole,
          isActive: employees.isActive,
        })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId))
        .limit(Number(limit));

      return {
        success: true,
        actionId: request.actionId,
        executionTimeMs: Date.now() - start,
        message: `Found ${results.length} user(s) in workspace ${workspaceId}`,
        data: { workspaceId, users: results },
      };
    },
  });

  // ── WRITE: Change a user's workspace role ─────────────────────────────────
  helpaiOrchestrator.registerAction({
    actionId: 'permissions.change_user_role',
    name: 'Change User Workspace Role',
    category: 'admin',
    description: "Change an individual employee's workspace role assignment",
    requiredRoles: WRITE_ROLES,
    handler: async (request) => {
      const start = Date.now();
      const { workspaceId, userId, workspaceRole, reason } = request.payload ?? {};
      if (!workspaceId || !userId || !workspaceRole) {
        throw new Error('workspaceId, userId, and workspaceRole are all required');
      }

      if (!MATRIX_ROLES.includes(workspaceRole)) {
        throw new Error(`Role "${workspaceRole}" is not a valid non-owner role.`);
      }

      const [target] = await db
        .select()
        .from(employees)
        .where(and(eq(employees.id, userId), eq(employees.workspaceId, workspaceId)))
        .limit(1);

      if (!target) throw new Error(`Employee ${userId} not found in workspace ${workspaceId}`);

      await db
        .update(employees)
        .set({ workspaceRole: workspaceRole as any })
        .where(eq(employees.id, userId));

      broadcastToWorkspace(workspaceId, {
        type: 'permission_update',
        userId,
        workspaceRole,
        source: 'trinity_ai',
        updatedBy: request.userId,
        reason: reason ?? 'AI-assisted role change',
      });

      return {
        success: true,
        actionId: request.actionId,
        executionTimeMs: Date.now() - start,
        message: `User ${target.firstName} ${target.lastName} (${userId}) role changed from "${target.workspaceRole}" to "${workspaceRole}" in workspace ${workspaceId}`,
        data: { workspaceId, userId, previousRole: target.workspaceRole, newRole: workspaceRole },
      };
    },
  });

  log.info('[PermissionManagement] Registered 6 permissions.* AI Brain actions');
}
