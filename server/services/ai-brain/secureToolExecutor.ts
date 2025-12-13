/**
 * SECURE TOOL EXECUTOR
 * ====================
 * RBAC-guarded wrapper for all AI Brain tool invocations.
 * 
 * This service solves the "RBAC During Tool Calls" critical gap:
 * - Wraps all tool calls with authorization validation
 * - Logs denials to systemAuditLogs
 * - Integrates with aiBrainAuthorizationService
 * - Ensures parity layer calls through this wrapper
 * 
 * Security Architecture:
 * - Every tool call is authorized before execution
 * - Denials are logged with full context
 * - Elevated permissions require explicit bypass
 */

import { db } from '../../db';
import { eq } from 'drizzle-orm';
import { systemAuditLogs } from '@shared/schema';
import { aiBrainAuthorizationService, AI_BRAIN_AUTHORITY_ROLES } from './aiBrainAuthorizationService';
import { toolCapabilityRegistry } from './toolCapabilityRegistry';
import { platformEventBus } from '../../platformEventBus';
import type { TrinityToolCall } from '@shared/schema';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolExecutionRequest {
  toolId: string;
  toolName: string;
  action: string;
  parameters: Record<string, any>;
  callerContext: {
    userId: string;
    workspaceId: string;
    platformRole: string;
    workspaceRole?: string;
    sessionId?: string;
    taskId?: string;
    subagentId?: string;
  };
  options?: {
    dryRun?: boolean;
    bypassReason?: string;
    timeoutMs?: number;
  };
}

export interface ToolExecutionResult {
  success: boolean;
  authorized: boolean;
  result?: any;
  error?: string;
  durationMs: number;
  toolCall: TrinityToolCall;
}

export interface ToolAuthorizationPolicy {
  toolId: string;
  requiredMinimumRole: string;
  requiresWorkspaceAccess: boolean;
  allowedActions: string[];
  sensitiveActions: string[]; // Actions that require higher privileges
  bypassAllowedRoles: string[];
}

// Default tool policies (can be extended)
const DEFAULT_TOOL_POLICIES: Record<string, Partial<ToolAuthorizationPolicy>> = {
  'calendar': {
    requiredMinimumRole: 'member',
    requiresWorkspaceAccess: true,
    allowedActions: ['read', 'list', 'check_availability'],
    sensitiveActions: ['create', 'update', 'delete'],
  },
  'payroll': {
    requiredMinimumRole: 'org_admin',
    requiresWorkspaceAccess: true,
    allowedActions: ['view_summary'],
    sensitiveActions: ['calculate', 'approve', 'submit'],
    bypassAllowedRoles: ['root_admin', 'deputy_admin'],
  },
  'invoice': {
    requiredMinimumRole: 'org_admin',
    requiresWorkspaceAccess: true,
    allowedActions: ['list', 'view', 'generate'],
    sensitiveActions: ['send', 'void', 'apply_discount'],
  },
  'notification': {
    requiredMinimumRole: 'member',
    requiresWorkspaceAccess: false,
    allowedActions: ['send', 'list', 'read'],
    sensitiveActions: ['broadcast', 'force_clear'],
    bypassAllowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
  },
  'database': {
    requiredMinimumRole: 'sysop',
    requiresWorkspaceAccess: false,
    allowedActions: ['query', 'list_tables'],
    sensitiveActions: ['execute', 'migrate', 'backup', 'restore'],
    bypassAllowedRoles: ['root_admin'],
  },
  'file_system': {
    requiredMinimumRole: 'support_agent',
    requiresWorkspaceAccess: false,
    allowedActions: ['read', 'list', 'search'],
    sensitiveActions: ['write', 'delete', 'move'],
    bypassAllowedRoles: ['root_admin', 'deputy_admin', 'sysop'],
  },
  'ai_brain': {
    requiredMinimumRole: 'member',
    requiresWorkspaceAccess: true,
    allowedActions: ['query', 'chat', 'analyze'],
    sensitiveActions: ['execute_action', 'approve_automation', 'override'],
  },
  'scheduling': {
    requiredMinimumRole: 'member',
    requiresWorkspaceAccess: true,
    allowedActions: ['view', 'list', 'check_conflicts'],
    sensitiveActions: ['create_shift', 'delete_shift', 'bulk_update'],
  },
  'compliance': {
    requiredMinimumRole: 'org_admin',
    requiresWorkspaceAccess: true,
    allowedActions: ['check', 'report', 'list_violations'],
    sensitiveActions: ['remediate', 'waive', 'override'],
    bypassAllowedRoles: ['root_admin', 'compliance_officer'],
  },
};

// Role hierarchy for comparison
const ROLE_HIERARCHY: Record<string, number> = {
  'root_admin': 100,
  'deputy_admin': 90,
  'sysop': 80,
  'support_manager': 70,
  'support_agent': 60,
  'compliance_officer': 55,
  'org_owner': 50,
  'org_admin': 45,
  'department_manager': 40,
  'supervisor': 35,
  'team_lead': 30,
  'employee': 20,
  'member': 15,
  'client': 10,
  'guest': 5,
  'Bot': 85, // Bots have elevated access
};

// ============================================================================
// SECURE TOOL EXECUTOR SERVICE
// ============================================================================

class SecureToolExecutor {
  private static instance: SecureToolExecutor;
  private toolPolicies: Map<string, ToolAuthorizationPolicy> = new Map();

  private constructor() {
    console.log('[SecureToolExecutor] Initializing secure tool executor...');
    this.initializeDefaultPolicies();
  }

  static getInstance(): SecureToolExecutor {
    if (!SecureToolExecutor.instance) {
      SecureToolExecutor.instance = new SecureToolExecutor();
    }
    return SecureToolExecutor.instance;
  }

  private initializeDefaultPolicies(): void {
    for (const [toolId, policy] of Object.entries(DEFAULT_TOOL_POLICIES)) {
      this.toolPolicies.set(toolId, {
        toolId,
        requiredMinimumRole: policy.requiredMinimumRole || 'member',
        requiresWorkspaceAccess: policy.requiresWorkspaceAccess ?? true,
        allowedActions: policy.allowedActions || [],
        sensitiveActions: policy.sensitiveActions || [],
        bypassAllowedRoles: policy.bypassAllowedRoles || ['root_admin'],
      });
    }
  }

  /**
   * Register a custom tool policy
   */
  registerToolPolicy(policy: ToolAuthorizationPolicy): void {
    this.toolPolicies.set(policy.toolId, policy);
  }

  /**
   * Get policy for a tool
   */
  getToolPolicy(toolId: string): ToolAuthorizationPolicy {
    return this.toolPolicies.get(toolId) || {
      toolId,
      requiredMinimumRole: 'member',
      requiresWorkspaceAccess: true,
      allowedActions: [],
      sensitiveActions: [],
      bypassAllowedRoles: ['root_admin'],
    };
  }

  /**
   * Check if role meets minimum requirement
   */
  private roleHasMinimumLevel(callerRole: string, requiredRole: string): boolean {
    const callerLevel = ROLE_HIERARCHY[callerRole] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 100;
    return callerLevel >= requiredLevel;
  }

  /**
   * Authorize a tool call
   */
  async authorizeToolCall(request: ToolExecutionRequest): Promise<{
    authorized: boolean;
    reason?: string;
    bypassApplied?: boolean;
  }> {
    const { toolId, action, callerContext, options } = request;
    const policy = this.getToolPolicy(toolId);
    const callerRole = callerContext.platformRole;

    // Check for bypass
    if (options?.bypassReason && policy.bypassAllowedRoles.includes(callerRole)) {
      return { authorized: true, bypassApplied: true, reason: options.bypassReason };
    }

    // Check minimum role requirement
    if (!this.roleHasMinimumLevel(callerRole, policy.requiredMinimumRole)) {
      return {
        authorized: false,
        reason: `Role ${callerRole} does not meet minimum requirement ${policy.requiredMinimumRole}`,
      };
    }

    // SECURITY: Verify action is explicitly allowed (not bypass roles can only use declared actions)
    const allDeclaredActions = [...policy.allowedActions, ...policy.sensitiveActions];
    if (allDeclaredActions.length > 0 && !allDeclaredActions.includes(action)) {
      // Action not in any allowed list - deny unless caller has bypass role
      if (!policy.bypassAllowedRoles.includes(callerRole)) {
        return {
          authorized: false,
          reason: `Action '${action}' is not permitted for tool '${toolId}'. Allowed actions: ${allDeclaredActions.join(', ')}`,
        };
      }
      // Bypass role can use undeclared actions, log it
      console.warn(`[SecureToolExecutor] Bypass role ${callerRole} using undeclared action '${action}' on tool '${toolId}'`);
    }

    // Check if action is sensitive and requires elevated permissions
    if (policy.sensitiveActions.includes(action)) {
      // Sensitive actions require higher role or explicit bypass
      const sensitiveMinRole = this.getElevatedRoleForSensitiveAction(policy);
      if (!this.roleHasMinimumLevel(callerRole, sensitiveMinRole)) {
        return {
          authorized: false,
          reason: `Sensitive action '${action}' requires role ${sensitiveMinRole} or higher`,
        };
      }
    }

    // Check workspace access if required
    if (policy.requiresWorkspaceAccess && callerContext.workspaceId) {
      try {
        const hasAccess = await aiBrainAuthorizationService.canAccessWorkspace(
          callerContext.userId,
          callerContext.workspaceId,
          callerRole
        );
        if (!hasAccess) {
          return {
            authorized: false,
            reason: `User does not have access to workspace ${callerContext.workspaceId}`,
          };
        }
      } catch (error) {
        console.warn('[SecureToolExecutor] Workspace access check failed:', error);
        // Fail closed - deny if we can't verify
        return {
          authorized: false,
          reason: 'Workspace access verification failed',
        };
      }
    }

    return { authorized: true };
  }

  private getElevatedRoleForSensitiveAction(policy: ToolAuthorizationPolicy): string {
    // Sensitive actions require at least org_admin or the first bypass role
    const minimumLevel = ROLE_HIERARCHY[policy.requiredMinimumRole] ?? 0;
    const orgAdminLevel = ROLE_HIERARCHY['org_admin'] ?? 45;
    
    if (minimumLevel >= orgAdminLevel) {
      return policy.bypassAllowedRoles[0] || 'root_admin';
    }
    return 'org_admin';
  }

  /**
   * Execute a tool with RBAC authorization
   */
  async executeSecurely(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const callId = `call-${crypto.randomUUID().slice(0, 8)}`;

    console.log(`[SecureToolExecutor] ${callId} Executing ${request.toolName}.${request.action}`);

    // Build tool call record
    const toolCall: TrinityToolCall = {
      toolId: request.toolId,
      toolName: request.toolName,
      action: request.action,
      parameters: request.parameters,
      rbacContext: {
        requiredRole: this.getToolPolicy(request.toolId).requiredMinimumRole,
        callerRole: request.callerContext.platformRole,
        workspaceId: request.callerContext.workspaceId,
        userId: request.callerContext.userId,
        authorized: false,
        bypassReason: request.options?.bypassReason,
      },
      timestamp: new Date().toISOString(),
    };

    // Authorize
    const authResult = await this.authorizeToolCall(request);
    toolCall.rbacContext.authorized = authResult.authorized;

    if (!authResult.authorized) {
      // Log denial
      await this.logToolCallDenial(request, authResult.reason || 'Unauthorized', callId);

      toolCall.error = authResult.reason;
      toolCall.durationMs = Date.now() - startTime;

      return {
        success: false,
        authorized: false,
        error: authResult.reason,
        durationMs: Date.now() - startTime,
        toolCall,
      };
    }

    // Dry run check
    if (request.options?.dryRun) {
      toolCall.result = { dryRun: true, wouldExecute: request.action };
      toolCall.durationMs = Date.now() - startTime;

      return {
        success: true,
        authorized: true,
        result: toolCall.result,
        durationMs: Date.now() - startTime,
        toolCall,
      };
    }

    // Execute through tool registry
    try {
      const result = await this.delegateToToolRegistry(request);
      
      toolCall.result = result;
      toolCall.durationMs = Date.now() - startTime;

      // Log successful execution
      await this.logToolCallSuccess(request, callId, Date.now() - startTime);

      // Publish event
      platformEventBus.publish('ai_brain_action', {
        action: 'tool_executed',
        toolId: request.toolId,
        toolAction: request.action,
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        taskId: request.callerContext.taskId,
        durationMs: Date.now() - startTime,
        bypassApplied: authResult.bypassApplied,
      });

      return {
        success: true,
        authorized: true,
        result,
        durationMs: Date.now() - startTime,
        toolCall,
      };
    } catch (error: any) {
      toolCall.error = error.message;
      toolCall.durationMs = Date.now() - startTime;

      await this.logToolCallError(request, error.message, callId);

      return {
        success: false,
        authorized: true,
        error: error.message,
        durationMs: Date.now() - startTime,
        toolCall,
      };
    }
  }

  /**
   * Delegate to tool capability registry for actual execution
   */
  private async delegateToToolRegistry(request: ToolExecutionRequest): Promise<any> {
    const { toolId, action, parameters, callerContext } = request;

    // Try to find and execute through registry
    try {
      const tool = await toolCapabilityRegistry.getTool(callerContext.workspaceId, toolId);
      
      if (tool && typeof tool.execute === 'function') {
        return await tool.execute(action, parameters, callerContext);
      }

      // SECURITY: Only allow simulation for bypass-eligible roles
      const policy = this.getToolPolicy(toolId);
      if (!policy.bypassAllowedRoles.includes(callerContext.platformRole)) {
        throw new Error(`Tool '${toolId}' not found in registry. Only elevated roles can execute unregistered tools.`);
      }

      // Bypass role: warn but allow simulated execution
      console.warn(`[SecureToolExecutor] BYPASS: Tool ${toolId} not in registry, simulated execution by ${callerContext.platformRole}`);
      return {
        simulated: true,
        tool: toolId,
        action,
        parameters,
        message: 'Tool executed (simulated - elevated role bypass)',
        warning: 'Tool not in registry - execution simulated',
      };
    } catch (error: any) {
      // If registry lookup fails, re-throw
      throw new Error(`Tool execution failed: ${error.message}`);
    }
  }

  /**
   * Log tool call denial to audit log
   */
  private async logToolCallDenial(
    request: ToolExecutionRequest,
    reason: string,
    callId: string
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: `audit-${crypto.randomUUID()}`,
        eventType: 'tool_call_denied',
        severity: 'warning',
        source: 'SecureToolExecutor',
        message: `Tool call DENIED: ${request.toolName}.${request.action} - ${reason}`,
        metadata: {
          callId,
          toolId: request.toolId,
          toolName: request.toolName,
          action: request.action,
          callerUserId: request.callerContext.userId,
          callerRole: request.callerContext.platformRole,
          workspaceId: request.callerContext.workspaceId,
          taskId: request.callerContext.taskId,
          subagentId: request.callerContext.subagentId,
          reason,
        },
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        createdAt: new Date(),
      });

      console.warn(`[SecureToolExecutor] ${callId} DENIED: ${request.toolName}.${request.action} - ${reason}`);
    } catch (e) {
      console.error('[SecureToolExecutor] Failed to log denial:', e);
    }
  }

  /**
   * Log successful tool call
   */
  private async logToolCallSuccess(
    request: ToolExecutionRequest,
    callId: string,
    durationMs: number
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: `audit-${crypto.randomUUID()}`,
        eventType: 'tool_call_executed',
        severity: 'info',
        source: 'SecureToolExecutor',
        message: `Tool call executed: ${request.toolName}.${request.action} (${durationMs}ms)`,
        metadata: {
          callId,
          toolId: request.toolId,
          toolName: request.toolName,
          action: request.action,
          callerUserId: request.callerContext.userId,
          callerRole: request.callerContext.platformRole,
          workspaceId: request.callerContext.workspaceId,
          taskId: request.callerContext.taskId,
          durationMs,
        },
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[SecureToolExecutor] Failed to log success:', e);
    }
  }

  /**
   * Log tool call error
   */
  private async logToolCallError(
    request: ToolExecutionRequest,
    error: string,
    callId: string
  ): Promise<void> {
    try {
      await db.insert(systemAuditLogs).values({
        id: `audit-${crypto.randomUUID()}`,
        eventType: 'tool_call_error',
        severity: 'error',
        source: 'SecureToolExecutor',
        message: `Tool call ERROR: ${request.toolName}.${request.action} - ${error}`,
        metadata: {
          callId,
          toolId: request.toolId,
          toolName: request.toolName,
          action: request.action,
          callerUserId: request.callerContext.userId,
          callerRole: request.callerContext.platformRole,
          workspaceId: request.callerContext.workspaceId,
          taskId: request.callerContext.taskId,
          error,
        },
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error('[SecureToolExecutor] Failed to log error:', e);
    }
  }

  /**
   * Batch execute multiple tools with authorization
   */
  async executeBatch(
    requests: ToolExecutionRequest[]
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(requests.map(req => this.executeSecurely(req)));
  }

  /**
   * Check authorization without executing
   */
  async checkAuthorization(request: ToolExecutionRequest): Promise<{
    authorized: boolean;
    reason?: string;
    policy: ToolAuthorizationPolicy;
  }> {
    const authResult = await this.authorizeToolCall(request);
    return {
      ...authResult,
      policy: this.getToolPolicy(request.toolId),
    };
  }
}

export const secureToolExecutor = SecureToolExecutor.getInstance();
