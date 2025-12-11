/**
 * MODEL ROUTING ENGINE - Intelligent Gemini Model Selection
 * 
 * This engine routes AI requests to the optimal Gemini model tier based on:
 * - Task complexity and domain
 * - Required tools and memory payload
 * - Rate limits and fallback cascades
 * - Cost optimization and telemetry
 * 
 * Tiered Architecture:
 * - Tier 0 (BRAIN): Gemini 3 Pro - Master orchestration, complex reasoning
 * - Tier 1 (PRO): Gemini 2.5 Pro - Compliance, fallback for rate limits
 * - Tier 2 (FLASH): Gemini 2.5 Flash - Conversational agents, supervisors
 * - Tier 3 (LITE): Gemini 1.5 Flash 8B - Quick lookups, simple tasks
 */

import { GEMINI_MODELS, GeminiModelTier, AntiYapPreset, ANTI_YAP_PRESETS } from './providers/geminiClient';

// Model tier hierarchy for fallback cascading
export const MODEL_TIER_HIERARCHY = {
  BRAIN: 0,
  ORCHESTRATOR: 0,
  ARCHITECT: 0,
  DIAGNOSTICS: 0,
  PRO_FALLBACK: 1,
  COMPLIANCE: 1,
  CONVERSATIONAL: 2,
  SUPERVISOR: 2,
  HELLOS: 2,
  ONBOARDING: 2,
  SIMPLE: 3,
  NOTIFICATION: 3,
  LOOKUP: 3,
} as const;

export type ModelTierLevel = 0 | 1 | 2 | 3;

// Routing context for intelligent model selection
export interface RoutingContext {
  domain: string;
  action: string;
  complexity?: 'low' | 'medium' | 'high' | 'critical';
  toolsRequired?: string[];
  memoryTokens?: number;
  urgency?: 'immediate' | 'normal' | 'background';
  workspaceId?: string;
  userId?: string;
  subagentId?: string;
}

// Routing decision with telemetry
export interface RoutingDecision {
  selectedTier: GeminiModelTier;
  selectedModel: string;
  antiYapPreset: AntiYapPreset;
  tierLevel: ModelTierLevel;
  reason: string;
  fallbackChain: GeminiModelTier[];
  estimatedCost: 'low' | 'medium' | 'high';
  contextBudget: number;
}

// Model health and rate limit tracking
interface ModelHealth {
  tier: GeminiModelTier;
  isHealthy: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
}

// Subagent model tier configuration
export interface SubagentModelConfig {
  subagentId: string;
  preferredTier: GeminiModelTier;
  maxTier: GeminiModelTier;
  fallbackPolicy: 'cascade' | 'fail' | 'degrade';
  contextBudget: number;
}

// Domain complexity scoring rules
// CRITICAL: Payroll, Invoicing, Scheduling are REVENUE-CRITICAL operations
// They use BRAIN tier (Gemini 3 Pro) for maximum accuracy and reliability
const DOMAIN_COMPLEXITY: Record<string, 'low' | 'medium' | 'high' | 'critical'> = {
  // Critical - requires Gemini 3 Pro (BRAIN tier)
  // These are REVENUE-GENERATING operations - highest priority
  'payroll': 'critical',           // Financial accuracy is paramount
  'invoicing': 'critical',         // Client billing must be precise
  'scheduling': 'critical',        // Core workforce optimization
  'orchestration': 'critical',
  'diagnostics': 'critical',
  'code-analysis': 'critical',
  'multi-agent': 'critical',
  'crisis-management': 'critical',
  'deep-think': 'critical',
  'vibe-coding': 'critical',
  'generate-ui': 'critical',
  'financial-analysis': 'critical', // Upgraded from high
  
  // High - prefers Pro but can use Flash
  'compliance': 'high',
  'strategic-planning': 'high',
  'data-migration': 'high',
  'fact-check': 'high',
  'context-memory': 'high',
  'expense': 'high',               // Expense categorization
  'analytics': 'high',             // Business intelligence
  
  // Medium - Flash models work well
  'conversation': 'medium',
  'reporting': 'medium',
  'onboarding': 'medium',
  'support': 'medium',
  
  // Low - Lite models sufficient
  'notification': 'low',
  'lookup': 'low',
  'status-check': 'low',
  'simple-classification': 'low',
};

// Action to preset mapping
const ACTION_PRESETS: Record<string, AntiYapPreset> = {
  'generate-thought': 'mascot',
  'chat-response': 'helpai',
  'supervise': 'supervisor',
  'orchestrate': 'orchestrator',
  'diagnose': 'diagnostics',
  'notify': 'notification',
  'lookup': 'lookup',
  'classify': 'simple',
  // Gemini 3 tool presets
  'deep-think': 'orchestrator',
  'generate-ui': 'orchestrator',
  'context-memory': 'helpai',
  'vibe-coding': 'orchestrator',
  'fact-check': 'diagnostics',
};

class ModelRoutingEngine {
  private modelHealth: Map<GeminiModelTier, ModelHealth> = new Map();
  private routingHistory: Array<{ timestamp: Date; decision: RoutingDecision; context: RoutingContext }> = [];
  private readonly MAX_HISTORY = 1000;

  constructor() {
    this.initializeHealthTracking();
  }

  private initializeHealthTracking(): void {
    const tiers: GeminiModelTier[] = [
      'BRAIN', 'ORCHESTRATOR', 'ARCHITECT', 'DIAGNOSTICS',
      'PRO_FALLBACK', 'COMPLIANCE',
      'CONVERSATIONAL', 'SUPERVISOR', 'HELLOS', 'ONBOARDING',
      'SIMPLE', 'NOTIFICATION', 'LOOKUP'
    ];

    for (const tier of tiers) {
      this.modelHealth.set(tier, {
        tier,
        isHealthy: true,
        requestCount: 0,
        errorCount: 0,
        avgLatencyMs: 0,
      });
    }
  }

  /**
   * Route a request to the optimal model tier
   */
  route(context: RoutingContext): RoutingDecision {
    const complexity = context.complexity || this.inferComplexity(context);
    const selectedTier = this.selectTierForComplexity(complexity, context);
    const tierLevel = MODEL_TIER_HIERARCHY[selectedTier];
    const fallbackChain = this.buildFallbackChain(selectedTier);
    const antiYapPreset = this.selectAntiYapPreset(context);
    const contextBudget = this.calculateContextBudget(tierLevel);

    const decision: RoutingDecision = {
      selectedTier,
      selectedModel: GEMINI_MODELS[selectedTier],
      antiYapPreset,
      tierLevel,
      reason: this.buildRoutingReason(context, complexity, selectedTier),
      fallbackChain,
      estimatedCost: tierLevel <= 1 ? 'high' : tierLevel === 2 ? 'medium' : 'low',
      contextBudget,
    };

    this.recordRoutingDecision(context, decision);
    return decision;
  }

  /**
   * Route specifically for a subagent with its configuration
   */
  routeForSubagent(context: RoutingContext, config: SubagentModelConfig): RoutingDecision {
    const baseDecision = this.route(context);
    
    // Check if preferred tier is healthy
    const preferredHealth = this.modelHealth.get(config.preferredTier);
    if (preferredHealth?.isHealthy) {
      return {
        ...baseDecision,
        selectedTier: config.preferredTier,
        selectedModel: GEMINI_MODELS[config.preferredTier],
        tierLevel: MODEL_TIER_HIERARCHY[config.preferredTier],
        contextBudget: config.contextBudget,
        reason: `Subagent ${config.subagentId} using preferred tier ${config.preferredTier}`,
      };
    }

    // Apply fallback policy
    if (config.fallbackPolicy === 'fail') {
      throw new Error(`Model tier ${config.preferredTier} unavailable and fallback disabled`);
    }

    // Cascade to next available tier
    return baseDecision;
  }

  /**
   * Infer complexity from context when not explicitly provided
   */
  private inferComplexity(context: RoutingContext): 'low' | 'medium' | 'high' | 'critical' {
    // Check domain complexity
    const domainComplexity = DOMAIN_COMPLEXITY[context.domain] || 'medium';
    
    // Adjust based on tools required
    const toolCount = context.toolsRequired?.length || 0;
    if (toolCount > 5) return 'critical';
    if (toolCount > 2) return domainComplexity === 'low' ? 'medium' : domainComplexity;
    
    // Adjust based on memory tokens
    if ((context.memoryTokens || 0) > 50000) return 'critical';
    if ((context.memoryTokens || 0) > 20000) return 'high';
    
    return domainComplexity;
  }

  /**
   * Select the appropriate tier based on complexity
   */
  private selectTierForComplexity(
    complexity: 'low' | 'medium' | 'high' | 'critical',
    context: RoutingContext
  ): GeminiModelTier {
    // Map complexity to default tier
    const complexityTierMap: Record<string, GeminiModelTier> = {
      'critical': 'BRAIN',
      'high': 'COMPLIANCE',
      'medium': 'CONVERSATIONAL',
      'low': 'SIMPLE',
    };

    let tier = complexityTierMap[complexity];

    // Check health and cascade if needed
    const health = this.modelHealth.get(tier);
    if (!health?.isHealthy) {
      tier = this.findHealthyFallback(tier);
    }

    return tier;
  }

  /**
   * Find a healthy fallback tier
   */
  private findHealthyFallback(originalTier: GeminiModelTier): GeminiModelTier {
    const fallbackChain = this.buildFallbackChain(originalTier);
    
    for (const fallbackTier of fallbackChain) {
      const health = this.modelHealth.get(fallbackTier);
      if (health?.isHealthy) {
        return fallbackTier;
      }
    }

    // Default to CONVERSATIONAL as most reliable
    return 'CONVERSATIONAL';
  }

  /**
   * Build fallback chain for a given tier
   */
  private buildFallbackChain(tier: GeminiModelTier): GeminiModelTier[] {
    const level = MODEL_TIER_HIERARCHY[tier];
    const chain: GeminiModelTier[] = [];

    // Add fallbacks in order: same level alternatives, then faster tiers
    if (level === 0) {
      chain.push('PRO_FALLBACK', 'CONVERSATIONAL', 'SIMPLE');
    } else if (level === 1) {
      chain.push('CONVERSATIONAL', 'SIMPLE');
    } else if (level === 2) {
      chain.push('SIMPLE');
    }

    return chain;
  }

  /**
   * Select anti-yapping preset based on action
   */
  private selectAntiYapPreset(context: RoutingContext): AntiYapPreset {
    return ACTION_PRESETS[context.action] || 'helpai';
  }

  /**
   * Calculate context budget based on tier level
   */
  private calculateContextBudget(tierLevel: ModelTierLevel): number {
    // Gemini 3 Pro: 1M tokens, Flash: 100K, Lite: 32K
    const budgets: Record<ModelTierLevel, number> = {
      0: 500000,  // Brain tier: 500K tokens for complex reasoning
      1: 200000,  // Pro tier: 200K tokens
      2: 50000,   // Flash tier: 50K tokens
      3: 16000,   // Lite tier: 16K tokens
    };
    return budgets[tierLevel];
  }

  /**
   * Build human-readable routing reason
   */
  private buildRoutingReason(
    context: RoutingContext,
    complexity: string,
    tier: GeminiModelTier
  ): string {
    const parts = [
      `Domain: ${context.domain}`,
      `Complexity: ${complexity}`,
      `Action: ${context.action}`,
    ];

    if (context.toolsRequired?.length) {
      parts.push(`Tools: ${context.toolsRequired.length}`);
    }

    if (context.memoryTokens) {
      parts.push(`Memory: ${Math.round(context.memoryTokens / 1000)}K tokens`);
    }

    return `Selected ${tier} - ${parts.join(', ')}`;
  }

  /**
   * Record routing decision for telemetry
   */
  private recordRoutingDecision(context: RoutingContext, decision: RoutingDecision): void {
    this.routingHistory.push({
      timestamp: new Date(),
      decision,
      context,
    });

    // Prune old history
    if (this.routingHistory.length > this.MAX_HISTORY) {
      this.routingHistory = this.routingHistory.slice(-this.MAX_HISTORY);
    }

    // Update model health request count
    const health = this.modelHealth.get(decision.selectedTier);
    if (health) {
      health.requestCount++;
    }
  }

  /**
   * Record model execution result for adaptive routing
   */
  recordExecutionResult(
    tier: GeminiModelTier,
    success: boolean,
    latencyMs: number,
    error?: string
  ): void {
    const health = this.modelHealth.get(tier);
    if (!health) return;

    if (!success) {
      health.errorCount++;
      health.lastError = error;
      health.lastErrorTime = new Date();

      // Mark unhealthy if error rate exceeds threshold
      const errorRate = health.errorCount / Math.max(health.requestCount, 1);
      if (errorRate > 0.3 && health.requestCount > 10) {
        health.isHealthy = false;
        console.warn(`🔴 [ModelRouter] Tier ${tier} marked unhealthy: ${(errorRate * 100).toFixed(1)}% error rate`);
      }
    } else {
      // Update average latency
      health.avgLatencyMs = (health.avgLatencyMs * 0.9) + (latencyMs * 0.1);
      
      // Recovery check: if recent requests are successful, restore health
      if (!health.isHealthy && health.lastErrorTime) {
        const timeSinceError = Date.now() - health.lastErrorTime.getTime();
        if (timeSinceError > 60000) { // 1 minute recovery window
          health.isHealthy = true;
          console.log(`🟢 [ModelRouter] Tier ${tier} recovered`);
        }
      }
    }
  }

  /**
   * Get health status for all tiers
   */
  getHealthStatus(): Record<GeminiModelTier, ModelHealth> {
    const status: Partial<Record<GeminiModelTier, ModelHealth>> = {};
    for (const [tier, health] of this.modelHealth) {
      status[tier] = { ...health };
    }
    return status as Record<GeminiModelTier, ModelHealth>;
  }

  /**
   * Get routing analytics
   */
  getRoutingAnalytics(): {
    totalRoutes: number;
    routesByTier: Record<GeminiModelTier, number>;
    avgDecisionLatency: number;
    fallbackRate: number;
  } {
    const routesByTier: Partial<Record<GeminiModelTier, number>> = {};
    let fallbackCount = 0;

    for (const entry of this.routingHistory) {
      const tier = entry.decision.selectedTier;
      routesByTier[tier] = (routesByTier[tier] || 0) + 1;

      if (entry.decision.fallbackChain.length > 0) {
        fallbackCount++;
      }
    }

    return {
      totalRoutes: this.routingHistory.length,
      routesByTier: routesByTier as Record<GeminiModelTier, number>,
      avgDecisionLatency: 0, // Would need timing instrumentation
      fallbackRate: this.routingHistory.length > 0 
        ? fallbackCount / this.routingHistory.length 
        : 0,
    };
  }

  /**
   * Get subagent configurations with model tier assignments
   */
  getSubagentConfigs(): SubagentModelConfig[] {
    return [
      // Tier 0: Brain-level subagents
      { subagentId: 'diagnostics', preferredTier: 'DIAGNOSTICS', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 500000 },
      { subagentId: 'orchestrator', preferredTier: 'ORCHESTRATOR', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 500000 },
      { subagentId: 'code-editor', preferredTier: 'ARCHITECT', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 500000 },
      { subagentId: 'crisis-manager', preferredTier: 'BRAIN', maxTier: 'BRAIN', fallbackPolicy: 'fail', contextBudget: 500000 },
      { subagentId: 'swarm-commander', preferredTier: 'BRAIN', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 500000 },
      
      // Tier 1: Pro-level subagents
      { subagentId: 'compliance', preferredTier: 'COMPLIANCE', maxTier: 'PRO_FALLBACK', fallbackPolicy: 'cascade', contextBudget: 200000 },
      { subagentId: 'financial', preferredTier: 'PRO_FALLBACK', maxTier: 'PRO_FALLBACK', fallbackPolicy: 'cascade', contextBudget: 200000 },
      { subagentId: 'data-migration', preferredTier: 'PRO_FALLBACK', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 200000 },
      
      // Revenue-Critical: Use BRAIN tier for maximum accuracy (Gemini 3 Pro)
      { subagentId: 'scheduling', preferredTier: 'ORCHESTRATOR', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 200000 },
      { subagentId: 'payroll', preferredTier: 'ORCHESTRATOR', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 200000 },
      { subagentId: 'invoice', preferredTier: 'ORCHESTRATOR', maxTier: 'BRAIN', fallbackPolicy: 'cascade', contextBudget: 200000 },
      
      // Tier 2: Flash-level subagents
      { subagentId: 'hr-assistant', preferredTier: 'SUPERVISOR', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 50000 },
      { subagentId: 'analytics', preferredTier: 'SUPERVISOR', maxTier: 'PRO_FALLBACK', fallbackPolicy: 'cascade', contextBudget: 100000 },
      { subagentId: 'onboarding', preferredTier: 'ONBOARDING', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 50000 },
      { subagentId: 'gamification', preferredTier: 'ONBOARDING', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 50000 },
      { subagentId: 'helpai', preferredTier: 'HELLOS', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 50000 },
      { subagentId: 'trinity', preferredTier: 'CONVERSATIONAL', maxTier: 'SUPERVISOR', fallbackPolicy: 'cascade', contextBudget: 50000 },
      { subagentId: 'sentiment', preferredTier: 'CONVERSATIONAL', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 30000 },
      { subagentId: 'document', preferredTier: 'SUPERVISOR', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 50000 },
      { subagentId: 'calendar', preferredTier: 'SUPERVISOR', maxTier: 'CONVERSATIONAL', fallbackPolicy: 'cascade', contextBudget: 30000 },
      
      // Tier 3: Lite-level subagents
      { subagentId: 'notification', preferredTier: 'NOTIFICATION', maxTier: 'SIMPLE', fallbackPolicy: 'cascade', contextBudget: 16000 },
      { subagentId: 'status-checker', preferredTier: 'SIMPLE', maxTier: 'SIMPLE', fallbackPolicy: 'cascade', contextBudget: 16000 },
      { subagentId: 'faq-lookup', preferredTier: 'LOOKUP', maxTier: 'SIMPLE', fallbackPolicy: 'cascade', contextBudget: 16000 },
    ];
  }
}

// Singleton instance
export const modelRoutingEngine = new ModelRoutingEngine();

// Export convenience functions
export function routeRequest(context: RoutingContext): RoutingDecision {
  return modelRoutingEngine.route(context);
}

export function routeForSubagent(context: RoutingContext, config: SubagentModelConfig): RoutingDecision {
  return modelRoutingEngine.routeForSubagent(context, config);
}

export function recordModelResult(
  tier: GeminiModelTier,
  success: boolean,
  latencyMs: number,
  error?: string
): void {
  modelRoutingEngine.recordExecutionResult(tier, success, latencyMs, error);
}

export function getModelHealthStatus() {
  return modelRoutingEngine.getHealthStatus();
}

export function getRoutingAnalytics() {
  return modelRoutingEngine.getRoutingAnalytics();
}

export function getSubagentModelConfigs() {
  return modelRoutingEngine.getSubagentConfigs();
}
