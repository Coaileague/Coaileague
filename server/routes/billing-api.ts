import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, NextFunction } from 'express';
import { BILLING } from '../config/platformConfig';
import crypto from 'crypto';
import { z } from 'zod';
import {
  usageMeteringService,
  invoiceService,
  accountStateService,
  featureToggleService,
} from '../services/billing';
import { tokenManager } from '../services/billing/tokenManager';
import { featureGateService } from '../services/billing/featureGateService';
import { db, pool } from '../db';
import { TOKEN_ALLOWANCES, TOKEN_OVERAGE_RATE_CENTS_PER_100K } from '../../shared/billingConfig';
import {
  billingAddons,
  workspaceAddons,
  subscriptionPayments,
  insertBillingAddonSchema,
  orgRewards,
  workspaces,
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth } from '../auth';
import { type AuthenticatedRequest, resolveWorkspaceForUser } from '../rbac';
import Stripe from 'stripe';
import { getStripe } from '../services/billing/stripeClient';
import { isFeatureEnabled } from '@shared/platformConfig';
// Import type augmentation for Express Request.user
import '../types';

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing.
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

export const billingRouter = Router();

import { subscriptionTiers, orgSubscriptions, creditBalances, platformInvoices, employees } from '@shared/schema';
import { createLogger } from '../lib/logger';
const log = createLogger('BillingApi');


billingRouter.get('/tiers', async (_req, res: Response) => {
  try {
    // RC4 (Phase 2): All financial arithmetic via FinancialCalculator (Decimal.js).
    // No floating point division here. Use FinancialCalculator utilities.
    const tiers = await db.select({
      id: subscriptionTiers.id,
      tierName: subscriptionTiers.tierName,
      displayName: subscriptionTiers.displayName,
      basePriceCents: subscriptionTiers.basePriceCents,
      includedEmployees: subscriptionTiers.includedEmployees,
      perEmployeeOverageCents: subscriptionTiers.perEmployeeOverageCents,
      baseCredits: subscriptionTiers.baseCredits,
      perEmployeeCreditScaling: subscriptionTiers.perEmployeeCreditScaling,
      perInvoiceFeeCents: subscriptionTiers.perInvoiceFeeCents,
      perPayrollFeeCents: subscriptionTiers.perPayrollFeeCents,
      perQbSyncFeeCents: subscriptionTiers.perQbSyncFeeCents,
      carryoverPercentage: subscriptionTiers.carryoverPercentage,
      coreFeatures: subscriptionTiers.coreFeatures,
      includedPremiumFeatures: subscriptionTiers.includedPremiumFeatures,
      usageLimits: subscriptionTiers.usageLimits,
    }).from(subscriptionTiers);

    const { multiplyFinancialValues, toFinancialString } = await import('../services/financialCalculator');

    res.json({
      tiers: tiers.map(t => ({
        ...t,
        basePriceDollars: parseFloat(multiplyFinancialValues(toFinancialString(String(t.basePriceCents || 0)), '0.01')),
        perEmployeeOverageDollars: parseFloat(multiplyFinancialValues(toFinancialString(String(t.perEmployeeOverageCents || 0)), '0.01')),
        perInvoiceFeeDollars: parseFloat(multiplyFinancialValues(toFinancialString(String(t.perInvoiceFeeCents || 0)), '0.01')),
        perPayrollFeeDollars: parseFloat(multiplyFinancialValues(toFinancialString(String(t.perPayrollFeeCents || 0)), '0.01')),
        perQbSyncFeeDollars: parseFloat(multiplyFinancialValues(toFinancialString(String(t.perQbSyncFeeCents || 0)), '0.01')),
      })),
      cachedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('[Billing API] Failed to fetch tiers:', sanitizeError(error));
    res.status(500).json({ error: 'Failed to fetch subscription tiers' });
  }
});

billingRouter.use((req, res, next) => {
  if (!isFeatureEnabled('enableBillingAPI')) {
    return res.status(503).json({ 
      error: 'Billing API is currently disabled',
      feature: 'enableBillingAPI'
    });
  }
  next();
});

billingRouter.use(async (req, res, next) => {
  const authReq = req as AuthenticatedRequest;
  
  // @ts-expect-error — TS migration: fix in refactoring sprint
  if (req.requireAuth && (req as any).requireAuth()) {
    if (authReq.user?.currentWorkspaceId) {
      authReq.currentWorkspaceId = authReq.user.currentWorkspaceId;
    }
    return next();
  }
  
  return requireAuth(req, res, () => {
    if (authReq.user?.currentWorkspaceId) {
      authReq.currentWorkspaceId = authReq.user.currentWorkspaceId;
    }
    next();
  });
});

billingRouter.get('/subscription', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const [sub] = await db
      .select()
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.workspaceId, workspaceId))
      .limit(1);

    const [tier] = sub
      ? await db.select().from(subscriptionTiers).where(eq(subscriptionTiers.id, sub.tierId)).limit(1)
      : [];

    const credits = await tokenManager.getWorkspaceState(workspaceId);

    const [empRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employees)
      .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));

    const currentEmployees = empRow?.count ?? 0;
    const maxEmployees = tier?.includedEmployees ?? 0;

    // Derive cancelAtPeriodEnd from workspace.subscriptionStatus so the frontend
    // correctly shows the "Cancelling at period end" banner.
    const [ws] = await db.select({ subscriptionStatus: workspaces.subscriptionStatus })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const cancelAtPeriodEnd = ws?.subscriptionStatus === 'pending_cancel';

    res.json({
      tier: tier?.tierName ?? 'free',
      status: cancelAtPeriodEnd ? 'pending_cancel' : (sub?.status ?? 'inactive'),
      billingCycle: 'monthly',
      stripeSubscriptionId: sub?.stripeSubscriptionId ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd,
      credits: {
        total: credits?.monthlyAllocation ?? 0,
        used: Math.max(0, (credits?.monthlyAllocation ?? 0) - (credits?.currentBalance ?? 0)),
        remaining: credits?.currentBalance ?? 0,
      },
      limits: {
        maxEmployees,
        currentEmployees,
        employeesRemaining: Math.max(0, maxEmployees - currentEmployees),
      },
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /api/billing/current-charges
 * Returns line-item breakdown of current billing cycle charges for the workspace.
 * Shows subscription, overages, processing fees — so Statewide knows exactly what
 * they're being charged for.
 */
billingRouter.get('/current-charges', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { billingReconciliation } = await import('../services/billing/billingReconciliation');
    const breakdown = await billingReconciliation.getCurrentChargesBreakdown(workspaceId);

    res.json({
      ...breakdown,
      totalDollars: (breakdown.totalCents / 100).toFixed(2),
      subscription: {
        ...breakdown.subscription,
        amountDollars: (breakdown.subscription.amountCents / 100).toFixed(2),
      },
      employeeOverage: {
        ...breakdown.employeeOverage,
        totalDollars: (breakdown.employeeOverage.totalCents / 100).toFixed(2),
      },
    });
  } catch (error: unknown) {
    next(error);
  }
});

/**
 * GET /api/billing/reconcile
 * Runs internal reconciliation check: platform invoices vs Stripe status.
 * Returns findings (discrepancies) for admin review.
 */
billingRouter.get('/reconcile', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { billingReconciliation } = await import('../services/billing/billingReconciliation');
    const result = await billingReconciliation.reconcilePlatformInvoices(workspaceId);

    res.json(result);
  } catch (error: unknown) {
    next(error);
  }
});

billingRouter.get('/pricing', async (_req, res: Response, next: NextFunction) => {
  try {
    const tiers = await db.select({
      id: subscriptionTiers.id,
      tierName: subscriptionTiers.tierName,
      displayName: subscriptionTiers.displayName,
      basePriceCents: subscriptionTiers.basePriceCents,
      includedEmployees: subscriptionTiers.includedEmployees,
      perEmployeeOverageCents: subscriptionTiers.perEmployeeOverageCents,
      baseCredits: subscriptionTiers.baseCredits,
      perEmployeeCreditScaling: subscriptionTiers.perEmployeeCreditScaling,
      perInvoiceFeeCents: subscriptionTiers.perInvoiceFeeCents,
      perPayrollFeeCents: subscriptionTiers.perPayrollFeeCents,
      perQbSyncFeeCents: subscriptionTiers.perQbSyncFeeCents,
      carryoverPercentage: subscriptionTiers.carryoverPercentage,
      coreFeatures: subscriptionTiers.coreFeatures,
      includedPremiumFeatures: subscriptionTiers.includedPremiumFeatures,
      usageLimits: subscriptionTiers.usageLimits,
    }).from(subscriptionTiers);

    // creditPacks table dropped (Phase 16)
    const packs: unknown[] = [];

    const YEARLY_DISCOUNT = 0.17;

    const { multiplyFinancialValues, toFinancialString } = await import('../services/financialCalculator');

    res.json({
      tiers: tiers.map(t => {
        const monthlyPriceStr = multiplyFinancialValues(toFinancialString(String(t.basePriceCents || 0)), '0.01');
        const monthlyPrice = parseFloat(monthlyPriceStr);
        const yearlyMonthly = monthlyPrice * (1 - YEARLY_DISCOUNT);
        const features: string[] = Array.isArray(t.coreFeatures)
          ? (t.coreFeatures as string[])
          : Array.isArray(t.includedPremiumFeatures)
            ? (t.includedPremiumFeatures as string[])
            : [];
        return {
          id: t.id,
          name: t.displayName || t.tierName,
          description: '',
          monthlyPrice,
          yearlyPrice: parseFloat(yearlyMonthly.toFixed(2)),
          formattedMonthlyPrice: `$${monthlyPrice}`,
          formattedYearlyPrice: `$${yearlyMonthly.toFixed(2)}`,
          yearlySavingsPercent: Math.round(YEARLY_DISCOUNT * 100),
          maxEmployees: t.includedEmployees ?? -1,
          monthlyCredits: t.baseCredits ?? 0,
          features,
          popular: t.tierName === 'professional',
          tierName: t.tierName,
          basePriceCents: t.basePriceCents,
          perEmployeeOverageCents: t.perEmployeeOverageCents,
          baseCredits: t.baseCredits,
          includedEmployees: t.includedEmployees,
        };
      }),
      creditPacks: packs,
      overages: {},
    });
  } catch (error: unknown) {
    next(error);
  }
});

billingRouter.get('/platform-invoices', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) return res.status(403).json({ error: 'Workspace context required' });

    const { desc } = await import('drizzle-orm');
    const invoices = await db.select()
      .from(platformInvoices)
      .where(eq(platformInvoices.workspaceId, workspaceId))
      .orderBy(desc(platformInvoices.createdAt));

    res.json({ invoices });
  } catch (error: unknown) {
    log.error('[Billing API] Failed to fetch platform invoices:', sanitizeError(error));
    res.status(500).json({ error: 'Failed to fetch platform invoices' });
  }
});

// ============================================================================
// USAGE METERING ENDPOINTS
// ============================================================================

/**
 * Record usage event
 */
billingRouter.post('/usage', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      featureKey: z.string(),
      usageType: z.enum(['token', 'session', 'activity', 'api_call']),
      usageAmount: z.number().positive(),
      usageUnit: z.string(),
      sessionId: z.string().optional(),
      activityType: z.string().optional(),
      metadata: z.any().optional(),
    }).parse(req.body);

    const event = await usageMeteringService.recordUsage({
      workspaceId,
      userId: req.user?.id || '',
      featureKey: input.featureKey,
      usageType: input.usageType,
      usageAmount: input.usageAmount,
      usageUnit: input.usageUnit,
      sessionId: input.sessionId,
      activityType: input.activityType,
      metadata: input.metadata,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.json({ success: true, event });
  } catch (error: unknown) {
    log.error('Failed to record usage:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Get usage summary (for dashboard)
 */
billingRouter.get('/usage/summary', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentBalance = await tokenManager.getBalance(workspaceId);
    
    const startDate = new Date();
    startDate.setDate(1);
    const endDate = new Date();
    
    const metrics = await usageMeteringService.getUsageMetrics(workspaceId, startDate, endDate);

    const summary = {
      tokenBalance: currentBalance,
      recordOSTokens: 0,
      insightOSTokens: 0,
      scheduleOSTokens: 0,
      totalTokens: metrics.totalUsage || 0,
    };

    // Parse metrics by feature key to categorize by OS module
    if (metrics.byFeature) {
      Object.entries(metrics.byFeature).forEach(([featureKey, usage]: [string, any]) => {
        if (featureKey.includes('record')) {
          summary.recordOSTokens += usage.totalAmount || 0;
        } else if (featureKey.includes('insight')) {
          summary.insightOSTokens += usage.totalAmount || 0;
        } else if (featureKey.includes('schedule')) {
          summary.scheduleOSTokens += usage.totalAmount || 0;
        }
      });
    }

    res.json(summary);
  } catch (error: unknown) {
    log.error('Failed to get usage summary:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get usage metrics
 */
billingRouter.get('/usage/metrics', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startDate, endDate } = z.object({
      startDate: z.string().transform(s => new Date(s)),
      endDate: z.string().transform(s => new Date(s)),
    }).parse(req.query);

    const metrics = await usageMeteringService.getUsageMetrics(workspaceId, startDate, endDate);

    res.json(metrics);
  } catch (error: unknown) {
    log.error('Failed to get usage metrics:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Estimate cost for planned usage
 */
billingRouter.post('/usage/estimate', async (req, res) => {
  try {
    const input = z.object({
      featureKey: z.string(),
      usageAmount: z.number().positive(),
      usageType: z.string().optional(),
    }).parse(req.body);

    const cost = await usageMeteringService.estimateCost(
      input.featureKey,
      input.usageAmount,
      input.usageType
    );

    res.json({ estimatedCost: cost });
  } catch (error: unknown) {
    log.error('Failed to estimate cost:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// CREDIT LEDGER ENDPOINTS
// ============================================================================

/**
 * Get full credit account details (for CoAIleague credit system)
 */
billingRouter.get('/credits', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const state = await tokenManager.getWorkspaceState(workspaceId);
    res.json(state ?? {
      workspaceId,
      currentBalance: 0,
      monthlyAllocation: 0,
      totalTokensUsed: 0,
      inOverage: false,
      overageTokens: 0,
      overageDollars: 0,
    });
  } catch (error: unknown) {
    log.error('Failed to get credits:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get wallet balance (legacy endpoint)
 */
billingRouter.get('/credits/balance', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const account = await tokenManager.getWorkspaceState(workspaceId);
    const currentBalance = account?.currentBalance || 0;

    res.json({
      currentBalance,
      totalPurchased: (account as any)?.totalPurchased || 0,
      totalUsed: (account as any)?.totalUsed || 0,
      monthlyIncludedCredits: (account as any)?.monthlyIncludedCredits || 0,
      monthlyCreditsUsed: (account as any)?.monthlyCreditsUsed || 0,
      // @ts-expect-error — TS migration: fix in refactoring sprint
      monthlyCreditsRemaining: Math.max(0, (account?.monthlyIncludedCredits || 0) - (account?.monthlyCreditsUsed || 0)),
    });
  } catch (error: unknown) {
    log.error('Failed to get balance:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get credit transaction history
 */
billingRouter.get('/transactions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse query params
    const { limit, offset } = z.object({
      limit: z.string().transform(s => parseInt(s) || 50).optional(),
      offset: z.string().transform(s => parseInt(s) || 0).optional(),
    }).parse(req.query);
    
    const transactions = await tokenManager.getUsageHistory(workspaceId, limit);

    res.json(transactions);
  } catch (error: unknown) {
    log.error('Failed to get transactions:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Purchase credits — RETIRED (410 Gone).
 * CoAIleague does not sell credit packs. AI usage is metered as tokens and
 * overage is billed automatically on the monthly invoice.
 */
billingRouter.post('/credits/purchase', async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({
    error: 'Credit purchase is retired. AI usage is billed as monthly token overage.',
    migration: 'Use GET /api/usage/tokens for current monthly token usage.',
  });
});

/**
 * Get auto-recharge configuration for workspace
 */
billingRouter.get('/credits/auto-recharge', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const config = await (tokenManager as any).getAutoRechargeConfig(workspaceId);
    res.json({ success: true, config });
  } catch (error: unknown) {
    log.error('Failed to get auto-recharge config:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Configure auto-recharge
 * ROLE GUARD: Only workspace owners/admins and platform admins may configure auto-recharge.
 */
billingRouter.post('/credits/auto-recharge', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // SECURITY: Only workspace owners/co-owners and platform admins may configure auto-recharge.
    // The previous check incorrectly used user.platformRole, which is 'user' for workspace owners.
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const arPlatformAdminRoles = ['root_admin', 'deputy_admin', 'sysop'];
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const arUserPlatformRole = (req.user)?.platformRole || '';
    const arIsPlatformAdmin = arPlatformAdminRoles.includes(arUserPlatformRole);
    if (!arIsPlatformAdmin) {
      const { role: wsRole } = await resolveWorkspaceForUser(userId, workspaceId);
      if (wsRole !== 'org_owner' && wsRole !== 'co_owner') {
        return res.status(403).json({ error: 'Workspace owner role required to configure auto-recharge' });
      }
    }

    const input = z.object({
      enabled: z.boolean(),
      threshold: z.number().positive().optional(),
      amount: z.number().positive().optional(),
      creditPackId: z.string().optional(),
    }).parse(req.body);

    const updated = await (tokenManager as any).configureAutoRecharge(
      workspaceId,
      input.enabled,
      input.threshold,
      input.amount,
      input.creditPackId,
    );

    res.json({ success: true, wallet: updated });
  } catch (error: unknown) {
    log.error('Failed to configure auto-recharge:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// INVOICE ENDPOINTS
// ============================================================================

/**
 * Get invoices for workspace
 */
billingRouter.get('/invoices', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoices = await invoiceService.getInvoicesForWorkspace(workspaceId);

    res.json(invoices);
  } catch (error: unknown) {
    log.error('Failed to get invoices:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get invoice details with line items
 */
billingRouter.get('/invoices/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoiceId = req.params.id;
    const result = await invoiceService.getInvoiceWithLineItems(invoiceId);

    if (!result || result.invoice.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(result);
  } catch (error: unknown) {
    log.error('Failed to get invoice:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// FEATURE TOGGLE ENDPOINTS
// ============================================================================

/**
 * Check feature access
 */
billingRouter.get('/features/:featureKey', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const featureKey = req.params.featureKey;
    const access = await featureToggleService.hasFeatureAccess(workspaceId, featureKey);

    res.json(access);
  } catch (error: unknown) {
    log.error('Failed to check feature access:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get all enabled features
 */
billingRouter.get('/features', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const features = await featureToggleService.getEnabledFeatures(workspaceId);

    res.json({ features });
  } catch (error: unknown) {
    log.error('Failed to get enabled features:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Toggle feature on/off
 */
billingRouter.post('/features/:addonId/toggle', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const addonId = req.params.addonId;
    const { enabled } = z.object({
      enabled: z.boolean(),
    }).parse(req.body);

    const addon = await featureToggleService.toggleFeature(workspaceId, addonId, enabled, userId);

    res.json({ success: true, addon });
  } catch (error: unknown) {
    log.error('Failed to toggle feature:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// ADD-ON MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get available add-ons (marketplace)
 */
billingRouter.get('/addons/available', async (req, res) => {
  try {
    const addons = await featureToggleService.getAvailableAddons();

    res.json(addons);
  } catch (error: unknown) {
    log.error('Failed to get available addons:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get workspace's add-ons
 */
billingRouter.get('/addons', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const addons = await featureToggleService.getWorkspaceAddons(workspaceId);

    res.json(addons);
  } catch (error: unknown) {
    log.error('Failed to get workspace addons:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Purchase add-on
 */
billingRouter.post('/addons/:addonId/purchase', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const addonId = req.params.addonId;

    const addon = await featureToggleService.purchaseAddon(workspaceId, addonId, userId);

    res.json({ success: true, addon });
  } catch (error: unknown) {
    log.error('Failed to purchase addon:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Cancel add-on
 */
billingRouter.post('/addons/:addonId/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const addonId = req.params.addonId;
    const { reason } = z.object({
      reason: z.string().optional(),
    }).parse(req.body);

    const addon = await featureToggleService.cancelAddon(workspaceId, addonId, userId, reason);

    res.json({ success: true, addon });
  } catch (error: unknown) {
    log.error('Failed to cancel addon:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// ACCOUNT STATE ENDPOINTS
// ============================================================================

/**
 * Get account status
 */
billingRouter.get('/account/status', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = await accountStateService.getAccountStatus(workspaceId);

    res.json(status);
  } catch (error: unknown) {
    log.error('Failed to get account status:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Reactivate account (requires support intervention if in requires_support state)
 */
billingRouter.post('/account/reactivate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { reason } = z.object({
      reason: z.string(),
    }).parse(req.body);

    const workspace = await accountStateService.reactivateAccount(workspaceId, userId, reason);

    res.json({ success: true, workspace });
  } catch (error: unknown) {
    log.error('Failed to reactivate account:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// STRIPE CHECKOUT ENDPOINTS
// ============================================================================

/**
 * Create Stripe checkout session for subscription upgrade
 * Automatically applies onboarding discount if available
 */
billingRouter.post('/create-checkout-session', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId, tier, successUrl, cancelUrl, applyOnboardingDiscount } = z.object({
      priceId: z.string(),
      tier: z.string({ required_error: 'tier is required — must match the purchased plan (growth|professional|enterprise)' }).min(1, 'tier cannot be empty'),
      successUrl: z.string(),
      cancelUrl: z.string(),
      applyOnboardingDiscount: z.boolean().optional().default(true),
    }).parse(req.body);

    // tier is now required — no silent enterprise fallback that would misrepresent the purchase
    const resolvedTier = tier;

    const sessionConfig: any = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        workspaceId,
        userId: req.user?.id || '',
        tier: resolvedTier,
      },
      subscription_data: {
        metadata: {
          workspaceId,
          tier: resolvedTier,
        },
      },
    };

    if (applyOnboardingDiscount) {
      const reward = await db.query.orgRewards.findFirst({
        where: eq(orgRewards.workspaceId, workspaceId),
      });

      if (reward?.status === 'unlocked' && reward.stripeCouponId) {
        sessionConfig.discounts = [{ coupon: reward.stripeCouponId }];
        log.info(`[Billing] Applying onboarding discount coupon ${reward.stripeCouponId} to checkout`);
      }
    }

    // GAP-58 FIX (continued): Checkout sessions are user-initiated and one-shot — a fresh
    // idempotency key per request is acceptable here because Stripe checkout sessions are not
    // retried server-side; the user clicks the button once. We use a timestamp-scoped key so
    // same-minute duplicate clicks from the UI are deduplicated, but we still get a fresh
    // session per real checkout attempt (not the same 24h-stale session on reload).
    const session = await stripe.checkout.sessions.create(sessionConfig, { idempotencyKey: `checkout-${workspaceId}-${Date.now()}` });

    res.json({ sessionId: session.id });
  } catch (error: unknown) {
    log.error('Failed to create checkout session:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Create payment intent for one-time purchases (credits, add-ons)
 */
billingRouter.post('/create-payment-intent', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { amount } = z.object({
      amount: z.number().positive(),
    }).parse(req.body);

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        workspaceId,
        userId: req.user?.id || '',
      },
    // GAP-58 FIX: User-initiated PaymentIntent — timestamp scoped to deduplicate same-second
    // double-clicks without locking the user into the same 24h stale PI on every request.
    }, { idempotencyKey: `pi-purchase-${workspaceId}-${Date.now()}` });

    res.json({ 
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    });
  } catch (error: unknown) {
    log.error('Failed to create payment intent:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Verify payment status after checkout
 */
billingRouter.get('/verify-payment/:workspaceId', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;
    if (req.currentWorkspaceId !== workspaceId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { session_id } = req.query;
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({ error: 'Missing session_id' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    res.json({
      status: session.payment_status,
      subscriptionId: session.subscription,
      customerId: session.customer,
    });
  } catch (error: unknown) {
    log.error('Failed to verify payment:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// SUBSCRIPTION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get current subscription details
 */
billingRouter.get('/subscription', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriptionManager } = await import('../services/billing/subscriptionManager');
    const details = await subscriptionManager.getSubscriptionDetails(workspaceId);
    
    res.json(details);
  } catch (error: unknown) {
    log.error('Failed to get subscription details:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Create new subscription (upgrade from free tier)
 */
billingRouter.post('/subscription', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      tier: z.enum(['starter', 'professional', 'enterprise']),
      billingCycle: z.enum(['monthly', 'yearly']),
      paymentMethodId: z.string().optional(),
    }).parse(req.body);

    const { subscriptionManager } = await import('../services/billing/subscriptionManager');
    const result = await subscriptionManager.createSubscription({
      workspaceId,
      tier: input.tier,
      billingCycle: input.billingCycle,
      paymentMethodId: input.paymentMethodId,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: unknown) {
    log.error('Failed to create subscription:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Upgrade or downgrade subscription
 */
billingRouter.post('/subscription/change', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = req.user?.id;
    if (userId) {
      const { role } = await resolveWorkspaceForUser(userId, workspaceId);
      if (!role || !['org_owner', 'co_owner'].includes(role)) {
        return res.status(403).json({ error: 'Only organization owners can change the subscription tier.' });
      }
    } else {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      newTier: z.enum(['free', 'starter', 'professional', 'enterprise']),
      billingCycle: z.enum(['monthly', 'yearly']),
    }).parse(req.body);

    const { subscriptionManager } = await import('../services/billing/subscriptionManager');
    const result = await subscriptionManager.changeSubscriptionTier(
      workspaceId,
      input.newTier,
      input.billingCycle
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: unknown) {
    log.error('Failed to change subscription:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Cancel subscription
 */
billingRouter.post('/subscription/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { immediate, reason } = z.object({
      immediate: z.boolean().default(false),
      reason: z.string().max(500).optional(),
    }).parse(req.body);

    const { subscriptionManager } = await import('../services/billing/subscriptionManager');
    const result = await subscriptionManager.cancelSubscription(workspaceId, immediate);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    // Phase 41: persist cancellation reason for churn analysis
    if (reason) {
      const { db } = await import('../db');
      const { workspaces } = await import('../../shared/schema/domains/orgs');
      const { eq } = await import('drizzle-orm');
      await db.update(workspaces)
        .set({ cancellationReason: reason, updatedAt: new Date() } as any)
        .where(eq(workspaces.id, workspaceId));
    }

    res.json({ success: true, message: immediate ? 'Subscription cancelled immediately' : 'Subscription will cancel at end of billing period' });
  } catch (error: unknown) {
    log.error('Failed to cancel subscription:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// EMPLOYEE USAGE & OVERAGE ENDPOINTS
// ============================================================================

/**
 * Get employee usage and overage status
 */
billingRouter.get('/usage/employees', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { usageTracker } = await import('../services/billing/usageTracker');
    const usage = await usageTracker.getEmployeeUsage(workspaceId);
    
    res.json(usage);
  } catch (error: unknown) {
    log.error('Failed to get employee usage:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Check if workspace can add more employees
 */
billingRouter.get('/usage/can-add-employee', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { usageTracker } = await import('../services/billing/usageTracker');
    const result = await usageTracker.canAddEmployee(workspaceId);
    
    res.json(result);
  } catch (error: unknown) {
    log.error('Failed to check employee limit:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get employee usage history
 */
billingRouter.get('/usage/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { days } = z.object({
      days: z.string().transform(s => parseInt(s) || 30).optional(),
    }).parse(req.query);

    const { usageTracker } = await import('../services/billing/usageTracker');
    const history = await usageTracker.getUsageHistory(workspaceId, days);
    
    res.json(history);
  } catch (error: unknown) {
    log.error('Failed to get usage history:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get pricing configuration (public endpoint for pricing page)
 */
billingRouter.get('/pricing', async (req, res) => {
  try {
    const tiers = await db.select().from(subscriptionTiers).orderBy(subscriptionTiers.sortOrder);

    const formattedTiers = tiers.map(t => {
      const monthlyPriceDollars = (t.basePriceCents || 0) / 100;
      const yearlySavingsPercent = 20;
      const yearlyPriceDollars = parseFloat((monthlyPriceDollars * 12 * (1 - yearlySavingsPercent / 100)).toFixed(2));
      return {
        id: t.id,
        name: t.displayName,
        tierName: t.tierName,
        description: t.description,
        monthlyPrice: monthlyPriceDollars,
        yearlyPrice: yearlyPriceDollars,
        formattedMonthlyPrice: monthlyPriceDollars === 0 ? 'Free' : `$${monthlyPriceDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        formattedYearlyPrice: yearlyPriceDollars === 0 ? 'Free' : `$${yearlyPriceDollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
        yearlySavingsPercent,
        maxEmployees: (t.includedEmployees === 0 || t.includedEmployees == null) ? -1 : t.includedEmployees,
        monthlyCredits: t.baseCredits || 0,
        basePriceCents: t.basePriceCents,
        includedEmployees: t.includedEmployees,
        perEmployeeOverageCents: t.perEmployeeOverageCents,
        baseCredits: t.baseCredits,
        perEmployeeCreditScaling: t.perEmployeeCreditScaling,
        perInvoiceFeeCents: t.perInvoiceFeeCents,
        perPayrollFeeCents: t.perPayrollFeeCents,
        perQbSyncFeeCents: t.perQbSyncFeeCents,
        carryoverPercentage: t.carryoverPercentage,
        features: t.coreFeatures || [],
        premiumFeatures: t.includedPremiumFeatures || [],
        usageLimits: t.usageLimits,
        popular: t.tierName === 'professional',
      };
    });

    res.json({ tiers: formattedTiers });
  } catch (error: unknown) {
    log.error('Failed to get pricing:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// TRIAL MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get trial status for current workspace
 */
billingRouter.get('/trial', async (req, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user).workspaceId || (req.user).currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { trialManager } = await import('../services/billing/trialManager');
    const status = await trialManager.getTrialStatus(workspaceId);
    
    res.json(status);
  } catch (error: unknown) {
    log.error('Failed to get trial status:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Start a free trial
 */
billingRouter.post('/trial/start', async (req, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user).workspaceId || (req.user).currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { trialManager } = await import('../services/billing/trialManager');
    const result = await trialManager.startTrial(workspaceId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, trialEndsAt: result.trialEndsAt });
  } catch (error: unknown) {
    log.error('Failed to start trial:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Extend trial (admin only)
 */
billingRouter.post('/trial/extend', async (req, res) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user).workspaceId || (req.user).currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { users } = await import('@shared/schema');
    const userId = req.user?.id || req.session?.userId;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const adminRoles = ['root_admin', 'deputy_admin', 'sysop', 'owner', 'admin'];
      if (!user || !adminRoles.includes((user as any).platformRole || '')) {
        return res.status(403).json({ error: 'Admin role required to extend trials' });
      }
    }

    const { days } = z.object({
      days: z.number().min(1).max(30).default(7),
    }).parse(req.body);

    const { trialManager } = await import('../services/billing/trialManager');
    const result = await trialManager.extendTrial(workspaceId, days);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, newEndsAt: result.newEndsAt });
  } catch (error: unknown) {
    log.error('Failed to extend trial:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// REFUND ENDPOINT (CRITICAL - NEW)
// ============================================================================

/**
 * Process refund for subscription/payment
 */
billingRouter.post('/refunds', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { users } = await import('@shared/schema');
    const userId = req.user?.id || req.session?.userId;
    if (userId) {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      const adminRoles = ['root_admin', 'deputy_admin', 'sysop', 'owner'];
      if (!user || !adminRoles.includes((user as any).platformRole || '')) {
        return res.status(403).json({ error: 'Admin role required to process refunds' });
      }
    }

    const input = z.object({
      invoiceId: z.string(),
      amount: z.number().positive(),
      reason: z.string().min(5),
      notes: z.string().optional(),
    }).parse(req.body);

    // Process refund in Stripe
    const refund = await stripe.refunds.create({
      charge: input.invoiceId,
      amount: input.amount,
      reason: input.reason as 'duplicate' | 'fraudulent' | 'requested_by_customer',
      metadata: { workspaceId, reason: input.reason },
    });

    // Log refund
    await db.insert(subscriptionPayments).values({
      workspaceId,
      invoiceId: input.invoiceId || null,
      stripePaymentIntentId: refund.id,
      amount: (-input.amount).toString(),
      currency: 'usd',
      status: 'refunded',
      paymentMethod: 'refund',
      metadata: { reason: input.reason, notes: input.notes },
    });

    log.info(`[Billing] Refund: ${refund.id} for ${workspaceId}, $${(input.amount / 100).toFixed(2)}`);
    res.json({ success: true, refund });
  } catch (error: unknown) {
    log.error('Failed to process refund:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// STRIPE WEBHOOK (CRITICAL - NEW)
// ============================================================================

/**
 * DEPRECATED: This endpoint is no longer active.
 * The canonical Stripe webhook handler lives at POST /api/stripe/webhook
 * (stripeInlineRoutes.ts) which includes idempotency dedup and
 * MONEY_CRITICAL_EVENTS handling. Stripe dashboard must point there.
 */
billingRouter.post('/webhooks/stripe', (_req, res) => {
  res.status(410).json({
    error: 'Gone',
    message: 'This webhook endpoint is deprecated. Please configure Stripe to POST to /api/stripe/webhook instead.',
    canonical: '/api/stripe/webhook',
  });
});

// ============================================================================
// TRINITY CREDITS SYSTEM ENDPOINTS
// ============================================================================

/**
 * Get Trinity AI token usage status for workspace
 */
billingRouter.get('/trinity-credits/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Fetch workspace tier
    const [ws] = await db.select({ subscriptionTier: workspaces.subscriptionTier, founderExemption: workspaces.founderExemption })
      .from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
    const tier = (ws?.subscriptionTier || 'free').toLowerCase();
    const allowance = (TOKEN_ALLOWANCES as Record<string, number | null>)[tier] ?? 5_000_000;
    const isUnlimited = allowance === null || !!(ws as any)?.founderExemption;

    // Read current-month token usage
    const now = new Date();
    const monthYear = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    let tokensUsed = 0, overageTokens = 0, overageAmountCents = 0;
    try {
      const result = await pool.query(
        `SELECT total_tokens_used, overage_tokens, overage_amount_cents
         FROM token_usage_monthly WHERE workspace_id = $1 AND month_year = $2`,
        [workspaceId, monthYear],
      );
      if (result.rows[0]) {
        tokensUsed = Number(result.rows[0].total_tokens_used ?? 0);
        overageTokens = Number(result.rows[0].overage_tokens ?? 0);
        overageAmountCents = Number(result.rows[0].overage_amount_cents ?? 0);
      }
    } catch { /* non-fatal */ }

    const percentUsed = isUnlimited || !allowance ? 0 : Math.min(200, (tokensUsed / allowance) * 100);
    const isWarning = !isUnlimited && percentUsed >= 80;
    const isOverage = !isUnlimited && tokensUsed > (allowance ?? 0);

    res.json({
      success: true,
      workspaceId,
      // Token fields
      tokensUsed,
      tokensAllowance: isUnlimited ? null : allowance,
      overageTokens,
      overageAmountCents,
      overageRateCentsPer100k: TOKEN_OVERAGE_RATE_CENTS_PER_100K,
      percentUsed,
      isWarning,
      isOverage,
      isUnlimited,
      tier,
      // Legacy compat
      balance: isUnlimited ? 999999 : Math.max(0, (allowance ?? 0) - tokensUsed),
      isActive: true,
      lowBalance: isWarning,
    });
  } catch (error: unknown) {
    log.error('Failed to get token usage status:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Token packages — credit packs no longer exist; billing is per seat + token overage
 */
billingRouter.get('/trinity-credits/packages', async (_req: AuthenticatedRequest, res: Response) => {
  res.json({ success: true, packages: [] });
});

/**
 * Get credit transaction history
 */
billingRouter.get('/trinity-credits/transactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await tokenManager.getUsageHistory(workspaceId, limit);
    res.json({ success: true, transactions });
  } catch (error: unknown) {
    log.error('Failed to get transactions:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Credit purchase no-op — platform uses per-seat billing; token overages are billed automatically at month-end
 */
billingRouter.post('/trinity-credits/purchase', async (_req: AuthenticatedRequest, res: Response) => {
  res.status(410).json({ error: 'Credit packs are no longer available. Token overages are billed automatically at end of billing period.' });
});

/**
 * Redeem an unlock code
 */
billingRouter.post('/trinity-credits/redeem-code', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    const userId = req.user?.id || req.session?.userId;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      code: z.string().min(4),
    }).parse(req.body);

    const result = await (tokenManager as any).redeemUnlockCode(
      workspaceId,
      input.code,
      userId
    );

    res.json(result);
  } catch (error: unknown) {
    log.error('Failed to redeem code:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Check if feature is accessible
 */
billingRouter.get('/feature-gate/:featureKey', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    const userId = req.user?.id || req.session?.userId;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { featureKey } = req.params;
    const sessionId = req.sessionID;

    const result = await featureGateService.canUseFeature(
      featureKey,
      workspaceId,
      userId,
      sessionId
    );

    res.json({ featureKey, ...result });
  } catch (error: unknown) {
    log.error('Failed to check feature gate:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Get all feature states for workspace
 */
billingRouter.get('/feature-states', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const states = await featureGateService.getWorkspaceFeatureStates(workspaceId);
    const definitions = featureGateService.getFeatureDefinitions();

    res.json({ success: true, states, definitions });
  } catch (error: unknown) {
    log.error('Failed to get feature states:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// STRIPE BILLING PORTAL & PRODUCTION READINESS
// ============================================================================

/**
 * Create Stripe Billing Portal session for org self-service
 * Allows orgs to manage payment methods, view invoices, cancel subscriptions
 */
billingRouter.post('/billing-portal', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { returnUrl } = z.object({
      returnUrl: z.string().url(),
    }).parse(req.body);

    const { subscriptionManager } = await import('../services/billing/subscriptionManager');
    const result = await subscriptionManager.createBillingPortalSession(workspaceId, returnUrl);

    res.json({ success: true, url: result.url });
  } catch (error: unknown) {
    log.error('Failed to create billing portal session:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

/**
 * Sync subscription state from Stripe (fallback if webhook missed)
 */
billingRouter.post('/subscription/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriptionManager } = await import('../services/billing/subscriptionManager');
    const result = await subscriptionManager.syncSubscriptionFromStripe(workspaceId);

    res.json({ success: true, ...result });
  } catch (error: unknown) {
    log.error('Failed to sync subscription:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Production readiness check (admin/support only)
 * Returns status of all Stripe configuration requirements
 */
billingRouter.get('/production-readiness', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is support/admin role
    const { users } = await import('@shared/schema');
    const [user] = await db.select().from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const adminRoles = ['root_admin', 'deputy_admin', 'sysop'];
    if (!user || !adminRoles.includes((user as any).platformRole || '')) {
      return res.status(403).json({ error: 'Admin role required' });
    }

    const subscriptionManagerModule = await import('../services/billing/subscriptionManager');
    const readiness = subscriptionManagerModule.SubscriptionManager.validateProductionReadiness();

    // Add additional runtime checks
    const runtimeChecks = [];

    // Check if Stripe is initialized
    try {
      const stripeTest = new (await import('stripe')).default(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-09-30.clover' as any,
      });
      await stripeTest.balance.retrieve();
      runtimeChecks.push({ name: 'Stripe API Connection', status: 'pass', message: 'Successfully connected' });
    } catch (error: unknown) {
      runtimeChecks.push({ name: 'Stripe API Connection', status: 'fail', message: sanitizeError(error) });
    }

    res.json({
      ready: readiness.ready && runtimeChecks.every(c => c.status !== 'fail'),
      configChecks: readiness.checks,
      runtimeChecks,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    log.error('Failed to check production readiness:', error);
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * Admin: Generate unlock code (support/admin only)
 */
billingRouter.post('/trinity-credits/generate-code', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if user is support role
    const { users } = await import('@shared/schema');
    const [user] = await db.select().from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const supportRoles = ['root_admin', 'deputy_admin', 'sysop', 'support_manager', 'support_agent'];
    if (!user || !supportRoles.includes((user as any).platformRole || '')) {
      return res.status(403).json({ error: 'Forbidden: Support role required' });
    }

    const input = z.object({
      codeType: z.enum(['credits', 'feature_unlock', 'trial_extension', 'addon_activation']),
      credits: z.number().optional(),
      featureKey: z.string().optional(),
      addonKey: z.string().optional(),
      daysValid: z.number().optional(),
      workspaceId: z.string().optional(),
      maxRedemptions: z.number().optional(),
    }).parse(req.body);

    const code = await (tokenManager as any).generateUnlockCode(
      input.codeType,
      userId,
      input
    );

    if (!code) {
      return res.status(500).json({ error: 'Failed to generate code' });
    }

    res.json({ success: true, code: code.code, unlockCode: code });
  } catch (error: unknown) {
    log.error('Failed to generate code:', error);
    res.status(400).json({ error: sanitizeError(error) });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// GET /api/billing/invoice-preview
// Owner-only preview of pending Stripe invoice line items for the current
// billing period. Surfaces per-use transactional charges (payroll, employment
// verify, TAC docs, tax forms, metered voice/SMS) alongside the subscription
// before the invoice closes, so tenants can reconcile usage before it bills.
// ══════════════════════════════════════════════════════════════════════════
billingRouter.get('/invoice-preview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const callerRole = (req as any).workspaceRole || '';
  const platformRole = (req as any).platformRole || '';
  const isPlatformStaff = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(platformRole);
  if (!['org_owner', 'co_owner'].includes(callerRole) && !isPlatformStaff) {
    return res.status(403).json({ error: 'Owner access required' });
  }

  const workspaceId = req.workspaceId || (req as any).currentWorkspaceId;
  if (!workspaceId) {
    return res.status(400).json({ error: 'Workspace context required' });
  }

  try {
    const [workspace] = await db
      .select({ stripeCustomerId: workspaces.stripeCustomerId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (!workspace?.stripeCustomerId) {
      return res.json({
        pendingItems: [],
        totalCents: 0,
        subtotalCents: 0,
        taxCents: 0,
        nextPaymentDate: null,
        currency: 'usd',
        message: 'No Stripe customer configured',
      });
    }

    let upcoming: Stripe.UpcomingInvoice | null = null;
    try {
      upcoming = await (stripe as any).invoices.retrieveUpcoming({
        customer: workspace.stripeCustomerId,
      });
    } catch (stripeErr: any) {
      // invoice_upcoming_none → no pending invoice; return empty preview gracefully.
      if (stripeErr?.code === 'invoice_upcoming_none') {
        return res.json({
          pendingItems: [],
          totalCents: 0,
          subtotalCents: 0,
          taxCents: 0,
          nextPaymentDate: null,
          currency: 'usd',
        });
      }
      throw stripeErr;
    }

    if (!upcoming) {
      return res.json({
        pendingItems: [],
        totalCents: 0,
        subtotalCents: 0,
        taxCents: 0,
        nextPaymentDate: null,
        currency: 'usd',
      });
    }

    const items = upcoming.lines.data.map((line) => ({
      description: line.description || 'Subscription',
      amountCents: line.amount,
      quantity: line.quantity || 1,
      periodStart: line.period?.start ? new Date(line.period.start * 1000).toISOString() : null,
      periodEnd: line.period?.end ? new Date(line.period.end * 1000).toISOString() : null,
      type: (line as any).type,
      priceId: (line as any).price?.id,
      metadata: line.metadata || {},
    }));

    res.json({
      pendingItems: items,
      totalCents: upcoming.total,
      subtotalCents: upcoming.subtotal,
      taxCents: (upcoming as any).tax || 0,
      nextPaymentDate: upcoming.next_payment_attempt
        ? new Date(upcoming.next_payment_attempt * 1000).toISOString()
        : null,
      currency: upcoming.currency,
    });
  } catch (err: any) {
    log.error(`[BillingApi] invoice-preview failed: ${err?.message}`);
    res.status(500).json({ error: 'Failed to fetch invoice preview' });
  }
});
