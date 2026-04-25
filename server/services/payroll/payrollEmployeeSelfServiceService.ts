/**
 * PAYROLL EMPLOYEE SELF-SERVICE SERVICE
 * ======================================
 * Handles the employee-facing (self-service) payroll read and update operations
 * previously embedded inline in payrollRoutes.ts.
 *
 * All queries scope by the authenticated user's employee record(s) — no
 * workspace_id param required; workspace context is resolved from the employee row.
 *
 * Extracted handlers:
 *   GET  /my-paychecks          → getMyPaychecks()
 *   GET  /pay-stubs/:id         → getMyPayStub()
 *   GET  /my-payroll-info       → getMyPayrollInfo()
 *   PATCH /my-payroll-info      → updateMyPayrollInfo()
 *   GET  /ytd/:employeeId       → getYtdEarnings()
 */

import { db } from '../../db';
import {
  employees,
  payStubs,
  employeePayrollInfo,
  employeeBankAccounts,
} from '@shared/schema';
import { payrollInfoUpdateSchema } from '@shared/schemas/payroll';
import { eq, and, inArray } from 'drizzle-orm';
import { encryptToken } from '../../security/tokenEncryption';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';

const log = createLogger('payrollEmployeeSelfService');

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelfServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// ─── getMyPaychecks ───────────────────────────────────────────────────────────

export async function getMyPaychecks(userId: string): Promise<SelfServiceResult> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId));

  if (!allEmployees.length) {
    return { success: false, error: 'Employee record not found', status: 404 };
  }

  const employee = allEmployees[0];
  const paychecks = await storage.getPayrollEntriesByEmployee(
    employee.id,
    employee.workspaceId,
  );

  return { success: true, data: paychecks };
}

// ─── getMyPayStub ─────────────────────────────────────────────────────────────

export async function getMyPayStub(
  userId: string,
  stubId: string,
): Promise<SelfServiceResult> {
  const userEmployees = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, userId));

  if (!userEmployees.length) {
    return { success: false, error: 'Pay stub not found', status: 404 };
  }

  const employeeIds = userEmployees.map((e) => e.id);
  const [stub] = await db
    .select()
    .from(payStubs)
    .where(and(eq(payStubs.id, stubId), inArray(payStubs.employeeId, employeeIds)))
    .limit(1);

  if (!stub) {
    return { success: false, error: 'Pay stub not found', status: 404 };
  }

  return { success: true, data: stub };
}

// ─── getMyPayrollInfo ─────────────────────────────────────────────────────────

export async function getMyPayrollInfo(userId: string): Promise<SelfServiceResult> {
  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId));

  if (!allEmployees.length) {
    return { success: false, error: 'Employee record not found', status: 404 };
  }

  const employee = allEmployees[0];
  const info = await db.query.employeePayrollInfo.findFirst({
    where: and(
      eq(employeePayrollInfo.employeeId, employee.id),
      eq(employeePayrollInfo.workspaceId, employee.workspaceId),
    ),
  });

  if (!info) {
    return {
      success: true,
      data: { directDepositEnabled: false, preferredPayoutMethod: 'direct_deposit' },
    };
  }

  return {
    success: true,
    data: {
      directDepositEnabled: info.directDepositEnabled,
      bankAccountType: info.bankAccountType,
      preferredPayoutMethod: info.preferredPayoutMethod,
      hasRoutingNumber: !!(info.bankRoutingNumber),
      hasAccountNumber: !!(info.bankAccountNumber),
    },
  };
}

// ─── updateMyPayrollInfo ──────────────────────────────────────────────────────

export interface UpdatePayrollInfoParams {
  userId: string;
  body: unknown;
}

export async function updateMyPayrollInfo(
  params: UpdatePayrollInfoParams,
): Promise<SelfServiceResult> {
  const { userId, body } = params;

  const allEmployees = await db
    .select()
    .from(employees)
    .where(eq(employees.userId, userId));

  if (!allEmployees.length) {
    return { success: false, error: 'Employee record not found', status: 404 };
  }

  const employee = allEmployees[0];
  const parsed = payrollInfoUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid payroll info',
      status: 400,
      data: parsed.error.flatten(),
    };
  }

  const {
    bankAccountType,
    bankRoutingNumber,
    bankAccountNumber,
    directDepositEnabled,
    preferredPayoutMethod,
  } = parsed.data;

  const existing = await db.query.employeePayrollInfo.findFirst({
    where: and(
      eq(employeePayrollInfo.employeeId, employee.id),
      eq(employeePayrollInfo.workspaceId, employee.workspaceId),
    ),
  });

  const updateFields: Record<string, unknown> = {};
  if (bankAccountType !== undefined) updateFields.bankAccountType = bankAccountType;
  if (directDepositEnabled !== undefined) updateFields.directDepositEnabled = directDepositEnabled;
  if (preferredPayoutMethod !== undefined) updateFields.preferredPayoutMethod = preferredPayoutMethod;

  // ACH COMPLIANCE: Encrypt routing/account numbers at rest before storage
  let encryptedRouting: string | undefined;
  let encryptedAccount: string | undefined;
  if (bankRoutingNumber !== undefined && bankRoutingNumber.trim()) {
    encryptedRouting = encryptToken(bankRoutingNumber.trim());
    updateFields.bankRoutingNumber = encryptedRouting;
  }
  if (bankAccountNumber !== undefined && bankAccountNumber.trim()) {
    encryptedAccount = encryptToken(bankAccountNumber.trim());
    updateFields.bankAccountNumber = encryptedAccount;
  }

  // Wrap both table writes in a single transaction — if bank account upsert
  // fails, the payrollInfo update rolls back too, keeping both tables consistent.
  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(employeePayrollInfo)
        .set(updateFields)
        .where(
          and(
            eq(employeePayrollInfo.employeeId, employee.id),
            eq(employeePayrollInfo.workspaceId, employee.workspaceId),
          ),
        );
    } else {
      await tx.insert(employeePayrollInfo).values({
        employeeId: employee.id,
        workspaceId: employee.workspaceId,
        ...updateFields,
      });
    }

    // Also upsert into canonical encrypted employee_bank_accounts if bank data provided
    if (encryptedRouting || encryptedAccount) {
      const routingLast4 = bankRoutingNumber?.trim().slice(-4) || null;
      const accountLast4 = bankAccountNumber?.trim().slice(-4) || null;

      const [existingBankAcct] = await tx
        .select({ id: employeeBankAccounts.id })
        .from(employeeBankAccounts)
        .where(
          and(
            eq(employeeBankAccounts.employeeId, employee.id),
            eq(employeeBankAccounts.isPrimary, true),
            eq(employeeBankAccounts.isActive, true),
          ),
        )
        .limit(1);

      if (existingBankAcct) {
        await tx
          .update(employeeBankAccounts)
          .set({
            ...(encryptedRouting
              ? { routingNumberEncrypted: encryptedRouting, routingNumberLast4: routingLast4 }
              : {}),
            ...(encryptedAccount
              ? { accountNumberEncrypted: encryptedAccount, accountNumberLast4: accountLast4 }
              : {}),
            ...(bankAccountType ? { accountType: bankAccountType } : {}),
            updatedAt: new Date(),
          })
          .where(eq(employeeBankAccounts.id, existingBankAcct.id));
      } else {
        await tx.insert(employeeBankAccounts).values({
          workspaceId: employee.workspaceId,
          employeeId: employee.id,
          routingNumberEncrypted: encryptedRouting || null,
          accountNumberEncrypted: encryptedAccount || null,
          routingNumberLast4: routingLast4,
          accountNumberLast4: accountLast4,
          accountType: bankAccountType || 'checking',
          isPrimary: true,
          isActive: true,
          addedBy: userId,
        });
      }
    }
  });

  return { success: true, data: { message: 'Direct deposit settings updated' } };
}

// ─── getYtdEarnings ───────────────────────────────────────────────────────────

const YTD_ZERO: Record<string, number> = {
  taxYear: new Date().getFullYear(),
  grossPay: 0,
  netPay: 0,
  federalTax: 0,
  stateTax: 0,
  socialSecurity: 0,
  medicare: 0,
  totalDeductions: 0,
  totalHours: 0,
  regularHours: 0,
  overtimeHours: 0,
  payPeriodCount: 0,
};

export async function getYtdEarnings(
  employeeId: string,
  workspaceId: string,
): Promise<SelfServiceResult> {
  const { paystubService } = await import('../paystubService');
  const ytdData = await paystubService.getYTDEarnings(employeeId, workspaceId);

  return { success: true, data: ytdData ?? YTD_ZERO };
}
