/**
 * Trinity Token Metering Service — Phase 16A
 * ============================================
 * Tracks every Trinity AI token consumed per workspace and records
 * billable cost to the trinity_token_ledger table.
 *
 * FREE TENANTS (zero cost, recorded with should_bill=FALSE):
 *   1. Platform/system workspaces — detected via isBillingExcluded()
 *   2. Grandfathered founding tenant — GRANDFATHERED_TENANT_ID env var
 *
 * No UUID or company name is hardcoded here. All identity resolution
 * comes from billingConstants (TRINITY.md Section I).
 */

import { pool } from '../../db';
import { createLogger } from '../../lib/logger';
import { isBillingExcluded, GRANDFATHERED_TENANT_ID } from './billingConstants';
import { registerLegacyBootstrap } from '../legacyBootstrapRegistry';

const log = createLogger('TrinityTokenMetering');

export type TokenModel = 'claude' | 'gemini' | 'openai' | 'pinecone';

export interface TrackTokenParams {
  workspaceId: string;
  userId?: string;
  endUserId?: string;
  feature: string;
  model: TokenModel;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  timestamp: Date;
  operationId: string;
}

export interface TrackedTokenUsage extends TrackTokenParams {
  shouldBill: boolean;
  costUsd: number;
}

// Cost per 1K tokens for each model
export const TOKEN_COSTS: Record<TokenModel, number> = {
  claude: 0.003,    // $3 per 1M tokens
  gemini: 0.0005,   // $0.50 per 1M tokens
  openai: 0.002,    // $2 per 1M tokens
  pinecone: 0.10,   // $0.10 per 1K vector queries
};

/**
 * Returns true when a workspace should NOT be billed for Trinity tokens.
 * Covers platform/system workspaces (isBillingExcluded) and the grandfathered tenant.
 */
export function isFreeForTrinity(workspaceId: string): boolean {
  if (isBillingExcluded(workspaceId)) return true;
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return true;
  return false;
}

/**
 * Calculate token cost: (tokens / 1000) * cost_per_1k
 */
export function calculateTokenCost(tokens: number, model: TokenModel): number {
  return (tokens / 1000) * TOKEN_COSTS[model];
}

/**
 * Returns the billing status label for a workspace.
 */
export function getTrinityBillingStatus(workspaceId: string): 'free' | 'billable' | 'grandfathered' {
  if (GRANDFATHERED_TENANT_ID && workspaceId === GRANDFATHERED_TENANT_ID) return 'grandfathered';
  if (isBillingExcluded(workspaceId)) return 'free';
  return 'billable';
}

// Bootstrap: create the table if it does not yet exist.
// The Drizzle schema definition in shared/schema/domains/billing/extended.ts
// is the canonical source; this bootstrap is a safety net for deployments
// where db:push has not yet run.
registerLegacyBootstrap('trinity_token_ledger', async (bootstrapPool) => {
  await bootstrapPool.query(`
    CREATE TABLE IF NOT EXISTS trinity_token_ledger (
      id            VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id  VARCHAR NOT NULL,
      user_id       VARCHAR,
      end_user_id   VARCHAR,
      feature       TEXT NOT NULL,
      model         TEXT NOT NULL,
      input_tokens  INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      total_tokens  INTEGER NOT NULL,
      cost_usd      DECIMAL(10,4) NOT NULL DEFAULT 0,
      timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      operation_id  TEXT NOT NULL,
      should_bill   BOOLEAN NOT NULL DEFAULT TRUE,
      billed        BOOLEAN NOT NULL DEFAULT FALSE,
      invoice_id    TEXT,
      billed_at     TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT trinity_token_ledger_operation_id_unique UNIQUE (operation_id)
    )
  `);
  await bootstrapPool.query(`
    CREATE INDEX IF NOT EXISTS trinity_token_ledger_workspace_idx
      ON trinity_token_ledger (workspace_id)
  `);
  await bootstrapPool.query(`
    CREATE INDEX IF NOT EXISTS trinity_token_ledger_timestamp_idx
      ON trinity_token_ledger (timestamp)
  `);
  await bootstrapPool.query(`
    CREATE INDEX IF NOT EXISTS trinity_token_ledger_billing_idx
      ON trinity_token_ledger (billed, should_bill)
  `);
});

export class TrinityTokenMeteringService {
  /**
   * Record one Trinity AI token usage event.
   * Determines billing eligibility, calculates cost, and writes to ledger.
   */
  async trackTokenUsage(params: TrackTokenParams): Promise<TrackedTokenUsage> {
    const shouldBill = !isFreeForTrinity(params.workspaceId);
    const costUsd = shouldBill ? calculateTokenCost(params.totalTokens, params.model) : 0;

    const usage: TrackedTokenUsage = { ...params, shouldBill, costUsd };

    try {
      await pool.query(`
        INSERT INTO trinity_token_ledger
          (workspace_id, user_id, end_user_id, feature, model,
           input_tokens, output_tokens, total_tokens, cost_usd,
           timestamp, operation_id, should_bill, billed)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (operation_id) DO NOTHING
      `, [
        params.workspaceId,
        params.userId ?? null,
        params.endUserId ?? null,
        params.feature,
        params.model,
        params.inputTokens,
        params.outputTokens,
        params.totalTokens,
        costUsd,
        params.timestamp,
        params.operationId,
        shouldBill,
        !shouldBill, // free tenants: mark billed immediately (no invoice needed)
      ]);
    } catch (err: unknown) {
      log.error('[TrinityTokenMetering] insert failed (non-fatal):', (err as any)?.message);
    }

    return usage;
  }

  /**
   * Daily billing report for a workspace.
   */
  async getDailyReport(workspaceId: string, date: Date): Promise<{
    workspaceId: string;
    date: string;
    totalTokens: number;
    totalCostUsd: number;
    byFeature: Record<string, { tokens: number; cost: number; count: number }>;
    byModel: Record<string, { tokens: number; cost: number }>;
    billingStatus: 'free' | 'billable' | 'grandfathered';
  }> {
    const dateStr = date.toISOString().split('T')[0];
    const { rows } = await pool.query(`
      SELECT feature, model,
             SUM(total_tokens) AS tokens,
             SUM(cost_usd)     AS cost,
             COUNT(*)          AS cnt
      FROM trinity_token_ledger
      WHERE workspace_id = $1
        AND timestamp >= $2::date
        AND timestamp <  ($2::date + INTERVAL '1 day')
      GROUP BY feature, model
    `, [workspaceId, dateStr]);

    const byFeature: Record<string, { tokens: number; cost: number; count: number }> = {};
    const byModel: Record<string, { tokens: number; cost: number }> = {};
    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const r of rows) {
      const tokens = Number(r.tokens);
      const cost = Number(r.cost);
      const count = Number(r.cnt);

      totalTokens += tokens;
      totalCostUsd += cost;

      if (!byFeature[r.feature]) byFeature[r.feature] = { tokens: 0, cost: 0, count: 0 };
      byFeature[r.feature].tokens += tokens;
      byFeature[r.feature].cost += cost;
      byFeature[r.feature].count += count;

      if (!byModel[r.model]) byModel[r.model] = { tokens: 0, cost: 0 };
      byModel[r.model].tokens += tokens;
      byModel[r.model].cost += cost;
    }

    return {
      workspaceId,
      date: dateStr,
      totalTokens,
      totalCostUsd,
      byFeature,
      byModel,
      billingStatus: getTrinityBillingStatus(workspaceId),
    };
  }

  /**
   * Monthly billing report for a workspace.
   */
  async getMonthlyReport(workspaceId: string, year: number, month: number): Promise<{
    workspaceId: string;
    period: string;
    totalTokens: number;
    totalCostUsd: number;
    days: Array<{ date: string; tokens: number; cost: number }>;
    billingStatus: 'free' | 'billable' | 'grandfathered';
  }> {
    const periodStr = `${year}-${String(month).padStart(2, '0')}`;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);

    const { rows } = await pool.query(`
      SELECT DATE(timestamp AT TIME ZONE 'UTC') AS day,
             SUM(total_tokens) AS tokens,
             SUM(cost_usd)     AS cost
      FROM trinity_token_ledger
      WHERE workspace_id = $1
        AND timestamp >= $2
        AND timestamp <  $3
      GROUP BY DATE(timestamp AT TIME ZONE 'UTC')
      ORDER BY day
    `, [workspaceId, startDate.toISOString(), endDate.toISOString()]);

    const days = rows.map(r => ({
      date: r.day instanceof Date ? r.day.toISOString().split('T')[0] : String(r.day),
      tokens: Number(r.tokens),
      cost: Number(r.cost),
    }));

    return {
      workspaceId,
      period: periodStr,
      totalTokens: days.reduce((s, d) => s + d.tokens, 0),
      totalCostUsd: days.reduce((s, d) => s + d.cost, 0),
      days,
      billingStatus: getTrinityBillingStatus(workspaceId),
    };
  }

  /**
   * All unbilled token usage for a workspace (for invoice generation).
   */
  async getUnbilledUsage(workspaceId: string): Promise<{
    totalTokens: number;
    totalCostUsd: number;
    count: number;
    oldestTimestamp: Date | null;
  }> {
    const { rows } = await pool.query(`
      SELECT SUM(total_tokens) AS tokens,
             SUM(cost_usd)     AS cost,
             COUNT(*)          AS cnt,
             MIN(timestamp)    AS oldest
      FROM trinity_token_ledger
      WHERE workspace_id = $1
        AND should_bill = TRUE
        AND billed      = FALSE
    `, [workspaceId]);

    const r = rows[0];
    return {
      totalTokens: Number(r?.tokens ?? 0),
      totalCostUsd: Number(r?.cost ?? 0),
      count: Number(r?.cnt ?? 0),
      oldestTimestamp: r?.oldest ? new Date(r.oldest) : null,
    };
  }

  /**
   * Mark a set of operations as billed and attach an invoice ID.
   */
  async markAsBilled(workspaceId: string, invoiceId: string, operationIds: string[]): Promise<void> {
    if (operationIds.length === 0) return;

    const placeholders = operationIds.map((_, i) => `$${i + 3}`).join(',');
    await pool.query(`
      UPDATE trinity_token_ledger
      SET billed = TRUE, invoice_id = $1, billed_at = NOW()
      WHERE workspace_id = $2
        AND operation_id IN (${placeholders})
    `, [invoiceId, workspaceId, ...operationIds]);
  }
}

export const trinityTokenMeteringService = new TrinityTokenMeteringService();
