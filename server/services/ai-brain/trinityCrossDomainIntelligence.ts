import { db } from '../../db';
import { 
  employees, shifts, timeEntries, invoices, clients, 
  workspaces, trainingCertifications
} from '@shared/schema';
import { eq, and, gte, lte, sql, desc, count, sum, avg, lt, isNull, isNotNull, inArray } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityCrossDomainIntelligence');

export interface CrossDomainInsight {
  id: string;
  type: 'profitability' | 'overtime' | 'compliance' | 'labor_forecast' | 'anomaly' | 'cross_domain';
  severity: 'info' | 'warning' | 'critical';
  confidence: number;
  title: string;
  summary: string;
  reasoningChain: string[];
  dataPoints: Record<string, any>;
  recommendedActions: string[];
  affectedEntities: { type: string; id: string; name: string }[];
  timestamp: Date;
}

export interface ConfidenceDecision {
  action: 'execute' | 'suggest' | 'refuse';
  confidence: number;
  explanation: string;
}

function generateInsightId(): string {
  return `insight_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function resolveClientName(client: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (client.companyName?.trim()) return client.companyName.trim();
  const fullName = `${client.firstName || ''} ${client.lastName || ''}`.trim();
  return fullName || 'Unnamed Client';
}

function getConfidenceDecision(confidence: number, context: string): ConfidenceDecision {
  if (confidence >= 0.8) {
    return {
      action: 'execute',
      confidence,
      explanation: `High confidence (${(confidence * 100).toFixed(0)}%): ${context}. Proceeding with action.`
    };
  } else if (confidence >= 0.6) {
    return {
      action: 'suggest',
      confidence,
      explanation: `Moderate confidence (${(confidence * 100).toFixed(0)}%): ${context}. Suggesting action for manager review.`
    };
  } else {
    return {
      action: 'refuse',
      confidence,
      explanation: `Low confidence (${(confidence * 100).toFixed(0)}%): ${context}. Insufficient data to make a reliable recommendation. More data or manual review needed.`
    };
  }
}

export class TrinityCrossDomainIntelligence {
  
  async analyzeClientProfitability(workspaceId: string): Promise<CrossDomainInsight[]> {
    const insights: CrossDomainInsight[] = [];
    const reasoning: string[] = [];
    
    try {
      reasoning.push('Step 1: Fetching all active clients for workspace');
      const clientRecords = await db.select({
        id: clients.id,
        companyName: clients.companyName,
        firstName: clients.firstName,
        lastName: clients.lastName,
      }).from(clients)
        .where(and(
          eq(clients.workspaceId, workspaceId),
          eq(clients.isActive, true)
        ));
      
      if (clientRecords.length === 0) {
        return [{
          id: generateInsightId(),
          type: 'profitability',
          severity: 'info',
          confidence: 1.0,
          title: 'No Active Clients',
          summary: 'No active clients found to analyze profitability.',
          reasoningChain: ['No active client records exist for this workspace.'],
          dataPoints: {},
          recommendedActions: ['Add client records to enable profitability tracking.'],
          affectedEntities: [],
          timestamp: new Date(),
        }];
      }
      
      reasoning.push(`Step 2: Found ${clientRecords.length} active clients. Analyzing labor costs per client.`);
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      for (const client of clientRecords) {
        const laborData = await db.select({
          totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
          entryCount: count(),
        }).from(timeEntries)
          .innerJoin(shifts, eq(timeEntries.shiftId, shifts.id))
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            eq(shifts.clientId, client.id),
            gte(timeEntries.clockIn, thirtyDaysAgo),
            isNotNull(timeEntries.clockOut)
          ));
        
        const invoiceData = await db.select({
          totalRevenue: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
          invoiceCount: count(),
        }).from(invoices)
          .where(and(
            eq(invoices.workspaceId, workspaceId),
            eq(invoices.clientId, client.id),
            gte(invoices.createdAt, thirtyDaysAgo)
          ));
        
        const hours = Number(laborData[0]?.totalHours || 0);
        const revenue = Number(invoiceData[0]?.totalRevenue || 0);
        
        const avgHourlyRate = await db.select({
          avgRate: sql<number>`COALESCE(AVG(CAST(${employees.hourlyRate} AS DECIMAL)), 25)`,
        }).from(employees)
          .where(eq(employees.workspaceId, workspaceId));
        
        const estimatedLaborCost = hours * Number(avgHourlyRate[0]?.avgRate || 25);
        const profit = revenue - estimatedLaborCost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        
        reasoning.push(`Step 3: Client "${resolveClientName(client)}" - Revenue: $${revenue.toFixed(2)}, Labor: $${estimatedLaborCost.toFixed(2)}, Margin: ${margin.toFixed(1)}%`);
        
        if (margin < 10 && hours > 0) {
          const confidence = hours > 40 ? 0.85 : hours > 10 ? 0.65 : 0.4;
          const decision = getConfidenceDecision(confidence, `Client "${resolveClientName(client)}" margin analysis based on ${hours.toFixed(0)} hours of data`);
          
          insights.push({
            id: generateInsightId(),
            type: 'profitability',
            severity: margin < 0 ? 'critical' : 'warning',
            confidence,
            title: margin < 0 
              ? `Unprofitable Client: ${resolveClientName(client)}` 
              : `Low Margin Client: ${resolveClientName(client)}`,
            summary: `${resolveClientName(client)} has a ${margin.toFixed(1)}% profit margin over the last 30 days. Revenue: $${revenue.toFixed(2)}, estimated labor cost: $${estimatedLaborCost.toFixed(2)}. ${decision.explanation}`,
            reasoningChain: [...reasoning],
            dataPoints: {
              revenue, estimatedLaborCost, profit, margin,
              hoursWorked: hours, avgHourlyRate: Number(avgHourlyRate[0]?.avgRate || 25),
            },
            recommendedActions: margin < 0 
              ? ['Renegotiate contract rates immediately', 'Review staffing levels for overstaffing', 'Analyze overtime costs at this client site']
              : ['Monitor margin trend over next billing cycle', 'Consider rate adjustment at contract renewal', 'Optimize shift scheduling to reduce overtime'],
            affectedEntities: [{ type: 'client', id: client.id, name: resolveClientName(client) }],
            timestamp: new Date(),
          });
        }
      }
      
      return insights;
    } catch (error) {
      log.error('[CrossDomain] Client profitability analysis error:', error);
      return [{
        id: generateInsightId(),
        type: 'profitability',
        severity: 'info',
        confidence: 0,
        title: 'Analysis Error',
        summary: `Unable to complete profitability analysis: ${(error as Error).message}`,
        reasoningChain: reasoning,
        dataPoints: {},
        recommendedActions: ['Check data integrity and try again'],
        affectedEntities: [],
        timestamp: new Date(),
      }];
    }
  }

  async detectOvertimeTrends(workspaceId: string): Promise<CrossDomainInsight[]> {
    const insights: CrossDomainInsight[] = [];
    const reasoning: string[] = [];
    
    try {
      reasoning.push('Step 1: Calculating weekly hours per employee for last 4 weeks');
      
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      
      const recentHours = await db.select({
        employeeId: timeEntries.employeeId,
        totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
      }).from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, twoWeeksAgo),
          isNotNull(timeEntries.clockOut)
        ))
        .groupBy(timeEntries.employeeId);
      
      const priorHours = await db.select({
        employeeId: timeEntries.employeeId,
        totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
      }).from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, fourWeeksAgo),
          lt(timeEntries.clockIn, twoWeeksAgo),
          isNotNull(timeEntries.clockOut)
        ))
        .groupBy(timeEntries.employeeId);
      
      const priorMap = new Map(priorHours.map(h => [h.employeeId, Number(h.totalHours)]));
      
      reasoning.push(`Step 2: Comparing ${recentHours.length} employees' hours between periods`);
      
      const overtimeEmployees: { id: string; name: string; recentHrs: number; priorHrs: number; change: number }[] = [];
      
      for (const recent of recentHours) {
        const recentHrs = Number(recent.totalHours);
        const priorHrs = priorMap.get(recent.employeeId) || 0;
        const weeklyRecent = recentHrs / 2;
        
        if (weeklyRecent > 40) {
          const emp = await db.select({ firstName: employees.firstName, lastName: employees.lastName })
            .from(employees)
            .where(eq(employees.id, recent.employeeId!))
            .limit(1);
          
          const name = emp[0] ? `${emp[0].firstName} ${emp[0].lastName}` : 'Unknown';
          const change = priorHrs > 0 ? ((recentHrs - priorHrs) / priorHrs) * 100 : 100;
          
          overtimeEmployees.push({
            id: recent.employeeId!,
            name,
            recentHrs: weeklyRecent,
            priorHrs: priorHrs / 2,
            change
          });
        }
      }
      
      if (overtimeEmployees.length > 0) {
        reasoning.push(`Step 3: Found ${overtimeEmployees.length} employees averaging over 40 hours/week`);
        
        const confidence = overtimeEmployees.length >= 3 ? 0.9 : overtimeEmployees.length >= 1 ? 0.75 : 0.5;
        const spiking = overtimeEmployees.filter(e => e.change > 20);
        
        insights.push({
          id: generateInsightId(),
          type: 'overtime',
          severity: spiking.length > 0 ? 'warning' : 'info',
          confidence,
          title: `Overtime Trend: ${overtimeEmployees.length} employees over 40hrs/week`,
          summary: `${overtimeEmployees.length} employees are averaging over 40 hours per week in the last 2 weeks. ${spiking.length > 0 ? `${spiking.length} have seen a >20% increase from the prior period.` : 'Hours are relatively stable compared to the prior period.'}`,
          reasoningChain: reasoning,
          dataPoints: {
            overtimeCount: overtimeEmployees.length,
            spikingCount: spiking.length,
            employees: overtimeEmployees.slice(0, 10),
          },
          recommendedActions: [
            'Review scheduling to distribute hours more evenly',
            'Consider hiring additional staff for high-demand shifts',
            'Check if overtime is driven by specific client sites',
            ...(spiking.length > 0 ? ['Investigate sudden hour increases for spiking employees'] : []),
          ],
          affectedEntities: overtimeEmployees.slice(0, 5).map(e => ({ type: 'employee', id: e.id, name: e.name })),
          timestamp: new Date(),
        });
      }
      
      return insights;
    } catch (error) {
      log.error('[CrossDomain] Overtime trend analysis error:', error);
      return [];
    }
  }

  async identifyComplianceRisks(workspaceId: string): Promise<CrossDomainInsight[]> {
    const insights: CrossDomainInsight[] = [];
    const reasoning: string[] = [];
    
    try {
      reasoning.push('Step 1: Checking certifications expiring within 30 days');
      
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      const now = new Date();
      
      const expiringCerts = await db.select({
        certId: trainingCertifications.id,
        employeeId: trainingCertifications.employeeId,
        certType: trainingCertifications.name,
        expirationDate: trainingCertifications.expiryDate,
      }).from(trainingCertifications)
        .where(and(
          eq(trainingCertifications.workspaceId, workspaceId),
          lte(trainingCertifications.expiryDate, thirtyDaysFromNow),
          gte(trainingCertifications.expiryDate, now)
        ))
        .orderBy(trainingCertifications.expiryDate);
      
      const expiredCerts = await db.select({
        certId: trainingCertifications.id,
        employeeId: trainingCertifications.employeeId,
        certType: trainingCertifications.name,
        expirationDate: trainingCertifications.expiryDate,
      }).from(trainingCertifications)
        .where(and(
          eq(trainingCertifications.workspaceId, workspaceId),
          lt(trainingCertifications.expiryDate, now)
        ));
      
      reasoning.push(`Step 2: Found ${expiringCerts.length} expiring and ${expiredCerts.length} already expired certifications`);
      
      if (expiredCerts.length > 0) {
        reasoning.push('Step 3: Cross-referencing expired cert holders with upcoming scheduled shifts');
        
        const expiredEmployeeIds = [...new Set(expiredCerts.map(c => c.employeeId))];
        
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const scheduledWithExpired = expiredEmployeeIds.length === 0 ? [] : await db.select({
          shiftId: shifts.id,
          employeeId: shifts.employeeId,
          startTime: shifts.startTime,
        }).from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            gte(shifts.startTime, now),
            lte(shifts.startTime, nextWeek),
            inArray(shifts.employeeId, expiredEmployeeIds)
          ));
        
        if (scheduledWithExpired.length > 0) {
          reasoning.push(`Step 4: CRITICAL - ${scheduledWithExpired.length} shifts scheduled with employees who have expired certifications`);
          
          insights.push({
            id: generateInsightId(),
            type: 'compliance',
            severity: 'critical',
            confidence: 0.95,
            title: `Compliance Risk: ${scheduledWithExpired.length} shifts with expired-cert employees`,
            summary: `${scheduledWithExpired.length} upcoming shifts are assigned to employees with expired certifications. This creates legal and regulatory risk. ${expiredCerts.length} total expired certificates across ${expiredEmployeeIds.length} employees.`,
            reasoningChain: reasoning,
            dataPoints: {
              expiredCertCount: expiredCerts.length,
              affectedEmployees: expiredEmployeeIds.length,
              scheduledShiftsAtRisk: scheduledWithExpired.length,
            },
            recommendedActions: [
              'Immediately reassign affected shifts to certified employees',
              'Send renewal reminders to employees with expired certifications',
              'Block scheduling for non-certified employees until resolved',
              'Review compliance policy enforcement settings',
            ],
            affectedEntities: expiredEmployeeIds.slice(0, 5).map(id => ({ type: 'employee', id, name: 'Employee' })),
            timestamp: new Date(),
          });
        }
      }
      
      if (expiringCerts.length > 0) {
        const confidence = expiringCerts.length >= 5 ? 0.85 : 0.7;
        
        insights.push({
          id: generateInsightId(),
          type: 'compliance',
          severity: 'warning',
          confidence,
          title: `${expiringCerts.length} certifications expiring within 30 days`,
          summary: `${expiringCerts.length} employee certifications will expire in the next 30 days. Proactive renewal will prevent scheduling disruptions and compliance violations.`,
          reasoningChain: reasoning,
          dataPoints: {
            expiringCount: expiringCerts.length,
            expiringTypes: [...new Set(expiringCerts.map(c => c.certType))],
          },
          recommendedActions: [
            'Send batch renewal reminders to affected employees',
            'Schedule training sessions for certification renewals',
            'Review upcoming schedules for potential coverage gaps',
          ],
          affectedEntities: expiringCerts.slice(0, 5).map(c => ({ type: 'certification', id: c.certId!, name: c.certType || 'Certification' })),
          timestamp: new Date(),
        });
      }
      
      return insights;
    } catch (error) {
      log.error('[CrossDomain] Compliance risk analysis error:', error);
      return [];
    }
  }

  async forecastLaborCosts(workspaceId: string, weeksAhead: number = 4): Promise<CrossDomainInsight[]> {
    const insights: CrossDomainInsight[] = [];
    const reasoning: string[] = [];
    
    try {
      reasoning.push(`Step 1: Analyzing last 8 weeks of labor costs for forecasting ${weeksAhead} weeks ahead`);
      
      const eightWeeksAgo = new Date();
      eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);
      
      const weeklyLabor = await db.select({
        weekNum: sql<number>`EXTRACT(WEEK FROM ${timeEntries.clockIn})`,
        totalHours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
        uniqueEmployees: sql<number>`COUNT(DISTINCT ${timeEntries.employeeId})`,
      }).from(timeEntries)
        .where(and(
          eq(timeEntries.workspaceId, workspaceId),
          gte(timeEntries.clockIn, eightWeeksAgo),
          isNotNull(timeEntries.clockOut)
        ))
        .groupBy(sql`EXTRACT(WEEK FROM ${timeEntries.clockIn})`)
        .orderBy(sql`EXTRACT(WEEK FROM ${timeEntries.clockIn})`);
      
      if (weeklyLabor.length < 2) {
        return [{
          id: generateInsightId(),
          type: 'labor_forecast',
          severity: 'info',
          confidence: 0.3,
          title: 'Insufficient Data for Forecast',
          summary: 'Need at least 2 weeks of time entry data to generate a labor cost forecast.',
          reasoningChain: ['Insufficient historical data for trend projection.'],
          dataPoints: { weeksOfData: weeklyLabor.length },
          recommendedActions: ['Continue tracking time entries to build forecast data.'],
          affectedEntities: [],
          timestamp: new Date(),
        }];
      }
      
      const avgRate = await db.select({
        rate: sql<number>`COALESCE(AVG(CAST(${employees.hourlyRate} AS DECIMAL)), 25)`,
      }).from(employees)
        .where(and(eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)));
      
      const hourlyRate = Number(avgRate[0]?.rate || 25);
      
      const hours = weeklyLabor.map(w => Number(w.totalHours));
      const avgHours = hours.reduce((a, b) => a + b, 0) / hours.length;
      const trend = hours.length >= 2 
        ? (hours[hours.length - 1] - hours[0]) / hours.length 
        : 0;
      
      reasoning.push(`Step 2: Average weekly hours: ${avgHours.toFixed(1)}, trend: ${trend > 0 ? '+' : ''}${trend.toFixed(1)} hours/week`);
      
      const projectedWeeklyCosts: number[] = [];
      for (let w = 1; w <= weeksAhead; w++) {
        const projectedHours = avgHours + (trend * w);
        projectedWeeklyCosts.push(Math.max(0, projectedHours) * hourlyRate);
      }
      
      const totalProjected = projectedWeeklyCosts.reduce((a, b) => a + b, 0);
      const weeklyAvgCost = avgHours * hourlyRate;
      const projectedChange = weeksAhead > 0 && weeklyAvgCost > 0
        ? ((projectedWeeklyCosts[projectedWeeklyCosts.length - 1] - weeklyAvgCost) / weeklyAvgCost) * 100
        : 0;
      
      reasoning.push(`Step 3: Projected ${weeksAhead}-week labor cost: $${totalProjected.toFixed(2)} (${projectedChange > 0 ? '+' : ''}${projectedChange.toFixed(1)}% trend)`);
      
      const confidence = hours.length >= 6 ? 0.8 : hours.length >= 4 ? 0.65 : 0.45;
      
      insights.push({
        id: generateInsightId(),
        type: 'labor_forecast',
        severity: Math.abs(projectedChange) > 15 ? 'warning' : 'info',
        confidence,
        title: `Labor Cost Forecast: ${weeksAhead} weeks`,
        summary: `Projected total labor cost for the next ${weeksAhead} weeks: $${totalProjected.toFixed(2)}. Current weekly average: $${weeklyAvgCost.toFixed(2)}. ${trend > 0 ? `Hours are trending up by ${trend.toFixed(1)}/week.` : trend < 0 ? `Hours are trending down by ${Math.abs(trend).toFixed(1)}/week.` : 'Hours are stable.'} Based on ${hours.length} weeks of historical data at $${hourlyRate.toFixed(2)}/hr average rate.`,
        reasoningChain: reasoning,
        dataPoints: {
          avgWeeklyHours: avgHours,
          hourlyRate,
          weeklyTrend: trend,
          projectedWeeklyCosts,
          totalProjected,
          projectedChange,
          dataWeeks: hours.length,
        },
        recommendedActions: projectedChange > 15 
          ? ['Review scheduling efficiency', 'Consider adjusting staffing levels', 'Analyze overtime drivers']
          : projectedChange < -15
          ? ['Verify client contracts are being fulfilled', 'Check for scheduling gaps', 'Review employee availability']
          : ['Labor costs are stable — continue monitoring'],
        affectedEntities: [],
        timestamp: new Date(),
      });
      
      return insights;
    } catch (error) {
      log.error('[CrossDomain] Labor forecast error:', error);
      return [];
    }
  }

  async getTemporalTrends(workspaceId: string): Promise<CrossDomainInsight[]> {
    const insights: CrossDomainInsight[] = [];
    const reasoning: string[] = [];
    
    try {
      reasoning.push('Step 1: Computing week-over-week and month-over-month comparisons');
      
      const now = new Date();
      const oneWeekAgo = new Date(now); oneWeekAgo.setDate(now.getDate() - 7);
      const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14);
      const oneMonthAgo = new Date(now); oneMonthAgo.setDate(now.getDate() - 30);
      const twoMonthsAgo = new Date(now); twoMonthsAgo.setDate(now.getDate() - 60);
      
      const [thisWeekHours] = await db.select({
        hours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
      }).from(timeEntries).where(and(
        eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, oneWeekAgo), isNotNull(timeEntries.clockOut)
      ));
      
      const [lastWeekHours] = await db.select({
        hours: sql<number>`COALESCE(SUM(EXTRACT(EPOCH FROM (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 0)`,
      }).from(timeEntries).where(and(
        eq(timeEntries.workspaceId, workspaceId), gte(timeEntries.clockIn, twoWeeksAgo), lt(timeEntries.clockIn, oneWeekAgo), isNotNull(timeEntries.clockOut)
      ));
      
      const [thisMonthRevenue] = await db.select({
        revenue: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
        count: count(),
      }).from(invoices).where(and(
        eq(invoices.workspaceId, workspaceId), gte(invoices.createdAt, oneMonthAgo)
      ));
      
      const [lastMonthRevenue] = await db.select({
        revenue: sql<number>`COALESCE(SUM(CAST(${invoices.total} AS DECIMAL)), 0)`,
        count: count(),
      }).from(invoices).where(and(
        eq(invoices.workspaceId, workspaceId), gte(invoices.createdAt, twoMonthsAgo), lt(invoices.createdAt, oneMonthAgo)
      ));
      
      const [thisWeekEmployees] = await db.select({
        active: count(),
      }).from(employees).where(and(
        eq(employees.workspaceId, workspaceId), eq(employees.isActive, true)
      ));
      
      const tw = Number(thisWeekHours?.hours || 0);
      const lw = Number(lastWeekHours?.hours || 0);
      const hoursChange = lw > 0 ? ((tw - lw) / lw) * 100 : 0;
      
      const tmr = Number(thisMonthRevenue?.revenue || 0);
      const lmr = Number(lastMonthRevenue?.revenue || 0);
      const revenueChange = lmr > 0 ? ((tmr - lmr) / lmr) * 100 : 0;
      
      reasoning.push(`Step 2: Hours WoW: ${tw.toFixed(1)} vs ${lw.toFixed(1)} (${hoursChange > 0 ? '+' : ''}${hoursChange.toFixed(1)}%)`);
      reasoning.push(`Step 3: Revenue MoM: $${tmr.toFixed(2)} vs $${lmr.toFixed(2)} (${revenueChange > 0 ? '+' : ''}${revenueChange.toFixed(1)}%)`);
      
      const trendPoints = [];
      if (Math.abs(hoursChange) > 10) trendPoints.push(`Hours ${hoursChange > 0 ? 'up' : 'down'} ${Math.abs(hoursChange).toFixed(1)}% week-over-week`);
      if (Math.abs(revenueChange) > 10) trendPoints.push(`Revenue ${revenueChange > 0 ? 'up' : 'down'} ${Math.abs(revenueChange).toFixed(1)}% month-over-month`);
      
      const severity = (Math.abs(hoursChange) > 25 || Math.abs(revenueChange) > 25) ? 'warning' : 'info';
      
      insights.push({
        id: generateInsightId(),
        type: 'cross_domain',
        severity,
        confidence: (tw > 0 || lw > 0) ? 0.8 : 0.3,
        title: 'Temporal Trends Summary',
        summary: trendPoints.length > 0 
          ? `Key trends detected: ${trendPoints.join('. ')}. Active employees: ${thisWeekEmployees?.active || 0}.`
          : `Operations are stable. Hours this week: ${tw.toFixed(1)}, revenue this month: $${tmr.toFixed(2)}. Active employees: ${thisWeekEmployees?.active || 0}.`,
        reasoningChain: reasoning,
        dataPoints: {
          thisWeekHours: tw, lastWeekHours: lw, hoursChangePercent: hoursChange,
          thisMonthRevenue: tmr, lastMonthRevenue: lmr, revenueChangePercent: revenueChange,
          activeEmployees: thisWeekEmployees?.active || 0,
        },
        recommendedActions: trendPoints.length > 0
          ? ['Review the driving factors behind significant changes', 'Cross-reference with client activity and scheduling changes']
          : ['Continue monitoring — no significant trends detected'],
        affectedEntities: [],
        timestamp: new Date(),
      });
      
      return insights;
    } catch (error) {
      log.error('[CrossDomain] Temporal trends error:', error);
      return [];
    }
  }

  async generateFullAnalysis(workspaceId: string): Promise<{
    insights: CrossDomainInsight[];
    summary: string;
    overallHealth: 'healthy' | 'attention_needed' | 'critical';
  }> {
    const [profitability, overtime, compliance, forecast, trends] = await Promise.all([
      this.analyzeClientProfitability(workspaceId),
      this.detectOvertimeTrends(workspaceId),
      this.identifyComplianceRisks(workspaceId),
      this.forecastLaborCosts(workspaceId),
      this.getTemporalTrends(workspaceId),
    ]);
    
    const allInsights = [...profitability, ...overtime, ...compliance, ...forecast, ...trends];
    
    const criticalCount = allInsights.filter(i => i.severity === 'critical').length;
    const warningCount = allInsights.filter(i => i.severity === 'warning').length;
    
    const overallHealth = criticalCount > 0 ? 'critical' 
      : warningCount >= 3 ? 'attention_needed' 
      : 'healthy';
    
    const summaryParts = [];
    if (criticalCount > 0) summaryParts.push(`${criticalCount} critical issue(s) requiring immediate attention`);
    if (warningCount > 0) summaryParts.push(`${warningCount} warning(s) to review`);
    summaryParts.push(`${allInsights.length} total insights generated across ${5} analysis domains`);
    
    return {
      insights: allInsights,
      summary: summaryParts.join('. ') + '.',
      overallHealth,
    };
  }

  explainReasoning(insight: CrossDomainInsight): string {
    const lines = [
      `## ${insight.title}`,
      '',
      `**Confidence:** ${(insight.confidence * 100).toFixed(0)}% | **Severity:** ${insight.severity.toUpperCase()}`,
      '',
      '### How I reached this conclusion:',
      ...insight.reasoningChain.map((step, i) => `${i + 1}. ${step}`),
      '',
      '### What the data shows:',
      ...Object.entries(insight.dataPoints)
        .filter(([_, v]) => typeof v !== 'object')
        .map(([k, v]) => `- **${k.replace(/([A-Z])/g, ' $1').trim()}:** ${typeof v === 'number' ? (k.includes('ercent') || k.includes('argin') ? `${v.toFixed(1)}%` : k.includes('evenue') || k.includes('ost') || k.includes('rofit') ? `$${v.toFixed(2)}` : v.toFixed(1)) : v}`),
      '',
      '### Recommended actions:',
      ...insight.recommendedActions.map((a, i) => `${i + 1}. ${a}`),
    ];
    return lines.join('\n');
  }
}

export const trinityCrossDomainIntelligence = new TrinityCrossDomainIntelligence();
