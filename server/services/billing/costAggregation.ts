import { db } from '../../db';
import { PLATFORM } from '../../config/platformConfig';
import {
  aiUsageEvents,
  workspaces,
  billingAuditLog,
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc } from 'drizzle-orm';

/**
 * Tier-based markup configuration
 * 
 * Revenue Model: Users pay ALL costs (AI tokens + partner APIs) + CoAIleague markup
 * 
 * Markup Tiers:
 * - Free: 50% markup (high margin to encourage upgrades)
 * - Starter: 30% markup (balanced for small businesses)
 * - Professional: 20% markup (competitive for mid-market)
 * - Enterprise: 10% markup (volume discount)
 */
const TIER_MARKUP_RATES: Record<string, number> = {
  free: 0.50, // 50% markup
  starter: 0.30, // 30% markup
  professional: 0.20, // 20% markup
  enterprise: 0.10, // 10% markup
  custom: 0.20, // Default 20% markup for custom tiers
};

export interface CostSummary {
  workspaceId: string;
  period: string; // e.g., '2025-01' for January 2025
  
  // AI Usage Costs
  aiTokenCost: number;
  aiApiCalls: number;
  
  // Partner API Costs
  partnerApiCost: number;
  partnerApiCalls: number;
  
  // By Partner Breakdown
  quickbooksCost: number;
  quickbooksApiCalls: number;
  gustoCost: number;
  gustoApiCalls: number;
  stripeCost: number;
  stripeApiCalls: number;
  
  // Total Costs
  totalBaseCost: number; // What we pay (AI + partner costs)
  markupRate: number; // Tier-based markup percentage
  markupAmount: number; // Dollar amount of markup
  totalBillableAmount: number; // Base cost + markup
  
  // Metadata
  workspaceTier: string; // 'free', 'starter', 'professional', 'enterprise'
  generatedAt: Date;
}

export class CostAggregationService {
  /**
   * Calculate monthly cost summary for a workspace
   * 
   * This aggregates all usage (AI + Partner APIs) for the billing period
   * and applies tier-based markup to generate invoice line items.
   */
  async calculateMonthlyCosts(
    workspaceId: string,
    year: number,
    month: number
  ): Promise<CostSummary> {
    // Date range for the billing period
    const startDate = new Date(year, month - 1, 1); // First day of month
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // Last day of month
    
    // Get workspace tier for markup calculation
    const [workspace] = await db.select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    
    const workspaceTier = workspace?.subscriptionTier || 'starter';
    const markupRate = TIER_MARKUP_RATES[workspaceTier] || 0.20;
    
    // Calculate AI usage costs
    const aiUsage = await db.select({
      totalCost: sql<number>`COALESCE(SUM(CAST(${aiUsageEvents.totalCost} AS DECIMAL)), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
    })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.workspaceId, workspaceId),
          gte(aiUsageEvents.createdAt, startDate),
          lte(aiUsageEvents.createdAt, endDate)
        )
      );
    
    const aiTokenCost = Number(aiUsage[0]?.totalCost || 0);
    const aiApiCalls = Number(aiUsage[0]?.totalCalls || 0);
    
    // Calculate partner API costs (all partners)
    const partnerUsage = await db.select({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      totalCost: sql<number>`COALESCE(SUM(CAST(${partnerApiUsageEvents.totalCost} AS DECIMAL)), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
    })
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(partnerApiUsageEvents.createdAt, startDate),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(partnerApiUsageEvents.createdAt, endDate)
        )
      );
    
    const partnerApiCost = Number(partnerUsage[0]?.totalCost || 0);
    const partnerApiCalls = Number(partnerUsage[0]?.totalCalls || 0);
    
    // Calculate costs by partner type
    const quickbooksUsage = await this.getPartnerTypeCosts(workspaceId, 'quickbooks', startDate, endDate);
    const gustoUsage = await this.getPartnerTypeCosts(workspaceId, 'gusto', startDate, endDate);
    const stripeUsage = await this.getPartnerTypeCosts(workspaceId, 'stripe', startDate, endDate);
    
    // Calculate totals
    const totalBaseCost = aiTokenCost + partnerApiCost;
    const markupAmount = totalBaseCost * markupRate;
    const totalBillableAmount = totalBaseCost + markupAmount;
    
    return {
      workspaceId,
      period: `${year}-${month.toString().padStart(2, '0')}`,
      
      // AI Usage
      aiTokenCost,
      aiApiCalls,
      
      // Partner API Usage (aggregated)
      partnerApiCost,
      partnerApiCalls,
      
      // By Partner Breakdown
      quickbooksCost: quickbooksUsage.cost,
      quickbooksApiCalls: quickbooksUsage.calls,
      gustoCost: gustoUsage.cost,
      gustoApiCalls: gustoUsage.calls,
      stripeCost: stripeUsage.cost,
      stripeApiCalls: stripeUsage.calls,
      
      // Totals with markup
      totalBaseCost,
      markupRate,
      markupAmount,
      totalBillableAmount,
      
      // Metadata
      workspaceTier,
      generatedAt: new Date(),
    };
  }
  
  /**
   * Get costs for a specific partner type
   */
  private async getPartnerTypeCosts(
    workspaceId: string,
    partnerType: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ cost: number; calls: number }> {
    const result = await db.select({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      totalCost: sql<number>`COALESCE(SUM(CAST(${partnerApiUsageEvents.totalCost} AS DECIMAL)), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
    })
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          sql`${partnerApiUsageEvents.partnerType} = ${partnerType}`,
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(partnerApiUsageEvents.createdAt, startDate),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(partnerApiUsageEvents.createdAt, endDate)
        )
      );
    
    return {
      cost: Number(result[0]?.totalCost || 0),
      calls: Number(result[0]?.totalCalls || 0),
    };
  }
  
  /**
   * Generate Stripe invoice line items for usage-based billing
   * 
   * IMPORTANT: This ONLY bills for PARTNER API costs (QuickBooks, Gusto, Stripe).
   * AI token usage is NOT included here - it's already covered by the credit system.
   * 
   * Credit System (Primary Billing):
   * - Users buy credits via subscription or credit packs
   * - AI automations deduct credits when they run
   * - No separate invoicing for AI usage
   * 
   * Partner API Costs (Separate Billing):
   * - QuickBooks/Gusto/Stripe API calls are billed separately
   * - Pass-through pricing with tier-based markup
   * - Invoiced monthly via this method
   */
  async generateInvoiceLineItems(
    workspaceId: string,
    year: number,
    month: number
  ): Promise<Array<{
    description: string;
    amount: number; // In cents
    quantity: number;
    metadata: any;
  }>> {
    const costSummary = await this.calculateMonthlyCosts(workspaceId, year, month);
    const lineItems: Array<{
      description: string;
      amount: number;
      quantity: number;
      metadata: any;
    }> = [];
    
    // ❌ AI Token Usage NOT included - already covered by credit system
    // AI costs are tracked for analytics only, not billed separately
    
    // QuickBooks API Usage Line Item
    if (costSummary.quickbooksCost > 0) {
      lineItems.push({
        description: `QuickBooks API Usage (${costSummary.period})`,
        amount: Math.round((costSummary.quickbooksCost + costSummary.quickbooksCost * costSummary.markupRate) * 100),
        quantity: costSummary.quickbooksApiCalls,
        metadata: {
          workspaceId,
          period: costSummary.period,
          category: 'partner_api_quickbooks',
          baseCost: costSummary.quickbooksCost,
          markupRate: costSummary.markupRate,
          tier: costSummary.workspaceTier,
        },
      });
    }
    
    // Gusto API Usage Line Item
    if (costSummary.gustoCost > 0) {
      lineItems.push({
        description: `Gusto API Usage (${costSummary.period})`,
        amount: Math.round((costSummary.gustoCost + costSummary.gustoCost * costSummary.markupRate) * 100),
        quantity: costSummary.gustoApiCalls,
        metadata: {
          workspaceId,
          period: costSummary.period,
          category: 'partner_api_gusto',
          baseCost: costSummary.gustoCost,
          markupRate: costSummary.markupRate,
          tier: costSummary.workspaceTier,
        },
      });
    }
    
    // Add summary line if multiple categories
    if (lineItems.length > 1) {
      lineItems.push({
        description: `${PLATFORM.name} Platform Markup (${costSummary.markupRate * 100}% - ${costSummary.workspaceTier.toUpperCase()} tier)`,
        amount: 0, // Markup is already included in individual line items
        quantity: 1,
        metadata: {
          workspaceId,
          period: costSummary.period,
          category: 'markup_summary',
          totalBaseCost: costSummary.totalBaseCost,
          totalMarkup: costSummary.markupAmount,
          tier: costSummary.workspaceTier,
        },
      });
    }
    
    return lineItems;
  }
  
  /**
   * Get markup rate for a workspace tier
   */
  getMarkupRate(tier: string): number {
    return TIER_MARKUP_RATES[tier.toLowerCase()] || 0.20;
  }
  
  /**
   * Calculate daily rollup for partner API usage (for analytics dashboard)
   * Similar to aiUsageDailyRollups but for partner APIs
   */
  async calculateDailyRollup(
    workspaceId: string,
    date: Date
  ): Promise<{
    date: string;
    totalCost: number;
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    avgResponseTime: number;
  }> {
    const startDate = new Date(date);
    startDate.setUTCHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setUTCHours(23, 59, 59, 999);
    
    const result = await db.select({
      // @ts-expect-error — TS migration: fix in refactoring sprint
      totalCost: sql<number>`COALESCE(SUM(CAST(${partnerApiUsageEvents.totalCost} AS DECIMAL)), 0)`,
      totalCalls: sql<number>`COUNT(*)`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      successfulCalls: sql<number>`COUNT(*) FILTER (WHERE ${partnerApiUsageEvents.success} = true)`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      failedCalls: sql<number>`COUNT(*) FILTER (WHERE ${partnerApiUsageEvents.success} = false)`,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      avgResponseTime: sql<number>`AVG(${partnerApiUsageEvents.responseTimeMs})`,
    })
      // @ts-expect-error — TS migration: fix in refactoring sprint
      .from(partnerApiUsageEvents)
      .where(
        and(
          // @ts-expect-error — TS migration: fix in refactoring sprint
          eq(partnerApiUsageEvents.workspaceId, workspaceId),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          gte(partnerApiUsageEvents.createdAt, startDate),
          // @ts-expect-error — TS migration: fix in refactoring sprint
          lte(partnerApiUsageEvents.createdAt, endDate)
        )
      );
    
    return {
      date: startDate.toISOString().split('T')[0],
      totalCost: Number(result[0]?.totalCost || 0),
      totalCalls: Number(result[0]?.totalCalls || 0),
      successfulCalls: Number(result[0]?.successfulCalls || 0),
      failedCalls: Number(result[0]?.failedCalls || 0),
      avgResponseTime: Number(result[0]?.avgResponseTime || 0),
    };
  }
}

// Singleton instance
export const costAggregationService = new CostAggregationService();
