import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { financialProcessingFees, subscriptionTiers, orgSubscriptions, workspaces } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';

const log = createLogger('financialProcessingFeeService');
const BILLING_CYCLE = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export class FinancialProcessingFeeService {

  async recordInvoiceFee(params: {
    workspaceId: string;
    referenceId: string;
    invoiceCount?: number;
  }): Promise<{ amountCents: number; recorded: boolean }> {
    const tier = await this.getTierForWorkspace(params.workspaceId);
    if (!tier || tier.perInvoiceFeeCents === 0) {
      return { amountCents: 0, recorded: false };
    }

    const count = params.invoiceCount || 1;
    const amountCents = tier.perInvoiceFeeCents * count;

    const recorded = await this.recordFee({
      workspaceId: params.workspaceId,
      feeType: 'invoice_generation',
      amountCents,
      referenceId: params.referenceId,
      referenceType: 'invoice',
      perUnitRateCents: tier.perInvoiceFeeCents,
    });

    return { amountCents, recorded };
  }

  async recordPayrollFee(params: {
    workspaceId: string;
    referenceId: string;
    employeeCount: number;
  }): Promise<{ amountCents: number; recorded: boolean }> {
    const tier = await this.getTierForWorkspace(params.workspaceId);
    if (!tier || tier.perPayrollFeeCents === 0) {
      return { amountCents: 0, recorded: false };
    }

    const amountCents = tier.perPayrollFeeCents * params.employeeCount;

    const recorded = await this.recordFee({
      workspaceId: params.workspaceId,
      feeType: 'payroll_processing',
      amountCents,
      referenceId: params.referenceId,
      referenceType: 'payroll_run',
      employeeCount: params.employeeCount,
      perUnitRateCents: tier.perPayrollFeeCents,
    });

    return { amountCents, recorded };
  }

  async recordQbSyncFee(params: {
    workspaceId: string;
    referenceId: string;
  }): Promise<{ amountCents: number; recorded: boolean }> {
    const tier = await this.getTierForWorkspace(params.workspaceId);
    if (!tier || tier.perQbSyncFeeCents === 0) {
      return { amountCents: 0, recorded: false };
    }

    const recorded = await this.recordFee({
      workspaceId: params.workspaceId,
      feeType: 'quickbooks_sync',
      amountCents: tier.perQbSyncFeeCents,
      referenceId: params.referenceId,
      referenceType: 'qb_sync',
      perUnitRateCents: tier.perQbSyncFeeCents,
    });

    return { amountCents: tier.perQbSyncFeeCents, recorded };
  }

  async recordFee(params: {
    workspaceId: string;
    feeType: string;
    amountCents: number;
    referenceId: string;
    referenceType?: string;
    employeeCount?: number;
    perUnitRateCents?: number;
    description?: string;
  }): Promise<boolean> {
    const billingCycle = BILLING_CYCLE();

    const existing = await db
      .select({ id: financialProcessingFees.id })
      .from(financialProcessingFees)
      .where(
        and(
          eq(financialProcessingFees.referenceId, params.referenceId),
          eq(financialProcessingFees.feeType, params.feeType),
          eq(financialProcessingFees.billingCycle, billingCycle)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      log.info(`[ProcessingFee] Deduplicated: ${params.feeType}/${params.referenceId}/${billingCycle}`);
      return false;
    }

    const motherOrgId = await this.resolveMotherOrgId(params.workspaceId);

    await db.insert(financialProcessingFees).values({
      workspaceId: params.workspaceId,
      motherOrgWorkspaceId: motherOrgId !== params.workspaceId ? motherOrgId : null,
      feeType: params.feeType,
      amountCents: params.amountCents,
      referenceId: params.referenceId,
      referenceType: params.referenceType || null,
      billingCycle,
      employeeCount: params.employeeCount || null,
      perUnitRateCents: params.perUnitRateCents || null,
      description: params.description || null,
    });

    log.info(`[ProcessingFee] Recorded: ${params.feeType} $${(params.amountCents / 100).toFixed(2)} for ${params.workspaceId}`);
    return true;
  }

  async getFeesForBillingCycle(workspaceId: string, billingCycle?: string): Promise<{
    invoiceFees: { count: number; totalCents: number };
    payrollFees: { runs: number; totalEmployees: number; totalCents: number };
    qbSyncFees: { count: number; totalCents: number };
  }> {
    const cycle = billingCycle || BILLING_CYCLE();

    const fees = await db
      .select()
      .from(financialProcessingFees)
      .where(
        and(
          eq(financialProcessingFees.workspaceId, workspaceId),
          eq(financialProcessingFees.billingCycle, cycle)
        )
      );

    const motherFees = await db
      .select()
      .from(financialProcessingFees)
      .where(
        and(
          eq(financialProcessingFees.motherOrgWorkspaceId, workspaceId),
          eq(financialProcessingFees.billingCycle, cycle)
        )
      );

    const allFees = [...fees, ...motherFees];

    const invoiceFees = allFees.filter(f => f.feeType === 'invoice_generation');
    const payrollFees = allFees.filter(f => f.feeType === 'payroll_processing');
    const qbSyncFees = allFees.filter(f => f.feeType === 'quickbooks_sync');

    return {
      invoiceFees: {
        count: invoiceFees.length,
        totalCents: invoiceFees.reduce((sum, f) => sum + f.amountCents, 0),
      },
      payrollFees: {
        runs: payrollFees.length,
        totalEmployees: payrollFees.reduce((sum, f) => sum + (f.employeeCount || 0), 0),
        totalCents: payrollFees.reduce((sum, f) => sum + f.amountCents, 0),
      },
      qbSyncFees: {
        count: qbSyncFees.length,
        totalCents: qbSyncFees.reduce((sum, f) => sum + f.amountCents, 0),
      },
    };
  }

  async linkFeesToBill(workspaceId: string, billingCycle: string, billId: string): Promise<number> {
    const feesToLink = await db
      .select({ id: financialProcessingFees.id })
      .from(financialProcessingFees)
      .where(
        and(
          eq(financialProcessingFees.billingCycle, billingCycle),
          sql`(${financialProcessingFees.workspaceId} = ${workspaceId} OR ${financialProcessingFees.motherOrgWorkspaceId} = ${workspaceId})`
        )
      );

    if (feesToLink.length > 0) {
      await db
        .update(financialProcessingFees)
        .set({ billedOnPlatformInvoiceId: billId })
        .where(
          and(
            eq(financialProcessingFees.billingCycle, billingCycle),
            sql`(${financialProcessingFees.workspaceId} = ${workspaceId} OR ${financialProcessingFees.motherOrgWorkspaceId} = ${workspaceId})`
          )
        );
    }

    log.info(`[ProcessingFee] Linked ${feesToLink.length} fees to bill ${billId}`);
    return feesToLink.length;
  }

  private async getTierForWorkspace(workspaceId: string): Promise<{
    perInvoiceFeeCents: number;
    perPayrollFeeCents: number;
    perQbSyncFeeCents: number;
  } | null> {
    const effectiveWorkspaceId = await this.resolveMotherOrgId(workspaceId);

    const [sub] = await db
      .select({ tierId: orgSubscriptions.tierId })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.workspaceId, effectiveWorkspaceId));

    if (!sub) return null;

    const [tier] = await db
      .select({
        perInvoiceFeeCents: subscriptionTiers.perInvoiceFeeCents,
        perPayrollFeeCents: subscriptionTiers.perPayrollFeeCents,
        perQbSyncFeeCents: subscriptionTiers.perQbSyncFeeCents,
      })
      .from(subscriptionTiers)
      .where(eq(subscriptionTiers.id, sub.tierId));

    return tier || null;
  }

  private async resolveMotherOrgId(workspaceId: string): Promise<string> {
    const [ws] = await db
      .select({ parentWorkspaceId: workspaces.parentWorkspaceId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    return ws?.parentWorkspaceId || workspaceId;
  }
}

export const financialProcessingFeeService = new FinancialProcessingFeeService();
