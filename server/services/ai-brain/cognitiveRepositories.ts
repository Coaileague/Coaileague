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
import { eq, and, desc, sql, gte, inArray } from 'drizzle-orm';
import {
  knowledgeEntities,
  knowledgeRelationships,
  a2aAgents,
  a2aMessages,
  a2aTeams,
  a2aTrustRules,
  rlExperiences,
  rlConfidenceModels,
  rlStrategyAdaptations,
  type InsertKnowledgeEntity,
  type InsertKnowledgeRelationship,
  type KnowledgeEntityRecord,
  type KnowledgeRelationshipRecord,
} from '@shared/schema';

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
        entityType: entity.entityType as any,
        domain: entity.domain as any,
        workspaceId: entity.workspaceId,
        name: entity.name,
        content: entity.content,
        confidence: entity.confidence?.toString() || '0.5',
        sourceAgent: entity.sourceAgent,
        sourceAction: entity.sourceAction,
        metadata: entity.metadata || {},
        accessCount: 0,
      }).returning();
      console.log(`[KnowledgeGraphRepo] Entity persisted: ${entity.name}`);
      return result;
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to persist entity:`, error.message);
      return null;
    }
  }

  async getEntity(id: string): Promise<KnowledgeEntityRecord | null> {
    try {
      const [entity] = await db.select().from(knowledgeEntities).where(eq(knowledgeEntities.id, id));
      if (entity) {
        await db.update(knowledgeEntities)
          .set({ accessCount: sql`access_count + 1`, lastAccessed: new Date() })
          .where(eq(knowledgeEntities.id, id));
      }
      return entity || null;
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to get entity:`, error.message);
      return null;
    }
  }

  async getEntitiesByDomain(domain: string, limit = 100): Promise<KnowledgeEntityRecord[]> {
    try {
      return await db.select().from(knowledgeEntities)
        .where(eq(knowledgeEntities.domain, domain as any))
        .orderBy(desc(knowledgeEntities.accessCount))
        .limit(limit);
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to get entities by domain:`, error.message);
      return [];
    }
  }

  async getAllEntities(limit = 500): Promise<KnowledgeEntityRecord[]> {
    try {
      return await db.select().from(knowledgeEntities)
        .orderBy(desc(knowledgeEntities.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to get all entities:`, error.message);
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
        id: rel.id,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        relationship: rel.relationship as any,
        strength: rel.strength?.toString() || '0.5',
        bidirectional: rel.bidirectional || false,
        evidence: rel.evidence,
        createdBy: rel.createdBy,
      }).returning();
      console.log(`[KnowledgeGraphRepo] Relationship persisted: ${rel.sourceId} -> ${rel.targetId}`);
      return result;
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to persist relationship:`, error.message);
      return null;
    }
  }

  async getRelationshipsForEntity(entityId: string): Promise<KnowledgeRelationshipRecord[]> {
    try {
      return await db.select().from(knowledgeRelationships)
        .where(eq(knowledgeRelationships.sourceId, entityId));
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to get relationships:`, error.message);
      return [];
    }
  }

  async getAllRelationships(limit = 500): Promise<KnowledgeRelationshipRecord[]> {
    try {
      return await db.select().from(knowledgeRelationships)
        .orderBy(desc(knowledgeRelationships.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[KnowledgeGraphRepo] Failed to get all relationships:`, error.message);
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
      console.error(`[KnowledgeGraphRepo] Failed to get stats:`, error.message);
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
      const [result] = await db.insert(a2aAgents).values({
        id: agent.id,
        name: agent.name,
        role: agent.role as any,
        status: (agent.status || 'active') as any,
        capabilities: agent.capabilities || [],
        domains: agent.domains || [],
        trustLevel: agent.trustLevel?.toString() || '0.5',
        metadata: agent.metadata || {},
        messageCount: 0,
        successCount: 0,
        failureCount: 0,
        avgResponseMs: 0,
      }).returning();
      console.log(`[A2ARepo] Agent persisted: ${agent.name}`);
      return result;
    } catch (error: any) {
      if (error.code === '23505') {
        return this.updateAgent(agent.id, agent);
      }
      console.error(`[A2ARepo] Failed to persist agent:`, error.message);
      return null;
    }
  }

  async getAgent(id: string): Promise<any> {
    try {
      const [agent] = await db.select().from(a2aAgents).where(eq(a2aAgents.id, id));
      return agent || null;
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to get agent:`, error.message);
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
      if (updates.trustLevel !== undefined) updateData.trustLevel = updates.trustLevel.toString();
      if (updates.lastActive) updateData.lastActive = updates.lastActive;
      if (updates.messageCount !== undefined) updateData.messageCount = updates.messageCount;
      if (updates.successCount !== undefined) updateData.successCount = updates.successCount;
      if (updates.failureCount !== undefined) updateData.failureCount = updates.failureCount;

      const [result] = await db.update(a2aAgents).set(updateData).where(eq(a2aAgents.id, id)).returning();
      return result;
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to update agent:`, error.message);
      return null;
    }
  }

  async getAllAgents(): Promise<any[]> {
    try {
      return await db.select().from(a2aAgents).orderBy(desc(a2aAgents.createdAt));
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to get all agents:`, error.message);
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
      const [result] = await db.insert(a2aMessages).values({
        id: message.id,
        senderId: message.senderId,
        recipientId: message.recipientId,
        teamId: message.teamId,
        messageType: message.messageType as any,
        priority: (message.priority || 'normal') as any,
        status: (message.status || 'pending') as any,
        subject: message.subject,
        content: message.content,
        correlationId: message.correlationId,
        replyTo: message.replyTo,
        ttlSeconds: message.ttlSeconds || 300,
      }).returning();
      return result;
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to persist message:`, error.message);
      return null;
    }
  }

  async updateMessageStatus(id: string, status: string, deliveredAt?: Date, acknowledgedAt?: Date): Promise<void> {
    try {
      const updateData: any = { status };
      if (deliveredAt) updateData.deliveredAt = deliveredAt;
      if (acknowledgedAt) updateData.acknowledgedAt = acknowledgedAt;
      await db.update(a2aMessages).set(updateData).where(eq(a2aMessages.id, id));
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to update message status:`, error.message);
    }
  }

  async getMessagesForAgent(agentId: string, limit = 50): Promise<any[]> {
    try {
      return await db.select().from(a2aMessages)
        .where(eq(a2aMessages.recipientId, agentId))
        .orderBy(desc(a2aMessages.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to get messages:`, error.message);
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
        id: team.id,
        name: team.name,
        purpose: team.purpose,
        leaderId: team.leaderId,
        memberIds: team.memberIds || [],
        taskType: team.taskType,
        status: team.status || 'forming',
      }).returning();
      console.log(`[A2ARepo] Team persisted: ${team.name}`);
      return result;
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to persist team:`, error.message);
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
        id: rule.id,
        agentId: rule.agentId,
        trustedAgentId: rule.trustedAgentId,
        capability: rule.capability,
        condition: rule.condition,
        trustLevel: rule.trustLevel?.toString() || '0.5',
        validationRequired: rule.validationRequired || false,
        expiresAt: rule.expiresAt,
      }).returning();
      return result;
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to persist trust rule:`, error.message);
      return null;
    }
  }

  async getTrustRulesForAgent(agentId: string): Promise<any[]> {
    try {
      return await db.select().from(a2aTrustRules).where(eq(a2aTrustRules.agentId, agentId));
    } catch (error: any) {
      console.error(`[A2ARepo] Failed to get trust rules:`, error.message);
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
      const [result] = await db.insert(rlExperiences).values({
        id: exp.id,
        agentId: exp.agentId,
        actionType: exp.actionType,
        context: exp.context,
        parameters: exp.parameters || {},
        outcome: exp.outcome as any,
        reward: exp.reward?.toString() || '0',
        successIndicators: exp.successIndicators || {},
        failureReasons: exp.failureReasons || [],
        executionTimeMs: exp.executionTimeMs || 0,
        resourceUsage: exp.resourceUsage || {},
        workspaceId: exp.workspaceId,
        userId: exp.userId,
        feedbackSource: exp.feedbackSource,
        humanValidated: exp.humanValidated || false,
        validationNotes: exp.validationNotes,
      }).returning();
      console.log(`[RLRepo] Experience persisted: ${exp.agentId}/${exp.actionType} -> ${exp.outcome}`);
      return result;
    } catch (error: any) {
      console.error(`[RLRepo] Failed to persist experience:`, error.message);
      return null;
    }
  }

  async getExperiencesForAgent(agentId: string, limit = 100): Promise<any[]> {
    try {
      return await db.select().from(rlExperiences)
        .where(eq(rlExperiences.agentId, agentId))
        .orderBy(desc(rlExperiences.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[RLRepo] Failed to get experiences:`, error.message);
      return [];
    }
  }

  async getExperiencesByAction(agentId: string, actionType: string, limit = 50): Promise<any[]> {
    try {
      return await db.select().from(rlExperiences)
        .where(and(
          eq(rlExperiences.agentId, agentId),
          eq(rlExperiences.actionType, actionType)
        ))
        .orderBy(desc(rlExperiences.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[RLRepo] Failed to get experiences by action:`, error.message);
      return [];
    }
  }

  async getAllExperiences(limit = 500): Promise<any[]> {
    try {
      return await db.select().from(rlExperiences)
        .orderBy(desc(rlExperiences.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[RLRepo] Failed to get all experiences:`, error.message);
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
      const existing = await db.select().from(rlConfidenceModels)
        .where(and(
          eq(rlConfidenceModels.agentId, model.agentId),
          eq(rlConfidenceModels.actionType, model.actionType)
        ));

      if (existing.length > 0) {
        const [result] = await db.update(rlConfidenceModels).set({
          currentConfidence: model.currentConfidence.toString(),
          sampleCount: model.sampleCount,
          successRate: model.successRate.toString(),
          recentTrend: model.recentTrend || 'stable',
          minConfidenceSeen: (model.minConfidenceSeen || model.currentConfidence).toString(),
          maxConfidenceSeen: (model.maxConfidenceSeen || model.currentConfidence).toString(),
          lastUpdate: new Date(),
        }).where(and(
          eq(rlConfidenceModels.agentId, model.agentId),
          eq(rlConfidenceModels.actionType, model.actionType)
        )).returning();
        return result;
      } else {
        const [result] = await db.insert(rlConfidenceModels).values({
          id: model.id,
          agentId: model.agentId,
          actionType: model.actionType,
          currentConfidence: model.currentConfidence.toString(),
          sampleCount: model.sampleCount,
          successRate: model.successRate.toString(),
          recentTrend: model.recentTrend || 'stable',
          minConfidenceSeen: (model.minConfidenceSeen || model.currentConfidence).toString(),
          maxConfidenceSeen: (model.maxConfidenceSeen || model.currentConfidence).toString(),
          decayFactor: (model.decayFactor || 0.95).toString(),
          learningRate: (model.learningRate || 0.1).toString(),
        }).returning();
        console.log(`[RLRepo] Confidence model created: ${model.agentId}/${model.actionType}`);
        return result;
      }
    } catch (error: any) {
      console.error(`[RLRepo] Failed to upsert confidence model:`, error.message);
      return null;
    }
  }

  async getConfidenceModel(agentId: string, actionType: string): Promise<any> {
    try {
      const [model] = await db.select().from(rlConfidenceModels)
        .where(and(
          eq(rlConfidenceModels.agentId, agentId),
          eq(rlConfidenceModels.actionType, actionType)
        ));
      return model || null;
    } catch (error: any) {
      console.error(`[RLRepo] Failed to get confidence model:`, error.message);
      return null;
    }
  }

  async getAllConfidenceModels(): Promise<any[]> {
    try {
      return await db.select().from(rlConfidenceModels).orderBy(desc(rlConfidenceModels.lastUpdate));
    } catch (error: any) {
      console.error(`[RLRepo] Failed to get all confidence models:`, error.message);
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
      const [result] = await db.insert(rlStrategyAdaptations).values({
        id: adaptation.id,
        agentId: adaptation.agentId,
        actionType: adaptation.actionType,
        oldStrategy: adaptation.oldStrategy,
        newStrategy: adaptation.newStrategy,
        triggerReason: adaptation.triggerReason,
        triggerMetrics: adaptation.triggerMetrics || {},
        confidenceBefore: adaptation.confidenceBefore?.toString(),
        confidenceAfter: adaptation.confidenceAfter?.toString(),
        validated: adaptation.validated || false,
        validationResult: adaptation.validationResult,
        rollbackAvailable: adaptation.rollbackAvailable ?? true,
        rolledBack: adaptation.rolledBack || false,
      }).returning();
      console.log(`[RLRepo] Strategy adaptation persisted: ${adaptation.agentId}/${adaptation.actionType}`);
      return result;
    } catch (error: any) {
      console.error(`[RLRepo] Failed to persist strategy adaptation:`, error.message);
      return null;
    }
  }

  async getAdaptationsForAgent(agentId: string, limit = 20): Promise<any[]> {
    try {
      return await db.select().from(rlStrategyAdaptations)
        .where(eq(rlStrategyAdaptations.agentId, agentId))
        .orderBy(desc(rlStrategyAdaptations.createdAt))
        .limit(limit);
    } catch (error: any) {
      console.error(`[RLRepo] Failed to get adaptations:`, error.message);
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
      const expCount = await db.select({ count: sql<number>`count(*)` }).from(rlExperiences);
      const successCount = await db.select({ count: sql<number>`count(*)` }).from(rlExperiences)
        .where(eq(rlExperiences.outcome, 'success'));
      const avgReward = await db.select({ avg: sql<number>`avg(cast(reward as numeric))` }).from(rlExperiences);
      const modelCount = await db.select({ count: sql<number>`count(*)` }).from(rlConfidenceModels);
      const adaptCount = await db.select({ count: sql<number>`count(*)` }).from(rlStrategyAdaptations);

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
      console.error(`[RLRepo] Failed to get metrics:`, error.message);
      return { totalExperiences: 0, successRate: 0, avgReward: 0, modelCount: 0, adaptationCount: 0 };
    }
  }
}

// Export singleton instances
export const knowledgeGraphRepository = KnowledgeGraphRepository.getInstance();
export const a2aProtocolRepository = A2AProtocolRepository.getInstance();
export const rlLoopRepository = RLLoopRepository.getInstance();
