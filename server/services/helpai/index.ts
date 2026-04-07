/**
 * HelpAI Services Index
 * =====================
 * Central export for all HelpAI services
 */

export { helpAIBotService, HelpAIState } from './helpAIBotService';
export type { HelpAIConversation, HelpAIResponse } from './helpAIBotService';

export { helpaiRegistryService } from './helpaiRegistryService';
export { helpaiIntegrationService } from './helpaiIntegrationService';
export { helpaiAuditService } from './helpaiAuditService';
export { helpAIOrchestrator } from './helpAIOrchestrator';
export type { OrchestratorResponse, OrchestratorSessionStart, BotSummonRequest, AuthVerificationResult } from './helpAIOrchestrator';

export { helpAICoreEngine } from './helpAICoreEngine';
export type { HelpAILayer, ConversationPriority, CognitiveLayers, FaithSensitivityState, SessionLanguage, ConversationStatus, MessageContext, ConversationContext, HelpAITask, EmergencyContext } from './helpAICoreEngine';
export { trinityHelpaiCommandBus } from './trinityHelpaiCommandBus';
export type { CommandBusDirection, CommandBusMessageType, CommandBusPriority, CommandBusStatus, EscalationPayload, ReportPayload, RequestPayload, AlertPayload } from './trinityHelpaiCommandBus';
export { helpAIProactiveMonitor } from './helpAIProactiveMonitor';
export { runHelpAIV2Migration } from './helpAIMigration';
