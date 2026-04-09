/**
 * Advanced Usage Analytics Service
 * Provides comprehensive credit tracking, AI usage breakdown, and ROI metrics for business owners
 */

import { db } from "../db";
import { BILLING } from '../config/platformConfig';
import {
  users,
  employees,
  workspaces,
  aiWorkboardTasks,
} from '@shared/schema';
import { creditManager } from "./billing/creditManager";
import { eq, and, gte, lte, sql, count, sum, avg, desc, asc, ne } from "drizzle-orm";

export interface CreditUsageSummary {
  currentBalance: number;
  lifetimePurchased: number;
  lifetimeUsed: number;
  averageDailyUsage: number;
  projectedDaysRemaining: number;
  lowBalanceWarning: boolean;
  lastPurchaseDate: string | null;
  lastUsageDate: string | null;
}

export interface CreditTransaction {
  id: string;
  type: string;
  credits: number;
  balanceAfter: number;
  description: string;
  actionType: string | null;
  createdAt: string;
}

export interface UsageByCategory {
  category: string;
  creditsUsed: number;
  transactionCount: number;
  percentageOfTotal: number;
}

export interface DailyUsageTrend {
  date: string;
  creditsUsed: number;
  transactionCount: number;
  aiTasksCompleted: number;
}

export interface AITaskAnalytics {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  totalCreditsUsed: number;
  averageCreditsPerTask: number;
  fastModeTasks: number;
  normalModeTasks: number;
  topAgentsByUsage: { agentName: string; taskCount: number; creditsUsed: number }[];
}

export interface ROIMetrics {
  totalCreditsSpent: number;
  estimatedHoursSaved: number;
  estimatedLaborCostSaved: number;
  costPerHourSaved: number;
  automationROI: number;
  topValueFeatures: { feature: string; usage: number; estimatedValue: number }[];
}

export interface AdvancedUsageReport {
  period: string;
  periodStart: string;
  periodEnd: string;
  creditSummary: CreditUsageSummary;
  usageByCategory: UsageByCategory[];
  dailyTrends: DailyUsageTrend[];
  aiTaskAnalytics: AITaskAnalytics;
  roiMetrics: ROIMetrics;
  recentTransactions: CreditTransaction[];
}

interface DateRange {
  startDate: Date;
  endDate: Date;
}

function getDateRange(preset: string): DateRange {
  const now = new Date();
  let startDate: Date;
  let endDate = new Date(now);
  
  switch (preset) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'this_week':
      const dayOfWeek = now.getDay();
      startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this_month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'last_month':
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0);
      break;
    case 'this_quarter':
      const quarter = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case 'this_year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last_7_days':
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      break;
    case 'last_30_days':
    default:
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      break;
  }
  
  return { startDate, endDate };
}

class AdvancedUsageAnalyticsService {
  private static instance: AdvancedUsageAnalyticsService;
  
  private constructor() {}
  
  public static getInstance(): AdvancedUsageAnalyticsService {
    if (!AdvancedUsageAnalyticsService.instance) {
      AdvancedUsageAnalyticsService.instance = new AdvancedUsageAnalyticsService();
    }
    return AdvancedUsageAnalyticsService.instance;
  }

  async getCreditSummary(workspaceId: string): Promise<CreditUsageSummary> {
    const creditRecord = await creditManager.getCreditsAccount(workspaceId);

    if (!creditRecord) {
      return {
        currentBalance: 0,
        lifetimePurchased: 0,
        lifetimeUsed: 0,
        averageDailyUsage: 0,
        projectedDaysRemaining: 0,
        lowBalanceWarning: true,
        lastPurchaseDate: null,
        lastUsageDate: null
      };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // credit_transactions table dropped (Phase 16)
    const usageStats = { totalUsage: 0, transactionCount: 0 };

    const averageDailyUsage = (usageStats?.totalUsage || 0) / 30;
    const projectedDaysRemaining = averageDailyUsage > 0 
      ? Math.floor(creditRecord.currentBalance / averageDailyUsage) 
      : 999;

    return {
      currentBalance: creditRecord.currentBalance,
      lifetimePurchased: creditRecord.totalCreditsEarned || 0,
      lifetimeUsed: creditRecord.totalCreditsSpent || 0,
      averageDailyUsage: Math.round(averageDailyUsage * 10) / 10,
      projectedDaysRemaining,
      lowBalanceWarning: creditRecord.currentBalance < (creditRecord.lowBalanceAlertThreshold || 50),
      lastPurchaseDate: null,
      lastUsageDate: creditRecord.lastUsedAt?.toISOString() || null
    };
  }

  async getUsageByCategory(workspaceId: string, period: string): Promise<UsageByCategory[]> {
    const { startDate, endDate } = getDateRange(period);

    // credit_transactions table dropped (Phase 16)
    return [];
  }

  async getDailyUsageTrends(workspaceId: string, period: string): Promise<DailyUsageTrend[]> {
    const { startDate, endDate } = getDateRange(period);

    // credit_transactions table dropped (Phase 16)
    const dailyUsage: Array<{ date: string; creditsUsed: number; transactionCount: number }> = [];

    const dailyTasks = await db.select({
      date: sql<string>`DATE(${aiWorkboardTasks.completedAt})`,
      taskCount: count()
    })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        eq(aiWorkboardTasks.status, 'completed'),
        gte(aiWorkboardTasks.completedAt, startDate),
        lte(aiWorkboardTasks.completedAt, endDate)
      ))
      .groupBy(sql`DATE(${aiWorkboardTasks.completedAt})`);

    const taskMap = new Map(dailyTasks.map(t => [t.date, Number(t.taskCount)]));

    return dailyUsage.map(day => ({
      date: day.date,
      creditsUsed: day.creditsUsed || 0,
      transactionCount: Number(day.transactionCount) || 0,
      aiTasksCompleted: taskMap.get(day.date) || 0
    }));
  }

  async getAITaskAnalytics(workspaceId: string, period: string): Promise<AITaskAnalytics> {
    const { startDate, endDate } = getDateRange(period);

    const [taskStats] = await db.select({
      totalTasks: count(),
      completedTasks: sql<number>`SUM(CASE WHEN ${aiWorkboardTasks.status} = 'completed' THEN 1 ELSE 0 END)`,
      failedTasks: sql<number>`SUM(CASE WHEN ${aiWorkboardTasks.status} = 'failed' THEN 1 ELSE 0 END)`,
      fastModeTasks: sql<number>`SUM(CASE WHEN ${aiWorkboardTasks.executionMode} = 'trinity_fast' THEN 1 ELSE 0 END)`,
      normalModeTasks: sql<number>`SUM(CASE WHEN ${aiWorkboardTasks.executionMode} = 'normal' OR ${aiWorkboardTasks.executionMode} IS NULL THEN 1 ELSE 0 END)`,
      totalCreditsUsed: sql<number>`COALESCE(SUM(${aiWorkboardTasks.fastModeCredits}), 0)`
    })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        gte(aiWorkboardTasks.createdAt, startDate),
        lte(aiWorkboardTasks.createdAt, endDate)
      ));

    const topAgents = await db.select({
      agentName: aiWorkboardTasks.assignedAgentId,
      taskCount: count(),
      creditsUsed: sql<number>`COALESCE(SUM(${aiWorkboardTasks.fastModeCredits}), 0)`
    })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        gte(aiWorkboardTasks.createdAt, startDate),
        lte(aiWorkboardTasks.createdAt, endDate)
      ))
      .groupBy(aiWorkboardTasks.assignedAgentId)
      .orderBy(desc(count()))
      .limit(5);

    const total = Number(taskStats?.totalTasks) || 0;
    const completed = Number(taskStats?.completedTasks) || 0;

    return {
      totalTasks: total,
      completedTasks: completed,
      failedTasks: Number(taskStats?.failedTasks) || 0,
      successRate: total > 0 ? Math.round(completed / total * 100) : 0,
      totalCreditsUsed: Number(taskStats?.totalCreditsUsed) || 0,
      averageCreditsPerTask: total > 0 ? Math.round((taskStats?.totalCreditsUsed || 0) / total * 10) / 10 : 0,
      fastModeTasks: Number(taskStats?.fastModeTasks) || 0,
      normalModeTasks: Number(taskStats?.normalModeTasks) || 0,
      topAgentsByUsage: topAgents.map(a => ({
        agentName: a.agentName || 'Unknown',
        taskCount: Number(a.taskCount) || 0,
        creditsUsed: Number(a.creditsUsed) || 0
      }))
    };
  }

  async getROIMetrics(workspaceId: string, period: string): Promise<ROIMetrics> {
    const { startDate, endDate } = getDateRange(period);

    const { aiUsageEvents } = await import('@shared/schema');
    const [creditUsage] = await db.select({
      totalSpent: sql<number>`COALESCE(SUM(${aiUsageEvents.creditsDeducted}), 0)::int`
    })
      .from(aiUsageEvents)
      .where(and(
        eq(aiUsageEvents.workspaceId, workspaceId),
        gte(aiUsageEvents.createdAt, startDate),
        lte(aiUsageEvents.createdAt, endDate)
      ));

    const [taskMetrics] = await db.select({
      completedTasks: sql<number>`SUM(CASE WHEN ${aiWorkboardTasks.status} = 'completed' THEN 1 ELSE 0 END)`
    })
      .from(aiWorkboardTasks)
      .where(and(
        eq(aiWorkboardTasks.workspaceId, workspaceId),
        gte(aiWorkboardTasks.createdAt, startDate),
        lte(aiWorkboardTasks.createdAt, endDate)
      ));

    const totalCreditsSpent = Number(creditUsage?.totalSpent) || 0;
    const completedTasks = Number(taskMetrics?.completedTasks) || 0;
    const estimatedMinutesPerTask = 15;
    const estimatedHoursSaved = Math.round(completedTasks * estimatedMinutesPerTask / 60 * 10) / 10;
    const averageHourlyRate = 50;
    const estimatedLaborCostSaved = Math.round(estimatedHoursSaved * averageHourlyRate);
    const creditCostInDollars = totalCreditsSpent * BILLING.creditsToUsdRate;
    const costPerHourSaved = estimatedHoursSaved > 0 ? Math.round(creditCostInDollars / estimatedHoursSaved * 100) / 100 : 0;
    const automationROI = creditCostInDollars > 0 ? Math.round((estimatedLaborCostSaved - creditCostInDollars) / creditCostInDollars * 100) : 0;

    return {
      totalCreditsSpent,
      estimatedHoursSaved,
      estimatedLaborCostSaved,
      costPerHourSaved,
      automationROI,
      topValueFeatures: [
        { feature: 'AI Task Automation', usage: completedTasks, estimatedValue: Math.round(completedTasks * estimatedMinutesPerTask / 60 * averageHourlyRate) },
        { feature: 'Empire Mode Insights', usage: 0, estimatedValue: 0 },
        { feature: 'Fast Mode Processing', usage: 0, estimatedValue: 0 }
      ]
    };
  }

  async getRecentTransactions(workspaceId: string, limit: number = 20): Promise<CreditTransaction[]> {
    const history = await creditManager.getTransactionHistory(workspaceId, limit);
    return history.map(t => ({
      id: t.id,
      type: (t as any).transactionType || 'deduction',
      credits: (t as any).amount ?? 0,
      balanceAfter: (t as any).balanceAfter ?? 0,
      description: (t as any).description || '',
      actionType: t.featureKey,
      createdAt: t.createdAt?.toISOString?.() || new Date().toISOString(),
    }));
  }

  async getFullReport(workspaceId: string, period: string = 'last_30_days'): Promise<AdvancedUsageReport> {
    const { startDate, endDate } = getDateRange(period);

    const [
      creditSummary,
      usageByCategory,
      dailyTrends,
      aiTaskAnalytics,
      roiMetrics,
      recentTransactions
    ] = await Promise.all([
      this.getCreditSummary(workspaceId),
      this.getUsageByCategory(workspaceId, period),
      this.getDailyUsageTrends(workspaceId, period),
      this.getAITaskAnalytics(workspaceId, period),
      this.getROIMetrics(workspaceId, period),
      this.getRecentTransactions(workspaceId, 20)
    ]);

    return {
      period,
      periodStart: startDate.toISOString(),
      periodEnd: endDate.toISOString(),
      creditSummary,
      usageByCategory,
      dailyTrends,
      aiTaskAnalytics,
      roiMetrics,
      recentTransactions
    };
  }
}

export const advancedUsageAnalyticsService = AdvancedUsageAnalyticsService.getInstance();
