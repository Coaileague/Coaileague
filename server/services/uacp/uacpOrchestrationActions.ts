/**
 * UACP ORCHESTRATION ACTIONS
 * ==========================
 * Registers Universal Access Control Panel actions with Trinity AI Brain.
 * Enables Trinity to manage access control through natural language commands.
 */

import { policyDecisionPoint, EntityType } from './policyDecisionPoint';
import { agentIdentityService } from './agentIdentityService';
import { db } from '../../db';
import { accessPolicies, accessControlEvents, agentIdentities } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import type { ActionRequest, ActionResult } from '../helpai/platformActionHub';

export interface UACPActionContext {
  userId: string;
  userRole: string;
  workspaceId?: string;
}

/**
 * Register UACP actions with Platform Action Hub
 */
export function registerUACPActions(orchestrator: any): void {
  // ============================================================================
  // ACCESS AUTHORIZATION ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'uacp.authorize',
    name: 'UACP Authorization Check',
    category: 'security',
    description: 'Request access decision from Policy Decision Point for entity/resource combinations',
    requiredRoles: ['manager', 'admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { subject, resource, context } = request.payload || {};
      
      if (!subject || !resource) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: subject and resource',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const decision = await policyDecisionPoint.authorize(subject, resource, context || {});
      return {
        success: true,
        actionId: request.actionId,
        message: decision.allowed ? `Access GRANTED: ${decision.reason}` : `Access DENIED: ${decision.reason}`,
        data: { decision },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.check_permission',
    name: 'Check Entity Permission',
    category: 'security',
    description: 'Check if a specific entity has a given permission',
    requiredRoles: ['manager', 'admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { entityType, entityId, permission, workspaceId } = request.payload || {};
      
      if (!entityType || !entityId || !permission) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: entityType, entityId, permission',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const hasPermission = await policyDecisionPoint.hasPermission(
        entityType,
        entityId,
        permission,
        workspaceId
      );
      return {
        success: true,
        actionId: request.actionId,
        message: hasPermission 
          ? `Entity ${entityId} HAS permission: ${permission}`
          : `Entity ${entityId} DOES NOT have permission: ${permission}`,
        data: { hasPermission },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.get_access_summary',
    name: 'Get Access Summary',
    category: 'security',
    description: 'Get complete access summary for a user or agent including roles, policies, and status',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { entityType, entityId, workspaceId } = request.payload || {};
      
      if (!entityType || !entityId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: entityType, entityId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const summary = await policyDecisionPoint.getAccessSummary(entityType, entityId, workspaceId);
      return {
        success: true,
        actionId: request.actionId,
        message: `Access summary for ${entityType} ${entityId}: role=${summary.role}, status=${summary.status}, policies=${summary.activePolicies}`,
        data: { summary },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // AGENT IDENTITY MANAGEMENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'uacp.list_agents',
    name: 'List Agent Identities',
    category: 'security',
    description: 'List all registered AI agent identities including bots, subagents, and Trinity',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId } = request.payload || {};
      
      const agents = await agentIdentityService.listAgents(workspaceId);
      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${agents.length} registered agent identities`,
        data: { agents, count: agents.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.get_agent',
    name: 'Get Agent Details',
    category: 'security',
    description: 'Get detailed information about a specific agent identity',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId } = request.payload || {};
      
      if (!agentId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: agentId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const agent = await agentIdentityService.getAgent(agentId);
      if (!agent) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Agent ${agentId} not found`,
          executionTimeMs: Date.now() - startTime
        };
      }
      return {
        success: true,
        actionId: request.actionId,
        message: `Agent ${agentId} (${agent.name}): status=${agent.status}, role=${agent.role}`,
        data: { agent },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.suspend_agent',
    name: 'Suspend Agent',
    category: 'security',
    description: 'Immediately suspend an agent access with reason (propagates to all services)',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId, reason } = request.payload || {};
      
      if (!agentId || !reason) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: agentId, reason',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const result = await agentIdentityService.suspendAgent(
        agentId,
        request.userId || 'system',
        reason
      );
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Agent ${agentId} SUSPENDED: ${reason}`
          : `Failed to suspend agent: ${result.error}`,
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.reactivate_agent',
    name: 'Reactivate Agent',
    category: 'security',
    description: 'Reactivate a previously suspended agent',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId } = request.payload || {};
      
      if (!agentId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required field: agentId',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const result = await agentIdentityService.reactivateAgent(
        agentId,
        request.userId || 'system'
      );
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Agent ${agentId} REACTIVATED`
          : `Failed to reactivate agent: ${result.error}`,
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.update_agent_mission',
    name: 'Update Agent Mission',
    category: 'security',
    description: 'Update the mission objective for an agent identity',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId, missionObjective } = request.payload || {};
      
      if (!agentId || !missionObjective) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: agentId, missionObjective',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const result = await agentIdentityService.updateMission(
        agentId,
        missionObjective,
        request.userId || 'system'
      );
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Agent ${agentId} mission updated`
          : `Failed to update mission: ${result.error}`,
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.update_agent_access',
    name: 'Update Agent Access',
    category: 'security',
    description: 'Update agent permissions, allowed tools, domains, and risk profile',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId, updates } = request.payload || {};
      
      if (!agentId || !updates) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: agentId, updates',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const result = await agentIdentityService.updateAgentAccess(
        agentId,
        updates,
        request.userId || 'system'
      );
      return {
        success: result.success,
        actionId: request.actionId,
        message: result.success 
          ? `Agent ${agentId} access updated`
          : `Failed to update access: ${result.error}`,
        data: { result },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // POLICY MANAGEMENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'uacp.list_policies',
    name: 'List Access Policies',
    category: 'security',
    description: 'List all ABAC access policies with optional active-only filter',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { activeOnly } = request.payload || { activeOnly: true };
      
      const policies = await db.select()
        .from(accessPolicies)
        .where(activeOnly !== false ? eq(accessPolicies.isActive, true) : undefined)
        .orderBy(accessPolicies.priority);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Found ${policies.length} access policies`,
        data: { policies, count: policies.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.invalidate_cache',
    name: 'Invalidate PDP Cache',
    category: 'security',
    description: 'Force invalidate the Policy Decision Point authorization cache',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { workspaceId } = request.payload || {};
      
      policyDecisionPoint.invalidateCache(workspaceId);
      return {
        success: true,
        actionId: request.actionId,
        message: `PDP cache invalidated${workspaceId ? ` for workspace ${workspaceId}` : ' globally'}`,
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // AUDIT & EVENTS ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'uacp.get_recent_events',
    name: 'Get Recent Access Events',
    category: 'security',
    description: 'Get recent access control events for audit and monitoring',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { limit } = request.payload || { limit: 20 };
      
      const events = await db.select()
        .from(accessControlEvents)
        .orderBy(desc(accessControlEvents.createdAt))
        .limit(limit || 20);
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Retrieved ${events.length} recent access control events`,
        data: { events, count: events.length },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.security_audit',
    name: 'Run Security Audit',
    category: 'security',
    description: 'Run comprehensive security audit including suspended agents and critical events',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      // Get suspended agents
      const suspendedAgents = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.status, 'suspended'));

      // Get critical events in last 24h
      const recentHighPriorityEvents = await db.select()
        .from(accessControlEvents)
        .where(eq(accessControlEvents.priority, 'critical'))
        .orderBy(desc(accessControlEvents.createdAt))
        .limit(10);

      // Get active policy count
      const [policyCount] = await db.select({
        count: db.$count(accessPolicies, eq(accessPolicies.isActive, true))
      }).from(accessPolicies);

      const audit = {
        suspendedAgents: suspendedAgents.length,
        criticalEventsLast24h: recentHighPriorityEvents.length,
        activePolicies: policyCount?.count || 0,
        timestamp: new Date().toISOString(),
      };

      return {
        success: true,
        actionId: request.actionId,
        message: `Security audit: ${suspendedAgents.length} suspended agents, ${recentHighPriorityEvents.length} critical events in 24h`,
        data: { 
          audit,
          suspendedAgentList: suspendedAgents.map(a => ({ id: a.agentId, name: a.name, reason: a.suspensionReason })),
          recentCriticalEvents: recentHighPriorityEvents
        },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  // ============================================================================
  // PLATFORM SUPPORT ROLE MANAGEMENT ACTIONS
  // ============================================================================

  orchestrator.registerAction({
    actionId: 'uacp.create_support_employee',
    name: 'Create Platform Support Employee',
    category: 'security',
    description: 'Create a new employee in the Operations workspace with platform support role',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { firstName, lastName, email, platformRole, permissions } = request.payload || {};
      
      if (!firstName || !lastName || !email) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: firstName, lastName, email',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const { employees, platformRoles, users } = await import('@shared/schema');
      
      // Check if employee already exists
      const existingEmployee = await db.select()
        .from(employees)
        .where(eq(employees.email, email))
        .limit(1);
      
      if (existingEmployee.length > 0) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Employee with email ${email} already exists`,
          executionTimeMs: Date.now() - startTime
        };
      }
      
      // Create support employee in Operations workspace
      const [newEmployee] = await db.insert(employees).values({
        workspaceId: 'ops-workspace-00000000',
        firstName,
        lastName,
        email,
        role: 'Platform Support Specialist',
        workspaceRole: 'support',
        isActive: true,
      }).returning();
      
      // Optionally create platform role assignment
      if (platformRole && newEmployee.userId) {
        await db.insert(platformRoles).values({
          userId: newEmployee.userId,
          role: platformRole,
          assignedBy: request.userId || 'system',
        }).onConflictDoUpdate({
          target: platformRoles.userId,
          set: { role: platformRole, updatedAt: new Date() }
        });
      }
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Created platform support employee: ${firstName} ${lastName}`,
        data: { employee: newEmployee },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.assign_platform_role',
    name: 'Assign Platform Role',
    category: 'security',
    description: 'Assign or update platform-wide role for a user (support, admin, super_admin, sysop)',
    requiredRoles: ['sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { userId, role } = request.payload || {};
      
      if (!userId || !role) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required fields: userId, role',
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const validRoles = ['support', 'admin', 'super_admin', 'sysop', 'root_admin'];
      if (!validRoles.includes(role)) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
          executionTimeMs: Date.now() - startTime
        };
      }
      
      const { platformRoles } = await import('@shared/schema');
      
      // Update or create platform role
      const [updatedRole] = await db.insert(platformRoles).values({
        userId,
        role,
        assignedBy: request.userId || 'system',
      }).onConflictDoUpdate({
        target: platformRoles.userId,
        set: { role, updatedAt: new Date(), assignedBy: request.userId || 'system' }
      }).returning();
      
      // Emit access control event
      await db.insert(accessControlEvents).values({
        eventType: 'role_changed',
        priority: 'high',
        actorType: 'human',
        actorId: request.userId || 'system',
        actorRole: 'sysop',
        targetType: 'human',
        targetId: userId,
        changeDetails: { action: 'assign_platform_role', newRole: role },
        newState: { role },
      });
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Assigned platform role '${role}' to user ${userId}`,
        data: { platformRole: updatedRole },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  orchestrator.registerAction({
    actionId: 'uacp.list_support_team',
    name: 'List Support Team',
    category: 'security',
    description: 'List all support employees and AI agents in the platform support org',
    requiredRoles: ['admin', 'super_admin', 'sysop', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { employees } = await import('@shared/schema');
      
      // Get human support employees
      const supportEmployees = await db.select()
        .from(employees)
        .where(eq(employees.workspaceId, 'ops-workspace-00000000'));
      
      // Get AI agents
      const aiAgents = await db.select()
        .from(agentIdentities)
        .where(eq(agentIdentities.workspaceId, 'ops-workspace-00000000'));
      
      const humanCount = supportEmployees.filter(e => !e.id.includes('-employee')).length;
      const botCount = supportEmployees.filter(e => e.id.includes('-employee')).length;
      
      return {
        success: true,
        actionId: request.actionId,
        message: `Support team: ${humanCount} humans, ${botCount} AI bots, ${aiAgents.length} registered agents`,
        data: { 
          employees: supportEmployees,
          agents: aiAgents,
          summary: {
            totalEmployees: supportEmployees.length,
            humanEmployees: humanCount,
            aiEmployees: botCount,
            registeredAgents: aiAgents.length
          }
        },
        executionTimeMs: Date.now() - startTime
      };
    }
  });

  console.log('[AI Brain Master Orchestrator] Registered 16 UACP access control actions');
}

/**
 * Get UACP action definitions for Trinity awareness
 */
export function getUACPActionDefinitions(): Array<{
  id: string;
  description: string;
  category: string;
  requiredRole: string;
}> {
  return [
    { id: 'uacp.authorize', description: 'Request access decision from Policy Decision Point', category: 'security', requiredRole: 'manager' },
    { id: 'uacp.check_permission', description: 'Check if entity has specific permission', category: 'security', requiredRole: 'manager' },
    { id: 'uacp.get_access_summary', description: 'Get complete access summary for user or agent', category: 'security', requiredRole: 'admin' },
    { id: 'uacp.list_agents', description: 'List all registered AI agent identities', category: 'security', requiredRole: 'admin' },
    { id: 'uacp.get_agent', description: 'Get details of specific agent', category: 'security', requiredRole: 'admin' },
    { id: 'uacp.suspend_agent', description: 'Immediately suspend agent access (propagates to all services)', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.reactivate_agent', description: 'Reactivate a suspended agent', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.update_agent_mission', description: 'Update agent mission objective', category: 'security', requiredRole: 'admin' },
    { id: 'uacp.update_agent_access', description: 'Update agent permissions and tool access', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.list_policies', description: 'List ABAC access policies', category: 'security', requiredRole: 'admin' },
    { id: 'uacp.invalidate_cache', description: 'Force invalidate PDP authorization cache', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.get_recent_events', description: 'Get recent access control events', category: 'security', requiredRole: 'admin' },
    { id: 'uacp.security_audit', description: 'Run security audit (suspended agents, critical events)', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.create_support_employee', description: 'Create platform support employee in Operations workspace', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.assign_platform_role', description: 'Assign platform-wide role to user (support, admin, sysop)', category: 'security', requiredRole: 'sysop' },
    { id: 'uacp.list_support_team', description: 'List all support employees and AI agents', category: 'security', requiredRole: 'admin' },
  ];
}
