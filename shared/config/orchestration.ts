/**
 * UNIFIED ORCHESTRATION CONFIGURATION
 * ====================================
 * Single source of truth for AI Brain orchestration.
 * 
 * ARCHITECTURE:
 * - Agent Tiers: Strategy → Domain Router → Execution
 * - Capability Catalog: All registered AI actions
 * - Domain Mappings: Route requests to appropriate agents
 * - Execution Pipelines: Tiered processing for efficiency
 */

import { 
  ROLE_GROUPS, 
  resolveAccessContext, 
  type PlatformRole, 
  type WorkspaceRole,
  type AccessContext,
  PLATFORM_ROLE_LEVEL 
} from './rbac';

// ============================================================================
// AGENT TIER DEFINITIONS
// ============================================================================

export type AgentTier = 'strategy' | 'router' | 'executor';

export const AGENT_TIERS: Record<AgentTier, { description: string; thinkingLevel: string; costTier: 'low' | 'medium' | 'high' }> = {
  strategy: {
    description: 'High-level planning and complex reasoning',
    thinkingLevel: 'high',
    costTier: 'high',
  },
  router: {
    description: 'Fast routing and delegation decisions',
    thinkingLevel: 'low',
    costTier: 'low',
  },
  executor: {
    description: 'Domain-specific task execution',
    thinkingLevel: 'medium',
    costTier: 'medium',
  },
};

// ============================================================================
// DOMAIN DEFINITIONS
// ============================================================================

export const AGENT_DOMAINS = [
  'scheduling',
  'payroll',
  'invoicing',
  'compliance',
  'notifications',
  'analytics',
  'gamification',
  'communication',
  'health',
  'security',
  'recovery',
  'orchestration',
  'escalation',
  'automation',
  'lifecycle',
  'assist',
  'filesystem',
  'workflow',
  'testing',
  'onboarding',
  'expense',
  'pricing',
] as const;

export type AgentDomain = typeof AGENT_DOMAINS[number];

// ============================================================================
// CONSOLIDATED SUBAGENT REGISTRY
// Declarative definitions consumed by the orchestrator runtime
// ============================================================================

export interface SubagentDefinition {
  id: string;
  name: string;
  domain: AgentDomain;
  tier: AgentTier;
  description: string;
  capabilities: string[];
  allowedRoles: string[]; // Can include both platform and workspace roles
  bypassRoles: string[];  // Roles that bypass permission checks
  isActive: boolean;
  config: {
    maxRetries: number;
    timeoutMs: number;
    confidenceThreshold: number;
    requiresApproval: boolean;
  };
}

export const SUBAGENT_REGISTRY: SubagentDefinition[] = [
  // STRATEGY TIER - High-level reasoning
  {
    id: 'trinity-core',
    name: 'Trinity Core',
    domain: 'orchestration',
    tier: 'strategy',
    description: 'Central AI brain for complex reasoning and multi-step planning',
    capabilities: ['orchestration.plan', 'orchestration.reason', 'orchestration.delegate'],
    allowedRoles: ROLE_GROUPS.AI_SERVICES,
    bypassRoles: ['root_admin', 'deputy_admin'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 60000, confidenceThreshold: 0.8, requiresApproval: false },
  },
  {
    id: 'governance-agent',
    name: 'GovernanceAgent',
    domain: 'orchestration',
    tier: 'strategy',
    description: 'Automation governance, confidence-driven execution gates',
    capabilities: ['governance.evaluate_action', 'governance.record_outcome'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'org_owner', 'co_owner'],
    bypassRoles: ['root_admin', 'deputy_admin'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 20000, confidenceThreshold: 0.85, requiresApproval: true },
  },
  
  // ROUTER TIER - Fast delegation
  {
    id: 'domain-router',
    name: 'DomainRouter',
    domain: 'orchestration',
    tier: 'router',
    description: 'Routes requests to appropriate domain agents',
    capabilities: ['routing.classify', 'routing.delegate', 'routing.batch'],
    allowedRoles: ROLE_GROUPS.AI_SERVICES,
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 5000, confidenceThreshold: 0.6, requiresApproval: false },
  },
  {
    id: 'escalation-agent',
    name: 'EscalationAgent',
    domain: 'escalation',
    tier: 'router',
    description: 'Routes critical issues and executes runbooks',
    capabilities: ['escalation.critical_issue', 'escalation.system_health', 'escalation.execute_runbook'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 1, timeoutMs: 60000, confidenceThreshold: 0.9, requiresApproval: false },
  },
  
  // EXECUTOR TIER - Domain specialists
  {
    id: 'scheduling-agent',
    name: 'SchedulingAgent',
    domain: 'scheduling',
    tier: 'executor',
    description: 'Shift management, availability, calendar sync',
    capabilities: ['scheduling.generate_ai_schedule', 'scheduling.detect_conflicts'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'org_owner', 'co_owner', 'department_manager'],
    bypassRoles: ['root_admin', 'deputy_admin'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 30000, confidenceThreshold: 0.75, requiresApproval: false },
  },
  {
    id: 'payroll-agent',
    name: 'PayrollAgent',
    domain: 'payroll',
    tier: 'executor',
    description: 'Pay runs, deductions, tax calculations',
    capabilities: ['payroll.calculate_run', 'payroll.detect_anomalies', 'payroll.approve_run'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'org_owner', 'co_owner'],
    bypassRoles: ['root_admin'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 60000, confidenceThreshold: 0.9, requiresApproval: true },
  },
  {
    id: 'invoicing-agent',
    name: 'InvoicingAgent',
    domain: 'invoicing',
    tier: 'executor',
    description: 'Invoice generation, payments, client billing',
    capabilities: ['invoicing.generate', 'invoicing.send', 'invoicing.reconcile'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'org_owner', 'co_owner'],
    bypassRoles: ['root_admin', 'deputy_admin'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 45000, confidenceThreshold: 0.85, requiresApproval: false },
  },
  {
    id: 'compliance-agent',
    name: 'ComplianceAgent',
    domain: 'compliance',
    tier: 'executor',
    description: 'Certifications, labor law, break enforcement',
    capabilities: ['compliance.check_certifications', 'compliance.detect_violations'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'compliance_officer', 'org_owner', 'co_owner'],
    bypassRoles: ['root_admin', 'compliance_officer'],
    isActive: true,
    config: { maxRetries: 1, timeoutMs: 30000, confidenceThreshold: 0.95, requiresApproval: false },
  },
  {
    id: 'notification-agent',
    name: 'NotificationAgent',
    domain: 'notifications',
    tier: 'executor',
    description: 'Multi-channel delivery, tab routing, RBAC targeting',
    capabilities: ['notifications.send_platform_update', 'notifications.broadcast_message', 'notifications.send_to_user'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'sysop', 'Bot'],
    isActive: true,
    config: { maxRetries: 5, timeoutMs: 15000, confidenceThreshold: 0.7, requiresApproval: false },
  },
  {
    id: 'analytics-agent',
    name: 'AnalyticsAgent',
    domain: 'analytics',
    tier: 'executor',
    description: 'AI-powered insights and workforce summaries',
    capabilities: ['analytics.generate_insights', 'analytics.workforce_summary'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'org_owner', 'co_owner', 'department_manager'],
    bypassRoles: ['root_admin', 'deputy_admin'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 45000, confidenceThreshold: 0.75, requiresApproval: false },
  },
  {
    id: 'health-agent',
    name: 'HealthAgent',
    domain: 'health',
    tier: 'executor',
    description: 'System monitoring, performance checks',
    capabilities: ['health.self_check', 'health.auto_remediate', 'health.performance_report'],
    allowedRoles: ROLE_GROUPS.PLATFORM_OPS,
    bypassRoles: ['root_admin', 'deputy_admin', 'sysop'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 30000, confidenceThreshold: 0.7, requiresApproval: false },
  },
  {
    id: 'security-agent',
    name: 'SecurityAgent',
    domain: 'security',
    tier: 'executor',
    description: 'RBAC enforcement, session management, audit logging',
    capabilities: ['session.guardian.diagnose', 'session.guardian.heal', 'session.elevate', 'session.revoke'],
    allowedRoles: ROLE_GROUPS.PLATFORM_OPS,
    bypassRoles: ['root_admin'],
    isActive: true,
    config: { maxRetries: 1, timeoutMs: 15000, confidenceThreshold: 0.95, requiresApproval: true },
  },
  {
    id: 'recovery-agent',
    name: 'RecoveryAgent',
    domain: 'recovery',
    tier: 'executor',
    description: 'Session recovery, rollback, checkpoints',
    capabilities: ['session.get_recoverable', 'session.rollback_to_checkpoint'],
    allowedRoles: ROLE_GROUPS.PLATFORM_OPS,
    bypassRoles: ['root_admin'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 45000, confidenceThreshold: 0.8, requiresApproval: false },
  },
  {
    id: 'automation-agent',
    name: 'AutomationAgent',
    domain: 'automation',
    tier: 'executor',
    description: 'Scheduled jobs, diagnostics, platform animations',
    capabilities: ['automation.trigger_job', 'automation.run_diagnostics'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 60000, confidenceThreshold: 0.8, requiresApproval: false },
  },
  {
    id: 'memory-agent',
    name: 'MemoryAgent',
    domain: 'orchestration',
    tier: 'executor',
    description: 'AI memory, learning, cross-bot knowledge sharing',
    capabilities: ['memory.build_context', 'memory.get_profile', 'memory.share_insight'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 30000, confidenceThreshold: 0.7, requiresApproval: false },
  },
  {
    id: 'workflow-agent',
    name: 'WorkflowAgent',
    domain: 'workflow',
    tier: 'executor',
    description: 'Durable workflows, execution monitoring',
    capabilities: ['workflow.register', 'workflow.execute', 'workflow.list'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 120000, confidenceThreshold: 0.8, requiresApproval: false },
  },
  {
    id: 'filesystem-agent',
    name: 'FileSystemAgent',
    domain: 'filesystem',
    tier: 'executor',
    description: 'Secure file operations with RBAC',
    capabilities: ['filesystem.read', 'filesystem.write', 'filesystem.edit', 'filesystem.list'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'Bot'],
    bypassRoles: ['root_admin'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 30000, confidenceThreshold: 0.85, requiresApproval: true },
  },
  {
    id: 'assist-agent',
    name: 'AssistAgent',
    domain: 'assist',
    tier: 'executor',
    description: 'User assistance, feature discovery, troubleshooting',
    capabilities: ['assist.find_feature', 'assist.troubleshoot', 'assist.get_recommendation'],
    allowedRoles: [...ROLE_GROUPS.SUPPORT_TEAM, 'org_owner', 'co_owner', 'department_manager', 'supervisor', 'staff', 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 20000, confidenceThreshold: 0.6, requiresApproval: false },
  },
  {
    id: 'expense-agent',
    name: 'ExpenseAgent',
    domain: 'expense',
    tier: 'executor',
    description: 'Receipt OCR, category suggestions, expense patterns',
    capabilities: ['expense.extract_receipt', 'expense.suggest_category', 'expense.analyze_patterns'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'org_owner', 'co_owner'],
    bypassRoles: ['root_admin', 'deputy_admin'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 45000, confidenceThreshold: 0.7, requiresApproval: false },
  },
  {
    id: 'pricing-agent',
    name: 'PricingAgent',
    domain: 'pricing',
    tier: 'executor',
    description: 'Dynamic pricing, rate analysis, simulations',
    capabilities: ['pricing.analyze_client', 'pricing.generate_report', 'pricing.simulate_adjustment'],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_ADMINS, 'org_owner', 'co_owner'],
    bypassRoles: ['root_admin'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 60000, confidenceThreshold: 0.85, requiresApproval: true },
  },
  
  // ONBOARDING TIER - New organization setup specialists
  {
    id: 'data-migration-agent',
    name: 'DataMigrationAgent',
    domain: 'onboarding',
    tier: 'executor',
    description: 'Extracts and migrates data from PDFs, Excel, CSV, and manual entry for new org setup',
    capabilities: [
      'onboarding.extract_pdf',
      'onboarding.extract_excel',
      'onboarding.extract_csv',
      'onboarding.parse_manual_entry',
      'onboarding.map_to_schema',
      'onboarding.validate_data',
      'onboarding.import_employees',
      'onboarding.import_departments',
      'onboarding.import_schedules',
    ],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'org_owner', 'co_owner', 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 3, timeoutMs: 120000, confidenceThreshold: 0.7, requiresApproval: false },
  },
  {
    id: 'gamification-activation-agent',
    name: 'GamificationActivationAgent',
    domain: 'gamification',
    tier: 'executor',
    description: 'Universally activates gamification system during org onboarding to unlock automation requirements',
    capabilities: [
      'gamification.activate_for_org',
      'gamification.setup_achievements',
      'gamification.configure_points',
      'gamification.enable_leaderboards',
      'gamification.unlock_automation_gates',
      'gamification.assign_starter_badges',
    ],
    allowedRoles: [...ROLE_GROUPS.PLATFORM_OPS, 'org_owner', 'co_owner', 'Bot'],
    bypassRoles: ['root_admin', 'deputy_admin', 'Bot'],
    isActive: true,
    config: { maxRetries: 2, timeoutMs: 30000, confidenceThreshold: 0.8, requiresApproval: false },
  },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get agent by ID
 */
export function getSubagent(id: string): SubagentDefinition | undefined {
  return SUBAGENT_REGISTRY.find(a => a.id === id);
}

/**
 * Get agents by domain
 */
export function getAgentsByDomain(domain: AgentDomain): SubagentDefinition[] {
  return SUBAGENT_REGISTRY.filter(a => a.domain === domain);
}

/**
 * Get agents by tier
 */
export function getAgentsByTier(tier: AgentTier): SubagentDefinition[] {
  return SUBAGENT_REGISTRY.filter(a => a.tier === tier);
}

/**
 * Get active agents only
 */
export function getActiveAgents(): SubagentDefinition[] {
  return SUBAGENT_REGISTRY.filter(a => a.isActive);
}

/**
 * Check if user can access an agent using unified RBAC
 * Delegates to resolveAccessContext for each of the agent's capabilities
 */
export function canAccessAgent(
  agent: SubagentDefinition, 
  context: { platformRole: string; workspaceRole?: string; userId: string; isBot?: boolean }
): boolean {
  // Check bypass roles first (simple membership check)
  if (agent.bypassRoles.includes(context.platformRole)) return true;
  
  // Check if user's platform role is in allowed roles
  if (agent.allowedRoles.includes(context.platformRole)) return true;
  
  // Check workspace role if provided
  if (context.workspaceRole && agent.allowedRoles.includes(context.workspaceRole)) return true;
  
  // Fall back to capability-based check using unified RBAC
  const accessContext: AccessContext = {
    userId: context.userId,
    platformRole: context.platformRole as PlatformRole,
    workspaceRole: context.workspaceRole as WorkspaceRole,
    isBot: context.isBot,
  };
  
  // Check if user can access at least one of the agent's capabilities
  return agent.capabilities.some(capability => {
    const result = resolveAccessContext(accessContext, capability);
    return result.allowed;
  });
}

/**
 * Route a request to the appropriate domain
 */
export function routeToDomain(intent: string): AgentDomain {
  const intentLower = intent.toLowerCase();
  
  const domainKeywords: Record<AgentDomain, string[]> = {
    scheduling: ['schedule', 'shift', 'calendar', 'availability', 'roster'],
    payroll: ['payroll', 'pay', 'salary', 'wage', 'deduction', 'tax'],
    invoicing: ['invoice', 'bill', 'payment', 'client billing'],
    compliance: ['compliance', 'certification', 'labor law', 'break', 'violation'],
    notifications: ['notify', 'alert', 'message', 'broadcast', 'email', 'sms'],
    analytics: ['analytics', 'report', 'insight', 'metric', 'dashboard'],
    gamification: ['achievement', 'badge', 'point', 'leaderboard', 'reward'],
    communication: ['chat', 'message', 'room', 'conversation'],
    health: ['health', 'status', 'monitoring', 'performance'],
    security: ['security', 'session', 'rbac', 'permission', 'access'],
    recovery: ['recover', 'rollback', 'checkpoint', 'restore'],
    orchestration: ['orchestrate', 'plan', 'coordinate', 'workflow'],
    escalation: ['escalate', 'critical', 'urgent', 'incident'],
    automation: ['automate', 'job', 'task', 'cron', 'schedule job'],
    lifecycle: ['onboard', 'offboard', 'anniversary', 'probation'],
    assist: ['help', 'find', 'troubleshoot', 'recommend'],
    filesystem: ['file', 'read', 'write', 'edit', 'directory'],
    workflow: ['workflow', 'process', 'pipeline', 'step'],
    testing: ['test', 'validate', 'check', 'verify'],
    onboarding: ['onboard', 'new employee', 'setup', 'welcome'],
    expense: ['expense', 'receipt', 'reimburse', 'spend'],
    pricing: ['pricing', 'rate', 'cost', 'margin', 'quote'],
  };
  
  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some(kw => intentLower.includes(kw))) {
      return domain as AgentDomain;
    }
  }
  
  return 'assist'; // Default to assist agent for unknown intents
}

// ============================================================================
// LEGACY OPERATIONAL METADATA (for database seeding compatibility)
// These defaults are used when transforming simplified registry to full schema
// ============================================================================

interface LegacySubagentMetadata {
  requiredTools: string[];
  escalationPolicy: {
    maxRetries: number;
    escalateOn: string[];
    alwaysNotify?: boolean;
  };
  diagnosticWorkflow: {
    diagnose: string[];
    fix: string[];
    validate: string[];
    report: string[];
  };
  knownPatterns: string[];
  fixStrategies: Record<string, string>;
}

const DEFAULT_LEGACY_METADATA: Record<string, LegacySubagentMetadata> = {
  'scheduling-agent': {
    requiredTools: ['calendar', 'availability_checker', 'conflict_resolver'],
    escalationPolicy: { maxRetries: 3, escalateOn: ['conflict_unresolved', 'overtime_violation'] },
    diagnosticWorkflow: {
      diagnose: ['check_conflicts', 'verify_availability', 'validate_labor_rules'],
      fix: ['auto_reassign', 'suggest_alternatives', 'notify_manager'],
      validate: ['run_schedule_validation', 'check_coverage'],
      report: ['generate_resolution_summary']
    },
    knownPatterns: ['double_booking', 'overtime_risk', 'coverage_gap'],
    fixStrategies: { double_booking: 'reassign_to_available', overtime_risk: 'redistribute_hours' }
  },
  'payroll-agent': {
    requiredTools: ['tax_calculator', 'deduction_engine', 'timesheet_aggregator'],
    escalationPolicy: { maxRetries: 2, escalateOn: ['calculation_error', 'compliance_violation'], alwaysNotify: true },
    diagnosticWorkflow: {
      diagnose: ['verify_hours', 'check_deductions', 'validate_tax_rates'],
      fix: ['recalculate_affected', 'apply_corrections'],
      validate: ['audit_totals', 'verify_compliance'],
      report: ['generate_variance_report']
    },
    knownPatterns: ['hours_mismatch', 'deduction_error', 'tax_miscalculation'],
    fixStrategies: { hours_mismatch: 'recalculate_from_timesheet', deduction_error: 'reapply_deduction_rules' }
  },
  'notification-agent': {
    requiredTools: ['email_service', 'sms_service', 'websocket_broadcaster', 'push_notifier'],
    escalationPolicy: { maxRetries: 5, escalateOn: ['delivery_failure_rate_high', 'channel_unavailable'] },
    diagnosticWorkflow: {
      diagnose: ['check_delivery_status', 'verify_recipient_config', 'validate_tab_routing'],
      fix: ['retry_failed', 'switch_channel', 'reroute_to_correct_tab'],
      validate: ['confirm_delivery', 'verify_tab_placement'],
      report: ['generate_delivery_report']
    },
    knownPatterns: ['email_bounce', 'sms_failed', 'websocket_disconnect'],
    fixStrategies: { email_bounce: 'switch_to_sms', websocket_disconnect: 'queue_for_reconnect' }
  },
};

// Default metadata for agents without specific overrides
const GENERIC_LEGACY_METADATA: LegacySubagentMetadata = {
  requiredTools: ['generic_tool'],
  escalationPolicy: { maxRetries: 2, escalateOn: ['failure', 'timeout'] },
  diagnosticWorkflow: {
    diagnose: ['check_status'],
    fix: ['retry_operation'],
    validate: ['verify_result'],
    report: ['log_outcome']
  },
  knownPatterns: ['general_failure'],
  fixStrategies: { general_failure: 'retry_with_backoff' }
};

/**
 * Transform SUBAGENT_REGISTRY entries into full database-compatible schema
 * This is the bridge between simplified config and legacy runtime
 */
export function getSubagentSeedDefinitions() {
  return SUBAGENT_REGISTRY.map(agent => {
    const legacyMeta = DEFAULT_LEGACY_METADATA[agent.id] || GENERIC_LEGACY_METADATA;
    
    return {
      name: agent.name,
      domain: agent.domain,
      description: agent.description,
      capabilities: agent.capabilities,
      requiredTools: legacyMeta.requiredTools,
      escalationPolicy: legacyMeta.escalationPolicy,
      diagnosticWorkflow: legacyMeta.diagnosticWorkflow,
      knownPatterns: legacyMeta.knownPatterns,
      fixStrategies: legacyMeta.fixStrategies,
      maxRetries: agent.config.maxRetries,
      timeoutMs: agent.config.timeoutMs,
      confidenceThreshold: agent.config.confidenceThreshold,
      requiresApproval: agent.config.requiresApproval,
      allowedRoles: agent.allowedRoles,
      bypassAuthFor: agent.bypassRoles,
      isActive: agent.isActive,
      version: '1.0.0',
    };
  });
}

// ============================================================================
// ORCHESTRATION STATISTICS
// ============================================================================

export function getOrchestrationStats() {
  const agents = SUBAGENT_REGISTRY;
  const activeAgents = agents.filter(a => a.isActive);
  
  const byTier = {
    strategy: agents.filter(a => a.tier === 'strategy').length,
    router: agents.filter(a => a.tier === 'router').length,
    executor: agents.filter(a => a.tier === 'executor').length,
  };
  
  const totalCapabilities = agents.reduce((sum, a) => sum + a.capabilities.length, 0);
  
  return {
    totalAgents: agents.length,
    activeAgents: activeAgents.length,
    byTier,
    totalCapabilities,
    domains: AGENT_DOMAINS.length,
    avgCapabilitiesPerAgent: (totalCapabilities / agents.length).toFixed(2),
  };
}
