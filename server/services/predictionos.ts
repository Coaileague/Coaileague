/**
 * PREDICTIONOS™ - AI-Powered Predictive Analytics Engine
 * Monopolistic Feature #1: The $500/Month Justifier
 * 
 * Uses GPT-4 to analyze historical workforce data and predict:
 * - Employee turnover risk (90-day flight risk)
 * - Schedule labor cost overruns (budget variance)
 */

import { db } from "../db";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import {
  timeEntries,
  invoices,
  shifts,
  employees,
  turnoverRiskScores,
  costVariancePredictions,
  type InsertTurnoverRiskScore,
  type InsertCostVariancePrediction,
} from "../../shared/schema";
import { getMeteredOpenAICompletion } from './billing/universalAIBillingInterceptor';
import { createLogger } from '../lib/logger';
const log = createLogger('predictionos');


const isPredictionOSEnabled = !!(process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY);

if (!isPredictionOSEnabled) {
  log.warn("[PredictionOS] No OpenAI API key found. AI features will use fallback analysis.");
}

export class PredictionOSEngine {
  /**
   * Analyze employee turnover risk using AI
   * Returns 0-100% probability of turnover in next 90 days
   */
  static async analyzeTurnoverRisk(employeeId: string, workspaceId: string, userId?: string): Promise<{
    riskScore: number;
    riskLevel: string;
    totalTurnoverCost: number;
    riskFactors: Record<string, number>;
    recommendations: string;
    confidenceScore: number;
  }> {
    // Gather historical data for the employee
    const employee = await db
      .select()
      .from(employees)
      .where(and(eq(employees.id, employeeId), eq(employees.workspaceId, workspaceId)))
      .limit(1);
    
    if (!employee[0]) {
      throw new Error("Employee not found");
    }
    
    // Get last 12 months of time entries
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const employeeTimeEntries = await db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.employeeId, employeeId),
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, twelveMonthsAgo)
        )
      )
      .orderBy(desc(timeEntries.clockIn));
    
    // Get employee's shift history
    const employeeShifts = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.employeeId, employeeId),
          eq(shifts.workspaceId, workspaceId),
          gte(shifts.startTime, twelveMonthsAgo)
        )
      )
      .orderBy(desc(shifts.startTime));
    
    // Calculate key metrics
    const totalHours = employeeTimeEntries.reduce((sum, entry) => {
      return sum + parseFloat(entry.totalHours?.toString() || '0');
    }, 0);
    
    const avgHoursPerMonth = totalHours / 12;
    const totalShifts = employeeShifts.length;
    const completedShifts = employeeShifts.filter(s => s.status === 'completed').length;
    const completionRate = totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 100;
    
    // Calculate tardiness/early departures
    let lateClockIns = 0;
    let earlyClockOuts = 0;
    
    employeeTimeEntries.forEach(entry => {
      if (entry.shiftId) {
        const matchingShift = employeeShifts.find(s => s.id === entry.shiftId);
        if (matchingShift) {
          const clockInTime = new Date(entry.clockIn).getTime();
          const shiftStartTime = new Date(matchingShift.startTime).getTime();
          
          // Late if clocked in more than 15 minutes after shift start
          if (clockInTime > shiftStartTime + 15 * 60 * 1000) {
            lateClockIns++;
          }
          
          if (entry.clockOut) {
            const clockOutTime = new Date(entry.clockOut).getTime();
            const shiftEndTime = new Date(matchingShift.endTime).getTime();
            
            // Early if clocked out more than 15 minutes before shift end
            if (clockOutTime < shiftEndTime - 15 * 60 * 1000) {
              earlyClockOuts++;
            }
          }
        }
      }
    });
    
    const tardinessRate = totalShifts > 0 ? (lateClockIns / totalShifts) * 100 : 0;
    const earlyDepartureRate = totalShifts > 0 ? (earlyClockOuts / totalShifts) * 100 : 0;
    
    // Build comprehensive prompt for GPT-4 analysis
    const analysisPrompt = `You are an expert HR analyst specializing in employee retention and turnover prediction. Analyze the following employee data and predict the likelihood of turnover within the next 90 days.

EMPLOYEE PROFILE:
- Name: ${employee[0].firstName} ${employee[0].lastName}
- Role: ${employee[0].role || 'Not specified'}
- Hourly Rate: $${employee[0].hourlyRate || '0'}
- Employment Duration: ${this.calculateEmploymentDuration(employee[0].createdAt || new Date())}

12-MONTH PERFORMANCE METRICS:
- Total Hours Worked: ${totalHours.toFixed(2)} hours
- Average Hours/Month: ${avgHoursPerMonth.toFixed(2)} hours
- Total Shifts: ${totalShifts}
- Shift Completion Rate: ${completionRate.toFixed(1)}%
- Tardiness Rate: ${tardinessRate.toFixed(1)}% (late clock-ins)
- Early Departure Rate: ${earlyDepartureRate.toFixed(1)}%

ANALYSIS REQUIREMENTS:
1. Calculate a turnover risk score (0-100%, where 100% = certain to leave)
2. Identify the top 3 risk factors with their contribution weights (must sum to 1.0)
3. Assign a risk level: low (<25%), medium (25-50%), high (50-75%), or critical (>75%)
4. Estimate total turnover cost (replacement + training + lost productivity)
5. Provide 3 specific retention recommendations
6. Assign a confidence score (0-100%) for your prediction

RESPOND IN THIS EXACT JSON FORMAT:
{
  "riskScore": <number 0-100>,
  "riskLevel": "<low|medium|high|critical>",
  "confidenceScore": <number 0-100>,
  "riskFactors": {
    "<factor1_name>": <weight 0-1>,
    "<factor2_name>": <weight 0-1>,
    "<factor3_name>": <weight 0-1>
  },
  "estimatedTurnoverCost": <number>,
  "recommendations": "<3 specific actionable recommendations, newline separated>"
}`;

    if (!isPredictionOSEnabled) {
      log.warn("[PredictionOS] Falling back to heuristic analysis (no API key)");
      return this.fallbackTurnoverAnalysis(
        avgHoursPerMonth,
        completionRate,
        tardinessRate,
        earlyDepartureRate
      );
    }

    try {
      if (!workspaceId) {
        throw new Error('Workspace ID required for prediction AI - cannot process unbilled operations');
      }
      const wsId = workspaceId;
      const result = await getMeteredOpenAICompletion({
        workspaceId: wsId,
        userId,
        featureKey: 'predictionos_turnover_analysis',
        messages: [
          {
            role: 'system',
            content: 'You are a predictive analytics engine for workforce management. Provide accurate, data-driven turnover predictions in JSON format.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 1000,
        jsonMode: true,
      });

      if (!result.success) {
        if (result.blocked) {
          throw new Error(`Insufficient credits for turnover analysis: ${result.error}`);
        }
        throw new Error(`AI analysis failed: ${result.error}`);
      }

      log.info(`[PredictionOS] Billed ${result.tokensUsed} tokens to workspace ${wsId}`);
      
      const aiResponse = JSON.parse(result.content || "{}");
      
      return {
        riskScore: aiResponse.riskScore || 0,
        riskLevel: aiResponse.riskLevel || 'low',
        totalTurnoverCost: aiResponse.estimatedTurnoverCost || 0,
        riskFactors: aiResponse.riskFactors || {},
        recommendations: aiResponse.recommendations || "No recommendations available",
        confidenceScore: aiResponse.confidenceScore || 0,
      };
    } catch (error: any) {
      // Handle specific OpenAI errors
      if (error.code === 'insufficient_quota') {
        log.error("PredictionOS™: OpenAI quota exceeded. Using fallback analysis.");
      } else if (error.code === 'rate_limit_exceeded') {
        log.error("PredictionOS™: Rate limit exceeded. Using fallback analysis.");
      } else if (error.status === 401) {
        log.error("PredictionOS™: Invalid API key. Using fallback analysis.");
      } else {
        log.error("PredictionOS™ AI analysis failed:", (error instanceof Error ? error.message : String(error)) || error);
      }
      
      // Fallback to simple heuristic if AI fails
      return this.fallbackTurnoverAnalysis(
        avgHoursPerMonth,
        completionRate,
        tardinessRate,
        earlyDepartureRate
      );
    }
  }
  
  /**
   * Analyze schedule cost variance using AI
   * Predicts if a schedule will exceed budget by >10%
   */
  static async analyzeCostVariance(
    workspaceId: string,
    scheduleDate: Date,
    proposedShifts: any[],
    userId?: string
  ): Promise<{
    budgetedCost: number;
    predictedCost: number;
    variancePercentage: number;
    exceeds10Percent: boolean;
    riskLevel: string;
    riskFactors: Record<string, number>;
    recommendations: string;
    problematicShifts: string[];
  }> {
    // Calculate budgeted cost (based on regular rates)
    let budgetedCost = 0;
    const shiftAnalysis: any[] = [];
    
    for (const shift of proposedShifts) {
      const employee = await db
        .select()
        .from(employees)
        .where(eq(employees.id, shift.employeeId))
        .limit(1);
      
      if (employee[0]) {
        const hourlyRate = parseFloat(employee[0].hourlyRate?.toString() || '0');
        const startTime = new Date(shift.startTime);
        const endTime = new Date(shift.endTime);
        const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        
        const regularCost = hours * hourlyRate;
        budgetedCost += regularCost;
        
        shiftAnalysis.push({
          employeeId: employee[0].id,
          employeeName: `${employee[0].firstName} ${employee[0].lastName}`,
          hourlyRate,
          hours,
          regularCost,
          startTime: shift.startTime,
          endTime: shift.endTime
        });
      }
    }
    
    // Use AI to predict actual costs (considering overtime, inefficiencies, etc.)
    const analysisPrompt = `You are a workforce cost optimization expert. Analyze this proposed work schedule and predict the actual labor costs vs budgeted costs.

PROPOSED SCHEDULE:
- Schedule Date: ${scheduleDate.toISOString().split('T')[0]}
- Total Shifts: ${proposedShifts.length}
- Budgeted Cost: $${budgetedCost.toFixed(2)}

SHIFT BREAKDOWN:
${shiftAnalysis.map((s, i) => `
Shift ${i + 1}:
- Employee: ${s.employeeName}
- Rate: $${s.hourlyRate}/hr
- Hours: ${s.hours.toFixed(2)}
- Budgeted: $${s.regularCost.toFixed(2)}
`).join('')}

ANALYSIS REQUIREMENTS:
1. Predict the ACTUAL cost considering:
   - Overtime premiums (1.5x after 40 hrs/week)
   - Potential late arrivals/early departures
   - Break time inefficiencies
   - Schedule conflicts
2. Calculate variance percentage: ((predicted - budgeted) / budgeted) * 100
3. Identify if variance exceeds 10% threshold
4. List top 3 cost risk factors with weights (must sum to 1.0)
5. Assign risk level: acceptable (<5%), warning (5-10%), critical (>10%)
6. List shift IDs that are problematic (if any)
7. Provide 3 cost optimization recommendations

RESPOND IN THIS EXACT JSON FORMAT:
{
  "predictedCost": <number>,
  "variancePercentage": <number>,
  "exceeds10Percent": <boolean>,
  "riskLevel": "<acceptable|warning|critical>",
  "riskFactors": {
    "<factor1>": <weight 0-1>,
    "<factor2>": <weight 0-1>,
    "<factor3>": <weight 0-1>
  },
  "problematicShiftIndices": [<array of shift numbers>],
  "recommendations": "<3 specific cost-saving recommendations, newline separated>"
}`;

    if (!isPredictionOSEnabled) {
      log.warn("[PredictionOS] Falling back to heuristic cost analysis (no API key)");
      return this.fallbackCostVarianceAnalysis(budgetedCost, proposedShifts);
    }

    try {
      if (!workspaceId) {
        throw new Error('Workspace ID required for prediction AI - cannot process unbilled operations');
      }
      const wsId = workspaceId;
      const costResult = await getMeteredOpenAICompletion({
        workspaceId: wsId,
        userId,
        featureKey: 'predictionos_cost_variance',
        messages: [
          {
            role: 'system',
            content: 'You are a labor cost prediction engine. Provide accurate cost variance predictions in JSON format.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        model: 'gpt-4o-mini',
        temperature: 0.3,
        jsonMode: true,
      });

      if (!costResult.success) {
        if (costResult.blocked) {
          throw new Error(`Insufficient credits for cost analysis: ${costResult.error}`);
        }
        throw new Error(`AI cost analysis failed: ${costResult.error}`);
      }

      log.info(`[PredictionOS] Billed ${costResult.tokensUsed} tokens to workspace ${wsId}`);
      
      const aiResponse = JSON.parse(costResult.content || "{}");
      
      const predictedCost = aiResponse.predictedCost || budgetedCost;
      const variancePercentage = aiResponse.variancePercentage || 0;
      
      // Map problematic shift indices to actual shift IDs
      const problematicShifts = (aiResponse.problematicShiftIndices || []).map((idx: number) => {
        return proposedShifts[idx - 1]?.id || null;
      }).filter(Boolean);
      
      return {
        budgetedCost,
        predictedCost,
        variancePercentage,
        exceeds10Percent: aiResponse.exceeds10Percent || variancePercentage > 10,
        riskLevel: aiResponse.riskLevel || 'acceptable',
        riskFactors: aiResponse.riskFactors || {},
        recommendations: aiResponse.recommendations || "No recommendations available",
        problematicShifts,
      };
    } catch (error) {
      log.error("PredictionOS™ cost variance analysis failed:", error);
      
      // Fallback: assume 5% buffer for inefficiencies
      return {
        budgetedCost,
        predictedCost: budgetedCost * 1.05,
        variancePercentage: 5.0,
        exceeds10Percent: false,
        riskLevel: 'warning',
        riskFactors: { inefficiency_buffer: 1.0 },
        recommendations: "Schedule appears reasonable but monitor for overtime",
        problematicShifts: [],
      };
    }
  }
  
  /**
   * Save turnover risk score to database
   */
  static async saveTurnoverPrediction(
    employeeId: string,
    workspaceId: string,
    analysis: Awaited<ReturnType<typeof PredictionOSEngine.analyzeTurnoverRisk>>
  ): Promise<string> {
    const employee = await db
      .select()
      .from(employees)
      .where(eq(employees.id, employeeId))
      .limit(1);
    
    const hourlyRate = parseFloat(employee[0]?.hourlyRate?.toString() || '0');
    
    // Calculate detailed cost breakdown
    const replacementCost = hourlyRate * 160; // 1 month salary estimate
    const trainingCost = hourlyRate * 80; // 2 weeks training
    const lostProductivityCost = hourlyRate * 120; // 3 weeks ramp-up
    const totalCost = analysis.totalTurnoverCost || (replacementCost + trainingCost + lostProductivityCost);
    
    const predictionData: InsertTurnoverRiskScore = {
      workspaceId,
      employeeId,
      riskScore: analysis.riskScore.toFixed(2),
      riskLevel: analysis.riskLevel,
      confidenceScore: analysis.confidenceScore.toFixed(2),
      predictionPeriod: 90,
      replacementCost: replacementCost.toFixed(2),
      trainingCost: trainingCost.toFixed(2),
      lostProductivityCost: lostProductivityCost.toFixed(2),
      totalTurnoverCost: totalCost.toFixed(2),
      riskFactors: analysis.riskFactors,
      recommendations: analysis.recommendations,
      aiModel: 'gpt-4o',
      dataPointsUsed: 0, // Will be set by caller
    };
    
    const result = await db.insert(turnoverRiskScores).values(predictionData).returning();
    return result[0].id;
  }
  
  /**
   * Save cost variance prediction to database
   */
  static async saveCostVariancePrediction(
    workspaceId: string,
    scheduleDate: Date,
    analysis: Awaited<ReturnType<typeof PredictionOSEngine.analyzeCostVariance>>
  ): Promise<string> {
    const predictionData: InsertCostVariancePrediction = {
      workspaceId,
      scheduleDate,
      schedulePeriod: 'week',
      budgetedCost: analysis.budgetedCost.toFixed(2),
      predictedCost: analysis.predictedCost.toFixed(2),
      varianceAmount: (analysis.predictedCost - analysis.budgetedCost).toFixed(2),
      variancePercentage: analysis.variancePercentage.toFixed(2),
      exceeds10Percent: analysis.exceeds10Percent,
      riskLevel: analysis.riskLevel,
      riskFactors: analysis.riskFactors,
      problematicShifts: analysis.problematicShifts,
      recommendations: analysis.recommendations,
      aiModel: 'gpt-4o',
      confidenceScore: '85.00', // Default confidence
    };
    
    const result = await db.insert(costVariancePredictions).values(predictionData).returning();
    return result[0].id;
  }
  
  // Helper methods
  private static calculateEmploymentDuration(createdAt: Date | string): string {
    const start = new Date(createdAt);
    const now = new Date();
    const months = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30));
    
    if (months < 1) return "Less than 1 month";
    if (months === 1) return "1 month";
    if (months < 12) return `${months} months`;
    
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return `${years} year${years > 1 ? 's' : ''}${remainingMonths > 0 ? ` ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}` : ''}`;
  }
  
  private static fallbackTurnoverAnalysis(
    avgHoursPerMonth: number,
    completionRate: number,
    tardinessRate: number,
    earlyDepartureRate: number
  ): {
    riskScore: number;
    riskLevel: string;
    totalTurnoverCost: number;
    riskFactors: Record<string, number>;
    recommendations: string;
    confidenceScore: number;
  } {
    // Simple heuristic-based analysis as fallback
    let riskScore = 0;
    const riskFactors: Record<string, number> = {};
    
    // Low hours = higher risk
    if (avgHoursPerMonth < 40) {
      riskScore += 30;
      riskFactors.low_hours = 0.4;
    }
    
    // Poor completion rate = higher risk
    if (completionRate < 80) {
      riskScore += 25;
      riskFactors.low_completion = 0.3;
    }
    
    // High tardiness = higher risk
    if (tardinessRate > 20) {
      riskScore += 20;
      riskFactors.tardiness = 0.3;
    }
    
    // Normalize risk factors
    const totalWeight = Object.values(riskFactors).reduce((sum, w) => sum + w, 0);
    if (totalWeight > 0) {
      Object.keys(riskFactors).forEach(key => {
        riskFactors[key] = riskFactors[key] / totalWeight;
      });
    } else {
      riskFactors.general_assessment = 1.0;
    }
    
    const riskLevel = riskScore < 25 ? 'low' : riskScore < 50 ? 'medium' : riskScore < 75 ? 'high' : 'critical';
    
    return {
      riskScore,
      riskLevel,
      totalTurnoverCost: 15000, // Default estimate
      riskFactors,
      recommendations: "Increase engagement through regular check-ins and career development discussions.",
      confidenceScore: 65, // Lower confidence for heuristic
    };
  }
  
  private static fallbackCostVarianceAnalysis(
    budgetedCost: number,
    proposedShifts: any[]
  ): {
    budgetedCost: number;
    predictedCost: number;
    variancePercentage: number;
    exceeds10Percent: boolean;
    riskLevel: string;
    riskFactors: Record<string, number>;
    recommendations: string;
    problematicShifts: string[];
  } {
    // Simple heuristic-based cost variance prediction
    // Assume typical 5% overtime/inefficiency variance
    const baseVariance = 0.05;
    const shiftCount = proposedShifts.length;
    
    // More shifts = potentially more variance
    const shiftMultiplier = shiftCount > 10 ? 1.2 : shiftCount > 5 ? 1.1 : 1.0;
    const estimatedVariance = baseVariance * shiftMultiplier;
    
    const predictedCost = budgetedCost * (1 + estimatedVariance);
    const variancePercentage = estimatedVariance * 100;
    const exceeds10Percent = variancePercentage > 10;
    
    const riskLevel = variancePercentage < 5 ? 'acceptable' : variancePercentage < 10 ? 'warning' : 'critical';
    
    return {
      budgetedCost,
      predictedCost,
      variancePercentage,
      exceeds10Percent,
      riskLevel,
      riskFactors: {
        overtime_potential: 0.5,
        schedule_efficiency: 0.3,
        break_compliance: 0.2,
      },
      recommendations: "Monitor overtime hours closely. Consider staggering shift start times to reduce overlap inefficiencies.",
      problematicShifts: [],
    };
  }
}
