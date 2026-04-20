/**
 * AI TOKEN GATEWAY — TOKEN USAGE TRACKING + SOFT/HARD CAP ENFORCEMENT
 * ======================================================================
 * All AI usage is metered via aiMeteringService and tracked in
 * workspace_ai_usage / ai_call_log / token_usage_log.
 *
 * ENFORCEMENT MODEL (every tenant, every AI call):
 * - Free/trial tiers:  hardCapK enforced — blocked when monthly limit exhausted.
 * - Paid tiers:        Soft cap only. Overage billed on monthly invoice.
 * - Founder-exempt:    Tracked, never alerted, never billed, never blocked.
 *
 * preAuthorize() enforces hard caps. finalizeBilling() writes token_usage_log.
 */

import { createLogger } from '../../lib/logger';
import {
  TOKEN_COSTS,
  TOKEN_FREE_FEATURES,
  tokenManager,
} from './tokenManager';
import { recordTokenUsageAsync } from './tokenUsageService';
import { aiMeteringService } from './aiMeteringService';

const log = createLogger('aiTokenGateway');

export type RequestTier = 'BUSINESS_LIGHT' | 'BUSINESS_STANDARD' | 'BUSINESS_HEAVY';

export interface RequestClassification {
  tier: RequestTier;
  featureKey: string;
  tokenCost: number;
  isFree: boolean;
  reason: string;
}

export interface PreAuthorizeResult {
  authorized: boolean;
  reason: string;
  tokenCost: number;
  isFree: boolean;
  featureKey: string;
  tier?: RequestTier;
  classification: RequestClassification;
}

export interface FinalizeBillingResult {
  charged: boolean;
  tokensUsed: number;
  newBalance: number;
}

export class AITokenGateway {
  private static instance: AITokenGateway;

  private constructor() {}

  static getInstance(): AITokenGateway {
    if (!AITokenGateway.instance) {
      AITokenGateway.instance = new AITokenGateway();
    }
    return AITokenGateway.instance;
  }

  classifyRequest(featureKey: string): RequestClassification {
    return {
      tier: 'BUSINESS_STANDARD',
      featureKey,
      tokenCost: 0,
      isFree: true,
      reason: 'TOKEN_PASSTHROUGH',
    };
  }

  async preAuthorize(
    workspaceId: string,
    userId: string | null | undefined,
    featureKey: string,
    _options?: Record<string, unknown>,
  ): Promise<PreAuthorizeResult> {
    log.info(`[AITokenGateway] preAuthorize: ${featureKey} ws=${workspaceId}`);
    const tokenCost = (TOKEN_COSTS as Record<string, number>)[featureKey] ?? 0;
    const isFree = TOKEN_FREE_FEATURES.has(featureKey) || tokenCost === 0;

    // TOKEN HARD CAP GATE — free/trial only (paid tiers return allowed:true always).
    // Universal enforcement point: all 5 AI providers call preAuthorize.
    if (workspaceId) {
      const tokenGuard = await aiMeteringService.checkUsageAllowedById(workspaceId);
      if (!tokenGuard.allowed) {
        const classification: RequestClassification = { tier: 'BUSINESS_HEAVY', featureKey, tokenCost, isFree: false, reason: 'TOKEN_HARD_CAP_REACHED' };
        return {
          authorized: false,
          reason: tokenGuard.warning ?? 'Monthly AI token limit reached. Upgrade to continue.',
          tokenCost: 0,
          isFree: false,
          featureKey,
          tier: 'BUSINESS_HEAVY',
          classification,
        };
      }
    }

    if (!isFree && workspaceId) {
      const check = await tokenManager.checkTokens(workspaceId, featureKey, userId || undefined);
      if (!check.hasAllowance) {
        // OMEGA-L2: Degraded-mode split — Brain tasks (tokenCost >= 15) are hard-blocked at 0 allowance.
        // Standard/lightweight tasks (tokenCost < 15) are allowed in degraded mode so the org
        // remains operational (basic scheduling, reads, exports) while AI-heavy features pause.
        const isBrainTask = tokenCost >= 15;
        if (isBrainTask) {
          log.warn(`[AITokenGateway] DEGRADED_MODE: Brain task '${featureKey}' blocked — workspace ${workspaceId} has exhausted AI allowance. Standard actions remain available.`);
          const classification: RequestClassification = { tier: 'BUSINESS_HEAVY', featureKey, tokenCost, isFree: false, reason: 'DEGRADED_MODE_BRAIN_BLOCKED' };
          return { authorized: false, reason: 'DEGRADED_MODE_BRAIN_BLOCKED', tokenCost, isFree: false, featureKey, tier: 'BUSINESS_HEAVY', classification };
        }
        log.info(`[AITokenGateway] DEGRADED_MODE: Standard task '${featureKey}' allowed under degraded mode for workspace ${workspaceId}.`);
        const classification: RequestClassification = { tier: 'BUSINESS_STANDARD', featureKey, tokenCost, isFree: false, reason: 'DEGRADED_MODE_STANDARD_ALLOWED' };
        return { authorized: true, reason: 'DEGRADED_MODE_STANDARD_ALLOWED', tokenCost, isFree: false, featureKey, tier: 'BUSINESS_STANDARD', classification };
      }
    }

    const classification: RequestClassification = {
      tier: tokenCost >= 15 ? 'BUSINESS_HEAVY' : tokenCost >= 5 ? 'BUSINESS_STANDARD' : 'BUSINESS_LIGHT',
      featureKey,
      tokenCost,
      isFree,
      reason: isFree ? 'EXEMPT' : 'SOFT_CAP_ALLOWED',
    };
    return {
      authorized: true,
      reason: classification.reason,
      tokenCost,
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
  ): Promise<FinalizeBillingResult> {
    // Never block or delay the AI execution path.
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

    const tokenCost = ((TOKEN_COSTS as Record<string, number>)[featureKey] ?? 0) * quantity;
    if (tokenCost <= 0 || TOKEN_FREE_FEATURES.has(featureKey) || !workspaceId) {
      return { charged: false, tokensUsed: 0, newBalance: -1 };
    }
    const result = await tokenManager.recordUsage({ workspaceId, featureKey, quantity, userId: userId || undefined });
    return {
      charged: result.success,
      tokensUsed: result.success ? tokenCost : 0,
      newBalance: result.newBalance,
    };
  }

  getBillingSummary(featureKey: string): {
    featureKey: string;
    totalCallsThisHour: number;
    totalTokensThisHour: number;
  } {
    return { featureKey, totalCallsThisHour: 0, totalTokensThisHour: 0 };
  }

  async gate(
    _workspaceId: string,
    _userId: string | null | undefined,
    _featureKey: string,
    fn: () => Promise<unknown>,
    _options?: Record<string, unknown>,
  ): Promise<unknown> {
    return fn();
  }
}

export const aiTokenGateway = AITokenGateway.getInstance();

export function isFeatureFree(_featureKey: string): boolean {
  return true;
}

export function getFeatureTokenCost(_featureKey: string): number {
  return 0;
}

export function listFreeFeatures(): string[] {
  return Array.from(TOKEN_FREE_FEATURES);
}

export function listPaidFeatures(): Array<{ feature: string; cost: number }> {
  return Object.entries(TOKEN_COSTS)
    .filter(([key, cost]) => cost > 0 && !TOKEN_FREE_FEATURES.has(key))
    .map(([feature, cost]) => ({ feature, cost }));
}
