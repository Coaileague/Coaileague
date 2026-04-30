/**
 * PAYROLL READINESS SCANNER
 * =========================
 * Pre-payroll 48-hour data readiness scan.
 * Flags every active employee that is missing data required to process payroll:
 *   1. Pay rate (hourlyRate if payType='hourly', payAmount if payType='salary')
 *   2. Direct deposit (active record in employee_bank_accounts)
 *   3. Worker type (workerType / payType not null)
 *
 * Canonical triggers:
 *   - Scheduled: 48h before each workspace's next payroll run date
 *   - Manual: manualTriggers.payrollReadinessScan(workspaceId)
 *   - Trinity: org.payroll_readiness_scan action in actionRegistry
 *
 * Output: structured ReadinessReport + platformEventBus event + notification to org owner
 */

import { db } from '../../db';
import { employees, workspaces, employeeBankAccounts } from '@shared/schema';
import { eq, and, not } from 'drizzle-orm';
import { platformEventBus } from '../platformEventBus';
import { isPlaidConfigured } from '../partners/plaidService';
import { createLogger } from '../../lib/logger';

const log = createLogger('payroll-readiness-scanner');

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReadinessFlag = {
  employeeId: string;
  employeeName: string;
  severity: 'critical' | 'warning';
  issues: ReadinessIssue[];
  isOrgLevel?: boolean;
};

export type ReadinessIssue = {
  code: string;
  field: string;
  description: string;
};

export type PayrollReadinessReport = {
  workspaceId: string;
  scannedAt: string;
  totalActiveEmployees: number;
  readyCount: number;
  flaggedCount: number;
  criticalCount: number;
  warningCount: number;
  flags: ReadinessFlag[];
  summary: string;
  orgBankConnected: boolean;
  employeesWithoutDirectDeposit: number;
  employeesRequiringManualNacha: number;
};

// ─── Core scan logic ─────────────────────────────────────────────────────────

export async function scanPayrollReadiness(workspaceId: string): Promise<PayrollReadinessReport> {
  const scannedAt = new Date().toISOString();

  // 0. Check if org has a connected Plaid funding bank account
  let orgBankConnected = false;
  try {
    if (isPlaidConfigured()) {
      const { orgFinanceSettings } = await import('@shared/schema');
      const [orgFinance] = await db
        .select({ plaidItemId: orgFinanceSettings.plaidItemId })
        .from(orgFinanceSettings)
        .where(eq(orgFinanceSettings.workspaceId, workspaceId))
        .limit(1);
      orgBankConnected = !!(orgFinance?.plaidItemId);
    }
  } catch (e) { log.warn('[PayrollReadiness] bank connection check failed:', e); orgBankConnected = false; }

  // 1. Pull all active employees for this workspace
  const activeEmployees = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      hourlyRate: employees.hourlyRate,
      payAmount: employees.payAmount,
      payType: employees.payType,
      workerType: employees.workerType,
    })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.status as any, 'active'),
      )
    );

  // 2. Pull all active bank accounts for this workspace (one query, then match in memory)
  const bankAccountRows = await db
    .select({ employeeId: employeeBankAccounts.employeeId })
    .from(employeeBankAccounts)
    .where(
      and(
        eq(employeeBankAccounts.workspaceId, workspaceId),
        eq(employeeBankAccounts.isActive, true),
      )
    )
    .catch(() => []);

  const employeesWithBankAccount = new Set<string>(
    bankAccountRows.map((r) => r.employeeId)
  );

  // 3. Evaluate each employee
  const flags: ReadinessFlag[] = [];

  for (const emp of activeEmployees) {
    const issues: ReadinessIssue[] = [];
    const name = `${emp.firstName} ${emp.lastName}`;

    // Issue: missing worker type
    if (!emp.workerType) {
      issues.push({
        code: 'MISSING_WORKER_TYPE',
        field: 'workerType',
        description: `${name} has no worker type (W-2/1099/contractor). Required for tax withholding classification.`,
      });
    }

    // Issue: missing pay rate
    const isHourly = !emp.payType || emp.payType === 'hourly' || emp.payType === 'contractor';
    const isSalaried = emp.payType === 'salary' || emp.payType === 'salaried';
    if (isHourly && (!emp.hourlyRate || parseFloat(String(emp.hourlyRate)) === 0)) {
      issues.push({
        code: 'MISSING_HOURLY_RATE',
        field: 'hourlyRate',
        description: `${name} is hourly but has no hourly rate on file. Payroll cannot be calculated without it.`,
      });
    } else if (isSalaried && (!emp.payAmount || parseFloat(String(emp.payAmount)) === 0)) {
      issues.push({
        code: 'MISSING_SALARY_AMOUNT',
        field: 'payAmount',
        description: `${name} is salaried but has no salary amount on file. Payroll cannot be calculated without it.`,
      });
    }

    // Issue: missing direct deposit bank account
    if (!employeesWithBankAccount.has(emp.id)) {
      issues.push({
        code: 'MISSING_DIRECT_DEPOSIT',
        field: 'employee_bank_accounts',
        description: `${name} has no active bank account on file. Direct deposit will fail — a paper check fallback may be needed.`,
      });
    }

    if (issues.length > 0) {
      // Severity: CRITICAL if pay rate or worker type missing (payroll won't run without these)
      // WARNING if only bank account missing (payroll runs but deposit fails)
      const hasCritical = issues.some(i =>
        ['MISSING_HOURLY_RATE', 'MISSING_SALARY_AMOUNT', 'MISSING_WORKER_TYPE'].includes(i.code)
      );
      flags.push({
        employeeId: emp.id,
        employeeName: name,
        severity: hasCritical ? 'critical' : 'warning',
        issues,
      });
    }
  }

  // ── Org-level blocking check: funding bank account ───────────────────────
  // When Plaid is configured but no org bank is connected, ACH disbursement
  // will be physically impossible — surface as a CRITICAL blocking flag so
  // it appears in the flags array (not just as a summary text note).
  if (isPlaidConfigured() && !orgBankConnected) {
    flags.push({
      employeeId: 'ORG',
      employeeName: 'Organization',
      severity: 'critical',
      isOrgLevel: true,
      issues: [{
        code: 'ORG_BANK_NOT_CONNECTED',
        field: 'org_finance_settings.plaid_item_id',
        description: 'No organization funding bank account connected. ACH payroll disbursement will be blocked until a bank account is linked in Settings → Payroll.',
      }],
    });
  }

  const employeeFlags = flags.filter(f => !f.isOrgLevel);
  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const warningCount = flags.filter(f => f.severity === 'warning').length;
  const readyCount = activeEmployees.length - employeeFlags.length;
  const employeesWithoutDirectDeposit = employeeFlags.filter(f =>
    f.issues.some(i => i.code === 'MISSING_DIRECT_DEPOSIT')
  ).length;
  const employeesRequiringManualNacha = employeesWithoutDirectDeposit;

  const orgBankBlocking = flags.some(f => f.isOrgLevel && f.severity === 'critical');
  const summary = employeeFlags.length === 0 && !orgBankBlocking
    ? `All ${activeEmployees.length} active employee(s) are payroll-ready.`
    : orgBankBlocking && employeeFlags.length === 0
      ? `Organization bank account not connected — ACH disbursement blocked. ${activeEmployees.length} employee(s) are otherwise payroll-ready.`
      : `${employeeFlags.length} of ${activeEmployees.length} employee(s) have issues: ${criticalCount} critical (will block payroll), ${warningCount} warning (direct deposit at risk).${orgBankBlocking ? ' BLOCKING: Organization bank account not connected.' : ''}`;

  return {
    workspaceId,
    scannedAt,
    totalActiveEmployees: activeEmployees.length,
    readyCount,
    flaggedCount: employeeFlags.length,
    criticalCount,
    warningCount,
    flags,
    summary,
    orgBankConnected,
    employeesWithoutDirectDeposit,
    employeesRequiringManualNacha,
  };
}

// ─── Workspace-scoped entry point (used by scheduler + Trinity action) ────────

export async function runPayrollReadinessScanForWorkspace(workspaceId: string): Promise<PayrollReadinessReport> {
  const report = await scanPayrollReadiness(workspaceId);

  // Emit event so Trinity can react, log, and surface insights
  platformEventBus.publish({
    type: 'payroll_run_approved' as any, // reuse closest type; Trinity listens on '*' wildcard too
    category: 'payroll',
    title: 'Payroll Readiness Scan Complete',
    description: report.summary,
    workspaceId,
    // @ts-expect-error — TS migration: fix in refactoring sprint
    visibility: 'workspace',
    metadata: {
      scanType: 'payroll_readiness_48h',
      scannedAt: report.scannedAt,
      totalActiveEmployees: report.totalActiveEmployees,
      readyCount: report.readyCount,
      flaggedCount: report.flaggedCount,
      criticalCount: report.criticalCount,
      warningCount: report.warningCount,
      criticalEmployees: report.flags
        .filter(f => f.severity === 'critical')
        .map(f => ({ id: f.employeeId, name: f.employeeName, issues: f.issues.map(i => i.code) })),
    },
  }).catch((err) => log.warn('[payrollReadinessScanner] Fire-and-forget failed:', err));

  // Notify org owner if there are flagged employees
  if (report.flaggedCount > 0) {
    try {
      const [ws] = await db.select({ id: workspaces.id, ownerId: workspaces.ownerId })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);

      if (ws?.ownerId) {
        // @ts-expect-error — TS migration: fix in refactoring sprint
        const { notificationService } = await import('../notificationService');
        const priorityIssues = report.flags
          .filter(f => f.severity === 'critical')
          .slice(0, 5)
          .map(f => `• ${f.employeeName}: ${f.issues.map(i => i.code).join(', ')}`)
          .join('\n');

        const message = [
          `Payroll readiness scan found ${report.flaggedCount} employee(s) with missing data:`,
          '',
          priorityIssues || `${report.warningCount} employee(s) missing direct deposit info.`,
          '',
          report.criticalCount > 0
            ? `ACTION REQUIRED: ${report.criticalCount} employee(s) will block payroll until resolved.`
            : `No critical blockers — but ${report.warningCount} employee(s) need bank accounts before disbursement.`,
        ].join('\n');

        await notificationService.createNotification({
          userId: ws.ownerId,
          workspaceId,
          type: 'payroll_readiness_alert',
          title: report.criticalCount > 0
            ? `Payroll Alert: ${report.criticalCount} Employee(s) Missing Critical Data`
            : `Payroll Notice: ${report.warningCount} Employee(s) Missing Direct Deposit`,
          message,
          priority: report.criticalCount > 0 ? 'high' : 'normal',
          idempotencyKey: `payroll_readiness_alert-${ws.id}-${new Date().toISOString().slice(0, 10)}`
        });
      }
    } catch (notifErr: any) {
      log.warn('Owner notification failed (non-blocking)', { error: notifErr.message });
    }
  }

  log.info(`Scan complete — ws=${workspaceId}, total=${report.totalActiveEmployees}, flagged=${report.flaggedCount}, critical=${report.criticalCount}`);
  return report;
}

// ─── Platform-wide scan (used by manualTriggers.payrollReadinessScan) ────────

export async function runPayrollReadinessScanAllWorkspaces(): Promise<{
  workspacesScanned: number;
  totalFlagged: number;
  totalCritical: number;
  reports: PayrollReadinessReport[];
}> {
  const allWorkspaces = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.isSuspended, false),
        not(eq(workspaces.subscriptionStatus as any, 'cancelled'))
      )
    );

  const reports: PayrollReadinessReport[] = [];
  let totalFlagged = 0;
  let totalCritical = 0;

  for (const ws of allWorkspaces) {
    try {
      const report = await runPayrollReadinessScanForWorkspace(ws.id);
      reports.push(report);
      totalFlagged += report.flaggedCount;
      totalCritical += report.criticalCount;
    } catch (err: any) {
      log.error(`Scan failed for workspace ${ws.id}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  log.info(`Platform-wide scan complete — workspaces=${allWorkspaces.length}, flagged=${totalFlagged}, critical=${totalCritical}`);
  return {
    workspacesScanned: allWorkspaces.length,
    totalFlagged,
    totalCritical,
    reports,
  };
}
