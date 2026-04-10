import { GEMINI_MODELS, ANTI_YAP_PRESETS } from './ai-brain/providers/geminiClient';
import { meteredGemini } from './billing/meteredGeminiClient';
import { advancedAnalyticsService } from "./advancedAnalyticsService";
import { createLogger } from '../lib/logger';
const log = createLogger('analyticsAIService');


export interface AnalyticsInsights {
  insights: string[];
  recommendations: string[];
  anomalies: Anomaly[];
  forecasts: Forecast[];
}

export interface Anomaly {
  type: 'hours' | 'revenue' | 'attendance' | 'scheduling';
  severity: 'low' | 'medium' | 'high';
  description: string;
  metric: string;
  deviation: number;
}

export interface Forecast {
  metric: string;
  currentValue: number;
  projectedValue: number;
  trend: 'up' | 'down' | 'stable';
  confidence: number;
  period: string;
}

async function generateInsights(workspaceId: string, period: string): Promise<AnalyticsInsights> {
  try {
    const [dashboard, timeUsage, scheduling, revenue, performance] = await Promise.all([
      advancedAnalyticsService.getDashboardMetrics(workspaceId, period),
      advancedAnalyticsService.getTimeUsageMetrics(workspaceId, period),
      advancedAnalyticsService.getSchedulingMetrics(workspaceId, period),
      advancedAnalyticsService.getRevenueMetrics(workspaceId, period),
      advancedAnalyticsService.getEmployeePerformanceMetrics(workspaceId, period)
    ]);

    const anomalies = detectAnomalies(dashboard, timeUsage, scheduling, revenue, performance);
    const forecasts = generateForecasts(dashboard, timeUsage, revenue);

    try {
      const prompt = `You are an AI business analyst for a workforce management platform. Analyze the following business metrics and provide actionable insights.

METRICS FOR ${period.replace(/_/g, ' ').toUpperCase()}:

OVERVIEW:
- Total Hours Worked: ${dashboard.totalHours.toFixed(1)} hours
- Total Revenue: $${dashboard.totalRevenue.toLocaleString()}
- Labor Cost: $${dashboard.laborCost.toLocaleString()}
- Revenue Per Hour: $${dashboard.revenuePerHour.toFixed(2)}
- Utilization Rate: ${dashboard.utilizationRate}%
- Active Employees: ${dashboard.activeEmployees}
- Active Clients: ${dashboard.activeClients}
${dashboard.comparison ? `
PERIOD COMPARISON:
- Hours Change: ${dashboard.comparison.hoursChange}%
- Revenue Change: ${dashboard.comparison.revenueChange}%
- Labor Cost Change: ${dashboard.comparison.laborCostChange}%` : ''}

TIME TRACKING:
- Overtime Hours: ${timeUsage.overtimeHours.toFixed(1)} hours
- Average Hours/Day: ${timeUsage.averageHoursPerDay.toFixed(1)}
- Top Employee by Hours: ${timeUsage.byEmployee[0]?.name || 'N/A'} (${timeUsage.byEmployee[0]?.totalHours.toFixed(1) || 0} hrs)
- Top Client by Hours: ${timeUsage.byClient[0]?.name || 'N/A'} (${timeUsage.byClient[0]?.totalHours.toFixed(1) || 0} hrs)

SCHEDULING:
- Total Shifts: ${scheduling.totalShifts}
- Completed: ${scheduling.completedShifts}
- Cancelled: ${scheduling.cancelledShifts}
- No Shows: ${scheduling.noShows}
- Fill Rate: ${scheduling.fillRate}%
- Coverage Rate: ${scheduling.coverageRate}%
- Average Shift Duration: ${scheduling.averageShiftDuration.toFixed(1)} hours

REVENUE:
- Total Invoiced: $${revenue.totalInvoiced.toLocaleString()}
- Total Paid: $${revenue.totalPaid.toLocaleString()}
- Pending: $${revenue.totalPending.toLocaleString()}
- Overdue: $${revenue.totalOverdue.toLocaleString()}
- Collection Rate: ${revenue.collectionRate}%
- Net Revenue: $${revenue.netRevenue.toLocaleString()}

EMPLOYEE PERFORMANCE:
- Average Attendance Rate: ${performance.averageAttendanceRate}%
- Average Punctuality Rate: ${performance.averagePunctualityRate}%
- Total Active Employees: ${performance.employees.length}
- Top Performers (95%+ attendance): ${performance.topPerformers.filter(e => e.attendanceRate >= 95).length}

Provide your analysis in this exact JSON format:
{
  "insights": [
    "insight 1",
    "insight 2",
    "insight 3"
  ],
  "recommendations": [
    "recommendation 1",
    "recommendation 2",
    "recommendation 3"
  ]
}

Focus on:
1. Key trends and patterns
2. Areas needing attention
3. Opportunities for improvement
4. Cost optimization
5. Revenue growth strategies

Be concise and actionable. Each insight should be 1-2 sentences.`;

      if (!workspaceId) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        return { success: false, insights: [], error: 'Workspace context required for AI analytics' };
      }
      const aiResult = await meteredGemini.generate({
        workspaceId,
        featureKey: 'analytics_ai_insights',
        prompt,
        model: 'gemini-2.5-flash',
        temperature: ANTI_YAP_PRESETS.diagnostics.temperature,
        maxOutputTokens: ANTI_YAP_PRESETS.diagnostics.maxTokens,
      });

      if (aiResult.success && aiResult.text) {
        const jsonMatch = aiResult.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            insights: parsed.insights || [],
            recommendations: parsed.recommendations || [],
            anomalies,
            forecasts
          };
        }
      }
    } catch (aiError) {
      log.error('Metered Gemini AI error:', aiError);
    }

    return {
      insights: generateFallbackInsights(dashboard, timeUsage, scheduling, revenue, performance),
      recommendations: generateFallbackRecommendations(dashboard, scheduling, performance),
      anomalies,
      forecasts
    };
  } catch (error) {
    log.error('Error generating analytics insights:', error);
    return {
      insights: [],
      recommendations: [],
      anomalies: [],
      forecasts: []
    };
  }
}

function detectAnomalies(
  dashboard: any,
  timeUsage: any,
  scheduling: any,
  revenue: any,
  performance: any
): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (timeUsage.overtimeHours > timeUsage.totalHours * 0.2) {
    anomalies.push({
      type: 'hours',
      severity: 'high',
      description: `Overtime hours (${timeUsage.overtimeHours.toFixed(1)}) exceed 20% of total hours`,
      metric: 'overtime_ratio',
      deviation: (timeUsage.overtimeHours / timeUsage.totalHours) * 100
    });
  }

  if (scheduling.noShows > scheduling.totalShifts * 0.05) {
    anomalies.push({
      type: 'attendance',
      severity: 'high',
      description: `No-show rate (${((scheduling.noShows / scheduling.totalShifts) * 100).toFixed(1)}%) is above acceptable threshold`,
      metric: 'no_show_rate',
      deviation: (scheduling.noShows / scheduling.totalShifts) * 100
    });
  }

  if (scheduling.fillRate < 80) {
    anomalies.push({
      type: 'scheduling',
      severity: scheduling.fillRate < 60 ? 'high' : 'medium',
      description: `Shift fill rate (${scheduling.fillRate}%) is below target of 80%`,
      metric: 'fill_rate',
      deviation: 80 - scheduling.fillRate
    });
  }

  if (revenue.totalOverdue > revenue.totalInvoiced * 0.15) {
    anomalies.push({
      type: 'revenue',
      severity: 'high',
      description: `Overdue invoices ($${revenue.totalOverdue.toLocaleString()}) exceed 15% of total invoiced`,
      metric: 'overdue_ratio',
      deviation: (revenue.totalOverdue / revenue.totalInvoiced) * 100
    });
  }

  if (revenue.collectionRate < 70) {
    anomalies.push({
      type: 'revenue',
      severity: revenue.collectionRate < 50 ? 'high' : 'medium',
      description: `Collection rate (${revenue.collectionRate}%) is below healthy threshold of 70%`,
      metric: 'collection_rate',
      deviation: 70 - revenue.collectionRate
    });
  }

  if (performance.averageAttendanceRate < 85) {
    anomalies.push({
      type: 'attendance',
      severity: performance.averageAttendanceRate < 75 ? 'high' : 'medium',
      description: `Average attendance rate (${performance.averageAttendanceRate}%) needs improvement`,
      metric: 'attendance_rate',
      deviation: 85 - performance.averageAttendanceRate
    });
  }

  if (dashboard.comparison) {
    if (dashboard.comparison.revenueChange < -15) {
      anomalies.push({
        type: 'revenue',
        severity: 'high',
        description: `Revenue decreased by ${Math.abs(dashboard.comparison.revenueChange)}% compared to previous period`,
        metric: 'revenue_trend',
        deviation: dashboard.comparison.revenueChange
      });
    }

    if (dashboard.comparison.hoursChange < -20) {
      anomalies.push({
        type: 'hours',
        severity: 'medium',
        description: `Hours worked decreased by ${Math.abs(dashboard.comparison.hoursChange)}% compared to previous period`,
        metric: 'hours_trend',
        deviation: dashboard.comparison.hoursChange
      });
    }
  }

  return anomalies;
}

function generateForecasts(
  dashboard: any,
  timeUsage: any,
  revenue: any
): Forecast[] {
  const forecasts: Forecast[] = [];

  if (dashboard.comparison) {
    const hoursTrend = dashboard.comparison.hoursChange > 5 ? 'up' : 
                       dashboard.comparison.hoursChange < -5 ? 'down' : 'stable';
    const projectedHours = dashboard.totalHours * (1 + (dashboard.comparison.hoursChange / 100));
    forecasts.push({
      metric: 'Hours Worked',
      currentValue: dashboard.totalHours,
      projectedValue: Math.round(projectedHours * 10) / 10,
      trend: hoursTrend,
      confidence: Math.min(85, 70 + Math.abs(dashboard.comparison.hoursChange)),
      period: 'Next Period'
    });

    const revenueTrend = dashboard.comparison.revenueChange > 5 ? 'up' : 
                         dashboard.comparison.revenueChange < -5 ? 'down' : 'stable';
    const projectedRevenue = dashboard.totalRevenue * (1 + (dashboard.comparison.revenueChange / 100));
    forecasts.push({
      metric: 'Revenue',
      currentValue: dashboard.totalRevenue,
      projectedValue: Math.round(projectedRevenue),
      trend: revenueTrend,
      confidence: Math.min(80, 65 + Math.abs(dashboard.comparison.revenueChange)),
      period: 'Next Period'
    });
  }

  if (timeUsage.overtimeHours > 0) {
    const overtimeTrend = timeUsage.overtimeHours > timeUsage.totalHours * 0.1 ? 'up' : 'stable';
    forecasts.push({
      metric: 'Overtime Hours',
      currentValue: timeUsage.overtimeHours,
      projectedValue: timeUsage.overtimeHours * (overtimeTrend === 'up' ? 1.1 : 1),
      trend: overtimeTrend,
      confidence: 60,
      period: 'Next Period'
    });
  }

  if (revenue.collectionRate > 0) {
    const collectionTrend = revenue.collectionRate > 80 ? 'stable' : 
                            revenue.collectionRate > 60 ? 'up' : 'down';
    forecasts.push({
      metric: 'Collection Rate',
      currentValue: revenue.collectionRate,
      projectedValue: Math.min(100, revenue.collectionRate * (collectionTrend === 'up' ? 1.05 : 1)),
      trend: collectionTrend,
      confidence: 55,
      period: 'Next Period'
    });
  }

  return forecasts;
}

function generateFallbackInsights(
  dashboard: any,
  timeUsage: any,
  scheduling: any,
  revenue: any,
  performance: any
): string[] {
  const insights: string[] = [];

  if (dashboard.totalHours > 0) {
    insights.push(
      `Total of ${dashboard.totalHours.toFixed(1)} hours tracked with ${dashboard.activeEmployees} active employees.`
    );
  }

  if (dashboard.comparison?.revenueChange) {
    const direction = dashboard.comparison.revenueChange >= 0 ? 'increased' : 'decreased';
    insights.push(
      `Revenue ${direction} by ${Math.abs(dashboard.comparison.revenueChange)}% compared to the previous period.`
    );
  }

  if (timeUsage.overtimeHours > 0) {
    const otPercent = ((timeUsage.overtimeHours / timeUsage.totalHours) * 100).toFixed(1);
    insights.push(
      `Overtime accounts for ${otPercent}% of total hours (${timeUsage.overtimeHours.toFixed(1)} hours).`
    );
  }

  if (scheduling.fillRate > 0) {
    insights.push(
      `Shift fill rate is at ${scheduling.fillRate}% with ${scheduling.completedShifts} completed out of ${scheduling.totalShifts} scheduled shifts.`
    );
  }

  if (revenue.collectionRate > 0) {
    insights.push(
      `Invoice collection rate is ${revenue.collectionRate}% with $${revenue.totalPending.toLocaleString()} still pending.`
    );
  }

  if (performance.employees.length > 0) {
    insights.push(
      `Average employee attendance rate is ${performance.averageAttendanceRate}% with ${performance.topPerformers.filter((e: any) => e.attendanceRate >= 95).length} top performers.`
    );
  }

  return insights.slice(0, 5);
}

function generateFallbackRecommendations(
  dashboard: any,
  scheduling: any,
  performance: any
): string[] {
  const recommendations: string[] = [];

  if (scheduling.fillRate < 80) {
    recommendations.push(
      'Consider increasing employee availability or hiring to improve shift fill rate.'
    );
  }

  if (scheduling.noShows > 0) {
    recommendations.push(
      'Implement shift reminder notifications to reduce no-shows and improve attendance.'
    );
  }

  if (dashboard.utilizationRate < 70) {
    recommendations.push(
      'Review scheduling patterns to optimize employee utilization and reduce idle time.'
    );
  }

  if (performance.averageAttendanceRate < 90) {
    recommendations.push(
      'Consider implementing attendance incentives or reviewing employee engagement strategies.'
    );
  }

  if (dashboard.comparison?.laborCostChange > 10) {
    recommendations.push(
      'Monitor labor costs closely - consider reviewing overtime policies and staffing levels.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Continue monitoring key metrics and maintain current operational efficiency.',
      'Consider setting up automated alerts for anomaly detection.'
    );
  }

  return recommendations.slice(0, 4);
}

export const analyticsAIService = {
  generateInsights
};
