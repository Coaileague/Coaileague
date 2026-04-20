/**
 * OrgBillingService — Per-organization billing independence
 * Provides complete billing health summary, usage breakdown by category,
 * overage calculation, and independent period management for each org.
 */
import { db } from '../../db';
import {
  workspaces,
  subscriptionInvoices,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';
import { TIER_TOKEN_ALLOCATIONS } from './tokenManager';
import { createLogger } from '../../lib/logger';
import { tokenManager } from './tokenManager';

const log = createLogger('OrgBillingService');

const OVERAGE_RATE_PER_CREDIT = 0.01; // $0.01 per credit over allocation
const HARD_CAP_TIERS = new Set(['free', 'trial', 'starter']);
const SOFT_CAP_TIERS = new Set(['professional', 'enterprise', 'unlimited']);

export interface OrgBillingSummary {
  workspaceId: string;
  workspaceName: string;
  subscriptionTier: string;
  currentBalance: number;
  monthlyAllocation: number;
  creditsUsedThisPeriod: number;
  creditsRemainingThisPeriod: number;
  overageCredits: number;
  overageAmount: number; // in dollars
  isOverCap: boolean;
  hasHardCap: boolean;
  hasSoftCap: boolean;
  nextResetAt: Date | null;
  nextBillingDate: Date | null;
  lastInvoiceAmount: number | null;
  lastInvoiceDate: Date | null;
  totalSpentAllTime: number;
}

export interface UsageBreakdownEntry {
  category: string;
  displayName: string;
  creditsUsed: number;
  requestCount: number;
  percentOfTotal: number;
}

export interface OrgUsageBreakdown {
  workspaceId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCreditsUsed: number;
  breakdown: UsageBreakdownEntry[];
}

const FEATURE_CATEGORIES: Record<string, string> = {
  ai_scheduling: 'Scheduling AI',
  scheduling: 'Scheduling AI',
  ai_payroll: 'Payroll AI',
  payroll: 'Payroll AI',
  ai_compliance: 'Compliance AI',
  compliance: 'Compliance AI',
  ai_chat: 'Chat / Trinity',
  trinity_chat: 'Chat / Trinity',
  ai_insights: 'Insights & Analytics',
  insights: 'Insights & Analytics',
  ai_notification: 'Smart Notifications',
  ai_invoicing: 'Invoicing AI',
  invoicing: 'Invoicing AI',
  helpai_chat: 'HelpDesk AI',
  helpai_response: 'HelpDesk AI',
};

function getCategoryDisplayName(featureKey: string): string {
  for (const [pattern, name] of Object.entries(FEATURE_CATEGORIES)) {
    if (featureKey.toLowerCase().includes(pattern.toLowerCase())) return name;
  }
  return 'General AI';
}

class OrgBillingServiceImpl {
  /**
   * Full billing health summary for a single org.
   * Call this for dashboard displays and billing enforcement.
   */
  async getOrgBillingSummary(workspaceId: string): Promise<OrgBillingSummary> {
    const [workspace] = await db
      .select({ id: workspaces.id, name: workspaces.name, subscriptionTier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) throw new Error(`Workspace not found: ${workspaceId}`);

    const tier = (workspace.subscriptionTier || 'free').toLowerCase();
    const allocation = TIER_TOKEN_ALLOCATIONS[tier as keyof typeof TIER_TOKEN_ALLOCATIONS] || 100;

    // workspace_credits table dropped (Phase 16) — use defaults
    const currentBalance = 999_999;
    const monthlyAllocation = allocation;

    // Use ledger-based usage sum — same authoritative anchor as /api/credits/balance.
    // Simple math (allocation - balance) is unreliable when purchased credits or
    // mid-period corrections cause the actual pool to differ from monthlyAllocation.
    let creditsUsedThisPeriod = 0;
    try {
      const usageBreakdown = await tokenManager.getMonthlyBreakdown(workspaceId);
      creditsUsedThisPeriod = usageBreakdown.reduce(
        (sum: number, item: any) => sum + (Number(item.totalCredits) || 0), 0
      );
    } catch {
      // Non-critical fallback: if ledger query fails, use balance math
      creditsUsedThisPeriod = Math.max(0, monthlyAllocation - currentBalance);
      log.warn('getOrgBillingSummary: falling back to balance math for creditsUsedThisPeriod', { workspaceId });
    }

    const creditsRemainingThisPeriod = Math.max(0, currentBalance);
    const overageCredits = 0;
    const overageAmount = 0;

    const [lastInvoice] = await db
      .select({ totalAmount: subscriptionInvoices.totalAmount, createdAt: subscriptionInvoices.createdAt })
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.workspaceId, workspaceId))
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(1);

    return {
      workspaceId,
      workspaceName: workspace.name || 'Unknown',
      subscriptionTier: tier,
      currentBalance,
      monthlyAllocation,
      creditsUsedThisPeriod,
      creditsRemainingThisPeriod,
      overageCredits,
      overageAmount,
      isOverCap: false,
      hasHardCap: HARD_CAP_TIERS.has(tier),
      hasSoftCap: SOFT_CAP_TIERS.has(tier),
      nextResetAt: null,
      nextBillingDate: (workspace as any).nextInvoiceAt ?? null,
      lastInvoiceAmount: lastInvoice?.totalAmount ? parseFloat(lastInvoice.totalAmount) : null,
      lastInvoiceDate: lastInvoice?.createdAt ?? null,
      totalSpentAllTime: 0,
    };
  }

  /**
   * AI usage broken down by feature category for the current billing period.
   */
  async getUsageBreakdown(
    workspaceId: string,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<OrgUsageBreakdown> {
    const now = new Date();
    const start = periodStart ?? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = periodEnd ?? now;

    // credit_transactions table dropped (Phase 16) — return empty
    const rows: Array<{ featureKey: string | null; totalCredits: number; requestCount: number }> = [];

    const totalCredits = rows.reduce((s, r) => s + Number(r.totalCredits || 0), 0);

    // Aggregate by display category
    const categoryMap = new Map<string, { credits: number; count: number }>();
    for (const row of rows) {
      const cat = getCategoryDisplayName(row.featureKey || '');
      const existing = categoryMap.get(cat) || { credits: 0, count: 0 };
      categoryMap.set(cat, {
        credits: existing.credits + Number(row.totalCredits || 0),
        count: existing.count + Number(row.requestCount || 0),
      });
    }

    const breakdown: UsageBreakdownEntry[] = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        displayName: category,
        creditsUsed: Math.round(data.credits),
        requestCount: data.count,
        percentOfTotal: totalCredits > 0 ? Math.round((data.credits / totalCredits) * 100) : 0,
      }))
      .sort((a, b) => b.creditsUsed - a.creditsUsed);

    return { workspaceId, periodStart: start, periodEnd: end, totalCreditsUsed: Math.round(totalCredits), breakdown };
  }

  /**
   * Calculate the dollar overage amount for an org.
   * Returns 0 for hard-cap tiers (they can't go into overage).
   */
  async calculateOverage(workspaceId: string): Promise<{ overageCredits: number; overageAmountDollars: number; tier: string }> {
    const [workspace] = await db
      .select({ subscriptionTier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const tier = (workspace?.subscriptionTier || 'free').toLowerCase();
    if (HARD_CAP_TIERS.has(tier)) {
      return { overageCredits: 0, overageAmountDollars: 0, tier };
    }

    // workspace_credits table dropped (Phase 16)
    return { overageCredits: 0, overageAmountDollars: 0, tier };
  }

  /**
   * Recent credit transactions for an org (audit trail).
   */
  async getRecentTransactions(_workspaceId: string, _limit = 50) {
    // credit_transactions table dropped (Phase 16)
    return [];
  }

  /**
   * Platform-wide billing health — all active orgs with their summary.
   * Admin-only endpoint.
   */
  async getPlatformBillingOverview(limit = 100) {
    const activeWorkspaces = await db
      .select({ id: workspaces.id, name: workspaces.name, tier: workspaces.subscriptionTier })
      .from(workspaces)
      .where(eq(workspaces.accountState, 'active'))
      .limit(limit);

    const summaries = await Promise.allSettled(
      activeWorkspaces.map(ws => this.getOrgBillingSummary(ws.id))
    );

    return summaries
      .filter((r): r is PromiseFulfilledResult<OrgBillingSummary> => r.status === 'fulfilled')
      .map(r => r.value);
  }
}

export const orgBillingService = new OrgBillingServiceImpl();
