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
 * Folder renamed from `dualai/` → `trinity-orchestration/` in Phase 4A
 * (see CLAUDE.md Section S Trinity Unity Law). The legacy name mis-implied
 * multiple agents; all callers now import from `trinity-orchestration`.
 */

export { unifiedAIOrchestrator } from './unifiedAIOrchestrator';
export type { OrchestratorRequest, OrchestratorResponse, ExecutionResult } from './unifiedAIOrchestrator';

export { claudeService } from './trinityValidationService';
export type { ClaudeRequest, ClaudeResponse, ClaudeConsultation } from './trinityValidationService';

export { claudeVerificationService } from './trinityVerificationService';
export type { VerificationRequest, VerificationResult } from './trinityVerificationService';

export { trinityConfidenceScorer } from './trinityConfidenceScorer';
export type { TrinityOperation, ConfidenceScore, VerificationRecommendation } from './trinityConfidenceScorer';

export { taskRouter } from './taskRouter';
export type { TaskType, TaskRoutingDecision, AIProvider } from './taskRouter';

export { aiActionLogger } from './aiActionLogger';
export type { AIActionContext, AICollaborationInfo, AIActionMetrics, AIVerificationInfo } from './aiActionLogger';
