/**
 * DOMAIN LEAD SUPERVISOR BRAIN ACTIONS
 * =====================================
 * Registers domain lead supervisor actions with AI Brain Master Orchestrator.
 * Provides 27 specialized actions for RevenueOps, SecurityOps, OnboardingOps,
 * Enhanced LLM Judge, and Supervisor Management.
 */

import { domainLeadSupervisorService } from './domainLeadSupervisors';
import { enhancedLLMJudge } from './llmJudgeEnhanced';
import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/helpaiActionOrchestrator';

export function registerDomainSupervisorActions(): void {
  console.log('[DomainSupervisorActions] Registering domain lead supervisor actions...');

  // ============================================================================
  // REVENUE OPS ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'revenue.validate_credits',
    name: 'Validate Credits',
    description: 'Validate workspace credit balance and usage',
    category: 'invoicing',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('revenue_ops', 'validate_credits', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return {
          success: result.success,
          actionId: request.actionId,
          data: result.data,
          message: result.error || 'Credit validation complete',
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'revenue.process_payment',
    name: 'Process Payment',
    description: 'Process a payment through the payment gateway',
    category: 'invoicing',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('revenue_ops', 'process_payment', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Payment processed', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'revenue.generate_invoice',
    name: 'Generate Invoice',
    description: 'Generate an invoice for a client',
    category: 'invoicing',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('revenue_ops', 'generate_invoice', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Invoice generated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'revenue.process_payroll',
    name: 'Process Payroll',
    description: 'Process payroll for employees',
    category: 'payroll',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('revenue_ops', 'process_payroll', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'critical',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Payroll processed', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'revenue.reconcile_payments',
    name: 'Reconcile Payments',
    description: 'Reconcile payments with invoices',
    category: 'invoicing',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('revenue_ops', 'reconcile_payments', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Payments reconciled', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'revenue.detect_anomalies',
    name: 'Detect Financial Anomalies',
    description: 'Use AI to detect anomalies in financial data',
    category: 'analytics',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('revenue_ops', 'detect_anomalies', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Anomaly detection complete', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  console.log('[DomainSupervisorActions] Registered 6 RevenueOps actions');

  // ============================================================================
  // SECURITY OPS ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'security.evaluate_policy',
    name: 'Evaluate Security Policy',
    description: 'Evaluate ABAC policy for an access request',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'evaluate_policy', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Policy evaluated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.check_permissions',
    name: 'Check Permissions',
    description: 'Check user permissions for a resource',
    category: 'security',
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'check_permissions', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Permissions checked', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.audit_access',
    name: 'Audit Access',
    description: 'Generate access audit report',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'audit_access', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Access audit complete', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.detect_threats',
    name: 'Detect Security Threats',
    description: 'Scan for security threats and anomalies',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'detect_threats', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Threat detection complete', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.rotate_credentials',
    name: 'Rotate Credentials',
    description: 'Rotate API keys and credentials',
    category: 'security',
    requiredRoles: ['super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'rotate_credentials', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'critical',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Credentials rotated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.validate_compliance',
    name: 'Validate Compliance',
    description: 'Check compliance status against regulations',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'validate_compliance', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Compliance validated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  console.log('[DomainSupervisorActions] Registered 6 SecurityOps actions');

  // ============================================================================
  // ONBOARDING OPS ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.connect_integration',
    name: 'Connect Integration',
    description: 'Connect to a third-party integration',
    category: 'automation',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'connect_integration', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Integration connected', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.migrate_data',
    name: 'Migrate Data',
    description: 'Migrate data from external sources',
    category: 'automation',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'migrate_data', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Data migrated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.provision_workspace',
    name: 'Provision Workspace',
    description: 'Set up a new workspace with defaults',
    category: 'automation',
    requiredRoles: ['super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'provision_workspace', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Workspace provisioned', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.setup_defaults',
    name: 'Setup Defaults',
    description: 'Apply default configurations to workspace',
    category: 'automation',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'setup_defaults', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Defaults applied', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.track_progress',
    name: 'Track Onboarding Progress',
    description: 'Track user onboarding progress',
    category: 'analytics',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'track_progress', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Progress tracked', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.recommend_features',
    name: 'Recommend Features',
    description: 'AI-powered feature recommendations',
    category: 'automation',
    requiredRoles: ['employee', 'manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'recommend_features', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Features recommended', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  console.log('[DomainSupervisorActions] Registered 6 OnboardingOps actions');

  // ============================================================================
  // ENHANCED LLM JUDGE ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'judge.evaluate_risk',
    name: 'Evaluate Risk',
    description: 'Evaluate risk for an action or operation using AI Judge',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await enhancedLLMJudge.initialize();
        const result = await enhancedLLMJudge.evaluateRisk({
          subjectId: request.payload?.subjectId || 'unknown',
          subjectType: request.payload?.subjectType || 'action',
          content: request.payload?.content,
          context: request.payload?.context || {},
          workspaceId: request.workspaceId,
          userId: request.userId,
          isDestructive: request.payload?.isDestructive,
          affectsFinancials: request.payload?.affectsFinancials,
          affectsUserData: request.payload?.affectsUserData,
          actionType: request.payload?.actionType,
          domain: request.payload?.domain,
        });
        return { success: true, actionId: request.actionId, data: result, message: `Risk evaluation: ${result.verdict}`, executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.evaluate_hotpatch',
    name: 'Evaluate Hotpatch',
    description: 'Evaluate a code hotpatch for deployment safety',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await enhancedLLMJudge.initialize();
        const result = await enhancedLLMJudge.evaluateHotpatch(request.payload?.patchContent || '', {
          targetFile: request.payload?.targetFile || 'unknown',
          changeDescription: request.payload?.changeDescription || '',
          workspaceId: request.workspaceId,
          userId: request.userId,
        });
        return { success: true, actionId: request.actionId, data: result, message: `Hotpatch ${result.canDeploy ? 'approved' : 'blocked'}`, executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.get_policies',
    name: 'Get Active Policies',
    description: 'Get list of active risk policies',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      return { success: true, actionId: request.actionId, data: { policies: enhancedLLMJudge.getActivePolicies() }, message: 'Policies retrieved', executionTimeMs: Date.now() - startTime };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.get_blocked_patterns',
    name: 'Get Blocked Patterns',
    description: 'Get list of blocked regression patterns',
    category: 'security',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await enhancedLLMJudge.initialize();
        const patterns = await enhancedLLMJudge.getBlockedPatterns();
        return { success: true, actionId: request.actionId, data: { patterns, count: patterns.length }, message: `${patterns.length} blocked patterns`, executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.record_failure',
    name: 'Record Failure',
    description: 'Record a failure for regression tracking',
    category: 'automation',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await enhancedLLMJudge.initialize();
        await enhancedLLMJudge.recordFailure({
          subjectId: request.payload?.subjectId || 'unknown',
          subjectType: request.payload?.subjectType || 'action',
          content: request.payload?.content,
          context: request.payload?.context || {},
          workspaceId: request.workspaceId,
          userId: request.userId,
          actionType: request.payload?.actionType,
          domain: request.payload?.domain,
        }, request.payload?.errorMessage || 'Unknown error');
        return { success: true, actionId: request.actionId, message: 'Failure recorded for regression tracking', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.record_success',
    name: 'Record Success',
    description: 'Record a success to reduce failure count',
    category: 'automation',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await enhancedLLMJudge.initialize();
        await enhancedLLMJudge.recordSuccess({
          subjectId: request.payload?.subjectId || 'unknown',
          subjectType: request.payload?.subjectType || 'action',
          content: request.payload?.content,
          context: request.payload?.context || {},
          workspaceId: request.workspaceId,
          userId: request.userId,
          actionType: request.payload?.actionType,
          domain: request.payload?.domain,
        });
        return { success: true, actionId: request.actionId, message: 'Success recorded', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  console.log('[DomainSupervisorActions] Registered 6 Enhanced LLM Judge actions');

  // ============================================================================
  // SUPERVISOR MANAGEMENT ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'supervisor.get_health',
    name: 'Get Supervisor Health',
    description: 'Get health status of all domain supervisors',
    category: 'health',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      return { success: true, actionId: request.actionId, data: { health: domainLeadSupervisorService.getSupervisorHealth() }, message: 'Health status retrieved', executionTimeMs: Date.now() - startTime };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'supervisor.list_all',
    name: 'List All Supervisors',
    description: 'List all domain lead supervisors with their subagents',
    category: 'system',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const supervisors = domainLeadSupervisorService.getAllSupervisors().map(s => ({
        id: s.id,
        domain: s.domain,
        name: s.name,
        status: s.status,
        subagentCount: s.subagents.length,
        subagents: s.subagents.map(sa => ({ id: sa.id, name: sa.name, healthStatus: sa.healthStatus })),
        metrics: s.metrics,
      }));
      return { success: true, actionId: request.actionId, data: { supervisors, count: supervisors.length }, message: `${supervisors.length} domain supervisors`, executionTimeMs: Date.now() - startTime };
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'supervisor.persist_telemetry',
    name: 'Persist Supervisor Telemetry',
    description: 'Save supervisor telemetry to database',
    category: 'automation',
    requiredRoles: ['super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await domainLeadSupervisorService.persistTelemetry();
        return { success: true, actionId: request.actionId, message: 'Telemetry persisted', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: error.message, executionTimeMs: Date.now() - startTime };
      }
    },
  });

  console.log('[DomainSupervisorActions] Registered 3 Supervisor Management actions');
  console.log('[DomainSupervisorActions] Total: 27 domain-related actions registered');
  console.log('[DomainSupervisorActions] Categories: RevenueOps (6), SecurityOps (6), OnboardingOps (6), LLM Judge (6), Management (3)');
}
