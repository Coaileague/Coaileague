/**
 * UNIFIED RBAC CONFIGURATION
 * ==========================
 * Single source of truth for all role-based access control.
 * 
 * ARCHITECTURE:
 * - Platform roles: Global platform access (root_admin → none)
 * - Workspace roles: Per-organization access (org_owner → contractor)
 * - Capability matrix: Maps roles to specific actions/features
 * - Access resolver: Single function to check any permission
 */

import { z } from "zod";

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export const PLATFORM_ROLES = [
  'root_admin',      // Level 0: Full platform control
  'deputy_admin',    // Level 1: Platform admin with some restrictions
  'sysop',           // Level 2: System operations
  'support_manager', // Level 3: Support team lead
  'support_agent',   // Level 4: Support staff
  'compliance_officer', // Level 5: Compliance oversight
  'auditor',         // Level 6: Read-only audit access
  'Bot',             // Special: AI/automation services
  'none',            // Level 8: No platform access
] as const;

export const WORKSPACE_ROLES = [
  'org_owner',          // Level 0: Organization owner
  'org_admin',          // Level 1: Organization administrator
  'department_manager', // Level 2: Department-level management
  'supervisor',         // Level 3: Team supervision
  'staff',              // Level 4: Regular employee
  'limited',            // Level 5: Limited access
  'contractor',         // Level 6: External contractor
] as const;

export type PlatformRole = typeof PLATFORM_ROLES[number];
export type WorkspaceRole = typeof WORKSPACE_ROLES[number];

// ============================================================================
// ROLE HIERARCHY (Lower number = higher authority)
// ============================================================================

export const PLATFORM_ROLE_LEVEL: Record<PlatformRole, number> = {
  root_admin: 0,
  deputy_admin: 1,
  sysop: 2,
  support_manager: 3,
  support_agent: 4,
  compliance_officer: 5,
  auditor: 6,
  Bot: 1, // Bot has deputy_admin equivalent for AI operations
  none: 99,
};

export const WORKSPACE_ROLE_LEVEL: Record<WorkspaceRole, number> = {
  org_owner: 0,
  org_admin: 1,
  department_manager: 2,
  supervisor: 3,
  staff: 4,
  limited: 5,
  contractor: 6,
};

// ============================================================================
// CAPABILITY CATEGORIES
// ============================================================================

export const CAPABILITY_CATEGORIES = [
  'platform',      // Platform-wide operations
  'workspace',     // Workspace management
  'scheduling',    // Shift/schedule operations
  'payroll',       // Payroll processing
  'invoicing',     // Invoice management
  'compliance',    // Compliance monitoring
  'analytics',     // Reporting and insights
  'notifications', // Notification system
  'automation',    // AI/automation features
  'filesystem',    // File operations
  'security',      // Security controls
  'support',       // Support operations
] as const;

export type CapabilityCategory = typeof CAPABILITY_CATEGORIES[number];

// ============================================================================
// CAPABILITY MATRIX
// Maps capabilities to minimum required roles (platform + workspace)
// ============================================================================

export interface CapabilityRequirement {
  platformMin?: PlatformRole;
  workspaceMin?: WorkspaceRole;
  requireBoth?: boolean; // If true, must meet BOTH requirements
  bypassFor?: PlatformRole[]; // These roles bypass all checks
}

export const CAPABILITY_MATRIX: Record<string, CapabilityRequirement> = {
  // Platform administration
  'platform.manage_users': { platformMin: 'deputy_admin', bypassFor: ['root_admin'] },
  'platform.view_audit_logs': { platformMin: 'sysop', bypassFor: ['root_admin', 'deputy_admin'] },
  'platform.manage_billing': { platformMin: 'root_admin' },
  'platform.manage_integrations': { platformMin: 'deputy_admin' },
  'platform.broadcast_updates': { platformMin: 'support_manager', bypassFor: ['root_admin', 'deputy_admin', 'Bot'] },
  
  // Workspace management
  'workspace.create': { platformMin: 'support_manager' },
  'workspace.delete': { platformMin: 'deputy_admin' },
  'workspace.manage_settings': { workspaceMin: 'org_admin' },
  'workspace.view_members': { workspaceMin: 'staff' },
  'workspace.manage_members': { workspaceMin: 'org_admin' },
  
  // Scheduling
  'scheduling.view': { workspaceMin: 'staff' },
  'scheduling.create_shifts': { workspaceMin: 'supervisor' },
  'scheduling.approve_shifts': { workspaceMin: 'department_manager' },
  'scheduling.ai_generate': { workspaceMin: 'department_manager', platformMin: 'support_manager' },
  'scheduling.generate_ai_schedule': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'scheduling.auto_resolve_conflicts': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'scheduling.validate_labor_rules': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'scheduling.optimize_coverage': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'scheduling.detect_conflicts': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  
  // Payroll
  'payroll.view': { workspaceMin: 'org_admin' },
  'payroll.process': { workspaceMin: 'org_owner', bypassFor: ['root_admin', 'deputy_admin'] },
  'payroll.approve': { workspaceMin: 'org_owner' },
  'payroll.calculate_run': { workspaceMin: 'org_owner', bypassFor: ['Bot'] },
  'payroll.process_deductions': { workspaceMin: 'org_owner', bypassFor: ['Bot'] },
  'payroll.generate_reports': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'payroll.sync_external': { workspaceMin: 'org_owner', bypassFor: ['Bot'] },
  'payroll.detect_anomalies': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'payroll.approve_run': { workspaceMin: 'org_owner', bypassFor: ['Bot'] },
  
  // Invoicing
  'invoicing.view': { workspaceMin: 'org_admin' },
  'invoicing.create': { workspaceMin: 'org_admin' },
  'invoicing.approve': { workspaceMin: 'org_owner' },
  'invoicing.generate_from_hours': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'invoicing.send_reminders': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'invoicing.process_payments': { workspaceMin: 'org_owner', bypassFor: ['Bot'] },
  'invoicing.analyze_revenue': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'invoicing.generate': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'invoicing.send': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'invoicing.reconcile': { workspaceMin: 'org_owner', bypassFor: ['Bot'] },
  
  // Compliance
  'compliance.view': { workspaceMin: 'department_manager', platformMin: 'compliance_officer' },
  'compliance.manage': { workspaceMin: 'org_admin', platformMin: 'compliance_officer' },
  'compliance.remediate': { platformMin: 'compliance_officer', bypassFor: ['root_admin'] },
  'compliance.monitor_certifications': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'compliance.check_labor_rules': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'compliance.generate_reports': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'compliance.auto_alert': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'compliance.check_certifications': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'compliance.detect_violations': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  
  // Analytics
  'analytics.view_basic': { workspaceMin: 'staff' },
  'analytics.view_advanced': { workspaceMin: 'department_manager' },
  'analytics.export': { workspaceMin: 'org_admin' },
  'analytics.ai_insights': { workspaceMin: 'department_manager' },
  'analytics.generate_dashboard': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'analytics.predict_trends': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'analytics.compare_periods': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'analytics.alert_on_anomaly': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'analytics.generate_insights': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'analytics.workforce_summary': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  
  // Onboarding
  'onboarding.create_employee': { workspaceMin: 'org_admin' },
  'onboarding.manage_checklist': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'onboarding.send_documents': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'onboarding.track_progress': { workspaceMin: 'supervisor', bypassFor: ['Bot'] },
  
  // Notifications
  'notifications.receive': { workspaceMin: 'contractor' },
  'notifications.send_user': { workspaceMin: 'supervisor' },
  'notifications.broadcast_workspace': { workspaceMin: 'org_admin' },
  'notifications.broadcast_platform': { platformMin: 'support_manager', bypassFor: ['Bot'] },
  'notifications.send_platform_update': { platformMin: 'support_manager', bypassFor: ['Bot'] },
  'notifications.route_to_tab': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'notifications.send_realtime': { workspaceMin: 'supervisor', bypassFor: ['Bot'] },
  'notifications.analyze_patterns': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'notifications.broadcast_message': { platformMin: 'support_manager', bypassFor: ['Bot'] },
  'notifications.send_to_user': { workspaceMin: 'supervisor', bypassFor: ['Bot'] },
  
  // Automation
  'automation.view_jobs': { platformMin: 'sysop' },
  'automation.trigger_jobs': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'automation.configure': { platformMin: 'deputy_admin' },
  'automation.trigger_job': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'automation.run_diagnostics': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Filesystem
  'filesystem.read': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'filesystem.write': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  'filesystem.delete': { platformMin: 'root_admin' },
  'filesystem.edit': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  'filesystem.list': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Security
  'security.view_sessions': { platformMin: 'sysop' },
  'security.manage_sessions': { platformMin: 'deputy_admin' },
  'security.elevate_session': { platformMin: 'support_agent', bypassFor: ['Bot'] },
  'security.revoke_all': { platformMin: 'root_admin' },
  'security.anomaly_detection': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'security.validate_elevated_sessions': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'security.manage_credentials': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  'security.audit_access': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Session Guardian (elevated session security)
  'session.guardian.diagnose': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'session.guardian.heal': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'session.elevate': { platformMin: 'support_agent', bypassFor: ['Bot'] },
  'session.revoke': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  
  // Time Tracking
  'time.track_hours': { workspaceMin: 'contractor' },
  'time.approve_timesheets': { workspaceMin: 'supervisor' },
  'time.detect_anomalies': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'time.manage_timesheet': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'time.generate_reports': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  
  // Support
  'support.view_tickets': { platformMin: 'support_agent' },
  'support.manage_tickets': { platformMin: 'support_agent' },
  'support.escalate': { platformMin: 'support_agent' },
  'support.force_actions': { platformMin: 'support_manager', bypassFor: ['Bot'] },
  
  // Orchestration (AI Brain)
  'orchestration.plan': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  'orchestration.reason': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  'orchestration.delegate': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Governance
  'governance.evaluate_action': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'governance.record_outcome': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Routing
  'routing.classify': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'routing.delegate': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'routing.batch': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Memory (AI)
  'memory.build_context': { platformMin: 'support_agent', bypassFor: ['Bot'] },
  'memory.get_profile': { platformMin: 'support_agent', bypassFor: ['Bot'] },
  'memory.share_insight': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Workflow
  'workflow.register': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'workflow.execute': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'workflow.list': { platformMin: 'support_agent', bypassFor: ['Bot'] },
  
  // Testing
  'test.run': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'test.run_all': { platformMin: 'deputy_admin', bypassFor: ['Bot'] },
  
  // Assist
  'assist.find_feature': { workspaceMin: 'staff', bypassFor: ['Bot'] },
  'assist.troubleshoot': { workspaceMin: 'staff', bypassFor: ['Bot'] },
  'assist.get_recommendation': { workspaceMin: 'staff', bypassFor: ['Bot'] },
  
  // Expense
  'expense.extract_receipt': { workspaceMin: 'org_admin' },
  'expense.suggest_category': { workspaceMin: 'org_admin' },
  'expense.analyze_patterns': { workspaceMin: 'org_admin' },
  
  // Pricing
  'pricing.analyze_client': { workspaceMin: 'org_owner' },
  'pricing.generate_report': { workspaceMin: 'org_owner' },
  'pricing.simulate_adjustment': { workspaceMin: 'org_owner' },
  
  // Escalation
  'escalation.critical_issue': { platformMin: 'support_agent', bypassFor: ['Bot'] },
  'escalation.system_health': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'escalation.execute_runbook': { platformMin: 'sysop', bypassFor: ['Bot'] },
  
  // Recovery
  'session.get_recoverable': { platformMin: 'sysop' },
  'session.rollback_to_checkpoint': { platformMin: 'deputy_admin' },
  
  // Health
  'health.self_check': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'health.auto_remediate': { platformMin: 'sysop', bypassFor: ['Bot'] },
  'health.performance_report': { platformMin: 'sysop' },
  
  // Sentiment Analysis
  'sentiment.analyze_feedback': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'sentiment.monitor_chat': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  'sentiment.escalate_negative': { workspaceMin: 'supervisor', bypassFor: ['Bot'] },
  'sentiment.generate_insights': { workspaceMin: 'org_admin', bypassFor: ['Bot'] },
  
  // Chat/Communication
  'chat.create_room': { workspaceMin: 'staff' },
  'chat.send_message': { workspaceMin: 'contractor' },
  'chat.moderate': { workspaceMin: 'department_manager' },
  'chat.analyze_sentiment': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  
  // Dispute Resolution
  'dispute.create': { workspaceMin: 'contractor' },
  'dispute.review': { workspaceMin: 'department_manager' },
  'dispute.resolve': { workspaceMin: 'org_admin' },
  'dispute.escalate': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  'dispute.suggest_resolution': { workspaceMin: 'department_manager', bypassFor: ['Bot'] },
  
  // Gamification
  'gamification.view_points': { workspaceMin: 'contractor' },
  'gamification.award_points': { workspaceMin: 'supervisor', bypassFor: ['Bot'] },
  'gamification.manage_achievements': { workspaceMin: 'org_admin' },
  'gamification.detect_achievements': { workspaceMin: 'supervisor', bypassFor: ['Bot'] },
};

// ============================================================================
// ACCESS CONTEXT RESOLVER
// Single function to check any permission
// ============================================================================

export interface AccessContext {
  userId: string;
  platformRole: PlatformRole;
  workspaceId?: string;
  workspaceRole?: WorkspaceRole;
  isBot?: boolean;
  isElevated?: boolean;
}

export interface AccessResult {
  allowed: boolean;
  reason?: string;
  bypassUsed?: boolean;
}

/**
 * Resolve access for a specific capability
 * This is the SINGLE function that should be used for all permission checks
 */
export function resolveAccessContext(
  context: AccessContext,
  capability: string
): AccessResult {
  const requirement = CAPABILITY_MATRIX[capability];
  
  // Unknown capability = deny by default (secure)
  if (!requirement) {
    console.warn(`[RBAC] Unknown capability requested: ${capability}`);
    return { allowed: false, reason: `Unknown capability: ${capability}` };
  }
  
  const platformLevel = PLATFORM_ROLE_LEVEL[context.platformRole] ?? 99;
  const workspaceLevel = context.workspaceRole 
    ? WORKSPACE_ROLE_LEVEL[context.workspaceRole] ?? 99 
    : 99;
  
  // Check bypass first
  if (requirement.bypassFor?.includes(context.platformRole)) {
    return { allowed: true, bypassUsed: true };
  }
  
  // Bot with elevation can bypass most checks
  if (context.isBot && context.isElevated && context.platformRole === 'Bot') {
    const restrictedForBots = ['platform.manage_billing', 'security.revoke_all', 'filesystem.delete'];
    if (!restrictedForBots.includes(capability)) {
      return { allowed: true, bypassUsed: true, reason: 'Bot elevated access' };
    }
  }
  
  // Check platform role requirement
  const platformReqLevel = requirement.platformMin 
    ? PLATFORM_ROLE_LEVEL[requirement.platformMin] 
    : 99;
  const platformPasses = platformLevel <= platformReqLevel;
  
  // Check workspace role requirement
  const workspaceReqLevel = requirement.workspaceMin 
    ? WORKSPACE_ROLE_LEVEL[requirement.workspaceMin] 
    : 99;
  const workspacePasses = workspaceLevel <= workspaceReqLevel;
  
  // Determine if access is allowed
  if (requirement.requireBoth) {
    // Must pass both checks
    if (platformPasses && workspacePasses) {
      return { allowed: true };
    }
    return { 
      allowed: false, 
      reason: `Requires both platform role ${requirement.platformMin} and workspace role ${requirement.workspaceMin}` 
    };
  } else {
    // Pass either check (if both are specified) or the one that's specified
    if (requirement.platformMin && requirement.workspaceMin) {
      if (platformPasses || workspacePasses) {
        return { allowed: true };
      }
      return { 
        allowed: false, 
        reason: `Requires platform role ${requirement.platformMin} or workspace role ${requirement.workspaceMin}` 
      };
    } else if (requirement.platformMin) {
      if (platformPasses) {
        return { allowed: true };
      }
      return { allowed: false, reason: `Requires platform role ${requirement.platformMin}` };
    } else if (requirement.workspaceMin) {
      if (workspacePasses) {
        return { allowed: true };
      }
      return { allowed: false, reason: `Requires workspace role ${requirement.workspaceMin}` };
    }
  }
  
  // No requirements = allow
  return { allowed: true };
}

/**
 * Check if a role has authority over another role
 */
export function hasAuthorityOver(
  actorRole: PlatformRole | WorkspaceRole,
  targetRole: PlatformRole | WorkspaceRole,
  context: 'platform' | 'workspace'
): boolean {
  if (context === 'platform') {
    const actorLevel = PLATFORM_ROLE_LEVEL[actorRole as PlatformRole] ?? 99;
    const targetLevel = PLATFORM_ROLE_LEVEL[targetRole as PlatformRole] ?? 99;
    return actorLevel < targetLevel;
  } else {
    const actorLevel = WORKSPACE_ROLE_LEVEL[actorRole as WorkspaceRole] ?? 99;
    const targetLevel = WORKSPACE_ROLE_LEVEL[targetRole as WorkspaceRole] ?? 99;
    return actorLevel < targetLevel;
  }
}

/**
 * Get all capabilities for a given role context
 */
export function getCapabilitiesForContext(context: AccessContext): string[] {
  return Object.entries(CAPABILITY_MATRIX)
    .filter(([capability]) => resolveAccessContext(context, capability).allowed)
    .map(([capability]) => capability);
}

/**
 * Quick check for admin-level access
 */
export function isAdminRole(role: PlatformRole): boolean {
  return ['root_admin', 'deputy_admin', 'sysop'].includes(role);
}

/**
 * Quick check for support role access
 */
export function isSupportRole(role: PlatformRole): boolean {
  return ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'].includes(role);
}

/**
 * Quick check for Bot role (AI services)
 */
export function isBotRole(role: PlatformRole): boolean {
  return role === 'Bot';
}

// ============================================================================
// ROLE GROUPS (for easier configuration)
// ============================================================================

export const ROLE_GROUPS = {
  PLATFORM_ADMINS: ['root_admin', 'deputy_admin'] as PlatformRole[],
  PLATFORM_OPS: ['root_admin', 'deputy_admin', 'sysop'] as PlatformRole[],
  SUPPORT_TEAM: ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'] as PlatformRole[],
  AI_SERVICES: ['root_admin', 'deputy_admin', 'Bot'] as PlatformRole[],
  WORKSPACE_ADMINS: ['org_owner', 'org_admin'] as WorkspaceRole[],
  WORKSPACE_MANAGERS: ['org_owner', 'org_admin', 'department_manager'] as WorkspaceRole[],
  ALL_WORKSPACE: ['org_owner', 'org_admin', 'department_manager', 'supervisor', 'staff', 'limited', 'contractor'] as WorkspaceRole[],
} as const;
