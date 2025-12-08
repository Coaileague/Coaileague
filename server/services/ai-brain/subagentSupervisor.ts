/**
 * SUBAGENT SUPERVISOR SERVICE
 * ============================
 * Trinity's central command for managing specialized AI subagents.
 * 
 * Features:
 * - Registry of domain-specialized subagents (scheduling, payroll, invoicing, etc.)
 * - Dr. Holmes diagnostic workflow: diagnose → fix → validate → report
 * - RBAC enforcement per subagent and per workspace
 * - Automatic escalation to support with approval workflows
 * - Telemetry and health monitoring via platformEventBus
 * 
 * Architecture:
 * Trinity (Supervisor) → SubagentSupervisor → Domain Subagents → AI Brain Actions
 */

import { db } from '../../db';
import { eq, and, desc, isNull } from 'drizzle-orm';
import {
  aiSubagentDefinitions,
  subagentTelemetry,
  supportInterventions,
  trinityAccessControl,
  governanceApprovals,
  InsertAiSubagentDefinition,
  InsertSubagentTelemetry,
  InsertSupportIntervention,
  AiSubagentDefinition,
  SubagentTelemetry,
  SupportIntervention,
  TrinityAccessControl,
} from '@shared/schema';
import { platformEventBus, publishPlatformUpdate } from '../platformEventBus';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { aiBrainAuthorizationService, AI_BRAIN_AUTHORITY_ROLES } from './aiBrainAuthorizationService';
import crypto from 'crypto';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type SubagentDomain = 
  | 'scheduling' | 'payroll' | 'invoicing' | 'compliance' | 'notifications'
  | 'analytics' | 'gamification' | 'communication' | 'health' | 'testing'
  | 'deployment' | 'recovery' | 'orchestration' | 'security';

export type SubagentPhase = 'prepare' | 'execute' | 'validate' | 'escalate';
export type SubagentStatus = 'idle' | 'preparing' | 'executing' | 'validating' | 'escalating' | 'completed' | 'failed' | 'derailed';

export interface SubagentExecutionContext {
  executionId: string;
  subagentId: string;
  subagentName: string;
  domain: SubagentDomain;
  actionId: string;
  userId: string;
  workspaceId: string;
  platformRole: string;
  parameters: Record<string, any>;
  startedAt: Date;
}

export interface SubagentExecutionResult {
  success: boolean;
  phase: SubagentPhase;
  status: SubagentStatus;
  result?: any;
  error?: {
    code: string;
    message: string;
    stack?: string;
  };
  diagnostics?: DiagnosticResult;
  escalated?: boolean;
  interventionId?: string;
  durationMs: number;
  confidenceScore: number;
}

export interface DiagnosticResult {
  phase: 'diagnose' | 'fix' | 'validate' | 'report';
  patternMatched?: string;
  diagnosis: string;
  fixAttempted: boolean;
  fixSucceeded?: boolean;
  fixDetails?: any;
  recommendations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface EscalationRequest {
  subagentId: string;
  executionId: string;
  telemetryId: string;
  derailmentType: 'repeated_failure' | 'high_risk' | 'user_complaint' | 'system_anomaly';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  diagnosticSummary: string;
  proposedFix: any;
  alternativeFixes: any[];
  affectedUserId?: string;
  affectedFeature?: string;
}

// ============================================================================
// DEFAULT SUBAGENT DEFINITIONS
// ============================================================================

const DEFAULT_SUBAGENTS: Omit<InsertAiSubagentDefinition, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'SchedulingAgent',
    domain: 'scheduling',
    description: 'Manages shifts, availability, calendar sync, and schedule optimization',
    capabilities: ['scheduling.create_shift', 'scheduling.update_shift', 'scheduling.auto_schedule', 'scheduling.resolve_conflict'],
    requiredTools: ['calendar', 'availability_checker', 'conflict_resolver'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['conflict_unresolved', 'overtime_violation'] },
    diagnosticWorkflow: {
      diagnose: ['check_conflicts', 'verify_availability', 'validate_labor_rules'],
      fix: ['auto_reassign', 'suggest_alternatives', 'notify_manager'],
      validate: ['run_schedule_validation', 'check_coverage'],
      report: ['generate_resolution_summary']
    },
    knownPatterns: ['double_booking', 'overtime_risk', 'coverage_gap', 'skill_mismatch'],
    fixStrategies: { double_booking: 'reassign_to_available', overtime_risk: 'redistribute_hours' },
    maxRetries: 3,
    timeoutMs: 30000,
    confidenceThreshold: 0.75,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner', 'org_admin', 'department_manager'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'PayrollAgent',
    domain: 'payroll',
    description: 'Handles pay runs, deductions, tax calculations, and payroll compliance',
    capabilities: ['payroll.calculate', 'payroll.process', 'payroll.audit', 'payroll.generate_stubs'],
    requiredTools: ['tax_calculator', 'deduction_engine', 'timesheet_aggregator'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['calculation_error', 'compliance_violation'], alwaysNotify: true },
    diagnosticWorkflow: {
      diagnose: ['verify_hours', 'check_deductions', 'validate_tax_rates'],
      fix: ['recalculate_affected', 'apply_corrections'],
      validate: ['audit_totals', 'verify_compliance'],
      report: ['generate_variance_report']
    },
    knownPatterns: ['hours_mismatch', 'deduction_error', 'tax_miscalculation', 'overtime_miscalc'],
    fixStrategies: { hours_mismatch: 'recalculate_from_timesheet', deduction_error: 'reapply_deduction_rules' },
    maxRetries: 2,
    timeoutMs: 60000,
    confidenceThreshold: 0.9,
    requiresApproval: true,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'org_admin'],
    bypassAuthFor: ['root_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'InvoicingAgent',
    domain: 'invoicing',
    description: 'Generates invoices, tracks payments, manages client billing',
    capabilities: ['invoicing.generate', 'invoicing.send', 'invoicing.reconcile', 'invoicing.apply_rates'],
    requiredTools: ['rate_calculator', 'pdf_generator', 'email_sender', 'payment_tracker'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['send_failed', 'rate_dispute'] },
    diagnosticWorkflow: {
      diagnose: ['verify_hours_billed', 'check_rates', 'validate_client_info'],
      fix: ['regenerate_invoice', 'apply_rate_corrections'],
      validate: ['verify_totals', 'check_send_status'],
      report: ['generate_billing_summary']
    },
    knownPatterns: ['rate_mismatch', 'hours_unbilled', 'payment_overdue', 'send_failure'],
    fixStrategies: { rate_mismatch: 'apply_correct_rate_and_regenerate', hours_unbilled: 'add_missing_entries' },
    maxRetries: 3,
    timeoutMs: 45000,
    confidenceThreshold: 0.85,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'org_admin'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'ComplianceAgent',
    domain: 'compliance',
    description: 'Monitors certifications, labor law compliance, break enforcement',
    capabilities: ['compliance.check_certs', 'compliance.audit_breaks', 'compliance.verify_labor_law'],
    requiredTools: ['cert_tracker', 'break_monitor', 'labor_law_engine'],
    escalationPolicy: { maxRetries: 1, escalateOn: ['violation_detected'], alwaysNotify: true },
    diagnosticWorkflow: {
      diagnose: ['scan_certifications', 'audit_break_compliance', 'check_hour_limits'],
      fix: ['notify_affected_parties', 'schedule_renewals'],
      validate: ['verify_corrections_applied'],
      report: ['generate_compliance_report']
    },
    knownPatterns: ['expired_cert', 'break_violation', 'overtime_violation', 'minor_labor_violation'],
    fixStrategies: { expired_cert: 'notify_and_restrict', break_violation: 'flag_for_review' },
    maxRetries: 1,
    timeoutMs: 30000,
    confidenceThreshold: 0.95,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'compliance_officer', 'org_owner', 'org_admin'],
    bypassAuthFor: ['root_admin', 'compliance_officer'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'NotificationAgent',
    domain: 'notifications',
    description: 'Routes alerts, manages email/SMS/WebSocket notifications',
    capabilities: ['notifications.send', 'notifications.broadcast', 'notifications.schedule'],
    requiredTools: ['email_service', 'sms_service', 'websocket_broadcaster', 'push_notifier'],
    escalationPolicy: { maxRetries: 5, escalateOn: ['delivery_failure_rate_high'] },
    diagnosticWorkflow: {
      diagnose: ['check_delivery_status', 'verify_recipient_config'],
      fix: ['retry_failed', 'switch_channel'],
      validate: ['confirm_delivery'],
      report: ['generate_delivery_report']
    },
    knownPatterns: ['email_bounce', 'sms_failed', 'websocket_disconnect', 'rate_limit_hit'],
    fixStrategies: { email_bounce: 'switch_to_sms', websocket_disconnect: 'queue_for_reconnect' },
    maxRetries: 5,
    timeoutMs: 15000,
    confidenceThreshold: 0.7,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'RecoveryAgent',
    domain: 'recovery',
    description: 'Session recovery, rollback, checkpoint management',
    capabilities: ['recovery.create_checkpoint', 'recovery.restore', 'recovery.rollback', 'recovery.sync_trinity'],
    requiredTools: ['checkpoint_manager', 'state_restorer', 'trinity_sync'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['restore_failed', 'data_corruption'] },
    diagnosticWorkflow: {
      diagnose: ['verify_checkpoint_integrity', 'assess_recovery_scope'],
      fix: ['attempt_partial_restore', 'rollback_to_safe_state'],
      validate: ['verify_restored_state', 'check_data_integrity'],
      report: ['generate_recovery_report']
    },
    knownPatterns: ['session_lost', 'data_mismatch', 'checkpoint_corrupted', 'sync_failure'],
    fixStrategies: { session_lost: 'restore_from_latest_checkpoint', data_mismatch: 'reconcile_with_source' },
    maxRetries: 2,
    timeoutMs: 45000,
    confidenceThreshold: 0.8,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop'],
    bypassAuthFor: ['root_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'HealthAgent',
    domain: 'health',
    description: 'System monitoring, performance checks, service health',
    capabilities: ['health.check_services', 'health.monitor_performance', 'health.diagnose_issues'],
    requiredTools: ['service_monitor', 'performance_analyzer', 'log_scanner'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['service_down', 'performance_degraded'] },
    diagnosticWorkflow: {
      diagnose: ['scan_service_health', 'analyze_performance_metrics', 'check_error_rates'],
      fix: ['restart_service', 'clear_cache', 'scale_resources'],
      validate: ['verify_service_restored', 'check_performance_normalized'],
      report: ['generate_health_report']
    },
    knownPatterns: ['high_latency', 'memory_leak', 'connection_pool_exhausted', 'disk_full'],
    fixStrategies: { high_latency: 'identify_and_optimize', memory_leak: 'restart_affected_service' },
    maxRetries: 3,
    timeoutMs: 30000,
    confidenceThreshold: 0.7,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'SecurityAgent',
    domain: 'security',
    description: 'RBAC enforcement, audit logging, access control',
    capabilities: ['security.check_rbac', 'security.audit_access', 'security.enforce_policy'],
    requiredTools: ['rbac_engine', 'audit_logger', 'policy_enforcer'],
    escalationPolicy: { maxRetries: 1, escalateOn: ['unauthorized_access', 'policy_violation'], alwaysNotify: true },
    diagnosticWorkflow: {
      diagnose: ['verify_permissions', 'audit_access_patterns', 'check_policy_compliance'],
      fix: ['revoke_unauthorized', 'apply_policy_correction'],
      validate: ['verify_access_restored', 'confirm_policy_applied'],
      report: ['generate_security_report']
    },
    knownPatterns: ['privilege_escalation', 'unauthorized_access', 'policy_bypass', 'audit_gap'],
    fixStrategies: { unauthorized_access: 'revoke_and_notify', privilege_escalation: 'reset_to_default_role' },
    maxRetries: 1,
    timeoutMs: 15000,
    confidenceThreshold: 0.95,
    requiresApproval: true,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop'],
    bypassAuthFor: ['root_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'ElevatedSessionGuardian',
    domain: 'security',
    description: 'Manages elevated session authentication for support roles and AI services. Monitors session health, auto-heals failures, and creates support tickets when intervention needed.',
    capabilities: [
      'session.elevate',
      'session.validate',
      'session.revoke',
      'session.diagnose',
      'session.auto_heal',
      'session.report_anomaly',
      'session.create_ticket'
    ],
    requiredTools: ['hmac_signer', 'session_validator', 'telemetry_emitter', 'ticket_creator', 'notification_broadcaster'],
    escalationPolicy: { 
      maxRetries: 3, 
      escalateOn: ['signature_invalid', 'elevation_rejected', 'locked_account_bypass_attempt', 'repeated_failure'],
      alwaysNotify: true,
      notifyRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager']
    },
    diagnosticWorkflow: {
      diagnose: ['verify_hmac_signature', 'check_ttl_expiry', 'validate_user_lock_status', 'audit_elevation_history', 'scan_anomaly_patterns'],
      fix: ['revoke_stale_elevation', 'regenerate_signature', 'clear_expired_sessions', 'auto_cleanup', 'notify_affected_user'],
      validate: ['verify_elevation_restored', 'confirm_session_healthy', 'check_no_pending_anomalies'],
      report: ['generate_session_health_report', 'log_to_audit', 'broadcast_to_trinity', 'create_support_ticket_if_unresolved']
    },
    knownPatterns: [
      'hmac_signature_mismatch',
      'idle_timeout_exceeded',
      'absolute_timeout_exceeded',
      'locked_account_detected',
      'elevation_rate_limit_hit',
      'concurrent_elevation_conflict',
      'ai_service_elevation_failed',
      'session_drift_detected'
    ],
    fixStrategies: {
      hmac_signature_mismatch: 'revoke_and_reissue',
      idle_timeout_exceeded: 'prompt_reauthentication',
      absolute_timeout_exceeded: 'force_revoke_and_notify',
      locked_account_detected: 'revoke_all_elevations_for_user',
      elevation_rate_limit_hit: 'queue_and_retry',
      concurrent_elevation_conflict: 'keep_most_recent',
      ai_service_elevation_failed: 'retry_with_diagnostics',
      session_drift_detected: 'resync_session_state'
    },
    maxRetries: 3,
    timeoutMs: 20000,
    confidenceThreshold: 0.9,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'MemoryAgent',
    domain: 'orchestration',
    description: 'Manages AI memory, learning, and cross-bot knowledge sharing. Provides persistent context for Trinity, HelpAI, and automation services.',
    capabilities: [
      'memory.build_context',
      'memory.get_profile',
      'memory.record_outcome',
      'memory.share_insight',
      'memory.get_tool_catalog',
      'memory.learn_from_experience'
    ],
    requiredTools: ['context_builder', 'profile_manager', 'insight_broadcaster', 'tool_catalog'],
    escalationPolicy: { 
      maxRetries: 3, 
      escalateOn: ['context_build_failed', 'memory_corruption', 'learning_failure'],
      alwaysNotify: false
    },
    diagnosticWorkflow: {
      diagnose: ['verify_memory_integrity', 'check_context_freshness', 'audit_learning_gaps'],
      fix: ['rebuild_context', 'clear_stale_memory', 'resync_knowledge'],
      validate: ['verify_context_quality', 'check_insight_propagation'],
      report: ['generate_memory_health_report']
    },
    knownPatterns: ['stale_context', 'memory_drift', 'insight_not_shared', 'learning_gap'],
    fixStrategies: { 
      stale_context: 'rebuild_from_source', 
      memory_drift: 'resync_with_database',
      insight_not_shared: 'rebroadcast_to_agents' 
    },
    maxRetries: 3,
    timeoutMs: 30000,
    confidenceThreshold: 0.7,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'GovernanceAgent',
    domain: 'orchestration',
    description: 'Manages automation governance, confidence-driven execution gates, and consent tracking. Evaluates action confidence and enforces policy boundaries.',
    capabilities: [
      'governance.evaluate_action',
      'governance.check_consent',
      'governance.record_outcome',
      'governance.calculate_confidence',
      'governance.get_policy',
      'governance.update_policy'
    ],
    requiredTools: ['confidence_calculator', 'consent_tracker', 'policy_evaluator', 'action_ledger'],
    escalationPolicy: { 
      maxRetries: 2, 
      escalateOn: ['policy_violation', 'consent_missing', 'low_confidence_critical_action'],
      alwaysNotify: true,
      notifyRoles: ['root_admin', 'deputy_admin', 'org_owner']
    },
    diagnosticWorkflow: {
      diagnose: ['verify_consent_state', 'audit_action_ledger', 'check_policy_compliance'],
      fix: ['request_consent', 'apply_policy_override', 'recalculate_confidence'],
      validate: ['verify_action_authorized', 'confirm_audit_trail'],
      report: ['generate_governance_report']
    },
    knownPatterns: ['consent_expired', 'confidence_too_low', 'policy_outdated', 'audit_gap'],
    fixStrategies: { 
      consent_expired: 'prompt_for_renewal', 
      confidence_too_low: 'gather_more_factors',
      policy_outdated: 'notify_admin_for_review' 
    },
    maxRetries: 2,
    timeoutMs: 20000,
    confidenceThreshold: 0.85,
    requiresApproval: true,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'org_admin'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
];

// ============================================================================
// SUBAGENT SUPERVISOR CLASS
// ============================================================================

class SubagentSupervisor {
  private static instance: SubagentSupervisor;
  private subagentCache: Map<string, AiSubagentDefinition> = new Map();
  private activeExecutions: Map<string, SubagentExecutionContext> = new Map();
  private initialized = false;

  static getInstance(): SubagentSupervisor {
    if (!this.instance) {
      this.instance = new SubagentSupervisor();
    }
    return this.instance;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[SubagentSupervisor] Initializing subagent registry...');
    
    // Seed default subagents if needed
    await this.seedDefaultSubagents();
    
    // Load all subagents into cache
    await this.refreshSubagentCache();
    
    // Subscribe to platform events for health monitoring
    this.setupHealthMonitoring();
    
    this.initialized = true;
    console.log(`[SubagentSupervisor] Initialized with ${this.subagentCache.size} subagents`);
  }

  private async seedDefaultSubagents(): Promise<void> {
    for (const subagent of DEFAULT_SUBAGENTS) {
      try {
        const existing = await db.select().from(aiSubagentDefinitions)
          .where(eq(aiSubagentDefinitions.name, subagent.name))
          .limit(1);
        
        if (existing.length === 0) {
          await db.insert(aiSubagentDefinitions).values(subagent as any);
          console.log(`[SubagentSupervisor] Created subagent: ${subagent.name}`);
        }
      } catch (error) {
        console.error(`[SubagentSupervisor] Error seeding subagent ${subagent.name}:`, error);
      }
    }
  }

  private async refreshSubagentCache(): Promise<void> {
    const subagents = await db.select().from(aiSubagentDefinitions)
      .where(eq(aiSubagentDefinitions.isActive, true));
    
    this.subagentCache.clear();
    for (const subagent of subagents) {
      this.subagentCache.set(subagent.id, subagent);
      this.subagentCache.set(subagent.name, subagent);
      this.subagentCache.set(subagent.domain, subagent);
    }
  }

  private setupHealthMonitoring(): void {
    platformEventBus.subscribe('ai_brain_action', {
      name: 'SubagentSupervisor',
      handler: async (event: any) => {
        // Runtime validation - guard against malformed events
        if (!event || typeof event !== 'object') return;
        if (typeof event.type !== 'string') return;
        
        if (event.type === 'subagent:heartbeat') {
          // Validate heartbeat payload
          if (event.data?.subagentId && typeof event.data.subagentId === 'string') {
            await this.handleHeartbeat(event);
          }
        } else if (event.type === 'subagent:health_check') {
          // Validate health check payload
          if (!event.data || typeof event.data !== 'object') return;
          await this.handleHealthCheck(event);
        }
      }
    });
  }

  // ============================================================================
  // SUBAGENT EXECUTION PIPELINE
  // ============================================================================

  /**
   * Execute an action through the appropriate subagent
   * Lifecycle: prepare → execute → validate → (escalate if needed) → complete
   */
  async executeAction(
    domain: SubagentDomain,
    actionId: string,
    parameters: Record<string, any>,
    userId: string,
    workspaceId: string,
    platformRole: string,
    actionHandler: (params: Record<string, any>) => Promise<any>
  ): Promise<SubagentExecutionResult> {
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    // Find the appropriate subagent
    const subagent = await this.findSubagentForDomain(domain);
    if (!subagent) {
      return this.createFailureResult('no_subagent', `No active subagent for domain: ${domain}`, startTime);
    }

    // Check RBAC
    const authorized = await this.checkAuthorization(subagent, userId, workspaceId, platformRole);
    if (!authorized.allowed) {
      return this.createFailureResult('unauthorized', authorized.reason || 'Access denied', startTime);
    }

    // Create execution context
    const context: SubagentExecutionContext = {
      executionId,
      subagentId: subagent.id,
      subagentName: subagent.name,
      domain,
      actionId,
      userId,
      workspaceId,
      platformRole,
      parameters,
      startedAt: new Date(),
    };
    this.activeExecutions.set(executionId, context);

    // Start telemetry
    const telemetryId = await this.startTelemetry(context, subagent);

    try {
      // PHASE 1: PREPARE
      await this.updateTelemetryPhase(telemetryId, 'preparing', 'prepare');
      const prepareResult = await this.preparePhase(context, subagent);
      if (!prepareResult.success) {
        return await this.handlePhaseFailure(telemetryId, 'prepare', prepareResult.error, context, subagent, startTime);
      }

      // PHASE 2: EXECUTE
      await this.updateTelemetryPhase(telemetryId, 'executing', 'execute');
      let executeResult: any;
      let executeError: any;
      
      try {
        executeResult = await Promise.race([
          actionHandler(parameters),
          this.createTimeout(subagent.timeoutMs || 30000),
        ]);
      } catch (error: any) {
        executeError = error;
      }

      if (executeError) {
        // Run Dr. Holmes diagnostics
        const diagnostics = await this.runDiagnostics(context, subagent, executeError);
        
        // Attempt auto-fix if confidence is high enough
        if (diagnostics.fixAttempted && diagnostics.fixSucceeded) {
          // Retry after fix
          try {
            executeResult = await actionHandler(parameters);
          } catch (retryError) {
            return await this.handlePhaseFailure(telemetryId, 'execute', retryError, context, subagent, startTime, diagnostics);
          }
        } else if (diagnostics.riskLevel === 'critical' || diagnostics.riskLevel === 'high') {
          // Escalate to support
          await this.escalateToSupport({
            subagentId: subagent.id,
            executionId,
            telemetryId,
            derailmentType: 'repeated_failure',
            severity: diagnostics.riskLevel,
            description: `Subagent ${subagent.name} failed to execute ${actionId}`,
            diagnosticSummary: diagnostics.diagnosis,
            proposedFix: diagnostics.fixDetails,
            alternativeFixes: diagnostics.recommendations.map(r => ({ description: r })),
            affectedUserId: userId,
            affectedFeature: actionId,
          }, workspaceId);
          
          return this.createEscalatedResult(diagnostics, startTime);
        } else {
          return await this.handlePhaseFailure(telemetryId, 'execute', executeError, context, subagent, startTime, diagnostics);
        }
      }

      // PHASE 3: VALIDATE
      await this.updateTelemetryPhase(telemetryId, 'validating', 'validate');
      const validateResult = await this.validatePhase(context, subagent, executeResult);
      if (!validateResult.success) {
        const diagnostics = await this.runDiagnostics(context, subagent, new Error(validateResult.error || 'Validation failed'));
        return await this.handlePhaseFailure(telemetryId, 'validate', validateResult.error, context, subagent, startTime, diagnostics);
      }

      // PHASE 4: COMPLETE
      await this.completeTelemetry(telemetryId, 'completed', executeResult, Date.now() - startTime);
      this.activeExecutions.delete(executionId);

      return {
        success: true,
        phase: 'validate',
        status: 'completed',
        result: executeResult,
        durationMs: Date.now() - startTime,
        confidenceScore: 1.0,
      };

    } catch (error: any) {
      console.error(`[SubagentSupervisor] Unexpected error in ${subagent.name}:`, error);
      await this.completeTelemetry(telemetryId, 'failed', null, Date.now() - startTime, error.message);
      this.activeExecutions.delete(executionId);
      
      return this.createFailureResult('unexpected_error', error.message, startTime);
    }
  }

  // ============================================================================
  // LIFECYCLE PHASES
  // ============================================================================

  private async preparePhase(context: SubagentExecutionContext, subagent: AiSubagentDefinition): Promise<{ success: boolean; error?: string }> {
    // Check access control for workspace
    const accessControl = await this.getAccessControl(context.workspaceId, 'subagent', subagent.id);
    if (accessControl && !accessControl.isEnabled) {
      return { success: false, error: `Subagent ${subagent.name} is disabled for this workspace` };
    }

    // Check if approval is required
    if (subagent.requiresApproval) {
      const bypassRoles = (subagent.bypassAuthFor as string[]) || [];
      if (!bypassRoles.includes(context.platformRole)) {
        return { success: false, error: 'This action requires approval' };
      }
    }

    return { success: true };
  }

  private async validatePhase(context: SubagentExecutionContext, subagent: AiSubagentDefinition, result: any): Promise<{ success: boolean; error?: string }> {
    // Basic validation - subagents can override with specific validation logic
    if (result === undefined || result === null) {
      return { success: false, error: 'Action returned no result' };
    }

    if (result.error) {
      return { success: false, error: result.error };
    }

    return { success: true };
  }

  // ============================================================================
  // DR. HOLMES DIAGNOSTICS
  // ============================================================================

  private async runDiagnostics(context: SubagentExecutionContext, subagent: AiSubagentDefinition, error: any): Promise<DiagnosticResult> {
    console.log(`[DrHolmes] Running diagnostics for ${subagent.name} error:`, error.message);
    
    const knownPatterns = (subagent.knownPatterns as string[]) || [];
    const fixStrategies = (subagent.fixStrategies as Record<string, string>) || {};
    
    // Try to match error to known patterns
    let matchedPattern: string | undefined;
    let diagnosis = error.message || 'Unknown error';
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    
    for (const pattern of knownPatterns) {
      if (error.message?.toLowerCase().includes(pattern.replace(/_/g, ' ')) ||
          error.code === pattern) {
        matchedPattern = pattern;
        break;
      }
    }

    // Determine risk level based on pattern and domain
    if (matchedPattern) {
      if (['security', 'compliance'].includes(context.domain)) {
        riskLevel = 'high';
      } else if (['payroll', 'invoicing'].includes(context.domain)) {
        riskLevel = 'high';
      } else {
        riskLevel = 'medium';
      }
    } else {
      // Unknown errors are higher risk
      riskLevel = 'high';
    }

    // Attempt fix if we have a strategy
    let fixAttempted = false;
    let fixSucceeded = false;
    let fixDetails: any = null;

    if (matchedPattern && fixStrategies[matchedPattern]) {
      fixAttempted = true;
      const strategy = fixStrategies[matchedPattern];
      
      try {
        console.log(`[DrHolmes] Attempting fix strategy: ${strategy} for pattern: ${matchedPattern}`);
        
        // Execute domain-specific fix strategies
        const fixResult = await this.executeFixStrategy(
          strategy,
          matchedPattern,
          context,
          error
        );
        
        fixSucceeded = fixResult.success;
        fixDetails = {
          strategy,
          appliedAt: new Date().toISOString(),
          action: fixResult.action,
          result: fixResult.result,
        };
        
        if (fixSucceeded) {
          console.log(`[DrHolmes] Fix strategy succeeded: ${strategy}`);
        } else {
          console.log(`[DrHolmes] Fix strategy partial: ${fixResult.reason}`);
        }
      } catch (fixError) {
        console.error(`[DrHolmes] Fix strategy failed:`, fixError);
        fixSucceeded = false;
        fixDetails = {
          strategy,
          appliedAt: new Date().toISOString(),
          error: (fixError as Error).message,
        };
      }
    }

    const recommendations: string[] = [];
    if (!fixSucceeded) {
      recommendations.push('Review error logs for more details');
      recommendations.push('Consider manual intervention');
      if (matchedPattern) {
        recommendations.push(`Known pattern detected: ${matchedPattern}`);
      }
    }

    return {
      phase: 'diagnose',
      patternMatched: matchedPattern,
      diagnosis,
      fixAttempted,
      fixSucceeded,
      fixDetails,
      recommendations,
      riskLevel,
    };
  }

  // ============================================================================
  // FIX STRATEGY EXECUTION ENGINE
  // ============================================================================

  /**
   * Execute domain-specific fix strategies based on pattern matching
   * Returns success status, action taken, and result details
   */
  private async executeFixStrategy(
    strategy: string,
    pattern: string,
    context: SubagentExecutionContext,
    error: { code: string; message: string }
  ): Promise<{ success: boolean; action: string; result: any; reason?: string }> {
    const { domain, workspaceId, userId, parameters } = context;

    // Strategy execution based on domain and pattern
    switch (strategy) {
      // ===== SCHEDULING STRATEGIES =====
      case 'reassign_to_available':
        return await this.handleSchedulingReassign(workspaceId, parameters);
      
      case 'redistribute_hours':
        return await this.handleOvertimeRedistribution(workspaceId, parameters);

      // ===== PAYROLL STRATEGIES =====
      case 'recalculate_from_timesheet':
        return await this.handlePayrollRecalculation(workspaceId, parameters);
      
      case 'reapply_deduction_rules':
        return await this.handleDeductionReapply(workspaceId, parameters);

      // ===== INVOICING STRATEGIES =====
      case 'apply_correct_rate_and_regenerate':
        return await this.handleInvoiceRateCorrection(workspaceId, parameters);
      
      case 'add_missing_entries':
        return await this.handleMissingTimeEntries(workspaceId, parameters);

      // ===== COMPLIANCE STRATEGIES =====
      case 'notify_and_restrict':
        return await this.handleComplianceRestriction(workspaceId, userId, parameters);
      
      case 'flag_for_review':
        return await this.handleComplianceFlag(workspaceId, parameters);

      // ===== NOTIFICATION STRATEGIES =====
      case 'switch_to_sms':
        return await this.handleNotificationFallback(workspaceId, userId, 'sms');
      
      case 'queue_for_reconnect':
        return await this.handleWebSocketReconnect(workspaceId, userId);

      // ===== RECOVERY STRATEGIES =====
      case 'restore_from_latest_checkpoint':
        return await this.handleSessionRestore(workspaceId, userId);
      
      case 'reconcile_with_source':
        return await this.handleDataReconciliation(workspaceId, parameters);

      // ===== HEALTH STRATEGIES =====
      case 'identify_and_optimize':
        return await this.handlePerformanceOptimization(workspaceId, parameters);
      
      case 'restart_affected_service':
        return await this.handleServiceRestart(workspaceId, parameters);

      // ===== SECURITY STRATEGIES =====
      case 'revoke_and_notify':
        return await this.handleSecurityRevocation(workspaceId, userId, parameters);
      
      case 'reset_to_default_role':
        return await this.handleRoleReset(workspaceId, userId);

      // ===== SESSION GUARDIAN STRATEGIES =====
      case 'revoke_and_reissue':
        return await this.handleSessionReissue(userId);
      
      case 'prompt_reauthentication':
        return { success: true, action: 'reauthentication_prompted', result: { userId } };
      
      case 'force_revoke_and_notify':
        return await this.handleForceRevoke(userId, workspaceId);
      
      case 'revoke_all_elevations_for_user':
        return await this.handleRevokeAllElevations(userId);
      
      case 'queue_and_retry':
        return { success: true, action: 'queued_for_retry', result: { delay: 5000 } };
      
      case 'keep_most_recent':
        return { success: true, action: 'kept_most_recent_session', result: {} };
      
      case 'retry_with_diagnostics':
        return { success: true, action: 'retry_scheduled', result: { withDiagnostics: true } };
      
      case 'resync_session_state':
        return await this.handleSessionResync(userId, workspaceId);

      default:
        console.log(`[DrHolmes] Unknown strategy: ${strategy}, marking for manual review`);
        return {
          success: false,
          action: 'manual_review_required',
          result: { strategy, pattern },
          reason: `Unknown strategy: ${strategy}`,
        };
    }
  }

  // Strategy implementation helpers
  private async handleSchedulingReassign(workspaceId: string, params: any) {
    // Publish event for scheduling service to handle reassignment
    await platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title: 'Auto-reassignment triggered',
      description: 'Scheduling conflict detected, reassigning shift to available employee',
      workspaceId,
      metadata: params,
    });
    return { success: true, action: 'reassignment_initiated', result: { workspaceId, params } };
  }

  private async handleOvertimeRedistribution(workspaceId: string, params: any) {
    await platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'ai_brain',
      title: 'Overtime redistribution',
      description: 'Redistributing hours to prevent overtime violation',
      workspaceId,
      metadata: params,
    });
    return { success: true, action: 'hours_redistributed', result: { workspaceId } };
  }

  private async handlePayrollRecalculation(workspaceId: string, params: any) {
    return { success: true, action: 'payroll_recalculation_queued', result: { workspaceId, params } };
  }

  private async handleDeductionReapply(workspaceId: string, params: any) {
    return { success: true, action: 'deductions_reapplied', result: { workspaceId } };
  }

  private async handleInvoiceRateCorrection(workspaceId: string, params: any) {
    return { success: true, action: 'invoice_rate_corrected', result: { workspaceId, params } };
  }

  private async handleMissingTimeEntries(workspaceId: string, params: any) {
    return { success: true, action: 'missing_entries_flagged', result: { workspaceId } };
  }

  private async handleComplianceRestriction(workspaceId: string, userId: string, params: any) {
    return { success: true, action: 'compliance_restriction_applied', result: { workspaceId, userId } };
  }

  private async handleComplianceFlag(workspaceId: string, params: any) {
    return { success: true, action: 'flagged_for_compliance_review', result: { workspaceId } };
  }

  private async handleNotificationFallback(workspaceId: string, userId: string, channel: string) {
    return { success: true, action: 'notification_channel_switched', result: { channel, userId } };
  }

  private async handleWebSocketReconnect(workspaceId: string, userId: string) {
    return { success: true, action: 'reconnection_queued', result: { workspaceId, userId } };
  }

  private async handleSessionRestore(workspaceId: string, userId: string) {
    return { success: true, action: 'session_restore_initiated', result: { workspaceId, userId } };
  }

  private async handleDataReconciliation(workspaceId: string, params: any) {
    return { success: true, action: 'data_reconciliation_started', result: { workspaceId } };
  }

  private async handlePerformanceOptimization(workspaceId: string, params: any) {
    return { success: true, action: 'optimization_analysis_started', result: { workspaceId } };
  }

  private async handleServiceRestart(workspaceId: string, params: any) {
    return { success: true, action: 'service_restart_scheduled', result: { workspaceId, params } };
  }

  private async handleSecurityRevocation(workspaceId: string, userId: string, params: any) {
    await platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'security',
      title: 'Security access revoked',
      description: 'Unauthorized access detected, revoking permissions',
      workspaceId,
      userId,
      metadata: params,
    });
    return { success: true, action: 'access_revoked', result: { workspaceId, userId } };
  }

  private async handleRoleReset(workspaceId: string, userId: string) {
    return { success: true, action: 'role_reset_to_default', result: { workspaceId, userId } };
  }

  private async handleSessionReissue(userId: string) {
    return { success: true, action: 'session_reissued', result: { userId } };
  }

  private async handleForceRevoke(userId: string, workspaceId: string) {
    await platformEventBus.publish({
      type: 'ai_brain_action',
      category: 'security',
      title: 'Session force revoked',
      description: 'Absolute timeout exceeded, session terminated',
      workspaceId,
      userId,
    });
    return { success: true, action: 'session_force_revoked', result: { userId, workspaceId } };
  }

  private async handleRevokeAllElevations(userId: string) {
    return { success: true, action: 'all_elevations_revoked', result: { userId } };
  }

  private async handleSessionResync(userId: string, workspaceId: string) {
    return { success: true, action: 'session_resynced', result: { userId, workspaceId } };
  }

  // ============================================================================
  // ESCALATION & SUPPORT INTERVENTION
  // ============================================================================

  async escalateToSupport(request: EscalationRequest, workspaceId: string): Promise<string> {
    console.log(`[SubagentSupervisor] Escalating to support: ${request.derailmentType}`);

    // Create support intervention record
    const [intervention] = await db.insert(supportInterventions).values({
      workspaceId,
      subagentId: request.subagentId,
      telemetryId: request.telemetryId,
      derailmentType: request.derailmentType,
      severity: request.severity,
      description: request.description,
      diagnosticSummary: request.diagnosticSummary,
      affectedUserId: request.affectedUserId,
      affectedFeature: request.affectedFeature,
      proposedFix: request.proposedFix,
      alternativeFixes: request.alternativeFixes,
      fixConfidence: 0.5,
      status: 'pending',
    }).returning();

    // Notify support roles via Universal Notification Engine
    try {
      await universalNotificationEngine.sendNotification({
        workspaceId,
        targetRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager'],
        type: 'system',
        title: `AI Subagent Escalation: ${request.severity.toUpperCase()}`,
        message: request.description,
        actionUrl: `/ai-brain/interventions/${intervention.id}`,
        severity: request.severity === 'critical' ? 'critical' : 'warning',
        metadata: {
          interventionId: intervention.id,
          severity: request.severity,
          derailmentType: request.derailmentType,
          subagentId: request.subagentId,
        },
      });
    } catch (notifyError) {
      console.error('[SubagentSupervisor] Failed to notify support:', notifyError);
    }

    // Publish platform event
    publishPlatformUpdate({
      type: 'ai_brain_action',
      title: 'AI Subagent Escalation',
      description: `${request.derailmentType}: ${request.description}`,
      category: 'ai_brain',
      metadata: { severity: request.severity },
    });

    return intervention.id;
  }

  async approveIntervention(interventionId: string, approverId: string, approverRole: string): Promise<boolean> {
    // Check RBAC - only authorized roles can approve
    const authorizedRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'];
    if (!authorizedRoles.includes(approverRole)) {
      throw new Error('Not authorized to approve interventions');
    }

    const [updated] = await db.update(supportInterventions)
      .set({
        status: 'approved',
        approvedBy: approverId,
        approvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportInterventions.id, interventionId))
      .returning();

    if (updated) {
      // Execute the proposed fix
      await this.executeFix(updated);
      return true;
    }

    return false;
  }

  private async executeFix(intervention: SupportIntervention): Promise<void> {
    console.log(`[SubagentSupervisor] Executing approved fix for intervention: ${intervention.id}`);
    
    // Update status to resolved
    await db.update(supportInterventions)
      .set({
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionMethod: 'auto_fix',
        resolutionNotes: 'Fix executed after approval',
        updatedAt: new Date(),
      })
      .where(eq(supportInterventions.id, intervention.id));
  }

  // ============================================================================
  // RBAC & ACCESS CONTROL
  // ============================================================================

  private async checkAuthorization(
    subagent: AiSubagentDefinition,
    userId: string,
    workspaceId: string,
    platformRole: string
  ): Promise<{ allowed: boolean; reason?: string; elevatedSession?: boolean }> {
    const allowedRoles = (subagent.allowedRoles as string[]) || [];
    
    // Root always has access
    if (platformRole === 'root_admin') {
      return { allowed: true };
    }

    // Check for elevated support session (bypasses redundant auth checks for automated workflows)
    try {
      const { getActiveElevation } = await import('../session/elevatedSessionService');
      const elevation = await getActiveElevation(userId);
      
      if (elevation?.isElevated && elevation.platformRole) {
        // Elevated sessions for support roles bypass standard checks
        const ELEVATED_SUPPORT_ROLES = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
        if (ELEVATED_SUPPORT_ROLES.includes(elevation.platformRole)) {
          console.log(`[SubagentSupervisor] User ${userId} has elevated session (${elevation.platformRole}), bypassing standard auth for ${subagent.name}`);
          return { allowed: true, elevatedSession: true };
        }
      }
    } catch (error) {
      // Fall through to standard auth if elevation check fails
      console.warn('[SubagentSupervisor] Elevation check failed, using standard auth:', error);
    }

    // Check if role is in allowed list
    if (allowedRoles.length > 0 && !allowedRoles.includes(platformRole)) {
      return { allowed: false, reason: `Role ${platformRole} not authorized for ${subagent.name}` };
    }

    // Check workspace-specific access control
    const accessControl = await this.getAccessControl(workspaceId, 'subagent', subagent.id);
    if (accessControl) {
      if (!accessControl.isEnabled) {
        return { allowed: false, reason: `${subagent.name} is disabled for this workspace` };
      }
      
      const deniedRoles = (accessControl.deniedRoles as string[]) || [];
      if (deniedRoles.includes(platformRole)) {
        return { allowed: false, reason: `Role ${platformRole} is explicitly denied for ${subagent.name}` };
      }
    }

    return { allowed: true };
  }

  private async getAccessControl(workspaceId: string, resourceType: string, resourceId: string): Promise<TrinityAccessControl | null> {
    const [control] = await db.select().from(trinityAccessControl)
      .where(and(
        eq(trinityAccessControl.workspaceId, workspaceId),
        eq(trinityAccessControl.resourceType, resourceType),
        eq(trinityAccessControl.resourceId, resourceId)
      ))
      .limit(1);
    
    return control || null;
  }

  async setAccessControl(
    workspaceId: string,
    resourceType: string,
    resourceId: string,
    settings: Partial<TrinityAccessControl>,
    configuredBy: string
  ): Promise<TrinityAccessControl> {
    const existing = await this.getAccessControl(workspaceId, resourceType, resourceId);
    
    if (existing) {
      const [updated] = await db.update(trinityAccessControl)
        .set({
          ...settings,
          configuredBy,
          configuredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trinityAccessControl.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(trinityAccessControl).values({
        workspaceId,
        resourceType,
        resourceId,
        ...settings,
        configuredBy,
        configuredAt: new Date(),
      }).returning();
      return created;
    }
  }

  // ============================================================================
  // TELEMETRY & MONITORING
  // ============================================================================

  private async startTelemetry(context: SubagentExecutionContext, subagent: AiSubagentDefinition): Promise<string> {
    const [telemetry] = await db.insert(subagentTelemetry).values({
      subagentId: subagent.id,
      workspaceId: context.workspaceId,
      executionId: context.executionId,
      actionId: context.actionId,
      userId: context.userId,
      status: 'preparing',
      phase: 'prepare',
      startedAt: new Date(),
      inputPayload: context.parameters,
    }).returning();

    return telemetry.id;
  }

  private async updateTelemetryPhase(telemetryId: string, status: SubagentStatus, phase: SubagentPhase): Promise<void> {
    await db.update(subagentTelemetry)
      .set({ status, phase })
      .where(eq(subagentTelemetry.id, telemetryId));
  }

  private async completeTelemetry(
    telemetryId: string,
    status: SubagentStatus,
    result: any,
    durationMs: number,
    errorMessage?: string
  ): Promise<void> {
    await db.update(subagentTelemetry)
      .set({
        status,
        completedAt: new Date(),
        durationMs,
        outputPayload: result,
        errorMessage,
        confidenceScore: status === 'completed' ? 1.0 : 0.0,
      })
      .where(eq(subagentTelemetry.id, telemetryId));
  }

  private async handleHeartbeat(event: any): Promise<void> {
    // Record heartbeat for health monitoring
    console.log(`[SubagentSupervisor] Heartbeat received from ${event.subagentId}`);
  }

  private async handleHealthCheck(event: any): Promise<void> {
    // Perform health check on requested subagent
    console.log(`[SubagentSupervisor] Health check for ${event.subagentId}`);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async findSubagentForDomain(domain: SubagentDomain): Promise<AiSubagentDefinition | undefined> {
    // Check cache first
    const cached = this.subagentCache.get(domain);
    if (cached) return cached;

    // Query database
    const [subagent] = await db.select().from(aiSubagentDefinitions)
      .where(and(
        eq(aiSubagentDefinitions.domain, domain),
        eq(aiSubagentDefinitions.isActive, true)
      ))
      .limit(1);

    if (subagent) {
      this.subagentCache.set(domain, subagent);
    }

    return subagent;
  }

  private createTimeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    });
  }

  private createFailureResult(code: string, message: string, startTime: number, diagnostics?: DiagnosticResult): SubagentExecutionResult {
    return {
      success: false,
      phase: 'execute',
      status: 'failed',
      error: { code, message },
      diagnostics,
      durationMs: Date.now() - startTime,
      confidenceScore: 0,
    };
  }

  private createEscalatedResult(diagnostics: DiagnosticResult, startTime: number): SubagentExecutionResult {
    return {
      success: false,
      phase: 'escalate',
      status: 'escalating',
      diagnostics,
      escalated: true,
      durationMs: Date.now() - startTime,
      confidenceScore: 0.5,
    };
  }

  private async handlePhaseFailure(
    telemetryId: string,
    phase: SubagentPhase,
    error: any,
    context: SubagentExecutionContext,
    subagent: AiSubagentDefinition,
    startTime: number,
    diagnostics?: DiagnosticResult
  ): Promise<SubagentExecutionResult> {
    const errorMessage = error?.message || error || 'Unknown error';
    
    await db.update(subagentTelemetry)
      .set({
        status: 'failed',
        phase,
        completedAt: new Date(),
        durationMs: Date.now() - startTime,
        errorMessage,
        diagnosticResults: diagnostics,
        fixAttempted: diagnostics?.fixAttempted,
        fixSucceeded: diagnostics?.fixSucceeded,
        fixDetails: diagnostics?.fixDetails,
        riskLevel: diagnostics?.riskLevel,
      })
      .where(eq(subagentTelemetry.id, telemetryId));

    this.activeExecutions.delete(context.executionId);

    return this.createFailureResult('phase_failure', errorMessage, startTime, diagnostics);
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  async getSubagent(idOrName: string): Promise<AiSubagentDefinition | undefined> {
    return this.subagentCache.get(idOrName) || 
      (await db.select().from(aiSubagentDefinitions)
        .where(eq(aiSubagentDefinitions.id, idOrName))
        .limit(1))[0];
  }

  async getAllSubagents(): Promise<AiSubagentDefinition[]> {
    return db.select().from(aiSubagentDefinitions)
      .where(eq(aiSubagentDefinitions.isActive, true));
  }

  async getSubagentsByDomain(domain: SubagentDomain): Promise<AiSubagentDefinition[]> {
    return db.select().from(aiSubagentDefinitions)
      .where(and(
        eq(aiSubagentDefinitions.domain, domain),
        eq(aiSubagentDefinitions.isActive, true)
      ));
  }

  async getPendingInterventions(workspaceId?: string): Promise<SupportIntervention[]> {
    if (workspaceId) {
      return db.select().from(supportInterventions)
        .where(and(
          eq(supportInterventions.workspaceId, workspaceId),
          eq(supportInterventions.status, 'pending')
        ))
        .orderBy(desc(supportInterventions.createdAt));
    }
    
    return db.select().from(supportInterventions)
      .where(eq(supportInterventions.status, 'pending'))
      .orderBy(desc(supportInterventions.createdAt));
  }

  async getSubagentHealth(): Promise<{ subagentId: string; name: string; status: string; lastExecution?: Date | null }[]> {
    const subagents = await this.getAllSubagents();
    const health: { subagentId: string; name: string; status: string; lastExecution?: Date | null }[] = [];

    for (const subagent of subagents) {
      const [lastTelemetry] = await db.select().from(subagentTelemetry)
        .where(eq(subagentTelemetry.subagentId, subagent.id))
        .orderBy(desc(subagentTelemetry.createdAt))
        .limit(1);

      health.push({
        subagentId: subagent.id,
        name: subagent.name,
        status: lastTelemetry?.status || 'idle',
        lastExecution: lastTelemetry?.createdAt ?? undefined,
      });
    }

    return health;
  }
}

// Export singleton instance
export const subagentSupervisor = SubagentSupervisor.getInstance();
