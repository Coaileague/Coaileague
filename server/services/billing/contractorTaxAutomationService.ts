/**
 * Contractor Tax Automation Service
 *
 * GAP FIX 10: 1099 January automation.
 *   - Runs in January from the daily billing cron.
 *   - Scans prior year payroll entries for contractors who exceeded $600.
 *   - Flags them in a notification to the org_owner with a filing deadline reminder.
 *   - Generates a summary report (JSON, can be fetched via API).
 *
 * The IRS requires 1099-NEC filings for contractors paid $600+ in a calendar year.
 * Deadline: January 31 of the following year.
 */

import { db } from '../../db';
import { employees, workspaces, payrollEntries, payrollRuns } from '@shared/schema';
import { eq, and, gte, lte, sql, sum } from 'drizzle-orm';
import { createNotification } from '../notificationService';
import { createLogger } from '../../lib/logger';
import { startOfYear, endOfYear, format, addDays } from 'date-fns';

const log = createLogger('ContractorTaxAutomationService');

const FORM_1099_THRESHOLD = 600;

export interface ContractorTaxRecord {
  employeeId: string;
  employeeName: string;
  workerType: string;
  is1099Eligible: boolean;
  totalPaidInYear: number;
  taxYear: number;
  requiresFiling: boolean;
  flaggedAt: Date;
}

export async function run1099JanuaryScan(taxYear: number): Promise<{
  flagged: number;
  skipped: number;
  records: ContractorTaxRecord[];
}> {
  log.info('Starting 1099 January scan', { taxYear });

  const yearStart = startOfYear(new Date(taxYear, 0, 1));
  const yearEnd = endOfYear(new Date(taxYear, 0, 1));

  let flagged = 0;
  let skipped = 0;
  const allRecords: ContractorTaxRecord[] = [];

  try {
    const activeWorkspaces = await db
      .select({ id: workspaces.id, ownerId: workspaces.ownerId, companyName: workspaces.companyName })
      .from(workspaces)
      .where(eq(workspaces.subscriptionStatus, 'active'));

    for (const ws of activeWorkspaces) {
      try {
        const contractors = await db
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            workerType: employees.workerType,
            is1099Eligible: employees.is1099Eligible,
          })
          .from(employees)
          .where(
            and(
              eq(employees.workspaceId, ws.id),
              eq(employees.isActive, true),
            ),
          );

        const eligibleContractors = contractors.filter(
          e => e.workerType === 'contractor' || e.is1099Eligible === true,
        );

        if (eligibleContractors.length === 0) {
          skipped++;
          continue;
        }

        const wsRecords: ContractorTaxRecord[] = [];

        for (const contractor of eligibleContractors) {
          try {
            const payTotals = await db
              .select({ totalPaid: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)` })
              .from(payrollEntries)
              .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
              .where(
                and(
                  eq(payrollEntries.employeeId, contractor.id),
                  gte(payrollRuns.periodStart, yearStart),
                  lte(payrollRuns.periodEnd, yearEnd),
                ),
              );

            const totalPaid = parseFloat(payTotals[0]?.totalPaid || '0');

            const record: ContractorTaxRecord = {
              employeeId: contractor.id,
              employeeName: `${contractor.firstName} ${contractor.lastName}`.trim(),
              workerType: contractor.workerType || 'contractor',
              is1099Eligible: contractor.is1099Eligible ?? true,
              totalPaidInYear: totalPaid,
              taxYear,
              requiresFiling: totalPaid >= FORM_1099_THRESHOLD,
              flaggedAt: new Date(),
            };

            wsRecords.push(record);

            if (record.requiresFiling) {
              flagged++;
            } else {
              skipped++;
            }
          } catch (empErr: any) {
            log.warn('Failed to calculate 1099 total for contractor', { employeeId: contractor.id, error: empErr.message });
          }
        }

        allRecords.push(...wsRecords);

        const filingCandidates = wsRecords.filter(r => r.requiresFiling);
        if (filingCandidates.length > 0 && ws.ownerId) {
          const deadline = format(new Date(taxYear + 1, 0, 31), 'MMMM d, yyyy');
          const contractorList = filingCandidates
            .slice(0, 5)
            .map(r => `${r.employeeName}: $${r.totalPaidInYear.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
            .join(', ');
          const moreText = filingCandidates.length > 5 ? ` and ${filingCandidates.length - 5} more` : '';

          await createNotification({
            workspaceId: ws.id,
            userId: ws.ownerId,
            type: 'form_1099_filing_required',
            title: `Action required: ${filingCandidates.length} contractor${filingCandidates.length === 1 ? '' : 's'} need 1099-NEC filing`,
            message: `${filingCandidates.length} contractor${filingCandidates.length === 1 ? '' : 's'} exceeded $${FORM_1099_THRESHOLD} in ${taxYear}: ${contractorList}${moreText}. IRS Form 1099-NEC must be filed by ${deadline}. Missing filings carry penalties of $60–$310 per form.`,
            actionUrl: '/payroll',
            metadata: {
              taxYear,
              contractorCount: filingCandidates.length,
              filingDeadline: deadline,
            idempotencyKey: `form_1099_filing_required-${Date.now()}-${ws.ownerId}`,
              contractors: filingCandidates.map(r => ({ id: r.employeeId, name: r.employeeName, total: r.totalPaidInYear })),
            },
          }).catch((e: any) => log.warn('Failed to send 1099 notification', { error: e.message }));

          log.info('1099 filing notification sent', { workspaceId: ws.id, count: filingCandidates.length });
        }
      } catch (wsErr: any) {
        log.warn('1099 scan failed for workspace', { workspaceId: ws.id, error: wsErr.message });
      }
    }
  } catch (err: any) {
    log.error('1099 January scan failed', { error: (err instanceof Error ? err.message : String(err)) });
  }

  log.info('1099 January scan complete', { taxYear, flagged, skipped });
  return { flagged, skipped, records: allRecords };
}

/**
 * Get 1099 eligibility report for a specific workspace and tax year.
 * Called from the payroll routes for the 1099 threshold report.
 */
export async function get1099Report(workspaceId: string, taxYear: number): Promise<ContractorTaxRecord[]> {
  const yearStart = startOfYear(new Date(taxYear, 0, 1));
  const yearEnd = endOfYear(new Date(taxYear, 0, 1));

  const contractors = await db
    .select({
      id: employees.id,
      firstName: employees.firstName,
      lastName: employees.lastName,
      workerType: employees.workerType,
      is1099Eligible: employees.is1099Eligible,
    })
    .from(employees)
    .where(
      and(
        eq(employees.workspaceId, workspaceId),
        eq(employees.isActive, true),
      ),
    );

  const eligible = contractors.filter(e => e.workerType === 'contractor' || e.is1099Eligible === true);
  const records: ContractorTaxRecord[] = [];

  for (const contractor of eligible) {
    const payTotals = await db
      .select({ totalPaid: sql<string>`COALESCE(SUM(${payrollEntries.grossPay}), 0)` })
      .from(payrollEntries)
      .innerJoin(payrollRuns, eq(payrollEntries.payrollRunId, payrollRuns.id))
      .where(
        and(
          eq(payrollEntries.employeeId, contractor.id),
          gte(payrollRuns.periodStart, yearStart),
          lte(payrollRuns.periodEnd, yearEnd),
        ),
      );

    const totalPaid = parseFloat(payTotals[0]?.totalPaid || '0');
    records.push({
      employeeId: contractor.id,
      employeeName: `${contractor.firstName} ${contractor.lastName}`.trim(),
      workerType: contractor.workerType || 'contractor',
      is1099Eligible: contractor.is1099Eligible ?? true,
      totalPaidInYear: totalPaid,
      taxYear,
      requiresFiling: totalPaid >= FORM_1099_THRESHOLD,
      flaggedAt: new Date(),
    });
  }

  return records.sort((a, b) => b.totalPaidInYear - a.totalPaidInYear);
}
