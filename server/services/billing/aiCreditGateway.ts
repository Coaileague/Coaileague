/**
 * AI CREDIT GATEWAY
 * =================
 * Fortune 500-grade centralized billing enforcement for all AI operations.
 * 
 * This gateway intercepts ALL AI requests and enforces billing based on:
 * - Request type (chit-chat vs business operation)
 * - User role (subscriber-pays-all model)
 * - Workspace credit balance
 * 
 * BILLING PHILOSOPHY:
 * - Chit-chat is FREE: Trinity conversations, mascot interactions, casual help
 * - Business ops are PAID: Scheduling, payroll, invoicing, analytics
 * - Subscriber-pays-all: Workspace owner is billed, not individual users
 */

import { creditManager, CREDIT_COSTS, CREDIT_EXEMPT_FEATURES, isUnlimitedCreditUser } from './creditManager';
import { usageMeteringService } from './usageMetering';
import { platformEventBus } from '../platformEventBus';

// ============================================================================
// REQUEST CLASSIFICATION
// ============================================================================

/**
 * Request classification tiers
 * CHIT_CHAT: Casual conversations, greetings, help - FREE
 * BUSINESS_LIGHT: Simple queries about data - LOW COST
 * BUSINESS_STANDARD: Standard business operations - STANDARD COST
 * BUSINESS_HEAVY: Complex AI operations - HIGH COST
 */
export type RequestTier = 'CHIT_CHAT' | 'BUSINESS_LIGHT' | 'BUSINESS_STANDARD' | 'BUSINESS_HEAVY';

export interface RequestClassification {
  tier: RequestTier;
  featureKey: string;
  creditCost: number;
  isFree: boolean;
  reason: string;
}

/**
 * Patterns that indicate chit-chat (FREE tier)
 */
const CHIT_CHAT_PATTERNS = [
  /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
  /^(thanks|thank you|thx|ty)/i,
  /^(how are you|what's up|whats up)/i,
  /^(help|what can you do|tell me about yourself)/i,
  /^(bye|goodbye|see you|later)/i,
  /\?$/,  // Simple questions often are chit-chat
];

/**
 * Keywords that indicate business operations (PAID tier)
 */
const BUSINESS_KEYWORDS = [
  'schedule', 'shift', 'roster', 'calendar',
  'payroll', 'salary', 'wage', 'pay',
  'invoice', 'bill', 'charge', 'payment',
  'report', 'analytics', 'metrics', 'dashboard',
  'employee', 'staff', 'team', 'worker',
  'compliance', 'certification', 'license',
  'timesheet', 'clock', 'hours', 'overtime',
];

// ============================================================================
// GATEWAY CLASS
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

  /**
   * Classify a request to determine billing tier
   */
  classifyRequest(
    featureKey: string,
    userMessage?: string
  ): RequestClassification {
    // First check if feature is explicitly exempt (FREE)
    if (CREDIT_EXEMPT_FEATURES.has(featureKey)) {
      return {
        tier: 'CHIT_CHAT',
        featureKey,
        creditCost: 0,
        isFree: true,
        reason: `Feature "${featureKey}" is credit-exempt (Trinity conversations are FREE)`,
      };
    }

    // Check if feature has zero cost defined
    const definedCost = CREDIT_COSTS[featureKey as keyof typeof CREDIT_COSTS];
    if (definedCost === 0) {
      return {
        tier: 'CHIT_CHAT',
        featureKey,
        creditCost: 0,
        isFree: true,
        reason: `Feature "${featureKey}" has zero credit cost`,
      };
    }

    // If user message provided, analyze content
    if (userMessage) {
      const isChitChat = this.isChitChatMessage(userMessage);
      if (isChitChat) {
        return {
          tier: 'CHIT_CHAT',
          featureKey,
          creditCost: 0,
          isFree: true,
          reason: 'Message detected as casual chit-chat conversation',
        };
      }
    }

    // Determine tier based on feature key
    const tier = this.getFeatureTier(featureKey);
    const cost = definedCost ?? CREDIT_COSTS.ai_general;

    return {
      tier,
      featureKey,
      creditCost: cost,
      isFree: false,
      reason: `Business operation: ${featureKey}`,
    };
  }

  /**
   * Check if a message is casual chit-chat
   */
  private isChitChatMessage(message: string): boolean {
    const normalized = message.toLowerCase().trim();
    
    // Check against chit-chat patterns
    for (const pattern of CHIT_CHAT_PATTERNS) {
      if (pattern.test(normalized)) {
        // But verify no business keywords present
        const hasBusinessKeyword = BUSINESS_KEYWORDS.some(kw => 
          normalized.includes(kw.toLowerCase())
        );
        if (!hasBusinessKeyword) {
          return true;
        }
      }
    }

    // Very short messages without business keywords are likely chit-chat
    if (normalized.length < 20) {
      const hasBusinessKeyword = BUSINESS_KEYWORDS.some(kw => 
        normalized.includes(kw.toLowerCase())
      );
      if (!hasBusinessKeyword) {
        return true;
      }
    }

    return false;
  }

  /**
   * Determine feature tier based on feature key
   */
  private getFeatureTier(featureKey: string): RequestTier {
    // Heavy operations
    if (featureKey.includes('scheduling') || featureKey.includes('payroll')) {
      return 'BUSINESS_HEAVY';
    }

    // Standard operations
    if (featureKey.includes('invoice') || featureKey.includes('analytics')) {
      return 'BUSINESS_STANDARD';
    }

    // Light operations
    if (featureKey.includes('chat') || featureKey.includes('query')) {
      return 'BUSINESS_LIGHT';
    }

    return 'BUSINESS_STANDARD';
  }

  /**
   * Pre-authorize an AI request
   * Returns true if request can proceed, false if blocked
   */
  async preAuthorize(
    workspaceId: string,
    userId: string,
    featureKey: string,
    userMessage?: string
  ): Promise<{
    authorized: boolean;
    classification: RequestClassification;
    reason: string;
  }> {
    const classification = this.classifyRequest(featureKey, userMessage);

    // FREE tier always authorized
    if (classification.isFree) {
      console.log(`[AICreditGateway] FREE request authorized: ${featureKey}`);
      return {
        authorized: true,
        classification,
        reason: classification.reason,
      };
    }

    // Check if user has unlimited credits
    const hasUnlimited = await isUnlimitedCreditUser(userId, workspaceId);
    if (hasUnlimited) {
      console.log(`[AICreditGateway] Unlimited credits user: ${userId}`);
      return {
        authorized: true,
        classification,
        reason: 'User has unlimited credits (support/admin/owner)',
      };
    }

    // Check workspace credit balance with proper type casting
    const creditCheck = await creditManager.checkCredits(
      workspaceId,
      featureKey as keyof typeof CREDIT_COSTS,
      userId
    );

    if (!creditCheck.hasEnoughCredits) {
      console.log(`[AICreditGateway] Insufficient credits for ${featureKey}`);
      
      // Emit low credit event
      platformEventBus.emit({
        type: 'billing',
        category: 'credit_alert',
        title: 'Insufficient Credits',
        message: `Workspace lacks ${creditCheck.shortfall} credits for ${featureKey}`,
        workspaceId,
        userId,
        metadata: {
          featureKey,
          required: creditCheck.required,
          currentBalance: creditCheck.currentBalance,
          shortfall: creditCheck.shortfall,
        },
      });

      return {
        authorized: false,
        classification,
        reason: `Insufficient credits: need ${creditCheck.required}, have ${creditCheck.currentBalance}`,
      };
    }

    return {
      authorized: true,
      classification,
      reason: 'Sufficient credits available',
    };
  }

  /**
   * Finalize billing after AI request completes
   * Records usage and deducts credits
   */
  async finalizeBilling(
    workspaceId: string,
    userId: string,
    featureKey: string,
    tokensUsed: number,
    metadata?: Record<string, any>
  ): Promise<{
    charged: boolean;
    creditsDeducted: number;
    newBalance: number;
  }> {
    const classification = this.classifyRequest(featureKey);

    // FREE tier - record usage but don't charge
    if (classification.isFree) {
      console.log(`[AICreditGateway] FREE usage recorded (no charge): ${featureKey}, ${tokensUsed} tokens`);
      
      // Still record for analytics
      await usageMeteringService.recordUsage({
        workspaceId,
        userId,
        featureKey,
        usageType: 'token',
        usageAmount: tokensUsed,
        usageUnit: 'tokens',
        metadata: {
          ...metadata,
          tier: 'FREE',
          charged: false,
        },
      });

      return {
        charged: false,
        creditsDeducted: 0,
        newBalance: -1, // Sentinel for free tier
      };
    }

    // PAID tier - deduct credits using correct object signature
    const deduction = await creditManager.deductCredits({
      workspaceId,
      userId,
      featureKey: featureKey as keyof typeof CREDIT_COSTS,
      featureName: `AI operation: ${featureKey}`,
      description: `AI operation: ${featureKey}`,
      relatedEntityType: metadata?.entityType,
      relatedEntityId: metadata?.entityId,
    });

    // Record usage
    await usageMeteringService.recordUsage({
      workspaceId,
      userId,
      featureKey,
      usageType: 'token',
      usageAmount: tokensUsed,
      usageUnit: 'tokens',
      metadata: {
        ...metadata,
        tier: classification.tier,
        charged: deduction.success,
        creditsDeducted: classification.creditCost,
      },
    });

    console.log(`[AICreditGateway] PAID usage: ${featureKey}, ${classification.creditCost} credits, ${tokensUsed} tokens`);

    return {
      charged: deduction.success,
      creditsDeducted: classification.creditCost,
      newBalance: deduction.newBalance,
    };
  }

  /**
   * Get billing summary for a feature
   */
  getBillingSummary(featureKey: string): {
    isFree: boolean;
    tier: RequestTier;
    creditCost: number;
    description: string;
  } {
    const classification = this.classifyRequest(featureKey);
    
    const descriptions: Record<RequestTier, string> = {
      CHIT_CHAT: 'Free casual conversation - no credits charged',
      BUSINESS_LIGHT: 'Light business query - low credit cost',
      BUSINESS_STANDARD: 'Standard business operation - standard credit cost',
      BUSINESS_HEAVY: 'Complex AI operation - higher credit cost',
    };

    return {
      isFree: classification.isFree,
      tier: classification.tier,
      creditCost: classification.creditCost,
      description: descriptions[classification.tier],
    };
  }
}

// Export singleton
export const aiCreditGateway = AICreditGateway.getInstance();

// ============================================================================
// HELPER EXPORTS
// ============================================================================

/**
 * Quick check if a feature is free
 */
export function isFeatureFree(featureKey: string): boolean {
  return aiCreditGateway.classifyRequest(featureKey).isFree;
}

/**
 * Get credit cost for a feature
 */
export function getFeatureCreditCost(featureKey: string): number {
  return aiCreditGateway.classifyRequest(featureKey).creditCost;
}

/**
 * List all free features
 */
export function listFreeFeatures(): string[] {
  return Array.from(CREDIT_EXEMPT_FEATURES);
}

/**
 * List all paid features with costs
 */
export function listPaidFeatures(): Array<{ feature: string; cost: number }> {
  return Object.entries(CREDIT_COSTS)
    .filter(([key, cost]) => cost > 0 && !CREDIT_EXEMPT_FEATURES.has(key))
    .map(([feature, cost]) => ({ feature, cost }));
}
