import { db } from '../../db';
import { sql, eq, and, desc } from 'drizzle-orm';
import { typedQuery } from '../../lib/typedSql';
import { siteMarginScores } from '@shared/schema/domains/clients/extended';
import { contractHealthScores } from '@shared/schema/domains/sales/extended';
import { laborCostForecast } from '@shared/schema/domains/billing/extended';
import { timeEntries, employees, shifts, invoices, invoiceLineItems } from '@shared/schema';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityFinancialIntelligenceEngine');

export interface SiteMarginScore {
  siteId: string;
  siteName?: string;
  workspaceId: string;
  periodStart: string;
  periodEnd: string;
  grossRevenue: number;
  laborCost: number;
  grossMargin: number;
  grossMarginPct: number;
  targetMarginPct: number;
  status: 'healthy' | 'watch' | 'critical';
  calculatedAt: Date;
}

export interface ContractHealthScore {
  clientId: string;
  clientName?: string;
  workspaceId: string;
  contractedHoursPerPeriod: number;
  actualHoursPerPeriod: number;
  billingRate: number;
  actualCostPerHour: number;
  marginPerHour: number;
  marginPct: number;
  trend: 'improving' | 'stable' | 'declining';
  atRisk: boolean;
  calculatedAt: Date;
}

export interface LaborCostForecast {
  workspaceId: string;
  forecastDate: string;
  projectedRegularHours: number;
  projectedOtHours: number;
  projectedRegularCost: number;
  projectedOtCost: number;
  projectedTotalCost: number;
  confidenceScore: number;
  generatedAt: Date;
}

export interface FinancialIntelligenceAlert {
  type: 'margin_drop' | 'contract_overrun' | 'ot_forecast' | 'unbilled_hours' | 'payment_delay';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  affectedEntityId?: string;
  affectedEntityName?: string;
  recommendedAction: string;
  projectedImpact?: string;
}

export interface FinancialIntelligenceBriefing {
  workspaceId: string;
  generatedAt: Date;
  alerts: FinancialIntelligenceAlert[];
  topSitesByMargin: SiteMarginScore[];
  contractsAtRisk: ContractHealthScore[];
  laborCostForecast?: LaborCostForecast;
  summary: string;
}

class TrinityFinancialIntelligenceEngine {
  private TARGET_MARGIN_PCT = 30;
  private WATCH_THRESHOLD = 20;
  private CRITICAL_THRESHOLD = 10;

  async computeSiteMarginScores(workspaceId: string): Promise<SiteMarginScore[]> {
    const periodStart = new Date();
    periodStart.setDate(1);
    const periodEnd = new Date();

    // CATEGORY C — Raw SQL retained: LIMIT | Tables: sites | Verified: 2026-03-23
    const sites = await typedQuery(sql`
      SELECT DISTINCT s.id as site_id, s.name as site_name
      FROM sites s
      WHERE s.workspace_id = ${workspaceId}
      LIMIT 50
    `).catch(() => ([]));

    const scores: SiteMarginScore[] = [];

    for (const site of (sites as any[])) {
      // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: invoice_line_items, invoices | Verified: 2026-03-23
      const revenue = await typedQuery(sql`
        SELECT COALESCE(SUM(il.quantity * il.unit_price), 0) as total_revenue
        FROM invoice_line_items il
        JOIN invoices i ON il.invoice_id = i.id
        WHERE i.workspace_id = ${workspaceId}
          AND il.site_id = ${site.site_id}
          AND i.created_at >= ${periodStart.toISOString()}
          AND i.created_at <= ${periodEnd.toISOString()}
      `).catch(() => ([{ total_revenue: 0 }]));

      // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: time_entries, employees, shifts | Verified: 2026-03-23
      const labor = await typedQuery(sql`
        SELECT COALESCE(SUM(
          EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600.0 *
          COALESCE(e.hourly_rate, 15)
        ), 0) as total_labor
        FROM time_entries te
        JOIN employees e ON te.employee_id = e.id
        JOIN shifts sh ON te.shift_id = sh.id
        WHERE sh.workspace_id = ${workspaceId}
          AND sh.site_id = ${site.site_id}
          AND te.clock_in >= ${periodStart.toISOString()}
          AND te.clock_in <= ${periodEnd.toISOString()}
          AND te.clock_out IS NOT NULL
      `).catch(() => ([{ total_labor: 0 }]));

      const grossRevenue = parseFloat((revenue as any[])[0]?.total_revenue || '0');
      const laborCost = parseFloat((labor as any[])[0]?.total_labor || '0');
      const grossMargin = grossRevenue - laborCost;
      const grossMarginPct = grossRevenue > 0 ? (grossMargin / grossRevenue) * 100 : 0;

      let status: 'healthy' | 'watch' | 'critical' = 'healthy';
      if (grossMarginPct < this.CRITICAL_THRESHOLD) status = 'critical';
      else if (grossMarginPct < this.WATCH_THRESHOLD) status = 'watch';

      const score: SiteMarginScore = {
        siteId: site.site_id,
        siteName: site.site_name,
        workspaceId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        grossRevenue,
        laborCost,
        grossMargin,
        grossMarginPct: Math.round(grossMarginPct * 100) / 100,
        targetMarginPct: this.TARGET_MARGIN_PCT,
        status,
        calculatedAt: new Date(),
      };

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(siteMarginScores).values({
        siteId: site.site_id,
        workspaceId,
        periodStart: score.periodStart,
        periodEnd: score.periodEnd,
        grossRevenue: String(grossRevenue),
        laborCost: String(laborCost),
        grossMargin: String(grossMargin),
        grossMarginPct: String(grossMarginPct),
        targetMarginPct: String(this.TARGET_MARGIN_PCT),
        status,
        calculatedAt: sql`now()`,
      }).onConflictDoNothing().catch((err) => log.warn('[trinityFinancialIntelligenceEngine] Fire-and-forget failed:', err));

      scores.push(score);
    }

    if (scores.length === 0) {
      scores.push({
        siteId: 'aggregate',
        siteName: 'Organization Total',
        workspaceId,
        periodStart: periodStart.toISOString().split('T')[0],
        periodEnd: periodEnd.toISOString().split('T')[0],
        grossRevenue: 0,
        laborCost: 0,
        grossMargin: 0,
        grossMarginPct: 0,
        targetMarginPct: this.TARGET_MARGIN_PCT,
        status: 'healthy',
        calculatedAt: new Date(),
      });
    }

    return scores;
  }

  async computeContractHealthScores(workspaceId: string): Promise<ContractHealthScore[]> {
    // CATEGORY C — Raw SQL retained: LIMIT | Tables: clients | Verified: 2026-03-23
    const clients = await typedQuery(sql`
      SELECT c.id, c.company_name
      FROM clients c
      WHERE c.workspace_id = ${workspaceId}
      LIMIT 30
    `).catch(() => ([]));

    const scores: ContractHealthScore[] = [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    for (const client of (clients as any[])) {
      // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: time_entries, employees, shifts | Verified: 2026-03-23
      const actuals = await typedQuery(sql`
        SELECT
          COALESCE(SUM(EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) / 3600.0), 0) as actual_hours,
          COALESCE(AVG(COALESCE(e.hourly_rate, 15)), 15) as avg_pay_rate
        FROM time_entries te
        JOIN employees e ON te.employee_id = e.id
        JOIN shifts sh ON te.shift_id = sh.id
        WHERE sh.workspace_id = ${workspaceId}
          AND sh.client_id = ${client.id}
          AND te.clock_in >= ${thirtyDaysAgo.toISOString()}
          AND te.clock_out IS NOT NULL
      `).catch(() => ([{ actual_hours: 0, avg_pay_rate: 15 }]));

      // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: invoice_line_items, invoices | Verified: 2026-03-23
      const invoicedHours = await typedQuery(sql`
        SELECT COALESCE(SUM(il.quantity), 0) as billed_hours,
               COALESCE(AVG(il.unit_price), 0) as avg_rate
        FROM invoice_line_items il
        JOIN invoices i ON il.invoice_id = i.id
        WHERE i.workspace_id = ${workspaceId}
          AND i.client_id = ${client.id}
          AND i.created_at >= ${thirtyDaysAgo.toISOString()}
      `).catch(() => ([{ billed_hours: 0, avg_rate: 0 }]));

      const actualHours = parseFloat((actuals as any[])[0]?.actual_hours || '0');
      const avgPayRate = parseFloat((actuals as any[])[0]?.avg_pay_rate || '15');
      const billedHours = parseFloat((invoicedHours as any[])[0]?.billed_hours || '0');
      const billingRate = parseFloat((invoicedHours as any[])[0]?.avg_rate || '0');

      const actualCostPerHour = avgPayRate * 1.3;
      const marginPerHour = billingRate - actualCostPerHour;
      const marginPct = billingRate > 0 ? (marginPerHour / billingRate) * 100 : 0;
      const atRisk = marginPct < this.WATCH_THRESHOLD || (actualHours > billedHours * 1.1);

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (actualHours > billedHours * 1.05) trend = 'declining';
      else if (marginPct >= this.TARGET_MARGIN_PCT) trend = 'improving';

      const score: ContractHealthScore = {
        clientId: client.id,
        clientName: client.company_name,
        workspaceId,
        contractedHoursPerPeriod: billedHours,
        actualHoursPerPeriod: actualHours,
        billingRate: Math.round(billingRate * 100) / 100,
        actualCostPerHour: Math.round(actualCostPerHour * 100) / 100,
        marginPerHour: Math.round(marginPerHour * 100) / 100,
        marginPct: Math.round(marginPct * 100) / 100,
        trend,
        atRisk,
        calculatedAt: new Date(),
      };

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(contractHealthScores).values({
        clientId: client.id,
        workspaceId,
        contractedHoursPerPeriod: String(billedHours),
        actualHoursPerPeriod: String(actualHours),
        billingRate: String(billingRate),
        actualCostPerHour: String(actualCostPerHour),
        marginPerHour: String(marginPerHour),
        marginPct: String(marginPct),
        trend,
        atRisk,
        calculatedAt: sql`now()`,
      }).onConflictDoNothing().catch((err) => log.warn('[trinityFinancialIntelligenceEngine] Fire-and-forget failed:', err));

      scores.push(score);
    }

    return scores;
  }

  async generateLaborCostForecast(workspaceId: string): Promise<LaborCostForecast[]> {
    const forecasts: LaborCostForecast[] = [];
    const periods = [30, 60, 90];

    // Converted to Drizzle ORM: CASE WHEN → sql fragment
    const baselineResult = await db.select({
      avgWeeklyHours: sql<number>`coalesce(sum(extract(epoch from (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0), 160)`,
      avgPayRate: sql<number>`coalesce(avg(coalesce(${(employees as any).payRate}, 15)), 15)`,
      otHoursLast30: sql<number>`coalesce(sum(
        case when extract(epoch from (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0 > 40
             then (extract(epoch from (${timeEntries.clockOut} - ${timeEntries.clockIn})) / 3600.0 - 40) else 0 end
      ), 0)`
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .innerJoin(shifts, eq(timeEntries.shiftId, shifts.id))
    .where(and(
      eq(shifts.workspaceId, workspaceId),
      sql`${timeEntries.clockIn} >= now() - interval '30 days'`,
      sql`${timeEntries.clockOut} is not null`
    ));

    const baseData = baselineResult[0] || { avgWeeklyHours: 160, avgPayRate: 15, otHoursLast30: 0 };
    const monthlyHours = Number(baseData.avgWeeklyHours);
    const avgRate = Number(baseData.avgPayRate);
    const otRate = avgRate * 1.5;
    const otHoursRatio = Number(baseData.otHoursLast30) / Math.max(monthlyHours, 1);

    for (const days of periods) {
      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + days);
      const multiplier = days / 30;

      const projectedRegularHours = monthlyHours * multiplier * (1 - otHoursRatio);
      const projectedOtHours = monthlyHours * multiplier * otHoursRatio;
      const projectedRegularCost = projectedRegularHours * avgRate;
      const projectedOtCost = projectedOtHours * otRate;
      const projectedTotalCost = projectedRegularCost + projectedOtCost;

      const forecast: LaborCostForecast = {
        workspaceId,
        forecastDate: forecastDate.toISOString().split('T')[0],
        projectedRegularHours: Math.round(projectedRegularHours),
        projectedOtHours: Math.round(projectedOtHours),
        projectedRegularCost: Math.round(projectedRegularCost * 100) / 100,
        projectedOtCost: Math.round(projectedOtCost * 100) / 100,
        projectedTotalCost: Math.round(projectedTotalCost * 100) / 100,
        confidenceScore: days === 30 ? 0.85 : days === 60 ? 0.72 : 0.60,
        generatedAt: new Date(),
      };

      // Converted to Drizzle ORM: ON CONFLICT
      await db.insert(laborCostForecast).values({
        workspaceId,
        forecastDate: forecast.forecastDate,
        projectedRegularHours: String(projectedRegularHours),
        projectedOtHours: String(projectedOtHours),
        projectedRegularCost: String(projectedRegularCost),
        projectedOtCost: String(projectedOtCost),
        projectedTotalCost: String(projectedTotalCost),
        confidenceScore: String(forecast.confidenceScore),
        generatedAt: sql`now()`,
      }).onConflictDoNothing().catch((err) => log.warn('[trinityFinancialIntelligenceEngine] Fire-and-forget failed:', err));

      forecasts.push(forecast);
    }

    return forecasts;
  }

  async detectProactiveAlerts(workspaceId: string): Promise<FinancialIntelligenceAlert[]> {
    const alerts: FinancialIntelligenceAlert[] = [];

    const siteMargins = await this.computeSiteMarginScores(workspaceId);
    const contractHealth = await this.computeContractHealthScores(workspaceId);
    const forecasts = await this.generateLaborCostForecast(workspaceId);

    for (const site of siteMargins) {
      if (site.status === 'critical') {
        alerts.push({
          type: 'margin_drop',
          severity: 'critical',
          title: `Critical Margin Drop — ${site.siteName || site.siteId}`,
          message: `${site.siteName || 'Site'} is running at ${site.grossMarginPct.toFixed(1)}% margin (target: ${site.targetMarginPct}%). Labor cost of $${site.laborCost.toFixed(0)} against revenue of $${site.grossRevenue.toFixed(0)}.`,
          affectedEntityId: site.siteId,
          affectedEntityName: site.siteName,
          recommendedAction: `Review scheduling density at this site. Consider renegotiating billing rate or reducing overtime assignments.`,
          projectedImpact: `At current trajectory, this site loses $${Math.abs(site.grossMargin).toFixed(0)} per period.`,
        });
      } else if (site.status === 'watch') {
        alerts.push({
          type: 'margin_drop',
          severity: 'warning',
          title: `Margin Watch — ${site.siteName || site.siteId}`,
          message: `${site.siteName || 'Site'} margin at ${site.grossMarginPct.toFixed(1)}%, below the ${site.targetMarginPct}% target. Monitor closely.`,
          affectedEntityId: site.siteId,
          affectedEntityName: site.siteName,
          recommendedAction: 'Review this site in next financial review. Check overtime assignments.',
        });
      }
    }

    for (const contract of contractHealth) {
      if (contract.atRisk) {
        const overageHrs = contract.actualHoursPerPeriod - contract.contractedHoursPerPeriod;
        alerts.push({
          type: 'contract_overrun',
          severity: overageHrs > 20 ? 'critical' : 'warning',
          title: `Contract Overrun — ${contract.clientName || contract.clientId}`,
          message: `Actual hours (${contract.actualHoursPerPeriod.toFixed(0)}) exceeding contracted hours (${contract.contractedHoursPerPeriod.toFixed(0)}) by ${overageHrs.toFixed(0)} hours. Margin: ${contract.marginPct.toFixed(1)}%.`,
          affectedEntityId: contract.clientId,
          affectedEntityName: contract.clientName,
          recommendedAction: 'Issue a change order for the overage hours or adjust contract billing rate at next renewal.',
          projectedImpact: `Unbilled overages cost approximately $${(overageHrs * contract.actualCostPerHour).toFixed(0)} this period.`,
        });
      }
    }

    if (forecasts.length > 0) {
      const thirtyDay = forecasts[0];
      if (thirtyDay.projectedOtHours > thirtyDay.projectedRegularHours * 0.15) {
        alerts.push({
          type: 'ot_forecast',
          severity: 'warning',
          title: 'Overtime Erosion Alert — Next 30 Days',
          message: `Projected OT of ${thirtyDay.projectedOtHours} hours will cost $${thirtyDay.projectedOtCost.toFixed(0)} in premium pay over the next 30 days. Total projected payroll: $${thirtyDay.projectedTotalCost.toFixed(0)}.`,
          recommendedAction: 'Review scheduling for the coming month. Identify officers approaching 40-hour threshold and redistribute shifts proactively.',
          projectedImpact: `OT premium represents ${((thirtyDay.projectedOtCost / thirtyDay.projectedTotalCost) * 100).toFixed(1)}% of total projected payroll cost.`,
        });
      }
    }

    // === THALAMUS WIRING — Phase B Financial Intelligence ===
    // Emit a Thalamus signal for each critical financial alert so the brain
    // can route financial intelligence events through the connectome
    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length > 0) {
      try {
        const { trinityThalamus } = await import('./trinityThalamusService');
        for (const alert of criticalAlerts) {
          await trinityThalamus.process(
            { type: 'margin_alert', event: alert.type, title: alert.title, message: alert.message, affectedEntityId: alert.affectedEntityId },
            'financial_intelligence',
            undefined,
            workspaceId,
            // @ts-expect-error — TS migration: fix in refactoring sprint
            'PLATFORM',
          ).catch(() => null);
        }
      } catch {
        // Non-fatal — Thalamus wiring must never block financial data
      }
    }

    return alerts;
  }

  async generateMorningBriefingData(workspaceId: string): Promise<FinancialIntelligenceBriefing> {
    const [alerts, siteMargins, contractHealth, forecasts] = await Promise.all([
      this.detectProactiveAlerts(workspaceId),
      this.computeSiteMarginScores(workspaceId),
      this.computeContractHealthScores(workspaceId),
      this.generateLaborCostForecast(workspaceId),
    ]);

    const topSitesByMargin = [...siteMargins]
      .sort((a, b) => b.grossMarginPct - a.grossMarginPct)
      .slice(0, 3);

    const contractsAtRisk = contractHealth.filter(c => c.atRisk);
    const thirtyDayForecast = forecasts[0];

    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    const warningAlerts = alerts.filter(a => a.severity === 'warning');

    let summary = '';
    if (criticalAlerts.length === 0 && warningAlerts.length === 0) {
      summary = 'Financial health is GREEN across all sites. All margins tracking at or above target.';
    } else {
      summary = `FINANCIAL BRIEFING: ${criticalAlerts.length} critical alert(s), ${warningAlerts.length} warning(s).`;
      if (criticalAlerts.length > 0) {
        summary += ` CRITICAL: ${criticalAlerts.map(a => a.title).join('; ')}.`;
      }
      if (contractsAtRisk.length > 0) {
        summary += ` ${contractsAtRisk.length} contract(s) at risk.`;
      }
      if (thirtyDayForecast) {
        summary += ` Projected 30-day payroll: $${thirtyDayForecast.projectedTotalCost.toFixed(0)}.`;
      }
    }

    return {
      workspaceId,
      generatedAt: new Date(),
      alerts,
      topSitesByMargin,
      contractsAtRisk,
      laborCostForecast: thirtyDayForecast,
      summary,
    };
  }

  async getStoredSiteMargins(workspaceId: string, limit: number = 10): Promise<SiteMarginScore[]> {
    // CATEGORY C — Raw SQL retained: ORDER BY | Tables: site_margin_scores | Verified: 2026-03-23
    const result = await typedQuery(sql`
      SELECT site_id, workspace_id, period_start::text, period_end::text,
             gross_revenue::numeric, labor_cost::numeric, gross_margin::numeric,
             gross_margin_pct::numeric, target_margin_pct::numeric, status, calculated_at
      FROM site_margin_scores
      WHERE workspace_id = ${workspaceId}
      ORDER BY calculated_at DESC
      LIMIT ${limit}
    `).catch(() => ([]));

    return (result as any[]).map(r => ({
      siteId: r.site_id,
      workspaceId: r.workspace_id,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      grossRevenue: parseFloat(r.gross_revenue || '0'),
      laborCost: parseFloat(r.labor_cost || '0'),
      grossMargin: parseFloat(r.gross_margin || '0'),
      grossMarginPct: parseFloat(r.gross_margin_pct || '0'),
      targetMarginPct: parseFloat(r.target_margin_pct || '30'),
      status: r.status || 'healthy',
      calculatedAt: r.calculated_at,
    }));
  }
}

export const trinityFinancialIntelligenceEngine = new TrinityFinancialIntelligenceEngine();
