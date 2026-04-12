/**
 * ASC 606 Compliance Tracker
 * ===========================
 * Tracks performance obligations and recognition status per ASC 606 / IFRS 15.
 *
 * ASC 606 five-step model:
 *   1. Identify the contract with a customer
 *   2. Identify the performance obligations in the contract
 *   3. Determine the transaction price
 *   4. Allocate transaction price to performance obligations
 *   5. Recognize revenue when (or as) a performance obligation is satisfied
 *
 * Per CLAUDE.md §G: All queries workspace-scoped.
 */

import { db } from '../../db';
import {
  revenueRecognitionSchedule,
  deferredRevenue,
  clientContracts,
} from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { createLogger } from '../../lib/logger';

const log = createLogger('Asc606Tracker');

export interface PerformanceObligation {
  contractId: string;
  contractTitle: string;
  clientId: string;
  clientName: string | null;
  totalValue: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  recognizedAmount: number;
  remainingAmount: number;
  satisfactionPercent: number;
  isSatisfied: boolean;
}

export interface Asc606Report {
  workspaceId: string;
  generatedAt: string;
  totalContracts: number;
  satisfiedObligations: number;
  pendingObligations: number;
  totalContractValue: number;
  totalRecognized: number;
  totalDeferred: number;
  complianceStatus: 'compliant' | 'partial' | 'attention_required';
  performanceObligations: PerformanceObligation[];
  recognitionScheduleSummary: {
    accrualSchedules: number;
    cashSchedules: number;
    pendingCount: number;
    recognizedCount: number;
    totalPendingAmount: number;
    totalRecognizedAmount: number;
  };
  deferredRevenueSummary: {
    totalDeferred: number;
    expectedRecognitionThisMonth: number;
    entries: Array<{
      invoiceId: string;
      amount: number;
      startDate: string;
      endDate: string;
      status: string;
    }>;
  };
  checklist: Array<{ step: number; description: string; status: 'complete' | 'partial' | 'incomplete' }>;
}

/**
 * Generate a full ASC 606 compliance report for a workspace.
 */
export async function generateAsc606Report(workspaceId: string): Promise<Asc606Report> {
  const now = new Date();

  // 1. Fetch contracts (performance obligations)
  const contracts = await db
    .select({
      id: clientContracts.id,
      title: clientContracts.title,
      clientId: clientContracts.clientId,
      clientName: clientContracts.clientName,
      totalValue: clientContracts.totalValue,
      status: clientContracts.status,
      effectiveDate: clientContracts.effectiveDate,
      termEndDate: clientContracts.termEndDate,
    })
    .from(clientContracts)
    .where(
      and(
        eq(clientContracts.workspaceId, workspaceId),
        inArray(clientContracts.status, ['executed', 'accepted']),
      ),
    );

  // 2. Fetch revenue recognition schedules
  const schedules = await db
    .select()
    .from(revenueRecognitionSchedule)
    .where(eq(revenueRecognitionSchedule.workspaceId, workspaceId));

  // 3. Fetch deferred revenue
  const deferredEntries = await db
    .select()
    .from(deferredRevenue)
    .where(eq(deferredRevenue.workspaceId, workspaceId));

  // 4. Build performance obligations list
  const obligations: PerformanceObligation[] = contracts.map((c) => {
    const contractSchedules = schedules.filter((s) => s.contractId === c.id);
    const totalValue = parseFloat(String(c.totalValue ?? 0));
    const recognized = contractSchedules.reduce(
      (sum, s) => sum + parseFloat(String(s.recognizedAmount ?? 0)),
      0,
    );
    const remaining = Math.max(0, totalValue - recognized);
    const satisfactionPercent = totalValue > 0 ? Math.min(100, (recognized / totalValue) * 100) : 0;

    return {
      contractId: c.id,
      contractTitle: c.title,
      clientId: c.clientId ?? '',
      clientName: c.clientName ?? null,
      totalValue,
      status: c.status,
      startDate: c.effectiveDate ?? null,
      endDate: c.termEndDate ?? null,
      recognizedAmount: recognized,
      remainingAmount: remaining,
      satisfactionPercent: parseFloat(satisfactionPercent.toFixed(1)),
      isSatisfied: remaining <= 0,
    };
  });

  // 5. Summaries
  const totalContractValue = obligations.reduce((s, o) => s + o.totalValue, 0);
  const totalRecognized = obligations.reduce((s, o) => s + o.recognizedAmount, 0);
  const satisfiedCount = obligations.filter((o) => o.isSatisfied).length;
  const pendingCount = obligations.filter((o) => !o.isSatisfied).length;

  // Current month string e.g. "2026-04"
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const totalDeferred = deferredEntries.reduce(
    (sum, dr) =>
      sum + parseFloat(String(dr.amount)) - parseFloat(String(dr.recognizedAmount)),
    0,
  );

  // Expected recognition this month from accrual schedules
  let expectedThisMonth = 0;
  for (const s of schedules) {
    if (!['pending', 'in_progress'].includes(s.status)) continue;
    const scheduledDates = (s.scheduledDates as Array<{ date: string; amount: string }>) ?? [];
    const entry = scheduledDates.find((e) => e.date.startsWith(currentMonthStr));
    if (entry) expectedThisMonth += parseFloat(entry.amount);
  }

  const scheduleAccrual = schedules.filter((s) => s.recognitionMethod === 'accrual').length;
  const scheduleCash = schedules.filter((s) => s.recognitionMethod === 'cash').length;
  const schedPending = schedules.filter((s) => ['pending', 'in_progress'].includes(s.status)).length;
  const schedRecognized = schedules.filter((s) => s.status === 'recognized').length;
  const totalPendingAmount = schedules
    .filter((s) => ['pending', 'in_progress'].includes(s.status))
    .reduce((sum, s) => sum + parseFloat(String(s.remainingAmount)), 0);
  const totalRecognizedAmount = schedules
    .filter((s) => s.status === 'recognized')
    .reduce((sum, s) => sum + parseFloat(String(s.recognizedAmount)), 0);

  // 6. Compliance checklist (5 steps)
  const checklist: Asc606Report['checklist'] = [
    {
      step: 1,
      description: 'Identify contracts with customers',
      status: contracts.length > 0 ? 'complete' : 'incomplete',
    },
    {
      step: 2,
      description: 'Identify performance obligations in contracts',
      status: obligations.length > 0 ? 'complete' : 'incomplete',
    },
    {
      step: 3,
      description: 'Determine transaction price',
      status: obligations.every((o) => o.totalValue > 0) ? 'complete' : 'partial',
    },
    {
      step: 4,
      description: 'Allocate transaction price to performance obligations',
      status: schedules.length > 0 ? 'complete' : obligations.length > 0 ? 'partial' : 'incomplete',
    },
    {
      step: 5,
      description: 'Recognize revenue when performance obligation is satisfied',
      status: schedRecognized > 0 ? 'complete' : schedPending > 0 ? 'partial' : 'incomplete',
    },
  ];

  const completeSteps = checklist.filter((s) => s.status === 'complete').length;
  const complianceStatus: Asc606Report['complianceStatus'] =
    completeSteps === 5 ? 'compliant' : completeSteps >= 3 ? 'partial' : 'attention_required';

  return {
    workspaceId,
    generatedAt: now.toISOString(),
    totalContracts: contracts.length,
    satisfiedObligations: satisfiedCount,
    pendingObligations: pendingCount,
    totalContractValue,
    totalRecognized,
    totalDeferred,
    complianceStatus,
    performanceObligations: obligations,
    recognitionScheduleSummary: {
      accrualSchedules: scheduleAccrual,
      cashSchedules: scheduleCash,
      pendingCount: schedPending,
      recognizedCount: schedRecognized,
      totalPendingAmount,
      totalRecognizedAmount,
    },
    deferredRevenueSummary: {
      totalDeferred,
      expectedRecognitionThisMonth: expectedThisMonth,
      entries: deferredEntries.map((dr) => ({
        invoiceId: dr.invoiceId,
        amount: parseFloat(String(dr.amount)),
        startDate: String(dr.startDate ?? ''),
        endDate: String(dr.endDate ?? ''),
        status: dr.status ?? 'deferred',
      })),
    },
    checklist,
  };
}

export const asc606Tracker = { generateAsc606Report };
