/**
 * Trinity Unified Orchestration
 *
 * Central exports for Trinity — CoAIleague's single unified AI agent. Trinity
 * routes her own reasoning across multiple interchangeable model backends
 * depending on the task (orchestration, legal/compliance, support), but this
 * is internal wiring only. From every tenant-facing and developer-facing
 * surface she is one personality with one identity.
 *
 * Backend routing (not agents, not personalities — just compute paths):
 * - Orchestration path  — scheduling, monitoring, data analysis, platform ops
 * - Specialist path     — writing, legal reasoning, compliance, contracts
 * - Support path        — customer support, knowledge synthesis, training
 *
 * The folder name `dualai/` is legacy and will be renamed in a later phase.
 */

export { unifiedAIOrchestrator } from './unifiedAIOrchestrator';
export type { OrchestratorRequest, OrchestratorResponse, ExecutionResult } from './unifiedAIOrchestrator';

export { claudeService } from './claudeService';
export type { ClaudeRequest, ClaudeResponse, ClaudeConsultation } from './claudeService';

export { claudeVerificationService } from './claudeVerificationService';
export type { VerificationRequest, VerificationResult } from './claudeVerificationService';

export { trinityConfidenceScorer } from './trinityConfidenceScorer';
export type { TrinityOperation, ConfidenceScore, VerificationRecommendation } from './trinityConfidenceScorer';

export { taskRouter } from './taskRouter';
export type { TaskType, TaskRoutingDecision, AIProvider } from './taskRouter';

export { aiActionLogger } from './aiActionLogger';
export type { AIActionContext, AICollaborationInfo, AIActionMetrics, AIVerificationInfo } from './aiActionLogger';
