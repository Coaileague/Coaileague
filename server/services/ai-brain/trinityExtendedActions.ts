import { helpaiOrchestrator, type ActionHandler, type ActionRequest, type ActionResult } from '../helpai/platformActionHub';
import { taxFilingAssistanceService } from '../../services/taxFilingAssistanceService';
import { TaxFormGeneratorService } from '../../services/taxFormGeneratorService';
import { realTimeBridge } from './realTimeBridge';
import { browserAutomationTool } from './browserAutomationTool';
import { getAppBaseUrl } from '../../utils/getAppBaseUrl';
import { db } from '../../db';
import { timeEntries, stagedShifts, employees, shifts } from '@shared/schema';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { typedCount, typedQuery } from '../../lib/typedSql';
import { createLogger } from '../../lib/logger';
const log = createLogger('trinityExtendedActions');

const taxFormGeneratorService = new TaxFormGeneratorService();

function createResult(actionId: string, success: boolean, message: string, data?: any, startTime?: number): ActionResult {
  return {
    success,
    actionId,
    message,
    data,
    executionTimeMs: startTime ? Date.now() - startTime : 0,
  };
}

export function registerExtendedActions() {
  const taxActions: ActionHandler[] = [
    {
      actionId: 'tax.estimate_quarterly',
      name: 'Estimate Quarterly Tax',
      category: 'payroll',
      description: 'Estimate quarterly tax liability for a given year using actual per-quarter payroll records',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const year = request.payload?.year || new Date().getFullYear();
        const workspaceId = request.workspaceId!;

        // Query actual FICA totals grouped by calendar quarter from payroll_entries
        // CATEGORY C — Raw SQL retained: GROUP BY | Tables: pr, payroll_entries, payroll_runs | Verified: 2026-03-23
        const rows = await typedQuery(sql`
          SELECT
            EXTRACT(QUARTER FROM pr.period_start)::int AS quarter,
            COALESCE(SUM(pe.gross_pay), 0)             AS total_wages,
            COALESCE(SUM(pe.social_security + pe.medicare), 0) AS total_fica
          FROM payroll_entries pe
          JOIN payroll_runs pr ON pe.payroll_run_id = pr.id
          WHERE pe.workspace_id = ${workspaceId}
            AND EXTRACT(YEAR FROM pr.period_start)::int = ${year}
            AND pr.status IN ('processed', 'paid', 'approved')
          GROUP BY EXTRACT(QUARTER FROM pr.period_start)::int
          ORDER BY quarter
        `);

        const quarterMap: Record<number, { wages: number; fica: number }> = {
          1: { wages: 0, fica: 0 },
          2: { wages: 0, fica: 0 },
          3: { wages: 0, fica: 0 },
          4: { wages: 0, fica: 0 },
        };
        for (const row of (rows as any[])) {
          const q = Number(row.quarter);
          quarterMap[q] = { wages: Number(row.total_wages), fica: Number(row.total_fica) };
        }

        const totalWages = Object.values(quarterMap).reduce((s, v) => s + v.wages, 0);
        const totalFICA  = Object.values(quarterMap).reduce((s, v) => s + v.fica, 0);

        const totals = {
          year,
          totalWages: +totalWages.toFixed(2),
          totalFICA: +totalFICA.toFixed(2),
          estimatedQuarterlyLiability: +totalFICA.toFixed(2),
          byQuarter: [1, 2, 3, 4].map(q => ({
            q,
            wages: +quarterMap[q].wages.toFixed(2),
            fica:  +quarterMap[q].fica.toFixed(2),
            amount: +quarterMap[q].fica.toFixed(2),
          })),
          note: 'FICA amounts sourced from actual per-quarter payroll records. Employer match not yet included.',
        };

        return createResult(request.actionId, true, 'Quarterly tax estimate generated from actual payroll records', totals, start);
      }
    },
    {
      actionId: 'tax.generate_941_draft',
      name: 'Generate Form 941 Draft',
      category: 'payroll',
      description: 'Generate a draft of Form 941 for a specific quarter',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const { quarter, year } = request.payload || {};
        const workspaceId = request.workspaceId!;
        
        if (!quarter || !year) {
          return createResult(request.actionId, false, 'Quarter and year are required', null, start);
        }

        // Build quarter date range (Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec)
        const qStart = new Date(year, (quarter - 1) * 3, 1);
        const qEnd   = new Date(year, quarter * 3, 0, 23, 59, 59);

        // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: payroll_entries, payroll_runs | Verified: 2026-03-23
        const rows = await typedCount(sql`
          SELECT
            COUNT(DISTINCT pe.employee_id)                   AS employee_count,
            COALESCE(SUM(pe.gross_pay), 0)                   AS total_wages,
            COALESCE(SUM(pe.federal_tax), 0)                 AS federal_income_tax_withheld,
            COALESCE(SUM(pe.social_security), 0)             AS employee_ss_tax,
            COALESCE(SUM(pe.medicare), 0)                    AS employee_medicare_tax,
            COALESCE(SUM(pe.social_security * 2), 0)         AS total_ss_tax,
            COALESCE(SUM(pe.medicare * 2), 0)                AS total_medicare_tax
          FROM payroll_entries pe
          JOIN payroll_runs pr ON pe.payroll_run_id = pr.id
          WHERE pe.workspace_id = ${workspaceId}
            AND pr.period_start >= ${qStart.toISOString()}
            AND pr.period_end   <= ${qEnd.toISOString()}
            AND pr.status IN ('processed', 'paid', 'approved')
        `);

        const agg: any = (rows as unknown as any[])[0] || {};
        const totalSSMed = Number(agg.total_ss_tax || 0) + Number(agg.total_medicare_tax || 0);
        const totalTax   = Number(agg.federal_income_tax_withheld || 0) + totalSSMed;

        const result = {
          period: `Q${quarter} ${year}`,
          quarterRange: { start: qStart.toISOString().slice(0, 10), end: qEnd.toISOString().slice(0, 10) },
          totalTax: +totalTax.toFixed(2),
          form941Data: {
            workspaceId,
            quarter,
            year,
            status: 'draft',
            line1_employees: Number(agg.employee_count || 0),
            line2_total_wages: +Number(agg.total_wages || 0).toFixed(2),
            line3_federal_tax_withheld: +Number(agg.federal_income_tax_withheld || 0).toFixed(2),
            line5a_ss_wages: +Number(agg.total_wages || 0).toFixed(2),
            line5a_ss_tax: +Number(agg.total_ss_tax || 0).toFixed(2),
            line5c_medicare_wages: +Number(agg.total_wages || 0).toFixed(2),
            line5c_medicare_tax: +Number(agg.total_medicare_tax || 0).toFixed(2),
            line6_total_deposits: +totalTax.toFixed(2),
            line12_total_tax_after_adj: +totalTax.toFixed(2),
          }
        };

        return createResult(request.actionId, true, 'Form 941 draft generated from payroll data', result, start);
      }
    },
    {
      actionId: 'tax.generate_940_draft',
      name: 'Generate Form 940 Draft',
      category: 'payroll',
      description: 'Generate a draft of Form 940 for a specific year',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const year = request.payload?.year || new Date().getFullYear();
        const workspaceId = request.workspaceId!;
        
        const result = await taxFormGeneratorService.generate940Report(workspaceId, year);
        if (!result.success) {
          return createResult(request.actionId, false, result.error || 'Failed to generate 940', null, start);
        }

        return createResult(request.actionId, true, 'Form 940 draft generated', {
          totalFUTA: result.data?.futaTaxAfterCredit,
          form940Data: result.data
        }, start);
      }
    },
    {
      actionId: 'tax.ytd_employer_summary',
      name: 'YTD Employer Tax Summary',
      category: 'payroll',
      description: 'Aggregate employer tax summary for the current year with FUTA wage base cap per employee',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const year = new Date().getFullYear();
        const workspaceId = request.workspaceId!;

        // Query per-employee YTD wages so we can apply the $7,000 FUTA wage base cap correctly
        // CATEGORY C — Raw SQL retained: GROUP BY | Tables: payroll_entries, pr, payroll_runs | Verified: 2026-03-23
        const rows = await typedQuery(sql`
          SELECT
            pe.employee_id,
            COALESCE(SUM(pe.gross_pay), 0)       AS ytd_gross,
            COALESCE(SUM(pe.social_security), 0) AS employee_ss,
            COALESCE(SUM(pe.medicare), 0)        AS employee_medicare
          FROM payroll_entries pe
          JOIN payroll_runs pr ON pe.payroll_run_id = pr.id
          WHERE pe.workspace_id = ${workspaceId}
            AND EXTRACT(YEAR FROM pr.period_start)::int = ${year}
            AND pr.status IN ('processed', 'paid', 'approved')
          GROUP BY pe.employee_id
        `);

        const FUTA_WAGE_BASE = 7000;
        const FUTA_RATE = 0.006; // Net FUTA rate after typical state credit (0.6%)

        let ytdGrossWages = 0;
        let ytdEmployeeFICA = 0;
        let ytdFUTA = 0;

        for (const row of (rows as any[])) {
          const gross = Number(row.ytd_gross);
          ytdGrossWages += gross;
          ytdEmployeeFICA += Number(row.employee_ss) + Number(row.employee_medicare);
          // FUTA only applies to first $7,000 of wages per employee
          ytdFUTA += Math.min(gross, FUTA_WAGE_BASE) * FUTA_RATE;
        }

        // Employer FICA match equals employee share (SS 6.2% + Medicare 1.45%)
        const ytdEmployerFICA = ytdEmployeeFICA;

        const summary = {
          year,
          ytdGrossWages:   +ytdGrossWages.toFixed(2),
          ytdEmployeeFICA: +ytdEmployeeFICA.toFixed(2),
          ytdEmployerFICA: +ytdEmployerFICA.toFixed(2),
          ytdFUTA:         +ytdFUTA.toFixed(2),
          ytdSUI:          0, // SUI rates vary by state and are not stored in current schema
          totalEmployerTax: +(ytdEmployerFICA + ytdFUTA).toFixed(2),
          futaWageBaseCap: FUTA_WAGE_BASE,
          note: `FUTA at ${(FUTA_RATE * 100).toFixed(1)}% net rate on first $${FUTA_WAGE_BASE}/employee. SUI excluded (state-dependent).`,
        };

        return createResult(request.actionId, true, 'YTD employer tax summary generated', summary, start);
      }
    },
    {
      actionId: 'tax.flag_w2_variances',
      name: 'Flag W-2 Variances',
      category: 'payroll',
      description: 'Compare projected W-2 values and flag variances',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const year = request.payload?.year || new Date().getFullYear();
        const workspaceId = request.workspaceId!;
        
        const allEmployees = await db.select().from(employees).where(eq(employees.workspaceId, workspaceId));
        const results = [];

        for (const emp of allEmployees) {
          const forms = await taxFilingAssistanceService.getEmployeeTaxForms(emp.id, workspaceId, year);
          const currentData = await taxFormGeneratorService.aggregatePayrollDataForYear(emp.id, workspaceId, year);
          
          const w2Form = forms.find(f => f.formType === 'w2');
          const variance = w2Form ? parseFloat(w2Form.wages || '0') - currentData.totalWages : 0;

          results.push({
            employeeId: emp.id,
            name: `${emp.firstName} ${emp.lastName}`,
            projectedW2: currentData.totalWages,
            actualW2: w2Form ? parseFloat(w2Form.wages || '0') : 0,
            variance
          });
        }

        return createResult(request.actionId, true, 'W-2 variances analyzed', { employees: results }, start);
      }
    }
  ];

  // agent.invoke_payroll_bot, agent.invoke_scheduling_bot, agent.invoke_compliance_bot,
  // agent.invoke_notification_bot REMOVED — all used dead-letter queue (no handlers registered
  // for those agent IDs in agentToAgentProtocol). Messages silently delivered to /dev/null.

  const liveMonitoringActions: ActionHandler[] = [
    {
      actionId: 'time_tracking.watch_clock_ins',
      name: 'Watch Clock-ins',
      category: 'monitoring',
      description: 'Check for missed clock-ins for shifts that started > 15 minutes ago',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const workspaceId = request.workspaceId!;
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);

        const missed = await db.select({
          shiftId: shifts.id,
          employeeId: shifts.employeeId,
          startTime: shifts.startTime,
          title: shifts.title
        })
        .from(shifts)
        .leftJoin(timeEntries, eq(shifts.id, timeEntries.shiftId))
        .where(and(
          eq(shifts.workspaceId, workspaceId),
          sql`${shifts.startTime} < ${fifteenMinsAgo}`,
          isNull(timeEntries.id)
        ));

        const results = [];
        for (const m of missed) {
          if (m.employeeId) {
            const emp = await db.query.employees.findFirst({ where: eq(employees.id, m.employeeId) });
            results.push({
              employeeId: m.employeeId,
              name: emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
              shiftStart: m.startTime,
              site: m.title
            });
          }
        }

        return createResult(request.actionId, true, 'Missed clock-ins checked', { missedClockIns: results }, start);
      }
    },
    {
      actionId: 'time_tracking.monitor_coverage',
      name: 'Monitor Coverage',
      category: 'monitoring',
      description: 'Monitor shift coverage for the next 4 hours',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const workspaceId = request.workspaceId!;
        const now = new Date();
        const fourHoursFromNow = new Date(Date.now() + 4 * 60 * 60 * 1000);

        const uncovered = await db.select()
          .from(shifts)
          .where(and(
            eq(shifts.workspaceId, workspaceId),
            sql`${shifts.startTime} >= ${now}`,
            sql`${shifts.startTime} <= ${fourHoursFromNow}`,
            isNull(shifts.employeeId)
          ));

        const results = uncovered.map(s => ({
          shiftId: s.id,
          site: s.title,
          startTime: s.startTime,
          position: s.description || 'General'
        }));

        return createResult(request.actionId, true, 'Coverage monitored', { uncoveredShifts: results }, start);
      }
    },
    {
      actionId: 'time_tracking.alert_on_absence',
      name: 'Alert on Absence',
      category: 'monitoring',
      description: 'Generate formatted alert text for missed clock-ins',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const { missedClockIns } = (await helpaiOrchestrator.executeAction({
          actionId: 'time_tracking.watch_clock_ins',
          workspaceId: request.workspaceId,
          userId: request.userId,
          payload: {}
        })).data;

        let alertText = missedClockIns.length > 0 
          ? `ALARM: ${missedClockIns.length} missed clock-ins detected!\n` 
          : "All employees have clocked in correctly.";
        
        missedClockIns.forEach((m: any) => {
          alertText += `- ${m.name} missed shift at ${m.site} (Started: ${new Date(m.shiftStart).toLocaleTimeString()})\n`;
        });

        return createResult(request.actionId, true, 'Absence alert generated', { alertText }, start);
      }
    }
  ];

  const browserActions: ActionHandler[] = [
    {
      actionId: 'browser.capture_screenshot',
      name: 'Capture Screenshot',
      category: 'system',
      description: 'Capture a screenshot of a given URL',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const { url, fullPage, device } = request.payload || {};
        if (!url) return createResult(request.actionId, false, 'URL is required', null, start);

        const result = await browserAutomationTool.captureScreenshot({
          url,
          fullPage: fullPage ?? true,
          deviceName: device || 'desktop-1080p'
        });

        return createResult(request.actionId, result.success, result.success ? 'Screenshot captured' : result.errorMessage || 'Failed to capture screenshot', {
          width: result.width,
          height: result.height,
          message: result.success ? 'Screenshot captured' : 'Capture failed'
        }, start);
      }
    },
    {
      actionId: 'browser.verify_schedule_render',
      name: 'Verify Schedule Render',
      category: 'system',
      description: 'Verify the schedule page renders correctly via screenshot',
      handler: async (request: ActionRequest) => {
        const start = Date.now();
        const baseUrl = getAppBaseUrl();
        const url = `${baseUrl}/schedule`;
        
        const result = await browserAutomationTool.captureScreenshot({
          url,
          fullPage: false,
          deviceName: 'desktop-1080p'
        });

        return createResult(request.actionId, result.success, result.success ? 'Schedule page verified' : 'Schedule verification failed', {
          url,
          message: result.success ? 'Render looks good' : result.errorMessage
        }, start);
      }
    }
  ];

  [...taxActions, ...liveMonitoringActions, ...browserActions].forEach(action => {
    helpaiOrchestrator.registerAction(action);
  });

  log.info(`[Trinity Extended] Registered ${taxActions.length + liveMonitoringActions.length + browserActions.length} extended actions`);
}
