/**
 * AI Metering Service
 * ===================
 * Tracks every Gemini, Claude, and GPT token call per workspace.
 * Measures actual cost in microcents, enforces tier soft/hard caps,
 * fires threshold alerts, and calculates period-end overage charges.
 *
 * NON-BLOCKING: All record writes are fire-and-forget. Trinity is NEVER delayed.
 * SAFE: All errors are caught and logged. Metering failures do not block AI responses.
 *
 * Architecture:
 *   workspace_ai_periods  — monthly budget tracker per workspace
 *   ai_call_log           — every individual API call with token counts and cost
 *   ai_usage_daily_summary — nightly rollups for fast dashboard queries
 */

import { pool } from '../../db';
import { AI_MODEL_COSTS, AI_TIER_LIMITS, type AiModelKey } from '../../../shared/billingConfig';
import { createLogger } from '../../lib/logger';
import { isBillingExcluded } from './billingConstants';

const log = createLogger('AiMeteringService');

export interface RecordAiCallParams {
  workspaceId: string;
  workspaceTier?: string;
  modelName: string;
  callType: string;
  inputTokens: number;
  outputTokens: number;
  responseTimeMs?: number;
  triggeredByUserId?: string;
  triggeredBySessionId?: string;
  trinityActionId?: string;
  employeeId?: string;
  wasCached?: boolean;
  fallbackUsed?: boolean;
  fallbackFrom?: string;
  claudeValidated?: boolean;
  claudeValidationPassed?: boolean;
  claudeValidationAction?: string;
}

interface UsagePeriodRow {
  id: string;
  workspace_id: string;
  billing_period_start: string;
  total_tokens_k: string;
  soft_cap_tokens_k: number;
  included_tokens_k: number;
  overage_per_100k_tokens_cents: number | null;
  soft_cap_80pct_sent_at: Date | null;
  soft_cap_90pct_sent_at: Date | null;
  soft_cap_100pct_sent_at: Date | null;
}

class AiMeteringServiceImpl {

  // ============================================================================
  // RECORD EVERY AI CALL — fire-and-forget, never blocks Trinity
  // ============================================================================
  recordAiCall(params: RecordAiCallParams): void {
    if (isBillingExcluded(params.workspaceId)) return;
    if (!params.inputTokens && !params.outputTokens) return;

    setImmediate(() => {
      this._recordAiCallAsync(params).catch((err: unknown) => {
        log.error('[AiMetering] record error (non-fatal):', (err as any)?.message);
      });
    });
  }

  private async _recordAiCallAsync(params: RecordAiCallParams): Promise<void> {
    const modelConfig = AI_MODEL_COSTS[params.modelName as AiModelKey];
    const inputRate = modelConfig?.inputPer1kTokensMicrocents ?? 750;
    const outputRate = modelConfig?.outputPer1kTokensMicrocents ?? 3000;
    const modelRole = modelConfig?.role ?? 'primary_cortex_fast';

    const inputCostMicrocents = Math.ceil((params.inputTokens / 1000) * inputRate);
    const outputCostMicrocents = Math.ceil((params.outputTokens / 1000) * outputRate);
    const totalCostMicrocents = inputCostMicrocents + outputCostMicrocents;
    const totalTokens = params.inputTokens + params.outputTokens;
    const totalTokensK = totalTokens / 1000;

    const tier = params.workspaceTier ?? await this._fetchWorkspaceTier(params.workspaceId);
    const period = await this._getOrCreatePeriod(params.workspaceId, tier);

    const modelPrefix = this._modelPrefix(params.modelName);

    await pool.query(`
      INSERT INTO ai_call_log (
        workspace_id, period_id, model_name, model_role, call_type,
        input_tokens, output_tokens, total_tokens, cost_microcents,
        triggered_by_user_id, triggered_by_session_id, trinity_action_id, employee_id,
        response_time_ms, was_cached, fallback_used, fallback_from,
        claude_validated, claude_validation_passed, claude_validation_action
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    `, [
      params.workspaceId, period.id,
      params.modelName, modelRole, params.callType,
      params.inputTokens, params.outputTokens, totalTokens, totalCostMicrocents,
      params.triggeredByUserId ?? null,
      params.triggeredBySessionId ?? null,
      params.trinityActionId ?? null,
      params.employeeId ?? null,
      params.responseTimeMs ?? null,
      params.wasCached ?? false,
      params.fallbackUsed ?? false,
      params.fallbackFrom ?? null,
      params.claudeValidated ?? false,
      params.claudeValidationPassed ?? null,
      params.claudeValidationAction ?? null,
    ]);

    await pool.query(`
      UPDATE workspace_ai_periods SET
        ${modelPrefix}_input_tokens_k  = ${modelPrefix}_input_tokens_k  + $1,
        ${modelPrefix}_output_tokens_k = ${modelPrefix}_output_tokens_k + $2,
        ${modelPrefix}_cost_microcents = ${modelPrefix}_cost_microcents + $3,
        total_tokens_k                 = total_tokens_k + $4,
        total_cost_microcents          = total_cost_microcents + $3,
        updated_at = NOW()
      WHERE id = $5
    `, [
      params.inputTokens / 1000,
      params.outputTokens / 1000,
      totalCostMicrocents,
      totalTokensK,
      period.id,
    ]);

    this._checkSoftCaps(params.workspaceId, tier, period, totalTokensK).catch((err: unknown) => {
      log.warn('[AiMetering] soft cap check error:', (err as any)?.message);
    });
  }

  // ============================================================================
  // PRE-CALL CHECK — hard cap enforcement (free trial only)
  // ============================================================================
  async checkUsageAllowed(
    workspaceId: string,
    tier: string,
    estimatedTokens = 2000
  ): Promise<{ allowed: boolean; warning?: string; approaching?: boolean }> {
    if (isBillingExcluded(workspaceId)) return { allowed: true };

    const limits = AI_TIER_LIMITS[tier as keyof typeof AI_TIER_LIMITS];
    if (!limits) return { allowed: true };

    try {
      const period = await this._getOrCreatePeriod(workspaceId, tier);
      const currentK = Number(period.total_tokens_k);
      const projectedK = currentK + estimatedTokens / 1000;

      // HARD CAP: Only enforced for free/trial tiers (hardCapK is null for paid tiers).
      // Paid tenants: soft cap only — never block, always bill overage. We profit always.
      if (limits.hardCapK && projectedK >= limits.hardCapK) {
        log.warn('[AiMetering] Hard cap reached — blocking free/trial workspace', {
          workspaceId, tier, currentK, projectedK, hardCapK: limits.hardCapK,
        });
        return {
          allowed: false,
          warning: `Monthly AI token limit reached (${(limits.hardCapK * 1000).toLocaleString()} tokens). Upgrade your plan to continue using AI features.`,
        };
      }

      if (limits.softCapK && currentK >= limits.softCapK * 0.9) {
        const pct = Math.round((currentK / limits.softCapK) * 100);
        return { allowed: true, approaching: true, warning: `Trinity AI usage at ${pct}% of monthly budget.` };
      }
    } catch (err: unknown) {
      log.warn('[AiMetering] checkUsageAllowed error (allowing):', (err as any)?.message);
    }

    return { allowed: true };
  }

  // ============================================================================
  // UNIVERSAL PRE-CALL CHECK — fetches tier internally, used by aiTokenGateway
  // All 5 AI providers call aiTokenGateway.preAuthorize which calls this.
  // This is the single enforcement point for free/trial hard caps.
  // Paid tier workspaces always return allowed:true (soft cap, billed not blocked).
  // ============================================================================
  async checkUsageAllowedById(
    workspaceId: string,
    estimatedTokens = 2000
  ): Promise<{ allowed: boolean; warning?: string; approaching?: boolean }> {
    if (isBillingExcluded(workspaceId)) return { allowed: true };
    try {
      const tier = await this._fetchWorkspaceTier(workspaceId);
      return this.checkUsageAllowed(workspaceId, tier, estimatedTokens);
    } catch (err: unknown) {
      log.warn('[AiMetering] checkUsageAllowedById error (allowing):', (err as any)?.message);
      return { allowed: true };
    }
  }

  // ============================================================================
  // PERIOD-END OVERAGE CALCULATION — called by billing service
  // ============================================================================
  async calculatePeriodOverage(
    workspaceId: string,
    periodStart: string
  ): Promise<{ overageTokensK: number; overageChargesCents: number }> {
    const { rows } = await pool.query(
      `SELECT * FROM workspace_ai_periods WHERE workspace_id=$1 AND billing_period_start=$2`,
      [workspaceId, periodStart]
    );
    if (!rows[0]) return { overageTokensK: 0, overageChargesCents: 0 };

    const u = rows[0];
    const totalK = Number(u.total_tokens_k);
    const includedK = Number(u.included_tokens_k);
    const rate = u.overage_per_100k_tokens_cents;

    if (totalK <= includedK || !rate) return { overageTokensK: 0, overageChargesCents: 0 };

    const overageK = totalK - includedK;
    const chargesCents = Math.ceil((overageK / 100) * rate);

    await pool.query(`
      UPDATE workspace_ai_periods
      SET overage_tokens_k=$1, overage_charges_cents=$2
      WHERE workspace_id=$3 AND billing_period_start=$4
    `, [overageK, chargesCents, workspaceId, periodStart]);

    return { overageTokensK: overageK, overageChargesCents: chargesCents };
  }

  // ============================================================================
  // CURRENT PERIOD USAGE — for dashboard API
  // ============================================================================
  async getCurrentPeriodUsage(workspaceId: string): Promise<{
    tier: string;
    includedTokensK: number;
    softCapK: number | null;
    geminiTokensK: number;
    claudeTokensK: number;
    gptTokensK: number;
    totalTokensK: number;
    totalCostMicrocents: number;
    overageTokensK: number;
    overageChargesCents: number;
    percentUsed: number;
    daysLeftInPeriod: number;
    periodStart: string;
    periodEnd: string;
  } | null> {
    try {
      const tier = await this._fetchWorkspaceTier(workspaceId);
      const period = await this._getOrCreatePeriod(workspaceId, tier);

      const totalK = Number(period.total_tokens_k ?? 0);
      const includedK = Number(period.included_tokens_k ?? 1500);
      const softK = period.soft_cap_tokens_k ? Number(period.soft_cap_tokens_k) : null;

      const { rows: [p] } = await pool.query(
        `SELECT * FROM workspace_ai_periods WHERE id=$1`, [period.id]
      );

      return {
        tier,
        includedTokensK: includedK,
        softCapK: softK,
        geminiTokensK: Number(p?.gemini_input_tokens_k ?? 0) + Number(p?.gemini_output_tokens_k ?? 0),
        claudeTokensK: Number(p?.claude_input_tokens_k ?? 0) + Number(p?.claude_output_tokens_k ?? 0),
        gptTokensK: Number(p?.gpt_input_tokens_k ?? 0) + Number(p?.gpt_output_tokens_k ?? 0),
        totalTokensK: totalK,
        totalCostMicrocents: Number(p?.total_cost_microcents ?? 0),
        overageTokensK: Number(p?.overage_tokens_k ?? 0),
        overageChargesCents: Number(p?.overage_charges_cents ?? 0),
        percentUsed: includedK > 0 ? Math.round((totalK / includedK) * 100) : 0,
        daysLeftInPeriod: this._daysLeftInPeriod(),
        periodStart: p?.billing_period_start,
        periodEnd: p?.billing_period_end,
      };
    } catch (err: unknown) {
      log.error('[AiMetering] getCurrentPeriodUsage error:', (err as any)?.message);
      return null;
    }
  }

  // ============================================================================
  // DAILY SUMMARY ROLLUP — run nightly via cron
  // ============================================================================
  async rollupDailySummary(workspaceId: string, date: string): Promise<void> {
    const { rows } = await pool.query(`
      SELECT
        SUM(CASE WHEN model_name ILIKE '%gemini%' THEN total_tokens ELSE 0 END)::decimal / 1000 AS gemini_k,
        SUM(CASE WHEN model_name ILIKE '%claude%' THEN total_tokens ELSE 0 END)::decimal / 1000 AS claude_k,
        SUM(CASE WHEN model_name ILIKE '%gpt%' OR model_name ILIKE '%openai%' THEN total_tokens ELSE 0 END)::decimal / 1000 AS gpt_k,
        SUM(total_tokens)::decimal / 1000 AS total_k,
        SUM(cost_microcents) AS cost_mc,
        COUNT(*) AS calls
      FROM ai_call_log
      WHERE workspace_id=$1 AND DATE(created_at)=$2
    `, [workspaceId, date]);

    const r = rows[0];
    if (!r || !Number(r.calls)) return;

    await pool.query(`
      INSERT INTO ai_usage_daily_summary
        (workspace_id, summary_date, gemini_tokens_k, claude_tokens_k, gpt_tokens_k,
         total_tokens_k, total_cost_microcents, call_count)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (workspace_id, summary_date) DO UPDATE SET
        gemini_tokens_k = EXCLUDED.gemini_tokens_k,
        claude_tokens_k = EXCLUDED.claude_tokens_k,
        gpt_tokens_k    = EXCLUDED.gpt_tokens_k,
        total_tokens_k  = EXCLUDED.total_tokens_k,
        total_cost_microcents = EXCLUDED.total_cost_microcents,
        call_count = EXCLUDED.call_count
    `, [
      workspaceId, date,
      Number(r.gemini_k ?? 0), Number(r.claude_k ?? 0), Number(r.gpt_k ?? 0),
      Number(r.total_k ?? 0), Number(r.cost_mc ?? 0), Number(r.calls ?? 0),
    ]);
  }

  // ============================================================================
  // INTERNAL HELPERS
  // ============================================================================
  private async _getOrCreatePeriod(workspaceId: string, tier: string): Promise<UsagePeriodRow> {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const limits = AI_TIER_LIMITS[tier as keyof typeof AI_TIER_LIMITS];
    const budgetK = limits?.monthlyTokenBudgetK ?? 1500;
    const softK = limits?.softCapK ?? 1200;
    const overageRate = limits?.overagePer100kTokensCents ?? null;

    const { rows } = await pool.query(`
      INSERT INTO workspace_ai_periods
        (workspace_id, billing_period_start, billing_period_end,
         included_tokens_k, soft_cap_tokens_k, overage_per_100k_tokens_cents)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (workspace_id, billing_period_start) DO UPDATE SET updated_at=NOW()
      RETURNING *
    `, [workspaceId, start, end, budgetK, softK, overageRate]);

    return rows[0];
  }

  private async _fetchWorkspaceTier(workspaceId: string): Promise<string> {
    try {
      const { rows } = await pool.query(
        `SELECT subscription_tier FROM workspaces WHERE id=$1 LIMIT 1`,
        [workspaceId]
      );
      return (rows[0]?.subscription_tier ?? 'free').toLowerCase();
    } catch {
      return 'free';
    }
  }

  private _modelPrefix(modelName: string): 'gemini' | 'claude' | 'gpt' {
    const n = modelName.toLowerCase();
    if (n.includes('gemini')) return 'gemini';
    if (n.includes('claude')) return 'claude';
    return 'gpt';
  }

  private _daysLeftInPeriod(): number {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return lastDay.getDate() - today.getDate();
  }

  private async _checkSoftCaps(
    workspaceId: string,
    tier: string,
    period: UsagePeriodRow,
    addedTokensK: number
  ): Promise<void> {
    const limits = AI_TIER_LIMITS[tier as keyof typeof AI_TIER_LIMITS];
    if (!limits?.softCapK) return;

    const { rows } = await pool.query(
      `SELECT * FROM workspace_ai_periods WHERE id=$1`, [period.id]
    );
    const u = rows[0];
    if (!u) return;

    const currentK = Number(u.total_tokens_k);
    const softK = Number(u.soft_cap_tokens_k);
    const pct = currentK / softK;

    const thresholds = [
      { pct: 0.8, col: 'soft_cap_80pct_sent_at', label: '80%', event: 'ai_usage_80pct' },
      { pct: 0.9, col: 'soft_cap_90pct_sent_at', label: '90%', event: 'ai_usage_90pct' },
      { pct: 1.0, col: 'soft_cap_100pct_sent_at', label: '100%', event: 'ai_usage_at_cap' },
    ];

    for (const t of thresholds) {
      if (pct >= t.pct && !u[t.col]) {
        log.warn(`[AiMetering] ${workspaceId} hit ${t.label} of AI token budget (tier: ${tier})`);

        await pool.query(
          `UPDATE workspace_ai_periods SET ${t.col}=NOW() WHERE id=$1`,
          [period.id]
        );

        try {
          const ownerRow = await pool.query<{ owner_id: string }>(
            `SELECT owner_id FROM workspaces WHERE id=$1 LIMIT 1`,
            [workspaceId]
          );
          const ownerId = ownerRow.rows[0]?.owner_id;
          if (ownerId) {
            const { NotificationDeliveryService } = await import('../notificationDeliveryService');
            await NotificationDeliveryService.send({
              workspaceId,
              type: t.event as import('../notificationDeliveryService').NotificationDeliveryType,
              recipientUserId: ownerId,
              channel: 'in_app',
              subject: `Trinity AI Usage at ${t.label} of Monthly Budget`,
              body: {
                event: t.event,
                percentUsed: Math.round(pct * 100),
                currentTokensK: Math.round(currentK),
                softCapK: softK,
                tier,
                overageRateCents: limits.overagePer100kTokensCents,
                daysLeftInPeriod: this._daysLeftInPeriod(),
              },
              idempotencyKey: `${t.event}-${workspaceId}-${period.id}`,
            });
          }
        } catch (err: unknown) {
          log.warn('[AiMetering] notification send error:', (err as any)?.message);
        }
      }
    }
  }
}

export const aiMeteringService = new AiMeteringServiceImpl();
