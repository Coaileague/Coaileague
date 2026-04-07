import { createLogger } from '../../lib/logger';
import { db } from '../../db';
import { platformInvoices, subscriptionTiers, orgSubscriptions, workspaces, financialProcessingFees } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { financialProcessingFeeService } from './financialProcessingFeeService';
import { typedCount, typedQuery } from '../../lib/typedSql';

const log = createLogger('platformBillService');
const BILLING_CYCLE = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export class PlatformBillService {

  async generateMonthlyBill(workspaceId: string, billingCycle?: string): Promise<{
    billId: string;
    totalCents: number;
    isNew: boolean;
  } | null> {
    const cycle = billingCycle || BILLING_CYCLE();

    const [existingBill] = await db
      .select()
      .from(platformInvoices)
      .where(
        and(
          eq(platformInvoices.workspaceId, workspaceId),
          eq(platformInvoices.billingCycle, cycle)
        )
      );

    if (existingBill) {
      log.info(`[PlatformBill] Idempotent: bill already exists for ${workspaceId}/${cycle}`);
      return { billId: existingBill.id, totalCents: existingBill.totalCents, isNew: false };
    }

    const [sub] = await db
      .select({ tierId: orgSubscriptions.tierId })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.workspaceId, workspaceId));

    if (!sub) {
      log.info(`[PlatformBill] No subscription for ${workspaceId}`);
      return null;
    }

    const [tier] = await db
      .select()
      .from(subscriptionTiers)
      .where(eq(subscriptionTiers.id, sub.tierId));

    if (!tier) return null;

    const subscriptionAmountCents = tier.basePriceCents;

    const empCount = await this.getEmployeeCountForBilling(workspaceId);
    const overageCount = Math.max(0, empCount - tier.includedEmployees);
    const employeeOverageAmountCents = overageCount * tier.perEmployeeOverageCents;

    if (tier.perEmployeeCreditScaling > 0 && tier.includedEmployees === 0) {
      // enterprise: all employees are overage at per_employee_overage_cents
    }

    const fees = await financialProcessingFeeService.getFeesForBillingCycle(workspaceId, cycle);

    const creditPackPurchasesCents = await this.getCreditPackPurchases(workspaceId, cycle);
    const addonModulesTotalCents = await this.getAddonModulesTotal(workspaceId, cycle);

    const subtotalCents = subscriptionAmountCents + employeeOverageAmountCents +
      fees.invoiceFees.totalCents + fees.payrollFees.totalCents + fees.qbSyncFees.totalCents +
      creditPackPurchasesCents + addonModulesTotalCents;

    const taxCents = 0;
    const totalCents = subtotalCents + taxCents;

    const [bill] = await db.insert(platformInvoices).values({
      workspaceId,
      billingCycle: cycle,
      status: 'draft',
      subscriptionAmountCents,
      employeeOverageAmountCents,
      employeeOverageCount: overageCount,
      invoiceProcessingTotalCents: fees.invoiceFees.totalCents,
      invoiceProcessingCount: fees.invoiceFees.count,
      payrollProcessingTotalCents: fees.payrollFees.totalCents,
      payrollProcessingRuns: fees.payrollFees.runs,
      payrollProcessingEmployeeTotal: fees.payrollFees.totalEmployees,
      qbSyncTotalCents: fees.qbSyncFees.totalCents,
      qbSyncCount: fees.qbSyncFees.count,
      creditPackPurchasesCents,
      addonModulesTotalCents,
      subtotalCents,
      taxCents,
      totalCents,
    }).returning();

    await financialProcessingFeeService.linkFeesToBill(workspaceId, cycle, bill.id);

    log.info(`[PlatformBill] Generated: ${bill.id} for ${workspaceId}/${cycle} = $${(totalCents / 100).toFixed(2)}`);

    return { billId: bill.id, totalCents, isNew: true };
  }

  async markAsSent(billId: string): Promise<void> {
    await db
      .update(platformInvoices)
      .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
      .where(eq(platformInvoices.id, billId));
  }

  async markAsPaid(billId: string, stripePaymentIntentId?: string): Promise<void> {
    await db
      .update(platformInvoices)
      .set({
        status: 'paid',
        paidAt: new Date(),
        stripePaymentIntentId: stripePaymentIntentId || null,
        updatedAt: new Date(),
      })
      .where(eq(platformInvoices.id, billId));
  }

  private async getEmployeeCountForBilling(workspaceId: string): Promise<number> {
    // CATEGORY C — Raw SQL retained: Count( | Tables: employees | Verified: 2026-03-23
    const result = await typedCount(
      sql`SELECT COUNT(*) as count FROM employees WHERE workspace_id = ${workspaceId} AND is_active = true`
    );
    const directCount = Number(result);

    const subOrgs = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.parentWorkspaceId, workspaceId));

    let subOrgCount = 0;
    for (const sub of subOrgs) {
      // CATEGORY C — Raw SQL retained: Count( | Tables: employees | Verified: 2026-03-23
      const subResult = await typedCount(
        sql`SELECT COUNT(*) as count FROM employees WHERE workspace_id = ${sub.id} AND is_active = true`
      );
      subOrgCount += Number(subResult);
    }

    return directCount + subOrgCount;
  }

  private async getCreditPackPurchases(_workspaceId: string, _billingCycle: string): Promise<number> {
    // credit_transactions table dropped (Phase 16)
    return 0;
  }

  private async getAddonModulesTotal(workspaceId: string, billingCycle: string): Promise<number> {
    // CATEGORY C — Raw SQL retained: COALESCE(SUM | Tables: workspace_addons, billing_addons | Verified: 2026-03-23
    const result = await typedQuery(
      sql`SELECT COALESCE(SUM(CAST(ba.base_price AS NUMERIC) * 100), 0) as total
          FROM workspace_addons wa
          JOIN billing_addons ba ON wa.addon_id = ba.addon_key
          WHERE wa.workspace_id = ${workspaceId}
          AND wa.status = 'active'`
    );
    return Number((result as any[])[0]?.total || 0);
  }
}

export const platformBillService = new PlatformBillService();
