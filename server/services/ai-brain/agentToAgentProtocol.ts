/**
 * AGENT-TO-AGENT (A2A) COMMUNICATION PROTOCOL
 * ============================================
 * Fortune 500-grade direct messaging between subagents.
 * Enables parallel processing, role-based collaboration,
 * and trust frameworks for autonomous operation.
 * 
 * Key Capabilities:
 * - Direct agent messaging without orchestrator overhead
 * - Role-based collaboration teams for multi-stage tasks
 * - Trust frameworks for inter-agent data validation
 * - Negotiation protocols for conflict resolution
 */

import { platformEventBus } from '../platformEventBus';
import { sharedKnowledgeGraph, type KnowledgeDomain, type LearningEntry } from './sharedKnowledgeGraph';
import { a2aProtocolRepository } from './cognitiveRepositories';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('agentToAgentProtocol');

// ============================================================================
// TYPES - AGENT IDENTITY
// ============================================================================

export interface AgentProfile {
  id: string;
  name: string;
  role: AgentRole;
  domain: KnowledgeDomain;
  capabilities: string[];
  trustScore: number;
  lastActiveAt: Date;
  messagesSent: number;
  messagesReceived: number;
  successRate: number;
  status: 'active' | 'busy' | 'offline' | 'suspended';
}

export type AgentRole = 
  | 'coordinator'
  | 'executor'
  | 'validator'
  | 'analyst'
  | 'specialist'
  | 'monitor';

// ============================================================================
// TYPES - MESSAGING
// ============================================================================

export interface A2AMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: MessageType;
  priority: MessagePriority;
  payload: any;
  correlationId?: string;
  replyTo?: string;
  timestamp: Date;
  expiresAt?: Date;
  status: MessageStatus;
  metadata?: Record<string, any>;
}

export type MessageType = 
  | 'request'
  | 'response'
  | 'broadcast'
  | 'negotiation'
  | 'validation_request'
  | 'validation_result'
  | 'knowledge_share'
  | 'error_report'
  | 'status_update'
  | 'handoff';

export type MessagePriority = 'critical' | 'high' | 'normal' | 'low';
export type MessageStatus = 'pending' | 'delivered' | 'processed' | 'expired' | 'failed';

// ============================================================================
// TYPES - COLLABORATION
// ============================================================================

export interface CollaborationTeam {
  id: string;
  name: string;
  purpose: string;
  coordinator: string;
  members: TeamMember[];
  status: 'forming' | 'active' | 'completing' | 'disbanded';
  createdAt: Date;
  completedAt?: Date;
  taskId?: string;
  results?: any;
}

export interface TeamMember {
  agentId: string;
  role: string;
  joinedAt: Date;
  contribution?: any;
  status: 'assigned' | 'working' | 'completed' | 'failed';
}

// ============================================================================
// TYPES - TRUST
// ============================================================================

export interface TrustRule {
  id: string;
  sourceAgent: string;
  targetAgent: string;
  dataType: string;
  conditions: TrustCondition[];
  trustLevel: TrustLevel;
  createdAt: Date;
}

export interface TrustCondition {
  type: 'latency' | 'accuracy' | 'freshness' | 'source_trust';
  operator: 'lt' | 'gt' | 'eq' | 'gte' | 'lte';
  value: number;
  unit?: string;
}

export type TrustLevel = 'full' | 'verified' | 'conditional' | 'none';

export interface TrustEvaluation {
  trusted: boolean;
  level: TrustLevel;
  conditions: { met: boolean; condition: TrustCondition }[];
  reason: string;
}

// ============================================================================
// AGENT-TO-AGENT PROTOCOL SERVICE
// ============================================================================

class AgentToAgentProtocol {
  private static instance: AgentToAgentProtocol;

  private agents: Map<string, AgentProfile> = new Map();
  private messageQueues: Map<string, A2AMessage[]> = new Map();
  private teams: Map<string, CollaborationTeam> = new Map();
  private trustRules: Map<string, TrustRule> = new Map();
  private messageHandlers: Map<string, (message: A2AMessage) => Promise<any>> = new Map();

  private dbInitialized = false;

  static getInstance(): AgentToAgentProtocol {
    if (!this.instance) {
      this.instance = new AgentToAgentProtocol();
      this.instance.initializeCoreAgents();
      this.instance.loadFromDatabase().catch(err => {
        log.error('[A2A Protocol] Failed to load from database:', (err instanceof Error ? err.message : String(err)));
      });
    }
    return this.instance;
  }

  /**
   * Load agents and teams from database on startup
   */
  private async loadFromDatabase(): Promise<void> {
    if (this.dbInitialized) return;
    
    try {
      const dbAgents = await a2aProtocolRepository.getAllAgents();

      for (const dbAgent of dbAgents) {
        if (!this.agents.has(dbAgent.id)) {
          const agent: AgentProfile = {
            id: dbAgent.id,
            name: dbAgent.name,
            role: dbAgent.role as AgentRole,
            domain: (dbAgent.domains?.[0] || 'general') as KnowledgeDomain,
            capabilities: dbAgent.capabilities || [],
            trustScore: parseFloat(dbAgent.trustLevel || '0.5'),
            lastActiveAt: dbAgent.lastActive || new Date(),
            messagesSent: dbAgent.messageCount || 0,
            messagesReceived: 0,
            successRate: dbAgent.successCount && dbAgent.messageCount 
              ? dbAgent.successCount / Math.max(1, dbAgent.messageCount) 
              : 1.0,
            status: (dbAgent.status as any) || 'active',
          };
          this.agents.set(agent.id, agent);
          this.messageQueues.set(agent.id, []);
        }
      }

      this.dbInitialized = true;
      log.info(`[A2A Protocol] Loaded ${dbAgents.length} agents from database`);
    } catch (error: any) {
      log.error('[A2A Protocol] Database load error:', (error instanceof Error ? error.message : String(error)));
    }
  }

  // ============================================================================
  // AGENT REGISTRATION
  // ============================================================================

  registerAgent(profile: Omit<AgentProfile, 'trustScore' | 'lastActiveAt' | 'messagesSent' | 'messagesReceived' | 'successRate'>): AgentProfile {
    const agent: AgentProfile = {
      ...profile,
      trustScore: 0.8,
      lastActiveAt: new Date(),
      messagesSent: 0,
      messagesReceived: 0,
      successRate: 1.0,
    };

    this.agents.set(agent.id, agent);
    this.messageQueues.set(agent.id, []);

    // Persist to database (async, non-blocking)
    a2aProtocolRepository.createAgent({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      status: agent.status,
      capabilities: agent.capabilities,
      domains: [agent.domain],
      trustLevel: agent.trustScore,
    }).catch(err => log.error('[A2A Protocol] DB persist error:', (err instanceof Error ? err.message : String(err))));

    // Internal registration only — intentionally NOT published to platformEventBus.
    // Agent lifecycle events are system-internal and should never surface as user notifications.
    log.info(`[A2A Protocol] Agent registered: ${agent.name} (${agent.role})`);
    return agent;
  }

  registerMessageHandler(agentId: string, handler: (message: A2AMessage) => Promise<any>): void {
    this.messageHandlers.set(agentId, handler);
  }

  getAgent(agentId: string): AgentProfile | undefined {
    return this.agents.get(agentId);
  }

  // ============================================================================
  // DIRECT MESSAGING
  // ============================================================================

  /**
   * Send a direct message to another agent
   */
  async sendMessage(params: {
    from: string;
    to: string;
    type: MessageType;
    payload: any;
    priority?: MessagePriority;
    correlationId?: string;
    replyTo?: string;
    ttlSeconds?: number;
  }): Promise<A2AMessage> {
    const { from, to, type, payload, priority = 'normal', correlationId, replyTo, ttlSeconds } = params;

    const fromAgent = this.agents.get(from);
    const toAgent = this.agents.get(to);

    if (!fromAgent) throw new Error(`Sender agent not found: ${from}`);
    if (!toAgent) throw new Error(`Recipient agent not found: ${to}`);
    if (toAgent.status === 'offline') throw new Error(`Recipient agent is offline: ${to}`);

    const message: A2AMessage = {
      id: crypto.randomUUID(),
      fromAgent: from,
      toAgent: to,
      type,
      priority,
      payload,
      correlationId,
      replyTo,
      timestamp: new Date(),
      expiresAt: ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000) : undefined,
      status: 'pending',
    };

    // Add to recipient's queue
    const queue = this.messageQueues.get(to) || [];
    queue.push(message);
    this.messageQueues.set(to, queue);

    // Update sender stats
    fromAgent.messagesSent++;
    fromAgent.lastActiveAt = new Date();

    // Try to deliver immediately if handler exists
    const handler = this.messageHandlers.get(to);
    if (handler) {
      try {
        message.status = 'delivered';
        toAgent.messagesReceived++;
        toAgent.lastActiveAt = new Date();
        
        const response = await handler(message);
        message.status = 'processed';
        
        // If this was a request, send response back
        if (type === 'request' || type === 'validation_request') {
          await this.sendMessage({
            from: to,
            to: from,
            type: type === 'validation_request' ? 'validation_result' : 'response',
            payload: response,
            correlationId: message.id,
            replyTo: message.id,
          });
        }
      } catch (error: any) {
        message.status = 'failed';
        message.metadata = { error: (error instanceof Error ? error.message : String(error)) };
        
        // Update failure rate
        const totalMessages = fromAgent.messagesSent;
        const failures = Math.round(totalMessages * (1 - fromAgent.successRate)) + 1;
        fromAgent.successRate = 1 - (failures / totalMessages);
      }
    }

    return message;
  }

  /**
   * Broadcast message to multiple agents
   */
  async broadcast(params: {
    from: string;
    type: MessageType;
    payload: any;
    filter?: {
      domain?: KnowledgeDomain;
      role?: AgentRole;
      excludeAgents?: string[];
    };
  }): Promise<A2AMessage[]> {
    const { from, type, payload, filter } = params;
    const messages: A2AMessage[] = [];

    let recipients = Array.from(this.agents.values());

    if (filter?.domain) {
      recipients = recipients.filter(a => a.domain === filter.domain);
    }
    if (filter?.role) {
      recipients = recipients.filter(a => a.role === filter.role);
    }
    if (filter?.excludeAgents) {
      recipients = recipients.filter(a => !filter.excludeAgents!.includes(a.id));
    }

    // Exclude sender
    recipients = recipients.filter(a => a.id !== from);

    for (const recipient of recipients) {
      const message = await this.sendMessage({
        from,
        to: recipient.id,
        type: 'broadcast',
        payload,
      });
      messages.push(message);
    }

    return messages;
  }

  /**
   * Get pending messages for an agent
   */
  getMessages(agentId: string, filter?: {
    type?: MessageType;
    status?: MessageStatus;
    priority?: MessagePriority;
  }): A2AMessage[] {
    let messages = this.messageQueues.get(agentId) || [];

    // Filter expired messages
    const now = new Date();
    messages = messages.filter(m => !m.expiresAt || m.expiresAt > now);

    if (filter?.type) {
      messages = messages.filter(m => m.type === filter.type);
    }
    if (filter?.status) {
      messages = messages.filter(m => m.status === filter.status);
    }
    if (filter?.priority) {
      messages = messages.filter(m => m.priority === filter.priority);
    }

    // Sort by priority then timestamp
    const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
    messages.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.timestamp.getTime() - b.timestamp.getTime();
    });

    return messages;
  }

  // ============================================================================
  // COLLABORATION TEAMS
  // ============================================================================

  /**
   * Form a collaboration team for a complex task
   */
  formTeam(params: {
    name: string;
    purpose: string;
    coordinator: string;
    memberRoles: { agentId: string; role: string }[];
    taskId?: string;
  }): CollaborationTeam {
    const { name, purpose, coordinator, memberRoles, taskId } = params;

    const team: CollaborationTeam = {
      id: crypto.randomUUID(),
      name,
      purpose,
      coordinator,
      members: memberRoles.map(mr => ({
        agentId: mr.agentId,
        role: mr.role,
        joinedAt: new Date(),
        status: 'assigned',
      })),
      status: 'forming',
      createdAt: new Date(),
      taskId,
    };

    this.teams.set(team.id, team);

    // Notify all team members
    for (const member of team.members) {
      this.sendMessage({
        from: coordinator,
        to: member.agentId,
        type: 'request',
        payload: {
          action: 'join_team',
          teamId: team.id,
          role: member.role,
          purpose,
        },
        priority: 'high',
      });
    }

    team.status = 'active';

    platformEventBus.publish({
      type: 'team_formed',
      category: 'feature',
      title: 'Collaboration Team Formed',
      description: `Team "${name}" formed with ${team.members.length} members`,
      metadata: {
        teamId: team.id,
        name,
        memberCount: team.members.length,
      },
    }).catch((err) => log.warn('[agentToAgentProtocol] Fire-and-forget failed:', err));

    log.info(`[A2A Protocol] Team formed: ${name} with ${team.members.length} members`);
    return team;
  }

  /**
   * Submit work from a team member
   */
  submitTeamWork(params: {
    teamId: string;
    agentId: string;
    contribution: any;
    status: 'completed' | 'failed';
  }): void {
    const team = this.teams.get(params.teamId);
    if (!team) return;

    const member = team.members.find(m => m.agentId === params.agentId);
    if (member) {
      member.contribution = params.contribution;
      member.status = params.status;
    }

    // Check if all members have completed
    const allComplete = team.members.every(m => 
      m.status === 'completed' || m.status === 'failed'
    );

    if (allComplete) {
      team.status = 'completing';
      
      // Aggregate results
      team.results = {
        contributions: team.members.map(m => ({
          agentId: m.agentId,
          role: m.role,
          contribution: m.contribution,
          status: m.status,
        })),
        successRate: team.members.filter(m => m.status === 'completed').length / team.members.length,
      };

      team.status = 'disbanded';
      team.completedAt = new Date();

      // Record learning
      sharedKnowledgeGraph.recordLearning({
        domain: 'automation',
        agentId: team.coordinator,
        action: 'team_collaboration',
        context: { teamId: team.id, purpose: team.purpose },
        outcome: team.results.successRate > 0.8 ? 'success' : team.results.successRate > 0.5 ? 'partial' : 'failure',
        reward: team.results.successRate,
        insights: [`Team ${team.name} completed with ${(team.results.successRate * 100).toFixed(0)}% success`],
      });

      platformEventBus.publish({
        type: 'team_completed',
        category: 'feature',
        title: 'Collaboration Team Completed',
        description: `Team completed with ${(team.results.successRate * 100).toFixed(0)}% success`,
        metadata: {
          teamId: team.id,
          successRate: team.results.successRate,
        },
      }).catch((err) => log.warn('[agentToAgentProtocol] Fire-and-forget failed:', err));
    }
  }

  getTeam(teamId: string): CollaborationTeam | undefined {
    return this.teams.get(teamId);
  }

  // ============================================================================
  // TRUST FRAMEWORK
  // ============================================================================

  /**
   * Define a trust rule between agents
   */
  defineTrustRule(params: {
    sourceAgent: string;
    targetAgent: string;
    dataType: string;
    conditions: TrustCondition[];
    trustLevel: TrustLevel;
  }): TrustRule {
    const rule: TrustRule = {
      id: crypto.randomUUID(),
      ...params,
      createdAt: new Date(),
    };

    this.trustRules.set(rule.id, rule);
    return rule;
  }

  /**
   * Evaluate trust for a specific data transfer
   */
  evaluateTrust(params: {
    sourceAgent: string;
    targetAgent: string;
    dataType: string;
    metadata?: {
      latencyMs?: number;
      accuracy?: number;
      freshnessSeconds?: number;
    };
  }): TrustEvaluation {
    const { sourceAgent, targetAgent, dataType, metadata = {} } = params;

    // Find applicable rules
    const rules = Array.from(this.trustRules.values())
      .filter(r => 
        r.sourceAgent === sourceAgent &&
        r.targetAgent === targetAgent &&
        r.dataType === dataType
      );

    if (rules.length === 0) {
      // No rules = default conditional trust based on agent trust score
      const source = this.agents.get(sourceAgent);
      return {
        trusted: source ? source.trustScore > 0.6 : false,
        level: source && source.trustScore > 0.8 ? 'verified' : 'conditional',
        conditions: [],
        reason: 'No explicit trust rules defined, using agent trust score',
      };
    }

    // Evaluate conditions
    const rule = rules[0];
    const conditionResults: { met: boolean; condition: TrustCondition }[] = [];

    for (const condition of rule.conditions) {
      let value: number | undefined;
      
      switch (condition.type) {
        case 'latency':
          value = metadata.latencyMs;
          break;
        case 'accuracy':
          value = metadata.accuracy;
          break;
        case 'freshness':
          value = metadata.freshnessSeconds;
          break;
        case 'source_trust':
          value = this.agents.get(sourceAgent)?.trustScore;
          break;
      }

      let met = false;
      if (value !== undefined) {
        switch (condition.operator) {
          case 'lt': met = value < condition.value; break;
          case 'gt': met = value > condition.value; break;
          case 'eq': met = value === condition.value; break;
          case 'gte': met = value >= condition.value; break;
          case 'lte': met = value <= condition.value; break;
        }
      }

      conditionResults.push({ met, condition });
    }

    const allConditionsMet = conditionResults.every(r => r.met);

    return {
      trusted: allConditionsMet,
      level: allConditionsMet ? rule.trustLevel : 'none',
      conditions: conditionResults,
      reason: allConditionsMet 
        ? `All ${conditionResults.length} trust conditions met`
        : `${conditionResults.filter(r => !r.met).length} conditions not met`,
    };
  }

  /**
   * Update agent trust score based on interaction
   */
  updateTrustScore(agentId: string, success: boolean, weight: number = 1.0): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Exponential moving average
    const alpha = 0.1 * weight;
    const newValue = success ? 1.0 : 0.0;
    agent.trustScore = agent.trustScore * (1 - alpha) + newValue * alpha;

    // Clamp to [0.1, 1.0]
    agent.trustScore = Math.max(0.1, Math.min(1.0, agent.trustScore));
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  private initializeCoreAgents(): void {
    // Register core system agents
    this.registerAgent({
      id: 'scheduling-subagent',
      name: 'Scheduling Subagent',
      role: 'specialist',
      domain: 'scheduling',
      capabilities: ['shift_creation', 'conflict_detection', 'optimization', 'staffing_forecast'],
      status: 'active',
    });

    this.registerAgent({
      id: 'payroll-subagent',
      name: 'Payroll Subagent',
      role: 'specialist',
      domain: 'payroll',
      capabilities: ['calculation', 'tax_withholding', 'anomaly_detection', 'audit'],
      status: 'active',
    });

    this.registerAgent({
      id: 'compliance-subagent',
      name: 'Compliance Subagent',
      role: 'validator',
      domain: 'compliance',
      capabilities: ['certification_check', 'labor_law_validation', 'audit_preparation'],
      status: 'active',
    });

    this.registerAgent({
      id: 'invoice-subagent',
      name: 'Invoice Subagent',
      role: 'specialist',
      domain: 'invoicing',
      capabilities: ['generation', 'reconciliation', 'payment_tracking', 'revenue_analysis'],
      status: 'active',
    });

    this.registerAgent({
      id: 'notification-subagent',
      name: 'Notification Subagent',
      role: 'executor',
      domain: 'automation',
      capabilities: ['push_notification', 'email', 'sms', 'in_app'],
      status: 'active',
    });

    this.registerAgent({
      id: 'analytics-subagent',
      name: 'Analytics Subagent',
      role: 'analyst',
      domain: 'performance',
      capabilities: ['trend_analysis', 'kpi_calculation', 'forecasting', 'visualization'],
      status: 'active',
    });

    this.registerAgent({
      id: 'trinity-coordinator',
      name: 'Trinity AI Coordinator',
      role: 'coordinator',
      domain: 'general',
      capabilities: ['orchestration', 'planning', 'delegation', 'human_interaction'],
      status: 'active',
    });

    // Define default trust rules
    this.defineTrustRule({
      sourceAgent: 'scheduling-subagent',
      targetAgent: 'payroll-subagent',
      dataType: 'time_tracking',
      conditions: [
        { type: 'latency', operator: 'lt', value: 5000, unit: 'ms' },
        { type: 'freshness', operator: 'lt', value: 300, unit: 'seconds' },
      ],
      trustLevel: 'verified',
    });

    this.defineTrustRule({
      sourceAgent: 'payroll-subagent',
      targetAgent: 'invoice-subagent',
      dataType: 'labor_costs',
      conditions: [
        { type: 'accuracy', operator: 'gte', value: 0.99 },
        { type: 'source_trust', operator: 'gte', value: 0.8 },
      ],
      trustLevel: 'full',
    });

    log.info(`[A2A Protocol] Initialized ${this.agents.size} core agents`);
  }

  // ============================================================================
  // STATS
  // ============================================================================

  getStats(): {
    agentCount: number;
    activeAgents: number;
    totalMessages: number;
    activeTeams: number;
    trustRules: number;
  } {
    const allMessages = Array.from(this.messageQueues.values()).flat();
    
    return {
      agentCount: this.agents.size,
      activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'active').length,
      totalMessages: allMessages.length,
      activeTeams: Array.from(this.teams.values()).filter(t => t.status === 'active').length,
      trustRules: this.trustRules.size,
    };
  }

  getAgentList(): AgentProfile[] {
    return Array.from(this.agents.values());
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const agentToAgentProtocol = AgentToAgentProtocol.getInstance();

log.info('[A2A Protocol] Agent-to-Agent communication protocol initialized');
