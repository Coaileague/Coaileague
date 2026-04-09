import crypto from 'crypto';
import { db } from "../../db";
import { systemAuditLogs, workspaces } from "@shared/schema";
import { eq, and, gte, lte, sql, desc, lt } from "drizzle-orm";
import { eventBus } from "../trinity/eventBus";
import { platformEventBus } from "../platformEventBus";
import { createLogger } from '../../lib/logger';
const log = createLogger('costMonitor');

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CostCalculation {
  actualUsdCost: number;
  creditsCharged: number;
  profitMarginPct: number;
  isProfitable: boolean;
  isLowMargin: boolean;
}

export interface PreflightResult {
  allowed: boolean;
  estimatedCost: number;
  requiredCredits: number;
  currentCredits: number;
  exceedsTokenLimit: boolean;
  tokenLimit: number;
  estimatedTokens: number;
  additionalCreditsNeeded: number;
  reason?: string;
}

export interface OperationStats {
  operationType: string;
  totalOperations: number;
  totalCost: number;
  totalRevenue: number;
  avgMargin: number;
  unprofitableCount: number;
}

export interface UnprofitableCompany {
  workspaceId: string;
  workspaceName: string;
  totalCost: number;
  totalRevenue: number;
  totalLoss: number;
  operationCount: number;
  avgMargin: number;
  recommendation: string;
}

export interface CreditAdjustment {
  operationType: string;
  currentCredits: number;
  recommendedCredits: number;
  avgActualCost: number;
  avgMargin: number;
  reason: string;
}

const API_PRICING = {
  gemini: {
    inputPer1M: 0.075,
    outputPer1M: 0.30,
    model: 'gemini-2.5-flash',
  },
  geminiPro: {
    inputPer1M: 1.25,
    outputPer1M: 5.00,
    model: 'gemini-2.5-pro',
  },
  claude: {
    inputPer1M: 3.00,
    outputPer1M: 15.00,
    model: 'claude-sonnet-4-6',
  },
  claudeHaiku: {
    inputPer1M: 1.00,
    outputPer1M: 5.00,
    model: 'claude-haiku-4-5',
  },
};

const TOKEN_LIMITS: Record<string, number> = {
  rfp_generation: 50000,
  capability_statement: 40000,
  compliance_analysis: 30000,
  ai_migration: 25000,
  ai_analytics_report: 20000,
  ai_predictions: 20000,
  ai_scheduling: 15000,
  ai_schedule_optimization: 15000,
  ai_payroll_processing: 15000,
  ai_invoice_generation: 10000,
  verification: 10000,
  ai_invoice_review: 8000,
  ai_payroll_verification: 8000,
  ai_email_generation: 5000,
  ai_shift_extraction: 5000,
  ai_shift_matching: 5000,
  ai_email_classification: 3000,
  ai_match_approval: 3000,
  ai_chat_query: 5000,
  chatbot_query: 5000,
  default: 10000,
};

const CREDIT_TO_USD = 0.01;
const TARGET_MARGIN = 0.20;
const LOW_MARGIN_THRESHOLD = 0.10;

class AICostMonitorService {
  calculateAPICost(
    ai: 'gemini' | 'geminiPro' | 'claude' | 'claudeOpus',
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = API_PRICING[ai] || API_PRICING.gemini;
    const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M;
    const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M;
    return inputCost + outputCost;
  }

  calculateMargin(creditsCharged: number, actualCostUsd: number): number {
    const revenueUsd = creditsCharged * CREDIT_TO_USD;
    if (revenueUsd === 0) return -100;
    return ((revenueUsd - actualCostUsd) / revenueUsd) * 100;
  }

  calculateCost(
    ai: 'gemini' | 'geminiPro' | 'claude' | 'claudeOpus',
    inputTokens: number,
    outputTokens: number,
    creditsCharged: number
  ): CostCalculation {
    const actualUsdCost = this.calculateAPICost(ai, inputTokens, outputTokens);
    const profitMarginPct = this.calculateMargin(creditsCharged, actualUsdCost);
    
    return {
      actualUsdCost,
      creditsCharged,
      profitMarginPct,
      isProfitable: profitMarginPct >= 0,
      isLowMargin: profitMarginPct >= 0 && profitMarginPct < (LOW_MARGIN_THRESHOLD * 100),
    };
  }

  getTokenLimit(operationType: string): number {
    return TOKEN_LIMITS[operationType] || TOKEN_LIMITS.default;
  }

  enforceTokenLimit(operationType: string, estimatedTokens: number): { 
    allowed: boolean; 
    limit: number; 
    excess: number;
    additionalCreditsNeeded: number;
  } {
    const limit = this.getTokenLimit(operationType);
    const excess = Math.max(0, estimatedTokens - limit);
    const additionalCreditsNeeded = excess > 0 ? Math.ceil((excess / 10000) * 5) : 0;
    
    return {
      allowed: estimatedTokens <= limit,
      limit,
      excess,
      additionalCreditsNeeded,
    };
  }

  async checkProfitability(
    operationType: string,
    estimatedTokens: number,
    creditsToCharge: number,
    ai: 'gemini' | 'geminiPro' | 'claude' | 'claudeOpus',
    workspaceId: string
  ): Promise<PreflightResult> {
    const tokenCheck = this.enforceTokenLimit(operationType, estimatedTokens);
    
    const estimatedInputTokens = Math.floor(estimatedTokens * 0.7);
    const estimatedOutputTokens = Math.floor(estimatedTokens * 0.3);
    const estimatedCost = this.calculateAPICost(ai, estimatedInputTokens, estimatedOutputTokens);
    
    const revenueUsd = creditsToCharge * CREDIT_TO_USD;
    const expectedMargin = ((revenueUsd - estimatedCost) / revenueUsd) * 100;
    
    let currentCredits = 0;
    try {
      const workspace = await db.query.workspaces.findFirst({
        where: eq(workspaces.id, workspaceId),
      });
      currentCredits = workspace?.aiCredits || 0;
    } catch (error) {
      log.warn('[CostMonitor] Failed to fetch workspace credits:', error);
    }

    const totalCreditsNeeded = creditsToCharge + tokenCheck.additionalCreditsNeeded;
    const hasEnoughCredits = currentCredits >= totalCreditsNeeded;

    if (expectedMargin < 0) {
      return {
        allowed: false,
        estimatedCost,
        requiredCredits: totalCreditsNeeded,
        currentCredits,
        exceedsTokenLimit: !tokenCheck.allowed,
        tokenLimit: tokenCheck.limit,
        estimatedTokens,
        additionalCreditsNeeded: tokenCheck.additionalCreditsNeeded,
        reason: `Operation would be unprofitable. Est. cost: $${estimatedCost.toFixed(4)}, Revenue: $${revenueUsd.toFixed(4)}`,
      };
    }

    if (!hasEnoughCredits) {
      return {
        allowed: false,
        estimatedCost,
        requiredCredits: totalCreditsNeeded,
        currentCredits,
        exceedsTokenLimit: !tokenCheck.allowed,
        tokenLimit: tokenCheck.limit,
        estimatedTokens,
        additionalCreditsNeeded: totalCreditsNeeded - currentCredits,
        reason: `Insufficient credits. Required: ${totalCreditsNeeded}, Available: ${currentCredits}`,
      };
    }

    if (!tokenCheck.allowed && tokenCheck.additionalCreditsNeeded > 0) {
      return {
        allowed: true,
        estimatedCost,
        requiredCredits: totalCreditsNeeded,
        currentCredits,
        exceedsTokenLimit: true,
        tokenLimit: tokenCheck.limit,
        estimatedTokens,
        additionalCreditsNeeded: tokenCheck.additionalCreditsNeeded,
        reason: `Exceeds token limit. Additional ${tokenCheck.additionalCreditsNeeded} credits required for overage.`,
      };
    }

    return {
      allowed: true,
      estimatedCost,
      requiredCredits: creditsToCharge,
      currentCredits,
      exceedsTokenLimit: false,
      tokenLimit: tokenCheck.limit,
      estimatedTokens,
      additionalCreditsNeeded: 0,
    };
  }

  async logActualCost(
    actionLogId: string | number,
    ai: 'gemini' | 'geminiPro' | 'claude' | 'claudeOpus',
    inputTokens: number,
    outputTokens: number,
    creditsCharged: number,
    workspaceId: string,
    operationType: string
  ): Promise<CostCalculation> {
    const cost = this.calculateCost(ai, inputTokens, outputTokens, creditsCharged);

    try {
      await db.insert(systemAuditLogs).values({
        id: `cost-${Date.now()}-${crypto.randomUUID().slice(0, 9)}`,
        workspaceId,
        userId: 'system',
        action: 'ai_cost_log',
        createdAt: new Date(),
        metadata: { resourceType: 'ai_operation', resourceId: String(actionLogId), severity: cost.isProfitable ? 'info' : 'error',
        metadata: {
          ai,
          operationType,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          actualUsdCost: cost.actualUsdCost,
          creditsCharged,
          profitMarginPct: cost.profitMarginPct,
          isProfitable: cost.isProfitable,
          isLowMargin: cost.isLowMargin,
          timestamp: new Date().toISOString(),
        } },
      });
    } catch (error) {
      log.error('[CostMonitor] Failed to log cost:', error);
    }

    if (!cost.isProfitable) {
      this.alertUnprofitableOperation(workspaceId, operationType, cost, inputTokens + outputTokens);
    } else if (cost.isLowMargin) {
      this.alertLowMargin(workspaceId, operationType, cost);
    }

    return cost;
  }

  alertUnprofitableOperation(
    workspaceId: string,
    operationType: string,
    cost: CostCalculation,
    totalTokens: number
  ): void {
    const loss = (cost.actualUsdCost - (cost.creditsCharged * CREDIT_TO_USD)).toFixed(4);
    log.error(`🚨 [CostMonitor] UNPROFITABLE OPERATION DETECTED!`);
    log.error(`   Workspace: ${workspaceId}`);
    log.error(`   Operation: ${operationType}`);
    log.error(`   Tokens: ${totalTokens}`);
    log.error(`   Actual Cost: $${cost.actualUsdCost.toFixed(4)}`);
    log.error(`   Credits Charged: ${cost.creditsCharged} ($${(cost.creditsCharged * CREDIT_TO_USD).toFixed(4)})`);
    log.error(`   LOSS: $${loss}`);
    log.error(`   Margin: ${cost.profitMarginPct.toFixed(2)}%`);

    platformEventBus.publish({
      type: 'ai_cost_alert',
      workspaceId,
      title: 'Unprofitable AI Operation Detected',
      description: `Operation "${operationType}" cost $${cost.actualUsdCost.toFixed(4)} but only charged ${cost.creditsCharged} credits — loss: $${loss} (margin: ${cost.profitMarginPct.toFixed(2)}%)`,
      category: 'system',
      priority: 8,
      metadata: { alertType: 'unprofitable', operationType, loss: parseFloat(loss), margin: cost.profitMarginPct },
    }).catch(() => null);
  }

  alertLowMargin(
    workspaceId: string,
    operationType: string,
    cost: CostCalculation
  ): void {
    log.warn(`⚠️ [CostMonitor] Low margin operation`);
    log.warn(`   Workspace: ${workspaceId}`);
    log.warn(`   Operation: ${operationType}`);
    log.warn(`   Margin: ${cost.profitMarginPct.toFixed(2)}% (target: ${TARGET_MARGIN * 100}%)`);

    platformEventBus.publish({
      type: 'ai_cost_alert',
      workspaceId,
      title: 'Low-Margin AI Operation Warning',
      description: `Operation "${operationType}" returned only ${cost.profitMarginPct.toFixed(2)}% margin (target: ${(100 * 0.3).toFixed(0)}%). Monitor credit pricing for this operation type.`,
      category: 'system',
      priority: 5,
      metadata: { alertType: 'low_margin', operationType, margin: cost.profitMarginPct },
    }).catch(() => null);
  }

  async getOperationStats(days: number = 7): Promise<OperationStats[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await db
      .select()
      .from(systemAuditLogs)
      .where(
        and(
          eq(systemAuditLogs.actorType, 'ai_cost_log'),
          gte(systemAuditLogs.createdAt, startDate)
        )
      );

    const statsByType: Record<string, OperationStats> = {};

    for (const log of logs) {
      const metadata = log.metadata as any;
      if (!metadata?.operationType) continue;

      const opType = metadata.operationType;
      if (!statsByType[opType]) {
        statsByType[opType] = {
          operationType: opType,
          totalOperations: 0,
          totalCost: 0,
          totalRevenue: 0,
          avgMargin: 0,
          unprofitableCount: 0,
        };
      }

      statsByType[opType].totalOperations++;
      statsByType[opType].totalCost += metadata.actualUsdCost || 0;
      statsByType[opType].totalRevenue += (metadata.creditsCharged || 0) * CREDIT_TO_USD;
      if (!metadata.isProfitable) {
        statsByType[opType].unprofitableCount++;
      }
    }

    for (const opType in statsByType) {
      const stats = statsByType[opType];
      if (stats.totalRevenue > 0) {
        stats.avgMargin = ((stats.totalRevenue - stats.totalCost) / stats.totalRevenue) * 100;
      }
    }

    return Object.values(statsByType).sort((a, b) => a.avgMargin - b.avgMargin);
  }

  async getUnprofitableCompanies(days: number = 7): Promise<UnprofitableCompany[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await db
      .select()
      .from(systemAuditLogs)
      .where(
        and(
          eq(systemAuditLogs.actorType, 'ai_cost_log'),
          gte(systemAuditLogs.createdAt, startDate)
        )
      );

    const byWorkspace: Record<string, {
      totalCost: number;
      totalRevenue: number;
      operationCount: number;
    }> = {};

    for (const log of logs) {
      const metadata = log.metadata as any;
      const wsId = log.workspaceId;
      if (!wsId) continue;

      if (!byWorkspace[wsId]) {
        byWorkspace[wsId] = { totalCost: 0, totalRevenue: 0, operationCount: 0 };
      }

      byWorkspace[wsId].totalCost += metadata.actualUsdCost || 0;
      byWorkspace[wsId].totalRevenue += (metadata.creditsCharged || 0) * CREDIT_TO_USD;
      byWorkspace[wsId].operationCount++;
    }

    const unprofitable: UnprofitableCompany[] = [];

    for (const [wsId, data] of Object.entries(byWorkspace)) {
      const margin = data.totalRevenue > 0 
        ? ((data.totalRevenue - data.totalCost) / data.totalRevenue) * 100 
        : -100;

      if (margin < 0) {
        let workspaceName = wsId;
        try {
          const ws = await db.query.workspaces.findFirst({
            where: eq(workspaces.id, wsId),
          });
          workspaceName = ws?.name || wsId;
        } catch (wsError) {
          log.warn('[CostMonitor] Failed to fetch workspace name:', wsError);
        }

        const loss = data.totalCost - data.totalRevenue;
        let recommendation = 'Upgrade tier or reduce AI usage';
        if (loss > 10) recommendation = 'URGENT: Suspend AI access or require tier upgrade';
        else if (loss > 5) recommendation = 'Contact for tier upgrade discussion';
        else if (loss > 1) recommendation = 'Monitor closely, suggest credit purchase';

        unprofitable.push({
          workspaceId: wsId,
          workspaceName,
          totalCost: data.totalCost,
          totalRevenue: data.totalRevenue,
          totalLoss: loss,
          operationCount: data.operationCount,
          avgMargin: margin,
          recommendation,
        });
      }
    }

    return unprofitable.sort((a, b) => b.totalLoss - a.totalLoss);
  }

  async recommendCreditAdjustments(days: number = 30): Promise<CreditAdjustment[]> {
    const stats = await this.getOperationStats(days);
    const adjustments: CreditAdjustment[] = [];

    for (const stat of stats) {
      if (stat.totalOperations < 5) continue;

      const avgCostPerOp = stat.totalCost / stat.totalOperations;
      const avgRevenuePerOp = stat.totalRevenue / stat.totalOperations;
      const currentCreditsPerOp = avgRevenuePerOp / CREDIT_TO_USD;

      if (stat.avgMargin < 0) {
        const targetRevenue = avgCostPerOp / (1 - TARGET_MARGIN);
        const recommendedCredits = Math.ceil(targetRevenue / CREDIT_TO_USD);
        adjustments.push({
          operationType: stat.operationType,
          currentCredits: Math.round(currentCreditsPerOp),
          recommendedCredits,
          avgActualCost: avgCostPerOp,
          avgMargin: stat.avgMargin,
          reason: `LOSING MONEY: Avg loss $${(avgCostPerOp - avgRevenuePerOp).toFixed(4)} per operation`,
        });
      } else if (stat.avgMargin < TARGET_MARGIN * 100) {
        const targetRevenue = avgCostPerOp / (1 - TARGET_MARGIN);
        const recommendedCredits = Math.ceil(targetRevenue / CREDIT_TO_USD);
        adjustments.push({
          operationType: stat.operationType,
          currentCredits: Math.round(currentCreditsPerOp),
          recommendedCredits,
          avgActualCost: avgCostPerOp,
          avgMargin: stat.avgMargin,
          reason: `Below target margin: ${stat.avgMargin.toFixed(1)}% vs ${TARGET_MARGIN * 100}% target`,
        });
      } else if (stat.avgMargin > 50) {
        const targetRevenue = avgCostPerOp / (1 - TARGET_MARGIN);
        const recommendedCredits = Math.ceil(targetRevenue / CREDIT_TO_USD);
        if (currentCreditsPerOp > recommendedCredits * 1.5) {
          adjustments.push({
            operationType: stat.operationType,
            currentCredits: Math.round(currentCreditsPerOp),
            recommendedCredits,
            avgActualCost: avgCostPerOp,
            avgMargin: stat.avgMargin,
            reason: `Potentially over-charging: ${stat.avgMargin.toFixed(1)}% margin (may discourage usage)`,
          });
        }
      }
    }

    return adjustments.sort((a, b) => a.avgMargin - b.avgMargin);
  }

  async getHealthSummary(): Promise<{
    overallMargin: number;
    totalCostToday: number;
    totalRevenueToday: number;
    totalCostWeek: number;
    totalRevenueWeek: number;
    totalCostMonth: number;
    totalRevenueMonth: number;
    isProfitable: boolean;
    alertLevel: 'healthy' | 'warning' | 'critical';
    unprofitableOperationsToday: number;
    lowMarginOperationsToday: number;
  }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(monthStart.getDate() - 30);

    const logs = await db
      .select()
      .from(systemAuditLogs)
      .where(
        and(
          eq(systemAuditLogs.actorType, 'ai_cost_log'),
          gte(systemAuditLogs.createdAt, monthStart)
        )
      );

    let totalCostToday = 0, totalRevenueToday = 0;
    let totalCostWeek = 0, totalRevenueWeek = 0;
    let totalCostMonth = 0, totalRevenueMonth = 0;
    let unprofitableToday = 0, lowMarginToday = 0;

    for (const log of logs) {
      const metadata = log.metadata as any;
      const cost = metadata.actualUsdCost || 0;
      const revenue = (metadata.creditsCharged || 0) * CREDIT_TO_USD;
      const logDate = new Date(log.createdAt!);

      totalCostMonth += cost;
      totalRevenueMonth += revenue;

      if (logDate >= weekStart) {
        totalCostWeek += cost;
        totalRevenueWeek += revenue;
      }

      if (logDate >= todayStart) {
        totalCostToday += cost;
        totalRevenueToday += revenue;
        if (!metadata.isProfitable) unprofitableToday++;
        if (metadata.isLowMargin) lowMarginToday++;
      }
    }

    const overallMargin = totalRevenueMonth > 0 
      ? ((totalRevenueMonth - totalCostMonth) / totalRevenueMonth) * 100 
      : 0;

    let alertLevel: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (overallMargin < 0) alertLevel = 'critical';
    else if (overallMargin < TARGET_MARGIN * 100) alertLevel = 'warning';

    return {
      overallMargin,
      totalCostToday,
      totalRevenueToday,
      totalCostWeek,
      totalRevenueWeek,
      totalCostMonth,
      totalRevenueMonth,
      isProfitable: overallMargin >= 0,
      alertLevel,
      unprofitableOperationsToday: unprofitableToday,
      lowMarginOperationsToday: lowMarginToday,
    };
  }

  async getRecentAlerts(limit: number = 20): Promise<Array<{
    type: 'unprofitable' | 'low_margin';
    workspaceId: string;
    operationType: string;
    timestamp: string;
    details: any;
  }>> {
    const logs = await db
      .select()
      .from(systemAuditLogs)
      .where(eq(systemAuditLogs.actorType, 'ai_cost_log'))
      .orderBy(desc(systemAuditLogs.createdAt))
      .limit(limit * 3);

    const alerts: Array<{
      type: 'unprofitable' | 'low_margin';
      workspaceId: string;
      operationType: string;
      timestamp: string;
      details: any;
    }> = [];

    for (const log of logs) {
      const metadata = log.metadata as any;
      if (!metadata.isProfitable) {
        alerts.push({
          type: 'unprofitable',
          workspaceId: log.workspaceId || 'unknown',
          operationType: metadata.operationType || 'unknown',
          timestamp: log.createdAt?.toISOString() || '',
          details: metadata,
        });
      } else if (metadata.isLowMargin) {
        alerts.push({
          type: 'low_margin',
          workspaceId: log.workspaceId || 'unknown',
          operationType: metadata.operationType || 'unknown',
          timestamp: log.createdAt?.toISOString() || '',
          details: metadata,
        });
      }
      if (alerts.length >= limit) break;
    }

    return alerts;
  }
}

export const aiCostMonitor = new AICostMonitorService();
