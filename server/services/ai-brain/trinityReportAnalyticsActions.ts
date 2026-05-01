import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { db } from '../../db';
import { 
  timeEntries, 
  payrollRuns, 
  payrollEntries, 
  employees, 
  shifts, 
  clients,
  trainingCertifications
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { 
  generateTimesheetReport, 
  getWeeklyReport, 
  getMonthlyReport, 
  getComplianceReport 
} from '../../services/timesheetReportService';
import { getRevenueForecast } from '../../services/timesheetInvoiceService';
import { trinityBusinessIntelligence } from './trinityBusinessIntelligence';
import { typedCount, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityReportAnalyticsActions');

// mkAction helper for compact analytics registrations
function mkAction(actionId: string, fn: (params: any) => Promise<any>) {
  return {
    actionId,
    name: actionId,
    category: 'analytics' as any,
    description: `Trinity analytics: ${actionId}`,
    handler: async (req: import('../helpai/platformActionHub').ActionRequest): Promise<import('../helpai/platformActionHub').ActionResult> => {
      try {
        const data = await fn(req.params || {});
        return { success: true, data } as any;
      } catch (err: unknown) {
        return { success: false, error: err?.message || 'Unknown error' } as any;
      }
    },
  };
}

// ============================================================================
// HELPER: Create ActionResult
// ============================================================================

function createResult(
  actionId: string, 
  success: boolean, 
  message: string, 
  data?: any,
  startTime?: number
): ActionResult {
  return {
    success,
    actionId,
    message,
    data,
    executionTimeMs: startTime ? Date.now() - startTime : 0,
  };
}

// ============================================================================
// REPORT ACTIONS
// ============================================================================

export function registerReportAnalyticsActions(): void {
  log.info('[Trinity Reports+Analytics] Registering 10 actions...');

  const timesheetReport: ActionHandler = {
    actionId: 'report.timesheet',
    name: 'Generate Timesheet Report',
    category: 'analytics',
    description: 'Generate a detailed timesheet report with breakdown and summary',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { startDate, endDate, employeeId } = request.payload || {};
      
      if (!startDate || !endDate) {
        return createResult(request.actionId, false, 'startDate and endDate are required', null, start);
      }

      try {
        const report = await generateTimesheetReport({
          workspaceId: request.workspaceId!,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          employeeId
        });
        return createResult(request.actionId, true, 'Timesheet report generated', report, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to generate timesheet report: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const weeklyReport: ActionHandler = {
    actionId: 'report.weekly',
    name: 'Get Weekly Report',
    category: 'analytics',
    description: 'Get weekly timesheet summary for a specific week',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { weekOf, employeeId } = request.payload || {};
      
      try {
        const report = await getWeeklyReport(
          request.workspaceId!,
          weekOf ? new Date(weekOf) : new Date(),
          employeeId
        );
        return createResult(request.actionId, true, 'Weekly report retrieved', report, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to get weekly report: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const monthlyReport: ActionHandler = {
    actionId: 'report.monthly',
    name: 'Get Monthly Report',
    category: 'analytics',
    description: 'Get monthly timesheet summary for a specific month',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { month, employeeId } = request.payload || {};
      
      try {
        const report = await getMonthlyReport(
          request.workspaceId!,
          month ? new Date(month) : new Date(),
          employeeId
        );
        return createResult(request.actionId, true, 'Monthly report retrieved', report, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to get monthly report: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const complianceReport: ActionHandler = {
    actionId: 'report.compliance',
    name: 'Get Compliance Report',
    category: 'compliance',
    description: 'Get compliance breakdown and violations for a period',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      const { startDate, endDate } = request.payload || {};
      
      if (!startDate || !endDate) {
        return createResult(request.actionId, false, 'startDate and endDate are required', null, start);
      }

      try {
        const report = await getComplianceReport(
          request.workspaceId!,
          new Date(startDate),
          new Date(endDate)
        );
        return createResult(request.actionId, true, 'Compliance report retrieved', report, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to get compliance report: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const payrollSummary: ActionHandler = {
    actionId: 'report.payroll_summary',
    name: 'Get Payroll Summary',
    category: 'payroll',
    description: 'Get a structured summary of recent payroll runs',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const recentRuns = await db.query.payrollRuns.findMany({
          where: eq(payrollRuns.workspaceId, request.workspaceId!),
          orderBy: [desc(payrollRuns.periodEnd)],
          limit: request.payload?.limit || 5,
        });

        const runIds = recentRuns.map(r => r.id);
        const allEntries = runIds.length > 0
          ? await db.query.payrollEntries.findMany({
              where: inArray(payrollEntries.payrollRunId, runIds),
            })
          : [];

        const entriesByRun: Record<string, typeof allEntries> = {};
        for (const e of allEntries) {
          const rid = e.payrollRunId;
          if (!entriesByRun[rid]) entriesByRun[rid] = [];
          entriesByRun[rid].push(e);
        }

        const summary = recentRuns.map(run => {
          const entries = entriesByRun[run.id] || [];
          const totalGross = entries.reduce((sum, entry) => sum + Number(entry.grossPay || 0), 0);
          const totalNet = entries.reduce((sum, entry) => sum + Number(entry.netPay || 0), 0);
          return {
            id: run.id,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            status: run.status,
            employeeCount: entries.length,
            totalGross,
            totalNet,
            createdAt: run.createdAt
          };
        });

        return createResult(request.actionId, true, 'Payroll summary retrieved', { runs: summary }, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to get payroll summary: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const revenueForecast: ActionHandler = {
    actionId: 'analytics.revenue_forecast',
    name: 'Revenue Forecast',
    category: 'analytics',
    description: 'Get revenue projections and unbilled work summary',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const forecast = await getRevenueForecast(request.workspaceId!);
        return createResult(request.actionId, true, 'Revenue forecast retrieved', forecast, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to get revenue forecast: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const clientHealthScore: ActionHandler = {
    actionId: 'analytics.client_health_score',
    name: 'Client Health Score',
    category: 'analytics',
    description: 'Analyze client health based on billing, activity, and contract status',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const workspaceId = request.workspaceId!;
        const allClients = await db.query.clients.findMany({
          where: eq(clients.workspaceId, workspaceId),
        });

        const healthScores = await Promise.all(allClients.map(async (client) => {
          // 1. Billing: Overdue balance
          // CATEGORY C — Raw SQL retained: SUM( | Tables: invoices | Verified: 2026-03-23
          const overdueInvoices = await typedQuery(sql`
            SELECT SUM(total::numeric) as total_overdue
            FROM invoices
            WHERE workspace_id = ${workspaceId}
              AND client_id = ${client.id}
              AND status = 'sent'
              AND due_date < NOW()
          `);
          const overdueAmount = Number((overdueInvoices as any[])[0]?.total_overdue || 0);

          // 2. Activity: Active shifts in last 30 days
          // CATEGORY C — Raw SQL retained: Count( | Tables: shifts | Verified: 2026-03-23
          const activeShifts = await typedCount(sql`
            SELECT COUNT(*) as count
            FROM shifts
            WHERE workspace_id = ${workspaceId}
              AND client_id = ${client.id}
              AND start_time >= NOW() - INTERVAL '30 days'
          `);
          const shiftCount = Number(activeShifts || 0);

          // Simple health score calculation
          let score = 100;
          if (overdueAmount > 5000) score -= 40;
          else if (overdueAmount > 1000) score -= 20;
          
          if (shiftCount === 0) score -= 30;
          else if (shiftCount < 5) score -= 10;

          return {
            clientId: client.id,
            name: client.companyName || client.firstName + ' ' + client.lastName,
            score: Math.max(0, score),
            metrics: {
              overdueAmount,
              recentShiftCount: shiftCount,
              contractStatus: 'active' // Simplified for now
            }
          };
        }));

        return createResult(request.actionId, true, 'Client health scores calculated', { clients: healthScores }, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to calculate client health scores: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const overtimeRisk: ActionHandler = {
    actionId: 'analytics.overtime_risk',
    name: 'Overtime Risk Analysis',
    category: 'analytics',
    description: 'Identify employees at risk of hitting overtime this week',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const workspaceId = request.workspaceId!;
        // Start of current week (Monday)
        const now = new Date();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (now.getDay() + 6) % 7);
        monday.setHours(0, 0, 0, 0);

        // CATEGORY C — Raw SQL retained: GROUP BY | Tables: employees, time_entries | Verified: 2026-03-23
        const weeklyHours = await typedQuery(sql`
          SELECT 
            e.id as "employeeId",
            e.first_name || ' ' || e.last_name as "name",
            SUM(te.total_hours::numeric) as "hoursThisWeek"
          FROM employees e
          JOIN time_entries te ON e.id = te.employee_id
          WHERE e.workspace_id = ${workspaceId}
            AND te.clock_in >= ${monday.toISOString()}
            AND te.status = 'approved'
          GROUP BY e.id, e.first_name, e.last_name
          HAVING SUM(te.total_hours::numeric) > 32
        `);

        const atRiskEmployees = (weeklyHours as any[]).map(row => ({
          employeeId: row.employeeId,
          name: row.name,
          hoursThisWeek: Number(row.hoursThisWeek),
          risk: Number(row.hoursThisWeek) > 40 ? 'high' : 'medium'
        }));

        return createResult(request.actionId, true, 'Overtime risk analysis complete', { atRiskEmployees }, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to analyze overtime risk: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const complianceRate: ActionHandler = {
    actionId: 'analytics.compliance_rate',
    name: 'Compliance Rate Analysis',
    category: 'compliance',
    description: 'Analyze employee certification compliance and upcoming expirations',
    requiredRoles: ['manager', 'owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const workspaceId = request.workspaceId!;
        const totalEmployees = await db.query.employees.findMany({
          where: eq(employees.workspaceId, workspaceId)
        });

        const now = new Date();
        const in60Days = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

        const certifications = await db.query.trainingCertifications.findMany({
          where: eq(trainingCertifications.workspaceId, workspaceId)
        });

        const expired = certifications.filter(c => c.expiryDate && new Date(c.expiryDate) < now).length;
        const expiringSoon = certifications.filter(c => 
          c.expiryDate && 
          new Date(c.expiryDate) >= now && 
          new Date(c.expiryDate) <= in60Days
        ).length;

        const compliantCount = totalEmployees.length - expired;
        const rate = totalEmployees.length > 0 ? (compliantCount / totalEmployees.length) * 100 : 100;

        return createResult(request.actionId, true, 'Compliance rate analysis complete', {
          totalEmployees: totalEmployees.length,
          compliant: compliantCount,
          expiringSoon,
          expired,
          rate: Number(rate.toFixed(1))
        }, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to analyze compliance rate: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  const shiftProfitability: ActionHandler = {
    actionId: 'analytics.shift_profitability',
    name: 'Shift Profitability Analysis',
    category: 'analytics',
    description: 'Analyze gross margin and profitability by client',
    requiredRoles: ['owner', 'root_admin'],
    handler: async (request: ActionRequest): Promise<ActionResult> => {
      const start = Date.now();
      try {
        const workspaceId = request.workspaceId!;
        
        // CATEGORY C — Raw SQL retained: GROUP BY | Tables: clients, time_entries | Verified: 2026-03-23
        const profitabilityData = await typedQuery(sql`
          SELECT 
            c.id as "clientId",
            c.company_name as "name",
            SUM(te.total_hours::numeric * te.captured_bill_rate::numeric) as "revenue",
            SUM(te.total_hours::numeric * te.captured_pay_rate::numeric) as "cost"
          FROM clients c
          JOIN time_entries te ON c.id = te.client_id
          WHERE c.workspace_id = ${workspaceId}
            AND te.status = 'approved'
            AND te.clock_in >= NOW() - INTERVAL '30 days'
          GROUP BY c.id, c.company_name
        `);

        const byClient = (profitabilityData as any[]).map(row => {
          const revenue = Number(row.revenue || 0);
          const cost = Number(row.cost || 0);
          const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0;
          
          return {
            clientId: row.clientId,
            name: row.name || 'Unknown Client',
            revenue,
            cost,
            margin: Number(margin.toFixed(1))
          };
        });

        return createResult(request.actionId, true, 'Shift profitability analysis complete', { byClient }, start);
      } catch (error: unknown) {
        return createResult(request.actionId, false, `Failed to analyze shift profitability: ${(error instanceof Error ? error.message : String(error))}`, null, start);
      }
    },
  };

  helpaiOrchestrator.registerAction(timesheetReport);
  helpaiOrchestrator.registerAction(weeklyReport);
  helpaiOrchestrator.registerAction(monthlyReport);
  helpaiOrchestrator.registerAction(complianceReport);
  helpaiOrchestrator.registerAction(payrollSummary);
  helpaiOrchestrator.registerAction(revenueForecast);
  helpaiOrchestrator.registerAction(clientHealthScore);
  helpaiOrchestrator.registerAction(overtimeRisk);
  helpaiOrchestrator.registerAction(complianceRate);
  helpaiOrchestrator.registerAction(shiftProfitability);
  

  helpaiOrchestrator.registerAction(mkAction('analytics.generate_insights', async (params) => {
    const { workspaceId, domain, question } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const result = await trinityBusinessIntelligence.deepAnalysis(workspaceId, domain || 'all', question);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('analytics.workforce_summary', async (params) => {
    const { workspaceId, weeksBack } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const result = await trinityBusinessIntelligence.scanSchedulePatterns(workspaceId, weeksBack || 4);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('analytics.payroll_summary', async (params) => {
    const { workspaceId, periodMonths } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const result = await trinityBusinessIntelligence.scanPayrollPatterns(workspaceId, periodMonths || 3);
    return result;
  }));

  helpaiOrchestrator.registerAction(mkAction('analytics.employee_performance', async (params) => {
    const { workspaceId, employeeId, periodDays = 30 } = params;
    if (!workspaceId) return { error: 'workspaceId required' };
    const since = new Date(Date.now() - periodDays * 86400000);
    const baseQuery = db.select({
      employeeId: sql`time_entries.employee_id`,
      totalHoursSum: sql`SUM(time_entries.total_hours::numeric)`,
      entryCount: sql`COUNT(*)`,
      missedPunches: sql`SUM(CASE WHEN time_entries.clock_out IS NULL THEN 1 ELSE 0 END)`,
    })
      .from(sql`time_entries`)
      .where(sql`time_entries.workspace_id = ${workspaceId} AND time_entries.clock_in >= ${since}${employeeId ? sql` AND time_entries.employee_id = ${employeeId}` : sql``}`)
      .groupBy(sql`time_entries.employee_id`)
      .orderBy(sql`SUM(time_entries.total_hours::numeric) DESC`);
    const rows = await baseQuery.catch(() => []);
    return { periodDays, since, employees: rows.map((r: any) => ({
      employeeId: r.employeeId,
      totalHours: +(parseFloat(String(r.totalHoursSum || 0))).toFixed(1),
      shiftsWorked: parseInt(String(r.entryCount || 0)),
      missedPunches: parseInt(String(r.missedPunches || 0)),
    })) };
  }));

  log.info(`[Trinity Reports+Analytics] Registered 14 actions successfully`);
}
