/**
 * GURU TASK GRAPH SERVICE
 * ========================
 * Phase 2A of Trinity Platform Consciousness
 * 
 * Connects organization goals → AI-powered recommendations → user task assignments
 * Integrates with GrowthStrategist for strategy cards and creates actionable tasks.
 * 
 * Core Flow:
 * 1. getOrgGoals() - Read workspace goals and priorities
 * 2. analyzeGaps() - Compare current state to goals using GrowthStrategist
 * 3. generateTaskRecommendations() - AI-powered suggestions based on gaps
 * 4. assignTask() - Create actionable items for specific users
 * 5. trackCompletion() - Measure outcomes and update org learning
 */

import { db } from '../../db';
import { eq, and, gte, desc, count, sql, inArray } from 'drizzle-orm';
import {
  workspaces,
  users,
  aiWorkboardTasks,
  trinityOrgStats,
  trinityUserConfidenceStats,
} from '@shared/schema';
import { growthStrategist, StrategyCard, EmpireScanResult } from './growthStrategist';
import { TTLCache } from './cacheUtils';
import { createLogger } from '../../lib/logger';
const log = createLogger('guruTaskGraph');

// ============================================================================
// TYPES
// ============================================================================

export interface OrgGoal {
  id: string;
  category: 'revenue' | 'efficiency' | 'compliance' | 'growth' | 'retention' | 'automation';
  title: string;
  description: string;
  targetValue?: number;
  currentValue?: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
  deadline?: Date;
  createdAt: Date;
}

export interface GapAnalysis {
  goalId: string;
  goalTitle: string;
  gapType: 'missing_capability' | 'underutilization' | 'process_bottleneck' | 'resource_constraint' | 'knowledge_gap';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impactEstimate: string;
  suggestedActions: string[];
  relatedStrategyCards: string[]; // IDs from GrowthStrategist
}

export interface TaskRecommendation {
  id: string;
  workspaceId: string;
  sourceGapId?: string;
  sourceStrategyCardId?: string;
  category: string;
  title: string;
  description: string;
  priority: 'urgent' | 'high' | 'normal' | 'low';
  estimatedImpact: string;
  estimatedEffort: 'quick' | 'moderate' | 'substantial';
  suggestedAssignee?: string; // userId or role
  suggestedDueDate?: Date;
  actionFunction?: string; // From strategy card
  confidence: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface TaskAssignment {
  id: string;
  workspaceId: string;
  userId: string;
  recommendationId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'expired';
  assignedAt: Date;
  dueDate?: Date;
  completedAt?: Date;
  outcome?: 'success' | 'partial' | 'failed' | 'skipped';
  outcomeNotes?: string;
  impactMeasured?: string;
}

export interface OrgTaskSummary {
  workspaceId: string;
  totalRecommendations: number;
  pendingTasks: number;
  completedTasks: number;
  successRate: number;
  topOpportunities: TaskRecommendation[];
  recentCompletions: TaskAssignment[];
  empireScore?: number;
  lastUpdated: Date;
}

// ============================================================================
// GURU TASK GRAPH SERVICE
// ============================================================================

class GuruTaskGraphService {
  private static instance: GuruTaskGraphService;
  private recommendationCache = new TTLCache<string, TaskRecommendation[]>(30 * 60 * 1000, 50); // 30 min cache
  private goalCache = new TTLCache<string, OrgGoal[]>(60 * 60 * 1000, 50); // 1 hour cache
  private activeAssignments: Map<string, TaskAssignment[]> = new Map();

  static getInstance(): GuruTaskGraphService {
    if (!this.instance) {
      this.instance = new GuruTaskGraphService();
    }
    return this.instance;
  }

  shutdown(): void {
    this.recommendationCache.shutdown();
    this.goalCache.shutdown();
    this.activeAssignments.clear();
  }

  // ============================================================================
  // ORG GOALS MANAGEMENT
  // ============================================================================

  /**
   * Get organization goals from workspace settings and org stats
   */
  async getOrgGoals(workspaceId: string): Promise<OrgGoal[]> {
    const cached = this.goalCache.get(workspaceId);
    if (cached) return cached;

    try {
      const [workspace, orgStats] = await Promise.all([
        db.query.workspaces.findFirst({
          where: eq(workspaces.id, workspaceId),
        }),
        db.query.trinityOrgStats.findFirst({
          where: eq(trinityOrgStats.workspaceId, workspaceId),
        }),
      ]);

      const goals: OrgGoal[] = [];
      const now = new Date();

      // Infer goals from org stats and workspace configuration
      if (orgStats) {
        // Feature adoption goal
        const adoptionScore = parseFloat(orgStats.featureAdoptionScore || '0');
        if (adoptionScore < 0.7) {
          goals.push({
            id: `goal-adoption-${workspaceId}`,
            category: 'automation',
            title: 'Increase Platform Feature Adoption',
            description: `Current adoption score is ${(adoptionScore * 100).toFixed(0)}%. Target: 70%+`,
            targetValue: 0.7,
            currentValue: adoptionScore,
            priority: adoptionScore < 0.3 ? 'high' : 'medium',
            createdAt: now,
          });
        }

        // Automation success goal
        const automationRate = parseFloat(orgStats.automationSuccessRate || '0');
        if (automationRate < 0.85) {
          goals.push({
            id: `goal-automation-${workspaceId}`,
            category: 'efficiency',
            title: 'Improve Automation Success Rate',
            description: `Current rate: ${(automationRate * 100).toFixed(0)}%. Target: 85%+`,
            targetValue: 0.85,
            currentValue: automationRate,
            priority: automationRate < 0.5 ? 'critical' : 'high',
            createdAt: now,
          });
        }

        // Org health goal
        const healthScore = parseFloat(orgStats.orgHealthScore || '0.5');
        if (healthScore < 0.8) {
          goals.push({
            id: `goal-health-${workspaceId}`,
            category: 'compliance',
            title: 'Improve Organization Health Score',
            description: `Current health: ${(healthScore * 100).toFixed(0)}%. Target: 80%+`,
            targetValue: 0.8,
            currentValue: healthScore,
            priority: healthScore < 0.5 ? 'critical' : 'medium',
            createdAt: now,
          });
        }

        // Address common pain points
        const painPoints = orgStats.commonPainPoints || [];
        if (painPoints.length > 0) {
          goals.push({
            id: `goal-painpoints-${workspaceId}`,
            category: 'efficiency',
            title: 'Address Recurring Pain Points',
            description: `${painPoints.length} common issues identified: ${painPoints.slice(0, 3).join(', ')}`,
            priority: painPoints.length > 5 ? 'high' : 'medium',
            createdAt: now,
          });
        }

        // Growth opportunities
        const opportunities = orgStats.growthOpportunities || [];
        if (opportunities.length > 0) {
          goals.push({
            id: `goal-growth-${workspaceId}`,
            category: 'growth',
            title: 'Pursue Growth Opportunities',
            description: `${opportunities.length} growth opportunities identified`,
            priority: 'medium',
            createdAt: now,
          });
        }
      }

      // Default goals if no org stats
      if (goals.length === 0) {
        goals.push({
          id: `goal-default-${workspaceId}`,
          category: 'growth',
          title: 'Get Started with Platform Optimization',
          description: 'Let Trinity analyze your organization and identify opportunities',
          priority: 'medium',
          createdAt: now,
        });
      }

      this.goalCache.set(workspaceId, goals);
      return goals;
    } catch (error) {
      log.error('[GuruTaskGraph] Error getting org goals:', error);
      return [];
    }
  }

  // ============================================================================
  // GAP ANALYSIS
  // ============================================================================

  /**
   * Analyze gaps between current state and organizational goals
   */
  async analyzeGaps(workspaceId: string): Promise<GapAnalysis[]> {
    try {
      const [goals, empireResult] = await Promise.all([
        this.getOrgGoals(workspaceId),
        growthStrategist.runWeeklyStrategyScan(workspaceId),
      ]);

      const gaps: GapAnalysis[] = [];

      // Map strategy cards to goals
      for (const goal of goals) {
        const relatedCards = this.findRelatedStrategyCards(goal, empireResult.opportunities);
        
        if (goal.currentValue !== undefined && goal.targetValue !== undefined) {
          const gapSize = goal.targetValue - goal.currentValue;
          if (gapSize > 0) {
            gaps.push({
              goalId: goal.id,
              goalTitle: goal.title,
              gapType: this.inferGapType(goal.category),
              severity: gapSize > 0.3 ? 'high' : gapSize > 0.15 ? 'medium' : 'low',
              description: `${goal.description}. Gap: ${(gapSize * 100).toFixed(0)}%`,
              impactEstimate: this.estimateImpact(goal, gapSize),
              suggestedActions: this.suggestActionsForGap(goal, relatedCards),
              relatedStrategyCards: relatedCards.map(c => c.id),
            });
          }
        } else if (relatedCards.length > 0) {
          // Goal without metrics but with related strategy cards
          gaps.push({
            goalId: goal.id,
            goalTitle: goal.title,
            gapType: this.inferGapType(goal.category),
            severity: goal.priority === 'critical' ? 'critical' : goal.priority === 'high' ? 'high' : 'medium',
            description: goal.description,
            impactEstimate: `${relatedCards.length} opportunity cards identified`,
            suggestedActions: relatedCards.map(c => c.actionLabel),
            relatedStrategyCards: relatedCards.map(c => c.id),
          });
        }
      }

      // Add gaps from strategy cards not linked to goals
      const linkedCardIds = new Set(gaps.flatMap(g => g.relatedStrategyCards));
      const orphanCards = empireResult.opportunities.filter(c => !linkedCardIds.has(c.id));
      
      for (const card of orphanCards) {
        gaps.push({
          goalId: `implied-${card.id}`,
          goalTitle: card.title,
          gapType: this.cardTypeToGapType(card.type),
          severity: card.priority === 'high' ? 'high' : card.priority === 'medium' ? 'medium' : 'low',
          description: card.subtitle,
          impactEstimate: card.impact,
          suggestedActions: [card.actionLabel],
          relatedStrategyCards: [card.id],
        });
      }

      return gaps.sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
    } catch (error) {
      log.error('[GuruTaskGraph] Error analyzing gaps:', error);
      return [];
    }
  }

  private findRelatedStrategyCards(goal: OrgGoal, cards: StrategyCard[]): StrategyCard[] {
    const categoryMap: Record<string, string[]> = {
      revenue: ['cashflow', 'sales'],
      efficiency: ['tools'],
      compliance: ['tools'],
      growth: ['sales', 'networking'],
      retention: ['sales'],
      automation: ['tools'],
    };

    const relevantPillars = categoryMap[goal.category] || [];
    return cards.filter(c => relevantPillars.includes(c.pillar));
  }

  private inferGapType(category: string): GapAnalysis['gapType'] {
    const mapping: Record<string, GapAnalysis['gapType']> = {
      automation: 'underutilization',
      efficiency: 'process_bottleneck',
      compliance: 'missing_capability',
      growth: 'resource_constraint',
      retention: 'knowledge_gap',
      revenue: 'process_bottleneck',
    };
    return mapping[category] || 'knowledge_gap';
  }

  private cardTypeToGapType(cardType: StrategyCard['type']): GapAnalysis['gapType'] {
    const mapping: Record<string, GapAnalysis['gapType']> = {
      CASHFLOW_ALERT: 'process_bottleneck',
      NETWORKING: 'resource_constraint',
      SALES_VELOCITY: 'process_bottleneck',
      TOOL_EXPANSION: 'underutilization',
      EFFICIENCY: 'process_bottleneck',
      GROWTH_TIP: 'knowledge_gap',
    };
    return mapping[cardType] || 'knowledge_gap';
  }

  private estimateImpact(goal: OrgGoal, gapSize: number): string {
    if (goal.category === 'revenue' || goal.category === 'growth') {
      return `Potential ${(gapSize * 100).toFixed(0)}% improvement in ${goal.category}`;
    }
    return `Closing this gap could improve ${goal.category} by ${(gapSize * 100).toFixed(0)}%`;
  }

  private suggestActionsForGap(goal: OrgGoal, relatedCards: StrategyCard[]): string[] {
    const actions: string[] = [];
    
    // Add actions from related strategy cards
    for (const card of relatedCards.slice(0, 3)) {
      actions.push(card.actionLabel);
    }

    // Add generic actions based on goal category
    const genericActions: Record<string, string[]> = {
      automation: ['Enable AI automation features', 'Review manual processes for automation'],
      efficiency: ['Analyze workflow bottlenecks', 'Enable automated reporting'],
      compliance: ['Run compliance audit', 'Update policy configurations'],
      growth: ['Activate growth strategies', 'Review client engagement'],
      retention: ['Analyze user feedback', 'Improve engagement touchpoints'],
      revenue: ['Review outstanding invoices', 'Optimize pricing strategy'],
    };

    const categoryActions = genericActions[goal.category] || [];
    for (const action of categoryActions) {
      if (!actions.includes(action)) {
        actions.push(action);
      }
    }

    return actions.slice(0, 5);
  }

  // ============================================================================
  // TASK RECOMMENDATIONS
  // ============================================================================

  /**
   * Generate AI-powered task recommendations based on gap analysis
   */
  async generateTaskRecommendations(workspaceId: string): Promise<TaskRecommendation[]> {
    const cached = this.recommendationCache.get(workspaceId);
    if (cached) return cached;

    try {
      const [gaps, empireResult] = await Promise.all([
        this.analyzeGaps(workspaceId),
        growthStrategist.runWeeklyStrategyScan(workspaceId),
      ]);

      const recommendations: TaskRecommendation[] = [];
      const now = new Date();

      // Create recommendations from gaps
      for (const gap of gaps) {
        const strategyCard = empireResult.opportunities.find(c => gap.relatedStrategyCards.includes(c.id));
        
        recommendations.push({
          id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          workspaceId,
          sourceGapId: gap.goalId,
          sourceStrategyCardId: strategyCard?.id,
          category: this.gapTypeToCategory(gap.gapType),
          title: gap.goalTitle,
          description: gap.description,
          priority: this.severityToPriority(gap.severity),
          estimatedImpact: gap.impactEstimate,
          estimatedEffort: this.estimateEffort(gap, strategyCard),
          actionFunction: strategyCard?.actionFunction,
          confidence: strategyCard ? 0.85 : 0.7,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });
      }

      // Add standalone strategy cards as recommendations
      for (const card of empireResult.opportunities) {
        const alreadyLinked = recommendations.some(r => r.sourceStrategyCardId === card.id);
        if (!alreadyLinked) {
          recommendations.push({
            id: `rec-card-${card.id}`,
            workspaceId,
            sourceStrategyCardId: card.id,
            category: card.pillar,
            title: card.title,
            description: card.proposal,
            priority: this.cardPriorityToTaskPriority(card.priority),
            estimatedImpact: card.impact,
            estimatedEffort: card.estimatedROI && card.estimatedROI > 1000 ? 'substantial' : 'moderate',
            actionFunction: card.actionFunction,
            confidence: 0.9,
            createdAt: now,
            expiresAt: card.expiresAt || null,
          });
        }
      }

      // Sort by priority and confidence
      recommendations.sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.confidence - a.confidence;
      });

      this.recommendationCache.set(workspaceId, recommendations);
      log.info(`[GuruTaskGraph] Generated ${recommendations.length} recommendations for workspace ${workspaceId}`);
      
      return recommendations;
    } catch (error) {
      log.error('[GuruTaskGraph] Error generating recommendations:', error);
      return [];
    }
  }

  private gapTypeToCategory(gapType: GapAnalysis['gapType']): string {
    const mapping: Record<string, string> = {
      missing_capability: 'setup',
      underutilization: 'optimization',
      process_bottleneck: 'efficiency',
      resource_constraint: 'growth',
      knowledge_gap: 'training',
    };
    return mapping[gapType] || 'general';
  }

  private severityToPriority(severity: GapAnalysis['severity']): TaskRecommendation['priority'] {
    const mapping: Record<string, TaskRecommendation['priority']> = {
      critical: 'urgent',
      high: 'high',
      medium: 'normal',
      low: 'low',
    };
    return mapping[severity] || 'normal';
  }

  private cardPriorityToTaskPriority(priority: StrategyCard['priority']): TaskRecommendation['priority'] {
    const mapping: Record<string, TaskRecommendation['priority']> = {
      high: 'high',
      medium: 'normal',
      low: 'low',
    };
    return mapping[priority] || 'normal';
  }

  private estimateEffort(gap: GapAnalysis, card?: StrategyCard): TaskRecommendation['estimatedEffort'] {
    if (card?.actionFunction) {
      // Actions with automated functions are typically quick
      return 'quick';
    }
    if (gap.gapType === 'missing_capability' || gap.gapType === 'resource_constraint') {
      return 'substantial';
    }
    return 'moderate';
  }

  // ============================================================================
  // TASK ASSIGNMENT
  // ============================================================================

  /**
   * Assign a recommended task to a specific user
   */
  async assignTask(
    workspaceId: string,
    userId: string,
    recommendationId: string,
    options?: { dueDate?: Date; notes?: string }
  ): Promise<TaskAssignment | null> {
    try {
      const recommendations = await this.generateTaskRecommendations(workspaceId);
      const recommendation = recommendations.find(r => r.id === recommendationId);

      if (!recommendation) {
        log.warn(`[GuruTaskGraph] Recommendation ${recommendationId} not found`);
        return null;
      }

      // Create assignment
      const assignment: TaskAssignment = {
        id: `assign-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        workspaceId,
        userId,
        recommendationId,
        status: 'pending',
        assignedAt: new Date(),
        dueDate: options?.dueDate || recommendation.suggestedDueDate,
      };

      // Store in active assignments
      const workspaceAssignments = this.activeAssignments.get(workspaceId) || [];
      workspaceAssignments.push(assignment);
      this.activeAssignments.set(workspaceId, workspaceAssignments);

      // Log assignment for tracking (database persistence handled by active assignments)
      log.info(`[GuruTaskGraph] Task assigned to user ${userId}: ${recommendation.title}`);
      return assignment;
    } catch (error) {
      log.error('[GuruTaskGraph] Error assigning task:', error);
      return null;
    }
  }

  /**
   * Suggest the best user to assign a task to based on confidence stats
   */
  async suggestAssignee(workspaceId: string, recommendation: TaskRecommendation): Promise<string | null> {
    try {
      // Get users with confidence stats for this workspace
      const confidenceStats = await db
        .select()
        .from(trinityUserConfidenceStats)
        .where(eq(trinityUserConfidenceStats.workspaceId, workspaceId))
        .orderBy(desc(trinityUserConfidenceStats.averageConfidence))
        .limit(10);

      if (confidenceStats.length === 0) return null;

      // Score each user based on confidence and trust level
      const scored = confidenceStats.map(stats => {
        let score = 0;
        const confidence = parseFloat(stats.averageConfidence || '0.5');
        score += confidence * 20;

        // Prefer users with higher trust levels
        const trustLevelScores: Record<string, number> = {
          expert: 15,
          established: 10,
          learning: 5,
          new: 0,
        };
        score += trustLevelScores[stats.trustLevel || 'new'] || 0;

        return { userId: stats.userId, score };
      });

      // Sort by score and return best match
      scored.sort((a, b) => b.score - a.score);
      return scored[0]?.userId || null;
    } catch (error) {
      log.error('[GuruTaskGraph] Error suggesting assignee:', error);
      return null;
    }
  }

  // ============================================================================
  // TASK COMPLETION TRACKING
  // ============================================================================

  /**
   * Mark a task as completed and record outcome
   */
  async trackCompletion(
    assignmentId: string,
    outcome: TaskAssignment['outcome'],
    outcomeNotes?: string,
    impactMeasured?: string
  ): Promise<boolean> {
    try {
      // Find assignment
      let assignment: TaskAssignment | undefined;
      let workspaceId: string | undefined;

      for (const [wsId, assignments] of this.activeAssignments) {
        assignment = assignments.find(a => a.id === assignmentId);
        if (assignment) {
          workspaceId = wsId;
          break;
        }
      }

      if (!assignment || !workspaceId) {
        log.warn(`[GuruTaskGraph] Assignment ${assignmentId} not found`);
        return false;
      }

      // Update assignment
      assignment.status = 'completed';
      assignment.completedAt = new Date();
      assignment.outcome = outcome;
      assignment.outcomeNotes = outcomeNotes;
      assignment.impactMeasured = impactMeasured;

      // Update org stats based on outcome
      await this.updateOrgStatsFromCompletion(workspaceId, outcome);

      // Update user confidence if successful
      if (outcome === 'success' && assignment.userId) {
        await this.boostUserConfidence(assignment.userId, workspaceId);
      }

      log.info(`[GuruTaskGraph] Task ${assignmentId} completed with outcome: ${outcome}`);
      return true;
    } catch (error) {
      log.error('[GuruTaskGraph] Error tracking completion:', error);
      return false;
    }
  }

  private async updateOrgStatsFromCompletion(workspaceId: string, outcome: TaskAssignment['outcome']): Promise<void> {
    try {
      const isSuccess = outcome === 'success' || outcome === 'partial';
      
      await db
        .update(trinityOrgStats)
        .set({
          totalOrgInteractions: sql`${trinityOrgStats.totalOrgInteractions} + 1`,
          automationSuccessRate: isSuccess
            ? sql`COALESCE(${trinityOrgStats.automationSuccessRate}, 0) * 0.9 + 0.1`
            : sql`COALESCE(${trinityOrgStats.automationSuccessRate}, 0) * 0.9`,
          updatedAt: new Date(),
        })
        .where(eq(trinityOrgStats.workspaceId, workspaceId));
    } catch (error) {
      log.error('[GuruTaskGraph] Error updating org stats:', error);
    }
  }

  private async boostUserConfidence(userId: string, workspaceId: string): Promise<void> {
    try {
      await db
        .update(trinityUserConfidenceStats)
        .set({
          totalInteractions: sql`${trinityUserConfidenceStats.totalInteractions} + 1`,
          cumulativeConfidence: sql`${trinityUserConfidenceStats.cumulativeConfidence} + 0.9`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(trinityUserConfidenceStats.userId, userId),
            eq(trinityUserConfidenceStats.workspaceId, workspaceId)
          )
        );
    } catch (error) {
      log.error('[GuruTaskGraph] Error boosting user confidence:', error);
    }
  }

  // ============================================================================
  // SUMMARY & DASHBOARD
  // ============================================================================

  /**
   * Get organization task summary for dashboard
   */
  async getOrgTaskSummary(workspaceId: string): Promise<OrgTaskSummary> {
    try {
      const [recommendations, empireResult] = await Promise.all([
        this.generateTaskRecommendations(workspaceId),
        growthStrategist.getStrategySummary(workspaceId),
      ]);

      const assignments = this.activeAssignments.get(workspaceId) || [];
      const pendingTasks = assignments.filter(a => a.status === 'pending' || a.status === 'in_progress');
      const completedTasks = assignments.filter(a => a.status === 'completed');
      const successfulTasks = completedTasks.filter(a => a.outcome === 'success' || a.outcome === 'partial');

      return {
        workspaceId,
        totalRecommendations: recommendations.length,
        pendingTasks: pendingTasks.length,
        completedTasks: completedTasks.length,
        successRate: completedTasks.length > 0 ? successfulTasks.length / completedTasks.length : 0,
        topOpportunities: recommendations.slice(0, 5),
        recentCompletions: completedTasks.slice(-5).reverse(),
        empireScore: empireResult.empireScore,
        lastUpdated: new Date(),
      };
    } catch (error) {
      log.error('[GuruTaskGraph] Error getting org task summary:', error);
      return {
        workspaceId,
        totalRecommendations: 0,
        pendingTasks: 0,
        completedTasks: 0,
        successRate: '0',
        topOpportunities: [],
        recentCompletions: [],
        lastUpdated: new Date(),
      };
    }
  }

  /**
   * Get personalized task recommendations for a specific user
   */
  async getUserTaskRecommendations(workspaceId: string, userId: string): Promise<TaskRecommendation[]> {
    try {
      const recommendations = await this.generateTaskRecommendations(workspaceId);
      
      // Get user's confidence stats to personalize
      const userStats = await db.query.trinityUserConfidenceStats.findFirst({
        where: and(
          eq(trinityUserConfidenceStats.userId, userId),
          eq(trinityUserConfidenceStats.workspaceId, workspaceId)
        ),
      });

      // Filter and sort based on user's skill level
      const trustLevel = userStats?.trustLevel || 'new';
      const effortFilter: Record<string, TaskRecommendation['estimatedEffort'][]> = {
        new: ['quick', 'moderate'],
        learning: ['quick', 'moderate'],
        established: ['quick', 'moderate', 'substantial'],
        expert: ['quick', 'moderate', 'substantial'],
      };

      const allowedEfforts = effortFilter[trustLevel] || ['quick', 'moderate'];
      
      return recommendations.filter(r => allowedEfforts.includes(r.estimatedEffort));
    } catch (error) {
      log.error('[GuruTaskGraph] Error getting user recommendations:', error);
      return [];
    }
  }

  /**
   * Clear recommendation cache (call when significant changes occur)
   */
  clearCache(workspaceId?: string): void {
    if (workspaceId) {
      this.recommendationCache.delete(workspaceId);
      this.goalCache.delete(workspaceId);
    } else {
      this.recommendationCache.clear();
      this.goalCache.clear();
    }
    log.info(`[GuruTaskGraph] Cache cleared${workspaceId ? ` for workspace ${workspaceId}` : ''}`);
  }
}

export const guruTaskGraph = GuruTaskGraphService.getInstance();
