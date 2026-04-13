/**
 * TRINITY COST SERVICE  (Phase 10-4)
 * ====================================
 * Tracks per-execution API costs for every Trinity skill invocation, persists
 * them to `trinity_execution_costs`, and provides aggregation queries for the
 * P&L integration layer.
 *
 * Pricing is aligned with costMonitor.ts (per-1M token rates).  The per-call
 * flat fee ($0.01) covers infrastructure overhead (routing, logging, retry).
 *
 * INTEGRATION POINTS:
 *  - trinityExecutionCosts  (schema: shared/schema/domains/trinity/extended.ts)
 *  - costMonitor.ts         (canonical API_PRICING, reused here)
 *  - pAndLCostIntegrationService.ts  (consumes monthly aggregates)
 */

import { db } from '../../db';
import {
  trinityExecutionCosts,
  type InsertTrinityExecutionCosts,
} from '@shared/schema/domains/trinity/extended';
import { eq, and, gte, lte, sql, desc, sum, count } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('trinityCostService');

// ── Pricing model (per-1M tokens) ──────────────────────────────────────────
// Canonical source: keep in sync with costMonitor.ts API_PRICING
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gemini-2.5-flash':    { inputPer1M: 0.075,  outputPer1M: 0.30 },
  'gemini-2.5-pro':      { inputPer1M: 1.25,   outputPer1M: 5.00 },
  'claude-sonnet-4-6':   { inputPer1M: 3.00,   outputPer1M: 15.00 },
  'claude-haiku-4-5':    { inputPer1M: 1.00,   outputPer1M: 5.00 },
  'gpt-4o':              { inputPer1M: 2.50,   outputPer1M: 10.00 },
  'gpt-4o-mini':         { inputPer1M: 0.15,   outputPer1M: 0.60 },
};

const DEFAULT_PRICING = { inputPer1M: 1.00, outputPer1M: 5.00 };
const PER_CALL_FEE_USD = 0.01;

// ── Typical token profiles per skill ────────────────────────────────────────
const SKILL_TOKEN_PROFILES: Record<string, { input: number; output: number }> = {
  autonomous_scheduling:  { input: 800,  output: 240 },
  email_send:             { input: 1200, output: 760 },
  crisis_escalation:      { input: 1800, output: 1390 },
  ai_chat_query:          { input: 600,  output: 400 },
  ai_scheduling:          { input: 1000, output: 500 },
  compliance_analysis:    { input: 2000, output: 1000 },
  ai_invoice_generation:  { input: 800,  output: 600 },
};

// ── Public types ────────────────────────────────────────────────────────────

export interface ExecutionCostRecord {
  workspaceId: string;
  skillKey: string;
  taskId?: string;
  sessionId?: string;
  provider: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  responseTimeMs?: number;
  success?: boolean;
  errorMessage?: string;
}

export interface CostBreakdownBySkill {
  skillKey: string;
  executionCount: number;
  totalCostUsd: number;
  avgCostUsd: number;
}

export interface CostBreakdownByModel {
  modelId: string;
  provider: string;
  executionCount: number;
  totalCostUsd: number;
  avgCostUsd: number;
}

export interface MonthlyCostSummary {
  workspaceId: string;
  month: string;          // 'YYYY-MM'
  totalExecutions: number;
  totalCostUsd: number;
  bySkill: CostBreakdownBySkill[];
  byModel: CostBreakdownByModel[];
}

// ── Service ─────────────────────────────────────────────────────────────────

class TrinityCostService {

  /**
   * Calculate the USD cost of a single API call from token counts.
   */
  calculateCost(
    modelId: string,
    inputTokens: number,
    outputTokens: number,
  ): { inputCostUsd: number; outputCostUsd: number; apiCallCostUsd: number; totalCostUsd: number } {
    const pricing = MODEL_PRICING[modelId] ?? DEFAULT_PRICING;
    const inputCostUsd  = (inputTokens / 1_000_000)  * pricing.inputPer1M;
    const outputCostUsd = (outputTokens / 1_000_000) * pricing.outputPer1M;
    const totalCostUsd  = inputCostUsd + outputCostUsd + PER_CALL_FEE_USD;

    return {
      inputCostUsd,
      outputCostUsd,
      apiCallCostUsd: PER_CALL_FEE_USD,
      totalCostUsd,
    };
  }

  /**
   * Record a Trinity skill execution and its computed cost.
   */
  async recordExecution(record: ExecutionCostRecord): Promise<void> {
    const totalTokens = record.inputTokens + record.outputTokens;
    const cost = this.calculateCost(record.modelId, record.inputTokens, record.outputTokens);

    const row: InsertTrinityExecutionCosts = {
      workspaceId:   record.workspaceId,
      skillKey:      record.skillKey,
      taskId:        record.taskId ?? null,
      sessionId:     record.sessionId ?? null,
      provider:      record.provider,
      modelId:       record.modelId,
      inputTokens:   record.inputTokens,
      outputTokens:  record.outputTokens,
      totalTokens,
      inputCostUsd:   cost.inputCostUsd.toFixed(8),
      outputCostUsd:  cost.outputCostUsd.toFixed(8),
      apiCallCostUsd: cost.apiCallCostUsd.toFixed(8),
      totalCostUsd:   cost.totalCostUsd.toFixed(8),
      responseTimeMs: record.responseTimeMs ?? 0,
      success:        record.success ?? true,
      errorMessage:   record.errorMessage ?? null,
      executedAt:     new Date(),
    };

    try {
      await db.insert(trinityExecutionCosts).values(row);
    } catch (err) {
      log.error('[TrinityCostService] Failed to record execution cost:', err);
    }
  }

  /**
   * Get the estimated cost for a skill execution (pre-flight).
   */
  estimateSkillCost(skillKey: string, modelId: string): number {
    const profile = SKILL_TOKEN_PROFILES[skillKey] ?? { input: 800, output: 400 };
    const cost = this.calculateCost(modelId, profile.input, profile.output);
    return cost.totalCostUsd;
  }

  /**
   * Aggregate costs for a workspace within a date range, broken down by skill.
   */
  async getCostBySkill(
    workspaceId: string,
    start: Date,
    end: Date,
  ): Promise<CostBreakdownBySkill[]> {
    const rows = await db
      .select({
        skillKey: trinityExecutionCosts.skillKey,
        executionCount: count().as('execution_count'),
        totalCostUsd: sum(trinityExecutionCosts.totalCostUsd).as('total_cost_usd'),
      })
      .from(trinityExecutionCosts)
      .where(
        and(
          eq(trinityExecutionCosts.workspaceId, workspaceId),
          gte(trinityExecutionCosts.executedAt, start),
          lte(trinityExecutionCosts.executedAt, end),
        ),
      )
      .groupBy(trinityExecutionCosts.skillKey);

    return rows.map((r) => ({
      skillKey: r.skillKey,
      executionCount: Number(r.executionCount),
      totalCostUsd: parseFloat(String(r.totalCostUsd ?? '0')),
      avgCostUsd:
        Number(r.executionCount) > 0
          ? parseFloat(String(r.totalCostUsd ?? '0')) / Number(r.executionCount)
          : 0,
    }));
  }

  /**
   * Aggregate costs for a workspace within a date range, broken down by model.
   */
  async getCostByModel(
    workspaceId: string,
    start: Date,
    end: Date,
  ): Promise<CostBreakdownByModel[]> {
    const rows = await db
      .select({
        modelId: trinityExecutionCosts.modelId,
        provider: trinityExecutionCosts.provider,
        executionCount: count().as('execution_count'),
        totalCostUsd: sum(trinityExecutionCosts.totalCostUsd).as('total_cost_usd'),
      })
      .from(trinityExecutionCosts)
      .where(
        and(
          eq(trinityExecutionCosts.workspaceId, workspaceId),
          gte(trinityExecutionCosts.executedAt, start),
          lte(trinityExecutionCosts.executedAt, end),
        ),
      )
      .groupBy(trinityExecutionCosts.modelId, trinityExecutionCosts.provider);

    return rows.map((r) => ({
      modelId: r.modelId,
      provider: r.provider,
      executionCount: Number(r.executionCount),
      totalCostUsd: parseFloat(String(r.totalCostUsd ?? '0')),
      avgCostUsd:
        Number(r.executionCount) > 0
          ? parseFloat(String(r.totalCostUsd ?? '0')) / Number(r.executionCount)
          : 0,
    }));
  }

  /**
   * Monthly cost summary for a workspace (used by P&L integration).
   */
  async getMonthlySummary(
    workspaceId: string,
    year: number,
    month: number,
  ): Promise<MonthlyCostSummary> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const [bySkill, byModel] = await Promise.all([
      this.getCostBySkill(workspaceId, start, end),
      this.getCostByModel(workspaceId, start, end),
    ]);

    const totalExecutions = bySkill.reduce((s, r) => s + r.executionCount, 0);
    const totalCostUsd = bySkill.reduce((s, r) => s + r.totalCostUsd, 0);

    return {
      workspaceId,
      month: monthStr,
      totalExecutions,
      totalCostUsd,
      bySkill,
      byModel,
    };
  }

  /**
   * Total Trinity API cost across ALL workspaces for a month (platform-level).
   */
  async getPlatformMonthlyCost(year: number, month: number): Promise<number> {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const [row] = await db
      .select({
        total: sum(trinityExecutionCosts.totalCostUsd).as('total'),
      })
      .from(trinityExecutionCosts)
      .where(
        and(
          gte(trinityExecutionCosts.executedAt, start),
          lte(trinityExecutionCosts.executedAt, end),
        ),
      );

    return parseFloat(String(row?.total ?? '0'));
  }
}

export const trinityCostService = new TrinityCostService();
