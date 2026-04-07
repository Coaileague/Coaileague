/**
 * AI CREDIT GATEWAY — TOKEN USAGE TRACKING + SOFT/HARD CAP ENFORCEMENT
 * ======================================================================
 * Credits removed (CREDITS=0). All AI usage now metered via aiMeteringService
 * and tracked in workspace_ai_usage / ai_call_log / token_usage_log.
 *
 * ENFORCEMENT MODEL (every tenant, every AI call):
 * - Free/trial tiers:  hardCapK enforced — blocked when monthly limit exhausted.
 *                      Prevents abuse. No overage billing (null rate).
 * - Paid tiers:        Soft cap only. NEVER blocked. Overage billed on monthly invoice.
 *                      "We profit always."
 * - Founder-exempt:    Tracked, NEVER alerted, NEVER billed, NEVER blocked.
 *
 * OMEGA LAW 14 — TOKEN USAGE INTEGRITY:
 * preAuthorize() enforces hard caps. finalizeBilling() writes token_usage_log.
 * Both are fire-and-check — never delay execution for paid workspaces.
 */

import { createLogger } from '../../lib/logger';
import { CREDIT_COSTS, CREDIT_EXEMPT_FEATURES, creditManager } from './creditManager';
import { recordTokenUsageAsync } from './tokenUsageService';
import { aiMeteringService } from './aiMeteringService';

const log = createLogger('aiCreditGateway');

// ============================================================================
// EXPORTED TYPES (preserved for compatibility)
// ============================================================================

export type RequestTier = 'BUSINESS_LIGHT' | 'BUSINESS_STANDARD' | 'BUSINESS_HEAVY';

export interface RequestClassification {
  tier: RequestTier;
  featureKey: string;
  creditCost: number;
  isFree: boolean;
  reason: string;
}

// ============================================================================
// NO-OP GATEWAY CLASS
// ============================================================================

export class AICreditGateway {
  private static instance: AICreditGateway;

  private constructor() {}

  static getInstance(): AICreditGateway {
    if (!AICreditGateway.instance) {
      AICreditGateway.instance = new AICreditGateway();
    }
    return AICreditGateway.instance;
  }

  classifyRequest(featureKey: string): RequestClassification {
    return {
      tier: 'BUSINESS_STANDARD',
      featureKey,
      creditCost: 0,
      isFree: true,
      reason: 'CREDITS_ZERO_PASSTHROUGH',
    };
  }

  async preAuthorize(
    workspaceId: string,
    userId: string | null | undefined,
    featureKey: string,
    _options?: Record<string, unknown>,
  ): Promise<{
    authorized: boolean;
    reason: string;
    creditCost: number;
    isFree: boolean;
    featureKey: string;
    tier?: RequestTier;
    classification: { tier: RequestTier; featureKey: string; creditCost: number; isFree: boolean; reason: string };
  }> {
    log.info(`[AICreditGateway] preAuthorize: ${featureKey} ws=${workspaceId}`);
    const creditCost = (CREDIT_COSTS as Record<string, number>)[featureKey] ?? 0;
    const isFree = CREDIT_EXEMPT_FEATURES.has(featureKey) || creditCost === 0;

    // TOKEN HARD CAP GATE — free/trial only (paid tiers return allowed:true always).
    // This is the universal enforcement point: all 5 AI providers call preAuthorize.
    if (workspaceId) {
      const tokenGuard = await aiMeteringService.checkUsageAllowedById(workspaceId);
      if (!tokenGuard.allowed) {
        const classification: RequestClassification = { tier: 'BUSINESS_HEAVY', featureKey, creditCost, isFree: false, reason: 'TOKEN_HARD_CAP_REACHED' };
        return {
          authorized: false,
          reason: tokenGuard.warning ?? 'Monthly AI token limit reached. Upgrade to continue.',
          creditCost: 0,
          isFree: false,
          featureKey,
          tier: 'BUSINESS_HEAVY',
          classification,
        };
      }
    }

    if (!isFree && workspaceId) {
      const check = await creditManager.checkCredits(workspaceId, featureKey, userId || undefined);
      if (!check.hasEnoughCredits) {
        // OMEGA-L2: Degraded-mode split — Brain tasks (creditCost >= 15) are hard-blocked at 0 credits.
        // Standard/lightweight tasks (creditCost < 15) are allowed in degraded mode so the org
        // remains operational (basic scheduling, reads, exports) while AI-heavy features pause.
        const isBrainTask = creditCost >= 15;
        if (isBrainTask) {
          log.warn(`[AICreditGateway] DEGRADED_MODE: Brain task '${featureKey}' blocked — workspace ${workspaceId} has exhausted AI credits. Standard actions remain available.`);
          const classification: RequestClassification = { tier: 'BUSINESS_HEAVY', featureKey, creditCost, isFree: false, reason: 'DEGRADED_MODE_BRAIN_BLOCKED' };
          return { authorized: false, reason: 'DEGRADED_MODE_BRAIN_BLOCKED', creditCost, isFree: false, featureKey, tier: 'BUSINESS_HEAVY', classification };
        }
        // Standard-tier feature: allow with degraded-mode marker (metering continues)
        log.info(`[AICreditGateway] DEGRADED_MODE: Standard task '${featureKey}' allowed under degraded mode for workspace ${workspaceId}.`);
        const classification: RequestClassification = { tier: 'BUSINESS_STANDARD', featureKey, creditCost, isFree: false, reason: 'DEGRADED_MODE_STANDARD_ALLOWED' };
        return { authorized: true, reason: 'DEGRADED_MODE_STANDARD_ALLOWED', creditCost, isFree: false, featureKey, tier: 'BUSINESS_STANDARD', classification };
      }
    }

    const classification: RequestClassification = {
      tier: creditCost >= 15 ? 'BUSINESS_HEAVY' : creditCost >= 5 ? 'BUSINESS_STANDARD' : 'BUSINESS_LIGHT',
      featureKey,
      creditCost,
      isFree,
      reason: isFree ? 'EXEMPT' : 'SOFT_CAP_ALLOWED',
    };
    return {
      authorized: true,
      reason: classification.reason,
      creditCost,
      isFree,
      featureKey,
      tier: classification.tier,
      classification,
    };
  }

  async finalizeBilling(
    workspaceId: string,
    userId: string | null | undefined,
    featureKey: string,
    tokensUsed?: number,
    metadata?: Record<string, unknown>,
    quantity: number = 1,
  ): Promise<{ charged: boolean; creditsDeducted: number; newBalance: number }> {
    // OMEGA LAW 14 — TOKEN USAGE INTEGRITY (CLASS A BLOCKER #17)
    // Fire-and-forget: NEVER block or delay the AI execution path.
    if (workspaceId) {
      const tokensInput = typeof metadata?.inputTokens === 'number' ? metadata.inputTokens :
                          typeof tokensUsed === 'number' ? Math.ceil(tokensUsed / 2) : 0;
      const tokensOutput = typeof metadata?.outputTokens === 'number' ? metadata.outputTokens :
                           typeof tokensUsed === 'number' ? Math.ceil(tokensUsed / 2) : 0;
      const modelUsed = (typeof metadata?.model === 'string' ? metadata.model : null) ||
                        (featureKey?.toLowerCase().includes('gemini') ? 'gemini' :
                         featureKey?.toLowerCase().includes('claude') ? 'claude' : 'openai');

      recordTokenUsageAsync({
        workspaceId,
        userId: userId ?? null,
        modelUsed,
        tokensInput,
        tokensOutput,
        actionType: 'ai_action',
        featureName: featureKey ?? null,
      });
    }

    const creditCost = ((CREDIT_COSTS as Record<string, number>)[featureKey] ?? 0) * quantity;
    if (creditCost <= 0 || CREDIT_EXEMPT_FEATURES.has(featureKey) || !workspaceId) {
      return { charged: false, creditsDeducted: 0, newBalance: -1 };
    }
    const result = await creditManager.deductCredits({ workspaceId, featureKey, quantity, userId: userId || undefined });
    return { charged: result.success, creditsDeducted: result.success ? creditCost : 0, newBalance: result.newBalance };
  }

  getBillingSummary(_featureKey: string): {
    featureKey: string;
    totalCallsThisHour: number;
    totalCreditsThisHour: number;
  } {
    return { featureKey: _featureKey, totalCallsThisHour: 0, totalCreditsThisHour: 0 };
  }

  async gate(
    workspaceId: string,
    userId: string | null | undefined,
    featureKey: string,
    fn: () => Promise<unknown>,
    _options?: Record<string, unknown>,
  ): Promise<unknown> {
    return fn();
  }
}

export const aiCreditGateway = AICreditGateway.getInstance();

// ============================================================================
// UTILITY FUNCTIONS (preserved for compatibility)
// ============================================================================

export function isFeatureFree(_featureKey: string): boolean {
  return true;
}

export function getFeatureCreditCost(_featureKey: string): number {
  return 0;
}

export function listFreeFeatures(): string[] {
  return Array.from(CREDIT_EXEMPT_FEATURES);
}

export function listPaidFeatures(): Array<{ feature: string; cost: number }> {
  return Object.entries(CREDIT_COSTS)
    .filter(([key, cost]) => cost > 0 && !CREDIT_EXEMPT_FEATURES.has(key))
    .map(([feature, cost]) => ({ feature, cost }));
}
