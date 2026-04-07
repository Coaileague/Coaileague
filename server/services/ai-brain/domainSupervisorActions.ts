/**
 * DOMAIN LEAD SUPERVISOR BRAIN ACTIONS
 * =====================================
 * Registers domain lead supervisor actions with AI Brain Master Orchestrator.
 * Provides 27 specialized actions for RevenueOps, SecurityOps, OnboardingOps,
 * Enhanced LLM Judge, and Supervisor Management.
 */

import { domainLeadSupervisorService } from './domainLeadSupervisors';
import { enhancedLLMJudge } from './llmJudgeEnhanced';
import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { createLogger } from '../../lib/logger';
const log = createLogger('domainSupervisorActions');

export function registerDomainSupervisorActions(): void {
  log.info('[DomainSupervisorActions] Registering domain lead supervisor actions...');

  // ============================================================================
  // PHASE 2 CLEANUP: Deferred 37 actions, keeping 2 LLM Judge core actions
  // Evidence: grep shows these are only in registration files, not actively called
  // Actual work done by: coreSubagentOrchestration.ts, billingOrchestrationService.ts
  // ============================================================================

  /* DEFERRED: SecurityOps, OnboardingOps, DataOps, CommunicationOps (24 actions) - not MVP
  // ============================================================================
  // SECURITY OPS ACTIONS - Trinity compliance automation
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'security.evaluate_policy',
    name: 'Evaluate Security Policy',
    description: 'Evaluate ABAC policy for an access request',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.check_permissions',
    name: 'Check Permissions',
    description: 'Check user permissions for a resource',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'check_permissions', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Permissions checked', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.audit_access',
    name: 'Audit Access',
    description: 'Generate access audit report',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'audit_access', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Access audit complete', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.detect_threats',
    name: 'Detect Security Threats',
    description: 'Scan for security threats and anomalies',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.rotate_credentials',
    name: 'Rotate Credentials',
    description: 'Rotate API keys and credentials',
    category: 'security',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.validate_compliance',
    name: 'Validate Compliance',
    description: 'Check compliance status against regulations',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('security_ops', 'validate_compliance', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Compliance validated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 6 SecurityOps actions');

  // ============================================================================
  // ONBOARDING OPS ACTIONS
  // ============================================================================

  // onboarding.configure — consolidates: get_routing_config (default), validate_routing (action='validate_routing'), connect_integration (action='connect_integration')
  // NOTE: get_routing_config and validate_routing are registered in aiBrainMasterOrchestrator.ts (registerOnboardingAssistantActions).
  // connect_integration is folded into onboarding.configure below.
  // The old onboarding.connect_integration registration is commented out.

  // helpaiOrchestrator.registerAction({ actionId: 'onboarding.connect_integration', ... }); // CONSOLIDATED into onboarding.configure

  // onboarding.migrate — consolidates: migrate_data (default), apply_auto_fixes (action='auto_fix')
  // apply_auto_fixes is registered in aiBrainMasterOrchestrator.ts (registerOnboardingAssistantActions).
  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.migrate',
    name: 'Migrate Data',
    description: 'Migrate data from external sources or apply automatic fixes. Use payload.action="auto_fix" to apply auto-fixes (requires fixActions array); default migrates data.',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const { action: subAction, workspaceId: payloadWsId, fixActions, ...restPayload } = request.payload || {};

        if (subAction === 'auto_fix') {
          // Consolidated from onboarding.apply_auto_fixes
          const { orgOnboardingAssistant } = await import('./orgOnboardingAssistant');
          const result = await orgOnboardingAssistant.applyAutoFixes(
            payloadWsId || request.workspaceId!,
            fixActions || []
          );
          return {
            success: true,
            actionId: request.actionId,
            message: `Applied ${result.applied.length} fixes, ${result.failed.length} failed`,
            data: result,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // Default: migrate_data
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'migrate_data', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Data migrated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  // onboarding.provision — consolidates: provision_workspace (default), setup_defaults (phase='defaults')
  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.provision',
    name: 'Provision Workspace',
    description: 'Set up a new workspace with defaults. Use payload.phase="defaults" to apply default configurations only; default provisions the full workspace.',
    category: 'automation',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const { phase } = request.payload || {};

        if (phase === 'defaults') {
          // Consolidated from onboarding.setup_defaults
          const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'setup_defaults', request.payload || {}, {
            requestedBy: request.userId || 'system',
            workspaceId: request.workspaceId,
            priority: 'medium',
          });
          return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Defaults applied', executionTimeMs: Date.now() - startTime };
        }

        // Default: provision_workspace
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'provision_workspace', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Workspace provisioned', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  // helpaiOrchestrator.registerAction({ actionId: 'onboarding.setup_defaults', ... }); // CONSOLIDATED into onboarding.provision (phase='defaults')

  // onboarding.track — consolidates: track_progress (default), get_checklist (view='checklist'), get_platform_status (view='status')
  // get_checklist and get_platform_status are registered in actionRegistry.ts (registerOnboardingActions).
  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.track',
    name: 'Track Onboarding Progress',
    description: 'Track onboarding state. Use payload.view="checklist" to retrieve the onboarding checklist; view="status" for platform-wide invitation status; default tracks user onboarding progress.',
    category: 'analytics',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const { view } = request.payload || {};

        if (view === 'checklist') {
          // Consolidated from onboarding.get_checklist
          const { onboardingConfig } = await import('@shared/config/onboardingConfig');
          return {
            success: true,
            actionId: request.actionId,
            message: 'Onboarding checklist retrieved',
            data: onboardingConfig.onboardingSteps,
            executionTimeMs: Date.now() - startTime,
          };
        }

        if (view === 'status') {
          // Consolidated from onboarding.get_platform_status
          const { employeeInvitations } = await import('@shared/schema');
          const { db } = await import('../../db');
          const { eq, sql } = await import('drizzle-orm');

          const pending = await db.select({ count: sql`count(*)::int` })
            .from(employeeInvitations)
            .where(eq(employeeInvitations.inviteStatus, 'pending' as any));

          const accepted = await db.select({ count: sql`count(*)::int` })
            .from(employeeInvitations)
            .where(eq(employeeInvitations.inviteStatus, 'accepted' as any));

          const expired = await db.select({ count: sql`count(*)::int` })
            .from(employeeInvitations)
            .where(eq(employeeInvitations.inviteStatus, 'expired' as any));

          return {
            success: true,
            actionId: request.actionId,
            message: 'Platform onboarding status retrieved',
            data: {
              pendingInvitations: pending[0]?.count || 0,
              acceptedInvitations: accepted[0]?.count || 0,
              expiredInvitations: expired[0]?.count || 0,
            },
            executionTimeMs: Date.now() - startTime,
          };
        }

        // Default: track_progress
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'track_progress', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Progress tracked', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  // onboarding.recommend — consolidates: recommend_features (default), gather_billing_preferences (type='billing_prefs')
  // gather_billing_preferences is registered in actionRegistry.ts (registerOnboardingActions).
  helpaiOrchestrator.registerAction({
    actionId: 'onboarding.recommend',
    name: 'Recommend Features',
    description: 'AI-powered feature recommendations or billing preference gathering. Use payload.type="billing_prefs" to gather and persist client billing preferences (requires clientId); default recommends features.',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor', 'employee', 'staff'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const { type } = request.payload || {};

        if (type === 'billing_prefs') {
          // Consolidated from onboarding.gather_billing_preferences
          const { clientId, ...prefs } = request.payload || {};
          if (!clientId) {
            return { success: false, actionId: request.actionId, message: 'clientId required', executionTimeMs: Date.now() - startTime };
          }

          const { db } = await import('../../db');
          const { clientBillingSettings } = await import('@shared/schema');
          const { and, eq } = await import('drizzle-orm');

          const existing = await db
            .select()
            .from(clientBillingSettings)
            .where(
              and(
                eq(clientBillingSettings.workspaceId, request.workspaceId!),
                eq(clientBillingSettings.clientId, clientId)
              )
            )
            .limit(1);

          let settings;
          if (existing.length > 0) {
            [settings] = await db
              .update(clientBillingSettings)
              .set({ ...prefs, updatedAt: new Date() })
              .where(eq(clientBillingSettings.id, existing[0].id))
              .returning();
          } else {
            [settings] = await db
              .insert(clientBillingSettings)
              .values({ ...prefs, workspaceId: request.workspaceId!, clientId })
              .returning();
          }

          const summary = [
            prefs.billingCycle ? `Billing: ${prefs.billingCycle}` : null,
            prefs.paymentTerms ? `Terms: ${prefs.paymentTerms}` : null,
            prefs.defaultBillRate ? `Rate: $${prefs.defaultBillRate}/hr` : null,
            prefs.autoSendInvoice ? 'Auto-send: enabled' : null,
          ].filter(Boolean).join(', ');

          return {
            success: true,
            actionId: request.actionId,
            message: `Billing preferences saved for client ${clientId}: ${summary || 'defaults applied'}`,
            data: settings,
            executionTimeMs: Date.now() - startTime,
          };
        }

        // Default: recommend_features
        const result = await domainLeadSupervisorService.submitTask('onboarding_ops', 'recommend_features', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Features recommended', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 4 OnboardingOps actions (consolidated from 6; see onboarding.configure in aiBrainMasterOrchestrator.ts for routing/integration)');

  // ============================================================================
  // DATA OPS ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'data.query_knowledge',
    name: 'Query Knowledge Graph',
    description: 'Semantic query across the knowledge graph',
    category: 'analytics',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('data_ops', 'query_knowledge', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Knowledge query complete', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'data.aggregate_metrics',
    name: 'Aggregate Metrics',
    description: 'Aggregate business metrics for analytics',
    category: 'analytics',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('data_ops', 'aggregate_metrics', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Metrics aggregated', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'data.check_quality',
    name: 'Check Data Quality',
    description: 'Validate data quality and integrity',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('data_ops', 'check_quality', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Quality check complete', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'data.tune_rl_model',
    name: 'Tune RL Model',
    description: 'Tune reinforcement learning confidence model',
    category: 'automation',
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('data_ops', 'tune_rl_model', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'RL model tuned', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'data.extract_learnings',
    name: 'Extract Learnings',
    description: 'Extract insights from knowledge graph for agent learning',
    category: 'analytics',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('data_ops', 'extract_learnings', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Learnings extracted', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'data.get_cognitive_metrics',
    name: 'Get Cognitive System Metrics',
    description: 'Get metrics from all cognitive subsystems (knowledge graph, A2A, RL)',
    category: 'analytics',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('data_ops', 'get_cognitive_metrics', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Cognitive metrics retrieved', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 6 DataOps actions');

  // ============================================================================
  // COMMUNICATION OPS ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'comm.send_notification',
    name: 'Send Notification',
    description: 'Send a notification through the unified notification system',
    category: 'notifications',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('communication_ops', 'send_notification', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: request.payload?.priority || 'normal',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Notification sent', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'comm.broadcast_alert',
    name: 'Broadcast Alert',
    description: 'Broadcast a critical alert to multiple recipients',
    category: 'notifications',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('communication_ops', 'broadcast_alert', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'critical',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Alert broadcasted', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'comm.route_a2a_message',
    name: 'Route A2A Message',
    description: 'Route an agent-to-agent message',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('communication_ops', 'route_a2a_message', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'A2A message routed', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'comm.form_agent_team',
    name: 'Form Agent Team',
    description: 'Form a collaboration team of agents',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('communication_ops', 'form_agent_team', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'medium',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Agent team formed', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'comm.escalate_to_human',
    name: 'Escalate to Human',
    description: 'Create an escalation ticket for human support',
    category: 'support',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('communication_ops', 'escalate_to_human', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'high',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Escalation created', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'comm.get_channel_stats',
    name: 'Get Channel Statistics',
    description: 'Get statistics for all communication channels',
    category: 'analytics',
    requiredRoles: ['org_owner', 'co_owner', 'manager', 'supervisor'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        const result = await domainLeadSupervisorService.submitTask('communication_ops', 'get_channel_stats', request.payload || {}, {
          requestedBy: request.userId || 'system',
          workspaceId: request.workspaceId,
          priority: 'low',
        });
        return { success: result.success, actionId: request.actionId, data: result.data, message: result.error || 'Channel stats retrieved', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 6 CommunicationOps actions');
  */ // END DEFERRED: RevenueOps, SecurityOps, OnboardingOps, DataOps, CommunicationOps (30 actions)

  // ============================================================================
  // ENHANCED LLM JUDGE ACTIONS - Keep 2 core MVP actions
  // Evidence: security.evaluate_risk (renamed from judge.evaluate_risk) called in cleanupAgentSubagent.ts
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'security.evaluate_risk',
    name: 'Evaluate Risk',
    description: 'Evaluate risk for an action or operation using AI Judge',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'security.evaluate_hotpatch',
    name: 'Evaluate Hotpatch',
    description: 'Evaluate a code hotpatch for deployment safety',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 2 LLM Judge MVP actions (evaluate_risk, evaluate_hotpatch)');

  /* DEFERRED: LLM Judge extras (4) + Management (3) - Not actively called in MVP workflows
  helpaiOrchestrator.registerAction({
    actionId: 'judge.get_policies',
    name: 'Get Active Policies',
    description: 'Get list of active risk policies',
    category: 'security',
    requiredRoles: ['org_owner', 'co_owner'],
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
    requiredRoles: ['org_owner', 'co_owner'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await enhancedLLMJudge.initialize();
        const patterns = await enhancedLLMJudge.getBlockedPatterns();
        return { success: true, actionId: request.actionId, data: { patterns, count: patterns.length }, message: `${patterns.length} blocked patterns`, executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.record_failure',
    name: 'Record Failure',
    description: 'Record a failure for regression tracking',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'judge.record_success',
    name: 'Record Success',
    description: 'Record a success to reduce failure count',
    category: 'automation',
    requiredRoles: ['org_owner', 'co_owner'],
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
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 6 Enhanced LLM Judge actions');

  // ============================================================================
  // SUPERVISOR MANAGEMENT ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'supervisor.get_health',
    name: 'Get Supervisor Health',
    description: 'Get health status of all domain supervisors',
    category: 'health',
    requiredRoles: ['org_owner', 'co_owner'],
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
    requiredRoles: ['org_owner', 'co_owner'],
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
    requiredRoles: ['sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      try {
        await domainLeadSupervisorService.persistTelemetry();
        return { success: true, actionId: request.actionId, message: 'Telemetry persisted', executionTimeMs: Date.now() - startTime };
      } catch (error: any) {
        return { success: false, actionId: request.actionId, message: (error instanceof Error ? error.message : String(error)), executionTimeMs: Date.now() - startTime };
      }
    },
  });

  log.info('[DomainSupervisorActions] Registered 3 Supervisor Management actions');
  */ // END DEFERRED: LLM Judge extras (4) + Management (3)

  log.info('[DomainSupervisorActions] Phase 2 Cleanup: Kept 2 actions, deferred 37');
  log.info('[DomainSupervisorActions] KEPT: security.evaluate_risk, security.evaluate_hotpatch (renamed from judge.*)');
  log.info('[DomainSupervisorActions] DEFERRED: RevenueOps(6), SecurityOps(6), OnboardingOps(6), DataOps(6), CommunicationOps(6), Judge extras(4), Management(3)');
}
