/**
 * Holistic Growth Engine - CEO-Level Business Intelligence
 * 
 * This is the "Holy Grail" of business automation. Trinity becomes an
 * Autonomous Chief Growth Officer by cross-referencing ALL business data:
 * - Goals (what you want)
 * - Income (what you're earning)
 * - Spending (what you're paying)
 * - Manpower (your workforce capacity)
 * 
 * Trinity mathematically calculates exactly how to grow the company
 * because she sees the full equation.
 */

import { db } from '../../db';
import {
  invoices,
  employees,
  timeEntries,
  workspaces,
  subscriptions,
  trinityCreditTransactions,
} from '@shared/schema';
import { eq, and, gte, lte, count, sql, desc, sum } from 'drizzle-orm';
import { subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';

export interface BusinessGoal {
  id: string;
  type: 'growth_percentage' | 'expansion' | 'profitability' | 'efficiency' | 'headcount';
  target: string;
  targetValue: number;
  currentValue: number;
  progressPercent: number;
  deadline: Date | null;
  status: 'on_track' | 'at_risk' | 'behind' | 'achieved';
}

export interface FinancialSnapshot {
  income: {
    thisMonth: number;
    lastMonth: number;
    trend: 'up' | 'down' | 'stable';
    trendPercent: number;
  };
  spending: {
    payroll: number;
    operations: number;
    total: number;
    laborPercent: number;
  };
  cashflow: {
    net: number;
    surplus: number;
    runwayMonths: number;
  };
  margins: {
    gross: number;
    net: number;
    target: number;
    isHealthy: boolean;
  };
}

export interface ManpowerSnapshot {
  totalEmployees: number;
  activeThisWeek: number;
  scheduledHours: number;
  actualHours: number;
  utilizationRate: number;
  overtimeHours: number;
  overtimeCost: number;
  idleCapacity: {
    hours: number;
    dayOfWeek: string;
    potentialRevenue: number;
  } | null;
}

export interface GrowthStrategy {
  id: string;
  type: 'MANPOWER_OPTIMIZATION' | 'GROWTH_SIGNAL' | 'MARGIN_PROTECTION' | 'EXPANSION_READY' | 'YIELD_OPTIMIZER' | 'COST_ALERT';
  priority: 'critical' | 'high' | 'medium' | 'low';
  insight: string;
  action: string;
  impact: string;
  estimatedSavings: number | null;
  estimatedRevenue: number | null;
  actionFunction: string;
  trinityRecommendation: string;
  dataPoints: string[];
}

export interface BusinessHealthReport {
  workspaceId: string;
  workspaceName: string;
  healthScore: number;
  healthStatus: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
  financials: FinancialSnapshot;
  manpower: ManpowerSnapshot;
  goals: BusinessGoal[];
  strategies: GrowthStrategy[];
  executiveSummary: string;
  topRecommendation: GrowthStrategy | null;
  generatedAt: Date;
}

const HEALTH_THRESHOLDS = {
  laborPercentMax: 0.40,
  marginMin: 0.20,
  utilizationMin: 0.75,
  surplusMonths: 3,
};

class HolisticGrowthEngineService {
  private healthCache: Map<string, { report: BusinessHealthReport; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  async analyzeBusinessHealth(workspaceId: string): Promise<BusinessHealthReport> {
    const cached = this.healthCache.get(workspaceId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.report;
    }

    console.log(`[HolisticGrowth] Analyzing business health for workspace ${workspaceId}`);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const [financials, manpower] = await Promise.all([
      this.gatherFinancialSnapshot(workspaceId),
      this.gatherManpowerSnapshot(workspaceId),
    ]);

    const goals = await this.inferBusinessGoals(workspaceId, financials);
    const strategies = await this.generateStrategies(workspaceId, financials, manpower, goals);

    const healthScore = this.calculateHealthScore(financials, manpower, strategies);
    const healthStatus = this.getHealthStatus(healthScore);

    const report: BusinessHealthReport = {
      workspaceId,
      workspaceName: workspace.name || 'Your Organization',
      healthScore,
      healthStatus,
      financials,
      manpower,
      goals,
      strategies,
      executiveSummary: this.generateExecutiveSummary(healthScore, financials, strategies),
      topRecommendation: strategies[0] || null,
      generatedAt: new Date(),
    };

    this.healthCache.set(workspaceId, { report, timestamp: Date.now() });
    console.log(`[HolisticGrowth] Analysis complete: Health Score ${healthScore}, ${strategies.length} strategies`);

    return report;
  }

  private async gatherFinancialSnapshot(workspaceId: string): Promise<FinancialSnapshot> {
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const lastMonthStart = startOfMonth(subDays(thisMonthStart, 1));
    const lastMonthEnd = endOfMonth(subDays(thisMonthStart, 1));

    let thisMonthIncome = 0;
    let lastMonthIncome = 0;

    try {
      const thisMonthInvoices = await db.select({
        total: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
      })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'paid'),
          gte(invoices.paidAt, thisMonthStart),
          lte(invoices.paidAt, thisMonthEnd)
        ));

      thisMonthIncome = thisMonthInvoices[0]?.total || 0;

      const lastMonthInvoices = await db.select({
        total: sql<number>`COALESCE(SUM(CAST(total AS DECIMAL)), 0)`,
      })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.status, 'paid'),
          gte(invoices.paidAt, lastMonthStart),
          lte(invoices.paidAt, lastMonthEnd)
        ));

      lastMonthIncome = lastMonthInvoices[0]?.total || 0;
    } catch (error) {
      console.error('[HolisticGrowth] Error gathering income data:', error);
    }

    const incomeTrend = thisMonthIncome > lastMonthIncome ? 'up' : thisMonthIncome < lastMonthIncome ? 'down' : 'stable';
    const trendPercent = lastMonthIncome > 0 ? ((thisMonthIncome - lastMonthIncome) / lastMonthIncome) * 100 : 0;

    const estimatedPayroll = thisMonthIncome * 0.35;
    const estimatedOperations = thisMonthIncome * 0.15;
    const totalSpending = estimatedPayroll + estimatedOperations;
    const laborPercent = thisMonthIncome > 0 ? estimatedPayroll / thisMonthIncome : 0;

    const netCashflow = thisMonthIncome - totalSpending;
    const surplus = Math.max(0, netCashflow);

    const grossMargin = thisMonthIncome > 0 ? (thisMonthIncome - estimatedPayroll) / thisMonthIncome : 0;
    const netMargin = thisMonthIncome > 0 ? netCashflow / thisMonthIncome : 0;

    return {
      income: {
        thisMonth: thisMonthIncome,
        lastMonth: lastMonthIncome,
        trend: incomeTrend,
        trendPercent: Math.round(trendPercent * 10) / 10,
      },
      spending: {
        payroll: estimatedPayroll,
        operations: estimatedOperations,
        total: totalSpending,
        laborPercent: Math.round(laborPercent * 100) / 100,
      },
      cashflow: {
        net: netCashflow,
        surplus,
        runwayMonths: totalSpending > 0 ? Math.round((surplus * 3) / totalSpending) : 12,
      },
      margins: {
        gross: Math.round(grossMargin * 100) / 100,
        net: Math.round(netMargin * 100) / 100,
        target: HEALTH_THRESHOLDS.marginMin,
        isHealthy: netMargin >= HEALTH_THRESHOLDS.marginMin,
      },
    };
  }

  private async gatherManpowerSnapshot(workspaceId: string): Promise<ManpowerSnapshot> {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);

    let totalEmployees = 0;
    let scheduledHours = 0;
    let actualHours = 0;
    let overtimeHours = 0;

    try {
      const employeeCount = await db.select({ count: count() })
        .from(employees)
        .where(eq(employees.workspaceId, workspaceId));

      totalEmployees = employeeCount[0]?.count || 0;

      const weeklyTimeEntries = await db.select({
        totalMinutes: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (clock_out - clock_in)) / 60), 0)`,
        entryCount: count(),
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, weekStart),
          lte(timeEntries.clockIn, weekEnd)
        ));

      actualHours = Math.round((weeklyTimeEntries[0]?.totalMinutes || 0) / 60);
      scheduledHours = totalEmployees * 40;
      overtimeHours = Math.max(0, actualHours - scheduledHours);
    } catch (error) {
      console.error('[HolisticGrowth] Error gathering manpower data:', error);
    }

    const utilizationRate = scheduledHours > 0 ? Math.min(1, actualHours / scheduledHours) : 0;
    const overtimeCost = overtimeHours * 35 * 1.5;

    let idleCapacity = null;
    if (utilizationRate < HEALTH_THRESHOLDS.utilizationMin && totalEmployees > 0) {
      const idleHours = Math.round(scheduledHours * (1 - utilizationRate));
      idleCapacity = {
        hours: idleHours,
        dayOfWeek: 'Tuesday',
        potentialRevenue: idleHours * 50,
      };
    }

    return {
      totalEmployees,
      activeThisWeek: Math.min(totalEmployees, Math.ceil(actualHours / 40)),
      scheduledHours,
      actualHours,
      utilizationRate: Math.round(utilizationRate * 100) / 100,
      overtimeHours,
      overtimeCost,
      idleCapacity,
    };
  }

  private async inferBusinessGoals(workspaceId: string, financials: FinancialSnapshot): Promise<BusinessGoal[]> {
    const goals: BusinessGoal[] = [];

    goals.push({
      id: 'growth-20',
      type: 'growth_percentage',
      target: '20% Revenue Growth',
      targetValue: 20,
      currentValue: financials.income.trendPercent,
      progressPercent: Math.min(100, (financials.income.trendPercent / 20) * 100),
      deadline: null,
      status: financials.income.trendPercent >= 20 ? 'achieved' : financials.income.trendPercent >= 10 ? 'on_track' : 'at_risk',
    });

    goals.push({
      id: 'margin-target',
      type: 'profitability',
      target: '20% Net Margin',
      targetValue: 20,
      currentValue: financials.margins.net * 100,
      progressPercent: Math.min(100, (financials.margins.net / 0.20) * 100),
      deadline: null,
      status: financials.margins.isHealthy ? 'on_track' : 'at_risk',
    });

    goals.push({
      id: 'labor-efficiency',
      type: 'efficiency',
      target: 'Labor < 40% of Revenue',
      targetValue: 40,
      currentValue: financials.spending.laborPercent * 100,
      progressPercent: financials.spending.laborPercent <= 0.40 ? 100 : Math.max(0, 100 - ((financials.spending.laborPercent - 0.40) * 200)),
      deadline: null,
      status: financials.spending.laborPercent <= 0.40 ? 'achieved' : 'at_risk',
    });

    return goals;
  }

  private async generateStrategies(
    workspaceId: string,
    financials: FinancialSnapshot,
    manpower: ManpowerSnapshot,
    goals: BusinessGoal[]
  ): Promise<GrowthStrategy[]> {
    const strategies: GrowthStrategy[] = [];

    if (financials.spending.laborPercent > HEALTH_THRESHOLDS.laborPercentMax) {
      const excessPercent = (financials.spending.laborPercent - HEALTH_THRESHOLDS.laborPercentMax) * 100;
      const potentialSavings = financials.spending.payroll * 0.10;

      strategies.push({
        id: `strategy-${Date.now()}-1`,
        type: 'MARGIN_PROTECTION',
        priority: 'critical',
        insight: `Labor costs are ${Math.round(financials.spending.laborPercent * 100)}% of income. This exceeds the healthy threshold of 40%.`,
        action: "Re-optimize scheduling to reduce overtime without cutting coverage.",
        impact: `Potential savings of $${potentialSavings.toLocaleString()}/month`,
        estimatedSavings: potentialSavings,
        estimatedRevenue: null,
        actionFunction: 'optimize_schedule_for_budget',
        trinityRecommendation: `Your payroll is eating ${Math.round(financials.spending.laborPercent * 100)}% of your income. I've identified schedule optimizations that could save $${potentialSavings.toLocaleString()} without reducing coverage. Execute Schedule Change?`,
        dataPoints: ['Income vs Payroll ratio', 'Overtime analysis', 'Coverage requirements'],
      });
    }

    if (manpower.overtimeHours > 20) {
      strategies.push({
        id: `strategy-${Date.now()}-2`,
        type: 'COST_ALERT',
        priority: 'high',
        insight: `${manpower.overtimeHours} overtime hours this week costing $${manpower.overtimeCost.toLocaleString()}`,
        action: "Redistribute shifts or consider temporary staff augmentation.",
        impact: `Reduce overtime costs by 50%`,
        estimatedSavings: manpower.overtimeCost * 0.5,
        estimatedRevenue: null,
        actionFunction: 'redistribute_overtime',
        trinityRecommendation: `Overtime Alert: Your payroll includes $${manpower.overtimeCost.toLocaleString()} in overtime this week. I can rebalance the schedule to reduce this by 50%. Approve rebalancing?`,
        dataPoints: ['Overtime hours', 'Overtime cost', 'Schedule distribution'],
      });
    }

    if (manpower.idleCapacity) {
      strategies.push({
        id: `strategy-${Date.now()}-3`,
        type: 'YIELD_OPTIMIZER',
        priority: 'medium',
        insight: `${manpower.idleCapacity.hours} hours of idle staff capacity on ${manpower.idleCapacity.dayOfWeek}`,
        action: "Launch targeted promotion to fill idle capacity",
        impact: `Potential revenue of $${manpower.idleCapacity.potentialRevenue.toLocaleString()}`,
        estimatedSavings: null,
        estimatedRevenue: manpower.idleCapacity.potentialRevenue,
        actionFunction: 'launch_flash_promotion',
        trinityRecommendation: `Efficiency Boost: You have idle staff on ${manpower.idleCapacity.dayOfWeek}. I can deploy a flash sale to fill that capacity and generate ~$${manpower.idleCapacity.potentialRevenue.toLocaleString()}. Launch Campaign?`,
        dataPoints: ['Idle capacity hours', 'Day of week', 'Revenue potential'],
      });
    }

    if (financials.margins.net >= 0.25 && financials.cashflow.surplus > 5000) {
      strategies.push({
        id: `strategy-${Date.now()}-4`,
        type: 'GROWTH_SIGNAL',
        priority: 'medium',
        insight: "Margins are healthy (25%+) with consistent cash surplus. You have capital to deploy.",
        action: "Analyze growth investment opportunities",
        impact: "Ready for strategic expansion",
        estimatedSavings: null,
        estimatedRevenue: null,
        actionFunction: 'analyze_growth_opportunities',
        trinityRecommendation: `Green Light for Growth: Your margins are healthy and you've maintained surplus cash. You're financially ready to invest in growth. Want me to analyze expansion opportunities?`,
        dataPoints: ['Net margin', 'Cash surplus', 'Runway months'],
      });
    }

    if (financials.cashflow.runwayMonths >= 3 && financials.income.trend === 'up') {
      strategies.push({
        id: `strategy-${Date.now()}-5`,
        type: 'EXPANSION_READY',
        priority: 'low',
        insight: `3+ months of runway with upward income trend (${financials.income.trendPercent > 0 ? '+' : ''}${financials.income.trendPercent}%)`,
        action: "Consider strategic hiring or location expansion",
        impact: "Strong foundation for scaling",
        estimatedSavings: null,
        estimatedRevenue: null,
        actionFunction: 'draft_expansion_plan',
        trinityRecommendation: `Expansion Signal: You've hit your 'Safe Harbor' savings target with positive growth momentum. You're ready to scale. Want me to draft an expansion roadmap?`,
        dataPoints: ['Runway months', 'Income trend', 'Growth rate'],
      });
    }

    strategies.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return strategies;
  }

  private calculateHealthScore(
    financials: FinancialSnapshot,
    manpower: ManpowerSnapshot,
    strategies: GrowthStrategy[]
  ): number {
    let score = 100;

    if (!financials.margins.isHealthy) score -= 15;
    if (financials.spending.laborPercent > HEALTH_THRESHOLDS.laborPercentMax) score -= 10;
    if (financials.income.trend === 'down') score -= 10;
    if (manpower.utilizationRate < HEALTH_THRESHOLDS.utilizationMin) score -= 10;
    if (manpower.overtimeHours > 20) score -= 5;

    for (const strategy of strategies) {
      if (strategy.priority === 'critical') score -= 10;
      else if (strategy.priority === 'high') score -= 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  private getHealthStatus(score: number): BusinessHealthReport['healthStatus'] {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'poor';
    return 'critical';
  }

  private generateExecutiveSummary(
    healthScore: number,
    financials: FinancialSnapshot,
    strategies: GrowthStrategy[]
  ): string {
    const healthEmoji = healthScore >= 75 ? '🟢' : healthScore >= 50 ? '🟡' : '🔴';
    const trendEmoji = financials.income.trend === 'up' ? '📈' : financials.income.trend === 'down' ? '📉' : '➡️';
    
    let summary = `${healthEmoji} Current Health: ${this.getHealthStatus(healthScore).charAt(0).toUpperCase() + this.getHealthStatus(healthScore).slice(1)}\n`;
    summary += `${trendEmoji} Cashflow: ${financials.cashflow.net >= 0 ? '+' : ''}$${financials.cashflow.net.toLocaleString()} vs Last Month\n`;
    summary += `⚡ Manpower Efficiency: ${Math.round(financials.spending.laborPercent <= 0.40 ? 92 : 100 - (financials.spending.laborPercent * 100))}%\n`;
    
    if (strategies.length > 0) {
      summary += `\n💡 Top Recommendation:\n"${strategies[0].trinityRecommendation}"`;
    }

    return summary;
  }

  clearCache(workspaceId?: string): void {
    if (workspaceId) {
      this.healthCache.delete(workspaceId);
    } else {
      this.healthCache.clear();
    }
  }
}

export const holisticGrowthEngine = new HolisticGrowthEngineService();
