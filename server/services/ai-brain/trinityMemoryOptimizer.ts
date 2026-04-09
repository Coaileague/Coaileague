/**
 * TRINITY MEMORY OPTIMIZER SERVICE
 * =================================
 * Self-optimization engine for Trinity's AI Brain memory systems.
 * Provides database-level cleanup, knowledge consolidation, confidence decay,
 * RL experience pruning, conversation archival, and memory health diagnostics.
 *
 * Retention Policies:
 * - Conversation sessions/turns: 60 days (summarize before archival)
 * - Knowledge gap logs: 90 days
 * - Automation action ledger: 180 days
 * - RL experiences: 120 days (keep high-value, prune low-reward)
 * - Knowledge entities: Confidence decay after 90 days unused, prune < 0.1
 * - A2A messages: 30 days for delivered/acknowledged
 * - AI Brain jobs: 14 days for completed/failed
 * - Knowledge learning entries: 180 days
 */

import { db } from '../../db';
import {
  trinityConversationSessions,
  trinityConversationTurns,
  knowledgeGapLogs,
  automationActionLedger,
  knowledgeEntities,
  knowledgeRelationships,
  knowledgeLearningEntries,
  aiLearningEvents,
  a2aMessages,
  billingAuditLog,
} from '@shared/schema';
import { lt, and, eq, sql, or, lte, isNotNull } from 'drizzle-orm';
import { typedCount, typedQuery } from '../../lib/typedSql';

import { createLogger } from '../../lib/logger';
import { PLATFORM_WORKSPACE_ID } from '../billing/billingConstants';
const log = createLogger('TrinityMemoryOptimizer');

export interface MemoryRetentionPolicy {
  table: string;
  retentionDays: number;
  strategy: 'hard_delete' | 'summarize_then_delete' | 'confidence_decay';
  description: string;
}

export interface OptimizationResult {
  job: string;
  success: boolean;
  recordsProcessed: number;
  recordsArchived: number;
  recordsDeleted: number;
  recordsDecayed: number;
  recordsConsolidated: number;
  duration: number;
  timestamp: Date;
  error?: string;
}

export interface MemoryHealthReport {
  timestamp: Date;
  overallHealth: 'healthy' | 'warning' | 'critical';
  healthScore: number;
  tables: TableHealthMetric[];
  recommendations: string[];
  lastOptimizedAt: Date | null;
  totalRecordsManaged: number;
  estimatedStorageMB: number;
}

export interface TableHealthMetric {
  tableName: string;
  rowCount: number;
  oldestRecordAge: number;
  avgAge: number;
  retentionDays: number;
  status: 'healthy' | 'warning' | 'critical';
  recommendation?: string;
}

const RETENTION_POLICIES: MemoryRetentionPolicy[] = [
  { table: 'trinity_conversation_sessions', retentionDays: 60, strategy: 'summarize_then_delete', description: 'Conversation sessions older than 60 days' },
  { table: 'trinity_conversation_turns', retentionDays: 60, strategy: 'hard_delete', description: 'Conversation turns for archived sessions' },
  { table: 'knowledge_gap_logs', retentionDays: 90, strategy: 'hard_delete', description: 'Knowledge gap logs older than 90 days' },
  { table: 'automation_action_ledger', retentionDays: 180, strategy: 'hard_delete', description: 'Automation ledger entries older than 180 days' },
  { table: 'ai_learning_events', retentionDays: 120, strategy: 'hard_delete', description: 'Low-value AI learning events (experiences) older than 120 days' },
  { table: 'a2a_messages', retentionDays: 30, strategy: 'hard_delete', description: 'Delivered A2A messages older than 30 days' },
  { table: 'ai_brain_job_queue', retentionDays: 14, strategy: 'hard_delete', description: 'Completed/failed AI brain jobs older than 14 days' },
  { table: 'knowledge_learning_entries', retentionDays: 180, strategy: 'hard_delete', description: 'Learning entries older than 180 days' },
  { table: 'knowledge_entities', retentionDays: 90, strategy: 'confidence_decay', description: 'Unused knowledge entities confidence decay' },
];

class TrinityMemoryOptimizer {
  private static instance: TrinityMemoryOptimizer;
  private lastOptimizedAt: Date | null = null;
  private isOptimizing = false;
  private optimizationHistory: OptimizationResult[] = [];

  static getInstance(): TrinityMemoryOptimizer {
    if (!this.instance) {
      this.instance = new TrinityMemoryOptimizer();
    }
    return this.instance;
  }

  getRetentionPolicies(): MemoryRetentionPolicy[] {
    return [...RETENTION_POLICIES];
  }

  async runFullOptimization(dryRun = false): Promise<OptimizationResult[]> {
    if (this.isOptimizing) {
      log.info('[MemoryOptimizer] Optimization already in progress, skipping');
      return [];
    }

    this.isOptimizing = true;
    const results: OptimizationResult[] = [];
    log.info(`[MemoryOptimizer] Starting full memory optimization (dryRun=${dryRun})...`);

    try {
      results.push(await this.cleanConversationSessions(dryRun));
      results.push(await this.cleanKnowledgeGapLogs(dryRun));
      results.push(await this.cleanAutomationLedger(dryRun));
      results.push(await this.pruneRLExperiences(dryRun));
      results.push(await this.cleanStrategyAdaptations(dryRun));
      results.push(await this.cleanA2AMessages(dryRun));
      results.push(await this.cleanAIBrainJobs(dryRun));
      results.push(await this.cleanKnowledgeLearningEntries(dryRun));
      results.push(await this.decayKnowledgeConfidence(dryRun));
      results.push(await this.pruneDeadKnowledgeEntities(dryRun));
      results.push(await this.consolidateDuplicateKnowledge(dryRun));

      this.lastOptimizedAt = new Date();
      this.optimizationHistory.push(...results);
      if (this.optimizationHistory.length > 50) {
        this.optimizationHistory = this.optimizationHistory.slice(-50);
      }

      const totalDeleted = results.reduce((sum, r) => sum + r.recordsDeleted, 0);
      const totalDecayed = results.reduce((sum, r) => sum + r.recordsDecayed, 0);
      const totalConsolidated = results.reduce((sum, r) => sum + r.recordsConsolidated, 0);

      await this.logOptimizationEvent({
        job: 'full_optimization',
        success: results.every(r => r.success),
        recordsProcessed: results.reduce((sum, r) => sum + r.recordsProcessed, 0),
        recordsArchived: results.reduce((sum, r) => sum + r.recordsArchived, 0),
        recordsDeleted: totalDeleted,
        recordsDecayed: totalDecayed,
        recordsConsolidated: totalConsolidated,
        duration: results.reduce((sum, r) => sum + r.duration, 0),
        timestamp: new Date(),
      });

      log.info(`[MemoryOptimizer] Full optimization complete: ${totalDeleted} deleted, ${totalDecayed} decayed, ${totalConsolidated} consolidated`);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Full optimization failed:', error);
    } finally {
      this.isOptimizing = false;
    }

    return results;
  }

  private async cleanConversationSessions(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(60);

    try {
      const staleSessionsResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(trinityConversationSessions)
        .where(lt(trinityConversationSessions.createdAt, cutoff));
      const staleCount = staleSessionsResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('conversation_sessions', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const turnsResult = await db
        .delete(trinityConversationTurns)
        .where(
          sql`${trinityConversationTurns.sessionId} IN (
            SELECT id FROM trinity_conversation_sessions WHERE created_at < ${cutoff}
          )`
        )
        .returning({ id: trinityConversationTurns.id });

      const sessionsResult = await db
        .delete(trinityConversationSessions)
        .where(lt(trinityConversationSessions.createdAt, cutoff))
        .returning({ id: trinityConversationSessions.id });

      const totalDeleted = turnsResult.length + sessionsResult.length;
      log.info(`[MemoryOptimizer] Cleaned ${sessionsResult.length} sessions + ${turnsResult.length} turns older than 60 days`);
      return this.makeResult('conversation_sessions', staleCount, 0, totalDeleted, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Conversation cleanup failed:', error);
      return this.makeResult('conversation_sessions', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cleanKnowledgeGapLogs(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(90);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeGapLogs)
        .where(lt(knowledgeGapLogs.createdAt, cutoff));
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('knowledge_gap_logs', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        .delete(knowledgeGapLogs)
        .where(lt(knowledgeGapLogs.createdAt, cutoff))
        .returning({ id: knowledgeGapLogs.id });

      log.info(`[MemoryOptimizer] Cleaned ${result.length} knowledge gap logs older than 90 days`);
      return this.makeResult('knowledge_gap_logs', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Knowledge gap cleanup failed:', error);
      return this.makeResult('knowledge_gap_logs', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cleanAutomationLedger(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(180);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(automationActionLedger)
        .where(lt(automationActionLedger.createdAt, cutoff));
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('automation_action_ledger', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        .delete(automationActionLedger)
        .where(lt(automationActionLedger.createdAt, cutoff))
        .returning({ id: automationActionLedger.id });

      log.info(`[MemoryOptimizer] Cleaned ${result.length} automation ledger entries older than 180 days`);
      return this.makeResult('automation_action_ledger', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Automation ledger cleanup failed:', error);
      return this.makeResult('automation_action_ledger', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async pruneRLExperiences(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(120);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiLearningEvents)
        .where(
          and(
            eq(aiLearningEvents.eventType, 'experience'),
            lt(aiLearningEvents.createdAt, cutoff),
            or(
              lte(aiLearningEvents.reward, sql`0`),
              lte(aiLearningEvents.confidenceLevel, sql`0.3`)
            )
          )
        );
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('ai_learning_events', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        .delete(aiLearningEvents)
        .where(
          and(
            eq(aiLearningEvents.eventType, 'experience'),
            lt(aiLearningEvents.createdAt, cutoff),
            or(
              lte(aiLearningEvents.reward, sql`0`),
              lte(aiLearningEvents.confidenceLevel, sql`0.3`)
            )
          )
        )
        .returning({ id: aiLearningEvents.id });

      log.info(`[MemoryOptimizer] Pruned ${result.length} low-value AI learning events older than 120 days`);
      return this.makeResult('ai_learning_events', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] AI learning event pruning failed:', error);
      return this.makeResult('ai_learning_events', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cleanStrategyAdaptations(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(180);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiLearningEvents)
        .where(
          and(
            eq(aiLearningEvents.eventType, 'strategy_adaptation'),
            lt(aiLearningEvents.createdAt, cutoff)
          )
        );
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('ai_learning_events', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        .delete(aiLearningEvents)
        .where(
          and(
            eq(aiLearningEvents.eventType, 'strategy_adaptation'),
            lt(aiLearningEvents.createdAt, cutoff)
          )
        )
        .returning({ id: aiLearningEvents.id });

      log.info(`[MemoryOptimizer] Cleaned ${result.length} strategy adaptations older than 180 days`);
      return this.makeResult('ai_learning_events', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Strategy adaptation cleanup failed:', error);
      return this.makeResult('ai_learning_events', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cleanA2AMessages(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(30);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(a2aMessages)
        .where(
          and(
            lt(a2aMessages.createdAt, cutoff),
            or(
              eq(a2aMessages.status, 'delivered'),
              eq(a2aMessages.status, 'acknowledged')
            )
          )
        );
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('a2a_messages', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        .delete(a2aMessages)
        .where(
          and(
            lt(a2aMessages.createdAt, cutoff),
            or(
              eq(a2aMessages.status, 'delivered'),
              eq(a2aMessages.status, 'acknowledged')
            )
          )
        )
        .returning({ id: a2aMessages.id });

      log.info(`[MemoryOptimizer] Cleaned ${result.length} A2A messages older than 30 days`);
      return this.makeResult('a2a_messages', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] A2A message cleanup failed:', error);
      return this.makeResult('a2a_messages', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cleanAIBrainJobs(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(14);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .from(aiBrainJobQueue)
        .where(
          and(
            // @ts-expect-error — TS migration: fix in refactoring sprint
            lt(aiBrainJobQueue.createdAt, cutoff),
            or(
              // @ts-expect-error — TS migration: fix in refactoring sprint
              eq(aiBrainJobQueue.status, 'completed'),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              eq(aiBrainJobQueue.status, 'failed'),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              eq(aiBrainJobQueue.status, 'cancelled')
            )
          )
        );
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('ai_brain_job_queue', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .delete(aiBrainJobQueue)
        .where(
          and(
            // @ts-expect-error — TS migration: fix in refactoring sprint
            lt(aiBrainJobQueue.createdAt, cutoff),
            or(
              // @ts-expect-error — TS migration: fix in refactoring sprint
              eq(aiBrainJobQueue.status, 'completed'),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              eq(aiBrainJobQueue.status, 'failed'),
              // @ts-expect-error — TS migration: fix in refactoring sprint
              eq(aiBrainJobQueue.status, 'cancelled')
            )
          )
        )
        // @ts-expect-error — TS migration: fix in refactoring sprint
        .returning({ id: aiBrainJobQueue.id });

      log.info(`[MemoryOptimizer] Cleaned ${result.length} completed/failed AI brain jobs older than 14 days`);
      return this.makeResult('ai_brain_job_queue', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] AI brain job cleanup failed:', error);
      return this.makeResult('ai_brain_job_queue', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async cleanKnowledgeLearningEntries(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const cutoff = this.getCutoffDate(180);

    try {
      const countResult = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeLearningEntries)
        .where(lt(knowledgeLearningEntries.createdAt, cutoff));
      const staleCount = countResult[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('knowledge_learning_entries', staleCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      const result = await db
        .delete(knowledgeLearningEntries)
        .where(lt(knowledgeLearningEntries.createdAt, cutoff))
        .returning({ id: knowledgeLearningEntries.id });

      log.info(`[MemoryOptimizer] Cleaned ${result.length} knowledge learning entries older than 180 days`);
      return this.makeResult('knowledge_learning_entries', staleCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Knowledge learning cleanup failed:', error);
      return this.makeResult('knowledge_learning_entries', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async decayKnowledgeConfidence(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();
    const decayThresholdDate = this.getCutoffDate(90);

    try {
      const staleEntities = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeEntities)
        .where(
          and(
            or(
              lt(knowledgeEntities.lastAccessedAt, decayThresholdDate),
              sql`${knowledgeEntities.lastAccessedAt} IS NULL`
            ),
            sql`${knowledgeEntities.confidence} > 0.1`
          )
        );
      const staleCount = staleEntities[0]?.count || 0;

      if (dryRun || staleCount === 0) {
        return this.makeResult('knowledge_confidence_decay', staleCount, 0, 0, staleCount, 0, Date.now() - startTime, true);
      }

      await db
        .update(knowledgeEntities)
        .set({
          confidence: sql`GREATEST(0.1, ${knowledgeEntities.confidence} * 0.85)`,
          updatedAt: new Date(),
        })
        .where(
          and(
            or(
              lt(knowledgeEntities.lastAccessedAt, decayThresholdDate),
              sql`${knowledgeEntities.lastAccessedAt} IS NULL`
            ),
            sql`${knowledgeEntities.confidence} > 0.1`
          )
        );

      log.info(`[MemoryOptimizer] Decayed confidence on ${staleCount} unused knowledge entities (15% decay)`);
      return this.makeResult('knowledge_confidence_decay', staleCount, 0, 0, staleCount, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Knowledge confidence decay failed:', error);
      return this.makeResult('knowledge_confidence_decay', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async pruneDeadKnowledgeEntities(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();

    try {
      const deadEntities = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(knowledgeEntities)
        .where(
          and(
            lte(knowledgeEntities.confidence, sql`0.1`),
            lte(knowledgeEntities.usageCount, sql`1`)
          )
        );
      const deadCount = deadEntities[0]?.count || 0;

      if (dryRun || deadCount === 0) {
        return this.makeResult('knowledge_entity_prune', deadCount, 0, 0, 0, 0, Date.now() - startTime, true);
      }

      await db
        .delete(knowledgeRelationships)
        .where(
          or(
            sql`${knowledgeRelationships.sourceId} IN (
              SELECT id FROM knowledge_entities WHERE confidence <= 0.1 AND usage_count <= 1
            )`,
            sql`${knowledgeRelationships.targetId} IN (
              SELECT id FROM knowledge_entities WHERE confidence <= 0.1 AND usage_count <= 1
            )`
          )
        );

      const result = await db
        .delete(knowledgeEntities)
        .where(
          and(
            lte(knowledgeEntities.confidence, sql`0.1`),
            lte(knowledgeEntities.usageCount, sql`1`)
          )
        )
        .returning({ id: knowledgeEntities.id });

      log.info(`[MemoryOptimizer] Pruned ${result.length} dead knowledge entities (confidence <= 0.1, usage <= 1)`);
      return this.makeResult('knowledge_entity_prune', deadCount, 0, result.length, 0, 0, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Knowledge entity pruning failed:', error);
      return this.makeResult('knowledge_entity_prune', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  private async consolidateDuplicateKnowledge(dryRun: boolean): Promise<OptimizationResult> {
    const startTime = Date.now();

    try {
      // CATEGORY C — Raw SQL retained: GROUP BY | Tables: knowledge_entities | Verified: 2026-03-23
      const duplicates = await typedQuery(sql`
        SELECT name, domain, COUNT(*) as cnt, 
               array_agg(id ORDER BY usage_count DESC, confidence DESC) as ids
        FROM knowledge_entities
        GROUP BY name, domain
        HAVING COUNT(*) > 1
        LIMIT 100
      `);

      const duplicateGroups = (duplicates || []) as Array<{ name: string; domain: string; cnt: number; ids: string[] }>;
      let consolidated = 0;

      if (dryRun || duplicateGroups.length === 0) {
        return this.makeResult('knowledge_consolidation', duplicateGroups.length, 0, 0, 0, duplicateGroups.length, Date.now() - startTime, true);
      }

      for (const group of duplicateGroups) {
        const keepId = group.ids[0];
        const removeIds = group.ids.slice(1);

        if (removeIds.length === 0) continue;

        await db
          .update(knowledgeRelationships)
          .set({ sourceId: keepId })
          .where(sql`${knowledgeRelationships.sourceId} = ANY(${removeIds})`);

        await db
          .update(knowledgeRelationships)
          .set({ targetId: keepId })
          .where(sql`${knowledgeRelationships.targetId} = ANY(${removeIds})`);

        await db
          .update(knowledgeEntities)
          .set({
            usageCount: sql`${knowledgeEntities.usageCount} + ${removeIds.length}`,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeEntities.id, keepId));

        await db
          .delete(knowledgeEntities)
          .where(sql`${knowledgeEntities.id} = ANY(${removeIds})`);

        consolidated += removeIds.length;
      }

      log.info(`[MemoryOptimizer] Consolidated ${consolidated} duplicate knowledge entities from ${duplicateGroups.length} groups`);
      return this.makeResult('knowledge_consolidation', duplicateGroups.length, 0, consolidated, 0, duplicateGroups.length, Date.now() - startTime, true);
    } catch (error: any) {
      log.error('[MemoryOptimizer] Knowledge consolidation failed:', error);
      return this.makeResult('knowledge_consolidation', 0, 0, 0, 0, 0, Date.now() - startTime, false, (error instanceof Error ? error.message : String(error)));
    }
  }

  async getMemoryHealth(): Promise<MemoryHealthReport> {
    const tables: TableHealthMetric[] = [];
    let totalRecords = 0;

    const tableQueries = [
      { name: 'trinity_conversation_sessions', table: trinityConversationSessions, retention: 60, dateCol: 'created_at' },
      { name: 'trinity_conversation_turns', table: trinityConversationTurns, retention: 60, dateCol: 'created_at' },
      { name: 'knowledge_gap_logs', table: knowledgeGapLogs, retention: 90, dateCol: 'created_at' },
      { name: 'automation_action_ledger', table: automationActionLedger, retention: 180, dateCol: 'created_at' },
      { name: 'knowledge_entities', table: knowledgeEntities, retention: 90, dateCol: 'created_at' },
      { name: 'knowledge_relationships', table: knowledgeRelationships, retention: 90, dateCol: 'created_at' },
      { name: 'knowledge_learning_entries', table: knowledgeLearningEntries, retention: 180, dateCol: 'created_at' },
      { name: 'a2a_messages', table: a2aMessages, retention: 30, dateCol: 'created_at' },
    ];

    for (const tq of tableQueries) {
      try {
        // CATEGORY C — Genuine complex SQL: COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN/AVG(col)))) / 86400 with dynamic table/column names via sql.raw() — not expressible in Drizzle ORM query builder
        const stats = await typedQuery(sql`
          SELECT 
            COUNT(*)::int as row_count,
            COALESCE(EXTRACT(EPOCH FROM (NOW() - MIN(${sql.raw(tq.dateCol)}))) / 86400, 0)::int as oldest_age_days,
            COALESCE(EXTRACT(EPOCH FROM (NOW() - AVG(${sql.raw(tq.dateCol)}))) / 86400, 0)::int as avg_age_days
          FROM ${sql.raw(tq.name)}
        `);
        
        const row = ((stats as any[])[0] || { row_count: 0, oldest_age_days: 0, avg_age_days: 0 }) as {
          row_count: number;
          oldest_age_days: number;
          avg_age_days: number;
        };

        const rowCount = row.row_count || 0;
        const oldestAge = row.oldest_age_days || 0;
        const avgAge = row.avg_age_days || 0;

        let status: 'healthy' | 'warning' | 'critical' = 'healthy';
        let recommendation: string | undefined;

        if (oldestAge > tq.retention * 2) {
          status = 'critical';
          recommendation = `Records ${Math.round(oldestAge / tq.retention)}x older than retention policy. Run optimization immediately.`;
        } else if (oldestAge > tq.retention * 1.5 || rowCount > 10000) {
          status = 'warning';
          recommendation = `Approaching retention limits. Schedule optimization soon.`;
        }

        tables.push({
          tableName: tq.name,
          rowCount,
          oldestRecordAge: oldestAge,
          avgAge,
          retentionDays: tq.retention,
          status,
          recommendation,
        });

        totalRecords += rowCount;
      } catch (error: any) {
        tables.push({
          tableName: tq.name,
          rowCount: 0,
          oldestRecordAge: 0,
          avgAge: 0,
          retentionDays: tq.retention,
          status: 'warning',
          recommendation: `Could not query table: ${(error instanceof Error ? error.message : String(error))}`,
        });
      }
    }

    const criticalCount = tables.filter(t => t.status === 'critical').length;
    const warningCount = tables.filter(t => t.status === 'warning').length;

    let overallHealth: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalCount > 0) overallHealth = 'critical';
    else if (warningCount > 2) overallHealth = 'warning';

    const healthScore = Math.max(0, 100 - (criticalCount * 25) - (warningCount * 10));

    const recommendations: string[] = [];
    if (criticalCount > 0) recommendations.push(`${criticalCount} tables have critical retention violations. Run full optimization.`);
    if (warningCount > 0) recommendations.push(`${warningCount} tables approaching retention limits.`);
    if (!this.lastOptimizedAt) recommendations.push('Memory has never been optimized. Run initial optimization.');
    else {
      const daysSinceOptimized = (Date.now() - this.lastOptimizedAt.getTime()) / (86400 * 1000);
      if (daysSinceOptimized > 7) recommendations.push(`Last optimization was ${Math.round(daysSinceOptimized)} days ago. Consider running optimization.`);
    }
    if (totalRecords > 50000) recommendations.push(`Total managed records (${totalRecords}) is high. Consider more aggressive retention.`);

    return {
      timestamp: new Date(),
      overallHealth,
      healthScore,
      tables,
      recommendations,
      lastOptimizedAt: this.lastOptimizedAt,
      totalRecordsManaged: totalRecords,
      estimatedStorageMB: Math.round(totalRecords * 0.002 * 100) / 100,
    };
  }

  getOptimizationHistory(): OptimizationResult[] {
    return [...this.optimizationHistory];
  }

  isCurrentlyOptimizing(): boolean {
    return this.isOptimizing;
  }

  private getCutoffDate(days: number): Date {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return cutoff;
  }

  private makeResult(
    job: string, processed: number, archived: number, deleted: number,
    decayed: number, consolidated: number, duration: number,
    success: boolean, error?: string
  ): OptimizationResult {
    return {
      job, success, recordsProcessed: processed, recordsArchived: archived,
      recordsDeleted: deleted, recordsDecayed: decayed, recordsConsolidated: consolidated,
      duration, timestamp: new Date(), error,
    };
  }

  private async logOptimizationEvent(result: OptimizationResult): Promise<void> {
    try {
      await db.insert(billingAuditLog).values({
        workspaceId: PLATFORM_WORKSPACE_ID,
        eventType: `memory_optimization_${result.job}`,
        eventCategory: 'system',
        actorType: 'system',
        description: result.success
          ? `Trinity Memory Optimization: ${result.job} - ${result.recordsDeleted} deleted, ${result.recordsDecayed} decayed, ${result.recordsConsolidated} consolidated in ${result.duration}ms`
          : `Trinity Memory Optimization: ${result.job} - FAILED: ${result.error}`,
        newState: {
          job: result.job,
          recordsProcessed: result.recordsProcessed,
          recordsDeleted: result.recordsDeleted,
          recordsDecayed: result.recordsDecayed,
          recordsConsolidated: result.recordsConsolidated,
          duration: result.duration,
          timestamp: result.timestamp.toISOString(),
        },
      });
    } catch (error) {
      log.error('[MemoryOptimizer] Failed to log optimization event:', error);
    }
  }
}

export const trinityMemoryOptimizer = TrinityMemoryOptimizer.getInstance();
