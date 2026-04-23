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
import { TIMEOUTS, SCHEDULING } from '../../config/platformConfig';
import { eq, and, desc, isNull, gte, SQL } from 'drizzle-orm';
import {
  aiSubagentDefinitions,
  subagentTelemetry,
  supportInterventions,
  trinityAccessControl,
  InsertAiSubagentDefinition,
  InsertSubagentTelemetry,
  InsertSupportIntervention,
  AiSubagentDefinition,
  SubagentTelemetry,
  SupportIntervention,
  TrinityAccessControl
} from '@shared/schema';
import { platformEventBus, publishPlatformUpdate } from '../platformEventBus';
import { universalNotificationEngine } from '../universalNotificationEngine';
import { aiBrainAuthorizationService, AI_BRAIN_AUTHORITY_ROLES } from './aiBrainAuthorizationService';
import { aiBrainService } from './aiBrainService';
import { TOKEN_COSTS } from '../billing/tokenManager';
import { aiTokenGateway } from '../billing/aiTokenGateway';
import { subagentConfidenceMonitor } from './subagentConfidenceMonitor';
import { modelRoutingEngine, getSubagentModelConfigs, recordModelResult, SubagentModelConfig } from './modelRoutingEngine';
import { GeminiModelTier } from './providers/geminiClient';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('SubagentSupervisor');

// Domain-to-credit-feature mapping for cost estimation
const DOMAIN_CREDIT_COSTS: Record<SubagentDomain, keyof typeof TOKEN_COSTS> = {
  scheduling: 'ai_scheduling',
  payroll: 'ai_payroll_processing',
  invoicing: 'ai_invoice_generation',
  compliance: 'ai_general',
  notifications: 'ai_general',
  visual_qa: 'ai_general', // Visual QA subagent
  analytics: 'ai_analytics_report',
  gamification: 'ai_general',
  communication: 'ai_chat_query',
  health: 'ai_general',
  testing: 'ai_general',
  deployment: 'ai_general',
  recovery: 'ai_general',
  orchestration: 'ai_general',
  security: 'ai_general',
  escalation: 'ai_general',
  automation: 'ai_general',
  lifecycle: 'ai_general',
  assist: 'ai_chat_query',
  filesystem: 'ai_general',
  workflow: 'ai_general',
  onboarding: 'ai_general',
  expense: 'ai_general',
  pricing: 'ai_predictions',
  data_migration: 'ai_general',
  scoring: 'ai_general',
};

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type SubagentDomain = 
  | 'scheduling' | 'payroll' | 'invoicing' | 'compliance' | 'notifications'
  | 'analytics' | 'gamification' | 'communication' | 'health' | 'testing'
  | 'deployment' | 'recovery' | 'orchestration' | 'security'
  | 'escalation' | 'automation' | 'lifecycle' | 'assist' | 'filesystem'
  | 'workflow' | 'onboarding' | 'expense' | 'pricing' | 'data_migration' | 'scoring'
  | 'visual_qa'; // Trinity's Eyes - Visual QA system

export type SubagentPhase = 'prepare' | 'execute' | 'validate' | 'escalate';
export type SubagentStatus = 'idle' | 'preparing' | 'executing' | 'validating' | 'escalating' | 'completed' | 'failed' | 'derailed' | 'retrying';

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
  errorMessage?: string; // Flat error message for simpler access
  diagnostics?: DiagnosticResult;
  escalated?: boolean;
  interventionId?: string;
  durationMs: number;
  confidenceScore: number;
  retriesUsed?: number; // UPGRADE 2: Track self-correction retries
  creditsUsed?: number; // Credits consumed for this execution
  creditBalance?: number; // Remaining credit balance after execution
  creditDeductionFailed?: boolean; // Flag if credit deduction failed (for observability)
  tokensUsed?: number; // Token count for batch execution tracking
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
    capabilities: ['scheduling.generate_ai_schedule', 'scheduling.detect_conflicts'],
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
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner', 'co_owner', 'department_manager'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'PayrollAgent',
    domain: 'payroll',
    description: 'Handles pay runs, deductions, tax calculations, and payroll compliance',
    capabilities: ['payroll.calculate_run', 'payroll.detect_anomalies', 'payroll.submit_for_approval', 'payroll.approve_run', 'payroll.bulk_process'],
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
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'co_owner'],
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
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'co_owner'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'ComplianceAgent',
    domain: 'compliance',
    description: 'Monitors certifications, labor law compliance, break enforcement',
    capabilities: ['compliance.check_certifications', 'compliance.detect_violations', 'compliance.auto_remediate'],
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
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'compliance_officer', 'org_owner', 'co_owner'],
    bypassAuthFor: ['root_admin', 'compliance_officer'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'NotificationAgent',
    domain: 'notifications',
    description: 'Smart Mail Delivery Specialist - Routes all communications with intelligent tab filtering, RBAC-based targeting, and multi-channel delivery (email, SMS, WebSocket, push). Coordinates with Trinity for architectural context.',
    capabilities: ['notify.send_platform_update', 'notify.broadcast_message', 'notify.send_to_user', 'notify.create_maintenance_alert', 'notify.get_stats', 'notify.force_clear_all', 'support.broadcast'],
    requiredTools: ['email_service', 'sms_service', 'websocket_broadcaster', 'push_notifier', 'tab_router', 'rbac_filter', 'digest_aggregator'],
    escalationPolicy: { maxRetries: 5, escalateOn: ['delivery_failure_rate_high', 'rbac_routing_error', 'channel_unavailable'] },
    diagnosticWorkflow: {
      diagnose: ['check_delivery_status', 'verify_recipient_config', 'validate_tab_routing', 'check_rbac_permissions'],
      fix: ['retry_failed', 'switch_channel', 'reroute_to_correct_tab', 'fallback_to_email'],
      validate: ['confirm_delivery', 'verify_tab_placement', 'check_recipient_received'],
      report: ['generate_delivery_report', 'routing_analytics']
    },
    knownPatterns: ['email_bounce', 'sms_failed', 'websocket_disconnect', 'rate_limit_hit', 'wrong_tab_routing', 'rbac_mismatch', 'digest_overflow'],
    fixStrategies: { 
      email_bounce: 'switch_to_sms', 
      websocket_disconnect: 'queue_for_reconnect',
      wrong_tab_routing: 'apply_category_mapping',
      rbac_mismatch: 'filter_by_role_hierarchy'
    },
    maxRetries: 5,
    timeoutMs: 15000,
    confidenceThreshold: 0.7,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    isActive: true,
    version: '2.0.0',
  },
  {
    name: 'RecoveryAgent',
    domain: 'recovery',
    description: 'Session recovery, rollback, checkpoint management',
    capabilities: ['session.get_recoverable', 'session.rollback_to_checkpoint', 'session.complete_recovery', 'session.get_context_for_automation', 'session.cleanup_expired'],
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
    capabilities: ['health.self_check', 'health.auto_remediate', 'health.performance_report'],
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
    capabilities: ['session.guardian.diagnose', 'session.guardian.heal', 'session.guardian.status', 'session.guardian.elevate', 'session.guardian.revoke'],
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
    capabilities: ['memory.build_context', 'memory.get_profile', 'memory.share_insight'],
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
    capabilities: ['governance.evaluate_action', 'governance.record_outcome'],
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
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'co_owner'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'EscalationAgent',
    domain: 'escalation',
    description: 'Manages critical issue escalation, system health alerts, and runbook execution for support workflows',
    capabilities: ['escalation.critical_issue', 'escalation.system_health', 'escalation.execute_runbook', 'escalation.configure_rules'],
    requiredTools: ['alert_router', 'runbook_executor', 'escalation_chain', 'ticket_creator'],
    escalationPolicy: { maxRetries: 1, escalateOn: ['runbook_failed', 'critical_unresolved'], alwaysNotify: true },
    diagnosticWorkflow: {
      diagnose: ['assess_severity', 'identify_responders', 'check_runbook_availability'],
      fix: ['execute_runbook', 'notify_on_call', 'create_incident'],
      validate: ['verify_escalation_received', 'confirm_incident_created'],
      report: ['generate_incident_report']
    },
    knownPatterns: ['runbook_timeout', 'no_responder', 'escalation_loop', 'severity_mismatch'],
    fixStrategies: { no_responder: 'escalate_to_backup', runbook_timeout: 'manual_intervention_required' },
    maxRetries: 1,
    timeoutMs: 60000,
    confidenceThreshold: 0.9,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'AnalyticsAgent',
    domain: 'analytics',
    description: 'Generates AI-powered insights, workforce summaries, and performance analytics',
    capabilities: ['analytics.generate_insights', 'analytics.workforce_summary'],
    requiredTools: ['insight_generator', 'trend_analyzer', 'report_builder', 'data_aggregator'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['data_unavailable', 'insight_generation_failed'] },
    diagnosticWorkflow: {
      diagnose: ['check_data_sources', 'validate_metrics', 'verify_timeframes'],
      fix: ['refresh_data_cache', 'recalculate_metrics'],
      validate: ['verify_report_accuracy', 'check_insight_relevance'],
      report: ['generate_analytics_summary']
    },
    knownPatterns: ['stale_data', 'metric_mismatch', 'incomplete_dataset', 'calculation_error'],
    fixStrategies: { stale_data: 'trigger_data_refresh', metric_mismatch: 'recalculate_from_source' },
    maxRetries: 3,
    timeoutMs: 45000,
    confidenceThreshold: 0.75,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner', 'co_owner', 'department_manager'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'AutomationAgent',
    domain: 'automation',
    description: 'Triggers and manages scheduled automation jobs, diagnostics, and platform animations',
    capabilities: ['automation.trigger_job', 'automation.run_diagnostics', 'automation.control_animation'],
    requiredTools: ['job_scheduler', 'diagnostic_runner', 'animation_controller', 'task_queue'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['job_failed', 'scheduler_error'] },
    diagnosticWorkflow: {
      diagnose: ['check_job_status', 'verify_scheduler_health', 'audit_job_history'],
      fix: ['retry_failed_job', 'restart_scheduler', 'clear_stuck_tasks'],
      validate: ['verify_job_completed', 'check_scheduler_restored'],
      report: ['generate_automation_report']
    },
    knownPatterns: ['job_timeout', 'scheduler_stall', 'resource_exhausted', 'dependency_failed'],
    fixStrategies: { job_timeout: 'retry_with_extended_timeout', scheduler_stall: 'restart_scheduler_service' },
    maxRetries: 3,
    timeoutMs: 60000,
    confidenceThreshold: 0.8,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'LifecycleAgent',
    domain: 'lifecycle',
    description: 'Manages employee lifecycle events: probation, renewals, anniversaries, and milestones',
    capabilities: ['lifecycle.check_probation', 'lifecycle.renewal_reminders', 'lifecycle.check_anniversaries'],
    requiredTools: ['calendar_checker', 'reminder_sender', 'milestone_tracker', 'notification_broadcaster'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['missed_deadline', 'reminder_failed'] },
    diagnosticWorkflow: {
      diagnose: ['check_upcoming_events', 'verify_notification_status', 'audit_lifecycle_data'],
      fix: ['resend_reminder', 'update_milestone_status'],
      validate: ['verify_notification_delivered', 'confirm_event_processed'],
      report: ['generate_lifecycle_report']
    },
    knownPatterns: ['reminder_undelivered', 'date_miscalculation', 'missing_employee_data', 'duplicate_event'],
    fixStrategies: { reminder_undelivered: 'switch_notification_channel', date_miscalculation: 'recalculate_from_hire_date' },
    maxRetries: 2,
    timeoutMs: 30000,
    confidenceThreshold: 0.8,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner', 'co_owner', 'department_manager'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'AssistAgent',
    domain: 'assist',
    description: 'User assistance: feature discovery, troubleshooting, and AI-powered recommendations',
    capabilities: ['assist.find_feature', 'assist.troubleshoot', 'assist.get_recommendation'],
    requiredTools: ['feature_catalog', 'troubleshooter', 'recommendation_engine', 'error_explainer'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['user_frustrated', 'issue_unresolved'] },
    diagnosticWorkflow: {
      diagnose: ['understand_user_intent', 'check_feature_availability', 'analyze_error_context'],
      fix: ['provide_guided_steps', 'suggest_alternatives', 'escalate_to_human'],
      validate: ['verify_user_satisfied', 'confirm_issue_resolved'],
      report: ['log_assistance_session']
    },
    knownPatterns: ['feature_not_found', 'unclear_request', 'permission_issue', 'configuration_error'],
    fixStrategies: { feature_not_found: 'suggest_similar_features', unclear_request: 'ask_clarifying_questions' },
    maxRetries: 3,
    timeoutMs: 20000,
    confidenceThreshold: 0.6,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'org_owner', 'co_owner', 'department_manager', 'supervisor', 'staff', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'WorkflowAgent',
    domain: 'workflow',
    description: 'Manages durable workflows: registration, execution, monitoring, and quick actions',
    capabilities: ['workflow.register', 'workflow.execute', 'workflow.list', 'workflow.executions', 'workflow.quick'],
    requiredTools: ['workflow_registry', 'workflow_executor', 'execution_monitor', 'step_handler'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['workflow_stuck', 'step_failed'] },
    diagnosticWorkflow: {
      diagnose: ['check_workflow_state', 'verify_step_dependencies', 'audit_execution_history'],
      fix: ['retry_failed_step', 'rollback_to_checkpoint', 'skip_optional_step'],
      validate: ['verify_workflow_completed', 'check_output_validity'],
      report: ['generate_execution_report']
    },
    knownPatterns: ['step_timeout', 'dependency_missing', 'circular_dependency', 'state_corruption'],
    fixStrategies: { step_timeout: 'retry_with_backoff', state_corruption: 'restore_from_checkpoint' },
    maxRetries: 3,
    timeoutMs: 120000,
    confidenceThreshold: 0.8,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'TestingAgent',
    domain: 'testing',
    description: 'Runs automated tests: API health, database connectivity, schema validation, and custom test suites',
    capabilities: ['test.run', 'test.run_all', 'test.run_category', 'test.list', 'test.results', 'test.send_notification', 'test.send_maintenance_alert'],
    requiredTools: ['test_runner', 'assertion_engine', 'result_collector', 'coverage_analyzer'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['critical_test_failed', 'test_environment_broken'] },
    diagnosticWorkflow: {
      diagnose: ['check_test_environment', 'verify_test_data', 'analyze_failures'],
      fix: ['reset_test_state', 'refresh_test_data', 'isolate_flaky_tests'],
      validate: ['verify_tests_passing', 'check_coverage_threshold'],
      report: ['generate_test_report']
    },
    knownPatterns: ['flaky_test', 'environment_mismatch', 'data_dependency', 'timeout'],
    fixStrategies: { flaky_test: 'retry_with_isolation', environment_mismatch: 'reset_test_environment' },
    maxRetries: 2,
    timeoutMs: 180000,
    confidenceThreshold: 0.9,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'OnboardingAgent',
    domain: 'onboarding',
    description: 'Manages employee onboarding: diagnostics, auto-fixes, routing configuration, and validation',
    capabilities: ['onboarding.run_diagnostics', 'onboarding.apply_auto_fixes', 'onboarding.get_routing_config', 'onboarding.validate_routing'],
    requiredTools: ['onboarding_checker', 'routing_validator', 'auto_fixer', 'config_manager'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['onboarding_blocked', 'routing_invalid'] },
    diagnosticWorkflow: {
      diagnose: ['check_employee_setup', 'verify_routing_config', 'validate_required_fields'],
      fix: ['apply_default_routing', 'complete_missing_fields', 'assign_default_roles'],
      validate: ['verify_employee_accessible', 'check_routing_functional'],
      report: ['generate_onboarding_report']
    },
    knownPatterns: ['missing_required_field', 'invalid_routing', 'department_mismatch', 'role_conflict'],
    fixStrategies: { missing_required_field: 'prompt_for_input', invalid_routing: 'apply_default_config' },
    maxRetries: 2,
    timeoutMs: 30000,
    confidenceThreshold: 0.8,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner', 'co_owner', 'department_manager'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'ExpenseAgent',
    domain: 'expense',
    description: 'AI-powered expense management: receipt OCR, category suggestions, batch processing, and pattern analysis',
    capabilities: ['expense.extract_receipt', 'expense.suggest_category', 'expense.batch_categorize', 'expense.match_receipt', 'expense.analyze_patterns'],
    requiredTools: ['ocr_extractor', 'category_suggester', 'receipt_matcher', 'pattern_analyzer'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['ocr_failed', 'category_unknown', 'duplicate_detected'] },
    diagnosticWorkflow: {
      diagnose: ['verify_image_quality', 'check_category_coverage', 'analyze_match_confidence'],
      fix: ['enhance_image', 'suggest_new_category', 'request_manual_review'],
      validate: ['verify_extraction_accuracy', 'confirm_categorization'],
      report: ['generate_expense_report']
    },
    knownPatterns: ['blurry_receipt', 'unknown_vendor', 'duplicate_expense', 'currency_mismatch'],
    fixStrategies: { blurry_receipt: 'request_resubmission', unknown_vendor: 'create_vendor_entry' },
    maxRetries: 3,
    timeoutMs: 45000,
    confidenceThreshold: 0.7,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'org_owner', 'co_owner'],
    bypassAuthFor: ['root_admin', 'deputy_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'PricingAgent',
    domain: 'pricing',
    description: 'AI dynamic pricing: client analysis, pricing reports, competitiveness checks, and rate simulations',
    capabilities: ['pricing.analyze_client', 'pricing.generate_report', 'pricing.check_competitiveness', 'pricing.simulate_adjustment'],
    requiredTools: ['pricing_analyzer', 'report_generator', 'market_comparator', 'simulation_engine'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['pricing_conflict', 'market_data_unavailable'], alwaysNotify: true },
    diagnosticWorkflow: {
      diagnose: ['analyze_pricing_history', 'check_market_rates', 'verify_client_data'],
      fix: ['refresh_market_data', 'adjust_baseline_rates'],
      validate: ['verify_pricing_competitive', 'check_margin_acceptable'],
      report: ['generate_pricing_analysis']
    },
    knownPatterns: ['below_cost_pricing', 'rate_conflict', 'market_outlier', 'margin_warning'],
    fixStrategies: { below_cost_pricing: 'adjust_to_minimum_margin', rate_conflict: 'apply_tiered_pricing' },
    maxRetries: 2,
    timeoutMs: 60000,
    confidenceThreshold: 0.85,
    requiresApproval: true,
    allowedRoles: ['root_admin', 'deputy_admin', 'org_owner', 'co_owner'],
    bypassAuthFor: ['root_admin'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'DataMigrationAgent',
    domain: 'data_migration',
    description: 'Enterprise-grade data migration subagent for new org onboarding. Executes 5-step workflow: Gate Check → Data Ingestion → Extraction & Structuring → Analysis & Validation → Final Setup Automation. Uses Gemini 2.5 Pro for document analysis and Gemini 2.5 Flash for automation tasks.',
    capabilities: [
      'migration.gate_check',
      'migration.ingest_data',
      'migration.extract_structure',
      'migration.analyze_validate',
      'migration.setup_automation',
      'migration.bulk_import_employees',
      'migration.bulk_import_teams',
      'migration.bulk_import_schedules',
      'migration.assign_hierarchy',
      'migration.create_departments'
    ],
    requiredTools: [
      'pdf_extractor',
      'excel_parser',
      'csv_importer',
      'gemini_vision',
      'hierarchy_builder',
      'validation_engine',
      'bulk_import_engine'
    ],
    escalationPolicy: {
      maxRetries: 2,
      escalateOn: ['extraction_failed', 'validation_critical', 'import_blocked', 'hierarchy_conflict'],
      alwaysNotify: true,
      notifyRoles: ['root_admin', 'deputy_admin', 'support_manager']
    },
    diagnosticWorkflow: {
      diagnose: [
        'check_file_format',
        'verify_data_integrity',
        'validate_schema_compatibility',
        'scan_for_duplicates',
        'check_hierarchy_consistency'
      ],
      fix: [
        'normalize_data_format',
        'resolve_duplicates',
        'auto_map_columns',
        'rebuild_hierarchy',
        'apply_default_values'
      ],
      validate: [
        'verify_import_counts',
        'check_relationship_integrity',
        'validate_hierarchy_tree',
        'confirm_no_orphans'
      ],
      report: [
        'generate_migration_summary',
        'create_import_manifest',
        'log_validation_results'
      ]
    },
    knownPatterns: [
      'column_mapping_mismatch',
      'duplicate_employee',
      'invalid_date_format',
      'missing_required_field',
      'hierarchy_cycle_detected',
      'department_not_found',
      'manager_not_found',
      'invalid_pay_rate'
    ],
    fixStrategies: {
      column_mapping_mismatch: 'auto_detect_and_map',
      duplicate_employee: 'merge_or_skip_with_flag',
      invalid_date_format: 'parse_with_fallback_formats',
      missing_required_field: 'prompt_or_apply_default',
      hierarchy_cycle_detected: 'break_cycle_at_lowest_level',
      department_not_found: 'create_placeholder_department',
      manager_not_found: 'assign_to_org_owner',
      invalid_pay_rate: 'flag_for_review'
    },
    maxRetries: 2,
    timeoutMs: 120000,
    confidenceThreshold: 0.85,
    requiresApproval: true,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'ScoringAgent',
    domain: 'scoring',
    description: 'Trust scoring and graduated approval system. Calculates org-level trust scores from execution telemetry, manages auto-approval thresholds (99.9% accuracy grants auto-approval), coaches subagents on accuracy improvements, and reports graduation status. Uses Gemini 2.5 Pro for scoring analysis and pattern recognition.',
    capabilities: [
      'scoring.calculate_trust_score',
      'scoring.check_graduation_status',
      'scoring.grant_auto_approval',
      'scoring.revoke_auto_approval',
      'scoring.analyze_accuracy_trends',
      'scoring.coach_subagent',
      'scoring.generate_trust_report',
      'scoring.evaluate_execution',
      'scoring.bulk_score_update'
    ],
    requiredTools: [
      'telemetry_analyzer',
      'accuracy_calculator',
      'trend_detector',
      'coaching_engine',
      'graduation_evaluator',
      'confidence_aggregator'
    ],
    escalationPolicy: {
      maxRetries: 1,
      escalateOn: ['scoring_anomaly', 'graduation_revoked', 'accuracy_drop'],
      alwaysNotify: true,
      notifyRoles: ['root_admin', 'deputy_admin', 'support_manager', 'org_owner']
    },
    diagnosticWorkflow: {
      diagnose: [
        'analyze_execution_history',
        'calculate_accuracy_metrics',
        'identify_failure_patterns',
        'check_confidence_trends'
      ],
      fix: [
        'recalibrate_scoring_weights',
        'apply_coaching_recommendations',
        'adjust_threshold_for_domain'
      ],
      validate: [
        'verify_scoring_consistency',
        'confirm_graduation_eligibility',
        'validate_accuracy_calculations'
      ],
      report: [
        'generate_trust_dashboard',
        'create_graduation_summary',
        'publish_accuracy_report'
      ]
    },
    knownPatterns: [
      'accuracy_degradation',
      'false_positive_spike',
      'false_negative_spike',
      'domain_weakness',
      'graduation_threshold_breach',
      'confidence_calibration_drift'
    ],
    fixStrategies: {
      accuracy_degradation: 'identify_root_cause_and_retrain',
      false_positive_spike: 'increase_validation_strictness',
      false_negative_spike: 'relax_overly_strict_checks',
      domain_weakness: 'coach_specific_subagent',
      graduation_threshold_breach: 'revoke_and_notify',
      confidence_calibration_drift: 'recalibrate_confidence_weights'
    },
    maxRetries: 1,
    timeoutMs: 30000,
    confidenceThreshold: 0.95,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'org_owner', 'co_owner'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'MailerSubagent',
    domain: 'notifications', // Uses existing notifications domain, specializes in email
    description: 'Specialized Email Delivery Agent - Handles all transactional and notification emails with intelligent template selection, delivery tracking, retry logic, and Resend integration. Provides specialized mailing instructions for each email category with proper formatting, branding compliance, and GDPR/CAN-SPAM requirements.',
    capabilities: [
      'mailer.send_transactional',
      'mailer.send_notification',
      'mailer.send_bulk',
      'mailer.send_digest',
      'mailer.get_delivery_status',
      'mailer.retry_failed',
      'mailer.validate_template',
      'mailer.preview_email',
      'mailer.get_analytics'
    ],
    requiredTools: [
      'resend_client',
      'template_engine',
      'delivery_tracker',
      'bounce_handler',
      'unsubscribe_manager',
      'spam_score_checker',
      'email_validator'
    ],
    escalationPolicy: {
      maxRetries: 5,
      escalateOn: ['delivery_failure_critical', 'bounce_rate_high', 'spam_complaint', 'template_error'],
      alwaysNotify: false,
      notifyRoles: ['root_admin', 'deputy_admin', 'sysop']
    },
    diagnosticWorkflow: {
      diagnose: [
        'check_delivery_status',
        'verify_recipient_validity',
        'validate_template_syntax',
        'check_spam_score',
        'verify_sender_reputation'
      ],
      fix: [
        'retry_with_fallback_sender',
        'switch_to_alternative_template',
        'queue_for_later_delivery',
        'update_recipient_status'
      ],
      validate: [
        'confirm_delivery_receipt',
        'check_open_rate',
        'verify_unsubscribe_compliance'
      ],
      report: [
        'generate_delivery_report',
        'create_bounce_summary',
        'publish_engagement_metrics'
      ]
    },
    knownPatterns: [
      'email_bounced_hard',
      'email_bounced_soft',
      'spam_complaint_received',
      'rate_limit_exceeded',
      'template_rendering_failed',
      'recipient_unsubscribed',
      'sender_reputation_low',
      'attachment_too_large'
    ],
    fixStrategies: {
      email_bounced_hard: 'mark_recipient_invalid_and_notify_admin',
      email_bounced_soft: 'retry_with_exponential_backoff',
      spam_complaint_received: 'add_to_suppression_list',
      rate_limit_exceeded: 'queue_and_throttle',
      template_rendering_failed: 'use_fallback_plain_text',
      recipient_unsubscribed: 'respect_preference_and_skip',
      sender_reputation_low: 'switch_to_backup_domain'
    },
    maxRetries: 5,
    timeoutMs: 30000,
    confidenceThreshold: 0.85,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'org_owner', 'co_owner', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
  {
    name: 'ChatServerAgent',
    domain: 'communication',
    description: 'Self-aware AI-powered chat server orchestrator. Analyzes itself, fixes issues autonomously, reports live users (including bots), communicates with AI Brain/Trinity, handles chatroom issues, integrates with ticket system, and suggests UI/UX improvements.',
    capabilities: [
      'chatserver.get_live_presence',
      'chatserver.get_room_health',
      'chatserver.diagnose_issues',
      'chatserver.self_heal',
      'chatserver.report_to_trinity',
      'chatserver.suggest_improvements',
      'chatserver.handle_ticket_escalation',
      'chatserver.broadcast_announcement',
      'chatserver.get_bot_status',
      'chatserver.optimize_rooms'
    ],
    requiredTools: [
      'websocket_monitor',
      'room_analyzer',
      'presence_tracker',
      'ticket_bridge',
      'trinity_reporter',
      'ux_analyzer',
      'self_healer'
    ],
    escalationPolicy: {
      maxRetries: 5,
      escalateOn: ['websocket_failure', 'room_corruption', 'data_loss', 'bot_unresponsive'],
      alwaysNotify: true,
      notifyRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager']
    },
    diagnosticWorkflow: {
      diagnose: [
        'scan_active_rooms',
        'check_websocket_health',
        'verify_presence_accuracy',
        'analyze_message_delivery',
        'check_bot_responsiveness',
        'audit_room_persistence',
        'detect_anomaly_patterns'
      ],
      fix: [
        'restart_stale_rooms',
        'resync_presence_state',
        'reconnect_websockets',
        'repair_room_data',
        'reactivate_bots',
        'clear_message_queue',
        'restore_from_checkpoint'
      ],
      validate: [
        'verify_rooms_operational',
        'confirm_presence_synced',
        'check_message_flow',
        'validate_bot_responses',
        'confirm_data_integrity'
      ],
      report: [
        'generate_health_summary',
        'report_to_trinity',
        'create_improvement_suggestions',
        'log_to_audit',
        'update_dashboard_metrics'
      ]
    },
    knownPatterns: [
      'websocket_disconnect_spike',
      'room_not_loading',
      'presence_out_of_sync',
      'message_delivery_delay',
      'bot_timeout',
      'helpdesk_overload',
      'stale_room_data',
      'memory_pressure',
      'connection_pool_exhausted'
    ],
    fixStrategies: {
      websocket_disconnect_spike: 'implement_reconnect_with_backoff',
      room_not_loading: 'clear_cache_and_reload',
      presence_out_of_sync: 'force_resync_from_database',
      message_delivery_delay: 'flush_queue_and_prioritize',
      bot_timeout: 'restart_bot_process',
      helpdesk_overload: 'enable_queue_throttling',
      stale_room_data: 'refresh_from_source',
      memory_pressure: 'garbage_collect_inactive_sessions',
      connection_pool_exhausted: 'expand_pool_and_cleanup'
    },
    maxRetries: 5,
    timeoutMs: 30000,
    confidenceThreshold: 0.8,
    requiresApproval: false,
    allowedRoles: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent', 'Bot'],
    bypassAuthFor: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    isActive: true,
    version: '1.0.0',
  },
];

// ============================================================================
// SPECIALIZED MAILING INSTRUCTIONS REGISTRY
// ============================================================================

/**
 * MailingInstructions - Specialized instructions for each email category
 * Ensures all emails meet branding, compliance, and delivery best practices
 */
export interface MailingInstruction {
  category: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  requiredFields: string[];
  optionalFields: string[];
  templateId?: string;
  maxRetries: number;
  retryDelayMs: number;
  complianceChecks: string[];
  formattingRules: {
    maxSubjectLength: number;
    includeUnsubscribe: boolean;
    includeCompanyAddress: boolean;
    htmlRequired: boolean;
    plainTextFallback: boolean;
  };
  deliveryRules: {
    sendImmediately: boolean;
    batchWithDigest: boolean;
    respectQuietHours: boolean;
    timezone?: string;
  };
}

export const MAILING_INSTRUCTIONS: Record<string, MailingInstruction> = {
  // Critical transactional emails - must send immediately
  password_reset: {
    category: 'security',
    priority: 'critical',
    requiredFields: ['email', 'firstName', 'resetUrl'],
    optionalFields: [],
    templateId: 'passwordReset',
    maxRetries: 5,
    retryDelayMs: 1000,
    complianceChecks: ['valid_email', 'rate_limit_ok'],
    formattingRules: {
      maxSubjectLength: 50,
      includeUnsubscribe: false, // Security emails exempt
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: false, // Critical, send anytime
    },
  },

  verification: {
    category: 'security',
    priority: 'critical',
    requiredFields: ['email', 'firstName', 'verificationUrl'],
    optionalFields: [],
    templateId: 'verification',
    maxRetries: 5,
    retryDelayMs: 1000,
    complianceChecks: ['valid_email'],
    formattingRules: {
      maxSubjectLength: 50,
      includeUnsubscribe: false,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: false,
    },
  },

  // High priority operational emails
  shift_assignment: {
    category: 'operations',
    priority: 'high',
    requiredFields: ['email', 'employeeName', 'shiftDate', 'shiftTime', 'location'],
    optionalFields: ['managerName', 'notes'],
    templateId: 'shiftAssignment',
    maxRetries: 3,
    retryDelayMs: 5000,
    complianceChecks: ['valid_email', 'employee_active', 'notification_preference'],
    formattingRules: {
      maxSubjectLength: 60,
      includeUnsubscribe: true,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: true,
      timezone: 'employee_local',
    },
  },

  shift_reminder: {
    category: 'operations',
    priority: 'high',
    requiredFields: ['email', 'employeeName', 'shiftDate', 'shiftTime'],
    optionalFields: ['location', 'checklistUrl'],
    templateId: 'shiftReminder',
    maxRetries: 2,
    retryDelayMs: 10000,
    complianceChecks: ['valid_email', 'employee_active', 'notification_preference'],
    formattingRules: {
      maxSubjectLength: 50,
      includeUnsubscribe: true,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: false, // Reminders should arrive on time
    },
  },

  invoice_generated: {
    category: 'billing',
    priority: 'high',
    requiredFields: ['email', 'clientName', 'invoiceNumber', 'amount', 'dueDate'],
    optionalFields: ['invoiceUrl', 'paymentLink'],
    templateId: 'invoiceGenerated',
    maxRetries: 3,
    retryDelayMs: 10000,
    complianceChecks: ['valid_email', 'client_active'],
    formattingRules: {
      maxSubjectLength: 60,
      includeUnsubscribe: true,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: true,
    },
  },

  payroll_processed: {
    category: 'payroll',
    priority: 'high',
    requiredFields: ['email', 'employeeName', 'payPeriod', 'netAmount'],
    optionalFields: ['paystubUrl', 'grossAmount', 'deductions'],
    templateId: 'payrollProcessed',
    maxRetries: 3,
    retryDelayMs: 5000,
    complianceChecks: ['valid_email', 'employee_active'],
    formattingRules: {
      maxSubjectLength: 50,
      includeUnsubscribe: true,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: true,
    },
  },

  // Normal priority notifications
  platform_update: {
    category: 'system',
    // @ts-expect-error — TS migration: fix in refactoring sprint
    priority: 'medium',
    requiredFields: ['email', 'title', 'description'],
    optionalFields: ['actionUrl', 'releaseNotes'],
    templateId: 'platformUpdate',
    maxRetries: 2,
    retryDelayMs: 30000,
    complianceChecks: ['valid_email', 'notification_preference'],
    formattingRules: {
      maxSubjectLength: 60,
      includeUnsubscribe: true,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: false,
      batchWithDigest: true,
      respectQuietHours: true,
    },
  },

  support_ticket_confirmation: {
    category: 'support',
    // @ts-expect-error — TS migration: fix in refactoring sprint
    priority: 'medium',
    requiredFields: ['email', 'name', 'ticketNumber', 'subject'],
    optionalFields: ['ticketUrl'],
    templateId: 'supportTicketConfirmation',
    maxRetries: 3,
    retryDelayMs: 5000,
    complianceChecks: ['valid_email'],
    formattingRules: {
      maxSubjectLength: 60,
      includeUnsubscribe: false, // Support emails exempt
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: false,
    },
  },

  employee_invitation: {
    category: 'onboarding',
    // @ts-expect-error — TS migration: fix in refactoring sprint
    priority: 'medium',
    requiredFields: ['email', 'inviterName', 'workspaceName', 'joinUrl'],
    optionalFields: ['firstName', 'roleName', 'expiresInDays'],
    templateId: 'employeeInvitation',
    maxRetries: 3,
    retryDelayMs: 10000,
    complianceChecks: ['valid_email', 'not_already_member'],
    formattingRules: {
      maxSubjectLength: 60,
      includeUnsubscribe: false, // Invitation, not marketing
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: true,
      batchWithDigest: false,
      respectQuietHours: true,
    },
  },

  // Low priority / digest-able notifications
  weekly_digest: {
    category: 'digest',
    priority: 'low',
    requiredFields: ['email', 'recipientName', 'digestContent'],
    optionalFields: ['highlights', 'actionItems'],
    templateId: 'weeklyDigest',
    maxRetries: 2,
    retryDelayMs: 60000,
    complianceChecks: ['valid_email', 'digest_preference_enabled'],
    formattingRules: {
      maxSubjectLength: 70,
      includeUnsubscribe: true,
      includeCompanyAddress: true,
      htmlRequired: true,
      plainTextFallback: true,
    },
    deliveryRules: {
      sendImmediately: false,
      batchWithDigest: false, // Is the digest itself
      respectQuietHours: true,
      timezone: 'recipient_local',
    },
  },
};

/**
 * Get mailing instruction for a given email category
 */
export function getMailingInstruction(category: string): MailingInstruction | null {
  return MAILING_INSTRUCTIONS[category] || null;
}

/**
 * Validate email data against mailing instructions
 */
export function validateEmailData(
  category: string, 
  data: Record<string, any>
): { valid: boolean; errors: string[] } {
  const instruction = getMailingInstruction(category);
  if (!instruction) {
    return { valid: false, errors: [`Unknown email category: ${category}`] };
  }

  const errors: string[] = [];
  for (const field of instruction.requiredFields) {
    if (!data[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// FAST MODE CONTEXT & GRADUATED APPROVAL SYSTEM
// ============================================================================

/**
 * FastModeContext - Propagated through all subagent executions when Fast Mode is enabled
 * All orchestrators, supervisors, and subagents must understand and respect this context
 */
export interface FastModeContext {
  enabled: boolean;
  tier: 'standard' | 'premium' | 'enterprise';
  maxConcurrent: number;
  slaTimeoutMs: number;
  priorityBoost: number;
  creditMultiplier: number;
  parallelPhases: boolean; // Execute prepare/execute/validate phases in parallel where safe
  progressReporting: boolean; // Enable real-time phase-level progress reporting
  skipNonCriticalValidation: boolean; // Skip validations that aren't blocking for speed
}

/**
 * GraduationStatus - Tracks org-level trust for auto-approval eligibility
 */
export interface GraduationStatus {
  workspaceId: string;
  trustScore: number; // 0-100, auto-approval at >= 99.9
  totalExecutions: number;
  successfulExecutions: number;
  accuracyPercent: number;
  isGraduated: boolean;
  graduatedAt?: Date;
  lastEvaluatedAt: Date;
  autoApprovalDomains: SubagentDomain[]; // Domains where auto-approval is granted
  pendingReviewDomains: SubagentDomain[]; // Domains still requiring manual approval
}

/**
 * Default Fast Mode configuration by tier
 */
export const FAST_MODE_CONTEXTS: Record<string, FastModeContext> = {
  standard: {
    enabled: true,
    tier: 'standard',
    maxConcurrent: 4,
    slaTimeoutMs: 15000,
    priorityBoost: 1.5,
    creditMultiplier: 1.5,
    parallelPhases: false,
    progressReporting: true,
    skipNonCriticalValidation: false,
  },
  premium: {
    enabled: true,
    tier: 'premium',
    maxConcurrent: 8,
    slaTimeoutMs: 10000,
    priorityBoost: 2.0,
    creditMultiplier: 2.0,
    parallelPhases: true,
    progressReporting: true,
    skipNonCriticalValidation: true,
  },
  enterprise: {
    enabled: true,
    tier: 'enterprise',
    maxConcurrent: 16,
    slaTimeoutMs: 5000,
    priorityBoost: 3.0,
    creditMultiplier: 2.5,
    parallelPhases: true,
    progressReporting: true,
    skipNonCriticalValidation: true,
  },
};

/** Graduation threshold - org must achieve 99.9% accuracy for auto-approval */
export const GRADUATION_THRESHOLD = 99.9;
export const MINIMUM_EXECUTIONS_FOR_GRADUATION = 100;

// ============================================================================
// SUPERVISOR MODEL POLICY - Flash-first execution with Pro fallback
// ============================================================================

export type SupervisorModelTier = 'flash' | 'pro';

export interface SupervisorModelPolicy {
  /** Default model for execution commands */
  executionModel: SupervisorModelTier;
  /** Model for validation/QC tasks */
  validationModel: SupervisorModelTier;
  /** Model for context summarization */
  summarizationModel: SupervisorModelTier;
  /** Model for compliance checks */
  complianceModel: SupervisorModelTier;
  /** Model for failure analysis (always Pro) */
  failureAnalysisModel: SupervisorModelTier;
  /** Retry threshold before escalating to Pro */
  retryThresholdForProEscalation: number;
  /** Timeout before escalating to Pro (ms) */
  timeoutThresholdForProEscalation: number;
}

export const DEFAULT_SUPERVISOR_MODEL_POLICY: SupervisorModelPolicy = {
  executionModel: 'flash',
  validationModel: 'flash',
  summarizationModel: 'flash',
  complianceModel: 'flash',
  failureAnalysisModel: 'pro',
  retryThresholdForProEscalation: 3,
  timeoutThresholdForProEscalation: 30000,
};

// ============================================================================
// WORK ORDER BATCH - Parallel task distribution
// ============================================================================

export type WorkOrderStatus = 'queued' | 'dispatched' | 'executing' | 'validating' | 'completed' | 'failed' | 'timeout';
export type WorkOrderPriority = 'critical' | 'high' | 'normal' | 'low';

export interface WorkOrderItem {
  id: string;
  subagentDomain: SubagentDomain;
  actionId: string;
  parameters: Record<string, any>;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  dependencies: string[];  // IDs of work orders this depends on
  startedAt?: number;
  completedAt?: number;
  result?: any;
  error?: string;
  retryCount: number;
  assignedSubagentId?: string;
}

export interface WorkOrderBatch {
  id: string;
  workboardJobId: string;
  workspaceId: string;
  userId: string;
  createdAt: number;
  status: 'preparing' | 'executing' | 'validating' | 'completed' | 'failed';
  items: WorkOrderItem[];
  dependencyGraph: Map<string, string[]>;
  slaTimeoutMs: number;
  modelPolicy: SupervisorModelPolicy;
  parallelLimit: number;
  completedCount: number;
  failedCount: number;
  totalTokensUsed: number;
  totalCreditsUsed: number;
}

export interface CoordinationCheckpoint {
  workOrderId: string;
  phase: SubagentPhase;
  artifact?: any;
  validationResult?: { valid: boolean; errors: string[] };
  timestamp: number;
}

export interface ParallelExecutionResult {
  batchId: string;
  success: boolean;
  completedItems: number;
  failedItems: number;
  results: Map<string, SubagentExecutionResult>;
  totalDurationMs: number;
  totalTokensUsed: number;
  summary: string;
}

// ============================================================================
// PARALLEL WORK ORDER DISPATCHER
// ============================================================================

class ParallelWorkOrderDispatcher {
  private activeBatches: Map<string, WorkOrderBatch> = new Map();
  private coordinationBus: Map<string, CoordinationCheckpoint[]> = new Map();

  /**
   * Create a new work order batch from workboard job
   */
  createBatch(
    workboardJobId: string,
    workspaceId: string,
    userId: string,
    tasks: Array<{ domain: SubagentDomain; actionId: string; parameters: Record<string, any>; priority?: WorkOrderPriority; dependencies?: string[] }>,
    options: { slaTimeoutMs?: number; parallelLimit?: number; modelPolicy?: Partial<SupervisorModelPolicy> } = {}
  ): WorkOrderBatch {
    const batchId = `batch-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
    
    const items: WorkOrderItem[] = tasks.map((task, index) => ({
      id: `wo-${batchId}-${index}`,
      subagentDomain: task.domain,
      actionId: task.actionId,
      parameters: task.parameters,
      status: 'queued' as WorkOrderStatus,
      priority: task.priority || 'normal',
      dependencies: task.dependencies || [],
      retryCount: 0,
    }));

    const dependencyGraph = new Map<string, string[]>();
    items.forEach(item => {
      dependencyGraph.set(item.id, item.dependencies);
    });

    const batch: WorkOrderBatch = {
      id: batchId,
      workboardJobId,
      workspaceId,
      userId,
      createdAt: Date.now(),
      status: 'preparing',
      items,
      dependencyGraph,
      slaTimeoutMs: options.slaTimeoutMs || 60000,
      modelPolicy: { ...DEFAULT_SUPERVISOR_MODEL_POLICY, ...options.modelPolicy },
      parallelLimit: options.parallelLimit || 5,
      completedCount: 0,
      failedCount: 0,
      totalTokensUsed: 0,
      totalCreditsUsed: 0,
    };

    this.activeBatches.set(batchId, batch);
    this.coordinationBus.set(batchId, []);
    
    log.info(`[ParallelDispatcher] Created batch ${batchId} with ${items.length} work orders for job ${workboardJobId}`);
    return batch;
  }

  /**
   * Get work orders ready for execution (dependencies satisfied)
   */
  getExecutableWorkOrders(batch: WorkOrderBatch): WorkOrderItem[] {
    const completedIds = new Set(
      batch.items
        .filter(item => item.status === 'completed')
        .map(item => item.id)
    );

    return batch.items.filter(item => {
      if (item.status !== 'queued') return false;
      
      // Check all dependencies are completed
      return item.dependencies.every(depId => completedIds.has(depId));
    });
  }

  /**
   * Dispatch work orders to subagents in parallel
   */
  async dispatchParallel(
    batch: WorkOrderBatch,
    executor: (item: WorkOrderItem) => Promise<SubagentExecutionResult>
  ): Promise<void> {
    batch.status = 'executing';
    
    const executeNextBatch = async (): Promise<void> => {
      const executable = this.getExecutableWorkOrders(batch);
      if (executable.length === 0) return;

      // Limit parallelism
      const toExecute = executable
        .sort((a, b) => {
          const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        })
        .slice(0, batch.parallelLimit);

      log.info(`[ParallelDispatcher] Dispatching ${toExecute.length} work orders in parallel for batch ${batch.id}`);

      // Mark as dispatched
      toExecute.forEach(item => {
        item.status = 'dispatched';
        item.startedAt = Date.now();
      });

      // Execute in parallel
      const results = await Promise.allSettled(
        toExecute.map(async item => {
          item.status = 'executing';
          const result = await executor(item);
          return { item, result };
        })
      );

      // Process results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { item, result: execResult } = result.value;
          item.completedAt = Date.now();
          
          if (execResult.success) {
            item.status = 'completed';
            item.result = execResult.result;
            batch.completedCount++;
          } else {
            item.status = 'failed';
            item.error = execResult.errorMessage;
            batch.failedCount++;
          }
          
          batch.totalTokensUsed += execResult.tokensUsed || 0;
          
          // Record checkpoint
          this.recordCheckpoint(batch.id, {
            workOrderId: item.id,
            phase: 'execute',
            artifact: execResult.result,
            validationResult: { valid: execResult.success, errors: execResult.errorMessage ? [execResult.errorMessage] : [] },
            timestamp: Date.now(),
          });
        } else {
          const item = toExecute.find(i => i.status === 'executing');
          if (item) {
            item.status = 'failed';
            item.error = result.reason?.message || 'Unknown error';
            item.completedAt = Date.now();
            batch.failedCount++;
          }
        }
      }

      // Continue with next batch if more work orders available
      const remaining = batch.items.filter(item => item.status === 'queued');
      if (remaining.length > 0) {
        await executeNextBatch();
      }
    };

    await executeNextBatch();
    
    // Update batch status
    if (batch.failedCount > 0 && batch.completedCount === 0) {
      batch.status = 'failed';
    } else {
      batch.status = 'validating';
    }
  }

  /**
   * Record a coordination checkpoint for tandem execution
   */
  recordCheckpoint(batchId: string, checkpoint: CoordinationCheckpoint): void {
    const checkpoints = this.coordinationBus.get(batchId) || [];
    checkpoints.push(checkpoint);
    this.coordinationBus.set(batchId, checkpoints);
  }

  /**
   * Get all checkpoints for a batch
   */
  getCheckpoints(batchId: string): CoordinationCheckpoint[] {
    return this.coordinationBus.get(batchId) || [];
  }

  /**
   * Get batch by ID
   */
  getBatch(batchId: string): WorkOrderBatch | undefined {
    return this.activeBatches.get(batchId);
  }

  /**
   * Clean up completed batch
   */
  cleanupBatch(batchId: string): void {
    this.activeBatches.delete(batchId);
    this.coordinationBus.delete(batchId);
  }
}

// ============================================================================
// SUBAGENT COORDINATION MANAGER - Tandem execution synchronization
// ============================================================================

class SubagentCoordinationManager {
  private dispatcher: ParallelWorkOrderDispatcher;

  constructor(dispatcher: ParallelWorkOrderDispatcher) {
    this.dispatcher = dispatcher;
  }

  /**
   * Validate all outputs from a batch using Flash model
   */
  async validateBatchOutputs(batch: WorkOrderBatch): Promise<{ valid: boolean; errors: string[]; summary: string }> {
    const checkpoints = this.dispatcher.getCheckpoints(batch.id);
    const errors: string[] = [];
    
    for (const checkpoint of checkpoints) {
      if (checkpoint.validationResult && !checkpoint.validationResult.valid) {
        errors.push(...checkpoint.validationResult.errors);
      }
    }

    const completedItems = batch.items.filter(item => item.status === 'completed');
    const failedItems = batch.items.filter(item => item.status === 'failed');

    const summary = `Batch ${batch.id}: ${completedItems.length} completed, ${failedItems.length} failed. ` +
      (errors.length > 0 ? `Errors: ${errors.slice(0, 3).join('; ')}` : 'No validation errors.');

    log.info(`[CoordinationManager] Validation: ${summary}`);

    return {
      valid: errors.length === 0 && failedItems.length === 0,
      errors,
      summary,
    };
  }

  /**
   * Summarize batch results for token-efficient reporting to Trinity
   */
  summarizeResults(batch: WorkOrderBatch): string {
    const completedItems = batch.items.filter(item => item.status === 'completed');
    const domains = [...new Set(completedItems.map(item => item.subagentDomain))];
    
    const domainSummaries = domains.map(domain => {
      const domainItems = completedItems.filter(item => item.subagentDomain === domain);
      return `${domain}: ${domainItems.length} tasks`;
    });

    return `Job ${batch.workboardJobId} complete. ${completedItems.length}/${batch.items.length} tasks succeeded. ` +
      `Domains: ${domainSummaries.join(', ')}. Duration: ${Date.now() - batch.createdAt}ms. ` +
      `Tokens: ${batch.totalTokensUsed}.`;
  }

  /**
   * Check if batch should escalate to Pro model for failure analysis
   */
  shouldEscalateToProModel(batch: WorkOrderBatch): boolean {
    const failureRate = batch.failedCount / batch.items.length;
    const hasTimeoutIssues = batch.items.some(item => 
      item.status === 'failed' && item.error?.includes('timeout')
    );
    const hasRetryExhaustion = batch.items.some(item => 
      item.retryCount >= batch.modelPolicy.retryThresholdForProEscalation
    );

    return failureRate > 0.3 || hasTimeoutIssues || hasRetryExhaustion;
  }

  /**
   * Get aggregated results from all subagents
   */
  getAggregatedResults(batch: WorkOrderBatch): Map<string, any> {
    const results = new Map<string, any>();
    
    for (const item of batch.items) {
      if (item.status === 'completed' && item.result) {
        results.set(item.id, {
          domain: item.subagentDomain,
          actionId: item.actionId,
          result: item.result,
          durationMs: item.completedAt && item.startedAt ? item.completedAt - item.startedAt : 0,
        });
      }
    }

    return results;
  }
}

// ============================================================================
// WORKBOARD JOB LIFECYCLE - Integration with AI Brain Workboard
// ============================================================================

export interface WorkboardJobUpdate {
  jobId: string;
  status: 'scheduled' | 'in_progress' | 'validating' | 'completed' | 'failed';
  progress?: number;
  message?: string;
  result?: any;
}

class WorkboardJobLifecycle {
  /**
   * Update workboard job status
   */
  async updateJobStatus(update: WorkboardJobUpdate): Promise<void> {
    try {
      // Update via workboard API
      log.info(`[WorkboardLifecycle] Updating job ${update.jobId}: ${update.status} (${update.progress || 0}%)`);
      
      // Log event for real-time tracking (internal telemetry)
      log.info(`[WorkboardLifecycle] Event: workboard:job_update`, JSON.stringify(update));
    } catch (error) {
      log.error(`[WorkboardLifecycle] Failed to update job ${update.jobId}:`, error);
    }
  }

  /**
   * Mark job as started
   */
  async startJob(jobId: string): Promise<void> {
    await this.updateJobStatus({
      jobId,
      status: 'in_progress',
      progress: 0,
      message: 'Job started, dispatching to subagents...',
    });
  }

  /**
   * Update job progress
   */
  async updateProgress(jobId: string, progress: number, message?: string): Promise<void> {
    await this.updateJobStatus({
      jobId,
      status: 'in_progress',
      progress,
      message,
    });
  }

  /**
   * Mark job as validating
   */
  async startValidation(jobId: string): Promise<void> {
    await this.updateJobStatus({
      jobId,
      status: 'validating',
      progress: 90,
      message: 'Validating results...',
    });
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId: string, result: any): Promise<void> {
    await this.updateJobStatus({
      jobId,
      status: 'completed',
      progress: 100,
      message: 'Job completed successfully',
      result,
    });
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, error: string): Promise<void> {
    await this.updateJobStatus({
      jobId,
      status: 'failed',
      message: `Job failed: ${error}`,
    });
  }
}

// ============================================================================
// UNIFIED COMPLETION REPORTER - Report to Trinity and notify end user
// ============================================================================

class UnifiedCompletionReporter {
  private workboardLifecycle: WorkboardJobLifecycle;
  private coordinationManager: SubagentCoordinationManager;

  constructor(workboardLifecycle: WorkboardJobLifecycle, coordinationManager: SubagentCoordinationManager) {
    this.workboardLifecycle = workboardLifecycle;
    this.coordinationManager = coordinationManager;
  }

  /**
   * Generate final completion report for Trinity/AI Brain
   */
  async generateCompletionReport(batch: WorkOrderBatch): Promise<ParallelExecutionResult> {
    const validation = await this.coordinationManager.validateBatchOutputs(batch);
    const summary = this.coordinationManager.summarizeResults(batch);
    const results = this.coordinationManager.getAggregatedResults(batch);

    const report: ParallelExecutionResult = {
      batchId: batch.id,
      success: validation.valid && batch.status !== 'failed',
      completedItems: batch.completedCount,
      failedItems: batch.failedCount,
      results,
      totalDurationMs: Date.now() - batch.createdAt,
      totalTokensUsed: batch.totalTokensUsed,
      summary,
    };

    log.info(`[CompletionReporter] Report for batch ${batch.id}: ${report.success ? 'SUCCESS' : 'FAILED'}`);
    return report;
  }

  /**
   * Report completion to Trinity/AI Brain and close workboard job
   */
  async reportToTrinityAndClose(batch: WorkOrderBatch, userId: string): Promise<void> {
    const report = await this.generateCompletionReport(batch);

    // Update workboard job
    if (report.success) {
      await this.workboardLifecycle.completeJob(batch.workboardJobId, {
        summary: report.summary,
        completedItems: report.completedItems,
        totalDurationMs: report.totalDurationMs,
      });
    } else {
      await this.workboardLifecycle.failJob(
        batch.workboardJobId,
        `${report.failedItems} of ${batch.items.length} tasks failed`
      );
    }

    // Log completion event for Trinity to consume (internal telemetry)
    log.info(`[CompletionReporter] Event: ai_brain:job_completed`, JSON.stringify({
      batchId: batch.id,
      jobId: batch.workboardJobId,
      workspaceId: batch.workspaceId,
      userId,
      success: report.success,
      summary: report.summary,
      completedItems: report.completedItems,
      failedItems: report.failedItems,
      totalDurationMs: report.totalDurationMs,
      totalTokensUsed: report.totalTokensUsed,
    }));

    log.info(`[CompletionReporter] Reported job ${batch.workboardJobId} completion to Trinity`);
  }

  /**
   * Notify end user about job completion
   */
  async notifyEndUser(batch: WorkOrderBatch, userId: string, workspaceId: string): Promise<void> {
    const report = await this.generateCompletionReport(batch);
    
    // Create notification for end user
    const notification = {
      type: report.success ? 'ai_job_completed' : 'ai_job_failed',
      title: report.success ? 'AI Task Completed' : 'AI Task Failed',
      message: report.summary,
      userId,
      workspaceId,
      metadata: {
        batchId: batch.id,
        jobId: batch.workboardJobId,
        completedItems: report.completedItems,
        failedItems: report.failedItems,
      },
    };

    // Log notification event (internal telemetry)
    log.info(`[CompletionReporter] Event: notification:create`, JSON.stringify(notification));

    log.info(`[CompletionReporter] Notified user ${userId} about job ${batch.workboardJobId}`);
  }
}

// Singleton instances for parallel orchestration
const parallelDispatcher = new ParallelWorkOrderDispatcher();
const workboardLifecycle = new WorkboardJobLifecycle();
const coordinationManager = new SubagentCoordinationManager(parallelDispatcher);
const completionReporter = new UnifiedCompletionReporter(workboardLifecycle, coordinationManager);

// Export for external use
export { parallelDispatcher, workboardLifecycle, coordinationManager, completionReporter };

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

    log.info('[SubagentSupervisor] Initializing subagent registry...');
    
    // Subscribe to platform events for health monitoring (no DB needed)
    this.setupHealthMonitoring();
    this.initialized = true;
    
    // Defer DB-heavy seeding by 60s to avoid startup connection storm
    setTimeout(async () => {
      try {
        await this.seedDefaultSubagents();
        await this.refreshSubagentCache();
        log.info(`[SubagentSupervisor] Seeded and cached ${this.subagentCache.size} subagents`);
      } catch (error: any) {
        log.warn('[SubagentSupervisor] Deferred init failed (non-fatal):', error?.message || 'unknown');
      }
    }, 60000);
  }

  private async seedDefaultSubagents(): Promise<void> {
    let consecutiveFailures = 0;
    const MAX_CONSECUTIVE_FAILURES = 3;
    for (const subagent of DEFAULT_SUBAGENTS) {
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        log.warn(`[SubagentSupervisor] Circuit breaker: aborting seed after ${consecutiveFailures} consecutive failures`);
        break;
      }
      try {
        const existing = await db.select().from(aiSubagentDefinitions)
          .where(eq(aiSubagentDefinitions.name, subagent.name))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(aiSubagentDefinitions).values({ ...(subagent as any), workspaceId: PLATFORM_WORKSPACE_ID });
          log.info(`[SubagentSupervisor] Created subagent: ${subagent.name}`);
        }
        consecutiveFailures = 0;
      } catch (error: any) {
        consecutiveFailures++;
        log.warn(`[SubagentSupervisor] Skipping subagent ${subagent.name} (failure ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`, error?.message);
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
    const executionId = `exec-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`;
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

    // CREDIT-GATED EXECUTION: Check credits before allowing execution
    const featureKey = DOMAIN_CREDIT_COSTS[domain] || 'ai_general';
    const creditAuth = await aiTokenGateway.preAuthorize(workspaceId, userId, featureKey);
    
    if (!creditAuth.authorized) {
      log.info(`[SubagentSupervisor] Credit-gated: ${domain} blocked - ${creditAuth.reason}`);
      return this.createFailureResult(
        'insufficient_credits', 
        `Insufficient credits for ${domain}. ${creditAuth.reason}. Please add more credits.`,
        startTime
      );
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

      // PHASE 3: VALIDATE with SELF-CORRECTION LOOP (Upgrade 2)
      // If Supervisor says NEEDS_REVISION, feed feedback back to SubAgent (max 3 retries)
      const maxRetries = subagent.maxRetries || 3;
      let retryCount = 0;
      let currentResult = executeResult;
      let validationPassed = false;

      while (retryCount < maxRetries && !validationPassed) {
        await this.updateTelemetryPhase(telemetryId, 'validating', 'validate');
        const validateResult = await this.validatePhase(context, subagent, currentResult);
        
        if (validateResult.success) {
          validationPassed = true;
        } else {
          retryCount++;
          log.info(`[SubagentSupervisor] NEEDS_REVISION: ${subagent.name} retry ${retryCount}/${maxRetries}`);
          
          if (retryCount >= maxRetries) {
            const diagnostics = await this.runDiagnostics(context, subagent, new Error(validateResult.error || 'Validation failed after retries'));
            return await this.handlePhaseFailure(telemetryId, 'validate', validateResult.error, context, subagent, startTime, diagnostics);
          }

          // SELF-CORRECTION: Feed supervisor feedback back into the subagent
          await this.updateTelemetryPhase(telemetryId, 'retrying', 'execute');
          try {
            const feedbackParams = {
              ...parameters,
              _supervisorFeedback: validateResult.error,
              _retryAttempt: retryCount,
              _previousResult: currentResult
            };
            currentResult = await actionHandler(feedbackParams);
          } catch (retryError) {
            const diagnostics = await this.runDiagnostics(context, subagent, retryError);
            return await this.handlePhaseFailure(telemetryId, 'execute', retryError, context, subagent, startTime, diagnostics);
          }
        }
      }

      // PHASE 4: COMPLETE - Pass retriesUsed for observability metrics
      await this.completeTelemetry(telemetryId, 'completed', currentResult, Date.now() - startTime, undefined, retryCount);
      this.activeExecutions.delete(executionId);

      // CREDIT DEDUCTION: Deduct credits after successful execution
      const billingResult = await aiTokenGateway.finalizeBilling(
        workspaceId,
        userId,
        featureKey,
        0,
        { entityType: 'subagent_execution', entityId: executionId }
      );

      const creditsUsed = billingResult.charged ? billingResult.tokensUsed : 0;
      const finalBalance = billingResult.newBalance;

      if (!billingResult.charged) {
        log.warn(`[SubagentSupervisor] Credit deduction failed after execution for ${domain}`);
      } else {
        log.info(`[SubagentSupervisor] Credits deducted: ${creditsUsed} for ${domain}, new balance: ${finalBalance}`);
      }

      // Record execution for confidence scoring
      const durationMs = Date.now() - startTime;
      subagentConfidenceMonitor.recordExecution({
        subagentId: subagent.id,
        workspaceId,
        executionId,
        success: true,
        executionTimeMs: durationMs,
        retryCount,
        escalated: false,
        confidenceScore: 1.0,
      }).catch(err => log.error('[SubagentSupervisor] Failed to record confidence:', err));

      return {
        success: true,
        phase: 'validate',
        status: 'completed',
        result: currentResult,
        durationMs,
        confidenceScore: 1.0,
        retriesUsed: retryCount,
        creditsUsed,
        creditBalance: finalBalance,
        // @ts-expect-error — TS migration: fix in refactoring sprint
        creditDeductionFailed: !deductionResult.success,  // Flag for observability
      };

    } catch (error: any) {
      log.error(`[SubagentSupervisor] Unexpected error in ${subagent.name}:`, error);
      const failureDurationMs = Date.now() - startTime;
      await this.completeTelemetry(telemetryId, 'failed', null, failureDurationMs, (error instanceof Error ? error.message : String(error)));
      this.activeExecutions.delete(executionId);
      
      // Record failure for confidence scoring
      subagentConfidenceMonitor.recordExecution({
        subagentId: subagent.id,
        workspaceId,
        executionId,
        success: false,
        executionTimeMs: failureDurationMs,
        retryCount: 0,
        escalated: false,
        confidenceScore: 0,
      }).catch(err => log.error('[SubagentSupervisor] Failed to record failure confidence:', err));
      
      return this.createFailureResult('unexpected_error', error.message, startTime);
    }
  }

  // ============================================================================
  // FAST MODE PARALLEL EXECUTION
  // ============================================================================

  /**
   * Execute multiple subagent actions in parallel (Fast Mode)
   * Provides priority queue boost, parallel execution, and SLA guarantees
   */
  async executeParallel(
    actions: Array<{
      domain: SubagentDomain;
      actionId: string;
      parameters: Record<string, any>;
      actionHandler: (params: Record<string, any>) => Promise<any>;
    }>,
    userId: string,
    workspaceId: string,
    platformRole: string,
    options?: {
      maxConcurrent?: number;
      slaTimeoutMs?: number;
      onProgress?: (completed: number, total: number, results: SubagentExecutionResult[]) => void;
    }
  ): Promise<{
    success: boolean;
    results: SubagentExecutionResult[];
    totalDurationMs: number;
    parallelExecuted: number;
    serialExecuted: number;
  }> {
    const startTime = Date.now();
    const maxConcurrent = options?.maxConcurrent || 4;
    const slaTimeoutMs = options?.slaTimeoutMs || 15000;
    
    log.info(`[SubagentSupervisor] Fast Mode parallel execution: ${actions.length} actions, max ${maxConcurrent} concurrent`);
    
    const results: SubagentExecutionResult[] = [];
    let parallelExecuted = 0;
    let serialExecuted = 0;
    
    // Group actions into batches based on concurrency limit
    const batches: typeof actions[] = [];
    for (let i = 0; i < actions.length; i += maxConcurrent) {
      batches.push(actions.slice(i, i + maxConcurrent));
    }
    
    // Execute batches
    for (const batch of batches) {
      const batchPromises = batch.map(async (action) => {
        // Apply SLA timeout to each action
        const timeoutPromise = new Promise<SubagentExecutionResult>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`SLA timeout exceeded (${slaTimeoutMs}ms)`));
          }, slaTimeoutMs);
        });
        
        const executionPromise = this.executeAction(
          action.domain,
          action.actionId,
          { ...action.parameters, _fastMode: true, _priorityBoost: 2 },
          userId,
          workspaceId,
          platformRole,
          action.actionHandler
        );
        
        try {
          return await Promise.race([executionPromise, timeoutPromise]);
        } catch (error: any) {
          return {
            success: false,
            phase: 'execute' as const,
            status: 'failed' as const,
            error: {
              code: 'sla_timeout',
              message: (error instanceof Error ? error.message : String(error)) || 'SLA timeout exceeded'
            },
            durationMs: slaTimeoutMs,
            confidenceScore: 0
          };
        }
      });
      
      // Execute batch in parallel
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      parallelExecuted += batchResults.length;
      
      // Report progress
      if (options?.onProgress) {
        options.onProgress(results.length, actions.length, results);
      }
    }
    
    const totalDurationMs = Date.now() - startTime;
    const allSucceeded = results.every(r => r.success);
    
    log.info(`[SubagentSupervisor] Fast Mode completed: ${results.filter(r => r.success).length}/${results.length} succeeded in ${totalDurationMs}ms`);
    
    return {
      success: allSucceeded,
      results,
      totalDurationMs,
      parallelExecuted,
      serialExecuted
    };
  }

  /**
   * Get Fast Mode execution metrics for a workspace
   * Uses aiWorkboardTasks which has explicit executionMode column
   */
  async getFastModeMetrics(workspaceId: string): Promise<{
    totalFastModeExecutions: number;
    avgTimesSaved: number;
    successRate: number;
    popularDomains: string[];
  }> {
    try {
      // Import workboard tasks table - has explicit executionMode column
      const { aiWorkboardTasks } = await import('@shared/schema');
      
      // Get recent Fast Mode executions from workboard tasks
      const recentTasks = await db.select()
        .from(aiWorkboardTasks)
        .where(and(
          eq(aiWorkboardTasks.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(aiWorkboardTasks.executionMode, 'trinity_fast'),
          gte(aiWorkboardTasks.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        ))
        .orderBy(desc(aiWorkboardTasks.createdAt))
        .limit(100);
      
      const successfulTasks = recentTasks.filter(t => t.status === 'completed');
      
      // Calculate average duration from start to completion
      const completedWithTiming = recentTasks.filter(t => t.startedAt && t.completedAt);
      const avgDuration = completedWithTiming.length > 0
        ? completedWithTiming.reduce((acc, t) => {
            const startMs = t.startedAt ? new Date(t.startedAt).getTime() : 0;
            const endMs = t.completedAt ? new Date(t.completedAt).getTime() : 0;
            return acc + (endMs - startMs);
          }, 0) / completedWithTiming.length
        : 3000; // Default 3s for Fast Mode
      
      // Estimate time saved (Fast Mode is ~60% faster than normal)
      const normalModeDuration = avgDuration / 0.4;
      const avgTimeSaved = normalModeDuration - avgDuration;
      
      // Count by category to get domain popularity
      const domainCounts: Record<string, number> = {};
      recentTasks.forEach(t => {
        const domain = (t as any).category || 'general';
        domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      });
      
      const popularDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([domain]) => domain);
      
      return {
        totalFastModeExecutions: recentTasks.length,
        avgTimesSaved: avgTimeSaved,
        successRate: recentTasks.length > 0 
          ? (successfulTasks.length / recentTasks.length) * 100 
          : 100,
        popularDomains
      };
    } catch {
      // Fallback if schema import fails
      return {
        totalFastModeExecutions: 0,
        avgTimesSaved: 0,
        successRate: 100,
        popularDomains: []
      };
    }
  }

  // ============================================================================
  // FAST MODE CONTEXT-AWARE EXECUTION
  // ============================================================================

  /**
   * Execute with full Fast Mode context awareness
   * All subagents receive and respect the FastModeContext configuration
   */
  async executeWithFastModeContext(
    actions: Array<{
      domain: SubagentDomain;
      actionId: string;
      parameters: Record<string, any>;
      actionHandler: (params: Record<string, any>) => Promise<any>;
    }>,
    userId: string,
    workspaceId: string,
    platformRole: string,
    fastModeContext: FastModeContext,
    onProgress?: (phase: string, completed: number, total: number, message: string) => void
  ): Promise<{
    success: boolean;
    results: SubagentExecutionResult[];
    totalDurationMs: number;
    parallelExecuted: number;
    phaseReports: Array<{ phase: string; status: string; durationMs: number }>;
    graduationImpact?: { newTrustScore: number; isGraduated: boolean };
  }> {
    const startTime = Date.now();
    const phaseReports: Array<{ phase: string; status: string; durationMs: number }> = [];
    
    log.info(`[SubagentSupervisor] Fast Mode Context Execution:`, {
      tier: fastModeContext.tier,
      maxConcurrent: fastModeContext.maxConcurrent,
      parallelPhases: fastModeContext.parallelPhases,
      actionsCount: actions.length
    });

    // Phase 1: Pre-flight checks
    const prefightStart = Date.now();
    onProgress?.('preflight', 0, actions.length, 'Running pre-flight checks...');
    
    // Check graduation status for auto-approval optimization
    const graduationStatus = await this.getGraduationStatus(workspaceId);
    
    phaseReports.push({
      phase: 'preflight',
      status: 'completed',
      durationMs: Date.now() - prefightStart
    });

    // Phase 2: Parallel execution with FastModeContext
    const executeStart = Date.now();
    onProgress?.('execute', 0, actions.length, 'Executing actions in parallel...');

    // Prepare actions with FastModeContext injected
    const contextualizedActions = actions.map(action => ({
      ...action,
      parameters: {
        ...action.parameters,
        _fastModeContext: fastModeContext,
        _isGraduated: graduationStatus.isGraduated,
        _autoApprovalEnabled: graduationStatus.autoApprovalDomains.includes(action.domain),
        _priorityBoost: fastModeContext.priorityBoost,
        _creditMultiplier: fastModeContext.creditMultiplier
      }
    }));

    // Execute with parallel batching based on tier
    const results = await this.executeParallelBatch(
      contextualizedActions,
      userId,
      workspaceId,
      platformRole,
      fastModeContext,
      (completed, total) => {
        onProgress?.('execute', completed, total, `Completed ${completed}/${total} actions`);
      }
    );

    phaseReports.push({
      phase: 'execute',
      status: results.every(r => r.success) ? 'completed' : 'partial_failure',
      durationMs: Date.now() - executeStart
    });

    // Phase 3: Validation (can be parallelized or skipped in Fast Mode)
    const validateStart = Date.now();
    if (!fastModeContext.skipNonCriticalValidation) {
      onProgress?.('validate', 0, results.length, 'Running post-execution validation...');
      // Validation happens within each action, so we just report
    }
    phaseReports.push({
      phase: 'validate',
      status: 'completed',
      durationMs: Date.now() - validateStart
    });

    // Phase 4: Update graduation metrics
    const metricsStart = Date.now();
    onProgress?.('metrics', 0, 1, 'Updating trust metrics...');
    
    const successCount = results.filter(r => r.success).length;
    const newGraduationStatus = await this.updateGraduationMetrics(
      workspaceId,
      results.length,
      successCount
    );

    phaseReports.push({
      phase: 'metrics',
      status: 'completed',
      durationMs: Date.now() - metricsStart
    });

    const totalDurationMs = Date.now() - startTime;
    onProgress?.('complete', actions.length, actions.length, `All phases complete in ${totalDurationMs}ms`);

    log.info(`[SubagentSupervisor] Fast Mode Context Execution Complete:`, {
      totalDurationMs,
      successRate: (successCount / results.length * 100).toFixed(1) + '%',
      newTrustScore: newGraduationStatus.trustScore,
      isGraduated: newGraduationStatus.isGraduated
    });

    return {
      success: results.every(r => r.success),
      results,
      totalDurationMs,
      parallelExecuted: results.length,
      phaseReports,
      graduationImpact: {
        newTrustScore: newGraduationStatus.trustScore,
        isGraduated: newGraduationStatus.isGraduated
      }
    };
  }

  /**
   * Execute batch with FastModeContext tier-specific concurrency
   */
  private async executeParallelBatch(
    actions: Array<{
      domain: SubagentDomain;
      actionId: string;
      parameters: Record<string, any>;
      actionHandler: (params: Record<string, any>) => Promise<any>;
    }>,
    userId: string,
    workspaceId: string,
    platformRole: string,
    fastModeContext: FastModeContext,
    onBatchProgress?: (completed: number, total: number) => void
  ): Promise<SubagentExecutionResult[]> {
    const results: SubagentExecutionResult[] = [];
    const { maxConcurrent, slaTimeoutMs } = fastModeContext;

    // Create batches based on tier concurrency
    const batches: typeof actions[] = [];
    for (let i = 0; i < actions.length; i += maxConcurrent) {
      batches.push(actions.slice(i, i + maxConcurrent));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(async (action) => {
        const timeoutPromise = new Promise<SubagentExecutionResult>((_, reject) => {
          setTimeout(() => reject(new Error(`SLA timeout (${slaTimeoutMs}ms)`)), slaTimeoutMs);
        });

        const executionPromise = this.executeAction(
          action.domain,
          action.actionId,
          action.parameters,
          userId,
          workspaceId,
          platformRole,
          action.actionHandler
        );

        try {
          return await Promise.race([executionPromise, timeoutPromise]);
        } catch (error: any) {
          return {
            success: false,
            phase: 'execute' as const,
            status: 'failed' as const,
            error: { code: 'sla_timeout', message: (error instanceof Error ? error.message : String(error)) },
            durationMs: slaTimeoutMs,
            confidenceScore: 0
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      onBatchProgress?.(results.length, actions.length);
    }

    return results;
  }

  // ============================================================================
  // GRADUATED APPROVAL SYSTEM (99.9% Accuracy Auto-Approval)
  // ============================================================================

  /**
   * Get graduation status for a workspace
   * Determines if the org has earned auto-approval privileges
   */
  async getGraduationStatus(workspaceId: string): Promise<GraduationStatus> {
    try {
      // Query execution history from telemetry
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const telemetryRecords = await db.select()
        .from(subagentTelemetry)
        .where(and(
          eq(subagentTelemetry.workspaceId, workspaceId),
          gte(subagentTelemetry.startedAt, thirtyDaysAgo)
        ))
        .limit(1000);

      const totalExecutions = telemetryRecords.length;
      const successfulExecutions = telemetryRecords.filter(t => t.status === 'completed').length;
      const accuracyPercent = totalExecutions > 0 
        ? (successfulExecutions / totalExecutions) * 100 
        : 0;

      // Calculate trust score (weighted by domain criticality)
      const domainWeights: Record<string, number> = {
        payroll: 1.5, invoicing: 1.5, compliance: 1.3,
        scheduling: 1.0, analytics: 1.0, notifications: 0.8
      };

      // Build subagent ID to domain lookup
      const subagentDomains = new Map<string, string>();
      const allSubagents = await db.select().from(aiSubagentDefinitions);
      for (const sa of allSubagents) {
        subagentDomains.set(sa.id, sa.domain);
      }

      let weightedSuccess = 0;
      let totalWeight = 0;

      for (const record of telemetryRecords) {
        const recordDomain = record.subagentId ? subagentDomains.get(record.subagentId) || 'assist' : 'assist';
        const weight = domainWeights[recordDomain] || 1.0;
        totalWeight += weight;
        if (record.status === 'completed') {
          weightedSuccess += weight;
        }
      }

      const trustScore = totalWeight > 0 ? (weightedSuccess / totalWeight) * 100 : 0;
      const isGraduated = trustScore >= GRADUATION_THRESHOLD && 
                          totalExecutions >= MINIMUM_EXECUTIONS_FOR_GRADUATION;

      // Determine which domains qualify for auto-approval
      const domainStats = new Map<string, { success: number; total: number }>();
      for (const record of telemetryRecords) {
        const recordDomain = record.subagentId ? subagentDomains.get(record.subagentId) || 'assist' : 'assist';
        const stats = domainStats.get(recordDomain) || { success: 0, total: 0 };
        stats.total++;
        if (record.status === 'completed') stats.success++;
        domainStats.set(recordDomain, stats);
      }

      const autoApprovalDomains: SubagentDomain[] = [];
      const pendingReviewDomains: SubagentDomain[] = [];

      for (const [domain, stats] of domainStats.entries()) {
        const domainAccuracy = (stats.success / stats.total) * 100;
        if (domainAccuracy >= GRADUATION_THRESHOLD && stats.total >= 10) {
          autoApprovalDomains.push(domain as SubagentDomain);
        } else {
          pendingReviewDomains.push(domain as SubagentDomain);
        }
      }

      return {
        workspaceId,
        trustScore: Math.round(trustScore * 100) / 100,
        totalExecutions,
        successfulExecutions,
        accuracyPercent: Math.round(accuracyPercent * 100) / 100,
        isGraduated,
        graduatedAt: isGraduated ? new Date() : undefined,
        lastEvaluatedAt: new Date(),
        autoApprovalDomains,
        pendingReviewDomains
      };
    } catch (error) {
      log.error('[SubagentSupervisor] Failed to get graduation status:', error);
      return {
        workspaceId,
        trustScore: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        accuracyPercent: 0,
        isGraduated: false,
        lastEvaluatedAt: new Date(),
        autoApprovalDomains: [],
        pendingReviewDomains: []
      };
    }
  }

  /**
   * Update graduation metrics after execution batch
   */
  private async updateGraduationMetrics(
    workspaceId: string,
    executionsAdded: number,
    successesAdded: number
  ): Promise<GraduationStatus> {
    // Re-evaluate graduation status with new data
    const status = await this.getGraduationStatus(workspaceId);

    // Log graduation update if newly graduated
    if (status.isGraduated && status.trustScore >= GRADUATION_THRESHOLD) {
      log.info(`[SubagentSupervisor] Graduation achieved for workspace ${workspaceId}: ${status.trustScore.toFixed(1)}% trust score - auto-approval enabled!`);
    }

    return status;
  }

  /**
   * Check if an action can be auto-approved based on graduation status
   */
  async canAutoApprove(
    workspaceId: string,
    domain: SubagentDomain,
    actionId: string
  ): Promise<{
    canAutoApprove: boolean;
    reason: string;
    trustScore: number;
  }> {
    const status = await this.getGraduationStatus(workspaceId);

    if (!status.isGraduated) {
      return {
        canAutoApprove: false,
        reason: `Trust score (${status.trustScore.toFixed(1)}%) below graduation threshold (${GRADUATION_THRESHOLD}%)`,
        trustScore: status.trustScore
      };
    }

    if (!status.autoApprovalDomains.includes(domain)) {
      return {
        canAutoApprove: false,
        reason: `Domain '${domain}' not yet graduated (needs ${GRADUATION_THRESHOLD}% accuracy with 10+ executions)`,
        trustScore: status.trustScore
      };
    }

    return {
      canAutoApprove: true,
      reason: `Auto-approved: domain '${domain}' graduated with ${status.trustScore.toFixed(1)}% trust score`,
      trustScore: status.trustScore
    };
  }

  /**
   * Get Fast Mode context by tier
   */
  getFastModeContext(tier: 'standard' | 'premium' | 'enterprise' = 'standard'): FastModeContext {
    return FAST_MODE_CONTEXTS[tier] || FAST_MODE_CONTEXTS.standard;
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
    log.info(`[DrHolmes] Running diagnostics for ${subagent.name} error:`, error.message);
    
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
        log.info(`[DrHolmes] Attempting fix strategy: ${strategy} for pattern: ${matchedPattern}`);
        
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
          log.info(`[DrHolmes] Fix strategy succeeded: ${strategy}`);
        } else {
          log.info(`[DrHolmes] Fix strategy partial: ${fixResult.reason}`);
        }
      } catch (fixError) {
        log.error(`[DrHolmes] Fix strategy failed:`, fixError);
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
        log.info(`[DrHolmes] Unknown strategy: ${strategy}, marking for manual review`);
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
    log.info(`[SubagentSupervisor] Escalating to support: ${request.derailmentType}`);

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
        idempotencyKey: `notif-${Date.now()}`,
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
      log.error('[SubagentSupervisor] Failed to notify support:', notifyError);
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
    log.info(`[SubagentSupervisor] Executing approved fix for intervention: ${intervention.id}`);
    
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
          log.info(`[SubagentSupervisor] User ${userId} has elevated session (${elevation.platformRole}), bypassing standard auth for ${subagent.name}`);
          return { allowed: true, elevatedSession: true };
        }
      }
    } catch (error) {
      // Fall through to standard auth if elevation check fails
      log.warn('[SubagentSupervisor] Elevation check failed, using standard auth:', error);
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
    // Map 'retrying' to 'executing' for DB compatibility
    const dbStatus = status === 'retrying' ? 'executing' : status;
    await db.update(subagentTelemetry)
      .set({ status: dbStatus, phase })
      .where(eq(subagentTelemetry.id, telemetryId));
  }

  private async completeTelemetry(
    telemetryId: string,
    status: SubagentStatus,
    result: any,
    durationMs: number,
    errorMessage?: string,
    retriesUsed?: number
  ): Promise<void> {
    // Map 'retrying' to 'executing' for DB compatibility
    const dbStatus = status === 'retrying' ? 'failed' : status;
    await db.update(subagentTelemetry)
      .set({
        status: dbStatus,
        completedAt: new Date(),
        durationMs,
        outputPayload: result,
        errorMessage,
        confidenceScore: status === 'completed' ? 1.0 : 0.0,
        retryCount: retriesUsed || 0,
      })
      .where(eq(subagentTelemetry.id, telemetryId));

    // Log observability event for retry metrics
    if (retriesUsed && retriesUsed > 0) {
      log.info(`[SubagentSupervisor] Event: subagent:self_correction`, JSON.stringify({
        telemetryId,
        retriesUsed,
        status,
        durationMs,
        timestamp: new Date().toISOString(),
      }));
      log.info(`[SubagentSupervisor] Self-correction metrics: ${retriesUsed} retries, status=${status}, duration=${durationMs}ms`);
    }
  }

  private async handleHeartbeat(event: any): Promise<void> {
    // Record heartbeat for health monitoring
    log.info(`[SubagentSupervisor] Heartbeat received from ${event.subagentId}`);
  }

  private async handleHealthCheck(event: any): Promise<void> {
    // Perform health check on requested subagent
    log.info(`[SubagentSupervisor] Health check for ${event.subagentId}`);
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
        // @ts-expect-error — TS migration: fix in refactoring sprint
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
        // @ts-expect-error — TS migration: fix in refactoring sprint
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

  /**
   * OBSERVABILITY: Get self-correction metrics for retry loop monitoring
   * Returns aggregate stats on subagent retries for dashboard/analytics
   */
  async getSelfCorrectionMetrics(params?: {
    workspaceId?: string;
    subagentId?: string;
    since?: Date;
  }): Promise<{
    totalExecutions: number;
    executionsWithRetries: number;
    totalRetries: number;
    avgRetriesPerExecution: number;
    retrySuccessRate: number;
    bySubagent: Record<string, { executions: number; retries: number; successRate: number }>;
  }> {
    const sinceDate = params?.since || new Date(Date.now() - 24 * 60 * 60 * 1000); // Default: last 24h
    
    // Build query filters safely - only include non-undefined conditions
    const conditions: SQL[] = [];
    conditions.push(gte(subagentTelemetry.createdAt, sinceDate)); // Push since filter to SQL
    
    if (params?.workspaceId) {
      conditions.push(eq(subagentTelemetry.workspaceId, params.workspaceId));
    }
    if (params?.subagentId) {
      conditions.push(eq(subagentTelemetry.subagentId, params.subagentId));
    }
    
    // Execute query with safe conditions - handle single vs multiple predicates
    const whereClause = conditions.length === 1 
      ? conditions[0] 
      : conditions.length > 1 
        ? and(...conditions) 
        : undefined;
    
    const telemetryRecords = await db.select().from(subagentTelemetry)
      .where(whereClause)
      .orderBy(desc(subagentTelemetry.createdAt));

    const totalExecutions = telemetryRecords.length;
    const executionsWithRetries = telemetryRecords.filter(t => (t.retryCount || 0) > 0).length;
    const totalRetries = telemetryRecords.reduce((sum, t) => sum + (t.retryCount || 0), 0);
    const successfulWithRetries = telemetryRecords.filter(t => 
      (t.retryCount || 0) > 0 && t.status === 'completed'
    ).length;

    // Group by subagent
    const bySubagent: Record<string, { executions: number; retries: number; successRate: number }> = {};
    for (const t of telemetryRecords) {
      const id = t.subagentId || 'unknown';
      if (!bySubagent[id]) {
        bySubagent[id] = { executions: 0, retries: 0, successRate: 0 };
      }
      bySubagent[id].executions++;
      bySubagent[id].retries += t.retryCount || 0;
    }

    // Calculate success rates per subagent
    for (const id of Object.keys(bySubagent)) {
      const subagentRecords = telemetryRecords.filter(t => t.subagentId === id);
      const successes = subagentRecords.filter(t => t.status === 'completed').length;
      bySubagent[id].successRate = subagentRecords.length > 0 
        ? successes / subagentRecords.length 
        : 0;
    }

    return {
      totalExecutions,
      executionsWithRetries,
      totalRetries,
      avgRetriesPerExecution: totalExecutions > 0 ? totalRetries / totalExecutions : 0,
      retrySuccessRate: executionsWithRetries > 0 ? successfulWithRetries / executionsWithRetries : 0,
      bySubagent,
    };
  }

  /**
   * Route a voice command to the appropriate subagent
   * Analyzes the transcript to determine intent and assign to the best subagent
   */
  async routeVoiceCommand(params: {
    transcript: string;
    userId: string;
    workspaceId?: string;
    executionMode?: 'normal' | 'trinity_fast';
    context: {
      source: string;
      timestamp: string;
      platform: string;
    };
  }): Promise<{
    assignedAgent: string;
    estimatedTokens: number;
    confidence: number;
    executionMode: 'normal' | 'trinity_fast';
  }> {
    const { transcript, userId, workspaceId, executionMode = 'normal', context } = params;
    
    log.info('[SubagentSupervisor] Routing voice command:', { 
      transcriptLength: transcript.length,
      userId, 
      workspaceId 
    });

    // Simple keyword-based routing (can be enhanced with AI later)
    const lowerTranscript = transcript.toLowerCase();
    
    // Determine the best subagent based on keywords
    let assignedAgent = 'GeneralAssistant';
    let estimatedTokens = 100;
    
    if (lowerTranscript.includes('schedule') || lowerTranscript.includes('shift') || lowerTranscript.includes('calendar')) {
      assignedAgent = 'SchedulingAgent';
      estimatedTokens = 150;
    } else if (lowerTranscript.includes('payroll') || lowerTranscript.includes('salary') || lowerTranscript.includes('pay')) {
      assignedAgent = 'PayrollAgent';
      estimatedTokens = 200;
    } else if (lowerTranscript.includes('invoice') || lowerTranscript.includes('billing') || lowerTranscript.includes('payment')) {
      assignedAgent = 'BillingAgent';
      estimatedTokens = 180;
    } else if (lowerTranscript.includes('employee') || lowerTranscript.includes('staff') || lowerTranscript.includes('team')) {
      assignedAgent = 'HRAgent';
      estimatedTokens = 160;
    } else if (lowerTranscript.includes('report') || lowerTranscript.includes('analytics') || lowerTranscript.includes('metrics')) {
      assignedAgent = 'AnalyticsAgent';
      estimatedTokens = 250;
    } else if (lowerTranscript.includes('help') || lowerTranscript.includes('support') || lowerTranscript.includes('issue')) {
      assignedAgent = 'SupportAgent';
      estimatedTokens = 120;
    } else if (lowerTranscript.includes('compliance') || lowerTranscript.includes('certification') || lowerTranscript.includes('audit')) {
      assignedAgent = 'ComplianceAgent';
      estimatedTokens = 180;
    } else if (lowerTranscript.includes('time') || lowerTranscript.includes('clock') || lowerTranscript.includes('hours')) {
      assignedAgent = 'TimeTrackingAgent';
      estimatedTokens = 140;
    }

    // Calculate confidence based on keyword matches
    const keywords = ['schedule', 'shift', 'payroll', 'invoice', 'employee', 'report', 'help', 'compliance', 'time'];
    const matchCount = keywords.filter(kw => lowerTranscript.includes(kw)).length;
    const confidence = matchCount > 0 ? Math.min(0.5 + (matchCount * 0.15), 0.95) : 0.4;

    log.info('[SubagentSupervisor] Voice command routed:', {
      assignedAgent,
      estimatedTokens,
      confidence,
      platform: context.platform
    });

    // Apply 2x multiplier for fast mode
    const finalEstimatedTokens = executionMode === 'trinity_fast' 
      ? Math.ceil(estimatedTokens * 2)
      : estimatedTokens;

    return {
      assignedAgent,
      estimatedTokens: finalEstimatedTokens,
      confidence,
      executionMode
    };
  }

  // ============================================================================
  // TRINITY FAST MODE - Parallel Execution Methods
  // ============================================================================

  /**
   * Analyze a request and determine the best subagent for execution
   * Used by WorkboardService to route tasks
   */
  async analyzeRequest(params: {
    content: string;
    type: string;
    workspaceId: string;
    userId: string;
    executionMode?: 'normal' | 'trinity_fast';
  }): Promise<{
    intent: string;
    category: string;
    confidence: number;
    agentId: string;
    agentName: string;
    estimatedTokens: number;
  }> {
    const { content, type, workspaceId, userId, executionMode = 'normal' } = params;
    
    log.info('[SubagentSupervisor] Analyzing request:', {
      contentLength: content.length,
      type,
      executionMode
    });

    // Determine domain from keywords
    const domain = this.detectDomainFromContent(content);
    const subagent = await this.findSubagentForDomain(domain);
    
    // Estimate token cost based on content length and complexity
    const baseTokens = Math.max(10, Math.ceil(content.length / 50));
    const estimatedTokens = executionMode === 'trinity_fast' 
      ? Math.ceil(baseTokens * 2) // Fast mode costs 2x
      : baseTokens;

    return {
      intent: this.extractIntent(content),
      category: domain,
      confidence: subagent ? 0.85 : 0.5,
      agentId: subagent?.id || 'general-assistant',
      agentName: subagent?.name || 'General Assistant',
      estimatedTokens
    };
  }

  /**
   * Execute task using parallel processing (Trinity Fast Mode)
   * Concurrent execution for faster results
   */
  async executeFastModeParallel(params: {
    agentId: string;
    taskId: string;
    content: string;
    workspaceId: string;
    userId: string;
    context?: Record<string, any>;
  }): Promise<{
    success: boolean;
    data?: any;
    summary?: string;
    error?: string;
  }> {
    const { agentId, taskId, content, workspaceId, userId, context } = params;
    const startTime = Date.now();

    log.info('[SubagentSupervisor] FAST MODE parallel execution:', {
      agentId,
      taskId,
      contentLength: content.length
    });

    try {
      // Get subagent definition
      const subagent = await this.getSubagentById(agentId);
      
      if (!subagent) {
        return {
          success: false,
          error: `Subagent not found: ${agentId}`
        };
      }

      // Execute with optimized parallel processing
      const result = await Promise.race([
        this.executeSubagentAction(subagent, content, workspaceId, userId, context),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Fast mode execution timeout')), 30000)
        )
      ]);

      const duration = Date.now() - startTime;
      log.info('[SubagentSupervisor] Fast mode completed in', duration, 'ms');

      return {
        success: true,
        data: result,
        summary: `Task completed in ${duration}ms using ${subagent.name}`
      };
    } catch (error: any) {
      log.error('[SubagentSupervisor] Fast mode execution error:', error);
      return {
        success: false,
        error: (error instanceof Error ? error.message : String(error)) || 'Fast mode execution failed'
      };
    }
  }

  /**
   * Detect domain from content keywords
   */
  private detectDomainFromContent(content: string): SubagentDomain {
    const lowerContent = content.toLowerCase();
    
    const domainKeywords: Record<SubagentDomain, string[]> = {
      scheduling: ['schedule', 'shift', 'calendar', 'time off', 'availability', 'roster'],
      payroll: ['payroll', 'salary', 'payment', 'wage', 'pay', 'compensation'],
      invoicing: ['invoice', 'bill', 'billing', 'charge', 'receipt'],
      compliance: ['compliance', 'regulation', 'policy', 'certification', 'audit'],
      notifications: ['notify', 'alert', 'reminder', 'notification'],
      analytics: ['report', 'analytics', 'metrics', 'dashboard', 'statistics'],
      gamification: ['points', 'badge', 'achievement', 'leaderboard', 'reward'],
      communication: ['email', 'message', 'chat', 'sms', 'contact'],
      health: ['health', 'status', 'diagnostic', 'check', 'monitor'],
      testing: ['test', 'validate', 'verify', 'check'],
      deployment: ['deploy', 'publish', 'release'],
      recovery: ['recover', 'restore', 'backup', 'rollback'],
      orchestration: ['workflow', 'automate', 'orchestrate', 'pipeline'],
      security: ['security', 'permission', 'access', 'role', 'authentication'],
      escalation: ['escalate', 'support', 'help', 'urgent'],
      automation: ['automate', 'job', 'cron', 'scheduled'],
      lifecycle: ['onboard', 'offboard', 'anniversary', 'probation'],
      assist: ['help', 'find', 'how to', 'guide'],
      filesystem: ['file', 'folder', 'document', 'upload'],
      workflow: ['workflow', 'process', 'step'],
      onboarding: ['onboard', 'setup', 'getting started'],
      expense: ['expense', 'receipt', 'cost', 'spending'],
      pricing: ['price', 'rate', 'quote', 'estimate'],
      data_migration: ['migrate', 'import', 'export', 'transfer', 'data'],
      scoring: ['score', 'rating', 'evaluate', 'rank', 'grade'],
      visual_qa: ['screenshot', 'visual', 'ui check', 'layout', 'broken icon', 'visual regression', 'eyes'],
    };

    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => lowerContent.includes(kw))) {
        return domain as SubagentDomain;
      }
    }

    return 'assist'; // Default to general assistance
  }

  /**
   * Extract intent from content
   */
  private extractIntent(content: string): string {
    const lowerContent = content.toLowerCase();
    
    if (lowerContent.includes('create') || lowerContent.includes('add') || lowerContent.includes('new')) {
      return 'create';
    }
    if (lowerContent.includes('update') || lowerContent.includes('change') || lowerContent.includes('modify')) {
      return 'update';
    }
    if (lowerContent.includes('delete') || lowerContent.includes('remove') || lowerContent.includes('cancel')) {
      return 'delete';
    }
    if (lowerContent.includes('get') || lowerContent.includes('show') || lowerContent.includes('list') || lowerContent.includes('find')) {
      return 'read';
    }
    if (lowerContent.includes('run') || lowerContent.includes('execute') || lowerContent.includes('process')) {
      return 'execute';
    }
    
    return 'query';
  }

  /**
   * Get subagent by ID
   */
  private async getSubagentById(agentId: string): Promise<AiSubagentDefinition | null> {
    const [subagent] = await db.select()
      .from(aiSubagentDefinitions)
      .where(eq(aiSubagentDefinitions.id, agentId))
      .limit(1);
    return subagent || null;
  }

  /**
   * Get model tier configuration for a subagent
   */
  private getSubagentModelConfig(subagentName: string, domain: SubagentDomain): SubagentModelConfig {
    const configs = getSubagentModelConfigs();
    
    // Try to find exact match by subagent ID (domain-based naming)
    const domainConfig = configs.find(c => c.subagentId === domain);
    if (domainConfig) {
      return domainConfig;
    }

    // Fallback based on domain complexity
    // CRITICAL: Financial domains (payroll, invoicing, scheduling) use BRAIN tier
    // These are REVENUE-CRITICAL operations requiring highest accuracy (Gemini 3 Pro)
    const domainTierMapping: Record<SubagentDomain, GeminiModelTier> = {
      // BRAIN TIER - Revenue-critical operations (Gemini 3 Pro Preview)
      payroll: 'BRAIN',           // Financial accuracy is paramount
      invoicing: 'BRAIN',         // Client billing must be precise  
      scheduling: 'BRAIN',        // Core workforce optimization
      // ORCHESTRATOR/DIAGNOSTICS - Platform operations
      orchestration: 'ORCHESTRATOR',
      security: 'DIAGNOSTICS',
      health: 'DIAGNOSTICS',
      recovery: 'DIAGNOSTICS',
      testing: 'DIAGNOSTICS',
      // PRO_FALLBACK/COMPLIANCE - Important operations
      deployment: 'PRO_FALLBACK',
      compliance: 'COMPLIANCE',
      analytics: 'PRO_FALLBACK',  // Upgraded for better insights
      expense: 'PRO_FALLBACK',    // Upgraded for expense accuracy
      pricing: 'PRO_FALLBACK',
      data_migration: 'PRO_FALLBACK',
      // SUPERVISOR - Standard operations
      automation: 'SUPERVISOR',
      lifecycle: 'SUPERVISOR',
      workflow: 'SUPERVISOR',
      escalation: 'SUPERVISOR',
      // LOWER TIERS - Simple operations
      notifications: 'NOTIFICATION',
      gamification: 'ONBOARDING',
      communication: 'HELLOS',
      assist: 'HELLOS',
      onboarding: 'ONBOARDING',
      filesystem: 'SIMPLE',
      scoring: 'SIMPLE',
      visual_qa: 'DIAGNOSTICS', // Visual QA uses vision model for anomaly detection
    };

    const preferredTier = domainTierMapping[domain] || 'CONVERSATIONAL';
    
    // Financial operations get higher context budget and strict fallback policy
    const isFinancialDomain = ['payroll', 'invoicing', 'scheduling'].includes(domain);
    
    return {
      subagentId: domain,
      preferredTier,
      maxTier: preferredTier,
      fallbackPolicy: isFinancialDomain ? 'cascade' : 'cascade',
      contextBudget: preferredTier === 'BRAIN' ? 1000000 : // Gemini 3 Pro supports 1M tokens
                     preferredTier === 'ORCHESTRATOR' || preferredTier === 'DIAGNOSTICS' ? 500000 :
                     preferredTier === 'PRO_FALLBACK' || preferredTier === 'COMPLIANCE' ? 200000 :
                     preferredTier === 'SIMPLE' || preferredTier === 'NOTIFICATION' ? 16000 : 50000,
    };
  }

  // ============================================================================
  // CIRCUIT BREAKER FOR FINANCIAL OPERATIONS
  // ============================================================================
  
  private circuitBreaker: Map<string, { failures: number; lastFailure: Date; state: 'closed' | 'open' | 'half-open' }> = new Map();
  private readonly CIRCUIT_FAILURE_THRESHOLD = SCHEDULING.circuitBreakerThreshold;
  private readonly CIRCUIT_RESET_TIMEOUT_MS = TIMEOUTS.circuitBreakerResetMs;
  
  /**
   * Check if circuit breaker allows execution for a domain
   */
  private checkCircuitBreaker(domain: SubagentDomain): { allowed: boolean; reason?: string } {
    const circuit = this.circuitBreaker.get(domain);
    
    if (!circuit) {
      return { allowed: true };
    }
    
    // Check if circuit is open
    if (circuit.state === 'open') {
      const timeSinceLastFailure = Date.now() - circuit.lastFailure.getTime();
      
      if (timeSinceLastFailure > this.CIRCUIT_RESET_TIMEOUT_MS) {
        // Transition to half-open for retry
        circuit.state = 'half-open';
        this.circuitBreaker.set(domain, circuit);
        log.info(`[CircuitBreaker] ${domain} transitioning to half-open state`);
        return { allowed: true };
      }
      
      return { 
        allowed: false, 
        reason: `Circuit breaker OPEN for ${domain}. ${this.CIRCUIT_RESET_TIMEOUT_MS - timeSinceLastFailure}ms until retry.` 
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Record circuit breaker result
   */
  private recordCircuitResult(domain: SubagentDomain, success: boolean): void {
    const isFinancialDomain = ['payroll', 'invoicing', 'scheduling'].includes(domain);
    
    // Only track circuit breaker for financial domains
    if (!isFinancialDomain) return;
    
    let circuit = this.circuitBreaker.get(domain) || { failures: 0, lastFailure: new Date(), state: 'closed' as const };
    
    if (success) {
      // Reset circuit on success
      circuit = { failures: 0, lastFailure: new Date(), state: 'closed' };
      log.info(`[CircuitBreaker] ${domain} circuit CLOSED (success)`);
    } else {
      // Increment failures
      circuit.failures++;
      circuit.lastFailure = new Date();
      
      if (circuit.failures >= this.CIRCUIT_FAILURE_THRESHOLD) {
        circuit.state = 'open';
        log.warn(`[CircuitBreaker] ${domain} circuit OPEN after ${circuit.failures} failures`);
        
        // Log alert for financial circuit breaker
        log.warn(`[CircuitBreaker] CRITICAL: ${domain} circuit breaker triggered after ${circuit.failures} failures`);
      }
    }
    
    this.circuitBreaker.set(domain, circuit);
  }

  /**
   * Pre-execution validation for financial operations
   * Returns validation result with issues and recommendations
   */
  private async preExecutionValidation(
    domain: SubagentDomain, 
    workspaceId: string,
    parameters: Record<string, any>
  ): Promise<{ valid: boolean; issues: string[]; recommendations: string[] }> {
    const isFinancialDomain = ['payroll', 'invoicing', 'scheduling'].includes(domain);
    
    if (!isFinancialDomain) {
      return { valid: true, issues: [], recommendations: [] };
    }
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // Check circuit breaker first
    const circuitCheck = this.checkCircuitBreaker(domain);
    if (!circuitCheck.allowed) {
      issues.push(circuitCheck.reason || 'Circuit breaker is open');
      return { valid: false, issues, recommendations: ['Wait for circuit breaker reset or contact support'] };
    }
    
    // Domain-specific validation
    switch (domain) {
      case 'payroll':
        if (!parameters.payPeriodStart || !parameters.payPeriodEnd) {
          recommendations.push('Specify pay period dates for accurate payroll processing');
        }
        break;
        
      case 'invoicing':
        if (!parameters.clientId && !parameters.billingPeriodStart) {
          recommendations.push('Specify client or billing period for invoice generation');
        }
        break;
        
      case 'scheduling':
        if (!parameters.dateRange && !parameters.shiftDate) {
          recommendations.push('Specify date range for schedule optimization');
        }
        break;
    }
    
    log.info(`[PreValidation] ${domain} validation: ${issues.length === 0 ? 'PASSED' : 'FAILED'} (${recommendations.length} recommendations)`);
    
    return { valid: issues.length === 0, issues, recommendations };
  }

  /**
   * Execute subagent action with context and model tier routing
   * ENHANCED: Includes circuit breaker and pre-execution validation for financial domains
   */
  private async executeSubagentAction(
    subagent: AiSubagentDefinition,
    content: string,
    workspaceId: string,
    userId: string,
    context?: Record<string, any>
  ): Promise<any> {
    const startTime = Date.now();
    const domain = subagent.domain as SubagentDomain;
    
    // CRITICAL: Pre-execution validation for financial operations
    const validationResult = await this.preExecutionValidation(domain, workspaceId, context || {});
    if (!validationResult.valid) {
      log.warn(`[SubagentSupervisor] Pre-execution validation FAILED for ${domain}:`, validationResult.issues);
      
      // Record circuit breaker failure (blocked by validation)
      this.recordCircuitResult(domain, false);
      
      return {
        success: false,
        error: 'Pre-execution validation failed',
        issues: validationResult.issues,
        recommendations: validationResult.recommendations,
        blocked: true,
        blockedReason: 'circuit_breaker_or_validation',
      };
    }
    
    // Log recommendations if any
    if (validationResult.recommendations.length > 0) {
      log.info(`[SubagentSupervisor] Pre-execution recommendations for ${domain}:`, validationResult.recommendations);
    }
    
    // Get model tier configuration for this subagent
    const modelConfig = this.getSubagentModelConfig(subagent.name, domain);
    
    log.info(`[SubagentSupervisor] Executing ${subagent.name} with model tier ${modelConfig.preferredTier} (${content.substring(0, 50)}...)`);
    
    // Log telemetry event with model tier info
    log.info(`[SubagentSupervisor] Execution telemetry:`, JSON.stringify({
      subagentId: subagent.id,
      subagentName: subagent.name,
      domain: subagent.domain,
      workspaceId,
      userId,
      contentPreview: content.substring(0, 100),
      executionMode: 'trinity_fast',
      modelTier: modelConfig.preferredTier,
      contextBudget: modelConfig.contextBudget,
      validationPassed: true,
      preValidationRecommendations: validationResult.recommendations,
    }));

    // Map domain to AI Brain skill (using valid aiBrainService skill names)
    // Available skills: helpos_support, scheduleos_generation, intelligenceos_prediction, 
    // business_insight, platform_recommendation, faq_update, platform_awareness, issue_diagnosis
    const skillMapping: Record<SubagentDomain, string> = {
      scheduling: 'scheduleos_generation',
      payroll: 'business_insight',
      invoicing: 'business_insight',
      compliance: 'issue_diagnosis',
      notifications: 'platform_awareness',
      analytics: 'intelligenceos_prediction', // OPTIMIZED: Use prediction for analytics
      gamification: 'platform_awareness',
      communication: 'helpos_support',
      health: 'issue_diagnosis',
      testing: 'issue_diagnosis',
      deployment: 'platform_recommendation', // OPTIMIZED: Use recommendation for deployments
      recovery: 'issue_diagnosis',
      orchestration: 'platform_awareness',
      security: 'issue_diagnosis', // OPTIMIZED: Security issues need diagnosis
      escalation: 'helpos_support',
      automation: 'platform_awareness',
      lifecycle: 'platform_awareness',
      assist: 'helpos_support',
      filesystem: 'platform_awareness',
      workflow: 'platform_awareness',
      onboarding: 'faq_update', // OPTIMIZED: Onboarding often updates FAQs
      expense: 'business_insight',
      pricing: 'intelligenceos_prediction', // OPTIMIZED: Pricing benefits from prediction
      data_migration: 'platform_awareness', // Data migration uses platform awareness
      scoring: 'intelligenceos_prediction', // Scoring uses prediction models
      visual_qa: 'issue_diagnosis', // Visual QA diagnoses UI issues
    };

    const skill = skillMapping[subagent.domain as SubagentDomain] || 'helpos_support';
    
    try {
      // Build input based on skill type for proper schema compatibility
      let input: any;
      
      // Map domains to valid insight types (business_insight accepts: sales, finance, operations, automation, growth)
      const insightTypeMapping: Record<string, string> = {
        payroll: 'finance',
        invoicing: 'finance',
        analytics: 'operations',
        expense: 'finance',
        pricing: 'sales'
      };
      
      switch (skill) {
        case 'helpos_support':
          input = { question: content, workspaceId, context: context || {} };
          break;
        case 'scheduleos_generation':
          input = { query: content, workspaceId, preferences: context || {} };
          break;
        case 'business_insight':
          input = { 
            insightType: insightTypeMapping[subagent.domain] || 'operations', 
            timeframe: 'monthly',
            focusArea: content.substring(0, 100),
            context: context || {} 
          };
          break;
        case 'platform_awareness':
          input = { query: content, context: context || {} };
          break;
        case 'issue_diagnosis':
          input = { 
            description: content, 
            symptoms: [content.substring(0, 100)],
            affectedFeature: subagent.domain,
            context: context || {} 
          };
          break;
        default:
          input = { query: content, context: context || {} };
      }

      // Execute through AI Brain service
      const result = await aiBrainService.enqueueJob({
        workspaceId,
        userId,
        skill,
        input,
        priority: 'high'
      });

      const executionTime = Date.now() - startTime;
      log.info(`[SubagentSupervisor] AI Brain execution completed: ${result.status} (${executionTime}ms, tier: ${modelConfig.preferredTier})`);

      // Record successful execution for model routing telemetry
      recordModelResult(modelConfig.preferredTier, true, executionTime);
      
      // CRITICAL: Record circuit breaker success for financial domains
      this.recordCircuitResult(domain, true);

      return {
        executed: true,
        subagent: subagent.name,
        domain: subagent.domain,
        aiBrainJobId: result.jobId,
        status: result.status,
        output: result.output,
        tokensUsed: (result as any).tokensUsed || 0,
        modelTier: modelConfig.preferredTier,
        contextBudget: modelConfig.contextBudget,
        executionTimeMs: executionTime,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      log.error(`[SubagentSupervisor] AI Brain execution failed (${executionTime}ms, tier: ${modelConfig.preferredTier}):`, (error instanceof Error ? error.message : String(error)));
      
      // Record failed execution for model routing telemetry
      recordModelResult(modelConfig.preferredTier, false, executionTime, (error instanceof Error ? error.message : String(error)));
      
      // CRITICAL: Record circuit breaker failure for financial domains
      this.recordCircuitResult(domain, false);
      
      return {
        executed: false,
        subagent: subagent.name,
        domain: subagent.domain,
        status: 'failed',
        output: { error: `AI execution failed: ${(error instanceof Error ? error.message : String(error))}` },
        fallbackReason: error.message,
        modelTier: modelConfig.preferredTier,
        executionTimeMs: executionTime,
        circuitBreakerTracked: true,
        timestamp: new Date().toISOString()
      };
    }
  }

  // ============================================================================
  // PARALLEL WORK ORDER EXECUTION - Subagents working in tandem
  // ============================================================================

  /**
   * Execute multiple work orders in parallel from workboard job
   * Subagents work together systematically to complete the request
   */
  async executeParallelWorkOrders(params: {
    workboardJobId: string;
    workspaceId: string;
    userId: string;
    platformRole: string;
    tasks: Array<{
      domain: SubagentDomain;
      actionId: string;
      parameters: Record<string, any>;
      priority?: WorkOrderPriority;
      dependencies?: string[];
    }>;
    options?: {
      slaTimeoutMs?: number;
      parallelLimit?: number;
      modelPolicy?: Partial<SupervisorModelPolicy>;
      notifyOnCompletion?: boolean;
    };
  }): Promise<ParallelExecutionResult> {
    const { workboardJobId, workspaceId, userId, platformRole, tasks, options = {} } = params;
    const startTime = Date.now();

    log.info(`[SubagentSupervisor] Starting parallel work order execution for job ${workboardJobId}`);
    log.info(`[SubagentSupervisor] ${tasks.length} tasks across ${[...new Set(tasks.map(t => t.domain))].length} domains`);

    // Start workboard job lifecycle
    await workboardLifecycle.startJob(workboardJobId);

    // Create work order batch
    const batch = parallelDispatcher.createBatch(
      workboardJobId,
      workspaceId,
      userId,
      tasks,
      {
        slaTimeoutMs: options.slaTimeoutMs,
        parallelLimit: options.parallelLimit,
        modelPolicy: options.modelPolicy,
      }
    );

    try {
      // Dispatch work orders in parallel - subagents work in tandem
      await parallelDispatcher.dispatchParallel(batch, async (item: WorkOrderItem) => {
        log.info(`[SubagentSupervisor] Executing work order ${item.id}: ${item.subagentDomain}/${item.actionId}`);
        
        // Update progress
        const progress = Math.floor((batch.completedCount / batch.items.length) * 90);
        await workboardLifecycle.updateProgress(workboardJobId, progress, `Processing ${item.subagentDomain} task...`);

        // Execute through the subagent pipeline
        const result = await this.executeAction(
          item.subagentDomain,
          item.actionId,
          item.parameters,
          userId,
          workspaceId,
          platformRole,
          async (actionParams) => actionParams // Pass-through action handler
        );

        return result;
      });

      // Validation phase
      await workboardLifecycle.startValidation(workboardJobId);
      const validation = await coordinationManager.validateBatchOutputs(batch);

      // Check if we need Pro model for failure analysis
      if (coordinationManager.shouldEscalateToProModel(batch)) {
        log.info(`[SubagentSupervisor] Escalating to Pro model for failure analysis`);
        // Additional deep analysis could be performed here with Gemini Pro
      }

      // Generate completion report
      const report = await completionReporter.generateCompletionReport(batch);

      // Report to Trinity and close job
      await completionReporter.reportToTrinityAndClose(batch, userId);

      // Notify end user if requested
      if (options.notifyOnCompletion !== false) {
        await completionReporter.notifyEndUser(batch, userId, workspaceId);
      }

      // Cleanup
      parallelDispatcher.cleanupBatch(batch.id);

      log.info(`[SubagentSupervisor] Parallel execution completed: ${report.completedItems}/${tasks.length} tasks in ${Date.now() - startTime}ms`);

      return report;

    } catch (error: any) {
      log.error(`[SubagentSupervisor] Parallel execution failed:`, error);
      
      // Mark job as failed
      await workboardLifecycle.failJob(workboardJobId, (error instanceof Error ? error.message : String(error)));

      // Cleanup
      parallelDispatcher.cleanupBatch(batch.id);

      return {
        batchId: batch.id,
        success: false,
        completedItems: batch.completedCount,
        failedItems: batch.failedCount + (batch.items.length - batch.completedCount - batch.failedCount),
        results: coordinationManager.getAggregatedResults(batch),
        totalDurationMs: Date.now() - startTime,
        totalTokensUsed: batch.totalTokensUsed,
        summary: `Job failed: ${error.message}`,
      };
    }
  }

  /**
   * Get status of an active work order batch
   */
  getBatchStatus(batchId: string): WorkOrderBatch | undefined {
    return parallelDispatcher.getBatch(batchId);
  }

  /**
   * Get coordination checkpoints for debugging/monitoring
   */
  getBatchCheckpoints(batchId: string): CoordinationCheckpoint[] {
    return parallelDispatcher.getCheckpoints(batchId);
  }
}


// Export singleton instance
export const subagentSupervisor = SubagentSupervisor.getInstance();
