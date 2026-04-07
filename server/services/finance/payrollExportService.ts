import { db } from "../../db";
import { eq, and } from "drizzle-orm";
import { payrollRuns, payrollEntries, employees, orgFinanceSettings, billingAuditLog } from "@shared/schema";
import { getOrCreateSettings } from "./financeSettingsService";
import { createLogger } from '../../lib/logger';
const log = createLogger('payrollExportService');


interface ExportEarning {
  type: string;
  hours: number;
  rate: number;
  amount: number;
}

interface ExportEmployee {
  employee_reference_id: string;
  first_name: string;
  last_name: string;
  earnings: ExportEarning[];
  gross_pay: number;
  net_pay: number;
  deductions?: {
    federal_tax: number;
    state_tax: number;
    social_security: number;
    medicare: number;
  };
}

interface ExportPayload {
  company_id: string;
  pay_period: {
    start_date: string;
    end_date: string;
    pay_date: string;
  };
  employees: ExportEmployee[];
  auto_approve: boolean;
  provider_type: string;
  metadata: {
    org_id: string;
    workspace_id: string;
    payroll_run_id: string;
    generated_at: string;
  };
}

export async function generateExportPayload(
  payrollRunId: string,
  workspaceId: string,
  providerType: string
): Promise<ExportPayload> {
  const [run] = await db.select().from(payrollRuns)
    .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.workspaceId, workspaceId)));

  if (!run) throw new Error("Payroll run not found");

  const entries = await db.select().from(payrollEntries)
    .where(eq(payrollEntries.payrollRunId, run.id));

  const settings = await getOrCreateSettings(workspaceId);

  const allEmps = await db.select().from(employees)
    .where(eq(employees.workspaceId, workspaceId));
  const empMap = new Map(allEmps.map(e => [e.id, e]));

  const exportEmployees: ExportEmployee[] = entries.map(entry => {
    const emp = empMap.get(entry.employeeId);
    const rate = parseFloat(entry.hourlyRate?.toString() || "0");
    const regHrs = parseFloat(entry.regularHours?.toString() || "0");
    const otHours = parseFloat(entry.overtimeHours?.toString() || "0");
    const otRate = rate * 1.5;
    const earnings: ExportEarning[] = [{
      type: "regular",
      hours: regHrs,
      rate,
      amount: regHrs * rate,
    }];

    if (otHours > 0) {
      earnings.push({
        type: "overtime",
        hours: otHours,
        rate: otRate,
        amount: otHours * otRate,
      });
    }

    return {
      employee_reference_id: entry.employeeId,
      first_name: emp?.firstName || "",
      last_name: emp?.lastName || "",
      earnings,
      gross_pay: parseFloat(entry.grossPay?.toString() || "0"),
      net_pay: parseFloat(entry.netPay?.toString() || "0"),
      deductions: {
        federal_tax: parseFloat(entry.federalTax?.toString() || "0"),
        state_tax: parseFloat(entry.stateTax?.toString() || "0"),
        social_security: parseFloat(entry.socialSecurity?.toString() || "0"),
        medicare: parseFloat(entry.medicare?.toString() || "0"),
      },
    };
  });

  const payload: ExportPayload = {
    company_id: settings.payrollProviderExternalId || workspaceId,
    pay_period: {
      start_date: run.periodStart?.toISOString().split("T")[0] || "",
      end_date: run.periodEnd?.toISOString().split("T")[0] || "",
      pay_date: run.processedAt?.toISOString().split("T")[0] || new Date().toISOString().split("T")[0],
    },
    employees: exportEmployees,
    auto_approve: false,
    provider_type: providerType,
    metadata: {
      org_id: workspaceId,
      workspace_id: workspaceId,
      payroll_run_id: payrollRunId,
      generated_at: new Date().toISOString(),
    },
  };

  await db.insert(billingAuditLog).values({
    workspaceId,
    eventType: 'payroll_export_generated',
    actorType: 'system',
    idempotencyKey: `payroll-export-${payrollRunId}-${providerType}-${Date.now()}`,
    newState: {
      payrollRunId,
      providerType,
      employeeCount: exportEmployees.length,
      periodStart: payload.pay_period.start_date,
      periodEnd: payload.pay_period.end_date,
    },
  }).onConflictDoNothing().catch((err) => log.warn('[payrollExportService] Fire-and-forget failed:', err));

  return payload;
}

export function formatForCSV(payload: ExportPayload): string {
  const headers = [
    "employee_id", "first_name", "last_name",
    "regular_hours", "regular_rate", "regular_pay",
    "overtime_hours", "overtime_rate", "overtime_pay",
    "gross_pay", "net_pay",
    "federal_tax", "state_tax", "social_security", "medicare"
  ];

  const rows = payload.employees.map(emp => {
    const regular = emp.earnings.find(e => e.type === "regular") || { hours: 0, rate: 0, amount: 0 };
    const overtime = emp.earnings.find(e => e.type === "overtime") || { hours: 0, rate: 0, amount: 0 };
    return [
      emp.employee_reference_id,
      `"${emp.first_name}"`,
      `"${emp.last_name}"`,
      regular.hours, regular.rate, regular.amount,
      overtime.hours, overtime.rate, overtime.amount,
      emp.gross_pay, emp.net_pay,
      emp.deductions?.federal_tax || 0,
      emp.deductions?.state_tax || 0,
      emp.deductions?.social_security || 0,
      emp.deductions?.medicare || 0,
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}
