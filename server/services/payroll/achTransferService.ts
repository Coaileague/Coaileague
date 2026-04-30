import { db } from '../../db';
import { and, eq } from 'drizzle-orm';
import {
  employeeBankAccounts,
  orgFinanceSettings,
  payStubs,
  payrollEntries,
  plaidTransferAttempts,
} from '@shared/schema';
import { createLogger } from '../../lib/logger';
import { initiateTransfer, isPlaidConfigured, plaidDecrypt, verifyBankAccount } from '../partners/plaidService';
import { toFinancialString } from '../financialCalculator';

const log = createLogger('achTransferService');

export type AchTransferOutcome = 'initiated' | 'payment_held' | 'skipped' | 'failed';

export interface AchTransferResult {
  status: AchTransferOutcome;
  transferId?: string;
  amount?: string;
  reason?: string;
}

export async function verifyEmployeeBankAccount(params: {
  workspaceId: string;
  employeeId: string;
  verifiedBy?: string | null;
}): Promise<{ valid: boolean; status: string }> {
  const { workspaceId, employeeId, verifiedBy } = params;

  const [bankAccount] = await db.select({
    id: employeeBankAccounts.id,
    plaidAccessTokenEncrypted: employeeBankAccounts.plaidAccessTokenEncrypted,
  }).from(employeeBankAccounts).where(and(
    eq(employeeBankAccounts.workspaceId, workspaceId),
    eq(employeeBankAccounts.employeeId, employeeId),
    eq(employeeBankAccounts.isActive, true),
    eq(employeeBankAccounts.isPrimary, true),
  )).limit(1);

  if (!bankAccount?.plaidAccessTokenEncrypted) {
    return { valid: false, status: 'missing_access_token' };
  }

  const accessToken = plaidDecrypt(bankAccount.plaidAccessTokenEncrypted);
  const verification = await verifyBankAccount(accessToken);

  await db.update(employeeBankAccounts).set({
    isVerified: verification.valid,
    verifiedAt: verification.valid ? new Date() : null,
    verifiedBy: verification.valid ? (verifiedBy ?? null) : null,
    updatedAt: new Date(),
  }).where(eq(employeeBankAccounts.id, bankAccount.id));

  return verification;
}

export async function initiatePayrollAchTransfer(params: {
  workspaceId: string;
  employeeId: string;
  payrollRunId?: string | null;
  payrollEntryId?: string | null;
  payStubId?: string | null;
  amount: number;
  idempotencyKey: string;
  description?: string;
  legalName?: string;
}): Promise<AchTransferResult> {
  const {
    workspaceId,
    employeeId,
    payrollRunId,
    payrollEntryId,
    payStubId,
    amount,
    idempotencyKey,
    description = 'Payroll',
    legalName = employeeId,
  } = params;

  // G-P0-2: Decimal-safe amount validation and formatting
  const amountStr = toFinancialString(String(amount));
  const amountNum = parseFloat(amountStr);
  if (amountNum <= 0) {
    return { status: 'skipped', reason: 'invalid_amount_zero_or_negative' };
  }

  if (!isPlaidConfigured()) {
    return { status: 'skipped', reason: 'plaid_not_configured' };
  }

  const [orgFinance] = await db.select({
    plaidAccessTokenEncrypted: orgFinanceSettings.plaidAccessTokenEncrypted,
    plaidAccountId: orgFinanceSettings.plaidAccountId,
  }).from(orgFinanceSettings).where(eq(orgFinanceSettings.workspaceId, workspaceId)).limit(1);

  if (!orgFinance?.plaidAccessTokenEncrypted || !orgFinance?.plaidAccountId) {
    return { status: 'skipped', reason: 'org_bank_missing' };
  }

  const [empBank] = await db.select({
    id: employeeBankAccounts.id,
    plaidAccessTokenEncrypted: employeeBankAccounts.plaidAccessTokenEncrypted,
    plaidAccountId: employeeBankAccounts.plaidAccountId,
  }).from(employeeBankAccounts).where(and(
    eq(employeeBankAccounts.workspaceId, workspaceId),
    eq(employeeBankAccounts.employeeId, employeeId),
    eq(employeeBankAccounts.isActive, true),
    eq(employeeBankAccounts.isPrimary, true),
  )).limit(1);

  if (!empBank?.plaidAccessTokenEncrypted || !empBank?.plaidAccountId) {
    return { status: 'skipped', reason: 'employee_bank_missing' };
  }

  const empAccessToken = plaidDecrypt(empBank.plaidAccessTokenEncrypted);
  const verification = await verifyBankAccount(empAccessToken);
  await db.update(employeeBankAccounts).set({
    isVerified: verification.valid,
    verifiedAt: verification.valid ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(employeeBankAccounts.id, empBank.id));
  if (!verification.valid) {
    if (payStubId) {
      await db.update(payStubs).set({
        plaidTransferStatus: 'payment_held',
        updatedAt: new Date(),
      } as any).where(and(
        eq(payStubs.id, payStubId),
        eq(payStubs.workspaceId, workspaceId),
      ));
    }
    if (payrollEntryId) {
      await db.update(payrollEntries).set({
        plaidTransferStatus: 'payment_held',
        updatedAt: new Date(),
      } as any).where(and(
        eq(payrollEntries.id, payrollEntryId),
        eq(payrollEntries.workspaceId, workspaceId),
      ));
    }
    return { status: 'payment_held', reason: `bank_unverified:${verification.status}` };
  }

  // Idempotency check — return existing attempt if same key was already used
  const existingAttempt = await db.select()
    .from(plaidTransferAttempts)
    .where(and(
      eq(plaidTransferAttempts.workspaceId, workspaceId),
      eq((plaidTransferAttempts as any).idempotencyKey, idempotencyKey)
    ))
    .limit(1)
    .catch(() => []);

  if (existingAttempt.length > 0) {
    const existing = existingAttempt[0] as any;
    log.info('[AchTransfer] Idempotent retry — returning existing attempt', { idempotencyKey, status: existing.status });
    return {
      status: existing.transferId ? 'initiated' : existing.status,
      transferId: existing.transferId,
      amount: existing.amount,
    };
  }

  const [pendingRecord] = await db.insert(plaidTransferAttempts).values({
    workspaceId,
    employeeId,
    payrollRunId: payrollRunId || null,
    payrollEntryId: payrollEntryId || null,
    amount: amountStr,
    status: 'pending',
  } as any).returning().catch(() => [null as any]);

  try {
    const transfer = await initiateTransfer({
      accessToken: empAccessToken,
      accountId: empBank.plaidAccountId,
      amount: amountStr,
      description,
      legalName,
      type: 'credit',
      idempotencyKey,
    });

    if (pendingRecord?.id) {
      await db.update(plaidTransferAttempts).set({
        status: 'initiated',
        transferId: transfer.transferId,
        initiatedAt: new Date(),
      } as any).where(eq(plaidTransferAttempts.id, pendingRecord.id)).catch(() => null);
    }

    if (payrollEntryId) {
      await db.update(payrollEntries).set({
        plaidTransferId: transfer.transferId,
        plaidTransferStatus: 'pending',
        disbursementMethod: 'plaid_ach',
        disbursedAt: new Date(),
      } as any).where(and(
        eq(payrollEntries.id, payrollEntryId),
        eq(payrollEntries.workspaceId, workspaceId),
      ));
    }

    if (payStubId) {
      await db.update(payStubs).set({
        plaidTransferId: transfer.transferId,
        plaidTransferStatus: 'pending',
        updatedAt: new Date(),
      } as any).where(and(
        eq(payStubs.id, payStubId),
        eq(payStubs.workspaceId, workspaceId),
      ));
    }

    return { status: 'initiated', transferId: transfer.transferId };
  } catch (err: any) {
    if (pendingRecord?.id) {
      await db.update(plaidTransferAttempts).set({
        status: 'failed',
        errorMessage: err?.message ?? String(err),
      } as any).where(eq(plaidTransferAttempts.id, pendingRecord.id)).catch(() => null);
    }
    log.warn('[ACH] Transfer initiation failed:', err?.message ?? err);
    return { status: 'failed', reason: err?.message ?? String(err) };
  }
}
