/**
 * COGNITIVE DATABASE REPOSITORIES
 * ================================
 * Fortune 500-grade database persistence for cognitive services.
 * Provides write-through caching with database durability for:
 * - Shared Knowledge Graph
 * - Agent-to-Agent Protocol
 * - Reinforcement Learning Loop
 */

import { db } from '../../db';
import { createLogger } from '../../lib/logger';
import { eq, and, desc, sql, gte, inArray } from 'drizzle-orm';
import {
  knowledgeEntities,
  knowledgeRelationships,
  a2aAgents,
  a2aMessages,
  a2aTeams,
  a2aTrustRules,
  aiLearningEvents,
  type InsertKnowledgeEntity,
  type InsertKnowledgeRelationship,
  type KnowledgeEntityRecord,
  type KnowledgeRelationshipRecord,
} from '@shared/schema';
import { typedExec } from '../../lib/typedSql';

const log = createLogger('CognitiveRepositories');

// ============================================================================
// KNOWLEDGE GRAPH REPOSITORY
// ============================================================================

export class KnowledgeGraphRepository {
  private static instance: KnowledgeGraphRepository;

  static getInstance(): KnowledgeGraphRepository {
    if (!this.instance) {
      this.instance = new KnowledgeGraphRepository();
    }
    return this.instance;
  }

  async createEntity(entity: {
    id: string;
    entityType: string;
    domain: string;
    workspaceId?: string;
    name: string;
    content: string;
    confidence?: number;
    sourceAgent?: string;
    sourceAction?: string;
    metadata?: Record<string, any>;
  }): Promise<KnowledgeEntityRecord | null> {
    try {
      const [result] = await db.insert(knowledgeEntities).values({
        id: entity.id,
        type: entity.entityType as any,
        domain: entity.domain as any,
        workspaceId: entity.workspaceId,
        name: entity.name,
        description: entity.content,
        confidence: entity.confidence ? Number(entity.confidence) : 0.5,
        createdBy: entity.sourceAgent || 'system',
        attributes: { ...(entity.metadata || {}), sourceAction: entity.sourceAction },
        usageCount: 0,
      }).returning();
      log.info(`[KnowledgeGraphRepo] Entity persisted: ${entity.name}`);
      return result;
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to persist entity:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getEntity(id: string): Promise<KnowledgeEntityRecord | null> {
    try {
      const [entity] = await db.select().from(knowledgeEntities).where(eq(knowledgeEntities.id, id));
      if (entity) {
        await db.update(knowledgeEntities)
          .set({ usageCount: sql`usage_count + 1`, lastAccessedAt: new Date() })
          .where(eq(knowledgeEntities.id, id));
      }
      return entity || null;
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get entity:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getEntitiesByDomain(domain: string, limit = 100): Promise<KnowledgeEntityRecord[]> {
    try {
      return await db.select().from(knowledgeEntities)
        .where(eq(knowledgeEntities.domain, domain as any))
        .orderBy(desc(knowledgeEntities.usageCount))
        .limit(limit);
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get entities by domain:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getEntitiesByType(entityType: string, workspaceId?: string, limit = 100): Promise<KnowledgeEntityRecord[]> {
    try {
      const conditions: any[] = [eq(knowledgeEntities.type, entityType as any)];
      if (workspaceId) conditions.push(eq(knowledgeEntities.workspaceId, workspaceId));
      return await db.select().from(knowledgeEntities)
        .where(and(...conditions))
        .orderBy(desc(knowledgeEntities.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get entities by type:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getAllEntities(limit = 500): Promise<KnowledgeEntityRecord[]> {
    try {
      return await db.select().from(knowledgeEntities)
        .orderBy(desc(knowledgeEntities.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get all entities:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async createRelationship(rel: {
    id: string;
    sourceId: string;
    targetId: string;
    relationship: string;
    strength?: number;
    bidirectional?: boolean;
    evidence?: string;
    createdBy?: string;
  }): Promise<KnowledgeRelationshipRecord | null> {
    try {
      const [result] = await db.insert(knowledgeRelationships).values({
        workspaceId: 'system',
        id: rel.id,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        type: rel.relationship as any,
        strength: rel.strength ? Number(rel.strength) : 0.5,
        metadata: { bidirectional: rel.bidirectional || false, evidence: rel.evidence },
        createdBy: rel.createdBy || 'system',
      }).returning();
      log.info(`[KnowledgeGraphRepo] Relationship persisted: ${rel.sourceId} -> ${rel.targetId}`);
      return result;
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to persist relationship:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getRelationshipsForEntity(entityId: string): Promise<KnowledgeRelationshipRecord[]> {
    try {
      return await db.select().from(knowledgeRelationships)
        .where(eq(knowledgeRelationships.sourceId, entityId));
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get relationships:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getAllRelationships(limit = 500): Promise<KnowledgeRelationshipRecord[]> {
    try {
      return await db.select().from(knowledgeRelationships)
        .orderBy(desc(knowledgeRelationships.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get all relationships:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getStats(): Promise<{ entityCount: number; relationshipCount: number; domainBreakdown: Record<string, number> }> {
    try {
      const entities = await db.select({ count: sql<number>`count(*)` }).from(knowledgeEntities);
      const relationships = await db.select({ count: sql<number>`count(*)` }).from(knowledgeRelationships);
      const domainCounts = await db.select({
        domain: knowledgeEntities.domain,
        count: sql<number>`count(*)`
      }).from(knowledgeEntities).groupBy(knowledgeEntities.domain);

      const domainBreakdown: Record<string, number> = {};
      for (const d of domainCounts) {
        domainBreakdown[d.domain] = Number(d.count);
      }

      return {
        entityCount: Number(entities[0]?.count || 0),
        relationshipCount: Number(relationships[0]?.count || 0),
        domainBreakdown,
      };
    } catch (error: any) {
      log.error(`[KnowledgeGraphRepo] Failed to get stats:`, (error instanceof Error ? error.message : String(error)));
      return { entityCount: 0, relationshipCount: 0, domainBreakdown: {} };
    }
  }
}

// ============================================================================
// A2A PROTOCOL REPOSITORY
// ============================================================================

export class A2AProtocolRepository {
  private static instance: A2AProtocolRepository;

  static getInstance(): A2AProtocolRepository {
    if (!this.instance) {
      this.instance = new A2AProtocolRepository();
    }
    return this.instance;
  }

  async createAgent(agent: {
    id: string;
    name: string;
    role: string;
    status?: string;
    capabilities?: string[];
    domains?: string[];
    trustLevel?: number;
    metadata?: Record<string, any>;
  }): Promise<any> {
    try {
      // ON CONFLICT (id) DO NOTHING so restarts don't error on the
      // 7 core subagent seed inserts (payroll-subagent, invoice-subagent,
      // scheduling-subagent, analytics-subagent, notification-subagent,
      // compliance-subagent, trinity-coordinator). Railway log forensics
      // 2026-04-08. Uses `.returning()` after the conflict clause — when
      // a row is skipped due to conflict, `result` will be undefined and
      // the logging code below handles that cleanly.
      const [result] = await db.insert(a2aAgents).values({
        workspaceId: 'system',
        id: agent.id,
        name: agent.name,
        role: agent.role as any,
        status: (agent.status || 'active') as any,
        capabilities: agent.capabilities || [],
        domain: (agent.domains?.[0] || 'general') as any,
        trustScore: agent.trustLevel ? Number(agent.trustLevel) : 0.8,
        messagesSent: 0,
        messagesReceived: 0,
        successRate: 1.0,
      }).onConflictDoNothing({ target: a2aAgents.id }).returning();
      log.info(`[A2ARepo] Agent persisted: ${agent.name}`);
      return result;
    } catch (error: any) {
      if (error.code === '23505') {
        return this.updateAgent(agent.id, agent);
      }
      log.error(`[A2ARepo] Failed to persist agent:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getAgent(id: string): Promise<any> {
    try {
      const [agent] = await db.select().from(a2aAgents).where(eq(a2aAgents.id, id));
      return agent || null;
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to get agent:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async updateAgent(id: string, updates: Partial<{
    status: string;
    trustLevel: number;
    lastActive: Date;
    messageCount: number;
    successCount: number;
    failureCount: number;
  }>): Promise<any> {
    try {
      const updateData: any = { updatedAt: new Date() };
      if (updates.status) updateData.status = updates.status;
      if (updates.trustLevel !== undefined) updateData.trustScore = Number(updates.trustLevel);
      if (updates.lastActive) updateData.lastActiveAt = updates.lastActive;
      if (updates.messageCount !== undefined) updateData.messagesSent = updates.messageCount;

      const [result] = await db.update(a2aAgents).set(updateData).where(eq(a2aAgents.id, id)).returning();
      return result;
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to update agent:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getAllAgents(): Promise<any[]> {
    try {
      return await db.select().from(a2aAgents).orderBy(desc(a2aAgents.createdAt));
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to get all agents:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async createMessage(message: {
    id: string;
    senderId: string;
    recipientId?: string;
    teamId?: string;
    messageType: string;
    priority?: string;
    status?: string;
    subject?: string;
    content: Record<string, any>;
    correlationId?: string;
    replyTo?: string;
    ttlSeconds?: number;
  }): Promise<any> {
    try {
      const expiresAt = message.ttlSeconds
        ? new Date(Date.now() + (message.ttlSeconds * 1000))
        : new Date(Date.now() + 300000);
      const [result] = await db.insert(a2aMessages).values({
        workspaceId: 'system',
        id: message.id,
        fromAgent: message.senderId,
        toAgent: message.recipientId || 'broadcast',
        type: message.messageType as any,
        priority: (message.priority || 'normal') as any,
        status: (message.status || 'pending') as any,
        payload: { subject: message.subject, ...message.content },
        correlationId: message.correlationId,
        replyTo: message.replyTo,
        expiresAt,
      }).returning();
      return result;
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to persist message:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async updateMessageStatus(id: string, status: string, deliveredAt?: Date, acknowledgedAt?: Date): Promise<void> {
    try {
      const updateData: any = { status };
      if (acknowledgedAt) updateData.processedAt = acknowledgedAt;
      await db.update(a2aMessages).set(updateData).where(eq(a2aMessages.id, id));
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to update message status:`, (error instanceof Error ? error.message : String(error)));
    }
  }

  async getMessagesForAgent(agentId: string, limit = 50): Promise<any[]> {
    try {
      return await db.select().from(a2aMessages)
        .where(eq(a2aMessages.toAgent, agentId))
        .orderBy(desc(a2aMessages.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to get messages:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async createTeam(team: {
    id: string;
    name: string;
    purpose?: string;
    leaderId?: string;
    memberIds?: string[];
    taskType?: string;
    status?: string;
  }): Promise<any> {
    try {
      const [result] = await db.insert(a2aTeams).values({
        workspaceId: 'system',
        id: team.id,
        name: team.name,
        purpose: team.purpose,
        coordinator: team.leaderId || 'unknown',
        members: (team.memberIds || []).map((id: string) => ({ agentId: id })),
        taskId: team.taskType,
        status: team.status || 'forming',
      }).returning();
      log.info(`[A2ARepo] Team persisted: ${team.name}`);
      return result;
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to persist team:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async createTrustRule(rule: {
    id: string;
    agentId: string;
    trustedAgentId?: string;
    capability?: string;
    condition?: string;
    trustLevel?: number;
    validationRequired?: boolean;
    expiresAt?: Date;
  }): Promise<any> {
    try {
      const [result] = await db.insert(a2aTrustRules).values({
        workspaceId: 'system',
        id: rule.id,
        sourceAgent: rule.agentId,
        targetAgent: rule.trustedAgentId || 'any',
        dataType: rule.capability || 'general',
        conditions: rule.condition ? [{ condition: rule.condition, validationRequired: rule.validationRequired || false }] : [],
        trustLevel: rule.trustLevel !== undefined ? (rule.trustLevel > 0.8 ? 'full' : rule.trustLevel > 0.5 ? 'verified' : 'conditional') : 'conditional',
      }).returning();
      return result;
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to persist trust rule:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getTrustRulesForAgent(agentId: string): Promise<any[]> {
    try {
      return await db.select().from(a2aTrustRules).where(eq(a2aTrustRules.sourceAgent, agentId));
    } catch (error: any) {
      log.error(`[A2ARepo] Failed to get trust rules:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }
}

// ============================================================================
// REINFORCEMENT LEARNING REPOSITORY
// ============================================================================

export class RLLoopRepository {
  private static instance: RLLoopRepository;

  static getInstance(): RLLoopRepository {
    if (!this.instance) {
      this.instance = new RLLoopRepository();
    }
    return this.instance;
  }

  async createExperience(exp: {
    id: string;
    agentId: string;
    actionType: string;
    context: Record<string, any>;
    parameters?: Record<string, any>;
    outcome: string;
    reward?: number;
    successIndicators?: Record<string, any>;
    failureReasons?: string[];
    executionTimeMs?: number;
    resourceUsage?: Record<string, any>;
    workspaceId?: string;
    userId?: string;
    feedbackSource?: string;
    humanValidated?: boolean;
    validationNotes?: string;
  }): Promise<any> {
    try {
      const payload = JSON.stringify({
        context: exp.context,
        parameters: exp.parameters ?? {},
        successIndicators: exp.successIndicators ?? {},
        failureReasons: exp.failureReasons ?? [],
        executionTimeMs: exp.executionTimeMs ?? 0,
        resourceUsage: exp.resourceUsage ?? {},
        userId: exp.userId,
        feedbackSource: exp.feedbackSource,
        humanValidated: exp.humanValidated ?? false,
        validationNotes: exp.validationNotes,
      });
      // Converted to Drizzle ORM: ON CONFLICT → onConflictDoNothing
      const result = await db.insert(aiLearningEvents).values({
        id: exp.id,
        eventType: 'experience',
        agentId: exp.agentId,
        actionType: exp.actionType,
        action: exp.actionType,
        outcome: exp.outcome,
        reward: String(exp.reward ?? 0),
        workspaceId: exp.workspaceId ?? null,
        humanIntervention: exp.humanValidated ?? false,
        confidenceLevel: 0.5,
        domain: 'general',
        data: JSON.parse(payload),
      }).onConflictDoNothing({ target: aiLearningEvents.id }).returning({ id: aiLearningEvents.id });
      log.verbose(`[RLRepo] Experience persisted: ${exp.agentId}/${exp.actionType} -> ${exp.outcome}`);
      return result?.[0] ?? null;
    } catch (error: any) {
      log.error(`[RLRepo] Failed to persist experience:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getExperiencesForAgent(agentId: string, limit = 100): Promise<any[]> {
    try {
      return await db.select().from(aiLearningEvents)
        .where(and(eq(aiLearningEvents.eventType, 'experience'), eq(aiLearningEvents.agentId, agentId)))
        .orderBy(desc(aiLearningEvents.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get experiences:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getExperiencesByAction(agentId: string, actionType: string, limit = 50): Promise<any[]> {
    try {
      return await db.select().from(aiLearningEvents)
        .where(and(
          eq(aiLearningEvents.eventType, 'experience'),
          eq(aiLearningEvents.agentId, agentId),
          eq(aiLearningEvents.action, actionType)
        ))
        .orderBy(desc(aiLearningEvents.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get experiences by action:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getAllExperiences(limit = 500): Promise<any[]> {
    try {
      return await db.select().from(aiLearningEvents)
        .where(eq(aiLearningEvents.eventType, 'experience'))
        .orderBy(desc(aiLearningEvents.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get all experiences:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async upsertConfidenceModel(model: {
    id: string;
    agentId: string;
    actionType: string;
    currentConfidence: number;
    sampleCount: number;
    successRate: number;
    recentTrend?: string;
    minConfidenceSeen?: number;
    maxConfidenceSeen?: number;
    decayFactor?: number;
    learningRate?: number;
  }): Promise<any> {
    try {
      const payload = JSON.stringify({
        current_confidence: model.currentConfidence,
        sample_count: model.sampleCount,
        success_rate: model.successRate,
        recent_trend: model.recentTrend ?? 'stable',
        min_confidence_seen: model.minConfidenceSeen ?? model.currentConfidence,
        max_confidence_seen: model.maxConfidenceSeen ?? model.currentConfidence,
        decay_factor: model.decayFactor ?? 0.95,
        learning_rate: model.learningRate ?? 0.1,
      });
      // CATEGORY C — Genuine schema mismatch: ON CONFLICT uses partial unique index (agent_id, action_type) WHERE event_type = 'confidence_update' which Drizzle onConflictDoUpdate cannot express (no WHERE clause support in conflict target) | Cannot convert until schema aligned
      const result = await typedExec(sql`
        INSERT INTO ai_learning_events (
          id, event_type, agent_id, action_type, action, domain,
          confidence_level, data
        ) VALUES (
          ${model.id},
          'confidence_update',
          ${model.agentId},
          ${model.actionType},
          ${model.actionType},
          'general',
          ${model.currentConfidence},
          ${payload}::jsonb
        )
        ON CONFLICT (agent_id, action_type) WHERE event_type = 'confidence_update'
        DO UPDATE SET
          confidence_level = EXCLUDED.confidence_level,
          data = EXCLUDED.data,
          updated_at = NOW()
        RETURNING id
      `);
      log.verbose(`[RLRepo] Confidence model upserted: ${model.agentId}/${model.actionType}`);
      return (result as unknown as any[])[0] ?? null;
    } catch (error: any) {
      log.error(`[RLRepo] Failed to upsert confidence model:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getConfidenceModel(agentId: string, actionType: string): Promise<any> {
    try {
      const [model] = await db.select().from(aiLearningEvents)
        .where(and(
          eq(aiLearningEvents.eventType, 'confidence_update'),
          eq(aiLearningEvents.agentId, agentId),
          eq(aiLearningEvents.action, actionType)
        ));
      return model || null;
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get confidence model:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getAllConfidenceModels(): Promise<any[]> {
    try {
      return await db.select().from(aiLearningEvents)
        .where(eq(aiLearningEvents.eventType, 'confidence_update'))
        .orderBy(desc(aiLearningEvents.updatedAt));
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get all confidence models:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async createStrategyAdaptation(adaptation: {
    id: string;
    agentId: string;
    actionType: string;
    oldStrategy: Record<string, any>;
    newStrategy: Record<string, any>;
    triggerReason: string;
    triggerMetrics?: Record<string, any>;
    confidenceBefore?: number;
    confidenceAfter?: number;
    validated?: boolean;
    validationResult?: string;
    rollbackAvailable?: boolean;
    rolledBack?: boolean;
  }): Promise<any> {
    try {
      const [result] = await db.insert(aiLearningEvents).values({
        id: adaptation.id,
        eventType: 'strategy_adaptation',
        agentId: adaptation.agentId,
        action: adaptation.actionType,
        actionType: adaptation.actionType,
        domain: 'general',
        workspaceId: 'system',
        data: {
          previousStrategy: adaptation.oldStrategy,
          newStrategy: adaptation.newStrategy,
          triggerReason: adaptation.triggerReason,
          triggerMetrics: adaptation.triggerMetrics,
          expectedImprovement: adaptation.confidenceAfter && adaptation.confidenceBefore
            ? adaptation.confidenceAfter - adaptation.confidenceBefore : 0,
          validated: adaptation.validated || false,
          validationResult: adaptation.validationResult ?? null,
        },
      }).returning();
      log.info(`[RLRepo] Strategy adaptation persisted: ${adaptation.agentId}/${adaptation.actionType}`);
      return result;
    } catch (error: any) {
      log.error(`[RLRepo] Failed to persist strategy adaptation:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  async getAdaptationsForAgent(agentId: string, limit = 20): Promise<any[]> {
    try {
      return await db.select().from(aiLearningEvents)
        .where(and(eq(aiLearningEvents.eventType, 'strategy_adaptation'), eq(aiLearningEvents.agentId, agentId)))
        .orderBy(desc(aiLearningEvents.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get adaptations:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  async getMetrics(): Promise<{
    totalExperiences: number;
    successRate: number;
    avgReward: number;
    modelCount: number;
    adaptationCount: number;
  }> {
    try {
      const expCount = await db.select({ count: sql<number>`count(*)` }).from(aiLearningEvents)
        .where(eq(aiLearningEvents.eventType, 'experience'));
      const successCount = await db.select({ count: sql<number>`count(*)` }).from(aiLearningEvents)
        .where(and(eq(aiLearningEvents.eventType, 'experience'), eq(aiLearningEvents.outcome, 'success')));
      const avgReward = await db.select({ avg: sql<number>`avg(cast(reward as numeric))` }).from(aiLearningEvents)
        .where(eq(aiLearningEvents.eventType, 'experience'));
      const modelCount = await db.select({ count: sql<number>`count(*)` }).from(aiLearningEvents)
        .where(eq(aiLearningEvents.eventType, 'confidence_update'));
      const adaptCount = await db.select({ count: sql<number>`count(*)` }).from(aiLearningEvents)
        .where(eq(aiLearningEvents.eventType, 'strategy_adaptation'));

      const total = Number(expCount[0]?.count || 0);
      const successes = Number(successCount[0]?.count || 0);

      return {
        totalExperiences: total,
        successRate: total > 0 ? successes / total : 0,
        avgReward: Number(avgReward[0]?.avg || 0),
        modelCount: Number(modelCount[0]?.count || 0),
        adaptationCount: Number(adaptCount[0]?.count || 0),
      };
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get metrics:`, (error instanceof Error ? error.message : String(error)));
      return { totalExperiences: 0, successRate: 0, avgReward: 0, modelCount: 0, adaptationCount: 0 };
    }
  }

  /**
   * Record a human correction to a Trinity decision (T004: Learning Loop)
   */
  async recordCorrection(correction: {
    workspaceId: string;
    agentId: string;
    actionType: string;
    originalDecision: Record<string, any>;
    correctedDecision: Record<string, any>;
    correctionReason: string;
    correctedBy: string;
    entityType?: string;
    entityId?: string;
  }): Promise<any> {
    try {
      const id = `correction-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const [result] = await db.insert(aiLearningEvents).values({
        id,
        eventType: 'experience',
        agentId: correction.agentId,
        action: correction.actionType,
        actionType: correction.actionType,
        domain: 'general',
        workspaceId: correction.workspaceId,
        outcome: 'corrected',
        reward: '-0.500',
        humanIntervention: true,
        data: {
          type: 'human_correction',
          originalDecision: correction.originalDecision,
          correctedDecision: correction.correctedDecision,
          correctionReason: correction.correctionReason,
          correctedBy: correction.correctedBy,
          entityType: correction.entityType,
          entityId: correction.entityId,
          feedback: 'human_correction',
        },
      }).returning();
      log.info(`[RLRepo] Correction recorded: ${correction.agentId}/${correction.actionType} by ${correction.correctedBy}`);
      return result;
    } catch (error: any) {
      log.error(`[RLRepo] Failed to record correction:`, (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  /**
   * Look up past corrections for a given action type before making a new decision (T004)
   */
  async lookupCorrections(agentId: string, actionType: string, workspaceId?: string, limit = 10): Promise<any[]> {
    try {
      const conditions: any[] = [
        eq(aiLearningEvents.eventType, 'experience'),
        eq(aiLearningEvents.agentId, agentId),
        eq(aiLearningEvents.action, actionType),
        eq(aiLearningEvents.humanIntervention, true),
      ];
      if (workspaceId) {
        conditions.push(eq(aiLearningEvents.workspaceId, workspaceId));
      }
      return await db.select().from(aiLearningEvents)
        .where(and(...conditions))
        .orderBy(desc(aiLearningEvents.createdAt))
        .limit(limit);
    } catch (error: any) {
      log.error(`[RLRepo] Failed to lookup corrections:`, (error instanceof Error ? error.message : String(error)));
      return [];
    }
  }

  /**
   * Get decision accuracy metrics (T008)
   */
  async getAccuracyMetrics(agentId?: string, workspaceId?: string): Promise<{
    totalDecisions: number;
    totalCorrections: number;
    accuracyRate: number;
    correctionsByAction: Record<string, { total: number; corrections: number; accuracy: number }>;
  }> {
    try {
      const conditions: any[] = [eq(aiLearningEvents.eventType, 'experience')];
      if (agentId) conditions.push(eq(aiLearningEvents.agentId, agentId));
      if (workspaceId) conditions.push(eq(aiLearningEvents.workspaceId, workspaceId));

      const allExperiences = await db.select().from(aiLearningEvents)
        .where(and(...conditions))
        .orderBy(desc(aiLearningEvents.createdAt))
        .limit(1000);

      const totalDecisions = allExperiences.length;
      const totalCorrections = allExperiences.filter(e => e.humanIntervention === true).length;
      const accuracyRate = totalDecisions > 0 ? ((totalDecisions - totalCorrections) / totalDecisions) * 100 : 100;

      const byAction: Record<string, { total: number; corrections: number; accuracy: number }> = {};
      for (const exp of allExperiences) {
        const action = exp.action || 'unknown';
        if (!byAction[action]) byAction[action] = { total: 0, corrections: 0, accuracy: 0 };
        byAction[action].total++;
        if (exp.humanIntervention) byAction[action].corrections++;
      }
      for (const key of Object.keys(byAction)) {
        const entry = byAction[key];
        entry.accuracy = entry.total > 0 ? ((entry.total - entry.corrections) / entry.total) * 100 : 100;
      }

      return { totalDecisions, totalCorrections, accuracyRate, correctionsByAction: byAction };
    } catch (error: any) {
      log.error(`[RLRepo] Failed to get accuracy metrics:`, (error instanceof Error ? error.message : String(error)));
      return { totalDecisions: 0, totalCorrections: 0, accuracyRate: 0, correctionsByAction: {} };
    }
  }
}

// Export singleton instances
export const knowledgeGraphRepository = KnowledgeGraphRepository.getInstance();
export const a2aProtocolRepository = A2AProtocolRepository.getInstance();
export const rlLoopRepository = RLLoopRepository.getInstance();
