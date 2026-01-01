/**
 * COGNITIVE BRAIN ORCHESTRATION ACTIONS
 * =======================================
 * Registers all cognitive intelligence capabilities with the AI Brain Master Orchestrator.
 * 
 * Includes:
 * - Third-party API integration (QuickBooks, Gusto, etc.)
 * - Shared Knowledge Graph operations
 * - Agent-to-Agent communication
 * - Reinforcement Learning metrics and adaptation
 */

import { helpaiOrchestrator, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { cognitiveOnboardingService, type IntegrationProvider, type DataSyncType } from './cognitiveOnboardingService';
import { sharedKnowledgeGraph, type KnowledgeDomain, type EntityType } from './sharedKnowledgeGraph';
import { agentToAgentProtocol, type MessageType, type MessagePriority } from './agentToAgentProtocol';
import { reinforcementLearningLoop } from './reinforcementLearningLoop';

export function registerCognitiveBrainActions(): void {
  console.log('[Cognitive Brain] Registering cognitive intelligence actions...');

  // ============================================================================
  // THIRD-PARTY API INTEGRATION ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'cognitive.get_supported_integrations',
    name: 'Get Supported Integrations',
    category: 'automation',
    description: 'List all supported third-party integrations for automatic data extraction (QuickBooks, Gusto, ADP, etc.)',
    requiredRoles: ['admin', 'super_admin'],
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
          message: `Failed to get integrations: ${error.message}`,
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
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { provider, redirectUri } = request.payload || {};
      
      if (!provider || !redirectUri) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: provider, redirectUri',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = cognitiveOnboardingService.getAuthorizationUrl({
          provider: provider as IntegrationProvider,
          workspaceId: request.workspaceId!,
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
          message: `Failed to generate auth URL: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'cognitive.get_workspace_connections',
    name: 'Get Workspace API Connections',
    category: 'automation',
    description: 'List all connected third-party integrations for a workspace',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const connections = cognitiveOnboardingService.getWorkspaceConnections(request.workspaceId!);
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            connections,
            connectedCount: connections.filter(c => c.status === 'connected').length,
            totalCount: connections.length,
          },
          message: `${connections.length} API connections found for workspace`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get connections: ${error.message}`,
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
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { provider, dataType } = request.payload || {};
      
      if (!provider || !dataType) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: provider, dataType',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = await cognitiveOnboardingService.extractData({
          workspaceId: request.workspaceId!,
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
          message: `Data extraction failed: ${error.message}`,
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
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { integrations } = request.payload || {};
      
      if (!integrations || !Array.isArray(integrations)) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: integrations (array of {provider, dataTypes[]})',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = await cognitiveOnboardingService.runApiDrivenOnboarding({
          workspaceId: request.workspaceId!,
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
          message: `API onboarding failed: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  console.log('[Cognitive Brain] Registered 5 API integration actions');

  // ============================================================================
  // SHARED KNOWLEDGE GRAPH ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'knowledge.semantic_query',
    name: 'Query Knowledge Graph',
    category: 'automation',
    description: 'Semantically query the shared knowledge graph for insights, patterns, and operational knowledge',
    requiredRoles: ['staff', 'manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { question, domain, entityTypes, maxResults } = request.payload || {};
      
      if (!question) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameter: question',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = await sharedKnowledgeGraph.semanticQuery({
          question,
          domain: domain as KnowledgeDomain,
          entityTypes: entityTypes as EntityType[],
          maxResults: maxResults || 10,
          includeRelated: true,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: result,
          message: `Found ${result.entities.length} knowledge entities with ${(result.confidence * 100).toFixed(0)}% confidence`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Knowledge query failed: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'knowledge.add_entity',
    name: 'Add Knowledge Entity',
    category: 'automation',
    description: 'Add a new knowledge entity (rule, pattern, fact, insight) to the shared knowledge graph',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { type, name, description, domain, attributes } = request.payload || {};
      
      if (!type || !name || !domain) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: type, name, domain',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const entity = sharedKnowledgeGraph.addEntity({
          type: type as EntityType,
          name,
          description: description || '',
          domain: domain as KnowledgeDomain,
          attributes: attributes || {},
          createdBy: request.userId,
          confidence: 0.8,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: entity,
          message: `Knowledge entity "${name}" added to ${domain} domain`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to add entity: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'knowledge.check_rules',
    name: 'Check Business Rules',
    category: 'automation',
    description: 'Check if an action is allowed based on encoded business rules in the knowledge graph',
    requiredRoles: ['staff', 'manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { action, domain, context } = request.payload || {};
      
      if (!action || !domain) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: action, domain',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const result = sharedKnowledgeGraph.checkRules({
          action,
          domain: domain as KnowledgeDomain,
          context: context || {},
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: result,
          message: result.allowed 
            ? `Action "${action}" is allowed. ${result.applicableRules.length} rules checked.`
            : `Action "${action}" is blocked: ${result.reason}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Rule check failed: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'knowledge.get_stats',
    name: 'Get Knowledge Graph Stats',
    category: 'automation',
    description: 'Get statistics about the shared knowledge graph (entity count, learnings, domains)',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      
      try {
        const stats = sharedKnowledgeGraph.getStats();
        
        return {
          success: true,
          actionId: request.actionId,
          data: stats,
          message: `Knowledge graph: ${stats.entityCount} entities, ${stats.relationshipCount} relationships, ${stats.learningCount} learnings across ${Object.keys(stats.domainBreakdown).length} domains`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get stats: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'knowledge.get_learnings',
    name: 'Get Agent Learnings',
    category: 'automation',
    description: 'Retrieve learning history from agents for a specific domain or action',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { domain, agentId, outcome, limit } = request.payload || {};
      
      try {
        const learnings = sharedKnowledgeGraph.getLearnings({
          domain: domain as KnowledgeDomain,
          agentId,
          outcome,
          limit: limit || 50,
        });
        
        const successRate = learnings.filter(l => l.outcome === 'success').length / Math.max(learnings.length, 1);
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            learnings,
            totalCount: learnings.length,
            successRate,
            insights: learnings.flatMap(l => l.insights).slice(0, 10),
          },
          message: `Retrieved ${learnings.length} learning entries (${(successRate * 100).toFixed(0)}% success rate)`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get learnings: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  console.log('[Cognitive Brain] Registered 5 knowledge graph actions');

  // ============================================================================
  // AGENT-TO-AGENT (A2A) COMMUNICATION ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'a2a.list_agents',
    name: 'List Registered Agents',
    category: 'automation',
    description: 'List all registered AI agents and their current status',
    requiredRoles: ['admin', 'super_admin'],
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
          message: `Failed to list agents: ${error.message}`,
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
    requiredRoles: ['admin', 'super_admin'],
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
          message: `Message send failed: ${error.message}`,
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
    requiredRoles: ['admin', 'super_admin'],
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
          message: `Team formation failed: ${error.message}`,
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
    requiredRoles: ['admin', 'super_admin'],
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
          message: `Trust evaluation failed: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  console.log('[Cognitive Brain] Registered 4 A2A communication actions');

  // ============================================================================
  // REINFORCEMENT LEARNING ACTIONS
  // ============================================================================

  helpaiOrchestrator.registerAction({
    actionId: 'learning.record_experience',
    name: 'Record Learning Experience',
    category: 'automation',
    description: 'Record an experience (success/failure) for agent learning and confidence calibration',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId, domain, action, outcome, humanIntervention, feedback, context } = request.payload || {};
      
      if (!agentId || !domain || !action || !outcome) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: agentId, domain, action, outcome',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const experience = reinforcementLearningLoop.recordExperience({
          agentId,
          domain: domain as KnowledgeDomain,
          action,
          outcome,
          humanIntervention: humanIntervention || false,
          feedback,
          contextWindow: context || {},
          executionTimeMs: Date.now() - startTime,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: experience,
          message: `Experience recorded: ${agentId}/${action} -> ${outcome} (reward: ${experience.reward.toFixed(2)})`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to record experience: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'learning.get_confidence',
    name: 'Get Agent Confidence',
    category: 'automation',
    description: 'Get the current confidence level for an agent performing a specific action',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId, domain, action } = request.payload || {};
      
      if (!agentId || !domain || !action) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: agentId, domain, action',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        const confidence = reinforcementLearningLoop.getConfidence(agentId, domain as KnowledgeDomain, action);
        const shouldExplore = reinforcementLearningLoop.shouldExplore(agentId, domain as KnowledgeDomain, action);
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            confidence,
            shouldExplore,
            confidenceLevel: confidence > 0.8 ? 'high' : confidence > 0.5 ? 'medium' : 'low',
          },
          message: `Agent ${agentId} has ${(confidence * 100).toFixed(0)}% confidence for ${action}. ${shouldExplore ? 'Exploration recommended.' : 'Exploitation recommended.'}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get confidence: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'learning.get_metrics',
    name: 'Get Learning Metrics',
    category: 'automation',
    description: 'Get comprehensive learning metrics including success rates, problem areas, and improvement trends',
    requiredRoles: ['manager', 'admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId, domain, sinceDays } = request.payload || {};
      
      try {
        const metrics = reinforcementLearningLoop.getMetrics({
          agentId,
          domain: domain as KnowledgeDomain,
          sinceDays: sinceDays || 30,
        });
        
        return {
          success: true,
          actionId: request.actionId,
          data: metrics,
          message: `Learning metrics: ${metrics.totalExperiences} experiences, ${(metrics.successRate * 100).toFixed(0)}% success, ${(metrics.escalationRate * 100).toFixed(0)}% escalation, trend ${metrics.improvementTrend > 0 ? '↑' : metrics.improvementTrend < 0 ? '↓' : '→'}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get metrics: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'learning.get_adaptations',
    name: 'Get Strategy Adaptations',
    category: 'automation',
    description: 'List all strategy adaptations that have been proposed or applied',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { agentId } = request.payload || {};
      
      try {
        const adaptations = reinforcementLearningLoop.getAdaptations(agentId);
        
        return {
          success: true,
          actionId: request.actionId,
          data: {
            adaptations,
            totalCount: adaptations.length,
            validatedCount: adaptations.filter(a => a.validated).length,
          },
          message: `${adaptations.length} strategy adaptations found (${adaptations.filter(a => a.validated).length} validated)`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to get adaptations: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  helpaiOrchestrator.registerAction({
    actionId: 'learning.validate_adaptation',
    name: 'Validate Strategy Adaptation',
    category: 'automation',
    description: 'Mark a strategy adaptation as effective or ineffective for learning feedback',
    requiredRoles: ['admin', 'super_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const startTime = Date.now();
      const { adaptationId, wasEffective } = request.payload || {};
      
      if (!adaptationId || wasEffective === undefined) {
        return {
          success: false,
          actionId: request.actionId,
          message: 'Missing required parameters: adaptationId, wasEffective',
          executionTimeMs: Date.now() - startTime,
        };
      }
      
      try {
        reinforcementLearningLoop.validateAdaptation(adaptationId, wasEffective);
        
        return {
          success: true,
          actionId: request.actionId,
          data: { adaptationId, wasEffective },
          message: `Adaptation ${adaptationId} marked as ${wasEffective ? 'effective' : 'ineffective'}`,
          executionTimeMs: Date.now() - startTime,
        };
      } catch (error: any) {
        return {
          success: false,
          actionId: request.actionId,
          message: `Failed to validate adaptation: ${error.message}`,
          executionTimeMs: Date.now() - startTime,
        };
      }
    },
  });

  console.log('[Cognitive Brain] Registered 5 reinforcement learning actions');

  // ============================================================================
  // SUMMARY
  // ============================================================================

  console.log('[Cognitive Brain] Total: 19 cognitive intelligence actions registered');
  console.log('[Cognitive Brain] Categories: API Integration (5), Knowledge Graph (5), A2A Communication (4), Reinforcement Learning (5)');
}
