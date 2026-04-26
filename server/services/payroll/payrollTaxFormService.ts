/**
 * PAYROLL TAX FORM SERVICE
 * ========================
 * Delegates form generation to taxFormGeneratorService and handles
 * billing token usage for tax prep features.
 *
 * Covers: Form 941 (quarterly), Form 940 (annual FUTA), W-2, 1099-NEC.
 */

import { db } from '../../db';
import { storage } from '../../storage';
import { createLogger } from '../../lib/logger';
import { sanitizeError } from '../../middleware/errorHandler';

const log = createLogger('payrollTaxFormService');

// ─── Form 941 ──────────────────────────────────────────────────────────────

export interface Form941Params {
  workspaceId: string;
  quarter: number;
  year: number;
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export async function generate941(params: Form941Params) {
  const { taxFormGeneratorService } = await import('../taxFormGeneratorService');
  const result = await taxFormGeneratorService.generate941Report(
    params.workspaceId,
    params.quarter,
    params.year,
  );

  if (!result.success) {
    const err = new Error(result.error || 'Failed to generate Form 941') as any;
    err.status = 422;
    throw err;
  }

  if (params.userId) {
    storage.createAuditLog({
      workspaceId: params.workspaceId,
      userId: params.userId,
      userEmail: params.userEmail || 'unknown',
      userRole: params.userRole || 'user',
      action: 'create',
      entityType: 'tax_form',
      entityId: result.taxFormId || '',
      actionDescription: `Generated Form 941 for Q${params.quarter} ${params.year}`,
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for 941 generation', { error: err?.message }));
  }

  return result;
}

// ─── Form 940 ──────────────────────────────────────────────────────────────

export interface Form940Params {
  workspaceId: string;
  year: number;
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

export async function generate940(params: Form940Params) {
  const { taxFormGeneratorService } = await import('../taxFormGeneratorService');
  const result = await taxFormGeneratorService.generate940Report(params.workspaceId, params.year);

  if (!result.success) {
    const err = new Error(result.error || 'Failed to generate Form 940') as any;
    err.status = 422;
    throw err;
  }

  if (params.userId) {
    storage.createAuditLog({
      workspaceId: params.workspaceId,
      userId: params.userId,
      userEmail: params.userEmail || 'unknown',
      userRole: params.userRole || 'user',
      action: 'create',
      entityType: 'tax_form',
      entityId: `940-${params.year}`,
      actionDescription: `Generated Form 940 (FUTA) for tax year ${params.year}`,
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for 940 generation', { error: err?.message }));
  }

  return result;
}

// ─── W-2 / 1099 ────────────────────────────────────────────────────────────

export interface TaxFormGenerateParams {
  workspaceId: string;
  employeeId: string;
  taxYear: number | string;
  formType: 'w2' | '1099';
  userId?: string;
  userEmail?: string;
  userRole?: string;
}

const LIMITATION_NOTICE = {
  w2: 'IMPORTANT: This W-2 document is a platform-generated estimate for internal record-keeping and employee preview purposes only. ' +
    'It is NOT a substitute for the official W-2 submitted to the SSA and IRS. ' +
    'Year-end W-2 forms must be filed through the Social Security Administration Business Services Online (BSO) portal ' +
    'or an accredited payroll provider. This platform is not an IRS-registered filing agent. ' +
    'Please verify all figures with your CPA or payroll provider before filing.',
  '1099': 'IMPORTANT: This 1099-NEC document is a platform-generated estimate for contractor payment records. ' +
    'It must be verified and filed through the IRS FIRE system or an accredited tax filing service. ' +
    'This platform is not an IRS-registered filing agent.',
} as const;

export async function generateTaxForm(params: TaxFormGenerateParams) {
  const { taxFormGeneratorService } = await import('../taxFormGeneratorService');

  let result: any;
  if (params.formType === 'w2') {
    result = await taxFormGeneratorService.generateW2ForEmployee(
      params.employeeId, params.workspaceId, params.taxYear,
    );
  } else {
    result = await taxFormGeneratorService.generate1099ForEmployee(
      params.employeeId, params.workspaceId, params.taxYear,
    );
  }

  if (!result.success) {
    const err = new Error(result.error || 'Failed to generate tax form') as any;
    err.status = 422;
    throw err;
  }

  if (params.userId) {
    storage.createAuditLog({
      workspaceId: params.workspaceId,
      userId: params.userId,
      userEmail: params.userEmail || 'unknown',
      userRole: params.userRole || 'user',
      action: 'create',
      entityType: 'tax_form',
      entityId: result.taxFormId || '',
      actionDescription: `Generated ${params.formType.toUpperCase()} for employee ${params.employeeId} for tax year ${params.taxYear}`,
      isSensitiveData: true,
      complianceTag: 'soc2',
    }).catch(err => log.error('[FinancialAudit] CRITICAL: SOC2 audit log write failed for tax form generation', { error: err?.message }));
  }

  return {
    ...result,
    limitation: LIMITATION_NOTICE[params.formType],
    filingRequired: true,
    officialFilingSystem: params.formType === 'w2'
      ? 'SSA Business Services Online (BSO)'
      : 'IRS FIRE System',
  };
}
