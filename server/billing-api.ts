import { Router } from 'express';
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
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import { isAuthenticated } from './replitAuth';
import { requireAuth } from './auth';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
});

export const billingRouter = Router();

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
billingRouter.post('/usage', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
      userId: req.user?.id,
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
billingRouter.get('/usage/summary', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/usage/metrics', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/credits', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/credits/balance', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/transactions', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.post('/credits/purchase', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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

    // SECURITY: Use getAppBaseUrl() to enforce HTTPS in production
    const baseUrl = emailService.getAppBaseUrl();

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
billingRouter.post('/credits/auto-recharge', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/invoices', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/invoices/:id', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/features/:featureKey', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/features', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.post('/features/:addonId/toggle', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/addons', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.post('/addons/:addonId/purchase', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.post('/addons/:addonId/cancel', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.get('/account/status', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
billingRouter.post('/account/reactivate', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
 */
billingRouter.post('/create-checkout-session', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { priceId, successUrl, cancelUrl } = z.object({
      priceId: z.string(),
      successUrl: z.string(),
      cancelUrl: z.string(),
    }).parse(req.body);

    const session = await stripe.checkout.sessions.create({
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
        userId: req.user?.id,
      },
    });

    res.json({ sessionId: session.id });
  } catch (error: any) {
    console.error('Failed to create checkout session:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Create payment intent for one-time purchases (credits, add-ons)
 */
billingRouter.post('/create-payment-intent', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
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
        userId: req.user?.id,
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
billingRouter.get('/verify-payment/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    if (req.user?.workspaceId !== workspaceId) {
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
