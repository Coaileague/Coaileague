/**
 * PLATFORM AI BUDGET SERVICE
 * ===========================
 * Tracks the platform's estimated AI API spend per provider.
 * Since OpenAI, Google, and Anthropic don't expose balance APIs, we derive
 * estimated spend from the raw provider costs stored in ai_usage_events.
 *
 * RAW API COST RATES (Mar 2026):
 *   Gemini Flash: $0.075/M input, $0.30/M output
 *   Gemini Pro:   $1.25/M input,  $5.00/M output
 *   Claude Sonnet: $3.00/M input, $15.0/M output
 *
 * These rates are used by usageMetering to populate provider_cost_usd so
 * this service can aggregate total estimated platform spend per provider.
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { tokenManager } from './tokenManager';
import { typedPoolExec } from '../../lib/typedSql';

const log = createLogger('platformAIBudgetService');

export interface ProviderSpendSummary {
  provider: string;
  displayName: string;
  estimatedSpendUsd: number;
  creditsCollected: number;
  creditsCollectedValueUsd: number;
  marginUsd: number;
  marginPercent: number;
  eventCount: number;
  lastEventAt: string | null;
  monthlyBudgetUsd: number;
  alertThresholdPercent: number;
  isOverBudget: boolean;
  isNearBudget: boolean;
  topoffEvents: TopoffEvent[];
  lastTopoffAt: string | null;
}

export interface TopoffEvent {
  id: string;
  amountCents: number;
  note: string;
  performedBy: string;
  performedAt: string;
}

export interface FinancialHealthReport {
  generatedAt: string;
  billingLayers: BillingLayerStatus[];
  creditSystem: CreditSystemStatus;
  providerBudgets: ProviderSpendSummary[];
  alerts: HealthAlert[];
  overallStatus: 'healthy' | 'warning' | 'critical';
}

export interface BillingLayerStatus {
  layer: number;
  name: string;
  description: string;
  status: 'active' | 'warning' | 'error';
  lastRunAt: string | null;
  recentSuccessCount: number;
  recentFailureCount: number;
}

export interface CreditSystemStatus {
  totalActiveWorkspaces: number;
  workspacesWithNegativeBalance: number;
  totalCreditsInCirculation: number;
  recentDeductions: number;
  recentTopoffs: number;
}

export interface HealthAlert {
  severity: 'info' | 'warning' | 'critical';
  category: 'budget' | 'billing' | 'credits' | 'providers';
  message: string;
  provider?: string;
  workspaceId?: string;
}

// Raw API cost rates (USD per 1K tokens) — used to calculate provider_cost_usd
export const RAW_API_COST_RATES: Record<string, { inputPer1K: number; outputPer1K: number }> = {
  // Gemini — April 2026 real pricing
  'gemini-2.5-flash-lite': { inputPer1K: 0.0000001, outputPer1K: 0.0000004 }, // $0.10/$0.40 per 1M
  'gemini-2.5-flash': { inputPer1K: 0.0000003, outputPer1K: 0.0000025 },      // $0.30/$2.50 per 1M
  'gemini-2.5-pro': { inputPer1K: 0.00000125, outputPer1K: 0.00001 },          // $1.25/$10.00 per 1M
  'gemini-exp-1206': { inputPer1K: 0.00000125, outputPer1K: 0.00001 },
  // Claude — April 2026 real pricing
  'claude-haiku-4-5': { inputPer1K: 0.000001, outputPer1K: 0.000005 },         // $1.00/$5.00 per 1M
  'claude-sonnet-4-6': { inputPer1K: 0.000003, outputPer1K: 0.000015 },        // $3.00/$15.00 per 1M
  'claude-sonnet': { inputPer1K: 0.000003, outputPer1K: 0.000015 },
  // GPT — April 2026 real pricing
  'gpt-4o-mini': { inputPer1K: 0.00000015, outputPer1K: 0.0000006 },           // $0.15/$0.60 per 1M
  'gpt-4o': { inputPer1K: 0.0000025, outputPer1K: 0.00001 },                   // $2.50/$10.00 per 1M
  'gpt-4': { inputPer1K: 0.030, outputPer1K: 0.060 },
  'claude-haiku': { inputPer1K: 0.00025, outputPer1K: 0.00125 },
  'claude-opus': { inputPer1K: 0.015, outputPer1K: 0.075 },
};

/**
 * Determine which provider owns a given AI model
 */
export function getProviderForModel(model: string): string {
  if (!model) return 'unknown';
  const m = model.toLowerCase();
  if (m.includes('gemini')) return 'gemini';
  if (m.includes('gpt') || m.includes('openai')) return 'openai';
  if (m.includes('claude') || m.includes('anthropic')) return 'claude';
  return 'unknown';
}

/**
 * Calculate the estimated raw API cost in USD for a token usage event
 */
export function calculateProviderCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = RAW_API_COST_RATES[model] || RAW_API_COST_RATES['gemini-2.5-flash'];
  const cost = (inputTokens / 1000) * rates.inputPer1K + (outputTokens / 1000) * rates.outputPer1K;
  return Math.max(0, cost);
}

class PlatformAIBudgetService {
  /**
   * Get platform AI spend summary per provider for the current calendar month.
   * Aggregates from ai_usage_events.provider_cost_usd.
   */
  async getProviderSpendSummary(periodDays: number = 30): Promise<ProviderSpendSummary[]> {
    try {
      const sinceDate = new Date();
      sinceDate.setDate(sinceDate.getDate() - periodDays);

      // Aggregate spend from usage events grouped by model prefix → provider
      const usageResult = await pool.query<{
        ai_model: string;
        total_provider_cost: string;
        total_credits: string;
        event_count: string;
        last_event: string;
      }>(`
        SELECT
          COALESCE(ai_model, 'unknown') as ai_model,
          COALESCE(SUM(provider_cost_usd), 0) as total_provider_cost,
          COALESCE(SUM(credits_deducted), 0) as total_credits,
          COUNT(*) as event_count,
          MAX(created_at) as last_event
        FROM ai_usage_events
        WHERE created_at >= $1
          AND workspace_id != 'PLATFORM_COST_CENTER'
        GROUP BY ai_model
      `, [sinceDate]);

      // Aggregate by provider
      const providerAgg: Record<string, {
        estimatedSpendUsd: number;
        creditsCollected: number;
        eventCount: number;
        lastEventAt: string | null;
      }> = {};

      for (const row of usageResult.rows) {
        const provider = getProviderForModel(row.ai_model);
        if (!providerAgg[provider]) {
          providerAgg[provider] = { estimatedSpendUsd: 0, creditsCollected: 0, eventCount: 0, lastEventAt: null };
        }
        providerAgg[provider].estimatedSpendUsd += parseFloat(row.total_provider_cost) || 0;
        providerAgg[provider].creditsCollected += parseInt(row.total_credits) || 0;
        providerAgg[provider].eventCount += parseInt(row.event_count) || 0;
        if (row.last_event && (!providerAgg[provider].lastEventAt || row.last_event > providerAgg[provider].lastEventAt!)) {
          providerAgg[provider].lastEventAt = row.last_event;
        }
      }

      // Get budget configs
      const budgetResult = await pool.query<{
        provider: string;
        display_name: string;
        monthly_budget_cents: string;
        alert_threshold_percent: string;
        topoff_events: string;
      }>(`SELECT provider, display_name, monthly_budget_cents, alert_threshold_percent, topoff_events FROM platform_ai_provider_budgets`);

      const budgetMap: Record<string, typeof budgetResult.rows[0]> = {};
      for (const b of budgetResult.rows) {
        budgetMap[b.provider] = b;
      }

      const CREDIT_VALUE_USD = 0.01; // 1 credit = $0.01

      const summaries: ProviderSpendSummary[] = ['openai', 'gemini', 'claude'].map(provider => {
        const budget = budgetMap[provider];
        const agg = providerAgg[provider] || { estimatedSpendUsd: 0, creditsCollected: 0, eventCount: 0, lastEventAt: null };
        const monthlyBudgetUsd = budget ? parseInt(budget.monthly_budget_cents) / 100 : 500;
        const alertThreshold = budget ? parseInt(budget.alert_threshold_percent) : 80;
        const creditsCollectedValueUsd = agg.creditsCollected * CREDIT_VALUE_USD;
        const marginUsd = creditsCollectedValueUsd - agg.estimatedSpendUsd;
        const marginPercent = creditsCollectedValueUsd > 0
          ? Math.round((marginUsd / creditsCollectedValueUsd) * 100)
          : 0;

        const spendPercent = monthlyBudgetUsd > 0
          ? (agg.estimatedSpendUsd / monthlyBudgetUsd) * 100
          : 0;

        let topoffEvents: TopoffEvent[] = [];
        try {
          topoffEvents = budget ? JSON.parse(budget.topoff_events) : [];
        } catch { topoffEvents = []; }

        const lastTopoffAt = topoffEvents.length > 0
          ? topoffEvents[topoffEvents.length - 1].performedAt
          : null;

        return {
          provider,
          displayName: budget?.display_name || provider,
          estimatedSpendUsd: Math.round(agg.estimatedSpendUsd * 10000) / 10000,
          creditsCollected: agg.creditsCollected,
          creditsCollectedValueUsd: Math.round(creditsCollectedValueUsd * 100) / 100,
          marginUsd: Math.round(marginUsd * 100) / 100,
          marginPercent,
          eventCount: agg.eventCount,
          lastEventAt: agg.lastEventAt,
          monthlyBudgetUsd,
          alertThresholdPercent: alertThreshold,
          isOverBudget: spendPercent >= 100,
          isNearBudget: spendPercent >= alertThreshold && spendPercent < 100,
          topoffEvents,
          lastTopoffAt,
        };
      });

      return summaries;
    } catch (error: any) {
      log.error('Failed to get provider spend summary', { error: (error instanceof Error ? error.message : String(error)) });
      return [];
    }
  }

  /**
   * Record a provider budget top-off event (when admin adds budget to provider account)
   */
  async recordProviderTopoff(params: {
    provider: string;
    amountCents: number;
    note: string;
    performedBy: string;
    performedByRole: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const topoffEvent: TopoffEvent = {
        id: Math.random().toString(36).substr(2, 9),
        amountCents: params.amountCents,
        note: params.note,
        performedBy: params.performedBy,
        performedAt: new Date().toISOString(),
      };

      // CATEGORY C — Raw SQL retained: ::jsonb | Tables: platform_ai_provider_budgets | Verified: 2026-03-23
      await typedPoolExec(`
        UPDATE platform_ai_provider_budgets
        SET
          topoff_events = topoff_events || $1::jsonb,
          updated_at = NOW()
        WHERE provider = $2
      `, [JSON.stringify([topoffEvent]), params.provider]);

      log.info(`[PlatformAIBudget] Top-off recorded for ${params.provider}: $${(params.amountCents / 100).toFixed(2)} by ${params.performedBy}`);
      return { success: true };
    } catch (error: any) {
      log.error('Failed to record provider top-off', { error: (error instanceof Error ? error.message : String(error)) });
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Update provider budget settings (monthly budget, alert threshold)
   */
  async updateProviderBudget(params: {
    provider: string;
    monthlyBudgetCents?: number;
    alertThresholdPercent?: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: string[] = ['updated_at = NOW()'];
      const values: any[] = [params.provider];
      let paramIdx = 2;

      if (params.monthlyBudgetCents !== undefined) {
        updates.push(`monthly_budget_cents = $${paramIdx++}`);
        values.splice(paramIdx - 2, 0, params.monthlyBudgetCents);
      }
      if (params.alertThresholdPercent !== undefined) {
        updates.push(`alert_threshold_percent = $${paramIdx++}`);
        values.splice(paramIdx - 2, 0, params.alertThresholdPercent);
      }
      if (params.notes !== undefined) {
        updates.push(`notes = $${paramIdx++}`);
        values.splice(paramIdx - 2, 0, params.notes);
      }

      // CATEGORY C — Raw SQL retained: Dynamic column UPDATE built from runtime array | Tables: platform_ai_provider_budgets | Verified: 2026-03-23
      await typedPoolExec(
        `UPDATE platform_ai_provider_budgets SET ${updates.join(', ')} WHERE provider = $1`,
        values
      );

      return { success: true };
    } catch (error: any) {
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  /**
   * Comprehensive financial health report for the platform
   */
  async getFinancialHealth(): Promise<FinancialHealthReport> {
    const alerts: HealthAlert[] = [];
    const now = new Date().toISOString();

    // 1. Provider spend summaries
    const providerBudgets = await this.getProviderSpendSummary();
    for (const pb of providerBudgets) {
      if (pb.isOverBudget) {
        alerts.push({
          severity: 'critical',
          category: 'budget',
          provider: pb.provider,
          message: `${pb.displayName} has exceeded monthly budget ($${pb.estimatedSpendUsd.toFixed(2)} / $${pb.monthlyBudgetUsd.toFixed(2)})`,
        });
      } else if (pb.isNearBudget) {
        alerts.push({
          severity: 'warning',
          category: 'budget',
          provider: pb.provider,
          message: `${pb.displayName} is near budget threshold ($${pb.estimatedSpendUsd.toFixed(2)} / $${pb.monthlyBudgetUsd.toFixed(2)})`,
        });
      }
      if (pb.marginPercent < 20 && pb.creditsCollected > 0) {
        alerts.push({
          severity: 'warning',
          category: 'budget',
          provider: pb.provider,
          message: `${pb.displayName} margin is thin: ${pb.marginPercent}% (credits value $${pb.creditsCollectedValueUsd.toFixed(2)} vs. API cost $${pb.estimatedSpendUsd.toFixed(2)})`,
        });
      }
    }

    // 2. Billing layer status (check recent billing audit log)
    const billingLayerResult = await pool.query<{
      event_type: string;
      success_count: string;
      failure_count: string;
      last_run: string;
    }>(`
      SELECT
        event_type,
        COUNT(*) FILTER (WHERE metadata->>'error' IS NULL) as success_count,
        COUNT(*) FILTER (WHERE metadata->>'error' IS NOT NULL) as failure_count,
        MAX(created_at) as last_run
      FROM billing_audit_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
        AND event_type IN ('workspace_billing_processed', 'middleware_fee_charged', 'seat_overage_charged', 'ai_credit_overage_charged')
      GROUP BY event_type
    `).catch(() => ({ rows: [] as any[] }));

    const billingEventMap: Record<string, typeof billingLayerResult.rows[0]> = {};
    for (const row of billingLayerResult.rows) {
      billingEventMap[row.event_type] = row;
    }

    const billingLayers: BillingLayerStatus[] = [
      {
        layer: 1,
        name: 'Invoice Middleware Fee',
        description: 'Stripe charges for invoice processing (1.5% + $0.15)',
        status: 'active',
        lastRunAt: billingEventMap['middleware_fee_charged']?.last_run || null,
        recentSuccessCount: parseInt(billingEventMap['middleware_fee_charged']?.success_count || '0'),
        recentFailureCount: parseInt(billingEventMap['middleware_fee_charged']?.failure_count || '0'),
      },
      {
        layer: 2,
        name: 'AI Credit Deduction',
        description: 'Credits deducted from org balance for AI token usage',
        status: 'active',
        lastRunAt: billingEventMap['workspace_billing_processed']?.last_run || null,
        recentSuccessCount: parseInt(billingEventMap['workspace_billing_processed']?.success_count || '0'),
        recentFailureCount: parseInt(billingEventMap['workspace_billing_processed']?.failure_count || '0'),
      },
      {
        layer: 3,
        name: 'Seat Overage',
        description: 'Stripe charges for employees above tier limit',
        status: 'active',
        lastRunAt: billingEventMap['seat_overage_charged']?.last_run || null,
        recentSuccessCount: parseInt(billingEventMap['seat_overage_charged']?.success_count || '0'),
        recentFailureCount: parseInt(billingEventMap['seat_overage_charged']?.failure_count || '0'),
      },
      {
        layer: 4,
        name: 'AI Credit Overage',
        description: 'Stripe charges for credits used beyond monthly allocation (soft-cap tiers)',
        status: 'active',
        lastRunAt: billingEventMap['ai_credit_overage_charged']?.last_run || null,
        recentSuccessCount: parseInt(billingEventMap['ai_credit_overage_charged']?.success_count || '0'),
        recentFailureCount: parseInt(billingEventMap['ai_credit_overage_charged']?.failure_count || '0'),
      },
    ];

    // Check for billing failures
    for (const layer of billingLayers) {
      if (layer.recentFailureCount > 3) {
        alerts.push({
          severity: 'critical',
          category: 'billing',
          message: `Billing Layer ${layer.layer} (${layer.name}) has ${layer.recentFailureCount} recent failures`,
        });
        layer.status = 'critical' as any;
      } else if (layer.recentFailureCount > 0) {
        layer.status = 'warning';
      }
    }

    // 3. Credit system status
    const creditResult = await pool.query<{
      total_workspaces: string;
      negative_balance_count: string;
      total_credits: string;
    }>(`
      SELECT
        COUNT(*) as total_workspaces,
        COUNT(*) FILTER (WHERE current_credit_balance < 0) as negative_balance_count,
        COALESCE(SUM(current_credit_balance), 0) as total_credits
      FROM workspaces
      WHERE account_state = 'active'
        AND is_deactivated IS NOT TRUE
    `).catch(() => ({ rows: [{ total_workspaces: '0', negative_balance_count: '0', total_credits: '0' }] }));

    const creditRow = creditResult.rows[0];

    // credit_transactions table dropped (Phase 16) — return empty map
    const txMap: Record<string, number> = {};

    const creditSystem: CreditSystemStatus = {
      totalActiveWorkspaces: parseInt(creditRow.total_workspaces),
      workspacesWithNegativeBalance: parseInt(creditRow.negative_balance_count),
      totalCreditsInCirculation: parseInt(creditRow.total_credits),
      recentDeductions: txMap['deduction'] || 0,
      recentTopoffs: (txMap['purchase'] || 0) + (txMap['bonus'] || 0) + (txMap['refund'] || 0) + (txMap['topoff'] || 0),
    };

    if (creditSystem.workspacesWithNegativeBalance > 5) {
      alerts.push({
        severity: 'warning',
        category: 'credits',
        message: `${creditSystem.workspacesWithNegativeBalance} workspaces have negative credit balance`,
      });
    }

    const overallStatus = alerts.some(a => a.severity === 'critical')
      ? 'critical'
      : alerts.some(a => a.severity === 'warning')
      ? 'warning'
      : 'healthy';

    return {
      generatedAt: now,
      billingLayers,
      creditSystem,
      providerBudgets,
      alerts,
      overallStatus,
    };
  }
}

export const platformAIBudgetService = new PlatformAIBudgetService();
