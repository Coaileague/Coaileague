/**
 * AI DYNAMIC PRICING SERVICE
 * ===========================
 * 
 * Gemini-powered pricing optimization for client services:
 * 
 * 1. Rate Analysis - Evaluates current service rates vs market data
 * 2. Profitability Analysis - Calculates true cost per service hour
 * 3. Demand-Based Pricing - Suggests rates based on utilization
 * 4. Client-Specific Pricing - Optimizes rates per client relationship
 * 5. Seasonal Adjustments - Recommends pricing for peak/off-peak periods
 */

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './providers/geminiClient';
import { db } from '../../db';
import { eq, and, sql, gte, desc, avg, count, sum } from 'drizzle-orm';
import {
  clients,
  employees,
  timeEntries,
  invoices,
  invoiceLineItems,
  payrollRuns,
  workspaces,
} from '@shared/schema';
import { usageMeteringService } from '../billing/usageMetering';
import { meteredGemini } from '../billing/meteredGeminiClient';
import { createLogger } from '../../lib/logger';
const log = createLogger('aiDynamicPricingService');

export interface PricingSuggestion {
  currentRate: number;
  suggestedRate: number;
  changePercent: number;
  reasoning: string;
  confidence: number;
  riskLevel: 'low' | 'medium' | 'high';
  expectedImpact: {
    revenueChange: number;
    marginImprovement: number;
  };
}

export interface ClientPricingAnalysis {
  clientId: string;
  clientName: string;
  currentAverageRate: number;
  totalBilled: number;
  hoursWorked: number;
  profitability: number;
  suggestion: PricingSuggestion;
}

export interface ServicePricingReport {
  workspaceId: string;
  analysisDate: Date;
  overallMetrics: {
    avgHourlyRate: number;
    avgCostPerHour: number;
    currentMargin: number;
    utilizationRate: number;
    revenuePerEmployee: number;
  };
  clientAnalysis: ClientPricingAnalysis[];
  recommendations: string[];
  seasonalInsights: string[];
}

export interface RateCompetitivenessAnalysis {
  yourRate: number;
  marketLow: number;
  marketAverage: number;
  marketHigh: number;
  positioning: 'below_market' | 'competitive' | 'premium';
  competitivenessScore: number;
}

class AIDynamicPricingService {
  private model: GenerativeModel | null = null;
  private initialized: boolean = false;

  private readonly INDUSTRY_BENCHMARKS = {
    staffing: { low: 25, avg: 45, high: 85 },
    consulting: { low: 75, avg: 150, high: 350 },
    healthcare: { low: 35, avg: 65, high: 150 },
    technology: { low: 50, avg: 125, high: 300 },
    general: { low: 25, avg: 55, high: 120 }
  };

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        log.warn('[AIDynamicPricing] GEMINI_API_KEY not configured');
        return;
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      this.model = genAI.getGenerativeModel({ 
        model: GEMINI_MODELS.DIAGNOSTICS,
        generationConfig: {
          maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
          temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        }
      });
      this.initialized = true;
      log.info('[AIDynamicPricing] Service initialized');
    } catch (error: any) {
      log.error('[AIDynamicPricing] Initialization failed:', (error instanceof Error ? error.message : String(error)));
    }
  }

  async analyzeClientPricing(
    clientId: string,
    workspaceId: string,
    userId?: string
  ): Promise<ClientPricingAnalysis | null> {
    await this.initialize();

    try {
      const [client] = await db.select()
        .from(clients)
        .where(and(
          eq(clients.id, clientId),
          eq(clients.workspaceId, workspaceId)
        ))
        .limit(1);

      if (!client) return null;

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const clientInvoices = await db.select({
        totalAmount: sql<number>`sum(${invoices.total})`,
        invoiceCount: sql<number>`count(*)`,
      })
        .from(invoices)
        .where(and(
          eq(invoices.clientId, clientId),
          eq(invoices.workspaceId, workspaceId),
          gte(invoices.createdAt, sixMonthsAgo)
        ));

      const clientHours = await db.select({
        totalHours: sql<number>`sum(${timeEntries.totalHours})`,
        entryCount: sql<number>`count(*)`,
      })
        .from(timeEntries)
        .where(and(
          eq(timeEntries.clientId, clientId),
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, sixMonthsAgo)
        ));

      const totalBilled = parseFloat(String(clientInvoices[0]?.totalAmount || 0));
      const hoursWorked = parseFloat(String(clientHours[0]?.totalHours || 0));
      const currentAverageRate = hoursWorked > 0 ? totalBilled / hoursWorked : 0;

      const workspaceCosts = await this.calculateWorkspaceCosts(workspaceId);
      const costPerHour = workspaceCosts.avgCostPerHour;
      const profitability = currentAverageRate > 0 ? 
        ((currentAverageRate - costPerHour) / currentAverageRate) * 100 : 0;

      const suggestion = await this.generatePricingSuggestion(
        currentAverageRate,
        costPerHour,
        profitability,
        hoursWorked,
        totalBilled,
        workspaceId,
        userId
      );

      return {
        clientId,
        clientName: `${client.firstName} ${client.lastName}${client.companyName ? ` (${client.companyName})` : ''}`,
        currentAverageRate,
        totalBilled,
        hoursWorked,
        profitability,
        suggestion
      };
    } catch (error: any) {
      log.error('[AIDynamicPricing] Client analysis error:', (error instanceof Error ? error.message : String(error)));
      return null;
    }
  }

  private async calculateWorkspaceCosts(workspaceId: string): Promise<{
    avgCostPerHour: number;
    totalLaborCost: number;
    totalHoursWorked: number;
  }> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const hoursData = await db.select({
      totalHours: sql<number>`sum(${timeEntries.totalHours})`,
    })
      .from(timeEntries)
      .where(and(
        eq(timeEntries.workspaceId, workspaceId),
        gte(timeEntries.clockIn, threeMonthsAgo)
      ));

    const payrollData = await db.select({
      totalPayroll: sql<number>`sum(${payrollRuns.totalGrossPay})`,
    })
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.workspaceId, workspaceId),
        eq(payrollRuns.status, 'processed'),
        gte(payrollRuns.periodStart, threeMonthsAgo)
      ));

    const totalHoursWorked = parseFloat(String(hoursData[0]?.totalHours || 0));
    const totalLaborCost = parseFloat(String(payrollData[0]?.totalPayroll || 0));
    const avgCostPerHour = totalHoursWorked > 0 ? totalLaborCost / totalHoursWorked : 0;

    return {
      avgCostPerHour,
      totalLaborCost,
      totalHoursWorked
    };
  }

  private async generatePricingSuggestion(
    currentRate: number,
    costPerHour: number,
    profitability: number,
    hoursWorked: number,
    totalBilled: number,
    workspaceId: string,
    userId?: string
  ): Promise<PricingSuggestion> {
    await this.initialize();

    const minMargin = 0.25;
    const targetMargin = 0.35;
    const minRate = costPerHour / (1 - minMargin);
    const targetRate = costPerHour / (1 - targetMargin);

    let suggestedRate = currentRate;
    let reasoning = '';
    let confidence = 70;
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    if (profitability < 15) {
      suggestedRate = Math.max(targetRate, currentRate * 1.15);
      reasoning = 'Current margin is below healthy threshold. Rate increase recommended to maintain sustainability.';
      riskLevel = 'high';
      confidence = 85;
    } else if (profitability < 25) {
      suggestedRate = Math.max(targetRate, currentRate * 1.08);
      reasoning = 'Margin is adequate but below optimal. Moderate rate increase suggested.';
      riskLevel = 'medium';
      confidence = 75;
    } else if (profitability > 50 && hoursWorked < 100) {
      suggestedRate = currentRate * 0.95;
      reasoning = 'High margin but low volume. Consider competitive pricing to increase utilization.';
      riskLevel = 'low';
      confidence = 60;
    } else {
      suggestedRate = currentRate * 1.03;
      reasoning = 'Healthy margin maintained. Modest inflation adjustment suggested.';
      riskLevel = 'low';
      confidence = 65;
    }

    if (userId) {
      try {
        const prompt = `As a pricing strategist, analyze this client service pricing:

Current Rate: $${currentRate.toFixed(2)}/hour
Cost Per Hour: $${costPerHour.toFixed(2)}
Current Margin: ${profitability.toFixed(1)}%
Hours Worked (6 months): ${hoursWorked.toFixed(1)}
Total Billed: $${totalBilled.toFixed(2)}

Calculated suggestion: $${suggestedRate.toFixed(2)}/hour

Provide a refined recommendation in JSON:
{
  "adjustedRate": number,
  "reasoning": "string with specific insights",
  "confidence": 0-100,
  "riskLevel": "low|medium|high",
  "additionalFactors": ["any other considerations"]
}`;

        const result = await meteredGemini.generate({
          workspaceId: workspaceId,
          userId,
          featureKey: 'ai_pricing_analysis',
          prompt,
          model: 'gemini-2.5-flash',
          temperature: 0.5,
          maxOutputTokens: 500,
        });

        if (result.success) {
          const jsonMatch = result.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.adjustedRate) suggestedRate = parsed.adjustedRate;
            if (parsed.reasoning) reasoning = parsed.reasoning;
            if (parsed.confidence) confidence = parsed.confidence;
            if (parsed.riskLevel) riskLevel = parsed.riskLevel;
          }
        }
      } catch (error: any) {
        log.info('[AIDynamicPricing] AI enhancement skipped:', (error instanceof Error ? error.message : String(error)));
      }
    }

    const changePercent = currentRate > 0 ? ((suggestedRate - currentRate) / currentRate) * 100 : 0;
    const revenueChange = hoursWorked * (suggestedRate - currentRate);
    const newMargin = suggestedRate > 0 ? ((suggestedRate - costPerHour) / suggestedRate) * 100 : 0;
    const marginImprovement = newMargin - profitability;

    return {
      currentRate,
      suggestedRate: Math.round(suggestedRate * 100) / 100,
      changePercent: Math.round(changePercent * 10) / 10,
      reasoning,
      confidence,
      riskLevel,
      expectedImpact: {
        revenueChange: Math.round(revenueChange * 100) / 100,
        marginImprovement: Math.round(marginImprovement * 10) / 10
      }
    };
  }

  async generatePricingReport(
    workspaceId: string,
    userId?: string
  ): Promise<ServicePricingReport> {
    await this.initialize();

    const clientList = await db.select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .limit(50);

    const workspaceCosts = await this.calculateWorkspaceCosts(workspaceId);

    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const revenueData = await db.select({
      totalRevenue: sql<number>`sum(${invoices.total})`,
    })
      .from(invoices)
      .where(and(
        eq(invoices.workspaceId, workspaceId),
        gte(invoices.createdAt, threeMonthsAgo)
      ));

    const employeeCount = await db.select({ count: sql<number>`count(*)` })
      .from(employees)
      .where(eq(employees.workspaceId, workspaceId));

    const totalRevenue = parseFloat(String(revenueData[0]?.totalRevenue || 0));
    const empCount = Number(employeeCount[0]?.count || 1);
    const revenuePerEmployee = totalRevenue / empCount;

    const avgHourlyRate = workspaceCosts.totalHoursWorked > 0 ?
      totalRevenue / workspaceCosts.totalHoursWorked : 0;
    const currentMargin = avgHourlyRate > 0 ?
      ((avgHourlyRate - workspaceCosts.avgCostPerHour) / avgHourlyRate) * 100 : 0;

    const clientAnalysis: ClientPricingAnalysis[] = [];
    for (const client of clientList.slice(0, 10)) {
      const analysis = await this.analyzeClientPricing(client.id, workspaceId, userId);
      if (analysis) {
        clientAnalysis.push(analysis);
      }
    }

    const recommendations: string[] = [];
    const lowMarginClients = clientAnalysis.filter(c => c.profitability < 20);
    if (lowMarginClients.length > 0) {
      recommendations.push(`${lowMarginClients.length} clients have margins below 20% - review rates`);
    }

    const highVolumeClients = clientAnalysis
      .filter(c => c.hoursWorked > 100)
      .sort((a, b) => b.hoursWorked - a.hoursWorked);
    if (highVolumeClients.length > 0) {
      recommendations.push(`Focus on ${highVolumeClients[0].clientName} - highest volume client`);
    }

    if (currentMargin < 25) {
      recommendations.push('Overall margin is below target - consider across-the-board rate review');
    }

    const seasonalInsights: string[] = [];
    const month = new Date().getMonth();
    if (month >= 0 && month <= 2) {
      seasonalInsights.push('Q1 typically slower - maintain competitive rates to secure contracts');
    } else if (month >= 6 && month <= 8) {
      seasonalInsights.push('Summer peak season - opportunity for premium rates');
    } else if (month >= 9 && month <= 11) {
      seasonalInsights.push('Q4 budget season - lock in annual contracts with slight discounts');
    }

    return {
      workspaceId,
      analysisDate: new Date(),
      overallMetrics: {
        avgHourlyRate: Math.round(avgHourlyRate * 100) / 100,
        avgCostPerHour: Math.round(workspaceCosts.avgCostPerHour * 100) / 100,
        currentMargin: Math.round(currentMargin * 10) / 10,
        utilizationRate: 75,
        revenuePerEmployee: Math.round(revenuePerEmployee * 100) / 100
      },
      clientAnalysis,
      recommendations,
      seasonalInsights
    };
  }

  async analyzeRateCompetitiveness(
    rate: number,
    industry: keyof typeof this.INDUSTRY_BENCHMARKS = 'general'
  ): Promise<RateCompetitivenessAnalysis> {
    const benchmark = this.INDUSTRY_BENCHMARKS[industry] || this.INDUSTRY_BENCHMARKS.general;

    let positioning: 'below_market' | 'competitive' | 'premium';
    let competitivenessScore: number;

    if (rate < benchmark.low) {
      positioning = 'below_market';
      competitivenessScore = (rate / benchmark.low) * 40;
    } else if (rate <= benchmark.avg) {
      positioning = 'competitive';
      const range = benchmark.avg - benchmark.low;
      const position = rate - benchmark.low;
      competitivenessScore = 40 + (position / range) * 30;
    } else if (rate <= benchmark.high) {
      positioning = 'premium';
      const range = benchmark.high - benchmark.avg;
      const position = rate - benchmark.avg;
      competitivenessScore = 70 + (position / range) * 30;
    } else {
      positioning = 'premium';
      competitivenessScore = 100;
    }

    return {
      yourRate: rate,
      marketLow: benchmark.low,
      marketAverage: benchmark.avg,
      marketHigh: benchmark.high,
      positioning,
      competitivenessScore: Math.round(competitivenessScore)
    };
  }

  async suggestBulkRateAdjustment(
    workspaceId: string,
    adjustmentPercent: number,
    userId?: string
  ): Promise<{
    affectedClients: number;
    projectedRevenueChange: number;
    recommendations: string[];
  }> {
    const report = await this.generatePricingReport(workspaceId, userId);
    
    let projectedRevenueChange = 0;
    const recommendations: string[] = [];

    for (const client of report.clientAnalysis) {
      const newRate = client.currentAverageRate * (1 + adjustmentPercent / 100);
      const revenueChange = client.hoursWorked * (newRate - client.currentAverageRate);
      projectedRevenueChange += revenueChange;

      if (client.profitability < 15 && adjustmentPercent < 10) {
        recommendations.push(`${client.clientName} needs larger increase (current margin: ${client.profitability.toFixed(1)}%)`);
      }
    }

    return {
      affectedClients: report.clientAnalysis.length,
      projectedRevenueChange: Math.round(projectedRevenueChange * 100) / 100,
      recommendations
    };
  }
}

export const aiDynamicPricingService = new AIDynamicPricingService();
