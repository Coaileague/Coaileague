/**
 * COGNITIVE BRAIN ORCHESTRATION ACTIONS
 * =======================================
 * Registers cognitive intelligence capabilities with the AI Brain Master Orchestrator.
 * 
 * Includes:
 * - Third-party API integration (QuickBooks, Gusto, etc.)
 * - Agent-to-Agent communication
 *
 * REMOVED (in-memory only — no DB persistence):
 * - Shared Knowledge Graph operations (knowledge.*)
 * - Reinforcement Learning actions (learning.*)
 * - cognitive.get_workspace_connections (duplicated by integrations API)
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { cognitiveOnboardingService, type IntegrationProvider, type DataSyncType } from './cognitiveOnboardingService';
import { agentToAgentProtocol, type MessageType, type MessagePriority } from './agentToAgentProtocol';
import { createLogger } from '../../lib/logger';
const log = createLogger('cognitiveBrainActions');

export function registerCognitiveBrainActions(): void {
  log.info('[Cognitive Brain] Registering cognitive intelligence actions...');

  // ============================================================================
  // THIRD-PARTY API INTEGRATION ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'cognitive.get_supported_integrations',
    name: 'Get Supported Integrations',
    category: 'automation',
    description: 'List all supported third-party integrations for automatic data extraction (QuickBooks, Gusto, ADP, etc.)',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const providers = cognitiveOnboardingService.getSupportedProviders();
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            providers,
            totalProviders: providers.length,
            categories: {
              payroll: providers.filter(p => ['gusto', 'adp', 'paychex', 'zenefits', 'rippling'].includes(p.provider)),
              accounting: providers.filter(p => ['quickbooks'].includes(p.provider)),
              hr: providers.filter(p => ['bamboohr', 'workday'].includes(p.provider)),
            },
          },
          message: `${providers.length} third-party integrations available for automatic data extraction`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get integrations: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'cognitive.get_auth_url',
    name: 'Get OAuth Authorization URL',
    category: 'automation',
    description: 'Generate OAuth authorization URL to connect a third-party service',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { provider, redirectUri } = request.payload || {};
      
      if (!provider || !redirectUri || !request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: provider, redirectUri, workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = cognitiveOnboardingService.getAuthorizationUrl({
          provider: provider as IntegrationProvider,
          workspaceId: request.workspaceId,
          redirectUri,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: result,
          message: `Authorization URL generated for ${provider}. User should be redirected to complete OAuth flow.`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to generate auth URL: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'cognitive.extract_api_data',
    name: 'Extract Data from API',
    category: 'automation',
    description: 'Extract employees, payroll, or financial data from a connected third-party API',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { provider, dataType } = request.payload || {};
      
      if (!provider || !dataType || !request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: provider, dataType, workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = await cognitiveOnboardingService.extractData({
          workspaceId: request.workspaceId,
          provider: provider as IntegrationProvider,
          dataType: dataType as DataSyncType,
          options: { aiMapping: true },
        });
        
        return {
          success: result.success,
          actionId: request.actionId,
          data: result,
          message: result.success 
            ? `Extracted ${result.recordsExtracted} ${dataType} records from ${provider} with ${(result.aiMappingConfidence * 100).toFixed(0)}% AI mapping confidence`
            : `Extraction failed: ${result.errors.join(', ')}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Data extraction failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'cognitive.run_api_onboarding',
    name: 'Run API-Driven Onboarding',
    category: 'automation',
    description: 'Complete org onboarding by pulling data from connected APIs (employees, payroll, invoices)',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { integrations } = request.payload || {};
      
      if (!integrations || !Array.isArray(integrations) || !request.workspaceId) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: integrations (array), workspaceId',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = await cognitiveOnboardingService.runApiDrivenOnboarding({
          workspaceId: request.workspaceId,
          userId: request.userId,
          integrations,
          options: { autoImport: true, notifyOnComplete: true },
        });
        
        return {
          success: result.success,
          actionId: request.actionId,
          data: result,
          message: result.success 
            ? `API onboarding complete: ${result.summary.employeesExtracted} employees, ${result.summary.payrollRecords} payroll records, ${result.summary.invoices} invoices extracted`
            : `Onboarding had errors: ${result.errors.join(', ')}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `API onboarding failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  log.info('[Cognitive Brain] Registered 4 API integration actions');

  // ============================================================================
  // AGENT-TO-AGENT (A2A) COMMUNICATION ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'a2a.list_agents',
    name: 'List Registered Agents',
    category: 'automation',
    description: 'List all registered AI agents and their current status',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const agents = agentToAgentProtocol.getAgentList();
        const stats = agentToAgentProtocol.getStats();
        
        return {
          success: true,
          actionId: request.actionId,
          data: { agents, stats },
          message: `${stats.agentCount} agents registered (${stats.activeAgents} active), ${stats.totalMessages} total messages, ${stats.activeTeams} active teams`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to list agents: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'a2a.send_message',
    name: 'Send Agent Message',
    category: 'automation',
    description: 'Send a direct message from one agent to another',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { from, to, type, payload, priority } = request.payload || {};
      
      if (!from || !to || !type || !payload) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: from, to, type, payload',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const message = await agentToAgentProtocol.sendMessage({
          from,
          to,
          type: type as MessageType,
          payload,
          priority: priority as MessagePriority,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: message,
          message: `Message ${message.id} sent from ${from} to ${to} (status: ${message.status})`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Message send failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'a2a.form_team',
    name: 'Form Collaboration Team',
    category: 'automation',
    description: 'Form a team of agents to collaborate on a complex task',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { name, purpose, coordinator, memberRoles, taskId } = request.payload || {};
      
      if (!name || !purpose || !coordinator || !memberRoles) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: name, purpose, coordinator, memberRoles',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const team = agentToAgentProtocol.formTeam({
          name,
          purpose,
          coordinator,
          memberRoles,
          taskId,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: team,
          message: `Team "${name}" formed with ${team.members.length} members, coordinated by ${coordinator}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Team formation failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'a2a.evaluate_trust',
    name: 'Evaluate Agent Trust',
    category: 'automation',
    description: 'Evaluate trust level between agents for a specific data type',
    requiredRoles: ['support_manager', 'sysop', 'deputy_admin', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { sourceAgent, targetAgent, dataType, metadata } = request.payload || {};
      
      if (!sourceAgent || !targetAgent || !dataType) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: sourceAgent, targetAgent, dataType',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const evaluation = agentToAgentProtocol.evaluateTrust({
          sourceAgent,
          targetAgent,
          dataType,
          metadata,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: evaluation,
          message: evaluation.trusted 
            ? `Trust established: ${evaluation.level} (${evaluation.reason})`
            : `Trust not established: ${evaluation.reason}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Trust evaluation failed: ${(error instanceof Error ? error.message : String(error))}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  log.info('[Cognitive Brain] Registered 4 A2A communication actions');

  // ============================================================================
  // SUMMARY — reinforcement learning (5) and knowledge graph (5) actions removed
  // ============================================================================

  // NOTE: learning.record_experience, learning.get_confidence, learning.get_metrics,
  // learning.get_adaptations, learning.validate_adaptation were REMOVED — all
  // used in-memory Maps with no DB persistence; not suitable for production use.

  // NOTE: knowledge.semantic_query, knowledge.add_entity, knowledge.check_rules,
  // knowledge.get_stats, knowledge.get_learnings were REMOVED — all used in-memory
  // Map-based KG with no DB persistence.

  // NOTE: cognitive.get_workspace_connections was REMOVED — duplicated data
  // already available through the standard workspace integrations API.


  log.info('[Cognitive Brain] Total: 8 cognitive intelligence actions registered');
  log.info('[Cognitive Brain] Categories: API Integration (4), A2A Communication (4)');
}
