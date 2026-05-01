/**
 * PROFIT/LOSS SERVICE
 * ====================
 * Comprehensive P&L dashboard service for Financial Intelligence feature.
 * 
 * Key Features:
 * - Real-time P&L calculations from invoices, payroll, expenses
 * - Per-client profitability analysis
 * - AI-powered insights using meteredGemini (subscriber-pays-all)
 * - Integration with existing TrinityQuickBooksSnapshot
 * - Caching via financialSnapshots table
 * 
 * Credit Billing: All AI operations use tokenManager with workspace billing
 */

import { db } from '../../db';
import { eq, and, gte, lte, desc, sql, sum, count, avg, isNotNull, or } from 'drizzle-orm';
import {
  invoices,
  invoiceLineItems,
  payrollRuns,
  payrollEntries,
  expenses,
  expenseCategories,
  clients,
  employees,
  timeEntries,
  workspaces,
  financialSnapshots,
  clientProfitability,
  financialAlerts,
  type InsertFinancialSnapshot,
  type InsertClientProfitability,
  type InsertFinancialAlert,
  type FinancialSnapshot,
  type ClientProfitability,
  type FinancialAlert,
} from '@shared/schema';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { trinityQuickBooksSnapshot } from '../ai-brain/trinityQuickBooksSnapshot';
import { createLogger } from '../../lib/logger';
const log = createLogger('profitLossService');


export type PeriodGranularity = 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'custom';

export interface PLSummary {
  periodStart: Date;
  periodEnd: Date;
  granularity: PeriodGranularity;
  
  revenueTotal: number;
  payrollTotal: number;
  expenseTotal: number;
  grossProfit: number;
  netProfit: number;
  marginPercent: number;
  
  invoicedAmount: number;
  collectedAmount: number;
  outstandingAmount: number;
  
  expenseBreakdown: {
    payroll: number;
    overtime: number;
    benefits: number;
    insurance: number;
    equipment: number;
    admin: number;
    other: number;
  };
  
  comparison?: {
    previousPeriod: Partial<PLSummary>;
    variance: {
      revenue: number;
      profit: number;
      margin: number;
    };
  };
  
  aiInsights: string[];
  alerts: FinancialAlertSummary[];
  
  quickbooksStatus: 'connected' | 'disconnected' | 'expired' | 'not_configured';
  lastUpdated: Date;
}

export interface ClientProfitabilitySummary {
  clientId: string;
  clientName: string;
  revenue: number;
  laborCost: number;
  directExpenses: number;
  grossProfit: number;
  marginPercent: number;
  invoicedHours: number;
  actualHours: number;
  effectiveBillRate: number;
  isUnderperforming: boolean;
  recommendation?: string;
}

export interface FinancialAlertSummary {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  category: string;
  title: string;
  message: string;
  actionSuggestion?: string;
  metricValue?: number;
  detectedAt: Date;
}

class ProfitLossService {
  
  /**
   * Get P&L summary for dashboard widget
   * Caches results in financialSnapshots table
   */
  async getPLSummary(
    workspaceId: string,
    userId: string,
    start: Date,
    end: Date,
    granularity: PeriodGranularity = 'monthly'
  ): Promise<PLSummary> {
    const validStart = start instanceof Date && !isNaN(start.getTime()) ? start : new Date();
    const validEnd = end instanceof Date && !isNaN(end.getTime()) ? end : new Date();
    
    log.info('[P&L Service] getPLSummary called:', { 
      workspaceId, 
      startType: typeof start, 
      endType: typeof end,
      startValid: start instanceof Date,
      endValid: end instanceof Date,
      validStart: validStart.toISOString(),
      validEnd: validEnd.toISOString()
    });
    
    const cached = await this.getCachedSnapshot(workspaceId, validStart, validEnd, granularity);
    
    if (cached && this.isSnapshotFresh(cached)) {
      return this.formatSnapshotToSummary(cached);
    }
    
    const [revenue, payroll, expenses, qbSnapshot] = await Promise.all([
      this.calculateRevenue(workspaceId, validStart, validEnd),
      this.calculatePayroll(workspaceId, validStart, validEnd),
      this.calculateExpenses(workspaceId, validStart, validEnd),
      trinityQuickBooksSnapshot.getFinancialSnapshot(workspaceId).catch(() => null),
    ]);
    
    const grossProfit = revenue.total - payroll.total;
    const netProfit = grossProfit - expenses.total;
    const marginPercent = revenue.total > 0 ? (netProfit / revenue.total) * 100 : 0;
    
    const snapshot: InsertFinancialSnapshot = {
      workspaceId,
      periodStart: validStart.toISOString().split('T')[0],
      periodEnd: validEnd.toISOString().split('T')[0],
      granularity,
      revenueTotal: revenue.total.toString(),
      payrollTotal: payroll.total.toString(),
      expenseTotal: expenses.total.toString(),
      grossProfit: grossProfit.toString(),
      netProfit: netProfit.toString(),
      marginPercent: marginPercent.toFixed(2),
      invoicedAmount: revenue.invoiced.toString(),
      collectedAmount: revenue.collected.toString(),
      outstandingAmount: revenue.outstanding.toString(),
      overtimeCost: payroll.overtime.toString(),
      benefitsCost: payroll.benefits.toString(),
      insuranceCost: expenses.byCategory.insurance.toString(),
      equipmentCost: expenses.byCategory.equipment.toString(),
      adminCost: expenses.byCategory.admin.toString(),
      source: qbSnapshot ? 'hybrid' : 'platform',
      quickbooksLastSyncAt: qbSnapshot?.timestamp ? new Date(qbSnapshot.timestamp) : null,
      generatedAt: new Date(),
    };
    
    await this.saveSnapshot(snapshot);
    
    const alerts = await this.getActiveAlerts(workspaceId);
    
    return {
      periodStart: validStart,
      periodEnd: validEnd,
      granularity,
      revenueTotal: revenue.total,
      payrollTotal: payroll.total,
      expenseTotal: expenses.total,
      grossProfit,
      netProfit,
      marginPercent: parseFloat(marginPercent.toFixed(2)),
      invoicedAmount: revenue.invoiced,
      collectedAmount: revenue.collected,
      outstandingAmount: revenue.outstanding,
      expenseBreakdown: {
        payroll: payroll.total,
        overtime: payroll.overtime,
        benefits: payroll.benefits,
        insurance: expenses.byCategory.insurance,
        equipment: expenses.byCategory.equipment,
        admin: expenses.byCategory.admin,
        other: expenses.byCategory.other,
      },
      aiInsights: [],
      alerts,
      quickbooksStatus: qbSnapshot?.connectionStatus || 'not_configured',
      lastUpdated: new Date(),
    };
  }
  
  /**
   * Generate AI insights for P&L data
   * Uses meteredGemini with subscriber billing
   */
  async generateAIInsights(
    workspaceId: string,
    userId: string,
    summary: PLSummary
  ): Promise<string[]> {
    try {
      const prompt = this.buildInsightsPrompt(summary);
      
      const response = await meteredGemini.generate({
        workspaceId,
        userId,
        featureKey: 'financial_insights',
        featureName: 'Financial Intelligence Insights',
        prompt,
        model: 'gemini-3-pro',
        thinkingEnabled: true,
      });
      
      if (!response.success || !response.text) {
        log.error('[P&L] AI insights generation failed:', response.error);
        return this.generateFallbackInsights(summary);
      }
      
      const insights = this.parseInsightsResponse(response.text);
      
      await this.updateSnapshotInsights(workspaceId, summary.periodStart, summary.periodEnd, insights);
      
      return insights;
    } catch (error) {
      log.error('[P&L] Error generating AI insights:', error);
      return this.generateFallbackInsights(summary);
    }
  }
  
  /**
   * Get per-client profitability analysis
   */
  async getClientProfitability(
    workspaceId: string,
    userId: string,
    start: Date,
    end: Date
  ): Promise<ClientProfitabilitySummary[]> {
    try {
      log.info('[P&L] getClientProfitability called', { workspaceId });
      
      const clientList = await db
        .select({
          id: clients.id,
          firstName: clients.firstName,
          lastName: clients.lastName,
          companyName: clients.companyName,
        })
        .from(clients)
        .where(eq(clients.workspaceId, workspaceId));
      
      log.info('[P&L] Found clients:', clientList.length);
      
      if (clientList.length === 0) {
        return [];
      }
      
      const profitabilityData = await Promise.all(
        clientList.map(async (client) => {
          try {
            const [revenueData, laborData, hoursData] = await Promise.all([
              this.getClientRevenue(workspaceId, client.id, start, end),
              this.getClientLaborCost(workspaceId, client.id, start, end),
              this.getClientHours(workspaceId, client.id, start, end),
            ]);
            
            const grossProfit = (revenueData?.total || 0) - (laborData?.total || 0);
            const marginPercent = (revenueData?.total || 0) > 0 ? (grossProfit / revenueData.total) * 100 : 0;
            const effectiveBillRate = (hoursData?.invoiced || 0) > 0 ? (revenueData?.total || 0) / hoursData.invoiced : 0;
            
            const isUnderperforming = marginPercent < 15;
            
            const displayName = client.companyName || `${client.firstName} ${client.lastName}`.trim() || 'Unknown';
            return {
              clientId: client.id,
              clientName: displayName,
              revenue: revenueData?.total || 0,
              laborCost: laborData?.total || 0,
              directExpenses: 0,
              grossProfit,
              marginPercent: parseFloat(marginPercent.toFixed(2)),
              invoicedHours: hoursData?.invoiced || 0,
              actualHours: hoursData?.actual || 0,
              effectiveBillRate: parseFloat(effectiveBillRate.toFixed(2)),
              isUnderperforming,
            };
          } catch (clientErr) {
            log.error('[P&L] Error processing client', client.id, clientErr);
            const displayName = client.companyName || `${client.firstName} ${client.lastName}`.trim() || 'Unknown';
            return {
              clientId: client.id,
              clientName: displayName,
              revenue: 0,
              laborCost: 0,
              directExpenses: 0,
              grossProfit: 0,
              marginPercent: 0,
              invoicedHours: 0,
              actualHours: 0,
              effectiveBillRate: 0,
              isUnderperforming: false,
            };
          }
        })
      );
      
      return profitabilityData.sort((a, b) => b.revenue - a.revenue);
    } catch (err) {
      log.error('[P&L] getClientProfitability error:', err);
      return [];
    }
  }
  
  /**
   * Generate AI recommendation for underperforming client
   */
  async generateClientRecommendation(
    workspaceId: string,
    userId: string,
    client: ClientProfitabilitySummary
  ): Promise<string> {
    try {
      const prompt = `Analyze this client contract and provide a brief actionable recommendation:
Client: ${client.clientName}
Revenue: $${client.revenue.toLocaleString()}
Labor Cost: $${client.laborCost.toLocaleString()}
Margin: ${client.marginPercent}%
Effective Bill Rate: $${client.effectiveBillRate}/hour
${client.isUnderperforming ? 'This client is underperforming (below 15% margin target).' : ''}

Provide ONE specific, actionable recommendation in 1-2 sentences.`;

      const response = await meteredGemini.generate({
        workspaceId,
        userId,
        featureKey: 'financial_client_profitability',
        featureName: 'Client Profitability Analysis',
        prompt,
        model: 'gemini-3-pro',
        thinkingEnabled: false,
      });
      
      return response.success && response.text 
        ? response.text.trim()
        : 'Consider reviewing billable rates and overtime allocation for this contract.';
    } catch {
      return 'Consider reviewing billable rates and overtime allocation for this contract.';
    }
  }
  
  /**
   * Get trend data for charts
   */
  async getTrendData(
    workspaceId: string,
    periods: number = 6,
    granularity: PeriodGranularity = 'monthly'
  ): Promise<Array<{
    periodStart: Date;
    periodEnd: Date;
    revenue: number;
    expenses: number;
    profit: number;
    margin: number;
  }>> {
    const now = new Date();
    const trends: Array<{
      periodStart: Date;
      periodEnd: Date;
      revenue: number;
      expenses: number;
      profit: number;
      margin: number;
    }> = [];
    
    for (let i = periods - 1; i >= 0; i--) {
      const { start, end } = this.getPeriodBounds(now, granularity, i);
      const startDateStr = start.toISOString().split('T')[0];
      const endDateStr = end.toISOString().split('T')[0];
      
      const [cached] = await db
        .select()
        .from(financialSnapshots)
        .where(and(
          eq(financialSnapshots.workspaceId, workspaceId),
          eq(financialSnapshots.periodStart, startDateStr),
          eq(financialSnapshots.periodEnd, endDateStr),
        ))
        .limit(1);
      
      if (cached) {
        trends.push({
          periodStart: start,
          periodEnd: end,
          revenue: parseFloat(cached.revenueTotal || '0'),
          expenses: parseFloat(cached.expenseTotal || '0') + parseFloat(cached.payrollTotal || '0'),
          profit: parseFloat(cached.netProfit || '0'),
          margin: parseFloat(cached.marginPercent || '0'),
        });
      } else {
        trends.push({
          periodStart: start,
          periodEnd: end,
          revenue: 0,
          expenses: 0,
          profit: 0,
          margin: 0,
        });
      }
    }
    
    return trends;
  }
  
  /**
   * Create a financial alert
   */
  async createAlert(alert: InsertFinancialAlert): Promise<void> {
    await db.insert(financialAlerts).values(alert);
  }
  
  /**
   * Get active alerts for workspace
   */
  async getActiveAlerts(workspaceId: string): Promise<FinancialAlertSummary[]> {
    const alerts = await db
      .select()
      .from(financialAlerts)
      .where(and(
        eq(financialAlerts.workspaceId, workspaceId),
        eq(financialAlerts.status, 'active'),
      ))
      .orderBy(desc(financialAlerts.detectedAt))
      .limit(10);
    
    return alerts.map(a => ({
      id: a.id,
      severity: a.severity,
      category: a.category,
      title: a.title,
      message: a.message,
      actionSuggestion: a.actionSuggestion || undefined,
      metricValue: a.metricValue ? parseFloat(a.metricValue) : undefined,
      detectedAt: a.detectedAt,
    }));
  }
  
  /**
   * Dismiss an alert
   */
  async dismissAlert(alertId: string, userId: string): Promise<void> {
    await db
      .update(financialAlerts)
      .set({
        status: 'dismissed',
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(eq(financialAlerts.id, alertId));
  }
  
  private async calculateRevenue(workspaceId: string, start: Date, end: Date) {
    log.info('[P&L] calculateRevenue called with:', { workspaceId, start: start?.toISOString?.(), end: end?.toISOString?.() });
    
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    
    try {
      const invoiceData = await db
        .select({
          totalAmount: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
          paidAmount: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} = 'paid' THEN ${invoices.total} ELSE 0 END), 0)`,
          outstandingAmount: sql<string>`COALESCE(SUM(CASE WHEN ${invoices.status} != 'paid' AND ${invoices.status} != 'cancelled' THEN ${invoices.total} ELSE 0 END), 0)`,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate),
        ));
      
      log.info('[P&L] calculateRevenue result:', invoiceData[0]);
      
      return {
        total: parseFloat(invoiceData[0]?.totalAmount || '0'),
        invoiced: parseFloat(invoiceData[0]?.totalAmount || '0'),
        collected: parseFloat(invoiceData[0]?.paidAmount || '0'),
        outstanding: parseFloat(invoiceData[0]?.outstandingAmount || '0'),
      };
    } catch (err) {
      log.error('[P&L] calculateRevenue error:', err);
      return { total: 0, invoiced: 0, collected: 0, outstanding: 0 };
    }
  }
  
  private async calculatePayroll(workspaceId: string, start: Date, end: Date) {
    log.info('[P&L] calculatePayroll called');
    
    try {
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const payrollData = await db
        .select({
          total: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)`,
          overtime: sql<string>`COALESCE(SUM(${(payrollEntries as any).overtimePay}), 0)`,
          regular: sql<string>`COALESCE(SUM(${(payrollEntries as any).regularPay}), 0)`,
        })
        .from(payrollEntries)
        .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
        .where(and(
          eq(payrollRuns.workspaceId, workspaceId),
          gte(payrollRuns.periodStart, startDateStr),
          lte(payrollRuns.periodEnd, endDateStr),
        ));
      
      log.info('[P&L] calculatePayroll result:', payrollData[0]);
      
      return {
        total: parseFloat(payrollData[0]?.total || '0'),
        overtime: parseFloat(payrollData[0]?.overtime || '0'),
        regular: parseFloat(payrollData[0]?.regular || '0'),
        benefits: 0,
      };
    } catch (err) {
      log.error('[P&L] calculatePayroll error:', err);
      return { total: 0, overtime: 0, regular: 0, benefits: 0 };
    }
  }
  
  private async calculateExpenses(workspaceId: string, start: Date, end: Date) {
    log.info('[P&L] calculateExpenses called');
    
    try {
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      const expenseData = await db
        .select({
          category: expenseCategories.name,
          total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
        })
        .from(expenses)
        .leftJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
        .where(and(
          eq(expenses.workspaceId, workspaceId),
          gte(expenses.date, startDateStr),
          lte(expenses.date, endDateStr),
        ))
        .groupBy(expenseCategories.name);
      
      const byCategory: Record<string, number> = {
        insurance: 0,
        equipment: 0,
        admin: 0,
        other: 0,
      };
      
      let total = 0;
      for (const row of expenseData) {
        const amount = parseFloat(row.total || '0');
        total += amount;
        
        const cat = (row.category || '').toLowerCase();
        if (cat.includes('insurance')) {
          byCategory.insurance += amount;
        } else if (cat.includes('equipment') || cat.includes('uniform') || cat.includes('vehicle')) {
          byCategory.equipment += amount;
        } else if (cat.includes('admin') || cat.includes('office') || cat.includes('software')) {
          byCategory.admin += amount;
        } else {
          byCategory.other += amount;
        }
      }
      
      log.info('[P&L] calculateExpenses result:', { total, byCategory });
      return { total, byCategory };
    } catch (err) {
      log.error('[P&L] calculateExpenses error:', err);
      return { total: 0, byCategory: { insurance: 0, equipment: 0, admin: 0, other: 0 } };
    }
  }
  
  private async getClientRevenue(workspaceId: string, clientId: string, start: Date, end: Date) {
    try {
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      
      const data = await db
        .select({
          total: sql<string>`COALESCE(SUM(${invoices.total}), 0)`,
        })
        .from(invoices)
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.clientId, clientId),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate),
        ));
      
      return { total: parseFloat(data[0]?.total || '0') };
    } catch (err) {
      log.error('[P&L] getClientRevenue error:', err);
      return { total: 0 };
    }
  }
  
  private async getClientLaborCost(workspaceId: string, clientId: string, start: Date, end: Date) {
    try {
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      
      const data = await db
        .select({
          total: sql<string>`COALESCE(SUM(
            (EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600) * 
            COALESCE(${employees.hourlyRate}, 15)
          ), 0)`,
        })
        .from(timeEntries)
        .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.clientId, clientId),
          gte(timeEntries.clockIn, startDate),
          lte(timeEntries.clockIn, endDate),
          isNotNull(timeEntries.clockOut),
        ));
      
      return { total: parseFloat(data[0]?.total || '0') };
    } catch (err) {
      log.error('[P&L] getClientLaborCost error:', err);
      return { total: 0 };
    }
  }
  
  private async getClientHours(workspaceId: string, clientId: string, start: Date, end: Date) {
    try {
      const startDate = start instanceof Date ? start : new Date(start);
      const endDate = end instanceof Date ? end : new Date(end);
      
      const data = await db
        .select({
          actual: sql<string>`COALESCE(SUM(
            EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600
          ), 0)`,
        })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.clientId, clientId),
          gte(timeEntries.clockIn, startDate),
          lte(timeEntries.clockIn, endDate),
          isNotNull(timeEntries.clockOut),
        ));
      
      const invoicedData = await db
        .select({
          total: sql<string>`COALESCE(SUM(${invoiceLineItems.quantity}), 0)`,
        })
        .from(invoiceLineItems)
        .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
        .where(and(
          eq(invoices.workspaceId, workspaceId),
          eq(invoices.clientId, clientId),
          gte(invoices.issueDate, startDate),
          lte(invoices.issueDate, endDate),
        ));
      
      return {
        actual: parseFloat(data[0]?.actual || '0'),
        invoiced: parseFloat(invoicedData[0]?.total || '0'),
      };
    } catch (err) {
      log.error('[P&L] getClientHours error:', err);
      return { actual: 0, invoiced: 0 };
    }
  }
  
  private async getCachedSnapshot(
    workspaceId: string,
    start: Date,
    end: Date,
    granularity: PeriodGranularity
  ): Promise<FinancialSnapshot | null> {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    const [cached] = await db
      .select()
      .from(financialSnapshots)
      .where(and(
        eq(financialSnapshots.workspaceId, workspaceId),
        eq(financialSnapshots.periodStart, startDateStr),
        eq(financialSnapshots.periodEnd, endDateStr),
        eq(financialSnapshots.granularity, granularity),
      ))
      .orderBy(desc(financialSnapshots.generatedAt))
      .limit(1);
    
    return cached || null;
  }
  
  private isSnapshotFresh(snapshot: FinancialSnapshot): boolean {
    const age = Date.now() - new Date(snapshot.generatedAt).getTime();
    return age < 5 * 60 * 1000;
  }
  
  private async saveSnapshot(snapshot: InsertFinancialSnapshot): Promise<void> {
    await db
      .insert(financialSnapshots)
      .values(snapshot)
      .onConflictDoUpdate({
        target: [financialSnapshots.workspaceId, financialSnapshots.periodStart, financialSnapshots.periodEnd],
        set: {
          revenueTotal: snapshot.revenueTotal,
          payrollTotal: snapshot.payrollTotal,
          expenseTotal: snapshot.expenseTotal,
          grossProfit: snapshot.grossProfit,
          netProfit: snapshot.netProfit,
          marginPercent: snapshot.marginPercent,
          generatedAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }
  
  private async updateSnapshotInsights(
    workspaceId: string,
    start: Date,
    end: Date,
    insights: string[]
  ): Promise<void> {
    const startDate = start instanceof Date ? start : new Date(start);
    const endDate = end instanceof Date ? end : new Date(end);
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    await db
      .update(financialSnapshots)
      .set({
        aiInsights: insights,
        aiInsightsGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(
        eq(financialSnapshots.workspaceId, workspaceId),
        eq(financialSnapshots.periodStart, startDateStr),
        eq(financialSnapshots.periodEnd, endDateStr),
      ));
  }
  
  private formatSnapshotToSummary(snapshot: FinancialSnapshot): PLSummary {
    return {
      periodStart: new Date(snapshot.periodStart),
      periodEnd: new Date(snapshot.periodEnd),
      granularity: snapshot.granularity as PeriodGranularity,
      revenueTotal: parseFloat(snapshot.revenueTotal || '0'),
      payrollTotal: parseFloat(snapshot.payrollTotal || '0'),
      expenseTotal: parseFloat(snapshot.expenseTotal || '0'),
      grossProfit: parseFloat(snapshot.grossProfit || '0'),
      netProfit: parseFloat(snapshot.netProfit || '0'),
      marginPercent: parseFloat(snapshot.marginPercent || '0'),
      invoicedAmount: parseFloat(snapshot.invoicedAmount || '0'),
      collectedAmount: parseFloat(snapshot.collectedAmount || '0'),
      outstandingAmount: parseFloat(snapshot.outstandingAmount || '0'),
      expenseBreakdown: {
        payroll: parseFloat(snapshot.payrollTotal || '0'),
        overtime: parseFloat(snapshot.overtimeCost || '0'),
        benefits: parseFloat(snapshot.benefitsCost || '0'),
        insurance: parseFloat(snapshot.insuranceCost || '0'),
        equipment: parseFloat(snapshot.equipmentCost || '0'),
        admin: parseFloat(snapshot.adminCost || '0'),
        other: 0,
      },
      aiInsights: (snapshot.aiInsights as string[]) || [],
      alerts: [],
      quickbooksStatus: snapshot.source === 'quickbooks' || snapshot.source === 'hybrid' ? 'connected' : 'not_configured',
      lastUpdated: snapshot.generatedAt,
    };
  }
  
  private buildInsightsPrompt(summary: PLSummary): string {
    return `Analyze this financial P&L summary for a service company and provide 3-5 actionable insights:

Period: ${summary.periodStart.toLocaleDateString()} - ${summary.periodEnd.toLocaleDateString()}

METRICS:
- Revenue: $${summary.revenueTotal.toLocaleString()}
- Payroll: $${summary.payrollTotal.toLocaleString()}
- Other Expenses: $${summary.expenseTotal.toLocaleString()}
- Net Profit: $${summary.netProfit.toLocaleString()}
- Profit Margin: ${summary.marginPercent.toFixed(1)}%

EXPENSE BREAKDOWN:
- Overtime: $${summary.expenseBreakdown.overtime.toLocaleString()}
- Benefits: $${summary.expenseBreakdown.benefits.toLocaleString()}
- Insurance: $${summary.expenseBreakdown.insurance.toLocaleString()}
- Equipment: $${summary.expenseBreakdown.equipment.toLocaleString()}
- Admin: $${summary.expenseBreakdown.admin.toLocaleString()}

AR STATUS:
- Invoiced: $${summary.invoicedAmount.toLocaleString()}
- Collected: $${summary.collectedAmount.toLocaleString()}
- Outstanding: $${summary.outstandingAmount.toLocaleString()}

Provide insights in this format (one per line):
- [INSIGHT_TYPE] Brief actionable insight

Where INSIGHT_TYPE is one of: MARGIN, OVERTIME, CASHFLOW, EXPENSE, OPPORTUNITY

Focus on:
1. Margin improvement opportunities
2. Overtime cost control
3. Cash flow concerns
4. Expense optimization
5. Revenue growth opportunities`;
  }
  
  private parseInsightsResponse(text: string): string[] {
    const lines = text.split('\n').filter(line => line.trim().startsWith('-'));
    return lines.map(line => line.replace(/^-\s*/, '').trim()).slice(0, 5);
  }
  
  private generateFallbackInsights(summary: PLSummary): string[] {
    const insights: string[] = [];
    
    if (summary.marginPercent < 10) {
      insights.push('[MARGIN] Profit margin is below 10% - review pricing and labor costs');
    } else if (summary.marginPercent > 25) {
      insights.push('[MARGIN] Strong profit margin above 25% - consider reinvestment opportunities');
    }
    
    if (summary.expenseBreakdown.overtime > summary.payrollTotal * 0.15) {
      insights.push('[OVERTIME] Overtime exceeds 15% of payroll - review scheduling efficiency');
    }
    
    if (summary.outstandingAmount > summary.revenueTotal * 0.3) {
      insights.push('[CASHFLOW] Over 30% of revenue is outstanding - prioritize collections');
    }
    
    if (insights.length === 0) {
      insights.push('[MARGIN] Financial metrics are within normal ranges');
    }
    
    return insights;
  }
  
  private getPeriodBounds(
    now: Date,
    granularity: PeriodGranularity,
    periodsBack: number
  ): { start: Date; end: Date } {
    const start = new Date(now);
    const end = new Date(now);
    
    switch (granularity) {
      case 'weekly':
        start.setDate(start.getDate() - (7 * (periodsBack + 1)));
        end.setDate(end.getDate() - (7 * periodsBack));
        break;
      case 'monthly':
        start.setMonth(start.getMonth() - (periodsBack + 1));
        start.setDate(1);
        end.setMonth(end.getMonth() - periodsBack);
        end.setDate(0);
        break;
      case 'quarterly':
        const quarter = Math.floor(now.getMonth() / 3);
        start.setMonth((quarter - periodsBack - 1) * 3);
        start.setDate(1);
        end.setMonth((quarter - periodsBack) * 3);
        end.setDate(0);
        break;
      case 'annual':
        start.setFullYear(start.getFullYear() - periodsBack - 1);
        start.setMonth(0);
        start.setDate(1);
        end.setFullYear(end.getFullYear() - periodsBack);
        end.setMonth(0);
        end.setDate(0);
        break;
      default:
        break;
    }
    
    return { start, end };
  }
  async getConsolidatedPL(
    parentWorkspaceId: string,
    userId: string,
    start: Date,
    end: Date,
    granularity: PeriodGranularity = 'monthly'
  ): Promise<{
    combined: PLSummary;
    branches: Array<{
      workspaceId: string;
      workspaceName: string;
      subOrgLabel: string | null;
      operatingStates: string[];
      primaryOperatingState: string | null;
      summary: PLSummary;
    }>;
  }> {
    const subOrgs = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        subOrgLabel: workspaces.subOrgLabel,
        operatingStates: workspaces.operatingStates,
        primaryOperatingState: workspaces.primaryOperatingState,
      })
      .from(workspaces)
      .where(and(
        eq(workspaces.parentWorkspaceId, parentWorkspaceId),
        eq(workspaces.isSubOrg, true),
      ));

    const allWorkspaceIds = [parentWorkspaceId, ...subOrgs.map(s => s.id)];

    const parentWs = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        subOrgLabel: workspaces.subOrgLabel,
        operatingStates: workspaces.operatingStates,
        primaryOperatingState: workspaces.primaryOperatingState,
      })
      .from(workspaces)
      .where(eq(workspaces.id, parentWorkspaceId))
      .limit(1);

    const branchResults = await Promise.all(
      allWorkspaceIds.map(async (wsId) => {
        const summary = await this.getPLSummary(wsId, userId, start, end, granularity);
        const wsInfo = wsId === parentWorkspaceId
          ? parentWs[0]
          : subOrgs.find(s => s.id === wsId);
        return {
          workspaceId: wsId,
          workspaceName: wsInfo?.name || 'Unknown',
          subOrgLabel: wsInfo?.subOrgLabel || null,
          operatingStates: (wsInfo?.operatingStates as string[]) || [],
          primaryOperatingState: wsInfo?.primaryOperatingState || null,
          summary,
        };
      })
    );

    const combined: PLSummary = {
      periodStart: start,
      periodEnd: end,
      granularity,
      revenueTotal: 0,
      payrollTotal: 0,
      expenseTotal: 0,
      grossProfit: 0,
      netProfit: 0,
      marginPercent: 0,
      invoicedAmount: 0,
      collectedAmount: 0,
      outstandingAmount: 0,
      expenseBreakdown: {
        payroll: 0,
        overtime: 0,
        benefits: 0,
        insurance: 0,
        equipment: 0,
        admin: 0,
        other: 0,
      },
      aiInsights: [],
      alerts: [],
      quickbooksStatus: 'not_configured',
      lastUpdated: new Date(),
    };

    for (const branch of branchResults) {
      const s = branch.summary;
      combined.revenueTotal += s.revenueTotal;
      combined.payrollTotal += s.payrollTotal;
      combined.expenseTotal += s.expenseTotal;
      combined.grossProfit += s.grossProfit;
      combined.netProfit += s.netProfit;
      combined.invoicedAmount += s.invoicedAmount;
      combined.collectedAmount += s.collectedAmount;
      combined.outstandingAmount += s.outstandingAmount;
      combined.expenseBreakdown.payroll += s.expenseBreakdown.payroll;
      combined.expenseBreakdown.overtime += s.expenseBreakdown.overtime;
      combined.expenseBreakdown.benefits += s.expenseBreakdown.benefits;
      combined.expenseBreakdown.insurance += s.expenseBreakdown.insurance;
      combined.expenseBreakdown.equipment += s.expenseBreakdown.equipment;
      combined.expenseBreakdown.admin += s.expenseBreakdown.admin;
      combined.expenseBreakdown.other += s.expenseBreakdown.other;
      if (s.quickbooksStatus === 'connected') {
        combined.quickbooksStatus = 'connected';
      }
    }

    combined.marginPercent = combined.revenueTotal > 0
      ? parseFloat(((combined.netProfit / combined.revenueTotal) * 100).toFixed(2))
      : 0;

    return { combined, branches: branchResults };
  }
}

export const profitLossService = new ProfitLossService();
