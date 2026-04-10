/**
 * BillOS — Billing Operating System
 * ====================================
 * Central orchestration layer for all billing operations on the CoAIleague platform.
 * This module is the canonical entry point for billing domain logic — it delegates to
 * the specialist services in server/services/billing/ while providing a unified API
 * for the rest of the platform to interact with billing.
 *
 * Domain: billing
 * Contract: shared/schema/domains/DOMAIN_CONTRACT.ts
 */

export { creditManager } from './billing/creditManager';
export { orgBillingService } from './billing/orgBillingService';
export { featureGateService } from './billing/featureGateService';
export { subscriptionManager } from './billing/subscriptionManager';
// @ts-expect-error — TS migration: fix in refactoring sprint
export { overdueCollectionsService } from './billing/overdueCollectionsService';
// @ts-expect-error — TS migration: fix in refactoring sprint
export { invoiceResendService } from './billing/invoiceResendService';
export { trialManager } from './billing/trialManager';
export { platformBillService } from './billing/platformBillService';
export { aiCreditGateway } from './billing/aiCreditGateway';
// @ts-expect-error — TS migration: fix in refactoring sprint
export { universalAIBillingInterceptor } from './billing/universalAIBillingInterceptor';

import { db } from '../db';
import { platformEventBus } from './platformEventBus';
import { createLogger } from '../lib/logger';
import { typedPool } from '../lib/typedSql';
import { workspaces } from '@shared/schema';
import { eq } from 'drizzle-orm';

const log = createLogger('BillOS');

export interface BillingHealthSummary {
  workspaceId: string;
  tier: string;
  creditsRemaining: number;
  isOverCap: boolean;
  hasActiveSubscription: boolean;
  nextBillingDate: string | null;
  lastInvoiceAmount: number | null;
  status: 'healthy' | 'warning' | 'critical';
}

export interface UsageSnapshot {
  workspaceId: string;
  period: string;
  creditsUsed: number;
  creditsAllocated: number;
  percentUsed: number;
  topCategories: { category: string; credits: number }[];
}

class BillOS {
  private static instance: BillOS;

  static getInstance(): BillOS {
    if (!BillOS.instance) BillOS.instance = new BillOS();
    return BillOS.instance;
  }

  async getWorkspaceBillingHealth(workspaceId: string): Promise<BillingHealthSummary> {
    try {
      // workspace_credits table dropped (Phase 16) — query workspaces only
      const result = await db
        .select({
          subscriptionTier: workspaces.subscriptionTier,
          trialEndsAt: workspaces.trialEndsAt,
          subscriptionStatus: workspaces.subscriptionStatus
        })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (!result.length) {
        return { workspaceId, tier: 'unknown', creditsRemaining: 0, isOverCap: false, hasActiveSubscription: false, nextBillingDate: null, lastInvoiceAmount: null, status: 'critical' };
      }

      const row = result[0];
      const creditsRemaining = 999_999;
      const isOverCap = false;
      const hasActiveSubscription = ['active', 'trialing'].includes(row.subscriptionStatus || '');

      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (!hasActiveSubscription) status = 'critical';

      return { workspaceId, tier: row.subscriptionTier || 'free', creditsRemaining, isOverCap, hasActiveSubscription, nextBillingDate: null, lastInvoiceAmount: null, status };
    } catch (err: any) {
      log.error('getWorkspaceBillingHealth failed', { workspaceId, error: (err instanceof Error ? err.message : String(err)) });
      return { workspaceId, tier: 'unknown', creditsRemaining: 0, isOverCap: false, hasActiveSubscription: false, nextBillingDate: null, lastInvoiceAmount: null, status: 'critical' };
    }
  }

  async getPlatformRevenueSummary() {
    try {
      const [invoiceStats, activeWorkspaces] = await Promise.all([
        // CATEGORY C — Raw SQL retained: COUNT( | Tables: invoices | Verified: 2026-03-23
        typedPool(`SELECT COUNT(*) as total, SUM(CAST(total AS NUMERIC)) as total_revenue FROM invoices WHERE status='paid' AND created_at >= NOW() - INTERVAL '30 days'`),
        // CATEGORY C — Raw SQL retained: COUNT( | Tables: workspaces | Verified: 2026-03-23
        typedPool(`SELECT COUNT(*) as count FROM workspaces WHERE subscription_status='active'`),
      ]);

      return {
        invoicesLast30Days: Number(invoiceStats.rows[0]?.total || 0),
        revenueLast30Days: Number(invoiceStats.rows[0]?.total_revenue || 0),
        activeWorkspaces: Number(activeWorkspaces.rows[0]?.count || 0),
        generatedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      log.error('getPlatformRevenueSummary failed', { error: (err instanceof Error ? err.message : String(err)) });
      return { invoicesLast30Days: 0, revenueLast30Days: 0, activeWorkspaces: 0, generatedAt: new Date().toISOString() };
    }
  }

  async publishBillingEvent(type: string, workspaceId: string, metadata: Record<string, any>) {
    await platformEventBus.publish({
      type: type as any,
      category: 'automation',
      title: `BillOS: ${type}`,
      description: `Billing event: ${type}`,
      workspaceId,
      metadata,
    });
  }
}

export const billOS = BillOS.getInstance();
