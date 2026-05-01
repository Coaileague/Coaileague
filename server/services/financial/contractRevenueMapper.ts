/**
 * Contract Revenue Mapper
 * ========================
 * Maps client contracts to invoice revenue and creates revenue recognition schedules.
 * Implements contract-based accrual recognition per ASC 606.
 *
 * Per TRINITY.md §G: All queries workspace-scoped.
 */

import { db } from '../../db';
import {
  clientContracts,
  contractRevenueMapping,
  invoices,
  revenueRecognitionSchedule,
  auditLogs,
} from '@shared/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { createScheduleForInvoice, generateMonthlySchedule } from '../billing/revenueRecognitionService';
import { createLogger } from '../../lib/logger';

const log = createLogger('ContractRevenueMapper');

export interface ContractRevenueMappingResult {
  contractId: string;
  mappingId: string | null;
  scheduleId: string | null;
  contractValue: number;
  monthlyValue: number;
  termMonths: number;
  recognitionMethod: string;
  status: string;
}

/**
 * Create or update a contract revenue mapping and recognition schedule.
 * Called when a contract is executed or when an invoice is linked to a contract.
 */
export async function mapContractToRevenue(
  workspaceId: string,
  contractId: string,
  invoiceId: string | null,
  userId: string,
): Promise<ContractRevenueMappingResult | null> {
  try {
    const [contract] = await db
      .select()
      .from(clientContracts)
      .where(
        and(
          eq(clientContracts.id, contractId),
          eq(clientContracts.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (!contract) {
      log.warn('[ContractRevenueMapper] Contract not found', { contractId, workspaceId });
      return null;
    }

    const contractValue = parseFloat(String(contract.totalValue ?? contract.annualValue ?? 0));
    if (contractValue <= 0) {
      log.warn('[ContractRevenueMapper] Contract has no value', { contractId });
      return null;
    }

    // Calculate term months from contract dates
    let termMonths = 12; // default 12 months
    if (contract.effectiveDate && contract.termEndDate) {
      const start = new Date(contract.effectiveDate);
      const end = new Date(contract.termEndDate);
      const diffMonths =
        (end.getFullYear() - start.getFullYear()) * 12 +
        (end.getMonth() - start.getMonth());
      if (diffMonths > 0) termMonths = diffMonths;
    }

    const monthlyValue = contractValue / termMonths;
    const recognitionStart = contract.effectiveDate
      ? new Date(contract.effectiveDate)
      : new Date();
    const recognitionEnd = contract.termEndDate
      ? new Date(contract.termEndDate)
      : new Date(recognitionStart.getFullYear(), recognitionStart.getMonth() + termMonths, 0);

    // Upsert contract revenue mapping
    let mappingId: string | null = null;
    let scheduleId: string | null = null;

    const existing = await db
      .select()
      .from(contractRevenueMapping)
      .where(
        and(
          eq(contractRevenueMapping.contractId, contractId),
          eq(contractRevenueMapping.workspaceId, workspaceId),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      mappingId = existing[0].id;
      scheduleId = existing[0].scheduleId ?? null;
      // Update with latest invoice if provided
      if (invoiceId && existing[0].invoiceId !== invoiceId) {
        await db
          .update(contractRevenueMapping)
          .set({ invoiceId, updatedAt: new Date() })
          .where(
            and(
              eq(contractRevenueMapping.id, mappingId),
              eq(contractRevenueMapping.workspaceId, workspaceId),
            ),
          );
      }
    } else {
      // Create recognition schedule if we have an invoiceId
      if (invoiceId) {
        scheduleId = await db.transaction(async (tx) => {
          return await createScheduleForInvoice(tx, {
            workspaceId,
            invoiceId,
            clientId: contract.clientId ?? '',
            totalAmount: contractValue,
            recognitionMethod: 'accrual',
            periodMonths: termMonths,
            startDate: recognitionStart,
            createdBy: userId,
          });
        });
      }

      const [mapping] = await db
        .insert(contractRevenueMapping)
        .values({
          workspaceId,
          contractId,
          invoiceId: invoiceId ?? undefined,
          scheduleId: scheduleId ?? undefined,
          contractValue: contractValue.toFixed(2),
          monthlyValue: monthlyValue.toFixed(2),
          recognitionStartDate: recognitionStart.toISOString().split('T')[0],
          recognitionEndDate: recognitionEnd.toISOString().split('T')[0],
          termMonths,
          recognitionMethod: 'accrual',
          status: 'active',
          recognizedToDate: '0.00',
          createdBy: userId,
        })
        .returning();

      mappingId = mapping.id;

      // Update schedule with contractId
      if (scheduleId) {
        await db
          .update(revenueRecognitionSchedule)
          .set({ contractId, updatedAt: new Date() })
          .where(
            and(
              eq(revenueRecognitionSchedule.id, scheduleId),
              eq(revenueRecognitionSchedule.workspaceId, workspaceId),
            ),
          );
      }
    }

    // Audit log
    try {
      await db.insert(auditLogs).values({
        workspaceId,
        userId,
        action: 'contract_revenue_mapped',
        entityType: 'contract_revenue_mapping',
        entityId: mappingId ?? contractId,
        actionDescription: `Contract revenue mapped: $${contractValue.toFixed(2)} over ${termMonths} months`,
        changes: { contractId, invoiceId, contractValue, termMonths, monthlyValue },
        source: 'system',
      });
    } catch (err: unknown) {
      log.warn('[ContractRevenueMapper] Audit log write failed (non-fatal)', { error: err?.message });
    }

    return {
      contractId,
      mappingId,
      scheduleId,
      contractValue,
      monthlyValue: parseFloat(monthlyValue.toFixed(2)),
      termMonths,
      recognitionMethod: 'accrual',
      status: 'active',
    };
  } catch (err: unknown) {
    log.error('[ContractRevenueMapper] mapContractToRevenue error', {
      contractId,
      workspaceId,
      error: err?.message,
    });
    return null;
  }
}

/**
 * Get all contract revenue mappings for a workspace.
 */
export async function getContractRevenueMappings(
  workspaceId: string,
): Promise<typeof contractRevenueMapping.$inferSelect[]> {
  return db
    .select()
    .from(contractRevenueMapping)
    .where(eq(contractRevenueMapping.workspaceId, workspaceId))
    .orderBy(desc(contractRevenueMapping.createdAt));
}

export const contractRevenueMapper = { mapContractToRevenue, getContractRevenueMappings };
