/**
 * REINFORCEMENT LEARNING LOOP
 * ============================
 * Fortune 500-grade self-improvement system for AI agents.
 * Tracks success/failure outcomes and adapts agent strategies
 * to improve efficiency and reduce human escalations.
 * 
 * Key Capabilities:
 * - Reward tracking for successful outcomes
 * - Penalty assignment for failures requiring human intervention
 * - Strategy adaptation based on historical performance
 * - Confidence calibration for autonomous decisions
 */

import { platformEventBus } from '../platformEventBus';
import { sharedKnowledgeGraph, type KnowledgeDomain } from './sharedKnowledgeGraph';
import { rlLoopRepository } from './cognitiveRepositories';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { strengthenPath, weakenPath } from './hebbianLearningService';
import { broadcastToGlobalWorkspace } from './trinityConnectomeService';
import crypto from 'crypto';
import { createLogger } from '../../lib/logger';
const log = createLogger('reinforcementLearningLoop');

// ============================================================================
// TYPES
// ============================================================================

export interface Experience {
  id: string;
  agentId: string;
  workspaceId?: string;
  domain: KnowledgeDomain;
  action: string;
  state: StateRepresentation;
  outcome: 'success' | 'failure' | 'partial' | 'escalated';
  reward: number;
  humanIntervention: boolean;
  feedback?: 'positive' | 'negative' | 'neutral';
  contextWindow: Record<string, any>;
  executionTimeMs: number;
  timestamp: Date;
}

export interface StateRepresentation {
  domain: KnowledgeDomain;
  action: string;
  complexity: 'low' | 'medium' | 'high' | 'critical';
  priorSuccessRate: number;
  similarExperienceCount: number;
  confidenceLevel: number;
  contextFactors: Record<string, any>;
}

export interface StrategyAdaptation {
  id: string;
  agentId: string;
  domain: KnowledgeDomain;
  action: string;
  previousStrategy: string;
  newStrategy: string;
  triggerReason: string;
  expectedImprovement: number;
  appliedAt: Date;
  validated: boolean;
}

export interface ConfidenceModel {
  agentId: string;
  workspaceId?: string;
  domain: KnowledgeDomain;
  action: string;
  baseConfidence: number;
  adjustedConfidence: number;
  experienceCount: number;
  successRate: number;
  lastUpdated: Date;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  name: string;
  weight: number;
  currentValue: number;
  impact: number;
}

export interface LearningMetrics {
  totalExperiences: number;
  successRate: number;
  escalationRate: number;
  avgReward: number;
  improvementTrend: number;
  topPerformingActions: { action: string; successRate: number }[];
  problemAreas: { action: string; failureRate: number; recommendation: string }[];
}

// ============================================================================
// REINFORCEMENT LEARNING SERVICE
// ============================================================================

class ReinforcementLearningLoop {
  private static instance: ReinforcementLearningLoop;

  private experiences: Map<string, Experience> = new Map();
  private confidenceModels: Map<string, ConfidenceModel> = new Map();
  private strategyAdaptations: StrategyAdaptation[] = [];
  private rewardHistory: { timestamp: Date; reward: number; domain: KnowledgeDomain }[] = [];

  // Memory caps — prevent unbounded growth in long-running processes
  private readonly MAX_EXPERIENCES = 10000;
  private readonly MAX_REWARD_HISTORY = 5000;

  // Learning hyperparameters
  private readonly LEARNING_RATE = 0.1;
  private readonly DISCOUNT_FACTOR = 0.9;
  private readonly EXPLORATION_RATE = 0.1;
  private readonly ESCALATION_PENALTY = -0.5;
  private readonly SUCCESS_REWARD = 1.0;
  private readonly PARTIAL_REWARD = 0.5;
  private readonly MIN_EXPERIENCES_FOR_ADAPTATION = 10;
  // Prevent adaptation burst: each agent/action combo can only adapt once per 5 minutes
  private readonly ADAPTATION_COOLDOWN_MS = 5 * 60 * 1000;
  private lastAdaptationTime: Map<string, number> = new Map();

  private dbInitialized = false;

  static getInstance(): ReinforcementLearningLoop {
    if (!this.instance) {
      this.instance = new ReinforcementLearningLoop();
      // Defer DB load 120s — probes DB first to avoid circuit-open storms
      setTimeout(async () => {
        try {
          const { probeDbConnection } = await import('../../db');
          const dbOk = await probeDbConnection();
          if (!dbOk) {
            log.warn('[RL Loop] Skipping deferred DB load — probe failed');
            return;
          }
          await this.instance.loadFromDatabase();
        } catch (err: any) {
          log.warn('[RL Loop] Deferred DB load failed (non-fatal):', err?.message);
        }
      }, 120000);
    }
    return this.instance;
  }

  /**
   * Load experiences and confidence models from database on startup
   */
  private async loadFromDatabase(): Promise<void> {
    if (this.dbInitialized) return;
    
    try {
      const dbExperiences = await rlLoopRepository.getAllExperiences(500);
      const dbModels = await rlLoopRepository.getAllConfidenceModels();

      for (const dbExp of dbExperiences) {
        const experience: Experience = {
          id: dbExp.id,
          agentId: dbExp.agentId,
          domain: 'general' as KnowledgeDomain,
          action: dbExp.actionType,
          state: {
            domain: 'general' as KnowledgeDomain,
            action: dbExp.actionType,
            complexity: 'medium',
            priorSuccessRate: 0.5,
            similarExperienceCount: 0,
            confidenceLevel: 0.5,
            contextFactors: dbExp.context || {},
          },
          outcome: dbExp.outcome as any,
          reward: parseFloat(dbExp.reward || '0'),
          humanIntervention: dbExp.humanValidated || false,
          contextWindow: dbExp.context || {},
          executionTimeMs: dbExp.executionTimeMs || 0,
          timestamp: dbExp.createdAt,
        };
        this.experiences.set(experience.id, experience);
      }

      for (const dbModel of dbModels) {
        const key = `${dbModel.agentId}-general-${dbModel.actionType}`;
        const model: ConfidenceModel = {
          agentId: dbModel.agentId,
          domain: 'general' as KnowledgeDomain,
          action: dbModel.actionType,
          baseConfidence: 0.5,
          adjustedConfidence: parseFloat(dbModel.currentConfidence || '0.5'),
          experienceCount: dbModel.sampleCount || 0,
          successRate: parseFloat(dbModel.successRate || '0.5'),
          lastUpdated: dbModel.lastUpdate || new Date(),
          factors: [],
        };
        this.confidenceModels.set(key, model);
      }

      this.dbInitialized = true;
      log.info(`[RL Loop] Loaded ${dbExperiences.length} experiences and ${dbModels.length} confidence models from database`);
    } catch (error: any) {
      log.error('[RL Loop] Database load error:', (error instanceof Error ? error.message : String(error)));
    }
  }

  // ============================================================================
  // EXPERIENCE RECORDING
  // ============================================================================

  /**
   * Record an experience (action-outcome pair)
   */
  recordExperience(params: {
    agentId: string;
    workspaceId?: string;
    domain: KnowledgeDomain;
    action: string;
    outcome: 'success' | 'failure' | 'partial' | 'escalated';
    humanIntervention?: boolean;
    feedback?: 'positive' | 'negative' | 'neutral';
    contextWindow?: Record<string, any>;
    executionTimeMs?: number;
  }): Experience {
    const { agentId, workspaceId, domain, action, outcome, humanIntervention = false, feedback, contextWindow = {}, executionTimeMs = 0 } = params;

    // Calculate reward
    let reward = this.calculateReward(outcome, humanIntervention, feedback);

    // TENANT ISOLATION: Confidence models scoped per workspace
    const wsScope = workspaceId || 'global';
    const confidenceKey = `${agentId}-${domain}-${action}-${wsScope}`;
    const model = this.confidenceModels.get(confidenceKey);
    const similarExperiences = this.getSimilarExperiences(agentId, domain, action, workspaceId);

    const state: StateRepresentation = {
      domain,
      action,
      complexity: this.estimateComplexity(contextWindow),
      priorSuccessRate: model?.successRate || 0.5,
      similarExperienceCount: similarExperiences.length,
      confidenceLevel: model?.adjustedConfidence || 0.5,
      contextFactors: contextWindow,
    };

    const experience: Experience = {
      id: crypto.randomUUID(),
      agentId,
      workspaceId,
      domain,
      action,
      state,
      outcome,
      reward,
      humanIntervention,
      feedback,
      contextWindow,
      executionTimeMs,
      timestamp: new Date(),
    };

    this.experiences.set(experience.id, experience);
    // Evict oldest entry when cap is reached (Map preserves insertion order)
    if (this.experiences.size > this.MAX_EXPERIENCES) {
      const oldestKey = this.experiences.keys().next().value;
      if (oldestKey) this.experiences.delete(oldestKey);
    }

    this.rewardHistory.push({ timestamp: new Date(), reward, domain });
    // Trim reward history to avoid unbounded array growth
    if (this.rewardHistory.length > this.MAX_REWARD_HISTORY) {
      this.rewardHistory.splice(0, this.rewardHistory.length - this.MAX_REWARD_HISTORY);
    }

    // Persist to database (async, non-blocking)
    rlLoopRepository.createExperience({
      id: experience.id,
      agentId,
      actionType: action,
      context: contextWindow,
      outcome,
      reward,
      executionTimeMs,
      humanValidated: humanIntervention,
    }).catch(err => log.error('[RL Loop] DB persist error:', (err instanceof Error ? err.message : String(err))));

    // Update confidence model (workspace-scoped)
    this.updateConfidenceModel(agentId, domain, action, outcome, reward, workspaceId);

    // Check if adaptation is needed (workspace-scoped)
    this.checkForAdaptation(agentId, domain, action, workspaceId);

    // Record to shared knowledge graph
    sharedKnowledgeGraph.recordLearning({
      domain,
      agentId,
      action,
      context: contextWindow,
      outcome: outcome === 'escalated' ? 'failure' : outcome,
      reward,
      insights: this.generateInsights(experience),
    });

    // HEBBIAN: Strengthen decision pathways when Trinity succeeds; weaken them
    // on failure.  entityIds drawn from the context window (any knowledge
    // entity IDs the caller embedded) form the "decision pathway".
    const knowledgeEntityIds: string[] = [
      ...(contextWindow.entityIds || []),
      ...(contextWindow.knowledgeIds || []),
    ].filter((id: any) => typeof id === 'string' && id.length > 0);

    if (knowledgeEntityIds.length >= 2) {
      if (outcome === 'success') {
        strengthenPath(knowledgeEntityIds, 0.05);
      } else if (outcome === 'failure' || outcome === 'escalated') {
        weakenPath(knowledgeEntityIds, 0.025);
      }
    }

    // BASAL_GANGLIA → GLOBAL_WORKSPACE broadcast: report reward signal
    broadcastToGlobalWorkspace(
      'BASAL_GANGLIA',
      'experience_recorded',
      { agentId, domain, action, outcome, reward },
      workspaceId,
      Math.abs(reward),
    );

    // Emit learning event
    platformEventBus.publish({
      type: 'experience_recorded',
      category: 'feature',
      title: 'Experience Recorded',
      description: `${agentId}/${action}: ${outcome} (reward: ${reward.toFixed(2)})`,
      metadata: {
        experienceId: experience.id,
        agentId,
        domain,
        action,
        outcome,
        reward,
      },
    }).catch((err) => log.warn('[reinforcementLearningLoop] Fire-and-forget failed:', err));

    log.verbose(`[RL Loop] Experience recorded: ${agentId}/${action} -> ${outcome} (reward: ${reward.toFixed(2)})`);

    return experience;
  }

  /**
   * Calculate reward based on outcome
   */
  private calculateReward(
    outcome: 'success' | 'failure' | 'partial' | 'escalated',
    humanIntervention: boolean,
    feedback?: 'positive' | 'negative' | 'neutral'
  ): number {
    let reward = 0;

    switch (outcome) {
      case 'success':
        reward = this.SUCCESS_REWARD;
        break;
      case 'partial':
        reward = this.PARTIAL_REWARD;
        break;
      case 'failure':
        reward = -0.3;
        break;
      case 'escalated':
        reward = this.ESCALATION_PENALTY;
        break;
    }

    // Penalty for human intervention
    if (humanIntervention) {
      reward += this.ESCALATION_PENALTY * 0.5;
    }

    // Adjust based on feedback
    if (feedback === 'positive') {
      reward = Math.min(1.0, reward + 0.2);
    } else if (feedback === 'negative') {
      reward = Math.max(-1.0, reward - 0.3);
    }

    return reward;
  }

  private estimateComplexity(context: Record<string, any>): 'low' | 'medium' | 'high' | 'critical' {
    const keys = Object.keys(context);
    if (keys.length < 3) return 'low';
    if (keys.length < 7) return 'medium';
    if (context.critical || context.riskLevel === 'high') return 'critical';
    return 'high';
  }

  private getSimilarExperiences(agentId: string, domain: KnowledgeDomain, action: string, workspaceId?: string): Experience[] {
    return Array.from(this.experiences.values())
      .filter(e => {
        const matchesBase = e.agentId === agentId && e.domain === domain && e.action === action;
        // G22 FIX: Strict tenant isolation — exclude experiences stored without a
        // workspaceId (previously tagged 'global'). Only experiences explicitly
        // belonging to this workspace are returned, preventing RL patterns from
        // one org's data from influencing another org's confidence models.
        if (workspaceId) {
          return matchesBase && e.workspaceId === workspaceId;
        }
        return matchesBase;
      });
  }

  private generateInsights(experience: Experience): string[] {
    const insights: string[] = [];
    
    if (experience.outcome === 'success' && experience.executionTimeMs < 1000) {
      insights.push('Fast successful execution');
    }
    
    if (experience.humanIntervention) {
      insights.push('Required human intervention - consider adding guardrails');
    }
    
    if (experience.feedback === 'negative') {
      insights.push('Negative user feedback - review approach');
    }

    return insights;
  }

  // ============================================================================
  // CONFIDENCE MODEL
  // ============================================================================

  /**
   * Update confidence model based on new experience
   */
  private updateConfidenceModel(
    agentId: string,
    domain: KnowledgeDomain,
    action: string,
    outcome: string,
    reward: number,
    workspaceId?: string
  ): void {
    const wsScope = workspaceId || 'global';
    const key = `${agentId}-${domain}-${action}-${wsScope}`;
    let model = this.confidenceModels.get(key);

    if (!model) {
      model = {
        agentId,
        workspaceId,
        domain,
        action,
        baseConfidence: 0.5,
        adjustedConfidence: 0.5,
        experienceCount: 0,
        successRate: 0.5,
        lastUpdated: new Date(),
        factors: [
          { name: 'historical_success', weight: 0.4, currentValue: 0.5, impact: 0.2 },
          { name: 'recent_performance', weight: 0.3, currentValue: 0.5, impact: 0.15 },
          { name: 'complexity_handling', weight: 0.2, currentValue: 0.5, impact: 0.1 },
          { name: 'human_feedback', weight: 0.1, currentValue: 0.5, impact: 0.05 },
        ],
      };
    }

    model.experienceCount++;

    // Update success rate with exponential moving average
    const isSuccess = outcome === 'success' || outcome === 'partial';
    model.successRate = model.successRate * (1 - this.LEARNING_RATE) + 
                        (isSuccess ? 1 : 0) * this.LEARNING_RATE;

    // Update factors
    for (const factor of model.factors) {
      if (factor.name === 'historical_success') {
        factor.currentValue = model.successRate;
      } else if (factor.name === 'recent_performance') {
        // Get last 5 experiences (workspace-scoped)
        const recent = this.getSimilarExperiences(agentId, domain, action, workspaceId).slice(-5);
        factor.currentValue = recent.filter(e => e.outcome === 'success').length / Math.max(recent.length, 1);
      }
      factor.impact = factor.currentValue * factor.weight;
    }

    // Calculate adjusted confidence
    model.adjustedConfidence = model.factors.reduce((sum, f) => sum + f.impact, 0);
    model.adjustedConfidence = Math.max(0.1, Math.min(0.95, model.adjustedConfidence));
    model.lastUpdated = new Date();

    this.confidenceModels.set(key, model);

    // Persist to database (async, non-blocking)
    rlLoopRepository.upsertConfidenceModel({
      id: key,
      agentId: model.agentId,
      actionType: model.action,
      currentConfidence: model.adjustedConfidence,
      sampleCount: model.experienceCount,
      successRate: model.successRate,
      recentTrend: model.successRate > 0.6 ? 'improving' : model.successRate < 0.4 ? 'declining' : 'stable',
    }).catch(err => log.error('[RL Loop] DB confidence model persist error:', (err instanceof Error ? err.message : String(err))));
  }

  /**
   * Get confidence for a specific action
   */
  getConfidence(agentId: string, domain: KnowledgeDomain, action: string, workspaceId?: string): number {
    const wsScope = workspaceId || 'global';
    const key = `${agentId}-${domain}-${action}-${wsScope}`;
    const model = this.confidenceModels.get(key);
    return model?.adjustedConfidence || 0.5;
  }

  /**
   * Should the agent explore (try new approach) or exploit (use known approach)?
   */
  shouldExplore(agentId: string, domain: KnowledgeDomain, action: string, workspaceId?: string): boolean {
    const confidence = this.getConfidence(agentId, domain, action, workspaceId);
    
    // Higher exploration when confidence is low or moderate
    const explorationThreshold = confidence < 0.6 ? 0.3 : this.EXPLORATION_RATE;
    
    return Math.random() < explorationThreshold;
  }

  // ============================================================================
  // STRATEGY ADAPTATION
  // ============================================================================

  /**
   * Check if strategy adaptation is needed based on performance
   */
  private checkForAdaptation(agentId: string, domain: KnowledgeDomain, action: string, workspaceId?: string): void {
    const experiences = this.getSimilarExperiences(agentId, domain, action, workspaceId);
    
    if (experiences.length < this.MIN_EXPERIENCES_FOR_ADAPTATION) {
      return; // Not enough data
    }

    const recentExperiences = experiences.slice(-10);
    const recentSuccessRate = recentExperiences.filter(e => e.outcome === 'success').length / recentExperiences.length;
    const escalationRate = recentExperiences.filter(e => e.humanIntervention).length / recentExperiences.length;

    // Trigger adaptation if performance is poor
    if (recentSuccessRate < 0.5 || escalationRate > 0.3) {
      const cooldownKey = `${agentId}/${domain}/${action}`;
      const lastAdapt = this.lastAdaptationTime.get(cooldownKey) ?? 0;
      if (Date.now() - lastAdapt < this.ADAPTATION_COOLDOWN_MS) {
        return; // Cooldown: skip adaptation — already proposed within last 5 min
      }
      this.lastAdaptationTime.set(cooldownKey, Date.now());
      this.proposeAdaptation({
        agentId,
        domain,
        action,
        currentSuccessRate: recentSuccessRate,
        escalationRate,
      });
    }
  }

  /**
   * Propose a strategy adaptation
   */
  private async proposeAdaptation(params: {
    agentId: string;
    domain: KnowledgeDomain;
    action: string;
    currentSuccessRate: number;
    escalationRate: number;
  }): Promise<void> {
    const { agentId, domain, action, currentSuccessRate, escalationRate } = params;

    // Use AI to suggest new strategy
    const prompt = `An AI agent is underperforming. Suggest an improved strategy.

AGENT: ${agentId}
DOMAIN: ${domain}
ACTION: ${action}
CURRENT SUCCESS RATE: ${(currentSuccessRate * 100).toFixed(0)}%
HUMAN ESCALATION RATE: ${(escalationRate * 100).toFixed(0)}%

Recent failures may include:
- Incorrect output format
- Missing validation steps
- Overly aggressive automation
- Insufficient context gathering

Suggest a strategy improvement:
{
  "previousStrategy": "description of likely current approach",
  "newStrategy": "description of improved approach",
  "keyChanges": ["change1", "change2"],
  "expectedImprovement": 0.0-1.0,
  "implementationSteps": ["step1", "step2"]
}`;

    try {
      // Platform-level RL adaptation — Gemini acts as Trinity's brain for strategy reasoning
      // GPT handles grunt data aggregation upstream; Claude is the architect judge for escalations.
      // This call uses Gemini (brain) for mid-tier strategy proposals with no workspace billing.
      const geminiResult = await meteredGemini.generate({
        workspaceId: 'system',
        userId: 'system',
        featureKey: 'rl_strategy_adaptation',
        prompt,
        systemInstruction: `You are Trinity's reinforcement learning strategy advisor.
Your role in the Trinity Triad: Gemini = Brain (strategic reasoning).
GPT handles data aggregation; Claude is the architect/judge for critical escalations.
You must respond ONLY with valid JSON — no prose, no markdown fencing.`,
        model: 'gemini-2.5-flash-lite',
        maxOutputTokens: 600,
        temperature: 0.3,
      });

      const suggestion = this.extractJSON(geminiResult.text);

      const adaptation: StrategyAdaptation = {
        id: crypto.randomUUID(),
        agentId,
        domain,
        action,
        previousStrategy: suggestion.previousStrategy || 'Unknown',
        newStrategy: suggestion.newStrategy || 'Improved validation and context gathering',
        triggerReason: `Success rate ${(currentSuccessRate * 100).toFixed(0)}%, Escalation rate ${(escalationRate * 100).toFixed(0)}%`,
        expectedImprovement: suggestion.expectedImprovement || 0.2,
        appliedAt: new Date(),
        validated: false,
      };

      this.strategyAdaptations.push(adaptation);

      // Emit adaptation event
      platformEventBus.publish({
        type: 'strategy_adapted',
        category: 'feature',
        title: 'Strategy Adapted',
        description: `Agent ${agentId} adapted ${action} strategy`,
        metadata: {
          adaptationId: adaptation.id,
          agentId,
          domain,
          action,
          newStrategy: adaptation.newStrategy,
        },
      }).catch((err) => log.warn('[reinforcementLearningLoop] Fire-and-forget failed:', err));

      log.info(`[RL Loop] Strategy adaptation proposed for ${agentId}/${action}`);

    } catch (error) {
      log.warn('[RL Loop] Failed to generate adaptation:', error);
    }
  }

  private extractJSON(text: string): any {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return {};
      }
    }
    return {};
  }

  // ============================================================================
  // METRICS & REPORTING
  // ============================================================================

  /**
   * Get learning metrics for a domain or agent
   */
  getMetrics(params?: {
    agentId?: string;
    domain?: KnowledgeDomain;
    sinceDays?: number;
  }): LearningMetrics {
    let experiences = Array.from(this.experiences.values());
    
    if (params?.agentId) {
      experiences = experiences.filter(e => e.agentId === params.agentId);
    }
    if (params?.domain) {
      experiences = experiences.filter(e => e.domain === params.domain);
    }
    if (params?.sinceDays) {
      const since = new Date(Date.now() - params.sinceDays * 24 * 60 * 60 * 1000);
      experiences = experiences.filter(e => e.timestamp > since);
    }

    const totalExperiences = experiences.length;
    const successCount = experiences.filter(e => e.outcome === 'success').length;
    const escalationCount = experiences.filter(e => e.humanIntervention).length;
    const totalReward = experiences.reduce((sum, e) => sum + e.reward, 0);

    // Group by action
    const actionGroups = new Map<string, Experience[]>();
    for (const exp of experiences) {
      const key = exp.action;
      const group = actionGroups.get(key) || [];
      group.push(exp);
      actionGroups.set(key, group);
    }

    const topPerformingActions = Array.from(actionGroups.entries())
      .map(([action, exps]) => ({
        action,
        successRate: exps.filter(e => e.outcome === 'success').length / exps.length,
      }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 5);

    const problemAreas = Array.from(actionGroups.entries())
      .map(([action, exps]) => ({
        action,
        failureRate: exps.filter(e => e.outcome === 'failure' || e.outcome === 'escalated').length / exps.length,
        recommendation: exps.filter(e => e.humanIntervention).length > 2 
          ? 'Consider adding validation steps' 
          : 'Review recent failures',
      }))
      .filter(a => a.failureRate > 0.3)
      .sort((a, b) => b.failureRate - a.failureRate)
      .slice(0, 5);

    // Calculate improvement trend (comparing recent vs older)
    const midpoint = Math.floor(experiences.length / 2);
    const olderReward = experiences.slice(0, midpoint).reduce((s, e) => s + e.reward, 0) / Math.max(midpoint, 1);
    const recentReward = experiences.slice(midpoint).reduce((s, e) => s + e.reward, 0) / Math.max(experiences.length - midpoint, 1);
    const improvementTrend = recentReward - olderReward;

    return {
      totalExperiences,
      successRate: totalExperiences > 0 ? successCount / totalExperiences : 0,
      escalationRate: totalExperiences > 0 ? escalationCount / totalExperiences : 0,
      avgReward: totalExperiences > 0 ? totalReward / totalExperiences : 0,
      improvementTrend,
      topPerformingActions,
      problemAreas,
    };
  }

  /**
   * Get all adaptations for an agent
   */
  getAdaptations(agentId?: string): StrategyAdaptation[] {
    if (agentId) {
      return this.strategyAdaptations.filter(a => a.agentId === agentId);
    }
    return [...this.strategyAdaptations];
  }

  /**
   * Validate an adaptation was effective
   */
  validateAdaptation(adaptationId: string, wasEffective: boolean): void {
    const adaptation = this.strategyAdaptations.find(a => a.id === adaptationId);
    if (adaptation) {
      adaptation.validated = true;
      
      // Record this as learning
      sharedKnowledgeGraph.recordLearning({
        domain: adaptation.domain,
        agentId: adaptation.agentId,
        action: 'strategy_adaptation',
        context: { adaptationId, newStrategy: adaptation.newStrategy },
        outcome: wasEffective ? 'success' : 'failure',
        reward: wasEffective ? 0.8 : -0.3,
        insights: [wasEffective 
          ? `Adaptation successful: ${adaptation.newStrategy.substring(0, 50)}`
          : 'Adaptation did not improve performance'],
      });
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const reinforcementLearningLoop = ReinforcementLearningLoop.getInstance();

function deriveRLActionName(p: any): string {
  if (p.automationName) return p.automationName;
  if (p.metadata?.automationName) return p.metadata.automationName;
  const title = (p.title || '') as string;
  const colonIdx = title.indexOf(': ');
  if (colonIdx !== -1) return title.slice(colonIdx + 2).trim().toLowerCase().replace(/\s+/g, '_');
  return title.replace(/\s+completed\s*$/i, '').trim().toLowerCase().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_]/g, '') || 'unknown';
}

function deriveRLDomain(p: any): KnowledgeDomain {
  if (p.domain && p.domain !== 'undefined') return p.domain as KnowledgeDomain;
  if (p.metadata?.domain) return p.metadata.domain as KnowledgeDomain;
  return 'automation';
}

platformEventBus.on('automation_completed', (p: any) => {
  if (!p) return;
  reinforcementLearningLoop.recordExperience({
    agentId: p.automationType || 'automation',
    domain: deriveRLDomain(p),
    action: deriveRLActionName(p),
    outcome: 'success',
    executionTimeMs: p.durationMs || 0,
    contextWindow: { orchestrationId: p.orchestrationId, workspaceId: p.workspaceId },
  });
});

platformEventBus.on('automation_execution_failed', (p: any) => {
  if (!p) return;
  reinforcementLearningLoop.recordExperience({
    agentId: p.automationType || 'automation',
    domain: deriveRLDomain(p),
    action: deriveRLActionName(p),
    outcome: p.retryable ? 'partial' : 'failure',
    executionTimeMs: 0,
    contextWindow: { 
      orchestrationId: p.orchestrationId, 
      workspaceId: p.workspaceId,
      errorCode: p.errorCode,
      retryable: p.retryable,
    },
  });
});

log.info('[RL Loop] Reinforcement learning system initialized with automation event listeners');
