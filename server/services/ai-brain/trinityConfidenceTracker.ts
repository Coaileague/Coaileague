/**
 * TRINITY CONFIDENCE TRACKER
 * ==========================
 * Aggregates per-turn confidence scores into user and org-level statistics.
 * Tracks trust level progression and learning patterns over time.
 * 
 * Part of Phase 1C: Session Confidence Tracking
 * See: docs/trinity-platform-consciousness-roadmap.md
 */

import { db } from '../../db';
import { eq, and, sql, desc } from 'drizzle-orm';
import {
  trinityConversationSessions,
  trinityConversationTurns,
  trinityUserConfidenceStats,
  trinityOrgStats,
  type TrinityUserConfidenceStats,
  type TrinityOrgStats,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityConfidenceTracker');

export interface SessionConfidenceMetrics {
  sessionId: string;
  userId: string;
  workspaceId?: string;
  turnCount: number;
  avgConfidence: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  knowledgeGapsDetected: number;
  escalationOccurred: boolean;
  sessionDurationMs: number;
}

export interface TrustLevelThresholds {
  new: { minSessions: 0; maxSessions: 2; minAvgConfidence: 0 };
  learning: { minSessions: 3; maxSessions: 9; minAvgConfidence: 0.4 };
  established: { minSessions: 10; maxSessions: 49; minAvgConfidence: 0.6 };
  // @ts-expect-error — TS migration: fix in refactoring sprint
  expert: { minSessions: 50; maxSessions: Infinity; minAvgConfidence: 0.75 };
}

type TrustLevel = 'new' | 'learning' | 'established' | 'expert';

class TrinityConfidenceTracker {
  private static instance: TrinityConfidenceTracker;

  private readonly trustThresholds: TrustLevelThresholds = {
    new: { minSessions: 0, maxSessions: 2, minAvgConfidence: 0 },
    learning: { minSessions: 3, maxSessions: 9, minAvgConfidence: 0.4 },
    established: { minSessions: 10, maxSessions: 49, minAvgConfidence: 0.6 },
    expert: { minSessions: 50, maxSessions: Infinity, minAvgConfidence: 0.75 },
  };

  static getInstance(): TrinityConfidenceTracker {
    if (!this.instance) {
      this.instance = new TrinityConfidenceTracker();
    }
    return this.instance;
  }

  async updateUserConfidenceOnSessionEnd(metrics: SessionConfidenceMetrics): Promise<TrinityUserConfidenceStats | null> {
    try {
      const existingStats = await this.getOrCreateUserStats(metrics.userId, metrics.workspaceId);
      if (!existingStats) {
        log.warn(`[TrinityConfidenceTracker] Could not get/create stats for user ${metrics.userId}`);
        return null;
      }

      const newTotalSessions = (existingStats.totalSessions || 0) + 1;
      const newTotalInteractions = (existingStats.totalInteractions || 0) + metrics.turnCount;
      const newTotalToolCalls = (existingStats.totalToolCalls || 0) + metrics.totalToolCalls;
      const newSuccessfulToolCalls = (existingStats.successfulToolCalls || 0) + metrics.successfulToolCalls;
      const newTotalEscalations = (existingStats.totalEscalations || 0) + (metrics.escalationOccurred ? 1 : 0);
      const newTotalKnowledgeGaps = (existingStats.totalKnowledgeGaps || 0) + metrics.knowledgeGapsDetected;

      const oldCumulative = parseFloat(existingStats.cumulativeConfidence?.toString() || '0');
      const newCumulativeConfidence = oldCumulative + (metrics.avgConfidence * metrics.turnCount);
      const newAvgConfidence = newTotalInteractions > 0 
        ? newCumulativeConfidence / newTotalInteractions 
        : 0.5;

      const oldPeak = parseFloat(existingStats.peakConfidence?.toString() || '0');
      const newPeakConfidence = Math.max(oldPeak, metrics.avgConfidence);

      const oldAvg = parseFloat(existingStats.avgSessionDurationMs?.toString() || '0');
      const newAvgSessionDuration = newTotalSessions > 1
        ? Math.round((oldAvg * (newTotalSessions - 1) + metrics.sessionDurationMs) / newTotalSessions)
        : metrics.sessionDurationMs;

      const recentTrend = this.calculateTrend(
        parseFloat(existingStats.averageConfidence?.toString() || '0.5'),
        newAvgConfidence
      );

      const escalationRate = newTotalSessions > 0 
        ? newTotalEscalations / newTotalSessions 
        : 0;

      const newTrustLevel = this.calculateTrustLevel(
        newTotalSessions,
        newAvgConfidence,
        escalationRate
      );

      const [updatedStats] = await db
        .update(trinityUserConfidenceStats)
        .set({
          totalSessions: newTotalSessions,
          totalInteractions: newTotalInteractions,
          totalToolCalls: newTotalToolCalls,
          successfulToolCalls: newSuccessfulToolCalls,
          cumulativeConfidence: newCumulativeConfidence.toFixed(4),
          averageConfidence: newAvgConfidence.toFixed(4),
          peakConfidence: newPeakConfidence.toFixed(4),
          recentTrend,
          trustLevel: newTrustLevel,
          trustLevelUpdatedAt: existingStats.trustLevel !== newTrustLevel ? new Date() : existingStats.trustLevelUpdatedAt,
          totalEscalations: newTotalEscalations,
          escalationRate: escalationRate.toFixed(4),
          totalKnowledgeGaps: newTotalKnowledgeGaps,
          avgSessionDurationMs: newAvgSessionDuration,
          lastActiveAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trinityUserConfidenceStats.id, existingStats.id))
        .returning();

      log.info(`[TrinityConfidenceTracker] Updated user ${metrics.userId} confidence stats: trust=${newTrustLevel}, avg=${newAvgConfidence.toFixed(2)}`);

      if (metrics.workspaceId) {
        await this.updateOrgStatsAsync(metrics.workspaceId);
      }

      return updatedStats || null;
    } catch (error) {
      log.error('[TrinityConfidenceTracker] Error updating user confidence:', error);
      return null;
    }
  }

  private async getOrCreateUserStats(userId: string, workspaceId?: string): Promise<TrinityUserConfidenceStats | null> {
    try {
      const whereCondition = workspaceId
        ? and(
            eq(trinityUserConfidenceStats.userId, userId),
            eq(trinityUserConfidenceStats.workspaceId, workspaceId)
          )
        : and(
            eq(trinityUserConfidenceStats.userId, userId),
            sql`workspace_id IS NULL`
          );

      const [existing] = await db
        .select()
        .from(trinityUserConfidenceStats)
        .where(whereCondition)
        .limit(1);

      if (existing) {
        return existing;
      }

      const [created] = await db
        .insert(trinityUserConfidenceStats)
        .values({
          userId,
          workspaceId: workspaceId || null,
          totalSessions: 0,
          totalInteractions: 0,
          totalToolCalls: 0,
          successfulToolCalls: 0,
          cumulativeConfidence: '0',
          averageConfidence: '0.5',
          peakConfidence: '0',
          recentTrend: 'stable',
          trustLevel: 'new',
          totalEscalations: 0,
          escalationRate: '0',
          totalKnowledgeGaps: 0,
          resolvedKnowledgeGaps: 0,
        })
        .returning();

      return created || null;
    } catch (error) {
      log.error('[TrinityConfidenceTracker] Error getting/creating user stats:', error);
      return null;
    }
  }

  private calculateTrend(oldAvg: number, newAvg: number): 'improving' | 'stable' | 'declining' {
    const diff = newAvg - oldAvg;
    if (diff > 0.05) return 'improving';
    if (diff < -0.05) return 'declining';
    return 'stable';
  }

  private calculateTrustLevel(
    totalSessions: number,
    avgConfidence: number,
    escalationRate: number
  ): TrustLevel {
    if (escalationRate > 0.3) {
      return totalSessions >= 3 ? 'learning' : 'new';
    }

    if (totalSessions >= this.trustThresholds.expert.minSessions && avgConfidence >= this.trustThresholds.expert.minAvgConfidence) {
      return 'expert';
    }
    if (totalSessions >= this.trustThresholds.established.minSessions && avgConfidence >= this.trustThresholds.established.minAvgConfidence) {
      return 'established';
    }
    if (totalSessions >= this.trustThresholds.learning.minSessions && avgConfidence >= this.trustThresholds.learning.minAvgConfidence) {
      return 'learning';
    }
    return 'new';
  }

  private async updateOrgStatsAsync(workspaceId: string): Promise<void> {
    try {
      const [existingOrg] = await db
        .select()
        .from(trinityOrgStats)
        .where(eq(trinityOrgStats.workspaceId, workspaceId))
        .limit(1);

      const userStats = await db
        .select()
        .from(trinityUserConfidenceStats)
        .where(eq(trinityUserConfidenceStats.workspaceId, workspaceId));

      const activeUsers = userStats.length;
      const totalSessions = userStats.reduce((sum, s) => sum + (s.totalSessions || 0), 0);
      const totalInteractions = userStats.reduce((sum, s) => sum + (s.totalInteractions || 0), 0);
      
      const avgUserConfidence = activeUsers > 0
        ? userStats.reduce((sum, s) => sum + parseFloat(s.averageConfidence?.toString() || '0.5'), 0) / activeUsers
        : 0.5;

      const commonTopics = this.extractCommonTopics(userStats);

      if (existingOrg) {
        await db
          .update(trinityOrgStats)
          .set({
            totalActiveUsers: activeUsers,
            totalUserSessions: totalSessions,
            totalOrgInteractions: totalInteractions,
            avgUserConfidence: avgUserConfidence.toFixed(4),
            orgHealthScore: this.calculateOrgHealthScore(avgUserConfidence, userStats).toFixed(2),
            commonTopics,
            updatedAt: new Date(),
            lastAggregatedAt: new Date(),
          })
          .where(eq(trinityOrgStats.id, existingOrg.id));
      } else {
        await db
          .insert(trinityOrgStats)
          .values({
            workspaceId,
            totalActiveUsers: activeUsers,
            totalUserSessions: totalSessions,
            totalOrgInteractions: totalInteractions,
            avgUserConfidence: avgUserConfidence.toFixed(4),
            orgHealthScore: this.calculateOrgHealthScore(avgUserConfidence, userStats).toFixed(2),
            commonTopics,
          });
      }

      log.info(`[TrinityConfidenceTracker] Updated org ${workspaceId} stats: ${activeUsers} users, ${totalSessions} sessions`);
    } catch (error) {
      log.error('[TrinityConfidenceTracker] Error updating org stats:', error);
    }
  }

  private extractCommonTopics(userStats: TrinityUserConfidenceStats[]): string[] {
    const topicCounts: Record<string, number> = {};
    
    for (const stat of userStats) {
      const topics = stat.preferredTopics || [];
      for (const topic of topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([topic]) => topic);
  }

  private calculateOrgHealthScore(avgConfidence: number, userStats: TrinityUserConfidenceStats[]): number {
    let score = avgConfidence * 0.5;
    
    if (userStats.length > 0) {
      const establishedOrExpert = userStats.filter(
        s => s.trustLevel === 'established' || s.trustLevel === 'expert'
      ).length;
      const trustRatio = establishedOrExpert / userStats.length;
      score += trustRatio * 0.3;
    }

    const avgEscalationRate = userStats.length > 0
      ? userStats.reduce((sum, s) => sum + parseFloat(s.escalationRate?.toString() || '0'), 0) / userStats.length
      : 0;
    score += (1 - avgEscalationRate) * 0.2;

    return Math.max(0, Math.min(1, score));
  }

  async extractSessionMetrics(sessionId: string): Promise<SessionConfidenceMetrics | null> {
    try {
      const [session] = await db
        .select()
        .from(trinityConversationSessions)
        .where(eq(trinityConversationSessions.id, sessionId))
        .limit(1);

      if (!session) {
        return null;
      }

      const turns = await db
        .select()
        .from(trinityConversationTurns)
        .where(eq(trinityConversationTurns.sessionId, sessionId));

      const confidenceScores = turns
        .filter(t => t.confidenceScore !== null)
        .map(t => t.confidenceScore as number);

      const avgConfidence = confidenceScores.length > 0
        ? confidenceScores.reduce((sum, s) => sum + s, 0) / confidenceScores.length / 100
        : 0.5;

      let totalToolCalls = 0;
      let successfulToolCalls = 0;
      for (const turn of turns) {
        const results = turn.toolResults as any[] || [];
        totalToolCalls += results.length;
        successfulToolCalls += results.filter((r: any) => r.success).length;
      }

      const knowledgeGapsDetected = turns.filter(t => t.knowledgeGapDetected).length;
      const escalationOccurred = session.escalationPending === true;
      
      const startTime = new Date(session.startedAt || session.createdAt!).getTime();
      const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
      const sessionDurationMs = endTime - startTime;

      return {
        sessionId,
        userId: session.userId,
        workspaceId: session.workspaceId || undefined,
        turnCount: turns.length,
        avgConfidence,
        totalToolCalls,
        successfulToolCalls,
        knowledgeGapsDetected,
        escalationOccurred,
        sessionDurationMs,
      };
    } catch (error) {
      log.error('[TrinityConfidenceTracker] Error extracting session metrics:', error);
      return null;
    }
  }

  async getUserTrustLevel(userId: string, workspaceId?: string): Promise<TrustLevel> {
    try {
      const whereCondition = workspaceId
        ? and(
            eq(trinityUserConfidenceStats.userId, userId),
            eq(trinityUserConfidenceStats.workspaceId, workspaceId)
          )
        : and(
            eq(trinityUserConfidenceStats.userId, userId),
            sql`workspace_id IS NULL`
          );

      const [stats] = await db
        .select({ trustLevel: trinityUserConfidenceStats.trustLevel })
        .from(trinityUserConfidenceStats)
        .where(whereCondition)
        .limit(1);

      return (stats?.trustLevel as TrustLevel) || 'new';
    } catch (error) {
      log.error('[TrinityConfidenceTracker] Error getting trust level:', error);
      return 'new';
    }
  }

  async getOrgStats(workspaceId: string): Promise<TrinityOrgStats | null> {
    try {
      const [stats] = await db
        .select()
        .from(trinityOrgStats)
        .where(eq(trinityOrgStats.workspaceId, workspaceId))
        .limit(1);

      return stats || null;
    } catch (error) {
      log.error('[TrinityConfidenceTracker] Error getting org stats:', error);
      return null;
    }
  }
}

export const trinityConfidenceTracker = TrinityConfidenceTracker.getInstance();
export { TrinityConfidenceTracker };
