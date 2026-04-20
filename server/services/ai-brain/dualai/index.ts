/**
 * Trinity + Claude Dual-AI Orchestration System
 * 
 * Central exports for the dual-AI system where:
 * - Trinity (Gemini) = CEO/Orchestrator - scheduling, monitoring, data analysis
 * - Claude (Anthropic) = CFO/Specialist - writing, reasoning, compliance
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
