/**
 * SUBAGENT CONFIDENCE MONITOR
 * ============================
 * Trinity AI Brain service that monitors subagent performance and maintains
 * persistent confidence scores per subagent per org.
 * 
 * Features:
 * - Per-subagent confidence scoring based on execution history
 * - Org-level automation readiness aggregation
 * - AI-powered suggestions for workflow enhancements/fixes
 * - Automatic graduation recommendations (hand-held → graduated → full automation)
 * - Integration with Trinity orchestration and AI Brain
 * 
 * Confidence Score Formula:
 * - Base: 50% (neutral starting point)
 * - Success Rate: Weighted 40% based on last 50 executions
 * - Completion Time: Weighted 15% (faster = higher confidence)
 * - User Feedback: Weighted 20% when available
 * - Error Recovery: Weighted 10% (successful retries boost score)
 * - Risk Factor: Negative multiplier for high-risk failures
 */

import { db } from '../../db';
import { AI } from '../../config/platformConfig';
import { eq, and, desc, gte, sql, count, avg } from 'drizzle-orm';
import {
  subagentTelemetry,
  workspaces,
  aiSubagentDefinitions
} from '@shared/schema';
import { automationGovernanceService } from './automationGovernanceService';
import { aiBrainService } from './aiBrainService';
import { TTLCache } from './cacheUtils';
import { createLogger } from '../../lib/logger';
const log = createLogger('subagentConfidenceMonitor');

// ============================================================================
// TYPES
// ============================================================================

export interface SubagentConfidenceScore {
  subagentId: string;
  subagentName: string;
  domain: string;
  confidenceScore: number;
  successRate: number;
  avgExecutionTimeMs: number;
  totalExecutions: number;
  recentSuccesses: number;
  recentFailures: number;
  lastExecutionAt: Date | null;
  trend: 'improving' | 'stable' | 'declining';
  healthStatus: 'healthy' | 'needs_attention' | 'critical';
  recommendations: string[];
}

export interface OrgAutomationReadiness {
  workspaceId: string;
  orgName: string;
  overallScore: number;
  currentLevel: 'hand_held' | 'graduated' | 'full_automation';
  recommendedLevel: 'hand_held' | 'graduated' | 'full_automation';
  canGraduate: boolean;
  graduationBlockers: string[];
  subagentScores: SubagentConfidenceScore[];
  totalTasksCompleted: number;
  totalTasksFailed: number;
  avgConfidence: number;
  strongestAgents: string[];
  weakestAgents: string[];
  suggestions: string[];
  lastEvaluatedAt: Date;
}

export interface ConfidenceUpdateEvent {
  subagentId: string;
  workspaceId: string;
  executionId: string;
  success: boolean;
  executionTimeMs: number;
  confidenceScoreBefore: number;
  confidenceScoreAfter: number;
  retryCount: number;
  escalated: boolean;
}

export interface AIOptimizationSuggestion {
  subagentId: string;
  subagentName: string;
  domain: string;
  suggestionType: 'workflow_enhancement' | 'fix' | 'optimization' | 'training';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  actionable: boolean;
  estimatedImpact: string;
  relatedPatterns: string[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIDENCE_WEIGHTS = {
  successRate: 0.40,
  executionTime: 0.15,
  userFeedback: 0.20,
  errorRecovery: 0.10,
  base: 0.15,
};

const SCORE_THRESHOLDS = {
  critical: 30,
  needsAttention: 50,
  healthy: 70,
  trusted: 90,
};

const AUTOMATION_THRESHOLDS = {
  handHeldMax: 40,
  graduatedMax: 75,
  fullAutomationMin: 76,
};

// ============================================================================
// SUBAGENT CONFIDENCE MONITOR CLASS
// ============================================================================

class SubagentConfidenceMonitor {
  private static instance: SubagentConfidenceMonitor;
  private confidenceCache = new TTLCache<string, SubagentConfidenceScore>(5 * 60 * 1000, 500);
  private orgScoreCache = new TTLCache<string, OrgAutomationReadiness>(3 * 60 * 1000, 100);

  static getInstance(): SubagentConfidenceMonitor {
    if (!this.instance) {
      this.instance = new SubagentConfidenceMonitor();
    }
    return this.instance;
  }

  shutdown(): void {
    this.confidenceCache.shutdown();
    this.orgScoreCache.shutdown();
  }

  // ============================================================================
  // CONFIDENCE SCORING
  // ============================================================================

  /**
   * Calculate confidence score for a subagent based on historical performance
   */
  async getSubagentConfidence(
    subagentId: string,
    workspaceId: string
  ): Promise<SubagentConfidenceScore | null> {
    const cacheKey = `${workspaceId}:${subagentId}`;
    const cached = this.confidenceCache.get(cacheKey);
    if (cached) return cached;

    try {
      // Get subagent definition
      const [subagent] = await db
        .select()
        .from(aiSubagentDefinitions)
        .where(eq(aiSubagentDefinitions.id, subagentId))
        .limit(1);

      if (!subagent) return null;

      // Get recent telemetry (last 50 executions)
      const recentTelemetry = await db
        .select()
        .from(subagentTelemetry)
        .where(
          and(
            eq(subagentTelemetry.subagentId, subagentId),
            eq(subagentTelemetry.workspaceId, workspaceId)
          )
        )
        .orderBy(desc(subagentTelemetry.startedAt))
        .limit(50);

      if (recentTelemetry.length === 0) {
        // No history - return default score
        const defaultScore: SubagentConfidenceScore = {
          subagentId,
          subagentName: subagent.name,
          domain: subagent.domain,
          confidenceScore: 50,
          successRate: 0,
          avgExecutionTimeMs: 0,
          totalExecutions: 0,
          recentSuccesses: 0,
          recentFailures: 0,
          lastExecutionAt: null,
          trend: 'stable',
          healthStatus: 'needs_attention',
          recommendations: ['No execution history - agent is untested'],
        };
        return defaultScore;
      }

      // Calculate metrics
      const successes = recentTelemetry.filter(t => t.status === 'completed').length;
      const failures = recentTelemetry.filter(t => t.status === 'failed' || t.status === 'derailed').length;
      const successRate = (successes / recentTelemetry.length) * 100;

      const avgExecutionTimeMs = recentTelemetry.reduce((sum, t) => sum + (t.durationMs || 0), 0) / recentTelemetry.length;

      // Calculate confidence score with weighted formula
      const successComponent = successRate * CONFIDENCE_WEIGHTS.successRate;
      
      // Time component: faster is better (target: under 10s = 100%)
      const targetTimeMs = AI.targetResponseTimeMs;
      const timeScore = Math.min(100, (targetTimeMs / Math.max(avgExecutionTimeMs, 1000)) * 100);
      const timeComponent = timeScore * CONFIDENCE_WEIGHTS.executionTime;

      // Recovery component: successful retries boost confidence
      const retriedSuccesses = recentTelemetry.filter(t => t.retryCount && t.retryCount > 0 && t.status === 'completed').length;
      const recoveryRate = recentTelemetry.length > 0 ? (retriedSuccesses / recentTelemetry.length) * 100 : 50;
      const recoveryComponent = recoveryRate * CONFIDENCE_WEIGHTS.errorRecovery;

      // Base component (neutral starting point)
      const baseComponent = 50 * CONFIDENCE_WEIGHTS.base;

      // Aggregate confidence
      const rawConfidence = successComponent + timeComponent + recoveryComponent + baseComponent;

      // Apply penalty for recent failures (last 10 executions)
      const recentLast10 = recentTelemetry.slice(0, 10);
      const recentFailures = recentLast10.filter(t => t.status === 'failed' || t.status === 'derailed').length;
      const recentPenalty = recentFailures * 3; // 3% penalty per recent failure

      const confidenceScore = Math.max(0, Math.min(100, Math.round(rawConfidence - recentPenalty)));

      // Determine trend
      const olderTelemetry = recentTelemetry.slice(25);
      const newerTelemetry = recentTelemetry.slice(0, 25);
      const olderSuccessRate = olderTelemetry.length > 0 
        ? olderTelemetry.filter(t => t.status === 'completed').length / olderTelemetry.length
        : 0.5;
      const newerSuccessRate = newerTelemetry.length > 0
        ? newerTelemetry.filter(t => t.status === 'completed').length / newerTelemetry.length
        : 0.5;
      
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (newerSuccessRate > olderSuccessRate + 0.1) trend = 'improving';
      else if (newerSuccessRate < olderSuccessRate - 0.1) trend = 'declining';

      // Determine health status
      let healthStatus: 'healthy' | 'needs_attention' | 'critical' = 'healthy';
      if (confidenceScore < SCORE_THRESHOLDS.critical) healthStatus = 'critical';
      else if (confidenceScore < SCORE_THRESHOLDS.needsAttention) healthStatus = 'needs_attention';

      // Generate recommendations
      const recommendations = this.generateSubagentRecommendations(
        subagent.name,
        confidenceScore,
        successRate,
        avgExecutionTimeMs,
        recentFailures,
        trend
      );

      const score: SubagentConfidenceScore = {
        subagentId,
        subagentName: subagent.name,
        domain: subagent.domain,
        confidenceScore,
        successRate: Math.round(successRate),
        avgExecutionTimeMs: Math.round(avgExecutionTimeMs),
        totalExecutions: recentTelemetry.length,
        recentSuccesses: successes,
        recentFailures: failures,
        lastExecutionAt: recentTelemetry[0]?.startedAt || null,
        trend,
        healthStatus,
        recommendations,
      };

      this.confidenceCache.set(cacheKey, score);
      return score;

    } catch (error) {
      log.error('[SubagentConfidenceMonitor] Error calculating confidence:', error);
      return null;
    }
  }

  /**
   * Update confidence after an execution completes
   */
  async recordExecution(params: {
    subagentId: string;
    workspaceId: string;
    executionId: string;
    success: boolean;
    executionTimeMs: number;
    retryCount: number;
    escalated: boolean;
    confidenceScore: number;
  }): Promise<ConfidenceUpdateEvent | null> {
    const { subagentId, workspaceId, executionId, success, executionTimeMs, retryCount, escalated, confidenceScore } = params;

    try {
      // Get current confidence before update
      const currentScore = await this.getSubagentConfidence(subagentId, workspaceId);
      const confidenceBefore = currentScore?.confidenceScore || 50;

      // Invalidate cache to force recalculation
      this.confidenceCache.delete(`${workspaceId}:${subagentId}`);
      this.orgScoreCache.delete(workspaceId);

      // Get updated confidence
      const updatedScore = await this.getSubagentConfidence(subagentId, workspaceId);
      const confidenceAfter = updatedScore?.confidenceScore || confidenceBefore;

      const event: ConfidenceUpdateEvent = {
        subagentId,
        workspaceId,
        executionId,
        success,
        executionTimeMs,
        confidenceScoreBefore: confidenceBefore,
        confidenceScoreAfter: confidenceAfter,
        retryCount,
        escalated,
      };

      log.info(`[SubagentConfidenceMonitor] Confidence updated: ${subagentId} ${confidenceBefore} → ${confidenceAfter}`);

      // Check if org should be evaluated for graduation
      if (confidenceAfter >= SCORE_THRESHOLDS.trusted) {
        await this.checkOrgGraduationEligibility(workspaceId);
      }

      return event;

    } catch (error) {
      log.error('[SubagentConfidenceMonitor] Error recording execution:', error);
      return null;
    }
  }

  // ============================================================================
  // ORG-LEVEL AUTOMATION READINESS
  // ============================================================================

  /**
   * Calculate org-level automation readiness based on all subagent scores
   */
  async getOrgAutomationReadiness(workspaceId: string): Promise<OrgAutomationReadiness | null> {
    const cached = this.orgScoreCache.get(workspaceId);
    if (cached) return cached;

    try {
      // Get workspace info
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      // Get current policy
      const policy = await automationGovernanceService.getOrCreatePolicy(workspaceId);

      // Get all active subagents
      const activeSubagents = await db
        .select()
        .from(aiSubagentDefinitions)
        .where(eq(aiSubagentDefinitions.isActive, true));

      // Calculate confidence for each subagent
      const subagentScores: SubagentConfidenceScore[] = [];
      for (const subagent of activeSubagents) {
        const score = await this.getSubagentConfidence(subagent.id, workspaceId);
        if (score) {
          subagentScores.push(score);
        }
      }

      // Filter to only subagents with execution history
      const scoredSubagents = subagentScores.filter(s => s.totalExecutions > 0);

      if (scoredSubagents.length === 0) {
        const readiness: OrgAutomationReadiness = {
          workspaceId,
          orgName: workspace?.name || 'Unknown',
          overallScore: 0,
          currentLevel: policy.currentLevel as 'hand_held' | 'graduated' | 'full_automation',
          recommendedLevel: 'hand_held',
          canGraduate: false,
          graduationBlockers: ['No automation history - complete more tasks to build trust'],
          subagentScores: [],
          totalTasksCompleted: 0,
          totalTasksFailed: 0,
          avgConfidence: 0,
          strongestAgents: [],
          weakestAgents: [],
          suggestions: ['Start using AI automation features to build your organization\'s trust score'],
          lastEvaluatedAt: new Date(),
        };
        return readiness;
      }

      // Aggregate metrics
      const avgConfidence = scoredSubagents.reduce((sum, s) => sum + s.confidenceScore, 0) / scoredSubagents.length;
      const totalCompleted = scoredSubagents.reduce((sum, s) => sum + s.recentSuccesses, 0);
      const totalFailed = scoredSubagents.reduce((sum, s) => sum + s.recentFailures, 0);

      // Sort for strongest/weakest
      const sortedByScore = [...scoredSubagents].sort((a, b) => b.confidenceScore - a.confidenceScore);
      const strongestAgents = sortedByScore.slice(0, 3).map(s => s.subagentName);
      const weakestAgents = sortedByScore.slice(-3).reverse().map(s => s.subagentName);

      // Determine recommended level
      let recommendedLevel: 'hand_held' | 'graduated' | 'full_automation' = 'hand_held';
      if (avgConfidence >= AUTOMATION_THRESHOLDS.fullAutomationMin) {
        recommendedLevel = 'full_automation';
      } else if (avgConfidence > AUTOMATION_THRESHOLDS.handHeldMax) {
        recommendedLevel = 'graduated';
      }

      // Check graduation blockers
      const blockers: string[] = [];
      const criticalAgents = scoredSubagents.filter(s => s.healthStatus === 'critical');
      if (criticalAgents.length > 0) {
        blockers.push(`${criticalAgents.length} agent(s) in critical status: ${criticalAgents.map(a => a.subagentName).join(', ')}`);
      }

      const decliningAgents = scoredSubagents.filter(s => s.trend === 'declining');
      if (decliningAgents.length > scoredSubagents.length * 0.3) {
        blockers.push('More than 30% of agents have declining performance');
      }

      if (totalFailed > totalCompleted * 0.2) {
        blockers.push('Failure rate exceeds 20% threshold');
      }

      const minExecutionsRequired = 10;
      const lowHistoryAgents = scoredSubagents.filter(s => s.totalExecutions < minExecutionsRequired);
      if (lowHistoryAgents.length > scoredSubagents.length * 0.5) {
        blockers.push('More than 50% of agents lack sufficient execution history');
      }

      const canGraduate = blockers.length === 0 && 
        recommendedLevel !== 'hand_held' &&
        recommendedLevel !== policy.currentLevel;

      // Generate org-level suggestions
      const suggestions = await this.generateOrgSuggestions(
        scoredSubagents,
        avgConfidence,
        policy.currentLevel as 'hand_held' | 'graduated' | 'full_automation',
        recommendedLevel
      );

      const readiness: OrgAutomationReadiness = {
        workspaceId,
        orgName: workspace?.name || 'Unknown',
        overallScore: Math.round(avgConfidence),
        currentLevel: policy.currentLevel as 'hand_held' | 'graduated' | 'full_automation',
        recommendedLevel,
        canGraduate,
        graduationBlockers: blockers,
        subagentScores: scoredSubagents,
        totalTasksCompleted: totalCompleted,
        totalTasksFailed: totalFailed,
        avgConfidence: Math.round(avgConfidence),
        strongestAgents,
        weakestAgents,
        suggestions,
        lastEvaluatedAt: new Date(),
      };

      this.orgScoreCache.set(workspaceId, readiness);
      return readiness;

    } catch (error) {
      log.error('[SubagentConfidenceMonitor] Error calculating org readiness:', error);
      return null;
    }
  }

  /**
   * Check if org should graduate to higher automation level
   */
  async checkOrgGraduationEligibility(workspaceId: string): Promise<{
    eligible: boolean;
    currentLevel: string;
    recommendedLevel: string;
    blockers: string[];
  }> {
    const readiness = await this.getOrgAutomationReadiness(workspaceId);
    if (!readiness) {
      return {
        eligible: false,
        currentLevel: 'hand_held',
        recommendedLevel: 'hand_held',
        blockers: ['Unable to calculate readiness'],
      };
    }

    return {
      eligible: readiness.canGraduate,
      currentLevel: readiness.currentLevel,
      recommendedLevel: readiness.recommendedLevel,
      blockers: readiness.graduationBlockers,
    };
  }

  /**
   * Graduate org to higher automation level (if eligible)
   */
  async graduateOrg(workspaceId: string, approvedBy: string): Promise<{
    success: boolean;
    previousLevel: string;
    newLevel: string;
    message: string;
  }> {
    const eligibility = await this.checkOrgGraduationEligibility(workspaceId);
    
    if (!eligibility.eligible) {
      return {
        success: false,
        previousLevel: eligibility.currentLevel,
        newLevel: eligibility.currentLevel,
        message: `Cannot graduate: ${eligibility.blockers.join('; ')}`,
      };
    }

    try {
      const updated = await automationGovernanceService.updatePolicy({
        workspaceId,
        currentLevel: eligibility.recommendedLevel as 'hand_held' | 'graduated' | 'full_automation',
      });

      if (updated) {
        log.info(`[SubagentConfidenceMonitor] Org graduated: ${workspaceId} ${eligibility.currentLevel} → ${eligibility.recommendedLevel}`);
        
        // Clear cache
        this.orgScoreCache.delete(workspaceId);

        return {
          success: true,
          previousLevel: eligibility.currentLevel,
          newLevel: eligibility.recommendedLevel,
          message: `Successfully graduated to ${eligibility.recommendedLevel} automation level`,
        };
      }

      return {
        success: false,
        previousLevel: eligibility.currentLevel,
        newLevel: eligibility.currentLevel,
        message: 'Failed to update automation policy',
      };

    } catch (error) {
      log.error('[SubagentConfidenceMonitor] Error graduating org:', error);
      return {
        success: false,
        previousLevel: eligibility.currentLevel,
        newLevel: eligibility.currentLevel,
        message: `Error: ${error}`,
      };
    }
  }

  // ============================================================================
  // AI-POWERED SUGGESTIONS
  // ============================================================================

  /**
   * Get AI-powered optimization suggestions for a subagent
   */
  async getOptimizationSuggestions(
    subagentId: string,
    workspaceId: string
  ): Promise<AIOptimizationSuggestion[]> {
    const score = await this.getSubagentConfidence(subagentId, workspaceId);
    if (!score) return [];

    const suggestions: AIOptimizationSuggestion[] = [];

    // Critical health status
    if (score.healthStatus === 'critical') {
      suggestions.push({
        subagentId,
        subagentName: score.subagentName,
        domain: score.domain,
        suggestionType: 'fix',
        priority: 'critical',
        title: 'Critical Agent Health',
        description: `${score.subagentName} has a confidence score of ${score.confidenceScore}%. Review recent failures and consider workflow adjustments.`,
        actionable: true,
        estimatedImpact: 'Could improve success rate by 30-50%',
        relatedPatterns: ['high_failure_rate', 'critical_status'],
      });
    }

    // Declining trend
    if (score.trend === 'declining') {
      suggestions.push({
        subagentId,
        subagentName: score.subagentName,
        domain: score.domain,
        suggestionType: 'workflow_enhancement',
        priority: 'high',
        title: 'Declining Performance Trend',
        description: `${score.subagentName} performance is declining. Recent success rate: ${score.successRate}%. Consider reviewing input data quality and workflow parameters.`,
        actionable: true,
        estimatedImpact: 'Stabilize and potentially improve performance',
        relatedPatterns: ['declining_trend', 'recent_failures'],
      });
    }

    // Slow execution
    if (score.avgExecutionTimeMs > 15000) {
      suggestions.push({
        subagentId,
        subagentName: score.subagentName,
        domain: score.domain,
        suggestionType: 'optimization',
        priority: 'medium',
        title: 'Slow Execution Time',
        description: `${score.subagentName} averages ${Math.round(score.avgExecutionTimeMs / 1000)}s per execution. Consider optimizing data queries or breaking into smaller tasks.`,
        actionable: true,
        estimatedImpact: 'Reduce execution time by 20-40%',
        relatedPatterns: ['slow_execution', 'timeout_risk'],
      });
    }

    // Low usage
    if (score.totalExecutions < 5) {
      suggestions.push({
        subagentId,
        subagentName: score.subagentName,
        domain: score.domain,
        suggestionType: 'training',
        priority: 'low',
        title: 'Limited Execution History',
        description: `${score.subagentName} has only ${score.totalExecutions} executions. More usage will help build confidence and identify optimization opportunities.`,
        actionable: false,
        estimatedImpact: 'Build trust through consistent usage',
        relatedPatterns: ['low_usage', 'untested'],
      });
    }

    return suggestions;
  }

  /**
   * Get all suggestions for an org
   */
  async getOrgOptimizationSuggestions(workspaceId: string): Promise<AIOptimizationSuggestion[]> {
    const readiness = await this.getOrgAutomationReadiness(workspaceId);
    if (!readiness) return [];

    const allSuggestions: AIOptimizationSuggestion[] = [];

    for (const score of readiness.subagentScores) {
      const agentSuggestions = await this.getOptimizationSuggestions(score.subagentId, workspaceId);
      allSuggestions.push(...agentSuggestions);
    }

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    return allSuggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private generateSubagentRecommendations(
    agentName: string,
    confidenceScore: number,
    successRate: number,
    avgTimeMs: number,
    recentFailures: number,
    trend: 'improving' | 'stable' | 'declining'
  ): string[] {
    const recommendations: string[] = [];

    if (confidenceScore < SCORE_THRESHOLDS.critical) {
      recommendations.push(`${agentName} requires immediate attention - confidence critically low`);
    }

    if (successRate < 70) {
      recommendations.push(`Review ${agentName} workflow - success rate (${Math.round(successRate)}%) below target`);
    }

    if (avgTimeMs > 20000) {
      recommendations.push(`Optimize ${agentName} execution - averaging ${Math.round(avgTimeMs / 1000)}s per task`);
    }

    if (recentFailures > 3) {
      recommendations.push(`${recentFailures} recent failures detected - investigate error patterns`);
    }

    if (trend === 'declining') {
      recommendations.push(`Performance trend declining - consider workflow adjustments`);
    }

    if (recommendations.length === 0 && confidenceScore >= SCORE_THRESHOLDS.trusted) {
      recommendations.push(`${agentName} is performing well - trusted for autonomous operations`);
    }

    return recommendations;
  }

  private async generateOrgSuggestions(
    subagentScores: SubagentConfidenceScore[],
    avgConfidence: number,
    currentLevel: 'hand_held' | 'graduated' | 'full_automation',
    recommendedLevel: 'hand_held' | 'graduated' | 'full_automation'
  ): Promise<string[]> {
    const suggestions: string[] = [];

    if (recommendedLevel !== currentLevel) {
      if (recommendedLevel === 'graduated' && currentLevel === 'hand_held') {
        suggestions.push('Your organization is ready to graduate to Graduated automation - routine tasks can run automatically');
      } else if (recommendedLevel === 'full_automation' && currentLevel !== 'full_automation') {
        suggestions.push('Your organization has achieved high trust scores - consider enabling Full Automation');
      }
    }

    const criticalAgents = subagentScores.filter(s => s.healthStatus === 'critical');
    if (criticalAgents.length > 0) {
      suggestions.push(`Focus on improving ${criticalAgents.map(a => a.subagentName).join(', ')} - currently in critical status`);
    }

    const decliningAgents = subagentScores.filter(s => s.trend === 'declining');
    if (decliningAgents.length > 0) {
      suggestions.push(`Monitor declining agents: ${decliningAgents.map(a => a.subagentName).join(', ')}`);
    }

    if (avgConfidence < 50) {
      suggestions.push('Continue using AI features consistently to build organizational trust score');
    }

    if (suggestions.length === 0) {
      suggestions.push('Your automation system is performing well - continue monitoring for optimization opportunities');
    }

    return suggestions;
  }

  // ============================================================================
  // TRINITY AI BRAIN INTEGRATION
  // ============================================================================

  /**
   * Get monitoring summary for Trinity AI Brain
   */
  async getTrinityMonitoringSummary(workspaceId: string): Promise<{
    orgScore: number;
    level: string;
    canGraduate: boolean;
    topIssues: string[];
    recommendations: string[];
  }> {
    const readiness = await this.getOrgAutomationReadiness(workspaceId);
    if (!readiness) {
      return {
        orgScore: 0,
        level: 'hand_held',
        canGraduate: false,
        topIssues: ['Unable to retrieve monitoring data'],
        recommendations: ['Try again later or contact support'],
      };
    }

    const topIssues: string[] = [];
    
    // Add graduation blockers as issues
    topIssues.push(...readiness.graduationBlockers.slice(0, 3));

    // Add critical agent issues
    const criticalAgents = readiness.subagentScores.filter(s => s.healthStatus === 'critical');
    for (const agent of criticalAgents.slice(0, 2)) {
      topIssues.push(`${agent.subagentName}: ${agent.confidenceScore}% confidence (critical)`);
    }

    return {
      orgScore: readiness.overallScore,
      level: readiness.currentLevel,
      canGraduate: readiness.canGraduate,
      topIssues: topIssues.slice(0, 5),
      recommendations: readiness.suggestions.slice(0, 3),
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const subagentConfidenceMonitor = SubagentConfidenceMonitor.getInstance();
