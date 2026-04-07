import { db } from '../../db';
import { usageCaps } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { creditManager, CREDIT_COSTS } from './creditManager';

const BILLING_CYCLE = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

type CapField = 'aiScheduledShiftsUsed' | 'analyticsReportsUsed' | 'contractReviewsUsed' | 'botInteractionsToday';
type CapLimitField = 'aiScheduledShiftsCap' | 'analyticsReportsCap' | 'contractReviewsCap' | 'botInteractionsDailyCap';

// Maps gateway feature keys → usage cap tracking fields.
// creditCost uses the canonical CREDIT_COSTS rate for the associated feature key.
// IMPORTANT: these must reference canonical keys from CREDIT_COSTS so rates stay in sync.
const FEATURE_TO_CAP: Record<string, { used: CapField; cap: CapLimitField; creditKey: keyof typeof CREDIT_COSTS }> = {
  'ai_scheduling':      { used: 'aiScheduledShiftsUsed',  cap: 'aiScheduledShiftsCap',    creditKey: 'ai_scheduling' },
  'ai_schedule_shift':  { used: 'aiScheduledShiftsUsed',  cap: 'aiScheduledShiftsCap',    creditKey: 'ai_scheduling' },
  'analytics_report':   { used: 'analyticsReportsUsed',   cap: 'analyticsReportsCap',     creditKey: 'ai_analytics_report' },
  'ai_analytics_report':{ used: 'analyticsReportsUsed',   cap: 'analyticsReportsCap',     creditKey: 'ai_analytics_report' },
  'contract_review':    { used: 'contractReviewsUsed',    cap: 'contractReviewsCap',      creditKey: 'ai_general' },
  'bot_interaction':    { used: 'botInteractionsToday',   cap: 'botInteractionsDailyCap', creditKey: 'ai_chat_query' },
};

export class UsageCapService {

  async checkAndConsumeFeature(params: {
    workspaceId: string;
    featureKey: string;
    userId?: string;
  }): Promise<{ allowed: boolean; withinCap: boolean; creditsCharged: number; error?: string }> {
    const mapping = FEATURE_TO_CAP[params.featureKey];
    if (!mapping) {
      // Feature not tracked by the cap system — allow it through
      return { allowed: true, withinCap: true, creditsCharged: 0 };
    }

    const billingCycle = BILLING_CYCLE();
    let [cap] = await db
      .select()
      .from(usageCaps)
      .where(
        and(
          eq(usageCaps.workspaceId, params.workspaceId),
          eq(usageCaps.billingCycle, billingCycle)
        )
      );

    if (!cap) {
      await db.insert(usageCaps).values({
        workspaceId: params.workspaceId,
        billingCycle,
      }).onConflictDoNothing();

      [cap] = await db
        .select()
        .from(usageCaps)
        .where(
          and(
            eq(usageCaps.workspaceId, params.workspaceId),
            eq(usageCaps.billingCycle, billingCycle)
          )
        );
    }

    if (!cap) {
      return { allowed: false, withinCap: false, creditsCharged: 0, error: 'Failed to initialize usage caps' };
    }

    const currentUsed = cap[mapping.used];
    const capLimit = cap[mapping.cap];

    if (capLimit === 0) {
      return { allowed: false, withinCap: false, creditsCharged: 0, error: `Feature ${params.featureKey} not available on your plan` };
    }

    if (capLimit === -1 || currentUsed < capLimit) {
      // Within the included cap — no extra credit charge
      await db
        .update(usageCaps)
        .set({
          [mapping.used]: currentUsed + 1,
          updatedAt: new Date(),
        })
        .where(eq(usageCaps.id, cap.id));

      return { allowed: true, withinCap: true, creditsCharged: 0 };
    }

    // Over cap — charge credits from the canonical workspace credit pool
    const creditCost = CREDIT_COSTS[mapping.creditKey] || 5;
    const deductResult = await creditManager.deductCredits({
      workspaceId: params.workspaceId,
      userId: params.userId || 'system-usage-cap',
      featureKey: mapping.creditKey,
      featureName: `Over-cap: ${params.featureKey}`,
      description: `Over-cap usage: ${params.featureKey} (${currentUsed + 1} used, plan cap: ${capLimit}) — ${creditCost}cr charged`,
    });

    if (!deductResult.success) {
      return {
        allowed: false,
        withinCap: false,
        creditsCharged: 0,
        error: deductResult.errorMessage || `Insufficient credits for over-cap usage of ${params.featureKey}`,
      };
    }

    await db
      .update(usageCaps)
      .set({
        [mapping.used]: currentUsed + 1,
        updatedAt: new Date(),
      })
      .where(eq(usageCaps.id, cap.id));

    return { allowed: true, withinCap: false, creditsCharged: creditCost };
  }

  async resetDailyBotCaps(): Promise<number> {
    const billingCycle = BILLING_CYCLE();
    await db
      .update(usageCaps)
      .set({
        botInteractionsToday: 0,
        botInteractionsLastReset: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(usageCaps.billingCycle, billingCycle));

    return 0;
  }

  async initializeCaps(workspaceId: string, caps: {
    aiScheduledShiftsCap?: number;
    analyticsReportsCap?: number;
    contractReviewsCap?: number;
    botInteractionsDailyCap?: number;
  }): Promise<void> {
    const billingCycle = BILLING_CYCLE();

    const [existing] = await db
      .select({ id: usageCaps.id })
      .from(usageCaps)
      .where(
        and(
          eq(usageCaps.workspaceId, workspaceId),
          eq(usageCaps.billingCycle, billingCycle)
        )
      );

    if (existing) {
      await db
        .update(usageCaps)
        .set({
          ...caps,
          updatedAt: new Date(),
        })
        .where(eq(usageCaps.id, existing.id));
    } else {
      await db.insert(usageCaps).values({
        workspaceId,
        billingCycle,
        ...caps,
      });
    }
  }
}

export const usageCapService = new UsageCapService();
