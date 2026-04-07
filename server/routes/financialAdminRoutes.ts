/**
 * FINANCIAL ADMIN ROUTES
 * =======================
 * Platform-level financial health and AI provider budget management.
 * Restricted to root_admin, deputy_admin, and sysop roles (level 4+).
 */

import { sanitizeError } from '../middleware/errorHandler';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth';
import { getUserPlatformRole, getPlatformRoleLevel } from '../rbac';
import { platformAIBudgetService } from '../services/billing/platformAIBudgetService';
import { pool } from '../db';
import { typedPool } from '../lib/typedSql';
import { createLogger } from '../lib/logger';
const log = createLogger('FinancialAdminRoutes');


const router = Router();

// ── Authorization middleware ─────────────────────────────────────────────────

async function requireFinancialAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: Function
) {
  const userId = req.userId || req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const role = await getUserPlatformRole(userId);
  const level = getPlatformRoleLevel(role);

  if (level < 4) {
    return res.status(403).json({ error: 'Financial admin access requires deputy admin or higher' });
  }

  req.adminRole = role;
  req.adminLevel = level;
  next();
}

// ── Health check endpoint ────────────────────────────────────────────────────

/**
 * GET /api/admin/financial/health
 * Comprehensive financial health report for all billing subsystems
 */
router.get(
  '/api/admin/financial/health',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const report = await platformAIBudgetService.getFinancialHealth();
      res.json({ success: true, report });
    } catch (error: unknown) {
      log.error('[FinancialAdmin] Health check failed:', sanitizeError(error));
      res.status(500).json({ success: false, error: 'Failed to generate financial health report' });
    }
  }
);

// ── Platform AI spend endpoints ──────────────────────────────────────────────

/**
 * GET /api/admin/financial/platform-spend
 * Per-provider AI spend breakdown (estimated from usage events)
 */
router.get(
  '/api/admin/financial/platform-spend',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const periodDays = parseInt(req.query.periodDays as string) || 30;
      const summaries = await platformAIBudgetService.getProviderSpendSummary(periodDays);
      res.json({ success: true, periodDays, summaries });
    } catch (error: unknown) {
      log.error('[FinancialAdmin] Platform spend failed:', sanitizeError(error));
      res.status(500).json({ success: false, error: 'Failed to retrieve platform spend data' });
    }
  }
);

// ── Provider budget management ────────────────────────────────────────────────

/**
 * GET /api/admin/financial/provider-budgets
 * Get all provider budget configs
 */
router.get(
  '/api/admin/financial/provider-budgets',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: platform_ai_provider_budgets | Verified: 2026-03-23
      const result = await typedPool(
        `SELECT provider, display_name, monthly_budget_cents, alert_threshold_percent, notes, topoff_events, updated_at
         FROM platform_ai_provider_budgets ORDER BY provider`
      );
      res.json({ success: true, budgets: result.rows });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: 'Failed to retrieve provider budgets' });
    }
  }
);

const updateBudgetSchema = z.object({
  monthlyBudgetCents: z.number().int().min(0).optional(),
  alertThresholdPercent: z.number().int().min(10).max(99).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * PATCH /api/admin/financial/provider-budgets/:provider
 * Update a provider's monthly budget or alert threshold
 */
router.patch(
  '/api/admin/financial/provider-budgets/:provider',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { provider } = req.params;
      const validProviders = ['openai', 'gemini', 'claude'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({ success: false, error: 'Invalid provider. Must be openai, gemini, or claude' });
      }

      const parsed = updateBudgetSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      }

      const result = await platformAIBudgetService.updateProviderBudget({
        provider,
        ...parsed.data,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      res.json({ success: true, message: `Budget updated for ${provider}` });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: 'Failed to update provider budget' });
    }
  }
);

// ── Provider top-off recording ────────────────────────────────────────────────

const topoffSchema = z.object({
  provider: z.enum(['openai', 'gemini', 'claude']),
  amountCents: z.number().int().min(100, 'Minimum top-off is $1.00').max(10_000_000, 'Maximum top-off is $100,000'),
  note: z.string().min(5, 'Note must describe why this top-off was made').max(500),
});

/**
 * POST /api/admin/financial/provider-topoff
 * Record that platform API budget has been topped off for a provider.
 * This is a manual record-keeping step (since providers don't expose balance APIs).
 * Admins top-off their OpenAI/Google/Anthropic billing accounts directly,
 * then record it here for platform visibility and audit trail.
 */
router.post(
  '/api/admin/financial/provider-topoff',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const parsed = topoffSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      }

      const userId = req.userId || req.user?.id;
      const adminRole = req.adminRole;

      const result = await platformAIBudgetService.recordProviderTopoff({
        provider: parsed.data.provider,
        amountCents: parsed.data.amountCents,
        note: parsed.data.note,
        performedBy: userId,
        performedByRole: adminRole,
      });

      if (!result.success) {
        return res.status(500).json({ success: false, error: result.error });
      }

      res.json({
        success: true,
        message: `Top-off of $${(parsed.data.amountCents / 100).toFixed(2)} recorded for ${parsed.data.provider}`,
      });
    } catch (error: unknown) {
      log.error('[FinancialAdmin] Provider top-off failed:', sanitizeError(error));
      res.status(500).json({ success: false, error: 'Failed to record provider top-off' });
    }
  }
);

// ── Credit system overview ────────────────────────────────────────────────────

/**
 * GET /api/admin/financial/credit-overview
 * Overview of org credit balances and recent transaction activity
 */
router.get(
  '/api/admin/financial/credit-overview',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Workspace credit balance distribution
      // CATEGORY C — Raw SQL retained: FILTER (WHERE | Tables: workspaces | Verified: 2026-03-23
      const balanceResult = await typedPool(`
        SELECT
          COUNT(*) as total_workspaces,
          COUNT(*) FILTER (WHERE current_credit_balance > 0) as positive_balance,
          COUNT(*) FILTER (WHERE current_credit_balance = 0) as zero_balance,
          COUNT(*) FILTER (WHERE current_credit_balance < 0) as negative_balance,
          COALESCE(SUM(current_credit_balance), 0) as total_credits_in_system,
          COALESCE(AVG(current_credit_balance), 0) as avg_balance,
          COALESCE(MIN(current_credit_balance), 0) as min_balance,
          COALESCE(MAX(current_credit_balance), 0) as max_balance
        FROM workspaces
        WHERE account_state = 'active'
          AND is_deactivated IS NOT TRUE
      `);

      // credit_transactions table dropped (Phase 16) — return empty rows
      const txResult = { rows: [] as unknown[] };
      const topConsumers = { rows: [] as unknown[] };

      res.json({
        success: true,
        overview: balanceResult.rows[0],
        recentActivity: txResult.rows,
        topConsumers: topConsumers.rows,
      });
    } catch (error: unknown) {
      log.error('[FinancialAdmin] Credit overview failed:', sanitizeError(error));
      res.status(500).json({ success: false, error: 'Failed to retrieve credit overview' });
    }
  }
);

router.get(
  '/api/admin/financial/cost-rates',
  requireAuth,
  requireFinancialAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // CATEGORY C — Raw SQL retained: ORDER BY | Tables: platform_cost_rates | Verified: 2026-03-23
      const result = await typedPool(
        `SELECT id, service_name, unit_name, cost_microcents, markup_multiplier, is_active,
                ROUND(cost_microcents * markup_multiplier) AS billed_microcents,
                created_at, updated_at
         FROM platform_cost_rates
         WHERE is_active = true
         ORDER BY service_name, unit_name`
      );
      res.json({ success: true, rates: result, total: result.length });
    } catch (error: unknown) {
      res.status(500).json({ success: false, error: sanitizeError(error) });
    }
  }
);

export default router;
