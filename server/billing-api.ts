import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  usageMeteringService,
  creditLedgerService,
  invoiceService,
  accountStateService,
  featureToggleService,
} from './services/billing';
import { db } from './db';
import {
  billingAddons,
  workspaceAddons,
  subscriptionPayments,
  insertBillingAddonSchema,
  orgRewards,
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from './auth';
import { type AuthenticatedRequest } from './rbac';
import Stripe from 'stripe';
import { getStripe } from './services/billing/stripeClient';
import { isFeatureEnabled } from '@shared/platformConfig';
// Import type augmentation for Express Request.user
import './types';

// Lazy proxy: avoids module-load crash if STRIPE_SECRET_KEY is missing.
const stripe = new Proxy({} as Stripe, {
  get(_t, prop) {
    return (getStripe() as any)[prop];
  },
});

export const billingRouter = Router();

// Feature flag check - Billing API
billingRouter.use((req, res, next) => {
  if (!isFeatureEnabled('enableBillingAPI')) {
    return res.status(503).json({ 
      error: 'Billing API is currently disabled',
      feature: 'enableBillingAPI'
    });
  }
  next();
});

// Apply authentication to all billing routes (supports both Replit Auth and custom auth)
// Use Replit Auth middleware for testing, falls back to custom auth
billingRouter.use(async (req, res, next) => {
  // Check if using Replit Auth (OIDC)
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  
  // Fall back to custom session auth
  return requireAuth(req, res, next);
});

// ============================================================================
// USAGE METERING ENDPOINTS
// ============================================================================

/**
 * Record usage event
 */
billingRouter.post('/usage', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Failed to record usage:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Get usage summary (for dashboard)
 */
billingRouter.get('/usage/summary', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get token balance
    const balance = await creditLedgerService.getBalance(workspaceId);
    
    // Get current month usage metrics
    const startDate = new Date();
    startDate.setDate(1); // First day of current month
    const endDate = new Date();
    
    const metrics = await usageMeteringService.getUsageMetrics(workspaceId, startDate, endDate);

    // Aggregate usage by OS module
    const summary = {
      tokenBalance: balance.currentBalance,
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
  } catch (error: any) {
    console.error('Failed to get usage summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get usage metrics
 */
billingRouter.get('/usage/metrics', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startDate, endDate } = z.object({
      startDate: z.string().transform(s => new Date(s)),
      endDate: z.string().transform(s => new Date(s)),
    }).parse(req.query);

    const metrics = await usageMeteringService.getUsageMetrics(workspaceId, startDate, endDate);

    res.json(metrics);
  } catch (error: any) {
    console.error('Failed to get usage metrics:', error);
    res.status(400).json({ error: error.message });
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
  } catch (error: any) {
    console.error('Failed to estimate cost:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Import CreditManager from billing system
    const { CreditManager } = await import('./services/billing/creditManager');
    const creditManager = new CreditManager();
    
    const credits = await creditManager.getCreditsAccount(workspaceId);
    
    if (!credits) {
      // Initialize if not exists
      const newCredits = await creditManager.initializeCredits(workspaceId, 'free');
      return res.json(newCredits);
    }

    res.json(credits);
  } catch (error: any) {
    console.error('Failed to get credits:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get wallet balance (legacy endpoint)
 */
billingRouter.get('/credits/balance', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const balance = await creditLedgerService.getBalance(workspaceId);

    res.json(balance);
  } catch (error: any) {
    console.error('Failed to get balance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get credit transaction history
 */
billingRouter.get('/transactions', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Import CreditManager
    const { CreditManager } = await import('./services/billing/creditManager');
    const creditManager = new CreditManager();
    
    // Parse query params
    const { limit, offset } = z.object({
      limit: z.string().transform(s => parseInt(s) || 50).optional(),
      offset: z.string().transform(s => parseInt(s) || 0).optional(),
    }).parse(req.query);
    
    const transactions = await creditManager.getTransactionHistory(workspaceId, limit, offset);

    res.json(transactions);
  } catch (error: any) {
    console.error('Failed to get transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Purchase credits - Create Stripe Checkout session (SECURE: Validates credit pack)
 */
billingRouter.post('/credits/purchase', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // SECURITY: Require creditPackId - don't hardcode defaults
    const input = z.object({
      creditPackId: z.string(),
      successUrl: z.string().optional(),
      cancelUrl: z.string().optional(),
    }).parse(req.body);

    // SECURITY: Validate creditPackId is provided
    if (!input.creditPackId) {
      return res.status(400).json({ 
        error: 'Credit pack ID required',
        message: 'Please select a credit pack to purchase',
      });
    }

    // Import creditPurchaseService and emailService
    const { creditPurchaseService } = await import('./services/billing/creditPurchase');
    const { emailService } = await import('./services/emailService');

    // SECURITY: Use getAppBaseUrl() if available
    let baseUrl = 'https://app.example.com';
    if (emailService && typeof emailService.getAppBaseUrl === 'function') {
      baseUrl = emailService.getAppBaseUrl();
    }

    // Create Stripe Checkout session
    console.log('[Stripe] Creating checkout session for credit purchase:', input.creditPackId);
    
    try {
      const session = await creditPurchaseService.createCheckoutSession({
        workspaceId,
        userId,
        creditPackId: input.creditPackId,
        successUrl: input.successUrl || `${baseUrl}/billing/credits?success=true`,
        cancelUrl: input.cancelUrl || `${baseUrl}/billing/credits?canceled=true`,
      });

      console.log('[Stripe] Checkout session created:', session.sessionId);

      res.json({ 
        success: true, 
        checkoutUrl: session.sessionUrl,
        sessionId: session.sessionId,
      });
    } catch (packError: any) {
      // SECURITY: Handle pack validation failures with clear error messages
      console.error('[Stripe] Pack validation or checkout failed:', packError);
      
      if (packError.message?.includes('not found') || packError.message?.includes('does not exist')) {
        return res.status(404).json({ 
          error: 'Credit pack not found',
          message: 'The selected credit pack does not exist or is inactive',
        });
      }
      
      return res.status(400).json({ 
        error: 'Failed to create checkout session',
        message: packError.message || 'Unable to process credit purchase',
      });
    }
  } catch (error: any) {
    console.error('[Stripe] Failed to create checkout session:', error);
    
    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid request',
        message: 'Missing required fields',
        details: error.errors,
      });
    }
    
    res.status(400).json({ error: error.message || 'Failed to initiate credit purchase' });
  }
});

/**
 * Configure auto-recharge
 */
billingRouter.post('/credits/auto-recharge', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      enabled: z.boolean(),
      threshold: z.number().positive().optional(),
      amount: z.number().positive().optional(),
    }).parse(req.body);

    const wallet = await creditLedgerService.configureAutoRecharge(
      workspaceId,
      input.enabled,
      input.threshold,
      input.amount
    );

    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Failed to configure auto-recharge:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoices = await invoiceService.getInvoicesForWorkspace(workspaceId);

    res.json(invoices);
  } catch (error: any) {
    console.error('Failed to get invoices:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get invoice details with line items
 */
billingRouter.get('/invoices/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const invoiceId = req.params.id;
    const result = await invoiceService.getInvoiceWithLineItems(invoiceId);

    if (!result || result.invoice.workspaceId !== workspaceId) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Failed to get invoice:', error);
    res.status(500).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const featureKey = req.params.featureKey;
    const access = await featureToggleService.hasFeatureAccess(workspaceId, featureKey);

    res.json(access);
  } catch (error: any) {
    console.error('Failed to check feature access:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all enabled features
 */
billingRouter.get('/features', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const features = await featureToggleService.getEnabledFeatures(workspaceId);

    res.json({ features });
  } catch (error: any) {
    console.error('Failed to get enabled features:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Toggle feature on/off
 */
billingRouter.post('/features/:addonId/toggle', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Failed to toggle feature:', error);
    res.status(400).json({ error: error.message });
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
  } catch (error: any) {
    console.error('Failed to get available addons:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get workspace's add-ons
 */
billingRouter.get('/addons', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const addons = await featureToggleService.getWorkspaceAddons(workspaceId);

    res.json(addons);
  } catch (error: any) {
    console.error('Failed to get workspace addons:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Purchase add-on
 */
billingRouter.post('/addons/:addonId/purchase', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const addonId = req.params.addonId;

    const addon = await featureToggleService.purchaseAddon(workspaceId, addonId, userId);

    res.json({ success: true, addon });
  } catch (error: any) {
    console.error('Failed to purchase addon:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Cancel add-on
 */
billingRouter.post('/addons/:addonId/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Failed to cancel addon:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = await accountStateService.getAccountStatus(workspaceId);

    res.json(status);
  } catch (error: any) {
    console.error('Failed to get account status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reactivate account (requires support intervention if in requires_support state)
 */
billingRouter.post('/account/reactivate', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { reason } = z.object({
      reason: z.string(),
    }).parse(req.body);

    const workspace = await accountStateService.reactivateAccount(workspaceId, userId, reason);

    res.json({ success: true, workspace });
  } catch (error: any) {
    console.error('Failed to reactivate account:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId, successUrl, cancelUrl, applyOnboardingDiscount } = z.object({
      priceId: z.string(),
      successUrl: z.string(),
      cancelUrl: z.string(),
      applyOnboardingDiscount: z.boolean().optional().default(true),
    }).parse(req.body);

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
      },
    };

    if (applyOnboardingDiscount) {
      const reward = await db.query.orgRewards.findFirst({
        where: eq(orgRewards.workspaceId, workspaceId),
      });

      if (reward?.status === 'unlocked' && reward.stripeCouponId) {
        sessionConfig.discounts = [{ coupon: reward.stripeCouponId }];
        console.log(`[Billing] Applying onboarding discount coupon ${reward.stripeCouponId} to checkout`);
      }
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    res.json({ sessionId: session.id });
  } catch (error: any) {
    console.error('Failed to create checkout session:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Create payment intent for one-time purchases (credits, add-ons)
 */
billingRouter.post('/create-payment-intent', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
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
    });

    res.json({ 
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
    });
  } catch (error: any) {
    console.error('Failed to create payment intent:', error);
    res.status(400).json({ error: error.message });
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
  } catch (error: any) {
    console.error('Failed to verify payment:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriptionManager } = await import('./services/billing/subscriptionManager');
    const details = await subscriptionManager.getSubscriptionDetails(workspaceId);
    
    res.json(details);
  } catch (error: any) {
    console.error('Failed to get subscription details:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create new subscription (upgrade from free tier)
 */
billingRouter.post('/subscription', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      tier: z.enum(['starter', 'professional', 'enterprise']),
      billingCycle: z.enum(['monthly', 'yearly']),
      paymentMethodId: z.string().optional(),
    }).parse(req.body);

    const { subscriptionManager } = await import('./services/billing/subscriptionManager');
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
  } catch (error: any) {
    console.error('Failed to create subscription:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Upgrade or downgrade subscription
 */
billingRouter.post('/subscription/change', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      newTier: z.enum(['free', 'starter', 'professional', 'enterprise']),
      billingCycle: z.enum(['monthly', 'yearly']),
    }).parse(req.body);

    const { subscriptionManager } = await import('./services/billing/subscriptionManager');
    const result = await subscriptionManager.changeSubscriptionTier(
      workspaceId,
      input.newTier,
      input.billingCycle
    );

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error: any) {
    console.error('Failed to change subscription:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Cancel subscription
 */
billingRouter.post('/subscription/cancel', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { immediate } = z.object({
      immediate: z.boolean().default(false),
    }).parse(req.body);

    const { subscriptionManager } = await import('./services/billing/subscriptionManager');
    const result = await subscriptionManager.cancelSubscription(workspaceId, immediate);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: immediate ? 'Subscription cancelled immediately' : 'Subscription will cancel at end of billing period' });
  } catch (error: any) {
    console.error('Failed to cancel subscription:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { usageTracker } = await import('./services/billing/usageTracker');
    const usage = await usageTracker.getEmployeeUsage(workspaceId);
    
    res.json(usage);
  } catch (error: any) {
    console.error('Failed to get employee usage:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Check if workspace can add more employees
 */
billingRouter.get('/usage/can-add-employee', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { usageTracker } = await import('./services/billing/usageTracker');
    const result = await usageTracker.canAddEmployee(workspaceId);
    
    res.json(result);
  } catch (error: any) {
    console.error('Failed to check employee limit:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get employee usage history
 */
billingRouter.get('/usage/history', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { days } = z.object({
      days: z.string().transform(s => parseInt(s) || 30).optional(),
    }).parse(req.query);

    const { usageTracker } = await import('./services/billing/usageTracker');
    const history = await usageTracker.getUsageHistory(workspaceId, days);
    
    res.json(history);
  } catch (error: any) {
    console.error('Failed to get usage history:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get pricing configuration (public endpoint for pricing page)
 */
billingRouter.get('/pricing', async (req, res) => {
  try {
    const { BILLING, formatPrice, getYearlySavingsPercent } = await import('@shared/billingConfig');
    
    const tiers = Object.entries(BILLING.tiers).map(([key, tier]) => ({
      id: tier.id,
      name: tier.name,
      description: tier.description,
      monthlyPrice: tier.monthlyPrice,
      yearlyPrice: tier.yearlyPrice,
      formattedMonthlyPrice: formatPrice(tier.monthlyPrice),
      formattedYearlyPrice: formatPrice(tier.yearlyPrice),
      yearlySavingsPercent: getYearlySavingsPercent(key as any),
      maxEmployees: tier.maxEmployees,
      monthlyCredits: tier.monthlyCredits,
      features: tier.features,
      popular: 'popular' in tier ? tier.popular : false,
    }));

    res.json({
      tiers,
      creditPacks: Object.values(BILLING.creditPacks),
      overages: BILLING.overages,
    });
  } catch (error: any) {
    console.error('Failed to get pricing:', error);
    res.status(500).json({ error: error.message });
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
    const workspaceId = req.user!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { trialManager } = await import('./services/billing/trialManager');
    const status = await trialManager.getTrialStatus(workspaceId);
    
    res.json(status);
  } catch (error: any) {
    console.error('Failed to get trial status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start a free trial
 */
billingRouter.post('/trial/start', async (req, res) => {
  try {
    const workspaceId = req.user!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { trialManager } = await import('./services/billing/trialManager');
    const result = await trialManager.startTrial(workspaceId);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, trialEndsAt: result.trialEndsAt });
  } catch (error: any) {
    console.error('Failed to start trial:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Extend trial (admin only)
 */
billingRouter.post('/trial/extend', async (req, res) => {
  try {
    const workspaceId = req.user!.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { days } = z.object({
      days: z.number().min(1).max(30).default(7),
    }).parse(req.body);

    const { trialManager } = await import('./services/billing/trialManager');
    const result = await trialManager.extendTrial(workspaceId, days);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, newEndsAt: result.newEndsAt });
  } catch (error: any) {
    console.error('Failed to extend trial:', error);
    res.status(400).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
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
      subscriptionId: input.invoiceId || "unknown",
      stripePaymentId: refund.id,
      amount: -input.amount,
      currency: 'usd',
      status: 'refunded',
      paymentType: 'refund',
      metadata: { reason: input.reason, notes: input.notes },
    });

    console.log(`[Billing] Refund: ${refund.id} for ${workspaceId}, $${(input.amount / 100).toFixed(2)}`);
    res.json({ success: true, refund });
  } catch (error: any) {
    console.error('Failed to process refund:', error);
    res.status(400).json({ error: error.message });
  }
});

// ============================================================================
// STRIPE WEBHOOK (CRITICAL - NEW)
// ============================================================================

/**
 * Stripe webhook endpoint - handles all subscription events
 */
billingRouter.post('/webhooks/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  if (!sig) return res.status(400).json({ error: 'No signature' });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET || '');
  } catch (error: any) {
    console.error('[Webhook] Signature failed:', error.message);
    return res.status(400).json({ error: 'Signature verification failed' });
  }

  try {
    const { stripeWebhooks } = await import('./services/billing/stripeWebhooks');
    
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await stripeWebhooks.handleSubscriptionEvent(event);
        break;
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        await stripeWebhooks.handleInvoiceEvent(event);
        break;
      case 'charge.refunded':
      case 'charge.dispute.created':
        await stripeWebhooks.handleChargeEvent(event);
        break;
      case 'customer.created':
      case 'customer.deleted':
        await stripeWebhooks.handleCustomerEvent(event);
        break;
      default:
        console.log(`[Webhook] Unhandled: ${event.type}`);
    }
    res.json({ received: true });
  } catch (error: any) {
    console.error('[Webhook] Failed:', error);
    res.status(200).json({ error: 'Processed with errors' });
  }
});

// ============================================================================
// TRINITY CREDITS SYSTEM ENDPOINTS
// ============================================================================

import { creditsLedgerService } from './services/billing/creditsLedgerService';
import { featureGateService } from './services/billing/featureGateService';

/**
 * Get Trinity credits status for workspace
 */
billingRouter.get('/trinity-credits/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const status = await creditsLedgerService.getCreditStatus(workspaceId);
    res.json({ success: true, ...status });
  } catch (error: any) {
    console.error('Failed to get credit status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get available credit packages
 */
billingRouter.get('/trinity-credits/packages', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { workspaces } = await import('@shared/schema');
    const [workspace] = await db.select().from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    const packages = await creditsLedgerService.getAvailablePackages(
      workspace?.subscriptionTier || 'free'
    );
    res.json({ success: true, packages });
  } catch (error: any) {
    console.error('Failed to get credit packages:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get credit transaction history
 */
billingRouter.get('/trinity-credits/transactions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await creditsLedgerService.getTransactionHistory(
      workspaceId,
      limit,
      offset
    );
    res.json({ success: true, transactions });
  } catch (error: any) {
    console.error('Failed to get transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Purchase credits with Stripe
 */
billingRouter.post('/trinity-credits/purchase', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    const userId = req.user?.id || req.session?.userId;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      packageId: z.string(),
      stripePaymentIntentId: z.string().optional(),
    }).parse(req.body);

    // For now, directly add credits (in production, this would verify Stripe payment first)
    const result = await creditsLedgerService.purchaseCredits(
      workspaceId,
      input.packageId,
      userId,
      input.stripePaymentIntentId || 'direct_purchase'
    );

    res.json(result);
  } catch (error: any) {
    console.error('Failed to purchase credits:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Redeem an unlock code
 */
billingRouter.post('/trinity-credits/redeem-code', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    const userId = req.user?.id || req.session?.userId;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      code: z.string().min(4),
    }).parse(req.body);

    const result = await creditsLedgerService.redeemUnlockCode(
      workspaceId,
      input.code,
      userId
    );

    res.json(result);
  } catch (error: any) {
    console.error('Failed to redeem code:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Check if feature is accessible
 */
billingRouter.get('/feature-gate/:featureKey', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
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
  } catch (error: any) {
    console.error('Failed to check feature gate:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all feature states for workspace
 */
billingRouter.get('/feature-states', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const states = await featureGateService.getWorkspaceFeatureStates(workspaceId);
    const definitions = featureGateService.getFeatureDefinitions();

    res.json({ success: true, states, definitions });
  } catch (error: any) {
    console.error('Failed to get feature states:', error);
    res.status(500).json({ error: error.message });
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
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { returnUrl } = z.object({
      returnUrl: z.string().url(),
    }).parse(req.body);

    const { subscriptionManager } = await import('./services/billing/subscriptionManager');
    const result = await subscriptionManager.createBillingPortalSession(workspaceId, returnUrl);

    res.json({ success: true, url: result.url });
  } catch (error: any) {
    console.error('Failed to create billing portal session:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Sync subscription state from Stripe (fallback if webhook missed)
 */
billingRouter.post('/subscription/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspaceId = req.currentWorkspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { subscriptionManager } = await import('./services/billing/subscriptionManager');
    const result = await subscriptionManager.syncSubscriptionFromStripe(workspaceId);

    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Failed to sync subscription:', error);
    res.status(500).json({ error: error.message });
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

    const subscriptionManagerModule = await import('./services/billing/subscriptionManager');
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
    } catch (error: any) {
      runtimeChecks.push({ name: 'Stripe API Connection', status: 'fail', message: error.message });
    }

    res.json({
      ready: readiness.ready && runtimeChecks.every(c => c.status !== 'fail'),
      configChecks: readiness.checks,
      runtimeChecks,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Failed to check production readiness:', error);
    res.status(500).json({ error: error.message });
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

    const code = await creditsLedgerService.generateUnlockCode(
      input.codeType,
      userId,
      input
    );

    if (!code) {
      return res.status(500).json({ error: 'Failed to generate code' });
    }

    res.json({ success: true, code: code.code, unlockCode: code });
  } catch (error: any) {
    console.error('Failed to generate code:', error);
    res.status(400).json({ error: error.message });
  }
});
