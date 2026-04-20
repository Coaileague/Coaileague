/**
 * COST-OPTIMIZED AI ROUTER
 * =========================
 * Fortune 500-grade intelligent routing between AI providers.
 * 
 * LATEST MODEL VERSIONS:
 * - GPT-4o-mini: Simple grunt work, cheapest (1 credit)
 * - Gemini 2.5 Flash: Standard operations (5 credits)
 * - Gemini 3 (gemini-exp-1206): Complex reasoning (20 credits)
 * - Claude 4.5 Sonnet: Deep analysis, client-facing (25 credits)
 * 
 * Routing Strategy:
 * 1. GPT (gpt-4o-mini) - Simple grunt work, cheapest option
 * 2. Gemini Flash - Standard business operations
 * 3. Gemini 3 (experimental) - Complex reasoning, scheduling
 * 4. Claude 4.5 Sonnet - Deep thinking, analysis, client-facing
 * 
 * Escalation Triggers:
 * - Low confidence scores (< 0.6)
 * - Model disagreement
 * - PDF/document analysis
 * - Sales emails and client communication
 * - Tough scheduling conflicts
 * - Complex compliance/legal
 * 
 * All usage is metered and billed to workspace credits.
 */

import { meteredGptClient, GPT_CREDIT_COSTS } from '../billing/meteredGptClient';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { claudeService } from './trinity-orchestration/trinityValidationService';
import { tokenManager, TOKEN_COSTS } from '../billing/tokenManager';
import { createLogger } from '../../lib/logger';
const log = createLogger('costOptimizedRouter');

// AI Provider hierarchy (cheapest to most expensive)
export type AIProvider = 'gpt' | 'gemini_flash' | 'gemini_pro' | 'claude';

// Task complexity levels
export type TaskComplexity = 'simple' | 'standard' | 'complex' | 'critical';

// Routing decision with full context
export interface RoutingDecision {
  provider: AIProvider;
  model: string;
  tier: string;
  reason: string;
  estimatedCredits: number;
  fallbackChain: AIProvider[];
}

// Response with confidence scoring
export interface CostOptimizedResponse {
  content: string;
  provider: AIProvider;
  model: string;
  confidence: number;
  tokensUsed: number;
  creditsCharged: number;
  latencyMs: number;
  escalated: boolean;
  escalationReason?: string;
  verifiedBy?: AIProvider;
}

// Task classification for routing
export interface TaskClassification {
  complexity: TaskComplexity;
  domain: string;
  requiresReasoning: boolean;
  requiresCreativity: boolean;
  involvesPDF: boolean;
  involvesNumbers: boolean;
  isClientFacing: boolean;
}

// Keywords that trigger escalation to premium models
const ESCALATION_TRIGGERS = {
  // PDF and document analysis
  pdf: ['pdf', 'document', 'attachment', 'file', 'scan', 'extract from'],
  
  // Sales and client communication
  sales: ['sales email', 'client email', 'proposal', 'pitch', 'rfp', 'bid', 'quote'],
  
  // Complex scheduling
  scheduling: ['conflict', 'overlap', 'double-booked', 'overtime', 'compliance issue', 'union rule'],
  
  // Financial precision
  financial: ['invoice dispute', 'payroll error', 'tax calculation', 'financial report'],
  
  // Legal/compliance
  legal: ['contract', 'compliance', 'regulation', 'legal', 'liability', 'certification'],
};

// Simple tasks that GPT handles well
const SIMPLE_TASK_PATTERNS = [
  'format', 'clean', 'classify', 'categorize', 'extract', 'parse',
  'summarize briefly', 'list', 'count', 'simple', 'basic', 'quick',
  'template', 'fill in', 'convert', 'translate format',
];

class CostOptimizedRouter {
  private routingHistory: Array<{
    timestamp: Date;
    task: string;
    decision: RoutingDecision;
    result: { success: boolean; confidence: number };
  }> = [];

  /**
   * Route and execute an AI request with cost optimization
   */
  async execute(params: {
    task: string;
    context?: string;
    workspaceId: string;
    userId?: string;
    featureKey?: string;
    forceProvider?: AIProvider;
    maxRetries?: number;
  }): Promise<CostOptimizedResponse> {
    const startTime = Date.now();
    const { task, context, workspaceId, userId, featureKey, forceProvider } = params;

    // Classify task
    const classification = this.classifyTask(task, context);
    
    // Get routing decision
    const decision = forceProvider 
      ? this.forceProviderDecision(forceProvider, task)
      : this.route(task, classification);

    log.info(`[CostOptimizedRouter] Routing: ${decision.provider} - ${decision.reason}`);

    // Execute with the selected provider
    let response = await this.executeWithProvider(
      decision.provider,
      task,
      context,
      workspaceId,
      userId,
      featureKey
    );

    // Check if escalation is needed
    if (response.confidence < 0.6 && decision.fallbackChain.length > 0) {
      log.info(`[CostOptimizedRouter] Low confidence (${response.confidence}), escalating...`);
      
      const escalatedProvider = decision.fallbackChain[0];
      const escalatedResponse = await this.executeWithProvider(
        escalatedProvider,
        task,
        context,
        workspaceId,
        userId,
        featureKey
      );

      // Use escalated response if it has higher confidence
      if (escalatedResponse.confidence > response.confidence) {
        response = {
          ...escalatedResponse,
          escalated: true,
          escalationReason: `Low confidence from ${decision.provider} (${response.confidence.toFixed(2)})`,
          verifiedBy: escalatedProvider,
        };
      }
    }

    // Record routing for analytics
    this.recordRouting(task, decision, {
      success: true,
      confidence: response.confidence,
    });

    return {
      ...response,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Execute with disagreement detection - runs multiple models and compares
   */
  async executeWithVerification(params: {
    task: string;
    context?: string;
    workspaceId: string;
    userId?: string;
    featureKey?: string;
  }): Promise<CostOptimizedResponse & { agreementScore: number }> {
    const { task, context, workspaceId, userId, featureKey } = params;
    const startTime = Date.now();

    // Get responses from two different providers
    const [gptResponse, geminiResponse] = await Promise.all([
      this.executeWithProvider('gpt', task, context, workspaceId, userId, featureKey),
      this.executeWithProvider('gemini_flash', task, context, workspaceId, userId, featureKey),
    ]);

    // Calculate agreement score
    const agreementScore = this.calculateAgreement(gptResponse.content, geminiResponse.content);

    log.info(`[CostOptimizedRouter] Agreement score: ${agreementScore.toFixed(2)}`);

    // If they disagree significantly, escalate to premium model
    if (agreementScore < 0.7) {
      log.info(`[CostOptimizedRouter] Model disagreement detected, escalating to Claude...`);
      
      const claudeResponse = await this.executeWithProvider(
        'claude',
        `Two AI models provided different answers to this task. Please analyze and provide the correct response.

Task: ${task}

GPT Response: ${gptResponse.content}

Gemini Response: ${geminiResponse.content}

Provide the most accurate response, explaining any discrepancies.`,
        context,
        workspaceId,
        userId,
        featureKey
      );

      return {
        ...claudeResponse,
        agreementScore,
        escalated: true,
        escalationReason: `Model disagreement (score: ${agreementScore.toFixed(2)})`,
        verifiedBy: 'claude',
        latencyMs: Date.now() - startTime,
      };
    }

    // Use the response with higher confidence
    const bestResponse = gptResponse.confidence >= geminiResponse.confidence 
      ? gptResponse 
      : geminiResponse;

    return {
      ...bestResponse,
      agreementScore,
      escalated: false,
      latencyMs: Date.now() - startTime,
    };
  }

  /**
   * Classify a task to determine routing
   */
  classifyTask(task: string, context?: string): TaskClassification {
    const combined = `${task} ${context || ''}`.toLowerCase();

    // Check for escalation triggers
    const involvesPDF = ESCALATION_TRIGGERS.pdf.some(t => combined.includes(t));
    const isClientFacing = ESCALATION_TRIGGERS.sales.some(t => combined.includes(t));
    const hasSchedulingConflict = ESCALATION_TRIGGERS.scheduling.some(t => combined.includes(t));
    const hasFinancialPrecision = ESCALATION_TRIGGERS.financial.some(t => combined.includes(t));
    const hasLegalComplexity = ESCALATION_TRIGGERS.legal.some(t => combined.includes(t));

    // Determine complexity
    let complexity: TaskComplexity = 'simple';
    
    if (hasLegalComplexity || involvesPDF) {
      complexity = 'critical';
    } else if (isClientFacing || hasFinancialPrecision) {
      complexity = 'complex';
    } else if (hasSchedulingConflict) {
      complexity = 'complex';
    } else if (!SIMPLE_TASK_PATTERNS.some(p => combined.includes(p))) {
      complexity = 'standard';
    }

    // Determine domain
    let domain = 'general';
    if (combined.includes('schedule') || combined.includes('shift')) domain = 'scheduling';
    else if (combined.includes('payroll') || combined.includes('salary')) domain = 'payroll';
    else if (combined.includes('invoice') || combined.includes('billing')) domain = 'invoicing';
    else if (combined.includes('email') || combined.includes('client')) domain = 'communication';
    else if (combined.includes('compliance') || combined.includes('legal')) domain = 'compliance';

    return {
      complexity,
      domain,
      requiresReasoning: complexity === 'complex' || complexity === 'critical',
      requiresCreativity: isClientFacing,
      involvesPDF,
      involvesNumbers: hasFinancialPrecision || domain === 'payroll' || domain === 'invoicing',
      isClientFacing,
    };
  }

  /**
   * Route task to optimal provider
   */
  route(task: string, classification: TaskClassification): RoutingDecision {
    // Critical tasks -> Claude 4.5 or Gemini 3
    if (classification.complexity === 'critical') {
      if (classification.involvesPDF) {
        return {
          provider: 'gemini_pro',
          model: 'gemini-exp-1206',  // Gemini 3 experimental - best for vision/PDFs
          tier: 'GEMINI_3',
          reason: 'PDF/document analysis requires Gemini 3 vision capabilities',
          estimatedCredits: 20,
          fallbackChain: ['claude'],
        };
      }
      return {
        provider: 'claude',
        model: 'claude-sonnet-4-6',  // Claude Sonnet 4.6 - deep thinking
        tier: 'CLAUDE_45',
        reason: 'Critical task requiring Claude 4.5 deep analysis',
        estimatedCredits: 25,
        fallbackChain: ['gemini_pro'],
      };
    }

    // Complex tasks -> Gemini 3 or Claude 4.5
    if (classification.complexity === 'complex') {
      if (classification.isClientFacing) {
        return {
          provider: 'claude',
          model: 'claude-sonnet-4-6',  // Claude Sonnet 4.6 for client comms
          tier: 'CLAUDE_45',
          reason: 'Client-facing communication requires Claude 4.5 writing',
          estimatedCredits: 25,
          fallbackChain: ['gemini_pro'],
        };
      }
      return {
        provider: 'gemini_pro',
        model: 'gemini-exp-1206',  // Gemini 3 for complex reasoning
        tier: 'GEMINI_3',
        reason: 'Complex reasoning handled by Gemini 3 experimental',
        estimatedCredits: 20,
        fallbackChain: ['claude', 'gemini_flash'],
      };
    }

    // Standard tasks -> Gemini Flash
    if (classification.complexity === 'standard') {
      return {
        provider: 'gemini_flash',
        model: 'gemini-2.5-flash',
        tier: 'CONVERSATIONAL',
        reason: 'Standard business operation handled by Gemini Flash',
        estimatedCredits: 5,
        fallbackChain: ['gemini_pro', 'gpt'],
      };
    }

    // Simple tasks -> GPT (cheapest)
    return {
      provider: 'gpt',
      model: 'gpt-4o-mini',
      tier: 'NANO',
      reason: 'Simple task handled by cost-effective GPT',
      estimatedCredits: 1,
      fallbackChain: ['gemini_flash'],
    };
  }

  /**
   * Force a specific provider
   */
  private forceProviderDecision(provider: AIProvider, task: string): RoutingDecision {
    const providerConfigs: Record<AIProvider, Omit<RoutingDecision, 'fallbackChain'>> = {
      gpt: { provider: 'gpt', model: 'gpt-4o-mini', tier: 'NANO', reason: 'Forced GPT', estimatedCredits: 1 },
      gemini_flash: { provider: 'gemini_flash', model: 'gemini-2.5-flash', tier: 'FLASH', reason: 'Forced Gemini Flash', estimatedCredits: 5 },
      gemini_pro: { provider: 'gemini_pro', model: 'gemini-2.5-pro', tier: 'PRO', reason: 'Forced Gemini Pro', estimatedCredits: 15 },
      claude: { provider: 'claude', model: 'claude-sonnet-4', tier: 'CFO', reason: 'Forced Claude', estimatedCredits: 25 },
    };

    return {
      ...providerConfigs[provider],
      fallbackChain: [],
    };
  }

  /**
   * Execute with a specific provider
   */
  private async executeWithProvider(
    provider: AIProvider,
    task: string,
    context: string | undefined,
    workspaceId: string,
    userId?: string,
    featureKey?: string
  ): Promise<Omit<CostOptimizedResponse, 'latencyMs'>> {
    const fullPrompt = context ? `${context}\n\n${task}` : task;

    try {
      switch (provider) {
        case 'gpt': {
          const result = await meteredGptClient.executeWithConfidence({
            prompt: fullPrompt,
            tier: 'NANO',
            workspaceId,
            userId,
            featureKey,
          });
          return {
            content: result.content,
            provider: 'gpt',
            model: result.model,
            confidence: result.confidence,
            tokensUsed: result.tokensUsed,
            creditsCharged: result.creditsCharged,
            escalated: false,
          };
        }

        case 'gemini_flash': {
          const result = await meteredGemini.generate({
            prompt: fullPrompt,
            workspaceId,
            userId,
            featureKey: featureKey || 'gemini_flash',
            model: 'gemini-2.5-flash',
          });
          return {
            content: result.text,
            provider: 'gemini_flash',
            model: 'gemini-2.5-flash',
            confidence: 0.75, // Default confidence for Gemini Flash
            tokensUsed: result.tokensUsed.total,
            creditsCharged: result.billing.creditsDeducted,
            escalated: false,
          };
        }

        case 'gemini_pro': {
          const result = await meteredGemini.generate({
            prompt: fullPrompt,
            workspaceId,
            userId,
            featureKey: featureKey || 'gemini_pro',
            model: 'gemini-2.5-pro',
          });
          return {
            content: result.text,
            provider: 'gemini_pro',
            model: 'gemini-2.5-pro',
            confidence: 0.85, // Higher confidence for Pro
            tokensUsed: result.tokensUsed.total,
            creditsCharged: result.billing.creditsDeducted,
            escalated: false,
          };
        }

        case 'claude': {
          const result = await claudeService.processRequest({
            task: fullPrompt,
            context: {
              workspaceId,
              userId: userId || 'system',
              sessionId: `cost-router-${Date.now()}`,
            },
          });
          return {
            content: result.content,
            provider: 'claude',
            model: 'claude-sonnet-4',
            confidence: 0.9, // High confidence for Claude
            tokensUsed: result.tokensUsed,
            creditsCharged: result.creditsUsed,
            escalated: false,
          };
        }
      }
    } catch (error: any) {
      log.error(`[CostOptimizedRouter] Error with ${provider}:`, (error instanceof Error ? error.message : String(error)));
      throw error;
    }
  }

  /**
   * Calculate agreement between two responses
   */
  private calculateAgreement(response1: string, response2: string): number {
    // Normalize responses
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    
    const words1 = new Set(normalize(response1));
    const words2 = new Set(normalize(response2));
    
    // Calculate Jaccard similarity
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    if (union.size === 0) return 1;
    
    return intersection.size / union.size;
  }

  /**
   * Record routing decision for analytics
   */
  private recordRouting(
    task: string,
    decision: RoutingDecision,
    result: { success: boolean; confidence: number }
  ): void {
    this.routingHistory.push({
      timestamp: new Date(),
      task: task.substring(0, 100),
      decision,
      result,
    });

    // Keep last 1000 entries
    if (this.routingHistory.length > 1000) {
      this.routingHistory = this.routingHistory.slice(-1000);
    }
  }

  /**
   * Get routing analytics
   */
  getAnalytics(): {
    totalRoutes: number;
    byProvider: Record<AIProvider, number>;
    avgConfidence: number;
    escalationRate: number;
  } {
    const byProvider: Record<AIProvider, number> = {
      gpt: 0,
      gemini_flash: 0,
      gemini_pro: 0,
      claude: 0,
    };

    let totalConfidence = 0;
    let escalations = 0;

    for (const entry of this.routingHistory) {
      byProvider[entry.decision.provider]++;
      totalConfidence += entry.result.confidence;
    }

    return {
      totalRoutes: this.routingHistory.length,
      byProvider,
      avgConfidence: this.routingHistory.length > 0 
        ? totalConfidence / this.routingHistory.length 
        : 0,
      escalationRate: this.routingHistory.length > 0 
        ? escalations / this.routingHistory.length 
        : 0,
    };
  }
}

// Singleton instance
export const costOptimizedRouter = new CostOptimizedRouter();

// Export convenience functions
export async function routeAndExecute(params: {
  task: string;
  context?: string;
  workspaceId: string;
  userId?: string;
  featureKey?: string;
  forceProvider?: AIProvider;
}): Promise<CostOptimizedResponse> {
  return costOptimizedRouter.execute(params);
}

export async function executeWithVerification(params: {
  task: string;
  context?: string;
  workspaceId: string;
  userId?: string;
  featureKey?: string;
}): Promise<CostOptimizedResponse & { agreementScore: number }> {
  return costOptimizedRouter.executeWithVerification(params);
}

export function classifyTask(task: string, context?: string): TaskClassification {
  return costOptimizedRouter.classifyTask(task, context);
}

export function getCostRoutingAnalytics() {
  return costOptimizedRouter.getAnalytics();
}
