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
import { platformEventBus } from '../platformEventBus';
import type { TrinityToolCall } from '@shared/schema';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('secureToolExecutor');

// ============================================================================
// TYPES
// ============================================================================

export interface ToolExecutionRequest {
  toolId: string;
  toolName: string;
  action: string;
  parameters: Record<string, unknown>;
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
    dryRunWithDiff?: boolean; // Enhanced dry-run with diff preview
    bypassReason?: string;
    timeoutMs?: number;
  };
}

// Enhanced dry-run result with diff preview (solves "Execution Sandboxing" gap)
export interface DryRunPreview {
  wouldExecute: boolean;
  action: string;
  toolId: string;
  toolName: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: string[];
  estimatedChanges: DryRunChange[];
  sideEffects: string[];
  rollbackAvailable: boolean;
  rollbackSteps?: string[];
  confidenceScore: number;
  warningsCount: number;
  warnings: string[];
}

export interface DryRunChange {
  entity: string;
  entityId?: string;
  changeType: 'create' | 'update' | 'delete' | 'read' | 'invoke';
  field?: string;
  currentValue?: any;
  newValue?: any;
  diffPreview?: string;
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
    requiredMinimumRole: 'co_owner',
    requiresWorkspaceAccess: true,
    allowedActions: ['view_summary'],
    sensitiveActions: ['calculate', 'approve', 'submit'],
    bypassAllowedRoles: ['root_admin', 'deputy_admin'],
  },
  'invoice': {
    requiredMinimumRole: 'co_owner',
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
    requiredMinimumRole: 'co_owner',
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
  'co_owner': 45,
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
    log.info('[SecureToolExecutor] Initializing secure tool executor...');
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
      log.warn(`[SecureToolExecutor] Bypass role ${callerRole} using undeclared action '${action}' on tool '${toolId}'`);
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
        const hasAccess = await (aiBrainAuthorizationService as any).canAccessWorkspace(
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
        log.warn('[SecureToolExecutor] Workspace access check failed:', error);
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
    // Sensitive actions require at least co_owner or the first bypass role
    const minimumLevel = ROLE_HIERARCHY[policy.requiredMinimumRole] ?? 0;
    const orgAdminLevel = ROLE_HIERARCHY['co_owner'] ?? 45;
    
    if (minimumLevel >= orgAdminLevel) {
      return policy.bypassAllowedRoles[0] || 'root_admin';
    }
    return 'co_owner';
  }

  /**
   * Execute a tool with RBAC authorization
   */
  async executeSecurely(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const callId = `call-${crypto.randomUUID().slice(0, 8)}`;

    log.info(`[SecureToolExecutor] ${callId} Executing ${request.toolName}.${request.action}`);

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
      toolCall.error = (error instanceof Error ? error.message : String(error));
      toolCall.durationMs = Date.now() - startTime;

      await this.logToolCallError(request, (error instanceof Error ? error.message : String(error)), callId);

      return {
        success: false,
        authorized: true,
        error: (error instanceof Error ? error.message : String(error)),
        durationMs: Date.now() - startTime,
        toolCall,
      };
    }
  }

  /**
   * Delegate to tool capability registry for actual execution
   */
  private async delegateToToolRegistry(request: ToolExecutionRequest): Promise<unknown> {
    const { toolId, action, parameters, callerContext } = request;

    // Try to find and execute through registry
    try {
      const tool = await toolCapabilityRegistry.getTool(callerContext.workspaceId, toolId);
      
      if (tool && typeof (tool as any).execute === 'function') {
        return await (tool as any).execute(action, parameters, callerContext);
      }

      // SECURITY: Only allow simulation for bypass-eligible roles
      const policy = this.getToolPolicy(toolId);
      if (!policy.bypassAllowedRoles.includes(callerContext.platformRole)) {
        throw new Error(`Tool '${toolId}' not found in registry. Only elevated roles can execute unregistered tools.`);
      }

      log.warn(`[SecureToolExecutor] BYPASS: Tool ${toolId} not found in registry. Elevated role ${callerContext.platformRole} attempted execution.`);
      throw new Error(`Tool '${toolId}' is not registered. Cannot execute unregistered tools even with elevated privileges.`);
    } catch (error: any) {
      // If registry lookup fails, re-throw
      throw new Error(`Tool execution failed: ${(error instanceof Error ? error.message : String(error))}`);
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
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        createdAt: new Date(),
        metadata: { eventType: 'tool_call_denied', severity: 'warning', source: 'SecureToolExecutor', message: `Tool call DENIED: ${request.toolName}.${request.action} - ${reason}`,
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
        } },
      });

      log.warn(`[SecureToolExecutor] ${callId} DENIED: ${request.toolName}.${request.action} - ${reason}`);
    } catch (e) {
      log.error('[SecureToolExecutor] Failed to log denial:', e);
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
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        createdAt: new Date(),
        metadata: { eventType: 'tool_call_executed', severity: 'info', source: 'SecureToolExecutor', message: `Tool call executed: ${request.toolName}.${request.action} (${durationMs}ms)`,
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
        } },
      });
    } catch (e) {
      log.error('[SecureToolExecutor] Failed to log success:', e);
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
        userId: request.callerContext.userId,
        workspaceId: request.callerContext.workspaceId,
        createdAt: new Date(),
        metadata: { eventType: 'tool_call_error', severity: 'error', source: 'SecureToolExecutor', message: `Tool call ERROR: ${request.toolName}.${request.action} - ${error}`,
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
        } },
      });
    } catch (e) {
      log.error('[SecureToolExecutor] Failed to log error:', e);
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

  // ============================================================================
  // EXECUTION SANDBOXING - Enhanced Dry-Run with Diff Preview
  // ============================================================================

  /**
   * Execute in dry-run mode with comprehensive diff preview
   * This solves the "Execution Sandboxing" gap
   */
  async executeDryRunWithDiff(request: ToolExecutionRequest): Promise<{
    authorized: boolean;
    preview: DryRunPreview;
    authorizationDetails: {
      reason?: string;
      policy: ToolAuthorizationPolicy;
    };
  }> {
    const policy = this.getToolPolicy(request.toolId);
    const authResult = await this.authorizeToolCall(request);

    // Analyze risk level based on action and tool
    const riskAnalysis = this.analyzeActionRisk(request, policy);
    
    // Build estimated changes based on action type
    const estimatedChanges = this.estimateChanges(request);
    
    // Determine side effects
    const sideEffects = this.identifySideEffects(request, policy);
    
    // Check if rollback is possible
    const rollbackInfo = this.analyzeRollbackCapability(request, policy);

    const preview: DryRunPreview = {
      wouldExecute: authResult.authorized,
      action: request.action,
      toolId: request.toolId,
      toolName: request.toolName,
      riskLevel: riskAnalysis.level,
      riskFactors: riskAnalysis.factors,
      estimatedChanges,
      sideEffects,
      rollbackAvailable: rollbackInfo.available,
      rollbackSteps: rollbackInfo.steps,
      confidenceScore: this.calculateConfidenceScore(request, estimatedChanges),
      warningsCount: riskAnalysis.warnings.length,
      warnings: riskAnalysis.warnings,
    };

    return {
      authorized: authResult.authorized,
      preview,
      authorizationDetails: {
        reason: authResult.reason,
        policy,
      },
    };
  }

  /**
   * Analyze the risk level of an action
   */
  private analyzeActionRisk(
    request: ToolExecutionRequest,
    policy: ToolAuthorizationPolicy
  ): { level: DryRunPreview['riskLevel']; factors: string[]; warnings: string[] } {
    const factors: string[] = [];
    const warnings: string[] = [];
    let riskScore = 0;

    // Sensitive actions are higher risk
    if (policy.sensitiveActions.includes(request.action)) {
      factors.push('Action is classified as sensitive');
      riskScore += 30;
    }

    // Check action type keywords
    const action = request.action.toLowerCase();
    if (action.includes('delete') || action.includes('remove')) {
      factors.push('Destructive action (delete/remove)');
      riskScore += 40;
      warnings.push('This action will permanently delete data');
    }
    if (action.includes('bulk') || action.includes('all')) {
      factors.push('Bulk operation affecting multiple records');
      riskScore += 20;
      warnings.push('Bulk operations affect multiple records simultaneously');
    }
    if (action.includes('override') || action.includes('force')) {
      factors.push('Override/force action bypassing safeguards');
      riskScore += 25;
    }
    if (action.includes('approve') || action.includes('submit')) {
      factors.push('Approval/submission action (may trigger workflows)');
      riskScore += 15;
    }

    // Check tool category
    if (['payroll', 'compliance', 'database'].includes(request.toolId)) {
      factors.push(`High-sensitivity tool category: ${request.toolId}`);
      riskScore += 20;
    }

    // Determine risk level
    let level: DryRunPreview['riskLevel'] = 'low';
    if (riskScore >= 60) level = 'critical';
    else if (riskScore >= 40) level = 'high';
    else if (riskScore >= 20) level = 'medium';

    return { level, factors, warnings };
  }

  /**
   * Estimate the changes that would be made
   */
  private estimateChanges(request: ToolExecutionRequest): DryRunChange[] {
    const changes: DryRunChange[] = [];
    const action = request.action.toLowerCase();
    const params = request.parameters;

    // Infer change type from action
    let changeType: DryRunChange['changeType'] = 'invoke';
    if (action.includes('create') || action.includes('add') || action.includes('insert')) {
      changeType = 'create';
    } else if (action.includes('update') || action.includes('modify') || action.includes('edit')) {
      changeType = 'update';
    } else if (action.includes('delete') || action.includes('remove')) {
      changeType = 'delete';
    } else if (action.includes('read') || action.includes('get') || action.includes('list') || action.includes('view')) {
      changeType = 'read';
    }

    // Build change entry based on parameters
    const entityId = params.id || params.entityId || params.recordId;
    const entity = params.entity || params.type || request.toolId;

    changes.push({
      entity,
      entityId,
      changeType,
      diffPreview: this.generateDiffPreview(changeType, params),
    });

    // Add field-level changes if updating
    if (changeType === 'update' && params.updates) {
      for (const [field, newValue] of Object.entries(params.updates)) {
        changes.push({
          entity,
          entityId,
          changeType: 'update',
          field,
          currentValue: params.currentValues?.[field] ?? '(current value unknown)',
          newValue,
          diffPreview: `${field}: ${params.currentValues?.[field] ?? '?'} → ${newValue}`,
        });
      }
    }

    return changes;
  }

  /**
   * Generate a human-readable diff preview
   */
  private generateDiffPreview(changeType: DryRunChange['changeType'], params: Record<string, unknown>): string {
    switch (changeType) {
      case 'create':
        return `+ CREATE new record with: ${JSON.stringify(params, null, 2).slice(0, 200)}...`;
      case 'update':
        return `~ UPDATE record: ${params.id || 'unknown'} with changes`;
      case 'delete':
        return `- DELETE record: ${params.id || params.entityId || 'unknown'}`;
      case 'read':
        return `? READ operation (no changes)`;
      case 'invoke':
        return `> INVOKE action with parameters`;
      default:
        return `Unknown operation`;
    }
  }

  /**
   * Identify potential side effects
   */
  private identifySideEffects(
    request: ToolExecutionRequest,
    policy: ToolAuthorizationPolicy
  ): string[] {
    const sideEffects: string[] = [];
    const action = request.action.toLowerCase();

    // Common side effects by tool type
    if (request.toolId === 'payroll' || request.toolId.includes('payroll')) {
      sideEffects.push('May trigger financial transactions');
      sideEffects.push('May send payment notifications to employees');
    }
    if (request.toolId === 'notification' || action.includes('notify') || action.includes('send')) {
      sideEffects.push('Will send notifications to users');
    }
    if (request.toolId === 'scheduling' || action.includes('schedule')) {
      sideEffects.push('May send calendar updates to affected employees');
      sideEffects.push('May trigger overtime calculations');
    }
    if (action.includes('approve')) {
      sideEffects.push('May trigger downstream approval workflows');
    }
    if (action.includes('sync')) {
      sideEffects.push('May update external systems');
    }

    return sideEffects;
  }

  /**
   * Analyze if rollback is possible for this action
   */
  private analyzeRollbackCapability(
    request: ToolExecutionRequest,
    policy: ToolAuthorizationPolicy
  ): { available: boolean; steps?: string[] } {
    const action = request.action.toLowerCase();

    // Some actions cannot be rolled back
    if (action.includes('send') || action.includes('notify') || action.includes('email')) {
      return { available: false };
    }
    if (request.toolId === 'payroll' && (action.includes('submit') || action.includes('run'))) {
      return { available: false };
    }

    // Most CRUD operations can be rolled back
    if (action.includes('create')) {
      return {
        available: true,
        steps: [`Delete the created ${request.toolId} record`],
      };
    }
    if (action.includes('update')) {
      return {
        available: true,
        steps: [
          `Restore previous values from audit log`,
          `Apply inverse update to ${request.toolId}`,
        ],
      };
    }
    if (action.includes('delete')) {
      return {
        available: true,
        steps: [
          `Restore from soft-delete (if available)`,
          `Recreate record from audit log backup`,
        ],
      };
    }

    return { available: true, steps: ['Consult audit logs for rollback steps'] };
  }

  /**
   * Calculate confidence score for the dry-run analysis
   */
  private calculateConfidenceScore(
    request: ToolExecutionRequest,
    changes: DryRunChange[]
  ): number {
    let confidence = 0.8; // Base confidence

    // Lower confidence if we don't know current values
    const unknownValues = changes.filter(c => 
      c.changeType === 'update' && c.currentValue === '(current value unknown)'
    ).length;
    confidence -= unknownValues * 0.1;

    // Lower confidence for complex bulk operations
    if (request.action.toLowerCase().includes('bulk')) {
      confidence -= 0.15;
    }

    // Higher confidence for read-only operations
    if (changes.every(c => c.changeType === 'read')) {
      confidence = 0.95;
    }

    return Math.max(0.3, Math.min(1.0, confidence));
  }
}

export const secureToolExecutor = SecureToolExecutor.getInstance();
