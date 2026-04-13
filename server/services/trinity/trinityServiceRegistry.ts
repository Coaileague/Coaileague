/**
 * TRINITY SERVICE REGISTRY — Phase 16
 * =====================================
 * Canonical machine-readable inventory of all Trinity services, organized
 * by functional domain. This is the single source of truth for:
 *   - Service discovery (what exists and what it does)
 *   - Platform phase → Trinity service mapping
 *   - Authority levels per service
 *   - Integration status per platform phase
 *
 * Law: Every new Trinity service MUST be registered here with its domain,
 * phase integration, and authority level before it can be considered
 * production-ready.
 */

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

export type TrinityServiceDomain =
  | 'core_orchestration'
  | 'cognitive_reasoning'
  | 'identity_personality'
  | 'governance_safety'
  | 'memory_context'
  | 'financial_intelligence'
  | 'staffing_scheduling'
  | 'communications'
  | 'compliance_hr'
  | 'support_escalation'
  | 'infrastructure_ops'
  | 'document_portal'
  | 'voice'
  | 'subagents'
  | 'skills'
  | 'scanning_monitoring'
  | 'integration_connectors'
  | 'autonomous_systems';

export type AuthorityLevel = 'read_only' | 'write_monitored' | 'write_auto' | 'platform_admin';

export type IntegrationStatus = 'verified' | 'partial' | 'unmapped';

/** Platform phases that a Trinity service integrates with */
export type PlatformPhase =
  | 'phase_1_core_db'
  | 'phase_2_auth'
  | 'phase_3_employees'
  | 'phase_4_scheduling'
  | 'phase_5_payroll'
  | 'phase_6_email'
  | 'phase_7_client_portal'
  | 'phase_8_pl'
  | 'phase_9_support'
  | 'phase_10_invoicing'
  | 'phase_11_officer_dashboard'
  | 'phase_12_workspace'
  | 'phase_13_error_handling'
  | 'phase_14_performance'
  | 'phase_15_billing';

export interface TrinityServiceEntry {
  /** Unique identifier (matches file basename without .ts) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Server-relative path from repo root */
  path: string;
  /** Functional domain category */
  domain: TrinityServiceDomain;
  /** What this service does in one sentence */
  description: string;
  /** Authority level required to invoke this service */
  authorityLevel: AuthorityLevel;
  /** Platform phases this service integrates with */
  platformPhases: PlatformPhase[];
  /** Whether the platform integration has been verified */
  integrationStatus: IntegrationStatus;
  /** Exported class/function/singleton name(s) */
  exports: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// REGISTRY
// ────────────────────────────────────────────────────────────────────────────

export const TRINITY_SERVICE_REGISTRY: TrinityServiceEntry[] = [

  // ── CORE ORCHESTRATION ────────────────────────────────────────────────────

  {
    id: 'aiBrainMasterOrchestrator',
    name: 'AI Brain Master Orchestrator',
    path: 'server/services/ai-brain/aiBrainMasterOrchestrator.ts',
    domain: 'core_orchestration',
    description: 'Central hub connecting Gemini AI to all 80+ platform services; top-level action routing.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_1_core_db','phase_4_scheduling','phase_5_payroll','phase_9_support','phase_10_invoicing','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['aiBrainMasterOrchestrator'],
  },
  {
    id: 'unifiedAIOrchestrator',
    name: 'Unified AI Orchestrator',
    path: 'server/services/ai-brain/dualai/unifiedAIOrchestrator.ts',
    domain: 'core_orchestration',
    description: 'Coordinates Trinity (Gemini), Claude, and GPT-4 for collaborative task execution.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_9_support','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['unifiedAIOrchestrator'],
  },
  {
    id: 'taskRouter',
    name: 'Task Router',
    path: 'server/services/ai-brain/dualai/taskRouter.ts',
    domain: 'core_orchestration',
    description: 'Routes tasks to the correct AI model (Trinity/Claude/GPT-4) based on task type and cost.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_9_support','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['routeTask', 'TaskRoutingDecision'],
  },
  {
    id: 'automationGovernanceService',
    name: 'Automation Governance Service',
    path: 'server/services/ai-brain/automationGovernanceService.ts',
    domain: 'governance_safety',
    description: 'Confidence-based automation tiers: HAND_HELD (0-40%), GRADUATED (41-75%), FULL_AUTOMATION (76-100%).',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['automationGovernanceService', 'AutomationLevel', 'ExecutionDecision'],
  },
  {
    id: 'aiBrainAuthorizationService',
    name: 'AI Brain Authorization Service',
    path: 'server/services/ai-brain/aiBrainAuthorizationService.ts',
    domain: 'governance_safety',
    description: 'Multi-tenant RBAC; maps roles to action categories; enforces authority levels.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_2_auth','phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['aiBrainAuthorizationService', 'AI_BRAIN_AUTHORITY_ROLES', 'ROLE_HIERARCHY'],
  },
  {
    id: 'platformActionHub',
    name: 'Platform Action Hub',
    path: 'server/services/helpai/platformActionHub.ts',
    domain: 'core_orchestration',
    description: 'Central broker for all user-triggered actions; conscience gate + verification before execution.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_9_support','phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['helpaiOrchestrator', 'ActionRequest', 'ActionResult'],
  },
  {
    id: 'actionRegistry',
    name: 'Action Registry',
    path: 'server/services/ai-brain/actionRegistry.ts',
    domain: 'core_orchestration',
    description: 'Central registry wiring all 403+ AI Brain capabilities to executable actions.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_4_scheduling','phase_5_payroll','phase_9_support','phase_10_invoicing'],
    integrationStatus: 'verified',
    exports: ['aiBrainActionRegistry'],
  },

  // ── COGNITIVE / REASONING ─────────────────────────────────────────────────

  {
    id: 'trinityThoughtEngine',
    name: 'Trinity Thought Engine',
    path: 'server/services/ai-brain/trinityThoughtEngine.ts',
    domain: 'cognitive_reasoning',
    description: 'Central thought generation system; multi-step reasoning chains with reflection.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['trinityThoughtEngine'],
  },
  {
    id: 'trinityDeliberationLoop',
    name: 'Deliberation Loop',
    path: 'server/services/ai-brain/trinityDeliberationLoop.ts',
    domain: 'cognitive_reasoning',
    description: 'Deliberation and reflection cycle for high-stakes decisions.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'partial',
    exports: ['trinityDeliberationLoop'],
  },
  {
    id: 'trinityReflectionEngine',
    name: 'Reflection Engine',
    path: 'server/services/ai-brain/trinityReflectionEngine.ts',
    domain: 'cognitive_reasoning',
    description: 'Meta-cognitive reflection; evaluates past decisions for learning.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_11_officer_dashboard'],
    integrationStatus: 'partial',
    exports: ['trinityReflectionEngine'],
  },
  {
    id: 'trinityActionReasoner',
    name: 'Action Reasoner',
    path: 'server/services/ai-brain/trinityActionReasoner.ts',
    domain: 'cognitive_reasoning',
    description: 'Generates and logs justification for every Trinity action before execution.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['trinityActionReasoner'],
  },
  {
    id: 'trinityConscience',
    name: 'Trinity Conscience',
    path: 'server/services/ai-brain/trinityConscience.ts',
    domain: 'governance_safety',
    description: 'Ethical reasoning gate; blocks actions that violate platform values before execution.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['evaluateConscience', 'logConscienceDecision'],
  },
  {
    id: 'trinityContentGuardrails',
    name: 'Content Guardrails',
    path: 'server/services/ai-brain/trinityContentGuardrails.ts',
    domain: 'governance_safety',
    description: 'Content safety and filtering layer for all Trinity-generated text.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_9_support','phase_7_client_portal'],
    integrationStatus: 'partial',
    exports: ['trinityContentGuardrails'],
  },

  // ── MEMORY / CONTEXT ──────────────────────────────────────────────────────

  {
    id: 'trinityMemoryService',
    name: 'Trinity Memory Service',
    path: 'server/services/ai-brain/trinityMemoryService.ts',
    domain: 'memory_context',
    description: 'Long-term episodic and semantic memory; persists decisions and learning across sessions.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support','phase_11_officer_dashboard','phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['trinityMemoryService'],
  },
  {
    id: 'trinityContextManager',
    name: 'Context Manager',
    path: 'server/services/ai-brain/trinityContextManager.ts',
    domain: 'memory_context',
    description: 'Session context management; logs all operations for the audit trail.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['trinityContextManager'],
  },
  {
    id: 'trinityMemoryOptimizer',
    name: 'Memory Optimizer',
    path: 'server/services/ai-brain/trinityMemoryOptimizer.ts',
    domain: 'memory_context',
    description: 'Manages memory efficiency: pruning, compression, priority ranking.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_14_performance'],
    integrationStatus: 'partial',
    exports: ['trinityMemoryOptimizer'],
  },

  // ── FINANCIAL INTELLIGENCE ────────────────────────────────────────────────

  {
    id: 'trinityFinanceOrchestrator',
    name: 'Finance Orchestrator',
    path: 'server/services/ai-brain/trinityFinanceOrchestrator.ts',
    domain: 'financial_intelligence',
    description: 'Central coordinator for all financial AI operations: invoicing, payroll, P&L.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_5_payroll','phase_8_pl','phase_10_invoicing','phase_15_billing'],
    integrationStatus: 'verified',
    exports: ['trinityFinanceOrchestrator'],
  },
  {
    id: 'trinityFinancialIntelligenceEngine',
    name: 'Financial Intelligence Engine',
    path: 'server/services/ai-brain/trinityFinancialIntelligenceEngine.ts',
    domain: 'financial_intelligence',
    description: 'Advanced financial analysis: forecasting, anomaly detection, P&L insights.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_8_pl','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['trinityFinancialIntelligenceEngine'],
  },
  {
    id: 'trinityCostService',
    name: 'Trinity Cost Service',
    path: 'server/services/trinity/trinityCostService.ts',
    domain: 'financial_intelligence',
    description: 'Tracks per-execution API costs for every Trinity skill; feeds P&L integration.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_8_pl','phase_15_billing'],
    integrationStatus: 'verified',
    exports: ['trinityCostService', 'ExecutionCostRecord', 'MonthlyCostSummary'],
  },
  {
    id: 'aiDynamicPricingService',
    name: 'AI Dynamic Pricing Service',
    path: 'server/services/ai-brain/aiDynamicPricingService.ts',
    domain: 'financial_intelligence',
    description: 'Dynamic pricing engine using AI to optimize rates based on demand and history.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_10_invoicing','phase_15_billing'],
    integrationStatus: 'partial',
    exports: ['aiDynamicPricingService'],
  },

  // ── STAFFING / SCHEDULING ─────────────────────────────────────────────────

  {
    id: 'trinityEmergencyStaffingActions',
    name: 'Emergency Staffing Actions',
    path: 'server/services/ai-brain/trinityEmergencyStaffingActions.ts',
    domain: 'staffing_scheduling',
    description: 'Rapid staffing response: callout coverage, emergency deployment, gap filling.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_4_scheduling'],
    integrationStatus: 'verified',
    exports: ['registerTrinityEmergencyStaffingActions'],
  },
  {
    id: 'trinityScheduleTimeclockActions',
    name: 'Schedule Timeclock Actions',
    path: 'server/services/ai-brain/trinityScheduleTimeclockActions.ts',
    domain: 'staffing_scheduling',
    description: 'Timeclock AI: auto-clock-in detection, anomaly flagging, dispute resolution.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_4_scheduling','phase_5_payroll'],
    integrationStatus: 'verified',
    exports: ['registerTrinityScheduleTimeclockActions'],
  },
  {
    id: 'trinityShiftGenerator',
    name: 'Shift Generator',
    path: 'server/services/scheduling/trinityShiftGenerator.ts',
    domain: 'staffing_scheduling',
    description: 'AI-driven shift generation from work orders, site coverage, and staff availability.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_4_scheduling'],
    integrationStatus: 'verified',
    exports: ['trinityShiftGenerator'],
  },
  {
    id: 'trinityCalloffPredictor',
    name: 'Calloff Predictor',
    path: 'server/services/ai-brain/trinityCalloffPredictor.ts',
    domain: 'staffing_scheduling',
    description: 'Predicts calloff patterns by employee, site, and time to enable proactive coverage.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_4_scheduling','phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['trinityCalloffPredictor'],
  },

  // ── COMMUNICATIONS ────────────────────────────────────────────────────────

  {
    id: 'trinityChatService',
    name: 'Trinity Chat Service',
    path: 'server/services/ai-brain/trinityChatService.ts',
    domain: 'communications',
    description: 'Primary chat interface for tenant-facing Trinity conversations.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support','phase_7_client_portal'],
    integrationStatus: 'verified',
    exports: ['trinityChatService'],
  },
  {
    id: 'trinityEmailOrchestration',
    name: 'Email Orchestration',
    path: 'server/services/trinityEmailOrchestration.ts',
    domain: 'communications',
    description: 'Orchestrates AI-driven email composition, template selection, and send sequencing.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_6_email'],
    integrationStatus: 'verified',
    exports: ['trinityEmailOrchestration'],
  },
  {
    id: 'trinityInvoiceEmailActions',
    name: 'Invoice Email Actions',
    path: 'server/services/ai-brain/trinityInvoiceEmailActions.ts',
    domain: 'communications',
    description: 'AI-generated invoice emails: reminders, receipts, dispute responses.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_6_email','phase_10_invoicing'],
    integrationStatus: 'verified',
    exports: ['registerTrinityInvoiceEmailActions'],
  },
  {
    id: 'trinityCommsProactiveActions',
    name: 'Proactive Comms Actions',
    path: 'server/services/ai-brain/trinityCommsProactiveActions.ts',
    domain: 'communications',
    description: 'Proactive outreach: shift reminders, certification expiry alerts, milestone congrats.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_6_email','phase_4_scheduling'],
    integrationStatus: 'verified',
    exports: ['registerTrinityCommsProactiveActions'],
  },
  {
    id: 'trinityVoiceActions',
    name: 'Voice Actions',
    path: 'server/services/trinityVoice/trinityVoiceActions.ts',
    domain: 'voice',
    description: 'Twilio-backed voice action registry: call initiation, IVR, transcription.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'verified',
    exports: ['registerVoiceActions'],
  },

  // ── SUPPORT / ESCALATION ──────────────────────────────────────────────────

  {
    id: 'trinityHelpdeskActions',
    name: 'Helpdesk Actions',
    path: 'server/services/ai-brain/trinityHelpdeskActions.ts',
    domain: 'support_escalation',
    description: 'AI helpdesk: ticket triage, auto-response drafting, SLA monitoring triggers.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'verified',
    exports: ['registerTrinityHelpdeskActions'],
  },
  {
    id: 'trinityEscalationExecutor',
    name: 'Escalation Executor',
    path: 'server/services/trinity/trinityEscalationExecutor.ts',
    domain: 'support_escalation',
    description: 'Executes SLA escalation workflows: notifies managers, re-assigns tickets, logs outcomes.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'verified',
    exports: ['trinityEscalationExecutor'],
  },
  {
    id: 'trinityHelpaiCommandBus',
    name: 'Trinity-HelpAI Command Bus',
    path: 'server/services/helpai/trinityHelpaiCommandBus.ts',
    domain: 'support_escalation',
    description: 'Bidirectional structured command protocol between Trinity and HelpAI support agents.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'verified',
    exports: ['trinityHelpaiCommandBus', 'EscalationPayload', 'ReportPayload'],
  },
  {
    id: 'supportActionRegistry',
    name: 'Support Action Registry',
    path: 'server/services/helpai/supportActionRegistry.ts',
    domain: 'support_escalation',
    description: '14 corrective actions that support agents and Trinity can execute with full audit trail.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'verified',
    exports: ['executeSupportAction', 'SupportActionType'],
  },

  // ── COMPLIANCE / HR ────────────────────────────────────────────────────────

  {
    id: 'trinityComplianceIncidentActions',
    name: 'Compliance Incident Actions',
    path: 'server/services/ai-brain/trinityComplianceIncidentActions.ts',
    domain: 'compliance_hr',
    description: 'AI compliance: incident reporting, regulatory flag detection, evidence collection.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_9_support'],
    integrationStatus: 'partial',
    exports: ['registerTrinityComplianceIncidentActions'],
  },
  {
    id: 'trinityHiringPipelineActions',
    name: 'Hiring Pipeline Actions',
    path: 'server/services/ai-brain/trinityHiringPipelineActions.ts',
    domain: 'compliance_hr',
    description: 'AI-driven recruitment: job posting, applicant scoring, interview scheduling.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_3_employees'],
    integrationStatus: 'partial',
    exports: ['registerTrinityHiringPipelineActions'],
  },
  {
    id: 'trinityDrugTestingActions',
    name: 'Drug Testing Actions',
    path: 'server/services/ai-brain/trinityDrugTestingActions.ts',
    domain: 'compliance_hr',
    description: 'Coordinates drug test scheduling, result tracking, and compliance reporting.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_3_employees'],
    integrationStatus: 'partial',
    exports: ['registerTrinityDrugTestingActions'],
  },

  // ── AUDIT / DECISION LOGGING ──────────────────────────────────────────────

  {
    id: 'trinityDecisionLogger',
    name: 'Decision Logger',
    path: 'server/services/trinityDecisionLogger.ts',
    domain: 'governance_safety',
    description: 'Append-only log of every Trinity decision with reasoning, model, verdict, alternatives.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_11_officer_dashboard','phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['trinityDecisionLogger'],
  },
  {
    id: 'trinityAuditService',
    name: 'Audit Service',
    path: 'server/services/trinity/trinityAuditService.ts',
    domain: 'governance_safety',
    description: 'Append-only Trinity skill execution audit trail; workspace-scoped query interface.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_11_officer_dashboard','phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['trinityAuditService'],
  },
  {
    id: 'workflowLedger',
    name: 'Workflow Ledger',
    path: 'server/services/ai-brain/workflowLedger.ts',
    domain: 'governance_safety',
    description: 'Immutable workflow run storage with step-by-step execution tracking and SLA monitoring.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_13_error_handling'],
    integrationStatus: 'verified',
    exports: ['workflowLedger'],
  },

  // ── SCANNING / MONITORING ─────────────────────────────────────────────────

  {
    id: 'trinityProactiveScanner',
    name: 'Proactive Scanner',
    path: 'server/services/ai-brain/trinityProactiveScanner.ts',
    domain: 'scanning_monitoring',
    description: 'Continuous monitoring scan (Shepherd Protocol): detects anomalies, risks, and opportunities.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_11_officer_dashboard','phase_14_performance'],
    integrationStatus: 'verified',
    exports: ['trinityProactiveScanner'],
  },
  {
    id: 'trinityAnomalyDetector',
    name: 'Anomaly Detector',
    path: 'server/services/ai-brain/trinityAnomalyDetector.ts',
    domain: 'scanning_monitoring',
    description: 'Detects behavioural anomalies in scheduling, payroll, and user patterns.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_11_officer_dashboard'],
    integrationStatus: 'verified',
    exports: ['trinityAnomalyDetector'],
  },
  {
    id: 'trinityScheduledScans',
    name: 'Scheduled Scans',
    path: 'server/services/ai-brain/trinityScheduledScans.ts',
    domain: 'scanning_monitoring',
    description: 'Cron-driven scan orchestration: nightly audits, weekly P&L reviews, compliance checks.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_11_officer_dashboard','phase_14_performance'],
    integrationStatus: 'verified',
    exports: ['trinityScheduledScans'],
  },

  // ── INFRASTRUCTURE / OPS ──────────────────────────────────────────────────

  {
    id: 'trinityInfraActions',
    name: 'Infra Actions',
    path: 'server/services/ai-brain/trinityInfraActions.ts',
    domain: 'infrastructure_ops',
    description: 'Platform infrastructure operations: health checks, triad verification, service restarts.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_13_error_handling','phase_14_performance'],
    integrationStatus: 'verified',
    exports: ['registerTrinityInfraActions', 'verifyTriadHealth'],
  },
  {
    id: 'autonomousFixPipeline',
    name: 'Autonomous Fix Pipeline',
    path: 'server/services/ai-brain/autonomousFixPipeline.ts',
    domain: 'infrastructure_ops',
    description: 'Automated bug detection and patch application with governance approval gate.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_13_error_handling'],
    integrationStatus: 'verified',
    exports: ['autonomousFixPipeline'],
  },
  {
    id: 'trinitySelfEditGovernance',
    name: 'Self-Edit Governance',
    path: 'server/services/ai-brain/trinitySelfEditGovernance.ts',
    domain: 'governance_safety',
    description: 'Controls Trinity self-modification: every edit requires human approval and diff review.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_12_workspace'],
    integrationStatus: 'verified',
    exports: ['trinitySelfEditGovernance'],
  },

  // ── SUBAGENTS ─────────────────────────────────────────────────────────────

  {
    id: 'subagentSupervisor',
    name: 'Subagent Supervisor',
    path: 'server/services/ai-brain/subagentSupervisor.ts',
    domain: 'subagents',
    description: 'Manages lifecycle of all specialized subagents; monitors confidence and escalates failures.',
    authorityLevel: 'platform_admin',
    platformPhases: ['phase_4_scheduling','phase_5_payroll','phase_10_invoicing'],
    integrationStatus: 'verified',
    exports: ['subagentSupervisor'],
  },
  {
    id: 'schedulingSubagent',
    name: 'Scheduling Subagent',
    path: 'server/services/ai-brain/subagents/schedulingSubagent.ts',
    domain: 'subagents',
    description: 'Specialized subagent for complex scheduling optimization tasks.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_4_scheduling'],
    integrationStatus: 'verified',
    exports: ['schedulingSubagent'],
  },
  {
    id: 'payrollSubagent',
    name: 'Payroll Subagent',
    path: 'server/services/ai-brain/subagents/payrollSubagent.ts',
    domain: 'subagents',
    description: 'Specialized subagent for payroll computation and anomaly detection.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_5_payroll'],
    integrationStatus: 'verified',
    exports: ['payrollSubagent'],
  },
  {
    id: 'invoiceSubagent',
    name: 'Invoice Subagent',
    path: 'server/services/ai-brain/subagents/invoiceSubagent.ts',
    domain: 'subagents',
    description: 'Specialized subagent for invoice reconciliation and dispute resolution.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_10_invoicing'],
    integrationStatus: 'verified',
    exports: ['invoiceSubagent'],
  },

  // ── SKILLS ─────────────────────────────────────────────────────────────────

  {
    id: 'skill_intelligentScheduler',
    name: 'Intelligent Scheduler Skill',
    path: 'server/services/ai-brain/skills/intelligentScheduler.ts',
    domain: 'skills',
    description: 'Skill: optimized shift scheduling from constraints, availability, and coverage targets.',
    authorityLevel: 'write_auto',
    platformPhases: ['phase_4_scheduling'],
    integrationStatus: 'verified',
    exports: ['IntelligentSchedulerSkill'],
  },
  {
    id: 'skill_financialMathVerifier',
    name: 'Financial Math Verifier Skill',
    path: 'server/services/ai-brain/skills/financialMathVerifierSkill.ts',
    domain: 'skills',
    description: 'Skill: validates all financial calculations before commit using Claude as verifier.',
    authorityLevel: 'read_only',
    platformPhases: ['phase_5_payroll','phase_8_pl','phase_10_invoicing'],
    integrationStatus: 'verified',
    exports: ['FinancialMathVerifierSkill'],
  },
  {
    id: 'skill_documentGenerator',
    name: 'Document Generator Skill',
    path: 'server/services/ai-brain/skills/documentGeneratorSkill.ts',
    domain: 'skills',
    description: 'Skill: generates compliance reports, contracts, and work orders from templates.',
    authorityLevel: 'write_monitored',
    platformPhases: ['phase_7_client_portal','phase_9_support'],
    integrationStatus: 'partial',
    exports: ['DocumentGeneratorSkill'],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// PLATFORM PHASE → SERVICE MAP
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns all Trinity services that integrate with a given platform phase.
 */
export function getServicesForPhase(phase: PlatformPhase): TrinityServiceEntry[] {
  return TRINITY_SERVICE_REGISTRY.filter(s => s.platformPhases.includes(phase));
}

/**
 * Returns all Trinity services in a given domain.
 */
export function getServicesByDomain(domain: TrinityServiceDomain): TrinityServiceEntry[] {
  return TRINITY_SERVICE_REGISTRY.filter(s => s.domain === domain);
}

/**
 * Returns a summary of integration status per platform phase.
 */
export function getPlatformIntegrationSummary(): Record<PlatformPhase, {
  total: number;
  verified: number;
  partial: number;
  unmapped: number;
}> {
  const phases: PlatformPhase[] = [
    'phase_1_core_db','phase_2_auth','phase_3_employees','phase_4_scheduling',
    'phase_5_payroll','phase_6_email','phase_7_client_portal','phase_8_pl',
    'phase_9_support','phase_10_invoicing','phase_11_officer_dashboard',
    'phase_12_workspace','phase_13_error_handling','phase_14_performance',
    'phase_15_billing',
  ];

  const summary = {} as Record<PlatformPhase, { total: number; verified: number; partial: number; unmapped: number }>;

  for (const phase of phases) {
    const services = getServicesForPhase(phase);
    summary[phase] = {
      total: services.length,
      verified: services.filter(s => s.integrationStatus === 'verified').length,
      partial: services.filter(s => s.integrationStatus === 'partial').length,
      unmapped: services.filter(s => s.integrationStatus === 'unmapped').length,
    };
  }
  return summary;
}

/**
 * Returns a count of services by domain.
 */
export function getServiceCountByDomain(): Record<TrinityServiceDomain, number> {
  const counts = {} as Record<TrinityServiceDomain, number>;
  for (const s of TRINITY_SERVICE_REGISTRY) {
    counts[s.domain] = (counts[s.domain] ?? 0) + 1;
  }
  return counts;
}
