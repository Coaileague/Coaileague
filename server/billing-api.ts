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

export const billingRouter = Router();

// ============================================================================
// USAGE METERING ENDPOINTS
// ============================================================================

/**
 * Record usage event
 */
billingRouter.post('/api/billing/usage', async (req, res) => {
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
billingRouter.get('/api/billing/usage/summary', async (req, res) => {
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
billingRouter.get('/api/billing/usage/metrics', async (req, res) => {
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
billingRouter.post('/api/billing/usage/estimate', async (req, res) => {
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
 * Get wallet balance
 */
billingRouter.get('/api/billing/credits/balance', async (req, res) => {
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
 * Purchase credits
 */
billingRouter.post('/api/billing/credits/purchase', async (req, res) => {
  try {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId || !userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const input = z.object({
      amount: z.number().positive(),
      paymentMethodId: z.string().optional(), // Stripe payment method ID
    }).parse(req.body);

    // TODO: Process Stripe payment first
    // For now, just add credits
    const wallet = await creditLedgerService.addCredits(
      workspaceId,
      input.amount,
      `Credit purchase: $${input.amount}`,
      true,
      userId
    );

    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Failed to purchase credits:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * Configure auto-recharge
 */
billingRouter.post('/api/billing/credits/auto-recharge', async (req, res) => {
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
billingRouter.get('/api/billing/invoices', async (req, res) => {
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
billingRouter.get('/api/billing/invoices/:id', async (req, res) => {
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
billingRouter.get('/api/billing/features/:featureKey', async (req, res) => {
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
billingRouter.get('/api/billing/features', async (req, res) => {
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
billingRouter.post('/api/billing/features/:addonId/toggle', async (req, res) => {
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
billingRouter.get('/api/billing/addons/available', async (req, res) => {
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
billingRouter.get('/api/billing/addons', async (req, res) => {
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
billingRouter.post('/api/billing/addons/:addonId/purchase', async (req, res) => {
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
billingRouter.post('/api/billing/addons/:addonId/cancel', async (req, res) => {
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
billingRouter.get('/api/billing/account/status', async (req, res) => {
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
billingRouter.post('/api/billing/account/reactivate', async (req, res) => {
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
