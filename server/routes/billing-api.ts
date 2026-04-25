import { sanitizeError } from '../middleware/errorHandler';
import { Router, Response, NextFunction, RequestHandler } from 'express';
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
import { type AuthenticatedRequest, resolveWorkspaceForUser, requireFinanceRole } from '../rbac';
import { ensureWorkspaceAccess } from '../middleware/workspaceScope';
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
  const runMiddleware = (mw: RequestHandler) =>
    new Promise<void>((resolve, reject) => {
      (mw as any)(req, res, (err: unknown) => (err ? reject(err) : resolve()));
    });

  try {
    // @ts-expect-error — TS migration: fix in refactoring sprint
    if (req.requireAuth && req.requireAuth()) {
      if (authReq.user?.currentWorkspaceId) {
        authReq.currentWorkspaceId = authReq.user.currentWorkspaceId;
      }
    } else {
      await runMiddleware(requireAuth);
      if (authReq.user?.currentWorkspaceId) {
        authReq.currentWorkspaceId = authReq.user.currentWorkspaceId;
      }
    }

    await runMiddleware(ensureWorkspaceAccess);
    await runMiddleware(requireFinanceRole);
    next();
  } catch (error) {
    next(error);
  }
});

// USAGE METERING ENDPOINTS
// ============================================================================

/**
 * Record usage event
 */
billingRouter.post('/usage', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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

// ============================================================================
// CREDIT LEDGER ENDPOINTS
// ============================================================================

/**
 * Get full credit account details (for CoAIleague credit system)
 */
billingRouter.get('/credits', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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

billingRouter.post('/credits/auto-recharge', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.workspaceId || (req.user)?.workspaceId || req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // SECURITY: Only workspace owners/co-owners and platform admins may configure auto-recharge.
    // The previous check incorrectly used user.platformRole, which is 'user' for workspace owners.
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const arPlatformAdminRoles = ['root_admin', 'deputy_admin', 'sysop'];
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
// ============================================================================
// FEATURE TOGGLE ENDPOINTS
// ============================================================================

billingRouter.get('/features', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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

// ============================================================================
// ACCOUNT STATE ENDPOINTS
// ============================================================================

/**
 * Get account status
 */
billingRouter.get('/account/status', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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
// ============================================================================
// STRIPE CHECKOUT ENDPOINTS
// ============================================================================

/**
 * Create Stripe checkout session for subscription upgrade
 * Automatically applies onboarding discount if available
 */
billingRouter.post('/create-checkout-session', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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
// ============================================================================
// SUBSCRIPTION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * Get current subscription details
 */
billingRouter.post('/subscription', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
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
        maxEmployees: (t.includedEmployees === 0 || t.includedEmployees === null) ? -1 : t.includedEmployees,
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

// ============================================================================
// REFUND ENDPOINT (CRITICAL - NEW)
// ============================================================================

/**
 * Process refund for subscription/payment
 */
// ============================================================================
// STRIPE WEBHOOK (CRITICAL - NEW)
// ============================================================================

/**
 * DEPRECATED: This endpoint is no longer active.
 * The canonical Stripe webhook handler lives at POST /api/stripe/webhook
 * (stripeInlineRoutes.ts) which includes idempotency dedup and
 * MONEY_CRITICAL_EVENTS handling. Stripe dashboard must point there.
 */
// ============================================================================
// TRINITY CREDITS SYSTEM ENDPOINTS
// ============================================================================

/**
 * Get Trinity AI token usage status for workspace
 */
billingRouter.get('/trinity-credits/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
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

// ============================================================================
// STRIPE BILLING PORTAL & PRODUCTION READINESS
// ============================================================================

/**
 * Create Stripe Billing Portal session for org self-service
 * Allows orgs to manage payment methods, view invoices, cancel subscriptions
 */
billingRouter.post('/billing-portal', async (req: AuthenticatedRequest, res: Response) => {
  try {
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

// ══════════════════════════════════════════════════════════════════════════
// GET /api/billing/invoice-preview
// Owner-only preview of pending Stripe invoice line items for the current
// billing period. Surfaces per-use transactional charges (payroll, employment
// verify, TAC docs, tax forms, metered voice/SMS) alongside the subscription
// before the invoice closes, so tenants can reconcile usage before it bills.
// ══════════════════════════════════════════════════════════════════════════
billingRouter.get('/invoice-preview', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const callerRole = req.workspaceRole || '';
  const platformRole = req.platformRole || '';
  const isPlatformStaff = ['root_admin', 'deputy_admin', 'sysop', 'support_manager'].includes(platformRole);
  if (!['org_owner', 'co_owner'].includes(callerRole) && !isPlatformStaff) {
    return res.status(403).json({ error: 'Owner access required' });
  }

  const workspaceId = req.workspaceId || req.currentWorkspaceId;
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

// ── AI Usage (migrated from domains/billing.ts) ───────────────────────────────
// Frontend caller: client/src/components/billing/AiUsageDashboard.tsx
router.get('/ai-usage', requireAuth, ensureWorkspaceAccess, requireManager, async (req: any, res: any) => {
    try {
      const workspaceId = req.workspaceId;
      if (!workspaceId) return res.status(400).json({ error: "Workspace required" });
      const { aiMeteringService } = await import('../../services/billing/aiMeteringService');
      const usage = await aiMeteringService.getCurrentPeriodUsage(workspaceId);
      if (!usage) return res.json({ empty: true });

      const { rows: recentCalls } = await (await import('../../db')).pool.query(`
        SELECT model_name, call_type, total_tokens, cost_microcents, created_at
        FROM ai_call_log
        WHERE workspace_id=$1
        ORDER BY created_at DESC
        LIMIT 20
      `, [workspaceId]);

      const { rows: daily } = await (await import('../../db')).pool.query(`
        SELECT summary_date, total_tokens_k, total_cost_microcents, call_count
        FROM ai_usage_daily_summary
        WHERE workspace_id=$1
        ORDER BY summary_date DESC
        LIMIT 30
      `, [workspaceId]);

      res.json({ ...usage, recentCalls, dailyHistory: daily });
    } catch (error: unknown) { res.status(500).json({ error: sanitizeError(error) }); }
  });

