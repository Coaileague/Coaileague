/**
 * TRINITY PRE-EXECUTION VALIDATOR
 * ================================
 * Synchronous reasoning gate that runs before any data-mutating action executes.
 * Implements the 5 runtime checks identified in the Trinity Reasoning Audit:
 *
 *  Check 1 — Employment status guard    (FAIL→PASS: Section 1 #2)
 *  Check 2 — Zero amount guard          (PARTIAL→PASS: Section 1 #1)
 *  Check 3 — Financial bounds check     (PARTIAL→PASS: Section 4 #3)
 *  Check 4 — Invoice email presence     (already PASS in AI path — now universal)
 *  Check 5 — Billing cycle conflict     (FAIL→PASS: Section 4 #2)
 */

import { db } from '../../db';
import { employees, invoices, clients, payrollRuns, aiBrainActionLogs } from '@shared/schema';
import { and, eq, gte, lte, sql, desc } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';
const log = createLogger('preExecutionValidator');


export interface ValidationResult {
  approved: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
  confirmationPrompt?: string;
  checkName?: string;
}

const PASSED: ValidationResult = { approved: true };

function fail(reason: string, checkName: string): ValidationResult {
  return { approved: false, reason, checkName };
}

function confirm(confirmationPrompt: string, checkName: string): ValidationResult {
  return { approved: true, requiresConfirmation: true, confirmationPrompt, checkName };
}

/** Persist every validation decision to aiBrainActionLogs for audit trail */
async function logValidationDecision(
  actionId: string,
  workspaceId: string,
  result: ValidationResult,
): Promise<void> {
  try {
    await db.insert(aiBrainActionLogs).values({
      workspaceId,
      actionType: 'pre_execution_validation',
      result: result.approved ? (result.requiresConfirmation ? 'confirmation_required' : 'approved') : 'denied',
      actionData: {
        actionId,
        checkName: result.checkName ?? null,
        approved: result.approved,
        reason: result.reason ?? result.confirmationPrompt ?? null,
      },
      createdAt: new Date(),
    });
  } catch (err: any) {
    log.warn('[PreExecutionValidator] Audit log write failed (non-blocking):', err?.message);
  }
}

const INVOICE_SEND_ACTIONS = new Set([
  'billing.send_invoice',
  'billing.send_invoice_email',
  'billing.send_invoice_bulk',
  'billing.run_weekly_invoice',
  'billing.run_weekly',
]);

const PAYROLL_RUN_ACTIONS = new Set([
  'payroll.run_payroll',
  'payroll.execute_with_tracing',
]);

const INVOICE_CREATE_ACTIONS = new Set([
  'billing.generate_invoice',
  'billing.create_invoice',
  'billing.run_weekly_invoice',
  'billing.run_weekly',
]);

export async function validateBeforeExecution(
  actionId: string,
  payload: any,
  workspaceId: string,
): Promise<ValidationResult> {
  /** Log and return in one step */
  async function logAndReturn(result: ValidationResult): Promise<ValidationResult> {
    await logValidationDecision(actionId, workspaceId, result);
    return result;
  }

  try {
    // ─────────────────────────────────────────────────────────────────
    // CHECK 1 — Employment status (Section 1 #2 — was FAIL)
    // Any action carrying an employee target ID must verify the employee is active.
    // Normalize all common payload aliases to catch every path.
    // ─────────────────────────────────────────────────────────────────
    const employeeTargetId =
      payload?.employeeId ??
      payload?.employee_id ??
      payload?.officerId ??
      payload?.targetEmployeeId ??
      payload?.assignedEmployeeId;

    // Handle both scalar and array employee targets
    const employeeIds: string[] = [];
    if (employeeTargetId) employeeIds.push(employeeTargetId);
    if (Array.isArray(payload?.employeeIds)) employeeIds.push(...payload.employeeIds);

    for (const empId of employeeIds) {
      if (!empId) continue;
      const [emp] = await db
        .select({
          id: employees.id,
          isActive: employees.isActive,
          terminationDate: employees.terminationDate,
          status: (employees as any).status,   // 'active'|'inactive'|'terminated'|'suspended'
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(and(eq(employees.id, empId), eq(employees.workspaceId, workspaceId)))
        .limit(1);

      if (!emp) {
        return logAndReturn(fail(`Employee ${empId} not found in this workspace`, 'employment_status'));
      }
      const name = `${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim() || empId;
      // Block if deactivated OR if terminationDate is in the past (terminatedAt equivalent)
      const BLOCKED_STATUSES = ['terminated', 'inactive', 'deactivated', 'suspended'];
      if (emp.isActive === false || (emp.status && BLOCKED_STATUSES.includes(emp.status))) {
        return logAndReturn(fail(`Cannot act on ${name} — employee is ${emp.status || 'inactive'}/not active`, 'employment_status'));
      }
      if (emp.terminationDate && new Date(emp.terminationDate) <= new Date()) {
        return logAndReturn(fail(`Cannot act on ${name} — employee has a termination date (${emp.terminationDate})`, 'employment_status'));
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // CHECK 2 — Zero amount guard (Section 1 #1 — was PARTIAL)
    // Amounts of exactly 0 on financial mutations are almost always wrong.
    // ─────────────────────────────────────────────────────────────────
    const AMOUNT_FIELDS = ['amount', 'hourlyRate', 'billRate', 'payRate', 'rate'];
    for (const field of AMOUNT_FIELDS) {
      if (field in (payload ?? {})) {
        const val = payload[field];
        if (val !== undefined && val !== null && Number(val) === 0) {
          return logAndReturn(fail(
            `${field} cannot be zero — this is likely a data entry error. Update the value before proceeding.`,
            'zero_amount',
          ));
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // CHECK 3 — Financial bounds check (Section 4 #3 — was PARTIAL)
    // Compare against 90-day rolling average; flag if >300% variance.
    // ─────────────────────────────────────────────────────────────────
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    if (INVOICE_SEND_ACTIONS.has(actionId)) {
      const invoiceId = payload?.invoiceId ?? payload?.id;
      const clientId = payload?.clientId;
      if (invoiceId && clientId) {
        // Current invoice total
        const [currentInv] = await db
          .select({ total: invoices.total })
          .from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.workspaceId, workspaceId)))
          .limit(1);

        if (currentInv) {
          const currentTotal = Number(currentInv.total ?? 0);
          if (currentTotal > 0) {
            // Historical average from last 6 sent/paid invoices for this client
            const historical = await db
              .select({ total: invoices.total })
              .from(invoices)
              .where(and(
                eq(invoices.clientId, clientId),
                eq(invoices.workspaceId, workspaceId),
                sql`${invoices.status} IN ('sent', 'paid', 'overdue')`,
                gte(invoices.createdAt, ninetyDaysAgo),
              ))
              .orderBy(desc(invoices.createdAt))
              .limit(6);

            if (historical.length >= 2) {
              const avg = historical.reduce((s, r) => s + Number(r.total ?? 0), 0) / historical.length;
              if (avg > 0 && currentTotal > avg * 3) {
                const multiplier = (currentTotal / avg).toFixed(1);
                return logAndReturn(confirm(
                  `This invoice ($${currentTotal.toFixed(2)}) is ${multiplier}× higher than the 90-day average for this client ($${avg.toFixed(2)}). Confirm to send.`,
                  'financial_bounds',
                ));
              }
            }
          }
        }
      }
    }

    if (PAYROLL_RUN_ACTIONS.has(actionId)) {
      const amount = payload?.totalAmount ?? payload?.estimatedTotal;
      if (amount && Number(amount) > 0) {
        const historical = await db
          .select({ totalNetPay: payrollRuns.totalNetPay })
          .from(payrollRuns)
          .where(and(
            eq(payrollRuns.workspaceId, workspaceId),
            sql`${payrollRuns.status} IN ('processed', 'paid', 'completed')`,
            gte(payrollRuns.createdAt, ninetyDaysAgo),
          ))
          .orderBy(desc(payrollRuns.createdAt))
          .limit(4);

        if (historical.length >= 2) {
          const avg = historical.reduce((s, r) => s + Number(r.totalNetPay ?? 0), 0) / historical.length;
          const current = Number(amount);
          if (avg > 0 && current > avg * 3) {
            const multiplier = (current / avg).toFixed(1);
            return logAndReturn(confirm(
              `This payroll run ($${current.toFixed(2)}) is ${multiplier}× higher than recent average ($${avg.toFixed(2)}). Confirm to proceed.`,
              'financial_bounds',
            ));
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // CHECK 4 — Client email presence for invoice send (universal gate)
    // trinityInvoiceEmailActions already had this — now applies to all callers.
    // ─────────────────────────────────────────────────────────────────
    if (INVOICE_SEND_ACTIONS.has(actionId)) {
      const clientId = payload?.clientId;
      if (clientId) {
        const [client] = await db
          .select({ email: clients.email, billingEmail: clients.billingEmail, companyName: clients.companyName })
          .from(clients)
          .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
          .limit(1);

        if (client) {
          const hasEmail = !!(client.billingEmail || client.email);
          if (!hasEmail) {
            const name = client.companyName ?? clientId;
            return logAndReturn(fail(
              `${name} has no billing email on file. Add a contact email before sending invoices.`,
              'missing_client_email',
            ));
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    // CHECK 5 — Billing cycle conflict (Section 4 #2 — was FAIL)
    // When manually generating an invoice, compare the requested date range
    // against the client's configured billing cycle.
    // ─────────────────────────────────────────────────────────────────
    if (INVOICE_CREATE_ACTIONS.has(actionId)) {
      const clientId = payload?.clientId;
      const startDate = payload?.startDate ?? payload?.periodStart;
      const endDate = payload?.endDate ?? payload?.periodEnd;

      if (clientId && startDate && endDate) {
        const [client] = await db
          .select({ billingCycle: clients.billingCycle, companyName: clients.companyName })
          .from(clients)
          .where(and(eq(clients.id, clientId), eq(clients.workspaceId, workspaceId)))
          .limit(1);

        if (client?.billingCycle) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const periodDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
          const cycle = client.billingCycle.toLowerCase();

          const cycleExpectedDays: Record<string, [number, number]> = {
            daily: [1, 1],
            weekly: [5, 9],
            bi_weekly: [12, 16],
            semi_monthly: [13, 17],
            monthly: [25, 35],
          };

          const [minDays, maxDays] = cycleExpectedDays[cycle] ?? [0, 999];
          if (periodDays < minDays || periodDays > maxDays) {
            const name = client.companyName ?? clientId;
            return logAndReturn(confirm(
              `${name} is configured for ${cycle} billing, but this invoice covers ${periodDays} days. This may be a cycle mismatch. Confirm to proceed anyway.`,
              'billing_cycle_conflict',
            ));
          }
        }
      }
    }

    await logValidationDecision(actionId, workspaceId, PASSED);
    return PASSED;
  } catch (err: any) {
    log.error('[PreExecutionValidator] Check threw unexpectedly:', err?.message);
    // Fail CLOSED for high-risk action categories — cannot allow mutation on validator error
    const HIGH_RISK_CATEGORIES = ['payroll', 'invoicing', 'billing', 'scheduling', 'admin', 'compliance', 'tax'];
    const actionCategory = actionId.split('.')[0];
    const isHighRisk = HIGH_RISK_CATEGORIES.includes(actionCategory);
    const result: ValidationResult = isHighRisk
      ? { approved: false, reason: 'Safety check unavailable — action blocked. Please retry.', checkName: 'error_fail_closed' }
      : { ...PASSED, checkName: 'error_fallthrough_read_only' };
    try {
      await logValidationDecision(actionId, workspaceId, result);
    } catch (auditErr: any) {
      log.warn('[PreExecutionValidator] Audit log write failed (non-fatal):', auditErr?.message);
    }
    return result;
  }
}
